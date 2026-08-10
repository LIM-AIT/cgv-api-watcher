import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://yxrfarlhcyaaslwmdyww.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_XPhr82oODoaWs_uYrWiXGg_Y1ypkJmC";
const TABLE = "cgv_email_subscriptions";
const STORAGE_KEY = "cgv-imax-email-alert-v1";
const MAX_EMAIL_LENGTH = 180;

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function encryptSubscriptionPayload(email, token) {
  const response = await fetch(`./alert-public-key.jwk?v=1&t=${Date.now()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("알림 암호화 키를 불러오지 못했습니다.");
  }

  const jwk = await response.json();
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );

  const plaintext = new TextEncoder().encode(
    JSON.stringify({ e: email, t: token }),
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    plaintext,
  );

  return bytesToBase64(new Uint8Array(encrypted));
}

function readSavedSubscription() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSubscription(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function clearSavedSubscription(id) {
  const saved = readSavedSubscription();
  if (!id || saved?.id === id) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function setAlertStatus(message, type = "info") {
  const status = document.getElementById("imax-email-alert-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.type = type;
}

function buildAlertPanel() {
  if (document.getElementById("imax-email-alert")) return;

  const section = document.createElement("section");
  section.id = "imax-email-alert";
  section.className = "imax-email-alert";
  section.innerHTML = `
    <div class="imax-email-alert-copy">
      <div class="imax-email-alert-kicker">EMAIL ALERT</div>
      <h2>🔔 IMAX 오픈 메일 알림</h2>
      <p>
        이메일을 등록하면 감시 중인 IMAX 예매가 열렸을 때 알림을 보내드립니다.
        등록 완료를 위해 확인 메일의 링크를 한 번 눌러주세요.
      </p>
    </div>

    <form id="imax-email-alert-form" class="imax-email-alert-form">
      <label class="sr-only" for="imax-email-alert-input">이메일 주소</label>
      <input
        id="imax-email-alert-input"
        class="imax-email-alert-input"
        type="email"
        inputmode="email"
        autocomplete="email"
        maxlength="${MAX_EMAIL_LENGTH}"
        placeholder="email@example.com"
        required
      >
      <button id="imax-email-alert-button" class="imax-email-alert-button" type="submit">
        알림 등록
      </button>
    </form>

    <label class="imax-email-alert-consent">
      <input id="imax-email-alert-consent" type="checkbox" required>
      <span>IMAX 예매 오픈 이메일 알림 수신에 동의합니다.</span>
    </label>

    <div id="imax-email-alert-status" class="imax-email-alert-status" data-type="info">
      이메일 주소는 브라우저에서 암호화한 뒤 저장되며, 확인 전에는 오픈 알림이 발송되지 않습니다.
    </div>
  `;

  const summary = document.getElementById("summary");
  if (summary?.parentElement) {
    summary.insertAdjacentElement("afterend", section);
  } else {
    document.querySelector("main.app")?.prepend(section);
  }

  const saved = readSavedSubscription();
  if (saved?.id && saved?.token) {
    setAlertStatus(
      saved.verified
        ? "이 브라우저에서 이메일 알림이 등록되어 있습니다."
        : "등록 요청이 있습니다. 확인 메일의 링크를 눌러 등록을 완료해주세요.",
      saved.verified ? "success" : "pending",
    );
  }
}

async function registerAlert(event) {
  event.preventDefault();

  const input = document.getElementById("imax-email-alert-input");
  const consent = document.getElementById("imax-email-alert-consent");
  const button = document.getElementById("imax-email-alert-button");

  if (!input || !consent || !button) return;
  if (!input.reportValidity() || !consent.reportValidity()) return;

  const email = normalizeEmail(input.value);
  if (!email || email.length > MAX_EMAIL_LENGTH) {
    setAlertStatus("올바른 이메일 주소를 입력해주세요.", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "등록 중...";
  setAlertStatus("이메일 주소를 암호화해 등록하고 있습니다.", "pending");

  try {
    const id = crypto.randomUUID();
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const ciphertext = await encryptSubscriptionPayload(email, token);

    const { error } = await supabase.from(TABLE).insert({
      id,
      email_ciphertext: ciphertext,
      token_hash: tokenHash,
      active: true,
      verified: false,
    });

    if (error) throw error;

    saveSubscription({
      id,
      token,
      verified: false,
      registeredAt: new Date().toISOString(),
    });

    input.value = "";
    consent.checked = false;
    setAlertStatus(
      "등록 요청 완료 · 확인 메일은 최대 약 3분 내 도착합니다. 메일의 확인 링크를 눌러주세요.",
      "success",
    );
  } catch (error) {
    console.error("Email alert registration failed", error);
    setAlertStatus(
      "등록 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      "error",
    );
  } finally {
    button.disabled = false;
    button.textContent = "알림 등록";
  }
}

function parseActionValue(value) {
  const dotIndex = String(value || "").indexOf(".");
  if (dotIndex <= 0) return null;
  const id = value.slice(0, dotIndex);
  const token = value.slice(dotIndex + 1);
  return id && token ? { id, token } : null;
}

function removeActionParams() {
  const url = new URL(location.href);
  url.searchParams.delete("email_verify");
  url.searchParams.delete("email_unsubscribe");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

async function handleEmailActions() {
  const params = new URLSearchParams(location.search);
  const verify = parseActionValue(params.get("email_verify"));
  const unsubscribe = parseActionValue(params.get("email_unsubscribe"));

  if (verify) {
    setAlertStatus("이메일 알림 등록을 확인하고 있습니다.", "pending");
    const { data, error } = await supabase.rpc(
      "confirm_cgv_email_subscription",
      { p_id: verify.id, p_token: verify.token },
    );

    if (!error && data === true) {
      const saved = readSavedSubscription();
      if (saved?.id === verify.id) {
        saveSubscription({ ...saved, verified: true });
      }
      setAlertStatus(
        "이메일 알림 등록이 완료되었습니다. IMAX 오픈 시 메일로 알려드릴게요.",
        "success",
      );
    } else {
      setAlertStatus(
        "확인 링크가 유효하지 않거나 이미 처리된 요청입니다.",
        "error",
      );
    }
    removeActionParams();
    return;
  }

  if (unsubscribe) {
    setAlertStatus("이메일 알림을 해지하고 있습니다.", "pending");
    const { data, error } = await supabase.rpc(
      "unsubscribe_cgv_email_subscription",
      { p_id: unsubscribe.id, p_token: unsubscribe.token },
    );

    if (!error && data === true) {
      clearSavedSubscription(unsubscribe.id);
      setAlertStatus("이메일 알림이 해지되었습니다.", "success");
    } else {
      setAlertStatus(
        "해지 링크가 유효하지 않거나 이미 해지된 알림입니다.",
        "error",
      );
    }
    removeActionParams();
  }
}

function init() {
  buildAlertPanel();
  document
    .getElementById("imax-email-alert-form")
    ?.addEventListener("submit", registerAlert);
  handleEmailActions().catch((error) => {
    console.error("Email alert action failed", error);
    setAlertStatus("이메일 알림 요청을 처리하지 못했습니다.", "error");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
