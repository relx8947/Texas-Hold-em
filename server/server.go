package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	startingChips       = 2000
	initialProfileChips = 100000
	chatHistoryLimit    = 100
)

var (
	actionTimeout     = 30 * time.Second
	disconnectTimeout = 5 * time.Minute
)

func init() {
	if v := os.Getenv("ACTION_TIMEOUT_SECONDS"); v != "" {
		if seconds, err := strconv.Atoi(v); err == nil && seconds > 0 {
			actionTimeout = time.Duration(seconds) * time.Second
		}
	}
	if v := os.Getenv("DISCONNECT_TIMEOUT_MINUTES"); v != "" {
		if minutes, err := strconv.Atoi(v); err == nil && minutes > 0 {
			disconnectTimeout = time.Duration(minutes) * time.Minute
		}
	}
}

type Server struct {
	storage *Storage
	rooms   map[string]*Room
	mu      sync.Mutex
}

type Room struct {
	Server         *Server
	Code           string
	MaxPlayers     int
	HostID         string
	Seats          []*Player
	Game           *Game
	Chat           []ChatMessage
	CreatedAt      time.Time
	ActionDeadline time.Time
	ActionTimer    *time.Timer
	actionToken    int64
	StateSeq       int64
	HandID         int64
	LastEvent      *LastEvent
	mu             sync.Mutex
}

type Player struct {
	ID              string
	ProfileID       string
	Name            string
	AvatarSeed      string
	Seat            int
	Conn            *websocket.Conn
	sendMu          sync.Mutex
	Chips           int
	Hole            []Card
	Folded          bool
	AllIn           bool
	BetRound        int
	TotalBet        int
	Acted           bool
	Connected       bool
	SittingOut      bool
	PendingRemoval  bool
	BankrollSettled bool
	DisconnectedAt  *time.Time
	disconnectTimer *time.Timer
}

type WSMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type CreateRoomPayload struct {
	PlayerName string `json:"playerName"`
	PlayerID   string `json:"playerId"`
	ProfileID  string `json:"profileId"`
	MaxPlayers int    `json:"maxPlayers"`
	BuyIn      int    `json:"buyIn"`
}

type JoinRoomPayload struct {
	PlayerName string `json:"playerName"`
	RoomCode   string `json:"roomCode"`
	PlayerID   string `json:"playerId"`
	ProfileID  string `json:"profileId"`
	BuyIn      int    `json:"buyIn"`
}

type KickPayload struct {
	PlayerID string `json:"playerId"`
}

type TopUpPayload struct {
	Amount int `json:"amount"`
}

type ChatPayload struct {
	Message string `json:"message"`
}

type ProfilePayload struct {
	PlayerID string `json:"playerId"`
	Name     string `json:"name"`
}

type RoomSummary struct {
	Code          string `json:"code"`
	Players       int    `json:"players"`
	Connected     int    `json:"connected"`
	MaxPlayers    int    `json:"maxPlayers"`
	Stage         string `json:"stage"`
	HostName      string `json:"hostName"`
	CreatedAtUnix int64  `json:"createdAt"`
}

type ChatMessage struct {
	PlayerID string `json:"playerId"`
	Name     string `json:"name"`
	Message  string `json:"message"`
	TimeUnix int64  `json:"time"`
}

type PlayerAction struct {
	Action string `json:"action"`
	Amount int    `json:"amount"`
}

type PublicPlayer struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	AvatarSeed string `json:"avatarSeed"`
	Seat       int    `json:"seat"`
	Chips      int    `json:"chips"`
	BetRound   int    `json:"betRound"`
	TotalBet   int    `json:"totalBet"`
	Folded     bool   `json:"folded"`
	AllIn      bool   `json:"allIn"`
	SittingOut bool   `json:"sittingOut"`
	Dealer     bool   `json:"dealer"`
	Current    bool   `json:"current"`
	Connected  bool   `json:"connected"`
}

type PrivatePlayer struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	AvatarSeed string   `json:"avatarSeed"`
	Seat       int      `json:"seat"`
	Chips      int      `json:"chips"`
	Hole       []string `json:"hole"`
	BetRound   int      `json:"betRound"`
	TotalBet   int      `json:"totalBet"`
	Folded     bool     `json:"folded"`
	AllIn      bool     `json:"allIn"`
	SittingOut bool     `json:"sittingOut"`
}

type StatePayload struct {
	RoomCode       string         `json:"roomCode"`
	MaxPlayers     int            `json:"maxPlayers"`
	StateSeq       int64          `json:"stateSeq"`
	HandID         int64          `json:"handId"`
	Stage          string         `json:"stage"`
	Pot            int            `json:"pot"`
	Community      []string       `json:"community"`
	Players        []PublicPlayer `json:"players"`
	You            PrivatePlayer  `json:"you"`
	CurrentBet     int            `json:"currentBet"`
	MinRaise       int            `json:"minRaise"`
	SmallBlind     int            `json:"smallBlind"`
	BigBlind       int            `json:"bigBlind"`
	HostID         string         `json:"hostId"`
	ActionDeadline int64          `json:"actionDeadline"`
	ServerTime     int64          `json:"serverTime"`
	LastEvent      *LastEvent     `json:"lastEvent"`
}

type LastEvent struct {
	Kind     string `json:"kind"`
	PlayerID string `json:"playerId,omitempty"`
	Action   string `json:"action,omitempty"`
	Amount   int    `json:"amount,omitempty"`
	Stage    string `json:"stage,omitempty"`
	Seat     int    `json:"seat,omitempty"`
}

