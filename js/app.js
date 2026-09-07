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
  return `${username.trim().toLowerCase()}@domito.local`;
}


export function getSavedName() {
  return localStorage.getItem("domito_name") || "";
}


export function saveName(name) {
  localStorage.setItem("domito_name", name);
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
    friendRequests: {}
  };
}


export function profileRef(name, path = "") {
  const safe = encodeURIComponent(name);

  return ref(
    db,
    `profiles/${safe}${path ? "/" + path : ""}`
  );
}


async function ensureProfile(username) {
  const pRef = profileRef(username);

  const snap = await get(pRef);

  if (!snap.exists()) {
    await set(pRef, blankProfile());
  }
}


export async function ensureOwnerLinks(username, uid) {
  const ownerRef = ref(
    db,
    `profiles/${encodeURIComponent(username)}/ownerUid`
  );

  const snap = await get(ownerRef);

  if (!snap.exists()) {
    await set(ownerRef, uid);
  }

  await set(
    ref(db, `uidToName/${uid}`),
    username
  );

  await ensureProfile(username);
}


// ============================================================
// ثبت نام
// ============================================================

export async function registerUser(username, password) {

  username = username.trim();

  const cred = await createUserWithEmailAndPassword(
    auth,
    usernameToEmail(username),
    password
  );

  saveName(username);

  await ensureOwnerLinks(
    username,
    cred.user.uid
  );

  await setPresence(
    username,
    true
  );

  return cred.user;
}


// ============================================================
// ورود
// ============================================================

export async function loginUser(username, password) {

  username = username.trim();

  const cred = await signInWithEmailAndPassword(
    auth,
    usernameToEmail(username),
    password
  );

  saveName(username);

  await ensureOwnerLinks(
    username,
    cred.user.uid
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
      await setPresence(name, false);
    } catch (e) {
      console.warn("Presence logout error:", e);
    }
  }

  localStorage.removeItem("domito_name");
  localStorage.removeItem("domito_room");

  await signOut(auth);
}


// ============================================================
// وضعیت کاربر
// ============================================================

export function waitForUser() {

  return new Promise((resolve) => {

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      }
    );

  });

}


export function currentUid() {

  return auth.currentUser
    ? auth.currentUser.uid
    : null;

}


// ============================================================
// حضور آنلاین
// ============================================================

export async function setPresence(name, online) {

  if (!name) return;

  const pRef = ref(
    db,
    `profiles/${encodeURIComponent(name)}/presence`
  );

  await update(pRef, {
    online: !!online,
    lastSeen: Date.now()
  });

  if (online) {

    await onDisconnect(pRef).update({
      online: false,
      lastSeen: Date.now()
    });

  }

}


// ============================================================
// اتاق‌ها
// ============================================================

function randomRoomCode() {

  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < 5; i++) {

    code += chars[
      Math.floor(Math.random() * chars.length)
    ];

  }

  return code;
}


export function getSavedRoom() {
  return localStorage.getItem("domito_room") || "";
}


export function saveRoom(code) {
  localStorage.setItem("domito_room", code);
}


export function clearRoom() {
  localStorage.removeItem("domito_room");
}


export function roomRef(code, path = "") {

  return ref(
    db,
    `rooms/${code}${path ? "/" + path : ""}`
  );

}


// ============================================================
// ساخت اتاق
// ============================================================

export async function createRoom() {

  let code;

  // جلوگیری از برخورد تصادفی کد اتاق
  for (let i = 0; i < 10; i++) {

    const candidate = randomRoomCode();

    const snap = await get(
      roomRef(candidate, "meta")
    );

    if (!snap.exists()) {
      code = candidate;
      break;
    }

  }

  if (!code) {
    throw new Error("room-code-generation-failed");
  }

  await set(
    roomRef(code, "meta"),
    {
      createdAt: serverTimestamp()
    }
  );

  saveRoom(code);

  return code;
}


// ============================================================
// ورود به اتاق
// ============================================================

export async function joinRoomByCode(rawCode) {

  const code = String(rawCode)
    .trim()
    .toUpperCase();

  if (!code) {
    return {
      ok: false,
      reason: "invalid-code"
    };
  }

  const snap = await get(
    roomRef(code, "meta")
  );

  if (!snap.exists()) {

    return {
      ok: false,
      reason: "not-found"
    };

  }

  saveRoom(code);

  return {
    ok: true,
    code
  };

}


