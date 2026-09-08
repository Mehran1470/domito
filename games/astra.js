import {
  waitForUser,
  getSavedName,
  currentUid,
  getSavedRoom,
  recordRoundResult,
  db,
  ref,
  get,
  set,
  update,
  onValue,
  runTransaction,
  onDisconnect
} from "../js/app.js";


// ============================================================
// تنظیمات
// ============================================================

const GAME_ID = "astra";

const MAX_PLAYERS = 4;

const MATCH_TIME = 180;

const PLAYER_SPEED = 220;

const BOOST_SPEED = 390;

const BOOST_TIME = 2.5;

const RESOURCE_COUNT = 12;

const RESOURCE_RESPAWN = 3500;

const SYNC_INTERVAL = 80;


// ============================================================
// DOM
// ============================================================

const canvas =
  document.getElementById("astraCanvas");

const ctx =
  canvas.getContext("2d");

const arena =
  document.getElementById("astraArenaBox");

const overlay =
  document.getElementById("astraOverlayMsg");

const result =
  document.getElementById("astraResult");

const playersHud =
  document.getElementById("playersHud");

const hudTimer =
  document.getElementById("hudTimer");

const hudMode =
  document.getElementById("hudMode");

const rotateScreen =
  document.getElementById("astraRotateScreen");

const powerupIndicator =
  document.getElementById("powerupIndicator");

const fullscreenBtn =
  document.getElementById("astraFullscreenBtn");

const muteBtn =
  document.getElementById("astraMuteBtn");


// ============================================================
// بازی
// ============================================================

let myName = "";

let myUid = "";

let roomCode = "";

let multiplayer = false;

let W = 900;

let H = 450;

let running = false;

let paused = true;

let gameFinished = false;

let lastFrame = 0;

let lastSync = 0;

let countdownRunning = false;


// ============================================================
// وضعیت محلی
// ============================================================

let players = {};

let resources = [];

let powerups = [];

let particles = [];

let stars = [];

let worldTime = 0;


// ============================================================
// کنترل
// ============================================================

const controls = {

  p1: {
    x: 0,
    y: 0,
    pointerId: null
  },

  p2: {
    x: 0,
    y: 0,
    pointerId: null
  }

};


// ============================================================
// بازیکن محلی
// ============================================================

let myPlayer = null;


// ============================================================
// کمبو
// ============================================================

let combo = 0;

let comboTimer = 0;


// ============================================================
// صدا
// ============================================================

let audioCtx = null;

let muted = false;


function tone(
  frequency,
  duration = .1
) {

  if (muted) return;

  try {

    if (!audioCtx) {

      audioCtx =
        new (
          window.AudioContext ||
          window.webkitAudioContext
        )();

    }

    const osc =
      audioCtx.createOscillator();

    const gain =
      audioCtx.createGain();

    osc.frequency.value =
      frequency;

    osc.type = "sine";

    gain.gain.setValueAtTime(
      .08,
      audioCtx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      .001,
      audioCtx.currentTime + duration
    );

    osc.connect(gain);

    gain.connect(
      audioCtx.destination
    );

    osc.start();

    osc.stop(
      audioCtx.currentTime +
      duration
    );

  } catch {}

}


muteBtn.addEventListener(
  "click",
  () => {

    muted = !muted;

    muteBtn.textContent =
      muted
        ? "🔇"
        : "🔊";

  }
);


// ============================================================
// Resize
// ============================================================

function resizeCanvas() {

  const rect =
    arena.getBoundingClientRect();

  W =
    Math.max(
      1,
      rect.width
    );

  H =
    Math.max(
      1,
      rect.height
    );

  const dpr =
    Math.min(
      window.devicePixelRatio || 1,
      2.5
    );

  canvas.width =
    Math.round(W * dpr);

  canvas.height =
    Math.round(H * dpr);

  canvas.style.width =
    `${W}px`;

  canvas.style.height =
    `${H}px`;

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  createStars();

  if (myPlayer) {

    myPlayer.x =
      Math.max(
        25,
        Math.min(
          W - 25,
          myPlayer.x
        )
      );

    myPlayer.y =
      Math.max(
        25,
        Math.min(
          H - 25,
          myPlayer.y
        )
      );

  }

}


function createStars() {

  stars = [];

  const count =
    Math.max(
      60,
      Math.round(
        W * H / 4000
      )
    );

  for (
    let i = 0;
    i < count;
    i++
  ) {

    stars.push({

      x: Math.random() * W,

      y: Math.random() * H,

      r:
        Math.random() *
        1.5 +
        .3,

      alpha:
        Math.random() *
        .7 +
        .2

    });

  }

}


// ============================================================
// Firebase paths
// ============================================================

function roomGameRef(
  path = ""
) {

  return ref(
    db,
    `rooms/${roomCode}/currentGame/astra${
      path
        ? "/" + path
        : ""
    }`
  );

}


// ============================================================
// نام امن
// ============================================================

function cleanName(name) {

  return String(name || "")
    .slice(0, 24);

}


// ============================================================
// بازیکن جدید
// ============================================================

function makePlayer(
  uid,
  name,
  index
) {

  const colors = [
    "#4F7CFF",
    "#9B5CFF",
    "#3ECF8E",
    "#FF7A59"
  ];

  const positions = [

    {
      x: W * .18,
      y: H * .50
    },

    {
      x: W * .82,
      y: H * .50
    },

    {
      x: W * .50,
      y: H * .25
    },

    {
      x: W * .50,
      y: H * .75
    }

  ];

  const pos =
    positions[
      index % positions.length
    ];

  return {

    uid,

    name:
      cleanName(name),

    x: pos.x,

    y: pos.y,

    fuel: 0,

    cargo: 0,

    score: 0,

    combo: 0,

    powerup: "",

    boostUntil: 0,

    launched: false,

    finished: false,

    lastUpdate:
      Date.now(),

    color:
      colors[
        index % colors.length
      ]

  };

}


// ============================================================
// فاصله
// ============================================================

function distance(a, b) {

  return Math.hypot(
    a.x - b.x,
    a.y - b.y
  );

}


// ============================================================
// محدوده
// ============================================================