type ShowdownPayload struct {
	Community []string         `json:"community"`
	Players   []ShowdownPlayer `json:"players"`
	Results   []ShowdownResult `json:"results"`
}

type ShowdownPlayer struct {
	ID    string   `json:"id"`
	Name  string   `json:"name"`
	Hole  []string `json:"hole"`
	Rank  string   `json:"rank"`
	Value string   `json:"value"`
}

type ShowdownResult struct {
	PotAmount int              `json:"potAmount"`
	Winners   []ShowdownWinner `json:"winners"`
}

type SidePot struct {
	Amount   int
	Eligible []*Player
}

type ShowdownWinner struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ChipsWon int    `json:"chipsWon"`
}

type ProfileResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	AvatarSeed  string `json:"avatarSeed"`
	Chips       int    `json:"chips"`
	HandsPlayed int    `json:"handsPlayed"`
	HandsWon    int    `json:"handsWon"`
}

type gameSnapshot struct {
	Stage        string
	Pot          int
	Community    []Card
	CurrentBet   int
	MinRaise     int
	SmallBlind   int
	BigBlind     int
	DealerIndex  int
	CurrentIndex int
}

type RoomSnapshot struct {
	Code       string
	MaxPlayers int
	HostID     string
	CreatedAt  time.Time
}

type PlayerSnapshot struct {
	ID             string
	ProfileID      string
	Name           string
	AvatarSeed     string
	Seat           int
	Chips          int
	Connected      bool
	SittingOut     bool
	PendingRemoval bool
	DisconnectedAt *time.Time
}

var (
	idRandMu sync.Mutex
	idRand   = rand.New(rand.NewSource(time.Now().UnixNano()))

	connWriteLocks sync.Map
)

func NewServer(storage *Storage) *Server {
	return &Server{rooms: map[string]*Room{}, storage: storage}
}

func (s *Server) LoadFromStorage() error {
	if s.storage == nil {
		return nil
	}
	roomRecords, err := s.storage.LoadRooms()
	if err != nil {
		return err
	}
	for _, record := range roomRecords {
		players, err := s.storage.LoadPlayers(record.Code)
		if err != nil {
			return err
		}
		for _, p := range players {
			_ = s.settleStoredPlayerRecord(p)
		}
		_ = s.storage.DeleteRoom(record.Code)
	}
	return nil
}

