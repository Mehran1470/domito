import {
  waitForUser,
  getSavedName,
  currentUid,
  roomRef,
  getSavedRoom,
  onValue,
  ref,
  db,
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

const params =
  new URLSearchParams(
    window.location.search
  );

const isSolo =
  params.has("solo");

const code =
  getSavedRoom();

const FUEL_PER_RESOURCE = 20;
const RESOURCE_COUNT = 4;
const CARRY_RANGE_MULT = 1.15;

const BASE_SPEED_FACTOR = 0.4;

const CONNECTION_TIMEOUT = 10000;

/* =========================================================
   FIREBASE PATHS
========================================================= */

function roomPath(path = "") {

  if (!code) {
    throw new Error(
      "no-room"
    );
  }

  return roomRef(
    code,
    path
  );
}

function astraRef(path = "") {

  if (!code) {
    throw new Error(
      "no-room"
    );
  }

  return ref(
    db,
    `rooms/${code}/astra/${path}`
  );
}

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

const fuelP1El =
  document.getElementById(
    "fuelP1"
  );

const cargoP1El =
  document.getElementById(
    "cargoP1"
  );

const p1Label =
  document.getElementById(
    "p1Label"
  );

const othersHud =
  document.getElementById(
    "othersHud"
  );

const modeBadge =
  document.getElementById(
    "astraModeBadge"
  );

const fullscreenBtn =
  document.getElementById(
    "astraFullscreenBtn"
  );

const muteBtn =
  document.getElementById(
    "astraMuteBtn"
  );

const joyBase =
  document.getElementById(
    "astraJoyBaseP1"
  );

const joyKnob =
  document.getElementById(
    "astraJoyKnobP1"
  );

/* =========================================================
   CONNECTION UI
========================================================= */

let connectionOverlay =
  null;

function createConnectionOverlay() {

  if (connectionOverlay) {
    return;
  }

  connectionOverlay =
    document.createElement(
      "div"
    );

  connectionOverlay.className =
    "astra-wait-overlay";

  connectionOverlay.style.cssText = `
    position:absolute;
    inset:0;
    z-index:28;
    display:flex;
    align-items:center;
    justify-content:center;
    flex-direction:column;
    text-align:center;
    background:rgba(5,6,15,.88);
    backdrop-filter:blur(8px);
    padding:20px;
    color:#EAF0FF;
  `;

  connectionOverlay.innerHTML = `
    <div
      style="
        font-size:36px;
        margin-bottom:12px;
      "
    >
      🚀
    </div>

    <h2
      id="astraConnectionTitle"
      style="
        margin:0 0 8px;
        font-size:18px;
      "
    >
      در حال اتصال...
    </h2>

    <p
      id="astraConnectionText"
      style="
        margin:0;
        color:#8B93B8;
        font-size:13px;
        max-width:300px;
        line-height:1.8;
      "
    >
      در حال اتصال به اتاق دومیتو
    </p>

    <button
      id="astraConnectionRetry"
      style="
        display:none;
        margin-top:16px;
        border:0;
        border-radius:12px;
        padding:10px 18px;
        background:linear-gradient(
          135deg,
          #4F7CFF,
          #9B5CFF
        );
        color:#fff;
        font-family:inherit;
        font-weight:800;
        cursor:pointer;
      "
    >
      🔄 تلاش دوباره
    </button>
  `;

  arenaBox.appendChild(
    connectionOverlay
  );

  const retry =
    document.getElementById(
      "astraConnectionRetry"
    );

  retry.addEventListener(
    "click",
    () => {
      window.location.reload();
    }
  );
}

function setConnectionStatus(
  title,
  text,
  isError = false
) {

  createConnectionOverlay();

  const titleEl =
    document.getElementById(
      "astraConnectionTitle"
    );

  const textEl =
    document.getElementById(
      "astraConnectionText"
    );

  const retry =
    document.getElementById(
      "astraConnectionRetry"
    );

  titleEl.textContent =
    title;

  textEl.textContent =
    text;

  retry.style.display =
    isError
      ? "inline-block"
      : "none";

  connectionOverlay.style.display =
    "flex";
}

function hideConnectionStatus() {

  if (!connectionOverlay) {
    return;
  }

  connectionOverlay.style.display =
    "none";
}

/* =========================================================
   TIMEOUT
========================================================= */

function withTimeout(
  promise,
  ms = CONNECTION_TIMEOUT,
  label = "operation"
) {

  return Promise.race([

    promise,

    new Promise(
      (_, reject) => {

        setTimeout(
          () => {

            const error =
              new Error(
                `${label}-timeout`
              );

            error.code =
              "timeout";

            reject(error);

          },
          ms
        );

      }
    )

  ]);
}

/* =========================================================
   ERROR TEXT
========================================================= */

function friendlyError(
  error
) {

  const code =
    error?.code ||
    error?.message ||
    "";

  if (
    String(code)
      .includes("permission-denied")
  ) {

    return (
      "Firebase اجازه دسترسی به بخش Astra را نداد."
    );
  }

  if (
    String(code)
      .includes("timeout")
  ) {

    return (
      "اتصال به Firebase بیش از حد طول کشید."
    );
  }

  if (
    String(code)
      .includes("no-room")
  ) {

    return (
      "کد اتاق پیدا نشد."
    );
  }

  if (
    String(code)
      .includes("not-authenticated")
  ) {

    return (
      "ورود به حساب دومیتو تأیید نشد."
    );
  }

  return (
    "اتصال Astra با خطای غیرمنتظره مواجه شد."
  );
}

/* =========================================================
   CANVAS
========================================================= */

let W = 900;
let H = 450;

let SHIP_R = 15;
let RES_R = 12;
let DOCK_R = 30;

let BASE_SPEED = 190;

let stars = [];

let entitiesInitialized =
  false;

function recomputeScaledSizes() {

  const minDim =
    Math.min(
      W,
      H
    );

  SHIP_R =
    Math.max(
      10,
      minDim * 0.036
    );

  RES_R =
    Math.max(
      9,
      minDim * 0.03
    );

  DOCK_R =
    Math.max(
      20,
      minDim * 0.08
    );

  BASE_SPEED =
    minDim *
    BASE_SPEED_FACTOR;
}

function regenerateBackground() {

  stars = [];

  const count =
    Math.round(
      (W * H) / 4500
    );

  for (
    let i = 0;
    i < count;
    i++
  ) {

    stars.push({
      x:
        Math.random() * W,

      y:
        Math.random() * H,

      r:
        Math.random() *
          1.4 +
        0.3,

      tw:
        Math.random() *
        Math.PI *
        2
    });

  }
}

function resizeCanvasResolution() {

  if (!arenaBox) {
    return;
  }

  const rect =
    arenaBox.getBoundingClientRect();

  const cssW =
    Math.max(
      1,
      rect.width
    );

  const cssH =
    Math.max(
      1,
      rect.height
    );

  const dpr =
    Math.min(
      window.devicePixelRatio ||
        1,
      2.5
    );

  canvas.width =
    Math.round(
      cssW * dpr
    );

  canvas.height =
    Math.round(
      cssH * dpr
    );

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  const oldW = W;
  const oldH = H;

  W = cssW;
  H = cssH;

  recomputeScaledSizes();

  regenerateBackground();

  computeDock();

  if (
    entitiesInitialized &&
    oldW > 0 &&
    oldH > 0
  ) {

    const rx =
      W / oldW;

    const ry =
      H / oldH;

    if (
      Number.isFinite(rx) &&
      Number.isFinite(ry) &&
      rx > 0 &&
      ry > 0
    ) {

      [
        me,
        aiShip
      ].forEach(
        ship => {

          if (!ship) {
            return;
          }

          ship.x *= rx;
          ship.y *= ry;

          if (ship.trail) {

            ship.trail.forEach(
              point => {

                point.x *= rx;
                point.y *= ry;

              }
            );

          }

        }
      );

      if (
        aiShip &&
        aiShip.dock
      ) {

        aiShip.dock.x *= rx;
        aiShip.dock.y *= ry;

      }

      localResources.forEach(
        r => {

          r.x *= rx;
          r.y *= ry;

        }
      );

      Object.values(
        firebaseResources
      ).forEach(
        r => {

          r.x *= rx;
          r.y *= ry;

        }
      );

      Object.values(
        others
      ).forEach(
        o => {

          o.x *= rx;
          o.y *= ry;

        }
      );

      me.x =
        Math.max(
          SHIP_R,
          Math.min(
            W - SHIP_R,
            me.x
          )
        );

      me.y =
        Math.max(
          SHIP_R,
          Math.min(
            H - SHIP_R,
            me.y
          )
        );

    }

  }

}

/* =========================================================
   DOCKS
========================================================= */

let myDock = {
  x: 0,
  y: 0
};

let dockColor =
  "#4F7CFF";

const DOCK_SPOTS_FRACTIONS = [

  {
    fx: 0.12,
    fy: 0.25
  },

  {
    fx: 0.88,
    fy: 0.25
  },

  {
    fx: 0.12,
    fy: 0.75
  },

  {
    fx: 0.88,
    fy: 0.75
  }

];

function dockForColorIndex(
  index
) {

  const d =
    DOCK_SPOTS_FRACTIONS[
      index %
        DOCK_SPOTS_FRACTIONS.length
    ];

  return {
    x: W * d.fx,
    y: H * d.fy
  };
}

function computeDock() {

  myDock =
    isSolo

      ? {
          x:
            SHIP_R * 3,

          y:
            H / 2
        }

      : dockForColorIndex(
          myColorIndex || 0
        );

}

/* =========================================================
   GAME STATE
========================================================= */

let myColorIndex = 0;

let me = {
  x: 0,
  y: 0,
  angle:
    -Math.PI / 2,
  fuel: 0,
  cargo: 0,
  carrying: null,
  trail: []
};

let localResources = [];

let aiShip = null;

let others = {};

let firebaseResources = {};

let particles = [];

let floaters = [];

let running = false;

let paused = true;

let raceOver = false;

let myName = "";

let myUid = "";

let joyVec = {
  x: 0,
  y: 0
};

let unsubs = [];

/* =========================================================
   COLORS
========================================================= */

const COLORS = [
  "#4F7CFF",
  "#9B5CFF",
  "#FF4F81",
  "#3ECF8E"
];

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

function dist(
  a,
  b
) {

  return Math.hypot(
    a.x - b.x,
    a.y - b.y
  );

}

/* =========================================================
   AUDIO
========================================================= */

let audioCtx = null;

let muted = false;

function playTone(
  frequency,
  duration
) {

  if (muted) {
    return;
  }

  try {

    if (!audioCtx) {

      audioCtx =
        new (
          window.AudioContext ||
          window.webkitAudioContext
        )();

    }

    const osc =
      audioCtx.createOscillator();

    const gain =
      audioCtx.createGain();

    osc.frequency.value =
      frequency;

    osc.type =
      "sine";

    gain.gain.setValueAtTime(
      0.08,
      audioCtx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioCtx.currentTime +
        duration
    );

    osc.connect(
      gain
    );

    gain.connect(
      audioCtx.destination
    );

    osc.start();

    osc.stop(
      audioCtx.currentTime +
        duration
    );

  } catch (
    error
  ) {}

}

muteBtn.addEventListener(
  "click",
  () => {

    muted =
      !muted;

    muteBtn.textContent =
      muted
        ? "🔇"
        : "🔊";

  }
);

/* =========================================================
   PLAYER MOVEMENT
========================================================= */

function updateMe(
  dt
) {

  const mag =
    Math.min(
      1,
      Math.hypot(
        joyVec.x,
        joyVec.y
      )
    );

  if (
    mag <= 0.02
  ) {

    return;

  }

  const len =
    Math.hypot(
      joyVec.x,
      joyVec.y
    ) || 1;

  const nx =
    joyVec.x / len;

  const ny =
    joyVec.y / len;

  me.angle =
    Math.atan2(
      ny,
      nx
    );

  me.x +=
    nx *
    mag *
    BASE_SPEED *
    dt;

  me.y +=
    ny *
    mag *
    BASE_SPEED *
    dt;

  me.x =
    Math.max(
      SHIP_R,
      Math.min(
        W - SHIP_R,
        me.x
      )
    );

  me.y =
    Math.max(
      SHIP_R,
      Math.min(
        H - SHIP_R,
        me.y
      )
    );

  me.trail.push({
    x: me.x,
    y: me.y
  });

  if (
    me.trail.length >
    12
  ) {

    me.trail.shift();

  }

}

/* =========================================================
   RESOURCES
========================================================= */

function spawnLocalResource() {

  const margin =
    RES_R * 3;

  localResources.push({

    id:
      "r" +
      Math.random(),

    x:
      rand(
        W * 0.3,
        W * 0.7
      ),

    y:
      rand(
        margin,
        H - margin
      ),

    spawnT: 0,

    pulse:
      Math.random() *
      Math.PI *
      2,

    takenBy:
      null

  });

}

/* =========================================================
   MOVE AI
========================================================= */

function moveToward(
  entity,
  target,
  dt
) {

  const d =
    dist(
      entity,
      target
    ) || 1;

  entity.x +=
    ((target.x -
      entity.x) /
      d) *
    BASE_SPEED *
    dt;

  entity.y +=
    ((target.y -
      entity.y) /
      d) *
    BASE_SPEED *
    dt;

  entity.angle =
    Math.atan2(
      target.y -
        entity.y,
      target.x -
        entity.x
    );

}

/* =========================================================
   CARRY LOGIC
========================================================= */

function handleCarryLogic(
  ship,
  resourcesArr,
  dock,
  isMe
) {

  if (ship.carrying) {

    if (
      dist(
        ship,
        dock
      ) <
      DOCK_R
    ) {

      ship.cargo++;

      ship.fuel =
        Math.min(
          100,
          ship.fuel +
            FUEL_PER_RESOURCE
        );

      addFloater(
        dock.x,
        dock.y,
        "+سوخت",
        dockColor
      );

      burstParticles(
        dock.x,
        dock.y,
        dockColor
      );

      playTone(
        700,
        0.08
      );

      const rid =
        ship.carrying;

      ship.carrying =
        null;

      if (isSolo) {

        localResources =
          localResources.filter(
            r =>
              r.id !== rid
          );

      } else {

        remove(
          astraRef(
            `resources/${rid}`
          )
        ).catch(
          () => {}
        );

      }

    }

    return;

  }

  let nearby = null;

  if (isSolo) {

    nearby =
      localResources.find(
        r =>
          !r.takenBy &&
          dist(
            ship,
            r
          ) <
          (
            SHIP_R +
            RES_R
          ) *
            CARRY_RANGE_MULT
      );

  } else {

    nearby =
      Object.entries(
        firebaseResources
      ).find(
        ([id, r]) =>
          !r.takenBy &&
          dist(
            ship,
            r
          ) <
          (
            SHIP_R +
            RES_R
          ) *
            CARRY_RANGE_MULT
      );

  }

  if (!nearby) {
    return;
  }

  if (isSolo) {

    nearby.takenBy =
      myUid;

    ship.carrying =
      nearby.id;

    playTone(
      500,
      0.06
    );

    return;

  }

  const [
    id,
    resource
  ] = nearby;

  runTransaction(
    astraRef(
      `resources/${id}/takenBy`
    ),
    current =>
      current
        ? current
        : myUid
  )
    .then(
      result => {

        if (
          result.committed &&
          result.snapshot.val() ===
            myUid
        ) {

          ship.carrying =
            id;

          playTone(
            500,
            0.06
          );

        }

      }
    )
    .catch(
      () => {}
    );

}

/* =========================================================
   SOLO
========================================================= */

function soloTick(
  dt,
  now
) {

  handleCarryLogic(
    me,
    localResources,
    myDock,
    true
  );

  if (!aiShip.launched) {

    if (
      aiShip.carrying
    ) {

      moveToward(
        aiShip,
        aiShip.dock,
        dt
      );

      if (
        dist(
          aiShip,
          aiShip.dock
        ) <
        DOCK_R
      ) {

        aiShip.cargo++;

        aiShip.fuel =
          Math.min(
            100,
            aiShip.fuel +
              FUEL_PER_RESOURCE
          );

        aiShip.carrying =
          null;

      }

    } else {

      const target =
        localResources
          .filter(
            r =>
              !r.takenBy
          )
          .sort(
            (a, b) =>
              dist(
                aiShip,
                a
              ) -
              dist(
                aiShip,
                b
              )
          )[0];

      if (target) {

        moveToward(
          aiShip,
          target,
          dt
        );

        if (
          dist(
            aiShip,
            target
          ) <
          (
            SHIP_R +
            RES_R
          ) *
            CARRY_RANGE_MULT
        ) {

          target.takenBy =
            "ai";

          aiShip.carrying =
            target.id;

        }

      }

    }

    aiShip.x =
      Math.max(
        SHIP_R,
        Math.min(
          W - SHIP_R,
          aiShip.x
        )
      );

    aiShip.y =
      Math.max(
        SHIP_R,
        Math.min(
          H - SHIP_R,
          aiShip.y
        )
      );

  }

  localResources =
    localResources.filter(
      r =>
        !r.takenBy
    );

  while (
    localResources.length <
    RESOURCE_COUNT
  ) {

    spawnLocalResource();

  }

  if (
    me.fuel >= 100 &&
    dist(
      me,
      myDock
    ) <
      DOCK_R &&
    !raceOver
  ) {

    finishRace(
      true
    );

  }

  if (
    aiShip.fuel >= 100 &&
    dist(
      aiShip,
      aiShip.dock
    ) <
      DOCK_R &&
    !raceOver
  ) {

    finishRace(
      false
    );

  }

  updateHudSolo();

}

/* =========================================================
   EFFECTS
========================================================= */

function burstParticles(
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
      (
        Math.PI *
        2 *
        i
      ) /
        count +
      Math.random() *
        0.3;

    const speed =
      rand(
        50,
        140
      );

    particles.push({

      x,
      y,

      vx:
        Math.cos(
          angle
        ) *
        speed,

      vy:
        Math.sin(
          angle
        ) *
        speed,

      life: 1,

      color

    });

  }

}

