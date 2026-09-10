import {
  waitForUser, getSavedName, currentUid, roomRef, getSavedRoom, onValue,
  ref, db, set, get, update, remove, runTransaction, onDisconnect,
  recordRoundResult, resetSessionForNextRound
} from "../js/app.js";
import { mountChat } from "../js/chat.js";

const isSolo = new URLSearchParams(location.search).has("solo");
const code = getSavedRoom();
const R = (p) => roomRef(code, p);
const G = (p) => ref(db, `rooms/${code}/gunball/${p}`);

const MAX_HP = 3;
const BULLET_LIFETIME = 1.1;
const HIT_RADIUS_MULT = 1.0;
const INVULN_TIME = 0.6;
const FIRE_COOLDOWN = 0.5;
const COLORS = ["#FF4F81", "#4F7CFF", "#3ECF8E", "#FFC845"];

const canvas = document.getElementById("gunballCanvas");
const ctx = canvas.getContext("2d");
const arenaWrap = document.getElementById("arenaWrap");
const hudRow = document.getElementById("hudRow");
const modeNote = document.getElementById("modeNote");
const scoreArea = document.getElementById("scoreArea");
const soloResult = document.getElementById("soloResult");
const fireBtn = document.getElementById("fireBtn");

let W = 340, H = 212;
let PR = 14; // player radius
let BR = 4;  // bullet radius

function recomputeSizes() {
  const minDim = Math.min(W, H);
  PR = Math.max(10, minDim * 0.07);
  BR = Math.max(3, minDim * 0.02);
}

function resizeCanvas() {
  const rect = arenaWrap.getBoundingClientRect();
  const cssW = Math.max(1, rect.width), cssH = Math.max(1, rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  W = cssW; H = cssH;
  recomputeSizes();
}

let me, ai, others = {}, myShots = [], incomingShots = {}, particles = [];
let running = false, over = false;
let myName, myUid, myColor;
let joyVec = { x: 0, y: 0 };
let facing = 0;
let lastFire = -99;
let invulnUntil = 0;
let processedShots = new Set();
let unsubs = [];

function rand(a, b) { return Math.random() * (b - a) + a; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clampPos(e) { e.x = Math.max(PR, Math.min(W - PR, e.x)); e.y = Math.max(PR, Math.min(H - PR, e.y)); }

function burst(x, y, color) {
  for (let i = 0; i < 10; i++) {
    const a = rand(0, Math.PI * 2), s = rand(40, 110);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
  }
}
function updateParticles(dt) {
  particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt * 1.6; });
  particles = particles.filter((p) => p.life > 0);
}

