package main

import (
	"errors"
	"fmt"
	"math/rand"
	"sort"
	"time"
)

type Game struct {
	Room         *Room
	Stage        string
	Deck         []Card
	Community    []Card
	Pot          int
	DealerIndex  int
	CurrentIndex int
	SmallBlind   int
	BigBlind     int
	MinRaise     int
	CurrentBet   int
	rng          *rand.Rand
}

func NewGame(room *Room) *Game {
	return &Game{
		Room:         room,
		Stage:        "waiting",
		SmallBlind:   10,
		BigBlind:     20,
		DealerIndex:  -1,
		CurrentIndex: -1,
		rng:          rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (g *Game) StartHand() error {
	g.Room.cleanupPendingRemovalsLocked()
	players := g.Room.Seats
	eligible := g.countEligiblePlayers()
	if eligible < 2 {
		return errors.New("需要至少2名有筹码的玩家才能开始")
	}
	g.Room.HandID++
	g.Stage = "preflop"
	g.Deck = newDeck()
	g.shuffle()
	g.Community = nil
	g.Pot = 0
	g.CurrentBet = 0
	g.MinRaise = g.BigBlind

	for _, p := range players {
		if p == nil {
			continue
		}
		p.Hole = nil
		p.Folded = !p.Connected || p.Chips <= 0 || p.SittingOut
		p.AllIn = false
		p.BetRound = 0
		p.TotalBet = 0
		p.Acted = false
	}

	g.DealerIndex = g.nextEligibleIndex(g.DealerIndex)
	if g.DealerIndex < 0 {
		return errors.New("没有可用庄家")
	}
	g.Room.LastEvent = &LastEvent{Kind: "hand_start", Stage: g.Stage, Seat: g.DealerIndex}
	smallBlindIndex := g.nextEligibleIndex(g.DealerIndex)
	bigBlindIndex := g.nextEligibleIndex(smallBlindIndex)

	g.dealHoleCards()
	g.postBlind(smallBlindIndex, g.SmallBlind)
	bigPosted := g.postBlind(bigBlindIndex, g.BigBlind)
	g.CurrentBet = bigPosted
	g.MinRaise = g.BigBlind
	g.CurrentIndex = g.nextActionIndex(bigBlindIndex)
	if g.CurrentIndex == -1 {
		g.advanceStageIfNeeded()
	}
	return nil
}

func (g *Game) ApplyAction(playerID string, action PlayerAction) error {
	if g.Stage == "waiting" {
		return errors.New("当前没有进行中的牌局")
	}
	idx, p := g.Room.findPlayer(playerID)
	if p == nil {
		return errors.New("玩家不存在")
	}
	if idx != g.CurrentIndex {
		return errors.New("还未轮到你行动")
	}
	if p.Folded || p.AllIn {
		return errors.New("无法行动")
	}
	if p.SittingOut {
		return errors.New("你已离座")
	}

	switch action.Action {
	case "fold":
		p.Folded = true
		p.Acted = true
	case "check":
		if g.CurrentBet != p.BetRound {
			return errors.New("当前不能过牌")
		}
		p.Acted = true
	case "call":
		g.handleCall(p)
	case "bet":
		if g.CurrentBet > 0 {
			return errors.New("当前不能下注，只能跟注或加注")
		}
		if action.Amount <= 0 {
			return errors.New("下注金额无效")
		}
		if action.Amount < g.MinRaise {
			return fmt.Errorf("下注金额至少为%d", g.MinRaise)
		}
		if action.Amount > p.Chips {
			return errors.New("筹码不足")
		}
		g.placeBet(p, action.Amount, true)
	case "raise":
		if g.CurrentBet == 0 {
			return errors.New("当前请使用下注")
		}
		if action.Amount <= g.CurrentBet {
			g.handleCall(p)
			break
		}
		if action.Amount > p.Chips+p.BetRound {
			return errors.New("筹码不足")
		}
		raiseSize := action.Amount - g.CurrentBet
		if raiseSize < g.MinRaise {
			return fmt.Errorf("加注幅度至少为%d", g.MinRaise)
		}
		g.placeBet(p, action.Amount-p.BetRound, true)
	default:
		return errors.New("未知操作")
	}
	g.Room.LastEvent = &LastEvent{Kind: "action", PlayerID: playerID, Action: action.Action, Amount: action.Amount, Stage: g.Stage, Seat: idx}

	if g.onlyOneActivePlayer() {
		g.awardPotToSingle()
		return nil
	}

	if g.isBettingRoundComplete() {
		g.advanceStageIfNeeded()
		return nil
	}

	g.CurrentIndex = g.nextActionIndex(g.CurrentIndex)
	if g.CurrentIndex == -1 {
		g.advanceStageIfNeeded()
	}
	return nil
}

func (g *Game) ForceFold(playerID string) {
	if g.Stage == "waiting" {
		return
	}
	idx, p := g.Room.findPlayer(playerID)
	if p == nil || p.Folded {
		return
	}
	p.Folded = true
	p.Acted = true

	if g.onlyOneActivePlayer() {
		g.awardPotToSingle()
		return
	}

	if g.isBettingRoundComplete() {
		g.advanceStageIfNeeded()
		return
	}

	if idx == g.CurrentIndex {
		g.CurrentIndex = g.nextActionIndex(g.CurrentIndex)
		if g.CurrentIndex == -1 {
			g.advanceStageIfNeeded()
		}
	}
}

func (g *Game) handleCall(p *Player) {
	need := g.CurrentBet - p.BetRound
	if need <= 0 {
		p.Acted = true
		return
	}
	if need >= p.Chips {
		need = p.Chips
		p.AllIn = true
	}
	g.placeBet(p, need, false)
	p.Acted = true
}

func (g *Game) placeBet(p *Player, amount int, isAggressive bool) {
	if amount <= 0 {
		return
	}
	p.Chips -= amount
	p.BetRound += amount
	p.TotalBet += amount
	g.Pot += amount

	if isAggressive {
		raiseSize := p.BetRound - g.CurrentBet
		g.CurrentBet = p.BetRound
		if raiseSize > 0 {
			g.MinRaise = raiseSize
		}
		for _, other := range g.Room.Seats {
			if other == nil || other.Folded || other.AllIn {
				continue
			}
			other.Acted = false
		}
		p.Acted = true
		if p.Chips == 0 {
			p.AllIn = true
		}
	}
}

func (g *Game) advanceStageIfNeeded() {
	if g.onlyOneActivePlayer() {
		g.awardPotToSingle()
		return
	}

	switch g.Stage {
	case "preflop":
		g.Community = append(g.Community, g.dealCard(), g.dealCard(), g.dealCard())
		g.Stage = "flop"
		g.Room.LastEvent = &LastEvent{Kind: "stage", Stage: g.Stage}
	case "flop":
		g.Community = append(g.Community, g.dealCard())
		g.Stage = "turn"
		g.Room.LastEvent = &LastEvent{Kind: "stage", Stage: g.Stage}
	case "turn":
		g.Community = append(g.Community, g.dealCard())
		g.Stage = "river"
		g.Room.LastEvent = &LastEvent{Kind: "stage", Stage: g.Stage}
	case "river":
		g.resolveShowdown()
		return
	}
	g.resetBettingRound()
	g.autoRunoutIfNeeded()
}

func (g *Game) resetBettingRound() {
	g.CurrentBet = 0
	g.MinRaise = g.BigBlind
	for _, p := range g.Room.Seats {
		if p == nil {
			continue
		}
		p.BetRound = 0
		p.Acted = false
	}
	g.CurrentIndex = g.nextActionIndex(g.DealerIndex)
}

func (g *Game) autoRunoutIfNeeded() {
	if g.nextActionIndex(g.DealerIndex) != -1 {
		return
	}
	for g.Stage != "waiting" && g.Stage != "river" {
		switch g.Stage {
		case "flop":
			g.Community = append(g.Community, g.dealCard())
			g.Stage = "turn"
			g.Room.LastEvent = &LastEvent{Kind: "stage", Stage: g.Stage}
		case "turn":
			g.Community = append(g.Community, g.dealCard())
			g.Stage = "river"
			g.Room.LastEvent = &LastEvent{Kind: "stage", Stage: g.Stage}
		default:
			return
		}
	}
	if g.Stage == "river" {
		g.resolveShowdown()
	}
}

func (g *Game) resolveShowdown() {
	eligible := g.listNotFolded()
	if len(eligible) == 0 {
		g.Stage = "waiting"
		return
	}
	g.Room.LastEvent = &LastEvent{Kind: "showdown", Stage: g.Stage}

	handValues := map[string]HandValue{}
	for _, p := range eligible {
		handValues[p.ID] = evaluate7(append(append([]Card{}, p.Hole...), g.Community...))
	}

	pots := g.buildSidePots()
	results := []ShowdownResult{}
	for _, pot := range pots {
		winners := bestPlayers(pot.Eligible, handValues)
		share := pot.Amount / len(winners)
		remain := pot.Amount % len(winners)
		winnerInfos := []ShowdownWinner{}
		for i, w := range winners {
			win := share
			if i < remain {
				win++
			}
			w.Chips += win
			winnerInfos = append(winnerInfos, ShowdownWinner{
				ID:       w.ID,
				Name:     w.Name,
				ChipsWon: win,
			})
		}
		results = append(results, ShowdownResult{
			PotAmount: pot.Amount,
			Winners:   winnerInfos,
		})
	}

	g.Room.broadcastShowdown(ShowdownPayload{
		Community: cardsToString(g.Community),
		Players:   g.buildShowdownPlayers(handValues),
		Results:   results,
	})

	g.Stage = "waiting"
	g.CurrentBet = 0
	g.MinRaise = g.BigBlind
	g.Pot = 0
	g.Community = nil
	for _, p := range g.Room.Seats {
		if p == nil {
			continue
		}
		p.Hole = nil
		p.BetRound = 0
		p.TotalBet = 0
		p.Acted = false
		p.Folded = !p.Connected || p.Chips <= 0 || p.SittingOut
		p.AllIn = false
	}
	g.Room.onHandEndedLocked()
}

func (g *Game) buildShowdownPlayers(handValues map[string]HandValue) []ShowdownPlayer {
	players := []ShowdownPlayer{}
	for _, p := range g.Room.Seats {
		if p == nil {
			continue
		}
		value, ok := handValues[p.ID]
		if !ok {
			continue
		}
		players = append(players, ShowdownPlayer{
			ID:    p.ID,
			Name:  p.Name,
			Hole:  cardsToString(p.Hole),
			Rank:  value.CategoryName(),
			Value: value.String(),
		})
	}
	return players
}

func (g *Game) buildSidePots() []SidePot {
	type entry struct {
		player *Player
		amount int
	}
	entries := []entry{}
	for _, p := range g.Room.Seats {
		if p == nil || p.TotalBet == 0 {
			continue
		}
		entries = append(entries, entry{player: p, amount: p.TotalBet})
	}
	if len(entries) == 0 {
		return nil
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].amount < entries[j].amount })

	var pots []SidePot
	prev := 0
	for i, entry := range entries {
		level := entry.amount
		if level == prev {
			continue
		}
		count := 0
		eligible := []*Player{}
		for _, e := range entries {
			if e.amount >= level {
				count++
				if !e.player.Folded {
					eligible = append(eligible, e.player)
				}
			}
		}
		potAmount := (level - prev) * count
		if potAmount > 0 {
			pots = append(pots, SidePot{
				Amount:   potAmount,
				Eligible: eligible,
			})
		}
		prev = level
		if i == len(entries)-1 {
			break
		}
	}
	return pots
}