// ============================================================
// ورود بازیکن به لابی
// ============================================================

export async function joinLobby(name) {

  const code = getSavedRoom();
  const uid = currentUid();

  if (!code) {
    throw new Error("no-room");
  }

  if (!uid) {
    throw new Error("not-authenticated");
  }

  await set(
    roomRef(code, `players/${uid}`),
    {
      name,
      joinedAt: serverTimestamp()
    }
  );

  onDisconnect(
    roomRef(code, `players/${uid}`)
  ).remove();

  onDisconnect(
    roomRef(code, `votes/${uid}`)
  ).remove();

  onDisconnect(
    roomRef(code, `results/${uid}`)
  ).remove();

  return uid;
}


// ============================================================
// خروج از لابی
// ============================================================

export async function leaveLobby() {

  const code = getSavedRoom();
  const uid = currentUid();

  if (!code || !uid) return;

  await remove(
    roomRef(code, `players/${uid}`)
  );

  await remove(
    roomRef(code, `votes/${uid}`)
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

  
{ id: "snake", name: "بازی مار", desc: "غذا بخور، بزرگ شو، به خودت نخور", icon: "🐍", soloThreshold: 8 },
  { id: "astra", name: "دومیتو استرا", desc: "تسخیر تایل‌های فضایی، کمبو بگیر، ربات رو شکست بده", icon: "🚀", soloThreshold: 1 },
];
];


export function soloWon(gameId, score) {

  const game = GAMES.find(
    (x) => x.id === gameId
  );

  return game
    ? score >= game.soloThreshold
    : false;

}


// ============================================================
// پروفایل عمومی
// ============================================================

export async function getPublicProfile(name) {

  const snap = await get(
    profileRef(name)
  );

  if (!snap.exists()) {
    return null;
  }

  return snap.val();

}


