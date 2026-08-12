import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://yxrfarlhcyaaslwmdyww.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_XPhr82oODoaWs_uYrWiXGg_Y1ypkJmC";
const STORAGE_KEY = "cgv-imax-email-alert-v1";
const MOVIE_STORAGE_KEY = "cgv-watcher-selected-target-v1";
const MAX_EMAIL_LENGTH = 180;
const DEFAULT_TARGET = "odyssey_imax";

const TARGETS = {
  odyssey_imax: {
    label: "오디세이 · IMAX",
    format: "IMAX",
    title: "🔔 IMAX 오픈 메일 알림",
    description:
      "이메일을 등록하면 오디세이 IMAX 예매가 열렸을 때 알림을 보내드립니다.",
    consent: "오디세이 IMAX 예매 오픈 이메일 알림 수신에 동의합니다.",
  },
  spiderman_screenx: {
    label: "스파이더맨 · SCREENX",
    format: "SCREENX",
    title: "🔔 SCREENX 오픈 메일 알림",
    description:
      "이메일을 등록하면 스파이더맨 SCREENX 예매가 열렸을 때 알림을 보내드립니다.",
    consent: "스파이더맨 SCREENX 예매 오픈 이메일 알림 수신에 동의합니다.",
  },
};

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let currentTargetKey =
  window.CGV_WATCHER_TARGET ||
  localStorage.getItem(MOVIE_STORAGE_KEY) ||
  DEFAULT_TARGET;
let savedTargetStates = new Map();
let savedParentStatus = null;

function targetInfo() {
  return TARGETS[currentTargetKey] || TARGETS[DEFAULT_TARGET];
}

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
    savedTargetStates = new Map();
    savedParentStatus = null;
  }
}

