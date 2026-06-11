package main

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type AppConfig struct {
	Addr           string
	DataPath       string
	StaticDir      string
	AllowedOrigins []string
	WSReadLimit    int64
	WSWriteTimeout time.Duration
	WSPongTimeout  time.Duration
	WSPingInterval time.Duration
}

func LoadConfig() AppConfig {
	pongTimeout := envDurationSeconds("WS_PONG_TIMEOUT_SECONDS", 60*time.Second)
	pingInterval := envDurationSeconds("WS_PING_INTERVAL_SECONDS", 25*time.Second)
	if pingInterval >= pongTimeout {
		pingInterval = pongTimeout / 2
	}

	return AppConfig{
		Addr:           envString("ADDR", ":8080"),
		DataPath:       envString("DATA_PATH", "data.db"),
		StaticDir:      envString("STATIC_DIR", "../web-ui/dist"),
		AllowedOrigins: envList("ALLOWED_ORIGINS"),
		WSReadLimit:    envInt64("WS_READ_LIMIT_BYTES", 4096),
		WSWriteTimeout: envDurationSeconds("WS_WRITE_TIMEOUT_SECONDS", 10*time.Second),
		WSPongTimeout:  pongTimeout,
		WSPingInterval: pingInterval,
	}
}

func envString(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envList(key string) []string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return nil
	}
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func envInt64(key string, fallback int64) int64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func envDurationSeconds(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds <= 0 {
		return fallback
	}
	return time.Duration(seconds) * time.Second
}
