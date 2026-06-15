import { useEffect, useMemo, useRef, useState } from 'react'
import { ActionBar } from './game/ActionBar'
import { TableScene } from './game/TableScene'
import { PlayerAvatar } from './PlayerAvatar'
import type { HandHistoryEntry, ShowdownPayload } from '../protocol'
import { getStoredPlayerId, getStoredProfileId, usePokerClient } from '../usePokerClient'
import './GameShell.css'

type OverlayMode = 'create' | 'join'
type PanelMode = 'room' | 'logs'

function formatCards(cards: string[]) {
  return cards.map((card) => card.replace('T', '10')).join(' ')
}

// Lazily-created shared AudioContext so a single user gesture unlocks audio.
let sharedAudioCtx: AudioContext | null = null
function playTurnChime() {
  try {
    type WindowWithAudio = Window & { webkitAudioContext?: typeof AudioContext }
    const Ctx = window.AudioContext ?? (window as WindowWithAudio).webkitAudioContext
    if (!Ctx) return
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx()
    const ctx = sharedAudioCtx
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    const notes = [880, 1320]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = now + i * 0.16
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.34)
    })
  } catch {
    // Ignore audio failures (autoplay policy, unsupported browser, etc.)
  }
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

function HistoryPanel({ history, onClose }: { history: HandHistoryEntry[]; onClose: () => void }) {
  return (
    <div className="settlementBackdrop" onClick={onClose}>
      <section className="settlementPanel historyPanel" onClick={(e) => e.stopPropagation()}>
        <div className="settlementHeader">
          <div>
            <div className="settlementKicker">History</div>
            <h2>牌局历史</h2>
          </div>
          <button className="btn tiny secondary" onClick={onClose}>
            关闭
          </button>
        </div>
        {history.length === 0 ? (
          <div className="emptyMini">暂无历史记录</div>
        ) : (
          <div className="historyList">
            {history.map((h, idx) => (
              <div key={`${h.handId}-${h.time}-${idx}`} className={`historyRow ${h.net >= 0 ? 'win' : 'lose'}`}>
                <div className="historyMain">
                  <span className="historyHand">#{h.handId}</span>
                  <span className="historyCards">{formatCards(h.hole.split(' ').filter(Boolean))}</span>
                  {h.rank ? <span className="historyRank">{h.rank}</span> : null}
                </div>
                <div className={`historyNet ${h.net >= 0 ? 'win' : 'lose'}`}>
                  {h.net >= 0 ? `+${h.net}` : h.net}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export function GameShell() {
  const { serverUrl, setServerUrl, connectionState, authState, state, rooms, logs, showdown, profile, history, toast, dismissToast, connect, api } = usePokerClient()
  const profileMenuRef = useRef<HTMLDivElement | null>(null)
  const [overlayOpen, setOverlayOpen] = useState(true)
  const [mode, setMode] = useState<OverlayMode>('create')
  const [panelMode, setPanelMode] = useState<PanelMode>('room')
  const [profileOpen, setProfileOpen] = useState(false)
  const [username, setUsername] = useState(() => localStorage.getItem('username') ?? '')
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('playerName') ?? '')
  const [profileName, setProfileName] = useState(() => localStorage.getItem('playerName') ?? '')
  const [roomCode, setRoomCode] = useState('')
  const [roomName, setRoomName] = useState('')
  const [roomPassword, setRoomPassword] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [buyIn, setBuyIn] = useState<number | ''>('')
  const [tournament, setTournament] = useState(false)
  const [blindEvery, setBlindEvery] = useState(8)
  const [topUpAmount, setTopUpAmount] = useState<number | ''>(500)
  const [showSettlement, setShowSettlement] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('soundOn') !== '0')

  const roomLabel = state?.roomCode ?? '未加入'
  const stageLabel = state?.stage ?? 'waiting'
  const potValue = state?.pot ?? 0
  const handId = state?.handId ?? 0

  const maxPlayersValue = useMemo(() => {
    if (state?.maxPlayers) return state.maxPlayers
    return maxPlayers
  }, [maxPlayers, state?.maxPlayers])

  // Auto-collapse the room overlay once we are in a room. Adjust during render
  // keyed on the room code instead of setState-in-effect.
  const [lastRoomCode, setLastRoomCode] = useState<string | undefined>(undefined)
  if (state?.roomCode && state.roomCode !== lastRoomCode) {
    setLastRoomCode(state.roomCode)
    setOverlayOpen(false)
  }

  // Seed the editable name inputs from the profile only once (when still empty),
  // so a server profile push does not clobber what the user is typing.
  const [nameSeeded, setNameSeeded] = useState(false)
  if (!nameSeeded && profile?.name) {
    setNameSeeded(true)
    if (!playerName) setPlayerName(profile.name)
    if (!profileName) setProfileName(profile.name)
  }

  // Re-open the settlement panel whenever a new showdown arrives. Adjust during
  // render (keyed on the showdown object) instead of setState-in-effect.
  const [settlementKey, setSettlementKey] = useState<ShowdownPayload | null>(null)
  if (showdown !== settlementKey) {
    setSettlementKey(showdown)
    setShowSettlement(true)
  }

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

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => dismissToast(), 3200)
    return () => window.clearTimeout(t)
  }, [toast, dismissToast])

  // Detect when it becomes the local player's turn to act, so we can fire a
  // sound + flash the tab title (helps when the user is not looking at the tab).
  const youId = state?.you.id
  const youPublic = useMemo(
    () => state?.players.find((p) => p.id === youId) ?? null,
    [state?.players, youId],
  )
  const isYourTurn = !!youPublic?.current && state?.stage !== 'waiting'
  useEffect(() => {
    localStorage.setItem('soundOn', soundOn ? '1' : '0')
  }, [soundOn])

  const wasYourTurnRef = useRef(false)
  useEffect(() => {
    if (isYourTurn && !wasYourTurnRef.current) {
      wasYourTurnRef.current = true
      if (soundOn) playTurnChime()
    } else if (!isYourTurn) {
      wasYourTurnRef.current = false
    }
  }, [isYourTurn, soundOn])

  // Flash the document title while it is the player's turn and the tab is hidden.
  useEffect(() => {
    const baseTitle = '欢乐德州'
    if (!isYourTurn) {
      document.title = baseTitle
      return
    }
    let on = false
    const flip = () => {
      if (document.visibilityState === 'visible') {
        document.title = baseTitle
        return
      }
      on = !on
      document.title = on ? '⏰ 轮到你行动！' : baseTitle
    }
    flip()
    const id = window.setInterval(flip, 900)
    return () => {
      window.clearInterval(id)
      document.title = baseTitle
    }
  }, [isYourTurn])

  const canSubmit = playerName.trim().length > 0
  const isAuthed = authState === 'authenticated'
  const profileId = profile?.id ?? getStoredProfileId()
  const canAuth = username.trim().length > 0

  const submitAuth = () => {
    if (!canAuth) return
    localStorage.setItem('username', username.trim())
    api.login({
      username: username.trim(),
    })
  }

  if (!isAuthed) {
    return (
      <div className="gameShell loginShell">
        <main className="loginScene">
          <section className="loginBrand" aria-label="欢乐德州">
            <div className="loginMark">TH</div>
            <div>
              <div className="loginKicker">Texas Hold&apos;em LAN</div>
              <h1>欢乐德州</h1>
              <div className="loginSub">好友局实时牌桌</div>
            </div>
            <div className="loginCards" aria-hidden="true">
              <div className="loginCard red">A<span>♥</span></div>
              <div className="loginCard black">K<span>♠</span></div>
            </div>
          </section>

          <section className="loginPanel" aria-label="登录">
            <div className="loginPanelHeader">
              <div className="loginPanelTitle">登录</div>
              <div className="loginChip">100K</div>
            </div>
            <label className="field loginField">
              <div className="label">用户名</div>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入或创建用户名"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitAuth()
                }}
              />
            </label>
            <button
              className="btn primary wide loginButton"
              disabled={!canAuth || authState === 'authenticating'}
              onClick={submitAuth}
            >
              {authState === 'authenticating' ? '登录中...' : '进入牌桌'}
            </button>
          </section>
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
            {state?.tournament ? (
              <div className="hudPill tournamentPill">
                <span>盲注 L{(state.blindLevel ?? 0) + 1}</span>
                <strong>{state.smallBlind}/{state.bigBlind}{state.handsToBlindUp ? ` · ${state.handsToBlindUp}手升盲` : ''}</strong>
              </div>
            ) : null}
            <div className="hudPill"><span>总筹码</span><strong>{profile?.chips ?? '...'}</strong></div>
          </div>
        </div>
        <div className="hudRight">
          <div className={`hudStatus ${connectionState}`}>{connectionState}</div>
          <button className="btn tiny secondary" onClick={() => { void connect().catch(() => {}) }}>
            连接
          </button>
          <button
            className="btn tiny secondary"
            onClick={() => setSoundOn((v) => !v)}
            aria-label={soundOn ? '关闭提示音' : '开启提示音'}
            title={soundOn ? '提示音：开' : '提示音：关'}
          >
            {soundOn ? '🔔' : '🔕'}
          </button>
          <button
            className="btn tiny secondary"
            onClick={() => { api.getHistory(); setHistoryOpen(true) }}
          >
            战绩
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
          {state && state.spectators && state.spectators.length > 0 ? (
            <div className="spectatorStrip" title="观战玩家">
              <span className="spectatorStripLabel">👁 观战 {state.spectators.length}</span>
              {state.spectators.slice(0, 8).map((s) => (
                <span key={s.id} className="spectatorChip">{s.name}</span>
              ))}
            </div>
          ) : null}
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
              actionDeadline={state?.actionDeadline}
              serverTime={state?.serverTime}
              onKickPlayer={(player) => {
                if (window.confirm(`确认将 ${player.name} 移出房间？`)) {
                  api.kickPlayer(player.id)
                }
              }}
            />
          </div>
          <div className="actionDock">
            {state && state.you.chips <= 0 && !state.you.spectator ? (
              <div className="brokeBanner" role="alert">
                <span>筹码不足，无法参与下一手</span>
                <button
                  className="btn tiny"
                  onClick={() => api.topUp({ amount: Number(topUpAmount || 500) })}
                >
                  一键补码 +{Number(topUpAmount || 500)}
                </button>
              </div>
            ) : null}
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
                placeholder={`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`}
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
                  <div className="label">房间名</div>
                  <input
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="例如 周末德州局"
                  />
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
                <label className="field checkboxField">
                  <input
                    type="checkbox"
                    checked={tournament}
                    onChange={(e) => setTournament(e.target.checked)}
                  />
                  <span>锦标赛模式（盲注按手数递增）</span>
                </label>
                {tournament ? (
                  <label className="field">
                    <div className="label">每多少手升盲</div>
                    <input
                      value={blindEvery}
                      type="number"
                      min={1}
                      max={1000}
                      onChange={(e) => setBlindEvery(Number(e.target.value || 8))}
                    />
                  </label>
                ) : null}
                <button
                  className="btn primary wide"
                  disabled={!canSubmit}
                  onClick={() => {
                    api.createRoom({
                      playerName: playerName.trim(),
                      playerId: '',
                      profileId,
                      roomName: roomName.trim(),
                      roomPassword,
                      maxPlayers,
                      buyIn: Number(buyIn || 0),
                      tournament,
                      blindIncreaseEvery: tournament ? blindEvery : 0,
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
                <button
                  className="btn secondary wide"
                  disabled={!canSubmit || roomCode.trim().length === 0}
                  onClick={() => {
                    const code = roomCode.trim().toUpperCase()
                    api.joinRoom({
                      playerName: playerName.trim(),
                      roomCode: code,
                      playerId: getStoredPlayerId(code),
                      profileId,
                      roomPassword,
                      buyIn: 0,
                      asSpectator: true,
                    })
                  }}
                >
                  观战加入
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
                  <span>{room.name || `房间 ${room.code}`}</span>
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
                    {state.you.spectator ? '入座' : state.you.sittingOut ? '回座' : '离座'}
                  </button>
                  <button className="btn secondary" onClick={() => api.leaveRoom()}>离开</button>
                  <button className="btn danger" disabled={state.hostId !== state.you.id} onClick={() => window.confirm('确认解散房间？') && api.dissolveRoom()}>
                    解散
                  </button>
                </div>
                {state.stage === 'waiting' && !state.you.spectator ? (
                  <button
                    className={`btn wide ${state.you.ready ? 'secondary' : 'primary'}`}
                    onClick={() => api.toggleReady()}
                  >
                    {state.you.ready ? '取消准备' : '我已准备'}
                  </button>
                ) : null}
                {state.you.spectator ? (
                  <div className="spectatorHint">你正在观战。补码或入座后即可参与下一手。</div>
                ) : null}
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

      {toast ? (
        <div className={`appToast ${toast.kind}`} role="status" onClick={() => dismissToast()}>
          {toast.message}
        </div>
      ) : null}

      {showdown && showSettlement ? <SettlementPanel showdown={showdown} onClose={() => setShowSettlement(false)} /> : null}

      {historyOpen ? <HistoryPanel history={history} onClose={() => setHistoryOpen(false)} /> : null}

    </div>
  )
}