function setAlertStatus(message, type = "info") {
  const status = document.getElementById("imax-email-alert-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.type = type;
}

function setPanelCopy() {
  const info = targetInfo();
  const panel = document.getElementById("imax-email-alert");
  if (!panel) return;
  const title = panel.querySelector(".imax-email-alert-copy h2");
  const description = panel.querySelector(".imax-email-alert-copy p");
  const consentText = panel.querySelector(".imax-email-alert-consent span");
  if (title) title.textContent = info.title;
  if (description) {
    description.textContent =
      `${info.description} 등록 완료를 위해 확인 메일의 링크를 한 번 눌러주세요.`;
  }
  if (consentText) consentText.textContent = info.consent;
}

function configureForm(mode) {
  const input = document.getElementById("imax-email-alert-input");
  const consent = document.getElementById("imax-email-alert-consent");
  const button = document.getElementById("imax-email-alert-button");
  if (!input || !consent || !button) return;

  input.required = mode === "new";
  input.disabled = mode !== "new";
  consent.disabled = mode === "subscribed" || mode === "pending";
  button.disabled = mode === "subscribed" || mode === "pending";

  if (mode === "new") {
    input.placeholder = "email@example.com";
    button.textContent = "알림 등록";
  } else if (mode === "add") {
    input.value = "";
    input.placeholder = "인증된 이메일로 추가";
    button.textContent = `${targetInfo().format} 알림 추가`;
  } else if (mode === "subscribed") {
    input.value = "";
    input.placeholder = "이 영화 알림 등록 완료";
    button.textContent = "등록 완료";
    consent.checked = false;
  } else if (mode === "pending") {
    input.value = "";
    input.placeholder = "이메일 인증 대기 중";
    button.textContent = "인증 대기";
    consent.checked = false;
  }
}

function refreshPanelState() {
  setPanelCopy();
  const saved = readSavedSubscription();
  if (!saved?.id || !saved?.token) {
    configureForm("new");
    setAlertStatus(
      "이메일 주소는 브라우저에서 암호화한 뒤 저장되며, 확인 전에는 오픈 알림이 발송되지 않습니다.",
      "info",
    );
    return;
  }

  if (savedParentStatus === "pending") {
    configureForm("pending");
    setAlertStatus(
      "등록 요청이 있습니다. 확인 메일의 링크를 눌러 등록을 완료해주세요.",
      "pending",
    );
    return;
  }

  if (savedParentStatus !== "verified") {
    configureForm("new");
    return;
  }

  if (savedTargetStates.get(currentTargetKey) === true) {
    configureForm("subscribed");
    setAlertStatus(`✅ ${targetInfo().label} 이메일 알림 등록 완료`, "success");
  } else {
    configureForm("add");
    setAlertStatus(
      `인증된 이메일로 ${targetInfo().label} 알림을 추가할 수 있습니다.`,
      "info",
    );
  }
}

function buildAlertPanel() {
  if (document.getElementById("imax-email-alert")) return;
  const section = document.createElement("section");
  section.id = "imax-email-alert";
  section.className = "imax-email-alert";
  section.innerHTML = `
    <div class="imax-email-alert-copy">
      <div class="imax-email-alert-kicker">EMAIL ALERT</div>
      <h2>${targetInfo().title}</h2>
      <p>${targetInfo().description} 등록 완료를 위해 확인 메일의 링크를 한 번 눌러주세요.</p>
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
      <span>${targetInfo().consent}</span>
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
}

async function getSubscriptionStatus(id, token) {
  const { data, error } = await supabase.rpc(
    "get_cgv_email_subscription_status",
    { p_id: id, p_token: token },
  );
  return error ? null : data;
}

async function getSubscriptionTargets(id, token) {
  const { data, error } = await supabase.rpc(
    "get_cgv_email_subscription_targets",
    { p_id: id, p_token: token },
  );
  if (error || !Array.isArray(data)) return new Map();
  return new Map(
    data.map((row) => [String(row.target_key || ""), Boolean(row.active)]),
  );
}

async function syncSavedSubscriptionStatus() {
  const saved = readSavedSubscription();
  if (!saved?.id || !saved?.token) {
    savedParentStatus = null;
    savedTargetStates = new Map();
    refreshPanelState();
    return;
  }

  const status = await getSubscriptionStatus(saved.id, saved.token);
  if (!status) return;
  savedParentStatus = status;

  if (status === "verified") {
    savedTargetStates = await getSubscriptionTargets(saved.id, saved.token);
    if (!saved.verified) {
      saveSubscription({ ...saved, verified: true });
    }
    refreshPanelState();
    return;
  }

  if (status === "pending") {
    refreshPanelState();
    return;
  }

  if (status === "inactive") {
    // Keep the valid token locally so the same owner can intentionally add a target again.
    savedTargetStates = await getSubscriptionTargets(saved.id, saved.token);
    if (saved.verified) {
      savedParentStatus = "verified";
      refreshPanelState();
      return;
    }
  }

  clearSavedSubscription(saved.id);
  refreshPanelState();
}

async function addCurrentTarget(saved) {
  const consent = document.getElementById("imax-email-alert-consent");
  if (!consent?.reportValidity()) return false;

  setAlertStatus(`${targetInfo().label} 알림을 추가하고 있습니다.`, "pending");
  const { data, error } = await supabase.rpc(
    "add_cgv_email_subscription_target",
    {
      p_id: saved.id,
      p_token: saved.token,
      p_target_key: currentTargetKey,
    },
  );
  if (error || data !== true) {
    throw error || new Error("Target add failed");
  }
  consent.checked = false;
  await syncSavedSubscriptionStatus();
  return true;
}

async function registerAlert(event) {
  event.preventDefault();
  const input = document.getElementById("imax-email-alert-input");
  const consent = document.getElementById("imax-email-alert-consent");
  const button = document.getElementById("imax-email-alert-button");
  if (!input || !consent || !button) return;

  const saved = readSavedSubscription();
  if (saved?.id && saved?.token && savedParentStatus === "verified") {
    try {
      button.disabled = true;
      await addCurrentTarget(saved);
    } catch (error) {
      console.error("Email target add failed", error);
      setAlertStatus("알림 추가 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", "error");
      button.disabled = false;
    }
    return;
  }

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

    const { data, error } = await supabase.rpc(
      "register_cgv_email_subscription",
      {
        p_id: id,
        p_email_ciphertext: ciphertext,
        p_token_hash: tokenHash,
        p_target_key: currentTargetKey,
      },
    );
    if (error || data !== true) throw error || new Error("Registration failed");

    saveSubscription({
      id,
      token,
      verified: false,
      targetKey: currentTargetKey,
      registeredAt: new Date().toISOString(),
    });
    savedParentStatus = "pending";
    savedTargetStates = new Map([[currentTargetKey, true]]);
    input.value = "";
    consent.checked = false;
    configureForm("pending");
    setAlertStatus(
      `등록 요청 완료 · ${targetInfo().label} 확인 메일은 보통 1분 이내 도착합니다. 메일의 확인 링크를 눌러주세요.`,
      "success",
    );
  } catch (error) {
    console.error("Email alert registration failed", error);
    setAlertStatus("등록 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", "error");
    configureForm("new");
  }
}

function parseActionValue(value) {
  const normalized = String(value || "").trim();
  const dotIndex = normalized.indexOf(".");
  if (dotIndex <= 0) return null;
  const id = normalized.slice(0, dotIndex);
  const token = normalized.slice(dotIndex + 1);
  return id && token ? { id, token } : null;
}

function parseActionValues(value) {
  return String(value || "")
    .split(",")
    .map((item) => parseActionValue(item))
    .filter(Boolean);
}

function parseTargetActionValue(value) {
  const parts = String(value || "").trim().split(".");
  if (parts.length !== 3) return null;
  const [id, token, targetKey] = parts;
  if (!id || !token || !TARGETS[targetKey]) return null;
  return { id, token, targetKey };
}

function removeActionParams() {
  const url = new URL(location.href);
  url.searchParams.delete("email_verify");
  url.searchParams.delete("email_unsubscribe");
  url.searchParams.delete("email_unsubscribe_target");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

async function handleEmailActions() {
  const params = new URLSearchParams(location.search);
  const verify = parseActionValue(params.get("email_verify"));
  const unsubscribes = parseActionValues(params.get("email_unsubscribe"));
  const targetUnsubscribe = parseTargetActionValue(
    params.get("email_unsubscribe_target"),
  );

  if (verify) {
    setAlertStatus("이메일 알림 등록을 확인하고 있습니다.", "pending");
    const { data, error } = await supabase.rpc(
      "confirm_cgv_email_subscription",
      { p_id: verify.id, p_token: verify.token },
    );
    const alreadyVerified =
      !error && data !== true
        ? (await getSubscriptionStatus(verify.id, verify.token)) === "verified"
        : false;

    if (!error && (data === true || alreadyVerified)) {
      const saved = readSavedSubscription();
      saveSubscription({
        ...(saved?.id === verify.id ? saved : {}),
        id: verify.id,
        token: verify.token,
        verified: true,
      });
      setAlertStatus("✅ 이메일 알림 등록 완료", "success");
    } else {
      setAlertStatus("확인 링크가 유효하지 않거나 이미 처리된 요청입니다.", "error");
    }
    removeActionParams();
    return;
  }

  if (targetUnsubscribe) {
    const info = TARGETS[targetUnsubscribe.targetKey];
    setAlertStatus(`${info.label} 알림을 해지하고 있습니다.`, "pending");
    const { data, error } = await supabase.rpc(
      "unsubscribe_cgv_email_subscription_target",
      {
        p_id: targetUnsubscribe.id,
        p_token: targetUnsubscribe.token,
        p_target_key: targetUnsubscribe.targetKey,
      },
    );
    if (!error && data === true) {
      setAlertStatus(`${info.label} 이메일 알림이 해지되었습니다.`, "success");
    } else {
      setAlertStatus("해지 링크가 유효하지 않거나 이미 해지된 알림입니다.", "error");
    }
    removeActionParams();
    return;
  }

  if (unsubscribes.length) {
    setAlertStatus("이메일 알림을 해지하고 있습니다.", "pending");
    const results = await Promise.all(
      unsubscribes.map(({ id, token }) =>
        supabase.rpc("unsubscribe_cgv_email_subscription", {
          p_id: id,
          p_token: token,
        }),
      ),
    );
    const succeededIds = unsubscribes
      .filter((_, index) => {
        const result = results[index];
        return !result.error && result.data === true;
      })
      .map(({ id }) => id);
    succeededIds.forEach((id) => clearSavedSubscription(id));
    if (succeededIds.length) {
      setAlertStatus("이메일 알림이 해지되었습니다.", "success");
    } else {
      setAlertStatus("해지 링크가 유효하지 않거나 이미 해지된 알림입니다.", "error");
    }
    removeActionParams();
  }
}

async function handleTargetChanged(event) {
  const next = event?.detail?.targetKey;
  if (!TARGETS[next]) return;
  currentTargetKey = next;
  setPanelCopy();
  refreshPanelState();
  await syncSavedSubscriptionStatus();
}

async function init() {
  buildAlertPanel();
  document
    .getElementById("imax-email-alert-form")
    ?.addEventListener("submit", registerAlert);
  document.addEventListener("cgv:movie-target-changed", (event) => {
    handleTargetChanged(event).catch((error) =>
      console.warn("Email target switch sync failed", error),
    );
  });

  try {
    await handleEmailActions();
    await syncSavedSubscriptionStatus();
  } catch (error) {
    console.error("Email alert action failed", error);
    setAlertStatus("이메일 알림 요청을 처리하지 못했습니다.", "error");
  }

  window.addEventListener("focus", () => {
    syncSavedSubscriptionStatus().catch((error) =>
      console.warn("Email subscription focus sync failed", error),
    );
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncSavedSubscriptionStatus().catch((error) =>
        console.warn("Email subscription visibility sync failed", error),
      );
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
