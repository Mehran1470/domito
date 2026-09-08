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
  document.getElementById("astraCanvas");

const ctx =
  canvas.getContext("2d");

const arena =
  document.getElementById("astraArena");

const rotateScreen =
  document.getElementById("astraRotateScreen");

const message =
  document.getElementById("astraMessage");

const messageSub =
  document.getElementById("messageSub");

const hudMode =
  document.getElementById("hudMode");

const hudFuel =
  document.getElementById("hudFuel");

const hudCargo =
  document.getElementById("hudCargo");

const hudPlayers =
  document.getElementById("hudPlayers");

const hudObjective =
  document.getElementById("hudObjective");

const playersPanel =
  document.getElementById("playersPanel");

const joyBase =
  document.getElementById("joyBase");

const joyKnob =
  document.getElementById("joyKnob");

const boostButton =
  document.getElementById("boostButton");

const launchButton =
  document.getElementById("launchButton");

const fullscreenButton =
  document.getElementById("fullscreenButton");

const muteButton =
  document.getElementById("muteButton");

const resultScreen =
  document.getElementById("resultScreen");

const resultIcon =
  document.getElementById("resultIcon");

const resultTitle =
  document.getElementById("resultTitle");

const resultText =
  document.getElementById("resultText");

const resultStats =
  document.getElementById("resultStats");

const backButton =
  document.getElementById("backButton");


/* =========================================================
   CONSTANTS
========================================================= */

const MAX_FUEL = 100;

const RESOURCE_COUNT = 22;

const PLAYER_RADIUS = 15;

const RESOURCE_RADIUS = 10;

const BASE_RADIUS = 38;

const PLAYER_SPEED = 205;

const BOOST_SPEED = 330;

const BOOST_TIME = 2.4;

const RESOURCE_RESPAWN = 5000;

const SYNC_INTERVAL = 100;

const BASE_TRANSFER_RATE = 30;

const WORLD_PADDING = 35;


/* =========================================================
   GAME MODE
========================================================= */

const url =
  new URL(window.location.href);

const roundParam =
  url.searchParams.get("round");

const savedRoom =
  getSavedRoom();

const isOnline =
  !!roundParam &&
  !!savedRoom;

let myUid = null;

let myName =
  getSavedName() || "بازیکن";


/*
  خیلی مهم:

  Room بازی را با ?round=... باز می‌کند.

  بنابراین:
  Main Page -> Solo
  Room     -> Online
*/

let mode =
  isOnline
    ? "online"
    : "solo";


/* =========================================================
   FIREBASE REFERENCES
========================================================= */

let gameRoot = null;

let onlinePlayersRef = null;

let onlineResourcesRef = null;

let onlineWinnerRef = null;


/* =========================================================
   WORLD
========================================================= */

let W = 1000;

let H = 600;

let dpr = 1;

let stars = [];

let planets = [];

let resources = [];

let otherPlayers = {};

let winnerUid = null;


/* =========================================================
   LOCAL PLAYER
========================================================= */

let player = null;

let bot = null;

let running = false;

let gameEnded = false;

let initialized = false;

let lastFrame = performance.now();

let lastSync = 0;

let resourceRespawnTimer = 0;

let botTimer = 0;

let launchCountdown = 0;

let launchStartedAt = 0;


/* =========================================================
   JOYSTICK
========================================================= */

let joy = {
  x: 0,
  y: 0
};

let joyPointerId = null;


/* =========================================================
   AUDIO
========================================================= */

let audioContext = null;

let muted = false;


/* =========================================================
   UTILS
========================================================= */

function random(min, max) {
  return Math.random() *
    (max - min) +
    min;
}


function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}


function distance(a, b) {
  return Math.hypot(
    a.x - b.x,
    a.y - b.y
  );
}


function makeId() {
  return (
    Math.random()
      .toString(36)
      .slice(2) +
    Date.now().toString(36)
  );
}


/* =========================================================
   COLORS
========================================================= */