func (g *Game) awardPotToSingle() {
	winner := g.singleActivePlayer()
	if winner == nil {
		g.Stage = "waiting"
		return
	}
	pot := g.Pot
	winner.Chips += pot
	g.Pot = 0
	g.Room.LastEvent = &LastEvent{Kind: "win", PlayerID: winner.ID, Amount: pot}
	g.Room.broadcastInfo(fmt.Sprintf("%s 赢得了底池", winner.Name))
	g.Stage = "waiting"
	for _, p := range g.Room.Seats {
		if p == nil {
			continue
		}
		p.Hole = nil
		p.BetRound = 0
		p.TotalBet = 0
		p.Acted = false
		p.AllIn = false
		p.Folded = !p.Connected || p.Chips <= 0 || p.SittingOut
	}
	g.Room.onHandEndedLocked()
}

func (g *Game) dealHoleCards() {
	for i := 0; i < 2; i++ {
		for _, p := range g.Room.Seats {
			if p == nil || p.Folded {
				continue
			}
			p.Hole = append(p.Hole, g.dealCard())
		}
	}
}

func (g *Game) dealCard() Card {
	card := g.Deck[0]
	g.Deck = g.Deck[1:]
	return card
}

func (g *Game) shuffle() {
	g.rng.Shuffle(len(g.Deck), func(i, j int) {
		g.Deck[i], g.Deck[j] = g.Deck[j], g.Deck[i]
	})
}