func (s *Server) settleStoredPlayerRecord(player PlayerRecord) error {
	if s.storage == nil || player.Chips <= 0 {
		return nil
	}
	_, err := s.storage.AdjustProfileChips(firstNonEmpty(player.ProfileID, player.ID), player.Chips)
	return err
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		CheckOrigin: isAllowedWSOrigin,
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer func() {
		_ = conn.Close()
		connWriteLocks.Delete(conn)
	}()

	var room *Room
	var player *Player

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg WSMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			writeError(conn, "消息格式错误")
			continue
		}

		switch msg.Type {
		case "get_profile":
			var payload ProfilePayload
			if len(msg.Payload) > 0 {
				_ = json.Unmarshal(msg.Payload, &payload)
			}
			profile, err := s.ensureProfile(payload.PlayerID, payload.Name)
			if err != nil {
				writeError(conn, err.Error())
				continue
			}
			writeJSON(conn, WSMessage{Type: "profile", Payload: mustJSON(profile)})
		case "update_profile":
			var payload ProfilePayload
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				writeError(conn, "参数错误")
				continue
			}
			profile, err := s.updateProfile(payload.PlayerID, payload.Name)
			if err != nil {
				writeError(conn, err.Error())
				continue
			}
			if player != nil {
				room.mu.Lock()
				player.Name = profile.Name
				player.ProfileID = profile.ID
				player.AvatarSeed = profile.AvatarSeed
				room.mu.Unlock()
				room.broadcastState()
			}
			writeJSON(conn, WSMessage{Type: "profile", Payload: mustJSON(profile)})
		case "list_rooms":
			s.sendRoomsList(conn)
		case "create_room":
			if player != nil {
				writeError(conn, "已经在房间内")
				continue
			}
			var payload CreateRoomPayload
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				writeError(conn, "参数错误")
				continue
			}
			room, player, err = s.createRoom(payload, conn)
			if err != nil {
				writeError(conn, err.Error())
				continue
			}
			room.broadcastState()
			room.sendChatHistory(player)
		case "join_room":
			if player != nil {
				writeError(conn, "已经在房间内")
				continue
			}
			var payload JoinRoomPayload
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				writeError(conn, "参数错误")
				continue
			}
			room, player, err = s.joinRoom(payload, conn)
			if err != nil {
				writeError(conn, err.Error())
				continue
			}
			room.broadcastState()
			room.sendChatHistory(player)
		case "start_game":
			if room == nil || player == nil {
				writeError(conn, "请先加入房间")
				continue
			}
			room.mu.Lock()
			if room.HostID != player.ID {
				room.mu.Unlock()
				writeError(conn, "只有房主可以开始")
				continue
			}
			if room.Game.Stage != "waiting" {
				room.mu.Unlock()
				writeError(conn, "牌局已经开始")
				continue
			}
			err := room.Game.StartHand()
			if err == nil {
				room.resetActionTimerLocked()
			}
			room.mu.Unlock()
			if err != nil {
				writeError(conn, err.Error())
				continue
			}
			room.broadcastState()
		case "action":
			if room == nil || player == nil {
				writeError(conn, "请先加入房间")
				continue
			}
			var payload PlayerAction
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				writeError(conn, "参数错误")
				continue
			}
			room.mu.Lock()
			err := room.Game.ApplyAction(player.ID, payload)
			if err == nil {
				room.resetActionTimerLocked()
			}
			room.mu.Unlock()
			if err != nil {
				writeError(conn, err.Error())
				continue
			}
			room.broadcastState()
		case "chat":
			if room == nil || player == nil {
				writeError(conn, "请先加入房间")
				continue
			}
			var payload ChatPayload
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				writeError(conn, "参数错误")
				continue
			}
			room.addChatMessage(player, payload.Message)
		case "kick_player":
			if room == nil || player == nil {
				writeError(conn, "请先加入房间")
				continue
			}
			var payload KickPayload
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				writeError(conn, "参数错误")
				continue
			}
			if err := room.kickPlayer(player.ID, payload.PlayerID); err != nil {
				writeError(conn, err.Error())
				continue
			}
			room.mu.Lock()
			room.LastEvent = &LastEvent{Kind: "kick", PlayerID: payload.PlayerID}
			room.mu.Unlock()
			room.broadcastState()
		case "dissolve_room":
			if room == nil || player == nil {
				writeError(conn, "请先加入房间")
				continue
			}
			if room.HostID != player.ID {
				writeError(conn, "只有房主可以解散")
				continue
			}
			s.dissolveRoom(room, "房间已解散")
			room = nil
			player = nil
		case "top_up":
			if room == nil || player == nil {
				writeError(conn, "请先加入房间")
				continue
			}
			var payload TopUpPayload
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				writeError(conn, "参数错误")
				continue
			}
			if payload.Amount <= 0 {
				writeError(conn, "补码金额无效")
				continue
			}
			_, err := s.ensureProfile(player.ProfileID, player.Name)
			if err != nil {
				writeError(conn, err.Error())
				continue
			}
			updatedProfile, err := s.debitProfileChips(player.ProfileID, payload.Amount)
			if err != nil {
				writeError(conn, err.Error())
				continue
			}
			writeJSON(conn, WSMessage{Type: "profile", Payload: mustJSON(updatedProfile)})
			room.mu.Lock()
			player.Chips += payload.Amount
			room.LastEvent = &LastEvent{Kind: "top_up", PlayerID: player.ID, Amount: payload.Amount, Seat: player.Seat}
			room.mu.Unlock()
			room.broadcastState()
		case "sit_out":
			if room == nil || player == nil {
				writeError(conn, "请先加入房间")
				continue
			}
			room.mu.Lock()
			player.SittingOut = true
			room.LastEvent = &LastEvent{Kind: "sit_out", PlayerID: player.ID, Seat: player.Seat}
			if room.Game.Stage != "waiting" && !player.Folded {
				room.Game.ForceFold(player.ID)
				room.resetActionTimerLocked()
			}
			room.mu.Unlock()
			room.broadcastState()
		case "sit_in":
			if room == nil || player == nil {
				writeError(conn, "请先加入房间")
				continue
			}
			room.mu.Lock()
			player.SittingOut = false
			room.LastEvent = &LastEvent{Kind: "sit_in", PlayerID: player.ID, Seat: player.Seat}
			room.mu.Unlock()
			room.broadcastState()
		case "leave_room":
			if room == nil || player == nil {
				writeError(conn, "请先加入房间")
				continue
			}
			room.handleLeave(player.ID)
			room = nil
			player = nil
		default:
			writeError(conn, "未知消息类型")
		}
	}

	if room != nil && player != nil {
		room.handleDisconnect(player.ID)
	}
}

func (s *Server) createRoom(payload CreateRoomPayload, conn *websocket.Conn) (*Room, *Player, error) {
	if strings.TrimSpace(payload.PlayerName) == "" {
		return nil, nil, errors.New("请输入昵称")
	}
	profile, err := s.ensureProfile(firstNonEmpty(payload.ProfileID, payload.PlayerID), payload.PlayerName)
	if err != nil {
		return nil, nil, err
	}
	buyIn := sanitizeBuyIn(payload.BuyIn)
	updatedProfile, err := s.debitProfileChips(profile.ID, buyIn)
	if err != nil {
		return nil, nil, err
	}
	profile = updatedProfile
	maxPlayers := sanitizeMaxPlayers(payload.MaxPlayers)
	code := randomCode()
	room := &Room{
		Server:     s,
		Code:       code,
		MaxPlayers: maxPlayers,
		Seats:      make([]*Player, maxPlayers),
		CreatedAt:  time.Now(),
	}
	room.Game = NewGame(room)
	player := room.addPlayerLocked(randomID(), profile.ID, profile.Name, profile.AvatarSeed, conn, buyIn)
	room.HostID = player.ID
	s.mu.Lock()
	for s.rooms[code] != nil {
		code = randomCode()
		room.Code = code
	}
	s.rooms[code] = room
	s.mu.Unlock()
	writeJSON(conn, WSMessage{
		Type:    "room_created",
		Payload: mustJSON(map[string]string{"roomCode": code, "playerId": player.ID}),
	})
	writeJSON(conn, WSMessage{Type: "profile", Payload: mustJSON(profile)})
	return room, player, nil
}

