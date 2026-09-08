import {
  waitForUser,
  getSavedName,
  getSavedRoom,
  currentUid,
  recordRoundResult,

  db,
  ref,
  set,
  get,
  onValue,
  update,
  remove,
  runTransaction,
  onDisconnect
} from "../js/app.js";


/* =========================================================
   DOM
========================================================= */

const canvas =
  document.getElementById("canvas");

const ctx =
  canvas.getContext("2d");

const arena =
  document.getElementById("arena");

const rotateScreen =
  document.getElementById("rotateScreen");

const fuelEl =
  document.getElementById("fuel");

const cargoEl =
  document.getElementById("cargo");

const powerupEl =
  document.getElementById("powerup");

const playerCountEl =
  document.getElementById("playerCount");

const objectiveEl =
  document.getElementById("objective");

const playersEl =
  document.getElementById("players");

const startMessage =
  document.getElementById("startMessage");

const messageTitle =
  document.getElementById("messageTitle");

const messageText =
  document.getElementById("messageText");

const joystick =
  document.getElementById("joystick");

const knob =
  document.getElementById("knob");

const boostButton =
  document.getElementById("boost");

const launchButton =
  document.getElementById("launch");

const fullscreenButton =
  document.getElementById("fullscreen");

const muteButton =
  document.getElementById("mute");

const result =
  document.getElementById("result");

const resultIcon =
  document.getElementById("resultIcon");

const resultTitle =
  document.getElementById("resultTitle");

const resultText =
  document.getElementById("resultText");

const resultStats =
  document.getElementById("resultStats");

const backButton =
  document.getElementById("back");


/* =========================================================
   URL / MODE
========================================================= */

const params =
  new URLSearchParams(
    location.search
  );

const roundId =
  params.get("round");

const roomCode =
  getSavedRoom();

const online =
  !!roundId &&
  !!roomCode;


/* =========================================================
   USER
========================================================= */

let uid = null;

let username =
  getSavedName() ||
  "بازیکن";


/* =========================================================
   GAME
========================================================= */

const MAX_FUEL = 100;

const RESOURCE_COUNT = 20;

const RESOURCE_RESPAWN = 5000;

const PLAYER_SPEED = 205;

const BOOST_SPEED = 330;

const BOOST_DURATION = 2200;

const BASE_RADIUS = 42;

const RESOURCE_RADIUS = 10;

const PLAYER_RADIUS = 15;

const SYNC_EVERY = 120;

let W = 1000;

let H = 600;

let dpr = 1;

let player = null;

let bot = null;

let resources = [];

let remotePlayers = {};

let running = false;

let ended = false;

let lastFrame = performance.now();

let lastSync = 0;

let winner = null;

let muted = false;

let audio = null;


/* =========================================================
   FIREBASE PATHS
========================================================= */

/*
  Rules فعلی اجازه write روی currentGame را
  به اعضای Room می‌دهد.

  پس از این مسیر استفاده می‌کنیم:

  rooms/CODE/currentGame/astra/ROUND_ID
*/

let onlineRoot = null;

let onlinePlayers = null;

let onlineResources = null;

let onlineWinner = null;


if (online) {

  onlineRoot =
    ref(
      db,
      `rooms/${roomCode}/currentGame/astra/${roundId}`
    );

  onlinePlayers =
    ref(
      db,
      `rooms/${roomCode}/currentGame/astra/${roundId}/players`
    );

  onlineResources =
    ref(
      db,
      `rooms/${roomCode}/currentGame/astra/${roundId}/resources`
    );

  onlineWinner =
    ref(
      db,
      `rooms/${roomCode}/currentGame/astra/${roundId}/winner`
    );
}


/* =========================================================
   UTILS
========================================================= */

function clamp(
  n,
  min,
  max
) {
  return Math.max(
    min,
    Math.min(max, n)
  );
}


function random(
  min,
  max
) {
  return Math.random() *
    (max - min) +
    min;
}


function distance(
  a,
  b
) {
  return Math.hypot(
    a.x - b.x,
    a.y - b.y
  );
}


function escapeHtml(
  text
) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   COLORS
========================================================= */

const COLORS = [
  "#4f8cff",
  "#ff4f81",
  "#45e6a4",
  "#ffc857",
  "#a968ff",
  "#42d8ff",
  "#ff875f",
  "#72d65f",
  "#f05cff",
  "#ffda55"
];


function colorFor(
  index
) {
  return COLORS[
    index %
    COLORS.length
  ];
}


/* =========================================================
   CANVAS
========================================================= */

function resize() {

  const rect =
    arena.getBoundingClientRect();

  W =
    Math.max(
      320,
      rect.width
    );

  H =
    Math.max(
      220,
      rect.height
    );

  dpr =
    Math.min(
      window.devicePixelRatio || 1,
      2
    );

  canvas.width =
    Math.floor(
      W * dpr
    );

  canvas.height =
    Math.floor(
      H * dpr
    );

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  createStars();
}


let stars = [];

function createStars() {

  stars = [];

  const count =
    Math.floor(
      W * H / 3200
    );

  for (
    let i = 0;
    i < count;
    i++
  ) {

    stars.push({
      x: random(0, W),
      y: random(0, H),
      r: random(.4, 1.5),
      a: random(.15, .8)
    });
  }
}


window.addEventListener(
  "resize",
  resize
);