func (g *Game) postBlind(index int, amount int) int {
	if index < 0 {
		return 0
	}
	p := g.Room.Seats[index]
	if p == nil || p.Folded {
		return 0
	}
	if amount >= p.Chips {
		amount = p.Chips
		p.AllIn = true
	}
	p.Chips -= amount
	p.BetRound += amount
	p.TotalBet += amount
	g.Pot += amount
	return amount
}

func (g *Game) isBettingRoundComplete() bool {
	for _, p := range g.Room.Seats {
		if p == nil || p.Folded || p.AllIn {
			continue
		}
		if !p.Acted {
			return false
		}
		if p.BetRound != g.CurrentBet {
			return false
		}
	}
	return true
}

func (g *Game) nextEligibleIndex(start int) int {
	players := g.Room.Seats
	if len(players) == 0 {
		return -1
	}
	for i := 1; i <= len(players); i++ {
		idx := (start + i) % len(players)
		p := players[idx]
		if p != nil && p.Connected && p.Chips > 0 && !p.SittingOut && !p.PendingRemoval {
			return idx
		}
	}
	return -1
}

func (g *Game) nextActionIndex(start int) int {
	players := g.Room.Seats
	if len(players) == 0 {
		return -1
	}
	for i := 1; i <= len(players); i++ {
		idx := (start + i) % len(players)
		p := players[idx]
		if p == nil || p.Folded || p.AllIn || p.SittingOut {
			continue
		}
		return idx
	}
	return -1
}

func (g *Game) countEligiblePlayers() int {
	count := 0
	for _, p := range g.Room.Seats {
		if p != nil && p.Connected && p.Chips > 0 && !p.SittingOut && !p.PendingRemoval {
			count++
		}
	}
	return count
}

func (g *Game) onlyOneActivePlayer() bool {
	return g.singleActivePlayer() != nil
}

func (g *Game) singleActivePlayer() *Player {
	var winner *Player
	for _, p := range g.Room.Seats {
		if p == nil || p.Folded {
			continue
		}
		if winner != nil {
			return nil
		}
		winner = p
	}
	return winner
}

func (g *Game) listNotFolded() []*Player {
	players := []*Player{}
	for _, p := range g.Room.Seats {
		if p != nil && !p.Folded {
			players = append(players, p)
		}
	}
	return players
}
