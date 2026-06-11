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

function storageKey(roomCode: string) {
  return `playerId:${roomCode.toUpperCase()}`
}

const profileStorageKey = 'playerProfileId'

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
  const pendingRef = useRef<WSMessage | null>(null)

  const [serverUrl, setServerUrl] = useState<string>(
    `ws://${location.hostname}:8080/ws`,
  )
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

  const handleMessage = useCallback(
    (msg: WSMessage) => {
      switch (msg.type) {
        case 'rooms_list': {
          const payload = msg.payload as { rooms: RoomSummary[] }
          setRooms(payload.rooms ?? [])
          return
        }
        case 'room_created': {
          const payload = msg.payload as { roomCode: string; playerId: string }
          storePlayerId(payload.roomCode, payload.playerId)
          log(`房间创建成功：${payload.roomCode}`)
          return
        }
        case 'room_joined': {
          const payload = msg.payload as { roomCode: string; playerId: string }
          storePlayerId(payload.roomCode, payload.playerId)
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
          return
        }
        case 'state': {
          const payload = msg.payload as StatePayload
          setState(payload)
          return
        }
        case 'chat_history': {
          const payload = msg.payload as { messages: ChatMessage[] }
          setChat(payload.messages ?? [])
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
          const payload = msg.payload as { message: string }
          setAuthState((current) => current === 'authenticating' ? 'anonymous' : current)
          log(`错误：${payload.message}`)
          return
        }
        case 'kicked': {
          const payload = msg.payload as { message: string }
          log(payload.message)
          setState(null)
          setChat([])
          setShowdown(null)
          return
        }
        case 'room_dissolved': {
          const payload = msg.payload as { message: string }
          log(payload.message)
          setState(null)
          setChat([])
          setShowdown(null)
          return
        }
        default: {
          log(`未知消息：${msg.type}`)
        }
      }
    },
    [log],
  )

  const connect = useCallback(async () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      return
    }

    setConnectionState('connecting')
    const ws = new WebSocket(serverUrl)
    wsRef.current = ws

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        setConnectionState('connected')
        log('已连接服务器')
        resolve()
        if (pendingRef.current) {
          ws.send(JSON.stringify(pendingRef.current))
          pendingRef.current = null
        }
      }
      ws.onerror = () => {
        setConnectionState('error')
        setAuthState('anonymous')
        reject(new Error('ws error'))
      }
      ws.onclose = () => {
        setConnectionState('disconnected')
        setAuthState('anonymous')
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
  }, [handleMessage, log, serverUrl])

  const send = useCallback(
    (type: string, payload: unknown) => {
      const ws = wsRef.current
      const msg: WSMessage = { type, payload }
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        pendingRef.current = msg
        connect().catch(() => log('无法连接服务器'))
        return
      }
      ws.send(JSON.stringify(msg))
    },
    [connect, log],
  )

  useEffect(() => {
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [])

  const api = useMemo(() => {
    return {
      send,
      login: (payload: LoginPayload) => {
        setAuthState('authenticating')
        send('login', payload)
      },
      getProfile: (payload: { playerId: string; name: string }) => send('get_profile', payload),
      updateProfile: (payload: { playerId: string; name: string }) => send('update_profile', payload),
      listRooms: () => send('list_rooms', {}),
      createRoom: (payload: CreateRoomPayload) => send('create_room', payload),
      joinRoom: (payload: JoinRoomPayload) => send('join_room', payload),
      startGame: () => send('start_game', {}),
      action: (payload: PlayerActionPayload) => send('action', payload),
      topUp: (payload: TopUpPayload) => send('top_up', payload),
      sitOut: () => send('sit_out', {}),
      sitIn: () => send('sit_in', {}),
      kickPlayer: (playerId: string) => send('kick_player', { playerId }),
      dissolveRoom: () => send('dissolve_room', {}),
      leaveRoom: () => send('leave_room', {}),
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