/* =========================================================
   BASES
========================================================= */

function baseFor(
  index,
  total
) {

  if (
    total <= 1
  ) {
    return {
      x: W * .18,
      y: H * .5
    };
  }

  const angle =
    -Math.PI / 2 +
    index *
      Math.PI * 2 /
      total;

  return {
    x:
      W / 2 +
      Math.cos(angle) *
        W * .38,

    y:
      H / 2 +
      Math.sin(angle) *
        H * .34
  };
}


function playerIds() {

  return Object.keys(
    remotePlayers
  )
    .sort();
}


function myBase() {

  if (!online) {

    return {
      x: W * .18,
      y: H * .5
    };
  }

  const ids =
    playerIds();

  const index =
    Math.max(
      0,
      ids.indexOf(uid)
    );

  return baseFor(
    index,
    Math.max(
      1,
      ids.length
    )
  );
}


/* =========================================================
   PLAYER OBJECT
========================================================= */

function makePlayer(
  id,
  name,
  index,
  total
) {

  const base =
    baseFor(
      index,
      total
    );

  return {

    id,

    name,

    x: base.x,
    y: base.y,

    baseX: base.x,
    baseY: base.y,

    fuel: 0,
    cargo: 0,

    powerup: 0,

    boosting: false,
    boostUntil: 0,

    launching: false,
    launchAt: 0,

    won: false,

    color:
      colorFor(index),

    trail: []
  };
}


/* =========================================================
   LOCAL RESOURCES
========================================================= */

function makeResource(
  id
) {

  return {

    id,

    x:
      random(
        45,
        W - 45
      ),

    y:
      random(
        45,
        H - 45
      ),

    value:
      Math.floor(
        random(8, 16)
      ),

    active: true,

    respawnAt: 0,

    phase:
      random(
        0,
        Math.PI * 2
      )
  };
}


function createLocalResources() {

  resources = [];

  for (
    let i = 0;
    i < RESOURCE_COUNT;
    i++
  ) {

    resources.push(
      makeResource(
        `r${i}`
      )
    );
  }
}


/* =========================================================
   ONLINE RESOURCE INIT
========================================================= */

async function initOnlineResources() {

  for (
    let i = 0;
    i < RESOURCE_COUNT;
    i++
  ) {

    const r =
      ref(
        db,
        `rooms/${roomCode}/currentGame/astra/${roundId}/resources/r${i}`
      );

    await runTransaction(
      r,
      current => {

        if (
          current
        ) {
          return current;
        }

        const local =
          makeResource(
            `r${i}`
          );

        return {
          x: local.x,
          y: local.y,

          value: local.value,

          active: true,

          respawnAt: 0,

          phase: local.phase
        };
      }
    );
  }
}


/* =========================================================
   ONLINE PLAYER INIT
========================================================= */

async function initOnlinePlayer() {

  const p =
    ref(
      db,
      `rooms/${roomCode}/currentGame/astra/${roundId}/players/${uid}`
    );

  const idsSnap =
    await get(
      ref(
        db,
        `rooms/${roomCode}/players`
      )
    );

  const roomPlayers =
    idsSnap.val() || {};

  const ids =
    Object.keys(
      roomPlayers
    ).sort();

  const index =
    Math.max(
      0,
      ids.indexOf(uid)
    );

  const base =
    baseFor(
      index,
      Math.max(
        1,
        ids.length
      )
    );

  await runTransaction(
    p,
    current => {

      if (
        current
      ) {
        return current;
      }

      return {

        name: username,

        x: base.x,
        y: base.y,

        fuel: 0,
        cargo: 0,

        powerup: 0,

        boosting: false,

        launching: false,
        launchAt: 0,

        won: false,

        updatedAt:
          Date.now()
      };
    }
  );

  onDisconnect(p)
    .remove();
}


/* =========================================================
   ONLINE LISTENERS
========================================================= */

function listenOnline() {

  onValue(
    onlinePlayers,
    snap => {

      remotePlayers =
        snap.val() || {};

      playerCountEl.textContent =
        String(
          Math.max(
            1,
            Object.keys(
              remotePlayers
            ).length
          )
        );

      updatePlayerCards();
    }
  );


  onValue(
    onlineResources,
    snap => {

      const data =
        snap.val() || {};

      resources =
        Object.entries(
          data
        )
          .map(
            ([id, value]) => ({
              id,
              ...value
            })
          );
    }
  );


  onValue(
    onlineWinner,
    snap => {

      const value =
        snap.val();

      if (
        value &&
        !ended
      ) {

        winner =
          value;

        finishOnline(
          value === uid
        );
      }
    }
  );
}


/* =========================================================
   SYNC PLAYER
========================================================= */

function syncPlayer() {

  if (
    !online ||
    !player ||
    !uid
  ) {
    return;
  }

  const now =
    performance.now();

  if (
    now - lastSync <
    SYNC_EVERY
  ) {
    return;
  }

  lastSync =
    now;

  update(
    ref(
      db,
      `rooms/${roomCode}/currentGame/astra/${roundId}/players/${uid}`
    ),
    {

      name: username,

      x: player.x,
      y: player.y,

      fuel:
        Math.round(
          player.fuel
        ),

      cargo:
        Math.round(
          player.cargo
        ),

      powerup:
        player.powerup,

      boosting:
        player.boosting,

      launching:
        player.launching,

      launchAt:
        player.launchAt || 0,

      won:
        player.won,

      updatedAt:
        Date.now()
    }
  ).catch(
    console.warn
  );
}


