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
  youHole?: string[]
  lastEvent?: LastEvent | null
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
  youHole,
  lastEvent,
}: Props) {
  const pos = seatPositions(maxPlayers)
  const bySeat = new Map<number, PublicPlayer>()
  for (const p of players) bySeat.set(p.seat, p)

  return (
    <div className="tableStage">
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
            cards={cards}
            bubble={bubble}
          />
        )
      })}

      <div className="tableOverlay" />
    </div>
  )
}
