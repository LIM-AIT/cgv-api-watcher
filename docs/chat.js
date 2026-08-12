import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://yxrfarlhcyaaslwmdyww.supabase.co";
const SUPABASE_KEY = "sb_publishable_XPhr82oODoaWs_uYrWiXGg_Y1ypkJmC";
const TABLE = "cgv_chat_messages";
const MAX_MESSAGES = 50;
const SEND_COOLDOWN_MS = 2000;
const FALLBACK_SYNC_MS = 60000;
const PRESENCE_CHANNEL = "cgv-imax-live-chat";
const ADMIN_CONFIG_RPC = "is_cgv_chat_admin_configured";
const ADMIN_VERIFY_RPC = "verify_cgv_chat_admin";
const ADMIN_DELETE_RPC = "delete_cgv_chat_message";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const clientId = globalThis.crypto?.randomUUID?.() || `client-${Date.now()}-${Math.random()}`;
const messageStore = new Map();

let realtimeChannel = null;
let presenceNickname = "";
let syncPromise = null;
let isAdminMode = false;
let adminPassword = "";
let adminBusy = false;

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
        <h2>💬 꿀좌석 선점을 위한 실시간 채팅</h2>
        <p>예매 오픈 정보와 현황을 실시간으로 공유하세요.</p>
      </div>
      <div class="imax-chat-head-actions">
        <span id="imax-chat-status" class="imax-chat-status">연결 중</span>
        <button
          id="imax-chat-admin-button"
          class="imax-chat-admin-button"
          type="button"
          title="관리자 모드"
        >관리자</button>
      </div>
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

  if (isAdminMode) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "imax-chat-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.title = "이 메시지 삭제";
    deleteButton.setAttribute("aria-label", `${String(row.nickname ?? "익명")} 메시지 삭제`);
    deleteButton.addEventListener("click", () => {
      void deleteChatMessage(row, deleteButton);
    });
    meta.appendChild(deleteButton);
  }

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

function reconcileMessages(rows, forceBottom = false) {
  const fetched = Array.isArray(rows) ? rows : [];
  const fetchedIds = new Set(
    fetched
      .filter((row) => row?.id !== undefined && row?.id !== null)
      .map((row) => String(row.id)),
  );

  const newestFetchedAt = fetched.length
    ? Math.max(...fetched.map((row) => Date.parse(row.created_at) || 0))
    : Number.POSITIVE_INFINITY;

  for (const [id, row] of messageStore.entries()) {
    const rowTime = Date.parse(row?.created_at) || 0;
    if (!fetchedIds.has(id) && rowTime <= newestFetchedAt) {
      messageStore.delete(id);
    }
  }

  mergeMessages(fetched, forceBottom);
}

function removeMessage(messageId) {
  if (messageId === undefined || messageId === null) return;
  const deleted = messageStore.delete(String(messageId));
  if (deleted) renderMessages(false);
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

    reconcileMessages(data || [], forceBottom);
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
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: TABLE },
      (payload) => removeMessage(payload.old?.id),
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

        void loadMessages(false);
      } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
        setConnectionStatus("연결 재시도 중", false);
      } else if (state === "CLOSED") {
        setConnectionStatus("연결 끊김", false);
      }
    });
}

function updateAdminUi() {
  const section = document.getElementById("imax-live-chat");
  const button = document.getElementById("imax-chat-admin-button");

  section?.classList.toggle("admin-active", isAdminMode);
  if (button) {
    button.classList.toggle("active", isAdminMode);
    button.textContent = isAdminMode ? "관리자 종료" : "관리자";
    button.disabled = adminBusy;
  }

  renderMessages(false);
}

function exitAdminMode() {
  adminPassword = "";
  isAdminMode = false;
  adminBusy = false;
  updateAdminUi();
}

async function enterAdminMode() {
  if (adminBusy) return;
  adminBusy = true;
  updateAdminUi();

  try {
    const { data: configured, error: configError } = await supabase.rpc(ADMIN_CONFIG_RPC);

    if (configError) {
      console.error("Admin config check failed", configError);
      alert("관리자 설정 상태를 확인하지 못했습니다.");
      return;
    }

    if (configured !== true) {
      alert("관리자 비밀번호가 아직 설정되지 않았습니다.");
      return;
    }

    const password = window.prompt("채팅 관리자 비밀번호를 입력하세요.");
    if (!password) return;

    const { data: verified, error } = await supabase.rpc(ADMIN_VERIFY_RPC, {
      p_admin_password: password,
    });

    if (error) {
      console.error("Admin verification failed", error);
      alert("관리자 인증 중 오류가 발생했습니다.");
      return;
    }

    if (verified !== true) {
      alert("관리자 비밀번호가 올바르지 않습니다.");
      return;
    }

    adminPassword = password;
    isAdminMode = true;
  } finally {
    adminBusy = false;
    updateAdminUi();
  }
}

async function deleteChatMessage(row, button) {
  if (!isAdminMode || !adminPassword || adminBusy) return;

  const nickname = String(row.nickname ?? "익명");
  const preview = String(row.message ?? "").slice(0, 80);
  const confirmed = window.confirm(
    `[${nickname}] ${preview}${String(row.message ?? "").length > 80 ? "…" : ""}\n\n이 채팅 기록을 삭제할까요?`,
  );

  if (!confirmed) return;

  adminBusy = true;
  if (button) {
    button.disabled = true;
    button.textContent = "삭제 중";
  }

  try {
    const { data: deleted, error } = await supabase.rpc(ADMIN_DELETE_RPC, {
      p_message_id: row.id,
      p_admin_password: adminPassword,
    });

    if (error) {
      console.error("Admin delete failed", error);
      alert("채팅 삭제에 실패했습니다.");
      return;
    }

    if (deleted !== true) {
      alert("이미 삭제된 메시지이거나 관리자 권한을 다시 확인해야 합니다.");
      return;
    }

    removeMessage(row.id);
    void loadMessages(false);
  } finally {
    adminBusy = false;
    updateAdminUi();
  }
}

function bindAdminControls() {
  const button = document.getElementById("imax-chat-admin-button");
  button?.addEventListener("click", () => {
    if (isAdminMode) {
      exitAdminMode();
      return;
    }

    void enterAdminMode();
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
    adminPassword = "";
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
  bindAdminControls();
  bindPresenceControls();
  bindConnectionRecovery();

  subscribeRealtime();
  await loadMessages(true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChat, { once: true });
} else {
  initChat();
}
