import { useState } from 'react'
import './game.css'
import type { LastEvent, PublicPlayer } from '../../protocol'
import { CardView } from './CardView'
import { SeatView } from './SeatView'

type Props = {
  maxPlayers: number
  players: PublicPlayer[]
  community: string[]
  pot: number
  stage: string
  youSeat?: number
  youId?: string
  youHole?: string[]
  lastEvent?: LastEvent | null
  onOpenSeatActions?: (player: PublicPlayer) => void
  hostId?: string
}

function seatPositions(maxPlayers: number, compact = false) {
  const positions: { x: number; y: number }[] = []
  const cx = 50
  const cy = compact ? 54 : 52
  const rx = compact ? 42 : 44
  const ry = compact ? 31 : 34

  for (let i = 0; i < maxPlayers; i++) {
    const t = (Math.PI * 2 * i) / maxPlayers
    const angle = t + Math.PI / 2
    const x = cx + Math.cos(angle) * rx
    const y = cy + Math.sin(angle) * ry
    positions.push({ x, y })
  }

  return positions
}

function rotateSeatIndex(seat: number, youSeat: number, maxPlayers: number) {
  return (seat - youSeat + maxPlayers) % maxPlayers
}

export function TableScene({
  maxPlayers,
  players,
  community,
  pot,
  stage,
  youSeat,
  youId,
  youHole,
  lastEvent,
  onOpenSeatActions,
  hostId,
}: Props) {
  const [dismissedFoldKey, setDismissedFoldKey] = useState<string | null>(null)

  const compactTable = maxPlayers >= 6
  const pos = seatPositions(maxPlayers, compactTable)
  const bySeat = new Map<number, PublicPlayer>()
  for (const p of players) bySeat.set(p.seat, p)
  const activeFoldEvent =
    lastEvent?.kind === 'action' && lastEvent.action === 'fold' && lastEvent.seat !== undefined
      ? {
          seat: lastEvent.seat,
          name: players.find((player) => player.seat === lastEvent.seat)?.name ?? null,
          key: `${lastEvent.playerId ?? 'seat'}-${lastEvent.seat}`,
        }
      : null
  const showFoldFeedback = !!activeFoldEvent && activeFoldEvent.key !== dismissedFoldKey

  return (
    <div className="tableStage">
      <div className="tableCenter">
        {activeFoldEvent && showFoldFeedback ? (
          <div
            className="tableNotice fold"
            key={`fold-${activeFoldEvent.key}`}
            onAnimationEnd={() => setDismissedFoldKey(activeFoldEvent.key)}
          >
            <span className="tableNoticeLabel">弃牌</span>
            <span className="tableNoticeText">
              {activeFoldEvent.name ? `${activeFoldEvent.name} 已弃牌` : `座位 ${activeFoldEvent.seat + 1} 已弃牌`}
            </span>
          </div>
        ) : null}
        <div className="communityRow">
          {Array.from({ length: 5 }).map((_, idx) => (
            community[idx] ? (
              <CardView key={`${idx}-${community[idx]}`} code={community[idx]} faceDown={false} />
            ) : (
               <div key={`empty-${idx}`} className="cardSlot" />
            )
          ))}
        </div>
        <div className="potRow">
          <div key={`pot-${pot}`} className="potChip">
            底池 {pot}
          </div>
        </div>
      </div>

      {Array.from({ length: maxPlayers }).map((_, logicalIndex) => {
        const seatIndex =
          youSeat === undefined ? logicalIndex : (logicalIndex + youSeat) % maxPlayers
        const player = bySeat.get(seatIndex) ?? null
        const displayIndex =
          youSeat === undefined ? seatIndex : rotateSeatIndex(seatIndex, youSeat, maxPlayers)
        const p = pos[displayIndex]
        const isInHand = stage !== 'waiting'
        const isYou = youSeat !== undefined && seatIndex === youSeat
        const showBacks =
          isInHand && player && !player.folded && player.connected && !player.sittingOut
        let bubble: string | null = null
        if (lastEvent && lastEvent.seat === seatIndex) {
          switch (lastEvent.kind) {
            case 'action': {
              if (lastEvent.action === 'fold') bubble = '弃牌'
              else if (lastEvent.action === 'check') bubble = '过牌'
              else if (lastEvent.action === 'call') bubble = '跟注'
              else if (lastEvent.action === 'bet') bubble = `下注 ${lastEvent.amount ?? 0}`
              else if (lastEvent.action === 'raise') bubble = `加注到 ${lastEvent.amount ?? 0}`
              else bubble = lastEvent.action ?? '行动'
              break
            }
            case 'top_up':
              bubble = `补码 +${lastEvent.amount ?? 0}`
              break
            case 'sit_out':
              bubble = '离座'
              break
            case 'sit_in':
              bubble = '回座'
              break
            default:
              bubble = null
          }
        }
        const cards = isInHand
          ? isYou
            ? (youHole ?? []).slice(0, 2).map((code) => ({ code, faceDown: false }))
            : showBacks
              ? [
                  { code: null, faceDown: true },
                  { code: null, faceDown: true },
                ]
              : []
          : []
        return (
          <SeatView
            key={seatIndex}
            player={player}
            label={`座位 ${seatIndex + 1}`}
            x={p.x}
            y={p.y}
            compact={compactTable}
            cards={cards}
            bubble={bubble}
            foldHighlight={showFoldFeedback && activeFoldEvent?.seat === seatIndex}
            recentFoldName={
              showFoldFeedback && activeFoldEvent?.seat === seatIndex
                ? (player?.name ?? `座位 ${seatIndex + 1}`)
                : null
            }
            isHost={!!player && player.id === hostId}
            canKick={!!player && hostId === youId && player.id !== youId}
            onOpenActions={onOpenSeatActions}
          />
        )
      })}

      <div className="tableOverlay" />
    </div>
  )
}
