import type { CSSProperties } from 'react'

type PlayerAvatarProps = {
  seed: string
  name?: string
  label?: string
  className?: string
}

function seedHash(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return hash
}

export function PlayerAvatar({ seed, name, label, className = '' }: PlayerAvatarProps) {
  const hash = seedHash(seed || name || label || 'player')
  const palettes = [
    { base: '#14b8a6', edge: '#0f766e', accent: '#ffd75e', hair: '#4a2a18', shirt: '#ef4444' },
    { base: '#60a5fa', edge: '#2563eb', accent: '#fbbf24', hair: '#111827', shirt: '#22c55e' },
    { base: '#fb7185', edge: '#be123c', accent: '#fde68a', hair: '#6b2c12', shirt: '#3b82f6' },
    { base: '#a78bfa', edge: '#6d28d9', accent: '#f9a8d4', hair: '#2f1b46', shirt: '#f97316' },
    { base: '#f59e0b', edge: '#b45309', accent: '#fff7ed', hair: '#3f2a16', shirt: '#0891b2' },
    { base: '#84cc16', edge: '#4d7c0f', accent: '#fef3c7', hair: '#27272a', shirt: '#dc2626' },
  ]
  const palette = palettes[hash % palettes.length]
  const hairStyle = hash % 3
  const skin = ['#ffd7b3', '#f6c28b', '#e9a66f', '#f3c6a3'][hash % 4]
  const cheek = hash % 2 === 0 ? '#ff9aa8' : '#f59e9e'
  const smile = hash % 2 === 0 ? 'M26 32c2.2 2 9.8 2 12 0' : 'M27 32c2.5 1.4 7.5 1.4 10 0'
  const style = {
    '--avatar-base': palette.base,
    '--avatar-edge': palette.edge,
    '--avatar-accent': palette.accent,
    '--avatar-hair': palette.hair,
    '--avatar-shirt': palette.shirt,
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
          <linearGradient id={`avatarShirt-${hash}`} x1="16" x2="48" y1="38" y2="62" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--avatar-shirt)" />
            <stop offset="1" stopColor="var(--avatar-edge)" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="30" fill={`url(#avatarBg-${hash})`} />
        <circle cx="20" cy="14" r="9" fill="rgba(255,255,255,0.22)" />
        <path
          d="M14 59c2.3-13 9.5-20 18-20s15.7 7 18 20"
          fill={`url(#avatarShirt-${hash})`}
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="32" cy="26" r="14" fill={skin} />
        {hairStyle === 0 ? (
          <path d="M19 24c1-10 8-15 16-13 7 1.5 11 7 10 15-7-4-15-7-26-2Z" fill="var(--avatar-hair)" />
        ) : hairStyle === 1 ? (
          <path d="M20 23c2-9 8-13 16-12 6 1 10 6 9 14-5-3-9-4-13-4-4.2 0-8 .8-12 2Z" fill="var(--avatar-hair)" />
        ) : (
          <path d="M18 26c1-11 8-16 17-15 6.5.7 11 6 10 15-4-5-8-6-13-6-5.2 0-9 1.5-14 6Z" fill="var(--avatar-hair)" />
        )}
        <circle cx="27" cy="27" r="1.7" fill="#3f2a1d" />
        <circle cx="37" cy="27" r="1.7" fill="#3f2a1d" />
        <circle cx="24" cy="31" r="2.2" fill={cheek} opacity="0.72" />
        <circle cx="40" cy="31" r="2.2" fill={cheek} opacity="0.72" />
        <path d={smile} fill="none" stroke="#8a4b2b" strokeWidth="2" strokeLinecap="round" />
        <circle cx="49" cy="48" r="8.5" fill="var(--avatar-accent)" stroke="#fffaf0" strokeWidth="2" />
        <circle cx="49" cy="48" r="4.5" fill="none" stroke="rgba(138,75,22,0.55)" strokeWidth="2" />
      </svg>
    </div>
  )
}