function clampPlayer(p) {

  p.x =
    Math.max(
      24,
      Math.min(
        W - 24,
        p.x
      )
    );

  p.y =
    Math.max(
      24,
      Math.min(
        H - 24,
        p.y
      )
    );

}


// ============================================================
// منابع
// ============================================================

function makeResource(
  id
) {

  const margin = 45;

  const values = [
    10,
    10,
    10,
    15,
    15,
    20,
    20,
    25
  ];

  return {

    id,

    x:
      margin +
      Math.random() *
      Math.max(
        1,
        W - margin * 2
      ),

    y:
      margin +
      Math.random() *
      Math.max(
        1,
        H - margin * 2
      ),

    value:
      values[
        Math.floor(
          Math.random() *
          values.length
        )
      ],

    createdAt:
      Date.now()

  };

}


function createResources() {

  resources = [];

  for (
    let i = 0;
    i < RESOURCE_COUNT;
    i++
  ) {

    resources.push(
      makeResource(
        `r-${Date.now()}-${i}-${Math.random()}`
      )
    );

  }

}


// ============================================================
// بازی تک نفره
// ============================================================

function createSoloGame() {

  multiplayer = false;

  hudMode.textContent =
    "🤖 بازی با ربات";

  myPlayer =
    makePlayer(
      myUid,
      myName,
      0
    );

  myPlayer.color =
    "#4F7CFF";

  players = {

    [myUid]:
      myPlayer,

    ai:
      makePlayer(
        "ai",
        "ربات",
        1
      )

  };

  players.ai.color =
    "#9B5CFF";

  createResources();

  powerups = [];

  startCountdown();

}


// ============================================================
// تشخیص اتاق
// ============================================================

async function detectMode() {

  roomCode =
    getSavedRoom();

  if (!roomCode) {

    createSoloGame();

    return;

  }

  multiplayer = true;

  hudMode.textContent =
    "🌐 بازی آنلاین";

  await joinMultiplayer();

}


// ============================================================
// ورود به Multiplayer
// ============================================================

async function joinMultiplayer() {

  const playersRef =
    ref(
      db,
      `rooms/${roomCode}/players`
    );

  const snap =
    await get(playersRef);

  const roomPlayers =
    snap.val() || {};

  const ids =
    Object.keys(
      roomPlayers
    );

  if (!ids.includes(myUid)) {

    overlay.innerHTML = `
      <div class="big">🚪</div>
      <div class="sub">
        اول وارد لابی اتاق شو
      </div>
    `;

    return;

  }

  if (ids.length < 2) {

    running = true;

    paused = true;

    resizeCanvas();

    createStars();

    renderWaiting();

    listenRoomPlayers();

    return;

  }

  listenRoomPlayers();

  listenGameState();

  await prepareMultiplayer();

}


// ============================================================
// آماده‌سازی Multiplayer
// ============================================================

async function prepareMultiplayer() {

  const playersSnap =
    await get(
      ref(
        db,
        `rooms/${roomCode}/players`
      )
    );

  const roomPlayers =
    playersSnap.val() || {};

  let ids =
    Object.keys(
      roomPlayers
    );

  ids =
    ids.slice(
      0,
      MAX_PLAYERS
    );

  const existing =
    await get(
      roomGameRef()
    );

  if (!existing.exists()) {

    const initialPlayers = {};

    ids.forEach(
      (uid, index) => {

        initialPlayers[uid] =
          makePlayer(
            uid,
            roomPlayers[uid].name ||
              `بازیکن ${index + 1}`,
            index
          );

      }
    );

    await set(
      roomGameRef(),
      {

        status:
          "waiting",

        startedAt:
          0,

        endAt:
          0,

        winnerUid:
          "",

        resources:
          {},

        powerups:
          {},

        players:
          initialPlayers

      }
    );

  }

  await ensureMyPlayer();

  renderWaiting();

}


// ============================================================
// بازیکن من
// ============================================================

async function ensureMyPlayer() {

  const pRef =
    roomGameRef(
      `players/${myUid}`
    );

  const snap =
    await get(pRef);

  if (snap.exists()) {

    myPlayer =
      snap.val();

    return;

  }

  const playersSnap =
    await get(
      ref(
        db,
        `rooms/${roomCode}/players`
      )
    );

  const roomPlayers =
    playersSnap.val() || {};

  const ids =
    Object.keys(
      roomPlayers
    );

  const index =
    Math.max(
      0,
      ids.indexOf(myUid)
    );

  myPlayer =
    makePlayer(
      myUid,
      roomPlayers[myUid]?.name ||
        myName,
      index
    );

  await set(
    pRef,
    myPlayer
  );

}


// ============================================================
// Listen players
// ============================================================

let playersUnsubscribe =
  null;

function listenRoomPlayers() {

  if (playersUnsubscribe) return;

  playersUnsubscribe =
    onValue(
      ref(
        db,
        `rooms/${roomCode}/players`
      ),
      snapshot => {

        const roomPlayers =
          snapshot.val() || {};

        updateRoomPlayerNames(
          roomPlayers
        );

      }
    );

}


function updateRoomPlayerNames(
  roomPlayers
) {

  const ids =
    Object.keys(
      roomPlayers
    ).slice(
      0,
      MAX_PLAYERS
    );

  ids.forEach(
    uid => {

      if (
        players[uid]
      ) {

        players[uid].name =
          roomPlayers[uid].name ||
          players[uid].name;

      }

    }
  );

}


// ============================================================
// Listen Game State
// ============================================================

let gameUnsubscribe =
  null;

function listenGameState() {

  if (gameUnsubscribe) return;

  gameUnsubscribe =
    onValue(
      roomGameRef(),
      snapshot => {

        const state =
          snapshot.val();

        if (!state) return;

        if (
          state.players
        ) {

          players =
            state.players;

          myPlayer =
            players[myUid] ||
            myPlayer;

        }

        resources =
          state.resources
            ? Object.entries(
                state.resources
              ).map(
                ([id, r]) => ({
                  id,
                  ...r
                })
              )
            : [];

        powerups =
          state.powerups
            ? Object.entries(
                state.powerups
              ).map(
                ([id, p]) => ({
                  id,
                  ...p
                })
              )
            : [];

        if (
          state.status ===
          "playing"
        ) {

          if (
            !running
          ) {

            running = true;

            paused = false;

            hideOverlay();

            requestAnimationFrame(
              gameLoop
            );

          }

        }

        if (
          state.status ===
          "finished"
        ) {

          finishFromNetwork(
            state.winnerUid
          );

        }

        updateHUD();

      }
    );

}


