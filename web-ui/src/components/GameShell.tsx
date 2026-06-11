import { useEffect, useMemo, useRef, useState } from 'react'
import { ActionBar } from './game/ActionBar'
import { TableScene } from './game/TableScene'
import { PlayerAvatar } from './PlayerAvatar'
import type { ShowdownPayload } from '../protocol'
import { getStoredPlayerId, getStoredProfileId, usePokerClient } from '../usePokerClient'
import './GameShell.css'

type OverlayMode = 'create' | 'join'
type PanelMode = 'room' | 'logs'
type AuthMode = 'login' | 'register'

function formatCards(cards: string[]) {
  return cards.map((card) => card.replace('T', '10')).join(' ')
}

function SettlementPanel({ showdown, onClose }: { showdown: ShowdownPayload; onClose: () => void }) {
  const winners = new Set(showdown.results.flatMap((result) => result.winners.map((winner) => winner.id)))

  return (
    <div className="settlementBackdrop">
      <section className="settlementPanel">
        <div className="settlementHeader">
          <div>
            <div className="settlementKicker">Showdown</div>
            <h2>本手结算</h2>
          </div>
          <button className="btn tiny secondary" onClick={onClose}>
            收起
          </button>
        </div>
        <div className="settlementCommunity">公共牌：{formatCards(showdown.community)}</div>
        <div className="settlementPlayers">
          {showdown.players.map((player) => (
            <div key={player.id} className={`settlementPlayer ${winners.has(player.id) ? 'winner' : ''}`}>
              <div>
                <div className="settlementName">{player.name}</div>
                <div className="settlementCards">{formatCards(player.hole)}</div>
              </div>
              <div className="settlementRank">{player.rank}</div>
            </div>
          ))}
        </div>
        <div className="potResults">
          {showdown.results.map((result, index) => (
            <div key={`${result.potAmount}-${index}`} className="potResult">
              <div className="potAmount">{index === 0 ? '主池' : `边池 ${index}`} · {result.potAmount}</div>
              <div className="winnerLine">
                {result.winners.map((winner) => `${winner.name} +${winner.chipsWon}`).join('，')}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export function GameShell() {
  const { serverUrl, setServerUrl, connectionState, authState, state, rooms, logs, showdown, profile, connect, api } = usePokerClient()
  const profileMenuRef = useRef<HTMLDivElement | null>(null)
  const [overlayOpen, setOverlayOpen] = useState(true)
  const [mode, setMode] = useState<OverlayMode>('create')
  const [panelMode, setPanelMode] = useState<PanelMode>('room')
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [profileOpen, setProfileOpen] = useState(false)
  const [username, setUsername] = useState(() => localStorage.getItem('username') ?? '')
  const [password, setPassword] = useState('')
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('playerName') ?? '')
  const [profileName, setProfileName] = useState(() => localStorage.getItem('playerName') ?? '')
  const [roomCode, setRoomCode] = useState('')
  const [roomPassword, setRoomPassword] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [buyIn, setBuyIn] = useState<number | ''>('')
  const [topUpAmount, setTopUpAmount] = useState<number | ''>(500)
  const [showSettlement, setShowSettlement] = useState(true)

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
      queueMicrotask(() => setOverlayOpen(false))
    }
  }, [state?.roomCode])

  useEffect(() => {
    if (profile?.name) {
      queueMicrotask(() => {
        setPlayerName(profile.name)
        setProfileName(profile.name)
      })
    }
  }, [profile?.name])

  useEffect(() => {
    if (showdown) {
      queueMicrotask(() => setShowSettlement(true))
    }
  }, [showdown])

  useEffect(() => {
    if (!profileOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (profileMenuRef.current?.contains(target)) return
      setProfileOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [profileOpen])

  const canSubmit = playerName.trim().length > 0
  const isAuthed = authState === 'authenticated'
  const profileId = profile?.id ?? getStoredProfileId()
  const canAuth = username.trim().length > 0 && password.length > 0 && (authMode === 'login' || playerName.trim().length > 0)

  const submitAuth = () => {
    if (!canAuth) return
    localStorage.setItem('username', username.trim())
    if (authMode === 'login') {
      api.login({
        username: username.trim(),
        password,
      })
      return
    }
    api.register({
      username: username.trim(),
      password,
      playerName: playerName.trim(),
    })
  }

  if (!isAuthed) {
    return (
      <div className="gameShell loginShell">
        <main className="loginPanel">
          <div className="loginKicker">Texas Hold&apos;em LAN</div>
          <h1>{authMode === 'login' ? '登录账号' : '注册玩家'}</h1>
          <p>只有注册后的用户登录成功，才能进入房间大厅和牌桌界面。</p>
          <div className="overlayTabs authTabs">
            <button className={`tab ${authMode === 'login' ? 'active' : ''}`} onClick={() => setAuthMode('login')}>
              登录
            </button>
            <button className={`tab ${authMode === 'register' ? 'active' : ''}`} onClick={() => setAuthMode('register')}>
              注册
            </button>
          </div>
          <label className="field">
            <div className="label">服务器地址</div>
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder={`ws://${location.hostname}:8080/ws`}
            />
          </label>
          <label className="field">
            <div className="label">用户名</div>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="请输入用户名" />
          </label>
          <label className="field">
            <div className="label">密码</div>
            <input
              value={password}
              type="password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder={authMode === 'register' ? '至少 6 个字符' : '请输入密码'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitAuth()
              }}
            />
          </label>
          {authMode === 'register' ? (
            <label className="field">
              <div className="label">游戏昵称</div>
              <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="牌桌展示昵称" />
            </label>
          ) : null}
          <button
            className="btn primary wide"
            disabled={!canAuth || authState === 'authenticating'}
            onClick={submitAuth}
          >
            {authState === 'authenticating' ? '处理中...' : authMode === 'login' ? '登录' : '注册并登录'}
          </button>
          <div className={`hudStatus ${connectionState}`}>{connectionState}</div>
          <div className="loginLogs">
            {logs.slice(0, 4).map((log) => (
              <div key={log} className="logItem">{log}</div>
            ))}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="gameShell">
      <header className="gameHud">
        <div className="hudLeft">
          <div className="logoBlock">
            <div className="logo">欢乐德州</div>
            <div className="logoSub">好友局实时牌桌</div>
          </div>
          <div className="hudStats">
            <div className="hudPill"><span>房间</span><strong>{roomLabel}</strong></div>
            <div className="hudPill"><span>阶段</span><strong>{stageLabel}</strong></div>
            <div className="hudPill"><span>底池</span><strong>{potValue}</strong></div>
            <div className="hudPill"><span>手数</span><strong>{handId}</strong></div>
            <div className="hudPill"><span>总筹码</span><strong>{profile?.chips ?? '...'}</strong></div>
          </div>
        </div>
        <div className="hudRight">
          <div className={`hudStatus ${connectionState}`}>{connectionState}</div>
          <button className="btn tiny secondary" onClick={() => connect()}>
            连接
          </button>
          <div className="profileMenuAnchor" ref={profileMenuRef}>
            <button
              className={`profileTrigger ${profileOpen ? 'open' : ''}`}
              onClick={() => setProfileOpen((value) => !value)}
              aria-label="打开个人信息"
              aria-expanded={profileOpen}
            >
              <PlayerAvatar seed={profile?.avatarSeed ?? profileId} name={profile?.name ?? playerName} label="玩家" />
            </button>
            {profileOpen ? (
              <div className="profilePopover">
                <div className="profileCard profileCardPopover">
                  <div className="profileAvatarSeed">
                    <PlayerAvatar seed={profile?.avatarSeed ?? profileId} name={profile?.name ?? playerName} label="玩家" />
                  </div>
                  <div>
                    <div className="profileName">{profile?.name ?? (playerName || '玩家')}</div>
                    <div className="profileMeta">ID {profileId || '未生成'} · 总筹码 {profile?.chips ?? 0} · 战绩 {profile?.handsWon ?? 0}/{profile?.handsPlayed ?? 0}</div>
                  </div>
                </div>
                <label className="field">
                  <div className="label">昵称</div>
                  <input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="请输入昵称" />
                </label>
                <button
                  className="btn primary wide"
                  onClick={() => api.updateProfile({ playerId: profileId, name: profileName.trim() })}
                >
                  保存昵称
                </button>
              </div>
            ) : null}
          </div>
          <button className="btn tiny" onClick={() => setOverlayOpen((v) => !v)}>
            房间
          </button>
        </div>
      </header>

      <div className={`gameLayout ${overlayOpen ? 'panelOpen' : ''}`}>
        <main className="gameStage">
          <div className="tablePanel">
            <TableScene
              maxPlayers={maxPlayersValue}
              players={state?.players ?? []}
              community={state?.community ?? []}
              pot={state?.pot ?? 0}
              stage={state?.stage ?? 'waiting'}
              youSeat={state?.you.seat}
              youId={state?.you.id}
              youHole={state?.you.hole ?? []}
              lastEvent={state?.lastEvent ?? null}
              hostId={state?.hostId}
              onKickPlayer={(player) => {
                if (window.confirm(`确认将 ${player.name} 移出房间？`)) {
                  api.kickPlayer(player.id)
                }
              }}
            />
          </div>
          <div className="actionDock">
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
          </div>
        </main>

        <aside className={`roomOverlay ${overlayOpen ? 'open' : ''}`}>
          <div className="overlayHeader">
            <div className="overlayTitle">{panelMode === 'room' ? '房间操作' : '消息记录'}</div>
            <button className="btn tiny secondary" onClick={() => setOverlayOpen(false)}>
              收起
            </button>
          </div>

          <div className="overlayTabs">
            <button className={`tab ${panelMode === 'room' ? 'active' : ''}`} onClick={() => setPanelMode('room')}>
              房间
            </button>
            <button className={`tab ${panelMode === 'logs' ? 'active' : ''}`} onClick={() => setPanelMode('logs')}>
              消息
            </button>
          </div>

          {panelMode === 'room' ? <div className="overlayTabs">
            <button className={`tab ${mode === 'create' ? 'active' : ''}`} onClick={() => setMode('create')}>
              创建房间
            </button>
            <button className={`tab ${mode === 'join' ? 'active' : ''}`} onClick={() => setMode('join')}>
              加入房间
            </button>
          </div> : null}

          {panelMode === 'room' ? <div className="overlayBody">
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
            <label className="field">
              <div className="label">房间密码</div>
              <input
                value={roomPassword}
                type="password"
                onChange={(e) => setRoomPassword(e.target.value)}
                placeholder={mode === 'create' ? '可选，设置后加入需输入' : '锁定房间需要输入'}
              />
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
                      playerId: '',
                      profileId,
                      roomPassword,
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
                      profileId,
                      roomPassword,
                      buyIn: Number(buyIn || 0),
                    })
                  }}
                >
                  加入房间
                </button>
              </>
            )}
            <div className="roomListBlock">
              <div className="sideTitle">
                房间列表
                <button className="btn tiny secondary" onClick={() => api.listRooms()}>刷新</button>
              </div>
              {rooms.length === 0 ? <div className="emptyMini">暂无房间</div> : rooms.map((room) => (
                <button
                  key={room.code}
                  className="miniRoom"
                  onClick={() => {
                    setRoomCode(room.code)
                    if (!room.locked) {
                      api.joinRoom({
                        playerName: playerName.trim(),
                        roomCode: room.code,
                        playerId: getStoredPlayerId(room.code),
                        profileId,
                        roomPassword,
                        buyIn: Number(buyIn || 0),
                      })
                    }
                  }}
                >
                  <strong>{room.code}</strong>
                  <span>{room.locked ? '锁定 · ' : ''}{room.players}/{room.maxPlayers} · {room.stage} · {room.hostName || '未知房主'}</span>
                </button>
              ))}
            </div>
            {state ? (
              <div className="manageBlock">
                <div className="sideTitle">游戏管理</div>
                <label className="field">
                  <div className="label">补码金额</div>
                  <input
                    value={topUpAmount}
                    type="number"
                    min={1}
                    onChange={(e) => setTopUpAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </label>
                <div className="buttonGrid">
                  <button className="btn secondary" onClick={() => api.topUp({ amount: Number(topUpAmount || 0) })}>补码</button>
                  <button className="btn secondary" onClick={() => state.you.sittingOut ? api.sitIn() : api.sitOut()}>
                    {state.you.sittingOut ? '回座' : '离座'}
                  </button>
                  <button className="btn secondary" onClick={() => api.leaveRoom()}>离开</button>
                  <button className="btn danger" disabled={state.hostId !== state.you.id} onClick={() => window.confirm('确认解散房间？') && api.dissolveRoom()}>
                    解散
                  </button>
                </div>
              </div>
            ) : null}
          </div> : null}

          {panelMode === 'logs' ? (
            <div className="logList">
              {logs.length === 0 ? <div className="emptyMini">暂无消息</div> : logs.slice(0, 18).map((log) => (
                <div key={log} className="logItem">{log}</div>
              ))}
            </div>
          ) : null}

          <div className="overlayFooter">
            <div className="overlayHint">进入房间后自动收起，可随时打开</div>
          </div>
        </aside>
      </div>

      {showdown && showSettlement ? <SettlementPanel showdown={showdown} onClose={() => setShowSettlement(false)} /> : null}

    </div>
  )
}
