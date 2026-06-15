# ToDo List

## UI / 交互

- [x] 结算表现太单调，需要补充完整的结算展示与动效
  - 目标：让结算阶段更像正式游戏，而不是仅有基础状态切换
  - 建议补充：
    - 赢家高亮
    - 手牌与牌型展示
    - 主池 / 边池分配展示
    - 赢取筹码动画
    - 结算弹层或结算面板

- [x] 扑克牌点数显示里出现了 `T`
  - 问题：当前用 `T` 表示 10，不符合普通玩家对扑克牌点数的直觉
  - 期望：前端展示时把 `T` 改成 `10`
  - 说明：这可能是后端牌面编码沿用了德州常见简写，但 UI 层应转换为更自然的显示方式

- [x] 房主踢人功能
  - 目标：房主可以在游戏内选择玩家并将其踢出房间
  - 建议补充：
    - 仅房主可见踢人入口
    - 玩家头像 / 座位菜单中提供踢人按钮
    - 踢人前二次确认
    - 被踢玩家收到提示并返回未加入房间状态
    - 其他玩家同步房间状态

- [x] 游戏内各种操作缺乏动画，提醒效果不足
  - 现象：当前仅有少量基础动效（发牌 dealFly、底池 potPulse、行动气泡、结算面板），绝大多数关键操作缺乏动画与提示，玩家难以及时感知牌局变化
  - 已实现：
    - 轮到自己行动的强提醒：当前座位脉冲高亮 + 行动倒计时进度环（剩余时间不足时变红）+ 行动栏「轮到你」金色发光提示（`SeatView.turnTimer`、`ActionBar .yourTurn`）
    - 行动气泡（下注/跟注/加注/过牌/弃牌）保留并配合座位高亮
    - 下注筹码标签弹入动画（`betPop`）
    - 底池增减时的高亮跳动（`potBump`）
    - 阶段切换提示：翻牌/转牌/河牌 toast 过渡（`stageToast`）
    - 赢家高亮：赢得底池的座位短暂发光（`winnerGlow`）
    - 倒计时基于服务端 `actionDeadline`/`serverTime` 并校正客户端时钟漂移
    - 尊重 `prefers-reduced-motion` 关闭动画

## 玩家资料 / 数据持久化

- [x] 本地 SQLite 记录玩家数据
  - 目标：使用本地 SQLite 保存每个玩家的长期资料，而不是每次进入都重新生成
  - 建议补充：
    - 玩家唯一 ID
    - 玩家昵称
    - 随机生成的 GitHub 风格 icon 头像
    - 头像种子或头像配置，保证同一玩家头像稳定一致
    - 筹码、战绩、历史对局等后续可扩展字段

- [x] 个人主页与昵称修改
  - 目标：玩家可以进入个人主页设置或修改自己的昵称
  - 建议补充：
    - 首页 / 游戏内入口进入个人主页
    - 昵称输入、保存与校验
    - 修改后同步更新座位、房间列表、聊天等展示位置
    - 昵称与本地 SQLite 玩家资料绑定

## Bug / 数据一致性

- [x] 个人资料 ID 与旧房间座位 ID 割裂，导致昵称看起来没有同步
  - 现象：`profiles` 表中的长期玩家昵称已落库，但旧房间的 `players` 表记录可能仍使用旧 `playerId` 和旧昵称
  - 示例：`profiles.id=52d3960c` 昵称为 `relx5`，但 `players.id=067be821` 的房间座位昵称仍为 `oceanai`
  - 影响：用户修改个人主页昵称后，重连旧房间时可能看到座位昵称仍是旧值，表现为“昵称没有落库”或“昵称没有同步”
  - 原因：当前新个人资料 ID 和旧房间座位 ID 没有绑定/迁移关系，`getStoredPlayerId(roomCode)` 会优先使用旧房间 ID
  - 建议修复：
    - 设计 profile ID 与 room player ID 的绑定策略
    - 加入/重连房间时如果存在当前 profile，应同步 `players.name` 与 `players.avatar_seed`
    - 对旧数据做一次兼容迁移或在重连时自动修复
    - 前端避免长期 profile ID 与按房间存储的 player ID 互相覆盖

