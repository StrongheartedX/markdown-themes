package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"markdown-themes-backend/models"
	"markdown-themes-backend/utils"
)

// GitRepos handles GET /api/git/repos - find git repositories in a directory
func GitRepos(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("dir")
	if dir == "" {
		http.Error(w, `{"error": "dir parameter required"}`, http.StatusBadRequest)
		return
	}

	// Expand home directory
	if strings.HasPrefix(dir, "~") {
		home, err := os.UserHomeDir()
		if err == nil {
			dir = filepath.Join(home, dir[1:])
		}
	}

	dir = filepath.Clean(dir)

	maxDepth := 3
	if d := r.URL.Query().Get("maxDepth"); d != "" {
		if parsed, err := strconv.Atoi(d); err == nil {
			maxDepth = parsed
		}
	}

	var repos []models.GitRepoInfo
	findGitRepos(dir, 0, maxDepth, &repos)

	json.NewEncoder(w).Encode(repos)
}

func findGitRepos(path string, currentDepth, maxDepth int, repos *[]models.GitRepoInfo) {
	if currentDepth > maxDepth {
		return
	}

	// Check if this is a git repo
	if utils.IsGitRepo(path) {
		repo := models.GitRepoInfo{
			Path:    path,
			Name:    filepath.Base(path),
			Branch:  utils.GetGitBranch(path),
			IsDirty: isGitDirty(path),
		}

		// Get remote URL
		cmd := exec.Command("git", "-C", path, "remote", "get-url", "origin")
		if output, err := cmd.Output(); err == nil {
			repo.RemoteURL = strings.TrimSpace(string(output))
		}

		*repos = append(*repos, repo)
		return // Don't recurse into git repos
	}

	// Read directory entries
	entries, err := os.ReadDir(path)
	if err != nil {
		return
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		name := entry.Name()
		// Skip hidden and ignored directories
		if strings.HasPrefix(name, ".") || utils.ShouldIgnoreDir(name) {
			continue
		}

		findGitRepos(filepath.Join(path, name), currentDepth+1, maxDepth, repos)
	}
}

// GitGraph handles GET /api/git/graph - get commit history
func GitGraph(w http.ResponseWriter, r *http.Request) {
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
		http.Error(w, `{"error": "not a git repository"}`, http.StatusBadRequest)
		return
	}

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	skip := 0
	if s := r.URL.Query().Get("skip"); s != "" {
		if parsed, err := strconv.Atoi(s); err == nil {
			skip = parsed
		}
	}

	// Git log format: hash|short|author|email|date|parents|refs|subject
	format := "%H|%h|%an|%ae|%aI|%P|%D|%s"

	cmd := exec.Command("git", "-C", gitRoot, "log",
		"--all",
		fmt.Sprintf("--format=%s", format),
		fmt.Sprintf("-n%d", limit+1), // +1 to detect hasMore
		fmt.Sprintf("--skip=%d", skip),
	)

	output, err := cmd.Output()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "git log failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	commits := parseGitLog(string(output))

	hasMore := len(commits) > limit
	if hasMore {
		commits = commits[:limit]
	}

	json.NewEncoder(w).Encode(models.GitGraphResponse{
		Commits: commits,
		HasMore: hasMore,
	})
}

func parseGitLog(output string) []models.GitCommit {
	var commits []models.GitCommit

	lines := strings.Split(strings.TrimSpace(output), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, "|", 8)
		if len(parts) < 8 {
			continue
		}

		commit := models.GitCommit{
			Hash:        parts[0],
			ShortHash:   parts[1],
			Author:      parts[2],
			AuthorEmail: parts[3],
			Date:        parts[4],
			Message:     parts[7],
		}

		// Parse parents
		if parts[5] != "" {
			commit.ParentHashes = strings.Fields(parts[5])
			commit.IsMerge = len(commit.ParentHashes) > 1
		}

		// Parse refs (branches, tags)
		if parts[6] != "" {
			refs := strings.Split(parts[6], ", ")
			for _, ref := range refs {
				ref = strings.TrimSpace(ref)
				if ref != "" {
					commit.Refs = append(commit.Refs, ref)
				}
			}
		}

		commits = append(commits, commit)
	}

	return commits
}

