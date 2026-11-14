// ============================================================
// کنترل دسترسی کاربران (منطق خالص؛ بدون Firebase و بدون DOM)
//
// داده در Firebase: adminAccess/{نام کاربر}
//   assistant: false  → دستیار برای این کاربر بسته است
//   web:       false  → جستجوی وب بسته است
//   images:    false  → عکس‌های اینترنتی در چت نمایش داده نمی‌شود
//   think:     false  → حالت تفکر متوسط/حداکثر بسته است (فقط «کم»)
//   buy:       false  → خرید از فروشگاه و خرید سؤال با سکه بسته است
//   dailyLimit: عدد → سهمیه‌ی پایه‌ی روزانه‌ی سؤال (۰ تا MAX_DAILY_LIMIT)
//   blockedUntil: زمان (میلی‌ثانیه) → تا این زمان مسدود است
//
// نبودن هر کلید یعنی پیش‌فرض (همه‌چیز آزاد). فقط همین کلیدها قابل تغییرند؛
// هیچ‌چیز مربوط به سکه، حساب، رمز یا دوستی از این مسیر عوض نمی‌شود.
// ============================================================

export const MAX_DAILY_LIMIT = 100;
export const MAX_BLOCK_HOURS = 24 * 30;

export const ACCESS_KEYS = Object.freeze({
  assistant: { label: "دستیار", kind: "bool" },
  web: { label: "جستجوی وب", kind: "bool" },
  images: { label: "عکس در چت", kind: "bool" },
  think: { label: "حالت تفکر", kind: "bool" },
  buy: { label: "خرید با سکه", kind: "bool" },
  limit: { label: "سهمیه‌ی روزانه", kind: "limit" },
  block: { label: "مسدودی", kind: "hours" }
});

const KEY_ALIASES = {
  assistant: ["assistant", "ai", "دستیار", "هوشمند"],
  web: ["web", "search", "وب", "جستجو", "جستجوی وب", "سرچ"],
  images: ["images", "image", "photo", "عکس", "تصویر", "عکس‌ها", "عکسها"],
  think: ["think", "thinking", "تفکر", "فکر", "حالت تفکر"],
  buy: ["buy", "shop", "خرید", "فروشگاه"],
  limit: ["limit", "quota", "سهمیه", "سقف", "محدودیت"],
  block: ["block", "ban", "مسدود", "بلاک", "مسدودی"]
};

const DIGITS = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };

function norm(text) {
  return String(text ?? "")
    .replace(/[۰-۹٠-٩]/g, (d) => DIGITS[d])
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[‌‏‎]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeKey(text) {
  const t = norm(text);
  for (const [key, names] of Object.entries(KEY_ALIASES)) {
    if (names.some((n) => norm(n) === t)) return key;
  }
  return null;
}

const ON_WORDS = ["on", "true", "yes", "1", "روشن", "باز", "فعال", "آزاد", "بله", "اره", "آره"];
const OFF_WORDS = ["off", "false", "no", "خاموش", "بسته", "غیرفعال", "ببند", "قطع"];
const UNBLOCK_WORDS = ["off", "خاموش", "رفع", "آزاد", "باز", "بازش کن", "پیش‌فرض", "پیشفرض", "default", "reset", "عادی"];
const CLOSE_WORDS = ["on", "روشن", "ببند", "بسته", "مسدود", "بلاک", "قطع"];
const RESET_WORDS = ["default", "reset", "پیش‌فرض", "پیشفرض", "عادی", "حذف"];

// مقدار متنی را برای یک کلید به مقدار درست تبدیل می‌کند.
// خروجی: { ok:true, value } یا { ok:false, reason }
// value برای limit: عدد یا null (پیش‌فرض)، برای block: ساعت (۰ = رفع مسدودی)، برای بقیه: true/false
export function parseAccessValue(key, text) {
  const spec = ACCESS_KEYS[key];
  if (!spec) return { ok: false, reason: "unknown-key" };
  const t = norm(text);
  if (!t) return { ok: false, reason: "empty" };

  if (spec.kind === "bool") {
    if (ON_WORDS.some((w) => norm(w) === t)) return { ok: true, value: true };
    if (OFF_WORDS.some((w) => norm(w) === t)) return { ok: true, value: false };
    return { ok: false, reason: "bad-value" };
  }

  if (spec.kind === "limit") {
    if (RESET_WORDS.some((w) => norm(w) === t)) return { ok: true, value: null };
    if (!/^\d{1,4}$/.test(t)) return { ok: false, reason: "bad-value" };
    const n = Number(t);
    if (n > MAX_DAILY_LIMIT) return { ok: false, reason: "too-big" };
    return { ok: true, value: n };
  }

  // hours
  // رفع مسدودی: فقط کلمه‌های روشن؛ «ببند/بسته» عمداً اینجا نیست چون یعنی مسدود کردن.
  if (UNBLOCK_WORDS.some((w) => norm(w) === t) || t === "0") {
    return { ok: true, value: 0 };
  }
  if (CLOSE_WORDS.some((w) => norm(w) === t)) return { ok: false, reason: "need-hours" };
  if (!/^\d{1,4}$/.test(t)) return { ok: false, reason: "bad-value" };
  const h = Number(t);
  if (h < 1) return { ok: true, value: 0 };
  if (h > MAX_BLOCK_HOURS) return { ok: false, reason: "too-big" };
  return { ok: true, value: h };
}

// نام کاربر هدف؛ نویسه‌های ممنوع Firebase و نام‌های خیلی بلند رد می‌شوند.
export function cleanTargetName(name) {
  const t = String(name ?? "").replace(/[‌‏‎]/g, "").replace(/\s+/g, " ").trim();
  if (!t || t.length > 30) return "";
  if (/[.$#\[\]\/\\\u0000-\u001f]/.test(t)) return "";
  return t;
}

// داده‌ی خام Firebase → وضعیت امن و کامل. هر چیز نامعتبر یعنی پیش‌فرض (آزاد).
export function readAccess(raw, now = Date.now()) {
  const r = raw && typeof raw === "object" ? raw : {};
  const lim = Number(r.dailyLimit);
  const until = Number(r.blockedUntil);
  const blockedUntil = Number.isFinite(until) && until > now ? Math.floor(until) : 0;
  return {
    assistant: r.assistant !== false,
    web: r.web !== false,
    images: r.images !== false,
    think: r.think !== false,
    buy: r.buy !== false,
    dailyLimit:
      Number.isFinite(lim) && r.dailyLimit !== null && lim >= 0
        ? Math.min(MAX_DAILY_LIMIT, Math.floor(lim))
        : null,
    blockedUntil,
    blocked: blockedUntil > now
  };
}

// آیا دستیار الان برای این کاربر باز است؟ { open, reason }
export function assistantGate(access) {
  if (access.blocked) return { open: false, reason: "blocked" };
  if (!access.assistant) return { open: false, reason: "disabled" };
  return { open: true, reason: "" };
}

// تغییر درخواستی → شیئی که به update() فایربیس داده می‌شود. null یعنی حذف کلید (برگشت به پیش‌فرض).
export function buildAccessPatch(key, value, now = Date.now(), adminName = "") {
  const spec = ACCESS_KEYS[key];
  if (!spec) throw new Error("کلید نامعتبر");
  const patch = { updatedAt: now };
  if (adminName) patch.updatedBy = String(adminName).slice(0, 30);

  if (spec.kind === "bool") {
    // true یعنی پیش‌فرض؛ برای تمیز ماندن دیتابیس کلید حذف می‌شود.
    const field = key;
    patch[field] = value === true ? null : false;
  } else if (spec.kind === "limit") {
    patch.dailyLimit = value === null ? null : Math.max(0, Math.min(MAX_DAILY_LIMIT, Math.floor(value)));
  } else {
    patch.blockedUntil = value > 0 ? now + Math.min(MAX_BLOCK_HOURS, Math.floor(value)) * 3600_000 : null;
  }
  return patch;
}

// بازگرداندن همه‌ی دسترسی‌ها به پیش‌فرض
export function buildResetPatch(now = Date.now(), adminName = "") {
  const patch = {
    assistant: null, web: null, images: null, think: null, buy: null,
    dailyLimit: null, blockedUntil: null, updatedAt: now
  };
  if (adminName) patch.updatedBy = String(adminName).slice(0, 30);
  return patch;
}

const onOff = (v) => (v ? "باز" : "بسته");

export function describeValue(key, value) {
  const spec = ACCESS_KEYS[key];
  if (!spec) return "";
  if (spec.kind === "bool") return onOff(value === true);
  if (spec.kind === "limit") return value === null ? "پیش‌فرض (۵ سؤال)" : `${value} سؤال در روز`;
  return value > 0 ? `${value} ساعت` : "بدون مسدودی";
}

export function describeChange(key, value) {
  const spec = ACCESS_KEYS[key];
  return spec ? `${spec.label}: ${describeValue(key, value)}` : "";
}

// خلاصه‌ی وضعیت فعلی (برای پنل و دستیار)
export function describeAccess(access, now = Date.now()) {
  const parts = [
    `دستیار: ${onOff(access.assistant)}`,
    `جستجوی وب: ${onOff(access.web)}`,
    `عکس در چت: ${onOff(access.images)}`,
    `حالت تفکر: ${onOff(access.think)}`,
    `خرید با سکه: ${onOff(access.buy)}`,
    `سهمیه‌ی روزانه: ${access.dailyLimit === null ? "پیش‌فرض" : access.dailyLimit}`
  ];
  if (access.blocked) {
    const left = Math.max(1, Math.ceil((access.blockedUntil - now) / 3600_000));
    parts.push(`مسدود: حدود ${left} ساعت دیگر`);
  } else {
    parts.push("مسدود: نه");
  }
  return parts.join(" | ");
}

export const ACCESS_HELP = [
  "کلیدها: دستیار، وب، عکس، تفکر، خرید (روشن/خاموش) | سهمیه (عدد ۰ تا " + MAX_DAILY_LIMIT + " یا پیش‌فرض) | مسدود (ساعت، ۰ = رفع)",
  "/20=نام ← دیدن دسترسی کاربر",
  "/21=نام=کلید=مقدار ← تغییر (مثلاً /21=علی=وب=خاموش)",
  "/22=نام ← برگرداندن همه‌چیز به پیش‌فرض"
].join("\n");

// تجزیه‌ی «نام=کلید=مقدار» (برای دستور ۲۱ پنل)
export function parseSetCommand(argText) {
  const parts = String(argText ?? "").split("=").map((p) => p.trim());
  if (parts.length !== 3 || parts.some((p) => !p)) return { ok: false, reason: "format" };
  const name = cleanTargetName(parts[0]);
  if (!name) return { ok: false, reason: "bad-name" };
  const key = normalizeKey(parts[1]);
  if (!key) return { ok: false, reason: "unknown-key" };
  const v = parseAccessValue(key, parts[2]);
  if (!v.ok) return { ok: false, reason: v.reason };
  return { ok: true, name, key, value: v.value };
}