func (s *Server) joinRoom(payload JoinRoomPayload, conn *websocket.Conn) (*Room, *Player, error) {
	code := strings.ToUpper(strings.TrimSpace(payload.RoomCode))
	if code == "" {
		return nil, nil, errors.New("请输入房间号")
	}
	s.mu.Lock()
	room := s.rooms[code]
	s.mu.Unlock()
	if room == nil {
		return nil, nil, errors.New("房间不存在")
	}
	if strings.TrimSpace(payload.PlayerName) == "" {
		return nil, nil, errors.New("请输入昵称")
	}
	profile, err := s.ensureProfile(firstNonEmpty(payload.ProfileID, payload.PlayerID), payload.PlayerName)
	if err != nil {
		return nil, nil, err
	}
	buyIn := sanitizeBuyIn(payload.BuyIn)
	room.mu.Lock()
	defer room.mu.Unlock()

	roomPlayerID := strings.TrimSpace(payload.PlayerID)
	if roomPlayerID != "" {
		if _, p := room.findPlayerByIDLocked(roomPlayerID); p != nil {
			if p.PendingRemoval {
				return nil, nil, errors.New("该玩家已退出房间")
			}
			if p.Connected {
				return nil, nil, errors.New("该玩家已在线")
			}
			if p.DisconnectedAt != nil && time.Since(*p.DisconnectedAt) > disconnectTimeout {
				return nil, nil, errors.New("断线已超时，请重新加入")
			}
			p.Conn = conn
			p.Connected = true
			p.ProfileID = profile.ID
			p.Name = profile.Name
			p.AvatarSeed = profile.AvatarSeed
			if p.disconnectTimer != nil {
				p.disconnectTimer.Stop()
				p.disconnectTimer = nil
			}
			p.DisconnectedAt = nil
			if room.Server != nil && room.Server.storage != nil {
				_ = room.Server.storage.UpsertPlayer(room.Code, buildPlayerSnapshot(p))
			}
			writeJSON(conn, WSMessage{
				Type:    "room_joined",
				Payload: mustJSON(map[string]string{"roomCode": room.Code, "playerId": p.ID}),
			})
			return room, p, nil
		}
	}

	if profile.ID != "" {
		if _, p := room.findPlayerByProfileIDLocked(profile.ID); p != nil {
			if p.PendingRemoval {
				return nil, nil, errors.New("该玩家已退出房间")
			}
			if p.Connected {
				return nil, nil, errors.New("该玩家已在线")
			}
			if p.DisconnectedAt != nil && time.Since(*p.DisconnectedAt) > disconnectTimeout {
				return nil, nil, errors.New("断线已超时，请重新加入")
			}
			p.Conn = conn
			p.Connected = true
			p.ProfileID = profile.ID
			p.Name = profile.Name
			p.AvatarSeed = profile.AvatarSeed
			if p.disconnectTimer != nil {
				p.disconnectTimer.Stop()
				p.disconnectTimer = nil
			}
			p.DisconnectedAt = nil
			if room.Server != nil && room.Server.storage != nil {
				_ = room.Server.storage.UpsertPlayer(room.Code, buildPlayerSnapshot(p))
			}
			writeJSON(conn, WSMessage{
				Type:    "room_joined",
				Payload: mustJSON(map[string]string{"roomCode": room.Code, "playerId": p.ID}),
			})
			return room, p, nil
		}
	}

	if room.isFullLocked() {
		return nil, nil, errors.New("房间已满")
	}
	updatedProfile, err := s.debitProfileChips(profile.ID, buyIn)
	if err != nil {
		return nil, nil, err
	}
	profile = updatedProfile
	player := room.addPlayerLocked(randomID(), profile.ID, profile.Name, profile.AvatarSeed, conn, buyIn)
	writeJSON(conn, WSMessage{
		Type:    "room_joined",
		Payload: mustJSON(map[string]string{"roomCode": room.Code, "playerId": player.ID}),
	})
	writeJSON(conn, WSMessage{Type: "profile", Payload: mustJSON(profile)})
	return room, player, nil
}

func (s *Server) sendRoomsList(conn *websocket.Conn) {
	rooms := s.listRooms()
	writeJSON(conn, WSMessage{
		Type:    "rooms_list",
		Payload: mustJSON(map[string]interface{}{"rooms": rooms}),
	})
}

func (s *Server) listRooms() []RoomSummary {
	s.mu.Lock()
	roomList := make([]*Room, 0, len(s.rooms))
	for _, r := range s.rooms {
		roomList = append(roomList, r)
	}
	s.mu.Unlock()

	summaries := make([]RoomSummary, 0, len(roomList))
	for _, room := range roomList {
		room.mu.Lock()
		players := 0
		connected := 0
		hostName := ""
		for _, p := range room.Seats {
			if p == nil {
				continue
			}
			players++
			if p.Connected {
				connected++
			}
			if p.ID == room.HostID {
				hostName = p.Name
			}
		}
		stage := room.Game.Stage
		createdAt := room.CreatedAt.Unix()
		room.mu.Unlock()
		summaries = append(summaries, RoomSummary{
			Code:          room.Code,
			Players:       players,
			Connected:     connected,
			MaxPlayers:    room.MaxPlayers,
			Stage:         stage,
			HostName:      hostName,
			CreatedAtUnix: createdAt,
		})
	}
	return summaries
}

func (s *Server) ensureProfile(playerID string, playerName string) (ProfileResponse, error) {
	name := strings.TrimSpace(playerName)
	if name == "" {
		name = "玩家"
	}
	id := strings.TrimSpace(playerID)
	if id == "" {
		id = randomID()
	}
	seed := stableAvatarSeed(id)
	if s.storage == nil {
		return ProfileResponse{ID: id, Name: name, AvatarSeed: seed, Chips: initialProfileChips}, nil
	}
	record, err := s.storage.EnsureProfile(id, name, seed, initialProfileChips)
	if err != nil {
		return ProfileResponse{}, err
	}
	return profileResponse(record), nil
}

