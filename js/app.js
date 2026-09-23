import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  getDatabase,
  ref,
  set,
  get,
  push,
  onValue,
  remove,
  update,
  serverTimestamp,
  runTransaction,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

// ============================================================
// Firebase
// ============================================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = getDatabase(app);

export {
  ref,
  set,
  get,
  onValue,
  remove,
  update,
  serverTimestamp,
  runTransaction,
  onDisconnect,
  push
};

// ============================================================
// احراز هویت
// ============================================================

function usernameToEmail(username) {
  return `${String(username || "").trim().toLowerCase()}@domito.local`;
}

export function getSavedName() {
  return localStorage.getItem("domito_name") || "";
}

export function saveName(name) {
  localStorage.setItem(
    "domito_name",
    String(name || "").trim()
  );
}

// ============================================================
// پروفایل
// ============================================================

function blankProfile() {
  return {
    wins: 0,
    losses: 0,
    gamesPlayed: 0,
    byGame: {},
    coins: 0,
    purchased: [],
    equippedTheme: "default",
    claimedMissions: [],
    friends: {},
    friendRequests: {},
    lastLogin: 0
  };
}

export function profileRef(name, path = "") {
  const safe = encodeURIComponent(
    String(name || "")
  );

  return ref(
    db,
    `profiles/${safe}${path ? "/" + path : ""}`
  );
}

async function ensureProfile(username) {
  const pRef = profileRef(username);
  const snap = await get(pRef);

  if (!snap.exists()) {
    await set(
      pRef,
      blankProfile()
    );
  }
}

export async function ensureOwnerLinks(
  username,
  uid
) {
  const ownerRef = ref(
    db,
    `profiles/${encodeURIComponent(username)}/ownerUid`
  );

  const snap = await get(ownerRef);

  if (!snap.exists()) {
    await set(
      ownerRef,
      uid
    );
  }

  await set(
    ref(
      db,
      `uidToName/${uid}`
    ),
    username
  );

  await ensureProfile(username);
}

// ============================================================
// ثبت آخرین ورود
// ============================================================


async function updateLastLogin(username) {
  username = String(
    username || ""
  ).trim();

  if (!username) {
    return;
  }

  try {
    const now = Date.now();

    await update(
      profileRef(username),
      {
        lastLogin: now
      }
    );

    console.log(
      "LAST LOGIN UPDATED:",
      username,
      now
    );

  } catch (e) {
    console.warn(
      "Last login update error:",
      e
    );
  }
}

// ============================================================
// Presence
// ============================================================

let presenceConnectionRef = null;
let presenceConnectionName = "";
let presenceConnectedUnsubscribe = null;

function presenceRootRef(name) {
  return ref(
    db,
    `profiles/${encodeURIComponent(name)}/presence`
  );
}

function presenceConnectionsRef(name) {
  return ref(
    db,
    `profiles/${encodeURIComponent(name)}/presence/connections`
  );
}

async function cleanupPresenceConnection() {
  if (!presenceConnectionRef) {
    return;
  }

  try {
    await remove(
      presenceConnectionRef
    );
  } catch (e) {
    console.warn(
      "Presence connection cleanup error:",
      e
    );
  }

  presenceConnectionRef = null;
  presenceConnectionName = "";
}

export async function setPresence(
  name,
  online
) {
  name = String(
    name || ""
  ).trim();

  if (!name) {
    return;
  }

  const pRef = presenceRootRef(name);

  // ==========================================================
  // خروج از دومیتو
  // ==========================================================

  if (!online) {
    if (
      presenceConnectedUnsubscribe &&
      typeof presenceConnectedUnsubscribe === "function"
    ) {
      try {
        presenceConnectedUnsubscribe();
      } catch {}

      presenceConnectedUnsubscribe = null;
    }

    await cleanupPresenceConnection();

    // lastSeen = آخرین حضور واقعی در دومیتو
    // زمان توسط سرور Firebase ثبت می‌شود.
    await update(
      pRef,
      {
        online: false,
        lastSeen: serverTimestamp()
      }
    );

    return;
  }

  // ==========================================================
  // ورود / Auto Login
  // ==========================================================

  if (
    presenceConnectionRef &&
    presenceConnectionName === name
  ) {
    return;
  }

  await cleanupPresenceConnection();

  const connection = push(
    presenceConnectionsRef(name)
  );

  presenceConnectionRef = connection;
  presenceConnectionName = name;

  // اگر اتصال ناگهانی قطع شد،
  // Firebase خودش connection را حذف می‌کند.
  await onDisconnect(
    connection
  ).remove();

  await set(
    connection,
    {
      online: true,
      connectedAt: serverTimestamp()
    }
  );

  await update(
    pRef,
    {
      online: true,
      lastSeen: serverTimestamp()
    }
  );
}

