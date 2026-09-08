import { waitForUser, getSavedName, recordRoundResult } from "../js/app.js";

const FUEL_PER_RESOURCE = 100 / 8; // ۸ منبع برای پر شدن سوخت
const TRAIL_LEN = 14;
const BASE_SPEED_FACTOR = 0.4;

const canvas = document.getElementById("astraCanvas");
const ctx = canvas.getContext("2d");
const arenaBox = document.getElementById("astraArenaBox");

const rotateScreen = document.getElementById("astraRotateScreen");
const overlayMsg = document.getElementById("astraOverlayMsg");
const resultScreen = document.getElementById("astraResult");
const fuelP1El = document.getElementById("fuelP1");
const fuelP2El = document.getElementById("fuelP2");
const cargoP1El = document.getElementById("cargoP1");
const cargoP2El = document.getElementById("cargoP2");
const fullscreenBtn = document.getElementById("astraFullscreenBtn");
const muteBtn = document.getElementById("astraMuteBtn");

let W = 900, H = 450;
let SHIP_R = 15, RES_R = 12, DOCK_R = 30, BASE_SPEED = 190;
let stars = [];

function recomputeScaledSizes() {
  const minDim = Math.min(W, H);
  SHIP_R = Math.max(10, minDim * 0.036);
  RES_R = Math.max(9, minDim * 0.03);
  DOCK_R = Math.max(20, minDim * 0.08);
  BASE_SPEED = minDim * BASE_SPEED_FACTOR;
}

function regenerateBackground() {
  stars = [];
  const count = Math.round((W * H) / 4500);
  for (let i = 0; i < count; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.3, tw: Math.random() * Math.PI * 2 });
  }
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
  setDocks();

  if (entitiesInitialized) {
    const rx = W / oldW, ry = H / oldH;
    if (isFinite(rx) && isFinite(ry) && rx > 0 && ry > 0) {
      [p1, p2].forEach((s) => { s.x *= rx; s.y *= ry; s.trail.forEach((p) => { p.x *= rx; p.y *= ry; }); });
      resources.forEach((r) => { r.x *= rx; r.y *= ry; });
      clampAll();
    }
  }
}

function clampAll() {
  [p1, p2].forEach((s) => {
    s.x = Math.max(SHIP_R, Math.min(W - SHIP_R, s.x));
    s.y = Math.max(SHIP_R, Math.min(H - SHIP_R, s.y));
  });
}

let dockP1, dockP2;
function setDocks() {
  dockP1 = { x: SHIP_R * 3, y: H / 2 };
  dockP2 = { x: W - SHIP_R * 3, y: H / 2 };
}

let p1, p2, resources, particles, floaters;
let entitiesInitialized = false;
let running = false, paused = true, raceOver = false;
let myName;
let joyVecP1 = { x: 0, y: 0 }, joyVecP2 = { x: 0, y: 0 };

function rand(min, max) { return Math.random() * (max - min) + min; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function makeShip(x, y, color, label) {
  return { x, y, color, label, trail: [], fuel: 0, cargo: 0, launching: false };
}

function resetGame() {
  setDocks();
  p1 = makeShip(dockP1.x, dockP1.y, "#4F7CFF", "نفر ۱");
  p2 = makeShip(dockP2.x, dockP2.y, "#9B5CFF", "نفر ۲");
  resources = [];
  particles = [];
  floaters = [];
  entitiesInitialized = true;
  raceOver = false;
  for (let i = 0; i < 3; i++) spawnResource();
  updateHud();
}

function spawnResource() {
  const margin = RES_R * 3;
  const x = rand(W * 0.3, W * 0.7);
  const y = rand(margin, H - margin);
  resources.push({ x, y, spawnT: 0, pulse: Math.random() * Math.PI * 2 });
}

function maybeSpawnResource(dt) {
  if (resources.length >= 5) return;
  if (Math.random() < dt * 0.15) spawnResource();
}

function pushTrail(ship) {
  ship.trail.push({ x: ship.x, y: ship.y });
  if (ship.trail.length > TRAIL_LEN) ship.trail.shift();
}

function updateShip(ship, joyVec, dt) {
  if (ship.launching) return;
  const mag = Math.min(1, Math.hypot(joyVec.x, joyVec.y));
  if (mag < 0.02) return;
  const len = Math.hypot(joyVec.x, joyVec.y) || 1;
  const nx = joyVec.x / len, ny = joyVec.y / len;
  ship.x += nx * mag * BASE_SPEED * dt;
  ship.y += ny * mag * BASE_SPEED * dt;
  ship.x = Math.max(SHIP_R, Math.min(W - SHIP_R, ship.x));
  ship.y = Math.max(SHIP_R, Math.min(H - SHIP_R, ship.y));
  pushTrail(ship);
}

function burstParticles(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const speed = rand(50, 140);
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color });
  }
}
function addFloater(x, y, text, color) { floaters.push({ x, y, text, life: 1, color }); }
function updateEffects(dt) {
  particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt * 1.4; });
  particles = particles.filter((p) => p.life > 0);
  floaters.forEach((f) => { f.y -= dt * 40; f.life -= dt * 0.9; });
  floaters = floaters.filter((f) => f.life > 0);
}