const PLAYER_COLORS = [
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


function colorForIndex(index) {
  return PLAYER_COLORS[
    index %
    PLAYER_COLORS.length
  ];
}


/* =========================================================
   CANVAS
========================================================= */

function resizeCanvas() {
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
    Math.floor(W * dpr);

  canvas.height =
    Math.floor(H * dpr);

  canvas.style.width =
    `${W}px`;

  canvas.style.height =
    `${H}px`;

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  generateBackground();

  if (player) {
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
  }
}


window.addEventListener(
  "resize",
  resizeCanvas
);


function generateBackground() {
  stars = [];

  const count =
    Math.floor(
      (W * H) / 3000
    );

  for (
    let i = 0;
    i < count;
    i++
  ) {
    stars.push({
      x: random(0, W),
      y: random(0, H),
      r: random(.4, 1.8),
      tw: random(0, Math.PI * 2)
    });
  }

  planets = [
    {
      x: W * .18,
      y: H * .2,
      r: Math.min(W, H) * .12,
      color: "#5544d9"
    },

    {
      x: W * .82,
      y: H * .72,
      r: Math.min(W, H) * .1,
      color: "#174e99"
    },

    {
      x: W * .55,
      y: H * .48,
      r: Math.min(W, H) * .055,
      color: "#67388e"
    }
  ];
}


/* =========================================================
   BASE POSITION
========================================================= */

function getBasePosition(index, total) {

  if (total <= 1) {
    return {
      x: W * .5,
      y: H * .82
    };
  }

  /*
    بازیکنان دور لبه پخش می‌شوند.
    بنابراین برای ۲، ۳، ۴ یا تعداد بیشتر
    هر نفر Launch Pad خودش را دارد.
  */

  const angle =
    -Math.PI / 2 +
    (Math.PI * 2 * index) /
      total;

  const rx =
    Math.max(
      130,
      W * .38
    );

  const ry =
    Math.max(
      90,
      H * .34
    );

  return {
    x:
      W / 2 +
      Math.cos(angle) * rx,

    y:
      H / 2 +
      Math.sin(angle) * ry
  };
}


function localBasePosition() {

  if (mode === "solo") {
    return {
      x: W * .15,
      y: H * .5
    };
  }

  const ids =
    Object.keys(otherPlayers)
      .concat(myUid || "")
      .filter(Boolean)
      .sort();

  const index =
    Math.max(
      0,
      ids.indexOf(myUid)
    );

  return getBasePosition(
    index,
    Math.max(1, ids.length)
  );
}


/* =========================================================
   RESOURCE GENERATION
========================================================= */

function createResource(index) {

  let x;
  let y;

  /*
    منابع را خیلی نزدیک Launch Pad ها
    قرار نمی‌دهیم.
  */

  for (
    let tries = 0;
    tries < 50;
    tries++
  ) {

    x =
      random(
        WORLD_PADDING,
        W - WORLD_PADDING
      );

    y =
      random(
        WORLD_PADDING,
        H - WORLD_PADDING
      );

    const centerDistance =
      Math.hypot(
        x - W / 2,
        y - H / 2
      );

    if (
      centerDistance >
      Math.min(W, H) * .12
    ) {
      break;
    }
  }

  return {
    id:
      `r_${index}_${makeId()}`,

    x,
    y,

    value:
      Math.floor(
        random(8, 17)
      ),

    active: true,

    claimedBy: null,

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
      createResource(i)
    );
  }
}


/* =========================================================
   PLAYER FACTORY
========================================================= */

function createPlayer(
  id,
  name,
  index,
  total
) {

  const base =
    getBasePosition(
      index,
      total
    );

  return {

    id,

    name,

    x:
      base.x,

    y:
      base.y,

    baseX:
      base.x,

    baseY:
      base.y,

    fuel: 0,

    cargo: 0,

    powerup: 0,

    boosting: false,

    boostUntil: 0,

    launching: false,

    launchStartedAt: 0,

    won: false,

    color:
      colorForIndex(index),

    trail: []

  };
}


/* =========================================================
   INITIALIZE LOCAL PLAYER
========================================================= */

function initializeLocalPlayer() {

  if (mode === "solo") {

    player =
      createPlayer(
        "player",
        myName,
        0,
        2
      );

    bot =
      createPlayer(
        "bot",
        "ربات",
        1,
        2
      );

    bot.color =
      "#a968ff";

    return;
  }


  /*
    Online:

    ابتدا اعضای Room را می‌خوانیم.
    اگر بازیکن هنوز در لیست نباشد،
    خودمان را به Room اضافه می‌کنیم.
  */

  const roomPlayersRef =
    ref(
      db,
      `rooms/${savedRoom}/players`
    );

  onValue(
    roomPlayersRef,
    snap => {

      const roomPlayers =
        snap.val() || {};

      const ids =
        Object.keys(
          roomPlayers
        ).sort();

      const total =
        Math.max(
          1,
          ids.length
        );

      const index =
        Math.max(
          0,
          ids.indexOf(myUid)
        );

      if (!player) {

        player =
          createPlayer(
            myUid,
            myName,
            index,
            total
          );
      }

      hudPlayers.textContent =
        String(total);
    }
  );
}


/* =========================================================
   FIREBASE PATHS
========================================================= */

function setupOnlineRefs() {

  if (!isOnline) {
    return;
  }

  gameRoot =
    ref(
      db,
      `rooms/${savedRoom}/astraGame/${roundParam}`
    );

  onlinePlayersRef =
    ref(
      db,
      `rooms/${savedRoom}/astraGame/${roundParam}/players`
    );

  onlineResourcesRef =
    ref(
      db,
      `rooms/${savedRoom}/astraGame/${roundParam}/resources`
    );

  onlineWinnerRef =
    ref(
      db,
      `rooms/${savedRoom}/astraGame/${roundParam}/winner`
    );
}


/* =========================================================
   ONLINE PLAYER REGISTRATION
========================================================= */

async function registerOnlinePlayer() {

  if (!isOnline) {
    return;
  }

  const roomPlayerRef =
    ref(
      db,
      `rooms/${savedRoom}/players/${myUid}`
    );

  const roomPlayerSnap =
    await get(roomPlayerRef);

  /*
    Room normally already added us.
    This is only a safety fallback.
  */

  if (!roomPlayerSnap.exists()) {

    await set(
      roomPlayerRef,
      {
        name: myName,
        joinedAt: Date.now()
      }
    );
  }

  const ownRef =
    ref(
      db,
      `rooms/${savedRoom}/astraGame/${roundParam}/players/${myUid}`
    );

  onDisconnect(
    ownRef
  ).remove();

  await runTransaction(
    ownRef,
    current => {

      if (current) {
        return current;
      }

      const base =
        localBasePosition();

      return {
        name: myName,

        x: base.x,
        y: base.y,

        fuel: 0,
        cargo: 0,

        powerup: 0,

        boosting: false,

        launching: false,

        launchStartedAt: 0,

        won: false,

        updatedAt: Date.now()
      };
    }
  );
}


