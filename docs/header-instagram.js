import("./chat-identity-guard.js?v=1").catch((error) => {
  console.error("Chat identity guard failed to load", error);
});

(() => {
  const STYLE_ID = "header-instagram-style-v2";
  const LINK_CLASS = "developer-instagram-link";
  const INSTAGRAM_URL = "https://www.instagram.com/limxsang/";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const oldStyle = document.getElementById("header-instagram-style-v1");
    if (oldStyle) oldStyle.remove();

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      header .developer-credit .${LINK_CLASS} {
        display: inline-flex !important;
        width: 20px !important;
        height: 20px !important;
        margin-left: 7px !important;
        align-items: center !important;
        justify-content: center !important;
        vertical-align: -5px !important;
        text-decoration: none !important;
        opacity: 1;
        transition: transform 140ms ease, filter 140ms ease;
      }

      header .developer-credit .${LINK_CLASS}:hover {
        transform: translateY(-1px) scale(1.08);
        filter: brightness(1.12) saturate(1.1);
      }

      header .developer-credit .${LINK_CLASS}:focus-visible {
        outline: 2px solid #e1306c;
        outline-offset: 3px;
        border-radius: 5px;
      }

      header .developer-credit .${LINK_CLASS} svg {
        display: block;
        width: 20px;
        height: 20px;
        overflow: visible;
      }

      @media (max-width: 640px) {
        header .developer-credit .${LINK_CLASS},
        header .developer-credit .${LINK_CLASS} svg {
          width: 18px !important;
          height: 18px !important;
        }

        header .developer-credit .${LINK_CLASS} {
          margin-left: 6px !important;
          vertical-align: -5px !important;
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
        <defs>
          <linearGradient id="instagram-gradient" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#feda75"></stop>
            <stop offset="28%" stop-color="#fa7e1e"></stop>
            <stop offset="52%" stop-color="#d62976"></stop>
            <stop offset="75%" stop-color="#962fbf"></stop>
            <stop offset="100%" stop-color="#4f5bd5"></stop>
          </linearGradient>
        </defs>
        <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="url(#instagram-gradient)" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"></rect>
        <circle cx="12" cy="12" r="4.25" fill="none" stroke="url(#instagram-gradient)" stroke-width="2.15"></circle>
        <circle cx="17.4" cy="6.6" r="1.15" fill="url(#instagram-gradient)"></circle>
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
