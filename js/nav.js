/* نوار پایین دومیتو: خانه · دوستان · بازی · دستیار · پروفایل */
(function () {
  const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const I = {
    home: "M5 12l-2 0l9 -9l9 9l-2 0M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6",
    users: "M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0 -3 -3.85",
    pad: "M6 8h12a4 4 0 0 1 4 4v1a3 3 0 0 1 -5 2l-1 -1h-8l-1 1a3 3 0 0 1 -5 -2v-1a4 4 0 0 1 4 -4zM8 11v3M6.5 12.5h3M15 12h.01M17 13.5h.01",
    bot: "M7 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2zM12 3v4M9.5 12h.01M14.5 12h.01M9 20h6",
    user: "M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"
  };
  const ic = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  const items = [
    ["index.html", "خانه", "home", ["index.html", ""]],
    ["friends.html", "دوستان", "users", ["friends.html"]],
    ["lobby.html", "رای‌گیری سرتاسری", "pad", [], true],
    ["assistant.html", "دستیار", "bot", ["assistant.html"]],
    ["profile.html", "پروفایل", "user", ["profile.html"]]
  ];
  const nav = document.createElement("nav");
  nav.id = "dnNav";
  nav.setAttribute("aria-label", "منوی اصلی");
  nav.innerHTML = items.map(([href, label, icon, match, mid]) => {
    const on = (match || []).includes(here) ? " on" : "";
    return '<a href="./' + href + '" class="' + (mid ? "mid" : on.trim()) + '" aria-label="' + label + '">' + ic(I[icon]) + (mid ? "" : "<span>" + label + "</span>") + "</a>";
  }).join("");
  document.body.appendChild(nav);

  // مرورگرهای بدون View Transition: محو/ورود نرم با خود صفحه
  const vt = "onpagereveal" in window;
  if (!vt && document.body.animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.body.animate(
      [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
      { duration: 320, easing: "cubic-bezier(.2,.9,.25,1)" }
    );
    nav.querySelectorAll("a:not(.mid)").forEach((a) => {
      a.addEventListener("click", (e) => {
        if (a.classList.contains("on") || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        const href = a.href;
        const anim = document.body.animate(
          [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-8px)" }],
          { duration: 180, easing: "ease-in", fill: "forwards" }
        );
        anim.onfinish = () => { window.location.href = href; };
        setTimeout(() => { window.location.href = href; }, 400);
      });
    });
  }
  document.body.style.paddingBottom = "110px";

  // امضای کمرنگ پایین صفحه
  if (!document.getElementById("dnCredit")) {
    const credit = document.createElement("div");
    credit.id = "dnCredit";
    credit.textContent = "Domito by Claude & Mehran";
    credit.setAttribute("dir", "ltr");
    credit.style.cssText = "text-align:center;font-size:11px;letter-spacing:.4px;opacity:.35;margin:18px 0 0;padding:0 12px;pointer-events:none;user-select:none;color:inherit";
    document.body.appendChild(credit);
  }

  // وقتی صفحهٔ ورود/ثبت‌نام باز است نوار پایین نشان داده نشود
  const auth = document.getElementById("authCard");
  if (auth) {
    const sync = () => { nav.style.display = auth.style.display === "none" ? "flex" : "none"; };
    sync(); setInterval(sync, 400);
  }
  // دکمهٔ وسط: مستقیم وارد رای‌گیری سرتاسری می‌شود
  const mid = nav.querySelector(".mid");
  let busy = false;
  mid.addEventListener("click", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    mid.style.opacity = ".6";
    try {
      const app = await import("./app.js");
      const user = await app.waitForUser();
      if (!user) { window.location.href = "./index.html"; return; }

      const cur = app.getSavedRoom();
      if (cur && app.isGlobalRoom(cur) && /lobby\.html$/.test(location.pathname)) {
        busy = false; mid.style.opacity = ""; return;   // همین‌جا هستیم
      }
      if (cur && !app.isGlobalRoom(cur)) {
        try { await app.leaveLobby(); } catch (err) { console.warn(err); }
      }
      await app.enterGlobalRoom();
      window.location.href = "./lobby.html";
    } catch (err) {
      console.error(err);
      busy = false; mid.style.opacity = "";
      alert("ورود به رای‌گیری سرتاسری انجام نشد. اینترنت را بررسی کن و دوباره امتحان کن.");
    }
  });
})();