/* =========================================================
   ONLINE RESOURCE INITIALIZATION
========================================================= */

async function initializeOnlineResources() {

  if (!isOnline) {
    return;
  }

  /*
    هر resource جداگانه با transaction ساخته می‌شود.
    بنابراین اگر ۵ نفر همزمان Astra را باز کنند،
    منابع دوبار ساخته نمی‌شوند.
  */

  for (
    let i = 0;
    i < RESOURCE_COUNT;
    i++
  ) {

    const resourceRef =
      ref(
        db,
        `rooms/${savedRoom}/astraGame/${roundParam}/resources/r${i}`
      );

    await runTransaction(
      resourceRef,
      current => {

        if (current) {
          return current;
        }

        const resource =
          createResource(i);

        return {
          x: resource.x,
          y: resource.y,

          value: resource.value,

          active: true,

          claimedBy: null,

          respawnAt: 0,

          phase: resource.phase
        };
      }
    );
  }
}


/* =========================================================
   ONLINE LISTENERS
========================================================= */

function startOnlineListeners() {

  if (!isOnline) {
    return;
  }

  onValue(
    onlinePlayersRef,
    snap => {

      otherPlayers =
        snap.val() || {};

      renderPlayersPanel();
    }
  );


  onValue(
    onlineResourcesRef,
    snap => {

      const data =
        snap.val() || {};

      resources =
        Object.entries(data)
          .map(
            ([id, value]) => ({
              id,
              ...value
            })
          );
    }
  );


  onValue(
    onlineWinnerRef,
    snap => {

      const uid =
        snap.val();

      if (
        uid &&
        !gameEnded
      ) {

        winnerUid =
          uid;

        finishOnlineGame(
          uid
        );
      }
    }
  );
}


/* =========================================================
   SYNC LOCAL PLAYER
========================================================= */

function syncOnlinePlayer() {

  if (
    !isOnline ||
    !player ||
    !myUid
  ) {
    return;
  }

  const now =
    performance.now();

  if (
    now - lastSync <
    SYNC_INTERVAL
  ) {
    return;
  }

  lastSync =
    now;

  update(
    ref(
      db,
      `rooms/${savedRoom}/astraGame/${roundParam}/players/${myUid}`
    ),
    {
      name: myName,

      x: player.x,
      y: player.y,

      fuel: Math.round(
        player.fuel
      ),

      cargo: Math.round(
        player.cargo
      ),

      powerup:
        player.powerup,

      boosting:
        player.boosting,

      launching:
        player.launching,

      launchStartedAt:
        player.launchStartedAt || 0,

      won:
        player.won,

      updatedAt:
        Date.now()
    }
  ).catch(
    error => {
      console.warn(
        "Astra sync error:",
        error
      );
    }
  );
}


/* =========================================================
   LOCAL RESOURCE CLAIM
========================================================= */

async function claimOnlineResource(
  resource
) {

  if (
    !isOnline ||
    !player ||
    !resource.active
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
    15
  ) {
    return;
  }

  const resourceRef =
    ref(
      db,
      `rooms/${savedRoom}/astraGame/${roundParam}/resources/${resource.id}`
    );

  let claimed =
    false;

  await runTransaction(
    resourceRef,
    current => {

      if (
        !current ||
        current.active !== true
      ) {
        return;
      }

      claimed = true;

      return {
        ...current,

        active: false,

        claimedBy: myUid,

        respawnAt:
          Date.now() +
          RESOURCE_RESPAWN
      };
    }
  );

  if (claimed) {

    player.cargo +=
      Number(
        resource.value || 10
      );

    /*
      گاهی یک Turbo شخصی می‌گیری.
      این پاورآپ مشترک نیست.
    */

    if (
      Math.random() <
      0.18
    ) {
      player.powerup =
        Math.min(
          3,
          player.powerup + 1
        );
    }

    playTone(
      780,
      .08
    );
  }
}


/* =========================================================
   RESOURCE RESPAWN
========================================================= */

