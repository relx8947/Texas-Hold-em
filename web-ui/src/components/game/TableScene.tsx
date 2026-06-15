import { useEffect, useRef, useState } from 'react'
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
  onKickPlayer?: (player: PublicPlayer) => void
  hostId?: string
  actionDeadline?: number
  serverTime?: number
  actionTimeoutMs?: number
}

function stageLabel(stage: string): string | null {
  switch (stage) {
    case 'flop':
      return '翻牌 Flop'
    case 'turn':
      return '转牌 Turn'
    case 'river':
      return '河牌 River'
    default:
      return null
  }
}

function seatPositions(maxPlayers: number) {
  const positions: { x: number; y: number }[] = []
  const cx = 50
  const cy = 52
  const rx = 44
  const ry = 34

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
  onKickPlayer,
  hostId,
  actionDeadline,
  serverTime,
  actionTimeoutMs = 30000,
}: Props) {
  const pos = seatPositions(maxPlayers)
  const bySeat = new Map<number, PublicPlayer>()
  for (const p of players) bySeat.set(p.seat, p)

  // Live countdown progress (0..1) for the active player's timer ring. Correct
  // for client/server clock skew using the serverTime sent with each snapshot.
  const skewRef = useRef(0)
  useEffect(() => {
    if (typeof serverTime === 'number' && serverTime > 0) {
      skewRef.current = Date.now() - serverTime
    }
  }, [serverTime])
  const [turnProgress, setTurnProgress] = useState(1)
  useEffect(() => {
    if (!actionDeadline) {
      // Reset asynchronously to avoid a synchronous setState in the effect body.
      const id = window.setTimeout(() => setTurnProgress(1), 0)
      return () => window.clearTimeout(id)
    }
    let raf = 0
    const tick = () => {
      const now = Date.now() - skewRef.current
      const remaining = actionDeadline - now
      const ratio = Math.max(0, Math.min(1, remaining / actionTimeoutMs))
      setTurnProgress(ratio)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [actionDeadline, actionTimeoutMs])

  // Winner highlight: briefly mark the seat that just won the pot. Set during
  // render keyed on the event, cleared by an async timer.
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [winnerEventKey, setWinnerEventKey] = useState<LastEvent | null>(null)
  const currentEvent = lastEvent ?? null
  if (currentEvent !== winnerEventKey) {
    setWinnerEventKey(currentEvent)
    if (currentEvent?.kind === 'win' && currentEvent.playerId) {
      setWinnerId(currentEvent.playerId)
    }
  }
  useEffect(() => {
    if (!winnerId) return
    const t = window.setTimeout(() => setWinnerId(null), 2400)
    return () => window.clearTimeout(t)
  }, [winnerId])

  // Stage-change toast (flop/turn/river). Set during render keyed on stage,
  // cleared by an async timer.
  const [toast, setToast] = useState<string | null>(null)
  const [toastStageKey, setToastStageKey] = useState(stage)
  if (stage !== toastStageKey) {
    setToastStageKey(stage)
    setToast(stageLabel(stage))
  }
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1600)
    return () => window.clearTimeout(t)
  }, [toast])

  return (
    <div className="tableStage">
      {toast ? <div key={toast} className="stageToast">{toast}</div> : null}
      <div className="tableCenter">
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
          <div key={`pot-${pot}`} className="potChip bump">
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
            cards={cards}
            bubble={bubble}
            isHost={!!player && player.id === hostId}
            canKick={!!player && hostId === youId && player.id !== youId}
            onKick={onKickPlayer}
            isWinner={!!player && player.id === winnerId}
            turnProgress={player?.current ? turnProgress : null}
          />
        )
      })}

      <div className="tableOverlay" />
    </div>
  )
}