// ============================================================
// ثبت نام
// ============================================================

export async function registerUser(
  username,
  password
) {
  username = String(
    username || ""
  ).trim();

  if (
    !username ||
    !password
  ) {
    throw new Error(
      "invalid-credentials"
    );
  }

  const cred =
    await createUserWithEmailAndPassword(
      auth,
      usernameToEmail(username),
      password
    );

  saveName(username);

  await ensureOwnerLinks(
    username,
    cred.user.uid
  );

  await updateLastLogin(
    username
  );

  await setPresence(
    username,
    true
  );

  return cred.user;
}

// ============================================================
// ورود دستی
// ============================================================

export async function loginUser(
  username,
  password
) {
  username = String(
    username || ""
  ).trim();

  if (
    !username ||
    !password
  ) {
    throw new Error(
      "invalid-credentials"
    );
  }

  const cred =
    await signInWithEmailAndPassword(
      auth,
      usernameToEmail(username),
      password
    );

  saveName(username);

  await ensureOwnerLinks(
    username,
    cred.user.uid
  );

  await updateLastLogin(
    username
  );

  await setPresence(
    username,
    true
  );

  return cred.user;
}

// ============================================================
// خروج
// ============================================================

export async function logoutUser() {
  const name = getSavedName();

  if (name) {
    try {
      await setPresence(
        name,
        false
      );
    } catch (e) {
      console.warn(
        "Presence logout error:",
        e
      );
    }
  }

  localStorage.removeItem(
    "domito_name"
  );

  localStorage.removeItem(
    "domito_room"
  );

  await signOut(auth);
}

// ============================================================
// وضعیت کاربر + Auto Login
// ============================================================

export function waitForUser() {
  return new Promise(
    (resolve) => {
      let finished = false;

      const unsubscribe =
        onAuthStateChanged(
          auth,
          async (user) => {
            if (finished) {
              return;
            }

            finished = true;

            try {
              unsubscribe();
            } catch {}

            if (!user) {
              resolve(null);
              return;
            }

            let username =
              getSavedName();

            if (!username) {
              try {
                const nameSnap =
                  await get(
                    ref(
                      db,
                      `uidToName/${user.uid}`
                    )
                  );

                if (
                  nameSnap.exists()
                ) {
                  username = String(
                    nameSnap.val() || ""
                  ).trim();

                  if (username) {
                    saveName(username);
                  }
                }
              } catch (e) {
                console.warn(
                  "Auto login username lookup error:",
                  e
                );
              }
            }

             
            }
            resolve(user);if (username) {
  try {
    await ensureOwnerLinks(
      username,
      user.uid
    );

    await updateLastLogin(
      username
    );

    await setPresence(
      username,
      true
    );

  } catch (e) {
    console.warn(
      "Auto login update error:",
      e
    );
  }
      }
          }
        );
    }
  );
}

export function currentUid() {
  return auth.currentUser
    ? auth.currentUser.uid
    : null;
}

// ============================================================
// اتاق‌ها
// ============================================================

function randomRoomCode() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (
    let i = 0;
    i < 5;
    i++
  ) {
    code +=
      chars[
        Math.floor(
          Math.random() *
            chars.length
        )
      ];
  }

  return code;
}

export function getSavedRoom() {
  return (
    localStorage.getItem(
      "domito_room"
    ) || ""
  );
}

export function saveRoom(code) {
  localStorage.setItem(
    "domito_room",
    String(code || "")
      .trim()
      .toUpperCase()
  );
}

export function clearRoom() {
  localStorage.removeItem(
    "domito_room"
  );
}

export function roomRef(
  code,
  path = ""
) {
  code = String(
    code || ""
  )
    .trim()
    .toUpperCase();

  return ref(
    db,
    `rooms/${code}${path ? "/" + path : ""}`
  );
}

// ============================================================
// ساخت اتاق
// ============================================================

