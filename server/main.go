package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	cfg := LoadConfig()
	storage, err := NewStorage(cfg.DataPath)
	if err != nil {
		log.Fatalf("storage init failed: %v", err)
	}
	defer storage.Close()

	server := NewServer(storage, cfg)
	if err := server.LoadFromStorage(); err != nil {
		log.Fatalf("load data failed: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write([]byte(`{"ready":true}`))
	})
	mux.HandleFunc("/ws", server.handleWS)
	mux.HandleFunc("/", serveStaticOrStatus(cfg.StaticDir))

	httpServer := &http.Server{
		Addr:              cfg.Addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("Server listening on %s", cfg.Addr)
	if err := httpServer.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func serveStaticOrStatus(staticDir string) http.HandlerFunc {
	absDir, err := filepath.Abs(staticDir)
	if err != nil {
		absDir = staticDir
	}
	fileServer := http.FileServer(http.Dir(absDir))
	indexPath := filepath.Join(absDir, "index.html")
	_, indexErr := os.Stat(indexPath)
	hasIndex := indexErr == nil

	serveIndex := func(w http.ResponseWriter, r *http.Request) {
		if hasIndex {
			http.ServeFile(w, r, indexPath)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("Texas Hold'em LAN server running"))
	}

	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			serveIndex(w, r)
			return
		}
		requestPath := filepath.Clean(r.URL.Path)
		fullPath := filepath.Join(absDir, requestPath)
		rel, relErr := filepath.Rel(absDir, fullPath)
		safe := relErr == nil && rel != ".." && !strings.HasPrefix(rel, "../")
		if safe {
			if info, statErr := os.Stat(fullPath); statErr == nil && !info.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		// SPA fallback: unknown non-asset routes (client-side routing, refresh on
		// a sub-path) should return index.html instead of plaintext. Real missing
		// assets (with a file extension) get a proper 404.
		if hasIndex && filepath.Ext(requestPath) == "" {
			serveIndex(w, r)
			return
		}
		http.NotFound(w, r)
	}
}