- [x] 房主点击开始后游戏只进行一轮就结束，第二轮还需房主再次点击开始
  - 现象：房主点击「开始」后只打完一手牌（一轮），牌局即回到等待状态，下一手必须房主再次点击「开始」
  - 已修复：手牌结算后由 `scheduleNextHandLocked` 在 `NEXT_HAND_DELAY_SECONDS`（默认 6 秒）后自动开下一手；房间默认 `AutoContinue=true`；可参与玩家不足 2 人时回到等待。涉及 `server/server.go` 的 `onHandEndedLocked`/`scheduleNextHandLocked`/`startNextHand`

- [x] 每个玩家需要记录长期总筹码，初始为 100000
  - 目标：区分玩家账户总筹码和单个房间内桌面筹码
  - 规则：
    - 新玩家 `profiles.chips` 初始为 `100000`
    - 创建 / 加入房间买入时，从长期总筹码扣除买入金额
    - 补码时从长期总筹码扣除补码金额
    - 离开房间、被踢、断线超时清理、解散房间时，将桌面剩余筹码返还长期总筹码
    - 前端个人资料和 HUD 展示长期总筹码

## 项目扫描发现的问题（2026-06-15 全量扫描）

> 通过对 server/ 后端、web-ui/ 前端、Docker/构建/配置三部分的全量扫描整理。按严重程度分级。
>
> 状态：本轮已全部实现修复。后端 go build / go vet / go test（含 -race）通过，新增除零/退还/单挑回归测试；前端 eslint / tsc / vite build 通过。

### 严重 (Critical)

- [x] 摊牌分池可能除零 panic，并导致房间永久死锁
  - 位置：`server/game.go:317-319`（`share := pot.Amount / len(winners)`），根因在 `buildSidePots`（`server/game.go:385-432`）
  - 原因：当唯一最高下注者弃牌（超时自动弃牌 `server/server.go:1333` 或坐出/强制弃牌 `server/server.go:668`）而仍有 ≥2 人摊牌时，未跟注的多余筹码会形成无人有资格的边池，`len(winners)==0` 触发除零 panic
  - 连锁问题：`ApplyAction` 在 `room.mu.Lock()` 后未用 `defer` 解锁（`server/server.go:577-587`、超时路径 `1318-1335`），panic 后锁不释放，该房间所有后续请求永久死锁、goroutine 堆积
  - 修复：建池前先退还未被跟注的多余下注（按第二高下注封顶）；对 `len(winners)==0`/`len(pot.Eligible)==0` 做保护；用 `defer` + `recover()` 确保锁释放

- [~] 账号登录无密码校验（不修复 / 设计如此）
  - 说明：这是局域网好友局的有意设计——仅凭用户名即可进入，追求简便体验，不引入账号密码。
  - 之前误当作漏洞加了 bcrypt 密码登录，已回退为仅用户名登录。`users.password_hash` 字段保留为空、不使用。

### 高 (High)

- [x] 旧连接的断线处理会误杀已重连的玩家
  - 位置：`server/server.go:782-799`（重连）、`696-698`（handler 退出）、`1132-1152`（`handleDisconnect`）
  - 原因：重连时 `joinRoom` 重新赋值 `p.Conn` 但未关闭旧连接，旧 `handleWS` goroutine 最终报错时会对当前在线玩家执行 `handleDisconnect`，把活跃玩家置为离线并启动移除计时器；同时旧连接泄漏
  - 修复：重连时关闭旧 `p.Conn`；`handleDisconnect`/`handleWS` 仅在关闭的 conn 仍是玩家当前 conn 时才处理（比较 conn 身份）