export async function createRoom() {
  const uid = currentUid();
  const name = getSavedName();

  if (
    !uid ||
    !name
  ) {
    throw new Error(
      "not-authenticated"
    );
  }

  let code = null;

  for (
    let i = 0;
    i < 10;
    i++
  ) {
    const candidate =
      randomRoomCode();

    const snap =
      await get(
        roomRef(
          candidate,
          "meta"
        )
      );

    if (!snap.exists()) {
      code = candidate;
      break;
    }
  }

  if (!code) {
    throw new Error(
      "room-code-generation-failed"
    );
  }

  await set(
    roomRef(
      code,
      "meta"
    ),
    {
      createdAt:
        serverTimestamp(),
      ownerUid: uid,
      ownerName: name
    }
  );

  saveRoom(code);

  return code;
}

// ============================================================
// اطلاعات صاحب اتاق
// ============================================================

export async function getRoomMeta(
  code = getSavedRoom()
) {
  if (!code) {
    return null;
  }

  const snap =
    await get(
      roomRef(
        code,
        "meta"
      )
    );

  return snap.exists()
    ? snap.val()
    : null;
}

export async function isRoomOwner(
  code = getSavedRoom()
) {
  const uid = currentUid();

  if (
    !uid ||
    !code
  ) {
    return false;
  }

  const meta =
    await getRoomMeta(code);

  return !!(
    meta &&
    meta.ownerUid === uid
  );
}

// ============================================================
// ورود به اتاق
// ============================================================

export async function joinRoomByCode(
  rawCode
) {
  const code = String(
    rawCode || ""
  )
    .trim()
    .toUpperCase();

  if (!code) {
    return {
      ok: false,
      reason: "invalid-code"
    };
  }

  const metaSnap =
    await get(
      roomRef(
        code,
        "meta"
      )
    );

  if (!metaSnap.exists()) {
    return {
      ok: false,
      reason: "not-found"
    };
  }

  const uid = currentUid();

  if (uid) {
    const kickedSnap =
      await get(
        roomRef(
          code,
          `kicked/${uid}`
        )
      );

    if (kickedSnap.exists()) {
      return {
        ok: false,
        reason: "kicked"
      };
    }
  }

  saveRoom(code);

  return {
    ok: true,
    code
  };
}

// ============================================================
// بررسی Kick
// ============================================================

export async function checkKicked(
  code = getSavedRoom(),
  uid = currentUid()
) {
  if (
    !code ||
    !uid
  ) {
    return false;
  }

  const snap =
    await get(
      roomRef(
        code,
        `kicked/${uid}`
      )
    );

  return snap.exists();
}

// ============================================================
// شنیدن وضعیت Kick
// ============================================================

export function listenKickStatus(
  code = getSavedRoom(),
  callback
) {
  const uid = currentUid();

  if (
    !code ||
    !uid ||
    typeof callback !== "function"
  ) {
    return () => {};
  }

  return onValue(
    roomRef(
      code,
      `kicked/${uid}`
    ),
    (snap) => {
      callback(
        snap.exists()
          ? snap.val()
          : null
      );
    }
  );
}

// ============================================================
// Kick کردن عضو
// ============================================================

export async function kickMember(
  targetUid
) {
  const code = getSavedRoom();
  const uid = currentUid();

  targetUid = String(
    targetUid || ""
  ).trim();

  if (!code) {
    throw new Error(
      "no-room"
    );
  }

  if (!uid) {
    throw new Error(
      "not-authenticated"
    );
  }

  if (!targetUid) {
    throw new Error(
      "invalid-target"
    );
  }

  if (targetUid === uid) {
    throw new Error(
      "cannot-kick-self"
    );
  }

  const meta =
    await getRoomMeta(code);

  if (!meta) {
    throw new Error(
      "room-not-found"
    );
  }

  if (meta.ownerUid !== uid) {
    throw new Error(
      "not-room-owner"
    );
  }

  const targetSnap =
    await get(
      roomRef(
        code,
        `players/${targetUid}`
      )
    );

  if (!targetSnap.exists()) {
    throw new Error(
      "player-not-found"
    );
  }

  await set(
    roomRef(
      code,
      `kicked/${targetUid}`
    ),
    {
      by: uid,
      byName:
        meta.ownerName ||
        getSavedName(),
      at: serverTimestamp()
    }
  );

  await remove(
    roomRef(
      code,
      `players/${targetUid}`
    )
  );

  await remove(
    roomRef(
      code,
      `votes/${targetUid}`
    )
  );

  await remove(
    roomRef(
      code,
      `results/${targetUid}`
    )
  );

  return {
    ok: true,
    uid: targetUid
  };
}

