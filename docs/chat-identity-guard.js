import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://yxrfarlhcyaaslwmdyww.supabase.co";
const SUPABASE_KEY = "sb_publishable_XPhr82oODoaWs_uYrWiXGg_Y1ypkJmC";
const ADMIN_SEND_RPC = "send_cgv_chat_admin_message";
const NICKNAME_KEY = "cgv-chat-nickname";
const ADMIN_NICKNAME = "관리자";
const RESERVED_NICKNAMES = new Set(["관리자", "임우상", "우상"]);
const SEND_COOLDOWN_MS = 2000;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const originalPrompt = window.prompt.bind(window);

let capturedAdminPassword = "";
let normalNickname = "";
let adminActive = false;
let adminNextAllowedAt = 0;

function normalizeNickname(value) {
  return String(value || "").trim().slice(0, 20);
}

function nicknameKey(value) {
  return normalizeNickname(value)
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ko-KR");
}

function isReservedNickname(value) {
  return RESERVED_NICKNAMES.has(nicknameKey(value));
}

function getNameInput() {
  return document.getElementById("imax-chat-name");
}

function getMessageInput() {
  return document.getElementById("imax-chat-message");
}

function getSendButton() {
  return document.getElementById("imax-chat-send");
}

function isCurrentAdminMode() {
  return document.getElementById("imax-live-chat")?.classList.contains("admin-active") === true;
}

function dispatchChatRefresh() {
  document.dispatchEvent(new Event("visibilitychange"));
}

function sanitizeSavedNickname() {
  const saved = normalizeNickname(localStorage.getItem(NICKNAME_KEY));
  if (!saved) return "";

  if (isReservedNickname(saved)) {
    localStorage.removeItem(NICKNAME_KEY);
    return "";
  }

  return saved;
}

function saveNormalNickname(value) {
  const nickname = normalizeNickname(value);
  if (!nickname || isReservedNickname(nickname)) return;

  normalNickname = nickname;
  localStorage.setItem(NICKNAME_KEY, nickname);
}

function applyAdminNickname() {
  const input = getNameInput();

  const current = normalizeNickname(input?.value);
  const saved = sanitizeSavedNickname();

  if (current && !isReservedNickname(current)) {
    normalNickname = current;
  } else if (saved) {
    normalNickname = saved;
  }

  if (normalNickname) {
    localStorage.setItem(NICKNAME_KEY, normalNickname);
  }

  if (input) {
    input.value = ADMIN_NICKNAME;
    input.readOnly = true;
    input.setAttribute("aria-readonly", "true");
    input.title = "관리자 모드에서는 닉네임이 관리자로 고정됩니다.";
  }

  localStorage.setItem(NICKNAME_KEY, ADMIN_NICKNAME);
  dispatchChatRefresh();
}

function restoreNormalNickname() {
  const input = getNameInput();
  const restored = normalNickname && !isReservedNickname(normalNickname)
    ? normalNickname
    : sanitizeSavedNickname();

  if (restored) {
    localStorage.setItem(NICKNAME_KEY, restored);
  } else {
    localStorage.removeItem(NICKNAME_KEY);
  }

  if (input) {
    input.readOnly = false;
    input.removeAttribute("aria-readonly");
    input.removeAttribute("title");
    input.value = restored || "";
  }

  dispatchChatRefresh();
}

function syncAdminState() {
  const nextAdminActive = isCurrentAdminMode();
  if (nextAdminActive === adminActive) return;

  adminActive = nextAdminActive;

  if (adminActive) {
    applyAdminNickname();
  } else {
    capturedAdminPassword = "";
    restoreNormalNickname();
  }
}

window.prompt = function patchedPrompt(message, ...args) {
  const result = originalPrompt(message, ...args);

  if (String(message || "").includes("채팅 관리자 비밀번호")) {
    capturedAdminPassword = result || "";
  }

  return result;
};

function initializeNicknameGuard() {
  normalNickname = sanitizeSavedNickname();

  const input = getNameInput();
  if (input) {
    const current = normalizeNickname(input.value);
    if (isReservedNickname(current)) {
      input.value = normalNickname || "";
    } else if (current) {
      normalNickname = current;
    }
  }

  syncAdminState();

  const section = document.getElementById("imax-live-chat");
  if (section) {
    const observer = new MutationObserver(syncAdminState);
    observer.observe(section, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
}

async function sendAdminMessage(message) {
  const sendButton = getSendButton();

  if (!capturedAdminPassword) {
    alert("관리자 인증 정보를 확인할 수 없습니다. 관리자 모드를 종료한 뒤 다시 인증해주세요.");
    return;
  }

  if (Date.now() < adminNextAllowedAt) return;
  adminNextAllowedAt = Date.now() + SEND_COOLDOWN_MS;

  if (sendButton) {
    sendButton.disabled = true;
    sendButton.textContent = "전송 중";
  }

  try {
    const { data, error } = await supabase.rpc(ADMIN_SEND_RPC, {
      p_admin_password: capturedAdminPassword,
      p_message: message,
    });

    if (error) {
      console.error("Admin chat send failed", error);
      alert("관리자 메시지 전송에 실패했습니다.");
      adminNextAllowedAt = 0;
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      alert("관리자 인증이 만료되었거나 올바르지 않습니다. 관리자 모드를 다시 인증해주세요.");
      adminNextAllowedAt = 0;
      return;
    }

    const messageInput = getMessageInput();
    if (messageInput) {
      messageInput.value = "";
      messageInput.focus();
    }

    dispatchChatRefresh();
  } finally {
    const remaining = Math.max(0, adminNextAllowedAt - Date.now());
    window.setTimeout(() => {
      if (sendButton) {
        sendButton.disabled = false;
        sendButton.textContent = "전송";
      }
    }, remaining);
  }
}

document.addEventListener(
  "submit",
  (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== "imax-chat-form") return;

    const nameInput = getNameInput();
    const messageInput = getMessageInput();
    const nickname = normalizeNickname(nameInput?.value);
    const message = String(messageInput?.value || "").trim();

    if (isCurrentAdminMode()) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (!message) return;

      if (nameInput) {
        nameInput.value = ADMIN_NICKNAME;
        nameInput.readOnly = true;
      }

      void sendAdminMessage(message);
      return;
    }

    if (isReservedNickname(nickname)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert("이 닉네임은 사용할 수 없습니다.");
      nameInput?.focus();
      nameInput?.select();
      return;
    }

    saveNormalNickname(nickname);
  },
  true,
);

window.addEventListener("pagehide", () => {
  if (!adminActive) return;

  if (normalNickname && !isReservedNickname(normalNickname)) {
    localStorage.setItem(NICKNAME_KEY, normalNickname);
  } else {
    localStorage.removeItem(NICKNAME_KEY);
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeNicknameGuard, { once: true });
} else {
  initializeNicknameGuard();
}
