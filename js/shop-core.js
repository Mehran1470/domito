// ============================================================
// هسته فروشگاه دومیتو
// فقط داده و منطق خالص؛ بدون Firebase تا هم در مرورگر و هم با Node قابل تست باشد.
//
// ساختار داده در Firebase:
//   profiles/{name}/shop/purchased/{itemId} = زمان خرید
//   profiles/{name}/shop/equipped/{category} = itemId
//   profiles/{name}/shop/favorites/{itemId} = true
//
// داده‌های قدیمی (purchased به‌صورت آرایه و equippedTheme در ریشه پروفایل)
// پاک نمی‌شوند؛ فقط در shop/ کپی می‌شوند.
// ============================================================

export const MAX_ITEM_PRICE = 5000;
export const SHOP_VERSION = 2;

export const SHOP_CATEGORIES = [
  { id: "theme",  label: "تم",    icon: "🎨", hint: "رنگ آواتار" },
  { id: "frame",  label: "قاب",   icon: "🖼️", hint: "قاب دور آواتار" },
  { id: "badge",  label: "نشان",  icon: "🏅", hint: "کنار نام تو" },
  { id: "title",  label: "عنوان", icon: "👑", hint: "زیر نام تو" },
  { id: "effect", label: "افکت",  icon: "✨", hint: "جلوه نام تو" }
];

const RAW_ITEMS = [
  // ---------- تم‌ها (شناسه‌ها همان قبلی‌اند تا خریدهای قبلی معتبر بمانند) ----------
  { id: "theme-sunset",  category: "theme", name: "تم غروب",       price: 30,   colors: ["#FF7A59", "#FFC845"] },
  { id: "theme-ocean",   category: "theme", name: "تم اقیانوس",    price: 30,   colors: ["#4FD1FF", "#7C4DFF"] },
  { id: "theme-forest",  category: "theme", name: "تم جنگل",       price: 30,   colors: ["#4CD97B", "#1F9E56"] },
  { id: "theme-gold",    category: "theme", name: "تم طلایی",      price: 60,   colors: ["#FFD700", "#FF8C00"] },
  { id: "theme-neon",    category: "theme", name: "تم نئون",       price: 80,   colors: ["#39FF14", "#00E5FF"] },
  { id: "theme-galaxy",  category: "theme", name: "تم کهکشانی",    price: 120,  colors: ["#7C4DFF", "#FF4F81"] },
  { id: "theme-fire",    category: "theme", name: "تم آتشین",      price: 150,  colors: ["#FF3D00", "#FFC107"] },
  { id: "theme-royal",   category: "theme", name: "تم سلطنتی",     price: 250,  colors: ["#5B2C82", "#D4AF37"] },
  { id: "theme-diamond", category: "theme", name: "تم الماس",      price: 500,  colors: ["#B9F2FF", "#5FD3F3"] },
  { id: "theme-legend",  category: "theme", name: "تم افسانه‌ای",  price: 1000, colors: ["#FFD700", "#FF1744"] },

  // ---------- قاب‌ها ----------
  { id: "frame-silver", category: "frame", name: "قاب نقره‌ای",  price: 20,   colors: ["#CBD5E1", "#94A3B8"] },
  { id: "frame-mint",   category: "frame", name: "قاب نعنایی",   price: 40,   colors: ["#6EE7B7", "#3B82F6"] },
  { id: "frame-rose",   category: "frame", name: "قاب گل‌سرخ",   price: 90,   colors: ["#FF6B9D", "#C44569"] },
  { id: "frame-flame",  category: "frame", name: "قاب شعله",     price: 200,  colors: ["#FF512F", "#F09819"] },
  { id: "frame-ice",    category: "frame", name: "قاب یخی",      price: 320,  colors: ["#E0F7FF", "#38BDF8"] },
  { id: "frame-aurora", category: "frame", name: "قاب شفق",      price: 650,  colors: ["#00F5A0", "#7C4DFF"] },
  { id: "frame-crown",  category: "frame", name: "قاب تاج‌دار",  price: 1500, colors: ["#FFD700", "#FFF1A8"] },

  // ---------- نشان‌ها ----------
  { id: "badge-star",   category: "badge", name: "نشان ستاره",    price: 25,   emoji: "⭐" },
  { id: "badge-dice",   category: "badge", name: "نشان تاس",      price: 40,   emoji: "🎲" },
  { id: "badge-rocket", category: "badge", name: "نشان موشک",     price: 70,   emoji: "🚀" },
  { id: "badge-flame",  category: "badge", name: "نشان آتش",      price: 120,  emoji: "🔥" },
  { id: "badge-bolt",   category: "badge", name: "نشان رعد",      price: 180,  emoji: "⚡" },
  { id: "badge-gem",    category: "badge", name: "نشان الماس",    price: 400,  emoji: "💎" },
  { id: "badge-dragon", category: "badge", name: "نشان اژدها",    price: 1200, emoji: "🐉" },
  { id: "badge-trophy", category: "badge", name: "نشان جام",      price: 2500, emoji: "🏆" },

  // ---------- عنوان‌ها ----------
  { id: "title-rookie",     category: "title", name: "عنوان تازه‌کار",     price: 15,   text: "تازه‌کار",       color: "#9CA3AF" },
  { id: "title-pro",        category: "title", name: "عنوان حرفه‌ای",      price: 60,   text: "حرفه‌ای",        color: "#4FD1FF" },
  { id: "title-strategist", category: "title", name: "عنوان استراتژیست",   price: 150,  text: "استراتژیست",     color: "#4CD97B" },
  { id: "title-lucky",      category: "title", name: "عنوان خوش‌شانس",     price: 220,  text: "خوش‌شانس",       color: "#FFC845" },
  { id: "title-champion",   category: "title", name: "عنوان قهرمان",       price: 500,  text: "قهرمان",         color: "#FF7A59" },
  { id: "title-master",     category: "title", name: "عنوان استاد دومیتو", price: 1200, text: "استاد دومیتو",   color: "#B28DFF" },
  { id: "title-legend",     category: "title", name: "عنوان افسانه",       price: 3000, text: "افسانه",         color: "#FF4F81" },
  { id: "title-king",       category: "title", name: "عنوان پادشاه",       price: 5000, text: "پادشاه دومیتو",  color: "#FFD700" },

  // ---------- افکت‌های نام ----------
  { id: "effect-glow",    category: "effect", name: "درخشش نرم",   price: 100,  fx: "glow" },
  { id: "effect-pulse",   category: "effect", name: "ضربان",       price: 150,  fx: "pulse" },
  { id: "effect-shimmer", category: "effect", name: "برق طلایی",   price: 350,  fx: "shimmer" },
  { id: "effect-sparkle", category: "effect", name: "جرقه",        price: 700,  fx: "sparkle" },
  { id: "effect-rainbow", category: "effect", name: "رنگین‌کمان",  price: 1800, fx: "rainbow" }
];