// ============================================================
// ورود بازیکن به لابی
// ============================================================

export async function joinLobby(
  name
) {
  const code = getSavedRoom();
  const uid = currentUid();

  name = String(
    name || getSavedName()
  ).trim();

  if (!code) {
    throw new Error(
      "no-room"
    );
  }

  if (!uid) {
    throw new Error(
      "not-authenticated"
    );
  }

  if (!name) {
    throw new Error(
      "invalid-name"
    );
  }

  const kicked =
    await checkKicked(
      code,
      uid
    );

  if (kicked) {
    throw new Error(
      "kicked"
    );
  }

  const meta =
    await getRoomMeta(code);

  if (!meta) {
    throw new Error(
      "room-not-found"
    );
  }

  await set(
    roomRef(
      code,
      `players/${uid}`
    ),
    {
      name,
      joinedAt:
        serverTimestamp()
    }
  );

  await onDisconnect(
    roomRef(
      code,
      `players/${uid}`
    )
  ).remove();

  await onDisconnect(
    roomRef(
      code,
      `votes/${uid}`
    )
  ).remove();

  await onDisconnect(
    roomRef(
      code,
      `results/${uid}`
    )
  ).remove();

  return uid;
}

// ============================================================
// خروج از لابی
// ============================================================

export async function leaveLobby() {
  const code = getSavedRoom();
  const uid = currentUid();

  if (
    !code ||
    !uid
  ) {
    return;
  }

  await remove(
    roomRef(
      code,
      `players/${uid}`
    )
  );

  await remove(
    roomRef(
      code,
      `votes/${uid}`
    )
  );

  await remove(
    roomRef(
      code,
      `results/${uid}`
    )
  );
}

// ============================================================
// بازی‌ها
// ============================================================

export const GAMES = [
  {
    id: "quiz",
    name: "کوییز اطلاعات عمومی",
    desc: "به سوالات جواب بده، درست‌تر بیشتر امتیاز می‌گیری",
    icon: "❓",
    soloThreshold: 30
  },

  {
    id: "reaction",
    name: "سرعت واکنش",
    desc: "وقتی رنگ سبز شد سریع‌تر از بقیه بزن",
    icon: "⚡",
    soloThreshold: 500
  },

  {
    id: "memory",
    name: "بازی حافظه",
    desc: "دنباله رنگ‌ها رو حفظ کن و تکرار کن",
    icon: "🧠",
    soloThreshold: 3
  },

  {
    id: "math",
    name: "اسپرینت ریاضی",
    desc: "سریع و درست حساب کن",
    icon: "🔢",
    soloThreshold: 40
  },

  {
    id: "scramble",
    name: "حروف به‌هم‌ریخته",
    desc: "کلمه‌ی درست رو از بین گزینه‌ها پیدا کن",
    icon: "🔤",
    soloThreshold: 30
  },

  {
    id: "typing",
    name: "سرعت تایپ",
    desc: "جمله رو با دقت و سریع تایپ کن",
    icon: "⌨️",
    soloThreshold: 60
  },

  {
    id: "snake",
    name: "بازی مار",
    desc: "غذا بخور، بزرگ شو، به خودت نخور",
    icon: "🐍",
    soloThreshold: 8
  },

  {
    id: "astra",
    name: "دومیتو استرا",
    desc: "تسخیر تایل‌های فضایی، کمبو بگیر، ربات رو شکست بده",
    icon: "🚀",
    soloThreshold: 1
  },

  {
    id: "gunball",
    name: "توپ تفنگ",
    desc: "حریف رو با تیراندازی از میدون به در کن، ۳ قلب داری",
    icon: "🔫",
    soloThreshold: 1
  },

  {
    id: "lightpuzzle",
    name: "پازل نوری",
    desc: "آینه، لنز و منشور را بچین و نور را به هدف‌ها برسان",
    icon: "💡",
    soloThreshold: 1
  },


 
];
export function soloWon(
  gameId,
  score
) {
  const game =
    GAMES.find(
      x => x.id === gameId
    );

  return game
    ? score >= game.soloThreshold
    : false;
}

// ============================================================
// پروفایل عمومی
// ============================================================

