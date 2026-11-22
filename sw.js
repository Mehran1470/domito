// Service worker دومیتو — اعلان‌های سیستمی، کلیک روی اعلان، و یادآوری روزانهٔ «امروز نیومدی»
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open("domito-sw", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("kv");
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const kvGet = async k => { try { const d = await idb(); return await new Promise(r => { const q = d.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(undefined); }); } catch (e) { return undefined; } };
const kvSet = async (k, v) => { try { const d = await idb(); await new Promise(r => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = r; t.onerror = r; }); } catch (e) {} };
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./index.html";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      return self.clients.openWindow(url);
    })
  );
});

async function dailyCheck() {
  const name = await kvGet("name");
  if (!name) return;
  if (await kvGet("muted")) return;
  const today = dayKey();
  if ((await kvGet("lastVisitDay")) === today) return;      // امروز آمده
  if ((await kvGet("lastReminderDay")) === today) return;   // امروز یادآوری شده
  if (new Date().getHours() < 12) return;                    // صبح زود مزاحم نشویم
  const title = `${name}، امروز نیومدی دومیتو!`;
  const body = "بیا یه دست بازی کن 🎮";
  await self.registration.showNotification(title, {
    body, tag: "domito-daily", icon: "./logo.png", badge: "./badge.png", dir: "rtl", lang: "fa", data: { url: "./index.html" }
  });
  await kvSet("lastReminderDay", today);
  const pend = (await kvGet("pending")) || [];
  pend.unshift({ id: "d_" + today, icon: "😢", title, body, at: Date.now() });
  await kvSet("pending", pend.slice(0, 10));
}
self.addEventListener("periodicsync", e => { if (e.tag === "domito-daily") e.waitUntil(dailyCheck()); });
