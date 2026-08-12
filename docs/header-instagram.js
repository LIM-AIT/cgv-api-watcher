(() => {
  const STYLE_ID = "header-instagram-style-v1";
  const LINK_CLASS = "developer-instagram-link";
  const INSTAGRAM_URL = "https://www.instagram.com/limxsang/";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      header .developer-credit .${LINK_CLASS} {
        display: inline-flex !important;
        width: 15px !important;
        height: 15px !important;
        margin-left: 6px !important;
        align-items: center !important;
        justify-content: center !important;
        vertical-align: -3px !important;
        color: var(--muted) !important;
        text-decoration: none !important;
        opacity: 0.9;
        transition: opacity 140ms ease, transform 140ms ease, color 140ms ease;
      }

      header .developer-credit .${LINK_CLASS}:hover {
        color: var(--text) !important;
        opacity: 1;
        transform: translateY(-1px);
      }

      header .developer-credit .${LINK_CLASS}:focus-visible {
        outline: 2px solid #60a5fa;
        outline-offset: 3px;
        border-radius: 4px;
      }

      header .developer-credit .${LINK_CLASS} svg {
        display: block;
        width: 15px;
        height: 15px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.9;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      @media (max-width: 640px) {
        header .developer-credit .${LINK_CLASS},
        header .developer-credit .${LINK_CLASS} svg {
          width: 14px !important;
          height: 14px !important;
        }

        header .developer-credit .${LINK_CLASS} {
          margin-left: 5px !important;
          vertical-align: -3px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function attachInstagramLink() {
    ensureStyles();

    const credit = document.querySelector("header .developer-credit");
    if (!credit) return false;
    if (credit.querySelector(`.${LINK_CLASS}`)) return true;

    const link = document.createElement("a");
    link.className = LINK_CLASS;
    link.href = INSTAGRAM_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", "Woosang Lim Instagram");
    link.setAttribute("title", "Instagram @limxsang");
    link.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5"></rect>
        <circle cx="12" cy="12" r="4.25"></circle>
        <circle cx="17.4" cy="6.6" r="0.9" fill="currentColor" stroke="none"></circle>
      </svg>
    `;

    credit.appendChild(link);
    return true;
  }

  let rafId = null;
  function scheduleAttach() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      attachInstagramLink();
    });
  }

  function initialize() {
    attachInstagramLink();

    const observer = new MutationObserver(scheduleAttach);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
