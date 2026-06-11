import { useMemo, useState } from 'react'
import type { RoomSummary } from '../protocol'
import { getStoredPlayerId, getStoredProfileId } from '../usePokerClient'

type Props = {
  serverUrl: string
  setServerUrl: (url: string) => void
  connectionState: string
  rooms: RoomSummary[]
  onRefreshRooms: () => void
  onCreateRoom: (payload: { playerName: string; playerId: string; profileId: string; roomName: string; roomPassword: string; maxPlayers: number; buyIn: number }) => void
  onJoinRoom: (payload: {
    playerName: string
    roomCode: string
    playerId: string
    profileId: string
    buyIn: number
  }) => void
}

export function Lobby({
  serverUrl,
  setServerUrl,
  connectionState,
  rooms,
  onRefreshRooms,
  onCreateRoom,
  onJoinRoom,
}: Props) {
  const [playerName, setPlayerName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [buyIn, setBuyIn] = useState<number | ''>('')
  const [roomCode, setRoomCode] = useState('')
  const [roomName, setRoomName] = useState('')

  const buyInValue = useMemo(() => Number(buyIn || 0), [buyIn])

  return (
    <div className="lobby">
      <header className="header">
        <div className="title">局域网德州扑克</div>
        <div className="subtitle">真实牌桌 UI（前端重构中）</div>
      </header>

      <div className="panel">
        <div className="panelTitle">连接与房间</div>
        <div className="grid">
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
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
          </label>
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
          <label className="field">
            <div className="label">房间名</div>
            <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="例如 周末德州局" />
          </label>
          <label className="field">
            <div className="label">房间号</div>
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="例如 AB12"
            />
          </label>
        </div>

        <div className="row">
          <button
            className="btn"
            onClick={() =>
              onCreateRoom({
                playerName: playerName.trim(),
                playerId: '',
                profileId: getStoredProfileId(),
                roomName: roomName.trim(),
                roomPassword: '',
                maxPlayers,
                buyIn: buyInValue,
              })
            }
          >
            创建房间
          </button>
          <button
            className="btn secondary"
            onClick={() => {
              const code = roomCode.trim().toUpperCase()
              onJoinRoom({
                playerName: playerName.trim(),
                roomCode: code,
                playerId: getStoredPlayerId(code),
                profileId: getStoredProfileId(),
                buyIn: buyInValue,
              })
            }}
          >
            加入房间
          </button>

          <div className="pill">连接：{connectionState}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panelTitle row between">
          <span>房间列表</span>
          <button className="btn tiny secondary" onClick={onRefreshRooms}>
            刷新
          </button>
        </div>
        {rooms.length === 0 ? (
          <div className="empty">暂无房间</div>
        ) : (
          <div className="rooms">
            {rooms.map((room) => (
              <button
                key={room.code}
                className="roomCard"
                onClick={() => {
                  setRoomCode(room.code)
                  const code = room.code.toUpperCase()
                  onJoinRoom({
                    playerName: playerName.trim(),
                    roomCode: code,
                    playerId: getStoredPlayerId(code),
                    profileId: getStoredProfileId(),
                    buyIn: buyInValue,
                  })
                }}
              >
                <div className="roomCode">{room.name || room.code}</div>
                <div className="roomMeta">
                  玩家：{room.players}/{room.maxPlayers}（在线 {room.connected}）
                </div>
                <div className="roomMeta">阶段：{room.stage}</div>
                <div className="roomMeta">房主：{room.hostName || '未知'}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