function addFloater(
  x,
  y,
  text,
  color
) {

  floaters.push({
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

  particles.forEach(
    p => {

      p.x +=
        p.vx *
        dt;

      p.y +=
        p.vy *
        dt;

      p.vx *=
        0.9;

      p.vy *=
        0.9;

      p.life -=
        dt *
        1.4;

    }
  );

  particles =
    particles.filter(
      p =>
        p.life > 0
    );

  floaters.forEach(
    f => {

      f.y -=
        dt *
        40;

      f.life -=
        dt *
        0.9;

    }
  );

  floaters =
    floaters.filter(
      f =>
        f.life > 0
    );

}

/* =========================================================
   DRAW BACKGROUND
========================================================= */

function drawBackground(
  t
) {

  ctx.fillStyle =
    "#05060f";

  ctx.fillRect(
    0,
    0,
    W,
    H
  );

  const neb =
    ctx.createRadialGradient(
      W * 0.25,
      H * 0.2,
      0,
      W * 0.25,
      H * 0.2,
      Math.max(
        W,
        H
      ) *
        0.5
    );

  neb.addColorStop(
    0,
    "rgba(124,77,255,.14)"
  );

  neb.addColorStop(
    1,
    "rgba(124,77,255,0)"
  );

  ctx.fillStyle =
    neb;

  ctx.fillRect(
    0,
    0,
    W,
    H
  );

  const neb2 =
    ctx.createRadialGradient(
      W * 0.8,
      H * 0.85,
      0,
      W * 0.8,
      H * 0.85,
      Math.max(
        W,
        H
      ) *
        0.45
    );

  neb2.addColorStop(
    0,
    "rgba(79,124,255,.12)"
  );

  neb2.addColorStop(
    1,
    "rgba(79,124,255,0)"
  );

  ctx.fillStyle =
    neb2;

  ctx.fillRect(
    0,
    0,
    W,
    H
  );

  ctx.strokeStyle =
    "rgba(255,255,255,.03)";

  ctx.lineWidth =
    1;

  const gap =
    Math.max(
      30,
      Math.min(
        W,
        H
      ) /
        12
    );

  for (
    let x = 0;
    x < W;
    x += gap
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
    y += gap
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

  stars.forEach(
    s => {

      const alpha =
        0.4 +
        Math.sin(
          t * 2 +
            s.tw
        ) *
          0.3;

      ctx.beginPath();

      ctx.arc(
        s.x,
        s.y,
        s.r,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        `rgba(255,255,255,${Math.max(
          0.1,
          alpha
        )})`;

      ctx.fill();

    }
  );

}

/* =========================================================
   DRAW DOCK
========================================================= */

function drawDock(
  dock,
  color,
  active
) {

  ctx.beginPath();

  ctx.arc(
    dock.x,
    dock.y,
    DOCK_R,
    0,
    Math.PI * 2
  );

  ctx.strokeStyle =
    color;

  ctx.globalAlpha =
    active
      ? 0.9
      : 0.3;

  ctx.lineWidth =
    active
      ? 3
      : 1.5;

  if (active) {

    ctx.shadowColor =
      color;

    ctx.shadowBlur =
      16;

  }

  ctx.stroke();

  ctx.shadowBlur =
    0;

  ctx.globalAlpha =
    1;

}

/* =========================================================
   DRAW TRAIL
========================================================= */

function drawTrail(
  trail,
  color
) {

  trail.forEach(
    (p, i) => {

      const a =
        (i /
          trail.length) *
        0.3;

      ctx.beginPath();

      ctx.arc(
        p.x,
        p.y,
        SHIP_R *
          (
            0.25 +
            (
              i /
              trail.length
            ) *
              0.4
          ),
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        color;

      ctx.globalAlpha =
        a;

      ctx.fill();

      ctx.globalAlpha =
        1;

    }
  );

}

/* =========================================================
   DRAW ROCKET
========================================================= */

function drawRocket(
  x,
  y,
  angle,
  color,
  label,
  carrying,
  boosted
) {

  ctx.save();

  ctx.translate(
    x,
    y
  );

  ctx.rotate(
    angle
  );

  ctx.beginPath();

  ctx.moveTo(
    -SHIP_R * 1.1,
    -SHIP_R * 0.4
  );

  ctx.lineTo(
    -SHIP_R *
      (
        1.8 +
        Math.random() *
          0.4
      ),
    0
  );

  ctx.lineTo(
    -SHIP_R * 1.1,
    SHIP_R * 0.4
  );

  ctx.closePath();

  ctx.fillStyle =
    "#FFC845";

  ctx.globalAlpha =
    0.85;

  ctx.fill();

  ctx.globalAlpha =
    1;

  ctx.beginPath();

  ctx.moveTo(
    SHIP_R * 1.3,
    0
  );

  ctx.lineTo(
    -SHIP_R * 0.8,
    -SHIP_R * 0.75
  );

  ctx.lineTo(
    -SHIP_R * 0.4,
    0
  );

  ctx.lineTo(
    -SHIP_R * 0.8,
    SHIP_R * 0.75
  );

  ctx.closePath();

  ctx.fillStyle =
    color;

  ctx.shadowColor =
    color;

  ctx.shadowBlur =
    boosted
      ? Math.min(
          22,
          SHIP_R * 1.5
        )
      : Math.min(
          10,
          SHIP_R * 0.8
        );

  ctx.fill();

  ctx.shadowBlur =
    0;

  ctx.restore();

  if (carrying) {

    ctx.beginPath();

    ctx.arc(
      x -
        Math.cos(
          angle
        ) *
          SHIP_R *
          1.6,

      y -
        Math.sin(
          angle
        ) *
          SHIP_R *
          1.6,

      RES_R * 0.5,

      0,
      Math.PI * 2
    );

    ctx.fillStyle =
      "#FFC845";

    ctx.shadowColor =
      "#FFC845";

    ctx.shadowBlur =
      8;

    ctx.fill();

    ctx.shadowBlur =
      0;

  }

  ctx.fillStyle =
    "#EAF0FF";

  ctx.font =
    `${Math.max(
      9,
      SHIP_R * 0.65
    )}px Vazirmatn, sans-serif`;

  ctx.textAlign =
    "center";

  ctx.fillText(
    label,
    x,
    y -
      SHIP_R -
      8
  );

}

/* =========================================================
   DRAW RESOURCES
========================================================= */

function drawResources(
  t,
  list
) {

  list.forEach(
    r => {

      if (r.takenBy) {
        return;
      }

      r.spawnT =
        Math.min(
          1,
          (
            r.spawnT ||
            0
          ) +
            0.06
        );

      const pulse =
        1 +
        Math.sin(
          t * 3 +
            (
              r.pulse ||
              0
            )
        ) *
          0.1;

      const rad =
        RES_R *
        r.spawnT *
        pulse;

      ctx.beginPath();

      ctx.arc(
        r.x,
        r.y,
        rad,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        "#FFC845";

      ctx.shadowColor =
        "#FFC845";

      ctx.shadowBlur =
        Math.min(
          16,
          rad
        );

      ctx.fill();

      ctx.shadowBlur =
        0;

      ctx.fillStyle =
        "#05060f";

      ctx.font =
        `${Math.max(
          8,
          rad * 0.8
        )}px sans-serif`;

      ctx.textAlign =
        "center";

      ctx.fillText(
        "⚡",
        r.x,
        r.y +
          rad * 0.3
      );

    }
  );

}

/* =========================================================
   DRAW EFFECTS
========================================================= */

function drawEffects() {

  particles.forEach(
    p => {

      ctx.beginPath();

      ctx.arc(
        p.x,
        p.y,
        2.4,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        p.color;

      ctx.globalAlpha =
        Math.max(
          0,
          p.life
        );

      ctx.fill();

      ctx.globalAlpha =
        1;

    }
  );

  floaters.forEach(
    f => {

      ctx.font =
        "bold 12px Vazirmatn, sans-serif";

      ctx.textAlign =
        "center";

      ctx.fillStyle =
        f.color;

      ctx.globalAlpha =
        Math.max(
          0,
          f.life
        );

      ctx.fillText(
        f.text,
        f.x,
        f.y
      );

      ctx.globalAlpha =
        1;

    }
  );

}

/* =========================================================
   DRAW
========================================================= */

function draw(
  t
) {

  drawBackground(
    t
  );

  drawDock(
    myDock,
    dockColor,
    me.fuel >= 100
  );

  if (isSolo) {

    drawResources(
      t,
      localResources
    );

    if (aiShip) {

      drawDock(
        aiShip.dock,
        "#9B5CFF",
        aiShip.fuel >=
          100
      );

      drawTrail(
        aiShip.trail ||
          [],
        "#9B5CFF"
      );

      drawRocket(
        aiShip.x,
        aiShip.y,
        aiShip.angle,
        "#9B5CFF",
        "ربات",
        aiShip.carrying,
        false
      );

    }

  } else {

    drawResources(
      t,
      Object.entries(
        firebaseResources
      ).map(
        ([id, r]) => ({
          ...r,
          id
        })
      )
    );

    Object.values(
      others
    ).forEach(
      o => {

        const oDock =
          dockForColorIndex(
            o.colorIndex ||
              0
          );

        drawDock(
          oDock,
          o.color,
          (o.fuel || 0) >=
            100
        );

        drawTrail(
          o.trail || [],
          o.color
        );

        drawRocket(
          o.x,
          o.y,
          o.angle || 0,
          o.color,
          o.name,
          o.carrying,
          false
        );

      }
    );

  }

  drawTrail(
    me.trail,
    dockColor
  );

  drawRocket(
    me.x,
    me.y,
    me.angle,
    dockColor,
    myName || "تو",
    me.carrying,
    false
  );

  drawEffects();

}

/* =========================================================
   HUD
========================================================= */

function updateHudSolo() {

  fuelP1El.style.width =
    `${me.fuel}%`;

  cargoP1El.textContent =
    me.cargo;

  othersHud.innerHTML = `
    <div class="astra-hud-chip">
      <div
        class="name"
        style="color:#9B5CFF;"
      >
        🤖 ربات
      </div>

      <div class="mini-bar">
        <div
          class="mini-fill"
          style="
            width:${aiShip.fuel}%;
            background:#9B5CFF;
          "
        ></div>
      </div>
    </div>
  `;

}

function updateHudRoom() {

  fuelP1El.style.width =
    `${me.fuel}%`;

  cargoP1El.textContent =
    me.cargo;

  othersHud.innerHTML =
    Object.values(
      others
    )
      .map(
        o => `
          <div
            class="astra-hud-chip"
          >
            <div
              class="name"
              style="
                color:${o.color};
              "
            >
              🚀 ${o.name}
            </div>

            <div class="mini-bar">
              <div
                class="mini-fill"
                style="
                  width:${o.fuel || 0}%;
                  background:${o.color};
                "
              ></div>
            </div>
          </div>
        `
      )
      .join("");

}

/* =========================================================
   RENDER LOOP
========================================================= */

let lastTime =
  null;

let lastBroadcast =
  0;

function loop(
  timestamp
) {

  if (
    lastTime ===
    null
  ) {

    lastTime =
      timestamp;

  }

  const dt =
    Math.min(
      0.05,
      (
        timestamp -
        lastTime
      ) /
        1000
    );

  lastTime =
    timestamp;

  const now =
    timestamp /
    1000;

  if (
    running &&
    !paused &&
    !raceOver
  ) {

    updateMe(
      dt
    );

    updateEffects(
      dt
    );

    if (isSolo) {

      soloTick(
        dt,
        now
      );

    } else {

      handleCarryLogic(
        me,
        [],
        myDock,
        true
      );

      if (
        me.fuel >= 100 &&
        dist(
          me,
          myDock
        ) <
          DOCK_R
      ) {

        tryClaimWin();

      }

      updateHudRoom();

      if (
        timestamp -
          lastBroadcast >
        90
      ) {

        lastBroadcast =
          timestamp;

        update(
          astraRef(
            `players/${myUid}`
          ),
          {
            x: me.x,
            y: me.y,
            angle: me.angle,
            fuel: me.fuel,
            cargo: me.cargo,
            carrying:
              !!me.carrying
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

    }

  }

  draw(
    now
  );

  requestAnimationFrame(
    loop
  );

}

/* =========================================================
   WINNER
========================================================= */

async function tryClaimWin() {

  if (raceOver) {
    return;
  }

  try {

    await runTransaction(
      astraRef(
        "winner"
      ),
      current =>
        current
          ? current
          : myUid
    );

  } catch (
    error
  ) {

    console.warn(
      "Astra winner error:",
      error
    );

  }

}

/* =========================================================
   COUNTDOWN
========================================================= */

async function countdown() {

  paused =
    true;

  for (
    const step of [
      "۳",
      "۲",
      "۱",
      "برو!"
    ]
  ) {

    overlayMsg.innerHTML =
      `<div class="big">${step}</div>`;

    overlayMsg.style.display =
      "flex";

    playTone(
      step === "برو!"
        ? 900
        : 500,
      0.08
    );

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          550
        )
    );

  }

  overlayMsg.style.display =
    "none";

  paused =
    orientationLocked;

}

/* =========================================================
   FINISH
========================================================= */

async function finishRace(
  iWon
) {

  if (raceOver) {
    return;
  }

  raceOver =
    true;

  running =
    false;

  playTone(
    iWon
      ? 1300
      : 300,
    0.3
  );

  try {

    await withTimeout(
      recordRoundResult(
        myName,
        "astra",
        {
          won:
            iWon
        }
      ),
      CONNECTION_TIMEOUT,
      "record-result"
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
          ? "p1"
          : "p2"
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
      🌍 پایان مسابقه
    </div>

    <button
      id="rematchBtn"
    >
      ${
        isSolo
          ? "🔄 دوباره بازی کن"
          : "🏠 بازگشت به اتاق"
      }
    </button>

    <button
      id="homeBtn"
      class="ghost"
    >
      🏠 بازگشت به خانه
    </button>

  `;

  document
    .getElementById(
      "rematchBtn"
    )
    .addEventListener(
      "click",
      async () => {

        if (isSolo) {

          window.location.reload();

          return;

        }

        try {

          await withTimeout(
            resetSessionForNextRound(),
            CONNECTION_TIMEOUT,
            "reset-round"
          );

        } catch (
          error
        ) {

          console.warn(
            "Round reset error:",
            error
          );

        }

        window.location.href =
          "../lobby.html";

      }
    );

  document
    .getElementById(
      "homeBtn"
    )
    .addEventListener(
      "click",
      () => {

        window.location.href =
          "../index.html";

      }
    );

}

/* =========================================================
   SOLO START
========================================================= */

async function startSolo() {

  modeBadge.textContent =
    "تک‌نفره در برابر ربات";

  resizeCanvasResolution();

  computeDock();

  me = {

    x:
      myDock.x,

    y:
      myDock.y,

    angle:
      0,

    fuel:
      0,

    cargo:
      0,

    carrying:
      null,

    trail:
      []

  };

  aiShip = {

    x:
      W -
      SHIP_R *
        3,

    y:
      H / 2,

    angle:
      Math.PI,

    fuel:
      0,

    cargo:
      0,

    carrying:
      null,

    trail:
      [],

    dock: {

      x:
        W -
        SHIP_R *
          3,

      y:
        H / 2

    },

    launched:
      false

  };

  localResources =
    [];

  for (
    let i = 0;
    i <
      RESOURCE_COUNT;
    i++
  ) {

    spawnLocalResource();

  }

  entitiesInitialized =
    true;

  hideConnectionStatus();

  paused =
    true;

  await countdown();

}

/* =========================================================
   ROOM START
========================================================= */

async function startRoom() {

  modeBadge.textContent =
    "چندنفره — تا ۴ نفر";

  setConnectionStatus(
    "در حال اتصال...",
    "در حال اتصال به اتاق دومیتو"
  );

  resizeCanvasResolution();

  /*
   * این دو عملیات مستقل هستند.
   * قبلاً پشت سر هم اجرا می‌شدند و اگر Firebase
   * روی یکی گیر می‌کرد، کل Astra ظاهراً Freeze می‌شد.
   */

  let playersSnap;
  let resourcesResult;

  try {

    [
      playersSnap,
      resourcesResult
    ] =
      await Promise.all([

        withTimeout(
          get(
            roomPath(
              "players"
            )
          ),
          CONNECTION_TIMEOUT,
          "load-players"
        ),

        withTimeout(
          runTransaction(
            astraRef(
              "resources"
            ),
            current => {

              if (current) {
                return current;
              }

              const obj =
                {};

              for (
                let i = 0;
                i <
                  RESOURCE_COUNT;
                i++
              ) {

                const margin =
                  RES_R * 3;

                obj[
                  "r" + i
                ] = {

                  x:
                    rand(
                      W * 0.3,
                      W * 0.7
                    ),

                  y:
                    rand(
                      margin,
                      H -
                        margin
                    ),

                  takenBy:
                    null

                };

              }

              return obj;

            }
          ),
          CONNECTION_TIMEOUT,
          "create-resources"
        )

      ]);

  } catch (
    error
  ) {

    console.error(
      "Astra connection failed:",
      error
    );

    paused =
      true;

    setConnectionStatus(
      "❌ اتصال برقرار نشد",
      friendlyError(
        error
      ),
      true
    );

    return;

  }

  const roomPlayers =
    playersSnap.val() ||
    {};

  const uids =
    Object.keys(
      roomPlayers
    ).sort();

  const myIndex =
    uids.indexOf(
      myUid
    );

  myColorIndex =
    myIndex >= 0
      ? myIndex
      : 0;

  dockColor =
    COLORS[
      myColorIndex %
        COLORS.length
    ] ||
    COLORS[0];

  computeDock();

  me = {

    x:
      myDock.x,

    y:
      myDock.y,

    angle:
      0,

    fuel:
      0,

    cargo:
      0,

    carrying:
      null,

    trail:
      []

  };

  entitiesInitialized =
    true;

  try {

    await withTimeout(

      set(
        astraRef(
          `players/${myUid}`
        ),
        {

          name:
            myName,

          x:
            me.x,

          y:
            me.y,

          angle:
            0,

          fuel:
            0,

          cargo:
            0,

          carrying:
            false,

          colorIndex:
            myColorIndex %
            COLORS.length

        }
      ),

      CONNECTION_TIMEOUT,

      "register-player"

    );

  } catch (
    error
  ) {

    console.error(
      "Astra player registration failed:",
      error
    );

    paused =
      true;

    setConnectionStatus(
      "❌ ورود به Astra انجام نشد",
      friendlyError(
        error
      ),
      true
    );

    return;

  }

  /*
   * اگر صفحه بسته یا اتصال قطع شود،
   * بازیکن از Astra حذف می‌شود.
   */

  try {

    await onDisconnect(
      astraRef(
        `players/${myUid}`
      )
    ).remove();

  } catch (
    error
  ) {

    console.warn(
      "Astra onDisconnect error:",
      error
    );

  }

  /* =======================================================
     RESOURCE LISTENER
  ======================================================= */

  unsubs.push(

    onValue(
      astraRef(
        "resources"
      ),
      snapshot => {

        const value =
          snapshot.val() ||
          {};

        firebaseResources =
          {
            ...value
          };

        /*
         * بازیکن اول مسئول پر کردن منابع کم‌شده است.
         */

        if (
          myColorIndex ===
            0 &&
          Object.keys(
            firebaseResources
          ).length <
            RESOURCE_COUNT
        ) {

          const needed =
            RESOURCE_COUNT -
            Object.keys(
              firebaseResources
            ).length;

          for (
            let i = 0;
            i < needed;
            i++
          ) {

            const id =
              "r" +
              Date.now() +
              Math.random()
                .toString(
                  36
                )
                .slice(
                  2
                );

            const margin =
              RES_R * 3;

            const resource = {

              x:
                rand(
                  W * 0.3,
                  W * 0.7
                ),

              y:
                rand(
                  margin,
                  H -
                    margin
                ),

              takenBy:
                null

            };

            set(
              astraRef(
                `resources/${id}`
              ),
              resource
            ).catch(
              error => {

                console.warn(
                  "Resource respawn error:",
                  error
                );

              }
            );

          }

        }

      }
    )

  );

  /* =======================================================
     PLAYERS LISTENER
  ======================================================= */

  unsubs.push(

    onValue(
      astraRef(
        "players"
      ),
      snapshot => {

        const value =
          snapshot.val() ||
          {};

        others =
          {};

        Object.entries(
          value
        ).forEach(
          ([uid, player]) => {

            if (
              uid === myUid
            ) {

              return;

            }

            const index =
              Number(
                player.colorIndex ||
                0
              );

            others[uid] = {

              ...player,

              color:
                COLORS[
                  index %
                    COLORS.length
                ] ||
                COLORS[1]

            };

          }
        );

      }
    )

  );

  /* =======================================================
     WINNER LISTENER
  ======================================================= */

  unsubs.push(

    onValue(
      astraRef(
        "winner"
      ),
      snapshot => {

        const winnerUid =
          snapshot.val();

        if (
          winnerUid &&
          !raceOver
        ) {

          finishRace(
            winnerUid ===
              myUid
          );

        }

      }
    )

  );

  /*
   * چت اتاق
   */

  try {

    mountChat(
      myName,
      code
    );

  } catch (
    error
  ) {

    console.warn(
      "Astra chat error:",
      error
    );

  }

  hideConnectionStatus();

  /*
   * بازی از اینجا به بعد شروع می‌شود.
   */

  paused =
    true;

  await countdown();

}

/* =========================================================
   JOYSTICK
========================================================= */

function setupJoystick(
  baseEl,
  knobEl
) {

  if (
    !baseEl ||
    !knobEl
  ) {

    console.warn(
      "Astra joystick elements not found."
    );

    return;

  }

  let active =
    false;

  let origin = {
    x: 0,
    y: 0
  };

  let pointerId =
    null;

  function start(
    clientX,
    clientY
  ) {

    active =
      true;

    baseEl.classList.add(
      "pressed"
    );

    const rect =
      baseEl.getBoundingClientRect();

    origin = {

      x:
        rect.left +
        rect.width / 2,

      y:
        rect.top +
        rect.height / 2

    };

  }

  function move(
    clientX,
    clientY
  ) {

    if (!active) {
      return;
    }

    let dx =
      clientX -
      origin.x;

    let dy =
      clientY -
      origin.y;

    const max =
      baseEl.getBoundingClientRect()
        .width *
      0.38;

    const deadZone =
      max *
      0.14;

    const d =
      Math.hypot(
        dx,
        dy
      );

    if (
      d <
      deadZone
    ) {

      joyVec = {
        x: 0,
        y: 0
      };

      knobEl.style.transform =
        "translate(0,0)";

      return;

    }

    if (
      d >
      max
    ) {

      dx =
        (
          dx / d
        ) *
        max;

      dy =
        (
          dy / d
        ) *
        max;

    }

    knobEl.style.transform =
      `translate(${dx}px, ${dy}px)`;

    joyVec = {

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

    baseEl.classList.remove(
      "pressed"
    );

    knobEl.style.transform =
      "translate(0,0)";

    joyVec = {
      x: 0,
      y: 0
    };

  }

  baseEl.addEventListener(
    "pointerdown",
    event => {

      event.preventDefault();

      if (
        pointerId !==
        null
      ) {

        return;

      }

      pointerId =
        event.pointerId;

      try {

        baseEl.setPointerCapture(
          event.pointerId
        );

      } catch (
        error
      ) {}

      start(
        event.clientX,
        event.clientY
      );

      move(
        event.clientX,
        event.clientY
      );

    }
  );

  baseEl.addEventListener(
    "pointermove",
    event => {

      if (
        event.pointerId ===
        pointerId
      ) {

        event.preventDefault();

        move(
          event.clientX,
          event.clientY
        );

      }

    }
  );

  baseEl.addEventListener(
    "pointerup",
    event => {

      if (
        event.pointerId ===
        pointerId
      ) {

        end();

      }

    }
  );

  baseEl.addEventListener(
    "pointercancel",
    event => {

      if (
        event.pointerId ===
        pointerId
      ) {

        end();

      }

    }
  );

  baseEl.addEventListener(
    "lostpointercapture",
    () => {

      if (active) {
        end();
      }

    }
  );

  baseEl.style.touchAction =
    "none";

}

setupJoystick(
  joyBase,
  joyKnob
);

/* =========================================================
   KEYBOARD
========================================================= */

const keys =
  {};

window.addEventListener(
  "keydown",
  event => {

    keys[
      event.key
    ] = true;

    updateKeyVec();

  }
);

window.addEventListener(
  "keyup",
  event => {

    keys[
      event.key
    ] = false;

    updateKeyVec();

  }
);

function updateKeyVec() {

  let x = 0;
  let y = 0;

  if (
    keys["ArrowLeft"] ||
    keys["a"] ||
    keys["A"]
  ) {

    x -= 1;

  }

  if (
    keys["ArrowRight"] ||
    keys["d"] ||
    keys["D"]
  ) {

    x += 1;

  }

  if (
    keys["ArrowUp"] ||
    keys["w"] ||
    keys["W"]
  ) {

    y -= 1;

  }

  if (
    keys["ArrowDown"] ||
    keys["s"] ||
    keys["S"]
  ) {

    y += 1;

  }

  joyVec = {
    x,
    y
  };

}

/* =========================================================
   FULLSCREEN
========================================================= */

fullscreenBtn.addEventListener(
  "click",
  async () => {

    try {

      if (
        !document.fullscreenElement
      ) {

        await document.documentElement
          .requestFullscreen();

        fullscreenBtn.textContent =
          "⛶ خروج";

      } else {

        await document.exitFullscreen();

        fullscreenBtn.textContent =
          "⛶ تمام‌صفحه";

      }

    } catch (
      error
    ) {}

  }
);

/* =========================================================
   ORIENTATION
========================================================= */

let orientationLocked =
  false;

function checkOrientation() {

  const w =
    window.innerWidth;

  const h =
    window.innerHeight;

  orientationLocked =
    Math.min(
      w,
      h
    ) <
      700 &&
    h >
      w;

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

function handleViewportChange() {

  checkOrientation();

  if (
    !orientationLocked
  ) {

    requestAnimationFrame(
      () => {

        requestAnimationFrame(
          resizeCanvasResolution
        );

      }
    );

  }

}

window.addEventListener(
  "resize",
  handleViewportChange
);

window.addEventListener(
  "orientationchange",
  handleViewportChange
);

if (
  window.visualViewport
) {

  window.visualViewport.addEventListener(
    "resize",
    handleViewportChange
  );

}

/* =========================================================
   CLEANUP
========================================================= */

function cleanupFirebaseListeners() {

  unsubs.forEach(
    unsubscribe => {

      try {

        if (
          typeof unsubscribe ===
          "function"
        ) {

          unsubscribe();

        }

      } catch (
        error
      ) {}

    }
  );

  unsubs =
    [];

}

/* =========================================================
   INIT
========================================================= */

async function init() {

  /*
   * اول Canvas را راه می‌اندازیم.
   * بنابراین حتی هنگام اتصال Firebase هم صفحه Freeze
   * یا کاملاً بی‌حرکت دیده نمی‌شود.
   */

  resizeCanvasResolution();

  checkOrientation();

  running =
    true;

  requestAnimationFrame(
    loop
  );

  setConnectionStatus(
    "در حال اتصال...",
    "در حال بررسی ورود و اتصال به اتاق"
  );

  try {

    const user =
      await withTimeout(
        waitForUser(),
        CONNECTION_TIMEOUT,
        "auth"
      );

    myName =
      getSavedName();

    if (
      !user ||
      !myName
    ) {

      window.location.href =
        "../index.html";

      return;

    }

    myUid =
      currentUid();

    if (!myUid) {

      throw new Error(
        "not-authenticated"
      );

    }

    p1Label.textContent =
      myName;

    checkOrientation();

    if (isSolo) {

      await startSolo();

      return;

    }

    if (!code) {

      throw new Error(
        "no-room"
      );

    }

    await startRoom();

  } catch (
    error
  ) {

    console.error(
      "ASTRA INIT ERROR:",
      error
    );

    running =
      true;

    paused =
      true;

    setConnectionStatus(
      "❌ Astra متوقف شد",
      friendlyError(
        error
      ),
      true
    );

  }

}

/* =========================================================
   PAGE CLOSE
========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    cleanupFirebaseListeners();

    if (
      !isSolo &&
      myUid &&
      code
    ) {

      remove(
        astraRef(
          `players/${myUid}`
        )
      ).catch(
        () => {}
      );

    }

  }
);

/* =========================================================
   START
========================================================= */

createConnectionOverlay();

init();
