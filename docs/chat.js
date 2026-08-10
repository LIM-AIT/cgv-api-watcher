import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://yxrfarlhcyaaslwmdyww.supabase.co";
const SUPABASE_KEY = "sb_publishable_XPhr82oODoaWs_uYrWiXGg_Y1ypkJmC";
const TABLE = "cgv_chat_messages";
const MAX_MESSAGES = 50;
const SEND_COOLDOWN_MS = 5000;
const PRESENCE_CHANNEL = "cgv-imax-live-chat";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const clientId = globalThis.crypto?.randomUUID?.() || `client-${Date.now()}-${Math.random()}`;

let realtimeChannel = null;
let presenceNickname = "";
let presenceInputTimer = null;

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function normalizeNickname(value) {
  return String(value || "").trim().slice(0, 20);
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

    <div class="imax-chat-body">
      <div class="imax-chat-main">
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
      </div>

      <aside id="imax-chat-presence" class="imax-chat-presence" aria-label="현재 접속자">
        <button
          id="imax-chat-presence-toggle"
          class="imax-chat-presence-toggle"
          type="button"
          aria-expanded="false"
        >
          <span class="imax-chat-presence-title">
            <span class="imax-chat-online-dot"></span>
            접속 중 <strong id="imax-chat-presence-count">0</strong>명
          </span>
          <span class="imax-chat-presence-chevron" aria-hidden="true">›</span>
        </button>
        <div id="imax-chat-presence-list" class="imax-chat-presence-list">
          <div class="imax-chat-presence-empty">닉네임을 입력하면 접속자 목록에 표시됩니다.</div>
        </div>
      </aside>
    </div>
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

function renderPresence(state) {
  const list = document.getElementById("imax-chat-presence-list");
  const count = document.getElementById("imax-chat-presence-count");
  if (!list || !count) return;

  const users = new Map();

  Object.values(state || {}).flat().forEach((meta) => {
    const nickname = normalizeNickname(meta?.nickname);
    if (!nickname) return;

    const key = nickname.toLocaleLowerCase("ko-KR");
    if (!users.has(key)) {
      users.set(key, nickname);
    }
  });

  const nicknames = [...users.values()].sort((a, b) =>
    a.localeCompare(b, "ko-KR"),
  );

  count.textContent = String(nicknames.length);
  list.innerHTML = "";

  if (!nicknames.length) {
    const empty = document.createElement("div");
    empty.className = "imax-chat-presence-empty";
    empty.textContent = "닉네임을 입력하면 접속자 목록에 표시됩니다.";
    list.appendChild(empty);
    return;
  }

  nicknames.forEach((nickname) => {
    const item = document.createElement("div");
    item.className = "imax-chat-presence-user";

    const dot = document.createElement("span");
    dot.className = "imax-chat-online-dot";

    const name = document.createElement("span");
    name.className = "imax-chat-presence-name";
    name.textContent = nickname;

    item.append(dot, name);

    if (
      presenceNickname &&
      nickname.toLocaleLowerCase("ko-KR") ===
        presenceNickname.toLocaleLowerCase("ko-KR")
    ) {
      const me = document.createElement("span");
      me.className = "imax-chat-presence-me";
      me.textContent = "나";
      item.appendChild(me);
    }

    list.appendChild(item);
  });
}

async function updatePresence(rawNickname) {
  const nickname = normalizeNickname(rawNickname);
  presenceNickname = nickname;

  if (!realtimeChannel) return;

  try {
    if (!nickname) {
      await realtimeChannel.untrack();
      return;
    }

    await realtimeChannel.track({
      client_id: clientId,
      nickname,
      online_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Presence update failed", error);
  }
}

function subscribeRealtime() {
  const status = document.getElementById("imax-chat-status");
  const nameInput = document.getElementById("imax-chat-name");

  realtimeChannel = supabase
    .channel(PRESENCE_CHANNEL, {
      config: {
        presence: { key: clientId },
      },
    })
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: TABLE },
      (payload) => appendMessage(payload.new),
    )
    .on("presence", { event: "sync" }, () => {
      renderPresence(realtimeChannel.presenceState());
    })
    .on("presence", { event: "join" }, () => {
      renderPresence(realtimeChannel.presenceState());
    })
    .on("presence", { event: "leave" }, () => {
      renderPresence(realtimeChannel.presenceState());
    })
    .subscribe(async (state) => {
      if (state === "SUBSCRIBED") {
        if (status) {
          status.textContent = "실시간 연결";
          status.classList.add("connected");
        }
        await updatePresence(nameInput?.value);
      } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
        if (status) {
          status.textContent = "연결 재시도 중";
          status.classList.remove("connected");
        }
      }
    });
}

function bindPresenceControls() {
  const panel = document.getElementById("imax-chat-presence");
  const toggle = document.getElementById("imax-chat-presence-toggle");
  const nameInput = document.getElementById("imax-chat-name");

  toggle?.addEventListener("click", () => {
    if (!panel) return;
    const isOpen = panel.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nameInput?.addEventListener("input", () => {
    clearTimeout(presenceInputTimer);
    presenceInputTimer = window.setTimeout(() => {
      const nickname = normalizeNickname(nameInput.value);
      if (nickname) {
        localStorage.setItem("cgv-chat-nickname", nickname);
      }
      updatePresence(nickname);
    }, 500);
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

    const nickname = normalizeNickname(nameInput?.value);
    const message = messageInput?.value.trim() || "";

    if (!nickname || !message) return;
    if (Date.now() < nextAllowedAt) return;

    nextAllowedAt = Date.now() + SEND_COOLDOWN_MS;
    if (sendButton) {
      sendButton.disabled = true;
      sendButton.textContent = "전송 중";
    }

    localStorage.setItem("cgv-chat-nickname", nickname);
    await updatePresence(nickname);

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
  bindPresenceControls();
  await loadMessages();
  subscribeRealtime();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChat, { once: true });
} else {
  initChat();
}