// ============================================================
// ساخت بازی آنلاین توسط Host
// ============================================================

async function tryStartRoomGame() {

  if (!multiplayer) return;

  if (countdownRunning) return;

  const playersSnap =
    await get(
      ref(
        db,
        `rooms/${roomCode}/players`
      )
    );

  const roomPlayers =
    playersSnap.val() || {};

  const ids =
    Object.keys(
      roomPlayers
    )
      .slice(
        0,
        MAX_PLAYERS
      );

  if (
    ids.length < 2
  ) {

    renderWaiting();

    return;

  }

  const sorted =
    [...ids].sort();

  const hostUid =
    sorted[0];

  if (
    hostUid !== myUid
  ) {

    renderWaiting();

    return;

  }

  const stateSnap =
    await get(
      roomGameRef()
    );

  const state =
    stateSnap.val();

  if (
    state &&
    state.status ===
    "playing"
  ) {

    return;

  }

  const initialPlayers = {};

  ids.forEach(
    (uid, index) => {

      initialPlayers[uid] =
        players[uid] ||
        makePlayer(
          uid,
          roomPlayers[uid].name ||
            `بازیکن ${index + 1}`,
          index
        );

    }
  );

  const resourceMap = {};

  for (
    let i = 0;
    i < RESOURCE_COUNT;
    i++
  ) {

    const r =
      makeResource(
        `r-${Date.now()}-${i}-${Math.random()}`
      );

    resourceMap[r.id] =
      r;

  }

  const now =
    Date.now();

  await set(
    roomGameRef(),
    {

      status:
        "playing",

      startedAt:
        now,

      endAt:
        now +
        MATCH_TIME * 1000,

      winnerUid:
        "",

      resources:
        resourceMap,

      powerups:
        {},

      players:
        initialPlayers

    }
  );

}


// ============================================================
// انتظار
// ============================================================

function renderWaiting() {

  if (
    !multiplayer
  ) return;

  running = true;

  paused = true;

  const count =
    Object.keys(
      players
    ).length;

  overlay.innerHTML = `

    <div class="big">
      🚀 ASTRA
    </div>

    <div class="sub">
      ${count < 2
        ? "منتظر بازیکن دوم هستیم..."
        : `${count} بازیکن آماده‌اند`
      }
    </div>

  `;

  overlay.classList.remove(
    "hidden"
  );

  if (
    count >= 2
  ) {

    tryStartRoomGame();

  }

}


// ============================================================
// Solo Countdown
// ============================================================

async function startCountdown() {

  if (
    countdownRunning
  ) return;

  countdownRunning = true;

  running = true;

  paused = true;

  const steps = [
    "۳",
    "۲",
    "۱",
    "🚀 ASTRA!"
  ];

  for (
    const step of steps
  ) {

    overlay.innerHTML = `
      <div class="big">
        ${step}
      </div>
    `;

    overlay.classList.remove(
      "hidden"
    );

    tone(
      step.includes("ASTRA")
        ? 1100
        : 500,
      .12
    );

    await delay(650);

  }

  hideOverlay();

  paused = false;

  countdownRunning = false;

  lastFrame =
    performance.now();

  requestAnimationFrame(
    gameLoop
  );

}


// ============================================================
// Delay
// ============================================================

function delay(ms) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );

}


// ============================================================
// Game loop
// ============================================================

function gameLoop(timestamp) {

  if (!running) return;

  const dt =
    Math.min(
      .05,
      (timestamp - lastFrame) /
        1000
    );

  lastFrame =
    timestamp;

  worldTime =
    timestamp / 1000;

  if (!paused) {

    updateGame(
      dt,
      timestamp
    );

  }

  drawGame(
    timestamp
  );

  requestAnimationFrame(
    gameLoop
  );

}


// ============================================================
// Update
// ============================================================

function updateGame(
  dt,
  timestamp
) {

  if (!myPlayer) return;

  if (
    multiplayer
  ) {

    updateMyOnlinePlayer(
      dt,
      timestamp
    );

  } else {

    updateSoloPlayer(
      dt,
      timestamp
    );

    updateAI(
      dt,
      timestamp
    );

  }

  updateEffects(
    dt
  );

  checkResources();

  checkLaunch();

  updateCombo(
    dt
  );

  updateTimer();

  syncPlayer(
    timestamp
  );

}


// ============================================================
// حرکت بازیکن
// ============================================================

function updateMyOnlinePlayer(
  dt,
  timestamp
) {

  const control =
    getMyControl();

  const magnitude =
    Math.min(
      1,
      Math.hypot(
        control.x,
        control.y
      )
    );

  if (
    magnitude > .01
  ) {

    const length =
      Math.hypot(
        control.x,
        control.y
      ) || 1;

    const nx =
      control.x / length;

    const ny =
      control.y / length;

    const speed =
      myPlayer.boostUntil >
      Date.now()
        ? BOOST_SPEED
        : PLAYER_SPEED;

    myPlayer.x +=
      nx *
      magnitude *
      speed *
      dt;

    myPlayer.y +=
      ny *
      magnitude *
      speed *
      dt;

    clampPlayer(
      myPlayer
    );

  }

}


// ============================================================
// Solo player
// ============================================================

function updateSoloPlayer(
  dt,
  timestamp
) {

  const control =
    controls.p1;

  const magnitude =
    Math.min(
      1,
      Math.hypot(
        control.x,
        control.y
      )
    );

  if (
    magnitude < .01
  ) return;

  const length =
    Math.hypot(
      control.x,
      control.y
    ) || 1;

  const nx =
    control.x / length;

  const ny =
    control.y / length;

  const speed =
    myPlayer.boostUntil >
    Date.now()
      ? BOOST_SPEED
      : PLAYER_SPEED;

  myPlayer.x +=
    nx *
    magnitude *
    speed *
    dt;

  myPlayer.y +=
    ny *
    magnitude *
    speed *
    dt;

  clampPlayer(
    myPlayer
  );

}


