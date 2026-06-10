import { useMemo } from 'react'
import type { StatePayload } from '../protocol'
import { TableScene } from './game/TableScene'
import { ActionBar } from './game/ActionBar'

type Props = {
  state: StatePayload
  onStartGame: () => void
  onLeaveRoom: () => void
  onDissolveRoom: () => void
  onAction: (payload: { action: 'fold' | 'check' | 'call' | 'bet' | 'raise'; amount: number }) => void
}

export function TableShell({ state, onStartGame, onLeaveRoom, onDissolveRoom, onAction }: Props) {
  const you = state.you
  const isHost = state.hostId === you.id
  const maxPlayersGuess = useMemo(() => {
    const maxSeat = state.players.reduce((acc, p) => Math.max(acc, p.seat), you.seat)
    return Math.max(2, state.maxPlayers || 0, maxSeat + 1, 6)
  }, [state.maxPlayers, state.players, you.seat])

  return (
    <div className="tableShell">
      <div className="topBar">
        <div className="pill">房间：{state.roomCode}</div>
        <div className="pill">阶段：{state.stage}</div>
        <div className="pill">底池：{state.pot}</div>
        <div className="pill">手数：{state.handId}</div>
        <div className="spacer" />
        <button className="btn tiny danger" onClick={onDissolveRoom} disabled={!isHost}>
          解散
        </button>
        <button className="btn tiny secondary" onClick={onLeaveRoom}>
          离开
        </button>
      </div>

      <TableScene
        maxPlayers={maxPlayersGuess}
        players={state.players}
        community={state.community}
        pot={state.pot}
        stage={state.stage}
        youSeat={state.you.seat}
        youHole={state.you.hole}
        lastEvent={state.lastEvent ?? null}
      />

      <ActionBar state={state} onStartGame={onStartGame} onAction={onAction} />
    </div>
  )
}
