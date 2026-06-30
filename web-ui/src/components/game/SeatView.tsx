import type { PublicPlayer } from '../../protocol'
import { PlayerAvatar } from '../PlayerAvatar'
import { CardView } from './CardView'

type Props = {
  player: PublicPlayer | null
  label: string
  x: number
  y: number
  compact?: boolean
  cards?: { code: string | null; faceDown: boolean }[]
  bubble?: string | null
  foldHighlight?: boolean
  recentFoldName?: string | null
  isHost?: boolean
  canKick?: boolean
  onOpenActions?: (player: PublicPlayer) => void
}

export function SeatView({
  player,
  label,
  x,
  y,
  compact,
  cards,
  bubble,
  foldHighlight,
  recentFoldName,
  isHost,
  canKick,
  onOpenActions,
}: Props) {
  const classes = ['seat']
  if (player?.current) classes.push('current')
  if (player?.folded) classes.push('folded')
  if (foldHighlight) classes.push('foldFlash')
  if (compact) classes.push('compact')
  if (canKick) classes.push('interactive')
  const emptySeatLabel = label.replace('座位 ', '')

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
      {player?.folded ? <div className="foldBanner">本轮已弃牌</div> : null}
      {foldHighlight && recentFoldName ? <div className="foldBurst">× {recentFoldName} 弃牌</div> : null}
      {player && canKick ? (
        <button className="seatKick" onClick={() => onOpenActions?.(player)}>
          踢人
        </button>
      ) : null}
    </div>
  )
}
