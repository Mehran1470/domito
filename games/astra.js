import {
  waitForUser, getSavedName, currentUid, roomRef, getSavedRoom, onValue,
  ref, db, set, get, update, remove, runTransaction, onDisconnect,
  recordRoundResult, resetSessionForNextRound
} from "../js/app.js";
import { mountChat } from "../js/chat.js";

const isSolo = new URLSearchParams(location.search).has("solo");
const code = getSavedRoom();
const R = (p) => roomRef(code, p);
const A = (p) => ref(db, `rooms/${code}/astra/${p}`);

const FUEL_PER_RESOURCE = 20; // ۵ منبع = ۱۰۰٪
const RESOURCE_COUNT = 4;
const CARRY_RANGE_MULT = 1.15;
const BASE_SPEED_FACTOR = 0.4;

const canvas = document.getElementById("astraCanvas");
const ctx = canvas.getContext("2d");
const arenaBox = document.getElementById("astraArenaBox");

const rotateScreen = document.getElementById("astraRotateScreen");
const overlayMsg = document.getElementById("astraOverlayMsg");
const resultScreen = document.getElementById("astraResult");
const fuelP1El = document.getElementById("fuelP1");
const cargoP1El = document.getElementById("cargoP1");
const p1Label = document.getElementById("p1Label");
const othersHud = document.getElementById("othersHud");
const modeBadge = document.getElementById("astraModeBadge");
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
  for (let i = 0; i < count; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.3, tw: Math.random() * Math.PI * 2 });
}
 let entitiesInitialized = false;

