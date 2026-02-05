package utils

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// GetFileIcon returns an emoji icon based on file type
func GetFileIcon(name string, isDir bool, isSymlink bool, path string) string {
	// Check for symlinks first
	if isSymlink {
		return "🌀"
	}

	if isDir {
		if name == ".." {
			return "⬆"
		}
		// Check if home directory
		if homeDir, err := os.UserHomeDir(); err == nil && path == homeDir {
			return "🏠"
		}
		// Special folder icons
		switch name {
		case ".claude", ".codex", ".copilot", ".gemini", ".opencode":
			return "🤖"
		case ".git":
			return "📦"
		case ".vscode":
			return "💻"
		case ".github":
			return "🐙"
		case ".docker", ".devcontainer":
			return "🐳"
		case ".prompts":
			return "📝"
		case "node_modules":
			return "📚"
		case "docs", "documentation":
			return "📖"
		case "src", "source":
			return "📂"
		case "test", "tests", "__tests__":
			return "🧪"
		case "build", "dist", "out":
			return "📦"
		case "public", "static", "assets":
			return "🌐"
		case "config", "configs", ".config":
			return "⚙"
		case "scripts":
			return "📜"
		default:
			// Check if empty
			if isDirEmpty(path) {
				return "📂"
			}
			return "📁"
		}
	}

	// Check for secrets files
	if IsSecretsFile(name) {
		return "🔒"
	}

	// Check for ignore files
	if isIgnoreFile(name) {
		return "🚫"
	}

	// Get file extension
	ext := strings.ToLower(filepath.Ext(name))

	// Extension-based icons
	iconMap := map[string]string{
		// Programming languages
		".go":     "🐹",
		".py":     "🐍",
		".js":     "🟨",
		".ts":     "🔷",
		".jsx":    "⚛",
		".tsx":    "⚛",
		".rs":     "🦀",
		".c":      "©",
		".cpp":    "➕",
		".h":      "📋",
		".java":   "☕",
		".rb":     "💎",
		".php":    "🐘",
		".sh":     "🐚",
		".bash":   "🐚",
		".lua":    "🌙",
		".r":      "📊",
		// Web
		".html":   "🌐",
		".css":    "🎨",
		".scss":   "🎨",
		".sass":   "🎨",
		".vue":    "💚",
		".svelte": "🧡",
		// Data/Config
		".json":   "📊",
		".yaml":   "📄",
		".yml":    "📄",
		".toml":   "📄",
		".xml":    "📰",
		".csv":    "📈",
		".sql":    "🗄",
		// Documents
		".md":     "📝",
		".txt":    "📄",
		".pdf":    "📕",
		".doc":    "📘",
		".docx":   "📘",
		// Archives
		".zip":    "🗜",
		".tar":    "📦",
		".gz":     "🗜",
		".7z":     "🗜",
		".rar":    "🗜",
		// Images
		".png":    "🖼",
		".jpg":    "🖼",
		".jpeg":   "🖼",
		".gif":    "🎞",
		".svg":    "🎨",
		".ico":    "🖼",
		".webp":   "🖼",
		// Audio/Video
		".mp3":    "🎵",
		".mp4":    "🎬",
		".wav":    "🎵",
		".avi":    "🎬",
		".mkv":    "🎬",
		// System/Config
		".env":    "🔐",
		".ini":    "⚙",
		".conf":   "⚙",
		".cfg":    "⚙",
		".lock":   "🔒",
		// Build/Package
		".gradle": "🐘",
		".maven":  "📦",
		".npm":    "📦",
	}

	if icon, ok := iconMap[ext]; ok {
		return icon
	}

	// Special files without extension
	switch name {
	case "CLAUDE.md", "CLAUDE.local.md":
		return "🤖"
	case "Makefile", "makefile", "GNUmakefile":
		return "🔨"
	case "Dockerfile":
		return "🐳"
	case "docker-compose.yml", "docker-compose.yaml":
		return "🐳"
	case "LICENSE", "LICENSE.txt", "LICENSE.md":
		return "📜"
	case "README", "README.md", "README.txt":
		return "📖"
	case ".gitignore", ".gitattributes", ".gitmodules":
		return "🔀"
	case "package.json":
		return "📦"
	case "package-lock.json":
		return "🔒"
	case "tsconfig.json":
		return "🔷"
	case "go.mod", "go.sum":
		return "🐹"
	case "Cargo.toml", "Cargo.lock":
		return "🦀"
	case "requirements.txt":
		return "🐍"
	case "Gemfile", "Gemfile.lock":
		return "💎"
	}

	return "📄"
}

