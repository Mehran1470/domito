// app.js — هسته مشترک سایت: فایربیس، سشن، سکه/فروشگاه، چت

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase, ref, set, get, push, onValue, remove, update,
  serverTimestamp, runTransaction, onDisconnect
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = getDatabase(app);

export const SESSION_ID = "main";
export const sessionRef = (path = "") =>
  ref(db, `sessions/${SESSION_ID}${path ? "/" + path : ""}`);

export { ref, set, get, onValue, remove, update, serverTimestamp, runTransaction, onDisconnect };

export function ensureAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) resolve(user.uid);
      else signInAnonymously(auth).catch((e) => console.error("auth error", e));
    });
  });
}

export function getSavedName() {
  return localStorage.getItem("domito_name") || "";
}
export function saveName(name) {
  localStorage.setItem("domito_name", name);
}

export async function joinLobby(name) {
  const uid = await ensureAuth();
  saveName(name);
  await set(sessionRef(`players/${uid}`), { name, joinedAt: serverTimestamp() });
  onDisconnect(sessionRef(`players/${uid}`)).remove();
  onDisconnect(sessionRef(`votes/${uid}`)).remove();
  onDisconnect(sessionRef(`results/${uid}`)).remove();
  return uid;
}

export async function leaveLobby() {
  const uid = await ensureAuth();
  await remove(sessionRef(`players/${uid}`));
  await remove(sessionRef(`votes/${uid}`));
}

// ---------- بازی‌ها ----------
export const GAMES = [
  { id: "quiz", name: "کوییز اطلاعات عمومی", desc: "به سوالات جواب بده، درست‌تر بیشتر امتیاز می‌گیری" },
  { id: "reaction", name: "سرعت واکنش", desc: "وقتی رنگ سبز شد سریع‌تر از بقیه بزن" },
  { id: "memory", name: "بازی حافظه", desc: "دنباله رنگ‌ها رو حفظ کن و تکرار کن" },
  { id: "math", name: "اسپرینت ریاضی", desc: "سریع و درست حساب کن" },
  { id: "scramble", name: "حروف به‌هم‌ریخته", desc: "کلمه‌ی درست رو از بین گزینه‌ها پیدا کن" },
];

// ---------- پروفایل، سکه، فروشگاه ----------
const COIN_WIN = 15;
const COIN_PLAY = 5;

function blankProfile() {
  return { wins: 0, losses: 0, gamesPlayed: 0, byGame: {}, coins: 0, purchased: [], equippedTheme: "default" };
}

export function profileRef(name, path = "") {
  const safe = encodeURIComponent(name);
  return ref(db, `profiles/${safe}${path ? "/" + path : ""}`);
}

export async function submitResult(gameId, uid, name, score) {
  await set(sessionRef(`results/${uid}`), { name, score, gameId });
}

export async function resetSessionForNextRound() {
  await runTransaction(sessionRef("currentGame"), (curr) => (curr === null ? curr : null));
  await set(sessionRef("votes"), null);
  await set(sessionRef("results"), null);
}

export async function recordRoundResult(name, gameId, { won }) {
  await runTransaction(profileRef(name), (curr) => {
    curr = curr || blankProfile();
    curr.gamesPlayed = (curr.gamesPlayed || 0) + 1;
    curr.byGame = curr.byGame || {};
    curr.purchased = curr.purchased || [];
    curr.equippedTheme = curr.equippedTheme || "default";
    curr.coins = curr.coins || 0;
    if (won) {
      curr.wins = (curr.wins || 0) + 1;
      curr.coins += COIN_WIN;
    } else {
      curr.losses = (curr.losses || 0) + 1;
      curr.coins += COIN_PLAY;
    }
    const g = curr.byGame[gameId] || { wins: 0, plays: 0 };
    g.plays = (g.plays || 0) + 1;
    if (won) g.wins = (g.wins || 0) + 1;
    curr.byGame[gameId] = g;
    return curr;
  });
}

export const SHOP_ITEMS = [
  { id: "theme-sunset", name: "تم غروب", price: 30, colors: ["#FF7A59", "#FFC845"] },
  { id: "theme-ocean", name: "تم اقیانوس", price: 30, colors: ["#4FD1FF", "#7C4DFF"] },
  { id: "theme-forest", name: "تم جنگل", price: 30, colors: ["#4CD97B", "#1F9E56"] },
  { id: "theme-gold", name: "تم طلایی ویژه", price: 60, colors: ["#FFD700", "#FF8C00"] },
];

export async function buyItem(name, itemId) {
  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) return { ok: false, reason: "not-found" };
  let result = { ok: false, reason: "unknown" };
  await runTransaction(profileRef(name), (curr) => {
    curr = curr || blankProfile();
    curr.purchased = curr.purchased || [];
    curr.coins = curr.coins || 0;
    if (curr.purchased.includes(itemId)) { result = { ok: false, reason: "owned" }; return curr; }
    if (curr.coins < item.price) { result = { ok: false, reason: "insufficient" }; return curr; }
    curr.coins -= item.price;
    curr.purchased.push(itemId);
    result = { ok: true };
    return curr;
  });
  return result;
}

export async function equipTheme(name, itemId) {
  await runTransaction(profileRef(name), (curr) => {
    curr = curr || blankProfile();
    curr.equippedTheme = itemId;
    return curr;
  });
}

// ---------- چت عمومی (سراسری، مستقل از دور بازی) ----------
export function chatRef(path = "") {
  return ref(db, `chat${path ? "/" + path : ""}`);
}

export async function sendChatMessage(name, text) {
  const clean = String(text).slice(0, 200).trim();
  if (!clean) return;
  const msgsRef = chatRef("messages");
  await push(msgsRef, { name, text: clean, at: Date.now() });
  try {
    const snap = await get(msgsRef);
    const val = snap.val() || {};
    const keys = Object.keys(val);
    if (keys.length > 60) {
      const sorted = keys.sort((a, b) => (val[a].at || 0) - (val[b].at || 0));
      const toRemove = sorted.slice(0, keys.length - 60);
      for (const k of toRemove) await remove(chatRef(`messages/${k}`));
    }
  } catch (e) { /* trimming is best-effort */ }
}

export function listenChat(callback) {
  return onValue(chatRef("messages"), (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (a.at || 0) - (b.at || 0));
    callback(list);
  });
}
