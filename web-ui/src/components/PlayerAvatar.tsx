import type { CSSProperties } from 'react'

type PlayerAvatarProps = {
  seed: string
  name?: string
  label?: string
  className?: string
  showMonogram?: boolean
}

function seedHash(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return hash
}

function getAvatarInitial(name?: string, label?: string) {
  const text = (name || label || '玩家').trim()
  const latinMatch = text.match(/[A-Za-z0-9]/)
  if (latinMatch) return latinMatch[0].toUpperCase()
  return text[0] ?? '玩'
}

export function PlayerAvatar({ seed, name, label, className = '', showMonogram = true }: PlayerAvatarProps) {
  const hash = seedHash(seed || name || label || 'player')
  const initial = getAvatarInitial(name, label)
  const palettes = [
    { base: '#0f766e', edge: '#134e4a', accent: '#f6c453', ink: '#f8f2df', soft: '#5eead4' },
    { base: '#1d4ed8', edge: '#172554', accent: '#f3b23c', ink: '#f8f4eb', soft: '#93c5fd' },
    { base: '#b91c1c', edge: '#4c0519', accent: '#f7d27a', ink: '#fff4e6', soft: '#fca5a5' },
    { base: '#6d28d9', edge: '#312e81', accent: '#ffd166', ink: '#faf5ff', soft: '#c4b5fd' },
    { base: '#b45309', edge: '#451a03', accent: '#ffe29a', ink: '#fff7ed', soft: '#fdba74' },
    { base: '#166534', edge: '#14532d', accent: '#f4ce64', ink: '#f7fee7', soft: '#86efac' },
  ]
  const palette = palettes[hash % palettes.length]
  const suitSymbols = ['♠', '♥', '♣', '♦'] as const
  const suit = suitSymbols[(hash >> 3) % suitSymbols.length]
  const stripeOffset = 18 + (hash % 10)
  const bandHeight = 12 + ((hash >> 5) % 6)
  const orbitRadius = 17 + ((hash >> 7) % 4)
  const style = {
    '--avatar-base': palette.base,
    '--avatar-edge': palette.edge,
    '--avatar-accent': palette.accent,
    '--avatar-ink': palette.ink,
    '--avatar-soft': palette.soft,
    '--avatar-angle': `${hash % 360}deg`,
  } as CSSProperties

  return (
    <div className={`playerAvatar ${className}`} style={style} aria-label={`${name || label || '玩家'} 头像`}>
      <svg className="playerAvatarIcon" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id={`avatarBg-${hash}`} x1="10" x2="54" y1="4" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--avatar-base)" />
            <stop offset="1" stopColor="var(--avatar-edge)" />
          </linearGradient>
          <linearGradient id={`avatarBand-${hash}`} x1="18" x2="54" y1="14" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgba(255,255,255,0.28)" />
            <stop offset="1" stopColor="rgba(255,255,255,0.02)" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="30" fill={`url(#avatarBg-${hash})`} />
        <path
          d={`M-8 ${stripeOffset}C8 ${stripeOffset - 8} 18 ${stripeOffset + 9} 32 ${stripeOffset + 3}S56 ${stripeOffset - 7} 72 ${stripeOffset + 8}V72H-8Z`}
          fill={`url(#avatarBand-${hash})`}
        />
        <circle cx="46" cy="17" r="9" fill="rgba(255,255,255,0.12)" />
        <circle
          cx="32"
          cy="32"
          r={orbitRadius}
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="1.5"
          strokeDasharray="2.4 4.6"
        />
        {showMonogram ? (
          <>
            <rect x="15" y={42 - bandHeight / 2} width="34" height={bandHeight} rx={bandHeight / 2} fill="rgba(0,0,0,0.12)" />
            <text
              x="32"
              y="37"
              textAnchor="middle"
              fill="var(--avatar-ink)"
              fontSize={initial.length > 1 ? 20 : 24}
              fontWeight="800"
              letterSpacing={initial.length > 1 ? 0.5 : 0}
              fontFamily="inherit"
            >
              {initial}
            </text>
          </>
        ) : null}
        <circle cx="49" cy="49" r="8.5" fill="var(--avatar-accent)" stroke="rgba(255,255,255,0.78)" strokeWidth="2" />
        <text
          x="49"
          y="52"
          textAnchor="middle"
          fill={suit === '♥' || suit === '♦' ? '#a8151a' : '#213547'}
          fontSize="11"
          fontWeight="800"
          fontFamily="inherit"
        >
          {suit}
        </text>
      </svg>
    </div>
  )
}
