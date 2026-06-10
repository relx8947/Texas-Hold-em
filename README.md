# 局域网德州扑克平台（前后端分离）

本项目提供一个可在局域网内运行的德州扑克游戏平台：  
后端使用 Go + WebSocket + SQLite，前端为纯 Web 页面，无需构建工具即可运行。

## 功能概览
- 房间创建/加入（自定义玩家数量）
- 房间列表刷新
- 实时牌局状态同步
- 盲注、下注/加注、弃牌、摊牌
- 7 张牌组合评估（含同花顺/葫芦等）
- 侧池拆分与分配
- 房间聊天
- 买入/补码/离座/回座
- 房主踢人/解散房间
- 断线 5 分钟内重连保留座位与筹码
- 行动计时器（超时自动弃牌）

## 运行后端

```bash
cd server
go mod tidy
go run .
```

默认监听 `:8080`，WebSocket 地址为 `ws://<你的局域网IP>:8080/ws`。
数据文件默认保存在 `server/data.db`。

## 运行前端

在另一个终端启动静态服务器：

```bash
cd web
python3 -m http.server 5173
```

浏览器访问 `http://<你的局域网IP>:5173`，输入服务器地址与昵称即可创建或加入房间。

## 环境变量

- `ACTION_TIMEOUT_SECONDS`：行动倒计时秒数（默认 30）
- `DISCONNECT_TIMEOUT_MINUTES`：断线保留分钟数（默认 5）

## 协议说明（简要）

客户端向服务端发送：

```json
{ "type": "list_rooms", "payload": {} }
{ "type": "create_room", "payload": { "playerName": "Alice", "maxPlayers": 6, "buyIn": 2000 } }
{ "type": "join_room", "payload": { "playerName": "Bob", "roomCode": "AB12", "playerId": "xxxx", "buyIn": 2000 } }
{ "type": "start_game", "payload": {} }
{ "type": "action", "payload": { "action": "call" } }
{ "type": "action", "payload": { "action": "bet", "amount": 100 } }
{ "type": "action", "payload": { "action": "raise", "amount": 300 } }
{ "type": "action", "payload": { "action": "fold" } }
{ "type": "top_up", "payload": { "amount": 500 } }
{ "type": "sit_out", "payload": {} }
{ "type": "sit_in", "payload": {} }
{ "type": "kick_player", "payload": { "playerId": "xxxx" } }
{ "type": "dissolve_room", "payload": {} }
{ "type": "leave_room", "payload": {} }
{ "type": "chat", "payload": { "message": "Hello" } }
```

服务端广播：
- `state`：完整牌桌状态（含你的手牌）
- `info`：提示信息
- `error`：错误提示
- `rooms_list`：房间列表
- `room_created` / `room_joined`：房间加入确认（含 playerId，用于重连）
- `chat` / `chat_history`：房间聊天
- `kicked` / `room_dissolved`：被踢/房间解散
- `showdown`：摊牌详情与分池结果

## 规则说明（当前实现）
- 盲注：小盲 10，大盲 20
- 最小加注 = 上次加注幅度（首轮为大盲）
- 行动超时默认弃牌
- 断线 5 分钟内可重连（保留座位与筹码）

> 说明：房间/玩家/聊天已持久化到 SQLite（`server/data.db`），重启后可通过 `playerId` 重连。