const CATEGORY_IDS = new Set(SHOP_CATEGORIES.map((c) => c.id));

export function validateItem(item) {
  if (!item || typeof item !== "object") return "آیتم نامعتبر است";
  if (typeof item.id !== "string" || !item.id) return "شناسه ندارد";
  if (!CATEGORY_IDS.has(item.category)) return `دسته نامعتبر: ${item.category}`;
  if (!item.id.startsWith(item.category + "-")) return "شناسه با دسته نمی‌خواند";
  if (typeof item.name !== "string" || !item.name) return "نام ندارد";
  if (!Number.isInteger(item.price) || item.price < 1 || item.price > MAX_ITEM_PRICE) {
    return `قیمت باید بین ۱ و ${MAX_ITEM_PRICE} باشد`;
  }
  return null;
}

// آیتم‌های نامعتبر یا تکراری وارد فروشگاه نمی‌شوند.
export const SHOP_ITEMS = (() => {
  const seen = new Set();
  const out = [];

  for (const item of RAW_ITEMS) {
    const problem = validateItem(item) || (seen.has(item.id) ? "شناسه تکراری" : null);

    if (problem) {
      console.warn(`[shop] آیتم «${item && item.id}» حذف شد: ${problem}`);
      continue;
    }

    seen.add(item.id);
    out.push(Object.freeze({ ...item, rarity: rarityOf(item.price) }));
  }

  return Object.freeze(out);
})();

export const ITEM_BY_ID = Object.freeze(
  Object.fromEntries(SHOP_ITEMS.map((item) => [item.id, item]))
);

export function rarityOf(price) {
  if (price < 50) return "common";
  if (price < 250) return "rare";
  if (price < 1000) return "epic";
  return "legendary";
}

export const RARITY_LABELS = {
  common: "معمولی",
  rare: "کمیاب",
  epic: "حماسی",
  legendary: "افسانه‌ای"
};

export function itemsOf(categoryId) {
  return SHOP_ITEMS.filter((item) => item.category === categoryId);
}

