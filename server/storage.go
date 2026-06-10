package main

import (
	"database/sql"
	"time"

	_ "modernc.org/sqlite"
)

type Storage struct {
	db *sql.DB
}

type RoomRecord struct {
	Code       string
	MaxPlayers int
	HostID     string
	CreatedAt  time.Time
}

type PlayerRecord struct {
	ID             string
	RoomCode       string
	Name           string
	Seat           int
	Chips          int
	Connected      bool
	SittingOut     bool
	PendingRemoval bool
	DisconnectedAt *time.Time
}

func NewStorage(path string) (*Storage, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	storage := &Storage{db: db}
	if err := storage.initSchema(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return storage, nil
}

func (s *Storage) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Storage) initSchema() error {
	stmts := []string{
		`PRAGMA foreign_keys = ON;`,
		`CREATE TABLE IF NOT EXISTS rooms (
			code TEXT PRIMARY KEY,
			max_players INTEGER NOT NULL,
			host_id TEXT NOT NULL,
			created_at INTEGER NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS players (
			id TEXT PRIMARY KEY,
			room_code TEXT NOT NULL,
			name TEXT NOT NULL,
			seat INTEGER NOT NULL,
			chips INTEGER NOT NULL,
			connected INTEGER NOT NULL,
			sitting_out INTEGER NOT NULL,
			pending_removal INTEGER NOT NULL,
			disconnected_at INTEGER
		);`,
		`CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_code);`,
		`CREATE TABLE IF NOT EXISTS chat (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			room_code TEXT NOT NULL,
			player_id TEXT NOT NULL,
			name TEXT NOT NULL,
			message TEXT NOT NULL,
			time INTEGER NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_chat_room ON chat(room_code);`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}

func (s *Storage) UpsertRoom(room RoomSnapshot) error {
	_, err := s.db.Exec(
		`INSERT INTO rooms (code, max_players, host_id, created_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(code) DO UPDATE SET
		 max_players=excluded.max_players,
		 host_id=excluded.host_id,
		 created_at=excluded.created_at`,
		room.Code,
		room.MaxPlayers,
		room.HostID,
		room.CreatedAt.Unix(),
	)
	return err
}

func (s *Storage) UpsertPlayer(roomCode string, player PlayerSnapshot) error {
	var disconnectedAt interface{}
	if player.DisconnectedAt != nil {
		disconnectedAt = player.DisconnectedAt.Unix()
	}
	_, err := s.db.Exec(
		`INSERT INTO players (id, room_code, name, seat, chips, connected, sitting_out, pending_removal, disconnected_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		 room_code=excluded.room_code,
		 name=excluded.name,
		 seat=excluded.seat,
		 chips=excluded.chips,
		 connected=excluded.connected,
		 sitting_out=excluded.sitting_out,
		 pending_removal=excluded.pending_removal,
		 disconnected_at=excluded.disconnected_at`,
		player.ID,
		roomCode,
		player.Name,
		player.Seat,
		player.Chips,
		boolToInt(player.Connected),
		boolToInt(player.SittingOut),
		boolToInt(player.PendingRemoval),
		disconnectedAt,
	)
	return err
}

func (s *Storage) DeletePlayer(playerID string) error {
	_, err := s.db.Exec(`DELETE FROM players WHERE id = ?`, playerID)
	return err
}

func (s *Storage) DeleteRoom(roomCode string) error {
	if _, err := s.db.Exec(`DELETE FROM chat WHERE room_code = ?`, roomCode); err != nil {
		return err
	}
	if _, err := s.db.Exec(`DELETE FROM players WHERE room_code = ?`, roomCode); err != nil {
		return err
	}
	_, err := s.db.Exec(`DELETE FROM rooms WHERE code = ?`, roomCode)
	return err
}

func (s *Storage) InsertChat(roomCode string, message ChatMessage) error {
	if _, err := s.db.Exec(
		`INSERT INTO chat (room_code, player_id, name, message, time) VALUES (?, ?, ?, ?, ?)`,
		roomCode,
		message.PlayerID,
		message.Name,
		message.Message,
		message.TimeUnix,
	); err != nil {
		return err
	}
	_, err := s.db.Exec(
		`DELETE FROM chat WHERE room_code = ? AND id NOT IN (
			SELECT id FROM chat WHERE room_code = ? ORDER BY id DESC LIMIT ?
		)`,
		roomCode,
		roomCode,
		chatHistoryLimit,
	)
	return err
}

func (s *Storage) LoadRooms() ([]RoomRecord, error) {
	rows, err := s.db.Query(`SELECT code, max_players, host_id, created_at FROM rooms`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rooms []RoomRecord
	for rows.Next() {
		var record RoomRecord
		var createdAt int64
		if err := rows.Scan(&record.Code, &record.MaxPlayers, &record.HostID, &createdAt); err != nil {
			return nil, err
		}
		record.CreatedAt = time.Unix(createdAt, 0)
		rooms = append(rooms, record)
	}
	return rooms, nil
}

func (s *Storage) LoadPlayers(roomCode string) ([]PlayerRecord, error) {
	rows, err := s.db.Query(
		`SELECT id, room_code, name, seat, chips, connected, sitting_out, pending_removal, disconnected_at
		 FROM players WHERE room_code = ?`,
		roomCode,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var players []PlayerRecord
	for rows.Next() {
		var record PlayerRecord
		var connected int
		var sittingOut int
		var pendingRemoval int
		var disconnectedAt sql.NullInt64
		if err := rows.Scan(
			&record.ID,
			&record.RoomCode,
			&record.Name,
			&record.Seat,
			&record.Chips,
			&connected,
			&sittingOut,
			&pendingRemoval,
			&disconnectedAt,
		); err != nil {
			return nil, err
		}
		record.Connected = connected == 1
		record.SittingOut = sittingOut == 1
		record.PendingRemoval = pendingRemoval == 1
		if disconnectedAt.Valid {
			t := time.Unix(disconnectedAt.Int64, 0)
			record.DisconnectedAt = &t
		}
		players = append(players, record)
	}
	return players, nil
}

func (s *Storage) LoadChat(roomCode string) ([]ChatMessage, error) {
	rows, err := s.db.Query(
		`SELECT player_id, name, message, time FROM chat WHERE room_code = ? ORDER BY id ASC`,
		roomCode,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []ChatMessage
	for rows.Next() {
		var msg ChatMessage
		if err := rows.Scan(&msg.PlayerID, &msg.Name, &msg.Message, &msg.TimeUnix); err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}
	return messages, nil
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
