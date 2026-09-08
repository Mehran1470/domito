const canvas = document.getElementById("astraCanvas");
const ctx = canvas.getContext("2d");

const arena = document.getElementById("astraArenaBox");
const overlay = document.getElementById("astraOverlayMsg");
const resultBox = document.getElementById("astraResult");
const timerEl = document.getElementById("hudTimer");
const modeEl = document.getElementById("hudMode");
const playersHud = document.getElementById("playersHud");

const p1JoyBase = document.getElementById("p1JoyBase");
const p1JoyKnob = document.getElementById("p1JoyKnob");
const p1Boost = document.getElementById("p1Boost");

const p2JoyBase = document.getElementById("p2JoyBase");
const p2JoyKnob = document.getElementById("p2JoyKnob");
const p2Boost = document.getElementById("p2Boost");

const muteBtn = document.getElementById("muteBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");

let width = 0;
let height = 0;

let running = false;
let gameOver = false;
let muted = false;

let lastTime = 0;
let gameTime = 180;

const keys = {};

const resources = [];

const player = {
  x: 0,
  y: 0,
  r: 22,
  speed: 220,
  energy: 0,
  maxEnergy: 100,
  boost: 0,
  color: "#4F7CFF",
  score: 0
};

const bot = {
  x: 0,
  y: 0,
  r: 22,
  speed: 150,
  energy: 0,
  maxEnergy: 100,
  boost: 0,
  color: "#9B5CFF",
  score: 0,
  target: null
};

const joystick = {
  p1: {
    active: false,
    x: 0,
    y: 0,
    pointer: null
  },
  p2: {
    active: false,
    x: 0,
    y: 0,
    pointer: null
  }
};

function resize() {
  const rect = arena.getBoundingClientRect();

  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resize);

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function createResources() {
  resources.length = 0;

  for (let i = 0; i < 14; i++) {
    resources.push({
      x: random(60, width - 60),
      y: random(130, height - 100),
      r: random(7, 12),
      value: Math.floor(random(8, 18)),
      pulse: random(0, Math.PI * 2)
    });
  }
}

function resetPlayers() {
  player.x = width * 0.25;
  player.y = height * 0.5;
  player.energy = 0;
  player.score = 0;
  player.boost = 0;

  bot.x = width * 0.75;
  bot.y = height * 0.5;
  bot.energy = 0;
  bot.score = 0;
  bot.boost = 0;
  bot.target = null;
}

function updateHud() {
  const seconds = Math.max(0, Math.ceil(gameTime));

  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;

  timerEl.textContent =
    String(min).padStart(2, "0") +
    ":" +
    String(sec).padStart(2, "0");

  playersHud.innerHTML = `
    <div class="player-card">🔵 شما: ${Math.floor(player.energy)}</div>
    <div class="player-card">🟣 ربات: ${Math.floor(bot.energy)}</div>
  `;
}