// ============================================================
// خواندن و مهاجرت
// ============================================================

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function asMap(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function legacyPurchasedIds(profile) {
  const raw = profile && profile.purchased;
  if (!raw || typeof raw !== "object") return [];
  return Object.values(raw).filter((id) => typeof id === "string");
}

// نمای یکپارچه (شامل داده‌های قدیمی). چیزی را تغییر نمی‌دهد.
export function readShop(profile) {
  const p = profile || {};
  const shop = asMap(p.shop);

  const purchased = {};
  for (const [id, at] of Object.entries(asMap(shop.purchased))) {
    if (ITEM_BY_ID[id]) purchased[id] = at;
  }
  for (const id of legacyPurchasedIds(p)) {
    if (ITEM_BY_ID[id] && !hasOwn(purchased, id)) purchased[id] = true;
  }

  const equipped = {};
  for (const [category, id] of Object.entries(asMap(shop.equipped))) {
    const item = ITEM_BY_ID[id];
    if (item && item.category === category && hasOwn(purchased, id)) {
      equipped[category] = id;
    }
  }
  if (!equipped.theme) {
    const legacyTheme = p.equippedTheme;
    const item = ITEM_BY_ID[legacyTheme];
    if (item && item.category === "theme" && hasOwn(purchased, legacyTheme)) {
      equipped.theme = legacyTheme;
    }
  }

  const favorites = {};
  for (const id of Object.keys(asMap(shop.favorites))) {
    if (ITEM_BY_ID[id]) favorites[id] = true;
  }

  return { purchased, equipped, favorites };
}

// نسخه قابل‌نوشتن: داده‌ی قدیمی را به shop/ منتقل می‌کند و فیلدهای قدیمی را دست‌نخورده می‌گذارد.
export function migrateProfile(profile, now = Date.now()) {
  const curr = profile && typeof profile === "object" ? profile : {};
  const view = readShop(curr);
  const oldShop = asMap(curr.shop);

  const purchased = {};
  for (const [id, at] of Object.entries(view.purchased)) {
    purchased[id] = typeof at === "number" ? at : now;
  }

  curr.shop = {
    version: SHOP_VERSION,
    purchased,
    equipped: { ...view.equipped },
    favorites: { ...view.favorites }
  };

  // فیلدهای ناشناخته‌ی احتمالی داخل shop از بین نروند.
  for (const key of Object.keys(oldShop)) {
    if (!hasOwn(curr.shop, key)) curr.shop[key] = oldShop[key];
  }

  return curr;
}

function safeCoins(profile) {
  const coins = Number(profile && profile.coins);
  return Number.isFinite(coins) && coins > 0 ? Math.floor(coins) : 0;
}

// ============================================================
// عملیات (روی پروفایل تغییر می‌دهند و نتیجه برمی‌گردانند)
// ============================================================

export function applyPurchase(profile, itemId, now = Date.now()) {
  const curr = migrateProfile(profile, now);
  const item = ITEM_BY_ID[itemId];

  if (!item) return { profile: curr, result: { ok: false, reason: "not-found" } };

  if (hasOwn(curr.shop.purchased, itemId)) {
    return { profile: curr, result: { ok: false, reason: "owned" } };
  }

  const coins = safeCoins(curr);
  curr.coins = coins;

  if (coins < item.price) {
    return { profile: curr, result: { ok: false, reason: "insufficient" } };
  }

  curr.coins = coins - item.price;
  curr.shop.purchased[itemId] = now;

  return { profile: curr, result: { ok: true, price: item.price } };
}

export function applyEquip(profile, itemId, now = Date.now()) {
  const curr = migrateProfile(profile, now);
  const item = ITEM_BY_ID[itemId];

  if (!item) return { profile: curr, result: { ok: false, reason: "not-found" } };

  if (!hasOwn(curr.shop.purchased, itemId)) {
    return { profile: curr, result: { ok: false, reason: "not-owned" } };
  }

  curr.shop.equipped[item.category] = itemId;

  // سازگاری با کدهای قدیمی که equippedTheme را می‌خوانند.
  if (item.category === "theme") curr.equippedTheme = itemId;

  return { profile: curr, result: { ok: true } };
}

export function applyUnequip(profile, categoryId, now = Date.now()) {
  const curr = migrateProfile(profile, now);

  if (!CATEGORY_IDS.has(categoryId)) {
    return { profile: curr, result: { ok: false, reason: "not-found" } };
  }

  delete curr.shop.equipped[categoryId];
  if (categoryId === "theme") curr.equippedTheme = "default";

  return { profile: curr, result: { ok: true } };
}

export function applyFavorite(profile, itemId, now = Date.now()) {
  const curr = migrateProfile(profile, now);

  if (!ITEM_BY_ID[itemId]) {
    return { profile: curr, result: { ok: false, reason: "not-found" } };
  }

  const nowFavorite = !hasOwn(curr.shop.favorites, itemId);

  if (nowFavorite) curr.shop.favorites[itemId] = true;
  else delete curr.shop.favorites[itemId];

  return { profile: curr, result: { ok: true, favorite: nowFavorite } };
}
