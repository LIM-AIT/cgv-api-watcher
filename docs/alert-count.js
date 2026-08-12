import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://yxrfarlhcyaaslwmdyww.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_XPhr82oODoaWs_uYrWiXGg_Y1ypkJmC";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let lastVerifiedCount = null;
let titleObserver = null;
let renderQueued = false;

function ensureStyles() {
  if (document.getElementById("imax-email-alert-count-style")) return;

  const style = document.createElement("style");
  style.id = "imax-email-alert-count-style";
  style.textContent = `
    #imax-email-alert h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .imax-email-alert-count {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 3px 8px;
      border: 1px solid rgba(88, 166, 255, 0.32);
      border-radius: 999px;
      background: rgba(88, 166, 255, 0.10);
      color: #79c0ff;
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
      white-space: nowrap;
    }

    @media (max-width: 700px) {
      #imax-email-alert h2 {
        gap: 6px;
        flex-wrap: nowrap;
      }

      .imax-email-alert-count {
        min-height: 20px;
        padding: 3px 7px;
        font-size: 9px;
      }
    }
  `;
  document.head.appendChild(style);
}

function renderCount(count = lastVerifiedCount) {
  if (count === null || count === undefined) return false;

  const title = document.querySelector("#imax-email-alert h2");
  if (!title) return false;

  let badge = title.querySelector(".imax-email-alert-count");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "imax-email-alert-count";
    title.appendChild(badge);
  }

  badge.textContent = `${Number(count || 0)}명 알림 받는 중`;
  return true;
}

function queueRenderCount() {
  if (renderQueued || lastVerifiedCount === null) return;
  renderQueued = true;
  window.requestAnimationFrame(() => {
    renderQueued = false;
    renderCount();
  });
}

function attachTitleObserver() {
  const panel = document.getElementById("imax-email-alert");
  if (!panel) return false;

  titleObserver?.disconnect();
  titleObserver = new MutationObserver(() => {
    const title = panel.querySelector("h2");
    if (
      lastVerifiedCount !== null &&
      title &&
      !title.querySelector(".imax-email-alert-count")
    ) {
      queueRenderCount();
    }
  });
  titleObserver.observe(panel, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return true;
}

async function refreshSubscriberCount() {
  const { data, error } = await supabase.rpc("get_cgv_email_verified_count");

  if (error) {
    console.warn("Email subscriber count fetch failed", error);
    return;
  }

  lastVerifiedCount = Number(data || 0);
  renderCount();
}

async function initialize() {
  ensureStyles();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (document.querySelector("#imax-email-alert h2")) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  attachTitleObserver();
  await refreshSubscriberCount();

  document.addEventListener("cgv:movie-target-changed", () => {
    window.setTimeout(() => {
      attachTitleObserver();
      renderCount();
    }, 0);
  });

  window.setInterval(() => {
    if (!document.hidden) {
      refreshSubscriberCount().catch((error) =>
        console.warn("Email subscriber count refresh failed", error),
      );
    }
  }, 60_000);

  window.addEventListener("focus", () => {
    refreshSubscriberCount().catch((error) =>
      console.warn("Email subscriber count focus refresh failed", error),
    );
  });
}

initialize().catch((error) =>
  console.warn("Email subscriber count initialization failed", error),
);
