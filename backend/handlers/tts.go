package handlers

import (
	"net/http"
	"net/http/httputil"
	"net/url"
)

var ttsProxy = func() *httputil.ReverseProxy {
	target, _ := url.Parse("http://localhost:8150")
	proxy := httputil.NewSingleHostReverseProxy(target)
	return proxy
}()

// TTSProxy forwards /api/tts/* to the Python TTS server at localhost:8150/api/*
func TTSProxy(w http.ResponseWriter, r *http.Request) {
	// Strip /api/tts prefix, keep /api/*
	r.URL.Path = "/api" + r.URL.Path[len("/api/tts"):]
	r.Host = "localhost:8150"
	ttsProxy.ServeHTTP(w, r)
}