- [x] 单挑（两人）盲注与首个行动位反了
  - 位置：`server/game.go:66-79`
  - 原因：两人时 dealer 反而下大盲、非 dealer 下小盲；翻牌前由小盲（非 dealer）先行动，与单挑规则（dealer 即小盲且翻牌前先行动）相反
  - 修复：单挑特殊处理，dealer 为小盲且翻牌前先行动

- [x] WS handler 与计时器 goroutine 无 panic 恢复
  - 位置：`server/server.go:410-699`（`handleWS`）、`1313-1338`、`1146-1148`
  - 原因：任何 panic 会让 goroutine 崩溃；若发生在持有 `room.mu` 时（无 defer 解锁）会导致房间死锁
  - 修复：在 `handleWS` 与每个 `time.AfterFunc` 回调里加 `defer recover()`；锁一律用 `defer` 释放

- [x] 洗牌使用 math/rand，牌序可预测
  - 位置：`server/game.go:34`、`477-481`
  - 原因：用 `time.Now().UnixNano()` 播种 `math/rand`，可被预测/推算底牌与公共牌
  - 修复：改用 `crypto/rand` 洗牌

- [x] 前端不去重/不排序 state 消息，过期快照会覆盖新状态
  - 位置：`web-ui/src/protocol.ts:87`（定义了 `stateSeq`）、`web-ui/src/usePokerClient.ts:157-160`（每条 state 都直接 `setState`，从不校验序号）
  - 原因：重连或 WS 缓冲下，过期快照可能晚到并覆盖较新状态，显示错误的底池/行动权/牌面
  - 修复：维护 `lastSeqRef`，丢弃 `stateSeq <= lastSeqRef` 的 state

- [x] 断线期间游戏内操作被静默丢弃
  - 位置：`web-ui/src/usePokerClient.ts:296-305`
  - 原因：非排队类操作（`action`/`fold`/`call`/`sit_out` 等）在 socket 未 OPEN 时仅打日志后返回，不发送也不排队，短暂断线会丢失弃牌/跟注导致超时
  - 修复：对关键操作排队重发，或弹出明确错误提示用户重试

- [x] 结算面板在下一手开始时不会清除，遮挡牌桌
  - 位置：`web-ui/src/usePokerClient.ts:190,200,209`（仅 error/kicked/room_dissolved 时清）、`GameShell.tsx:101-105,481`
  - 原因：新一手（新 `handId`）开始时不清 `showdown`，上一手结算浮层一直盖在实时牌桌上
  - 修复：`handId` 推进时清除 `showdown`，或超时自动消失

- [x] 短码玩家合法全下被前端禁用
  - 位置：`web-ui/src/components/game/ActionBar.tsx:24,27,29,42,51,88-112`
  - 原因：`canRaise = maxValue >= minValue`，当筹码不足一个最小加注但可合法全下时，加注框与「All-in」按钮都被禁用
  - 修复：即使低于最小加注阈值，也允许以 `maxValue` 全下

- [x] SPA 深链接/刷新返回纯文本而非 index.html
  - 位置：`server/main.go:49-76`（`serveStaticOrStatus`）
  - 原因：非根、非已存在文件的路径返回字面量字符串 "Texas Hold'em LAN server running"，SPA 子路由刷新会白屏/坏页；`index.html` 仅在精确 `/` 提供
  - 修复：对无匹配文件的非 API GET 回退到 `index.html`，缺失资源返回正确 404

- [~] 房间口令用无盐 SHA-256（按现状保留）
  - 位置：`hashSecret`
  - 说明：账号已无密码（设计如此）。仅剩房间口令使用 SHA-256；房间口令是低价值、临时、共享的进房凭证，局域网场景下按现状保留，不引入 bcrypt。

- [x] 依赖陈旧，含已知 CVE
  - 位置：`server/go.mod`/`go.sum`：`golang.org/x/net v0.17.0`（HTTP/2 CVE）、`google/uuid v1.3.0`、`modernc.org/sqlite v1.27.0`；go.mod 声明 `go 1.21`，本机 `go1.25.5`
  - 修复：升级 x/net 到修复版、更新 sqlite，运行 `go get -u` + `govulncheck`，对齐 go 版本

