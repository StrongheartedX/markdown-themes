package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/creack/pty"
)

// TerminalSession represents an active terminal with a direct PTY
type TerminalSession struct {
	ID        string    `json:"id"`
	Cwd       string    `json:"cwd"`
	Cols      uint16    `json:"cols"`
	Rows      uint16    `json:"rows"`
	CreatedAt time.Time `json:"createdAt"`

	ptmx *os.File
	cmd  *exec.Cmd

	// Subscribed WebSocket clients (managed via interface to avoid import cycle)
	clients map[interface{}]bool
	mu      sync.Mutex

	// Stop signal for the read goroutine
	done chan struct{}
}

// TerminalManager manages active terminal sessions
type TerminalManager struct {
	sessions map[string]*TerminalSession
	mu       sync.RWMutex

	// Callback to broadcast terminal output to subscribed clients
	broadcastFunc func(sessionID string, data []byte)
	// Callback to notify session closed
	closedFunc func(sessionID string)
}

var (
	termManager     *TerminalManager
	termManagerOnce sync.Once
)

// GetTerminalManager returns the singleton TerminalManager
func GetTerminalManager() *TerminalManager {
	termManagerOnce.Do(func() {
		termManager = &TerminalManager{
			sessions: make(map[string]*TerminalSession),
		}
	})
	return termManager
}

// SetBroadcastFunc sets the callback for broadcasting terminal output
func (tm *TerminalManager) SetBroadcastFunc(fn func(sessionID string, data []byte)) {
	tm.broadcastFunc = fn
}

// SetClosedFunc sets the callback for session closed notifications
func (tm *TerminalManager) SetClosedFunc(fn func(sessionID string)) {
	tm.closedFunc = fn
}

// getShell returns the user's default shell
func getShell() string {
	shell := os.Getenv("SHELL")
	if shell != "" {
		return shell
	}
	// Fallback
	if _, err := os.Stat("/bin/bash"); err == nil {
		return "/bin/bash"
	}
	return "/bin/sh"
}

// SpawnSession creates a new terminal session with a direct PTY
func (tm *TerminalManager) SpawnSession(id, cwd string, cols, rows uint16, command string) (*TerminalSession, error) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if _, exists := tm.sessions[id]; exists {
		return nil, fmt.Errorf("session %s already exists", id)
	}

	// Validate/default cwd
	if cwd == "" {
		cwd, _ = os.UserHomeDir()
	}
	if _, err := os.Stat(cwd); err != nil {
		cwd, _ = os.UserHomeDir()
	}

	if cols == 0 {
		cols = 80
	}
	if rows == 0 {
		rows = 24
	}

	// Spawn shell directly — same as node-pty approach
	shell := getShell()
	var cmd *exec.Cmd
	if command != "" {
		// Run command in a login shell
		cmd = exec.Command(shell, "-l", "-c", command)
	} else {
		cmd = exec.Command(shell, "-l")
	}
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		fmt.Sprintf("COLUMNS=%d", cols),
		fmt.Sprintf("LINES=%d", rows),
	)

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{
		Cols: cols,
		Rows: rows,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to start PTY: %w", err)
	}

	session := &TerminalSession{
		ID:        id,
		Cwd:       cwd,
		Cols:      cols,
		Rows:      rows,
		CreatedAt: time.Now(),
		ptmx:      ptmx,
		cmd:       cmd,
		clients:   make(map[interface{}]bool),
		done:      make(chan struct{}),
	}

	tm.sessions[id] = session

	// Start reading PTY output in background
	go tm.readPTY(session)

	// Wait for process exit in background to clean up
	go func() {
		cmd.Wait()
		// Process exited — clean up if not already closed
		tm.mu.Lock()
		_, stillActive := tm.sessions[id]
		if stillActive {
			delete(tm.sessions, id)
		}
		tm.mu.Unlock()

		if stillActive {
			session.ptmx.Close()
			log.Printf("[Terminal] Session %s shell exited", id)
			if tm.closedFunc != nil {
				tm.closedFunc(id)
			}
		}
	}()

	log.Printf("[Terminal] Session %s spawned (shell: %s, cwd: %s, %dx%d)", id, shell, cwd, cols, rows)
	return session, nil
}

