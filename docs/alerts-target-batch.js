import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://yxrfarlhcyaaslwmdyww.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_XPhr82oODoaWs_uYrWiXGg_Y1ypkJmC";
const TARGET_LABELS = {
  odyssey_imax: "오디세이 · IMAX",
  spiderman_screenx: "스파이더맨 · SCREENX",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function parseItem(value) {
  const parts = String(value || "").trim().split(".");
  if (parts.length !== 3) return null;
  const [id, token, targetKey] = parts;
  if (!id || !token || !TARGET_LABELS[targetKey]) return null;
  return { id, token, targetKey };
}

function setStatus(message, type) {
  const status = document.getElementById("imax-email-alert-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.type = type;
}

function removeParam() {
  const url = new URL(location.href);
  url.searchParams.delete("email_unsubscribe_target");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

async function handleBatchTargetUnsubscribe() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("email_unsubscribe_target");
  // alerts.js already handles the normal single-subscription case.
  if (!raw || !raw.includes(",")) return;

  const items = raw.split(",").map(parseItem).filter(Boolean);
  if (!items.length) return;

  const targetKey = items[0].targetKey;
  const sameTarget = items.filter((item) => item.targetKey === targetKey);
  const label = TARGET_LABELS[targetKey];
  setStatus(`${label} 알림을 해지하고 있습니다.`, "pending");

  const results = await Promise.all(
    sameTarget.map(({ id, token }) =>
      supabase.rpc("unsubscribe_cgv_email_subscription_target", {
        p_id: id,
        p_token: token,
        p_target_key: targetKey,
      }),
    ),
  );

  const succeeded = results.some(
    (result) => !result.error && result.data === true,
  );
  setStatus(
    succeeded
      ? `${label} 이메일 알림이 해지되었습니다.`
      : "해지 링크가 유효하지 않거나 이미 해지된 알림입니다.",
    succeeded ? "success" : "error",
  );
  removeParam();
}

function init() {
  handleBatchTargetUnsubscribe().catch(() => {
    setStatus("알림 해지 요청을 처리하지 못했습니다.", "error");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
