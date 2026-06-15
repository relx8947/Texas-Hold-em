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
	Code         string
	Name         string
	MaxPlayers   int
	HostID       string
	PasswordHash string
	CreatedAt    time.Time
}

type PlayerRecord struct {
	ID             string
	ProfileID      string
	RoomCode       string
	Name           string
	AvatarSeed     string
	Seat           int
	Chips          int
	Connected      bool
	SittingOut     bool
	PendingRemoval bool
	DisconnectedAt *time.Time
}

type ProfileRecord struct {
	ID          string
	Name        string
	AvatarSeed  string
	Chips       int
	HandsPlayed int
	HandsWon    int
	NetProfit   int
	UpdatedAt   time.Time
}

type UserRecord struct {
	Username     string
	PasswordHash string
	ProfileID    string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type ProfileSummary struct {
	ID    string
	Name  string
	Chips int
}

func NewStorage(path string) (*Storage, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// SQLite handles concurrency best with a single writer; serialize DB access
	// and enable WAL + a busy timeout so concurrent goroutines wait instead of
	// failing with "database is locked".
	db.SetMaxOpenConns(1)
	for _, pragma := range []string{
		`PRAGMA journal_mode = WAL;`,
		`PRAGMA busy_timeout = 5000;`,
		`PRAGMA synchronous = NORMAL;`,
		`PRAGMA foreign_keys = ON;`,
	} {
		if _, err := db.Exec(pragma); err != nil {
			_ = db.Close()
			return nil, err
		}
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
			name TEXT NOT NULL DEFAULT '',
			max_players INTEGER NOT NULL,
			host_id TEXT NOT NULL,
			password_hash TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS players (
			id TEXT PRIMARY KEY,
			profile_id TEXT NOT NULL DEFAULT '',
			room_code TEXT NOT NULL,
			name TEXT NOT NULL,
			avatar_seed TEXT NOT NULL DEFAULT '',
			seat INTEGER NOT NULL,
			chips INTEGER NOT NULL,
			connected INTEGER NOT NULL,
			sitting_out INTEGER NOT NULL,
			pending_removal INTEGER NOT NULL,
			disconnected_at INTEGER
		);`,
		`CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_code);`,
		`CREATE TABLE IF NOT EXISTS profiles (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			avatar_seed TEXT NOT NULL,
			chips INTEGER NOT NULL,
			hands_played INTEGER NOT NULL,
			hands_won INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS users (
			username TEXT PRIMARY KEY,
			password_hash TEXT NOT NULL,
			profile_id TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS chat (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			room_code TEXT NOT NULL,
			player_id TEXT NOT NULL,
			name TEXT NOT NULL,
			message TEXT NOT NULL,
			time INTEGER NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_chat_room ON chat(room_code);`,
		`CREATE TABLE IF NOT EXISTS hand_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			profile_id TEXT NOT NULL,
			hand_id INTEGER NOT NULL,
			room_code TEXT NOT NULL,
			stage TEXT NOT NULL DEFAULT '',
			net INTEGER NOT NULL DEFAULT 0,
			won INTEGER NOT NULL DEFAULT 0,
			community TEXT NOT NULL DEFAULT '',
			hole TEXT NOT NULL DEFAULT '',
			rank TEXT NOT NULL DEFAULT '',
			time INTEGER NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_hand_history_profile ON hand_history(profile_id);`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}
	if err := s.addColumnIfMissing("profiles", "net_profit", "INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	if err := s.addColumnIfMissing("players", "avatar_seed", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := s.addColumnIfMissing("players", "profile_id", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := s.addColumnIfMissing("rooms", "password_hash", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := s.addColumnIfMissing("rooms", "name", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if _, err := s.db.Exec(
		`UPDATE profiles SET chips = ?, updated_at = ? WHERE chips = ? AND hands_played = 0 AND hands_won = 0`,
		initialProfileChips,
		time.Now().Unix(),
		startingChips,
	); err != nil {
		return err
	}
	return nil
}

func (s *Storage) addColumnIfMissing(table string, column string, definition string) error {
	rows, err := s.db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name string
		var colType string
		var notNull int
		var defaultValue interface{}
		var pk int
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultValue, &pk); err != nil {
			return err
		}
		if name == column {
			return nil
		}
	}
	_, err = s.db.Exec(`ALTER TABLE ` + table + ` ADD COLUMN ` + column + ` ` + definition)
	return err
}

func (s *Storage) UpsertRoom(room RoomSnapshot) error {
	_, err := s.db.Exec(
		`INSERT INTO rooms (code, name, max_players, host_id, password_hash, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(code) DO UPDATE SET
		 name=excluded.name,
		 max_players=excluded.max_players,
		 host_id=excluded.host_id,
		 password_hash=excluded.password_hash,
		 created_at=excluded.created_at`,
		room.Code,
		room.Name,
		room.MaxPlayers,
		room.HostID,
		room.PasswordHash,
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
		`INSERT INTO players (id, profile_id, room_code, name, avatar_seed, seat, chips, connected, sitting_out, pending_removal, disconnected_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		 profile_id=excluded.profile_id,
		 room_code=excluded.room_code,
		 name=excluded.name,
		 avatar_seed=excluded.avatar_seed,
		 seat=excluded.seat,
		 chips=excluded.chips,
		 connected=excluded.connected,
		 sitting_out=excluded.sitting_out,
		 pending_removal=excluded.pending_removal,
		 disconnected_at=excluded.disconnected_at`,
		player.ID,
		player.ProfileID,
		roomCode,
		player.Name,
		player.AvatarSeed,
		player.Seat,
		player.Chips,
		boolToInt(player.Connected),
		boolToInt(player.SittingOut),
		boolToInt(player.PendingRemoval),
		disconnectedAt,
	)
	return err
}

func (s *Storage) EnsureProfile(id string, name string, avatarSeed string, chips int) (ProfileRecord, error) {
	now := time.Now()
	_, err := s.db.Exec(
		`INSERT INTO profiles (id, name, avatar_seed, chips, hands_played, hands_won, updated_at)
		 VALUES (?, ?, ?, ?, 0, 0, ?)
		 ON CONFLICT(id) DO NOTHING`,
		id,
		name,
		avatarSeed,
		chips,
		now.Unix(),
	)
	if err != nil {
		return ProfileRecord{}, err
	}
	return s.LoadProfile(id)
}

func (s *Storage) CreateUser(username string, passwordHash string, profile ProfileRecord) (UserRecord, error) {
	now := time.Now()
	_, err := s.db.Exec(
		`INSERT INTO users (username, password_hash, profile_id, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?)`,
		username,
		passwordHash,
		profile.ID,
		now.Unix(),
		now.Unix(),
	)
	if err != nil {
		return UserRecord{}, err
	}
	return UserRecord{
		Username:     username,
		PasswordHash: passwordHash,
		ProfileID:    profile.ID,
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
}

func (s *Storage) UpsertUser(username string, passwordHash string, profileID string) (UserRecord, error) {
	now := time.Now()
	_, err := s.db.Exec(
		`INSERT INTO users (username, password_hash, profile_id, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(username) DO UPDATE SET
		 password_hash=excluded.password_hash,
		 profile_id=excluded.profile_id,
		 updated_at=excluded.updated_at`,
		username,
		passwordHash,
		profileID,
		now.Unix(),
		now.Unix(),
	)
	if err != nil {
		return UserRecord{}, err
	}
	return s.LoadUser(username)
}

func (s *Storage) LoadUser(username string) (UserRecord, error) {
	var record UserRecord
	var createdAt int64
	var updatedAt int64
	err := s.db.QueryRow(
		`SELECT username, password_hash, profile_id, created_at, updated_at FROM users WHERE username = ?`,
		username,
	).Scan(
		&record.Username,
		&record.PasswordHash,
		&record.ProfileID,
		&createdAt,
		&updatedAt,
	)
	if err != nil {
		return UserRecord{}, err
	}
	record.CreatedAt = time.Unix(createdAt, 0)
	record.UpdatedAt = time.Unix(updatedAt, 0)
	return record, nil
}

func (s *Storage) LoadProfile(id string) (ProfileRecord, error) {
	var record ProfileRecord
	var updatedAt int64
	err := s.db.QueryRow(
		`SELECT id, name, avatar_seed, chips, hands_played, hands_won, net_profit, updated_at FROM profiles WHERE id = ?`,
		id,
	).Scan(
		&record.ID,
		&record.Name,
		&record.AvatarSeed,
		&record.Chips,
		&record.HandsPlayed,
		&record.HandsWon,
		&record.NetProfit,
		&updatedAt,
	)
	if err != nil {
		return ProfileRecord{}, err
	}
	record.UpdatedAt = time.Unix(updatedAt, 0)
	return record, nil
}

func (s *Storage) FindProfilesByName(name string) ([]ProfileSummary, error) {
	rows, err := s.db.Query(
		`SELECT id, name, chips FROM profiles WHERE lower(name) = lower(?) ORDER BY updated_at DESC, id DESC`,
		name,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var profiles []ProfileSummary
	for rows.Next() {
		var item ProfileSummary
		if err := rows.Scan(&item.ID, &item.Name, &item.Chips); err != nil {
			return nil, err
		}
		profiles = append(profiles, item)
	}
	return profiles, nil
}

func (s *Storage) DeleteProfile(id string) error {
	_, err := s.db.Exec(`DELETE FROM profiles WHERE id = ?`, id)
	return err
}

func (s *Storage) UpdateProfileName(id string, name string) (ProfileRecord, error) {
	_, err := s.db.Exec(
		`UPDATE profiles SET name = ?, updated_at = ? WHERE id = ?`,
		name,
		time.Now().Unix(),
		id,
	)
	if err != nil {
		return ProfileRecord{}, err
	}
	return s.LoadProfile(id)
}

func (s *Storage) AdjustProfileChips(id string, delta int) (ProfileRecord, error) {
	_, err := s.db.Exec(
		`UPDATE profiles SET chips = chips + ?, updated_at = ? WHERE id = ?`,
		delta,
		time.Now().Unix(),
		id,
	)
	if err != nil {
		return ProfileRecord{}, err
	}
	return s.LoadProfile(id)
}

func (s *Storage) DebitProfileChips(id string, amount int) (ProfileRecord, bool, error) {
	if amount <= 0 {
		record, err := s.LoadProfile(id)
		return record, true, err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return ProfileRecord{}, false, err
	}
	defer tx.Rollback()

	result, err := tx.Exec(
		`UPDATE profiles SET chips = chips - ?, updated_at = ? WHERE id = ? AND chips >= ?`,
		amount,
		time.Now().Unix(),
		id,
		amount,
	)
	if err != nil {
		return ProfileRecord{}, false, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return ProfileRecord{}, false, err
	}
	if affected == 0 {
		var current ProfileRecord
		var updatedAt int64
		err := tx.QueryRow(
			`SELECT id, name, avatar_seed, chips, hands_played, hands_won, net_profit, updated_at FROM profiles WHERE id = ?`,
			id,
		).Scan(
			&current.ID,
			&current.Name,
			&current.AvatarSeed,
			&current.Chips,
			&current.HandsPlayed,
			&current.HandsWon,
			&current.NetProfit,
			&updatedAt,
		)
		if err != nil {
			return ProfileRecord{}, false, err
		}
		current.UpdatedAt = time.Unix(updatedAt, 0)
		return current, false, nil
	}

	var record ProfileRecord
	var updatedAt int64
	if err := tx.QueryRow(
		`SELECT id, name, avatar_seed, chips, hands_played, hands_won, net_profit, updated_at FROM profiles WHERE id = ?`,
		id,
	).Scan(
		&record.ID,
		&record.Name,
		&record.AvatarSeed,
		&record.Chips,
		&record.HandsPlayed,
		&record.HandsWon,
		&record.NetProfit,
		&updatedAt,
	); err != nil {
		return ProfileRecord{}, false, err
	}
	record.UpdatedAt = time.Unix(updatedAt, 0)
	if err := tx.Commit(); err != nil {
		return ProfileRecord{}, false, err
	}
	return record, true, nil
}

func (s *Storage) DeletePlayer(playerID string) error {
	_, err := s.db.Exec(`DELETE FROM players WHERE id = ?`, playerID)
	return err
}

const handHistoryLimit = 100

// RecordHandResult updates a profile's aggregate stats and appends a hand-history
// row in a single transaction. handsPlayed always increments; handsWon only when
// the player won; net is the chip delta for the hand.
func (s *Storage) RecordHandResult(profileID string, won bool, net int, entry HandHistoryEntry) error {
	if profileID == "" {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	wonInc := 0
	if won {
		wonInc = 1
	}
	if _, err := tx.Exec(
		`UPDATE profiles SET hands_played = hands_played + 1, hands_won = hands_won + ?, net_profit = net_profit + ?, updated_at = ? WHERE id = ?`,
		wonInc, net, time.Now().Unix(), profileID,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(
		`INSERT INTO hand_history (profile_id, hand_id, room_code, stage, net, won, community, hole, rank, time)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		profileID, entry.HandID, entry.RoomCode, entry.Stage, entry.Net, boolToInt(entry.Won),
		entry.Community, entry.Hole, entry.Rank, entry.TimeUnix,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(
		`DELETE FROM hand_history WHERE profile_id = ? AND id NOT IN (
			SELECT id FROM hand_history WHERE profile_id = ? ORDER BY id DESC LIMIT ?
		)`,
		profileID, profileID, handHistoryLimit,
	); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Storage) LoadHandHistory(profileID string, limit int) ([]HandHistoryEntry, error) {
	if limit <= 0 || limit > handHistoryLimit {
		limit = handHistoryLimit
	}
	rows, err := s.db.Query(
		`SELECT hand_id, room_code, stage, net, won, community, hole, rank, time
		 FROM hand_history WHERE profile_id = ? ORDER BY id DESC LIMIT ?`,
		profileID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []HandHistoryEntry
	for rows.Next() {
		var e HandHistoryEntry
		var won int
		if err := rows.Scan(&e.HandID, &e.RoomCode, &e.Stage, &e.Net, &won, &e.Community, &e.Hole, &e.Rank, &e.TimeUnix); err != nil {
			return nil, err
		}
		e.Won = won == 1
		entries = append(entries, e)
	}
	return entries, nil
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
	rows, err := s.db.Query(`SELECT code, name, max_players, host_id, password_hash, created_at FROM rooms`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rooms []RoomRecord
	for rows.Next() {
		var record RoomRecord
		var createdAt int64
		if err := rows.Scan(&record.Code, &record.Name, &record.MaxPlayers, &record.HostID, &record.PasswordHash, &createdAt); err != nil {
			return nil, err
		}
		record.CreatedAt = time.Unix(createdAt, 0)
		rooms = append(rooms, record)
	}
	return rooms, nil
}

func (s *Storage) LoadPlayers(roomCode string) ([]PlayerRecord, error) {
	rows, err := s.db.Query(
		`SELECT id, profile_id, room_code, name, avatar_seed, seat, chips, connected, sitting_out, pending_removal, disconnected_at
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
			&record.ProfileID,
			&record.RoomCode,
			&record.Name,
			&record.AvatarSeed,
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