// readPTY reads from the PTY and broadcasts to subscribed clients
func (tm *TerminalManager) readPTY(session *TerminalSession) {
	buf := make([]byte, 32*1024)
	for {
		select {
		case <-session.done:
			return
		default:
		}

		n, err := session.ptmx.Read(buf)
		if n > 0 && tm.broadcastFunc != nil {
			data := make([]byte, n)
			copy(data, buf[:n])
			tm.broadcastFunc(session.ID, data)
		}
		if err != nil {
			if err != io.EOF {
				log.Printf("[Terminal] Read error for %s: %v", session.ID, err)
			}
			break
		}
	}
}

// WriteToSession writes input data to a terminal session's PTY
func (tm *TerminalManager) WriteToSession(id string, data []byte) error {
	tm.mu.RLock()
	session, ok := tm.sessions[id]
	tm.mu.RUnlock()

	if !ok {
		return fmt.Errorf("session %s not found", id)
	}

	_, err := session.ptmx.Write(data)
	return err
}

// ResizeSession resizes the PTY
func (tm *TerminalManager) ResizeSession(id string, cols, rows uint16) error {
	tm.mu.RLock()
	session, ok := tm.sessions[id]
	tm.mu.RUnlock()

	if !ok {
		return fmt.Errorf("session %s not found", id)
	}

	if err := pty.Setsize(session.ptmx, &pty.Winsize{Cols: cols, Rows: rows}); err != nil {
		return fmt.Errorf("failed to resize PTY: %w", err)
	}

	session.mu.Lock()
	session.Cols = cols
	session.Rows = rows
	session.mu.Unlock()

	return nil
}

// CloseSession kills a terminal session
func (tm *TerminalManager) CloseSession(id string) error {
	tm.mu.Lock()
	session, ok := tm.sessions[id]
	if !ok {
		tm.mu.Unlock()
		return fmt.Errorf("session %s not found", id)
	}
	delete(tm.sessions, id)
	tm.mu.Unlock()

	// Signal read goroutine to stop
	close(session.done)

	// Close PTY (sends SIGHUP to shell)
	session.ptmx.Close()

	// Wait for process to exit (with timeout)
	doneCh := make(chan error, 1)
	go func() { doneCh <- session.cmd.Wait() }()
	select {
	case <-doneCh:
	case <-time.After(2 * time.Second):
		session.cmd.Process.Kill()
	}

	log.Printf("[Terminal] Session %s closed", id)
	return nil
}

// AddClient subscribes a client to a session's output
func (tm *TerminalManager) AddClient(sessionID string, client interface{}) {
	tm.mu.RLock()
	session, ok := tm.sessions[sessionID]
	tm.mu.RUnlock()
	if !ok {
		return
	}
	session.mu.Lock()
	session.clients[client] = true
	session.mu.Unlock()
}

// RemoveClient unsubscribes a client from a session's output
func (tm *TerminalManager) RemoveClient(sessionID string, client interface{}) {
	tm.mu.RLock()
	session, ok := tm.sessions[sessionID]
	tm.mu.RUnlock()
	if !ok {
		return
	}
	session.mu.Lock()
	delete(session.clients, client)
	session.mu.Unlock()
}

// GetClients returns all subscribed clients for a session
func (tm *TerminalManager) GetClients(sessionID string) []interface{} {
	tm.mu.RLock()
	session, ok := tm.sessions[sessionID]
	tm.mu.RUnlock()
	if !ok {
		return nil
	}
	session.mu.Lock()
	defer session.mu.Unlock()
	clients := make([]interface{}, 0, len(session.clients))
	for c := range session.clients {
		clients = append(clients, c)
	}
	return clients
}

// RemoveAllClientSessions removes a client from all sessions it's subscribed to
func (tm *TerminalManager) RemoveAllClientSessions(client interface{}) {
	tm.mu.RLock()
	sessions := make([]*TerminalSession, 0)
	for _, s := range tm.sessions {
		sessions = append(sessions, s)
	}
	tm.mu.RUnlock()

	for _, session := range sessions {
		session.mu.Lock()
		delete(session.clients, client)
		session.mu.Unlock()
	}
}

// ListSessions returns info about all active sessions
func (tm *TerminalManager) ListSessions() []TerminalSession {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	result := make([]TerminalSession, 0, len(tm.sessions))
	for _, s := range tm.sessions {
		result = append(result, TerminalSession{
			ID:        s.ID,
			Cwd:       s.Cwd,
			Cols:      s.Cols,
			Rows:      s.Rows,
			CreatedAt: s.CreatedAt,
		})
	}
	return result
}

