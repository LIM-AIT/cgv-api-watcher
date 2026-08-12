(() => {
  const STYLE_ID = "alerts-verified-ui-style-v2";
  const BADGE_CLASS = "verified-email-badge";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .imax-email-alert-form.token-state-mode {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .imax-email-alert-form.token-state-mode .imax-email-alert-input,
      .imax-email-alert-form.token-state-mode label[for="imax-email-alert-input"] {
        display: none !important;
      }

      .verified-email-badge {
        display: flex;
        min-width: 0;
        height: 42px;
        padding: 0 12px;
        align-items: center;
        border: 1px solid rgba(63, 185, 80, 0.3);
        border-radius: 11px;
        background: rgba(63, 185, 80, 0.08);
        color: #7ee787;
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
      }

      .imax-email-alert-form.pending-token-mode .verified-email-badge {
        border-color: rgba(210, 168, 255, 0.3);
        background: rgba(210, 168, 255, 0.08);
        color: #d2a8ff;
      }

      .imax-email-alert-form.subscribed-token-mode .imax-email-alert-button,
      .imax-email-alert-form.pending-token-mode .imax-email-alert-button {
        display: none !important;
      }

      .imax-email-alert[data-alert-ui-mode="subscribed"] .imax-email-alert-consent,
      .imax-email-alert[data-alert-ui-mode="pending"] .imax-email-alert-consent {
        display: none !important;
      }

      @media (max-width: 700px) {
        .imax-email-alert-form.token-state-mode {
          grid-template-columns: minmax(0, 1fr) auto;
        }

        .verified-email-badge {
          height: 40px;
          padding: 0 9px;
          border-radius: 10px;
          font-size: 10px;
        }

        .imax-email-alert-form.verified-add-mode .imax-email-alert-button {
          width: auto;
          min-width: 94px;
          padding: 0 9px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function detectMode(input, button) {
    const buttonText = String(button.textContent || "").trim();
    if (!input.disabled) return "new";
    if (!button.disabled && /알림 추가/.test(buttonText)) return "add";
    if (button.disabled && /등록 완료/.test(buttonText)) return "subscribed";
    if (button.disabled && /인증 대기/.test(buttonText)) return "pending";
    return "new";
  }

  function syncVerifiedUi() {
    ensureStyles();

    const panel = document.getElementById("imax-email-alert");
    const form = document.getElementById("imax-email-alert-form");
    const input = document.getElementById("imax-email-alert-input");
    const button = document.getElementById("imax-email-alert-button");
    if (!panel || !form || !input || !button) return false;

    const mode = detectMode(input, button);
    const tokenState = mode !== "new";

    panel.dataset.alertUiMode = mode;
    form.classList.toggle("token-state-mode", tokenState);
    form.classList.toggle("verified-add-mode", mode === "add");
    form.classList.toggle("subscribed-token-mode", mode === "subscribed");
    form.classList.toggle("pending-token-mode", mode === "pending");

    let badge = form.querySelector(`.${BADGE_CLASS}`);
    if (tokenState) {
      if (!badge) {
        badge = document.createElement("div");
        badge.className = BADGE_CLASS;
        badge.setAttribute("role", "status");
        form.insertBefore(badge, button);
      }

      const nextText =
        mode === "pending"
          ? "✉️ 이메일 인증 대기 중"
          : mode === "subscribed"
            ? "✅ 이 영화 알림 등록 완료"
            : "✅ 이메일 인증 완료";

      if (badge.textContent !== nextText) {
        badge.textContent = nextText;
      }
    } else {
      badge?.remove();
    }

    return true;
  }

  let observer;

  function initialize() {
    syncVerifiedUi();
    observer?.disconnect();
    observer = new MutationObserver(() => {
      window.requestAnimationFrame(syncVerifiedUi);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "placeholder"],
    });

    document.addEventListener("cgv:movie-target-changed", () => {
      window.requestAnimationFrame(syncVerifiedUi);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
