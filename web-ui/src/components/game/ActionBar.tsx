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
  const callDisplay = Math.min(callNeeded, you.chips)

  const canAct = state.stage !== 'waiting' && isYourTurn && !you.folded && !you.allIn && !you.sittingOut
  const maxRaiseTo = you.chips + you.betRound
  const minBet = Math.max(1, state.minRaise)
  const minRaiseTo = state.currentBet + state.minRaise

  const mode = state.currentBet === 0 ? 'bet' : 'raise'
  const minValue = mode === 'bet' ? minBet : minRaiseTo
  const maxValue = mode === 'bet' ? you.chips : maxRaiseTo
  // A short stack that cannot cover a full min-raise can still legally shove.
  const canFullRaise = canAct && maxValue >= minValue
  const canAllInRaise = canAct && maxValue > you.betRound && maxValue < minValue
  const canRaise = canFullRaise || canAllInRaise
  // When only an all-in (below min raise) is possible, lock the amount to maxValue.
  const effectiveMin = canAllInRaise ? maxValue : minValue

  const [slider, setSlider] = useState<number>(effectiveMin)

  // Reset the proposed amount whenever the betting context changes so it does
  // not carry a stale value across rounds/hands. Adjusting state during render
  // (React's recommended pattern) avoids a setState-in-effect cascade.
  const ctxKey = `${state.handId}:${state.stage}:${state.currentBet}:${isYourTurn}:${effectiveMin}`
  const [lastCtxKey, setLastCtxKey] = useState(ctxKey)
  if (ctxKey !== lastCtxKey) {
    setLastCtxKey(ctxKey)
    setSlider(effectiveMin)
  }

  const sliderValue = useMemo(() => clamp(slider, effectiveMin, maxValue), [slider, effectiveMin, maxValue])

  const quick = useMemo(() => {
    const pot = state.pot
    if (mode === 'bet') {
      const half = clamp(Math.floor(pot / 2), effectiveMin, maxValue)
      const full = clamp(pot, effectiveMin, maxValue)
      return [
        { label: '1/2 底池', value: half },
        { label: '底池', value: full },
        { label: 'All-in', value: maxValue },
      ]
    }
    const halfTo = clamp(state.currentBet + Math.floor(pot / 2), effectiveMin, maxValue)
    const potTo = clamp(state.currentBet + pot, effectiveMin, maxValue)
    return [
      { label: '1/2 底池', value: halfTo },
      { label: '底池', value: potTo },
      { label: 'All-in', value: maxValue },
    ]
  }, [maxValue, effectiveMin, mode, state.currentBet, state.pot])

  return (
    <div className={`actionBar ${canAct ? 'yourTurn' : ''}`}>
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
              {callNeeded > 0 ? `跟注 ${callDisplay}` : '过牌'}
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
                  min={effectiveMin}
                  max={maxValue}
                  value={sliderValue}
                  disabled={!canRaise || canAllInRaise}
                  aria-label={mode === 'bet' ? '下注金额' : '加注目标金额'}
                  aria-valuetext={String(sliderValue)}
                  onChange={(e) => setSlider(Number(e.target.value))}
                />
                <div className="pill valuePill">
                  {canAllInRaise ? `全下 ${maxValue}` : mode === 'bet' ? `下注 ${sliderValue}` : `加注到 ${sliderValue}`}
                </div>
                <button
                  className="btn"
                  disabled={!canRaise}
                  onClick={() => onAction({ action: mode, amount: sliderValue })}
                >
                  {canAllInRaise ? '全下' : mode === 'bet' ? '下注' : '加注'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
