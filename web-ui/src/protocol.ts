export type WSMessage<T = unknown> = {
  type: string
  payload: T
}

export type CreateRoomPayload = {
  playerName: string
  maxPlayers: number
  buyIn: number
}

export type JoinRoomPayload = {
  playerName: string
  roomCode: string
  playerId: string
  buyIn: number
}

export type PlayerActionPayload = {
  action: 'fold' | 'check' | 'call' | 'bet' | 'raise'
  amount: number
}

export type TopUpPayload = {
  amount: number
}

export type ChatPayload = {
  message: string
}

export type RoomSummary = {
  code: string
  players: number
  connected: number
  maxPlayers: number
  stage: string
  hostName: string
  createdAt: number
}

export type PublicPlayer = {
  id: string
  name: string
  seat: number
  chips: number
  betRound: number
  totalBet: number
  folded: boolean
  allIn: boolean
  sittingOut: boolean
  dealer: boolean
  current: boolean
  connected: boolean
}

export type PrivatePlayer = {
  id: string
  name: string
  seat: number
  chips: number
  hole: string[]
  betRound: number
  totalBet: number
  folded: boolean
  allIn: boolean
  sittingOut: boolean
}

export type StatePayload = {
  roomCode: string
  maxPlayers: number
  stateSeq: number
  handId: number
  stage: string
  pot: number
  community: string[]
  players: PublicPlayer[]
  you: PrivatePlayer
  currentBet: number
  minRaise: number
  smallBlind: number
  bigBlind: number
  hostId: string
  actionDeadline: number
  serverTime: number
  lastEvent?: LastEvent | null
}

export type LastEvent = {
  kind: string
  playerId?: string
  action?: string
  amount?: number
  stage?: string
  seat?: number
}

export type ChatMessage = {
  name: string
  message: string
  time: number
}

export type ShowdownPlayer = {
  id: string
  name: string
  hole: string[]
  rank: string
  value: string
}

export type ShowdownWinner = {
  id: string
  name: string
  chipsWon: number
}

export type ShowdownResult = {
  potAmount: number
  winners: ShowdownWinner[]
}

export type ShowdownPayload = {
  community: string[]
  players: ShowdownPlayer[]
  results: ShowdownResult[]
}