/* =========================================================
   JOYSTICK
========================================================= */

let joyX = 0;

let joyY = 0;

let pointerId = null;


function moveJoystick(
  x,
  y
) {

  const rect =
    joystick.getBoundingClientRect();

  const cx =
    rect.left +
    rect.width / 2;

  const cy =
    rect.top +
    rect.height / 2;

  let dx =
    x - cx;

  let dy =
    y - cy;

  const max =
    rect.width * .34;

  const len =
    Math.hypot(
      dx,
      dy
    );

  if (
    len > max
  ) {

    dx =
      dx / len * max;

    dy =
      dy / len * max;
  }

  joyX =
    dx / max;

  joyY =
    dy / max;

  knob.style.transform =
    `translate(${dx}px,${dy}px)`;
}


function resetJoystick() {

  joyX = 0;
  joyY = 0;

  knob.style.transform =
    "translate(0,0)";
}


joystick.addEventListener(
  "pointerdown",
  e => {

    pointerId =
      e.pointerId;

    joystick.setPointerCapture(
      e.pointerId
    );

    moveJoystick(
      e.clientX,
      e.clientY
    );
  }
);


joystick.addEventListener(
  "pointermove",
  e => {

    if (
      e.pointerId !==
      pointerId
    ) {
      return;
    }

    moveJoystick(
      e.clientX,
      e.clientY
    );
  }
);


joystick.addEventListener(
  "pointerup",
  resetJoystick
);


joystick.addEventListener(
  "pointercancel",
  resetJoystick
);


/* =========================================================
   MOVEMENT
========================================================= */

function updatePlayer(
  dt,
  now
) {

  if (
    !player ||
    player.launching
  ) {
    return;
  }

  const length =
    Math.hypot(
      joyX,
      joyY
    );

  if (
    length > .02
  ) {

    const speed =
      player.boosting
        ? BOOST_SPEED
        : PLAYER_SPEED;

    player.x +=
      joyX /
      length *
      speed *
      dt;

    player.y +=
      joyY /
      length *
      speed *
      dt;

    player.trail.push({
      x: player.x,
      y: player.y
    });

    if (
      player.trail.length >
      10
    ) {
      player.trail.shift();
    }
  }

  player.x =
    clamp(
      player.x,
      PLAYER_RADIUS,
      W - PLAYER_RADIUS
    );

  player.y =
    clamp(
      player.y,
      PLAYER_RADIUS,
      H - PLAYER_RADIUS
    );

  if (
    player.boosting &&
    now >
      player.boostUntil
  ) {

    player.boosting =
      false;
  }
}


/* =========================================================
   RESOURCE CLAIM
========================================================= */

async function claimOnline(
  resource
) {

  if (
    !resource.active ||
    !player
  ) {
    return;
  }

  if (
    distance(
      player,
      resource
    ) >
    PLAYER_RADIUS +
    RESOURCE_RADIUS +
    14
  ) {
    return;
  }

  const r =
    ref(
      db,
      `rooms/${roomCode}/currentGame/astra/${roundId}/resources/${resource.id}`
    );

  let claimed = false;

  await runTransaction(
    r,
    current => {

      if (
        !current ||
        current.active !== true
      ) {
        return;
      }

      claimed =
        true;

      return {
        ...current,

        active: false,

        claimedBy: uid,

        respawnAt:
          Date.now() +
          RESOURCE_RESPAWN
      };
    }
  );

  if (
    claimed
  ) {

    player.cargo +=
      Number(
        resource.value || 10
      );

    /*
      شانس گرفتن توربو
    */

    if (
      Math.random() <
      .2
    ) {

      player.powerup =
        Math.min(
          3,
          player.powerup + 1
        );
    }

    sound(
      760,
      .08
    );
  }
}


function claimLocal(
  resource
) {

  if (
    !resource.active ||
    !player
  ) {
    return;
  }

  if (
    distance(
      player,
      resource
    ) >
    PLAYER_RADIUS +
    RESOURCE_RADIUS +
    14
  ) {
    return;
  }

  resource.active =
    false;

  resource.respawnAt =
    Date.now() +
    RESOURCE_RESPAWN;

  player.cargo +=
    resource.value;

  if (
    Math.random() <
    .2
  ) {

    player.powerup =
      Math.min(
        3,
        player.powerup + 1
      );
  }

  sound(
    760,
    .08
  );
}


/* =========================================================
   RESPAWN
========================================================= */

function updateLocalRespawns() {

  for (
    const r of resources
  ) {

    if (
      !r.active &&
      r.respawnAt &&
      Date.now() >=
        r.respawnAt
    ) {

      r.active =
        true;

      r.respawnAt =
        0;
    }
  }
}


function updateOnlineRespawns() {

  if (
    !online
  ) {
    return;
  }

  for (
    const resource of resources
  ) {

    if (
      resource.active ||
      !resource.respawnAt ||
      Date.now() <
        Number(
          resource.respawnAt
        )
    ) {
      continue;
    }

    const r =
      ref(
        db,
        `rooms/${roomCode}/currentGame/astra/${roundId}/resources/${resource.id}`
      );

    runTransaction(
      r,
      current => {

        if (
          !current ||
          current.active ||
          Date.now() <
            Number(
              current.respawnAt || 0
            )
        ) {
          return;
        }

        return {
          ...current,

          active: true,

          claimedBy: null,

          respawnAt: 0
        };
      }
    ).catch(
      () => {}
    );
  }
}


