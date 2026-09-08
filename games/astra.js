import { waitForUser, getSavedName, recordRoundResult } from "../js/app.js";

const ROUND_TIME = 30;
const TOTAL_ROUNDS = 3;
const COMBO_WINDOW = 3;
const COMBO_LEVELS = [1, 2, 3, 4, 5, 6, 8];
const BASE_SPEED_FACTOR = 0.42;
const BOOST_MULT = 1.6;
const BOOST_DURATION = 4;
const TRAIL_LEN = 14;

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
const powerupSlot = document.getElementById("astraPowerupSlot");
const fullscreenBtn = document.getElementById("astraFullscreenBtn");
const muteBtn = document.getElementById("astraMuteBtn");

let W = 900, H = 450;
let PLAYER_R = 14, TILE_R = 16, POWERUP_R = 14, BASE_SPEED = 190;
let stars = [];
let planets = [];

function recomputeScaledSizes() {
  const minDim = Math.min(W, H);
  PLAYER_R = Math.max(10, minDim * 0.034);
  TILE_R = Math.max(11, minDim * 0.038);
  POWERUP_R = Math.max(11, minDim * 0.034);
  BASE_SPEED = minDim * BASE_SPEED_FACTOR;
}

function regenerateBackground() {
  stars = [];
  const count = Math.round((W * H) / 4500);
  for (let i = 0; i < count; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.3, tw: Math.random() * Math.PI * 2 });
  }
  planets = [
    { x: W * 0.12, y: H * 0.18, r: Math.min(W, H) * 0.09, color: "#4F7CFF" },
    { x: W * 0.9, y: H * 0.82, r: Math.min(W, H) * 0.07, color: "#9B5CFF" },
  ];
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
  regenerateBackground();

  if (entitiesInitialized) {
    const rx = W / oldW, ry = H / oldH;
    if (isFinite(rx) && isFinite(ry) && rx > 0 && ry > 0) {
      [player, ai].forEach((e) => { e.x *= rx; e.y *= ry; e.trail.forEach((p) => { p.x *= rx; p.y *= ry; }); });
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
let particles = [];
let floaters = [];

function rand(min, max) { return Math.random() * (max - min) + min; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function makeEntity(x, y, color, label) {
  return { x, y, boostUntil: 0, retargetAt: 0, targetTile: null, color, label, trail: [] };
}

function resetEntities() {
  player = makeEntity(W * 0.25, H / 2, "#4F7CFF", myName || "تو");
  ai = makeEntity(W * 0.75, H / 2, "#9B5CFF", "ربات");
  tiles = [];
  powerup = null;
  comboIndex = 0;
  comboTimer = 0;
  particles = [];
  floaters = [];
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
  tiles.push({ x: rand(margin, W - margin), y: rand(margin, H - margin), value: tileValue(), spawnT: 0, pulse: Math.random() * Math.PI * 2 });
}

function maybeSpawnPowerup(dt) {
  if (powerup) return;
  if (Math.random() < dt * 0.05) {
    const margin = POWERUP_R * 3;
    powerup = { x: rand(margin, W - margin), y: rand(margin, H - margin), spawnT: 0 };
  }
}

function currentSpeed(entity, now) {
  return entity.boostUntil > now ? BASE_SPEED * BOOST_MULT : BASE_SPEED;
}

function pushTrail(entity) {
  entity.trail.push({ x: entity.x, y: entity.y });
  if (entity.trail.length > TRAIL_LEN) entity.trail.shift();
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
  if (mag > 0.05) pushTrail(player);
}

function updateAI(dt, now) {
  if (now > ai.retargetAt || !ai.targetTile) {
    let best = null, bestScore = -1;
    const candidates = [...tiles];
    if (powerup) candidates.push({ ...powerup, value: 5 });
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
    pushTrail(ai);
  }
  ai.x = Math.max(PLAYER_R, Math.min(W - PLAYER_R, ai.x));
  ai.y = Math.max(PLAYER_R, Math.min(H - PLAYER_R, ai.y));
}

// ---------- ذرات و امتیاز شناور ----------
function burstParticles(x, y, color, count = 14) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const speed = rand(60, 160);
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color });
  }
}
function addFloater(x, y, text, color) {
  floaters.push({ x, y, text, life: 1, color });
}
function updateEffects(dt) {
  particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt * 1.4; });
  particles = particles.filter((p) => p.life > 0);
  floaters.forEach((f) => { f.y -= dt * 40; f.life -= dt * 0.9; });
  floaters = floaters.filter((f) => f.life > 0);
}

