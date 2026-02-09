package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// BeadsIssue represents a single issue from .beads/issues.jsonl
type BeadsIssue struct {
	ID           string           `json:"id"`
	Title        string           `json:"title"`
	Description  string           `json:"description,omitempty"`
	Notes        string           `json:"notes,omitempty"`
	Design       string           `json:"design,omitempty"`
	Status       string           `json:"status"`
	Priority     int              `json:"priority"`
	IssueType    string           `json:"issue_type,omitempty"`
	Owner        string           `json:"owner,omitempty"`
	Labels       []string         `json:"labels,omitempty"`
	Dependencies []BeadsDependency `json:"dependencies,omitempty"`
	CreatedAt    string           `json:"created_at,omitempty"`
	UpdatedAt    string           `json:"updated_at,omitempty"`
	ClosedAt     string           `json:"closed_at,omitempty"`
	CloseReason  string           `json:"close_reason,omitempty"`
}

// BeadsDependency represents a dependency between issues
type BeadsDependency struct {
	IssueID     string `json:"issue_id"`
	DependsOnID string `json:"depends_on_id"`
	Type        string `json:"type"`
	CreatedAt   string `json:"created_at,omitempty"`
}

// BeadsIssues handles GET /api/beads/issues
func BeadsIssues(w http.ResponseWriter, r *http.Request) {
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

	issuesPath := filepath.Join(filepath.Clean(path), ".beads", "issues.jsonl")

	file, err := os.Open(issuesPath)
	if err != nil {
		if os.IsNotExist(err) {
			// No .beads directory — return empty list
			json.NewEncoder(w).Encode(map[string]interface{}{
				"issues": []BeadsIssue{},
				"count":  0,
			})
			return
		}
		http.Error(w, fmt.Sprintf(`{"error": "failed to read issues: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	defer file.Close()

	var issues []BeadsIssue
	scanner := bufio.NewScanner(file)
	// Increase buffer for large lines (1MB)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var issue BeadsIssue
		if err := json.Unmarshal([]byte(line), &issue); err != nil {
			// Skip malformed lines
			continue
		}
		issues = append(issues, issue)
	}

	if issues == nil {
		issues = []BeadsIssue{}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"issues": issues,
		"count":  len(issues),
	})
}
