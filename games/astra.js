import {
  waitForUser,
  getSavedName,
  getSavedRoom,
  currentUid,
  db,
  ref,
  get,
  set,
  update,
  onValue,
  runTransaction,
  onDisconnect,
  recordRoundResult
} from "../js/app.js";

import {
  getDatabase
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";


/* =========================================================
   CONFIG
========================================================= */

const ARENA = {
  width: 1600,
  height: 900
};

const RESOURCE_COUNT = 24;

const RESOURCE_RESPAWN = 4500;

const FUEL_PER_CARGO = 20;

const MAX_CARGO = 5;

const MAX_FUEL = 100;

const PLAYER_SPEED = 360;

const BOT_SPEED = 310;

const POSITION_SYNC_MS = 80;

const LAUNCH_COUNTDOWN = 3;

const WORLD_WARP_TIME = 1800;


/* =========================================================
   GLOBAL
========================================================= */

let canvas;
let ctx;

let arenaBox;

let playerName = "";
let uid = "";

let roomCode = "";

let onlineMode = false;

let gameStarted = false;
let gameFinished = false;

let lastFrame = performance.now();
let lastSync = 0;

let unsubscribeState = null;
let unsubscribePlayers = null;

let state = null;

let players = {};

let mySlot = null;

let joyVec = {
  x: 0,
  y: 0
};

let keyboard = {
  x: 0,
  y: 0
};

let mute = false;

let stars = [];

let resources = [];

let powerups = [];

let localPlayer = null;

let botPlayer = null;


/* =========================================================
   ELEMENTS
========================================================= */

const $ = id => document.getElementById(id);

const rotateScreen = $("astraRotateScreen");

const canvasEl = $("astraCanvas");

const hudStatus = $("hudStatus");

const playersPanel = $("playersPanel");

const overlayMsg = $("astraOverlayMsg");

const resultBox = $("astraResult");

const joystick = $("astraJoyBase");

const joystickKnob = $("astraJoyKnob");

const powerupButton = $("astraPowerupSlot");

const muteButton = $("astraMuteBtn");

const fullscreenButton = $("astraFullscreenBtn");


/* =========================================================
   HELPERS
========================================================= */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(
    a.x - b.x,
    a.y - b.y
  );
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function safeName(name) {
  return String(name || "بازیکن")
    .replace(/[.#$/\[\]]/g, "_");
}

function showMessage(text) {
  overlayMsg.textContent = text;
  overlayMsg.style.display = "block";
}

function hideMessage() {
  overlayMsg.style.display = "none";
}


/* =========================================================
   CANVAS
========================================================= */

function resizeCanvas() {

  const rect = arenaBox.getBoundingClientRect();

  const dpr = Math.min(
    window.devicePixelRatio || 1,
    2
  );

  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);

  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );
}


/* =========================================================
   STARS
========================================================= */

function createStars() {

  stars = [];

  for (let i = 0; i < 180; i++) {

    stars.push({
      x: Math.random() * ARENA.width,
      y: Math.random() * ARENA.height,
      r: Math.random() * 2 + .3,
      a: Math.random() * .8 + .2
    });

  }
}


/* =========================================================
   RESOURCE GENERATION
========================================================= */

function createResources() {

  resources = [];

  for (let i = 0; i < RESOURCE_COUNT; i++) {

    resources.push({
      id: "resource_" + i,

      x: random(180, ARENA.width - 180),
      y: random(130, ARENA.height - 130),

      active: true,

      claimedBy: null,

      respawnAt: 0
    });

  }
}


/* =========================================================
   SPAWN POSITIONS
========================================================= */

function getSpawnPosition(index) {

  const positions = [

    {
      x: 190,
      y: ARENA.height / 2
    },

    {
      x: ARENA.width - 190,
      y: ARENA.height / 2
    },

    {
      x: ARENA.width / 2,
      y: 150
    },

    {
      x: ARENA.width / 2,
      y: ARENA.height - 150
    },

    {
      x: 300,
      y: 180
    },

    {
      x: ARENA.width - 300,
      y: ARENA.height - 180
    }
  ];

  return positions[
    index % positions.length
  ];
}


/* =========================================================
   LOCAL PLAYER
========================================================= */

function createLocalPlayer() {

  const spawn = getSpawnPosition(
    onlineMode
      ? Object.keys(players).length
      : 0
  );

  return {

    uid,

    name: playerName,

    x: spawn.x,
    y: spawn.y,

    angle: 0,

    cargo: 0,

    fuel: 0,

    powerup: null,

    launching: false,

    launchStarted: 0,

    warpStarted: 0,

    won: false,

    color: "#38bdf8",

    trail: []
  };
}


/* =========================================================
   BOT
========================================================= */

function createBot() {

  return {

    uid: "BOT",

    name: "🤖 ربات",

    x: ARENA.width - 190,
    y: ARENA.height / 2,

    angle: Math.PI,

    cargo: 0,

    fuel: 0,

    powerup: null,

    launching: false,

    launchStarted: 0,

    warpStarted: 0,

    won: false,

    color: "#f97316",

    target: null,

    trail: []
  };
}


/* =========================================================
   ROOM GAME STATE
========================================================= */

function gameRef(path = "") {

  return ref(
    db,
    `rooms/${roomCode}/astraGame${path ? "/" + path : ""}`
  );
}


/* =========================================================
   INITIAL ONLINE STATE
========================================================= */

function defaultOnlineState() {

  return {

    started: true,

    finished: false,

    winner: null,

    winnerName: null,

    createdAt: Date.now(),

    resources: Object.fromEntries(
      resources.map(r => [
        r.id,
        {
          x: r.x,
          y: r.y,
          active: true,
          claimedBy: null,
          respawnAt: 0
        }
      ])
    )

  };
}


async function ensureOnlineGame() {

  const stateRef = gameRef();

  const result = await runTransaction(
    stateRef,
    current => {

      if (current) {
        return current;
      }

      return defaultOnlineState();

    }
  );

  state = result.snapshot.val();

  applyResourcesFromState();
}


/* =========================================================
   RESOURCE STATE
========================================================= */

function applyResourcesFromState() {

  if (!state?.resources) return;

  resources = Object.entries(
    state.resources
  ).map(([id, value]) => ({
    id,

    x: value.x,
    y: value.y,

    active: value.active !== false,

    claimedBy: value.claimedBy || null,

    respawnAt: value.respawnAt || 0
  }));

}


/* =========================================================
   JOIN ONLINE GAME
========================================================= */

async function joinOnlineGame() {

  roomCode = getSavedRoom();

  uid = currentUid();

  if (!roomCode || !uid) {
    onlineMode = false;
    return false;
  }

  onlineMode = true;

  const roomPlayersSnap = await get(
    ref(
      db,
      `rooms/${roomCode}/players`
    )
  );

  players = roomPlayersSnap.val() || {};

  /*
   * خود بازیکن باید در لابی حضور داشته باشد.
   * اگر نبود، Astra خودش او را اضافه می‌کند.
   */

  if (!players[uid]) {

    await set(
      ref(
        db,
        `rooms/${roomCode}/players/${uid}`
      ),
      {
        name: playerName,
        joinedAt: Date.now()
      }
    );

  }

  await ensureOnlineGame();

  /*
   * وضعیت بازیکن
   */

  const myRef = gameRef(
    `/players/${uid}`
  );

  const spawn =
    getSpawnPosition(
      Object.keys(players).indexOf(uid)
    );

  await set(
    myRef,
    {
      uid,
      name: playerName,

      x: spawn.x,
      y: spawn.y,

      angle: 0,

      cargo: 0,
      fuel: 0,

      powerup: null,

      launching: false,

      launchStarted: 0,

      warpStarted: 0,

      won: false,

      online: true,

      updatedAt: Date.now()
    }
  );

  await onDisconnect(myRef).remove();

  subscribeOnlineGame();

  return true;
}


/* =========================================================
   ONLINE SUBSCRIPTIONS
========================================================= */

function subscribeOnlineGame() {

  unsubscribeState = onValue(
    gameRef(),
    snap => {

      const value = snap.val();

      if (!value) return;

      state = value;

      applyResourcesFromState();

      if (
        state.finished &&
        state.winner
      ) {

        finishOnlineResult(
          state.winner,
          state.winnerName
        );

      }

    }
  );


  unsubscribePlayers = onValue(
    gameRef("/players"),
    snap => {

      players = snap.val() || {};

      renderPlayersPanel();

      if (players[uid]) {

        const p = players[uid];

        localPlayer.x = p.x ?? localPlayer.x;
        localPlayer.y = p.y ?? localPlayer.y;

        localPlayer.cargo =
          p.cargo ?? localPlayer.cargo;

        localPlayer.fuel =
          p.fuel ?? localPlayer.fuel;

        localPlayer.powerup =
          p.powerup ?? localPlayer.powerup;

        localPlayer.launching =
          !!p.launching;

        localPlayer.won =
          !!p.won;

      }

    }
  );

}


/* =========================================================
   PLAYER PANEL
========================================================= */

function renderPlayersPanel() {

  if (!onlineMode) {

    playersPanel.innerHTML = `
      <div class="player-card">
        <div class="player-name">
          👤 ${safeName(playerName)}
        </div>

        <div class="player-fuel">
          <div
            class="player-fuel-fill"
            style="width:${localPlayer?.fuel || 0}%;background:#38bdf8"
          ></div>
        </div>

        <div class="player-cargo">
          ⛏️ ${localPlayer?.cargo || 0}/${MAX_CARGO}
          · ⛽ ${Math.floor(localPlayer?.fuel || 0)}%
        </div>
      </div>

      <div class="player-card">
        <div class="player-name">
          🤖 ربات
        </div>

        <div class="player-fuel">
          <div
            class="player-fuel-fill"
            style="width:${botPlayer?.fuel || 0}%;background:#f97316"
          ></div>
        </div>

        <div class="player-cargo">
          ⛏️ ${botPlayer?.cargo || 0}/${MAX_CARGO}
          · ⛽ ${Math.floor(botPlayer?.fuel || 0)}%
        </div>
      </div>
    `;

    return;
  }


  const list = Object.values(players);

  playersPanel.innerHTML = list
    .map(p => {

      const gamePlayer =
        p.uid === uid
          ? localPlayer
          : null;

      const fuel =
        gamePlayer?.fuel ??
        p.fuel ??
        0;

      const cargo =
        gamePlayer?.cargo ??
        p.cargo ??
        0;

      return `
        <div class="player-card">

          <div class="player-name">
            ${p.uid === uid ? "👤" : "🚀"}
            ${safeName(p.name)}
          </div>

          <div class="player-fuel">
            <div
              class="player-fuel-fill"
              style="
                width:${fuel}%;
                background:${p.uid === uid ? "#38bdf8" : "#a78bfa"};
              "
            ></div>
          </div>

          <div class="player-cargo">
            ⛏️ ${cargo}/${MAX_CARGO}
            · ⛽ ${Math.floor(fuel)}%
          </div>

        </div>
      `;

    })
    .join("");

}


/* =========================================================
   SYNC PLAYER
========================================================= */

async function syncPlayer() {

  if (!onlineMode || !localPlayer) return;

  const now = Date.now();

  if (
    now - lastSync <
    POSITION_SYNC_MS
  ) {
    return;
  }

  lastSync = now;

  try {

    await update(
      gameRef(`/players/${uid}`),
      {
        x: localPlayer.x,
        y: localPlayer.y,

        angle: localPlayer.angle,

        cargo: localPlayer.cargo,

        fuel: localPlayer.fuel,

        powerup:
          localPlayer.powerup || null,

        launching:
          localPlayer.launching,

        launchStarted:
          localPlayer.launchStarted || 0,

        warpStarted:
          localPlayer.warpStarted || 0,

        won:
          localPlayer.won,

        updatedAt: now
      }
    );

  } catch (error) {

    console.warn(
      "Astra sync:",
      error
    );

  }

}


/* =========================================================
   CLAIM RESOURCE ONLINE
========================================================= */

async function claimResourceOnline(resource) {

  if (!onlineMode) return false;

  const resourceRef =
    gameRef(
      `/resources/${resource.id}`
    );

  let won = false;

  const result =
    await runTransaction(
      resourceRef,
      current => {

        if (!current) {
          return current;
        }

        if (
          current.active !== true
        ) {
          return;
        }

        current.active = false;

        current.claimedBy = uid;

        current.respawnAt =
          Date.now() +
          RESOURCE_RESPAWN;

        won = true;

        return current;
      }
    );


  if (
    result.committed &&
    won
  ) {

    localPlayer.cargo =
      Math.min(
        MAX_CARGO,
        localPlayer.cargo + 1
      );

    return true;
  }

  return false;
}


/* =========================================================
   RESOURCE RESPAWN
========================================================= */

async function respawnResources() {

  if (!onlineMode || !state?.resources) {
    return;
  }

  const now = Date.now();

  for (const resource of resources) {

    if (
      resource.active === false &&
      resource.respawnAt > 0 &&
      resource.respawnAt <= now
    ) {

      await runTransaction(
        gameRef(
          `/resources/${resource.id}`
        ),
        current => {

          if (!current) {
            return current;
          }

          if (
            current.active !== false
          ) {
            return current;
          }

          if (
            (current.respawnAt || 0)
            > Date.now()
          ) {
            return current;
          }

          return {
            x: current.x,
            y: current.y,

            active: true,

            claimedBy: null,

            respawnAt: 0
          };

        }
      );

    }

  }

}


/* =========================================================
   DELIVER CARGO
========================================================= */

function deliverCargo(player) {

  if (!player) return;

  const spawn =
    getPlayerSpawn(player);

  const d =
    distance(player, spawn);

  if (
    d < 85 &&
    player.cargo > 0
  ) {

    player.fuel =
      Math.min(
        MAX_FUEL,
        player.fuel +
        player.cargo *
        FUEL_PER_CARGO
      );

    player.cargo = 0;

    updateHud();
  }

}


/* =========================================================
   SPAWN / LAUNCH PAD
========================================================= */

function getPlayerSpawn(player) {

  if (!onlineMode) {

    if (player.uid === "BOT") {

      return {
        x: ARENA.width - 190,
        y: ARENA.height / 2
      };

    }

    return {
      x: 190,
      y: ARENA.height / 2
    };

  }

  const all =
    Object.keys(players);

  const index =
    Math.max(
      0,
      all.indexOf(player.uid)
    );

  return getSpawnPosition(index);
}


/* =========================================================
   LAUNCH
========================================================= */

function checkLaunch(player) {

  if (!player) return;

  if (
    player.fuel < MAX_FUEL ||
    player.cargo > 0 ||
    player.launching ||
    player.won
  ) {
    return;
  }

  const spawn =
    getPlayerSpawn(player);

  const padDistance =
    distance(
      player,
      spawn
    );

  if (padDistance > 105) {
    return;
  }

  player.launching = true;

  player.launchStarted =
    Date.now();

  if (onlineMode) {

    update(
      gameRef(`/players/${uid}`),
      {
        launching: true,
        launchStarted:
          player.launchStarted
      }
    );

  }

}


/* =========================================================
   UPDATE LAUNCH
========================================================= */

function updateLaunch(player) {

  if (
    !player?.launching ||
    player.won
  ) {
    return;
  }

  const elapsed =
    Date.now() -
    player.launchStarted;

  if (
    elapsed <
    LAUNCH_COUNTDOWN * 1000
  ) {

    return;
  }

  player.launching = false;

  player.warpStarted =
    Date.now();

  if (onlineMode) {

    update(
      gameRef(`/players/${uid}`),
      {
        launching: false,
        warpStarted:
          player.warpStarted
      }
    );

  }

}


/* =========================================================
   UPDATE WARP
========================================================= */

function updateWarp(player) {

  if (
    !player?.warpStarted ||
    player.won
  ) {
    return;
  }

  const elapsed =
    Date.now() -
    player.warpStarted;

  if (
    elapsed <
    WORLD_WARP_TIME
  ) {
    return;
  }

  player.won = true;

  if (onlineMode) {

    finishOnlineWin();

  } else {

    finishSoloWin();

  }

}


/* =========================================================
   ONLINE WIN
========================================================= */

async function finishOnlineWin() {

  if (!onlineMode) return;

  const winnerRef =
    gameRef();

  const result =
    await runTransaction(
      winnerRef,
      current => {

        if (!current) {
          return current;
        }

        if (
          current.finished
        ) {
          return current;
        }

        current.finished = true;

        current.winner = uid;

        current.winnerName =
          playerName;

        current.finishedAt =
          Date.now();

        return current;
      }
    );


  if (
    result.committed
  ) {

    finishOnlineResult(
      uid,
      playerName
    );

  }

}


/* =========================================================
   ONLINE RESULT
========================================================= */

function finishOnlineResult(
  winnerUid,
  winnerName
) {

  if (gameFinished) return;

  gameFinished = true;

  const iWon =
    winnerUid === uid;

  showResult(
    iWon
      ? "🏆 برنده شدی!"
      : `🚀 ${safeName(winnerName)} زودتر رسید!`,
    iWon
      ? "تو به World 2 رسیدی 🌌"
      : "این بار رقیبت برنده شد!"
  );

  recordRoundResult(
    playerName,
    "astra",
    {
      won: iWon
    }
  ).catch(() => {});

}


/* =========================================================
   SOLO
========================================================= */

function startSolo() {

  onlineMode = false;

  createResources();

  localPlayer =
    createLocalPlayer();

  botPlayer =
    createBot();

  renderPlayersPanel();

  hudStatus.textContent =
    "تک‌نفره · رقابت با ربات";

  gameStarted = true;

}


/* =========================================================
   BOT AI
========================================================= */

function updateBot(dt) {

  if (!botPlayer || botPlayer.won) {
    return;
  }

  if (botPlayer.launching) {
    updateLaunch(botPlayer);
    updateWarp(botPlayer);
    return;
  }

  /*
   * اگر محموله دارد،
   * برگردد به پایگاه خودش.
   */

  if (
    botPlayer.cargo >= MAX_CARGO
  ) {

    botPlayer.target =
      getPlayerSpawn(botPlayer);

  } else {

    /*
     * نزدیک‌ترین منبع فعال
     */

    let best = null;
    let bestDistance = Infinity;

    for (const resource of resources) {

      if (!resource.active) {
        continue;
      }

      const d =
        distance(
          botPlayer,
          resource
        );

      if (d < bestDistance) {

        bestDistance = d;
        best = resource;

      }

    }

    botPlayer.target =
      best;
  }


  if (!botPlayer.target) {
    return;
  }

  const target =
    botPlayer.target;

  const dx =
    target.x - botPlayer.x;

  const dy =
    target.y - botPlayer.y;

  const len =
    Math.hypot(dx, dy) || 1;

  const vx =
    dx / len;

  const vy =
    dy / len;

  botPlayer.angle =
    Math.atan2(vy, vx);

  botPlayer.x +=
    vx *
    BOT_SPEED *
    dt;

  botPlayer.y +=
    vy *
    BOT_SPEED *
    dt;

  botPlayer.x =
    clamp(
      botPlayer.x,
      35,
      ARENA.width - 35
    );

  botPlayer.y =
    clamp(
      botPlayer.y,
      35,
      ARENA.height - 35
    );


  /*
   * گرفتن منبع
   */

  for (const resource of resources) {

    if (
      !resource.active
    ) {
      continue;
    }

    if (
      distance(
        botPlayer,
        resource
      ) < 45
    ) {

      resource.active = false;

      resource.respawnAt =
        Date.now() +
        RESOURCE_RESPAWN;

      botPlayer.cargo =
        Math.min(
          MAX_CARGO,
          botPlayer.cargo + 1
        );

    }

  }


  /*
   * تحویل محموله
   */

  deliverCargo(botPlayer);

  /*
   * اگر سوخت کامل شد،
   * به Launch Pad برود.
   */

  if (
    botPlayer.fuel >= MAX_FUEL
  ) {

    botPlayer.target =
      getPlayerSpawn(botPlayer);

    checkLaunch(botPlayer);

  }

}


/* =========================================================
   SOLO RESOURCE RESPAWN
========================================================= */

function updateSoloResources() {

  if (onlineMode) return;

  const now = Date.now();

  for (const r of resources) {

    if (
      !r.active &&
      r.respawnAt <= now
    ) {

      r.active = true;
      r.claimedBy = null;
      r.respawnAt = 0;

    }

  }

}


/* =========================================================
   PLAYER MOVEMENT
========================================================= */

function getMovementVector() {

  let x =
    joyVec.x +
    keyboard.x;

  let y =
    joyVec.y +
    keyboard.y;

  const len =
    Math.hypot(x, y);

  if (len > 1) {

    x /= len;
    y /= len;

  }

  return {
    x,
    y
  };

}


function updateLocalPlayer(dt) {

  if (
    !localPlayer ||
    localPlayer.won
  ) {
    return;
  }

  if (
    localPlayer.launching
  ) {

    updateLaunch(localPlayer);

    updateWarp(localPlayer);

    return;
  }

  const movement =
    getMovementVector();

  if (
    movement.x ||
    movement.y
  ) {

    localPlayer.angle =
      Math.atan2(
        movement.y,
        movement.x
      );

  }

  localPlayer.x +=
    movement.x *
    PLAYER_SPEED *
    dt;

  localPlayer.y +=
    movement.y *
    PLAYER_SPEED *
    dt;

  localPlayer.x =
    clamp(
      localPlayer.x,
      35,
      ARENA.width - 35
    );

  localPlayer.y =
    clamp(
      localPlayer.y,
      35,
      ARENA.height - 35
    );


  /*
   * گرفتن منابع
   */

  if (!onlineMode) {

    for (const resource of resources) {

      if (
        !resource.active
      ) {
        continue;
      }

      if (
        distance(
          localPlayer,
          resource
        ) < 45
      ) {

        resource.active = false;

        resource.respawnAt =
          Date.now() +
          RESOURCE_RESPAWN;

        localPlayer.cargo =
          Math.min(
            MAX_CARGO,
            localPlayer.cargo + 1
          );

      }

    }

  } else {

    for (const resource of resources) {

      if (
        !resource.active
      ) {
        continue;
      }

      if (
        distance(
          localPlayer,
          resource
        ) < 45
      ) {

        claimResourceOnline(
          resource
        );

      }

    }

  }


  /*
   * بازگشت به سفینه
   */

  deliverCargo(
    localPlayer
  );


  /*
   * رسیدن به Launch Pad
   */

  checkLaunch(
    localPlayer
  );

}


/* =========================================================
   POWERUP
========================================================= */

function usePowerup() {

  if (
    !localPlayer ||
    !localPlayer.powerup
  ) {
    return;
  }

  if (
    localPlayer.powerup === "turbo"
  ) {

    localPlayer.x +=
      Math.cos(localPlayer.angle)
      * 130;

    localPlayer.y +=
      Math.sin(localPlayer.angle)
      * 130;

  }

  localPlayer.powerup = null;

  powerupButton.textContent =
    "⚡";

}


/* =========================================================
   DRAW
========================================================= */

function worldToScreen(x, y) {

  const width =
    canvas.clientWidth;

  const height =
    canvas.clientHeight;

  const scale =
    Math.min(
      width / ARENA.width,
      height / ARENA.height
    );

  const offsetX =
    (width -
      ARENA.width * scale) / 2;

  const offsetY =
    (height -
      ARENA.height * scale) / 2;

  return {
    x:
      offsetX +
      x * scale,

    y:
      offsetY +
      y * scale,

    scale
  };

}


/* =========================================================
   BACKGROUND
========================================================= */

function drawBackground() {

  const width =
    canvas.clientWidth;

  const height =
    canvas.clientHeight;

  ctx.clearRect(
    0,
    0,
    width,
    height
  );


  const gradient =
    ctx.createRadialGradient(
      width / 2,
      height / 2,
      20,
      width / 2,
      height / 2,
      Math.max(width, height)
    );

  gradient.addColorStop(
    0,
    "#0f1f46"
  );

  gradient.addColorStop(
    1,
    "#020617"
  );

  ctx.fillStyle =
    gradient;

  ctx.fillRect(
    0,
    0,
    width,
    height
  );


  for (const star of stars) {

    const p =
      worldToScreen(
        star.x,
        star.y
      );

    ctx.globalAlpha =
      star.a;

    ctx.fillStyle =
      "#ffffff";

    ctx.beginPath();

    ctx.arc(
      p.x,
      p.y,
      star.r * p.scale,
      0,
      Math.PI * 2
    );

    ctx.fill();

  }

  ctx.globalAlpha = 1;

}


/* =========================================================
   DRAW ARENA
========================================================= */

function drawArena() {

  const tl =
    worldToScreen(
      0,
      0
    );

  const br =
    worldToScreen(
      ARENA.width,
      ARENA.height
    );

  const w =
    br.x - tl.x;

  const h =
    br.y - tl.y;

  ctx.strokeStyle =
    "rgba(56,189,248,.15)";

  ctx.lineWidth = 2;

  ctx.strokeRect(
    tl.x,
    tl.y,
    w,
    h
  );


  /*
   * خطوط مسیر
   */

  ctx.strokeStyle =
    "rgba(255,255,255,.035)";

  ctx.lineWidth = 1;

  for (
    let x = 0;
    x <= ARENA.width;
    x += 100
  ) {

    const a =
      worldToScreen(
        x,
        0
      );

    const b =
      worldToScreen(
        x,
        ARENA.height
      );

    ctx.beginPath();

    ctx.moveTo(
      a.x,
      a.y
    );

    ctx.lineTo(
      b.x,
      b.y
    );

    ctx.stroke();

  }

  for (
    let y = 0;
    y <= ARENA.height;
    y += 100
  ) {

    const a =
      worldToScreen(
        0,
        y
      );

    const b =
      worldToScreen(
        ARENA.width,
        y
      );

    ctx.beginPath();

    ctx.moveTo(
      a.x,
      a.y
    );

    ctx.lineTo(
      b.x,
      b.y
    );

    ctx.stroke();

  }

}


/* =========================================================
   DRAW LAUNCH PAD
========================================================= */

function drawLaunchPad(
  player,
  color,
  label
) {

  const spawn =
    getPlayerSpawn(player);

  const p =
    worldToScreen(
      spawn.x,
      spawn.y
    );

  const radius =
    72 *
    p.scale;

  ctx.save();

  ctx.globalAlpha = .75;

  ctx.strokeStyle =
    color;

  ctx.lineWidth = 3;

  ctx.beginPath();

  ctx.arc(
    p.x,
    p.y,
    radius,
    0,
    Math.PI * 2
  );

  ctx.stroke();


  ctx.globalAlpha = .2;

  ctx.fillStyle =
    color;

  ctx.beginPath();

  ctx.arc(
    p.x,
    p.y,
    radius,
    0,
    Math.PI * 2
  );

  ctx.fill();


  ctx.globalAlpha = 1;

  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    `${Math.max(9, 12 * p.scale)}px system-ui`;

  ctx.textAlign =
    "center";

  ctx.fillText(
    label,
    p.x,
    p.y + 4
  );

  ctx.restore();

}


/* =========================================================
   DRAW RESOURCE
========================================================= */

function drawResource(resource) {

  if (!resource.active) {
    return;
  }

  const p =
    worldToScreen(
      resource.x,
      resource.y
    );

  const pulse =
    1 +
    Math.sin(
      Date.now() / 250 +
      resource.x
    ) * .12;

  const r =
    12 *
    p.scale *
    pulse;


  ctx.save();

  ctx.shadowBlur =
    20;

  ctx.shadowColor =
    "#22d3ee";

  ctx.fillStyle =
    "#22d3ee";

  ctx.beginPath();

  ctx.arc(
    p.x,
    p.y,
    r,
    0,
    Math.PI * 2
  );

  ctx.fill();


  ctx.shadowBlur = 0;

  ctx.fillStyle =
    "#cffafe";

  ctx.beginPath();

  ctx.arc(
    p.x - r * .3,
    p.y - r * .3,
    r * .3,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.restore();

}


/* =========================================================
   DRAW SHIP
========================================================= */

function drawShip(
  player,
  color,
  label
) {

  if (!player) return;

  const p =
    worldToScreen(
      player.x,
      player.y
    );

  const size =
    25 *
    p.scale;


  ctx.save();

  ctx.translate(
    p.x,
    p.y
  );

  ctx.rotate(
    player.angle
  );


  /*
   * موتور
   */

  ctx.fillStyle =
    "#facc15";

  ctx.shadowBlur =
    18;

  ctx.shadowColor =
    "#facc15";

  ctx.beginPath();

  ctx.moveTo(
    -size,
    0
  );

  ctx.lineTo(
    -size * 2,
    -size * .45
  );

  ctx.lineTo(
    -size * 2,
    size * .45
  );

  ctx.closePath();

  ctx.fill();


  /*
   * بدنه
   */

  ctx.shadowBlur =
    25;

  ctx.shadowColor =
    color;

  ctx.fillStyle =
    color;

  ctx.beginPath();

  ctx.moveTo(
    size,
    0
  );

  ctx.lineTo(
    -size * .75,
    -size * .65
  );

  ctx.lineTo(
    -size * .35,
    0
  );

  ctx.lineTo(
    -size * .75,
    size * .65
  );

  ctx.closePath();

  ctx.fill();


  /*
   * شیشه
   */

  ctx.shadowBlur = 0;

  ctx.fillStyle =
    "#e0f2fe";

  ctx.beginPath();

  ctx.arc(
    size * .1,
    0,
    size * .27,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.restore();


  /*
   * نام
   */

  ctx.save();

  ctx.font =
    `bold ${Math.max(
      10,
      13 * p.scale
    )}px system-ui`;

  ctx.textAlign =
    "center";

  ctx.fillStyle =
    "#ffffff";

  ctx.fillText(
    label,
    p.x,
    p.y - 30 * p.scale
  );


  /*
   * سوخت
   */

  const fuel =
    clamp(
      player.fuel || 0,
      0,
      100
    );

  const barWidth =
    70 * p.scale;

  const barHeight =
    5 * p.scale;

  ctx.fillStyle =
    "rgba(255,255,255,.15)";

  ctx.fillRect(
    p.x - barWidth / 2,
    p.y + 30 * p.scale,
    barWidth,
    barHeight
  );

  ctx.fillStyle =
    color;

  ctx.fillRect(
    p.x - barWidth / 2,
    p.y + 30 * p.scale,
    barWidth * (fuel / 100),
    barHeight
  );

  ctx.restore();

}


/* =========================================================
   DRAW OTHER ONLINE PLAYERS
========================================================= */

function drawOnlinePlayers() {

  for (
    const [playerUid, data]
    of Object.entries(players)
  ) {

    if (
      playerUid === uid
    ) {
      continue;
    }

    const other = {

      uid: playerUid,

      name:
        data.name || "بازیکن",

      x:
        data.x ??
        ARENA.width / 2,

      y:
        data.y ??
        ARENA.height / 2,

      angle:
        data.angle || 0,

      cargo:
        data.cargo || 0,

      fuel:
        data.fuel || 0,

      launching:
        !!data.launching,

      won:
        !!data.won
    };

    drawShip(
      other,
      "#a78bfa",
      "🚀 " + other.name
    );

    drawLaunchPad(
      other,
      "#a78bfa",
      "PAD"
    );

  }

}


/* =========================================================
   DRAW COUNTDOWN
========================================================= */

function drawLaunchCountdown(
  player
) {

  if (
    !player?.launching
  ) {
    return;
  }

  const elapsed =
    Date.now() -
    player.launchStarted;

  const remaining =
    Math.max(
      0,
      Math.ceil(
        LAUNCH_COUNTDOWN -
        elapsed / 1000
      )
    );

  const width =
    canvas.clientWidth;

  const height =
    canvas.clientHeight;

  ctx.save();

  ctx.fillStyle =
    "rgba(2,6,23,.22)";

  ctx.fillRect(
    0,
    0,
    width,
    height
  );

  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    "900 70px system-ui";

  ctx.textAlign =
    "center";

  ctx.textBaseline =
    "middle";

  ctx.shadowBlur =
    25;

  ctx.shadowColor =
    "#38bdf8";

  ctx.fillText(
    remaining > 0
      ? remaining
      : "🚀",
    width / 2,
    height / 2
  );

  ctx.restore();

}


/* =========================================================
   DRAW WARP
========================================================= */

function drawWarp(player) {

  if (
    !player?.warpStarted
  ) {
    return;
  }

  const elapsed =
    Date.now() -
    player.warpStarted;

  const progress =
    clamp(
      elapsed / WORLD_WARP_TIME,
      0,
      1
    );

  const width =
    canvas.clientWidth;

  const height =
    canvas.clientHeight;

  ctx.save();

  ctx.globalAlpha =
    progress * .8;

  ctx.strokeStyle =
    "#ffffff";

  ctx.lineWidth = 2;

  for (let i = 0; i < 35; i++) {

    const y =
      Math.random() *
      height;

    const centerX =
      width / 2;

    const length =
      (40 +
        Math.random() * 180)
      * progress;

    ctx.beginPath();

    ctx.moveTo(
      centerX - length,
      y
    );

    ctx.lineTo(
      centerX + length,
      y
    );

    ctx.stroke();

  }

  ctx.restore();

}


/* =========================================================
   DRAW WORLD 2
========================================================= */

function drawWorld2Message() {

  if (
    !gameFinished ||
    !localPlayer?.won
  ) {
    return;
  }

  const width =
    canvas.clientWidth;

  const height =
    canvas.clientHeight;

  ctx.save();

  const gradient =
    ctx.createRadialGradient(
      width / 2,
      height / 2,
      10,
      width / 2,
      height / 2,
      250
    );

  gradient.addColorStop(
    0,
    "rgba(56,189,248,.45)"
  );

  gradient.addColorStop(
    1,
    "rgba(2,6,23,0)"
  );

  ctx.fillStyle =
    gradient;

  ctx.fillRect(
    0,
    0,
    width,
    height
  );

  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    "900 40px system-ui";

  ctx.textAlign =
    "center";

  ctx.fillText(
    "🌌 WORLD 2",
    width / 2,
    height / 2
  );

  ctx.restore();

}


/* =========================================================
   DRAW LOOP
========================================================= */

function draw() {

  drawBackground();

  drawArena();


  /*
   * Launch pads
   */

  if (localPlayer) {

    drawLaunchPad(
      localPlayer,
      "#38bdf8",
      "YOUR PAD"
    );

  }

  if (!onlineMode && botPlayer) {

    drawLaunchPad(
      botPlayer,
      "#f97316",
      "BOT PAD"
    );

  }


  /*
   * منابع
   */

  for (
    const resource of resources
  ) {

    drawResource(resource);

  }


  /*
   * بازیکنان
   */

  if (localPlayer) {

    drawShip(
      localPlayer,
      "#38bdf8",
      "👤 " + playerName
    );

  }


  if (onlineMode) {

    drawOnlinePlayers();

  } else {

    if (botPlayer) {

      drawShip(
        botPlayer,
        "#f97316",
        "🤖 ربات"
      );

    }

  }


  drawLaunchCountdown(
    localPlayer
  );

  drawWarp(
    localPlayer
  );

  drawWorld2Message();

}


/* =========================================================
   HUD
========================================================= */

function updateHud() {

  if (!localPlayer) {
    return;
  }

  if (
    localPlayer.launching
  ) {

    const elapsed =
      Date.now() -
      localPlayer.launchStarted;

    const remaining =
      Math.max(
        0,
        Math.ceil(
          LAUNCH_COUNTDOWN -
          elapsed / 1000
        )
      );

    hudStatus.textContent =
      `🚀 پرتاب در ${remaining}`;

    return;

  }


  if (
    localPlayer.warpStarted
  ) {

    hudStatus.textContent =
      "🌌 در حال Warp به World 2...";

    return;

  }


  if (
    localPlayer.fuel >= 100
  ) {

    hudStatus.textContent =
      "🔥 سوخت کامل! به Launch Pad برو";

    return;

  }


  hudStatus.textContent =
    onlineMode
      ? `👥 ${Object.keys(players).length} بازیکن آنلاین · ⛽ ${Math.floor(localPlayer.fuel)}%`
      : `🤖 مقابل ربات · ⛽ ${Math.floor(localPlayer.fuel)}%`;

}


/* =========================================================
   RESULT
========================================================= */

function showResult(
  title,
  subtitle
) {

  resultBox.innerHTML = `

    <div class="result-title">
      ${title}
    </div>

    <div class="result-sub">
      ${subtitle}
    </div>

  `;

  resultBox.style.display =
    "flex";

}


/* =========================================================
   SOLO WIN
========================================================= */

function finishSoloWin() {

  if (gameFinished) {
    return;
  }

  gameFinished = true;

  showResult(
    "🏆 برنده شدی!",
    "با موفقیت به World 2 رسیدی 🌌"
  );

  recordRoundResult(
    playerName,
    "astra",
    {
      won: true
    }
  ).catch(() => {});

}


/* =========================================================
   SOLO BOT WIN
========================================================= */

function checkBotWin() {

  if (
    !botPlayer ||
    botPlayer.won ||
    gameFinished
  ) {
    return;
  }

  if (
    botPlayer.warpStarted
  ) {

    const elapsed =
      Date.now() -
      botPlayer.warpStarted;

    if (
      elapsed >=
      WORLD_WARP_TIME
    ) {

      botPlayer.won = true;

      gameFinished = true;

      showResult(
        "🤖 ربات برد!",
        "ربات زودتر به World 2 رسید 🚀"
      );

      recordRoundResult(
        playerName,
        "astra",
        {
          won: false
        }
      ).catch(() => {});

    }

  }

}


/* =========================================================
   UPDATE
========================================================= */

async function update(dt) {

  if (!gameStarted) {
    return;
  }

  if (gameFinished) {
    return;
  }


  updateLocalPlayer(
    dt
  );


  if (!onlineMode) {

    updateBot(
      dt
    );

    updateSoloResources();

    checkBotWin();

  } else {

    await respawnResources();

  }


  updateHud();

  renderPlayersPanel();

  syncPlayer();

}


/* =========================================================
   GAME LOOP
========================================================= */

function loop(now) {

  const dt =
    Math.min(
      .05,
      (now - lastFrame) / 1000
    );

  lastFrame = now;

  update(dt);

  draw();

  requestAnimationFrame(
    loop
  );

}


/* =========================================================
   JOYSTICK
========================================================= */

let joystickPointer = null;

function resetJoystick() {

  joyVec.x = 0;
  joyVec.y = 0;

  joystickKnob.style.transform =
    "translate(-50%, -50%)";

  joystickPointer = null;

}


function moveJoystick(
  clientX,
  clientY
) {

  const rect =
    joystick.getBoundingClientRect();

  const centerX =
    rect.left +
    rect.width / 2;

  const centerY =
    rect.top +
    rect.height / 2;

  let dx =
    clientX - centerX;

  let dy =
    clientY - centerY;

  const max =
    rect.width * .37;

  const len =
    Math.hypot(
      dx,
      dy
    );

  if (len > max) {

    dx =
      dx / len * max;

    dy =
      dy / len * max;

  }

  joyVec.x =
    dx / max;

  joyVec.y =
    dy / max;

  joystickKnob.style.transform =
    `translate(
      calc(-50% + ${dx}px),
      calc(-50% + ${dy}px)
    )`;

}


joystick.addEventListener(
  "pointerdown",
  event => {

    event.preventDefault();

    joystickPointer =
      event.pointerId;

    joystick.setPointerCapture(
      event.pointerId
    );

    moveJoystick(
      event.clientX,
      event.clientY
    );

  }
);


joystick.addEventListener(
  "pointermove",
  event => {

    if (
      event.pointerId !==
      joystickPointer
    ) {
      return;
    }

    event.preventDefault();

    moveJoystick(
      event.clientX,
      event.clientY
    );

  }
);


joystick.addEventListener(
  "pointerup",
  resetJoystick
);


joystick.addEventListener(
  "pointercancel",
  resetJoystick
);


/* =========================================================
   KEYBOARD
========================================================= */

window.addEventListener(
  "keydown",
  event => {

    const key =
      event.key.toLowerCase();

    if (
      [
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
        "w",
        "a",
        "s",
        "d",
        " "
      ].includes(key)
    ) {

      event.preventDefault();

    }

    if (
      key === "arrowup" ||
      key === "w"
    ) {

      keyboard.y = -1;

    }

    if (
      key === "arrowdown" ||
      key === "s"
    ) {

      keyboard.y = 1;

    }

    if (
      key === "arrowleft" ||
      key === "a"
    ) {

      keyboard.x = -1;

    }

    if (
      key === "arrowright" ||
      key === "d"
    ) {

      keyboard.x = 1;

    }

    if (
      key === " "
    ) {

      usePowerup();

    }

  }
);


window.addEventListener(
  "keyup",
  event => {

    const key =
      event.key.toLowerCase();

    if (
      key === "arrowup" ||
      key === "w"
    ) {

      if (keyboard.y < 0) {
        keyboard.y = 0;
      }

    }

    if (
      key === "arrowdown" ||
      key === "s"
    ) {

      if (keyboard.y > 0) {
        keyboard.y = 0;
      }

    }

    if (
      key === "arrowleft" ||
      key === "a"
    ) {

      if (keyboard.x < 0) {
        keyboard.x = 0;
      }

    }

    if (
      key === "arrowright" ||
      key === "d"
    ) {

      if (keyboard.x > 0) {
        keyboard.x = 0;
      }

    }

  }
);


/* =========================================================
   POWERUP BUTTON
========================================================= */

powerupButton.addEventListener(
  "click",
  usePowerup
);


/* =========================================================
   FULLSCREEN
========================================================= */

fullscreenButton.addEventListener(
  "click",
  async () => {

    try {

      if (!document.fullscreenElement) {

        await document.documentElement
          .requestFullscreen();

      } else {

        await document.exitFullscreen();

      }

    } catch (error) {

      console.warn(
        "Fullscreen:",
        error
      );

    }

  }
);


/* =========================================================
   MUTE
========================================================= */

muteButton.addEventListener(
  "click",
  () => {

    mute = !mute;

    muteButton.textContent =
      mute
        ? "🔇"
        : "🔊";

  }
);


/* =========================================================
   ORIENTATION
========================================================= */

function checkOrientation() {

  const portrait =
    window.innerHeight >
    window.innerWidth;

  rotateScreen.style.display =
    portrait
      ? "flex"
      : "none";

}


/* =========================================================
   INITIALIZE
========================================================= */

async function init() {

  canvas =
    canvasEl;

  ctx =
    canvas.getContext(
      "2d"
    );

  arenaBox =
    $("astraArenaBox");


  /*
   * احراز هویت
   */

  const user =
    await waitForUser();

  if (!user) {

    window.location.href =
      "../index.html";

    return;

  }


  playerName =
    getSavedName() ||
    "بازیکن";

  uid =
    currentUid();


  /*
   * آماده‌سازی
   */

  createStars();

  resizeCanvas();

  window.addEventListener(
    "resize",
    () => {

      resizeCanvas();

      checkOrientation();

    }
  );


  checkOrientation();


  /*
   * تشخیص حالت:
   *
   * اتاق موجود باشد
   * → Multiplayer
   *
   * اتاق موجود نباشد
   * → Solo + Bot
   */

  roomCode =
    getSavedRoom();


  if (roomCode) {

    showMessage(
      "🌐 در حال اتصال به اتاق..."
    );

    const connected =
      await joinOnlineGame();

    if (connected) {

      localPlayer =
        createLocalPlayer();

      gameStarted = true;

      hideMessage();

      hudStatus.textContent =
        "🌐 بازی آنلاین آماده است";

    } else {

      startSolo();

      hideMessage();

    }

  } else {

    startSolo();

  }


  requestAnimationFrame(
    loop
  );

}


init().catch(
  error => {

    console.error(
      "Astra initialization error:",
      error
    );

    showMessage(
      "❌ خطا در اجرای Astra"
    );

  }
);