function resizeCanvasResolution() {
  async function startSolo() {
  modeBadge.textContent = "تک‌نفره در برابر ربات";
  resizeCanvasResolution();
  computeDock();
  entitiesInitialized = true;
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const oldW = W, oldH = H;
  W = cssW; H = cssH;
  recomputeScaledSizes();
  regenerateBackground();
  computeDock();

  // اگه بازی از قبل شروع شده بود، همه‌ی موقعیت‌ها رو متناسب با اندازه جدید جابه‌جا کن
  if (entitiesInitialized && oldW > 0 && oldH > 0) {
    const rx = W / oldW, ry = H / oldH;
    if (isFinite(rx) && isFinite(ry) && rx > 0 && ry > 0) {
      [me, aiShip].forEach((s) => {
        if (!s) return;
        s.x *= rx; s.y *= ry;
        if (s.trail) s.trail.forEach((p) => { p.x *= rx; p.y *= ry; });
      });
      if (aiShip && aiShip.dock) { aiShip.dock.x *= rx; aiShip.dock.y *= ry; }
      localResources.forEach((r) => { r.x *= rx; r.y *= ry; });
      Object.values(firebaseResources).forEach((r) => { r.x *= rx; r.y *= ry; });
      Object.values(others).forEach((o) => { o.x *= rx; o.y *= ry; });
      me.x = Math.max(SHIP_R, Math.min(W - SHIP_R, me.x));
      me.y = Math.max(SHIP_R, Math.min(H - SHIP_R, me.y));
    }
  }
}

let myDock = { x: 0, y: 0 };
let dockColor = "#4F7CFF";
function computeDock() { myDock = { x: SHIP_R * 3, y: H / 2 }; }

// ---------- وضعیت من ----------
let me = { x: 0, y: 0, angle: -Math.PI / 2, fuel: 0, cargo: 0, carrying: null, trail: [] };
let localResources = []; // فقط برای حالت سولو
let aiShip = null;
let others = {}; // uid -> {x,y,angle,fuel,cargo,name,color}
let firebaseResources = {}; // فقط برای اتاق: id -> {x,y,takenBy}
let particles = [], floaters = [];
let running = false, paused = true, raceOver = false;
let myName, myUid;
let joyVec = { x: 0, y: 0 };
let unsubs = [];

function rand(min, max) { return Math.random() * (max - min) + min; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
const COLORS = ["#4F7CFF", "#9B5CFF", "#FF4F81", "#3ECF8E"];

// ---------- افکت‌ها ----------
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

// ---------- صدا ----------
let audioCtx = null, muted = false;
function playTone(freq, duration) {
  if (muted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.frequency.value = freq; osc.type = "sine";
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}
muteBtn.addEventListener("click", () => { muted = !muted; muteBtn.textContent = muted ? "🔇" : "🔊"; });

// ---------- حرکت من ----------
function updateMe(dt) {
  const mag = Math.min(1, Math.hypot(joyVec.x, joyVec.y));
  if (mag > 0.02) {
    const len = Math.hypot(joyVec.x, joyVec.y) || 1;
    const nx = joyVec.x / len, ny = joyVec.y / len;
    me.angle = Math.atan2(ny, nx);
    me.x += nx * mag * BASE_SPEED * dt;
    me.y += ny * mag * BASE_SPEED * dt;
    me.x = Math.max(SHIP_R, Math.min(W - SHIP_R, me.x));
    me.y = Math.max(SHIP_R, Math.min(H - SHIP_R, me.y));
    me.trail.push({ x: me.x, y: me.y });
    if (me.trail.length > 12) me.trail.shift();
  }
}

// ---------- حالت سولو: منابع محلی + AI ----------
function spawnLocalResource() {
  const margin = RES_R * 3;
  localResources.push({ id: "r" + Math.random(), x: rand(W * 0.3, W * 0.7), y: rand(margin, H - margin), spawnT: 0, pulse: Math.random() * Math.PI * 2, takenBy: null });
}

function soloTick(dt, now) {
  // من: برداشتن/تحویل
  handleCarryLogic(me, localResources, myDock, true);

  // AI
  if (!aiShip.launched) {
    if (aiShip.carrying) {
      moveToward(aiShip, aiShip.dock, dt);
      if (dist(aiShip, aiShip.dock) < DOCK_R) {
        aiShip.cargo++; aiShip.fuel = Math.min(100, aiShip.fuel + FUEL_PER_RESOURCE);
        aiShip.carrying = null;
      }
    } else {
      const target = localResources.filter((r) => !r.takenBy).sort((a, b) => dist(aiShip, a) - dist(aiShip, b))[0];
      if (target) {
        moveToward(aiShip, target, dt);
        if (dist(aiShip, target) < (SHIP_R + RES_R) * CARRY_RANGE_MULT) { target.takenBy = "ai"; aiShip.carrying = target.id; }
      }
    }
    aiShip.x = Math.max(SHIP_R, Math.min(W - SHIP_R, aiShip.x));
    aiShip.y = Math.max(SHIP_R, Math.min(H - SHIP_R, aiShip.y));
  }

  localResources = localResources.filter((r) => !r.takenBy);
  while (localResources.length < RESOURCE_COUNT) spawnLocalResource();

  if (me.fuel >= 100 && dist(me, myDock) < DOCK_R && !raceOver) finishRace(true);
  if (aiShip.fuel >= 100 && dist(aiShip, aiShip.dock) < DOCK_R && !raceOver) finishRace(false);

  updateHudSolo();
}

function moveToward(entity, target, dt) {
  const d = dist(entity, target) || 1;
  entity.x += ((target.x - entity.x) / d) * BASE_SPEED * dt;
  entity.y += ((target.y - entity.y) / d) * BASE_SPEED * dt;
  entity.angle = Math.atan2(target.y - entity.y, target.x - entity.x);
}

function handleCarryLogic(ship, resourcesArr, dock, isMe) {
  if (ship.carrying) {
    if (dist(ship, dock) < DOCK_R) {
      ship.cargo++;
      ship.fuel = Math.min(100, ship.fuel + FUEL_PER_RESOURCE);
      addFloater(dock.x, dock.y, "+سوخت", dockColor);
      burstParticles(dock.x, dock.y, dockColor);
      playTone(700, 0.08);
      const rid = ship.carrying;
      ship.carrying = null;
      if (isSolo) {
        localResources = localResources.filter((r) => r.id !== rid);
      } else {
        update(A(`resources/${rid}`), { takenBy: null, consumed: true });
      }
    }
  } else {
    const nearby = isSolo
      ? localResources.find((r) => !r.takenBy && dist(ship, r) < (SHIP_R + RES_R) * CARRY_RANGE_MULT)
      : Object.entries(firebaseResources).find(([id, r]) => !r.takenBy && dist(ship, r) < (SHIP_R + RES_R) * CARRY_RANGE_MULT);
    if (nearby) {
      if (isSolo) {
        nearby.takenBy = myUid;
        ship.carrying = nearby.id;
        playTone(500, 0.06);
      } else {
        const [id, r] = nearby;
        runTransaction(A(`resources/${id}/takenBy`), (curr) => (curr ? curr : myUid)).then((res) => {
          if (res.committed && res.snapshot.val() === myUid) { ship.carrying = id; playTone(500, 0.06); }
        });
      }
    }
  }
}

// ---------- رسم ----------
function drawBackground(t) {
  ctx.fillStyle = "#05060f"; ctx.fillRect(0, 0, W, H);
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
  ctx.beginPath(); ctx.arc(dock.x, dock.y, DOCK_R, 0, Math.PI * 2);
  ctx.strokeStyle = color; ctx.globalAlpha = active ? 0.9 : 0.3; ctx.lineWidth = active ? 3 : 1.5;
  if (active) { ctx.shadowColor = color; ctx.shadowBlur = 16; }
  ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
}

function drawTrail(trail, color) {
  trail.forEach((p, i) => {
    const a = (i / trail.length) * 0.3;
    ctx.beginPath(); ctx.arc(p.x, p.y, SHIP_R * (0.25 + (i / trail.length) * 0.4), 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.globalAlpha = a; ctx.fill(); ctx.globalAlpha = 1;
  });
}

// موشک واقعی: مثلث بدنه + شعله موتور
function drawRocket(x, y, angle, color, label, carrying, boosted) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // شعله موتور
  ctx.beginPath();
  ctx.moveTo(-SHIP_R * 1.1, -SHIP_R * 0.4);
  ctx.lineTo(-SHIP_R * (1.8 + Math.random() * 0.4), 0);
  ctx.lineTo(-SHIP_R * 1.1, SHIP_R * 0.4);
  ctx.closePath();
  ctx.fillStyle = "#FFC845";
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;

  // بدنه‌ی موشک (مثلث نوک‌تیز رو به جهت حرکت)
  ctx.beginPath();
  ctx.moveTo(SHIP_R * 1.3, 0);
  ctx.lineTo(-SHIP_R * 0.8, -SHIP_R * 0.75);
  ctx.lineTo(-SHIP_R * 0.4, 0);
  ctx.lineTo(-SHIP_R * 0.8, SHIP_R * 0.75);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = color; ctx.shadowBlur = boosted ? Math.min(22, SHIP_R * 1.5) : Math.min(10, SHIP_R * 0.8);
  ctx.fill(); ctx.shadowBlur = 0;

  ctx.restore();

  if (carrying) {
    ctx.beginPath();
    ctx.arc(x - Math.cos(angle) * SHIP_R * 1.6, y - Math.sin(angle) * SHIP_R * 1.6, RES_R * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = "#FFC845"; ctx.shadowColor = "#FFC845"; ctx.shadowBlur = 8;
    ctx.fill(); ctx.shadowBlur = 0;
  }

  ctx.fillStyle = "#EAF0FF";
  ctx.font = `${Math.max(9, SHIP_R * 0.65)}px Vazirmatn, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(label, x, y - SHIP_R - 8);
}

function drawResources(t, list) {
  list.forEach((r) => {
    if (r.takenBy) return;
    r.spawnT = Math.min(1, (r.spawnT || 0) + 0.06);
    const pulse = 1 + Math.sin(t * 3 + (r.pulse || 0)) * 0.1;
    const rad = RES_R * r.spawnT * pulse;
    ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
    ctx.fillStyle = "#FFC845"; ctx.shadowColor = "#FFC845"; ctx.shadowBlur = Math.min(16, rad);
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#05060f"; ctx.font = `${Math.max(8, rad * 0.8)}px sans-serif`; ctx.textAlign = "center";
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
  drawDock(myDock, dockColor, me.fuel >= 100);

  if (isSolo) {
    drawResources(t, localResources);
    drawDock(aiShip.dock, "#9B5CFF", aiShip.fuel >= 100);
    drawTrail(aiShip.trail || [], "#9B5CFF");
    drawRocket(aiShip.x, aiShip.y, aiShip.angle, "#9B5CFF", "ربات", aiShip.carrying, false);
  } else {
    drawResources(t, Object.entries(firebaseResources).map(([id, r]) => ({ ...r, id })));
    Object.values(others).forEach((o) => {
      drawTrail(o.trail || [], o.color);
      drawRocket(o.x, o.y, o.angle || 0, o.color, o.name, o.carrying, false);
    });
  }

  drawTrail(me.trail, dockColor);
  drawRocket(me.x, me.y, me.angle, dockColor, myName || "تو", me.carrying, false);
  drawEffects();
}

function updateHudSolo() {
  fuelP1El.style.width = `${me.fuel}%`;
  cargoP1El.textContent = me.cargo;
  othersHud.innerHTML = `
    <div class="astra-hud-chip">
      <div class="name" style="color:#9B5CFF;">🤖 ربات</div>
      <div class="mini-bar"><div class="mini-fill" style="width:${aiShip.fuel}%; background:#9B5CFF;"></div></div>
    </div>
  `;
}

function updateHudRoom() {
  fuelP1El.style.width = `${me.fuel}%`;
  cargoP1El.textContent = me.cargo;
  othersHud.innerHTML = Object.values(others).map((o) => `
    <div class="astra-hud-chip">
      <div class="name" style="color:${o.color};">🚀 ${o.name}</div>
      <div class="mini-bar"><div class="mini-fill" style="width:${o.fuel || 0}%; background:${o.color};"></div></div>
    </div>
  `).join("");
}

// ---------- حلقه‌ی اصلی ----------
let lastTime = null, lastBroadcast = 0;
function loop(ts) {
  if (!running) return;
  if (lastTime === null) lastTime = ts;
  const dt = Math.min(0.05, (ts - lastTime) / 1000);
  lastTime = ts;
  const now = ts / 1000;

  if (!paused && !raceOver) {
    updateMe(dt);
    updateEffects(dt);

    if (isSolo) {
      soloTick(dt, now);
    } else {
      handleCarryLogic(me, [], myDock, true);
      if (me.fuel >= 100 && dist(me, myDock) < DOCK_R) tryClaimWin();
      updateHudRoom();

      if (ts - lastBroadcast > 90) {
        lastBroadcast = ts;
        update(A(`players/${myUid}`), { x: me.x, y: me.y, angle: me.angle, fuel: me.fuel, cargo: me.cargo, carrying: !!me.carrying });
      }
    }
  }
  draw(now);
  requestAnimationFrame(loop);
}

async function tryClaimWin() {
  const res = await runTransaction(A("winner"), (curr) => (curr ? curr : myUid));
  // نتیجه از طریق listener مدیریت می‌شه
}

// ---------- شروع بازی ----------
async function countdown(labelWin) {
  paused = true;
  for (const step of ["۳", "۲", "۱", "برو!"]) {
    overlayMsg.innerHTML = `<div class="big">${step}</div>`;
    overlayMsg.style.display = "flex";
    playTone(step === "برو!" ? 900 : 500, 0.08);
    await new Promise((r) => setTimeout(r, 550));
  }
  overlayMsg.style.display = "none";
  paused = orientationLocked;
}

async function finishRace(iWon) {
  if (raceOver) return;
  raceOver = true;
  running = false;
  playTone(iWon ? 1300 : 300, 0.3);
  try { await recordRoundResult(myName, "astra", { won: iWon }); } catch (e) { console.error(e); }
  showResult(iWon);
}

function showResult(iWon) {
  resultScreen.style.display = "flex";
  resultScreen.innerHTML = `
    <div class="headline ${iWon ? "p1" : "p2"}">${iWon ? "🏆 پیروزی!" : "😅 این‌بار نشد"}</div>
    <div style="color:#8B93B8; font-size:13px; margin-bottom:16px;">🌍 پایان مسابقه</div>
    <button id="rematchBtn">${isSolo ? "🔄 دوباره بازی کن" : "🏠 بازگشت به اتاق"}</button>
    <button id="homeBtn" class="ghost">🏠 بازگشت به خانه</button>
  `;
  document.getElementById("rematchBtn").addEventListener("click", async () => {
    if (isSolo) window.location.reload();
    else { await resetSessionForNextRound(); window.location.href = "../lobby.html"; }
  });
  document.getElementById("homeBtn").addEventListener("click", () => { window.location.href = "../index.html"; });
}

async function startSolo() {
  modeBadge.textContent = "تک‌نفره در برابر ربات";
  resizeCanvasResolution();
  computeDock();
  me = { x: myDock.x, y: myDock.y, angle: 0, fuel: 0, cargo: 0, carrying: null, trail: [] };
  aiShip = { x: W - SHIP_R * 3, y: H / 2, angle: Math.PI, fuel: 0, cargo: 0, carrying: null, trail: [], dock: { x: W - SHIP_R * 3, y: H / 2 }, launched: false };
  localResources = [];
  for (let i = 0; i < RESOURCE_COUNT; i++) spawnLocalResource();
  running = true;
  requestAnimationFrame(loop);
  await countdown();
}

async function startRoom() {
  modeBadge.textContent = "چندنفره — تا ۴ نفر";
  resizeCanvasResolution();
  computeDock();

  const playersSnap = await get(R("players"));
  const roomPlayers = playersSnap.val() || {};
  const uids = Object.keys(roomPlayers).sort();
  const myIndex = uids.indexOf(myUid);
  dockColor = COLORS[myIndex % COLORS.length] || COLORS[0];

  const dockSpots = [
    { x: SHIP_R * 3, y: H * 0.25 },
    { x: W - SHIP_R * 3, y: H * 0.25 },
    { x: SHIP_R * 3, y: H * 0.75 },
    { x: W - SHIP_R * 3, y: H * 0.75 },
  ];
  myDock = dockSpots[myIndex % dockSpots.length] || dockSpots[0];
  me = { x: myDock.x, y: myDock.y, angle: 0, fuel: 0, cargo: 0, carrying: null, trail: [] };

  // فقط اولین کسی که می‌رسه منابع رو می‌سازه
  await runTransaction(A("resources"), (curr) => {
    if (curr) return curr;
    const obj = {};
    for (let i = 0; i < RESOURCE_COUNT; i++) {
      const margin = RES_R * 3;
      obj["r" + i] = { x: rand(W * 0.3, W * 0.7), y: rand(margin, H - margin), takenBy: null };
    }
    return obj;
  });

  await set(A(`players/${myUid}`), { name: myName, x: me.x, y: me.y, angle: 0, fuel: 0, cargo: 0, carrying: false, colorIndex: myIndex % COLORS.length });
  onDisconnect(A(`players/${myUid}`)).remove();

  unsubs.push(onValue(A("resources"), (snap) => {
    const val = snap.val() || {};
    firebaseResources = {};
    Object.entries(val).forEach(([id, r]) => { if (!r.consumed) firebaseResources[id] = r; });
    while (Object.keys(firebaseResources).length < RESOURCE_COUNT) {
      const id = "r" + Date.now() + Math.random();
      const margin = RES_R * 3;
      const nr = { x: rand(W * 0.3, W * 0.7), y: rand(margin, H - margin), takenBy: null };
      firebaseResources[id] = nr;
      set(A(`resources/${id}`), nr);
      break; // فقط یکی اضافه کن، دور بعدی loop خودش کامل می‌کنه
    }
  }));

  unsubs.push(onValue(A("players"), (snap) => {
    const val = snap.val() || {};
    others = {};
    Object.entries(val).forEach(([uid, p]) => {
      if (uid === myUid) return;
      others[uid] = { ...p, color: COLORS[p.colorIndex % COLORS.length] || COLORS[1] };
    });
  }));

  unsubs.push(onValue(A("winner"), async (snap) => {
    const winnerUid = snap.val();
    if (winnerUid && !raceOver) {
      await finishRace(winnerUid === myUid);
    }
  }));

  mountChat(myName, code);
  running = true;
  requestAnimationFrame(loop);
  await countdown();
}

// ---------- جوی‌استیک ----------
function setupJoystick(baseEl, knobEl) {
  let active = false, origin = { x: 0, y: 0 }, pointerId = null;
  function start(clientX, clientY) {
    active = true; baseEl.classList.add("pressed");
    const rect = baseEl.getBoundingClientRect();
    origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  function move(clientX, clientY) {
    if (!active) return;
    let dx = clientX - origin.x, dy = clientY - origin.y;
    const max = baseEl.getBoundingClientRect().width * 0.38;
    const deadZone = max * 0.14;
    const d = Math.hypot(dx, dy);
    if (d < deadZone) { joyVec = { x: 0, y: 0 }; knobEl.style.transform = "translate(0,0)"; return; }
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    joyVec = { x: dx / max, y: dy / max };
  }
  function end() {
    active = false; pointerId = null; baseEl.classList.remove("pressed");
    knobEl.style.transform = "translate(0,0)"; joyVec = { x: 0, y: 0 };
  }
  baseEl.addEventListener("pointerdown", (e) => { e.preventDefault(); if (pointerId !== null) return; pointerId = e.pointerId; baseEl.setPointerCapture(e.pointerId); start(e.clientX, e.clientY); move(e.clientX, e.clientY); });
  baseEl.addEventListener("pointermove", (e) => { if (e.pointerId === pointerId) { e.preventDefault(); move(e.clientX, e.clientY); } });
  baseEl.addEventListener("pointerup", (e) => { if (e.pointerId === pointerId) end(); });
  baseEl.addEventListener("pointercancel", (e) => { if (e.pointerId === pointerId) end(); });
  baseEl.style.touchAction = "none";
}
setupJoystick(document.getElementById("astraJoyBaseP1"), document.getElementById("astraJoyKnobP1"));

// ---------- کیبورد دسکتاپ ----------
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
  orientationLocked = Math.min(w, h) < 700 && h > w;
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

// ---------- شروع ----------
async function init() {
  const user = await waitForUser();
  myName = getSavedName();
  if (!user || !myName) { window.location.href = "../index.html"; return; }
  myUid = currentUid();
  p1Label.textContent = myName;
  checkOrientation();
  if (isSolo) await startSolo();
  else {
    if (!code) { window.location.href = "../index.html"; return; }
    await startRoom();
  }
}
init();

window.addEventListener("beforeunload", () => {
  if (!isSolo && myUid) remove(A(`players/${myUid}`));
});