export async function getPublicProfile(
  name
) {
  const snap =
    await get(
      profileRef(name)
    );

  if (!snap.exists()) {
    return null;
  }

  return snap.val();
}

export function listenProfile(
  name,
  callback
) {
  return onValue(
    profileRef(name),
    snap => {
      callback(
        snap.val()
      );
    }
  );
}

// ============================================================
// نتیجه بازی
// ============================================================

export async function submitResult(
  gameId,
  uid,
  name,
  score
) {
  const code = getSavedRoom();

  if (!code) {
    throw new Error(
      "no-room"
    );
  }

  if (!uid) {
    throw new Error(
      "not-authenticated"
    );
  }

  await set(
    roomRef(
      code,
      `results/${uid}`
    ),
    {
      name,
      score,
      gameId
    }
  );
}

// ============================================================
// ریست دور
// ============================================================

export async function resetSessionForNextRound() {
  const code = getSavedRoom();

  if (!code) {
    return;
  }

  await set(
    roomRef(
      code,
      "currentGame"
    ),
    null
  );

  await set(
    roomRef(
      code,
      "votes"
    ),
    null
  );

  await set(
    roomRef(
      code,
      "results"
    ),
    null
  );
}

// ============================================================
// تراکنش‌های سکه
// ============================================================

export async function logTransaction(
  name,
  {
    type,
    amount,
    note
  }
) {
  await push(
    ref(
      db,
      `profiles/${encodeURIComponent(name)}/transactions`
    ),
    {
      type,
      amount,
      note,
      at: Date.now()
    }
  );
}

export async function getTransactions(
  name,
  limitN = 20
) {
  const snap =
    await get(
      ref(
        db,
        `profiles/${encodeURIComponent(name)}/transactions`
      )
    );

  const val =
    snap.val() || {};

  const list =
    Object.values(val)
      .sort(
        (a, b) =>
          (b.at || 0) -
          (a.at || 0)
      );

  return list.slice(
    0,
    limitN
  );
}

// ============================================================
// ثبت نتیجه دور و سکه
// ============================================================

const COIN_WIN = 15;
const COIN_PLAY = 5;

export async function recordRoundResult(
  name,
  gameId,
  { won }
) {
  await runTransaction(
    profileRef(name),
    curr => {
      curr =
        curr ||
        blankProfile();

      curr.wins =
        curr.wins || 0;

      curr.losses =
        curr.losses || 0;

      curr.gamesPlayed =
        curr.gamesPlayed || 0;

      curr.byGame =
        curr.byGame || {};

      curr.purchased =
        curr.purchased || [];

      curr.equippedTheme =
        curr.equippedTheme ||
        "default";

      curr.claimedMissions =
        curr.claimedMissions || [];

      curr.friends =
        curr.friends || {};

      curr.friendRequests =
        curr.friendRequests || {};

      curr.coins =
        curr.coins || 0;

      curr.lastLogin =
        curr.lastLogin || 0;

      curr.gamesPlayed++;

      if (won) {
        curr.wins++;
        curr.coins +=
          COIN_WIN;
      } else {
        curr.losses++;
        curr.coins +=
          COIN_PLAY;
      }

      const game =
        curr.byGame[gameId] || {
          wins: 0,
          plays: 0
        };

      game.plays++;

      if (won) {
        game.wins++;
      }

      curr.byGame[gameId] =
        game;

      return curr;
    }
  );

  await logTransaction(
    name,
    {
      type:
        won
          ? "win"
          : "play",

      amount:
        won
          ? COIN_WIN
          : COIN_PLAY,

      note:
        won
          ? "برد در بازی"
          : "شرکت در بازی"
    }
  );
}

// ============================================================
// فروشگاه
// ============================================================

