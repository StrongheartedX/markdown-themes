package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
)

// BeadsIssues handles GET /api/beads/issues?prefix=mt
// Shells out to ggbd CLI which handles Supabase/Postgres via Go's pgx.
func BeadsIssues(w http.ResponseWriter, r *http.Request) {
	prefix := r.URL.Query().Get("prefix")

	// Find ggbd binary
	home, _ := os.UserHomeDir()
	ggbd := filepath.Join(home, "projects", "ggbeads", "ggbd")
	if _, err := os.Stat(ggbd); err != nil {
		// Fallback to PATH
		ggbd = "bd"
	}

	// Build command: ggbd list --all --json [--prefix X]
	args := []string{"list", "--all", "--json"}
	if prefix != "" {
		args = append(args, "--prefix", prefix)
	}

	cmd := exec.Command(ggbd, args...)
	// Run from a directory with .beads/ so ggbd finds config
	cmd.Dir = filepath.Join(home, "projects", "markdown-themes")
	// Pass through BD_POSTGRES_URL
	cmd.Env = append(os.Environ())

	output, err := cmd.Output()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		errMsg := "failed to run ggbd"
		if exitErr, ok := err.(*exec.ExitError); ok {
			errMsg = string(exitErr.Stderr)
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": errMsg,
		})
		return
	}

	// Parse ggbd JSON array output
	var issues []json.RawMessage
	if err := json.Unmarshal(output, &issues); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "failed to parse ggbd output: " + err.Error(),
		})
		return
	}

	if issues == nil {
		issues = []json.RawMessage{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"issues": issues,
		"count":  len(issues),
	})
}

// BeadsBlocked handles GET /api/beads/blocked
// Returns issues that are blocked by open dependencies.
func BeadsBlocked(w http.ResponseWriter, r *http.Request) {
	home, _ := os.UserHomeDir()
	ggbd := filepath.Join(home, "projects", "ggbeads", "ggbd")
	if _, err := os.Stat(ggbd); err != nil {
		ggbd = "bd"
	}

	cmd := exec.Command(ggbd, "blocked", "--json")
	cmd.Dir = filepath.Join(home, "projects", "markdown-themes")
	cmd.Env = append(os.Environ())

	output, err := cmd.Output()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"blocked": []interface{}{},
		})
		return
	}

	var blocked []json.RawMessage
	if err := json.Unmarshal(output, &blocked); err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"blocked": []interface{}{},
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"blocked": blocked,
	})
}

// BeadsPrefixes handles GET /api/beads/prefixes
// Returns registered projects from the Postgres projects table via ggbd project list.
func BeadsPrefixes(w http.ResponseWriter, r *http.Request) {
	home, _ := os.UserHomeDir()
	ggbd := filepath.Join(home, "projects", "ggbeads", "ggbd")
	if _, err := os.Stat(ggbd); err != nil {
		ggbd = "bd"
	}

	cmd := exec.Command(ggbd, "project", "list", "--json")
	cmd.Dir = filepath.Join(home, "projects", "markdown-themes")
	cmd.Env = append(os.Environ())

	output, err := cmd.Output()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"projects": []interface{}{},
		})
		return
	}

	var projects []json.RawMessage
	if err := json.Unmarshal(output, &projects); err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"projects": []interface{}{},
		})
		return
	}

	if projects == nil {
		projects = []json.RawMessage{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"projects": projects,
	})
}