function checkResourceCollisions() {
  resources = resources.filter((r) => {
    if (dist(p1, r) < SHIP_R + RES_R) { collect(p1, r, "p1"); return false; }
    if (dist(p2, r) < SHIP_R + RES_R) { collect(p2, r, "p2"); return false; }
    return true;
  });
}

function collect(ship, res, who) {
  ship.cargo++;
  ship.fuel = Math.min(100, ship.fuel + FUEL_PER_RESOURCE);
  addFloater(res.x, res.y, "+سوخت", who === "p1" ? "#4FD1FF" : "#FF4F81");
  burstParticles(res.x, res.y, ship.color);
  playTone(who === "p1" ? 620 : 740, 0.08);
  updateHud();
}

function checkLaunch(now) {
  [{ ship: p1, dock: dockP1, who: "p1" }, { ship: p2, dock: dockP2, who: "p2" }].forEach(({ ship, dock, who }) => {
    if (raceOver || ship.launching) return;
    if (ship.fuel >= 100 && dist(ship, dock) < DOCK_R + SHIP_R) {
      startLaunch(ship, who);
    }
  });
}

async function startLaunch(ship, who) {
  ship.launching = true;
  raceOver = true;
  paused = true;
  await countdownLaunch(ship, who);
}

async function countdownLaunch(ship, who) {
  for (const step of ["۳", "۲", "۱", "🚀 LAUNCH!"]) {
    overlayMsg.innerHTML = `<div class="big">${step}</div>`;
    overlayMsg.style.display = "flex";
    playTone(step === "🚀 LAUNCH!" ? 1300 : 500, 0.08);
    await new Promise((r) => setTimeout(r, 600));
  }
  overlayMsg.style.display = "none";
  finishRace(who);
}

async function finishRace(winnerWho) {
  running = false;
  const wonAccount = winnerWho === "p1"; // حساب لاگین‌شده همیشه نفر ۱ حساب می‌شه
  try { await recordRoundResult(myName, "astra", { won: wonAccount }); } catch (e) { console.error(e); }

  resultScreen.style.display = "flex";
  const label = winnerWho === "p1" ? "نفر ۱" : "نفر ۲";
  const cls = winnerWho;
  resultScreen.innerHTML = `
    <div class="headline ${cls}">🏆 ${label} برنده شد!</div>
    <div style="color:#8B93B8; font-size:13px; margin-bottom:16px;">🌍 رسیدن به دنیای دوم</div>
    <button id="rematchBtn">🔄 دوباره بازی کن</button>
    <button id="homeBtn" class="ghost">🏠 بازگشت به خانه</button>
  `;
  document.getElementById("rematchBtn").addEventListener("click", () => window.location.reload());
  document.getElementById("homeBtn").addEventListener("click", () => { window.location.href = "../index.html"; });
}

// ---------- صدای سنتزی ----------
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
muteBtn.addEventListener("click", () => { muted = !muted; muteBtn.textContent = muted ? "🔇" : "🔊"; });

