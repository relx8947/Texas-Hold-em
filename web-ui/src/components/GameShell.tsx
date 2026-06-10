import { useEffect, useMemo, useState } from 'react'
import { ActionBar } from './game/ActionBar'
import { TableScene } from './game/TableScene'
import { getStoredPlayerId, usePokerClient } from '../usePokerClient'
import './GameShell.css'

type OverlayMode = 'create' | 'join'

export function GameShell() {
  const { serverUrl, setServerUrl, connectionState, state, connect, api } = usePokerClient()
  const [overlayOpen, setOverlayOpen] = useState(true)
  const [mode, setMode] = useState<OverlayMode>('create')
  const [playerName, setPlayerName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [buyIn, setBuyIn] = useState<number | ''>('')

  const roomLabel = state?.roomCode ?? '未加入'
  const stageLabel = state?.stage ?? 'waiting'
  const potValue = state?.pot ?? 0
  const handId = state?.handId ?? 0

  const maxPlayersValue = useMemo(() => {
    if (state?.maxPlayers) return state.maxPlayers
    return maxPlayers
  }, [maxPlayers, state?.maxPlayers])

  useEffect(() => {
    if (state?.roomCode) {
      setOverlayOpen(false)
    }
  }, [state?.roomCode])

  const canSubmit = playerName.trim().length > 0

  return (
    <div className="gameShell">
      <header className="gameHud">
        <div className="hudLeft">
          <div className="logo">欢乐德州</div>
          <div className="hudPill">房间 {roomLabel}</div>
          <div className="hudPill">阶段 {stageLabel}</div>
          <div className="hudPill">底池 {potValue}</div>
          <div className="hudPill">手数 {handId}</div>
        </div>
        <div className="hudRight">
          <div className={`hudStatus ${connectionState}`}>{connectionState}</div>
          <button className="btn tiny secondary" onClick={() => connect()}>
            连接
          </button>
          <button className="btn tiny" onClick={() => setOverlayOpen((v) => !v)}>
            房间
          </button>
        </div>
      </header>

      <main className="gameStage">
        <TableScene
          maxPlayers={maxPlayersValue}
          players={state?.players ?? []}
          community={state?.community ?? []}
          pot={state?.pot ?? 0}
          stage={state?.stage ?? 'waiting'}
          youSeat={state?.you.seat}
          youHole={state?.you.hole ?? []}
          lastEvent={state?.lastEvent ?? null}
        />
        {state ? (
          <ActionBar state={state} onStartGame={() => api.startGame()} onAction={(payload) => api.action(payload)} />
        ) : (
          <div className="actionBar actionBarIdle">
            <div className="actionInfo">
              <div className="title">请创建或加入房间</div>
              <div className="meta">右上角打开房间面板，或点击“连接”</div>
            </div>
          </div>
        )}
      </main>

      <aside className={`roomOverlay ${overlayOpen ? 'open' : ''}`}>
        <div className="overlayHeader">
          <div className="overlayTitle">房间操作</div>
          <button className="btn tiny secondary" onClick={() => setOverlayOpen(false)}>
            收起
          </button>
        </div>
        <div className="overlayTabs">
          <button className={`tab ${mode === 'create' ? 'active' : ''}`} onClick={() => setMode('create')}>
            创建房间
          </button>
          <button className={`tab ${mode === 'join' ? 'active' : ''}`} onClick={() => setMode('join')}>
            加入房间
          </button>
        </div>

        <div className="overlayBody">
          <label className="field">
            <div className="label">服务器地址</div>
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder={`ws://${location.hostname}:8080/ws`}
            />
          </label>
          <label className="field">
            <div className="label">昵称</div>
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="请输入昵称" />
          </label>

          {mode === 'create' ? (
            <>
              <label className="field">
                <div className="label">最大人数</div>
                <input
                  value={maxPlayers}
                  type="number"
                  min={2}
                  max={10}
                  onChange={(e) => setMaxPlayers(Number(e.target.value || 6))}
                />
              </label>
              <label className="field">
                <div className="label">买入筹码</div>
                <input
                  value={buyIn}
                  type="number"
                  min={0}
                  onChange={(e) => setBuyIn(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="默认 2000"
                />
              </label>
              <button
                className="btn primary wide"
                disabled={!canSubmit}
                onClick={() => {
                  api.createRoom({
                    playerName: playerName.trim(),
                    maxPlayers,
                    buyIn: Number(buyIn || 0),
                  })
                }}
              >
                创建房间
              </button>
            </>
          ) : (
            <>
              <label className="field">
                <div className="label">房间号</div>
                <input
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="例如 AB12"
                />
              </label>
              <label className="field">
                <div className="label">买入筹码</div>
                <input
                  value={buyIn}
                  type="number"
                  min={0}
                  onChange={(e) => setBuyIn(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="默认 2000"
                />
              </label>
              <button
                className="btn primary wide"
                disabled={!canSubmit || roomCode.trim().length === 0}
                onClick={() => {
                  const code = roomCode.trim().toUpperCase()
                  api.joinRoom({
                    playerName: playerName.trim(),
                    roomCode: code,
                    playerId: getStoredPlayerId(code),
                    buyIn: Number(buyIn || 0),
                  })
                }}
              >
                加入房间
              </button>
            </>
          )}
        </div>

        <div className="overlayFooter">
          <div className="overlayHint">进入房间后自动收起，可随时打开</div>
        </div>
      </aside>

    </div>
  )
}