// ============================================================
// ربات
// ============================================================

let aiTarget = null;

function updateAI(
  dt
) {

  const ai =
    players.ai;

  if (!ai) return;

  if (
    !aiTarget ||
    !resources.find(
      r =>
        r.id ===
        aiTarget.id
    )
  ) {

    let best =
      null;

    let bestScore =
      -Infinity;

    resources.forEach(
      resource => {

        const d =
          distance(
            ai,
            resource
          );

        const value =
          resource.value /
          (d + 30);

        if (
          value >
          bestScore
        ) {

          bestScore =
            value;

          best =
            resource;

        }

      }
    );

    aiTarget =
      best;

  }

  if (!aiTarget) return;

  const d =
    distance(
      ai,
      aiTarget
    );

  if (
    d < 2
  ) return;

  ai.x +=
    (
      aiTarget.x -
      ai.x
    ) /
    d *
    PLAYER_SPEED *
    .72 *
    dt;

  ai.y +=
    (
      aiTarget.y -
      ai.y
    ) /
    d *
    PLAYER_SPEED *
    .72 *
    dt;

  clampPlayer(
    ai
  );

}


// ============================================================
// کنترل فعال
// ============================================================

function getMyControl() {

  if (
    !multiplayer
  ) {

    return controls.p1;

  }

  const ids =
    Object.keys(
      players
    );

  const index =
    Math.max(
      0,
      ids.indexOf(
        myUid
      )
    );

  return index === 0
    ? controls.p1
    : controls.p2;

}


// ============================================================
// منابع
// ============================================================

let resourceLock =
  false;

function checkResources() {

  if (!myPlayer) return;

  if (
    myPlayer.finished
  ) return;

  for (
    const resource of resources
  ) {

    if (
      distance(
        myPlayer,
        resource
      ) >
      30
    ) continue;

    if (
      multiplayer
    ) {

      claimOnlineResource(
        resource
      );

    } else {

      collectLocalResource(
        resource
      );

    }

    break;

  }

}


// ============================================================
// Solo collect
// ============================================================

function collectLocalResource(
  resource
) {

  const index =
    resources.findIndex(
      r =>
        r.id ===
        resource.id
    );

  if (
    index === -1
  ) return;

  resources.splice(
    index,
    1
  );

  myPlayer.cargo++;

  myPlayer.score +=
    resource.value;

  combo++;

  comboTimer = 3;

  burst(
    resource.x,
    resource.y,
    myPlayer.color,
    16
  );

  tone(
    650 +
    combo * 30,
    .07
  );

  setTimeout(
    () => {

      resources.push(
        makeResource(
          `r-${Date.now()}-${Math.random()}`
        )
      );

    },
    RESOURCE_RESPAWN
  );

}


// ============================================================
// Multiplayer collect
// ============================================================

async function claimOnlineResource(
  resource
) {

  if (
    resourceLock
  ) return;

  resourceLock = true;

  try {

    const resourceRef =
      roomGameRef(
        `resources/${resource.id}`
      );

    const transaction =
      await runTransaction(
        resourceRef,
        current => {

          if (
            !current
          ) {

            return;

          }

          return null;

        }
      );

    if (
      transaction.committed
    ) {

      myPlayer.cargo++;

      myPlayer.score +=
        Number(
          resource.value || 10
        );

      combo++;

      comboTimer = 3;

      burst(
        resource.x,
        resource.y,
        myPlayer.color,
        16
      );

      tone(
        650 +
        combo * 30,
        .07
      );

      await syncMyPlayer();

      spawnResourceLater();

    }

  } catch (error) {

    console.warn(
      "Resource claim:",
      error
    );

  }

  resourceLock = false;

}


// ============================================================
// ساخت منبع جدید
// ============================================================

function spawnResourceLater() {

  if (!multiplayer) return;

  setTimeout(
    async () => {

      try {

        const state =
          await get(
            roomGameRef(
              "resources"
            )
          );

        const map =
          state.val() || {};

        if (
          Object.keys(map)
            .length >=
          RESOURCE_COUNT
        ) return;

        const r =
          makeResource(
            `r-${Date.now()}-${Math.random()}`
          );

        await update(
          roomGameRef(
            "resources"
          ),
          {
            [r.id]: r
          }
        );

      } catch {}

    },
    RESOURCE_RESPAWN
  );

}


// ============================================================
// تبدیل Cargo به Fuel
// ============================================================

function processCargo() {

  if (
    myPlayer.cargo <= 0
  ) return;

  const pad =
    getBasePosition(
      myPlayer.uid
    );

  if (
    Math.hypot(
      myPlayer.x - pad.x,
      myPlayer.y - pad.y
    ) > 65
  ) {

    return;

  }

  const amount =
    Math.min(
      myPlayer.cargo,
      Math.ceil(
        (100 -
          myPlayer.fuel) /
        10
      )
    );

  if (
    amount <= 0
  ) return;

  myPlayer.cargo -=
    amount;

  myPlayer.fuel =
    Math.min(
      100,
      myPlayer.fuel +
        amount * 10
    );

  tone(
    850,
    .08
  );

}


// ============================================================
// Launch
// ============================================================

function checkLaunch() {

  processCargo();

  if (
    myPlayer.fuel < 100
  ) return;

  if (
    myPlayer.launched ||
    myPlayer.finished
  ) return;

  const pad =
    getLaunchPad(
      myPlayer.uid
    );

  const d =
    Math.hypot(
      myPlayer.x - pad.x,
      myPlayer.y - pad.y
    );

  if (
    d > 70
  ) return;

  launchPlayer();

}


// ============================================================
// Launch player
// ============================================================

let launching =
  false;

async function launchPlayer() {

  if (launching) return;

  launching = true;

  myPlayer.launched = true;

  myPlayer.finished = true;

  burst(
    myPlayer.x,
    myPlayer.y,
    myPlayer.color,
    45
  );

  tone(
    1200,
    .35
  );

  if (
    multiplayer
  ) {

    await syncMyPlayer();

    try {

      await runTransaction(
        roomGameRef(
          "winnerUid"
        ),
        current => {

          if (
            current
          ) return;

          return myUid;

        }
      );

    } catch {}

  } else {

    showSoloWin();

  }

  launching = false;

}


