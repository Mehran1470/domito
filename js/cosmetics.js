// ============================================================
// ظاهر آیتم‌های فروشگاه (تم، قاب، نشان، عنوان، افکت)
// مشترک بین shop.html، profile.html، lobby.html و friends.html
// همه‌چیز با textContent ساخته می‌شود تا نام بازیکن‌ها هرگز HTML اجرا نکنند.
// ============================================================

import { db, ref, get } from "./app.js";
import { ITEM_BY_ID } from "./shop-core.js";

const EQUIP_KEYS = ["theme", "frame", "badge", "title", "effect"];
const CACHE_MS = 60 * 1000;

const cache = new Map();     // name -> { at, equipped }
const inflight = new Map();  // name -> Promise


// ---------- استایل ----------

const STYLE_ID = "domito-cosmetics-style";

export function injectCosmeticStyles() {

  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;

  style.textContent = `
    .cos-tag-badge { display:inline-block; margin-inline-end:4px; font-size:1.05em; line-height:1; vertical-align:middle; }
    .cos-tag-title {
      display:inline-block; margin-top:3px; padding:1px 8px; border-radius:100px;
      font-size:10.5px; font-weight:800; line-height:1.7;
      border:1px solid currentColor; background:rgba(255,255,255,.06);
    }
    .cos-nameblock { display:inline-flex; flex-direction:column; align-items:inherit; }
    .cos-nameline  { display:inline-flex; align-items:center; flex-wrap:wrap; gap:2px; }

    .fx-glow    { text-shadow:0 0 8px rgba(255,255,255,.75), 0 0 16px rgba(120,160,255,.6); }
    .fx-pulse   { animation:cosPulse 1.8s ease-in-out infinite; display:inline-block; }
    .fx-shimmer, .fx-rainbow {
      background-size:220% 100%;
      -webkit-background-clip:text; background-clip:text;
      -webkit-text-fill-color:transparent; color:transparent;
      animation:cosSlide 3s linear infinite;
    }
    .fx-shimmer { background-image:linear-gradient(100deg,#b8860b 20%,#fff3b0 45%,#ffd700 55%,#b8860b 80%); }
    .fx-rainbow { background-image:linear-gradient(90deg,#ff4d4d,#ffb84d,#ffee4d,#4dff88,#4dc3ff,#b04dff,#ff4d4d); }
    .fx-sparkle::after { content:"✨"; margin-inline-start:4px; animation:cosTwinkle 1.4s ease-in-out infinite; display:inline-block; }

    @keyframes cosPulse   { 0%,100% { transform:scale(1); } 50% { transform:scale(1.07); } }
    @keyframes cosSlide   { from { background-position:0% 0; } to { background-position:220% 0; } }
    @keyframes cosTwinkle { 0%,100% { opacity:.35; transform:scale(.8) rotate(0); } 50% { opacity:1; transform:scale(1.2) rotate(20deg); } }

    @media (prefers-reduced-motion: reduce) {
      .fx-pulse, .fx-shimmer, .fx-rainbow, .fx-sparkle::after { animation:none; }
    }
  `;

  document.head.appendChild(style);
}


// ---------- داده ----------

export function sanitizeEquipped(raw) {

  const out = {};
  if (!raw || typeof raw !== "object") return out;

  for (const key of EQUIP_KEYS) {
    const item = ITEM_BY_ID[raw[key]];
    if (item && item.category === key) out[key] = item.id;
  }

  return out;
}


export function getCachedCosmetics(name) {

  const hit = cache.get(String(name || ""));
  return hit ? hit.equipped : {};

}


export function setCosmeticsCache(name, equipped) {

  cache.set(String(name || ""), {
    at: Date.now(),
    equipped: sanitizeEquipped(equipped)
  });

}


export async function fetchCosmetics(name, { force = false } = {}) {

  const key = String(name || "");
  if (!key) return {};

  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.equipped;

  if (inflight.has(key)) return inflight.get(key);

  const safe = encodeURIComponent(key);

  const job = (async () => {

    try {

      const [equippedSnap, legacySnap] = await Promise.all([
        get(ref(db, `profiles/${safe}/shop/equipped`)),
        get(ref(db, `profiles/${safe}/equippedTheme`))
      ]);

      const equipped = sanitizeEquipped(equippedSnap.val());

      // کاربرانی که هنوز وارد فروشگاه جدید نشده‌اند: تم قدیمی
      if (!equipped.theme) {
        const legacy = ITEM_BY_ID[legacySnap.val()];
        if (legacy && legacy.category === "theme") equipped.theme = legacy.id;
      }

      cache.set(key, { at: Date.now(), equipped });
      return equipped;

    } catch (err) {

      console.warn("دریافت ظاهر بازیکن ناموفق بود:", key, err);

      // شکست هم در کش ثبت می‌شود تا رندر مجدد صفحه حلقه‌ی درخواست نسازد.
      const fallback = hit ? hit.equipped : {};
      cache.set(key, { at: Date.now(), equipped: fallback });
      return fallback;

    } finally {

      inflight.delete(key);

    }

  })();

  inflight.set(key, job);
  return job;

}