function showOverlay(text) {
  overlay.classList.remove("hidden");

  overlay.innerHTML = `
    <div class="loader"></div>
    <div>${text}</div>
  `;
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function startGame() {
  resize();

  modeEl.textContent = "🤖 بازی با ربات";

  createResources();
  resetPlayers();

  gameTime = 180;
  gameOver = false;
  running = false;

  updateHud();

  showOverlay("آماده شو...");

  setTimeout(() => {
    if (gameOver) return;

    hideOverlay();

    running = true;
    lastTime = performance.now();

    requestAnimationFrame(loop);
  }, 700);
}

function movePlayer(obj, dx, dy, dt) {
  const length = Math.hypot(dx, dy);

  if (length > 1) {
    dx /= length;
    dy /= length;
  }

  let speed = obj.speed;

  if (obj.boost > 0) {
    speed = 390;
    obj.boost -= dt;
  }

  obj.x += dx * speed * dt;
  obj.y += dy * speed * dt;

  obj.x = Math.max(obj.r, Math.min(width - obj.r, obj.x));
  obj.y = Math.max(105 + obj.r, Math.min(height - obj.r, obj.y));
}

function keyboardMovement() {
  let x = 0;
  let y = 0;

  if (keys.ArrowLeft || keys.a) x -= 1;
  if (keys.ArrowRight || keys.d) x += 1;
  if (keys.ArrowUp || keys.w) y -= 1;
  if (keys.ArrowDown || keys.s) y += 1;

  return { x, y };
}

function updateBot(dt) {
  if (
    !bot.target ||
    !resources.includes(bot.target) ||
    distance(bot, bot.target) < 30
  ) {
    let best = null;
    let bestDistance = Infinity;

    for (const resource of resources) {
      const d = distance(bot, resource);

      if (d < bestDistance) {
        bestDistance = d;
        best = resource;
      }
    }

    bot.target = best;
  }

  if (!bot.target) return;

  const dx = bot.target.x - bot.x;
  const dy = bot.target.y - bot.y;

  movePlayer(bot, dx, dy, dt);
}

function collectResources(obj) {
  for (let i = resources.length - 1; i >= 0; i--) {
    const resource = resources[i];

    if (distance(obj, resource) < obj.r + resource.r + 5) {
      obj.energy = Math.min(
        obj.maxEnergy,
        obj.energy + resource.value
      );

      obj.score += resource.value;

      resources.splice(i, 1);

      setTimeout(() => {
        if (gameOver) return;

        resources.push({
          x: random(60, Math.max(70, width - 60)),
          y: random(130, Math.max(140, height - 100)),
          r: random(7, 12),
          value: Math.floor(random(8, 18)),
          pulse: random(0, Math.PI * 2)
        });
      }, 1200);
    }
  }
}

function update(dt) {
  gameTime -= dt;

  if (gameTime <= 0) {
    gameTime = 0;
    finishGame();
    return;
  }

  const keyboard = keyboardMovement();

  let dx = keyboard.x;
  let dy = keyboard.y;

  if (joystick.p1.active) {
    dx = joystick.p1.x;
    dy = joystick.p1.y;
  }

  movePlayer(player, dx, dy, dt);

  updateBot(dt);

  collectResources(player);
  collectResources(bot);

  updateHud();
}

function drawBackground() {
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    50,
    width / 2,
    height / 2,
    Math.max(width, height)
  );

  gradient.addColorStop(0, "#12234c");
  gradient.addColorStop(1, "#050816");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(100,150,255,.08)";
  ctx.lineWidth = 1;

  const grid = 50;

  for (let x = 0; x < width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y < height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawResource(resource, time) {
  const pulse =
    Math.sin(time * 0.004 + resource.pulse) * 2;

  ctx.save();

  ctx.beginPath();
  ctx.arc(
    resource.x,
    resource.y,
    resource.r + pulse,
    0,
    Math.PI * 2
  );

  ctx.fillStyle = "#35F2FF";
  ctx.shadowBlur = 18;
  ctx.shadowColor = "#35F2FF";

  ctx.fill();

  ctx.restore();
}

function drawPlayer(obj) {
  ctx.save();

  ctx.beginPath();
  ctx.arc(obj.x, obj.y, obj.r, 0, Math.PI * 2);

  ctx.fillStyle = obj.color;
  ctx.shadowBlur = 22;
  ctx.shadowColor = obj.color;

  ctx.fill();

  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(
    obj.x - obj.r * .25,
    obj.y - obj.r * .25,
    obj.r * .25,
    0,
    Math.PI * 2
  );

  ctx.fillStyle = "rgba(255,255,255,.65)";
  ctx.fill();

  ctx.fillStyle = "white";
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";

  ctx.fillText(
    Math.floor(obj.energy),
    obj.x,
    obj.y - obj.r - 8
  );

  ctx.restore();
}

function draw(time) {
  drawBackground();

  for (const resource of resources) {
    drawResource(resource, time);
  }

  drawPlayer(player);
  drawPlayer(bot);
}

function loop(time) {
  if (!running || gameOver) return;

  const dt = Math.min(
    (time - lastTime) / 1000,
    0.05
  );

  lastTime = time;

  update(dt);
  draw(time);

  requestAnimationFrame(loop);
}

function finishGame() {
  if (gameOver) return;

  gameOver = true;
  running = false;

  let title;

  if (player.energy > bot.energy) {
    title = "🏆 شما برنده شدید!";
  } else if (player.energy < bot.energy) {
    title = "🤖 ربات برنده شد!";
  } else {
    title = "🤝 مساوی شدید!";
  }

  resultBox.classList.remove("hidden");

  resultBox.innerHTML = `
    <h2>${title}</h2>
    <p>🔵 انرژی شما: ${Math.floor(player.energy)}</p>
    <p>🟣 انرژی ربات: ${Math.floor(bot.energy)}</p>
    <button id="restartAstra"
      style="
        margin-top:15px;
        padding:12px 22px;
        border:0;
        border-radius:12px;
        cursor:pointer;
        font-size:16px;
      ">
      🔄 بازی دوباره
    </button>
  `;

  document
    .getElementById("restartAstra")
    .addEventListener("click", () => {
      resultBox.classList.add("hidden");
      startGame();
    });
}

function setupJoystick(base, knob, data) {
  function updatePointer(clientX, clientY) {
    const rect = base.getBoundingClientRect();

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let x = clientX - centerX;
    let y = clientY - centerY;

    const max = rect.width / 2 - 28;

    const len = Math.hypot(x, y);

    if (len > max) {
      x = x / len * max;
      y = y / len * max;
    }

    data.x = x / max;
    data.y = y / max;

    knob.style.transform =
      `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  function reset() {
    data.active = false;
    data.x = 0;
    data.y = 0;
    data.pointer = null;

    knob.style.transform =
      "translate(-50%, -50%)";
  }

  base.addEventListener("pointerdown", e => {
    e.preventDefault();

    data.active = true;
    data.pointer = e.pointerId;

    base.setPointerCapture(e.pointerId);

    updatePointer(e.clientX, e.clientY);
  });

  base.addEventListener("pointermove", e => {
    if (!data.active || data.pointer !== e.pointerId) return;

    updatePointer(e.clientX, e.clientY);
  });

  base.addEventListener("pointerup", reset);
  base.addEventListener("pointercancel", reset);
}

setupJoystick(
  p1JoyBase,
  p1JoyKnob,
  joystick.p1
);

setupJoystick(
  p2JoyBase,
  p2JoyKnob,
  joystick.p2
);

p1Boost.addEventListener("pointerdown", e => {
  e.preventDefault();
  player.boost = 2.5;
});

p2Boost.addEventListener("pointerdown", e => {
  e.preventDefault();
  bot.boost = 2.5;
});

window.addEventListener("keydown", e => {
  keys[e.key] = true;

  if (
    [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight"
    ].includes(e.key)
  ) {
    e.preventDefault();
  }

  if (e.key === " ") {
    player.boost = 2.5;
  }
});

window.addEventListener("keyup", e => {
  keys[e.key] = false;
});

muteBtn.addEventListener("click", () => {
  muted = !muted;
  muteBtn.textContent = muted ? "🔇" : "🔊";
});

fullscreenBtn.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    console.log(error);
  }
});

resize();

/*
  مهم:
  بازی عمداً بدون Firebase شروع می‌شود.
  بنابراین هیچ اتاق یا Rule فایربیس نمی‌تواند
  جلوی اجرای خود بازی را بگیرد.
*/

startGame();