// --- Profile management ---

// TerminalProfile represents a saved terminal profile
type TerminalProfile struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Command string `json:"command,omitempty"`
	Cwd     string `json:"cwd,omitempty"`
}

func profilesPath() string {
	dataDir := os.Getenv("XDG_DATA_HOME")
	if dataDir == "" {
		home, _ := os.UserHomeDir()
		dataDir = filepath.Join(home, ".local", "share")
	}
	return filepath.Join(dataDir, "markdown-themes", "terminal-profiles.json")
}

// LoadProfiles reads saved terminal profiles
func LoadProfiles() ([]TerminalProfile, error) {
	data, err := os.ReadFile(profilesPath())
	if err != nil {
		if os.IsNotExist(err) {
			return []TerminalProfile{
				{ID: "default-shell", Name: "Shell", Cwd: "{{workspace}}"},
			}, nil
		}
		return nil, err
	}
	var profiles []TerminalProfile
	if err := json.Unmarshal(data, &profiles); err != nil {
		return nil, err
	}
	return profiles, nil
}

// SaveProfiles writes terminal profiles to disk
func SaveProfiles(profiles []TerminalProfile) error {
	path := profilesPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(profiles, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// --- HTTP Handlers ---

// TerminalList returns active terminal sessions
func TerminalList(w http.ResponseWriter, r *http.Request) {
	tm := GetTerminalManager()
	active := tm.ListSessions()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"active": active,
	})
}

// TerminalProfiles returns saved profiles
func TerminalProfiles(w http.ResponseWriter, r *http.Request) {
	profiles, err := LoadProfiles()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(profiles)
}

// SaveTerminalProfile saves terminal profiles
func SaveTerminalProfile(w http.ResponseWriter, r *http.Request) {
	var profiles []TerminalProfile
	if err := json.NewDecoder(r.Body).Decode(&profiles); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := SaveProfiles(profiles); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// HandleTerminalMessage processes WebSocket terminal messages
func HandleTerminalMessage(msgType string, raw json.RawMessage, clientSend func(interface{}), client interface{}) {
	tm := GetTerminalManager()

	var msg struct {
		TerminalID string `json:"terminalId"`
		Cwd        string `json:"cwd,omitempty"`
		Command    string `json:"command,omitempty"`
		Data       string `json:"data,omitempty"`
		Cols       int    `json:"cols,omitempty"`
		Rows       int    `json:"rows,omitempty"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		log.Printf("[Terminal] Failed to parse message: %v", err)
		return
	}

	switch msgType {
	case "terminal-spawn":
		cols := uint16(msg.Cols)
		rows := uint16(msg.Rows)

		session, err := tm.SpawnSession(msg.TerminalID, msg.Cwd, cols, rows, msg.Command)
		if err != nil {
			clientSend(map[string]interface{}{
				"type":       "terminal-error",
				"terminalId": msg.TerminalID,
				"error":      err.Error(),
			})
			return
		}

		tm.AddClient(session.ID, client)

		clientSend(map[string]interface{}{
			"type":       "terminal-spawned",
			"terminalId": session.ID,
			"cwd":        session.Cwd,
			"cols":       session.Cols,
			"rows":       session.Rows,
		})

	case "terminal-input":
		data, err := base64.StdEncoding.DecodeString(msg.Data)
		if err != nil {
			log.Printf("[Terminal] Failed to decode input: %v", err)
			return
		}
		if err := tm.WriteToSession(msg.TerminalID, data); err != nil {
			log.Printf("[Terminal] Write error: %v", err)
		}

	case "terminal-resize":
		if err := tm.ResizeSession(msg.TerminalID, uint16(msg.Cols), uint16(msg.Rows)); err != nil {
			log.Printf("[Terminal] Resize error: %v", err)
		}

	case "terminal-close":
		tm.RemoveClient(msg.TerminalID, client)
		if err := tm.CloseSession(msg.TerminalID); err != nil {
			log.Printf("[Terminal] Close error: %v", err)
		}

	case "terminal-list":
		active := tm.ListSessions()
		clientSend(map[string]interface{}{
			"type":   "terminal-list",
			"active": active,
		})
	}
}
