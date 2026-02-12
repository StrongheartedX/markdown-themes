package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"log"
	"os"
)

const (
	tokenBytes = 32
	TokenFile  = "/tmp/markdown-themes-auth-token"
)

// token holds the generated auth token for this process.
var token string

// Init generates a cryptographically random auth token, stores it in
// memory, and writes it to TokenFile with mode 0600 so only the current
// user can read it. Call once at startup.
func Init() error {
	b := make([]byte, tokenBytes)
	if _, err := rand.Read(b); err != nil {
		return fmt.Errorf("crypto/rand: %w", err)
	}
	token = hex.EncodeToString(b)

	if err := os.WriteFile(TokenFile, []byte(token), 0600); err != nil {
		return fmt.Errorf("write token file: %w", err)
	}
	log.Printf("Auth token written to %s", TokenFile)
	return nil
}

// Token returns the in-memory auth token generated at startup.
func Token() string {
	return token
}

// Validate performs a constant-time comparison of the provided value
// against the startup token. Returns true when they match.
func Validate(candidate string) bool {
	return subtle.ConstantTimeCompare([]byte(token), []byte(candidate)) == 1
}

// Cleanup removes the token file. Call via defer in main.
func Cleanup() {
	if err := os.Remove(TokenFile); err != nil && !os.IsNotExist(err) {
		log.Printf("Warning: failed to remove token file: %v", err)
	}
}