### 中 (Medium)

- [x] broadcast 时对 `Player.Conn` 存在数据竞争且索引可能错位
  - 位置：`server/server.go:1454-1464`（解锁后发送）、`814`/`782`（持锁写 `p.Conn`）
  - 修复：在持锁时把 conn 与对应 state 一起快照配对，解锁后再发送

- [x] 持有 `room.mu` 期间执行网络写
  - 位置：`server/game.go:339-343`（`resolveShowdown` 内 `broadcastShowdown`）、`444`（`broadcastInfo`）、`server/server.go:1540-1568`
  - 原因：单个慢客户端的写超时（最长 10s）会阻塞整房互斥锁
  - 修复：持锁收集消息，解锁后再发送（参考 `broadcastState`）

- [x] 持有 `room.mu` 期间执行数据库 I/O
  - 位置：`server/server.go:1229-1238`（`settlePlayerBankrollLocked`→SQL），由 `removePlayerLocked`/`cleanupPendingRemovalsLocked`/`dissolveRoom` 调用
  - 修复：持锁汇总结算增量，解锁后写库；为 SQLite 配置 `_busy_timeout`、WAL

- [x] 重启恢复筹码可能静默丢失
  - 位置：`server/server.go:377-383`（`settleStoredPlayerRecord`）、`310-332`
  - 原因：`ProfileID` 为空时回退用玩家 `ID`（非 profile id），UPDATE 影响 0 行，筹码丢失；错误被 `_ =` 丢弃
  - 修复：仅在存在有效 profile id 时返还；处理错误与 0 行情况

- [x] 每次广播都全量持久化（写放大）
  - 位置：`server/server.go:1465`、`1570-1578`
  - 原因：每个动作都 upsert 房间和所有玩家行，加重锁/IO
  - 修复：仅在关键状态变化（加入/离开/手牌结束）持久化或做防抖

- [x] 短暂断线即在宽限期内被罚弃整手牌
  - 位置：`server/game.go:59`、`358`/`455`
  - 原因：`Folded = !p.Connected || ...`，宽限窗内断线玩家被自动弃牌；宽限仅保住座位不保参与
  - 修复：明确预期行为，宽限期内不应仅因 `!Connected` 弃牌

- [x] 前端对所有 WS payload 无运行时校验（大量 `as` 断言）
  - 位置：`web-ui/src/usePokerClient.ts:90-216`、`protocol.ts:1-4`
  - 修复：引入轻量 schema 校验（如 zod）或加防御性检查

- [x] ActionBar 下注滑块状态跨手/跨轮陈旧
  - 位置：`web-ui/src/components/game/ActionBar.tsx:31,33`
  - 原因：`slider` 仅初始化一次，新一轮 min/max 变化时不重置，默认下注可能停留在上一轮
  - 修复：以 `handId`/`currentBet`/`isYourTurn` 为 key 的 effect 重置 `slider`

- [x] 跟注按钮显示金额可能超过自身筹码
  - 位置：`web-ui/src/components/game/ActionBar.tsx:19,81`
  - 修复：显示 `Math.min(callNeeded, you.chips)`

- [x] 后端错误处理耦合具体中文字符串
  - 位置：`web-ui/src/usePokerClient.ts:185`（判断 `message === '房间不存在'`）
  - 修复：改用结构化 error `code` 字段

- [x] profile effect 会在编辑昵称时覆盖输入框
  - 位置：`web-ui/src/components/GameShell.tsx:92-99,224,313`
  - 修复：输入框只初始化一次，不持续从服务端同步进可编辑字段

