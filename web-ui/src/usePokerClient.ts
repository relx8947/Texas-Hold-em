import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChatMessage,
  ChatPayload,
  CreateRoomPayload,
  JoinRoomPayload,
  LoginPayload,
  PlayerActionPayload,
  PlayerProfile,
  RoomSummary,
  ShowdownPayload,
  StatePayload,
  TopUpPayload,
  WSMessage,
} from './protocol'

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'
type AuthState = 'anonymous' | 'authenticating' | 'authenticated'

type RoomSession = {
  roomCode: string
  roomPassword: string
  buyIn: number
}

const queueableMessageTypes = new Set(['login', 'create_room', 'join_room', 'list_rooms'])

function storageKey(roomCode: string) {
  return `playerId:${roomCode.toUpperCase()}`
}

const profileStorageKey = 'playerProfileId'

function defaultServerUrl() {
  const fromEnv = import.meta.env?.VITE_WS_URL
  if (fromEnv) return fromEnv
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/ws`
}

export function getStoredPlayerId(roomCode: string) {
  return localStorage.getItem(storageKey(roomCode)) ?? ''
}

export function storePlayerId(roomCode: string, playerId: string) {
  if (!roomCode || !playerId) return
  localStorage.setItem(storageKey(roomCode), playerId)
}

export function getStoredProfileId() {
  return localStorage.getItem(profileStorageKey) ?? ''
}

function storeProfile(profile: PlayerProfile) {
  if (!profile.id) return
  localStorage.setItem(profileStorageKey, profile.id)
  localStorage.setItem('playerName', profile.name)
}

export function usePokerClient() {
  const wsRef = useRef<WebSocket | null>(null)
  const pendingRef = useRef<WSMessage[]>([])
  const loginRef = useRef<LoginPayload | null>(null)
  const roomSessionRef = useRef<RoomSession | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const manualCloseRef = useRef(false)
  const restoringRef = useRef(false)
  const connectRef = useRef<(() => Promise<void>) | null>(null)
  const lastSeqRef = useRef(0)
  const lastHandRef = useRef(0)

  const [serverUrl, setServerUrlState] = useState<string>(
    () => localStorage.getItem('serverUrl') || defaultServerUrl(),
  )
  const setServerUrl = useCallback((url: string) => {
    setServerUrlState(url)
    if (url && url !== defaultServerUrl()) {
      localStorage.setItem('serverUrl', url)
    } else {
      localStorage.removeItem('serverUrl')
    }
  }, [])
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected')
  const [authState, setAuthState] = useState<AuthState>('anonymous')
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [state, setState] = useState<StatePayload | null>(null)
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [showdown, setShowdown] = useState<ShowdownPayload | null>(null)
  const [profile, setProfile] = useState<PlayerProfile | null>(null)

  const log = useCallback((message: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev])
  }, [])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current === null) return
    window.clearTimeout(reconnectTimerRef.current)
    reconnectTimerRef.current = null
  }, [])

  const handleMessage = useCallback(
    (msg: WSMessage) => {
      switch (msg.type) {
        case 'rooms_list': {
          const payload = msg.payload as { rooms?: RoomSummary[] }
          setRooms(Array.isArray(payload?.rooms) ? payload.rooms : [])
          return
        }
        case 'room_created': {
          const payload = msg.payload as { roomCode: string; playerId: string }
          storePlayerId(payload.roomCode, payload.playerId)
          roomSessionRef.current = {
            roomCode: payload.roomCode,
            roomPassword: roomSessionRef.current?.roomPassword ?? '',
            buyIn: roomSessionRef.current?.buyIn ?? 0,
          }
          log(`房间创建成功：${payload.roomCode}`)
          return
        }
        case 'room_joined': {
          const payload = msg.payload as { roomCode: string; playerId: string }
          storePlayerId(payload.roomCode, payload.playerId)
          roomSessionRef.current = {
            roomCode: payload.roomCode,
            roomPassword: roomSessionRef.current?.roomPassword ?? '',
            buyIn: roomSessionRef.current?.buyIn ?? 0,
          }
          log(`加入房间：${payload.roomCode}`)
          return
        }
        case 'profile': {
          const payload = msg.payload as PlayerProfile
          setProfile(payload)
          storeProfile(payload)
          return
        }
        case 'login_ok': {
          const payload = msg.payload as PlayerProfile
          setAuthState('authenticated')
          setProfile(payload)
          storeProfile(payload)
          log(`已登录：${payload.name}`)
          if (restoringRef.current) {
            const roomSession = roomSessionRef.current
            if (roomSession?.roomCode) {
              const rejoinMessage: WSMessage = {
                type: 'join_room',
                payload: {
                  playerName: payload.name,
                  roomCode: roomSession.roomCode,
                  playerId: getStoredPlayerId(roomSession.roomCode),
                  profileId: payload.id,
                  roomPassword: roomSession.roomPassword,
                  buyIn: roomSession.buyIn,
                },
              }
              const ws = wsRef.current
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(rejoinMessage))
              } else {
                pendingRef.current.push(rejoinMessage)
              }
            }
            restoringRef.current = false
          }
          return
        }
        case 'state': {
          const payload = msg.payload as StatePayload
          // Drop stale/out-of-order snapshots (e.g. buffered after a reconnect).
          if (typeof payload.stateSeq === 'number') {
            if (payload.stateSeq <= lastSeqRef.current) {
              return
            }
            lastSeqRef.current = payload.stateSeq
          }
          // A new hand started: clear the previous hand's settlement overlay.
          if (typeof payload.handId === 'number' && payload.handId !== lastHandRef.current) {
            lastHandRef.current = payload.handId
            setShowdown(null)
          }
          setState(payload)
          return
        }
        case 'chat_history': {
          const payload = msg.payload as { messages?: ChatMessage[] }
          setChat(Array.isArray(payload?.messages) ? payload.messages : [])
          return
        }
        case 'chat': {
          const payload = msg.payload as ChatMessage
          setChat((prev) => [...prev, payload])
          return
        }
        case 'showdown': {
          setShowdown(msg.payload as ShowdownPayload)
          return
        }
        case 'info': {
          const payload = msg.payload as { message: string }
          log(payload.message)
          return
        }
        case 'error': {
          const payload = msg.payload as { message: string; code?: string }
          setAuthState((current) => current === 'authenticating' ? 'anonymous' : current)
          log(`错误：${payload.message}`)
          // Prefer the structured code; fall back to the legacy message text.
          const roomGone = payload.code === 'room_not_found' || payload.message === '房间不存在'
          if (restoringRef.current || roomGone) {
            restoringRef.current = false
            roomSessionRef.current = null
            setState(null)
            setChat([])
            setShowdown(null)
            log('房间已失效，可能是服务重启或房间已解散；剩余筹码会在服务端结算回资料余额。')
          }
          return
        }
        case 'kicked': {
          const payload = msg.payload as { message: string }
          log(payload.message)
          setState(null)
          setChat([])
          setShowdown(null)
          roomSessionRef.current = null
          return
        }
        case 'room_dissolved': {
          const payload = msg.payload as { message: string }
          log(payload.message)
          setState(null)
          setChat([])
          setShowdown(null)
          roomSessionRef.current = null
          return
        }
        default: {
          log(`未知消息：${msg.type}`)
        }
      }
    },
    [log],
  )

  const scheduleReconnect = useCallback(() => {
    if (manualCloseRef.current || reconnectTimerRef.current !== null) return
    // Cap attempts and add jitter to avoid synchronized reconnect storms.
    const attempt = Math.min(reconnectAttemptsRef.current, 5)
    const base = Math.min(1000 * 2 ** attempt, 8000)
    const delay = base + Math.floor(Math.random() * 400)
    reconnectAttemptsRef.current += 1
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null
      restoringRef.current = loginRef.current !== null
      connectRef.current?.().catch(() => {
        log('自动重连失败，稍后重试')
      })
    }, delay)
  }, [log])

  const connect = useCallback(async () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      return
    }

    setConnectionState('connecting')
    manualCloseRef.current = false
    const ws = new WebSocket(serverUrl)
    wsRef.current = ws

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        setConnectionState('connected')
        reconnectAttemptsRef.current = 0
        // Reset sequence tracking: the server's StateSeq restarts per process,
        // so a reconnect should accept the next snapshot regardless of value.
        lastSeqRef.current = 0
        clearReconnectTimer()
        log('已连接服务器')
        resolve()
        if (restoringRef.current && loginRef.current) {
          pendingRef.current.unshift({ type: 'login', payload: loginRef.current })
        }
        const pending = pendingRef.current.splice(0)
        for (const message of pending) {
          ws.send(JSON.stringify(message))
        }
      }
      ws.onerror = () => {
        setConnectionState('error')
        setAuthState('anonymous')
        reject(new Error('ws error'))
      }
      ws.onclose = () => {
        setConnectionState('disconnected')
        if (loginRef.current) {
          setAuthState('authenticating')
          scheduleReconnect()
        } else {
          setAuthState('anonymous')
        }
        log('连接已断开')
      }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMessage
          handleMessage(msg)
        } catch {
          log('收到无法解析的服务器消息')
        }
      }
    })
  }, [clearReconnectTimer, handleMessage, log, scheduleReconnect, serverUrl])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  const send = useCallback(
    (type: string, payload: unknown) => {
      const ws = wsRef.current
      const msg: WSMessage = { type, payload }
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        if (!queueableMessageTypes.has(type)) {
          log('连接已断开，本次操作未发送，正在重连，请稍后重试')
          connect().catch(() => log('无法连接服务器'))
          return
        }
        pendingRef.current.push(msg)
        connect().catch(() => log('无法连接服务器'))
        return
      }
      ws.send(JSON.stringify(msg))
    },
    [connect, log],
  )

  useEffect(() => {
    return () => {
      manualCloseRef.current = true
      clearReconnectTimer()
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [clearReconnectTimer])

  const api = useMemo(() => {
    return {
      send,
      login: (payload: LoginPayload) => {
        loginRef.current = payload
        setAuthState('authenticating')
        send('login', payload)
      },
      getProfile: (payload: { playerId: string; name: string }) => send('get_profile', payload),
      updateProfile: (payload: { playerId: string; name: string }) => send('update_profile', payload),
      listRooms: () => send('list_rooms', {}),
      createRoom: (payload: CreateRoomPayload) => {
        roomSessionRef.current = {
          roomCode: '',
          roomPassword: payload.roomPassword,
          buyIn: payload.buyIn,
        }
        send('create_room', payload)
      },
      joinRoom: (payload: JoinRoomPayload) => {
        roomSessionRef.current = {
          roomCode: payload.roomCode,
          roomPassword: payload.roomPassword,
          buyIn: payload.buyIn,
        }
        send('join_room', payload)
      },
      startGame: () => send('start_game', {}),
      action: (payload: PlayerActionPayload) => send('action', payload),
      topUp: (payload: TopUpPayload) => send('top_up', payload),
      sitOut: () => send('sit_out', {}),
      sitIn: () => send('sit_in', {}),
      kickPlayer: (playerId: string) => send('kick_player', { playerId }),
      dissolveRoom: () => send('dissolve_room', {}),
      leaveRoom: () => {
        roomSessionRef.current = null
        send('leave_room', {})
      },
      chat: (payload: ChatPayload) => send('chat', payload),
    }
  }, [send])

  return {
    serverUrl,
    setServerUrl,
    connectionState,
    authState,
    rooms,
    state,
    chat,
    logs,
    showdown,
    profile,
    connect,
    api,
  }
}
