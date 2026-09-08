import { waitForUser, getSavedName, recordRoundResult } from "../js/app.js";

const ROUND_TIME = 30;
const TOTAL_ROUNDS = 3;
const COMBO_WINDOW = 3;
const COMBO_LEVELS = [1, 2, 3, 4, 5, 6, 8];
const BASE_SPEED_FACTOR = 0.42; // نسبت به min(W,H)
const BOOST_MULT = 1.6;
const BOOST_DURATION = 4;

const canvas = document.getElementById("astraCanvas");
const ctx = canvas.getContext("2d");
const arenaBox = document.getElementById("astraArenaBox");

const rotateScreen = document.getElementById("astraRotateScreen");
const overlayMsg = document.getElementById("astraOverlayMsg");
const resultScreen = document.getElementById("astraResult");
const scoreHud = document.getElementById("hudScore");
const roundHud = document.getElementById("hudRound");
const timerHud = document.getElementById("hudTimer");
const comboHud = document.getElementById("hudCombo");

// W,H منطقی (پیکسل CSS واقعی Arena) — با resizeArena به‌روز می‌شن
let W = 900, H = 450;
let PLAYER_R = 14, TILE_R = 16, POWERUP_R = 14, BASE_SPEED = 190;

function recomputeScaledSizes() {
  const minDim = Math.min(W, H);
  PLAYER_R = Math.max(9, minDim * 0.032);
  TILE_R = Math.max(10, minDim * 0.036);
  POWERUP_R = Math.max(10, minDim * 0.032);
  BASE_SPEED = minDim * BASE_SPEED_FACTOR;
}

function resizeCanvasResolution() {
  const rect = arenaBox.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const oldW = W, oldH = H;
  W = cssW; H = cssH;
  recomputeScaledSizes();

  if (entitiesInitialized) {
    const rx = W / oldW, ry = H / oldH;
    if (isFinite(rx) && isFinite(ry) && rx > 0 && ry > 0) {
      [player, ai].forEach((e) => { e.x *= rx; e.y *= ry; });
      tiles.forEach((t) => { t.x *= rx; t.y *= ry; });
      if (powerup) { powerup.x *= rx; powerup.y *= ry; }
      clampAllToBounds();
    }
  }
}

function clampAllToBounds() {
  [player, ai].forEach((e) => {
    e.x = Math.max(PLAYER_R, Math.min(W - PLAYER_R, e.x));
    e.y = Math.max(PLAYER_R, Math.min(H - PLAYER_R, e.y));
  });
}

let player, ai, tiles, powerup, comboIndex, comboTimer, score, aiScore, tilesCapturedTotal;
let round = 1, timeLeft = ROUND_TIME, running = false, paused = true;
let myName;
let joyVec = { x: 0, y: 0 };
let entitiesInitialized = false;