export const SHOP_ITEMS = [
  {
    id: "theme-sunset",
    name: "تم غروب",
    price: 30,
    colors: [
      "#FF7A59",
      "#FFC845"
    ]
  },

  {
    id: "theme-ocean",
    name: "تم اقیانوس",
    price: 30,
    colors: [
      "#4FD1FF",
      "#7C4DFF"
    ]
  },

  {
    id: "theme-forest",
    name: "تم جنگل",
    price: 30,
    colors: [
      "#4CD97B",
      "#1F9E56"
    ]
  },

  {
    id: "theme-gold",
    name: "تم طلایی",
    price: 60,
    colors: [
      "#FFD700",
      "#FF8C00"
    ]
  },

  {
    id: "theme-neon",
    name: "تم نئون",
    price: 80,
    colors: [
      "#39FF14",
      "#00E5FF"
    ]
  },

  {
    id: "theme-galaxy",
    name: "تم کهکشانی",
    price: 120,
    colors: [
      "#7C4DFF",
      "#FF4F81"
    ]
  },

  {
    id: "theme-fire",
    name: "تم آتشین",
    price: 150,
    colors: [
      "#FF3D00",
      "#FFC107"
    ]
  },

  {
    id: "theme-royal",
    name: "تم سلطنتی",
    price: 250,
    colors: [
      "#5B2C82",
      "#D4AF37"
    ]
  },

  {
    id: "theme-diamond",
    name: "تم الماس",
    price: 500,
    colors: [
      "#B9F2FF",
      "#5FD3F3"
    ]
  },

  {
    id: "theme-legend",
    name: "تم افسانه‌ای",
    price: 1000,
    colors: [
      "#FFD700",
      "#FF1744"
    ]
  }
];

// ============================================================
// خرید آیتم
// ============================================================

export async function buyItem(
  name,
  itemId
) {
  const item =
    SHOP_ITEMS.find(
      i => i.id === itemId
    );

  if (!item) {
    return {
      ok: false,
      reason: "not-found"
    };
  }

  let result = {
    ok: false,
    reason: "unknown"
  };

  await runTransaction(
    profileRef(name),
    curr => {
      curr =
        curr ||
        blankProfile();

      curr.purchased =
        curr.purchased || [];

      curr.coins =
        curr.coins || 0;

      if (
        curr.purchased.includes(
          itemId
        )
      ) {
        result = {
          ok: false,
          reason: "owned"
        };

        return curr;
      }

      if (
        curr.coins <
        item.price
      ) {
        result = {
          ok: false,
          reason: "insufficient"
        };

        return curr;
      }

      curr.coins -=
        item.price;

      curr.purchased.push(
        itemId
      );

      result = {
        ok: true
      };

      return curr;
    }
  );

  if (result.ok) {
    await logTransaction(
      name,
      {
        type: "purchase",
        amount:
          -item.price,
        note:
          `خرید ${item.name}`
      }
    );
  }

  return result;
}

// ============================================================
// انتخاب تم
// ============================================================

export async function equipTheme(
  name,
  itemId
) {
  await runTransaction(
    profileRef(name),
    curr => {
      curr =
        curr ||
        blankProfile();

      curr.equippedTheme =
        itemId;

      return curr;
    }
  );
}

// ============================================================
// ماموریت‌ها
// ============================================================

export const MISSIONS = [
  {
    id: "m-play3",
    label: "۳ بازی انجام بده",
    reward: 20,
    target: 3,
    statKey: "gamesPlayed"
  },

  {
    id: "m-win1",
    label: "یه برد کسب کن",
    reward: 30,
    target: 1,
    statKey: "wins"
  },

  {
    id: "m-play10",
    label: "۱۰ بازی انجام بده",
    reward: 60,
    target: 10,
    statKey: "gamesPlayed"
  }
];

export async function claimMission(
  name,
  missionId
) {
  const mission =
    MISSIONS.find(
      m => m.id === missionId
    );

  if (!mission) {
    return {
      ok: false,
      reason: "not-found"
    };
  }

  let result = {
    ok: false
  };

  await runTransaction(
    profileRef(name),
    curr => {
      curr =
        curr ||
        blankProfile();

      curr.claimedMissions =
        curr.claimedMissions ||
        [];

      if (
        curr.claimedMissions.includes(
          missionId
        )
      ) {
        result = {
          ok: false,
          reason: "claimed"
        };

        return curr;
      }

      const currentValue =
        Number(
          curr[
            mission.statKey
          ] || 0
        );

      if (
        currentValue <
        mission.target
      ) {
        result = {
          ok: false,
          reason: "incomplete"
        };

        return curr;
      }

      curr.coins =
        (curr.coins || 0) +
        mission.reward;

      curr.claimedMissions.push(
        missionId
      );

      result = {
        ok: true,
        reward:
          mission.reward
      };

      return curr;
    }
  );

  if (result.ok) {
    await logTransaction(
      name,
      {
        type: "mission",
        amount:
          result.reward,
        note:
          mission.label
      }
    );
  }

  return result;
}

