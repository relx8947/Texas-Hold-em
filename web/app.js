const serverUrlInput = document.getElementById("serverUrl");
const playerNameInput = document.getElementById("playerName");
const maxPlayersInput = document.getElementById("maxPlayers");
const roomCodeInput = document.getElementById("roomCode");
const buyInInput = document.getElementById("buyIn");
const createRoomBtn = document.getElementById("createRoom");
const joinRoomBtn = document.getElementById("joinRoom");
const refreshRoomsBtn = document.getElementById("refreshRooms");
const roomsListEl = document.getElementById("roomsList");
const currentRoomEl = document.getElementById("currentRoom");
const connectionStateEl = document.getElementById("connectionState");
const communityCardsEl = document.getElementById("communityCards");
const holeCardsEl = document.getElementById("holeCards");
const potValueEl = document.getElementById("potValue");
const stageValueEl = document.getElementById("stageValue");
const countdownEl = document.getElementById("countdown");
const playersListEl = document.getElementById("playersList");
const startGameBtn = document.getElementById("startGame");
const checkCallBtn = document.getElementById("checkCall");
const foldBtn = document.getElementById("fold");
const betAmountInput = document.getElementById("betAmount");
const betRaiseBtn = document.getElementById("betRaise");
const topUpInput = document.getElementById("topUpAmount");
const topUpBtn = document.getElementById("topUp");
const sitToggleBtn = document.getElementById("sitToggle");
const leaveRoomBtn = document.getElementById("leaveRoom");
const dissolveRoomBtn = document.getElementById("dissolveRoom");
const actionHintEl = document.getElementById("actionHint");
const chatListEl = document.getElementById("chatList");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSend");
const logEl = document.getElementById("log");

let ws = null;
let currentState = null;
let pendingAction = null;
let timeOffset = 0;
let countdownTimer = null;

function parseCard(card) {
  if (!card || card.length < 2) {
    return { rank: "", suit: "", suitSymbol: "", isBack: true };
  }
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const suitMap = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const suitSymbol = suitMap[suit] || "";
  const isBack = rank === "?" || suit === "?";
  return { rank, suit, suitSymbol, isBack };
}

function createCardElement(card) {
  const { rank, suit, suitSymbol, isBack } = parseCard(card);
  const el = document.createElement("div");
  el.className = "card";
  if (isBack) {
    el.classList.add("back");
    return el;
  }
  if (suit === "H" || suit === "D") {
    el.classList.add("red");
  }
  el.innerHTML = `
    <div class="rank top">${rank}</div>
    <div class="suit">${suitSymbol}</div>
    <div class="rank bottom">${rank}</div>
  `;
  return el;
}

function log(message) {
  const item = document.createElement("div");
  item.className = "item";
  item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logEl.prepend(item);
}

function addChat(message) {
  const item = document.createElement("div");
  item.className = "chat-item";
  item.textContent = `[${new Date(message.time * 1000).toLocaleTimeString()}] ${message.name}: ${message.message}`;
  chatListEl.appendChild(item);
  chatListEl.scrollTop = chatListEl.scrollHeight;
}

function setConnectionState(text) {
  connectionStateEl.textContent = text;
}

function storageKey(roomCode) {
  return `playerId:${roomCode}`;
}

function getStoredPlayerId(roomCode) {
  return localStorage.getItem(storageKey(roomCode)) || "";
}

function storePlayerId(roomCode, playerId) {
  if (!roomCode || !playerId) return;
  localStorage.setItem(storageKey(roomCode), playerId);
}

function connect() {
  return new Promise((resolve, reject) => {
    const url = serverUrlInput.value.trim() || `ws://${location.hostname}:8080/ws`;
    serverUrlInput.value = url;
    ws = new WebSocket(url);
    setConnectionState("连接中...");
    ws.onopen = () => {
      setConnectionState("已连接");
      log("已连接服务器");
      resolve();
      if (pendingAction) {
        sendMessage(pendingAction.type, pendingAction.payload);
        pendingAction = null;
      }
    };
    ws.onclose = () => {
      setConnectionState("已断开");
      log("连接已断开");
    };
    ws.onerror = () => {
      setConnectionState("连接错误");
      reject();
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    };
  });
}

