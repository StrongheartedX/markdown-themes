package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"strings"
	"sync"
)

// NotepadRequest represents the incoming notepad request
type NotepadRequest struct {
	Message        string   `json:"message"`
	SessionID      string   `json:"sessionId,omitempty"`
	Model          string   `json:"model,omitempty"`
	Cwd            string   `json:"cwd,omitempty"`
	AllowedTools   []string `json:"allowedTools,omitempty"`
	MaxTurns       int      `json:"maxTurns,omitempty"`
	PermissionMode string   `json:"permissionMode,omitempty"`
}

// NotepadResponse is the JSON response returned to the client
type NotepadResponse struct {
	SessionID string                 `json:"sessionId,omitempty"`
	Result    map[string]interface{} `json:"result,omitempty"`
	Error     string                 `json:"error,omitempty"`
}

// ActiveNotepadProcess tracks a running notepad Claude CLI process
type ActiveNotepadProcess struct {
	Cmd       *exec.Cmd
	SessionID string
	cancel    func()
}

var (
	activeNotepadProcesses = make(map[string]*ActiveNotepadProcess)
	notepadProcessMu       sync.RWMutex
)

// NotepadSend handles POST /api/notepad - run Claude CLI in non-streaming mode
// Returns the full JSON response when Claude finishes.
func NotepadSend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error": "method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req NotepadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "invalid request: %s"}`, err.Error()), http.StatusBadRequest)
		return
	}

	if req.Message == "" {
		http.Error(w, `{"error": "message required"}`, http.StatusBadRequest)
		return
	}

	// Build the Claude CLI command
	args := []string{
		"--output-format", "json",
		"-p", req.Message,
	}

	// Model (default to haiku)
	model := req.Model
	if model == "" {
		model = "haiku"
	}
	args = append([]string{"--model", model}, args...)

	// Session: --session-id for new, --resume for existing
	if req.SessionID != "" {
		args = append(args, "--resume", req.SessionID)
	}

	// Allowed tools (defaults for headless mode)
	allowedTools := req.AllowedTools
	if len(allowedTools) == 0 {
		allowedTools = []string{
			"Read", "Write", "Edit",
			"Bash", "Glob", "Grep",
			"WebFetch", "WebSearch",
		}
	}
	for _, tool := range allowedTools {
		args = append(args, "--allowedTools", tool)
	}

	// Max turns
	if req.MaxTurns > 0 {
		args = append(args, "--max-turns", fmt.Sprintf("%d", req.MaxTurns))
	}

	// Permission mode
	if req.PermissionMode != "" {
		args = append(args, "--permission-mode", req.PermissionMode)
	}

	cmd := exec.Command("claude", args...)
	if req.Cwd != "" {
		cmd.Dir = req.Cwd
	}

	log.Printf("[Notepad] Running: claude %s", strings.Join(args, " "))

	// Track the process for potential cancellation
	sessionKey := req.SessionID
	if sessionKey == "" {
		sessionKey = fmt.Sprintf("notepad_%d", 0) // placeholder
	}

	proc := &ActiveNotepadProcess{
		Cmd:       cmd,
		SessionID: sessionKey,
		cancel: func() {
			if cmd.Process != nil {
				cmd.Process.Kill()
			}
		},
	}

	notepadProcessMu.Lock()
	activeNotepadProcesses[sessionKey] = proc
	notepadProcessMu.Unlock()

	defer func() {
		notepadProcessMu.Lock()
		delete(activeNotepadProcesses, sessionKey)
		notepadProcessMu.Unlock()
	}()

	// Run and capture output
	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			stderrStr := string(exitErr.Stderr)
			log.Printf("[Notepad] Claude CLI error (exit %d): %s", exitErr.ExitCode(), stderrStr)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(NotepadResponse{
				Error: fmt.Sprintf("Claude CLI error: %s", stderrStr),
			})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(NotepadResponse{
			Error: fmt.Sprintf("Failed to run Claude CLI: %s", err.Error()),
		})
		return
	}

	// Parse the JSON output
	var result map[string]interface{}
	if err := json.Unmarshal(output, &result); err != nil {
		log.Printf("[Notepad] Failed to parse output: %s\nRaw: %s", err, string(output))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(NotepadResponse{
			Error: fmt.Sprintf("Failed to parse Claude response: %s", err.Error()),
		})
		return
	}

	// Extract session_id from response
	sessionID, _ := result["session_id"].(string)

	log.Printf("[Notepad] Complete. Session: %s", sessionID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(NotepadResponse{
		SessionID: sessionID,
		Result:    result,
	})
}

// NotepadStop handles DELETE /api/notepad - kill running notepad process
func NotepadStop(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("sessionId")
	if sessionID == "" {
		http.Error(w, `{"error": "sessionId required"}`, http.StatusBadRequest)
		return
	}

	notepadProcessMu.RLock()
	proc, exists := activeNotepadProcesses[sessionID]
	notepadProcessMu.RUnlock()

	if !exists {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "not_found"})
		return
	}

	proc.cancel()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "killed"})
}