function grantCombo(entity, isPlayer, value, x, y) {
  if (isPlayer) {
    if (comboTimer > 0) comboIndex = Math.min(COMBO_LEVELS.length - 1, comboIndex + 1);
    else comboIndex = 0;
    comboTimer = COMBO_WINDOW;
    const mult = COMBO_LEVELS[comboIndex];
    const gained = value * mult;
    score += gained;
    tilesCapturedTotal++;
    addFloater(x, y, `+${gained}${mult > 1 ? ` x${mult}` : ""}`, "#FFC845");
    burstParticles(x, y, "#4F7CFF");
    playTone(mult > 3 ? 880 : 620, 0.08);
  } else {
    aiScore += value;
    burstParticles(x, y, "#9B5CFF", 8);
  }
}

function checkCaptures(now) {
  tiles = tiles.filter((t) => {
    if (dist(player, t) < PLAYER_R + TILE_R) { grantCombo(player, true, t.value, t.x, t.y); spawnTile(); return false; }
    if (dist(ai, t) < PLAYER_R + TILE_R) { grantCombo(ai, false, t.value, t.x, t.y); spawnTile(); return false; }
    return true;
  });
  if (powerup) {
    if (dist(player, powerup) < PLAYER_R + POWERUP_R) {
      player.boostUntil = now + BOOST_DURATION;
      burstParticles(powerup.x, powerup.y, "#3ECF8E");
      playTone(1040, 0.12);
      powerup = null;
    } else if (dist(ai, powerup) < PLAYER_R + POWERUP_R) {
      ai.boostUntil = now + BOOST_DURATION;
      powerup = null;
    }
  }
}