- [x] 无开发代理 / WS URL 无环境变量配置
  - 位置：`web-ui/vite.config.ts:5-7`、`web-ui/src/usePokerClient.ts:34-37,69`
  - 原因：vite dev 无 `server.proxy`，默认 WS 指向 dev 服务器；无 `VITE_*` 支持；手填 serverUrl 不持久化
  - 修复：加代理和/或 `VITE_WS_URL`，并持久化覆盖值

- [x] WS Origin 校验默认对私网/回环一律放行
  - 位置：`server/server.go:1651-1690`（`isAllowedWSOrigin`）
  - 原因：空 Origin 返回 true；任意回环或 RFC1918 私网 Origin 均放行，`ALLOWED_ORIGINS` 在私网被绕过，存在跨站 WS 劫持风险
  - 修复：显式设置 `ALLOWED_ORIGINS` 时严格执行；或将私网放行用 `LAN_MODE` 开关控制

- [x] 无最大买入 / 补码上限
  - 位置：`server/server.go:1783-1788`（`sanitizeBuyIn`）、`629-658`（`top_up`）
  - 原因：买入仅下限保护无上限，补码仅校验 `>0`，玩家可把整个 bankroll 押到一桌
  - 修复：增加台桌买入上限

- [x] 基础镜像未按 digest 锁定；DATA_PATH 默认相对 CWD；compose 无 healthcheck；.env.example 不全
  - 位置：`Dockerfile:1,8,15`、`server/config.go:30`、`docker-compose.yml`、`.env.example`
  - 修复：镜像按 `@sha256` 锁定（考虑 Node 22 LTS）；DATA_PATH 默认绝对/专用目录并记录备份；补全 `.env.example` 与 README 中所有环境变量（`ADDR`/`DATA_PATH`/`STATIC_DIR`/`WS_*` 等）

### 低 (Low)

- [x] 删除遗留空目录 `web/`（`web/src` 为空，易混淆），Dockerfile 镜像内前端目录是 `/app/web` 与其无关
- [x] CardView 每张牌硬编码相同 SVG `id="shine"`（`web-ui/src/components/game/CardView.tsx:43`），导致重复 id，应按实例生成唯一 id（参考 PlayerAvatar 做法）
- [x] 死代码组件 `Lobby.tsx`/`TableShell.tsx` 从未渲染（`App.tsx:5` 只渲染 GameShell）且 prop 类型与真实 API 不符，应删除或接入
- [x] `GameShell.tsx:88,94-97,103` 在 effect 里用 `queueMicrotask` 包裹 setState 无必要，简化
- [x] 手动「连接」按钮无 `.catch` 导致未处理的 Promise rejection（`GameShell.tsx:199`）
- [x] ESLint `ecmaVersion:2020` 与 tsconfig `ES2022` 不一致；`index.html` `lang="en"`、title 为 `web-ui`、favicon 仍是 Vite 默认，应本地化
- [x] 可访问性：下注 range 输入缺 `aria-label`/`aria-valuetext`，图标/状态标签缺 label；重连退避无最大次数与抖动
- [x] `mustJSON` 吞掉 marshal 错误（`server/server.go:1712-1715`）；DDL 字符串拼接（`storage.go:160-182`）；聊天消息无长度上限（`server/server.go:1370-1391`）；不可整除底池余数分配顺序非标准（`server/game.go:320-332`）；`update_profile` 可在会话中重绑 profile（`server/server.go:485-498`）

## 玩法完善度评估（2026-06-15 复盘）

> 评估结论：核心规则正确、能完整玩完一局，关键 bug 已修；但离「足够完善」仍有距离，主要卡在断线罚牌与无声音提醒等高频体验问题。下列按优先级排列。
>
> 状态：本轮已全部实现。后端 go build / go vet / go test（含 -race）通过，新增断线宽限/观战/锦标赛/庄家轮转回归测试；前端 eslint / tsc / vite build 通过。

### 高优先级（最影响实际体验）

