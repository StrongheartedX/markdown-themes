package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// findBeadsDir walks up from start looking for .beads/metadata.json, then
// falls back to scanning ~/projects/*. Returns start if nothing found.
func findBeadsDir(start string) string {
	dir := start
	for {
		if _, err := os.Stat(filepath.Join(dir, ".beads", "metadata.json")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	home, _ := os.UserHomeDir()
	projectsDir := filepath.Join(home, "projects")
	entries, err := os.ReadDir(projectsDir)
	if err == nil {
		for _, e := range entries {
			if e.IsDir() {
				candidate := filepath.Join(projectsDir, e.Name())
				if _, err := os.Stat(filepath.Join(candidate, ".beads", "metadata.json")); err == nil {
					return candidate
				}
			}
		}
	}
	return start
}

// beadsWorkDir returns the default project root so bd can find .beads/.
func beadsWorkDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "projects", "markdown-themes")
}

// resolveWorkDir returns the workspace from the query param, or the default.
func resolveWorkDir(r *http.Request) string {
	if ws := r.URL.Query().Get("workspace"); ws != "" {
		return findBeadsDir(ws)
	}
	return beadsWorkDir()
}

// runBd executes the upstream bd CLI with the given args and returns stdout.
func runBd(workDir string, args ...string) ([]byte, error) {
	cmd := exec.Command("bd", args...)
	cmd.Dir = workDir
	cmd.Env = os.Environ()
	return cmd.Output()
}

// BeadsIssues handles GET /api/beads/issues?prefix=mt
// Shells out to upstream bd CLI which uses the embedded Dolt database.
func BeadsIssues(w http.ResponseWriter, r *http.Request) {
	prefix := r.URL.Query().Get("prefix")
	workDir := resolveWorkDir(r)

	output, err := runBd(workDir, "list", "--all", "--json")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		errMsg := "failed to run bd"
		if exitErr, ok := err.(*exec.ExitError); ok {
			errMsg = strings.TrimSpace(string(exitErr.Stderr))
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": errMsg,
		})
		return
	}

	// Parse bd JSON array output
	var issues []json.RawMessage
	if err := json.Unmarshal(output, &issues); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "failed to parse bd output: " + err.Error(),
		})
		return
	}

	if issues == nil {
		issues = []json.RawMessage{}
	}

	// Client-side prefix filter: keep only issues whose ID starts with the prefix
	if prefix != "" {
		filtered := make([]json.RawMessage, 0, len(issues))
		for _, raw := range issues {
			var stub struct {
				ID string `json:"id"`
			}
			if json.Unmarshal(raw, &stub) == nil && strings.HasPrefix(stub.ID, prefix+"-") {
				filtered = append(filtered, raw)
			}
		}
		issues = filtered
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"issues": issues,
		"count":  len(issues),
	})
}

// BeadsBlocked handles GET /api/beads/blocked
// Uses bd ready to derive which open issues are blocked: any open issue that does NOT
// appear in the ready list has unresolved blockers. This avoids the missing
// wisp_dependencies table error that bd dep list triggers on some databases.
func BeadsBlocked(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	workDir := resolveWorkDir(r)

	// Get all open issues
	allOut, err := runBd(workDir, "list", "--status", "open", "--json")
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"blocked": []interface{}{}})
		return
	}

	var allOpen []struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(allOut, &allOpen) != nil || len(allOpen) == 0 {
		json.NewEncoder(w).Encode(map[string]interface{}{"blocked": []interface{}{}})
		return
	}

	// Get ready issues (open with no active blockers)
	readyOut, err := runBd(workDir, "ready", "--json")
	if err != nil {
		// If ready fails, assume nothing is blocked
		json.NewEncoder(w).Encode(map[string]interface{}{"blocked": []interface{}{}})
		return
	}

	var readyIssues []struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(readyOut, &readyIssues)

	readySet := make(map[string]bool, len(readyIssues))
	for _, ri := range readyIssues {
		readySet[ri.ID] = true
	}

	// Any open issue not in the ready set is blocked
	type blockedEntry struct {
		ID        string   `json:"id"`
		BlockedBy []string `json:"blocked_by"`
	}
	var blocked []blockedEntry
	for _, issue := range allOpen {
		if !readySet[issue.ID] {
			// We don't know the specific blockers without dep list, but the
			// frontend only checks whether blocked_by is non-empty.
			blocked = append(blocked, blockedEntry{
				ID:        issue.ID,
				BlockedBy: []string{"(dependency)"},
			})
		}
	}

	if blocked == nil {
		blocked = []blockedEntry{}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"blocked": blocked})
}

// BeadsPrefixes handles GET /api/beads/prefixes
// The upstream bd CLI does not have a "project list" command, so we derive the
// prefix from the local .beads/metadata.json configuration.
// BeadsPrefixes handles GET /api/beads/prefixes
// Scans ~/projects/ for .beads/metadata.json files to discover all projects.
func BeadsPrefixes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	home, _ := os.UserHomeDir()
	projectsDir := filepath.Join(home, "projects")
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"projects": []interface{}{}})
		return
	}

	type project struct {
		Prefix string `json:"prefix"`
		Name   string `json:"name"`
		Path   string `json:"path"`
	}
	var projects []project

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		metaPath := filepath.Join(projectsDir, e.Name(), ".beads", "metadata.json")
		data, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}
		var meta struct {
			Database string `json:"dolt_database"`
			Prefix   string `json:"prefix"`
		}
		if json.Unmarshal(data, &meta) != nil {
			continue
		}
		prefix := meta.Prefix
		if prefix == "" {
			prefix = meta.Database
		}
		if prefix != "" {
			projects = append(projects, project{
				Prefix: prefix,
				Name:   e.Name(),
				Path:   filepath.Join(projectsDir, e.Name()),
			})
		}
	}

	if projects == nil {
		projects = []project{}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"projects": projects})
}