// نام‌هایی که در کش نیستند را می‌گیرد و فقط اگر چیزی تازه رسید onChange را صدا می‌زند.
export async function primeCosmetics(names, onChange) {

  const fresh = [...new Set(names.map((n) => String(n || "")).filter(Boolean))]
    .filter((n) => {
      const hit = cache.get(n);
      return !hit || Date.now() - hit.at >= CACHE_MS;
    });

  if (!fresh.length) return;

  await Promise.all(fresh.map((n) => fetchCosmetics(n)));

  if (typeof onChange === "function") onChange();

}


// ---------- ساخت اجزا ----------

function itemOf(equipped, category) {
  const item = equipped && ITEM_BY_ID[equipped[category]];
  return item && item.category === category ? item : null;
}


export function applyAvatarStyle(el, equipped) {

  if (!el) return;

  const theme = itemOf(equipped, "theme");
  const frame = itemOf(equipped, "frame");

  const fill = theme
    ? `linear-gradient(145deg, ${theme.colors[0]}, ${theme.colors[1]})`
    : "linear-gradient(145deg, #9B5CFF, #4F7CFF)";

  if (frame) {
    el.style.border = "3px solid transparent";
    el.style.background =
      `${fill} padding-box, ` +
      `linear-gradient(135deg, ${frame.colors[0]}, ${frame.colors[1]}) border-box`;
    el.style.boxShadow = `0 0 14px -2px ${frame.colors[1]}99`;
  } else {
    el.style.border = "";
    el.style.background = theme ? fill : "";
    el.style.boxShadow = "";
  }

  if (theme) el.style.color = "#fff";
  else el.style.color = "";

}


// نام + نشان + عنوان + افکت را داخل container می‌سازد (جایگزین محتوای قبلی).
export function renderNameBlock(container, name, equipped, { showTitle = true } = {}) {

  if (!container) return;

  injectCosmeticStyles();
  container.replaceChildren();

  const badge = itemOf(equipped, "badge");
  const title = itemOf(equipped, "title");
  const effect = itemOf(equipped, "effect");

  const line = document.createElement("span");
  line.className = "cos-nameline";

  if (badge) {
    const b = document.createElement("span");
    b.className = "cos-tag-badge";
    b.title = badge.name;
    b.textContent = badge.emoji;
    line.appendChild(b);
  }

  const n = document.createElement("span");
  n.className = "cos-name" + (effect ? ` fx-${effect.fx}` : "");
  n.textContent = name;
  line.appendChild(n);

  if (!(showTitle && title)) {
    container.appendChild(line);
    return;
  }

  const block = document.createElement("span");
  block.className = "cos-nameblock";

  const t = document.createElement("span");
  t.className = "cos-tag-title";
  t.style.color = title.color;
  t.textContent = title.text;

  block.append(line, t);
  container.appendChild(block);

}


// پیش‌نمایش یک آیتم داخل کارت فروشگاه
export function createItemPreview(item) {

  injectCosmeticStyles();

  const box = document.createElement("div");
  box.className = "cos-preview cos-preview-" + item.category;

  switch (item.category) {

    case "theme": {
      const a = document.createElement("div");
      a.className = "cos-sample-avatar";
      a.textContent = "D";
      applyAvatarStyle(a, { theme: item.id });
      box.appendChild(a);
      break;
    }

    case "frame": {
      const a = document.createElement("div");
      a.className = "cos-sample-avatar";
      a.textContent = "D";
      applyAvatarStyle(a, { frame: item.id });
      box.appendChild(a);
      break;
    }

    case "badge": {
      const b = document.createElement("div");
      b.className = "cos-sample-badge";
      b.textContent = item.emoji;
      box.appendChild(b);
      break;
    }

    case "title": {
      const t = document.createElement("span");
      t.className = "cos-tag-title cos-sample-title";
      t.style.color = item.color;
      t.textContent = item.text;
      box.appendChild(t);
      break;
    }

    case "effect": {
      const n = document.createElement("span");
      n.className = `cos-sample-name fx-${item.fx}`;
      n.textContent = "نام تو";
      box.appendChild(n);
      break;
    }

  }

  return box;

}
