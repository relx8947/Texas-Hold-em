import { useMemo } from 'react'

type Props = {
  code?: string | null
  faceDown?: boolean
  className?: string
}

function parseCard(code: string) {
  const rawRank = code.slice(0, -1)
  const rank = rawRank === 'T' ? '10' : rawRank
  const suit = code.slice(-1)
  const suitMap: Record<string, { symbol: string; color: 'red' | 'black' }> = {
    S: { symbol: '♠', color: 'black' },
    H: { symbol: '♥', color: 'red' },
    D: { symbol: '♦', color: 'red' },
    C: { symbol: '♣', color: 'black' },
  }
  const s = suitMap[suit] ?? { symbol: '?', color: 'black' }
  return { rank, suit, suitSymbol: s.symbol, color: s.color }
}

export function CardView({ code, faceDown, className }: Props) {
  const isDown = faceDown || !code
  const { rank, suit, suitSymbol, color } = useMemo(() => parseCard(code ?? '??'), [code])
  const fg = color === 'red' ? '#d92d20' : '#0b1118'
  const border = '#d0d7de'
  const bg = '#f8fafc'
  const suitAsset: Record<string, string> = {
    S: '/assets/suits/spade.svg',
    H: '/assets/suits/heart.svg',
    D: '/assets/suits/diamond.svg',
    C: '/assets/suits/club.svg',
  }
  const suitSrc = suitAsset[suit] ?? '/assets/suits/spade.svg'

  return (
    <div className={`cardFlip ${isDown ? 'down' : ''} ${className ?? ''}`}>
      <div className="cardInner">
        <div className="cardFace">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
            <defs>
              <linearGradient id="shine" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="rgba(255,255,255,0.55)" />
                <stop offset="0.45" stopColor="rgba(255,255,255,0)" />
                <stop offset="1" stopColor="rgba(255,255,255,0.15)" />
              </linearGradient>
            </defs>
            <rect x="10" y="10" width="280" height="400" rx="26" fill={bg} stroke={border} strokeWidth="6" />
            <path
              d="M30 40 L120 40 C150 40 160 70 190 70 L270 70 L270 80 L190 80 C160 80 150 50 120 50 L30 50 Z"
              fill="url(#shine)"
              opacity="0.55"
            />
            <g fill={fg} fontFamily="system-ui, -apple-system, Segoe UI, sans-serif" fontWeight="900">
              <text x="38" y="70" fontSize="54">
                {rank}
              </text>
              <text x="44" y="115" fontSize="52">
                {suitSymbol}
              </text>
              <text x="262" y="350" fontSize="54" textAnchor="end" transform="rotate(180 262 350)">
                {rank}
              </text>
              <text x="256" y="305" fontSize="52" textAnchor="end" transform="rotate(180 256 305)">
                {suitSymbol}
              </text>
            </g>
            <image href={suitSrc} x="90" y="160" width="120" height="120" />
          </svg>
        </div>
        <div className="cardBackSide" />
      </div>
    </div>
  )
}
