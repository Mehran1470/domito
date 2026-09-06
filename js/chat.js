import { sendChatMessage, listenChat } from "./app.js";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

export function mountChat(myName, roomCode) {
  const btn = document.createElement("button");
  btn.className = "chat-toggle";
  btn.textContent = "💬";
  document.body.appendChild(btn);

  const panel = document.createElement("div");
  panel.className = "chat-panel";
  panel.innerHTML = `
    <div class="chat-header">چت اتاق ${roomCode}</div>
    <div class="chat-messages"></div>
    <form class="chat-form">
      <input type="text" maxlength="200" placeholder="پیام بنویس..." />
      <button type="submit">ارسال</button>
    </form>
  `;
  document.body.appendChild(panel);

  btn.addEventListener("click", () => panel.classList.toggle("open"));

  const messagesEl = panel.querySelector(".chat-messages");
  listenChat(roomCode, (list) => {
    messagesEl.innerHTML = list.map((m) => `
      <div class="chat-msg${m.name === myName ? " me" : ""}">
        <span class="chat-name">${escapeHtml(m.name)}</span>
        <span class="chat-text">${escapeHtml(m.text)}</span>
      </div>
    `).join("");
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  const form = panel.querySelector(".chat-form");
  const input = panel.querySelector("input");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await sendChatMessage(roomCode, myName, text);
  });
}