- [x] 短暂断线会被罚没整手牌
  - 现象：`StartHand`/手结束重置里 `Folded = !p.Connected`，wifi 抖动、切后台、手机锁屏都会让当前这手直接判弃
  - 已修复：`StartHand`/`endHandReset` 不再因 `!Connected` 自动弃牌；断线宽限期内玩家仍被发牌、留在本手；超时由「智能托管」处理（见下）。新增 `TestDisconnectedPlayerStaysInHand`
  - 位置：`server/game.go`（`StartHand`、`endHandReset`）、超时托管 `server/server.go handleActionTimeout`

- [x] 轮到行动缺少声音/强提醒
  - 已实现：轮到自己时播放 Web Audio 提示音（双音叮咚）+ 标签页隐藏时标题闪烁「⏰ 轮到你行动！」；HUD 提供 🔔/🔕 可关闭的音效开关（持久化到 localStorage）
  - 位置：`web-ui/src/components/GameShell.tsx`（`playTurnChime`、isYourTurn effects、soundOn 开关）

- [x] 筹码归零后缺少补码引导
  - 已实现：筹码为 0 且非观战时，行动区上方显示醒目红色「筹码不足，无法参与下一手」横幅与「一键补码」按钮
  - 位置：`web-ui/src/components/GameShell.tsx`（`brokeBanner`）、`GameShell.css`

- [x] 移动端牌桌布局拥挤
  - 已实现：≤560px 断点整体缩放椭圆桌、缩小座位/头像/手牌/公共牌，行动栏改为纵向堆叠、滑块占满宽度
  - 位置：`web-ui/src/components/GameShell.css`、`game.css`

### 中优先级（功能缺失，视定位取舍）

- [x] 服务器重启会丢失进行中的牌局
  - 已实现：启动恢复时对每个房间记录明确日志（筹码已退回 bankroll、进行中的牌局被丢弃）；前端在重连命中 `room_not_found` 时已给出「房间已失效，可能是服务重启…剩余筹码会结算回资料余额」的明确提示
  - 位置：`server/server.go LoadFromStorage`、`web-ui/src/usePokerClient.ts`

- [x] 没有锦标赛模式（盲注递增）
  - 已实现：创建房间可勾选「锦标赛模式」并设置每多少手升盲；服务端按 15 级盲注表在每手开始时升盲并广播提示，HUD 显示当前盲注级别/盲注/距离升盲手数。新增 `TestTournamentBlindsIncrease`
  - 位置：`server/server.go`（`blindSchedule`、`applyBlindLevelLocked`）、`game.go StartHand`、前端 protocol/GameShell

- [x] 缺少牌局历史 / 战绩回看
  - 已实现：每手结束按 profile 落库手牌历史（净盈亏、底牌、阶段）并累计 hands_played/won/net_profit；HUD「战绩」按钮拉取并展示最近 100 手历史弹层
  - 位置：`server/storage.go`（`hand_history` 表、`RecordHandResult`/`LoadHandHistory`）、`server.go recordHandStatsLocked`、前端 `HistoryPanel`

- [x] 缺少观战模式与「准备」状态
  - 已实现：加入房间可选「观战加入」（占座但不发牌、不买入）；观战者补码/入座后参与下一手；等待阶段提供「我已准备」开关并在座位上显示「已准备」徽标；牌桌顶部显示观战者列表。新增 `TestSpectatorNotDealtIn`
  - 位置：`server/server.go`（spectator/ready 字段与处理）、`game.go`（eligibility 排除观战）、前端 protocol/GameShell/SeatView

### 低优先级（健壮性/边角）

- [x] 庄家按钮在有人离座/输光/中途加入时的轮转缺专门测试覆盖
  - 已实现：新增 `TestDealerRotatesToNextEligibleSeat`、`TestDealerSkipsBustedPlayer`
- [x] 超时托管过于粗暴
  - 已实现：超时改为「能过牌则自动过牌，否则才弃牌」的智能托管，并相应提示「超时自动过牌/弃牌」
  - 位置：`server/server.go handleActionTimeout`
