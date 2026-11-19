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

// ============================================================
// فهمیدن دستور فارسی ادمین بدون مدل: «ALIXMOD رو ۲ ساعت مسدود کن»
// خروجی: null (دستور نیست) | { ok:false, reason } | { ok:true, action }
// action همان شکل اکشن‌های دستیار را دارد (access / access-show / access-reset).
// فقط تجزیه می‌کند؛ اجرا همیشه با پنجره‌ی تأیید و فقط برای ادمین است.
// ============================================================

const CMD_FILLER = new Set([
  "رو", "را", "رو.", "کاربر", "حساب", "اکانت", "یوزر", "لطفا", "لطفاً", "بکن", "کن", "کنی", "بکنی", "کنید",
  "برای", "به", "مدت", "از", "و", "هم", "یه", "یک", "این", "اون", "اینو", "اونو", "بده", "بگو", "نشون", "نشان",
  "را.", "ی", "please", "user", "account", "for", "the", "to"
]);
const BLOCK_RE = /(مسدود|بلاک|بن(?=\s|$)|ban|block)/i;
const UNBLOCK_RE = /(رفع|آزاد|ازاد|unblock|unban|باز\s*کن)/i;
const RESET_RE = /(ریست|reset|پیش\s?فرض|default)/i;
const SHOW_RE = /(وضعیت|نشون|نشان|status|show|چک)/i;
const DURATION_RE = /(\d+(?:\.\d+)?)\s*(ساعت(?:ه)?|روز(?:ه)?|دقیقه(?:‌ای)?|hours?|hrs?|h|days?|d|minutes?|mins?|m)(?=\s|$)/i;
const TOGGLE_ON = /(روشن|فعال|باز\s*کن|باز(?=\s|$)|on(?=\s|$)|enable)/i;
const TOGGLE_OFF = /(خاموش|ببند|بسته|قطع|غیرفعال|off(?=\s|$)|disable)/i;

function cmdNorm(text) {
  return String(text ?? "")
    .replace(/[۰-۹٠-٩]/g, (d) => DIGITS[d])
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[‌‏‎]/g, " ")
    .replace(/[؟?!.,،؛:"«»()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractName(text, extraWords) {
  const drop = new Set(extraWords.map((w) => w.toLowerCase()));
  const tokens = text
    .split(" ")
    .map((t) => t.replace(/^@/, ""))
    .filter((t) => t && !CMD_FILLER.has(t.toLowerCase()) && !drop.has(t.toLowerCase()));
  return cleanTargetName(tokens.join(" "));
}

export function parseAdminCommand(rawText) {
  const text = cmdNorm(rawText);
  if (!text || text.length > 80) return null;

  const wordsOf = (re) => (text.match(new RegExp(re.source, "gi")) || []).flatMap((w) => w.split(" "));

  // ۱) رفع مسدودی (قبل از مسدود کردن، چون «رفع مسدودی» کلمه‌ی مسدود هم دارد)
  if (UNBLOCK_RE.test(text) && (BLOCK_RE.test(text) || /(آزاد|ازاد|unban|unblock)/i.test(text))) {
    const name = extractName(text, [...wordsOf(UNBLOCK_RE), ...wordsOf(BLOCK_RE), "مسدودی", "بلاکی"]);
    if (!name) return { ok: false, reason: "no-name" };
    return { ok: true, action: { type: "access", name, key: "block", value: 0 } };
  }

  // ۲) مسدود کردن با مدت
  if (BLOCK_RE.test(text)) {
    const d = text.match(DURATION_RE);
    if (!d) {
      const name = extractName(text, [...wordsOf(BLOCK_RE)]);
      return name ? { ok: false, reason: "need-hours", name } : { ok: false, reason: "no-name" };
    }
    const n = Number(d[1]);
    const unit = d[2].toLowerCase();
    let hours = n;
    if (/^(روز|day|d)/.test(unit)) hours = n * 24;
    else if (/^(دقیقه|min|m$)/.test(unit)) hours = Math.max(1, Math.ceil(n / 60));
    hours = Math.ceil(hours);
    if (hours < 1) return { ok: false, reason: "bad-value" };
    if (hours > MAX_BLOCK_HOURS) return { ok: false, reason: "too-big" };
    const rest = text.replace(d[0], " ");
    const name = extractName(rest, [...wordsOf(BLOCK_RE)]);
    if (!name) return { ok: false, reason: "no-name" };
    return { ok: true, action: { type: "access", name, key: "block", value: hours } };
  }

  // ۳) برگرداندن به پیش‌فرض
  if (RESET_RE.test(text) && !/سهمیه|limit|quota/i.test(text)) {
    const name = extractName(text, [...wordsOf(RESET_RE), "همه", "همه‌چیز", "همهچیز", "دسترسی", "دسترسیها", "دسترسی‌ها"]);
    if (!name) return { ok: false, reason: "no-name" };
    return { ok: true, action: { type: "access-reset", name } };
  }

  // ۴) سهمیه: «سهمیه علی رو ۱۰ کن»
  if (/(سهمیه|سقف|limit|quota)/i.test(text)) {
    const m = text.match(/(?:^|\s)(\d{1,4})(?=\s|$)/);
    const isDefault = /(پیش\s?فرض|default)/i.test(text);
    if (m || isDefault) {
      const rest = text.replace(m ? m[0] : "", " ");
      const name = extractName(rest, ["سهمیه", "سقف", "limit", "quota", "پیشفرض", "پیش", "فرض", "default", "روزانه", "سوال", "سؤال"]);
      if (!name) return { ok: false, reason: "no-name" };
      const v = parseAccessValue("limit", isDefault ? "default" : m[1]);
      return v.ok ? { ok: true, action: { type: "access", name, key: "limit", value: v.value } } : { ok: false, reason: v.reason };
    }
  }

  // ۵) خاموش/روشن کردن یک قابلیت: «وب علی رو ببند»، «دستیار X رو روشن کن»
  const keyMatch = text.match(/(^| )(دستیار|وب|جستجو|سرچ|عکس|عکسها|تصویر|تفکر|خرید|فروشگاه|assistant|web|images|think|buy)( |$)/i);
  if (keyMatch && (TOGGLE_OFF.test(text) || TOGGLE_ON.test(text))) {
    const key = normalizeKey(keyMatch[2]);
    const off = TOGGLE_OFF.test(text);
    const name = extractName(text, [keyMatch[2], ...wordsOf(TOGGLE_OFF), ...wordsOf(TOGGLE_ON)]);
    if (key && name) return { ok: true, action: { type: "access", name, key, value: !off } };
  }

  // ۶) دیدن وضعیت: «وضعیت ALIXMOD»، «دسترسی علی رو نشون بده»
  if (SHOW_RE.test(text) && /(وضعیت|دسترسی|status|access)/i.test(text)) {
    const name = extractName(text, [...wordsOf(SHOW_RE), "وضعیت", "دسترسی", "دسترسی‌ها", "status", "access"]);
    if (name) return { ok: true, action: { type: "access-show", name } };
  }

  return null;
}
