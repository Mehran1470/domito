import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

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

import {
  firebaseConfig
} from "./firebase-config.js";


// ============================================================
// Firebase
// ============================================================

const app =
  initializeApp(firebaseConfig);

const auth =
  getAuth(app);

export const db =
  getDatabase(app);

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

  return `${String(username || "")
    .trim()
    .toLowerCase()}@domito.local`;

}

export function getSavedName() {

  return (
    localStorage.getItem(
      "domito_name"
    ) || ""
  );

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


export function profileRef(
  name,
  path = ""
) {

  const safe =
    encodeURIComponent(
      String(name || "")
    );

  return ref(
    db,
    `profiles/${safe}${path ? "/" + path : ""}`
  );

}


async function ensureProfile(
  username
) {

  const pRef =
    profileRef(username);

  const snap =
    await get(pRef);

  if (!snap.exists()) {

    await set(
      pRef,
      blankProfile()
    );

  }

}


// ============================================================
// لینک مالک
// ============================================================

export async function ensureOwnerLinks(
  username,
  uid
) {

  const ownerRef =
    ref(
      db,
      `profiles/${encodeURIComponent(username)}/ownerUid`
    );

  const snap =
    await get(ownerRef);

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

  await ensureProfile(
    username
  );

}


// ============================================================
// آخرین ورود
// ============================================================

async function updateLastLogin(
  username
) {

  username =
    String(
      username || ""
    ).trim();

  if (!username) {
    return false;
  }

  try {

    const now =
      Date.now();

    await update(
      profileRef(username),
      {
        lastLogin: now
      }
    );

    return true;

  } catch (e) {

    console.error(
      "LAST LOGIN ERROR:",
      e
    );

    return false;

  }

}


// ============================================================
// Presence
// ============================================================

let presenceConnectionRef =
  null;

let presenceConnectionName =
  "";

let presenceConnectedUnsubscribe =
  null;


function presenceRootRef(
  name
) {

  return ref(
    db,
    `profiles/${encodeURIComponent(name)}/presence`
  );

}


function presenceConnectionsRef(
  name
) {

  return ref(
    db,
    `profiles/${encodeURIComponent(name)}/presence/connections`
  );

}


async function cleanupPresenceConnection() {

  if (
    presenceConnectedUnsubscribe
  ) {

    try {

      presenceConnectedUnsubscribe();

    } catch {}

    presenceConnectedUnsubscribe =
      null;

  }

  if (
    presenceConnectionRef
  ) {

    try {

      await remove(
        presenceConnectionRef
      );

    } catch (e) {

      console.warn(
        "Presence cleanup error:",
        e
      );

    }

    presenceConnectionRef =
      null;

    presenceConnectionName =
      "";

  }

}


export async function setPresence(
  name,
  online
) {

  name =
    String(
      name || ""
    ).trim();

  if (!name) {
    return;
  }

  const pRef =
    presenceRootRef(name);


  if (!online) {

    await cleanupPresenceConnection();

    try {

      await update(
        pRef,
        {
          online: false,
          lastSeen:
            serverTimestamp()
        }
      );

    } catch (e) {

      console.error(
        "OFFLINE ERROR:",
        e
      );

    }

    return;

  }


  if (
    presenceConnectionRef &&
    presenceConnectionName === name
  ) {

    return;

  }


  await cleanupPresenceConnection();


  const connectedRef =
    ref(
      db,
      ".info/connected"
    );

  let started =
    false;


  const startConnection =
    async connected => {

      if (!connected) {
        return;
      }

      if (started) {
        return;
      }

      started = true;

      try {

        const connection =
          push(
            presenceConnectionsRef(
              name
            )
          );

        presenceConnectionRef =
          connection;

        presenceConnectionName =
          name;


        await onDisconnect(
          connection
        ).remove();


        await onDisconnect(
          pRef
        ).update({

          online: false,

          lastSeen:
            serverTimestamp()

        });


        await set(
          connection,
          {

            online: true,

            connectedAt:
              serverTimestamp()

          }
        );


        await update(
          pRef,
          {

            online: true,

            lastSeen:
              serverTimestamp()

          }
        );

      } catch (e) {

        console.error(
          "PRESENCE ERROR:",
          e
        );

        started = false;

      }

    };


  presenceConnectedUnsubscribe =
    onValue(
      connectedRef,
      async snap => {

        await startConnection(
          snap.val() === true
        );

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

  username =
    String(
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
// ورود
// ============================================================

export async function loginUser(
  username,
  password
) {

  username =
    String(
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

  const name =
    getSavedName();


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
// Auto Login
// ============================================================

export function waitForUser() {

  return new Promise(
    resolve => {

      let finished =
        false;


      const unsubscribe =
        onAuthStateChanged(
          auth,
          async user => {

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

                const snap =
                  await get(
                    ref(
                      db,
                      `uidToName/${user.uid}`
                    )
                  );


                if (
                  snap.exists()
                ) {

                  username =
                    String(
                      snap.val() || ""
                    ).trim();


                  if (username) {
                    saveName(username);
                  }

                }

              } catch (e) {

                console.warn(
                  "USERNAME LOOKUP ERROR:",
                  e
                );

              }

            }


            resolve(user);


            if (username) {

              Promise.resolve()
                .then(
                  async () => {

                    try {

                      await ensureOwnerLinks(
                        username,
                        user.uid
                      );

                    } catch (e) {

                      console.warn(
                        "OWNER LINK ERROR:",
                        e
                      );

                    }


                    try {

                      await setPresence(
                        username,
                        true
                      );

                    } catch (e) {

                      console.warn(
                        "PRESENCE SYNC ERROR:",
                        e
                      );

                    }

                  }
                );

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


export function saveRoom(
  code
) {

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

  code =
    String(
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

  const uid =
    currentUid();

  const name =
    getSavedName();


  if (
    !uid ||
    !name
  ) {

    throw new Error(
      "not-authenticated"
    );

  }


  let code =
    null;


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

      code =
        candidate;

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

      ownerUid:
        uid,

      ownerName:
        name

    }
  );


  saveRoom(code);


  return code;

}


// ============================================================
// اطلاعات اتاق
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

  const uid =
    currentUid();


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

  const code =
    String(
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


  const uid =
    currentUid();


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
// Kick
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


export function listenKickStatus(
  code = getSavedRoom(),
  callback
) {

  const uid =
    currentUid();


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
    snap => {

      callback(
        snap.exists()
          ? snap.val()
          : null
      );

    }
  );

}


export async function kickMember(
  targetUid
) {

  const code =
    getSavedRoom();

  const uid =
    currentUid();


  targetUid =
    String(
      targetUid || ""
    ).trim();


  if (!code) {
    throw new Error("no-room");
  }

  if (!uid) {
    throw new Error("not-authenticated");
  }

  if (!targetUid) {
    throw new Error("invalid-target");
  }

  if (targetUid === uid) {
    throw new Error("cannot-kick-self");
  }


  const meta =
    await getRoomMeta(code);


  if (!meta) {
    throw new Error("room-not-found");
  }


  if (meta.ownerUid !== uid) {
    throw new Error("not-room-owner");
  }


  const targetSnap =
    await get(
      roomRef(
        code,
        `players/${targetUid}`
      )
    );


  if (!targetSnap.exists()) {
    throw new Error("player-not-found");
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

      at:
        serverTimestamp()

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
// Lobby
// ============================================================

export async function joinLobby(
  name
) {

  const code =
    getSavedRoom();

  const uid =
    currentUid();


  name =
    String(
      name || getSavedName()
    ).trim();


  if (!code) {
    throw new Error("no-room");
  }

  if (!uid) {
    throw new Error("not-authenticated");
  }

  if (!name) {
    throw new Error("invalid-name");
  }


  if (
    await checkKicked(
      code,
      uid
    )
  ) {

    throw new Error("kicked");

  }


  const meta =
    await getRoomMeta(code);


  if (!meta) {
    throw new Error("room-not-found");
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


export async function leaveLobby() {

  const code =
    getSavedRoom();

  const uid =
    currentUid();


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
    name: "اجر شکن",
    desc: "اجر مرحله رو بشکن و برنده شو",
    icon: "🧱",
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
    name: "پرش از سکو",
    desc: "بپر برو بالا و برنده شو",
    icon: "⬆️",
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
  }

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

  const code =
    getSavedRoom();


  if (!code) {
    throw new Error("no-room");
  }


  if (!uid) {
    throw new Error("not-authenticated");
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


export async function resetSessionForNextRound() {

  const code =
    getSavedRoom();


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
// تراکنش‌ها
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

      amount:
        Number(amount || 0),

      note:
        String(note || ""),

      at:
        Date.now()

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
// پاداش بازی
// ============================================================

const COIN_WIN =
  15;

const COIN_PLAY =
  5;


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
        Number(curr.coins || 0);

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
// خرید
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
        Number(
          curr.coins || 0
        );


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

        type:
          "purchase",

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
// مأموریت‌ها
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
        curr.claimedMissions || [];


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
        Number(
          curr.coins || 0
        ) +
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

        type:
          "mission",

        amount:
          result.reward,

        note:
          `پاداش مأموریت: ${mission.label}`

      }
    );

  }


  return result;

}


// ============================================================
// 💸 سیستم انتقال سکه
// ============================================================

function incomingTransfersRef(name) {

  return ref(
    db,
    `profiles/${encodeURIComponent(name)}/incomingTransfers`
  );

}


function singleIncomingTransferRef(
  name,
  id
) {

  return ref(
    db,
    `profiles/${encodeURIComponent(name)}/incomingTransfers/${id}`
  );

}


function outgoingTransfersRef(name) {

  return ref(
    db,
    `profiles/${encodeURIComponent(name)}/outgoingTransfers`
  );

}


function singleOutgoingTransferRef(
  name,
  id
) {

  return ref(
    db,
    `profiles/${encodeURIComponent(name)}/outgoingTransfers/${id}`
  );

}


// ============================================================
// ارسال سکه
// ============================================================

export async function sendCoins(
  senderName,
  receiverName,
  amount
) {

  senderName =
    String(
      senderName || ""
    ).trim();

  receiverName =
    String(
      receiverName || ""
    ).trim();

  amount =
    Number(amount);


  if (
    !senderName ||
    !receiverName
  ) {

    return {
      ok: false,
      reason: "invalid-name"
    };

  }


  if (
    senderName.toLowerCase() ===
    receiverName.toLowerCase()
  ) {

    return {
      ok: false,
      reason: "self-transfer"
    };

  }


  if (
    !Number.isInteger(amount) ||
    amount <= 0
  ) {

    return {
      ok: false,
      reason: "invalid-amount"
    };

  }


  const receiverSnap =
    await get(
      profileRef(
        receiverName
      )
    );


  if (!receiverSnap.exists()) {

    return {
      ok: false,
      reason: "receiver-not-found"
    };

  }


  const senderSnap =
    await get(
      profileRef(
        senderName
      )
    );


  if (!senderSnap.exists()) {

    return {
      ok: false,
      reason: "sender-not-found"
    };

  }


  const transferRef =
    push(
      incomingTransfersRef(
        receiverName
      )
    );


  const transferId =
    transferRef.key;


  if (!transferId) {

    return {
      ok: false,
      reason: "transfer-id-failed"
    };

  }


  const deductResult =
    await runTransaction(
      profileRef(senderName),
      profile => {

        if (!profile) {
          return profile;
        }


        profile.coins =
          Number(
            profile.coins || 0
          );


        if (
          profile.coins <
          amount
        ) {

          return;

        }


        profile.coins -=
          amount;


        return profile;

      }
    );


  if (
    !deductResult.committed
  ) {

    return {
      ok: false,
      reason: "insufficient"
    };

  }


  try {

    await set(
      singleOutgoingTransferRef(
        senderName,
        transferId
      ),
      {

        to:
          receiverName,

        amount:
          amount,

        transferId:
          transferId,

        at:
          Date.now(),

        status:
          "pending"

      }
    );


    await set(
      transferRef,
      {

        from:
          senderName,

        amount:
          amount,

        at:
          Date.now(),

        status:
          "pending"

      }
    );


    await logTransaction(
      senderName,
      {

        type:
          "transfer-send",

        amount:
          -amount,

        note:
          `ارسال ${amount} سکه به ${receiverName}`

      }
    );


    return {

      ok: true,

      transferId,

      amount

    };


  } catch (e) {

    console.error(
      "TRANSFER CREATE ERROR:",
      e
    );


    try {

      await remove(
        singleOutgoingTransferRef(
          senderName,
          transferId
        )
      );

    } catch {}


    try {

      await remove(
        transferRef
      );

    } catch {}


    await runTransaction(
      profileRef(senderName),
      profile => {

        if (!profile) {

          profile =
            blankProfile();

        }


        profile.coins =
          Number(
            profile.coins || 0
          ) +
          amount;


        return profile;

      }
    );


    return {

      ok: false,

      reason:
        "transfer-create-failed"

    };

  }

}


// ============================================================
// شنیدن انتقال‌های دریافتی
// ============================================================

export function listenIncomingTransfers(
  name,
  callback
) {

  return onValue(
    incomingTransfersRef(name),
    snap => {

      const val =
        snap.val() || {};


      const list =
        Object.entries(val)
          .map(
            ([id, value]) => ({

              id,

              ...(value || {})

            })
          )
          .filter(
            x =>
              x.status === "pending"
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
// شنیدن انتقال‌های خروجی
// ============================================================

export function listenOutgoingTransfers(
  name,
  callback
) {

  return onValue(
    outgoingTransfersRef(name),
    snap => {

      const val =
        snap.val() || {};


      const list =
        Object.entries(val)
          .map(
            ([id, value]) => ({

              id,

              ...(value || {})

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
// پردازش انتقال‌های خروجی
// ============================================================

export async function processOutgoingTransfers(
  senderName
) {

  senderName =
    String(
      senderName || ""
    ).trim();


  if (!senderName) {
    return;
  }


  const snap =
    await get(
      outgoingTransfersRef(
        senderName
      )
    );


  const val =
    snap.val() || {};


  const entries =
    Object.entries(val);


  for (
    const [transferId, outgoing] of entries
  ) {

    if (!outgoing) {
      continue;
    }


    if (
      outgoing.status !==
      "pending"
    ) {

      continue;

    }


    const receiverName =
      String(
        outgoing.to || ""
      ).trim();


    const amount =
      Number(
        outgoing.amount
      );


    if (
      !receiverName ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {

      continue;

    }


    try {

      const incomingSnap =
        await get(
          singleIncomingTransferRef(
            receiverName,
            transferId
          )
        );


      if (!incomingSnap.exists()) {
        continue;
      }


      const incoming =
        incomingSnap.val() || {};


      if (
        incoming.status ===
        "accepted"
      ) {

        await runTransaction(
          singleOutgoingTransferRef(
            senderName,
            transferId
          ),
          current => {

            if (!current) {
              return current;
            }


            if (
              current.status !==
              "pending"
            ) {

              return current;

            }


            current.status =
              "accepted";

            current.acceptedAt =
              incoming.acceptedAt ||
              Date.now();


            return current;

          }
        );


        continue;

      }


      if (
        incoming.status ===
        "rejected"
      ) {

        const refundTransactionRef =
          push(
            ref(
              db,
              `profiles/${encodeURIComponent(senderName)}/transactions`
            )
          );


        const refundTransactionId =
          refundTransactionRef.key;


        let refunded =
          false;


        await runTransaction(
          profileRef(senderName),
          profile => {

            if (!profile) {
              return profile;
            }


            profile.coins =
              Number(
                profile.coins || 0
              );


            profile.outgoingTransfers =
              profile.outgoingTransfers ||
              {};


            const currentTransfer =
              profile.outgoingTransfers[
                transferId
              ];


            if (!currentTransfer) {
              return profile;
            }


            if (
              currentTransfer.status !==
              "pending"
            ) {

              return profile;

            }


            profile.coins +=
              amount;


            currentTransfer.status =
              "refunded";

            currentTransfer.refundedAt =
              Date.now();


            profile.outgoingTransfers[
              transferId
            ] =
              currentTransfer;


            if (
              refundTransactionId
            ) {

              profile.transactions =
                profile.transactions ||
                {};


              profile.transactions[
                refundTransactionId
              ] = {

                type:
                  "transfer-return",

                amount:
                  amount,

                note:
                  `برگشت ${amount} سکه از ${receiverName}`,

                at:
                  Date.now()

              };

            }


            refunded =
              true;


            return profile;

          }
        );


        if (refunded) {

          console.log(
            `TRANSFER REFUNDED: ${amount} coins from ${receiverName}`
          );

        }

      }

    } catch (e) {

      console.error(
        "PROCESS OUTGOING TRANSFER ERROR:",
        e
      );

    }

  }

}


// ============================================================
// دریافت انتقال
// ============================================================

export async function acceptTransfer(
  receiverName,
  transferId
) {

  receiverName =
    String(
      receiverName || ""
    ).trim();


  if (
    !receiverName ||
    !transferId
  ) {

    return {
      ok: false,
      reason: "invalid"
    };

  }


  const claimResult =
    await runTransaction(
      singleIncomingTransferRef(
        receiverName,
        transferId
      ),
      current => {

        if (!current) {
          return;
        }


        if (
          current.status !==
          "pending"
        ) {

          return;

        }


        current.status =
          "processing";

        current.processingAt =
          Date.now();


        return current;

      }
    );


  if (
    !claimResult.committed
  ) {

    return {

      ok: false,

      reason:
        "already-processed"

    };

  }


  const transfer =
    claimResult.snapshot.val() ||
    {};


  const amount =
    Number(
      transfer.amount
    );


  if (
    !Number.isInteger(amount) ||
    amount <= 0
  ) {

    await update(
      singleIncomingTransferRef(
        receiverName,
        transferId
      ),
      {

        status:
          "pending",

        processingAt:
          null

      }
    );


    return {

      ok: false,

      reason:
        "invalid-amount"

    };

  }


  try {

    const creditResult =
      await runTransaction(
        profileRef(receiverName),
        profile => {

          if (!profile) {

            profile =
              blankProfile();

          }


          profile.coins =
            Number(
              profile.coins || 0
            );


          profile.coins +=
            amount;


          return profile;

        }
      );


    if (
      !creditResult.committed
    ) {

      throw new Error(
        "credit-not-committed"
      );

    }


  } catch (e) {

    console.error(
      "ACCEPT CREDIT ERROR:",
      e
    );


    try {

      await update(
        singleIncomingTransferRef(
          receiverName,
          transferId
        ),
        {

          status:
            "pending",

          processingAt:
            null

        }
      );

    } catch {}


    return {

      ok: false,

      reason:
        "credit-failed"

    };

  }


  try {

    await update(
      singleIncomingTransferRef(
        receiverName,
        transferId
      ),
      {

        status:
          "accepted",

        acceptedAt:
          Date.now(),

        processingAt:
          null

      }
    );


    await logTransaction(
      receiverName,
      {

        type:
          "transfer-receive",

        amount:
          amount,

        note:
          `دریافت ${amount} سکه از ${transfer.from}`

      }
    );


    return {

      ok: true,

      amount

    };


  } catch (e) {

    console.error(
      "ACCEPT STATUS ERROR:",
      e
    );


    return {

      ok: false,

      reason:
        "status-update-failed"

    };

  }

}


// ============================================================
// رد انتقال
// ============================================================

export async function rejectTransfer(
  receiverName,
  transferId
) {

  receiverName =
    String(
      receiverName || ""
    ).trim();


  if (
    !receiverName ||
    !transferId
  ) {

    return {

      ok: false,

      reason:
        "invalid"

    };

  }


  const result =
    await runTransaction(
      singleIncomingTransferRef(
        receiverName,
        transferId
      ),
      current => {

        if (!current) {
          return;
        }


        if (
          current.status !==
          "pending"
        ) {

          return;

        }


        current.status =
          "rejected";

        current.rejectedAt =
          Date.now();


        return current;

      }
    );


  if (
    !result.committed
  ) {

    return {

      ok: false,

      reason:
        "already-processed"

    };

  }


  const transfer =
    result.snapshot.val() ||
    {};


  return {

    ok: true,

    amount:
      Number(
        transfer.amount || 0
      )

  };

}


// ============================================================
// دوستان
// ============================================================

export async function sendFriendRequest(
  myName,
  targetName
) {

  myName =
    String(
      myName || ""
    ).trim();

  targetName =
    String(
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


export async function getFriendStatus(
  myName,
  targetName
) {

  myName =
    String(
      myName || ""
    ).trim();

  targetName =
    String(
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


  return {

    isFriend:
      !!(
        myProfile.friends &&
        myProfile.friends[
          targetName
        ]
      ),

    requestPending:
      !!(
        targetProfile.friendRequests &&
        targetProfile.friendRequests[
          myName
        ]
      ),

    isSelf: false

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
      [fromName]:
        true
    }
  );


  await update(
    profileRef(
      fromName,
      "friends"
    ),
    {
      [myName]:
        true
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


export async function removeFriend(
  myName,
  friendName
) {

  myName =
    String(
      myName || ""
    ).trim();

  friendName =
    String(
      friendName || ""
    ).trim();


  if (
    !myName ||
    !friendName ||
    myName === friendName
  ) {

    return {
      ok: false,
      reason: "invalid"
    };

  }


  const myProfileSnap =
    await get(
      profileRef(myName)
    );


  const myProfile =
    myProfileSnap.val() || {};


  if (
    !myProfile.friends ||
    !myProfile.friends[friendName]
  ) {

    return {
      ok: false,
      reason: "not-friend"
    };

  }


  await remove(
    profileRef(
      myName,
      `friends/${friendName}`
    )
  );


  await remove(
    profileRef(
      friendName,
      `friends/${myName}`
    )
  );


  return {
    ok: true
  };

}


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


                  let online =
                    connectionList.some(
                      x =>
                        x &&
                        x.online === true
                    );


                  if (
                    connectionList.length === 0
                  ) {

                    online =
                      presence.online === true;

                  }


                  latest[name] = {

                    name,

                    online,

                    lastSeen:
                      Number(
                        presence.lastSeen ||
                        0
                      ),

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
// دعوت دوستان
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

      from:
        myName,

      roomCode,

      at:
        Date.now()

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
    String(
      text || ""
    )
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

      at:
        Date.now()

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
      "CHAT CLEANUP ERROR:",
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