/* =========================================================
   BASE / FUEL
========================================================= */

function atBase() {

  if (
    !player
  ) {
    return false;
  }

  return Math.hypot(
    player.x -
      player.baseX,

    player.y -
      player.baseY
  ) <
    BASE_RADIUS + 20;
}


function convertFuel(
  dt
) {

  if (
    !player ||
    player.cargo <= 0 ||
    player.fuel >= MAX_FUEL
  ) {
    return;
  }

  if (
    !atBase()
  ) {
    return;
  }

  const amount =
    Math.min(
      player.cargo,
      28 * dt,
      MAX_FUEL -
        player.fuel
    );

  player.cargo -=
    amount;

  player.fuel +=
    amount;
}


/* =========================================================
   BOOST
========================================================= */

boostButton.addEventListener(
  "click",
  () => {

    if (
      !player ||
      player.powerup <= 0 ||
      ended
    ) {
      return;
    }

    player.powerup--;

    player.boosting =
      true;

    player.boostUntil =
      performance.now() +
      BOOST_DURATION;

    sound(
      1050,
      .1
    );
  }
);


/* =========================================================
   BOT
========================================================= */

function createBot() {

  bot =
    makePlayer(
      "bot",
      "ربات",
      1,
      2
    );

  bot.color =
    "#a968ff";
}


function updateBot(
  dt,
  now
) {

  if (
    !bot ||
    bot.launching
  ) {
    return;
  }

  let target = null;

  if (
    bot.cargo > 0
  ) {

    target = {
      x: bot.baseX,
      y: bot.baseY
    };

  } else {

    let best =
      Infinity;

    for (
      const r of resources
    ) {

      if (
        !r.active
      ) {
        continue;
      }

      const d =
        distance(
          bot,
          r
        );

      if (
        d < best
      ) {

        best = d;
        target = r;
      }
    }
  }

  if (
    bot.fuel >= MAX_FUEL
  ) {

    target = {
      x: bot.baseX,
      y: bot.baseY
    };
  }

  if (
    !target
  ) {
    return;
  }

  const dx =
    target.x -
    bot.x;

  const dy =
    target.y -
    bot.y;

  const d =
    Math.hypot(
      dx,
      dy
    ) || 1;

  const speed =
    bot.boosting
      ? BOOST_SPEED
      : PLAYER_SPEED * .8;

  bot.x +=
    dx / d *
    speed *
    dt;

  bot.y +=
    dy / d *
    speed *
    dt;

  bot.x =
    clamp(
      bot.x,
      PLAYER_RADIUS,
      W - PLAYER_RADIUS
    );

  bot.y =
    clamp(
      bot.y,
      PLAYER_RADIUS,
      H - PLAYER_RADIUS
    );


  for (
    const r of resources
  ) {

    if (
      r.active &&
      distance(
        bot,
        r
      ) <
      PLAYER_RADIUS +
      RESOURCE_RADIUS +
      12
    ) {

      r.active =
        false;

      r.respawnAt =
        Date.now() +
        RESOURCE_RESPAWN;

      bot.cargo +=
        r.value;

      break;
    }
  }

  convertBotFuel(
    dt
  );

  if (
    bot.powerup > 0 &&
    Math.random() <
      dt * .015
  ) {

    bot.powerup--;

    bot.boosting =
      true;

    bot.boostUntil =
      now +
      BOOST_DURATION;
  }

  if (
    bot.boosting &&
    now >
      bot.boostUntil
  ) {

    bot.boosting =
      false;
  }

  if (
    bot.fuel >= MAX_FUEL &&
    nearBotBase()
  ) {

    bot.launching =
      true;

    bot.launchAt =
      now;
  }
}


function nearBotBase() {

  return Math.hypot(
    bot.x -
      bot.baseX,

    bot.y -
      bot.baseY
  ) <
    BASE_RADIUS + 20;
}


function convertBotFuel(
  dt
) {

  if (
    bot.cargo <= 0 ||
    bot.fuel >= MAX_FUEL ||
    !nearBotBase()
  ) {
    return;
  }

  const amount =
    Math.min(
      bot.cargo,
      28 * dt,
      MAX_FUEL -
        bot.fuel
    );

  bot.cargo -=
    amount;

  bot.fuel +=
    amount;
}


/* =========================================================
   LAUNCH
========================================================= */

launchButton.addEventListener(
  "click",
  () => {

    if (
      !player ||
      ended ||
      player.launching
    ) {
      return;
    }

    if (
      player.fuel <
        MAX_FUEL ||
      !atBase()
    ) {
      return;
    }

    player.launching =
      true;

    player.launchAt =
      performance.now();

    sound(
      450,
      .15
    );

    syncPlayer();
  }
);


/* =========================================================
   WINNER
========================================================= */

async function declareWinner() {

  if (
    !online ||
    !player ||
    player.fuel <
      MAX_FUEL
  ) {
    return;
  }

  await runTransaction(
    onlineWinner,
    current => {

      if (
        current
      ) {
        return;
      }

      return uid;
    }
  );
}