func (s *Server) updateProfile(playerID string, playerName string) (ProfileResponse, error) {
	id := strings.TrimSpace(playerID)
	if id == "" {
		return ProfileResponse{}, errors.New("玩家ID不能为空")
	}
	name := strings.TrimSpace(playerName)
	if name == "" {
		return ProfileResponse{}, errors.New("请输入昵称")
	}
	if len([]rune(name)) > 16 {
		return ProfileResponse{}, errors.New("昵称最多16个字符")
	}
	if s.storage == nil {
		return ProfileResponse{ID: id, Name: name, AvatarSeed: stableAvatarSeed(id), Chips: initialProfileChips}, nil
	}
	if _, err := s.storage.EnsureProfile(id, name, stableAvatarSeed(id), initialProfileChips); err != nil {
		return ProfileResponse{}, err
	}
	record, err := s.storage.UpdateProfileName(id, name)
	if err != nil {
		return ProfileResponse{}, err
	}
	return profileResponse(record), nil
}

func (s *Server) adjustProfileChips(profileID string, delta int) (ProfileResponse, error) {
	if profileID == "" {
		return ProfileResponse{}, nil
	}
	if s.storage == nil {
		return ProfileResponse{ID: profileID, AvatarSeed: stableAvatarSeed(profileID), Chips: initialProfileChips + delta}, nil
	}
	if delta == 0 {
		record, err := s.storage.LoadProfile(profileID)
		if err != nil {
			return ProfileResponse{}, err
		}
		return profileResponse(record), nil
	}
	record, err := s.storage.AdjustProfileChips(profileID, delta)
	if err != nil {
		return ProfileResponse{}, err
	}
	return profileResponse(record), nil
}

func (s *Server) debitProfileChips(profileID string, amount int) (ProfileResponse, error) {
	if profileID == "" {
		return ProfileResponse{}, errors.New("玩家资料不存在")
	}
	if amount <= 0 {
		return s.adjustProfileChips(profileID, 0)
	}
	if s.storage == nil {
		if initialProfileChips < amount {
			return ProfileResponse{}, fmt.Errorf("总筹码不足，当前剩余%d", initialProfileChips)
		}
		return ProfileResponse{ID: profileID, AvatarSeed: stableAvatarSeed(profileID), Chips: initialProfileChips - amount}, nil
	}
	record, ok, err := s.storage.DebitProfileChips(profileID, amount)
	if err != nil {
		return ProfileResponse{}, err
	}
	if !ok {
		return ProfileResponse{}, fmt.Errorf("总筹码不足，当前剩余%d", record.Chips)
	}
	return profileResponse(record), nil
}

func profileResponse(record ProfileRecord) ProfileResponse {
	return ProfileResponse{
		ID:          record.ID,
		Name:        record.Name,
		AvatarSeed:  firstNonEmpty(record.AvatarSeed, stableAvatarSeed(record.ID)),
		Chips:       record.Chips,
		HandsPlayed: record.HandsPlayed,
		HandsWon:    record.HandsWon,
	}
}

func (s *Server) dissolveRoom(room *Room, reason string) {
	room.mu.Lock()
	players := append([]*Player{}, room.Seats...)
	for _, p := range room.Seats {
		room.settlePlayerBankrollLocked(p)
	}
	if room.ActionTimer != nil {
		room.ActionTimer.Stop()
		room.ActionTimer = nil
	}
	room.mu.Unlock()

	msg := WSMessage{Type: "room_dissolved", Payload: mustJSON(map[string]string{"message": reason})}
	for _, p := range players {
		if p == nil || p.Conn == nil {
			continue
		}
		_ = p.send(msg)
		_ = p.Conn.Close()
	}

	s.mu.Lock()
	delete(s.rooms, room.Code)
	s.mu.Unlock()
	if s.storage != nil {
		_ = s.storage.DeleteRoom(room.Code)
	}
}

func (r *Room) addPlayerLocked(id string, profileID string, name string, avatarSeed string, conn *websocket.Conn, buyIn int) *Player {
	seat := r.firstEmptySeatLocked()
	player := &Player{
		ID:         id,
		ProfileID:  profileID,
		Name:       name,
		AvatarSeed: avatarSeed,
		Seat:       seat,
		Conn:       conn,
		Chips:      buyIn,
		Connected:  true,
	}
	r.Seats[seat] = player
	return player
}

func (r *Room) firstEmptySeatLocked() int {
	for i, p := range r.Seats {
		if p == nil {
			return i
		}
	}
	return -1
}

func (r *Room) isFullLocked() bool {
	return r.firstEmptySeatLocked() == -1
}

func (r *Room) findPlayerByIDLocked(id string) (int, *Player) {
	for i, p := range r.Seats {
		if p != nil && p.ID == id {
			return i, p
		}
	}
	return -1, nil
}

func (r *Room) findPlayerByProfileIDLocked(profileID string) (int, *Player) {
	for i, p := range r.Seats {
		if p != nil && p.ProfileID == profileID {
			return i, p
		}
	}
	return -1, nil
}

func (r *Room) findPlayer(id string) (int, *Player) {
	for i, p := range r.Seats {
		if p != nil && p.ID == id {
			return i, p
		}
	}
	return -1, nil
}

