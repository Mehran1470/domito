import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase, ref, set, get, push, onValue, remove, update,
  serverTimestamp, runTransaction, onDisconnect
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = getDatabase(app);

export { ref, set, get, onValue, remove, update, serverTimestamp, runTransaction, onDisconnect, push };

// ---------- احراز هویت ----------
function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@domito.local`;
}

export function getSavedName() { return localStorage.getItem("domito_name") || ""; }
export function saveName(name) { localStorage.setItem("domito_name", name); }

export async function registerUser(username, password) {
  const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(username), password);
  saveName(username);
  setPresence(username, true);
  return cred.user;
}

export async function loginUser(username, password) {
  const cred = await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
  saveName(username);
  setPresence(username, true);
  return cred.user;
}

export async function logoutUser() {
  const name = getSavedName();
  if (name) await setPresence(name, false);
  localStorage.removeItem("domito_name");
  localStorage.removeItem("domito_room");
  await signOut(auth);
}

export function waitForUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => { unsub(); resolve(user); });
  });
}

export function currentUid() {
  return auth.currentUser ? auth.currentUser.uid : null;
}

// ---------- حضور آنلاین ----------
export async function setPresence(name, online) {
  const pRef = ref(db, `profiles/${encodeURIComponent(name)}/presence`);
  await update(pRef, { online, lastSeen: Date.now() });
  if (online) onDisconnect(pRef).update({ online: false, lastSeen: Date.now() });
}

// ---------- اتاق‌ها ----------
function randomRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function getSavedRoom() { return localStorage.getItem("domito_room") || ""; }
export function saveRoom(code) { localStorage.setItem("domito_room", code); }
export function clearRoom() { localStorage.removeItem("domito_room"); }

export function roomRef(code, path = "") {
  return ref(db, `rooms/${code}${path ? "/" + path : ""}`);
}

export async function createRoom() {
  const code = randomRoomCode();
  await set(roomRef(code, "meta"), { createdAt: serverTimestamp() });
  saveRoom(code);
  return code;
}

export async function joinRoomByCode(rawCode) {
  const code = rawCode.trim().toUpperCase();
  const snap = await get(roomRef(code, "meta"));
  if (!snap.exists()) return { ok: false, reason: "not-found" };
  saveRoom(code);
  return { ok: true, code };
}

export async function joinLobby(name) {
  const code = getSavedRoom();
  const uid = currentUid();
  await set(roomRef(code, `players/${uid}`), { name, joinedAt: serverTimestamp() });
  onDisconnect(roomRef(code, `players/${uid}`)).remove();
  onDisconnect(roomRef(code, `votes/${uid}`)).remove();
  onDisconnect(roomRef(code, `results/${uid}`)).remove();
  return uid;
}

export async function leaveLobby() {
  const code = getSavedRoom();
  const uid = currentUid();
  await remove(roomRef(code, `players/${uid}`));
  await remove(roomRef(code, `votes/${uid}`));
}

// ---------- بازی‌ها ----------
export const GAMES = [
  { id: "quiz", name: "کوییز اطلاعات عمومی", desc: "به سوالات جواب بده، درست‌تر بیشتر امتیاز می‌گیری", icon: "❓", soloThreshold: 30 },
  { id: "reaction", name: "سرعت واکنش", desc: "وقتی رنگ سبز شد سریع‌تر از بقیه بزن", icon: "⚡", soloThreshold: 500 },
  { id: "memory", name: "بازی حافظه", desc: "دنباله رنگ‌ها رو حفظ کن و تکرار کن", icon: "🧠", soloThreshold: 3 },
  { id: "math", name: "اسپرینت ریاضی", desc: "سریع و درست حساب کن", icon: "🔢", soloThreshold: 40 },
  { id: "scramble", name: "حروف به‌هم‌ریخته", desc: "کلمه‌ی درست رو از بین گزینه‌ها پیدا کن", icon: "🔤", soloThreshold: 30 },
  { id: "typing", name: "سرعت تایپ", desc: "جمله رو با دقت و سریع تایپ کن", icon: "⌨️", soloThreshold: 60 },
  { id: "snake", name: "بازی مار", desc: "غذا بخور، بزرگ شو، به خودت نخور", icon: "🐍", soloThreshold: 8 },
];

export function soloWon(gameId, score) {
  const g = GAMES.find((x) => x.id === gameId);
  return g ? score >= g.soloThreshold : false;
}

// ---------- پروفایل، سکه، فروشگاه ----------
const COIN_WIN = 15;
const COIN_PLAY = 5;

function blankProfile() {
  return { wins: 0, losses: 0, gamesPlayed: 0, byGame: {}, coins: 0, purchased: [], equippedTheme: "default", claimedMissions: [], friends: {}, friendRequests: {} };
}

export function profileRef(name, path = "") {
  const safe = encodeURIComponent(name);
  return ref(db, `profiles/${safe}${path ? "/" + path : ""}`);
}

export async function getPublicProfile(name) {
  const snap = await get(profileRef(name));
  if (!snap.exists()) return null;
  return snap.val();
}

export function listenProfile(name, callback) {
  return onValue(profileRef(name), (snap) => callback(snap.val()));
}

export async function submitResult(gameId, uid, name, score) {
  const code = getSavedRoom();
  await set(roomRef(code, `results/${uid}`), { name, score, gameId });
}

export async function resetSessionForNextRound() {
  const code = getSavedRoom();
  await runTransaction(roomRef(code, "currentGame"), (curr) => (curr === null ? curr : null));
  await set(roomRef(code, "votes"), null);
  await set(roomRef(code, "results"), null);
}

export async function logTransaction(name, { type, amount, note }) {
  await push(ref(db, `profiles/${encodeURIComponent(name)}/transactions`), { type, amount, note, at: Date.now() });
}

export async function getTransactions(name, limitN = 20) {
  const snap = await get(ref(db, `profiles/${encodeURIComponent(name)}/transactions`));
  const val = snap.val() || {};
  const list = Object.values(val).sort((a, b) => (b.at || 0) - (a.at || 0));
  return list.slice(0, limitN);
}

export async function recordRoundResult(name, gameId, { won }) {
  await runTransaction(profileRef(name), (curr) => {
    curr = curr || blankProfile();
    curr.gamesPlayed = (curr.gamesPlayed || 0) + 1;
    curr.byGame = curr.byGame || {};
    curr.purchased = curr.purchased || [];
    curr.equippedTheme = curr.equippedTheme || "default";
    curr.coins = curr.coins || 0;
    if (won) { curr.wins = (curr.wins || 0) + 1; curr.coins += COIN_WIN; }
    else { curr.losses = (curr.losses || 0) + 1; curr.coins += COIN_PLAY; }
    const g = curr.byGame[gameId] || { wins: 0, plays: 0 };
    g.plays = (g.plays || 0) + 1;
    if (won) g.wins = (g.wins || 0) + 1;
    curr.byGame[gameId] = g;
    return curr;
  });
  await logTransaction(name, { type: won ? "win" : "play", amount: won ? COIN_WIN : COIN_PLAY, note: won ? "برد در بازی" : "شرکت در بازی" });
}

export const SHOP_ITEMS = [
  { id: "theme-sunset", name: "تم غروب", price: 30, colors: ["#FF7A59", "#FFC845"] },
  { id: "theme-ocean", name: "تم اقیانوس", price: 30, colors: ["#4FD1FF", "#7C4DFF"] },
  { id: "theme-forest", name: "تم جنگل", price: 30, colors: ["#4CD97B", "#1F9E56"] },
  { id: "theme-gold", name: "تم طلایی", price: 60, colors: ["#FFD700", "#FF8C00"] },
  { id: "theme-neon", name: "تم نئون", price: 80, colors: ["#39FF14", "#00E5FF"] },
  { id: "theme-galaxy", name: "تم کهکشانی", price: 120, colors: ["#7C4DFF", "#FF4F81"] },
  { id: "theme-fire", name: "تم آتشین", price: 150, colors: ["#FF3D00", "#FFC107"] },
  { id: "theme-royal", name: "تم سلطنتی", price: 250, colors: ["#5B2C82", "#D4AF37"] },
  { id: "theme-diamond", name: "تم الماس", price: 500, colors: ["#B9F2FF", "#5FD3F3"] },
  { id: "theme-legend", name: "تم افسانه‌ای", price: 1000, colors: ["#FFD700", "#FF1744"] },
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
  if (result.ok) await logTransaction(name, { type: "purchase", amount: -item.price, note: `خرید ${item.name}` });
  return result;
}

export async function equipTheme(name, itemId) {
  await runTransaction(profileRef(name), (curr) => {
    curr = curr || blankProfile();
    curr.equippedTheme = itemId;
    return curr;
  });
}

// ---------- ماموریت‌ها ----------
export const MISSIONS = [
  { id: "m-play3", label: "۳ بازی انجام بده", reward: 20, target: 3, statKey: "gamesPlayed" },
  { id: "m-win1", label: "یه برد کسب کن", reward: 30, target: 1, statKey: "wins" },
  { id: "m-play10", label: "۱۰ بازی انجام بده", reward: 60, target: 10, statKey: "gamesPlayed" },
];

export async function claimMission(name, missionId) {
  const mission = MISSIONS.find((m) => m.id === missionId);
  if (!mission) return { ok: false };
  let result = { ok: false };
  await runTransaction(profileRef(name), (curr) => {
    curr = curr || blankProfile();
    curr.claimedMissions = curr.claimedMissions || [];
    if (curr.claimedMissions.includes(missionId)) { result = { ok: false, reason: "claimed" }; return curr; }
    const progressVal = curr[mission.statKey] || 0;
    if (progressVal < mission.target) { result = { ok: false, reason: "incomplete" }; return curr; }
    curr.coins = (curr.coins || 0) + mission.reward;
    curr.claimedMissions.push(missionId);
    result = { ok: true, reward: mission.reward };
    return curr;
  });
  if (result.ok) await logTransaction(name, { type: "mission", amount: result.reward, note: mission.label });
  return result;
}

// ---------- دوستان (با درخواست/تایید) ----------
export async function sendFriendRequest(myName, targetName) {
  targetName = targetName.trim();
  if (!targetName || targetName === myName) return { ok: false, reason: "invalid" };
  const targetSnap = await get(profileRef(targetName));
  if (!targetSnap.exists()) return { ok: false, reason: "not-found" };
  const targetVal = targetSnap.val() || {};
  if (targetVal.friends && targetVal.friends[myName]) return { ok: false, reason: "already-friends" };
  await update(profileRef(targetName, "friendRequests"), { [myName]: Date.now() });
  return { ok: true };
}

export function listenFriendRequests(myName, callback) {
  return onValue(profileRef(myName, "friendRequests"), (snap) => {
    const val = snap.val() || {};
    callback(Object.keys(val));
  });
}

export async function acceptFriendRequest(myName, fromName) {
  await update(profileRef(myName, "friends"), { [fromName]: true });
  await update(profileRef(fromName, "friends"), { [myName]: true });
  await remove(profileRef(myName, `friendRequests/${fromName}`));
}

export async function rejectFriendRequest(myName, fromName) {
  await remove(profileRef(myName, `friendRequests/${fromName}`));
}

export function listenFriends(myName, callback) {
  return onValue(profileRef(myName, "friends"), async (snap) => {
    const val = snap.val() || {};
    const names = Object.keys(val);
    const results = [];
    for (const n of names) {
      const pSnap = await get(profileRef(n, "presence"));
      const presence = pSnap.val() || { online: false, lastSeen: 0 };
      results.push({ name: n, online: !!presence.online });
    }
    callback(results);
  });
}

export async function inviteFriendToRoom(myName, friendName, roomCode) {
  await push(ref(db, `profiles/${encodeURIComponent(friendName)}/invites`), { from: myName, roomCode, at: Date.now() });
}

export function listenInvites(myName, callback) {
  return onValue(ref(db, `profiles/${encodeURIComponent(myName)}/invites`), (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.at - a.at);
    callback(list);
  });
}

export async function dismissInvite(myName, inviteId) {
  await remove(ref(db, `profiles/${encodeURIComponent(myName)}/invites/${inviteId}`));
}

// ---------- چت ----------
export function chatRef(code, path = "") {
  return ref(db, `rooms/${code}/chat${path ? "/" + path : ""}`);
}

export async function sendChatMessage(code, name, text) {
  const clean = String(text).slice(0, 200).trim();
  if (!clean) return;
  const msgsRef = chatRef(code, "messages");
  await push(msgsRef, { name, text: clean, at: Date.now() });
  try {
    const snap = await get(msgsRef);
    const val = snap.val() || {};
    const keys = Object.keys(val);
    if (keys.length > 60) {
      const sorted = keys.sort((a, b) => (val[a].at || 0) - (val[b].at || 0));
      for (const k of sorted.slice(0, keys.length - 60)) await remove(chatRef(code, `messages/${k}`));
    }
  } catch (e) {}
}

export function listenChat(code, callback) {
  return onValue(chatRef(code, "messages"), (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, v]) => ({ id, ...v })).sort((a, b) => (a.at || 0) - (b.at || 0));
    callback(list);
  });
}

// ---------- لیدربورد ----------
export async function getLeaderboard(limitN = 5) {
  const snap = await get(ref(db, "profiles"));
  const val = snap.val() || {};
  const list = Object.entries(val).map(([encodedName, p]) => ({
    name: decodeURIComponent(encodedName),
    wins: p.wins || 0,
  }));
  list.sort((a, b) => b.wins - a.wins);
  return list.slice(0, limitN);
  }
