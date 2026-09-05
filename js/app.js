// app.js — هسته مشترک سایت: اتصال به Firebase، مدیریت نام بازیکن و توابع کمکی سشن

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase, ref, set, get, onValue, remove, update,
  serverTimestamp, increment, runTransaction, onDisconnect
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = getDatabase(app);

export const SESSION_ID = "main";
export const sessionRef = (path = "") =>
  ref(db, `sessions/${SESSION_ID}${path ? "/" + path : ""}`);

export { ref, set, get, onValue, remove, update, serverTimestamp, increment, runTransaction, onDisconnect };

export function ensureAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        resolve(user.uid);
      } else {
        signInAnonymously(auth).catch((e) => console.error("auth error", e));
      }
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
  await set(sessionRef(`players/${uid}`), {
    name,
    joinedAt: serverTimestamp()
  });
  onDisconnect(sessionRef(`players/${uid}`)).remove();
  onDisconnect(sessionRef(`votes/${uid}`)).remove();
  return uid;
}

export async function leaveLobby() {
  const uid = await ensureAuth();
  await remove(sessionRef(`players/${uid}`));
  await remove(sessionRef(`votes/${uid}`));
}

export const GAMES = [
  { id: "quiz", name: "کوییز اطلاعات عمومی", desc: "به سوالات جواب بده، سریع‌تر و درست‌تر بیشتر امتیاز می‌گیری" },
  { id: "reaction", name: "سرعت واکنش", desc: "وقتی رنگ سبز شد سریع‌تر از بقیه بزن" },
  { id: "memory", name: "بازی حافظه", desc: "دنباله رنگ‌ها رو حفظ کن و تکرار کن" }
];

export function profileRef(name, path = "") {
  const safe = encodeURIComponent(name);
  return ref(db, `profiles/${safe}${path ? "/" + path : ""}`);
}

export async function submitResult(gameId, uid, name, score) {
  await set(sessionRef(`results/${uid}`), { name, score, gameId });
}

export async function resetSessionForNextRound() {
  await runTransaction(sessionRef("currentGame"), (curr) => {
    if (curr === null) return curr;
    return null;
  });
  await set(sessionRef("votes"), null);
  await set(sessionRef("results"), null);
}

export async function recordRoundResult(name, gameId, { won }) {
  const base = profileRef(name);
  await runTransaction(base, (curr) => {
    curr = curr || { wins: 0, losses: 0, gamesPlayed: 0, byGame: {} };
    curr.gamesPlayed = (curr.gamesPlayed || 0) + 1;
    if (won) curr.wins = (curr.wins || 0) + 1;
    else curr.losses = (curr.losses || 0) + 1;
    curr.byGame = curr.byGame || {};
    const g = curr.byGame[gameId] || { wins: 0, plays: 0 };
    g.plays = (g.plays || 0) + 1;
    if (won) g.wins = (g.wins || 0) + 1;
    curr.byGame[gameId] = g;
    return curr;
  });
}
