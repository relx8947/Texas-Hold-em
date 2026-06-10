package main

import (
	"log"
	"net/http"
)

func main() {
	storage, err := NewStorage("data.db")
	if err != nil {
		log.Fatalf("storage init failed: %v", err)
	}
	defer storage.Close()

	server := NewServer(storage)
	if err := server.LoadFromStorage(); err != nil {
		log.Fatalf("load data failed: %v", err)
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("Texas Hold'em LAN server running"))
	})

	http.HandleFunc("/ws", server.handleWS)

	addr := ":8080"
	log.Printf("Server listening on %s", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal(err)
	}
}
