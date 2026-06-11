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

默认服务地址为 `http://localhost:8080`。首次进入需要注册用户，之后登录成功才能进入房间大厅和牌桌界面。

## 关键环境变量

- `ADDR`: 后端监听地址，默认 `:8080`
- `DATA_PATH`: SQLite 数据路径，默认 `data.db`
- `STATIC_DIR`: 前端静态文件目录，默认 `../web-ui/dist`
- `ALLOWED_ORIGINS`: 允许的 Origin，多个值用逗号分隔
- `WS_READ_LIMIT_BYTES`: 单条 WebSocket 消息大小限制，默认 `4096`
