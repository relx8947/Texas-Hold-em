package main

import (
	"fmt"
	"sort"
)

type Card struct {
	Rank int
	Suit int
}

func newDeck() []Card {
	deck := make([]Card, 0, 52)
	for suit := 0; suit < 4; suit++ {
		for rank := 2; rank <= 14; rank++ {
			deck = append(deck, Card{Rank: rank, Suit: suit})
		}
	}
	return deck
}

func (c Card) String() string {
	ranks := map[int]string{
		2:  "2",
		3:  "3",
		4:  "4",
		5:  "5",
		6:  "6",
		7:  "7",
		8:  "8",
		9:  "9",
		10: "T",
		11: "J",
		12: "Q",
		13: "K",
		14: "A",
	}
	suits := map[int]string{0: "S", 1: "H", 2: "D", 3: "C"}
	return fmt.Sprintf("%s%s", ranks[c.Rank], suits[c.Suit])
}

func cardsToString(cards []Card) []string {
	out := make([]string, len(cards))
	for i, c := range cards {
		out[i] = c.String()
	}
	return out
}

type HandValue struct {
	Category int
	Ranks    []int
}

func (h HandValue) String() string {
	return fmt.Sprintf("%s %v", h.CategoryName(), h.Ranks)
}

func (h HandValue) CategoryName() string {
	switch h.Category {
	case 8:
		return "同花顺"
	case 7:
		return "四条"
	case 6:
		return "葫芦"
	case 5:
		return "同花"
	case 4:
		return "顺子"
	case 3:
		return "三条"
	case 2:
		return "两对"
	case 1:
		return "一对"
	default:
		return "高牌"
	}
}

func compareHand(a, b HandValue) int {
	if a.Category != b.Category {
		if a.Category > b.Category {
			return 1
		}
		return -1
	}
	for i := 0; i < len(a.Ranks) && i < len(b.Ranks); i++ {
		if a.Ranks[i] > b.Ranks[i] {
			return 1
		}
		if a.Ranks[i] < b.Ranks[i] {
			return -1
		}
	}
	return 0
}

func evaluate7(cards []Card) HandValue {
	best := HandValue{Category: -1}
	n := len(cards)
	for i := 0; i < n-4; i++ {
		for j := i + 1; j < n-3; j++ {
			for k := j + 1; k < n-2; k++ {
				for l := k + 1; l < n-1; l++ {
					for m := l + 1; m < n; m++ {
						value := evaluate5([]Card{cards[i], cards[j], cards[k], cards[l], cards[m]})
						if compareHand(value, best) > 0 {
							best = value
						}
					}
				}
			}
		}
	}
	return best
}

func evaluate5(cards []Card) HandValue {
	ranks := make([]int, 5)
	suits := make([]int, 5)
	for i, c := range cards {
		ranks[i] = c.Rank
		suits[i] = c.Suit
	}
	sort.Slice(ranks, func(i, j int) bool { return ranks[i] > ranks[j] })

	isFlush := true
	for i := 1; i < 5; i++ {
		if suits[i] != suits[0] {
			isFlush = false
			break
		}
	}

	uniqueRanks := uniqueSortedRanks(ranks)
	isStraight, straightHigh := checkStraight(uniqueRanks)

	counts := make(map[int]int)
	for _, r := range ranks {
		counts[r]++
	}
	pairs := []int{}
	trips := []int{}
	quads := []int{}
	singles := []int{}
	for rank, count := range counts {
		switch count {
		case 4:
			quads = append(quads, rank)
		case 3:
			trips = append(trips, rank)
		case 2:
			pairs = append(pairs, rank)
		default:
			singles = append(singles, rank)
		}
	}
	sort.Slice(pairs, func(i, j int) bool { return pairs[i] > pairs[j] })
	sort.Slice(trips, func(i, j int) bool { return trips[i] > trips[j] })
	sort.Slice(quads, func(i, j int) bool { return quads[i] > quads[j] })
	sort.Slice(singles, func(i, j int) bool { return singles[i] > singles[j] })

	if isStraight && isFlush {
		return HandValue{Category: 8, Ranks: []int{straightHigh}}
	}
	if len(quads) == 1 {
		kicker := highestExcluding(ranks, quads[0])
		return HandValue{Category: 7, Ranks: []int{quads[0], kicker}}
	}
	if len(trips) == 1 && len(pairs) == 1 {
		return HandValue{Category: 6, Ranks: []int{trips[0], pairs[0]}}
	}
	if isFlush {
		return HandValue{Category: 5, Ranks: ranks}
	}
	if isStraight {
		return HandValue{Category: 4, Ranks: []int{straightHigh}}
	}
	if len(trips) == 1 {
		kickers := highestNExcluding(ranks, []int{trips[0]}, 2)
		return HandValue{Category: 3, Ranks: append([]int{trips[0]}, kickers...)}
	}
	if len(pairs) >= 2 {
		highPair := pairs[0]
		lowPair := pairs[1]
		kicker := highestExcluding(ranks, highPair, lowPair)
		return HandValue{Category: 2, Ranks: []int{highPair, lowPair, kicker}}
	}
	if len(pairs) == 1 {
		kickers := highestNExcluding(ranks, []int{pairs[0]}, 3)
		return HandValue{Category: 1, Ranks: append([]int{pairs[0]}, kickers...)}
	}
	return HandValue{Category: 0, Ranks: ranks}
}

func uniqueSortedRanks(ranks []int) []int {
	seen := map[int]bool{}
	unique := []int{}
	for _, r := range ranks {
		if !seen[r] {
			seen[r] = true
			unique = append(unique, r)
		}
	}
	sort.Slice(unique, func(i, j int) bool { return unique[i] > unique[j] })
	return unique
}

func checkStraight(unique []int) (bool, int) {
	if len(unique) < 5 {
		return false, 0
	}
	for i := 0; i <= len(unique)-5; i++ {
		ok := true
		for j := 0; j < 4; j++ {
			if unique[i+j]-1 != unique[i+j+1] {
				ok = false
				break
			}
		}
		if ok {
			return true, unique[i]
		}
	}
	// wheel straight A-2-3-4-5
	hasAce := false
	needed := map[int]bool{5: false, 4: false, 3: false, 2: false}
	for _, r := range unique {
		if r == 14 {
			hasAce = true
		}
		if _, ok := needed[r]; ok {
			needed[r] = true
		}
	}
	if hasAce {
		for _, ok := range needed {
			if !ok {
				return false, 0
			}
		}
		return true, 5
	}
	return false, 0
}

func highestExcluding(ranks []int, exclude ...int) int {
	ex := map[int]bool{}
	for _, r := range exclude {
		ex[r] = true
	}
	for _, r := range ranks {
		if !ex[r] {
			return r
		}
	}
	return 0
}

func highestNExcluding(ranks []int, exclude []int, n int) []int {
	ex := map[int]bool{}
	for _, r := range exclude {
		ex[r] = true
	}
	out := []int{}
	for _, r := range ranks {
		if !ex[r] {
			out = append(out, r)
			if len(out) == n {
				break
			}
		}
	}
	return out
}

func bestPlayers(players []*Player, handValues map[string]HandValue) []*Player {
	var best HandValue
	hasBest := false
	winners := []*Player{}
	for _, p := range players {
		value, ok := handValues[p.ID]
		if !ok {
			continue
		}
		if !hasBest || compareHand(value, best) > 0 {
			best = value
			hasBest = true
			winners = []*Player{p}
			continue
		}
		if compareHand(value, best) == 0 {
			winners = append(winners, p)
		}
	}
	return winners
}