function sendMessage(type, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    pendingAction = { type, payload };
    connect().catch(() => log("无法连接服务器"));
    return;
  }
  ws.send(JSON.stringify({ type, payload }));
}

function handleMessage(msg) {
  switch (msg.type) {
    case "room_created":
      currentRoomEl.textContent = msg.payload.roomCode;
      storePlayerId(msg.payload.roomCode, msg.payload.playerId);
      log(`房间创建成功：${msg.payload.roomCode}`);
      break;
    case "room_joined":
      currentRoomEl.textContent = msg.payload.roomCode;
      storePlayerId(msg.payload.roomCode, msg.payload.playerId);
      log(`加入房间：${msg.payload.roomCode}`);
      break;
    case "rooms_list":
      renderRooms(msg.payload.rooms || []);
      break;
    case "state":
      currentState = msg.payload;
      currentRoomEl.textContent = currentState.roomCode;
      storePlayerId(currentState.roomCode, currentState.you.id);
      timeOffset = currentState.serverTime - Date.now();
      renderState(currentState);
      startCountdown();
      break;
    case "chat_history":
      chatListEl.innerHTML = "";
      msg.payload.messages.forEach((m) => addChat(m));
      break;
    case "chat":
      addChat(msg.payload);
      break;
    case "info":
      log(msg.payload.message);
      break;
    case "error":
      log(`错误：${msg.payload.message}`);
      break;
    case "kicked":
      log(msg.payload.message);
      resetRoomState();
      break;
    case "room_dissolved":
      log(msg.payload.message);
      resetRoomState();
      break;
    case "showdown":
      renderShowdown(msg.payload);
      break;
    default:
      log(`未知消息：${msg.type}`);
  }
}

function resetRoomState() {
  currentState = null;
  currentRoomEl.textContent = "未加入";
  playersListEl.innerHTML = "";
  communityCardsEl.innerHTML = "";
  holeCardsEl.innerHTML = "";
  potValueEl.textContent = "0";
  stageValueEl.textContent = "waiting";
  countdownEl.textContent = "";
  chatListEl.innerHTML = "";
}

function renderRooms(rooms) {
  roomsListEl.innerHTML = "";
  if (!rooms.length) {
    roomsListEl.textContent = "暂无房间";
    return;
  }
  rooms.forEach((room) => {
    const card = document.createElement("div");
    card.className = "room-card";
    card.innerHTML = `
      <div class="room-title">${room.code}</div>
      <div class="room-meta">玩家：${room.players}/${room.maxPlayers}（在线 ${room.connected}）</div>
      <div class="room-meta">阶段：${room.stage}</div>
      <div class="room-meta">房主：${room.hostName || "未知"}</div>
      <button class="room-join">加入</button>
    `;
    card.querySelector(".room-join").addEventListener("click", () => {
      roomCodeInput.value = room.code;
      joinRoomBtn.click();
    });
    roomsListEl.appendChild(card);
  });
}

