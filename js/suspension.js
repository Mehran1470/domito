// ============================================================
// تعلیق حساب (منطق خالص؛ بدون Firebase)
//
// وضعیت تعلیق در localStorage ذخیره می‌شود تا حتی وقتی Firebase در دسترس نیست
// (مثلاً کاربر VPN را خاموش کرده) صفحه‌ی «تعلیق شدی» نشان داده شود.
// اگر کش پاک شود، برای ورود دوباره Firebase لازم است و تعلیق از آنجا خوانده می‌شود.
// ============================================================

const CACHE_KEY = "domito_suspension";
const NAME_KEY = "domito_name";

export function suspendedPageUrl() {
  return new URL("../suspended.html", import.meta.url).href;
}

export function onSuspendedPage() {
  return /\/suspended\.html$/i.test(location.pathname);
}

function savedName() {
  try { return String(localStorage.getItem(NAME_KEY) || "").trim(); } catch (e) { return ""; }
}

// کش خام (حتی اگر زمانش گذشته باشد)؛ null اگر نباشد یا خراب باشد.
export function readSuspensionRaw() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!raw || typeof raw !== "object") return null;
    const until = Number(raw.until);
    if (!Number.isFinite(until)) return null;
    return { name: String(raw.name || ""), until: Math.floor(until), savedAt: Number(raw.savedAt) || 0 };
  } catch (e) {
    return null;
  }
}

// تعلیق فعال از کش: فقط وقتی زمان پایانش نگذشته. اگر گذشته باشد کش پاک می‌شود.
export function readActiveSuspension(now = Date.now()) {
  const s = readSuspensionRaw();
  if (!s) return null;
  if (s.until <= now) {
    clearSuspension();
    return null;
  }
  return s;
}

export function saveSuspension(name, until) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      name: String(name || ""),
      until: Math.floor(Number(until)),
      savedAt: Date.now()
    }));
  } catch (e) { /* ذخیره نشد؛ بررسی Firebase باز هم انجام می‌شود */ }
}

export function clearSuspension() {
  try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
}

// فقط برای حسابی که روی همین دستگاه وارد شده اعمال می‌شود.
// اگر کسی خارج شده باشد، صفحه‌ی ورود نشان داده می‌شود و ورود دوباره خودش Firebase را چک می‌کند.
export function cachedSuspensionForThisDevice(now = Date.now()) {
  const s = readActiveSuspension(now);
  if (!s) return null;
  const me = savedName();
  if (!me || me !== s.name) return null;
  return s;
}

// فوراً و بدون شبکه: اگر کش می‌گوید این حساب تعلیق است، به صفحه‌ی تعلیق می‌رود.
export function enforceCachedSuspension() {
  if (onSuspendedPage()) return false;
  const s = cachedSuspensionForThisDevice();
  if (!s) return false;
  try { location.replace(suspendedPageUrl()); } catch (e) {}
  return true;
}

// یک‌بار اجرا در لحظه‌ی import: همه‌ی صفحه‌هایی که app.js را می‌خوانند محافظت می‌شوند.
export function formatUntil(until) {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Asia/Tehran"
    }).format(new Date(until));
  } catch (e) {
    return new Date(until).toLocaleString();
  }
}

export function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const fa = (n) => String(n).replace(/\d/g, (x) => "۰۱۲۳۴۵۶۷۸۹"[x]);
  const parts = [];
  if (d) parts.push(fa(d) + " روز");
  if (d || h) parts.push(fa(h) + " ساعت");
  parts.push(fa(m) + " دقیقه");
  if (!d) parts.push(fa(s) + " ثانیه");
  return parts.join(" و ");
}
