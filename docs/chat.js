import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://yxrfarlhcyaaslwmdyww.supabase.co";
const SUPABASE_KEY = "sb_publishable_XPhr82oODoaWs_uYrWiXGg_Y1ypkJmC";
const TABLE = "cgv_chat_messages";
const MAX_MESSAGES = 50;
const SEND_COOLDOWN_MS = 2000;
const FALLBACK_SYNC_MS = 60000;
const PRESENCE_CHANNEL = "cgv-imax-live-chat";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const clientId = globalThis.crypto?.randomUUID?.() || `client-${Date.now()}-${Math.random()}`;
const messageStore = new Map();

let realtimeChannel = null;
let presenceNickname = "";
let syncPromise = null;

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

function getSavedNickname() {
  return normalizeNickname(localStorage.getItem("cgv-chat-nickname"));
}

function setConnectionStatus(text, connected = false) {
  const status = document.getElementById("imax-chat-status");
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("connected", connected);
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
        <div class="imax-chat-note">최근 50개 메시지 · 전송 간격 2초 · 접속자는 닉네임 기준</div>
      </div>

      <aside id="imax-chat-presence" class="imax-chat-presence" aria-label="현재 접속자">
        <button
          id="imax-chat-presence-toggle"
          class="imax-chat-presence-toggle"
          type="button"
          aria-expanded="false"
          title="접속자 수는 최근 사용한 닉네임 기준으로 표시됩니다."
        >
          <span class="imax-chat-presence-title">
            <span class="imax-chat-online-dot"></span>
            접속 중 <strong id="imax-chat-presence-count">0</strong>명
          </span>
          <span class="imax-chat-presence-chevron" aria-hidden="true">›</span>
        </button>
        <div id="imax-chat-presence-list" class="imax-chat-presence-list">
          <div class="imax-chat-presence-empty">최근 사용한 닉네임 기준으로 표시됩니다.</div>
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

  const savedName = getSavedNickname();
  presenceNickname = savedName;
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

function orderedMessages() {
  return [...messageStore.values()]
    .sort((a, b) => {
      const timeDiff = (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0);
      if (timeDiff !== 0) return timeDiff;
      return String(a.id ?? "").localeCompare(String(b.id ?? ""), undefined, { numeric: true });
    })
    .slice(-MAX_MESSAGES);
}

function renderMessages(forceBottom = false) {
  const list = document.getElementById("imax-chat-list");
  if (!list) return;

  const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
  const stickToBottom = forceBottom || distanceFromBottom < 60;
  const rows = orderedMessages();

  list.innerHTML = "";

  if (!rows.length) {
    list.innerHTML = '<div class="imax-chat-empty">첫 메시지를 남겨보세요.</div>';
    return;
  }

  rows.forEach((row) => list.appendChild(createMessageNode(row)));

  if (stickToBottom) {
    list.scrollTop = list.scrollHeight;
  } else {
    list.scrollTop = Math.max(
      0,
      list.scrollHeight - list.clientHeight - Math.max(0, distanceFromBottom),
    );
  }
}

function mergeMessages(rows, forceBottom = false) {
  for (const row of rows || []) {
    if (row?.id === undefined || row?.id === null) continue;
    messageStore.set(String(row.id), row);
  }

  const keepIds = new Set(orderedMessages().map((row) => String(row.id)));
  for (const id of messageStore.keys()) {
    if (!keepIds.has(id)) messageStore.delete(id);
  }

  renderMessages(forceBottom);
}

async function loadMessages(forceBottom = false) {
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const { data, error } = await supabase
      .from(TABLE)
      .select("id,nickname,message,created_at")
      .order("created_at", { ascending: false })
      .limit(MAX_MESSAGES);

    if (error) {
      console.error("Chat sync failed", error);
      if (!messageStore.size) {
        const list = document.getElementById("imax-chat-list");
        if (list) {
          list.innerHTML = '<div class="imax-chat-empty">채팅을 불러오지 못했습니다.</div>';
        }
      }
      return;
    }

    mergeMessages(data || [], forceBottom);
  })();

  try {
    await syncPromise;
  } finally {
    syncPromise = null;
  }
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
    if (!users.has(key)) users.set(key, nickname);
  });

  const nicknames = [...users.values()].sort((a, b) => a.localeCompare(b, "ko-KR"));
  count.textContent = String(nicknames.length);
  list.innerHTML = "";

  if (!nicknames.length) {
    const empty = document.createElement("div");
    empty.className = "imax-chat-presence-empty";
    empty.textContent = "현재 표시할 접속자가 없습니다.";
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
      nickname.toLocaleLowerCase("ko-KR") === presenceNickname.toLocaleLowerCase("ko-KR")
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

  if (!realtimeChannel || !nickname) return;

  try {
    await realtimeChannel.track({
      client_id: clientId,
      nickname,
      online_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Presence update failed", error);
  }
}

async function untrackPresence() {
  if (!realtimeChannel) return;
  try {
    await realtimeChannel.untrack();
  } catch (error) {
    console.debug("Presence untrack skipped", error);
  }
}

function subscribeRealtime() {
  realtimeChannel = supabase
    .channel(PRESENCE_CHANNEL, {
      config: {
        presence: { key: clientId },
      },
    })
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: TABLE },
      (payload) => mergeMessages([payload.new], true),
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
    .subscribe((state) => {
      if (state === "SUBSCRIBED") {
        setConnectionStatus("실시간 연결", true);

        const savedName = getSavedNickname();
        if (savedName) void updatePresence(savedName);

        // 연결/재연결 직후 DB와 다시 맞춰 Realtime 누락 구간을 복구한다.
        void loadMessages(false);
      } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
        setConnectionStatus("연결 재시도 중", false);
      } else if (state === "CLOSED") {
        setConnectionStatus("연결 끊김", false);
      }
    });
}