function renderState(state) {
  potValueEl.textContent = state.pot;
  stageValueEl.textContent = state.stage;
  communityCardsEl.innerHTML = "";
  holeCardsEl.innerHTML = "";
  state.community.forEach((card) => {
    communityCardsEl.appendChild(createCardElement(card));
  });
  state.you.hole.forEach((card) => {
    holeCardsEl.appendChild(createCardElement(card));
  });

  playersListEl.innerHTML = "";
  state.players.forEach((player) => {
    const row = document.createElement("div");
    row.className = "player";
    if (player.current) row.classList.add("current");
    const tags = [];
    if (player.dealer) tags.push("庄家");
    if (player.current) tags.push("行动中");
    if (player.folded) tags.push("弃牌");
    if (player.allIn) tags.push("All-in");
    if (player.sittingOut) tags.push("离座");
    if (!player.connected) tags.push("离线");
    row.innerHTML = `
      <div class="name">#${player.seat + 1} ${player.name} ${
      tags.length ? `<span class="tag">${tags.join(" / ")}</span>` : ""
    }</div>
      <div>筹码：${player.chips}</div>
      <div>本轮投入：${player.betRound}</div>
      <div>总投入：${player.totalBet}</div>
    `;
    if (state.hostId === state.you.id && player.id !== state.you.id) {
      const kickBtn = document.createElement("button");
      kickBtn.className = "mini";
      kickBtn.textContent = "踢人";
      kickBtn.addEventListener("click", () => {
        sendMessage("kick_player", { playerId: player.id });
      });
      row.appendChild(kickBtn);
    }
    playersListEl.appendChild(row);
  });

  const you = state.you;
  const callNeeded = Math.max(0, state.currentBet - you.betRound);
  if (callNeeded > 0) {
    checkCallBtn.textContent = `跟注 ${callNeeded}`;
  } else {
    checkCallBtn.textContent = "过牌";
  }

  sitToggleBtn.textContent = you.sittingOut ? "回到座位" : "离座";
  startGameBtn.disabled = state.hostId !== you.id;
  dissolveRoomBtn.disabled = state.hostId !== you.id;

  actionHintEl.textContent = `当前下注：${state.currentBet}，最小加注：${state.minRaise}，你的筹码：${you.chips}`;
}

function renderShowdown(payload) {
  log("摊牌结果：");
  payload.players.forEach((player) => {
    log(`${player.name} 手牌 ${player.hole.join(" ")} - ${player.rank}`);
  });
  payload.results.forEach((result) => {
    const names = result.winners.map((w) => `${w.name}+${w.chipsWon}`).join(", ");
    log(`分配底池 ${result.potAmount}：${names}`);
  });
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    if (!currentState || !currentState.actionDeadline) {
      countdownEl.textContent = "";
      return;
    }
    const remaining = currentState.actionDeadline - (Date.now() + timeOffset);
    const seconds = Math.max(0, Math.ceil(remaining / 1000));
    countdownEl.textContent = `行动倒计时：${seconds}s`;
  }, 1000);
}

createRoomBtn.addEventListener("click", () => {
  const payload = {
    playerName: playerNameInput.value.trim(),
    maxPlayers: Number(maxPlayersInput.value || 6),
    buyIn: Number(buyInInput.value || 0),
  };
  sendMessage("create_room", payload);
});

joinRoomBtn.addEventListener("click", () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  const payload = {
    playerName: playerNameInput.value.trim(),
    roomCode: code,
    playerId: getStoredPlayerId(code),
    buyIn: Number(buyInInput.value || 0),
  };
  sendMessage("join_room", payload);
});

refreshRoomsBtn.addEventListener("click", () => {
  sendMessage("list_rooms", {});
});

startGameBtn.addEventListener("click", () => {
  sendMessage("start_game", {});
});

checkCallBtn.addEventListener("click", () => {
  sendMessage("action", { action: "call", amount: 0 });
});

foldBtn.addEventListener("click", () => {
  sendMessage("action", { action: "fold", amount: 0 });
});

betRaiseBtn.addEventListener("click", () => {
  const amount = Number(betAmountInput.value);
  if (!amount || amount <= 0) {
    log("请输入有效的下注/加注金额");
    return;
  }
  const action = currentState && currentState.currentBet === 0 ? "bet" : "raise";
  sendMessage("action", { action, amount });
});

topUpBtn.addEventListener("click", () => {
  const amount = Number(topUpInput.value);
  if (!amount || amount <= 0) {
    log("请输入有效的补码金额");
    return;
  }
  sendMessage("top_up", { amount });
});

sitToggleBtn.addEventListener("click", () => {
  if (!currentState) return;
  const type = currentState.you.sittingOut ? "sit_in" : "sit_out";
  sendMessage(type, {});
});

leaveRoomBtn.addEventListener("click", () => {
  sendMessage("leave_room", {});
  resetRoomState();
});

dissolveRoomBtn.addEventListener("click", () => {
  sendMessage("dissolve_room", {});
});

chatSendBtn.addEventListener("click", () => {
  const text = chatInput.value.trim();
  if (!text) return;
  sendMessage("chat", { message: text });
  chatInput.value = "";
});

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    chatSendBtn.click();
  }
});
