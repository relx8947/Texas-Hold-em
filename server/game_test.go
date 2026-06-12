package main

import "testing"

func newTestRoom(chips ...int) *Room {
	room := &Room{
		Code:       "TEST",
		Name:       "Test Room",
		MaxPlayers: len(chips),
		Seats:      make([]*Player, len(chips)),
	}
	room.Game = NewGame(room)
	for i, stack := range chips {
		id := string(rune('a' + i))
		room.Seats[i] = &Player{
			ID:         id,
			ProfileID:  id,
			Name:       id,
			Seat:       i,
			Chips:      stack,
			Connected:  true,
			AvatarSeed: id,
		}
	}
	return room
}

func TestStartHandPostsBlindsAndDealsHoleCards(t *testing.T) {
	room := newTestRoom(2000, 2000, 2000)

	if err := room.Game.StartHand(); err != nil {
		t.Fatalf("StartHand() error = %v", err)
	}

	if room.Game.Stage != "preflop" {
		t.Fatalf("stage = %q, want preflop", room.Game.Stage)
	}
	if room.Game.Pot != 30 {
		t.Fatalf("pot = %d, want 30", room.Game.Pot)
	}
	if room.Game.CurrentBet != 20 {
		t.Fatalf("current bet = %d, want 20", room.Game.CurrentBet)
	}
	if room.Seats[1].Chips != 1990 || room.Seats[2].Chips != 1980 {
		t.Fatalf("blind stacks = %d/%d, want 1990/1980", room.Seats[1].Chips, room.Seats[2].Chips)
	}
	for _, player := range room.Seats {
		if len(player.Hole) != 2 {
			t.Fatalf("player %s hole cards = %d, want 2", player.ID, len(player.Hole))
		}
	}
}

func TestApplyActionRejectsOutOfTurnPlayer(t *testing.T) {
	room := newTestRoom(2000, 2000, 2000)
	if err := room.Game.StartHand(); err != nil {
		t.Fatalf("StartHand() error = %v", err)
	}

	err := room.Game.ApplyAction(room.Seats[1].ID, PlayerAction{Action: "call"})
	if err == nil {
		t.Fatal("ApplyAction() error = nil, want out-of-turn error")
	}
}

func TestFoldAwardsPotToOnlyRemainingActivePlayer(t *testing.T) {
	room := newTestRoom(2000, 2000)
	if err := room.Game.StartHand(); err != nil {
		t.Fatalf("StartHand() error = %v", err)
	}

	if err := room.Game.ApplyAction(room.Seats[1].ID, PlayerAction{Action: "fold"}); err != nil {
		t.Fatalf("ApplyAction(fold) error = %v", err)
	}

	if room.Game.Stage != "waiting" {
		t.Fatalf("stage = %q, want waiting", room.Game.Stage)
	}
	if room.Game.Pot != 0 {
		t.Fatalf("pot = %d, want 0", room.Game.Pot)
	}
	if room.Seats[0].Chips != 2010 {
		t.Fatalf("winner chips = %d, want 2010", room.Seats[0].Chips)
	}
}

func TestBuildSidePots(t *testing.T) {
	room := newTestRoom(0, 0, 0)
	room.Seats[0].TotalBet = 50
	room.Seats[1].TotalBet = 100
	room.Seats[2].TotalBet = 200
	room.Seats[1].Folded = true

	pots := room.Game.buildSidePots()
	if len(pots) != 3 {
		t.Fatalf("len(pots) = %d, want 3", len(pots))
	}
	if pots[0].Amount != 150 || len(pots[0].Eligible) != 2 {
		t.Fatalf("main pot = %+v, want amount 150 with 2 eligible players", pots[0])
	}
	if pots[1].Amount != 100 || len(pots[1].Eligible) != 1 || pots[1].Eligible[0].ID != "c" {
		t.Fatalf("first side pot = %+v, want amount 100 eligible c", pots[1])
	}
	if pots[2].Amount != 100 || len(pots[2].Eligible) != 1 || pots[2].Eligible[0].ID != "c" {
		t.Fatalf("second side pot = %+v, want amount 100 eligible c", pots[2])
	}
}
