// ============================================================
// اعلان‌ها — زنگولهٔ بالا سمت چپ، صندوق پیام، اجازهٔ نوتیفیکیشن و ارسال پیام توسط ادمین
// ============================================================
import {
  waitForUser, getSavedName, db, ref, onValue, set, push, remove,
  serverTimestamp, isAdminUser, profileRef, GAMES
} from "./app.js";

if (!window.__domitoNotifications) {
  window.__domitoNotifications = true;
  boot().catch(e => console.warn("notifications:", e));
}

async function boot() {
  let user = null;
  try { user = await waitForUser(); } catch (e) { return; }
  const me = getSavedName();
  if (!user || !me) return;

  const K = n => `domito_notif_${n}_${encodeURIComponent(me)}`;
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fa = n => String(n).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const ago = t => {
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "همین الان";
    if (s < 3600) return fa(Math.floor(s / 60)) + " دقیقه پیش";
    if (s < 86400) return fa(Math.floor(s / 3600)) + " ساعت پیش";
    return fa(Math.floor(s / 86400)) + " روز پیش";
  };

  // ---------- حافظهٔ مشترک با service worker (IndexedDB) ----------
  const idb = () => new Promise((res, rej) => {
    const r = indexedDB.open("domito-sw", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const kvGet = async k => { try { const d = await idb(); return await new Promise(r => { const q = d.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(undefined); }); } catch (e) { return undefined; } };
  const kvSet = async (k, v) => { try { const d = await idb(); await new Promise(r => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = r; t.onerror = r; }); } catch (e) {} };
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // ---------- service worker (برای نوتیفیکیشن روی اندروید لازم است) ----------
  let swReg = null;
  try { if ("serviceWorker" in navigator) swReg = await navigator.serviceWorker.register("./sw.js"); } catch (e) { console.warn(e); }

  // ---------- وضعیت ----------
  let admin = false;
  try { admin = await isAdminUser(); } catch (e) {}
  const sources = { announce: [], friend: [], local: lsGet(K("local"), []) };
  let first = { announce: true, friend: true };
  let panelOpen = false;
  let seenAt = lsGet(K("seen"), 0);
  let firstRun = !localStorage.getItem(K("seen"));
  if (firstRun) { seenAt = Date.now(); lsSet(K("seen"), seenAt); }

  let muted = lsGet(K("muted"), false);
  async function syncSwState() {
    await kvSet("name", me);
    await kvSet("lastVisitDay", dayKey());
    await kvSet("muted", !!muted);
  }
  await syncSwState();
  // پیام‌هایی که service worker وقتی سایت بسته بود نشان داده (مثلاً «امروز نیومدی»)
  try {
    const pend = (await kvGet("pending")) || [];
    if (pend.length) { await kvSet("pending", []); pend.forEach(p => { if (!sources.local.some(x => x.id === p.id)) sources.local.unshift(p); }); sources.local = sources.local.slice(0, 30); lsSet(K("local"), sources.local); }
  } catch (e) {}
  // یادآوری روزانهٔ پس‌زمینه (روی اندروید برای سایتی که به صفحهٔ اصلی اضافه شده)
  try {
    if (swReg && "periodicSync" in swReg) {
      const st = await navigator.permissions.query({ name: "periodic-background-sync" });
      if (st.state === "granted") await swReg.periodicSync.register("domito-daily", { minInterval: 12 * 3600 * 1000 });
    }
  } catch (e) {}

  function addLocal(id, icon, title, body) {
    if (sources.local.some(x => x.id === id)) return;
    sources.local.unshift({ id, icon, title, body, at: Date.now() });
    sources.local = sources.local.slice(0, 30);
    lsSet(K("local"), sources.local);
  }

  // بازگشت بعد از غیبت + بازی‌های جدید (محلی؛ فقط وقتی سایت باز است)
  const lastVisit = lsGet(K("lastvisit"), 0);
  if (lastVisit && Date.now() - lastVisit > 24 * 3600 * 1000) {
    const days = Math.floor((Date.now() - lastVisit) / 86400000);
    addLocal("w_" + Date.now(), "👋", `${me}، خوش برگشتی!`, `${fa(days)} روز بود که به دومیتو نیومده بودی؛ بازی‌ها منتظرتن.`);
  }
  lsSet(K("lastvisit"), Date.now());
  try {
    const ids = (GAMES || []).map(g => g.id);
    const known = lsGet(K("games"), null);
    if (known) {
      ids.filter(id => !known.includes(id)).forEach(id => {
        const g = GAMES.find(x => x.id === id);
        addLocal("g_" + id, g.icon || "🎮", `${me}، بازی جدید اومد!`, `«${g.name}» اومده؛ سریع‌تر از بقیه بیا بازی کن 🏁`);
      });
    }
    lsSet(K("games"), ids);
  } catch (e) {}

  function allItems() {
    return [...sources.announce, ...sources.friend, ...sources.local].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 80);
  }

  // ---------- UI ----------
  const css = document.createElement("style");
  css.textContent = `
  #dnBell{position:fixed;top:12px;left:12px;z-index:99990;width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:rgba(15,20,36,.92);color:#fff;font-size:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35);padding:0}
  #dnBell.ring{animation:dnring .9s ease 2}
  @keyframes dnring{0%,100%{transform:rotate(0)}20%{transform:rotate(18deg)}40%{transform:rotate(-16deg)}60%{transform:rotate(10deg)}80%{transform:rotate(-6deg)}}
  #dnBadge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:#ff3b4e;color:#fff;font:800 11px/20px Vazirmatn,Tahoma,sans-serif;text-align:center;padding:0 5px;display:none}
  #dnPanel{color:#fff;font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl;display:none}
  #dnPanel.inline{display:block;width:100%}
  .dnCard{background:#141827;border:1px solid rgba(255,255,255,.12);border-radius:22px;margin-bottom:22px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.25)}
  .dnH{padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.1);font-weight:800;font-size:18px}
  .dnBody{padding:18px 20px}
  .dnNote{font-size:15px;line-height:2;margin-bottom:12px;opacity:.92}
  .dnHint{font-size:13px;opacity:.6;line-height:1.9;margin-top:12px}
  .dnBtn{font:800 16px Vazirmatn,Tahoma,sans-serif;border:0;border-radius:14px;padding:13px 22px;background:linear-gradient(#ffe27a,#ffb02e);color:#1b1300;cursor:pointer;margin:4px 0 0 10px}
  .dnBtn.alt{background:rgba(255,255,255,.14);color:#fff}
  .dnItem{display:flex;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.07)}
  .dnItem:last-child{border-bottom:0}
  .dnItem.new{background:rgba(80,160,255,.12)}
  .dnIc{font-size:32px;line-height:1.2}
  .dnT{font-weight:800;font-size:17px;line-height:1.7}
  .dnB{font-size:15px;opacity:.88;margin-top:4px;line-height:1.9;white-space:pre-wrap;word-break:break-word}
  .dnM{font-size:12.5px;opacity:.55;margin-top:8px;display:flex;gap:14px}
  .dnDel{background:none;border:0;color:#ff8f8f;font-size:13px;cursor:pointer;padding:0}
  .dnEmpty{padding:40px 20px;text-align:center;opacity:.6;font-size:15px}
  .dnAdm label{display:block;font-size:14px;font-weight:700;margin:14px 0 6px;opacity:.85}
  .dnAdm input,.dnAdm textarea,.dnAdm select{width:100%;box-sizing:border-box;font:15px Vazirmatn,Tahoma,sans-serif;background:#0b1220;color:#fff;border:1px solid rgba(255,255,255,.22);border-radius:12px;padding:12px 14px}
  .dnAdm textarea{min-height:110px;resize:vertical}
  .dnAdm .dnBtn{margin:18px 0 0}
  #dnMsg{font-size:14px;margin-top:12px;min-height:20px;line-height:1.8}
  #dnToast{position:fixed;top:66px;left:12px;z-index:99992;width:min(340px,calc(100vw - 24px));padding:13px 16px;border-radius:16px;background:rgba(12,18,34,.97);border:1px solid rgba(255,255,255,.2);color:#fff;font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl;box-shadow:0 14px 40px rgba(0,0,0,.45);transform:translateY(-16px);opacity:0;pointer-events:none;transition:.25s}
  #dnToast.show{transform:none;opacity:1;pointer-events:auto}
  `;
  document.head.appendChild(css);

  const pageEl = document.getElementById("dnPage");
  const pageMode = !!pageEl;
  const bell = document.createElement("button");
  bell.id = "dnBell"; bell.type = "button"; bell.setAttribute("aria-label", "اعلان‌ها");
  bell.innerHTML = `🔔<span id="dnBadge"></span>`;
  const panel = document.createElement("div"); panel.id = "dnPanel";
  const toast = document.createElement("div"); toast.id = "dnToast";
  document.body.append(toast);
  if (pageMode) { panel.classList.add("inline"); pageEl.appendChild(panel); } else document.body.append(bell, panel);
  const badge = bell.querySelector("#dnBadge");

  function unreadCount() { return allItems().filter(i => (i.at || 0) > seenAt).length; }
  function updateBadge() {
    const n = unreadCount();
    badge.style.display = n ? "block" : "none";
    badge.textContent = n > 99 ? "۹۹+" : fa(n);
  }

  const permState = () => ("Notification" in window ? Notification.permission : "unsupported");

  function render() {
    const items = allItems();
    const perm = permState();
    let st = "";
    if (perm === "default") st = `<div class="dnNote">دومیتو می‌تواند برایت اعلان بفرستد: پیام ادمین، درخواست دوستی، بازی جدید و بروزرسانی‌ها.</div><button class="dnBtn" id="dnAllow" type="button">اجازه می‌دهم</button>`;
    else if (perm === "denied") st = `<div class="dnNote">اعلان‌های مرورگر بسته است. از تنظیمات سایت در مرورگر، «اعلان‌ها» را روی «اجازه» بگذار. پیام‌ها همین‌جا هم دیده می‌شوند.</div>`;
    else if (perm === "unsupported") st = `<div class="dnNote">این مرورگر اعلان سیستمی را پشتیبانی نمی‌کند؛ پیام‌ها همین‌جا دیده می‌شوند.</div>`;
    else st = `<div class="dnNote">اعلان‌های مرورگر <b>${muted ? "خاموش" : "روشن"}</b> است.</div>`;
    let html = `<section class="dnCard">
      <div class="dnH"><span>⚙️ تنظیم اعلان</span></div>
      <div class="dnBody">${st}
        <button class="dnBtn ${muted ? "" : "alt"}" id="dnMute" type="button">${muted ? "🔔 روشن کردن اعلان" : "🔕 خاموش کردن اعلان"}</button>
        <div class="dnHint">با خاموش‌کردن، پیام‌ها فقط همین‌جا جمع می‌شوند و نوتیفیکیشن و پنجرهٔ بالا نمی‌آید.</div>
      </div></section>
      <section class="dnCard"><div class="dnH"><span>📨 پیام‌ها</span></div><div id="dnList">${listHtml(items)}</div></section>`;
    if (admin) {
      html += `<section class="dnCard"><div class="dnH"><span>✉️ ارسال پیام (ادمین)</span></div>
        <div class="dnBody dnAdm">
        <label>گیرنده</label>
        <select id="dnTo"><option value="all">برای همه</option><option value="user">برای یک نفر</option></select>
        <input id="dnUser" placeholder="نام کاربری گیرنده" style="display:none">
        <label>عنوان</label>
        <input id="dnTitle" placeholder="عنوان پیام" maxlength="80">
        <label>متن پیام</label>
        <textarea id="dnBody" placeholder="متن پیام" maxlength="400"></textarea>
        <button class="dnBtn" id="dnSend" type="button">ارسال</button>
        <div id="dnMsg"></div>
      </div></section>`;
    }
    panel.innerHTML = html;
    const allow = panel.querySelector("#dnAllow");
    if (allow) allow.onclick = askPermission;
    panel.querySelector("#dnMute").onclick = async () => {
      muted = !muted; lsSet(K("muted"), muted); await kvSet("muted", muted); render();
    };
    bindDel();
    if (admin) wireAdmin();
  }
  function bindDel() {
    panel.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      try { await remove(ref(db, "announcements/" + b.dataset.del)); } catch (e) { alert("حذف نشد."); }
    });
  }
  function renderList() {
    const l = panel.querySelector("#dnList");
    if (!l) return;
    l.innerHTML = listHtml(allItems());
    bindDel();
  }
  function listHtml(items) {
    if (!items.length) return `<div class="dnEmpty">هنوز اعلانی نداری</div>`;
    return items.map(i => `
      <div class="dnItem${(i.at || 0) > seenAtView ? " new" : ""}">
        <div class="dnIc">${esc(i.icon || "🔔")}</div>
        <div style="flex:1;min-width:0">
          <div class="dnT">${esc(i.title)}</div>
          ${i.body ? `<div class="dnB">${esc(i.body)}</div>` : ""}
          <div class="dnM"><span>${i.at ? ago(i.at) : ""}</span>${admin && i.key ? `<button class="dnDel" data-del="${esc(i.key)}" type="button">حذف</button>` : ""}</div>
        </div>
      </div>`).join("");
  }

  function wireAdmin() {
    const to = panel.querySelector("#dnTo"), user = panel.querySelector("#dnUser"), msg = panel.querySelector("#dnMsg");
    to.onchange = () => { user.style.display = to.value === "user" ? "block" : "none"; };
    panel.querySelector("#dnSend").onclick = async () => {
      const title = panel.querySelector("#dnTitle").value.trim();
      const body = panel.querySelector("#dnBody").value.trim();
      const target = to.value === "all" ? "all" : user.value.trim();
      msg.style.color = "#ff9b9b";
      if (!title && !body) { msg.textContent = "عنوان یا متن پیام را بنویس."; return; }
      if (!target) { msg.textContent = "نام کاربری گیرنده را بنویس."; return; }
      if (target === "all" && !confirm("این پیام برای همهٔ کاربران ارسال می‌شود. مطمئنی؟")) return;
      try {
        await set(push(ref(db, "announcements")), { to: target, title: title || "پیام ادمین", body, by: me, at: serverTimestamp() });
        msg.style.color = "#7dffb0"; msg.textContent = target === "all" ? "برای همه ارسال شد ✓" : `برای «${target}» ارسال شد ✓`;
        panel.querySelector("#dnTitle").value = ""; panel.querySelector("#dnBody").value = "";
      } catch (e) {
        console.error(e);
        msg.innerHTML = /PERMISSION/i.test(String(e && (e.code || e.message)))
          ? 'قوانین Firebase اجازهٔ نوشتن در <b dir="ltr">announcements</b> را نمی‌دهد (راهنما در پیام چت).'
          : "ارسال نشد؛ اینترنت را بررسی کن.";
      }
    };
  }

  let seenAtView = seenAt;
  function openPanel() {
    seenAtView = seenAt;
    panelOpen = true; render(); panel.classList.add("open");
    seenAt = Date.now(); lsSet(K("seen"), seenAt); updateBadge();
    toast.classList.remove("show");
  }
  function closePanel() { panelOpen = false; panel.classList.remove("open"); }
  bell.onclick = () => { location.href = "./notifications.html"; };
  document.addEventListener("click", e => { if (!pageMode && panelOpen && e.target.isConnected && !panel.contains(e.target) && !bell.contains(e.target)) closePanel(); });

  async function askPermission() {
    try { await Notification.requestPermission(); } catch (e) {}
    if (panelOpen) render();
    if (permState() === "granted") systemNotify("اعلان‌ها فعال شد ✓", "از این به بعد پیام‌های دومیتو را اینجا می‌بینی.", "welcome", true);
  }
  // درخواست اجازه به‌صورت نرم: یک نوار کوچک بعد از ورود (مرورگرها اجازه را فقط با کلیک کاربر می‌دهند)
  if (permState() === "default" && Date.now() - lsGet(K("askedAt"), 0) > 3 * 86400000) {
    setTimeout(() => { lsSet(K("askedAt"), Date.now()); showToast("🔔", "اعلان‌ها", "برای دریافت پیام‌ها روی زنگوله بزن و اجازه بده.", true, false); }, 2500);
  }

  function systemNotify(title, body, tag, force) {
    if (permState() !== "granted" || (muted && !force)) return;
    const opts = { body: body || "", tag: tag || undefined, icon: "./logo.png", badge: "./badge.png", dir: "rtl", lang: "fa", data: { url: "./index.html" } };
    try {
      if (swReg && swReg.showNotification) swReg.showNotification(title, opts);
      else new Notification(title, opts);
    } catch (e) { try { new Notification(title, opts); } catch (_) {} }
  }
  let toastT = 0;
  function showToast(icon, title, body, noRing, force) {
    if (muted && !force) return;
    toast.innerHTML = `<div style="display:flex;gap:10px"><div style="font-size:22px">${esc(icon)}</div><div><div style="font-weight:800;font-size:14px">${esc(title)}</div><div style="font-size:12.5px;opacity:.85;margin-top:2px">${esc(body)}</div></div></div>`;
    toast.classList.add("show");
    if (!noRing) { bell.classList.remove("ring"); void bell.offsetWidth; bell.classList.add("ring"); }
    clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove("show"), 5000);
    toast.onclick = () => { toast.classList.remove("show"); if (pageMode) openPanel(); else location.href = "./notifications.html"; };
  }

  // ---------- اعلان تازه: نوتیفیکیشن سیستم (اگر صفحه پنهان است) یا توست داخل سایت ----------
  const shown = new Set(lsGet(K("shown"), []));
  function notifyNew(list, live) {
    const fresh = list.filter(i => !shown.has(i.id) && (i.at || 0) > seenAt - 1000).sort((a, b) => a.at - b.at);
    if (!fresh.length) return;
    fresh.forEach(i => shown.add(i.id));
    lsSet(K("shown"), [...shown].slice(-200));
    if (panelOpen) { renderList(); return; }
    const last = fresh[fresh.length - 1];
    if (document.hidden) {
      fresh.slice(-3).forEach(i => systemNotify(i.title, i.body, i.id));
    } else if (live) {
      showToast(last.icon || "🔔", last.title, last.body || "");
    }
  }
  // آیتم‌هایی که قبلاً دیده‌ایم دوباره اعلان نشوند
  allItems().forEach(i => { if ((i.at || 0) <= seenAt) shown.add(i.id); });

  function refresh(live) {
    if (panelOpen) { seenAt = Date.now(); lsSet(K("seen"), seenAt); }
    updateBadge();
    if (panelOpen) renderList();
    notifyNew(allItems(), live);
  }

  // ---------- منابع داده ----------
  onValue(ref(db, "announcements"), snap => {
    const v = snap.val() || {};
    sources.announce = Object.entries(v).filter(([k, a]) => a && (a.to === "all" || a.to === me || a.by === me))
      .map(([k, a]) => ({
        id: "a_" + k, key: k, icon: a.to === "all" ? "📣" : "✉️", title: a.title || "پیام",
        body: a.body || "", at: Number(a.at) || 0
      })).sort((x, y) => y.at - x.at).slice(0, 60);
    refresh(!first.announce); first.announce = false;
  }, e => console.warn("announcements:", e && e.message));

  onValue(profileRef(me, "friendRequests"), snap => {
    const v = snap.val() || {};
    sources.friend = Object.entries(v).map(([from, ts]) => ({
      id: "f_" + from + "_" + (Number(ts) || 0), icon: "🤝", title: "درخواست دوستی 🤝", body: `${me}، ${from} بهت درخواست دوستی داده؛ قبول می‌کنی؟`, at: Number(ts) || Date.now()
    }));
    refresh(!first.friend); first.friend = false;
  }, e => console.warn("friendRequests:", e && e.message));

  // خبر بروزرسانی سایت: فایل version.json را بررسی می‌کنیم
  async function checkVersion() {
    try {
      const r = await fetch("./version.json?_=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      const old = localStorage.getItem("domito_site_ver");
      if (j && j.v && old !== String(j.v)) {
        localStorage.setItem("domito_site_ver", String(j.v));
        if (old) {
          addLocal("u_" + j.v, "🔄", "دومیتو آپدیت شد", (j.notes ? j.notes + "\n" : "") + "برای دیدن تغییرات، صفحه را یک بار تازه کن.");
          refresh(true);
        }
      }
    } catch (e) {}
  }
  checkVersion();
  setInterval(checkVersion, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkVersion(); });

  updateBadge();
  refresh(false);
  if (pageMode) openPanel();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) updateBadge(); });
}