// IsSecretsFile checks if the file likely contains secrets
func IsSecretsFile(name string) bool {
	secretsFiles := []string{
		".env", ".env.local", ".env.development", ".env.production",
		".env.test", ".env.staging", ".env.example",
		"credentials.json", "secrets.json", "secrets.yaml", "secrets.yml",
		".npmrc", ".pypirc", ".netrc", ".htpasswd",
		"id_rsa", "id_ed25519", "id_ecdsa", "id_dsa",
		"*.pem", "*.key", "*.p12", "*.pfx",
	}

	nameLower := strings.ToLower(name)
	for _, secret := range secretsFiles {
		if strings.HasPrefix(secret, "*.") {
			if strings.HasSuffix(nameLower, secret[1:]) {
				return true
			}
		} else if nameLower == secret {
			return true
		}
	}
	return false
}

func isIgnoreFile(name string) bool {
	ignoreFiles := []string{
		".gitignore", ".dockerignore", ".npmignore", ".eslintignore",
		".prettierignore", ".stylelintignore", ".hgignore",
	}
	nameLower := strings.ToLower(name)
	for _, ignore := range ignoreFiles {
		if nameLower == ignore {
			return true
		}
	}
	return false
}

func isDirEmpty(path string) bool {
	entries, err := os.ReadDir(path)
	if err != nil {
		return true
	}
	return len(entries) == 0
}

// FormatFileSize returns a human-readable file size
func FormatFileSize(size int64) string {
	const unit = 1024
	if size < unit {
		return string(rune(size)) + "B"
	}
	div, exp := int64(unit), 0
	for n := size / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return string(rune(size/div)) + string("KMGTPE"[exp]) + "B"
}

// FormatModTime returns a relative time string
func FormatModTime(t time.Time) string {
	now := time.Now()
	diff := now.Sub(t)

	switch {
	case diff < time.Minute:
		return "just now"
	case diff < time.Hour:
		mins := int(diff.Minutes())
		if mins == 1 {
			return "1m ago"
		}
		return string(rune(mins)) + "m ago"
	case diff < 24*time.Hour:
		hours := int(diff.Hours())
		if hours == 1 {
			return "1h ago"
		}
		return string(rune(hours)) + "h ago"
	case diff < 7*24*time.Hour:
		days := int(diff.Hours() / 24)
		if days == 1 {
			return "1d ago"
		}
		return string(rune(days)) + "d ago"
	case diff < 30*24*time.Hour:
		weeks := int(diff.Hours() / 24 / 7)
		if weeks == 1 {
			return "1w ago"
		}
		return string(rune(weeks)) + "w ago"
	case diff < 365*24*time.Hour:
		months := int(diff.Hours() / 24 / 30)
		if months == 1 {
			return "1mo ago"
		}
		return string(rune(months)) + "mo ago"
	default:
		years := int(diff.Hours() / 24 / 365)
		if years == 1 {
			return "1y ago"
		}
		return string(rune(years)) + "y ago"
	}
}

// IsBinaryFile checks if a file is binary by looking for null bytes
func IsBinaryFile(path string) bool {
	file, err := os.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()

	// Read first 8KB
	buf := make([]byte, 8192)
	n, err := file.Read(buf)
	if err != nil {
		return false
	}

	// Check for null bytes
	for i := 0; i < n; i++ {
		if buf[i] == 0 {
			return true
		}
	}
	return false
}

// IsGitRepo checks if a path is a git repository
func IsGitRepo(path string) bool {
	gitPath := filepath.Join(path, ".git")
	info, err := os.Stat(gitPath)
	if err != nil {
		return false
	}
	return info.IsDir()
}

// GetGitBranch reads the current branch from .git/HEAD
func GetGitBranch(repoPath string) string {
	headPath := filepath.Join(repoPath, ".git", "HEAD")
	file, err := os.Open(headPath)
	if err != nil {
		return ""
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	if scanner.Scan() {
		line := scanner.Text()
		// Format: ref: refs/heads/branch-name
		if strings.HasPrefix(line, "ref: refs/heads/") {
			return strings.TrimPrefix(line, "ref: refs/heads/")
		}
		// Detached HEAD - return short hash
		if len(line) >= 7 {
			return line[:7]
		}
	}
	return ""
}

// ShouldIgnoreDir checks if a directory should be ignored for workspace watching
func ShouldIgnoreDir(name string) bool {
	ignoreDirs := []string{
		"node_modules", ".git", "dist", "build", ".next",
		".nuxt", ".output", ".cache", ".parcel-cache",
		"coverage", ".nyc_output", "__pycache__", ".pytest_cache",
		"venv", ".venv", "env", ".tox", ".eggs",
		"target", ".gradle", ".idea", ".vscode",
		"vendor", "Pods", ".bundle",
	}
	for _, dir := range ignoreDirs {
		if name == dir {
			return true
		}
	}
	return false
}