// ============================================================
// جایگاه Base
// ============================================================

function getBasePosition(
  uid
) {

  const index =
    Object.keys(
      players
    )
      .indexOf(uid);

  const positions = [

    {
      x: W * .18,
      y: H * .50
    },

    {
      x: W * .82,
      y: H * .50
    },

    {
      x: W * .50,
      y: H * .25
    },

    {
      x: W * .50,
      y: H * .75
    }

  ];

  return positions[
    Math.max(
      0,
      index
    ) % positions.length
  ];

}


function getLaunchPad(
  uid
) {

  const base =
    getBasePosition(
      uid
    );

  return {

    x:
      base.x,

    y:
      base.y

  };

}


// ============================================================
// Multiplayer sync
// ============================================================

async function syncPlayer(
  timestamp
) {

  if (
    !multiplayer
  ) return;

  if (
    timestamp -
    lastSync <
    SYNC_INTERVAL
  ) return;

  lastSync =
    timestamp;

  await syncMyPlayer();

}


async function syncMyPlayer() {

  if (
    !myPlayer ||
    !myUid ||
    !roomCode
  ) return;

  try {

    await update(
      roomGameRef(
        `players/${myUid}`
      ),
      {

        x:
          myPlayer.x,

        y:
          myPlayer.y,

        fuel:
          myPlayer.fuel,

        cargo:
          myPlayer.cargo,

        score:
          myPlayer.score,

        combo:
          myPlayer.combo,

        powerup:
          myPlayer.powerup,

        boostUntil:
          myPlayer.boostUntil,

        launched:
          myPlayer.launched,

        finished:
          myPlayer.finished,

        lastUpdate:
          Date.now()

      }
    );

  } catch (error) {

    console.warn(
      "Astra sync error:",
      error
    );

  }

}


// ============================================================
// Timer
// ============================================================

function updateTimer() {

  if (
    !multiplayer
  ) {

    if (
      !window.soloStartedAt
    ) {

      window.soloStartedAt =
        Date.now();

    }

    const elapsed =
      (
        Date.now() -
        window.soloStartedAt
      ) / 1000;

    const left =
      Math.max(
        0,
        MATCH_TIME -
        elapsed
      );

    hudTimer.textContent =
      formatTime(
        left
      );

    if (
      left <= 0
    ) {

      showSoloTimeUp();

    }

    return;

  }

  get(
    roomGameRef()
  )
    .then(
      snap => {

        const state =
          snap.val();

        if (!state) return;

        const left =
          Math.max(
            0,
            (
              Number(
                state.endAt
              ) -
              Date.now()
            ) / 1000
          );

        hudTimer.textContent =
          formatTime(
            left
          );

        if (
          left <= 0 &&
          state.status ===
          "playing"
        ) {

          if (
            Object.keys(
              players
            ).length
          ) {

            finishByTimeout();

          }

        }

      }
    )
    .catch(() => {});

}