function rand(min, max) { return Math.random() * (max - min) + min; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function resetEntities() {
  player = { x: W * 0.25, y: H / 2, boostUntil: 0 };
  ai = { x: W * 0.75, y: H / 2, boostUntil: 0, retargetAt: 0, targetTile: null };
  tiles = [];
  powerup = null;
  comboIndex = 0;
  comboTimer = 0;
  entitiesInitialized = true;
  for (let i = 0; i < 4; i++) spawnTile();
}

function tileValue() {
  const roll = Math.random();
  if (roll < 0.08) return 100;
  if (roll < 0.33) return 50;
  if (roll < 0.66) return 25;
  return 10;
}

function spawnTile() {
  const margin = TILE_R * 3;
  tiles.push({ x: rand(margin, W - margin), y: rand(margin, H - margin), value: tileValue() });
}

function maybeSpawnPowerup(dt) {
  if (powerup) return;
  if (Math.random() < dt * 0.05) {
    const margin = POWERUP_R * 3;
    powerup = { x: rand(margin, W - margin), y: rand(margin, H - margin) };
  }
}

function currentSpeed(entity, now) {
  return entity.boostUntil > now ? BASE_SPEED * BOOST_MULT : BASE_SPEED;
}

function updatePlayer(dt, now) {
  const mag = Math.min(1, Math.hypot(joyVec.x, joyVec.y));
  const len = Math.hypot(joyVec.x, joyVec.y) || 1;
  const nx = joyVec.x / len, ny = joyVec.y / len;
  const speed = currentSpeed(player, now);
  player.x += nx * mag * speed * dt;
  player.y += ny * mag * speed * dt;
  player.x = Math.max(PLAYER_R, Math.min(W - PLAYER_R, player.x));
  player.y = Math.max(PLAYER_R, Math.min(H - PLAYER_R, player.y));
}

function updateAI(dt, now) {
  if (now > ai.retargetAt || !ai.targetTile) {
    let best = null, bestScore = -1;
    const candidates = [...tiles];
    if (powerup) candidates.push({ ...powerup, value: 5, isPowerup: true });
    candidates.forEach((t) => {
      const d = dist(ai, t);
      const s = t.value / (d + 40);
      if (s > bestScore) { bestScore = s; best = t; }
    });
    ai.targetTile = best;
    ai.retargetAt = now + 0.4;
  }
  if (ai.targetTile) {
    const d = dist(ai, ai.targetTile) || 1;
    const speed = currentSpeed(ai, now);
    ai.x += ((ai.targetTile.x - ai.x) / d) * speed * dt;
    ai.y += ((ai.targetTile.y - ai.y) / d) * speed * dt;
  }
  ai.x = Math.max(PLAYER_R, Math.min(W - PLAYER_R, ai.x));
  ai.y = Math.max(PLAYER_R, Math.min(H - PLAYER_R, ai.y));
}

function grantCombo(entity, isPlayer, value) {
  if (isPlayer) {
    if (comboTimer > 0) comboIndex = Math.min(COMBO_LEVELS.length - 1, comboIndex + 1);
    else comboIndex = 0;
    comboTimer = COMBO_WINDOW;
    const mult = COMBO_LEVELS[comboIndex];
    score += value * mult;
    tilesCapturedTotal++;
  } else {
    aiScore += value;
  }
}

function checkCaptures(now) {
  tiles = tiles.filter((t) => {
    if (dist(player, t) < PLAYER_R + TILE_R) { grantCombo(player, true, t.value); spawnTile(); return false; }
    if (dist(ai, t) < PLAYER_R + TILE_R) { grantCombo(ai, false, t.value); spawnTile(); return false; }
    return true;
  });
  if (powerup) {
    if (dist(player, powerup) < PLAYER_R + POWERUP_R) { player.boostUntil = now + BOOST_DURATION; powerup = null; }
    else if (dist(ai, powerup) < PLAYER_R + POWERUP_R) { ai.boostUntil = now + BOOST_DURATION; powerup = null; }
  }
}

function draw(now) {
  ctx.clearRect(0, 0, W, H);

  tiles.forEach((t) => {
    const rare = t.value >= 100;
    ctx.beginPath();
    ctx.arc(t.x, t.y, TILE_R, 0, Math.PI * 2);
    ctx.fillStyle = rare ? "#FFC845" : t.value >= 50 ? "#4FD1FF" : t.value >= 25 ? "#9B5CFF" : "#4F7CFF";
    if (rare) { ctx.shadowColor = "#FFC845"; ctx.shadowBlur = Math.min(18, TILE_R); } else { ctx.shadowBlur = 0; }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#05060f";
    ctx.font = `${Math.max(8, TILE_R * 0.6)}px Vazirmatn, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(t.value, t.x, t.y + TILE_R * 0.2);
  });

  if (powerup) {
    ctx.beginPath();
    ctx.arc(powerup.x, powerup.y, POWERUP_R, 0, Math.PI * 2);
    ctx.fillStyle = "#3ECF8E";
    ctx.shadowColor = "#3ECF8E"; ctx.shadowBlur = Math.min(16, POWERUP_R);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#05060f";
    ctx.font = `${Math.max(9, POWERUP_R * 0.7)}px Vazirmatn, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("⚡", powerup.x, powerup.y + POWERUP_R * 0.25);
  }

  drawOrb(ai, "#9B5CFF", now);
  drawOrb(player, "#4F7CFF", now);
}

function drawOrb(entity, color, now) {
  const boosted = entity.boostUntil > now;
  ctx.beginPath();
  ctx.arc(entity.x, entity.y, PLAYER_R, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = boosted ? Math.min(26, PLAYER_R * 1.6) : Math.min(12, PLAYER_R * 0.8);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function updateHud() {
  scoreHud.textContent = score;
  roundHud.textContent = `راند ${round}/${TOTAL_ROUNDS}`;
  timerHud.textContent = Math.ceil(timeLeft);
  const mult = COMBO_LEVELS[comboIndex];
  comboHud.textContent = mult > 1 ? `x${mult} کمبو` : "بدون کمبو";
}

let lastTime = null;
function loop(ts) {
  if (!running) return;
  if (lastTime === null) lastTime = ts;
  const dt = Math.min(0.05, (ts - lastTime) / 1000);
  lastTime = ts;

  if (!paused) {
    updatePlayer(dt, ts / 1000);
    updateAI(dt, ts / 1000);
    checkCaptures(ts / 1000);
    maybeSpawnPowerup(dt);
    comboTimer = Math.max(0, comboTimer - dt);
    if (comboTimer === 0) comboIndex = 0;
    timeLeft -= dt;
    if (timeLeft <= 0) endRound();
    updateHud();
  }
  draw(ts / 1000);
  requestAnimationFrame(loop);
}

function showOverlay(big, sub, duration) {
  return new Promise((resolve) => {
    overlayMsg.innerHTML = `<div class="big">${big}</div><div class="sub">${sub || ""}</div>`;
    overlayMsg.style.display = "flex";
    setTimeout(() => { overlayMsg.style.display = "none"; resolve(); }, duration);
  });
}

async function countdown() {
  paused = true;
  for (const step of ["۳", "۲", "۱", "ASTRA!"]) {
    overlayMsg.innerHTML = `<div class="big">${step}</div>`;
    overlayMsg.style.display = "flex";
    await new Promise((r) => setTimeout(r, 650));
  }
  overlayMsg.style.display = "none";
  paused = orientationLocked;
}

async function endRound() {
  paused = true;
  if (round < TOTAL_ROUNDS) {
    round++;
    resetEntities();
    timeLeft = ROUND_TIME;
    await showOverlay(`راند ${round}`, "آماده شو...", 1400);
    paused = orientationLocked;
  } else {
    finishMatch();
  }
}

async function finishMatch() {
  running = false;
  const won = score > aiScore;
  try { await recordRoundResult(myName, "astra", { won }); } catch (e) { console.error(e); }

  resultScreen.style.display = "flex";
  resultScreen.innerHTML = `
    <div class="headline ${won ? "win" : "lose"}">${won ? "🏆 پیروزی" : "😅 شکست"}</div>
    <div class="astra-result-grid">
      <div class="astra-result-box"><div class="num">${score}</div><div class="lbl">امتیاز تو</div></div>
      <div class="astra-result-box"><div class="num">${aiScore}</div><div class="lbl">امتیاز ربات</div></div>
      <div class="astra-result-box"><div class="num">x${COMBO_LEVELS[comboIndex]}</div><div class="lbl">آخرین کمبو</div></div>
      <div class="astra-result-box"><div class="num">${tilesCapturedTotal}</div><div class="lbl">تایل گرفته‌شده</div></div>
    </div>
    <button id="rematchBtn">🔄 دوباره بازی کن</button>
    <button id="homeBtn" class="ghost">🏠 بازگشت به خانه</button>
  `;
  document.getElementById("rematchBtn").addEventListener("click", () => window.location.reload());
  document.getElementById("homeBtn").addEventListener("click", () => { window.location.href = "../index.html"; });
}

async function startMatch() {
  round = 1; score = 0; aiScore = 0; tilesCapturedTotal = 0; timeLeft = ROUND_TIME;
  resizeCanvasResolution();
  resetEntities();
  running = true;
  requestAnimationFrame(loop);
  await countdown();
}

// ---------- جوی‌استیک لمسی ----------
const joyBase = document.getElementById("astraJoyBase");
const joyKnob = document.getElementById("astraJoyKnob");
let joyActive = false, joyOrigin = { x: 0, y: 0 };

function joyStart(clientX, clientY) {
  joyActive = true;
  const rect = joyBase.getBoundingClientRect();
  joyOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
function joyMove(clientX, clientY) {
  if (!joyActive) return;
  let dx = clientX - joyOrigin.x, dy = clientY - joyOrigin.y;
  const max = joyBase.getBoundingClientRect().width * 0.38;
  const d = Math.hypot(dx, dy);
  if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joyVec = { x: dx / max, y: dy / max };
}
function joyEnd() {
  joyActive = false;
  joyKnob.style.transform = "translate(0,0)";
  joyVec = { x: 0, y: 0 };
}

joyBase.addEventListener("touchstart", (e) => { e.preventDefault(); const t = e.touches[0]; joyStart(t.clientX, t.clientY); joyMove(t.clientX, t.clientY); }, { passive: false });
joyBase.addEventListener("touchmove", (e) => { e.preventDefault(); const t = e.touches[0]; joyMove(t.clientX, t.clientY); }, { passive: false });
joyBase.addEventListener("touchend", joyEnd);
joyBase.addEventListener("touchcancel", joyEnd);

// ---------- کیبورد (دسکتاپ) ----------
const keys = {};
window.addEventListener("keydown", (e) => { keys[e.key] = true; updateKeyVec(); });
window.addEventListener("keyup", (e) => { keys[e.key] = false; updateKeyVec(); });
function updateKeyVec() {
  let x = 0, y = 0;
  if (keys["ArrowLeft"] || keys["a"]) x -= 1;
  if (keys["ArrowRight"] || keys["d"]) x += 1;
  if (keys["ArrowUp"] || keys["w"]) y -= 1;
  if (keys["ArrowDown"] || keys["s"]) y += 1;
  joyVec = { x, y };
}

// ---------- قفل حالت landscape + پاسخ به تغییرات viewport ----------
let orientationLocked = false;

function checkOrientation() {
  const w = window.innerWidth, h = window.innerHeight;
  const isMobileLike = Math.min(w, h) < 700; // گوشی/تبلت کوچیک
  const isPortrait = h > w;
  orientationLocked = isMobileLike && isPortrait;
  rotateScreen.classList.toggle("show", orientationLocked);
  if (running) paused = orientationLocked;
}

function handleViewportChange() {
  checkOrientation();
  if (!orientationLocked) {
    // یه فریم صبر می‌کنیم تا Layout واقعاً settle بشه، بعد Canvas رو ری‌سایز می‌کنیم
    requestAnimationFrame(() => requestAnimationFrame(resizeCanvasResolution));
  }
}

window.addEventListener("resize", handleViewportChange);
window.addEventListener("orientationchange", handleViewportChange);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", handleViewportChange);
}

// ---------- شروع ----------
async function init() {
  const user = await waitForUser();
  myName = getSavedName();
  if (!user || !myName) { window.location.href = "../index.html"; return; }
  checkOrientation();
  await startMatch();
}
init();