func (r *Room) handleDisconnect(playerID string) {
	r.mu.Lock()
	_, player := r.findPlayerByIDLocked(playerID)
	if player == nil {
		r.mu.Unlock()
		return
	}
	if player.Connected {
		player.Connected = false
		now := time.Now()
		player.DisconnectedAt = &now
		if player.disconnectTimer != nil {
			player.disconnectTimer.Stop()
		}
		player.disconnectTimer = time.AfterFunc(disconnectTimeout, func() {
			r.handleDisconnectTimeout(player.ID)
		})
	}
	r.mu.Unlock()
	r.broadcastState()
}

func (r *Room) handleDisconnectTimeout(playerID string) {
	r.mu.Lock()
	_, player := r.findPlayerByIDLocked(playerID)
	if player == nil || player.Connected || player.DisconnectedAt == nil {
		r.mu.Unlock()
		return
	}
	if time.Since(*player.DisconnectedAt) < disconnectTimeout {
		r.mu.Unlock()
		return
	}
	removedNow := r.removePlayerLocked(playerID)
	r.mu.Unlock()
	r.broadcastInfo(fmt.Sprintf("%s 超时退出房间", player.Name))
	r.broadcastState()
	if removedNow {
		r.removeRoomIfEmpty()
	}
}

func (r *Room) handleLeave(playerID string) {
	r.mu.Lock()
	removedNow := r.removePlayerLocked(playerID)
	r.mu.Unlock()
	r.broadcastState()
	if removedNow {
		r.removeRoomIfEmpty()
	}
}

func (r *Room) removePlayerLocked(playerID string) bool {
	idx, player := r.findPlayerByIDLocked(playerID)
	if player == nil {
		return false
	}
	if player.disconnectTimer != nil {
		player.disconnectTimer.Stop()
		player.disconnectTimer = nil
	}
	player.Connected = false
	player.SittingOut = true
	player.Folded = true

	if r.Game != nil && r.Game.Stage != "waiting" {
		r.Game.ForceFold(playerID)
		r.resetActionTimerLocked()
		player.PendingRemoval = true
		return false
	}

	r.settlePlayerBankrollLocked(player)
	r.Seats[idx] = nil
	r.ensureHostLocked()
	if r.Server != nil && r.Server.storage != nil {
		_ = r.Server.storage.DeletePlayer(player.ID)
	}
	return true
}

func (r *Room) cleanupPendingRemovalsLocked() {
	for i, p := range r.Seats {
		if p == nil {
			continue
		}
		if p.PendingRemoval {
			r.settlePlayerBankrollLocked(p)
			r.Seats[i] = nil
			if r.Server != nil && r.Server.storage != nil {
				_ = r.Server.storage.DeletePlayer(p.ID)
			}
		}
	}
	r.ensureHostLocked()
}

func (r *Room) settlePlayerBankrollLocked(player *Player) {
	if player == nil || player.BankrollSettled {
		return
	}
	if player.Chips > 0 && r.Server != nil {
		_, _ = r.Server.adjustProfileChips(player.ProfileID, player.Chips)
	}
	player.Chips = 0
	player.BankrollSettled = true
}

func (r *Room) ensureHostLocked() {
	if r.HostID != "" {
		for _, p := range r.Seats {
			if p != nil && p.ID == r.HostID {
				return
			}
		}
	}
	r.HostID = ""
	for _, p := range r.Seats {
		if p != nil && p.Connected {
			r.HostID = p.ID
			return
		}
	}
}

func (r *Room) onHandEndedLocked() {
	r.cleanupPendingRemovalsLocked()
	r.ActionDeadline = time.Time{}
	if r.ActionTimer != nil {
		r.ActionTimer.Stop()
		r.ActionTimer = nil
	}
}

func (r *Room) removeRoomIfEmpty() {
	if r.Server == nil {
		return
	}
	r.mu.Lock()
	empty := true
	for _, p := range r.Seats {
		if p != nil {
			empty = false
			break
		}
	}
	if empty && r.ActionTimer != nil {
		r.ActionTimer.Stop()
		r.ActionTimer = nil
	}
	r.mu.Unlock()
	if empty {
		r.Server.mu.Lock()
		delete(r.Server.rooms, r.Code)
		r.Server.mu.Unlock()
		if r.Server.storage != nil {
			_ = r.Server.storage.DeleteRoom(r.Code)
		}
	}
}

func (r *Room) resetActionTimerLocked() {
	if r.ActionTimer != nil {
		r.ActionTimer.Stop()
		r.ActionTimer = nil
	}
	r.ActionDeadline = time.Time{}
	if r.Game == nil || r.Game.Stage == "waiting" {
		return
	}
	idx := r.Game.CurrentIndex
	if idx < 0 || idx >= len(r.Seats) {
		return
	}
	player := r.Seats[idx]
	if player == nil || player.Folded || player.AllIn || player.SittingOut {
		return
	}
	r.actionToken++
	token := r.actionToken
	r.ActionDeadline = time.Now().Add(actionTimeout)
	r.ActionTimer = time.AfterFunc(actionTimeout, func() {
		r.handleActionTimeout(token, idx)
	})
}

func (r *Room) handleActionTimeout(token int64, seat int) {
	r.mu.Lock()
	if token != r.actionToken || r.Game.Stage == "waiting" {
		r.mu.Unlock()
		return
	}
	if r.Game.CurrentIndex != seat {
		r.mu.Unlock()
		return
	}
	player := r.Seats[seat]
	if player == nil || player.Folded || player.AllIn {
		r.mu.Unlock()
		return
	}
	_ = r.Game.ApplyAction(player.ID, PlayerAction{Action: "fold"})
	r.resetActionTimerLocked()
	r.mu.Unlock()
	r.broadcastInfo(fmt.Sprintf("%s 超时自动弃牌", player.Name))
	r.broadcastState()
}