// ============================================================
// دوستان
// ============================================================

export async function sendFriendRequest(
  myName,
  targetName
) {
  myName = String(
    myName || ""
  ).trim();

  targetName = String(
    targetName || ""
  ).trim();

  if (
    !targetName ||
    targetName === myName
  ) {
    return {
      ok: false,
      reason: "invalid"
    };
  }

  const targetSnap =
    await get(
      profileRef(
        targetName
      )
    );

  if (!targetSnap.exists()) {
    return {
      ok: false,
      reason: "not-found"
    };
  }

  const targetVal =
    targetSnap.val() || {};

  if (
    targetVal.friends &&
    targetVal.friends[myName]
  ) {
    return {
      ok: false,
      reason:
        "already-friends"
    };
  }

  if (
    targetVal.friendRequests &&
    targetVal.friendRequests[myName]
  ) {
    return {
      ok: false,
      reason:
        "request-pending"
    };
  }

  await update(
    profileRef(
      targetName,
      "friendRequests"
    ),
    {
      [myName]:
        Date.now()
    }
  );

  return {
    ok: true
  };
}

// ============================================================
// وضعیت دوستی
// ============================================================

export async function getFriendStatus(
  myName,
  targetName
) {
  myName = String(
    myName || ""
  ).trim();

  targetName = String(
    targetName || ""
  ).trim();

  if (
    !myName ||
    !targetName
  ) {
    return {
      isFriend: false,
      requestPending: false,
      isSelf: false
    };
  }

  if (
    myName === targetName
  ) {
    return {
      isFriend: false,
      requestPending: false,
      isSelf: true
    };
  }

  const myProfileSnap =
    await get(
      profileRef(
        myName
      )
    );

  const targetProfileSnap =
    await get(
      profileRef(
        targetName
      )
    );

  const myProfile =
    myProfileSnap.val() || {};

  const targetProfile =
    targetProfileSnap.val() || {};

  const isFriend =
    !!(
      myProfile.friends &&
      myProfile.friends[
        targetName
      ]
    );

  const requestPending =
    !!(
      targetProfile.friendRequests &&
      targetProfile.friendRequests[
        myName
      ]
    );

  return {
    isFriend,
    requestPending,
    isSelf: false
  };
}

// ============================================================
// درخواست‌های دوستی
// ============================================================

export function listenFriendRequests(
  myName,
  callback
) {
  return onValue(
    profileRef(
      myName,
      "friendRequests"
    ),
    snap => {
      const val =
        snap.val() || {};

      callback(
        Object.keys(val)
      );
    }
  );
}

export async function acceptFriendRequest(
  myName,
  fromName
) {
  await update(
    profileRef(
      myName,
      "friends"
    ),
    {
      [fromName]: true
    }
  );

  await update(
    profileRef(
      fromName,
      "friends"
    ),
    {
      [myName]: true
    }
  );

  await remove(
    profileRef(
      myName,
      `friendRequests/${fromName}`
    )
  );
}

export async function rejectFriendRequest(
  myName,
  fromName
) {
  await remove(
    profileRef(
      myName,
      `friendRequests/${fromName}`
    )
  );
}

// ============================================================
// لیست دوستان
// ============================================================

export function listenFriends(
  myName,
  callback
) {
  let friendUnsubs = {};
  let latest = {};

  function emit(names) {
    callback(
      names.map(
        n =>
          latest[n] || {
            name: n,
            online: false,
            lastSeen: 0,
            lastLogin: 0
          }
      )
    );
  }

  const mainUnsub =
    onValue(
      profileRef(
        myName,
        "friends"
      ),
      snap => {
        const val =
          snap.val() || {};

        const names =
          Object.keys(val);

        Object.keys(
          friendUnsubs
        ).forEach(
          n => {
            if (
              !names.includes(n)
            ) {
              friendUnsubs[n]();
              delete friendUnsubs[n];
              delete latest[n];
            }
          }
        );

        names.forEach(
          name => {
            if (
              friendUnsubs[name]
            ) {
              return;
            }

            friendUnsubs[name] =
              onValue(
                profileRef(name),
                pSnap => {
                  const profile =
                    pSnap.val() || {};

                  const presence =
                    profile.presence ||
                    {};

                  const connections =
                    presence.connections ||
                    {};

                  const connectionList =
                    Object.values(
                      connections
                    );

                  const hasOnlineConnection =
                    connectionList.some(
                      x =>
                        x &&
                        x.online === true
                    );

                  let online =
                    hasOnlineConnection;

                  if (
                    connectionList.length ===
                    0
                  ) {
                    online =
                      !!presence.online;
                  }

                  latest[name] = {
                    name,
                    online,

                    // آخرین حضور در دومیتو
                    lastSeen:
                      Number(
                        presence.lastSeen ||
                          0
                      ),

                    // برای سازگاری با کدهای قدیمی
                    lastLogin:
                      Number(
                        profile.lastLogin ||
                          0
                      )
                  };

                  emit(names);
                }
              );
          }
        );

        emit(names);
      }
    );

  return () => {
    mainUnsub();

    Object.values(
      friendUnsubs
    ).forEach(
      unsubscribe => {
        try {
          unsubscribe();
        } catch {}
      }
    );

    friendUnsubs = {};
    latest = {};
  };
}