// ---------- رسم ----------
function drawBackground(t) {
  ctx.fillStyle = "#05060f";
  ctx.fillRect(0, 0, W, H);
  const neb = ctx.createRadialGradient(W * 0.25, H * 0.2, 0, W * 0.25, H * 0.2, Math.max(W, H) * 0.5);
  neb.addColorStop(0, "rgba(124,77,255,.14)"); neb.addColorStop(1, "rgba(124,77,255,0)");
  ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
  const neb2 = ctx.createRadialGradient(W * 0.8, H * 0.85, 0, W * 0.8, H * 0.85, Math.max(W, H) * 0.45);
  neb2.addColorStop(0, "rgba(79,124,255,.12)"); neb2.addColorStop(1, "rgba(79,124,255,0)");
  ctx.fillStyle = neb2; ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255,255,255,.03)"; ctx.lineWidth = 1;
  const gap = Math.max(30, Math.min(W, H) / 12);
  for (let x = 0; x < W; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  stars.forEach((s) => {
    const alpha = 0.4 + Math.sin(t * 2 + s.tw) * 0.3;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0.1, alpha)})`; ctx.fill();
  });
}

function drawDock(dock, color, active) {
  ctx.beginPath();
  ctx.arc(dock.x, dock.y, DOCK_R, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.globalAlpha = active ? 0.9 : 0.3;
  ctx.lineWidth = active ? 3 : 1.5;
  if (active) { ctx.shadowColor = color; ctx.shadowBlur = 16; }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawTrail(ship) {
  ship.trail.forEach((p, i) => {
    const a = (i / ship.trail.length) * 0.35;
    ctx.beginPath();
    ctx.arc(p.x, p.y, SHIP_R * (0.3 + (i / ship.trail.length) * 0.5), 0, Math.PI * 2);
    ctx.fillStyle = ship.color; ctx.globalAlpha = a; ctx.fill(); ctx.globalAlpha = 1;
  });
}

function drawShip(ship) {
  drawTrail(ship);
  ctx.beginPath();
  ctx.arc(ship.x, ship.y, SHIP_R, 0, Math.PI * 2);
  ctx.fillStyle = ship.color;
  ctx.shadowColor = ship.color; ctx.shadowBlur = ship.fuel >= 100 ? Math.min(24, SHIP_R * 1.6) : Math.min(12, SHIP_R);
  ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = "#EAF0FF";
  ctx.font = `${Math.max(9, SHIP_R * 0.65)}px Vazirmatn, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(ship.label, ship.x, ship.y - SHIP_R - 6);
}