async function finishOnline(
  won
) {

  if (
    ended
  ) {
    return;
  }

  ended =
    true;

  running =
    false;

  await showResult(
    won,
    won
      ? "تو زودتر از همه وارد World 2 شدی! 🚀"
      : "یک بازیکن دیگر زودتر به World 2 رسید."
  );
}


/* =========================================================
   RESULT
========================================================= */

let resultSaved =
  false;


async function showResult(
  won,
  text
) {

  if (
    resultSaved
  ) {
    return;
  }

  resultSaved =
    true;

  ended =
    true;

  running =
    false;

  resultIcon.textContent =
    won
      ? "🏆"
      : "💫";

  resultTitle.textContent =
    won
      ? "WORLD 2"
      : "مسابقه تمام شد";

  resultText.textContent =
    text;

  resultStats.innerHTML = `

    <div class="stat">
      <b>${Math.floor(
        player?.fuel || 0
      )}%</b>
      <span>سوخت</span>
    </div>

    <div class="stat">
      <b>${Math.floor(
        player?.cargo || 0
      )}</b>
      <span>Cargo</span>
    </div>

    <div class="stat">
      <b>${online ? "🌐" : "🤖"}</b>
      <span>${online ? "آنلاین" : "ربات"}</span>
    </div>

  `;

  result.classList.remove(
    "hidden"
  );

  try {

    await recordRoundResult(
      username,
      "astra",
      {
        won
      }
    );

  } catch (
    error
  ) {

    console.warn(
      "Astra result error:",
      error
    );
  }
}


/* =========================================================
   CHECK LAUNCH
========================================================= */

function checkLaunch(
  now
) {

  if (
    !player ||
    !player.launching
  ) {
    return;
  }

  if (
    now -
      player.launchAt <
    3500
  ) {
    return;
  }

  if (
    online
  ) {

    declareWinner();

  } else {

    showResult(
      true,
      "موشکت وارد World 2 شد! 🚀"
    );
  }
}


/* =========================================================
   BOT WIN
========================================================= */

function checkBotWin(
  now
) {

  if (
    online ||
    !bot ||
    !bot.launching ||
    ended
  ) {
    return;
  }

  if (
    now -
      bot.launchAt >=
    3500
  ) {

    showResult(
      false,
      "ربات زودتر وارد World 2 شد!"
    );
  }
}


/* =========================================================
   HUD
========================================================= */

function updateHUD() {

  if (
    !player
  ) {
    return;
  }

  fuelEl.textContent =
    `${Math.floor(
      player.fuel
    )}%`;

  cargoEl.textContent =
    String(
      Math.floor(
        player.cargo
      )
    );

  powerupEl.textContent =
    String(
      player.powerup
    );


  if (
    player.launching
  ) {

    const left =
      Math.max(
        0,
        4 -
          Math.floor(
            (performance.now() -
              player.launchAt) /
            1000
          )
      );

    objectiveEl.textContent =
      `🚀 پرتاب در ${left}...`;

  } else if (
    player.fuel >=
      MAX_FUEL &&
    atBase()
  ) {

    objectiveEl.textContent =
      "🚀 پرتاب آماده است!";

  } else if (
    player.cargo > 0 &&
    atBase()
  ) {

    objectiveEl.textContent =
      "⛽ در حال تبدیل Cargo به سوخت";

  } else if (
    player.cargo > 0
  ) {

    objectiveEl.textContent =
      "🏠 به Launch Pad برگرد";

  } else {

    objectiveEl.textContent =
      "💎 منابع انرژی را جمع کن";
  }


  launchButton.classList.toggle(
    "disabled",
    !(
      player.fuel >= MAX_FUEL &&
      atBase() &&
      !player.launching
    )
  );
}


/* =========================================================
   PLAYER CARDS
========================================================= */

function updatePlayerCards() {

  playersEl.innerHTML =
    "";

  if (
    !online
  ) {

    addPlayerCard(
      player,
      true
    );

    addPlayerCard(
      bot,
      false
    );

    return;
  }

  const entries =
    Object.entries(
      remotePlayers
    );

  entries.forEach(
    ([id, p], index) => {

      addPlayerCard(
        {
          ...p,
          color:
            colorFor(index)
        },
        id === uid
      );
    }
  );
}


function addPlayerCard(
  p,
  mine
) {

  if (
    !p
  ) {
    return;
  }

  const div =
    document.createElement(
      "div"
    );

  div.className =
    "player-card";

  div.innerHTML = `

    <div
      class="player-name"
      style="color:${p.color || "#55eaff"}"
    >
      ${mine ? "🚀 " : "🛸 "}
      ${escapeHtml(
        p.name || "بازیکن"
      )}
    </div>

    <div class="fuel-bar">
      <i
        style="width:${clamp(
          Number(
            p.fuel || 0
          ),
          0,
          100
        )}%"
      ></i>
    </div>

    <div
      style="
        margin-top:3px;
        color:#8792b0;
      "
    >
      ⛽ ${Math.floor(
        Number(
          p.fuel || 0
        )
      )}%
    </div>

  `;

  playersEl.appendChild(
    div
  );
}


/* =========================================================
   DRAW BACKGROUND
========================================================= */

