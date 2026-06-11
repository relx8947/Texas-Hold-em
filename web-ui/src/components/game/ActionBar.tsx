import { useMemo, useState } from 'react'
import type { StatePayload } from '../../protocol'

type Props = {
  state: StatePayload
  onStartGame: () => void
  onAction: (payload: { action: 'fold' | 'check' | 'call' | 'bet' | 'raise'; amount: number }) => void
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function ActionBar({ state, onStartGame, onAction }: Props) {
  const you = state.you
  const publicYou = useMemo(() => state.players.find((p) => p.id === you.id) ?? null, [state.players, you.id])
  const isHost = state.hostId === you.id
  const isYourTurn = !!publicYou?.current
  const callNeeded = Math.max(0, state.currentBet - you.betRound)

  const canAct = state.stage !== 'waiting' && isYourTurn && !you.folded && !you.allIn && !you.sittingOut
  const maxRaiseTo = you.chips + you.betRound
  const minBet = Math.max(1, state.minRaise)
  const minRaiseTo = state.currentBet + state.minRaise

  const mode = state.currentBet === 0 ? 'bet' : 'raise'
  const minValue = mode === 'bet' ? minBet : minRaiseTo
  const maxValue = mode === 'bet' ? you.chips : maxRaiseTo
  const canRaise = canAct && maxValue >= minValue

  const [slider, setSlider] = useState<number>(minValue)

  const sliderValue = useMemo(() => clamp(slider, minValue, maxValue), [slider, minValue, maxValue])

  const quick = useMemo(() => {
    const pot = state.pot
    if (mode === 'bet') {
      const half = clamp(Math.floor(pot / 2), minValue, maxValue)
      const full = clamp(pot, minValue, maxValue)
      return [
        { label: '1/2 底池', value: half },
        { label: '底池', value: full },
        { label: 'All-in', value: maxValue },
      ]
    }
    const halfTo = clamp(state.currentBet + Math.floor(pot / 2), minValue, maxValue)
    const potTo = clamp(state.currentBet + pot, minValue, maxValue)
    return [
      { label: '1/2 底池', value: halfTo },
      { label: '底池', value: potTo },
      { label: 'All-in', value: maxValue },
    ]
  }, [maxValue, minValue, mode, state.currentBet, state.pot])

  return (
    <div className="actionBar">
      <div className="actionLeft">
        <div className="actionInfo">
          <div className="title">{state.stage === 'waiting' ? '等待开局' : canAct ? '轮到你行动' : '等待其他玩家'}</div>
          <div className="meta">
            当前下注 {state.currentBet} · 最小加注 {state.minRaise} · 你的筹码 {you.chips}
          </div>
        </div>
      </div>

      <div className="actionRight">
        {state.stage === 'waiting' ? (
          <button className="btn" onClick={onStartGame} disabled={!isHost}>
            开始
          </button>
        ) : (
          <>
            <button className="btn danger" onClick={() => onAction({ action: 'fold', amount: 0 })} disabled={!canAct}>
              弃牌
            </button>
            <button
              className="btn secondary"
              onClick={() => onAction({ action: callNeeded > 0 ? 'call' : 'check', amount: 0 })}
              disabled={!canAct}
            >
              {callNeeded > 0 ? `跟注 ${callNeeded}` : '过牌'}
            </button>
            <div className="raiseBox">
              <div className="quickRow">
                {quick.map((q) => (
                  <button
                    key={q.label}
                    className="btn tiny secondary"
                    disabled={!canRaise}
                    onClick={() => setSlider(q.value)}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <div className="sliderRow">
                <input
                  type="range"
                  min={minValue}
                  max={maxValue}
                  value={sliderValue}
                  disabled={!canRaise}
                  onChange={(e) => setSlider(Number(e.target.value))}
                />
                <div className="pill valuePill">{mode === 'bet' ? `下注 ${sliderValue}` : `加注到 ${sliderValue}`}</div>
                <button
                  className="btn"
                  disabled={!canRaise}
                  onClick={() => onAction({ action: mode, amount: sliderValue })}
                >
                  {mode === 'bet' ? '下注' : '加注'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
