import type { PublicPlayer } from '../../protocol'
import { PlayerAvatar } from '../PlayerAvatar'
import { CardView } from './CardView'

type Props = {
  player: PublicPlayer | null
  label: string
  x: number
  y: number
  cards?: { code: string | null; faceDown: boolean }[]
  bubble?: string | null
  isHost?: boolean
  canKick?: boolean
  onKick?: (player: PublicPlayer) => void
  isWinner?: boolean
  turnProgress?: number | null
}

export function SeatView({ player, label, x, y, cards, bubble, isHost, canKick, onKick, isWinner, turnProgress }: Props) {
  const classes = ['seat']
  if (player?.current) classes.push('current')
  if (player?.folded) classes.push('folded')
  if (isWinner) classes.push('winner')
  const emptySeatLabel = label.replace('座位 ', '')
  const showTimer = !!player?.current && typeof turnProgress === 'number'
  const urgent = showTimer && (turnProgress ?? 1) <= 0.25

  return (
    <div className={classes.join(' ')} style={{ left: `${x}%`, top: `${y}%` }}>
      {bubble ? <div className="actionBubble">{bubble}</div> : null}

      {cards && cards.length > 0 ? (
        <div className="seatCards">
          {cards.slice(0, 2).map((c, idx) => (
            <CardView key={`${idx}-${c.code ?? 'back'}-${c.faceDown ? 'd' : 'u'}`} code={c.code} faceDown={c.faceDown} />
          ))}
        </div>
      ) : null}

      <div className="seatMain">
        <div className="avatarRing">
          {showTimer ? (
            <div
              className={`turnTimer ${urgent ? 'urgent' : ''}`}
              style={{ ['--turn-progress' as string]: String(turnProgress) }}
            />
          ) : null}
          <PlayerAvatar
            seed={player?.avatarSeed ?? label}
            name={player?.name ?? emptySeatLabel}
            label={player ? label : emptySeatLabel}
            showMonogram={false}
          />
          {player && isHost ? <div className="hostBadge">房主</div> : null}
          {player?.dealer && <div className="dealerBadge">D</div>}
        </div>
        
        <div className="seatInfo">
          <div className="namePill">{player ? player.name : label}</div>
          {player ? (
            <div className="chipsPill">
              <span className="chipIcon">●</span>
              {player.chips}
            </div>
          ) : (
             <div className="chipsPill empty">空座</div>
          )}
        </div>
      </div>

      {player && (
        <div className="seatStatus">
           {player.betRound > 0 ? <div className="betTag">+{player.betRound}</div> : null}
           {!player.connected ? <div className="statusTag off">离线</div> : null}
           {player.sittingOut ? <div className="statusTag out">离座</div> : null}
           {player.allIn ? <div className="statusTag allin">All-In</div> : null}
           {player.folded ? <div className="statusTag fold">弃牌</div> : null}
        </div>
      )}
      {player && canKick ? (
        <button className="seatKick" onClick={() => onKick?.(player)}>
          踢人
        </button>
      ) : null}
    </div>
  )
}