function drawBackground(
  time
) {

  ctx.fillStyle =
    "#02040b";

  ctx.fillRect(
    0,
    0,
    W,
    H
  );


  const glow =
    ctx.createRadialGradient(
      W * .25,
      H * .25,
      0,
      W * .25,
      H * .25,
      Math.max(W,H) * .6
    );

  glow.addColorStop(
    0,
    "rgba(90,70,255,.18)"
  );

  glow.addColorStop(
    1,
    "rgba(90,70,255,0)"
  );

  ctx.fillStyle =
    glow;

  ctx.fillRect(
    0,
    0,
    W,
    H
  );


  for (
    const star of stars
  ) {

    ctx.globalAlpha =
      star.a +
      Math.sin(
        time * .002 +
        star.x
      ) * .12;

    ctx.fillStyle =
      "#ffffff";

    ctx.beginPath();

    ctx.arc(
      star.x,
      star.y,
      star.r,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  ctx.globalAlpha =
    1;


  /*
    شبکه فضایی
  */

  ctx.strokeStyle =
    "rgba(100,140,255,.045)";

  const grid = 50;

  for (
    let x = 0;
    x < W;
    x += grid
  ) {

    ctx.beginPath();

    ctx.moveTo(
      x,
      0
    );

    ctx.lineTo(
      x,
      H
    );

    ctx.stroke();
  }

  for (
    let y = 0;
    y < H;
    y += grid
  ) {

    ctx.beginPath();

    ctx.moveTo(
      0,
      y
    );

    ctx.lineTo(
      W,
      y
    );

    ctx.stroke();
  }


  /*
    سیارات
  */

  const planets = [
    [
      W * .18,
      H * .18,
      Math.min(W,H) * .1,
      "#5540d9"
    ],

    [
      W * .83,
      H * .75,
      Math.min(W,H) * .08,
      "#19579d"
    ]
  ];

  for (
    const [
      x,
      y,
      r,
      color
    ] of planets
  ) {

    const g =
      ctx.createRadialGradient(
        x-r*.3,
        y-r*.3,
        0,
        x,
        y,
        r
      );

    g.addColorStop(
      0,
      "#ffffff"
    );

    g.addColorStop(
      .2,
      color
    );

    g.addColorStop(
      1,
      "rgba(0,0,0,0)"
    );

    ctx.globalAlpha =
      .25;

    ctx.fillStyle =
      g;

    ctx.beginPath();

    ctx.arc(
      x,
      y,
      r,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.globalAlpha =
      1;
  }
}


/* =========================================================
   DRAW BASE
========================================================= */

function drawBase(
  p,
  color,
  label
) {

  if (
    !p
  ) {
    return;
  }

  ctx.save();

  ctx.shadowColor =
    color;

  ctx.shadowBlur =
    20;

  ctx.strokeStyle =
    color;

  ctx.lineWidth =
    3;

  ctx.beginPath();

  ctx.arc(
    p.x,
    p.y,
    BASE_RADIUS,
    0,
    Math.PI * 2
  );

  ctx.stroke();

  ctx.shadowBlur =
    0;

  ctx.fillStyle =
    "rgba(255,255,255,.04)";

  ctx.beginPath();

  ctx.arc(
    p.x,
    p.y,
    24,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.strokeStyle =
    color;

  for (
    let i = 0;
    i < 4;
    i++
  ) {

    const a =
      i *
      Math.PI / 2;

    ctx.beginPath();

    ctx.moveTo(
      p.x +
        Math.cos(a) *
        18,

      p.y +
        Math.sin(a) *
        18
    );

    ctx.lineTo(
      p.x +
        Math.cos(a) *
        32,

      p.y +
        Math.sin(a) *
        32
    );

    ctx.stroke();
  }

  ctx.fillStyle =
    "#dce7ff";

  ctx.font =
    "bold 9px Tahoma";

  ctx.textAlign =
    "center";

  ctx.fillText(
    label,
    p.x,
    p.y +
      BASE_RADIUS +
      14
  );

  ctx.restore();
}


/* =========================================================
   DRAW RESOURCE
========================================================= */

function drawResource(
  r,
  time
) {

  if (
    !r.active
  ) {
    return;
  }

  const pulse =
    1 +
    Math.sin(
      time * .004 +
      (r.phase || 0)
    ) * .12;

  ctx.save();

  ctx.translate(
    r.x,
    r.y
  );

  ctx.scale(
    pulse,
    pulse
  );

  ctx.shadowColor =
    "#4deaff";

  ctx.shadowBlur =
    18;

  ctx.fillStyle =
    "#4deaff";

  ctx.beginPath();

  for (
    let i = 0;
    i < 6;
    i++
  ) {

    const angle =
      -Math.PI/2 +
      i *
        Math.PI/3;

    const radius =
      i % 2 === 0
        ? 10
        : 6;

    const x =
      Math.cos(angle) *
      radius;

    const y =
      Math.sin(angle) *
      radius;

    if (
      i === 0
    ) {
      ctx.moveTo(
        x,
        y
      );
    } else {
      ctx.lineTo(
        x,
        y
      );
    }
  }

  ctx.closePath();

  ctx.fill();

  ctx.restore();
}


/* =========================================================
   DRAW SHIP
========================================================= */

function drawShip(
  p,
  mine
) {

  if (
    !p
  ) {
    return;
  }

  ctx.save();

  /*
    Trail
  */

  if (
    p.trail
  ) {

    p.trail.forEach(
      (point, index) => {

        ctx.globalAlpha =
          index /
          p.trail.length *
          .3;

        ctx.fillStyle =
          p.color ||
          "#55eaff";

        ctx.beginPath();

        ctx.arc(
          point.x,
          point.y,
          2 + index / 4,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }
    );

    ctx.globalAlpha =
      1;
  }


  /*
    شعله موشک
  */

  if (
    p.launching
  ) {

    const flame =
      20 +
      Math.random() * 12;

    const g =
      ctx.createLinearGradient(
        p.x,
        p.y + 8,
        p.x,
        p.y + flame
      );

    g.addColorStop(
      0,
      "#ffffff"
    );

    g.addColorStop(
      .3,
      "#4deaff"
    );

    g.addColorStop(
      1,
      "rgba(80,80,255,0)"
    );

    ctx.fillStyle =
      g;

    ctx.beginPath();

    ctx.moveTo(
      p.x - 6,
      p.y + 7
    );

    ctx.lineTo(
      p.x,
      p.y + flame
    );

    ctx.lineTo(
      p.x + 6,
      p.y + 7
    );

    ctx.closePath();

    ctx.fill();
  }


  ctx.shadowColor =
    p.color ||
    "#55eaff";

  ctx.shadowBlur =
    mine ? 24 : 13;

  ctx.fillStyle =
    p.color ||
    "#55eaff";

  ctx.beginPath();

  ctx.moveTo(
    p.x,
    p.y - 16
  );

  ctx.lineTo(
    p.x - 11,
    p.y + 11
  );

  ctx.lineTo(
    p.x,
    p.y + 6
  );

  ctx.lineTo(
    p.x + 11,
    p.y + 11
  );

  ctx.closePath();

  ctx.fill();

  ctx.shadowBlur =
    0;

  ctx.fillStyle =
    "#e8ffff";

  ctx.beginPath();

  ctx.arc(
    p.x,
    p.y - 4,
    4,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /*
    اسم
  */

  ctx.fillStyle =
    "#eaf2ff";

  ctx.font =
    "bold 9px Tahoma";

  ctx.textAlign =
    "center";

  ctx.fillText(
    p.name || "بازیکن",
    p.x,
    p.y - 24
  );


  /*
    سوخت کوچک
  */

  ctx.fillStyle =
    "rgba(255,255,255,.12)";

  ctx.fillRect(
    p.x - 18,
    p.y + 18,
    36,
    4
  );

  ctx.fillStyle =
    "#55eaff";

  ctx.fillRect(
    p.x - 18,
    p.y + 18,
    36 *
      clamp(
        Number(
          p.fuel || 0
        ) / 100,
        0,
        1
      ),
    4
  );

  ctx.restore();
}


/* =========================================================
   DRAW
========================================================= */

function draw(
  time
) {

  drawBackground(
    time
  );


  /*
    پایگاه‌ها
  */

  if (
    online
  ) {

    const ids =
      playerIds();

    ids.forEach(
      (id, index) => {

        const p =
          remotePlayers[id];

        const base =
          baseFor(
            index,
            Math.max(
              1,
              ids.length
            )
          );

        drawBase(
          base,
          colorFor(index),
          id === uid
            ? "Launch Pad تو"
            : "Launch Pad"
        );
      }
    );

  } else {

    drawBase(
      {
        x: player.baseX,
        y: player.baseY
      },
      player.color,
      "Launch Pad تو"
    );

    drawBase(
      {
        x: bot.baseX,
        y: bot.baseY
      },
      bot.color,
      "Launch Pad ربات"
    );
  }


  /*
    منابع
  */

  resources.forEach(
    r =>
      drawResource(
        r,
        time
      )
  );


  /*
    بازیکنان آنلاین
  */

  if (
    online
  ) {

    const ids =
      playerIds();

    ids.forEach(
      (id, index) => {

        if (
          id === uid
        ) {
          return;
        }

        const p =
          remotePlayers[id];

        if (
          !p
        ) {
          return;
        }

        drawShip(
          {
            ...p,

            color:
              colorFor(index),

            trail: []
          },
          false
        );
      }
    );
  }


  /*
    ربات
  */

  if (
    !online &&
    bot
  ) {

    drawShip(
      bot,
      false
    );
  }


  /*
    بازیکن خودمان
  */

  if (
    player
  ) {

    drawShip(
      player,
      true
    );
  }
}


/* =========================================================
   GAME LOOP
========================================================= */

function update(
  dt,
  now
) {

  if (
    !running ||
    ended ||
    !player
  ) {
    return;
  }


  updatePlayer(
    dt,
    now
  );


  if (
    online
  ) {

    for (
      const r of resources
    ) {

      if (
        r.active
      ) {

        claimOnline(
          r
        );
      }
    }

    updateOnlineRespawns();

  } else {

    updateLocalRespawns();

    for (
      const r of resources
    ) {

      claimLocal(
        r
      );
    }

    updateBot(
      dt,
      now
    );
  }


  convertFuel(
    dt
  );


  syncPlayer();

  checkLaunch(
    now
  );

  checkBotWin(
    now
  );

  updateHUD();

  updatePlayerCards();
}


function loop(
  time
) {

  const dt =
    Math.min(
      .05,
      (time -
        lastFrame) /
        1000
    );

  lastFrame =
    time;

  update(
    dt,
    time
  );

  draw(
    time
  );

  requestAnimationFrame(
    loop
  );
}


/* =========================================================
   AUDIO
========================================================= */

function sound(
  frequency,
  duration
) {

  if (
    muted
  ) {
    return;
  }

  try {

    if (
      !audio
    ) {

      audio =
        new (
          window.AudioContext ||
          window.webkitAudioContext
        )();
    }

    const oscillator =
      audio.createOscillator();

    const gain =
      audio.createGain();

    oscillator.frequency.value =
      frequency;

    oscillator.type =
      "sine";

    gain.gain.setValueAtTime(
      .07,
      audio.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      .001,
      audio.currentTime +
        duration
    );

    oscillator.connect(
      gain
    );

    gain.connect(
      audio.destination
    );

    oscillator.start();

    oscillator.stop(
      audio.currentTime +
        duration
    );

  } catch {}
}


muteButton.addEventListener(
  "click",
  () => {

    muted =
      !muted;

    muteButton.textContent =
      muted
        ? "🔇"
        : "🔊";
  }
);


/* =========================================================
   FULLSCREEN
========================================================= */

fullscreenButton.addEventListener(
  "click",
  async () => {

    try {

      if (
        !document.fullscreenElement
      ) {

        await document.documentElement
          .requestFullscreen();

      } else {

        await document.exitFullscreen();
      }

    } catch {}
  }
);


/* =========================================================
   BACK
========================================================= */

backButton.addEventListener(
  "click",
  () => {

    if (
      online
    ) {

      location.href =
        "../lobby.html";

    } else {

      location.href =
        "../index.html";
    }
  }
);


/* =========================================================
   ORIENTATION
========================================================= */

function orientation() {

  const portrait =
    innerHeight >
    innerWidth;

  rotateScreen.classList.toggle(
    "show",
    portrait
  );

  if (
    portrait
  ) {

    running =
      false;

  } else if (
    player &&
    !ended
  ) {

    running =
      true;

    lastFrame =
      performance.now();
  }
}


window.addEventListener(
  "resize",
  orientation
);

window.addEventListener(
  "orientationchange",
  orientation
);


/* =========================================================
   START
========================================================= */

async function start() {

  try {

    const user =
      await waitForUser();

    if (
      !user
    ) {

      location.href =
        "../index.html";

      return;
    }


    uid =
      currentUid();

    username =
      getSavedName() ||
      user.displayName ||
      "بازیکن";


    resize();


    if (
      online
    ) {

      /*
        ONLINE
      */

      messageTitle.textContent =
        "🌐 بازی آنلاین";

      messageText.textContent =
        "همه بازیکنان وارد میدان می‌شوند";

      await initOnlineResources();

      await initOnlinePlayer();

      /*
        بعد از ساخت player، snapshot فعلی
        را هم می‌گیریم.
      */

      const snap =
        await get(
          onlinePlayers
        );

      remotePlayers =
        snap.val() || {};

      const ids =
        playerIds();

      const index =
        Math.max(
          0,
          ids.indexOf(uid)
        );

      const base =
        baseFor(
          index,
          Math.max(
            1,
            ids.length
          )
        );

      player =
        makePlayer(
          uid,
          username,
          index,
          Math.max(
            1,
            ids.length
          )
        );

      /*
        موقعیت را از Firebase می‌گیریم
        تا هنگام ورود بازیکن جابه‌جا نشود.
      */

      const own =
        remotePlayers[uid];

      if (
        own
      ) {

        player.x =
          Number(
            own.x ??
            base.x
          );

        player.y =
          Number(
            own.y ??
            base.y
          );

        player.baseX =
          base.x;

        player.baseY =
          base.y;

        player.fuel =
          Number(
            own.fuel || 0
          );

        player.cargo =
          Number(
            own.cargo || 0
          );

        player.powerup =
          Number(
            own.powerup || 0
          );
      }

      listenOnline();

      hideMessage(
        "💎 منابع را جمع کن!"
      );

    } else {

      /*
        SOLO
      */

      messageTitle.textContent =
        "🤖 تک‌نفره";

      messageText.textContent =
        "از ربات زودتر به World 2 برس";

      createLocalResources();

      player =
        makePlayer(
          "me",
          username,
          0,
          2
        );

      player.color =
        "#4f8cff";

      createBot();

      hideMessage(
        "💎 منابع را جمع کن!"
      );
    }


    running =
      true;

    orientation();

    updatePlayerCards();

    requestAnimationFrame(
      loop
    );

  } catch (
    error
  ) {

    console.error(
      "ASTRA ERROR:",
      error
    );

    messageTitle.textContent =
      "⚠️ خطا";

    messageText.textContent =
      "Astra اجرا نشد. صفحه را دوباره باز کن.";

  }
}


function hideMessage(
  text
) {

  messageText.textContent =
    text;

  setTimeout(
    () => {

      startMessage.classList.add(
        "hidden"
      );

    },
    1700
  );
}


/* =========================================================
   VISIBILITY
========================================================= */

document.addEventListener(
  "visibilitychange",
  () => {

    if (
      document.hidden
    ) {

      running =
        false;

    } else if (
      player &&
      !ended &&
      innerWidth >
        innerHeight
    ) {

      running =
        true;

      lastFrame =
        performance.now();
    }
  }
);


/* =========================================================
   BOOT
========================================================= */

orientation();

start();