function formatTime(
  seconds
) {

  seconds =
    Math.max(
      0,
      Math.ceil(
        seconds
      )
    );

  const min =
    Math.floor(
      seconds / 60
    );

  const sec =
    seconds % 60;

  return `${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;

}


// ============================================================
// Timeout
// ============================================================

async function finishByTimeout() {

  if (
    !multiplayer
  ) return;

  try {

    await runTransaction(
      roomGameRef(
        "status"
      ),
      current => {

        if (
          current !==
          "playing"
        ) return;

        return "finished";

      }
    );

  } catch {}

}


// ============================================================
// نتیجه از شبکه
// ============================================================

function finishFromNetwork(
  winnerUid
) {

  if (
    gameFinished
  ) return;

  gameFinished = true;

  running = false;

  paused = true;

  const winner =
    players[winnerUid];

  const winnerName =
    winner?.name ||
    "برنده";

  const won =
    winnerUid ===
    myUid;

  tone(
    won
      ? 1300
      : 300,
    .3
  );

  showResult(
    won,
    winnerName
  );

  saveResult(
    won
  );

}


// ============================================================
// نتیجه Solo
// ============================================================

function showSoloWin() {

  if (
    gameFinished
  ) return;

  gameFinished = true;

  running = false;

  paused = true;

  tone(
    1400,
    .35
  );

  showResult(
    true,
    myName
  );

  saveResult(
    true
  );

}


function showSoloTimeUp() {

  if (
    gameFinished
  ) return;

  gameFinished = true;

  running = false;

  paused = true;

  const won =
    myPlayer.score >
    players.ai.score;

  showResult(
    won,
    won
      ? myName
      : "ربات"
  );

  saveResult(
    won
  );

}


// ============================================================
// ذخیره نتیجه
// ============================================================

let resultSaved =
  false;

async function saveResult(
  won
) {

  if (
    resultSaved
  ) return;

  resultSaved = true;

  try {

    await recordRoundResult(
      myName,
      GAME_ID,
      {
        won
      }
    );

  } catch (
    error
  ) {

    console.warn(
      "Astra result error:",
      error
    );

  }

}


// ============================================================
// Result UI
// ============================================================

function showResult(
  won,
  winnerName
) {

  const allPlayers =
    Object.values(
      players
    )
      .filter(
        p =>
          p &&
          p.uid !== "ai"
      )
      .sort(
        (a,b) =>
          b.score -
          a.score
      );

  const cards =
    allPlayers
      .map(
        p => `

          <div class="result-player">

            <div class="name">
              ${p.uid === myUid ? "🔵 " : ""}
              ${escapeHtml(p.name)}
            </div>

            <div class="score">
              ⭐ ${Math.round(
                p.score || 0
              )}
            </div>

            <div>
              ⛽ ${Math.round(
                p.fuel || 0
              )}%
            </div>

          </div>

        `
      )
      .join("");

  result.innerHTML = `

    <div class="result-title">
      ${won
        ? "🏆 تو برنده شدی!"
        : "😅 بازی تمام شد"
      }
    </div>

    <div class="result-sub">
      🚀 ${escapeHtml(
        winnerName
      )} وارد World 2 شد
    </div>

    <div class="result-players">
      ${cards}
    </div>

    <button
      class="result-button"
      id="astraAgain"
    >
      🔄 دوباره بازی کن
    </button>

    <button
      class="result-button secondary"
      id="astraHome"
    >
      🏠 بازگشت به خانه
    </button>

  `;

  result.classList.add(
    "show"
  );

  document
    .getElementById(
      "astraAgain"
    )
    ?.addEventListener(
      "click",
      () => {

        window.location.reload();

      }
    );

  document
    .getElementById(
      "astraHome"
    )
    ?.addEventListener(
      "click",
      () => {

        window.location.href =
          "../index.html";

      }
    );

}


// ============================================================
// Escape
// ============================================================

function escapeHtml(
  text
) {

  return String(
    text || ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


// ============================================================
// HUD
// ============================================================

function updateHUD() {

  const list =
    Object.values(
      players
    )
      .filter(
        p =>
          p &&
          p.uid !== "ai"
      );

  playersHud.innerHTML =
    list
      .map(
        p => `

          <div
            class="player-card ${
              p.uid === myUid
                ? "me"
                : ""
            }"
          >

            <div class="player-name">
              ${p.uid === myUid
                ? "🔵 "
                : ""
              }
              ${escapeHtml(
                p.name
              )}
            </div>

            <div class="player-stats">
              ⛽ ${Math.round(
                p.fuel || 0
              )}%
              &nbsp;
              📦 ${p.cargo || 0}
              &nbsp;
              ⭐ ${Math.round(
                p.score || 0
              )}
            </div>

          </div>

        `
      )
      .join("");

}


// ============================================================
// Combo
// ============================================================

function updateCombo(
  dt
) {

  if (
    comboTimer > 0
  ) {

    comboTimer -= dt;

  } else {

    combo = 0;

  }

  myPlayer.combo =
    combo;

}


// ============================================================
// Effects
// ============================================================

function burst(
  x,
  y,
  color,
  count = 12
) {

  for (
    let i = 0;
    i < count;
    i++
  ) {

    const angle =
      Math.random() *
      Math.PI *
      2;

    const speed =
      50 +
      Math.random() *
      160;

    particles.push({

      x,

      y,

      vx:
        Math.cos(
          angle
        ) *
        speed,

      vy:
        Math.sin(
          angle
        ) *
        speed,

      life:
        1,

      color

    });

  }

}


function updateEffects(
  dt
) {

  particles.forEach(
    p => {

      p.x +=
        p.vx *
        dt;

      p.y +=
        p.vy *
        dt;

      p.vx *=
        .92;

      p.vy *=
        .92;

      p.life -=
        dt *
        1.5;

    }
  );

  particles =
    particles.filter(
      p =>
        p.life > 0
    );

}


// ============================================================
// Drawing
// ============================================================

function drawGame(
  timestamp
) {

  drawBackground(
    timestamp / 1000
  );

  drawLaunchPads();

  drawResources();

  drawPowerups();

  drawPlayers();

  drawEffects();

}


// ============================================================
// Background
// ============================================================

function drawBackground(
  t
) {

  ctx.clearRect(
    0,
    0,
    W,
    H
  );

  ctx.fillStyle =
    "#03040b";

  ctx.fillRect(
    0,
    0,
    W,
    H
  );

  const glow1 =
    ctx.createRadialGradient(
      W * .2,
      H * .25,
      0,
      W * .2,
      H * .25,
      Math.max(W,H) * .5
    );

  glow1.addColorStop(
    0,
    "rgba(79,124,255,.18)"
  );

  glow1.addColorStop(
    1,
    "rgba(79,124,255,0)"
  );

  ctx.fillStyle =
    glow1;

  ctx.fillRect(
    0,
    0,
    W,
    H
  );


  const glow2 =
    ctx.createRadialGradient(
      W * .8,
      H * .75,
      0,
      W * .8,
      H * .75,
      Math.max(W,H) * .45
    );

  glow2.addColorStop(
    0,
    "rgba(155,92,255,.16)"
  );

  glow2.addColorStop(
    1,
    "rgba(155,92,255,0)"
  );

  ctx.fillStyle =
    glow2;

  ctx.fillRect(
    0,
    0,
    W,
    H
  );


  stars.forEach(
    s => {

      const a =
        s.alpha +
        Math.sin(
          t * 2 +
          s.x
        ) *
        .15;

      ctx.globalAlpha =
        Math.max(
          .1,
          a
        );

      ctx.beginPath();

      ctx.arc(
        s.x,
        s.y,
        s.r,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        "#fff";

      ctx.fill();

    }
  );

  ctx.globalAlpha =
    1;


  ctx.strokeStyle =
    "rgba(255,255,255,.035)";

  ctx.lineWidth =
    1;

  const gap =
    Math.max(
      35,
      Math.min(
        W,
        H
      ) / 10
    );

  for (
    let x = 0;
    x < W;
    x += gap
  ) {

    ctx.beginPath();

    ctx.moveTo(
      x,
      0
    );

    ctx.lineTo(
      x,
      H
    );

    ctx.stroke();

  }

  for (
    let y = 0;
    y < H;
    y += gap
  ) {

    ctx.beginPath();

    ctx.moveTo(
      0,
      y
    );

    ctx.lineTo(
      W,
      y
    );

    ctx.stroke();

  }

}


// ============================================================
// Launch Pads
// ============================================================

function drawLaunchPads() {

  Object.values(
    players
  )
    .filter(
      p =>
        p &&
        p.uid !== "ai"
    )
    .forEach(
      p => {

        const pad =
          getLaunchPad(
            p.uid
          );

        ctx.beginPath();

        ctx.arc(
          pad.x,
          pad.y,
          30,
          0,
          Math.PI * 2
        );

        ctx.fillStyle =
          "rgba(255,255,255,.035)";

        ctx.fill();

        ctx.beginPath();

        ctx.arc(
          pad.x,
          pad.y,
          25,
          0,
          Math.PI * 2
        );

        ctx.strokeStyle =
          p.fuel >= 100
            ? "#ffd34f"
            : p.color;

        ctx.globalAlpha =
          p.fuel >= 100
            ? .95
            : .4;

        ctx.lineWidth =
          3;

        ctx.stroke();

        ctx.globalAlpha =
          1;

        ctx.fillStyle =
          "#fff";

        ctx.font =
          "bold 10px Arial";

        ctx.textAlign =
          "center";

        ctx.fillText(
          p.fuel >= 100
            ? "LAUNCH"
            : "BASE",
          pad.x,
          pad.y + 4
        );

      }
    );

}


// ============================================================
// Resources
// ============================================================

function drawResources() {

  resources.forEach(
    r => {

      const rare =
        r.value >= 25;

      const radius =
        rare
          ? 14
          : 10;

      const pulse =
        1 +
        Math.sin(
          worldTime * 3 +
          r.x
        ) *
        .12;

      ctx.beginPath();

      ctx.arc(
        r.x,
        r.y,
        radius * pulse,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        rare
          ? "#ffd34f"
          : "#4fd1ff";

      ctx.shadowColor =
        ctx.fillStyle;

      ctx.shadowBlur =
        rare
          ? 22
          : 12;

      ctx.fill();

      ctx.shadowBlur =
        0;

      ctx.fillStyle =
        "#05060f";

      ctx.font =
        "bold 8px Arial";

      ctx.textAlign =
        "center";

      ctx.fillText(
        r.value,
        r.x,
        r.y + 3
      );

    }
  );

}


// ============================================================
// Powerups
// ============================================================

function drawPowerups() {

  powerups.forEach(
    p => {

      ctx.beginPath();

      ctx.arc(
        p.x,
        p.y,
        13,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        "#3ecf8e";

      ctx.shadowColor =
        "#3ecf8e";

      ctx.shadowBlur =
        18;

      ctx.fill();

      ctx.shadowBlur =
        0;

      ctx.fillStyle =
        "#05060f";

      ctx.font =
        "bold 14px Arial";

      ctx.textAlign =
        "center";

      ctx.fillText(
        "⚡",
        p.x,
        p.y + 5
      );

    }
  );

}


// ============================================================
// Players
// ============================================================

function drawPlayers() {

  Object.values(
    players
  )
    .filter(Boolean)
    .forEach(
      p => {

        drawShip(
          p
        );

      }
    );

}


function drawShip(
  p
) {

  const now =
    Date.now();

  const boosted =
    Number(
      p.boostUntil || 0
    ) > now;

  const size =
    18;

  ctx.save();

  ctx.translate(
    p.x,
    p.y
  );

  ctx.rotate(
    Math.sin(
      worldTime
    ) *
    .05
  );


  // Trail
  ctx.globalAlpha =
    .22;

  ctx.fillStyle =
    p.color;

  for (
    let i = 1;
    i <= 5;
    i++
  ) {

    ctx.beginPath();

    ctx.arc(
      -i * 5,
      0,
      Math.max(
        2,
        8 - i
      ),
      0,
      Math.PI * 2
    );

    ctx.fill();

  }

  ctx.globalAlpha =
    1;


  // Engine
  ctx.beginPath();

  ctx.moveTo(
    -size,
    0
  );

  ctx.lineTo(
    -size - 15 -
      (
        boosted
          ? Math.random() * 8
          : 0
      ),
    -6
  );

  ctx.lineTo(
    -size - 15 -
      (
        boosted
          ? Math.random() * 8
          : 0
      ),
    6
  );

  ctx.closePath();

  ctx.fillStyle =
    boosted
      ? "#ffd34f"
      : "#ff7a59";

  ctx.shadowColor =
    ctx.fillStyle;

  ctx.shadowBlur =
    boosted
      ? 20
      : 10;

  ctx.fill();

  ctx.shadowBlur =
    0;


  // Ship body
  ctx.beginPath();

  ctx.moveTo(
    size + 8,
    0
  );

  ctx.lineTo(
    -size,
    -size * .65
  );

  ctx.lineTo(
    -size * .65,
    0
  );

  ctx.lineTo(
    -size,
    size * .65
  );

  ctx.closePath();

  ctx.fillStyle =
    p.color;

  ctx.shadowColor =
    p.color;

  ctx.shadowBlur =
    boosted
      ? 25
      : 12;

  ctx.fill();

  ctx.shadowBlur =
    0;


  // Cockpit
  ctx.beginPath();

  ctx.arc(
    4,
    0,
    5,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    "#eaf0ff";

  ctx.fill();


  // Shield
  if (
    boosted
  ) {

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      size + 8,
      0,
      Math.PI * 2
    );

    ctx.strokeStyle =
      "#3ecf8e";

    ctx.globalAlpha =
      .65;

    ctx.lineWidth =
      2;

    ctx.stroke();

    ctx.globalAlpha =
      1;

  }

  ctx.restore();


  // Name
  ctx.fillStyle =
    "#fff";

  ctx.font =
    "bold 11px Arial";

  ctx.textAlign =
    "center";

  ctx.fillText(
    p.name,
    p.x,
    p.y - 27
  );


  // Cargo
  ctx.font =
    "9px Arial";

  ctx.fillStyle =
    "#aeb7df";

  ctx.fillText(
    `⛽ ${Math.round(
      p.fuel || 0
    )}%  📦 ${
      p.cargo || 0
    }`,
    p.x,
    p.y + 32
  );

}


// ============================================================
// Effects
// ============================================================

function drawEffects() {

  particles.forEach(
    p => {

      ctx.globalAlpha =
        Math.max(
          0,
          p.life
        );

      ctx.beginPath();

      ctx.arc(
        p.x,
        p.y,
        2.5,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        p.color;

      ctx.fill();

    }
  );

  ctx.globalAlpha =
    1;

}


// ============================================================
// Boost
// ============================================================

function activateBoost() {

  if (
    !myPlayer
  ) return;

  myPlayer.boostUntil =
    Date.now() +
    BOOST_TIME *
    1000;

  powerupIndicator.classList.add(
    "active"
  );

  tone(
    1000,
    .12
  );

  setTimeout(
    () => {

      if (
        Date.now() >=
        myPlayer.boostUntil
      ) {

        powerupIndicator.classList.remove(
          "active"
        );

      }

    },
    BOOST_TIME *
      1000
  );

  if (
    multiplayer
  ) {

    syncMyPlayer();

  }

}


// ============================================================
// Buttons
// ============================================================

document
  .getElementById("p1Boost")
  .addEventListener(
    "pointerdown",
    e => {

      e.preventDefault();

      activateBoost();

    }
  );

document
  .getElementById("p2Boost")
  .addEventListener(
    "pointerdown",
    e => {

      e.preventDefault();

      activateBoost();

    }
  );


// ============================================================
// Joystick
// ============================================================

function setupJoystick(
  baseId,
  knobId,
  control
) {

  const base =
    document.getElementById(
      baseId
    );

  const knob =
    document.getElementById(
      knobId
    );

  let active =
    false;

  let pointerId =
    null;

  let origin = {
    x: 0,
    y: 0
  };


  function start(e) {

    if (
      active
    ) return;

    active =
      true;

    pointerId =
      e.pointerId;

    base.setPointerCapture(
      pointerId
    );

    const rect =
      base.getBoundingClientRect();

    origin.x =
      rect.left +
      rect.width / 2;

    origin.y =
      rect.top +
      rect.height / 2;

    base.classList.add(
      "pressed"
    );

    move(e);

  }


  function move(e) {

    if (
      !active ||
      e.pointerId !==
      pointerId
    ) return;

    e.preventDefault();

    const rect =
      base.getBoundingClientRect();

    const max =
      rect.width *
      .38;

    let dx =
      e.clientX -
      origin.x;

    let dy =
      e.clientY -
      origin.y;

    const distanceValue =
      Math.hypot(
        dx,
        dy
      );

    if (
      distanceValue >
      max
    ) {

      dx =
        dx /
        distanceValue *
        max;

      dy =
        dy /
        distanceValue *
        max;

    }

    const dead =
      max *
      .12;

    if (
      distanceValue <
      dead
    ) {

      control.x =
        0;

      control.y =
        0;

      knob.style.transform =
        "translate(0,0)";

      return;

    }

    control.x =
      dx / max;

    control.y =
      dy / max;

    knob.style.transform =
      `translate(${dx}px, ${dy}px)`;

  }


  function end(e) {

    if (
      e.pointerId !==
      pointerId
    ) return;

    active =
      false;

    pointerId =
      null;

    control.x =
      0;

    control.y =
      0;

    knob.style.transform =
      "translate(0,0)";

    base.classList.remove(
      "pressed"
    );

  }


  base.addEventListener(
    "pointerdown",
    start,
    {
      passive: false
    }
  );

  base.addEventListener(
    "pointermove",
    move,
    {
      passive: false
    }
  );

  base.addEventListener(
    "pointerup",
    end
  );

  base.addEventListener(
    "pointercancel",
    end
  );

  base.addEventListener(
    "lostpointercapture",
    () => {

      active =
        false;

      pointerId =
        null;

      control.x =
        0;

      control.y =
        0;

      knob.style.transform =
        "translate(0,0)";

      base.classList.remove(
        "pressed"
      );

    }
  );

  base.style.touchAction =
    "none";

}


setupJoystick(
  "p1JoyBase",
  "p1JoyKnob",
  controls.p1
);

setupJoystick(
  "p2JoyBase",
  "p2JoyKnob",
  controls.p2
);


// ============================================================
// Keyboard
// ============================================================

const keys = {};

window.addEventListener(
  "keydown",
  e => {

    keys[e.key.toLowerCase()] =
      true;

    updateKeyboard();

  }
);

window.addEventListener(
  "keyup",
  e => {

    keys[e.key.toLowerCase()] =
      false;

    updateKeyboard();

  }
);


function updateKeyboard() {

  let x = 0;

  let y = 0;

  if (
    keys["a"] ||
    keys["arrowleft"]
  ) x--;

  if (
    keys["d"] ||
    keys["arrowright"]
  ) x++;

  if (
    keys["w"] ||
    keys["arrowup"]
  ) y--;

  if (
    keys["s"] ||
    keys["arrowdown"]
  ) y++;

  controls.p1.x =
    x;

  controls.p1.y =
    y;

}


// ============================================================
// Fullscreen
// ============================================================

fullscreenBtn.addEventListener(
  "click",
  async () => {

    try {

      if (
        !document.fullscreenElement
      ) {

        await document.documentElement
          .requestFullscreen();

      } else {

        await document.exitFullscreen();

      }

    } catch {}

  }
);


// ============================================================
// Landscape
// ============================================================

function checkOrientation() {

  const width =
    window.innerWidth;

  const height =
    window.innerHeight;

  const mobileLike =
    Math.min(
      width,
      height
    ) < 800;

  const portrait =
    height >
    width;

  const isPortraitMobile =
    mobileLike &&
    portrait;

  rotateScreen.classList.toggle(
    "show",
    isPortraitMobile
  );

  if (
    isPortraitMobile
  ) {

    paused = true;

  } else if (
    running &&
    !countdownRunning
  ) {

    paused = false;

  }

}


function handleResize() {

  checkOrientation();

  requestAnimationFrame(
    resizeCanvas
  );

}


window.addEventListener(
  "resize",
  handleResize
);

window.addEventListener(
  "orientationchange",
  handleResize
);

if (
  window.visualViewport
) {

  window.visualViewport.addEventListener(
    "resize",
    handleResize
  );

}


// ============================================================
// Hide overlay
// ============================================================

function hideOverlay() {

  overlay.classList.add(
    "hidden"
  );

}


// ============================================================
// Waiting
// ============================================================

function startWaitingLoop() {

  if (
    !multiplayer
  ) return;

  setInterval(
    async () => {

      if (
        !countdownRunning
      ) {

        try {

          await tryStartRoomGame();

        } catch {}

      }

    },
    1200
  );

}


// ============================================================
// Init
// ============================================================

async function init() {

  const user =
    await waitForUser();

  myName =
    getSavedName();

  myUid =
    currentUid();

  if (
    !user ||
    !myName ||
    !myUid
  ) {

    window.location.href =
      "../index.html";

    return;

  }

  resizeCanvas();

  checkOrientation();

  await detectMode();

  if (
    multiplayer
  ) {

    startWaitingLoop();

  }

  updateHUD();

}


init();