// GitCommit handles GET /api/git/commit/:hash - get commit details
func GitCommitDetails(w http.ResponseWriter, r *http.Request) {
	// Extract hash from path (e.g., /api/git/commit/abc123)
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 5 {
		http.Error(w, `{"error": "commit hash required"}`, http.StatusBadRequest)
		return
	}
	hash := pathParts[4]

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

	gitRoot := findGitRoot(path)
	if gitRoot == "" {
		http.Error(w, `{"error": "not a git repository"}`, http.StatusBadRequest)
		return
	}

	// Get commit info
	format := "%H|%h|%an|%ae|%aI|%P|%D|%s|%b"
	cmd := exec.Command("git", "-C", gitRoot, "log", "-1", fmt.Sprintf("--format=%s", format), hash)
	output, err := cmd.Output()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "commit not found: %s"}`, err.Error()), http.StatusNotFound)
		return
	}

	line := strings.TrimSpace(string(output))
	parts := strings.SplitN(line, "|", 9)
	if len(parts) < 9 {
		http.Error(w, `{"error": "failed to parse commit"}`, http.StatusInternalServerError)
		return
	}

	details := models.GitCommitDetails{
		GitCommit: models.GitCommit{
			Hash:        parts[0],
			ShortHash:   parts[1],
			Author:      parts[2],
			AuthorEmail: parts[3],
			Date:        parts[4],
			Message:     parts[7],
		},
		Body: strings.TrimSpace(parts[8]),
	}

	// Parse parents
	if parts[5] != "" {
		details.ParentHashes = strings.Fields(parts[5])
		details.IsMerge = len(details.ParentHashes) > 1
	}

	// Parse refs
	if parts[6] != "" {
		refs := strings.Split(parts[6], ", ")
		for _, ref := range refs {
			ref = strings.TrimSpace(ref)
			if ref != "" {
				details.Refs = append(details.Refs, ref)
			}
		}
	}

	// Get changed files
	cmd = exec.Command("git", "-C", gitRoot, "diff-tree", "--no-commit-id", "--name-status", "-r", "--numstat", hash)
	output, err = cmd.Output()
	if err == nil {
		details.Files = parseCommitFiles(string(output), gitRoot, hash)
	}

	json.NewEncoder(w).Encode(details)
}

func parseCommitFiles(output string, gitRoot string, hash string) []models.GitFileChange {
	// Get name-status output
	cmd := exec.Command("git", "-C", gitRoot, "diff-tree", "--no-commit-id", "--name-status", "-r", hash)
	statusOutput, err := cmd.Output()
	if err != nil {
		return nil
	}

	// Get numstat for additions/deletions
	cmd = exec.Command("git", "-C", gitRoot, "diff-tree", "--no-commit-id", "--numstat", "-r", hash)
	numstatOutput, err := cmd.Output()
	if err != nil {
		return nil
	}

	// Parse name-status
	statusMap := make(map[string]string)
	for _, line := range strings.Split(strings.TrimSpace(string(statusOutput)), "\n") {
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) >= 2 {
			status := parts[0]
			path := parts[1]
			// Handle renames (R100	old	new)
			if strings.HasPrefix(status, "R") && len(parts) >= 3 {
				path = parts[2]
			}
			statusMap[path] = status
		}
	}

	// Parse numstat
	var files []models.GitFileChange
	for _, line := range strings.Split(strings.TrimSpace(string(numstatOutput)), "\n") {
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 3 {
			continue
		}

		additions, _ := strconv.Atoi(parts[0])
		deletions, _ := strconv.Atoi(parts[1])
		path := parts[2]

		// Handle binary files (show as - -)
		if parts[0] == "-" {
			additions = 0
		}
		if parts[1] == "-" {
			deletions = 0
		}

		// Handle renames
		if strings.Contains(path, "=>") {
			// Format: old => new or {prefix/old => prefix/new}
			path = strings.TrimSpace(strings.Split(path, "=>")[1])
			path = strings.TrimSuffix(path, "}")
		}

		status := statusMap[path]
		if status == "" {
			status = "M"
		}

		file := models.GitFileChange{
			Path:      path,
			Status:    string(status[0]), // Just first char (R100 -> R)
			Additions: additions,
			Deletions: deletions,
		}

		files = append(files, file)
	}

	return files
}

// GitDiff handles GET /api/git/diff - get file diff
func GitDiff(w http.ResponseWriter, r *http.Request) {
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

	gitRoot := findGitRoot(path)
	if gitRoot == "" {
		http.Error(w, `{"error": "not a git repository"}`, http.StatusBadRequest)
		return
	}

	base := r.URL.Query().Get("base") // Commit hash or "HEAD"
	file := r.URL.Query().Get("file") // Optional specific file

	var args []string
	args = append(args, "-C", gitRoot, "diff")

	if base != "" {
		if base == "HEAD" {
			// Diff against HEAD (unstaged changes)
			args = append(args, "HEAD")
		} else {
			// Diff for a specific commit
			args = append(args, base+"^", base)
		}
	}

	if file != "" {
		args = append(args, "--", file)
	}

	cmd := exec.Command("git", args...)
	output, err := cmd.Output()
	if err != nil {
		// Try without the parent (first commit)
		if base != "" && base != "HEAD" {
			args = []string{"-C", gitRoot, "show", base, "--format="}
			if file != "" {
				args = append(args, "--", file)
			}
			cmd = exec.Command("git", args...)
			output, err = cmd.Output()
		}
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error": "git diff failed: %s"}`, err.Error()), http.StatusInternalServerError)
			return
		}
	}

	response := models.GitDiffResponse{
		Diff:     string(output),
		FilePath: file,
	}

	json.NewEncoder(w).Encode(response)
}