func (r *Room) kickPlayer(requesterID string, targetID string) error {
	r.mu.Lock()
	if r.HostID != requesterID {
		r.mu.Unlock()
		return errors.New("只有房主可以踢人")
	}
	_, target := r.findPlayerByIDLocked(targetID)
	if target == nil {
		r.mu.Unlock()
		return errors.New("玩家不存在")
	}
	if target.ID == requesterID {
		r.mu.Unlock()
		return errors.New("不能踢自己")
	}
	removedNow := r.removePlayerLocked(targetID)
	conn := target.Conn
	r.mu.Unlock()

	if conn != nil {
		_ = target.send(WSMessage{Type: "kicked", Payload: mustJSON(map[string]string{"message": "你被房主移除"})})
		_ = conn.Close()
	}
	r.broadcastInfo(fmt.Sprintf("%s 被房主移除", target.Name))
	if removedNow {
		r.removeRoomIfEmpty()
	}
	return nil
}

func (r *Room) addChatMessage(player *Player, message string) {
	text := strings.TrimSpace(message)
	if text == "" {
		return
	}
	msg := ChatMessage{
		PlayerID: player.ID,
		Name:     player.Name,
		Message:  text,
		TimeUnix: time.Now().Unix(),
	}
	r.mu.Lock()
	r.Chat = append(r.Chat, msg)
	if len(r.Chat) > chatHistoryLimit {
		r.Chat = r.Chat[len(r.Chat)-chatHistoryLimit:]
	}
	r.mu.Unlock()
	if r.Server != nil && r.Server.storage != nil {
		_ = r.Server.storage.InsertChat(r.Code, msg)
	}
	r.broadcastChat(msg)
}

func (r *Room) sendChatHistory(player *Player) {
	if player == nil || player.Conn == nil {
		return
	}
	r.mu.Lock()
	history := append([]ChatMessage{}, r.Chat...)
	r.mu.Unlock()
	if len(history) == 0 {
		return
	}
	_ = player.send(WSMessage{Type: "chat_history", Payload: mustJSON(map[string]interface{}{"messages": history})})
}

func (r *Room) broadcastState() {
	r.mu.Lock()
	players := append([]*Player{}, r.Seats...)
	game := r.Game
	r.StateSeq++
	stateSeq := r.StateSeq
	handID := r.HandID
	lastEvent := r.LastEvent
	if lastEvent != nil {
		copy := *lastEvent
		lastEvent = &copy
	}
	roomSnapshot := RoomSnapshot{
		Code:       r.Code,
		MaxPlayers: r.MaxPlayers,
		HostID:     r.HostID,
		CreatedAt:  r.CreatedAt,
	}
	snapshot := gameSnapshot{
		Stage:        game.Stage,
		Pot:          game.Pot,
		Community:    append([]Card{}, game.Community...),
		CurrentBet:   game.CurrentBet,
		MinRaise:     game.MinRaise,
		SmallBlind:   game.SmallBlind,
		BigBlind:     game.BigBlind,
		DealerIndex:  game.DealerIndex,
		CurrentIndex: game.CurrentIndex,
	}
	actionDeadline := r.ActionDeadline
	serverTime := time.Now().UnixMilli()
	states := make([]WSMessage, 0, len(players))
	playerSnapshots := make([]PlayerSnapshot, 0, len(players))
	for _, p := range players {
		if p == nil {
			continue
		}
		if p.BankrollSettled {
			continue
		}
		state := r.buildStateForSnapshot(p, snapshot, players, actionDeadline, serverTime, stateSeq, handID, lastEvent)
		states = append(states, state)
		playerSnapshots = append(playerSnapshots, buildPlayerSnapshot(p))
	}
	r.mu.Unlock()

	idx := 0
	for _, p := range players {
		if p == nil {
			continue
		}
		if p.BankrollSettled {
			continue
		}
		_ = p.send(states[idx])
		idx++
	}
	r.persistSnapshots(roomSnapshot, playerSnapshots)
	r.removeRoomIfEmpty()
}

func (r *Room) buildStateForSnapshot(player *Player, game gameSnapshot, seatPlayers []*Player, actionDeadline time.Time, serverTime int64, stateSeq int64, handID int64, lastEvent *LastEvent) WSMessage {
	publicPlayers := []PublicPlayer{}
	for idx, p := range seatPlayers {
		if p == nil {
			continue
		}
		public := PublicPlayer{
			ID:         p.ID,
			Name:       p.Name,
			AvatarSeed: p.AvatarSeed,
			Seat:       idx,
			Chips:      p.Chips,
			BetRound:   p.BetRound,
			TotalBet:   p.TotalBet,
			Folded:     p.Folded,
			AllIn:      p.AllIn,
			SittingOut: p.SittingOut,
			Connected:  p.Connected,
			Dealer:     idx == game.DealerIndex && game.Stage != "waiting",
			Current:    idx == game.CurrentIndex,
		}
		publicPlayers = append(publicPlayers, public)
	}

	deadline := int64(0)
	if !actionDeadline.IsZero() {
		deadline = actionDeadline.UnixMilli()
	}

	payload := StatePayload{
		RoomCode:       r.Code,
		MaxPlayers:     r.MaxPlayers,
		StateSeq:       stateSeq,
		HandID:         handID,
		Stage:          game.Stage,
		Pot:            game.Pot,
		Community:      cardsToString(game.Community),
		Players:        publicPlayers,
		CurrentBet:     game.CurrentBet,
		MinRaise:       game.MinRaise,
		SmallBlind:     game.SmallBlind,
		BigBlind:       game.BigBlind,
		HostID:         r.HostID,
		ActionDeadline: deadline,
		ServerTime:     serverTime,
		LastEvent:      lastEvent,
		You: PrivatePlayer{
			ID:         player.ID,
			Name:       player.Name,
			AvatarSeed: player.AvatarSeed,
			Seat:       player.Seat,
			Chips:      player.Chips,
			Hole:       cardsToString(player.Hole),
			BetRound:   player.BetRound,
			TotalBet:   player.TotalBet,
			Folded:     player.Folded,
			AllIn:      player.AllIn,
			SittingOut: player.SittingOut,
		},
	}

	return WSMessage{
		Type:    "state",
		Payload: mustJSON(payload),
	}
}

