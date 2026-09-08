import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ======================================================
// DOM
// ======================================================

const canvas = document.getElementById("astraCanvas");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("astraOverlayMsg");
const result = document.getElementById("astraResult");

const hudMode = document.getElementById("hudMode");
const hudTimer = document.getElementById("hudTimer");
const playersHud = document.getElementById("playersHud");

const muteBtn = document.getElementById("astraMuteBtn");
const fullscreenBtn = document.getElementById("astraFullscreenBtn");

const p1JoyBase = document.getElementById("p1JoyBase");
const p1JoyKnob = document.getElementById("p1JoyKnob");

const p2JoyBase = document.getElementById("p2JoyBase");
const p2JoyKnob = document.getElementById("p2JoyKnob");

const p1Boost = document.getElementById("p1Boost");
const p2Boost = document.getElementById("p2Boost");

const powerupIndicator = document.getElementById("powerupIndicator");

// ======================================================
// GAME SETTINGS
// ======================================================

const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1400;

const PLAYER_RADIUS = 28;
const PLAYER_SPEED = 5;

const ENERGY_NEEDED = 100;

let muted = false;
let gameRunning = false;
let gameFinished = false;

let lastTime = performance.now();

let camera = {
  x: 0,
  y: 0
};

// ======================================================
// PLAYERS
// ======================================================

const players = {
  p1: {
    id: "p1",
    name: "بازیکن ۱",
    x: 450,
    y: WORLD_HEIGHT / 2,
    vx: 0,
    vy: 0,
    energy: 0,
    boost: 100,
    color: "#4f7cff",
    glow: "#6b9cff",
    score: 0,
    world2: false
  },

  p2: {
    id: "p2",
    name: "بازیکن ۲",
    x: WORLD_WIDTH - 450,
    y: WORLD_HEIGHT / 2,
    vx: 0,
    vy: 0,
    energy: 0,
    boost: 100,
    color: "#9b5cff",
    glow: "#d34cff",
    score: 0,
    world2: false
  }
};

// ======================================================
// INPUT
// ======================================================

const keys = {};

window.addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;

  if (e.key === " ") {
    e.preventDefault();
    boost(players.p1);
  }
});

window.addEventListener("keyup", e => {
  keys[e.key.toLowerCase()] = false;
});

const joystick = {
  p1: { x: 0, y: 0 },
  p2: { x: 0, y: 0 }
};

// ======================================================
// RESIZE
// ======================================================

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);

resizeCanvas();

// ======================================================
// JOYSTICKS
// ======================================================