// ============================================================
// دعوت دوستان به اتاق
// ============================================================

export async function inviteFriendToRoom(
  myName,
  friendName,
  roomCode
) {
  await push(
    ref(
      db,
      `profiles/${encodeURIComponent(friendName)}/invites`
    ),
    {
      from: myName,
      roomCode,
      at: Date.now()
    }
  );
}

// ============================================================
// دریافت دعوت‌ها
// ============================================================

export function listenInvites(
  myName,
  callback
) {
  return onValue(
    ref(
      db,
      `profiles/${encodeURIComponent(myName)}/invites`
    ),
    snap => {
      const val =
        snap.val() || {};

      const list =
        Object.entries(val)
          .map(
            ([id, value]) => ({
              id,
              ...value
            })
          )
          .sort(
            (a, b) =>
              (b.at || 0) -
              (a.at || 0)
          );

      callback(list);
    }
  );
}

// ============================================================
// حذف دعوت
// ============================================================

export async function dismissInvite(
  myName,
  inviteId
) {
  await remove(
    ref(
      db,
      `profiles/${encodeURIComponent(myName)}/invites/${inviteId}`
    )
  );
}

// ============================================================
// چت
// ============================================================

export function chatRef(
  code,
  path = ""
) {
  return ref(
    db,
    `rooms/${code}/chat${path ? "/" + path : ""}`
  );
}

export async function sendChatMessage(
  code,
  name,
  text
) {
  const clean =
    String(text || "")
      .slice(0, 200)
      .trim();

  if (!clean) {
    return;
  }

  const msgsRef =
    chatRef(
      code,
      "messages"
    );

  await push(
    msgsRef,
    {
      name,
      text: clean,
      at: Date.now()
    }
  );

  try {
    const snap =
      await get(
        msgsRef
      );

    const val =
      snap.val() || {};

    const keys =
      Object.keys(val);

    if (
      keys.length > 60
    ) {
      const sorted =
        keys.sort(
          (a, b) =>
            (val[a].at || 0) -
            (val[b].at || 0)
        );

      const oldKeys =
        sorted.slice(
          0,
          keys.length - 60
        );

      for (
        const key of oldKeys
      ) {
        await remove(
          chatRef(
            code,
            `messages/${key}`
          )
        );
      }
    }
  } catch (e) {
    console.warn(
      "Chat cleanup error:",
      e
    );
  }
}

export function listenChat(
  code,
  callback
) {
  return onValue(
    chatRef(
      code,
      "messages"
    ),
    snap => {
      const val =
        snap.val() || {};

      const list =
        Object.entries(val)
          .map(
            ([id, value]) => ({
              id,
              ...value
            })
          )
          .sort(
            (a, b) =>
              (a.at || 0) -
              (b.at || 0)
          );

      callback(list);
    }
  );
}

// ============================================================
// لیدربورد
// ============================================================

export async function getLeaderboard(
  limitN = 5
) {
  const snap =
    await get(
      ref(
        db,
        "profiles"
      )
    );

  const val =
    snap.val() || {};

  const list =
    Object.entries(val)
      .map(
        ([encodedName, profile]) => ({
          name:
            decodeURIComponent(
              encodedName
            ),

          wins:
            profile.wins || 0
        })
      );

  list.sort(
    (a, b) =>
      b.wins -
      a.wins
  );

  return list.slice(
    0,
    limitN
  );
}
