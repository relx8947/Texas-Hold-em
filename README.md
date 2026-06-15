# Texas Hold'em

一个可以在局域网内和亲朋好友一起玩的德州扑克游戏。

## 本地运行

后端：

```bash
cd server
go run .
```

前端开发：

```bash
cd web-ui
npm install
npm run dev
```

## Docker 运行

```bash
cp .env.example .env
docker compose up --build
```

默认服务地址为 `http://localhost:8080`。首次输入新用户名加密码会自动注册账号；已存在用户名会校验密码后登录并进入房间大厅。

## 关键环境变量

- `ADDR`: 后端监听地址，默认 `:8080`
- `DATA_PATH`: SQLite 数据路径，默认 `data.db`（容器内为 `/data/data.db`，本地 `go run .` 会写到 `server/data.db`）
- `STATIC_DIR`: 前端静态文件目录，默认 `../web-ui/dist`
- `ALLOWED_ORIGINS`: 允许的 Origin，多个值用逗号分隔；**设置后将严格校验**（不再放行任意内网/回环 Origin）
- `WS_READ_LIMIT_BYTES`: 单条 WebSocket 消息大小限制，默认 `4096`
- `WS_WRITE_TIMEOUT_SECONDS` / `WS_PONG_TIMEOUT_SECONDS` / `WS_PING_INTERVAL_SECONDS`: WebSocket 心跳相关超时
- `ACTION_TIMEOUT_SECONDS`: 玩家行动超时自动弃牌，默认 `30`
- `DISCONNECT_TIMEOUT_MINUTES`: 断线保留座位的超时，默认 `5`
- `NEXT_HAND_DELAY_SECONDS`: 一手牌结算后自动开始下一手的延迟，默认 `6`，设为 `0` 立即开始

数据通过 docker compose 命名卷 `texas_holdem_data` 持久化，备份时直接备份该卷或 `DATA_PATH` 指向的文件（含 `-wal`/`-shm`）。