function setupJoystick(base, knob, player) {
  let activePointer = null;

  function move(e) {
    if (activePointer !== e.pointerId) return;

    const rect = base.getBoundingClientRect();

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;

    const max = rect.width * 0.28;

    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > max) {
      dx = dx / distance * max;
      dy = dy / distance * max;
    }

    joystick[player].x = dx / max;
    joystick[player].y = dy / max;

    knob.style.transform =
      `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    base.classList.add("pressed");
  }

  function stop(e) {
    if (activePointer !== e.pointerId) return;

    activePointer = null;

    joystick[player].x = 0;
    joystick[player].y = 0;

    knob.style.transform = "translate(-50%,-50%)";

    base.classList.remove("pressed");
  }

  base.addEventListener("pointerdown", e => {
    activePointer = e.pointerId;

    base.setPointerCapture(e.pointerId);

    move(e);
  });

  base.addEventListener("pointermove", move);
  base.addEventListener("pointerup", stop);
  base.addEventListener("pointercancel", stop);
}

setupJoystick(p1JoyBase, p1JoyKnob, "p1");
setupJoystick(p2JoyBase, p2JoyKnob, "p2");

// ======================================================
// BOOST
// ======================================================

function boost(player) {
  if (!gameRunning) return;

  if (player.boost < 20) return;

  player.boost -= 20;

  const angle = Math.atan2(player.vy, player.vx);

  if (!Number.isFinite(angle)) return;

  player.vx += Math.cos(angle) * 7;
  player.vy += Math.sin(angle) * 7;

  createParticles(player.x, player.y, player.color, 15);
}

// ======================================================
// POWER CELLS
// ======================================================

const cells = [];

function createCells() {
  cells.length = 0;

  for (let i = 0; i < 55; i++) {
    cells.push({
      x: 100 + Math.random() * (WORLD_WIDTH - 200),
      y: 140 + Math.random() * (WORLD_HEIGHT - 280),
      r: 11,
      energy: 5 + Math.floor(Math.random() * 6),
      phase: Math.random() * Math.PI * 2,
      taken: false
    });
  }
}

createCells();

// ======================================================
// PARTICLES
// ======================================================

const particles = [];

function createParticles(x, y, color, amount = 8) {
  for (let i = 0; i < amount; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - .5) * 7,
      vy: (Math.random() - .5) * 7,
      life: 1,
      size: 2 + Math.random() * 5,
      color
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;

    p.vx *= .97;
    p.vy *= .97;

    p.life -= dt * 2;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// ======================================================
// STARS
// ======================================================

const stars = [];

for (let i = 0; i < 350; i++) {
  stars.push({
    x: Math.random() * WORLD_WIDTH,
    y: Math.random() * WORLD_HEIGHT,
    r: Math.random() * 2 + .5,
    alpha: Math.random()
  });
}

// ======================================================
// WORLD 2 ROCKET
// ======================================================

const rocket = {
  x: WORLD_WIDTH / 2,
  y: WORLD_HEIGHT / 2,
  active: false,
  owner: null,
  progress: 0
};

// ======================================================
// UPDATE PLAYER
// ======================================================

function updatePlayer(player, inputX, inputY, dt) {
  let x = inputX;
  let y = inputY;

  // P1 keyboard
  if (player.id === "p1") {
    if (keys["w"] || keys["arrowup"]) y -= 1;
    if (keys["s"] || keys["arrowdown"]) y += 1;
    if (keys["a"] || keys["arrowleft"]) x -= 1;
    if (keys["d"] || keys["arrowright"]) x += 1;
  }

  // P2 keyboard
  if (player.id === "p2") {
    if (keys["i"]) y -= 1;
    if (keys["k"]) y += 1;
    if (keys["j"]) x -= 1;
    if (keys["l"]) x += 1;
  }

  const length = Math.sqrt(x * x + y * y);

  if (length > 1) {
    x /= length;
    y /= length;
  }

  const speed = PLAYER_SPEED;

  player.vx += (x * speed - player.vx) * .18;
  player.vy += (y * speed - player.vy) * .18;

  player.x += player.vx * dt * 60;
  player.y += player.vy * dt * 60;

  player.x = Math.max(50, Math.min(WORLD_WIDTH - 50, player.x));
  player.y = Math.max(100, Math.min(WORLD_HEIGHT - 50, player.y));

  player.boost += dt * 7;

  player.boost = Math.min(100, player.boost);
}

// ======================================================
// COLLECT ENERGY
// ======================================================

function collectEnergy(player) {
  for (const cell of cells) {
    if (cell.taken) continue;

    const dx = player.x - cell.x;
    const dy = player.y - cell.y;

    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < PLAYER_RADIUS + cell.r + 10) {
      cell.taken = true;

      player.energy += cell.energy;

      player.energy = Math.min(ENERGY_NEEDED, player.energy);

      player.score += cell.energy;

      createParticles(
        cell.x,
        cell.y,
        player.color,
        12
      );

      if (player.energy >= ENERGY_NEEDED) {
        activateRocket(player);
      }
    }
  }
}

// ======================================================
// ROCKET
// ======================================================

function activateRocket(player) {
  if (rocket.active || gameFinished) return;

  rocket.active = true;
  rocket.owner = player.id;
  rocket.progress = 0;

  hudMode.textContent = `${player.name} موشک را فعال کرد!`;

  createParticles(
    rocket.x,
    rocket.y,
    "#ffd34f",
    40
  );
}

// ======================================================
// UPDATE ROCKET
// ======================================================

function updateRocket(dt) {
  if (!rocket.active) return;

  rocket.progress += dt * .55;

  createParticles(
    rocket.x + (Math.random() - .5) * 30,
    rocket.y + 35,
    "#ff8c42",
    2
  );

  if (rocket.progress >= 1) {
    finishGame(rocket.owner);
  }
}

// ======================================================
// GAME FINISH
// ======================================================

function finishGame(winnerId) {
  if (gameFinished) return;

  gameFinished = true;
  gameRunning = false;

  const winner = players[winnerId];

  winner.world2 = true;

  result.innerHTML = `
    <div class="result-title">
      🚀 ${winner.name} وارد World 2 شد!
    </div>

    <div class="result-sub">
      🏆 برنده مسابقه Domito Astra
    </div>

    <div class="result-players">

      <div class="result-player">
        <div class="name">🔵 ${players.p1.name}</div>
        <div class="score">
          انرژی: ${Math.floor(players.p1.energy)}
        </div>
      </div>

      <div class="result-player">
        <div class="name">🟣 ${players.p2.name}</div>
        <div class="score">
          انرژی: ${Math.floor(players.p2.energy)}
        </div>
      </div>

    </div>

    <button class="result-button" id="restartAstra">
      🔄 بازی دوباره
    </button>
  `;

  result.classList.add("show");

  document
    .getElementById("restartAstra")
    .addEventListener("click", restartGame);

  hudMode.textContent = "🏆 مسابقه تمام شد";
}

// ======================================================
// RESTART
// ======================================================

function restartGame() {
  players.p1.x = 450;
  players.p1.y = WORLD_HEIGHT / 2;
  players.p1.vx = 0;
  players.p1.vy = 0;
  players.p1.energy = 0;
  players.p1.boost = 100;
  players.p1.score = 0;
  players.p1.world2 = false;

  players.p2.x = WORLD_WIDTH - 450;
  players.p2.y = WORLD_HEIGHT / 2;
  players.p2.vx = 0;
  players.p2.vy = 0;
  players.p2.energy = 0;
  players.p2.boost = 100;
  players.p2.score = 0;
  players.p2.world2 = false;

  rocket.active = false;
  rocket.owner = null;
  rocket.progress = 0;

  createCells();

  result.classList.remove("show");

  gameFinished = false;
  gameRunning = true;

  overlay.classList.add("hidden");

  hudMode.textContent = "جمع‌آوری انرژی";

  startTimer();
}

// ======================================================
// DRAW BACKGROUND
// ======================================================

function drawBackground(time) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  ctx.fillStyle = "#03040b";
  ctx.fillRect(0, 0, w, h);

  ctx.save();

  ctx.translate(-camera.x, -camera.y);

  for (const star of stars) {
    const twinkle =
      .5 + Math.sin(time * .002 + star.alpha * 10) * .5;

    ctx.globalAlpha = .3 + twinkle * .7;

    ctx.beginPath();
    ctx.arc(
      star.x,
      star.y,
      star.r,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = "#fff";
    ctx.fill();
  }

  ctx.globalAlpha = 1;

  // Grid
  ctx.strokeStyle = "rgba(90,120,255,.07)";
  ctx.lineWidth = 1;

  const grid = 100;

  for (let x = 0; x < WORLD_WIDTH; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_HEIGHT);
    ctx.stroke();
  }

  for (let y = 0; y < WORLD_HEIGHT; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_WIDTH, y);
    ctx.stroke();
  }

  // Arena boundary
  ctx.strokeStyle = "rgba(79,124,255,.3)";
  ctx.lineWidth = 4;

  ctx.strokeRect(
    20,
    20,
    WORLD_WIDTH - 40,
    WORLD_HEIGHT - 40
  );

  ctx.restore();
}

// ======================================================
// DRAW CELLS
// ======================================================

function drawCells(time) {
  ctx.save();

  ctx.translate(-camera.x, -camera.y);

  for (const cell of cells) {
    if (cell.taken) continue;

    const pulse =
      Math.sin(time * .004 + cell.phase) * 3;

    ctx.shadowBlur = 25;
    ctx.shadowColor = "#ffd34f";

    ctx.beginPath();

    ctx.arc(
      cell.x,
      cell.y,
      cell.r + pulse,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = "#ffd34f";
    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.beginPath();

    ctx.arc(
      cell.x,
      cell.y,
      cell.r * .35,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = "#fff";
    ctx.fill();
  }

  ctx.restore();
}

// ======================================================
// DRAW ROCKET
// ======================================================

function drawRocket(time) {
  ctx.save();

  ctx.translate(
    rocket.x - camera.x,
    rocket.y - camera.y
  );

  const scale =
    rocket.active
      ? 1 + rocket.progress * 1.2
      : 1;

  ctx.scale(scale, scale);

  // glow
  ctx.shadowBlur = 35;
  ctx.shadowColor = "#ffd34f";

  ctx.fillStyle = "#fff";

  ctx.beginPath();
  ctx.roundRect(
    -18,
    -50,
    36,
    85,
    18
  );
  ctx.fill();

  ctx.shadowBlur = 0;

  // window
  ctx.beginPath();
  ctx.arc(0, -20, 9, 0, Math.PI * 2);

  ctx.fillStyle = "#4f7cff";
  ctx.fill();

  // nose
  ctx.beginPath();

  ctx.moveTo(-18, -48);
  ctx.lineTo(0, -78);
  ctx.lineTo(18, -48);
  ctx.closePath();

  ctx.fillStyle = "#e7eaff";
  ctx.fill();

  // flame
  if (rocket.active) {
    ctx.beginPath();

    ctx.moveTo(-12, 32);
    ctx.lineTo(0, 65 + Math.random() * 20);
    ctx.lineTo(12, 32);
    ctx.closePath();

    ctx.fillStyle = "#ff8c42";
    ctx.fill();
  }

  ctx.restore();
}

// ======================================================
// DRAW PLAYER
// ======================================================

function drawPlayer(player) {
  ctx.save();

  ctx.translate(
    player.x - camera.x,
    player.y - camera.y
  );

  const angle =
    Math.atan2(player.vy, player.vx);

  if (Math.abs(player.vx) + Math.abs(player.vy) > .1) {
    ctx.rotate(angle);
  }

  // Glow
  ctx.shadowBlur = 30;
  ctx.shadowColor = player.glow;

  ctx.beginPath();

  ctx.arc(
    0,
    0,
    PLAYER_RADIUS,
    0,
    Math.PI * 2
  );

  ctx.fillStyle = player.color;
  ctx.fill();

  ctx.shadowBlur = 0;

  // Ship
  ctx.beginPath();

  ctx.moveTo(35, 0);
  ctx.lineTo(-20, -20);
  ctx.lineTo(-12, 0);
  ctx.lineTo(-20, 20);
  ctx.closePath();

  ctx.fillStyle = "#fff";
  ctx.fill();

  // cockpit
  ctx.beginPath();

  ctx.arc(
    5,
    0,
    9,
    0,
    Math.PI * 2
  );

  ctx.fillStyle = player.color;
  ctx.fill();

  // energy ring
  ctx.strokeStyle = player.color;
  ctx.lineWidth = 5;

  ctx.beginPath();

  ctx.arc(
    0,
    0,
    PLAYER_RADIUS + 10,
    -Math.PI / 2,
    -Math.PI / 2 +
      Math.PI * 2 *
      (player.energy / ENERGY_NEEDED)
  );

  ctx.stroke();

  ctx.restore();

  // name
  ctx.save();

  ctx.translate(
    player.x - camera.x,
    player.y - camera.y - 50
  );

  ctx.textAlign = "center";

  ctx.font = "bold 14px Arial";

  ctx.fillStyle = "#fff";

  ctx.fillText(
    player.name,
    0,
    0
  );

  ctx.restore();
}

// ======================================================
// DRAW PARTICLES
// ======================================================

function drawParticles() {
  for (const p of particles) {
    ctx.save();

    ctx.globalAlpha = p.life;

    ctx.beginPath();

    ctx.arc(
      p.x - camera.x,
      p.y - camera.y,
      p.size,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = p.color;

    ctx.fill();

    ctx.restore();
  }
}

// ======================================================
// CAMERA
// ======================================================

function updateCamera() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  const centerX =
    (players.p1.x + players.p2.x) / 2;

  const centerY =
    (players.p1.y + players.p2.y) / 2;

  camera.x +=
    (centerX - w / 2 - camera.x) * .08;

  camera.y +=
    (centerY - h / 2 - camera.y) * .08;

  camera.x = Math.max(
    0,
    Math.min(
      WORLD_WIDTH - w,
      camera.x
    )
  );

  camera.y = Math.max(
    0,
    Math.min(
      WORLD_HEIGHT - h,
      camera.y
    )
  );
}

// ======================================================
// HUD
// ======================================================

function updateHUD() {
  playersHud.innerHTML = `
    <div class="player-card me">
      <div class="player-name">
        🔵 ${players.p1.name}
      </div>
      <div class="player-stats">
        ⚡ ${Math.floor(players.p1.energy)}/${ENERGY_NEEDED}
        &nbsp; 🚀 ${Math.floor(players.p1.boost)}
      </div>
    </div>

    <div class="player-card">
      <div class="player-name">
        🟣 ${players.p2.name}
      </div>
      <div class="player-stats">
        ⚡ ${Math.floor(players.p2.energy)}/${ENERGY_NEEDED}
        &nbsp; 🚀 ${Math.floor(players.p2.boost)}
      </div>
    </div>
  `;

  const active =
    players.p1.energy >= ENERGY_NEEDED ||
    players.p2.energy >= ENERGY_NEEDED;

  powerupIndicator.classList.toggle(
    "active",
    active
  );
}

// ======================================================
// TIMER
// ======================================================

let timerSeconds = 180;
let timerInterval = null;

function startTimer() {
  clearInterval(timerInterval);

  timerSeconds = 180;

  hudTimer.textContent = "03:00";

  timerInterval = setInterval(() => {
    if (!gameRunning) return;

    timerSeconds--;

    const minutes =
      Math.floor(timerSeconds / 60)
        .toString()
        .padStart(2, "0");

    const seconds =
      (timerSeconds % 60)
        .toString()
        .padStart(2, "0");

    hudTimer.textContent =
      `${minutes}:${seconds}`;

    if (timerSeconds <= 0) {
      clearInterval(timerInterval);

      const winner =
        players.p1.energy >= players.p2.energy
          ? "p1"
          : "p2";

      finishGame(winner);
    }
  }, 1000);
}

// ======================================================
// GAME LOOP
// ======================================================

function gameLoop(time) {
  const dt =
    Math.min(
      (time - lastTime) / 1000,
      .05
    );

  lastTime = time;

  if (gameRunning && !gameFinished) {
    updatePlayer(
      players.p1,
      joystick.p1.x,
      joystick.p1.y,
      dt
    );

    updatePlayer(
      players.p2,
      joystick.p2.x,
      joystick.p2.y,
      dt
    );

    collectEnergy(players.p1);
    collectEnergy(players.p2);

    updateRocket(dt);
  }

  updateParticles(dt);
  updateCamera();

  drawBackground(time);
  drawCells(time);
  drawRocket(time);

  drawPlayer(players.p1);
  drawPlayer(players.p2);

  drawParticles();

  updateHUD();

  requestAnimationFrame(gameLoop);
}

// ======================================================
// BUTTONS
// ======================================================

p1Boost.addEventListener("pointerdown", () => {
  boost(players.p1);
});

p2Boost.addEventListener("pointerdown", () => {
  boost(players.p2);
});

muteBtn.addEventListener("click", () => {
  muted = !muted;

  muteBtn.textContent =
    muted ? "🔇" : "🔊";
});

fullscreenBtn.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    console.log("Fullscreen:", error);
  }
});

// ======================================================
// START
// ======================================================

function startGame() {
  overlay.classList.add("hidden");

  hudMode.textContent =
    "⚡ انرژی جمع کن و به World 2 برس!";

  gameRunning = true;

  startTimer();
}

setTimeout(() => {
  startGame();
}, 1000);

// ======================================================
// AUTH
// ======================================================

onAuthStateChanged(auth, user => {
  if (user) {
    console.log("Astra user:", user.uid);
  } else {
    console.log("Astra: guest mode");
  }
});

// ======================================================
// START LOOP
// ======================================================

requestAnimationFrame(gameLoop);
