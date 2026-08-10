import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://yxrfarlhcyaaslwmdyww.supabase.co";
const SUPABASE_KEY = "sb_publishable_XPhr82oODoaWs_uYrWiXGg_Y1ypkJmC";
const TABLE = "cgv_chat_messages";
const MAX_MESSAGES = 50;
const SEND_COOLDOWN_MS = 5000;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function buildChat() {
  if (document.getElementById("imax-live-chat")) return;

  const section = document.createElement("section");
  section.id = "imax-live-chat";
  section.className = "imax-live-chat";
  section.innerHTML = `
    <div class="imax-chat-head">
      <div>
        <h2>💬 IMAX 실시간 채팅</h2>
        <p>예매 오픈 정보와 현황을 실시간으로 공유하세요.</p>
      </div>
      <span id="imax-chat-status" class="imax-chat-status">연결 중</span>
    </div>

    <div id="imax-chat-list" class="imax-chat-list" aria-live="polite">
      <div class="imax-chat-empty">채팅을 불러오는 중입니다.</div>
    </div>

    <form id="imax-chat-form" class="imax-chat-form">
      <input
        id="imax-chat-name"
        class="imax-chat-name"
        type="text"
        maxlength="20"
        autocomplete="nickname"
        placeholder="닉네임"
        required
      >
      <input
        id="imax-chat-message"
        class="imax-chat-message"
        type="text"
        maxlength="300"
        autocomplete="off"
        placeholder="메시지를 입력하세요..."
        required
      >
      <button id="imax-chat-send" class="imax-chat-send" type="submit">전송</button>
    </form>
    <div class="imax-chat-note">최근 50개 메시지 · 전송 간격 5초</div>
  `;

  const footer = document.querySelector("footer");
  if (footer?.parentElement) {
    footer.parentElement.insertBefore(section, footer);
  } else {
    document.querySelector("main")?.appendChild(section);
  }

  const savedName = localStorage.getItem("cgv-chat-nickname");
  if (savedName) {
    document.getElementById("imax-chat-name").value = savedName;
  }
}

function createMessageNode(row) {
  const item = document.createElement("div");
  item.className = "imax-chat-item";
  item.dataset.id = String(row.id ?? "");

  const meta = document.createElement("div");
  meta.className = "imax-chat-meta";

  const name = document.createElement("strong");
  name.textContent = String(row.nickname ?? "익명");

  const time = document.createElement("span");
  time.textContent = formatTime(row.created_at);

  meta.append(name, time);

  const message = document.createElement("div");
  message.className = "imax-chat-text";
  message.textContent = String(row.message ?? "");

  item.append(meta, message);
  return item;
}

function appendMessage(row, scroll = true) {
  const list = document.getElementById("imax-chat-list");
  if (!list) return;

  if (row.id && list.querySelector(`[data-id="${row.id}"]`)) return;

  list.querySelector(".imax-chat-empty")?.remove();
  list.appendChild(createMessageNode(row));

  while (list.children.length > MAX_MESSAGES) {
    list.removeChild(list.firstElementChild);
  }

  if (scroll) {
    list.scrollTop = list.scrollHeight;
  }
}

async function loadMessages() {
  const list = document.getElementById("imax-chat-list");
  const status = document.getElementById("imax-chat-status");

  const { data, error } = await supabase
    .from(TABLE)
    .select("id,nickname,message,created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGES);

  if (error) {
    console.error("Chat load failed", error);
    if (list) list.innerHTML = '<div class="imax-chat-empty">채팅을 불러오지 못했습니다.</div>';
    if (status) status.textContent = "연결 오류";
    return;
  }

  if (list) list.innerHTML = "";
  [...(data || [])].reverse().forEach((row) => appendMessage(row, false));

  if (!data?.length && list) {
    list.innerHTML = '<div class="imax-chat-empty">첫 메시지를 남겨보세요.</div>';
  }

  if (list) list.scrollTop = list.scrollHeight;
}

function subscribeRealtime() {
  const status = document.getElementById("imax-chat-status");

  supabase
    .channel("cgv-imax-live-chat")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: TABLE },
      (payload) => appendMessage(payload.new),
    )
    .subscribe((state) => {
      if (!status) return;
      if (state === "SUBSCRIBED") {
        status.textContent = "실시간 연결";
        status.classList.add("connected");
      } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
        status.textContent = "연결 재시도 중";
        status.classList.remove("connected");
      }
    });
}

function bindForm() {
  const form = document.getElementById("imax-chat-form");
  const nameInput = document.getElementById("imax-chat-name");
  const messageInput = document.getElementById("imax-chat-message");
  const sendButton = document.getElementById("imax-chat-send");
  let nextAllowedAt = 0;

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nickname = nameInput?.value.trim() || "";
    const message = messageInput?.value.trim() || "";

    if (!nickname || !message) return;
    if (Date.now() < nextAllowedAt) return;

    nextAllowedAt = Date.now() + SEND_COOLDOWN_MS;
    if (sendButton) {
      sendButton.disabled = true;
      sendButton.textContent = "전송 중";
    }

    localStorage.setItem("cgv-chat-nickname", nickname);

    const { error } = await supabase
      .from(TABLE)
      .insert({ nickname, message });

    if (error) {
      console.error("Chat send failed", error);
      alert("메시지 전송에 실패했습니다.");
      nextAllowedAt = 0;
    } else if (messageInput) {
      messageInput.value = "";
      messageInput.focus();
    }

    const remaining = Math.max(0, nextAllowedAt - Date.now());
    window.setTimeout(() => {
      if (sendButton) {
        sendButton.disabled = false;
        sendButton.textContent = "전송";
      }
    }, remaining);
  });
}

async function initChat() {
  buildChat();
  bindForm();
  await loadMessages();
  subscribeRealtime();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChat, { once: true });
} else {
  initChat();
}
