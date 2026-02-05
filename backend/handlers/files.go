package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"markdown-themes-backend/models"
	"markdown-themes-backend/utils"
)

// AuthToken handles GET /api/auth/token
func AuthToken(w http.ResponseWriter, r *http.Request) {
	// Simple static token for local development
	json.NewEncoder(w).Encode(map[string]string{
		"token": "markdown-themes-local-token",
	})
}

// FileTree handles GET /api/files/tree
func FileTree(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, `{"error": "path parameter required"}`, http.StatusBadRequest)
		return
	}

	// Expand home directory
	if strings.HasPrefix(path, "~") {
		home, err := os.UserHomeDir()
		if err == nil {
			path = filepath.Join(home, path[1:])
		}
	}

	// Clean and validate path
	path = filepath.Clean(path)

	info, err := os.Stat(path)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "path not found: %s"}`, err.Error()), http.StatusNotFound)
		return
	}

	depth := 5
	if d := r.URL.Query().Get("depth"); d != "" {
		if parsed, err := strconv.Atoi(d); err == nil {
			depth = parsed
		}
	}

	showHidden := r.URL.Query().Get("showHidden") == "true"

	tree := buildFileTree(path, info.Name(), depth, showHidden)
	json.NewEncoder(w).Encode(tree)
}

func buildFileTree(path string, name string, depth int, showHidden bool) models.FileTreeNode {
	info, err := os.Lstat(path)
	if err != nil {
		return models.FileTreeNode{
			Name: name,
			Path: path,
			Type: "file",
		}
	}

	isSymlink := info.Mode()&os.ModeSymlink != 0
	isDir := info.IsDir()

	// If symlink, resolve to check if it's a directory
	if isSymlink {
		resolved, err := os.Stat(path)
		if err == nil {
			isDir = resolved.IsDir()
		}
	}

	node := models.FileTreeNode{
		Name:      name,
		Path:      path,
		Type:      "file",
		IsSymlink: isSymlink,
		Icon:      utils.GetFileIcon(name, isDir, isSymlink, path),
	}

	if isDir {
		node.Type = "directory"

		// Check if git repo
		if utils.IsGitRepo(path) {
			node.IsGitRepo = true
			node.GitBranch = utils.GetGitBranch(path)
			// Check if dirty (has uncommitted changes)
			node.GitDirty = isGitDirty(path)
		}

		// Only recurse if depth > 0
		if depth > 0 {
			entries, err := os.ReadDir(path)
			if err == nil {
				var children []models.FileTreeNode
				for _, entry := range entries {
					// Skip hidden files unless showHidden is true
					if !showHidden && strings.HasPrefix(entry.Name(), ".") {
						continue
					}

					childPath := filepath.Join(path, entry.Name())
					childNode := buildFileTree(childPath, entry.Name(), depth-1, showHidden)
					children = append(children, childNode)
				}

				// Sort: directories first, then alphabetically
				sort.Slice(children, func(i, j int) bool {
					if children[i].Type != children[j].Type {
						return children[i].Type == "directory"
					}
					return strings.ToLower(children[i].Name) < strings.ToLower(children[j].Name)
				})

				node.Children = children
			}
		}
	} else {
		node.Size = info.Size()
		node.Modified = info.ModTime().Format(time.RFC3339)
	}

	return node
}

func isGitDirty(repoPath string) bool {
	cmd := exec.Command("git", "-C", repoPath, "status", "--porcelain")
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	return len(strings.TrimSpace(string(output))) > 0
}

// FileContent handles GET /api/files/content
func FileContent(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, `{"error": "path parameter required"}`, http.StatusBadRequest)
		return
	}

	// Expand home directory
	if strings.HasPrefix(path, "~") {
		home, err := os.UserHomeDir()
		if err == nil {
			path = filepath.Join(home, path[1:])
		}
	}

	path = filepath.Clean(path)

	info, err := os.Stat(path)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "file not found: %s"}`, err.Error()), http.StatusNotFound)
		return
	}

	if info.IsDir() {
		http.Error(w, `{"error": "path is a directory"}`, http.StatusBadRequest)
		return
	}

	// Check if binary
	if utils.IsBinaryFile(path) {
		http.Error(w, `{"error": "binary file cannot be displayed"}`, http.StatusBadRequest)
		return
	}

	content, err := os.ReadFile(path)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "failed to read file: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	response := models.FileContent{
		Path:     path,
		Content:  string(content),
		FileName: filepath.Base(path),
		FileSize: info.Size(),
		Modified: info.ModTime().Format(time.RFC3339),
	}

	json.NewEncoder(w).Encode(response)
}

// GitStatus handles GET /api/files/git-status
func GitStatus(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, `{"error": "path parameter required"}`, http.StatusBadRequest)
		return
	}

	// Expand home directory
	if strings.HasPrefix(path, "~") {
		home, err := os.UserHomeDir()
		if err == nil {
			path = filepath.Join(home, path[1:])
		}
	}

	path = filepath.Clean(path)

	// Find git root
	gitRoot := findGitRoot(path)
	if gitRoot == "" {
		json.NewEncoder(w).Encode(models.GitStatusResponse{
			IsGitRepo: false,
			Files:     make(map[string]models.GitStatusInfo),
		})
		return
	}

	// Run git status --porcelain
	cmd := exec.Command("git", "-C", gitRoot, "status", "--porcelain")
	output, err := cmd.Output()
	if err != nil {
		json.NewEncoder(w).Encode(models.GitStatusResponse{
			IsGitRepo: true,
			Files:     make(map[string]models.GitStatusInfo),
		})
		return
	}

	files := parseGitStatus(string(output), gitRoot)

	json.NewEncoder(w).Encode(models.GitStatusResponse{
		IsGitRepo: true,
		Files:     files,
	})
}

func findGitRoot(path string) string {
	current := path
	for {
		if utils.IsGitRepo(current) {
			return current
		}
		parent := filepath.Dir(current)
		if parent == current {
			return ""
		}
		current = parent
	}
}

func parseGitStatus(output string, gitRoot string) map[string]models.GitStatusInfo {
	files := make(map[string]models.GitStatusInfo)

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if len(line) < 3 {
			continue
		}

		indexStatus := string(line[0])
		workTreeStatus := string(line[1])
		filePath := strings.TrimSpace(line[3:])

		// Handle renamed files (format: "R  old -> new")
		if strings.Contains(filePath, " -> ") {
			parts := strings.Split(filePath, " -> ")
			filePath = parts[1]
		}

		fullPath := filepath.Join(gitRoot, filePath)

		// Determine overall status
		var status string
		if indexStatus != " " && indexStatus != "?" {
			status = "staged"
		} else if workTreeStatus != " " && workTreeStatus != "?" {
			status = "modified"
		} else if indexStatus == "?" && workTreeStatus == "?" {
			status = "untracked"
		}

		if status != "" {
			files[fullPath] = models.GitStatusInfo{
				Status:         status,
				IndexStatus:    indexStatus,
				WorkTreeStatus: workTreeStatus,
			}
		}
	}

	return files
}