// ---------- صدای سنتزی (بدون فایل خارجی) ----------
let audioCtx = null;
let muted = false;
function playTone(freq, duration) {
  if (muted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}
muteBtn.addEventListener("click", () => {
  muted = !muted;
  muteBtn.textContent = muted ? "🔇" : "🔊";
});

// ---------- رسم ----------
function drawBackground(t) {
  ctx.fillStyle = "#05060f";
  ctx.fillRect(0, 0, W, H);

  const neb = ctx.createRadialGradient(W * 0.25, H * 0.2, 0, W * 0.25, H * 0.2, Math.max(W, H) * 0.5);
  neb.addColorStop(0, "rgba(124,77,255,.14)");
  neb.addColorStop(1, "rgba(124,77,255,0)");
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, W, H);
  const neb2 = ctx.createRadialGradient(W * 0.8, H * 0.85, 0, W * 0.8, H * 0.85, Math.max(W, H) * 0.45);
  neb2.addColorStop(0, "rgba(79,124,255,.12)");
  neb2.addColorStop(1, "rgba(79,124,255,0)");
  ctx.fillStyle = neb2;
  ctx.fillRect(0, 0, W, H);

  planets.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  ctx.strokeStyle = "rgba(255,255,255,.03)";
  ctx.lineWidth = 1;
  const gap = Math.max(30, Math.min(W, H) / 12);
  for (let x = 0; x < W; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  stars.forEach((s) => {
    const alpha = 0.4 + Math.sin(t * 2 + s.tw) * 0.3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0.1, alpha)})`;
    ctx.fill();
  });
}

function drawTrail(entity) {
  entity.trail.forEach((p, i) => {
    const a = (i / entity.trail.length) * 0.35;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R * (0.3 + (i / entity.trail.length) * 0.5), 0, Math.PI * 2);
    ctx.fillStyle = entity.color;
    ctx.globalAlpha = a;
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function drawOrb(entity, now) {
  drawTrail(entity);
  const boosted = entity.boostUntil > now;
  ctx.beginPath();
  ctx.arc(entity.x, entity.y, PLAYER_R, 0, Math.PI * 2);
  ctx.fillStyle = entity.color;
  ctx.shadowColor = entity.color;
  ctx.shadowBlur = boosted ? Math.min(28, PLAYER_R * 1.8) : Math.min(14, PLAYER_R);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#EAF0FF";
  ctx.font = `${Math.max(9, PLAYER_R * 0.7)}px Vazirmatn, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(entity.label, entity.x, entity.y - PLAYER_R - 6);

  if (boosted) {
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, PLAYER_R + 6, 0, Math.PI * 2);
    ctx.strokeStyle = "#3ECF8E";
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawTiles(t) {
  tiles.forEach((tile) => {
    tile.spawnT = Math.min(1, tile.spawnT + 0.06);
    const scale = tile.spawnT < 1 ? tile.spawnT : 1;
    const pulse = 1 + Math.sin(t * 3 + tile.pulse) * 0.08;
    const r = TILE_R * scale * pulse;
    const rare = tile.value >= 100;
    const near = Math.min(dist(player, tile), dist(ai, tile)) < TILE_R + PLAYER_R + 30;

    ctx.beginPath();
    ctx.arc(tile.x, tile.y, r, 0, Math.PI * 2);
    ctx.fillStyle = rare ? "#FFC845" : tile.value >= 50 ? "#4FD1FF" : tile.value >= 25 ? "#9B5CFF" : "#4F7CFF";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = near ? Math.min(22, r * 1.4) : (rare ? Math.min(16, r) : 0);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#05060f";
    ctx.font = `${Math.max(8, r * 0.6)}px Vazirmatn, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(tile.value, tile.x, tile.y + r * 0.2);
  });
}

function drawPowerup() {
  if (!powerup) { powerupSlot.classList.remove("active"); return; }
  powerup.spawnT = Math.min(1, (powerup.spawnT || 0) + 0.06);
  const r = POWERUP_R * powerup.spawnT;
  ctx.beginPath();
  ctx.arc(powerup.x, powerup.y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#3ECF8E";
  ctx.shadowColor = "#3ECF8E"; ctx.shadowBlur = Math.min(18, r * 1.2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#05060f";
  ctx.font = `${Math.max(9, r * 0.7)}px Vazirmatn, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("⚡", powerup.x, powerup.y + r * 0.25);
}

function drawEffects() {
  particles.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
  floaters.forEach((f) => {
    ctx.font = "bold 13px Vazirmatn, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = f.color;
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  });
}

function draw(t) {
  drawBackground(t);
  drawTiles(t);
  drawPowerup();
  drawOrb(ai, t);
  drawOrb(player, t);
  drawEffects();

  const boosted = player.boostUntil > t;
  powerupSlot.classList.toggle("active", boosted);
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
  const now = ts / 1000;

  if (!paused) {
    updatePlayer(dt, now);
    updateAI(dt, now);
    checkCaptures(now);
    maybeSpawnPowerup(dt);
    updateEffects(dt);
    comboTimer = Math.max(0, comboTimer - dt);
    if (comboTimer === 0) comboIndex = 0;
    timeLeft -= dt;
    if (timeLeft <= 0) endRound();
    updateHud();
  }
  draw(now);
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
    playTone(step === "ASTRA!" ? 1200 : 500, 0.08);
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
  playTone(won ? 1300 : 300, 0.3);
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

// ---------- جوی‌استیک با Pointer Events ----------
const joyBase = document.getElementById("astraJoyBase");
const joyKnob = document.getElementById("astraJoyKnob");
let joyActive = false, joyOrigin = { x: 0, y: 0 }, joyPointerId = null;

function joyStart(clientX, clientY) {
  joyActive = true;
  joyBase.classList.add("pressed");
  const rect = joyBase.getBoundingClientRect();
  joyOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
function joyMove(clientX, clientY) {
  if (!joyActive) return;
  let dx = clientX - joyOrigin.x, dy = clientY - joyOrigin.y;
  const max = joyBase.getBoundingClientRect().width * 0.38;
  const deadZone = max * 0.14;
  const d = Math.hypot(dx, dy);
  if (d < deadZone) { joyVec = { x: 0, y: 0 }; joyKnob.style.transform = "translate(0,0)"; return; }
  if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joyVec = { x: dx / max, y: dy / max };
}
function joyEnd() {
  joyActive = false;
  joyPointerId = null;
  joyBase.classList.remove("pressed");
  joyKnob.style.transform = "translate(0,0)";
  joyVec = { x: 0, y: 0 };
}

joyBase.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (joyPointerId !== null) return;
  joyPointerId = e.pointerId;
  joyBase.setPointerCapture(e.pointerId);
  joyStart(e.clientX, e.clientY);
  joyMove(e.clientX, e.clientY);
});
joyBase.addEventListener("pointermove", (e) => {
  if (e.pointerId !== joyPointerId) return;
  e.preventDefault();
  joyMove(e.clientX, e.clientY);
});
joyBase.addEventListener("pointerup", (e) => { if (e.pointerId === joyPointerId) joyEnd(); });
joyBase.addEventListener("pointercancel", (e) => { if (e.pointerId === joyPointerId) joyEnd(); });
joyBase.style.touchAction = "none";

// ---------- کیبورد (دسکتاپ) ----------
const keys = {};
window.addEventListener("keydown", (e) => { keys[e.key] = true; if (!joyActive) updateKeyVec(); });
window.addEventListener("keyup", (e) => { keys[e.key] = false; if (!joyActive) updateKeyVec(); });
function updateKeyVec() {
  let x = 0, y = 0;
  if (keys["ArrowLeft"] || keys["a"]) x -= 1;
  if (keys["ArrowRight"] || keys["d"]) x += 1;
  if (keys["ArrowUp"] || keys["w"]) y -= 1;
  if (keys["ArrowDown"] || keys["s"]) y += 1;
  joyVec = { x, y };
}

// ---------- Fullscreen ----------
fullscreenBtn.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      fullscreenBtn.textContent = "⛶ خروج از تمام‌صفحه";
    } else {
      await document.exitFullscreen();
      fullscreenBtn.textContent = "⛶ تمام‌صفحه";
    }
  } catch (e) {
    // بعضی مرورگرها Fullscreen رو رد می‌کنن — بازی بدون مشکل ادامه پیدا می‌کنه
  }
});

// ---------- قفل landscape + پاسخ به تغییرات viewport ----------
let orientationLocked = false;

function checkOrientation() {
  const w = window.innerWidth, h = window.innerHeight;
  const isMobileLike = Math.min(w, h) < 700;
  const isPortrait = h > w;
  orientationLocked = isMobileLike && isPortrait;
  rotateScreen.classList.toggle("show", orientationLocked);
  if (running) paused = orientationLocked;
}

function handleViewportChange() {
  checkOrientation();
  if (!orientationLocked) {
    requestAnimationFrame(() => requestAnimationFrame(resizeCanvasResolution));
  }
}

window.addEventListener("resize", handleViewportChange);
window.addEventListener("orientationchange", handleViewportChange);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", handleViewportChange);
}

async function init() {
  const user = await waitForUser();
  myName = getSavedName();
  if (!user || !myName) { window.location.href = "../index.html"; return; }
  checkOrientation();
  await startMatch();
}
init();