function bindPresenceControls() {
  const panel = document.getElementById("imax-chat-presence");
  const toggle = document.getElementById("imax-chat-presence-toggle");

  toggle?.addEventListener("click", () => {
    if (!panel) return;
    const isOpen = panel.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
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
    presenceNickname = nickname;

    // Presence 응답을 기다리지 않고 메시지 전송부터 진행한다.
    void updatePresence(nickname);

    const { data, error } = await supabase
      .from(TABLE)
      .insert({ nickname, message })
      .select("id,nickname,message,created_at")
      .single();

    if (error) {
      console.error("Chat send failed", error);
      alert("메시지 전송에 실패했습니다. 잠시 후 다시 시도해주세요.");
      nextAllowedAt = 0;
    } else {
      // Realtime 이벤트를 기다리지 않고 DB 저장 결과를 즉시 화면에 반영한다.
      mergeMessages([data], true);
      if (messageInput) {
        messageInput.value = "";
        messageInput.focus();
      }
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

function bindConnectionRecovery() {
  window.addEventListener("online", () => {
    setConnectionStatus("연결 확인 중", false);
    void loadMessages(false);
    const savedName = getSavedNickname();
    if (savedName) void updatePresence(savedName);
  });

  window.addEventListener("offline", () => {
    setConnectionStatus("오프라인", false);
  });

  window.addEventListener("pagehide", () => {
    void untrackPresence();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    void loadMessages(false);
    const savedName = getSavedNickname();
    if (savedName) void updatePresence(savedName);
  });

  window.setInterval(() => {
    if (!document.hidden && navigator.onLine) {
      void loadMessages(false);
    }
  }, FALLBACK_SYNC_MS);
}

async function initChat() {
  buildChat();
  bindForm();
  bindPresenceControls();
  bindConnectionRecovery();

  // Realtime 구독을 먼저 시작하고, 초기 DB 조회 및 재구독 시 다시 동기화한다.
  subscribeRealtime();
  await loadMessages(true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChat, { once: true });
} else {
  initChat();
}
