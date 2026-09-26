import {
  waitForUser,
  getSavedName,
  currentUid,
  getSavedRoom,
  roomRef,

  onValue,
  set,
  get,
  update,
  remove,
  runTransaction,
  onDisconnect,

  recordRoundResult,
  resetSessionForNextRound
} from "../js/app.js";

import {
  mountChat
} from "../js/chat.js";


/* =========================================================
   CONFIG
========================================================= */

const GAME_ID = "astra";

const MAX_PLAYERS = 4;

const MATCH_TIME = 180;

const MAX_HP = 5;

const RESOURCE_COUNT = 12;

const FUEL_PER_RESOURCE = 20;

const PLAYER_SPEED = 220;

const BOOST_SPEED = 390;

const BOOST_TIME = 2500;

const BOOST_COOLDOWN = 3500;

const SHOT_SPEED = 520;

const SHOT_LIFE = 900;

const FIRE_COOLDOWN = 500;

const DAMAGE = 1;

const SYNC_INTERVAL = 75;

const RESPAWN_DELAY = 3500;

const PLAYER_RADIUS = 15;

const RESOURCE_RADIUS = 12;

const DOCK_RADIUS = 32;

const COLORS = [
  "#4F7CFF",
  "#9B5CFF",
  "#FF4F81",
  "#3ECF8E"
];


/* =========================================================
   ROOM
========================================================= */

const params =
  new URLSearchParams(
    location.search
  );

const roundFromUrl =
  params.get("round") || "";

const isSolo =
  params.has("solo");

const code =
  getSavedRoom();

const R =
  path =>
    roomRef(
      code,
      path
    );

const A =
  path =>
    roomRef(
      code,
      `astra/${path}`
    );


/* =========================================================
   DOM
========================================================= */

const canvas =
  document.getElementById(
    "astraCanvas"
  );

const ctx =
  canvas.getContext("2d");

const arenaBox =
  document.getElementById(
    "astraArenaBox"
  );

const rotateScreen =
  document.getElementById(
    "astraRotateScreen"
  );

const overlayMsg =
  document.getElementById(
    "astraOverlayMsg"
  );

const resultScreen =
  document.getElementById(
    "astraResult"
  );

const connectionEl =
  document.getElementById(
    "astraConnection"
  );

const modeBadge =
  document.getElementById(
    "astraModeBadge"
  );

const timerEl =
  document.getElementById(
    "astraTimer"
  );

const p1Label =
  document.getElementById(
    "p1Label"
  );

const fuelEl =
  document.getElementById(
    "fuelP1"
  );

const cargoEl =
  document.getElementById(
    "cargoP1"
  );

const hpEl =
  document.getElementById(
    "myHp"
  );

const boostEl =
  document.getElementById(
    "boostP1"
  );

const othersHud =
  document.getElementById(
    "othersHud"
  );

const joystickBase =
  document.getElementById(
    "astraJoyBaseP1"
  );

const joystickKnob =
  document.getElementById(
    "astraJoyKnobP1"
  );

const fireButton =
  document.getElementById(
    "astraFireBtn"
  );

const boostButton =
  document.getElementById(
    "astraBoostBtn"
  );

const fullscreenButton =
  document.getElementById(
    "astraFullscreenBtn"
  );

const muteButton =
  document.getElementById(
    "astraMuteBtn"
  );


/* =========================================================
   STATE
========================================================= */

let myUid = "";

let myName = "";

let myColorIndex = 0;

let myColor =
  COLORS[0];

let W = 900;

let H = 450;

let running = false;

let paused = true;

let raceOver = false;

let countdownRunning = false;

let gameStarted = false;

let connectionOnline = false;

let roundId =
  roundFromUrl;

let gameEndsAt = 0;

let winnerUid = null;

let players = {};

let resources = {};

let shots = {};

let localMe = null;

let localParticles = [];

let localFloaters = [];

let localStars = [];

let joy = {
  x: 0,
  y: 0
};

let fireHeld = false;

let lastFrame = 0;

let lastSync = 0;

let lastFire = 0;

let lastBoost = 0;

let lastResourceCheck = 0;

let lastStateCheck = 0;

let orientationLocked = false;

let unsubscribers = [];

let cleanupStarted = false;


/* =========================================================
   SOLO STATE
========================================================= */

let soloResources = [];

let soloBot = null;


/* =========================================================
   AUDIO
========================================================= */

let muted = false;

let audioContext = null;