function drawArena() {
  ctx.fillStyle = "#150B24";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
  const gap = Math.max(24, Math.min(W, H) / 8);
  for (let x = 0; x < W; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

function drawPlayer(p, color, label, flashInvuln) {
  if (flashInvuln && Math.floor(performance.now() / 100) % 2 === 0) return; // چشمک هنگام بی‌حسی
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle || 0);
  // تفنگ
  ctx.fillStyle = "#333";
  ctx.fillRect(PR * 0.2, -PR * 0.18, PR * 1.1, PR * 0.36);
  ctx.restore();
  // بدنه‌ی توپ
  ctx.beginPath();
  ctx.arc(p.x, p.y, PR, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.shadowColor = color; ctx.shadowBlur = 10;
  ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  ctx.font = `${Math.max(9, PR * 0.6)}px Vazirmatn, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(label, p.x, p.y - PR - 6);
}

function drawBullet(x, y, color) {
  ctx.beginPath();
  ctx.arc(x, y, BR, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.shadowColor = color; ctx.shadowBlur = 6;
  ctx.fill(); ctx.shadowBlur = 0;
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life); ctx.fill(); ctx.globalAlpha = 1;
  });
}

function renderHearts(hp) {
  let s = "";
  for (let i = 0; i < MAX_HP; i++) s += i < hp ? "❤️" : "🖤";
  return s;
}

function updateHud() {
  let html = `<div class="gunball-hp-chip">🚀 ${myName}: ${renderHearts(me.hp)}</div>`;
  if (isSolo) {
    html += `<div class="gunball-hp-chip">🤖 ربات: ${renderHearts(ai.hp)}</div>`;
  } else {
    Object.values(others).forEach((o) => {
      html += `<div class="gunball-hp-chip">${o.name}: ${renderHearts(o.hp)}</div>`;
    });
  }
  hudRow.innerHTML = html;
}

// ---------- شلیک ----------
function tryFire(now) {
  if (over || now - lastFire < FIRE_COOLDOWN) return;
  lastFire = now;
  if (isSolo) {
    myShots.push({ x: me.x, y: me.y, angle: me.angle, at: now });
  } else {
    push_shot(me.x, me.y, me.angle, now);
  }
}
async function push_shot(x, y, angle, now) {
  const { push } = await import("../js/app.js").then(() => ({ push: null })); // placeholder، واقعی زیر
}

// چون push مستقیم export نشده در app.js عمومی از قبل، از set با کلید یکتا استفاده می‌کنیم
async function sendShot(x, y, angle) {
  const id = "s" + Date.now() + Math.floor(Math.random() * 10000);
  await set(G(`shots/${myUid}_${id}`), { uid: myUid, x, y, angle, at: Date.now() });
}

function localBulletsTick(list, dt, now) {
  // برای حالت سولو: گلوله‌های من و ای‌آی رو حرکت بده و برخورد چک کن
}

// ---------- هسته‌ی بازی سولو ----------
function soloTick(dt, now) {
  // حرکت من
  const mag = Math.min(1, Math.hypot(joyVec.x, joyVec.y));
  if (mag > 0.05) {
    const len = Math.hypot(joyVec.x, joyVec.y) || 1;
    me.angle = Math.atan2(joyVec.y / len, joyVec.x / len);
    me.x += (joyVec.x / len) * mag * 120 * dt;
    me.y += (joyVec.y / len) * mag * 120 * dt;
    clampPos(me);
  }

  // AI حرکت + شلیک
  const d2me = dist(ai, me);
  if (d2me > PR * 4) {
    const ang = Math.atan2(me.y - ai.y, me.x - ai.x);
    ai.angle = ang;
    ai.x += Math.cos(ang) * 90 * dt;
    ai.y += Math.sin(ang) * 90 * dt;
    clampPos(ai);
  } else {
    ai.angle = Math.atan2(me.y - ai.y, me.x - ai.x);
  }
  if (now - (ai.lastFire || 0) > 1.1 && d2me < W * 0.7) {
    ai.lastFire = now;
    myShots.push({ x: ai.x, y: ai.y, angle: ai.angle, at: now, isAi: true });
  }

  // حرکت گلوله‌ها و برخورد
  myShots = myShots.filter((s) => {
    const t = now - s.at;
    if (t > BULLET_LIFETIME) return false;
    const speed = Math.min(W, H) * 1.9;
    const bx = s.x + Math.cos(s.angle) * speed * t;
    const by = s.y + Math.sin(s.angle) * speed * t;
    if (bx < 0 || bx > W || by < 0 || by > H) return false;

    if (!s.isAi && now > (ai.invulnUntil || 0) && dist({ x: bx, y: by }, ai) < PR + BR) {
      ai.hp--; ai.invulnUntil = now + INVULN_TIME; burst(bx, by, "#FF4F81");
      if (ai.hp <= 0) endSolo(true);
      return false;
    }
    if (s.isAi && now > invulnUntil && dist({ x: bx, y: by }, me) < PR + BR) {
      me.hp--; invulnUntil = now + INVULN_TIME; burst(bx, by, "#4F7CFF");
      if (me.hp <= 0) endSolo(false);
      return false;
    }
    return true;
  });

  updateParticles(dt);
  updateHud();
}

async function endSolo(won) {
  if (over) return;
  over = true; running = false;
  try { await recordRoundResult(myName, "gunball", { won }); } catch (e) {}
  showResult(won);
}

function showResult(won) {
  scoreArea.style.display = "block";
  soloResult.innerHTML = `
    <div class="big-emoji">${won ? "🎉" : "😅"}</div>
    <h2>${won ? "بردی!" : "این‌بار باختی"}</h2>
    <button onclick="location.reload()" class="btn-full">دوباره بازی کن</button>
    <a href="${isSolo ? "../index.html" : "../lobby.html"}" class="btn-full btn-ghost" style="display:block;text-decoration:none;text-align:center;margin-top:10px;">${isSolo ? "بازگشت به خانه" : "بازگشت به اتاق"}</a>
  `;
}

// ---------- هسته‌ی بازی اتاق ----------
function roomTick(dt, now) {
  if (me.hp > 0) {
    const mag = Math.min(1, Math.hypot(joyVec.x, joyVec.y));
    if (mag > 0.05) {
      const len = Math.hypot(joyVec.x, joyVec.y) || 1;
      me.angle = Math.atan2(joyVec.y / len, joyVec.x / len);
      me.x += (joyVec.x / len) * mag * 120 * dt;
      me.y += (joyVec.y / len) * mag * 120 * dt;
      clampPos(me);
    }
  }

  // چک برخورد گلوله‌های دریافتی با من
  Object.entries(incomingShots).forEach(([id, s]) => {
    if (s.uid === myUid) return;
    const t = (Date.now() - s.at) / 1000;
    if (t > BULLET_LIFETIME || processedShots.has(id)) return;
    const speed = Math.min(W, H) * 1.9;
    const bx = s.x + Math.cos(s.angle) * speed * t;
    const by = s.y + Math.sin(s.angle) * speed * t;
    if (me.hp > 0 && now > invulnUntil && dist({ x: bx, y: by }, me) < PR + BR) {
      processedShots.add(id);
      me.hp--; invulnUntil = now + INVULN_TIME;
      burst(bx, by, myColor);
      update(G(`players/${myUid}`), { hp: me.hp, alive: me.hp > 0 });
      if (me.hp <= 0) checkRoomWinner();
    }
  });

  // پخش موقعیت من
  if (!lastBroadcastTs || now - lastBroadcastTs > 0.09) {
    lastBroadcastTs = now;
    update(G(`players/${myUid}`), { x: me.x, y: me.y, angle: me.angle });
  }

  updateParticles(dt);
  updateHud();
}
let lastBroadcastTs = 0;

async function checkRoomWinner() {
  const allAlive = [me.hp > 0 ? myUid : null, ...Object.entries(others).filter(([, o]) => o.hp > 0).map(([uid]) => uid)].filter(Boolean);
  if (allAlive.length === 1) {
    await runTransaction(G("winner"), (curr) => (curr ? curr : allAlive[0]));
  }
}

// ---------- حلقه‌ی رندر ----------
let lastTime = null;
function loop(ts) {
  if (!running) return;
  if (lastTime === null) lastTime = ts;
  const dt = Math.min(0.05, (ts - lastTime) / 1000);
  lastTime = ts;
  const now = ts / 1000;

  if (!over) {
    if (isSolo) soloTick(dt, now);
    else roomTick(dt, now);
  }

  drawArena();
  if (isSolo) {
    if (ai.hp > 0) drawPlayer(ai, "#9B5CFF", "ربات", now < (ai.invulnUntil || 0));
    myShots.forEach((s) => {
      const t = now - s.at;
      const speed = Math.min(W, H) * 1.9;
      drawBullet(s.x + Math.cos(s.angle) * speed * t, s.y + Math.sin(s.angle) * speed * t, s.isAi ? "#9B5CFF" : "#4F7CFF");
    });
  } else {
    Object.entries(others).forEach(([uid, o]) => { if (o.hp > 0) drawPlayer(o, o.color, o.name, false); });
    Object.entries(incomingShots).forEach(([id, s]) => {
      const t = (Date.now() - s.at) / 1000;
      if (t > BULLET_LIFETIME) return;
      const speed = Math.min(W, H) * 1.9;
      drawBullet(s.x + Math.cos(s.angle) * speed * t, s.y + Math.sin(s.angle) * speed * t, s.uid === myUid ? myColor : (others[s.uid]?.color || "#fff"));
    });
  }
  if (me.hp > 0) drawPlayer(me, myColor, myName, now < invulnUntil);
  drawParticles();

  requestAnimationFrame(loop);
}

// ---------- جوی‌استیک و شلیک ----------
function setupJoystick() {
  const base = document.getElementById("joyBase");
  const knob = document.getElementById("joyKnob");
  let active = false, origin = { x: 0, y: 0 }, pointerId = null;

  function start(cx, cy) {
    active = true;
    const rect = base.getBoundingClientRect();
    origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  function move(cx, cy) {
    if (!active) return;
    let dx = cx - origin.x, dy = cy - origin.y;
    const max = base.getBoundingClientRect().width * 0.38;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joyVec = { x: dx / max, y: dy / max };
  }
  function end() { active = false; pointerId = null; knob.style.transform = "translate(0,0)"; joyVec = { x: 0, y: 0 }; }

  base.addEventListener("pointerdown", (e) => { e.preventDefault(); if (pointerId !== null) return; pointerId = e.pointerId; base.setPointerCapture(e.pointerId); start(e.clientX, e.clientY); move(e.clientX, e.clientY); });
  base.addEventListener("pointermove", (e) => { if (e.pointerId === pointerId) { e.preventDefault(); move(e.clientX, e.clientY); } });
  base.addEventListener("pointerup", (e) => { if (e.pointerId === pointerId) end(); });
  base.addEventListener("pointercancel", (e) => { if (e.pointerId === pointerId) end(); });
  base.style.touchAction = "none";
}

fireBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const now = performance.now() / 1000;
  if (over || (isSolo ? me.hp <= 0 : me.hp <= 0)) return;
  if (now - lastFire < FIRE_COOLDOWN) return;
  lastFire = now;
  if (isSolo) myShots.push({ x: me.x, y: me.y, angle: me.angle, at: now });
  else sendShot(me.x, me.y, me.angle);
});

// ---------- شروع ----------
async function startSolo() {
  modeNote.textContent = "تک‌نفره در برابر ربات";
  resizeCanvas();
  me = { x: W * 0.25, y: H / 2, angle: 0, hp: MAX_HP };
  ai = { x: W * 0.75, y: H / 2, angle: Math.PI, hp: MAX_HP, lastFire: 0, invulnUntil: 0 };
  myShots = [];
  running = true;
  updateHud();
  requestAnimationFrame(loop);
}

async function startRoom() {
  modeNote.textContent = "چندنفره آنلاین";
  resizeCanvas();

  const playersSnap = await get(R("players"));
  const roomPlayers = playersSnap.val() || {};
  const uids = Object.keys(roomPlayers).sort();
  const myIndex = uids.indexOf(myUid);
  myColor = COLORS[myIndex % COLORS.length] || COLORS[0];

  const spots = [{ x: W * 0.2, y: H * 0.3 }, { x: W * 0.8, y: H * 0.3 }, { x: W * 0.2, y: H * 0.7 }, { x: W * 0.8, y: H * 0.7 }];
  const spot = spots[myIndex % spots.length] || spots[0];
  me = { x: spot.x, y: spot.y, angle: 0, hp: MAX_HP };

  await set(G(`players/${myUid}`), { name: myName, x: me.x, y: me.y, angle: 0, hp: MAX_HP, alive: true, colorIndex: myIndex % COLORS.length });
  onDisconnect(G(`players/${myUid}`)).remove();

  unsubs.push(onValue(G("players"), (snap) => {
    const val = snap.val() || {};
    others = {};
    Object.entries(val).forEach(([uid, p]) => { if (uid !== myUid) others[uid] = { ...p, color: COLORS[p.colorIndex % COLORS.length] || COLORS[1] }; });
  }));

  unsubs.push(onValue(G("shots"), (snap) => {
    const val = snap.val() || {};
    incomingShots = val;
  }));

  unsubs.push(onValue(G("winner"), async (snap) => {
    const winnerUid = snap.val();
    if (winnerUid && !over) {
      over = true; running = false;
      const iWon = winnerUid === myUid;
      try { await recordRoundResult(myName, "gunball", { won: iWon }); } catch (e) {}
      showResult(iWon);
    }
  }));

  mountChat(myName, code);
  running = true;
  updateHud();
  requestAnimationFrame(loop);
}

async function init() {
  const user = await waitForUser();
  myName = getSavedName();
  if (!user || !myName) { window.location.href = "../index.html"; return; }
  myUid = currentUid();
  myColor = COLORS[0];
  setupJoystick();
  if (isSolo) await startSolo();
  else { if (!code) { window.location.href = "../index.html"; return; } await startRoom(); }
}
init();

window.addEventListener("beforeunload", () => { if (!isSolo && myUid) remove(G(`players/${myUid}`)); });
window.addEventListener("resize", () => { resizeCanvas(); });
