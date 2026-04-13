package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// beadsWorkDir returns the markdown-themes project root so bd can find .beads/.
func beadsWorkDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "projects", "markdown-themes")
}

// runBd executes the upstream bd CLI with the given args and returns stdout.
// It runs from the markdown-themes directory so bd discovers the embedded Dolt database.
func runBd(args ...string) ([]byte, error) {
	cmd := exec.Command("bd", args...)
	cmd.Dir = beadsWorkDir()
	cmd.Env = os.Environ()
	return cmd.Output()
}

// BeadsIssues handles GET /api/beads/issues?prefix=mt
// Shells out to upstream bd CLI which uses the embedded Dolt database.
func BeadsIssues(w http.ResponseWriter, r *http.Request) {
	prefix := r.URL.Query().Get("prefix")

	// Build command: bd list --all --json
	// Note: upstream bd does not have a --prefix flag. The embedded Dolt database
	// is scoped to this project already, so all returned issues belong to it.
	// If a prefix filter is requested, we filter the results client-side.
	output, err := runBd("list", "--all", "--json")
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

	// Get all open issues
	allOut, err := runBd("list", "--status", "open", "--json")
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
	readyOut, err := runBd("ready", "--json")
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
func BeadsPrefixes(w http.ResponseWriter, r *http.Request) {
	metaPath := filepath.Join(beadsWorkDir(), ".beads", "metadata.json")
	data, err := os.ReadFile(metaPath)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"projects": []interface{}{},
		})
		return
	}

	var meta struct {
		Database    string `json:"dolt_database"`
		Prefix      string `json:"prefix"`
	}
	if json.Unmarshal(data, &meta) != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"projects": []interface{}{},
		})
		return
	}

	// Derive prefix: use explicit prefix field, or fall back to dolt_database name
	prefix := meta.Prefix
	if prefix == "" {
		prefix = meta.Database
	}

	var projects []map[string]string
	if prefix != "" {
		projects = append(projects, map[string]string{
			"prefix":      prefix,
			"name":        prefix,
			"description": "Local beads project",
		})
	}

	if projects == nil {
		projects = []map[string]string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"projects": projects,
	})
}
