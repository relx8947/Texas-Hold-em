import type { PublicPlayer } from '../../protocol'
import { CardView } from './CardView'

type Props = {
  player: PublicPlayer | null
  label: string
  x: number
  y: number
  cards?: { code: string | null; faceDown: boolean }[]
  bubble?: string | null
}

export function SeatView({ player, label, x, y, cards, bubble }: Props) {
  const classes = ['seat']
  if (player?.current) classes.push('current')
  if (player?.folded) classes.push('folded')
  
  // 生成简单的头像颜色和首字母
  const initial = player ? player.name.slice(0, 1).toUpperCase() : label.replace('座位 ', '')
  const colorIndex = player ? (player.name.charCodeAt(0) % 5) : 5
  const avatarColors = [
    'linear-gradient(135deg, #FF6B6B, #EE5253)',
    'linear-gradient(135deg, #48DBFB, #0ABDE3)',
    'linear-gradient(135deg, #1DD1A1, #10AC84)',
    'linear-gradient(135deg, #FECA57, #FF9F43)',
    'linear-gradient(135deg, #5F27CD, #341F97)',
    'linear-gradient(135deg, #576574, #222f3e)', // 空座颜色
  ]

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
          <div className="avatar" style={{ background: avatarColors[colorIndex] }}>
            {initial}
          </div>
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
    </div>
  )
}