export function listenProfile(name, callback) {

  return onValue(
    profileRef(name),
    (snap) => {
      callback(snap.val());
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
    throw new Error("no-room");
  }

  await set(
    roomRef(code, `results/${uid}`),
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

  if (!code) return;

  await set(
    roomRef(code, "currentGame"),
    null
  );

  await set(
    roomRef(code, "votes"),
    null
  );

  await set(
    roomRef(code, "results"),
    null
  );

}


// ============================================================
// تراکنش‌های سکه
// ============================================================

export async function logTransaction(
  name,
  { type, amount, note }
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

  const snap = await get(
    ref(
      db,
      `profiles/${encodeURIComponent(name)}/transactions`
    )
  );

  const val = snap.val() || {};

  const list = Object.values(val)
    .sort(
      (a, b) =>
        (b.at || 0) - (a.at || 0)
    );

  return list.slice(0, limitN);

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
    (curr) => {

      curr = curr || blankProfile();

      curr.wins = curr.wins || 0;
      curr.losses = curr.losses || 0;
      curr.gamesPlayed =
        curr.gamesPlayed || 0;

      curr.byGame =
        curr.byGame || {};

      curr.purchased =
        curr.purchased || [];

      curr.equippedTheme =
        curr.equippedTheme || "default";

      curr.claimedMissions =
        curr.claimedMissions || [];

      curr.friends =
        curr.friends || {};

      curr.friendRequests =
        curr.friendRequests || {};

      curr.coins =
        curr.coins || 0;

      curr.gamesPlayed++;

      if (won) {

        curr.wins++;
        curr.coins += COIN_WIN;

      } else {

        curr.losses++;
        curr.coins += COIN_PLAY;

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

      curr.byGame[gameId] = game;

      return curr;

    }
  );


  await logTransaction(
    name,
    {
      type: won ? "win" : "play",
      amount: won
        ? COIN_WIN
        : COIN_PLAY,
      note: won
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
    colors: ["#FF7A59", "#FFC845"]
  },

  {
    id: "theme-ocean",
    name: "تم اقیانوس",
    price: 30,
    colors: ["#4FD1FF", "#7C4DFF"]
  },

  {
    id: "theme-forest",
    name: "تم جنگل",
    price: 30,
    colors: ["#4CD97B", "#1F9E56"]
  },

  {
    id: "theme-gold",
    name: "تم طلایی",
    price: 60,
    colors: ["#FFD700", "#FF8C00"]
  },

  {
    id: "theme-neon",
    name: "تم نئون",
    price: 80,
    colors: ["#39FF14", "#00E5FF"]
  },

  {
    id: "theme-galaxy",
    name: "تم کهکشانی",
    price: 120,
    colors: ["#7C4DFF", "#FF4F81"]
  },

  {
    id: "theme-fire",
    name: "تم آتشین",
    price: 150,
    colors: ["#FF3D00", "#FFC107"]
  },

  {
    id: "theme-royal",
    name: "تم سلطنتی",
    price: 250,
    colors: ["#5B2C82", "#D4AF37"]
  },

  {
    id: "theme-diamond",
    name: "تم الماس",
    price: 500,
    colors: ["#B9F2FF", "#5FD3F3"]
  },

  {
    id: "theme-legend",
    name: "تم افسانه‌ای",
    price: 1000,
    colors: ["#FFD700", "#FF1744"]
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
      (i) => i.id === itemId
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
    (curr) => {

      curr = curr || blankProfile();

      curr.purchased =
        curr.purchased || [];

      curr.coins =
        curr.coins || 0;

      if (
        curr.purchased.includes(itemId)
      ) {

        result = {
          ok: false,
          reason: "owned"
        };

        return curr;

      }


      if (curr.coins < item.price) {

        result = {
          ok: false,
          reason: "insufficient"
        };

        return curr;

      }


      curr.coins -= item.price;

      curr.purchased.push(itemId);

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
        amount: -item.price,
        note: `خرید ${item.name}`
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
    (curr) => {

      curr = curr || blankProfile();

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
      (m) => m.id === missionId
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
    (curr) => {

      curr = curr || blankProfile();

      curr.claimedMissions =
        curr.claimedMissions || [];

      if (
        curr.claimedMissions
          .includes(missionId)
      ) {

        result = {
          ok: false,
          reason: "claimed"
        };

        return curr;

      }


      const progressVal =
        curr[mission.statKey] || 0;


      if (
        progressVal < mission.target
      ) {

        result = {
          ok: false,
          reason: "incomplete"
        };

        return curr;

      }


      curr.coins =
        (curr.coins || 0)
        + mission.reward;

      curr.claimedMissions.push(
        missionId
      );

      result = {
        ok: true,
        reward: mission.reward
      };

      return curr;

    }
  );


  if (result.ok) {

    await logTransaction(
      name,
      {
        type: "mission",
        amount: result.reward,
        note: mission.label
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

  targetName =
    targetName.trim();


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
      profileRef(targetName)
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
      reason: "already-friends"
    };

  }


  await update(
    profileRef(
      targetName,
      "friendRequests"
    ),
    {
      [myName]: Date.now()
    }
  );


  return {
    ok: true
  };

}


export function listenFriendRequests(
  myName,
  callback
) {

  return onValue(
    profileRef(
      myName,
      "friendRequests"
    ),
    (snap) => {

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


export function listenFriends(
  myName,
  callback
) {

  return onValue(
    profileRef(myName, "friends"),
    async (snap) => {

      const val =
        snap.val() || {};

      const names =
        Object.keys(val);

      const results = [];


      for (const name of names) {

        try {

          const pSnap =
            await get(
              profileRef(
                name,
                "presence"
              )
            );

          const presence =
            pSnap.val() || {
              online: false,
              lastSeen: 0
            };


          results.push({
            name,
            online: !!presence.online
          });

        } catch (e) {

          results.push({
            name,
            online: false
          });

        }

      }


      callback(results);

    }
  );

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


export function listenInvites(
  myName,
  callback
) {

  return onValue(
    ref(
      db,
      `profiles/${encodeURIComponent(myName)}/invites`
    ),
    (snap) => {

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
    String(text)
      .slice(0, 200)
      .trim();

  if (!clean) return;

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
      await get(msgsRef);

    const val =
      snap.val() || {};

    const keys =
      Object.keys(val);


    if (keys.length > 60) {

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


      for (const key of oldKeys) {

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
    (snap) => {

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
      ref(db, "profiles")
    );

  const val =
    snap.val() || {};


  const list =
    Object.entries(val)
      .map(
        ([encodedName, profile]) => ({
          name: decodeURIComponent(
            encodedName
          ),
          wins: profile.wins || 0
        })
      );


  list.sort(
    (a, b) =>
      b.wins - a.wins
  );


  return list.slice(
    0,
    limitN
  );

    }
