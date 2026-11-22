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

const PUSH_URL = "https://domito-push.mhranzary40.workers.dev";
async function subId() {
  const sub = await self.registration.pushManager.getSubscription();
  if (!sub) return null;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sub.endpoint));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
// push خالی از سرور می‌رسد؛ پیام‌ها را از Worker می‌خوانیم و نشان می‌دهیم
self.addEventListener("push", e => e.waitUntil((async () => {
  let msgs = [];
  try {
    const id = await subId();
    if (id) { const r = await fetch(PUSH_URL + "/pull?id=" + id, { cache: "no-store" }); msgs = (await r.json()).msgs || []; }
  } catch (err) {}
  if (!msgs.length) msgs = [{ id: "g_" + Date.now(), title: "دومیتو", body: "پیام تازه‌ای داری 🔔" }];
  const pend = (await kvGet("pending")) || [];
  for (const m of msgs.slice(-3)) {
    await self.registration.showNotification(m.title || "دومیتو", {
      body: m.body || "", tag: m.id, icon: "./logo.png", badge: "./badge.png", dir: "rtl", lang: "fa", vibrate: [120, 60, 120], data: { url: "./notifications.html" }
    });
    if (m.id && !String(m.id).startsWith("a_") && !String(m.id).startsWith("g_")) pend.unshift({ id: m.id, icon: m.icon || "🔔", title: m.title, body: m.body, at: m.at || Date.now() });
  }
  await kvSet("pending", pend.slice(0, 10));
})()));