function drawResources(t) {
  resources.forEach((r) => {
    r.spawnT = Math.min(1, r.spawnT + 0.06);
    const pulse = 1 + Math.sin(t * 3 + r.pulse) * 0.1;
    const rad = RES_R * r.spawnT * pulse;
    ctx.beginPath();
    ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
    ctx.fillStyle = "#FFC845";
    ctx.shadowColor = "#FFC845"; ctx.shadowBlur = Math.min(16, rad);
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#05060f";
    ctx.font = `${Math.max(8, rad * 0.8)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("⚡", r.x, r.y + rad * 0.3);
  });
}

function drawEffects() {
  particles.forEach((p) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life); ctx.fill(); ctx.globalAlpha = 1;
  });
  floaters.forEach((f) => {
    ctx.font = "bold 12px Vazirmatn, sans-serif"; ctx.textAlign = "center";
    ctx.fillStyle = f.color; ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillText(f.text, f.x, f.y); ctx.globalAlpha = 1;
  });
}

function draw(t) {
  drawBackground(t);
  drawDock(dockP1, "#4F7CFF", p1.fuel >= 100);
  drawDock(dockP2, "#9B5CFF", p2.fuel >= 100);
  drawResources(t);
  drawShip(p1);
  drawShip(p2);
  drawEffects();
}

function updateHud() {
  fuelP1El.style.width = `${p1.fuel}%`;
  fuelP2El.style.width = `${p2.fuel}%`;
  cargoP1El.textContent = p1.cargo;
  cargoP2El.textContent = p2.cargo;
}

let lastTime = null;
function loop(ts) {
  if (!running) return;
  if (lastTime === null) lastTime = ts;
  const dt = Math.min(0.05, (ts - lastTime) / 1000);
  lastTime = ts;
  const now = ts / 1000;

  if (!paused) {
    updateShip(p1, joyVecP1, dt);
    updateShip(p2, joyVecP2, dt);
    checkResourceCollisions();
    checkLaunch(now);
    maybeSpawnResource(dt);
    updateEffects(dt);
  }
  draw(now);
  requestAnimationFrame(loop);
}

async function startMatch() {
  resizeCanvasResolution();
  resetGame();
  running = true;
  requestAnimationFrame(loop);
  paused = true;
  overlayMsg.innerHTML = `<div class="big">۳</div>`;
  for (const step of ["۳", "۲", "۱", "برو!"]) {
    overlayMsg.innerHTML = `<div class="big">${step}</div>`;
    overlayMsg.style.display = "flex";
    playTone(step === "برو!" ? 900 : 500, 0.08);
    await new Promise((r) => setTimeout(r, 600));
  }
  overlayMsg.style.display = "none";
  paused = orientationLocked;
}

// ---------- جوی‌استیک‌ها با Pointer Events (چندلمسی) ----------
function setupJoystick(baseEl, knobEl, side) {
  let active = false, origin = { x: 0, y: 0 }, pointerId = null;
  const setVec = (v) => { if (side === "p1") joyVecP1 = v; else joyVecP2 = v; };

  function start(clientX, clientY) {
    active = true;
    baseEl.classList.add("pressed");
    const rect = baseEl.getBoundingClientRect();
    origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  function move(clientX, clientY) {
    if (!active) return;
    let dx = clientX - origin.x, dy = clientY - origin.y;
    const max = baseEl.getBoundingClientRect().width * 0.38;
    const deadZone = max * 0.14;
    const d = Math.hypot(dx, dy);
    if (d < deadZone) { setVec({ x: 0, y: 0 }); knobEl.style.transform = "translate(0,0)"; return; }
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    setVec({ x: dx / max, y: dy / max });
  }
  function end() {
    active = false; pointerId = null;
    baseEl.classList.remove("pressed");
    knobEl.style.transform = "translate(0,0)";
    setVec({ x: 0, y: 0 });
  }

  baseEl.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    baseEl.setPointerCapture(e.pointerId);
    start(e.clientX, e.clientY);
    move(e.clientX, e.clientY);
  });
  baseEl.addEventListener("pointermove", (e) => { if (e.pointerId === pointerId) { e.preventDefault(); move(e.clientX, e.clientY); } });
  baseEl.addEventListener("pointerup", (e) => { if (e.pointerId === pointerId) end(); });
  baseEl.addEventListener("pointercancel", (e) => { if (e.pointerId === pointerId) end(); });
  baseEl.style.touchAction = "none";
}

setupJoystick(document.getElementById("astraJoyBaseP1"), document.getElementById("astraJoyKnobP1"), "p1");
setupJoystick(document.getElementById("astraJoyBaseP2"), document.getElementById("astraJoyKnobP2"), "p2");

// ---------- Fullscreen ----------
fullscreenBtn.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); fullscreenBtn.textContent = "⛶ خروج"; }
    else { await document.exitFullscreen(); fullscreenBtn.textContent = "⛶ تمام‌صفحه"; }
  } catch (e) {}
});

// ---------- قفل landscape ----------
let orientationLocked = false;
function checkOrientation() {
  const w = window.innerWidth, h = window.innerHeight;
  const isMobileLike = Math.min(w, h) < 700;
  const isPortrait = h > w;
  orientationLocked = isMobileLike && isPortrait;
  rotateScreen.classList.toggle("show", orientationLocked);
  if (running && !raceOver) paused = orientationLocked;
}
function handleViewportChange() {
  checkOrientation();
  if (!orientationLocked) requestAnimationFrame(() => requestAnimationFrame(resizeCanvasResolution));
}
window.addEventListener("resize", handleViewportChange);
window.addEventListener("orientationchange", handleViewportChange);
if (window.visualViewport) window.visualViewport.addEventListener("resize", handleViewportChange);

async function init() {
  const user = await waitForUser();
  myName = getSavedName();
  if (!user || !myName) { window.location.href = "../index.html"; return; }
  checkOrientation();
  await startMatch();
}
init();
