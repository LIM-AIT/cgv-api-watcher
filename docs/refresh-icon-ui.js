(() => {
  const STYLE_ID = "refresh-icon-ui-style-v2";
  const RETRY_DELAYS = [0, 100, 300, 700, 1500, 3000];

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #refresh-button.refresh-icon-only {
        display: inline-flex !important;
        flex: 0 0 auto !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border-radius: 9px !important;
      }

      #refresh-button.refresh-icon-only .refresh-label {
        display: none !important;
      }

      #refresh-button.refresh-icon-only .refresh-icon {
        margin: 0 !important;
        font-size: 14px !important;
        font-weight: 900 !important;
        line-height: 1 !important;
        font-variant-numeric: tabular-nums;
      }

      #refresh-button.refresh-icon-only.cooldown-counting .refresh-icon {
        font-size: 12px !important;
        letter-spacing: -0.02em;
      }

      @media (max-width: 640px) {
        #refresh-button.refresh-icon-only {
          border-radius: 8px !important;
        }

        #refresh-button.refresh-icon-only .refresh-icon {
          font-size: 14px !important;
        }

        #refresh-button.refresh-icon-only.cooldown-counting .refresh-icon {
          font-size: 12px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function syncRefreshButton() {
    ensureStyles();

    const button = document.getElementById("refresh-button");
    const spiderButton = document.querySelector(
      '.movie-select-button[data-target="spiderman_screenx"]',
    );
    if (!button || !spiderButton) return false;

    const label = button.querySelector(".refresh-label");
    const icon = button.querySelector(".refresh-icon");
    const labelText = label?.textContent?.trim() || "";
    const cooldownMatch = labelText.match(/다시 확인 가능\s*(\d+)초/);
    const isLoading = button.classList.contains("loading-state");

    button.classList.add("refresh-icon-only");

    if (cooldownMatch && !isLoading) {
      const seconds = cooldownMatch[1];
      button.classList.add("cooldown-counting");
      button.setAttribute("aria-label", `${seconds}초 후 다시 확인 가능`);
      button.setAttribute("title", `${seconds}초 후 다시 확인 가능`);
      if (icon && icon.textContent !== seconds) {
        icon.textContent = seconds;
      }
    } else {
      button.classList.remove("cooldown-counting");
      const accessibleLabel = isLoading
        ? "최신 상태 불러오는 중"
        : "최신 상태 확인";
      button.setAttribute("aria-label", accessibleLabel);
      button.setAttribute("title", accessibleLabel);
      if (icon && icon.textContent !== "↻") {
        icon.textContent = "↻";
      }
    }

    const rect = spiderButton.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const width = `${Math.round(rect.width)}px`;
      const height = `${Math.round(rect.height)}px`;
      button.style.setProperty("width", width, "important");
      button.style.setProperty("min-width", width, "important");
      button.style.setProperty("max-width", width, "important");
      button.style.setProperty("height", height, "important");
      button.style.setProperty("min-height", height, "important");
      button.style.setProperty("max-height", height, "important");
    }

    return true;
  }

  let observer;
  let rafId = null;

  function scheduleSync() {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      syncRefreshButton();
    });
  }

  function initialize() {
    syncRefreshButton();

    observer?.disconnect();
    observer = new MutationObserver(scheduleSync);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "disabled"],
    });

    document.addEventListener("cgv:movie-target-changed", scheduleSync);
    window.addEventListener("resize", scheduleSync);

    RETRY_DELAYS.forEach((delay) => {
      window.setTimeout(scheduleSync, delay);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