function tone(
  frequency,
  duration = 0.08
) {

  if (muted) {
    return;
  }

  try {

    if (!audioContext) {

      audioContext =
        new (
          window.AudioContext ||
          window.webkitAudioContext
        )();

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    oscillator.frequency.value =
      frequency;

    oscillator.type =
      "sine";

    gain.gain.setValueAtTime(
      0.08,
      audioContext.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
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

  } catch {}

}


/* =========================================================
   HELPERS
========================================================= */

function rand(
  min,
  max
) {

  return (
    Math.random() *
      (max - min) +
    min
  );

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

function clamp(
  value,
  min,
  max
) {

  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );

}

function playerColor(
  index
) {

  return (
    COLORS[
      Number(index || 0) %
        COLORS.length
    ] ||
    COLORS[0]
  );

}

function dockFor(
  colorIndex
) {

  const spots = [

    {
      x: W * .10,
      y: H * .20
    },

    {
      x: W * .90,
      y: H * .20
    },

    {
      x: W * .10,
      y: H * .80
    },

    {
      x: W * .90,
      y: H * .80
    }

  ];

  return (
    spots[
      colorIndex %
        spots.length
    ]
  );

}

function formatTime(
  seconds
) {

  seconds =
    Math.max(
      0,
      Math.ceil(
        seconds
      )
    );

  const min =
    Math.floor(
      seconds / 60
    );

  const sec =
    seconds % 60;

  return (
    String(min).padStart(
      2,
      "0"
    ) +
    ":" +
    String(sec).padStart(
      2,
      "0"
    )
  );

}


/* =========================================================
   CANVAS
========================================================= */

function resizeCanvas() {

  const rect =
    arenaBox.getBoundingClientRect();

  const cssWidth =
    Math.max(
      1,
      rect.width
    );

  const cssHeight =
    Math.max(
      1,
      rect.height
    );

  const dpr =
    Math.min(
      window.devicePixelRatio ||
        1,
      2
    );

  canvas.width =
    Math.round(
      cssWidth * dpr
    );

  canvas.height =
    Math.round(
      cssHeight * dpr
    );

  canvas.style.width =
    cssWidth + "px";

  canvas.style.height =
    cssHeight + "px";

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  W = cssWidth;

  H = cssHeight;

  createStars();

  if (localMe) {

    localMe.x =
      clamp(
        localMe.x,
        PLAYER_RADIUS,
        W -
          PLAYER_RADIUS
      );

    localMe.y =
      clamp(
        localMe.y,
        PLAYER_RADIUS,
        H -
          PLAYER_RADIUS
      );

  }

}

function createStars() {

  localStars = [];

  const count =
    Math.round(
      W * H / 5000
    );

  for (
    let i = 0;
    i < count;
    i++
  ) {

    localStars.push({

      x:
        Math.random() *
        W,

      y:
        Math.random() *
        H,

      r:
        Math.random() *
          1.4 +
        .3,

      phase:
        Math.random() *
        Math.PI *
        2

    });

  }

}


/* =========================================================
   DOCK
========================================================= */

function myDock() {

  return dockFor(
    myColorIndex
  );

}


/* =========================================================
   PARTICLES
========================================================= */

function burst(
  x,
  y,
  color,
  count = 12
) {

  for (
    let i = 0;
    i < count;
    i++
  ) {

    const angle =
      Math.random() *
      Math.PI *
      2;

    const speed =
      rand(
        50,
        150
      );

    localParticles.push({

      x,
      y,

      vx:
        Math.cos(angle) *
        speed,

      vy:
        Math.sin(angle) *
        speed,

      life: 1,

      color

    });

  }

}

function floater(
  x,
  y,
  text,
  color
) {

  localFloaters.push({

    x,
    y,

    text,

    life: 1,

    color

  });

}

function updateEffects(
  dt
) {

  for (
    const p of localParticles
  ) {

    p.x +=
      p.vx * dt;

    p.y +=
      p.vy * dt;

    p.vx *= .92;

    p.vy *= .92;

    p.life -=
      dt * 1.5;

  }

  localParticles =
    localParticles.filter(
      p =>
        p.life > 0
    );

  for (
    const f of localFloaters
  ) {

    f.y -=
      dt * 35;

    f.life -=
      dt * .9;

  }

  localFloaters =
    localFloaters.filter(
      f =>
        f.life > 0
    );

}


/* =========================================================
   INIT PLAYER
========================================================= */

function createLocalPlayer() {

  const dock =
    myDock();

  localMe = {

    x:
      dock.x,

    y:
      dock.y,

    angle:
      -Math.PI / 2,

    hp:
      MAX_HP,

    fuel: 0,

    cargo: 0,

    carrying: null,

    alive: true,

    boostedUntil: 0,

    lastHit: 0

  };

}


/* =========================================================
   FIND PLAYERS
========================================================= */

async function loadPlayers() {

  const snap =
    await get(
      R("players")
    );

  players =
    snap.val() || {};

  const ids =
    Object.keys(
      players
    ).sort();

  const index =
    ids.indexOf(
      myUid
    );

  myColorIndex =
    index >= 0
      ? index
      : 0;

  myColor =
    playerColor(
      myColorIndex
    );

}


/* =========================================================
   CREATE MATCH
========================================================= */

async function ensureMatch() {

  if (isSolo) {
    return;
  }

  const metaSnap =
    await get(
      A("meta")
    );

  if (
    metaSnap.exists()
  ) {

    const meta =
      metaSnap.val();

    if (
      meta.roundId &&
      (
        !roundId ||
        meta.roundId ===
          roundId
      )
    ) {

      roundId =
        meta.roundId;

      gameEndsAt =
        Number(
          meta.endsAt ||
          0
        );

      gameStarted =
        meta.status ===
        "running";

      return;

    }

  }

  const now =
    Date.now();

  const newRound =
    roundId ||
    String(
      now
    );

  const result =
    await runTransaction(
      A("meta"),
      current => {

        if (
          current &&
          current.roundId
        ) {

          return current;

        }

        return {

          roundId:
            newRound,

          status:
            "running",

          startedAt:
            now,

          endsAt:
            now +
            MATCH_TIME *
              1000,

          winnerUid:
            null

        };

      }
    );

  const meta =
    result.snapshot.val();

  if (meta) {

    roundId =
      meta.roundId;

    gameEndsAt =
      Number(
        meta.endsAt
      );

    gameStarted =
      meta.status ===
      "running";

  }

}


/* =========================================================
   INITIAL RESOURCES
========================================================= */

async function ensureResources() {

  const result =
    await runTransaction(
      A("resources"),
      current => {

        if (
          current &&
          Object.keys(
            current
          ).length
        ) {

          return current;

        }

        const data = {};

        for (
          let i = 0;
          i <
          RESOURCE_COUNT;
          i++
        ) {

          data[
            "r" + i
          ] = {

            x:
              rand(
                W * .25,
                W * .75
              ),

            y:
              rand(
                H * .20,
                H * .80
              ),

            takenBy:
              null,

            respawnAt:
              0

          };

        }

        return data;

      }
    );

  resources =
    result.snapshot.val() ||
    {};

}


/* =========================================================
   JOIN GAME
========================================================= */

async function joinGame() {

  if (isSolo) {
    return;
  }

  await loadPlayers();

  await ensureMatch();

  await ensureResources();

  const dock =
    myDock();

  await set(
    A(
      `players/${myUid}`
    ),
    {

      name:
        myName,

      x:
        dock.x,

      y:
        dock.y,

      angle:
        -Math.PI / 2,

      hp:
        MAX_HP,

      fuel:
        0,

      cargo:
        0,

      carrying:
        null,

      alive:
        true,

      colorIndex:
        myColorIndex,

      joinedAt:
        Date.now()

    }
  );

  await onDisconnect(
    A(
      `players/${myUid}`
    )
  ).remove();

  await onDisconnect(
    A(
      `shots/${myUid}`
    )
  ).remove();

}


/* =========================================================
   FIREBASE LISTENERS
========================================================= */

function listenGame() {

  if (isSolo) {
    return;
  }

  unsubscribers.push(

    onValue(
      A("players"),
      snap => {

        players =
          snap.val() ||
          {};

        updateHud();

      }
    )

  );

  unsubscribers.push(

    onValue(
      A("resources"),
      snap => {

        resources =
          snap.val() ||
          {};

      }
    )

  );

  unsubscribers.push(

    onValue(
      A("shots"),
      snap => {

        shots =
          snap.val() ||
          {};

      }
    )

  );

  unsubscribers.push(

    onValue(
      A("meta"),
      snap => {

        const meta =
          snap.val();

        if (!meta) {
          return;
        }

        gameEndsAt =
          Number(
            meta.endsAt ||
            0
          );

        gameStarted =
          meta.status ===
          "running";

        if (
          meta.winnerUid &&
          !winnerUid
        ) {

          winnerUid =
            meta.winnerUid;

          finishMatch(
            winnerUid ===
              myUid
          );

        }

        if (
          meta.status ===
          "finished" &&
          !raceOver
        ) {

          winnerUid =
            meta.winnerUid ||
            null;

          finishMatch(
            winnerUid ===
              myUid
          );

        }

      }
    )

  );

}


/* =========================================================
   SYNC MY PLAYER
========================================================= */

async function syncPlayer() {

  if (
    isSolo ||
    !localMe ||
    !myUid ||
    raceOver
  ) {
    return;
  }

  await update(
    A(
      `players/${myUid}`
    ),
    {

      x:
        localMe.x,

      y:
        localMe.y,

      angle:
        localMe.angle,

      hp:
        localMe.hp,

      fuel:
        localMe.fuel,

      cargo:
        localMe.cargo,

      carrying:
        localMe.carrying,

      alive:
        localMe.alive,

      boostedUntil:
        localMe.boostedUntil ||
        0

    }
  );

}


/* =========================================================
   MOVEMENT
========================================================= */

function updateMovement(
  dt
) {

  if (
    !localMe ||
    !localMe.alive
  ) {
    return;
  }

  let x =
    joy.x;

  let y =
    joy.y;

  const magnitude =
    Math.min(
      1,
      Math.hypot(
        x,
        y
      )
    );

  if (
    magnitude <
    .02
  ) {
    return;
  }

  const len =
    Math.hypot(
      x,
      y
    ) || 1;

  x /=
    len;

  y /=
    len;

  localMe.angle =
    Math.atan2(
      y,
      x
    );

  const boosted =
    Date.now() <
    localMe.boostedUntil;

  const speed =
    boosted
      ? BOOST_SPEED
      : PLAYER_SPEED;

  localMe.x +=
    x *
    speed *
    magnitude *
    dt;

  localMe.y +=
    y *
    speed *
    magnitude *
    dt;

  localMe.x =
    clamp(
      localMe.x,
      PLAYER_RADIUS,
      W -
        PLAYER_RADIUS
    );

  localMe.y =
    clamp(
      localMe.y,
      PLAYER_RADIUS,
      H -
        PLAYER_RADIUS
    );

}


/* =========================================================
   BOOST
========================================================= */

async function useBoost() {

  if (
    !localMe ||
    !localMe.alive ||
    raceOver
  ) {
    return;
  }

  const now =
    Date.now();

  if (
    now -
      lastBoost <
    BOOST_COOLDOWN
  ) {

    return;

  }

  lastBoost =
    now;

  localMe.boostedUntil =
    now +
    BOOST_TIME;

  burst(
    localMe.x,
    localMe.y,
    myColor,
    16
  );

  tone(
    900,
    .12
  );

  if (!isSolo) {

    await update(
      A(
        `players/${myUid}`
      ),
      {
        boostedUntil:
          localMe.boostedUntil
      }
    );

  }

}


/* =========================================================
   FIRE
========================================================= */

async function fire() {

  if (
    !localMe ||
    !localMe.alive ||
    raceOver
  ) {
    return;
  }

  const now =
    Date.now();

  if (
    now -
      lastFire <
    FIRE_COOLDOWN
  ) {
    return;
  }

  lastFire =
    now;

  const speed =
    SHOT_SPEED;

  const id =
    myUid +
    "_" +
    now +
    "_" +
    Math.random()
      .toString(36)
      .slice(2, 7);

  const shot = {

    owner:
      myUid,

    x:
      localMe.x +
      Math.cos(
        localMe.angle
      ) *
      (PLAYER_RADIUS + 5),

    y:
      localMe.y +
      Math.sin(
        localMe.angle
      ) *
      (PLAYER_RADIUS + 5),

    vx:
      Math.cos(
        localMe.angle
      ) *
      speed,

    vy:
      Math.sin(
        localMe.angle
      ) *
      speed,

    createdAt:
      now,

    color:
      myColor

  };

  if (isSolo) {

    shots[id] =
      shot;

    tone(
      800,
      .05
    );

    return;

  }

  await set(
    A(
      `shots/${id}`
    ),
    shot
  );

  tone(
    800,
    .05
  );

}


/* =========================================================
   UPDATE SHOTS
========================================================= */

async function processShots(
  dt
) {

  const now =
    Date.now();

  if (isSolo) {

    for (
      const [
        id,
        shot
      ] of Object.entries(
        shots
      )
    ) {

      shot.x +=
        shot.vx *
        dt;

      shot.y +=
        shot.vy *
        dt;

      if (
        now -
          shot.createdAt >
          SHOT_LIFE ||
        shot.x <
          -50 ||
        shot.x >
          W + 50 ||
        shot.y <
          -50 ||
        shot.y >
          H + 50
      ) {

        delete shots[id];

      }

    }

    return;

  }

  for (
    const [
      id,
      shot
    ] of Object.entries(
      shots
    )
  ) {

    if (
      now -
        Number(
          shot.createdAt
        ) >
      SHOT_LIFE
    ) {

      if (
        shot.owner ===
        myUid
      ) {

        remove(
          A(
            `shots/${id}`
          )
        );

      }

      continue;

    }

    /*
      فقط صاحب تیر آن را جلو می‌برد.
      این باعث می‌شود ۴ بازیکن
      همزمان یک تیر را ۴ بار حرکت ندهند.
    */

    if (
      shot.owner !==
      myUid
    ) {
      continue;
    }

    const newX =
      Number(
        shot.x
      ) +
      Number(
        shot.vx
      ) *
      dt;

    const newY =
      Number(
        shot.y
      ) +
      Number(
        shot.vy
      ) *
      dt;

    await update(
      A(
        `shots/${id}`
      ),
      {
        x:
          newX,

        y:
          newY
      }
    );

  }

}


/* =========================================================
   COLLISION
========================================================= */

async function checkShotHits() {

  if (
    !localMe ||
    !localMe.alive
  ) {
    return;
  }

  const now =
    Date.now();

  for (
    const shot of
      Object.values(
        shots
      )
  ) {

    if (
      shot.owner ===
      myUid
    ) {
      continue;
    }

    if (
      now -
        Number(
          shot.createdAt
        ) >
      SHOT_LIFE
    ) {
      continue;
    }

    if (
      distance(
        localMe,
        shot
      ) <
      PLAYER_RADIUS * 1.35
    ) {

      if (
        now -
          localMe.lastHit <
        700
      ) {
        continue;
      }

      localMe.lastHit =
        now;

      localMe.hp =
        Math.max(
          0,
          localMe.hp -
            DAMAGE
        );

      burst(
        localMe.x,
        localMe.y,
        "#ff4f81",
        14
      );

      tone(
        240,
        .08
      );

      /*
        فقط خود بازیکن وضعیت جان خودش
        را تغییر می‌دهد.
      */

      if (
        !isSolo
      ) {

        await update(
          A(
            `players/${myUid}`
          ),
          {
            hp:
              localMe.hp,

            alive:
              localMe.hp > 0
          }
        );

        await remove(
          A(
            `shots/${findShotId(shot)}`
          )
        );

      }

      if (
        localMe.hp <= 0
      ) {

        localMe.alive =
          false;

        localMe.carrying =
          null;

        floater(
          localMe.x,
          localMe.y,
          "💥 حذف شدی",
          "#ff4f81"
        );

      }

    }

  }

}

function findShotId(
  target
) {

  for (
    const [
      id,
      shot
    ] of Object.entries(
      shots
    )
  ) {

    if (
      shot ===
      target
    ) {
      return id;
    }

  }

  return "";

}


/* =========================================================
   RESOURCES
========================================================= */

async function handleResources() {

  if (
    !localMe ||
    !localMe.alive
  ) {
    return;
  }

  const now =
    Date.now();

  if (
    now -
      lastResourceCheck <
    100
  ) {
    return;
  }

  lastResourceCheck =
    now;

  const dock =
    myDock();

  /*
    اگر چیزی حمل می‌کنیم،
    آن را به پایگاه برسان.
  */

  if (
    localMe.carrying
  ) {

    if (
      distance(
        localMe,
        dock
      ) <
      DOCK_RADIUS
    ) {

      const resourceId =
        localMe.carrying;

      localMe.carrying =
        null;

      localMe.cargo++;

      localMe.fuel =
        Math.min(
          100,
          localMe.fuel +
            FUEL_PER_RESOURCE
        );

      burst(
        dock.x,
        dock.y,
        myColor,
        15
      );

      floater(
        dock.x,
        dock.y,
        "+۲۰ سوخت",
        "#ffc845"
      );

      tone(
        720,
        .08
      );

      if (
        !isSolo
      ) {

        await runTransaction(
          A(
            `resources/${resourceId}`
          ),
          resource => {

            if (
              !resource
            ) {
              return resource;
            }

            if (
              resource.takenBy !==
              myUid
            ) {
              return resource;
            }

            return {

              ...resource,

              takenBy:
                null,

              respawnAt:
                Date.now() +
                RESPAWN_DELAY

            };

          }
        );

      }

    }

    return;

  }


  /*
    پیدا کردن نزدیک‌ترین منبع آزاد
  */

  let nearestId =
    null;

  let nearest =
    Infinity;

  for (
    const [
      id,
      resource
    ] of Object.entries(
      resources
    )
  ) {

    if (
      resource.takenBy
    ) {
      continue;
    }

    if (
      Number(
        resource.respawnAt ||
          0
      ) >
      now
    ) {
      continue;
    }

    const d =
      distance(
        localMe,
        resource
      );

    if (
      d <
      nearest
    ) {

      nearest =
        d;

      nearestId =
        id;

    }

  }

  if (
    nearestId &&
    nearest <
      PLAYER_RADIUS +
      RESOURCE_RADIUS +
      6
  ) {

    if (
      isSolo
    ) {

      const resource =
        soloResources.find(
          r =>
            r.id ===
            nearestId
        );

      if (
        resource
      ) {

        resource.takenBy =
          myUid;

        localMe.carrying =
          nearestId;

      }

    }
    else {

      const transaction =
        await runTransaction(
          A(
            `resources/${nearestId}/takenBy`
          ),
          current => {

            if (
              current
            ) {
              return current;
            }

            return myUid;

          }
        );

      if (
        transaction.committed &&
        transaction.snapshot.val() ===
          myUid
      ) {

        localMe.carrying =
          nearestId;

        tone(
          500,
          .06
        );

      }

    }

  }

}


/* =========================================================
   RESPAWN
========================================================= */

async function maintainResources() {

  if (
    isSolo ||
    myColorIndex !== 0
  ) {
    return;
  }

  const now =
    Date.now();

  for (
    const [
      id,
      resource
    ] of Object.entries(
      resources
    )
  ) {

    if (
      resource.takenBy
    ) {
      continue;
    }

    if (
      Number(
        resource.respawnAt ||
          0
      ) >
      now
    ) {
      continue;
    }

  }

  /*
    اگر منبعی وجود نداشت،
    فقط Host آن را اضافه می‌کند.
  */

  const count =
    Object.keys(
      resources
    ).filter(
      id => {

        const r =
          resources[id];

        return (
          !r.takenBy &&
          Number(
            r.respawnAt ||
              0
          ) <=
            now
        );

      }
    ).length;

  const active =
    Object.values(
      resources
    ).filter(
      r =>
        !r.takenBy &&
        Number(
          r.respawnAt ||
            0
        ) <=
          now
    ).length;

  if (
    active >=
    RESOURCE_COUNT
  ) {
    return;
  }

  const missing =
    RESOURCE_COUNT -
    active;

  for (
    let i = 0;
    i < missing;
    i++
  ) {

    const id =
      "r" +
      Date.now() +
      "_" +
      Math.random()
        .toString(36)
        .slice(2,6);

    await set(
      A(
        `resources/${id}`
      ),
      {

        x:
          rand(
            W * .25,
            W * .75
          ),

        y:
          rand(
            H * .20,
            H * .80
          ),

        takenBy:
          null,

        respawnAt:
          0

      }
    );

  }

}


/* =========================================================
   WIN CONDITION
========================================================= */

async function checkWinCondition() {

  if (
    isSolo ||
    raceOver
  ) {
    return;
  }

  /*
    رسیدن به 100 سوخت
  */

  if (
    localMe &&
    localMe.alive &&
    localMe.fuel >= 100 &&
    distance(
      localMe,
      myDock()
    ) <
      DOCK_RADIUS
  ) {

    await claimWinner(
      myUid
    );

    return;

  }


  /*
    آخرین نفر روی زمین
  */

  const alivePlayers =
    Object.entries(
      players
    ).filter(
      ([uid, player]) =>
        player &&
        player.alive !== false
    );

  if (
    alivePlayers.length === 1
  ) {

    await claimWinner(
      alivePlayers[0][0]
    );

  }

}


async function claimWinner(
  uid
) {

  if (
    raceOver
  ) {
    return;
  }

  await runTransaction(
    A("meta"),
    current => {

      if (
        !current
      ) {
        return current;
      }

      if (
        current.winnerUid
      ) {
        return current;
      }

      return {

        ...current,

        status:
          "finished",

        winnerUid:
          uid,

        finishedAt:
          Date.now()

      };

    }
  );

}


/* =========================================================
   TIMEOUT
========================================================= */

async function checkTimeout() {

  if (
    isSolo ||
    raceOver ||
    !gameEndsAt
  ) {
    return;
  }

  if (
    Date.now() >=
    gameEndsAt
  ) {

    const alive =
      Object.entries(
        players
      )
      .filter(
        ([uid,p]) =>
          p &&
          p.alive !== false
      )
      .sort(
        ([aUid,a],[bUid,b]) =>
          Number(
            b.fuel || 0
          ) -
          Number(
            a.fuel || 0
          )
      );

    const winner =
      alive.length
        ? alive[0][0]
        : null;

    await claimWinner(
      winner
    );

  }

}


/* =========================================================
   FINISH
========================================================= */

async function finishMatch(
  iWon
) {

  if (
    raceOver
  ) {
    return;
  }

  raceOver =
    true;

  running =
    false;

  paused =
    true;

  tone(
    iWon
      ? 1300
      : 300,
    .3
  );

  if (
    localMe &&
    localMe.alive
  ) {

    await syncPlayer();

  }

  try {

    await recordRoundResult(
      myName,
      GAME_ID,
      {
        won:
          iWon
      }
    );

  } catch (
    error
  ) {

    console.error(
      "Astra result error:",
      error
    );

  }

  showResult(
    iWon
  );

}


/* =========================================================
   RESULT SCREEN
========================================================= */

function showResult(
  iWon
) {

  resultScreen.style.display =
    "flex";

  resultScreen.innerHTML = `

    <div
      class="headline ${
        iWon
          ? "winner"
          : "loser"
      }"
    >
      ${
        iWon
          ? "🏆 پیروزی!"
          : "😅 این‌بار نشد"
      }
    </div>

    <div
      style="
        color:#8B93B8;
        font-size:13px;
        margin-bottom:16px;
      "
    >
      ${
        winnerUid
          ? (
            winnerUid ===
            myUid
              ? "تو آخرین بازیکن باقی‌مانده بودی."
              : "یک بازیکن دیگر برنده شد."
          )
          : "زمان مسابقه تمام شد."
      }
    </div>

    <button
      id="astraBackLobby"
    >
      🏠 بازگشت به اتاق
    </button>

    <button
      id="astraHome"
      class="ghost"
    >
      🏠 بازگشت به خانه
    </button>

  `;

  const back =
    document.getElementById(
      "astraBackLobby"
    );

  const home =
    document.getElementById(
      "astraHome"
    );

  back.addEventListener(
    "click",
    async () => {

      try {

        if (
          !isSolo &&
          myUid
        ) {

          await remove(
            A(
              `players/${myUid}`
            )
          );

        }

      } catch {}

      window.location.href =
        "../lobby.html";

    }
  );

  home.addEventListener(
    "click",
    () => {

      window.location.href =
        "../index.html";

    }
  );

}


/* =========================================================
   HUD
========================================================= */

function updateHud() {

  if (!localMe) {
    return;
  }

  fuelEl.style.width =
    clamp(
      localMe.fuel,
      0,
      100
    ) +
    "%";

  cargoEl.textContent =
    localMe.cargo;

  hpEl.textContent =
    "❤️".repeat(
      Math.max(
        0,
        localMe.hp
      )
    ) +
    "🖤".repeat(
      Math.max(
        0,
        MAX_HP -
          localMe.hp
      )
    );

  const remaining =
    Math.max(
      0,
      localMe.boostedUntil -
        Date.now()
    );

  boostEl.textContent =
    remaining > 0
      ? "فعال"
      : (
        Date.now() -
          lastBoost <
        BOOST_COOLDOWN
          ? "درحال شارژ"
          : "آماده"
      );

  const otherPlayers =
    Object.entries(
      players
    )
    .filter(
      ([uid]) =>
        uid !==
        myUid
    );

  othersHud.innerHTML =
    otherPlayers
      .map(
        ([uid,p]) => {

          const color =
            playerColor(
              p.colorIndex
            );

          const hp =
            Number(
              p.hp ??
              MAX_HP
            );

          const fuel =
            Number(
              p.fuel ||
              0
            );

          return `

            <div
              class="astra-hud-chip"
            >

              <div
                class="name"
                style="
                  color:${color};
                "
              >
                🚀
                ${escapeHtml(
                  p.name ||
                  "بازیکن"
                )}
              </div>

              <div
                style="
                  font-size:8px;
                "
              >
                ${"❤️".repeat(
                  Math.max(
                    0,
                    hp
                  )
                )}
              </div>

              <div
                class="mini-bar"
              >

                <div
                  class="mini-fill"
                  style="
                    width:${clamp(
                      fuel,
                      0,
                      100
                    )}%;
                    background:${color};
                  "
                ></div>

              </div>

            </div>

          `;

        }
      )
      .join("");

}

function escapeHtml(
  value
) {

  return String(
    value
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================================================
   TIMER
========================================================= */

function updateTimer() {

  if (
    isSolo
  ) {

    timerEl.textContent =
      "تک‌نفره";

    return;

  }

  if (
    !gameEndsAt
  ) {

    timerEl.textContent =
      "03:00";

    return;

  }

  const seconds =
    (
      gameEndsAt -
      Date.now()
    ) / 1000;

  timerEl.textContent =
    formatTime(
      seconds
    );

  if (
    seconds <= 10
  ) {

    timerEl.style.color =
      "#ff4f81";

  } else {

    timerEl.style.color =
      "#ffc845";

  }

}


/* =========================================================
   DRAW
========================================================= */

function drawBackground(
  time
) {

  ctx.fillStyle =
    "#05060f";

  ctx.fillRect(
    0,
    0,
    W,
    H
  );

  const gradient =
    ctx.createRadialGradient(
      W * .25,
      H * .20,
      0,
      W * .25,
      H * .20,
      Math.max(
        W,
        H
      ) * .6
    );

  gradient.addColorStop(
    0,
    "rgba(124,77,255,.15)"
  );

  gradient.addColorStop(
    1,
    "rgba(124,77,255,0)"
  );

  ctx.fillStyle =
    gradient;

  ctx.fillRect(
    0,
    0,
    W,
    H
  );


  const grid =
    Math.max(
      36,
      Math.min(
        W,
        H
      ) / 12
    );

  ctx.strokeStyle =
    "rgba(255,255,255,.025)";

  ctx.lineWidth =
    1;

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


  for (
    const star of
      localStars
  ) {

    const alpha =
      .35 +
      Math.sin(
        time * 2 +
        star.phase
      ) * .25;

    ctx.globalAlpha =
      Math.max(
        .08,
        alpha
      );

    ctx.fillStyle =
      "#fff";

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

}


/* =========================================================
   DRAW DOCK
========================================================= */

function drawDock(
  dock,
  color,
  active
) {

  ctx.save();

  ctx.beginPath();

  ctx.arc(
    dock.x,
    dock.y,
    DOCK_RADIUS,
    0,
    Math.PI * 2
  );

  ctx.strokeStyle =
    color;

  ctx.lineWidth =
    active
      ? 3
      : 1.5;

  ctx.globalAlpha =
    active
      ? .95
      : .35;

  if (
    active
  ) {

    ctx.shadowColor =
      color;

    ctx.shadowBlur =
      18;

  }

  ctx.stroke();

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
    resource.takenBy
  ) {
    return;
  }

  if (
    Number(
      resource.respawnAt ||
        0
    ) >
    Date.now()
  ) {
    return;
  }

  const pulse =
    1 +
    Math.sin(
      time * 4 +
      Number(
        resource.x
      )
    ) *
    .10;

  ctx.save();

  ctx.beginPath();

  ctx.arc(
    resource.x,
    resource.y,
    RESOURCE_RADIUS *
      pulse,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    "#ffc845";

  ctx.shadowColor =
    "#ffc845";

  ctx.shadowBlur =
    14;

  ctx.fill();

  ctx.shadowBlur =
    0;

  ctx.fillStyle =
    "#05060f";

  ctx.font =
    "10px sans-serif";

  ctx.textAlign =
    "center";

  ctx.textBaseline =
    "middle";

  ctx.fillText(
    "⚡",
    resource.x,
    resource.y
  );

  ctx.restore();

}


/* =========================================================
   DRAW SHOT
========================================================= */

function drawShot(
  shot
) {

  ctx.save();

  ctx.beginPath();

  ctx.arc(
    shot.x,
    shot.y,
    4,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    shot.color ||
    "#fff";

  ctx.shadowColor =
    shot.color ||
    "#fff";

  ctx.shadowBlur =
    12;

  ctx.fill();

  ctx.restore();

}


/* =========================================================
   DRAW PLAYER
========================================================= */

function drawPlayer(
  player,
  color,
  name,
  isMe
) {

  if (
    !player ||
    player.alive === false
  ) {
    return;
  }

  const angle =
    Number(
      player.angle ||
      0
    );

  ctx.save();

  ctx.translate(
    player.x,
    player.y
  );

  ctx.rotate(
    angle
  );

  /*
    Boost flame
  */

  const boosted =
    Number(
      player.boostedUntil ||
      0
    ) >
    Date.now();

  if (
    boosted
  ) {

    ctx.beginPath();

    ctx.moveTo(
      -10,
      -4
    );

    ctx.lineTo(
      -24 -
        Math.random() * 8,
      0
    );

    ctx.lineTo(
      -10,
      4
    );

    ctx.closePath();

    ctx.fillStyle =
      "#ffc845";

    ctx.shadowColor =
      "#ffc845";

    ctx.shadowBlur =
      15;

    ctx.fill();

    ctx.shadowBlur =
      0;

  }


  /*
    Rocket
  */

  ctx.beginPath();

  ctx.moveTo(
    18,
    0
  );

  ctx.lineTo(
    -11,
    -11
  );

  ctx.lineTo(
    -7,
    0
  );

  ctx.lineTo(
    -11,
    11
  );

  ctx.closePath();

  ctx.fillStyle =
    color;

  ctx.shadowColor =
    color;

  ctx.shadowBlur =
    isMe
      ? 14
      : 8;

  ctx.fill();

  ctx.shadowBlur =
    0;


  /*
    cockpit
  */

  ctx.beginPath();

  ctx.arc(
    3,
    0,
    5,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    "#dff6ff";

  ctx.fill();


  ctx.restore();


  /*
    carrying resource
  */

  if (
    player.carrying
  ) {

    ctx.beginPath();

    ctx.arc(
      player.x -
        Math.cos(
          angle
        ) * 20,

      player.y -
        Math.sin(
          angle
        ) * 20,

      5,

      0,
      Math.PI * 2
    );

    ctx.fillStyle =
      "#ffc845";

    ctx.shadowColor =
      "#ffc845";

    ctx.shadowBlur =
      8;

    ctx.fill();

    ctx.shadowBlur =
      0;

  }


  /*
    name
  */

  ctx.fillStyle =
    "#eaf0ff";

  ctx.font =
    "bold 10px Vazirmatn, Arial";

  ctx.textAlign =
    "center";

  ctx.fillText(
    name ||
      "بازیکن",
    player.x,
    player.y -
      24
  );

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

  const dock =
    myDock();

  drawDock(
    dock,
    myColor,
    localMe &&
      localMe.fuel >= 100
  );


  /*
    منابع
  */

  const resourceList =
    isSolo
      ? soloResources
      : Object.values(
          resources
        );

  for (
    const resource of
      resourceList
  ) {

    drawResource(
      resource,
      time
    );

  }


  /*
    بازیکنان دیگر
  */

  if (
    !isSolo
  ) {

    for (
      const [
        uid,
        player
      ] of Object.entries(
        players
      )
    ) {

      if (
        uid ===
        myUid
      ) {
        continue;
      }

      const color =
        playerColor(
          player.colorIndex
        );

      const dock =
        dockFor(
          player.colorIndex
        );

      drawDock(
        dock,
        color,
        Number(
          player.fuel ||
            0
        ) >= 100
      );

      drawPlayer(
        player,
        color,
        player.name,
        false
      );

    }

  }


  /*
    خودمان
  */

  if (
    localMe
  ) {

    drawPlayer(
      localMe,
      myColor,
      myName,
      true
    );

  }


  /*
    تیرها
  */

  for (
    const shot of
      Object.values(
        shots
      )
  ) {

    drawShot(
      shot
    );

  }


  /*
    Effects
  */

  for (
    const particle of
      localParticles
  ) {

    ctx.globalAlpha =
      Math.max(
        0,
        particle.life
      );

    ctx.fillStyle =
      particle.color;

    ctx.beginPath();

    ctx.arc(
      particle.x,
      particle.y,
      2.5,
      0,
      Math.PI * 2
    );

    ctx.fill();

  }

  ctx.globalAlpha =
    1;


  for (
    const f of
      localFloaters
  ) {

    ctx.globalAlpha =
      Math.max(
        0,
        f.life
      );

    ctx.fillStyle =
      f.color;

    ctx.font =
      "bold 12px Vazirmatn";

    ctx.textAlign =
      "center";

    ctx.fillText(
      f.text,
      f.x,
      f.y
    );

  }

  ctx.globalAlpha =
    1;

}


/* =========================================================
   COUNTDOWN
========================================================= */

async function countdown() {

  if (
    countdownRunning
  ) {
    return;
  }

  countdownRunning =
    true;

  paused =
    true;

  for (
    const text of
      [
        "۳",
        "۲",
        "۱",
        "برو!"
      ]
  ) {

    overlayMsg.innerHTML = `

      <div class="big">
        ${text}
      </div>

    `;

    overlayMsg.style.display =
      "flex";

    tone(
      text === "برو!"
        ? 900
        : 500,
      .08
    );

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          600
        )
    );

  }

  overlayMsg.style.display =
    "none";

  paused =
    orientationLocked;

  countdownRunning =
    false;

}


/* =========================================================
   SOLO
========================================================= */

function createSoloResources() {

  soloResources = [];

  for (
    let i = 0;
    i <
    RESOURCE_COUNT;
    i++
  ) {

    soloResources.push({

      id:
        "solo_" +
        i,

      x:
        rand(
          W * .25,
          W * .75
        ),

      y:
        rand(
          H * .20,
          H * .80
        ),

      takenBy:
        null,

      respawnAt:
        0

    });

  }

}

function createSoloBot() {

  const dock =
    dockFor(
      1
    );

  soloBot = {

    x:
      dock.x,

    y:
      dock.y,

    angle:
      Math.PI,

    hp:
      MAX_HP,

    fuel:
      0,

    cargo:
      0,

    carrying:
      null,

    alive:
      true,

    colorIndex:
      1

  };

}

function updateSoloBot(
  dt
) {

  if (
    !soloBot ||
    !soloBot.alive
  ) {
    return;
  }

  let target =
    null;

  if (
    soloBot.carrying
  ) {

    target =
      dockFor(
        1
      );

  } else {

    target =
      soloResources
        .filter(
          r =>
            !r.takenBy
        )
        .sort(
          (a,b) =>
            distance(
              soloBot,
              a
            ) -
            distance(
              soloBot,
              b
            )
        )[0];

  }

  if (!target) {
    return;
  }

  const dx =
    target.x -
    soloBot.x;

  const dy =
    target.y -
    soloBot.y;

  const d =
    Math.hypot(
      dx,
      dy
    ) || 1;

  soloBot.angle =
    Math.atan2(
      dy,
      dx
    );

  soloBot.x +=
    dx / d *
    120 *
    dt;

  soloBot.y +=
    dy / d *
    120 *
    dt;

  if (
    distance(
      soloBot,
      target
    ) <
    PLAYER_RADIUS +
      RESOURCE_RADIUS +
      6
  ) {

    if (
      soloBot.carrying
    ) {

      soloBot.cargo++;

      soloBot.fuel =
        Math.min(
          100,
          soloBot.fuel +
            FUEL_PER_RESOURCE
        );

      const resource =
        soloResources.find(
          r =>
            r.id ===
            soloBot.carrying
        );

      if (
        resource
      ) {

        resource.takenBy =
          null;

        resource.x =
          rand(
            W * .25,
            W * .75
          );

        resource.y =
          rand(
            H * .20,
            H * .80
          );

      }

      soloBot.carrying =
        null;

    } else {

      const resource =
        target;

      resource.takenBy =
        "bot";

      soloBot.carrying =
        resource.id;

    }

  }

  if (
    soloBot.fuel >=
      100 &&
    distance(
      soloBot,
      dockFor(1)
    ) <
      DOCK_RADIUS
  ) {

    finishMatch(
      false
    );

  }

}


/* =========================================================
   SOLO LOOP
========================================================= */

async function updateSolo(
  dt
) {

  await handleResources();

  updateSoloBot(
    dt
  );

  if (
    localMe &&
    localMe.fuel >= 100 &&
    distance(
      localMe,
      myDock()
    ) <
      DOCK_RADIUS
  ) {

    finishMatch(
      true
    );

  }

}


/* =========================================================
   JOYSTICK
========================================================= */

function setupJoystick() {

  let active =
    false;

  let pointerId =
    null;

  let origin = {
    x: 0,
    y: 0
  };

  function start(
    event
  ) {

    active =
      true;

    pointerId =
      event.pointerId;

    const rect =
      joystickBase
        .getBoundingClientRect();

    origin = {

      x:
        rect.left +
        rect.width / 2,

      y:
        rect.top +
        rect.height / 2

    };

    joystickBase.classList.add(
      "pressed"
    );

    joystickBase.setPointerCapture(
      event.pointerId
    );

  }

  function move(
    event
  ) {

    if (
      !active ||
      event.pointerId !==
        pointerId
    ) {
      return;
    }

    let dx =
      event.clientX -
      origin.x;

    let dy =
      event.clientY -
      origin.y;

    const max =
      joystickBase
        .getBoundingClientRect()
        .width *
      .38;

    const length =
      Math.hypot(
        dx,
        dy
      );

    if (
      length <
      max * .12
    ) {

      joy = {
        x: 0,
        y: 0
      };

      joystickKnob.style.transform =
        "translate(0,0)";

      return;

    }

    if (
      length >
      max
    ) {

      dx =
        dx / length *
        max;

      dy =
        dy / length *
        max;

    }

    joystickKnob.style.transform =
      `translate(${dx}px, ${dy}px)`;

    joy = {

      x:
        dx / max,

      y:
        dy / max

    };

  }

  function end() {

    active =
      false;

    pointerId =
      null;

    joy = {
      x: 0,
      y: 0
    };

    joystickKnob.style.transform =
      "translate(0,0)";

    joystickBase.classList.remove(
      "pressed"
    );

  }

  joystickBase.addEventListener(
    "pointerdown",
    event => {

      event.preventDefault();

      start(
        event
      );

    }
  );

  joystickBase.addEventListener(
    "pointermove",
    event => {

      event.preventDefault();

      move(
        event
      );

    }
  );

  joystickBase.addEventListener(
    "pointerup",
    end
  );

  joystickBase.addEventListener(
    "pointercancel",
    end
  );

}


/* =========================================================
   FIRE BUTTON
========================================================= */

function setupFire() {

  fireButton.addEventListener(
    "pointerdown",
    event => {

      event.preventDefault();

      fireHeld =
        true;

      fire();

    }
  );

  fireButton.addEventListener(
    "pointerup",
    event => {

      event.preventDefault();

      fireHeld =
        false;

    }
  );

  fireButton.addEventListener(
    "pointercancel",
    () => {

      fireHeld =
        false;

    }
  );

}


/* =========================================================
   KEYBOARD
========================================================= */

const keys = {};

window.addEventListener(
  "keydown",
  event => {

    keys[
      event.key
    ] = true;

    updateKeyboard();

  }
);

window.addEventListener(
  "keyup",
  event => {

    keys[
      event.key
    ] = false;

    updateKeyboard();

  }
);

function updateKeyboard() {

  let x = 0;

  let y = 0;

  if (
    keys.ArrowLeft ||
    keys.a
  ) {
    x--;
  }

  if (
    keys.ArrowRight ||
    keys.d
  ) {
    x++;
  }

  if (
    keys.ArrowUp ||
    keys.w
  ) {
    y--;
  }

  if (
    keys.ArrowDown ||
    keys.s
  ) {
    y++;
  }

  if (
    x !== 0 ||
    y !== 0
  ) {

    joy = {
      x,
      y
    };

  }

}


/* =========================================================
   FIRE LOOP
========================================================= */

function fireLoop() {

  if (
    fireHeld &&
    running &&
    !paused &&
    !raceOver
  ) {

    fire();

  }

  requestAnimationFrame(
    fireLoop
  );

}


/* =========================================================
   ORIENTATION
========================================================= */

function checkOrientation() {

  const width =
    window.innerWidth;

  const height =
    window.innerHeight;

  orientationLocked =
    width <
      height &&
    Math.min(
      width,
      height
    ) <
      700;

  rotateScreen.classList.toggle(
    "show",
    orientationLocked
  );

  if (
    running &&
    !raceOver
  ) {

    paused =
      orientationLocked;

  }

}


/* =========================================================
   CONNECTION UI
========================================================= */

function setConnection(
  online
) {

  connectionOnline =
    online;

  connectionEl.textContent =
    online
      ? "🟢 آنلاین"
      : "🔴 قطع اتصال";

  connectionEl.style.color =
    online
      ? "#3ecf8e"
      : "#ff4f81";

}


/* =========================================================
   MAIN LOOP
========================================================= */

async function loop(
  timestamp
) {

  if (
    !running
  ) {

    requestAnimationFrame(
      loop
    );

    return;

  }

  if (
    !lastFrame
  ) {

    lastFrame =
      timestamp;

  }

  const dt =
    Math.min(
      .05,
      (
        timestamp -
        lastFrame
      ) /
      1000
    );

  lastFrame =
    timestamp;


  if (
    !paused &&
    !raceOver
  ) {

    updateMovement(
      dt
    );

    updateEffects(
      dt
    );

    if (
      isSolo
    ) {

      await updateSolo(
        dt
      );

    }
    else {

      await handleResources();

      await processShots(
        dt
      );

      await checkShotHits();

      await maintainResources();

      await checkWinCondition();

      await checkTimeout();


      if (
        timestamp -
          lastSync >
        SYNC_INTERVAL
      ) {

        lastSync =
          timestamp;

        syncPlayer();

      }

    }

  }

  updateHud();

  updateTimer();

  draw(
    timestamp / 1000
  );

  requestAnimationFrame(
    loop
  );

}


/* =========================================================
   START
========================================================= */

async function startSolo() {

  modeBadge.textContent =
    "تک‌نفره";

  resizeCanvas();

  createLocalPlayer();

  createSoloResources();

  createSoloBot();

  running =
    true;

  gameStarted =
    true;

  requestAnimationFrame(
    loop
  );

  await countdown();

}


async function startMultiplayer() {

  modeBadge.textContent =
    "چندنفره — تا ۴ نفر";

  resizeCanvas();

  await joinGame();

  createLocalPlayer();

  listenGame();

  mountChat(
    myName,
    code
  );

  setConnection(
    true
  );

  running =
    true;

  requestAnimationFrame(
    loop
  );

  await countdown();

}


/* =========================================================
   CLEANUP
========================================================= */

async function cleanup() {

  if (
    cleanupStarted
  ) {
    return;
  }

  cleanupStarted =
    true;

  for (
    const unsubscribe of
      unsubscribers
  ) {

    try {
      unsubscribe();
    } catch {}

  }

  unsubscribers =
    [];

  if (
    !isSolo &&
    myUid
  ) {

    try {

      await remove(
        A(
          `players/${myUid}`
        )
      );

    } catch {}

  }

}


/* =========================================================
   BUTTONS
========================================================= */

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


boostButton.addEventListener(
  "pointerdown",
  event => {

    event.preventDefault();

    useBoost();

  }
);


fullscreenButton.addEventListener(
  "click",
  async () => {

    try {

      if (
        !document.fullscreenElement
      ) {

        await document
          .documentElement
          .requestFullscreen();

      }
      else {

        await document.exitFullscreen();

      }

    } catch {}

  }
);


/* =========================================================
   WINDOW EVENTS
========================================================= */

window.addEventListener(
  "resize",
  () => {

    checkOrientation();

    resizeCanvas();

  }
);

window.addEventListener(
  "orientationchange",
  () => {

    setTimeout(
      () => {

        checkOrientation();

        resizeCanvas();

      },
      150
    );

  }
);

window.addEventListener(
  "beforeunload",
  () => {

    cleanup();

  }
);


/* =========================================================
   INIT
========================================================= */

async function init() {

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

    myName =
      getSavedName();

    myUid =
      currentUid();

    if (
      !myUid ||
      !myName
    ) {

      window.location.href =
        "../index.html";

      return;

    }

    p1Label.textContent =
      myName;

    checkOrientation();

    resizeCanvas();

    setupJoystick();

    setupFire();

    fireLoop();

    if (
      isSolo
    ) {

      await startSolo();

    }
    else {

      if (
        !code
      ) {

        window.location.href =
          "../index.html";

        return;

      }

      await startMultiplayer();

    }

  } catch (
    error
  ) {

    console.error(
      "ASTRA INIT ERROR:",
      error
    );

    overlayMsg.innerHTML = `

      <div class="big">
        ❌
      </div>

      <div class="sub">
        اتصال به بازی برقرار نشد
      </div>

    `;

    overlayMsg.style.display =
      "flex";

  }

}


/* =========================================================
   RUN
========================================================= */

init();
