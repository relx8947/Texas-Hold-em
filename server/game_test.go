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

	// Heads-up: the dealer (seat 0) posts the small blind and acts first preflop.
	if room.Game.CurrentIndex != 0 {
		t.Fatalf("heads-up first to act = %d, want 0 (dealer/small blind)", room.Game.CurrentIndex)
	}
	if room.Seats[0].BetRound != room.Game.SmallBlind {
		t.Fatalf("dealer small blind = %d, want %d", room.Seats[0].BetRound, room.Game.SmallBlind)
	}

	if err := room.Game.ApplyAction(room.Seats[0].ID, PlayerAction{Action: "fold"}); err != nil {
		t.Fatalf("ApplyAction(fold) error = %v", err)
	}

	if room.Game.Stage != "waiting" {
		t.Fatalf("stage = %q, want waiting", room.Game.Stage)
	}
	if room.Game.Pot != 0 {
		t.Fatalf("pot = %d, want 0", room.Game.Pot)
	}
	if room.Seats[1].Chips != 2010 {
		t.Fatalf("winner chips = %d, want 2010", room.Seats[1].Chips)
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

// TestRefundUncalledBets guards the critical bug where an over-bet that all
// other players folded to would create a side pot with no eligible winner,
// causing a division-by-zero panic at showdown.
func TestRefundUncalledBets(t *testing.T) {
	room := newTestRoom(0, 0)
	room.Game.Pot = 250
	room.Seats[0].TotalBet = 200 // raiser, others folded
	room.Seats[0].Chips = 0
	room.Seats[1].TotalBet = 50
	room.Seats[1].Folded = true

	room.Game.refundUncalledBets()

	if room.Seats[0].Chips != 150 {
		t.Fatalf("raiser chips after refund = %d, want 150", room.Seats[0].Chips)
	}
	if room.Seats[0].TotalBet != 50 {
		t.Fatalf("raiser totalBet after refund = %d, want 50", room.Seats[0].TotalBet)
	}
	if room.Game.Pot != 100 {
		t.Fatalf("pot after refund = %d, want 100", room.Game.Pot)
	}
}

// TestResolveShowdownNoPanicOnUncalledAllIn ensures resolveShowdown completes
// (no panic, returns to waiting) when the sole remaining contributor over-bet.
func TestResolveShowdownNoPanicOnUncalledAllIn(t *testing.T) {
	room := newTestRoom(0, 0, 0)
	room.Game.Stage = "river"
	room.Game.Pot = 300
	room.Game.Community = []Card{{Rank: 2, Suit: 0}, {Rank: 5, Suit: 1}, {Rank: 9, Suit: 2}, {Rank: 11, Suit: 3}, {Rank: 13, Suit: 0}}
	// Seat 0 over-bet, seats 1 and 2 folded after contributing less.
	room.Seats[0].TotalBet = 200
	room.Seats[0].Hole = []Card{{Rank: 14, Suit: 0}, {Rank: 14, Suit: 1}}
	room.Seats[1].TotalBet = 50
	room.Seats[1].Folded = true
	room.Seats[2].TotalBet = 50
	room.Seats[2].Folded = true

	room.Game.resolveShowdown()

	if room.Game.Stage != "waiting" {
		t.Fatalf("stage after showdown = %q, want waiting", room.Game.Stage)
	}
}
