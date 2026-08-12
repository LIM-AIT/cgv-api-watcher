(() => {
  const STYLE_ID = "alerts-verified-ui-style-v1";
  const BADGE_CLASS = "verified-email-badge";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .imax-email-alert-form.verified-add-mode {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .imax-email-alert-form.verified-add-mode .imax-email-alert-input,
      .imax-email-alert-form.verified-add-mode label[for="imax-email-alert-input"] {
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

      @media (max-width: 700px) {
        .imax-email-alert-form.verified-add-mode {
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

  function syncVerifiedUi() {
    ensureStyles();

    const form = document.getElementById("imax-email-alert-form");
    const input = document.getElementById("imax-email-alert-input");
    const button = document.getElementById("imax-email-alert-button");
    if (!form || !input || !button) return false;

    const addMode =
      input.disabled &&
      !button.disabled &&
      /알림 추가/.test(button.textContent || "");

    form.classList.toggle("verified-add-mode", addMode);

    let badge = form.querySelector(`.${BADGE_CLASS}`);
    if (addMode) {
      if (!badge) {
        badge = document.createElement("div");
        badge.className = BADGE_CLASS;
        badge.setAttribute("role", "status");
        form.insertBefore(badge, button);
      }
      badge.textContent = "✅ 이메일 인증 완료";
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
      characterData: true,
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
