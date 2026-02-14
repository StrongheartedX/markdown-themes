package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

// BeadsIssue represents a single issue from .beads/beads.db
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

	dbPath := filepath.Join(filepath.Clean(path), ".beads", "beads.db")

	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"issues": []BeadsIssue{},
			"count":  0,
		})
		return
	}

	// Open in read-only mode with WAL support
	db, err := sql.Open("sqlite3", dbPath+"?mode=ro&_journal_mode=WAL")
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "failed to open beads db: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	defer db.Close()

	// Query issues (exclude deleted)
	rows, err := db.Query(`
		SELECT id, title, description, notes, design, status, priority,
		       issue_type, assignee, created_at, updated_at, closed_at, close_reason
		FROM issues
		WHERE deleted_at IS NULL
		ORDER BY created_at DESC
	`)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "failed to query issues: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var issues []BeadsIssue
	for rows.Next() {
		var issue BeadsIssue
		var desc, notes, design, issueType, owner, createdAt, updatedAt, closedAt, closeReason sql.NullString
		err := rows.Scan(
			&issue.ID, &issue.Title, &desc, &notes, &design,
			&issue.Status, &issue.Priority, &issueType, &owner,
			&createdAt, &updatedAt, &closedAt, &closeReason,
		)
		if err != nil {
			continue
		}
		issue.Description = desc.String
		issue.Notes = notes.String
		issue.Design = design.String
		issue.IssueType = issueType.String
		issue.Owner = owner.String
		issue.CreatedAt = createdAt.String
		issue.UpdatedAt = updatedAt.String
		issue.ClosedAt = closedAt.String
		issue.CloseReason = closeReason.String
		issues = append(issues, issue)
	}

	// Fetch labels for all issues
	labelRows, err := db.Query(`SELECT issue_id, label FROM labels`)
	if err == nil {
		defer labelRows.Close()
		labelMap := make(map[string][]string)
		for labelRows.Next() {
			var issueID, label string
			if labelRows.Scan(&issueID, &label) == nil {
				labelMap[issueID] = append(labelMap[issueID], label)
			}
		}
		for i := range issues {
			if labels, ok := labelMap[issues[i].ID]; ok {
				issues[i].Labels = labels
			}
		}
	}

	// Fetch dependencies for all issues
	depRows, err := db.Query(`
		SELECT issue_id, depends_on_id, type, created_at
		FROM dependencies
	`)
	if err == nil {
		defer depRows.Close()
		depMap := make(map[string][]BeadsDependency)
		for depRows.Next() {
			var dep BeadsDependency
			var createdAt sql.NullString
			if depRows.Scan(&dep.IssueID, &dep.DependsOnID, &dep.Type, &createdAt) == nil {
				dep.CreatedAt = createdAt.String
				depMap[dep.IssueID] = append(depMap[dep.IssueID], dep)
			}
		}
		for i := range issues {
			if deps, ok := depMap[issues[i].ID]; ok {
				issues[i].Dependencies = deps
			}
		}
	}

	if issues == nil {
		issues = []BeadsIssue{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"issues": issues,
		"count":  len(issues),
	})
}