func (r *Room) broadcastInfo(message string) {
	r.broadcastSimple("info", map[string]string{"message": message})
}

func (r *Room) broadcastShowdown(payload ShowdownPayload) {
	msg := WSMessage{Type: "showdown", Payload: mustJSON(payload)}
	for _, p := range r.Seats {
		if p == nil || p.Conn == nil {
			continue
		}
		_ = p.send(msg)
	}
}

func (r *Room) broadcastChat(message ChatMessage) {
	msg := WSMessage{Type: "chat", Payload: mustJSON(message)}
	for _, p := range r.Seats {
		if p == nil || p.Conn == nil {
			continue
		}
		_ = p.send(msg)
	}
}

func (r *Room) broadcastSimple(msgType string, payload interface{}) {
	msg := WSMessage{Type: msgType, Payload: mustJSON(payload)}
	for _, p := range r.Seats {
		if p == nil || p.Conn == nil {
			continue
		}
		_ = p.send(msg)
	}
}

func (r *Room) persistSnapshots(roomSnap RoomSnapshot, playerSnaps []PlayerSnapshot) {
	if r.Server == nil || r.Server.storage == nil {
		return
	}
	_ = r.Server.storage.UpsertRoom(roomSnap)
	for _, p := range playerSnaps {
		_ = r.Server.storage.UpsertPlayer(roomSnap.Code, p)
	}
}

func buildPlayerSnapshot(player *Player) PlayerSnapshot {
	var disconnectedAt *time.Time
	if player.DisconnectedAt != nil {
		t := *player.DisconnectedAt
		disconnectedAt = &t
	}
	return PlayerSnapshot{
		ID:             player.ID,
		ProfileID:      player.ProfileID,
		Name:           player.Name,
		AvatarSeed:     player.AvatarSeed,
		Seat:           player.Seat,
		Chips:          player.Chips,
		Connected:      player.Connected,
		SittingOut:     player.SittingOut,
		PendingRemoval: player.PendingRemoval,
		DisconnectedAt: disconnectedAt,
	}
}

func (p *Player) send(msg WSMessage) error {
	if p.Conn == nil {
		return nil
	}
	return writeConnJSON(p.Conn, msg)
}

func writeJSON(conn *websocket.Conn, msg WSMessage) {
	if conn == nil {
		return
	}
	_ = writeConnJSON(conn, msg)
}

func writeConnJSON(conn *websocket.Conn, msg WSMessage) error {
	lockValue, _ := connWriteLocks.LoadOrStore(conn, &sync.Mutex{})
	lock := lockValue.(*sync.Mutex)
	lock.Lock()
	defer lock.Unlock()
	return conn.WriteJSON(msg)
}

func writeError(conn *websocket.Conn, message string) {
	writeJSON(conn, WSMessage{
		Type:    "error",
		Payload: mustJSON(map[string]string{"message": message}),
	})
}

func isAllowedWSOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	originURL, err := url.Parse(origin)
	if err != nil {
		return false
	}
	originHost := originURL.Hostname()
	if originHost == "" {
		return false
	}
	requestHost, _, err := net.SplitHostPort(r.Host)
	if err != nil {
		requestHost = r.Host
	}
	if strings.EqualFold(originHost, requestHost) || isLoopbackHost(originHost) || isPrivateHost(originHost) {
		return true
	}
	return false
}

func isLoopbackHost(host string) bool {
	normalized := strings.Trim(strings.ToLower(host), "[]")
	return normalized == "localhost" || normalized == "127.0.0.1" || normalized == "::1"
}

func isPrivateHost(host string) bool {
	ip := net.ParseIP(strings.Trim(host, "[]"))
	if ip == nil {
		return false
	}
	return ip.IsPrivate() || ip.IsLoopback()
}

func mustJSON(v interface{}) json.RawMessage {
	data, _ := json.Marshal(v)
	return data
}

func randomCode() string {
	const letters = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
	code := make([]byte, 4)
	for i := 0; i < 4; i++ {
		idRandMu.Lock()
		code[i] = letters[idRand.Intn(len(letters))]
		idRandMu.Unlock()
	}
	return string(code)
}

func randomID() string {
	idRandMu.Lock()
	defer idRandMu.Unlock()
	return fmt.Sprintf("%08x", idRand.Int31())
}

func stableAvatarSeed(id string) string {
	if strings.TrimSpace(id) == "" {
		return randomID()
	}
	return fmt.Sprintf("gh-%s", id)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func sanitizeMaxPlayers(n int) int {
	if n < 2 {
		return 2
	}
	if n > 10 {
		return 10
	}
	return n
}

func sanitizeBuyIn(n int) int {
	if n <= 0 {
		return startingChips
	}
	return n
}