async function updateOnlineRespawns() {

  if (!isOnline) {
    return;
  }

  const now =
    Date.now();

  for (
    const resource of resources
  ) {

    if (
      resource.active ||
      !resource.respawnAt ||
      resource.respawnAt >
        now
    ) {
      continue;
    }

    const resourceRef =
      ref(
        db,
        `rooms/${savedRoom}/astraGame/${roundParam}/resources/${resource.id}`
      );

    runTransaction(
      resourceRef,
      current => {

        if (
          !current ||
          current.active ||
          Number(
            current.respawnAt || 0
          ) > Date.now()
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
   LOCAL RESOURCE CLAIM
========================================================= */

function claimLocalResource(
  resource
) {

  if (
    !resource.active
  ) {
    return false;
  }

  if (
    distance(
      player,
      resource
    ) >
    PLAYER_RADIUS +
    RESOURCE_RADIUS +
    12
  ) {
    return false;
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
    .18
  ) {
    player.powerup =
      Math.min(
        3,
        player.powerup + 1
      );
  }

  playTone(
    780,
    .08
  );

  return true;
}


/* =========================================================
   BASE / FUEL
========================================================= */

function nearBase(p) {

  return Math.hypot(
    p.x - p.baseX,
    p.y - p.baseY
  ) <
  BASE_RADIUS + 20;
}


function convertCargoToFuel(
  p,
  dt
) {

  if (
    p.cargo <= 0 ||
    p.fuel >= MAX_FUEL
  ) {
    return;
  }

  if (
    !nearBase(p)
  ) {
    return;
  }

  const transfer =
    Math.min(
      p.cargo,
      BASE_TRANSFER_RATE * dt,
      MAX_FUEL - p.fuel
    );

  p.cargo -=
    transfer;

  p.fuel +=
    transfer;
}


/* =========================================================
   BOOST
========================================================= */

function useBoost() {

  if (
    !player ||
    player.powerup <= 0 ||
    gameEnded
  ) {
    return;
  }

  player.powerup--;

  player.boosting =
    true;

  player.boostUntil =
    performance.now() +
    BOOST_TIME * 1000;

  playTone(
    1100,
    .12
  );
}


boostButton.addEventListener(
  "click",
  useBoost
);


/* =========================================================
   JOYSTICK
========================================================= */

function updateJoystick(
  clientX,
  clientY
) {

  const rect =
    joyBase.getBoundingClientRect();

  const centerX =
    rect.left +
    rect.width / 2;

  const centerY =
    rect.top +
    rect.height / 2;

  let dx =
    clientX -
    centerX;

  let dy =
    clientY -
    centerY;

  const max =
    rect.width *
    .34;

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

  joy.x =
    dx / max;

  joy.y =
    dy / max;

  joyKnob.style.transform =
    `translate(${dx}px, ${dy}px)`;
}


function resetJoystick() {

  joy.x = 0;
  joy.y = 0;

  joyKnob.style.transform =
    "translate(0,0)";
}


joyBase.addEventListener(
  "pointerdown",
  event => {

    joyPointerId =
      event.pointerId;

    joyBase.setPointerCapture(
      event.pointerId
    );

    updateJoystick(
      event.clientX,
      event.clientY
    );
  }
);


joyBase.addEventListener(
  "pointermove",
  event => {

    if (
      event.pointerId !==
      joyPointerId
    ) {
      return;
    }

    updateJoystick(
      event.clientX,
      event.clientY
    );
  }
);


joyBase.addEventListener(
  "pointerup",
  event => {

    if (
      event.pointerId ===
      joyPointerId
    ) {
      joyPointerId =
        null;

      resetJoystick();
    }
  }
);


joyBase.addEventListener(
  "pointercancel",
  () => {

    joyPointerId =
      null;

    resetJoystick();
  }
);


/* =========================================================
   PLAYER MOVEMENT
========================================================= */

function updatePlayer(
  dt,
  now
) {

  if (
    !player ||
    player.launching ||
    gameEnded
  ) {
    return;
  }

  const magnitude =
    Math.min(
      1,
      Math.hypot(
        joy.x,
        joy.y
      )
    );

  if (
    magnitude >
    .02
  ) {

    const length =
      Math.hypot(
        joy.x,
        joy.y
      ) || 1;

    const speed =
      player.boosting
        ? BOOST_SPEED
        : PLAYER_SPEED;

    player.x +=
      joy.x /
      length *
      speed *
      magnitude *
      dt;

    player.y +=
      joy.y /
      length *
      speed *
      magnitude *
      dt;

    player.trail.push({
      x: player.x,
      y: player.y
    });

    if (
      player.trail.length >
      12
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
   BOT
========================================================= */

function updateBot(
  dt,
  now
) {

  if (
    !bot ||
    bot.launching ||
    gameEnded
  ) {
    return;
  }

  botTimer -= dt;

  let target =
    null;

  if (
    bot.cargo > 0
  ) {

    /*
      وقتی Cargo دارد،
      اول برمی‌گردد به پایگاه.
    */

    target = {
      x: bot.baseX,
      y: bot.baseY
    };

  } else {

    /*
      نزدیک‌ترین منبع فعال.
    */

    let bestDistance =
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
        d <
        bestDistance
      ) {
        bestDistance =
          d;

        target =
          r;
      }
    }
  }

  /*
    اگر سوخت کامل شد،
    به Launch Pad می‌رود.
  */

  if (
    bot.fuel >=
    MAX_FUEL
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
      : PLAYER_SPEED *
        .82;

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

  /*
    Bot resource collection
  */

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
      10
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

  convertCargoToFuel(
    bot,
    dt
  );

  /*
    Bot خودش Turbo دارد.
  */

  if (
    bot.powerup >
      0 &&
    Math.random() <
      dt * .02
  ) {

    bot.powerup--;

    bot.boosting =
      true;

    bot.boostUntil =
      now +
      BOOST_TIME *
      1000;
  }

  if (
    bot.boosting &&
    now >
      bot.boostUntil
  ) {
    bot.boosting =
      false;
  }

  /*
    Bot launch
  */

  if (
    bot.fuel >=
      MAX_FUEL &&
    nearBase(bot) &&
    !bot.launching
  ) {

    startBotLaunch();
  }
}


/* =========================================================
   BOT LAUNCH
========================================================= */

function startBotLaunch() {

  bot.launching =
    true;

  bot.launchStartedAt =
    performance.now();

  playTone(
    500,
    .15
  );
}


/* =========================================================
   ONLINE RESOURCE UPDATE
========================================================= */

function updateOnlineResourceCollection() {

  if (
    !isOnline ||
    !player ||
    gameEnded
  ) {
    return;
  }

  for (
    const resource of resources
  ) {

    if (
      resource.active
    ) {

      claimOnlineResource(
        resource
      );
    }
  }
}


/* =========================================================
   LAUNCH
========================================================= */

function canLaunch() {

  return (
    player &&
    player.fuel >=
      MAX_FUEL &&
    nearBase(player) &&
    !player.launching &&
    !gameEnded
  );
}


function updateLaunchButton() {

  const ready =
    canLaunch();

  launchButton.classList.toggle(
    "disabled",
    !ready
  );

  launchButton.textContent =
    ready
      ? "🚀 پرتاب"
      : "🔒 پرتاب";
}


launchButton.addEventListener(
  "click",
  () => {

    if (
      !canLaunch()
    ) {
      return;
    }

    startPlayerLaunch();
  }
);


function startPlayerLaunch() {

  player.launching =
    true;

  player.launchStartedAt =
    performance.now();

  launchCountdown =
    3;

  playTone(
    480,
    .12
  );

  if (
    isOnline
  ) {
    syncOnlinePlayer();
  }
}


/* =========================================================
   WIN
========================================================= */

async function finishOnlineWin() {

  if (
    gameEnded
  ) {
    return;
  }

  gameEnded =
    true;

  running =
    false;

  const won =
    winnerUid ===
    myUid;

  await showResult(
    won,
    won
      ? "تو اولین نفری بودی که به World 2 رسیدی!"
      : "یک بازیکن دیگر زودتر به World 2 رسید."
  );
}


async function declareOnlineWinner() {

  if (
    !isOnline ||
    !player ||
    player.fuel <
      MAX_FUEL
  ) {
    return;
  }

  const winnerRef =
    onlineWinnerRef;

  try {

    await runTransaction(
      winnerRef,
      current => {

        if (
          current
        ) {
          return;
        }

        return myUid;
      }
    );

  } catch (error) {

    console.error(
      "Winner transaction:",
      error
    );
  }
}


/* =========================================================
   SOLO WIN CHECK
========================================================= */

function checkSoloWinner() {

  if (
    mode !== "solo" ||
    gameEnded
  ) {
    return;
  }

  if (
    player.launching
  ) {

    const elapsed =
      performance.now() -
      player.launchStartedAt;

    if (
      elapsed >=
      3500
    ) {

      showResult(
        true,
        "موشکت وارد World 2 شد! 🚀"
      );

      return;
    }
  }

  if (
    bot &&
    bot.launching
  ) {

    const elapsed =
      performance.now() -
      bot.launchStartedAt;

    if (
      elapsed >=
      3500
    ) {

      showResult(
        false,
        "ربات زودتر وارد World 2 شد!"
      );
    }
  }
}


/* =========================================================
   UPDATE OBJECTIVE
========================================================= */

function updateObjective() {

  if (
    !player
  ) {
    return;
  }

  if (
    player.launching
  ) {

    const elapsed =
      performance.now() -
      player.launchStartedAt;

    const seconds =
      Math.max(
        0,
        4 -
          Math.floor(
            elapsed / 1000
          )
      );

    hudObjective.textContent =
      `🚀 پرتاب در ${seconds}...`;

    return;
  }

  if (
    player.fuel >=
    MAX_FUEL &&
    nearBase(player)
  ) {

    hudObjective.textContent =
      "🚀 Launch Pad آماده است!";
    return;
  }

  if (
    player.cargo > 0 &&
    nearBase(player)
  ) {

    hudObjective.textContent =
      "⛽ در حال تبدیل Cargo به سوخت";
    return;
  }

  if (
    player.cargo > 0
  ) {

    hudObjective.textContent =
      "🏠 به Launch Pad برگرد";
    return;
  }

  hudObjective.textContent =
    "💎 منابع انرژی رو جمع کن";
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

  hudFuel.textContent =
    `${Math.floor(player.fuel)}%`;

  hudCargo.textContent =
    String(
      Math.floor(player.cargo)
    );

  hudMode.textContent =
    mode === "online"
      ? "🌐 آنلاین"
      : "🤖 تک‌نفره";

  updateObjective();

  updateLaunchButton();
}


/* =========================================================
   PLAYER PANEL
========================================================= */

function renderPlayersPanel() {

  playersPanel.innerHTML =
    "";

  if (
    mode === "solo"
  ) {

    if (
      player
    ) {
      addPlayerCard(
        myUid || "me",
        player.name,
        player.fuel,
        true,
        player.color
      );
    }

    if (
      bot
    ) {
      addPlayerCard(
        "bot",
        bot.name,
        bot.fuel,
        false,
        bot.color
      );
    }

    return;
  }

  const entries =
    Object.entries(
      otherPlayers
    );

  for (
    const [
      uid,
      p
    ] of entries
  ) {

    addPlayerCard(
      uid,
      p.name ||
        "بازیکن",
      Number(
        p.fuel || 0
      ),
      uid === myUid,
      colorForIndex(
        entries.findIndex(
          x =>
            x[0] === uid
        )
      )
    );
  }
}


function addPlayerCard(
  uid,
  name,
  fuel,
  mine,
  color
) {

  const card =
    document.createElement(
      "div"
    );

  card.className =
    "player-card";

  card.innerHTML = `
    <div
      class="name"
      style="color:${color}"
    >
      ${mine ? "🚀 " : "🛸 "}
      ${escapeHtml(name)}
    </div>

    <div class="bar">
      <i
        style="width:${clamp(
          Number(fuel || 0),
          0,
          100
        )}%"
      ></i>
    </div>

    <div
      style="
        margin-top:3px;
        color:#8490b0;
      "
    >
      ⛽ ${Math.floor(
        Number(fuel || 0)
      )}%
    </div>
  `;

  playersPanel.appendChild(
    card
  );
}


function escapeHtml(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   DRAW BACKGROUND
========================================================= */

function drawBackground(
  time
) {

  ctx.fillStyle =
    "#03050d";

  ctx.fillRect(
    0,
    0,
    W,
    H
  );


  const nebula =
    ctx.createRadialGradient(
      W * .25,
      H * .25,
      0,
      W * .25,
      H * .25,
      Math.max(W,H) * .55
    );

  nebula.addColorStop(
    0,
    "rgba(100,70,255,.17)"
  );

  nebula.addColorStop(
    1,
    "rgba(100,70,255,0)"
  );

  ctx.fillStyle =
    nebula;

  ctx.fillRect(
    0,
    0,
    W,
    H
  );


  const nebula2 =
    ctx.createRadialGradient(
      W * .8,
      H * .75,
      0,
      W * .8,
      H * .75,
      Math.max(W,H) * .45
    );

  nebula2.addColorStop(
    0,
    "rgba(0,190,255,.12)"
  );

  nebula2.addColorStop(
    1,
    "rgba(0,190,255,0)"
  );

  ctx.fillStyle =
    nebula2;

  ctx.fillRect(
    0,
    0,
    W,
    H
  );


  /*
    Planets
  */

  for (
    const planet of planets
  ) {

    ctx.save();

    ctx.globalAlpha =
      .2;

    const gradient =
      ctx.createRadialGradient(
        planet.x -
          planet.r * .3,
        planet.y -
          planet.r * .3,
        0,
        planet.x,
        planet.y,
        planet.r
      );

    gradient.addColorStop(
      0,
      "#ffffff"
    );

    gradient.addColorStop(
      .2,
      planet.color
    );

    gradient.addColorStop(
      1,
      "rgba(0,0,0,0)"
    );

    ctx.fillStyle =
      gradient;

    ctx.beginPath();

    ctx.arc(
      planet.x,
      planet.y,
      planet.r,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
  }


  /*
    Stars
  */

  for (
    const star of stars
  ) {

    const alpha =
      .3 +
      Math.sin(
        time * .002 +
        star.tw
      ) * .25;

    ctx.fillStyle =
      `rgba(255,255,255,${Math.max(
        .08,
        alpha
      )})`;

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


  /*
    Grid
  */

  ctx.strokeStyle =
    "rgba(100,130,255,.045)";

  ctx.lineWidth =
    1;

  const grid =
    Math.max(
      40,
      Math.min(W,H) / 8
    );

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
}


/* =========================================================
   DRAW BASE
========================================================= */

function drawBase(
  x,
  y,
  color,
  name,
  launching = false
) {

  ctx.save();

  /*
    glow
  */

  ctx.shadowColor =
    color;

  ctx.shadowBlur =
    launching
      ? 35
      : 20;

  ctx.strokeStyle =
    color;

  ctx.lineWidth =
    3;

  ctx.beginPath();

  ctx.arc(
    x,
    y,
    BASE_RADIUS,
    0,
    Math.PI * 2
  );

  ctx.stroke();

  ctx.shadowBlur =
    0;

  /*
    pad
  */

  ctx.beginPath();

  ctx.arc(
    x,
    y,
    BASE_RADIUS * .58,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    "rgba(255,255,255,.05)";

  ctx.fill();

  /*
    launch lines
  */

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
      x +
        Math.cos(a) *
        18,
      y +
        Math.sin(a) *
        18
    );

    ctx.lineTo(
      x +
        Math.cos(a) *
        31,
      y +
        Math.sin(a) *
        31
    );

    ctx.strokeStyle =
      color;

    ctx.stroke();
  }

  /*
    label
  */

  ctx.fillStyle =
    "#dce7ff";

  ctx.font =
    "bold 10px Tahoma";

  ctx.textAlign =
    "center";

  ctx.fillText(
    name,
    x,
    y +
      BASE_RADIUS +
      15
  );

  ctx.restore();
}


/* =========================================================
   DRAW RESOURCE
========================================================= */

function drawResource(
  resource,
  time
) {

  if (
    !resource.active
  ) {
    return;
  }

  const pulse =
    1 +
    Math.sin(
      time * .004 +
      (resource.phase || 0)
    ) *
      .12;

  ctx.save();

  ctx.translate(
    resource.x,
    resource.y
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
      -Math.PI / 2 +
      i *
        Math.PI /
        3;

    const radius =
      i % 2 === 0
        ? RESOURCE_RADIUS
        : RESOURCE_RADIUS * .65;

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

  ctx.shadowBlur =
    0;

  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    "bold 8px Tahoma";

  ctx.textAlign =
    "center";

  ctx.fillText(
    "+",
    0,
    3
  );

  ctx.restore();
}


/* =========================================================
   DRAW SHIP
========================================================= */

function drawShip(
  p,
  isMe = false
) {

  if (
    !p
  ) {
    return;
  }

  ctx.save();

  /*
    trail
  */

  if (
    p.trail &&
    p.trail.length
  ) {

    for (
      let i = 0;
      i < p.trail.length;
      i++
    ) {

      const point =
        p.trail[i];

      const alpha =
        i /
        p.trail.length *
        .3;

      ctx.fillStyle =
        `rgba(80,190,255,${alpha})`;

      ctx.beginPath();

      ctx.arc(
        point.x,
        point.y,
        2 +
          i /
            p.trail.length *
            4,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }
  }


  /*
    Launch flame
  */

  if (
    p.launching
  ) {

    const flame =
      18 +
      Math.random() *
      15;

    const gradient =
      ctx.createLinearGradient(
        p.x,
        p.y + 10,
        p.x,
        p.y + flame
      );

    gradient.addColorStop(
      0,
      "#ffffff"
    );

    gradient.addColorStop(
      .3,
      "#4deaff"
    );

    gradient.addColorStop(
      1,
      "rgba(90,80,255,0)"
    );

    ctx.fillStyle =
      gradient;

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


  /*
    glow
  */

  ctx.shadowColor =
    p.color;

  ctx.shadowBlur =
    isMe
      ? 24
      : 14;


  /*
    ship
  */

  ctx.fillStyle =
    p.color;

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


  /*
    cockpit
  */

  ctx.shadowBlur =
    0;

  ctx.fillStyle =
    "#dffcff";

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
    name
  */

  ctx.fillStyle =
    "#eaf2ff";

  ctx.font =
    "bold 10px Tahoma";

  ctx.textAlign =
    "center";

  ctx.fillText(
    p.name,
    p.x,
    p.y - 25
  );


  /*
    fuel mini bar
  */

  const barW =
    34;

  const barH =
    4;

  ctx.fillStyle =
    "rgba(255,255,255,.12)";

  ctx.fillRect(
    p.x - barW / 2,
    p.y + 18,
    barW,
    barH
  );

  ctx.fillStyle =
    "#55eaff";

  ctx.fillRect(
    p.x - barW / 2,
    p.y + 18,
    barW *
      clamp(
        p.fuel / MAX_FUEL,
        0,
        1
      ),
    barH
  );

  ctx.restore();
}


/* =========================================================
   DRAW ALL
========================================================= */

function draw(
  time
) {

  drawBackground(
    time
  );


  /*
    Bases
  */

  if (
    mode === "solo"
  ) {

    drawBase(
      player.baseX,
      player.baseY,
      player.color,
      "Launch Pad تو",
      player.launching
    );

    drawBase(
      bot.baseX,
      bot.baseY,
      bot.color,
      "Launch Pad ربات",
      bot.launching
    );

  } else {

    const entries =
      Object.entries(
        otherPlayers
      );

    /*
      Base of each online player
      is calculated from sorted UID.
    */

    const ids =
      entries
        .map(
          x => x[0]
        )
        .sort();

    for (
      let i = 0;
      i < ids.length;
      i++
    ) {

      const uid =
        ids[i];

      const p =
        otherPlayers[uid];

      const base =
        getBasePosition(
          i,
          ids.length
        );

      drawBase(
        base.x,
        base.y,
        colorForIndex(i),
        uid === myUid
          ? "Launch Pad تو"
          : p.name || "Launch Pad",
        !!p.launching
      );
    }

    /*
      اگر هنوز snapshot نیامده
      Base خودمان را هم نشان می‌دهیم.
    */

    if (
      player
    ) {

      drawBase(
        player.baseX,
        player.baseY,
        player.color,
        "Launch Pad تو",
        player.launching
      );
    }
  }


  /*
    Resources
  */

  for (
    const resource of resources
  ) {
    drawResource(
      resource,
      time
    );
  }


  /*
    Other online players
  */

  if (
    mode === "online"
  ) {

    for (
      const [
        uid,
        p
      ] of Object.entries(
        otherPlayers
      )
    ) {

      if (
        uid === myUid
      ) {
        continue;
      }

      const index =
        Object.keys(
          otherPlayers
        )
          .sort()
          .indexOf(uid);

      drawShip(
        {
          ...p,
          color:
            colorForIndex(index),
          baseX:
            getBasePosition(
              index,
              Object.keys(
                otherPlayers
              ).length
            ).x,
          baseY:
            getBasePosition(
              index,
              Object.keys(
                otherPlayers
              ).length
            ).y,
          trail: []
        },
        false
      );
    }
  }


  /*
    Bot
  */

  if (
    mode === "solo" &&
    bot
  ) {

    drawShip(
      bot,
      false
    );
  }


  /*
    My ship
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
   PARTICLES
========================================================= */

let particles = [];


function spawnParticle(
  x,
  y,
  color
) {

  for (
    let i = 0;
    i < 4;
    i++
  ) {

    particles.push({
      x,
      y,

      vx:
        random(-40,40),

      vy:
        random(-40,40),

      life: 1,

      color
    });
  }
}


function updateParticles(
  dt
) {

  for (
    const p of particles
  ) {

    p.x +=
      p.vx * dt;

    p.y +=
      p.vy * dt;

    p.life -=
      dt * 2;
  }

  particles =
    particles.filter(
      p =>
        p.life > 0
    );
}


function drawParticles() {

  for (
    const p of particles
  ) {

    ctx.globalAlpha =
      p.life;

    ctx.fillStyle =
      p.color;

    ctx.beginPath();

    ctx.arc(
      p.x,
      p.y,
      2,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  ctx.globalAlpha =
    1;
}


/* =========================================================
   AUDIO
========================================================= */

function playTone(
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
      !audioContext
    ) {

      audioContext =
        new (
          window.AudioContext ||
          window.webkitAudioContext
        )();
    }

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    oscillator.type =
      "sine";

    oscillator.frequency.value =
      frequency;

    gain.gain.setValueAtTime(
      .08,
      audioContext.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      .001,
      audioContext.currentTime +
        duration
    );

    oscillator.connect(
      gain
    );

    gain.connect(
      audioContext.destination
    );

    oscillator.start();

    oscillator.stop(
      audioContext.currentTime +
        duration
    );

  } catch {
    /* audio unavailable */
  }
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
          .requestFullscreen?.();

      } else {

        await document
          .exitFullscreen?.();
      }

    } catch {
      /* fullscreen unavailable */
    }
  }
);


/* =========================================================
   RESULT
========================================================= */

let resultRecorded =
  false;


async function showResult(
  won,
  text
) {

  if (
    resultRecorded
  ) {
    return;
  }

  resultRecorded =
    true;

  gameEnded =
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
      <b>${
        mode === "online"
          ? "🌐"
          : "🤖"
      }</b>
      <span>${
        mode === "online"
          ? "آنلاین"
          : "تک‌نفره"
      }</span>
    </div>
  `;

  resultScreen.classList.remove(
    "hidden"
  );

  try {

    await recordRoundResult(
      myName,
      "astra",
      {
        won
      }
    );

  } catch (error) {

    console.warn(
      "Could not record Astra result:",
      error
    );
  }
}


/* =========================================================
   ONLINE FINISH HANDLER
========================================================= */

async function handleLaunchFinished() {

  if (
    !player ||
    !player.launching
  ) {
    return;
  }

  const elapsed =
    performance.now() -
    player.launchStartedAt;

  if (
    elapsed <
    3500
  ) {
    return;
  }

  /*
    در حالت آنلاین:
    فقط transaction تعیین می‌کند چه کسی
    واقعاً برنده شده.
  */

  if (
    mode === "online"
  ) {

    await declareOnlineWinner();

    return;
  }

  /*
    Solo
  */

  showResult(
    true,
    "موشکت وارد World 2 شد! 🚀"
  );
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
    gameEnded ||
    !player
  ) {
    return;
  }


  updatePlayer(
    dt,
    now
  );


  if (
    mode === "solo"
  ) {

    /*
      Respawn local
    */

    for (
      const r of resources
    ) {

      if (
        !r.active &&
        r.respawnAt <=
          Date.now()
      ) {

        r.active =
          true;

        r.respawnAt =
          0;
      }
    }


    for (
      const r of resources
    ) {

      claimLocalResource(
        r
      );
    }


    updateBot(
      dt,
      now
    );

  } else {

    updateOnlineResourceCollection();

    updateOnlineRespawns();
  }


  /*
    Fuel conversion
  */

  convertCargoToFuel(
    player,
    dt
  );


  /*
    Bot fuel
  */

  if (
    mode === "solo" &&
    bot
  ) {

    convertCargoToFuel(
      bot,
      dt
    );
  }


  /*
    Online player sync
  */

  if (
    mode === "online"
  ) {

    syncOnlinePlayer();
  }


  /*
    Launch
  */

  handleLaunchFinished();


  /*
    Solo bot launch
  */

  checkSoloWinner();


  updateParticles(
    dt
  );


  updateHUD();
}


/* =========================================================
   LOOP
========================================================= */

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

  drawParticles();

  requestAnimationFrame(
    loop
  );
}


/* =========================================================
   START
========================================================= */

async function startGame() {

  try {

    const user =
      await waitForUser();

    if (
      !user
    ) {

      window.location.href =
        "../index.html";

      return;
    }

    myUid =
      currentUid();

    myName =
      getSavedName() ||
      user.displayName ||
      "بازیکن";


    resizeCanvas();


    if (
      mode === "online"
    ) {

      /*
        آنلاین
      */

      hudMode.textContent =
        "🌐 آنلاین";

      setupOnlineRefs();

      await registerOnlinePlayer();

      initializeLocalPlayer();

      await initializeOnlineResources();

      startOnlineListeners();

      hideStartMessage(
        "برو منابع رو جمع کن!"
      );

    } else {

      /*
        تک‌نفره
      */

      hudMode.textContent =
        "🤖 تک‌نفره";

      createLocalResources();

      initializeLocalPlayer();

      hideStartMessage(
        "منابع رو جمع کن و از ربات زودتر به World 2 برس!"
      );
    }


    initialized =
      true;

    running =
      true;

    renderPlayersPanel();

    updateHUD();

    requestAnimationFrame(
      loop
    );

  } catch (error) {

    console.error(
      "ASTRA START ERROR:",
      error
    );

    message.classList.remove(
      "hidden"
    );

    message.querySelector(
      ".message-title"
    ).textContent =
      "⚠️ خطا";

    messageSub.textContent =
      "Astra نتونست اجرا بشه. صفحه رو دوباره باز کن.";
  }
}


/* =========================================================
   START MESSAGE
========================================================= */

function hideStartMessage(
  text
) {

  messageSub.textContent =
    text;

  setTimeout(
    () => {

      message.classList.add(
        "hidden"
      );

    },
    1800
  );
}


/* =========================================================
   BACK BUTTON
========================================================= */

backButton.addEventListener(
  "click",
  () => {

    if (
      mode === "online"
    ) {

      window.location.href =
        "../lobby.html";

    } else {

      window.location.href =
        "../index.html";
    }
  }
);


/* =========================================================
   ORIENTATION
========================================================= */

function updateOrientation() {

  const portrait =
    window.innerHeight >
    window.innerWidth;

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
    initialized &&
    !gameEnded
  ) {

    running =
      true;
  }
}


window.addEventListener(
  "resize",
  updateOrientation
);

window.addEventListener(
  "orientationchange",
  updateOrientation
);


/* =========================================================
   PAGE VISIBILITY
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
      initialized &&
      !gameEnded &&
      window.innerWidth >
        window.innerHeight
    ) {

      running =
        true;

      lastFrame =
        performance.now();
    }
  }
);


/* =========================================================
   INITIAL
========================================================= */

updateOrientation();

startGame();
