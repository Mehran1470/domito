import {
  waitForUser,
  getSavedName,
  listenInvites,
  dismissInvite,
  joinRoomByCode
} from "./app.js";


// ============================================================
// جلوگیری از اجرای دوباره
// ============================================================

if (!window.__domitoInviteNotification) {

  window.__domitoInviteNotification = true;


  // ==========================================================
  // CSS
  // ==========================================================

  const style = document.createElement("style");

  style.textContent = `

    #domitoInvitePopup {

      position: fixed;

      top: 16px;
      left: 50%;

      transform:
        translateX(-50%)
        translateY(-20px);

      width:
        min(
          330px,
          calc(100vw - 28px)
        );

      box-sizing: border-box;

      padding: 14px 15px;

      background:
        rgba(12, 24, 42, .96);

      border:
        1px solid
        rgba(255,255,255,.16);

      border-radius:
        18px;

      box-shadow:
        0 14px 40px
        rgba(0,0,0,.35);

      backdrop-filter:
        blur(14px);

      -webkit-backdrop-filter:
        blur(14px);

      color: #fff;

      z-index: 2147483647;

      opacity: 0;

      pointer-events: none;

      transition:
        opacity .22s ease,
        transform .22s ease;

      direction: rtl;

      font-family:
        inherit;

    }


    #domitoInvitePopup.show {

      opacity: 1;

      transform:
        translateX(-50%)
        translateY(0);

      pointer-events: auto;

    }


    #domitoInvitePopup .invite-title {

      display: flex;

      align-items: center;

      gap: 7px;

      font-size: 15px;

      font-weight: 800;

      margin-bottom: 7px;

    }


    #domitoInvitePopup .invite-text {

      font-size: 13px;

      line-height: 1.8;

      color:
        rgba(255,255,255,.9);

    }


    #domitoInvitePopup .invite-code {

      display: inline-block;

      margin-top: 4px;

      padding: 3px 8px;

      border-radius: 8px;

      background:
        rgba(255,255,255,.09);

      font-weight: 800;

      letter-spacing: 1px;

      direction: ltr;

    }


    #domitoInvitePopup .invite-actions {

      display: flex;

      gap: 8px;

      margin-top: 11px;

    }


    #domitoInvitePopup button {

      flex: 1;

      border: 0;

      border-radius: 10px;

      padding: 8px 10px;

      font-family: inherit;

      font-size: 12px;

      font-weight: 700;

      cursor: pointer;

    }


    #domitoInvitePopup .invite-join {

      background:
        #4cd97b;

      color: #06130a;

    }


    #domitoInvitePopup .invite-later {

      background:
        rgba(255,255,255,.09);

      color: #fff;

      border:
        1px solid
        rgba(255,255,255,.12);

    }


    #domitoInvitePopup button:disabled {

      opacity: .55;

      cursor: default;

    }

  `;

  document.head.appendChild(style);


  // ==========================================================
  // ساخت پنجره
  // ==========================================================

  const popup =
    document.createElement("div");

  popup.id =
    "domitoInvitePopup";


  popup.innerHTML = `

    <div class="invite-title">
      🔔 دعوت جدید
    </div>

    <div class="invite-text">

      <span id="domitoInviteFrom"></span>
      تو رو به اتاقش دعوت کرد 🎮

      <br>

      کد اتاق:

      <span
        class="invite-code"
        id="domitoInviteCode"
      ></span>

    </div>

    <div class="invite-actions">

      <button
        class="invite-join"
        id="domitoInviteJoin"
      >
        ورود به اتاق
      </button>

      <button
        class="invite-later"
        id="domitoInviteLater"
      >
        بعداً
      </button>

    </div>

  `;


  document.body.appendChild(popup);


  // ==========================================================
  // عناصر
  // ==========================================================

  const fromEl =
    document.getElementById(
      "domitoInviteFrom"
    );

  const codeEl =
    document.getElementById(
      "domitoInviteCode"
    );

  const joinBtn =
    document.getElementById(
      "domitoInviteJoin"
    );

  const laterBtn =
    document.getElementById(
      "domitoInviteLater"
    );


  let currentInvite = null;

  let initialized = false;

  let knownInviteIds =
    new Set();


  // ==========================================================
  // نمایش اعلان
  // ==========================================================

  function showInvite(invite) {

    if (!invite) {
      return;
    }


    currentInvite =
      invite;


    fromEl.textContent =
      invite.from || "یک دوست";


    codeEl.textContent =
      invite.roomCode || "---";


    joinBtn.disabled =
      false;


    joinBtn.textContent =
      "ورود به اتاق";


    popup.classList.add(
      "show"
    );

  }


  // ==========================================================
  // مخفی کردن
  // ==========================================================

  function hideInvite() {

    popup.classList.remove(
      "show"
    );

  }


  // ==========================================================
  // دکمه بعداً
  // ==========================================================

  laterBtn.addEventListener(
    "click",
    () => {

      hideInvite();

    }
  );


  // ==========================================================
  // ورود به اتاق
  // ==========================================================

  joinBtn.addEventListener(
    "click",
    async () => {

      if (!currentInvite) {
        return;
      }


      const invite =
        currentInvite;


      if (!invite.roomCode) {
        return;
      }


      joinBtn.disabled =
        true;


      joinBtn.textContent =
        "در حال ورود...";


      try {

        const result =
          await joinRoomByCode(
            invite.roomCode
          );


        if (result && result.ok) {

          await dismissInvite(
            getSavedName(),
            invite.id
          );


          window.location.href =
            "lobby.html";

        }

        else {

          joinBtn.disabled =
            false;

          joinBtn.textContent =
            "ورود به اتاق";


          alert(
            "این اتاق دیگر وجود ندارد."
          );

        }

      }

      catch (error) {

        console.error(
          "Invite join error:",
          error
        );


        joinBtn.disabled =
          false;

        joinBtn.textContent =
          "ورود به اتاق";


        alert(
          "ورود به اتاق انجام نشد."
        );

      }

    }
  );


  // ==========================================================
  // اتصال به Firebase
  // ==========================================================

  waitForUser().then(
    (user) => {

      if (!user) {
        return;
      }


      const myName =
        getSavedName();


      if (!myName) {
        return;
      }


      listenInvites(
        myName,
        (list) => {

          list =
            Array.isArray(list)
              ? list
              : [];


          /*
           * اولین دریافت Firebase فقط لیست فعلی
           * را ثبت می‌کند.
           *
           * بنابراین دعوت‌های قدیمی هنگام
           * باز شدن صفحه ناگهان پاپ‌آپ نمی‌شوند.
           */

          if (!initialized) {

            knownInviteIds =
              new Set(
                list.map(
                  inv => inv.id
                )
              );


            initialized =
              true;


            return;

          }


          // ==================================================
          // پیدا کردن دعوت‌های کاملاً جدید
          // ==================================================

          const newInvites =
            list.filter(
              inv =>
                !knownInviteIds.has(
                  inv.id
                )
            );


          knownInviteIds =
            new Set(
              list.map(
                inv => inv.id
              )
            );


          if (
            newInvites.length > 0
          ) {

            const newest =
              newInvites
                .sort(
                  (a, b) =>
                    (b.at || 0) -
                    (a.at || 0)
                )[0];


            showInvite(
              newest
            );

          }

        }
      );

    }
  );

}
