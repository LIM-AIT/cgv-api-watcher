(() => {
  const RETRY_DELAYS = [0, 100, 300, 700, 1500, 3000, 6000];
  const DEFAULT_VISIBLE_MMDD = 902;
  const TARGET_VISIBLE_MMDD = {
    odyssey_imax: 902,
    spiderman_screenx: 827,
  };
  const DATE_MORE_STYLE_ID = "date-more-toggle-style-v1";
  const REACTION_LEADERBOARD_ASSET_ID = "reaction-leaderboard-asset-v1";
  const MOVIE_SWITCHER_ASSET_ID = "movie-switcher-asset-v1";

  function ensureModuleAsset(id, src) {
    if (document.getElementById(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.type = "module";
    script.src = src;
    document.head.appendChild(script);
  }

  ensureModuleAsset(
    REACTION_LEADERBOARD_ASSET_ID,
    "./reaction-leaderboard.js?v=1",
  );
  ensureModuleAsset(
    MOVIE_SWITCHER_ASSET_ID,
    "./movie-switcher.js?v=1",
  );

  function placeInteractiveSections() {
    const main = document.querySelector("main.app");
    const footer = main?.querySelector("footer.footer");
    const reactionGame = document.getElementById("reaction-game");
    const liveChat = document.getElementById("imax-live-chat");

    if (!main || !footer || !reactionGame || !liveChat) {
      return false;
    }

    // Desired final order: live chat first, reaction-speed test immediately below it.
    if (
      liveChat.parentElement === main &&
      reactionGame.parentElement === main &&
      liveChat.nextElementSibling === reactionGame
    ) {
      return true;
    }

    main.insertBefore(liveChat, footer);
    main.insertBefore(reactionGame, footer);
    return true;
  }

  function removeGenericBookingButtons() {
    document
      .querySelectorAll(".theater-card .booking-wrap")
      .forEach((node) => node.remove());
  }

  function ensureDateMoreStyles() {
    if (document.getElementById(DATE_MORE_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = DATE_MORE_STYLE_ID;
    style.textContent = `
      .result-row.result-extra-row[hidden] {
        display: none !important;
      }

      .result-more-button {
        display: flex;
        width: calc(100% - 20px);
        min-height: 34px;
        margin: 7px 10px 9px;
        padding: 7px 10px;
        align-items: center;
        justify-content: center;
        gap: 7px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.035);
        color: var(--muted);
        cursor: pointer;
        font: inherit;
        font-size: 11px;
        font-weight: 800;
      }

      .result-more-button:hover {
        border-color: rgba(148, 163, 184, 0.36);
        background: rgba(255, 255, 255, 0.06);
        color: var(--text);
      }

      .result-more-button.has-open {
        border-color: rgba(63, 185, 80, 0.38);
        color: #7ee787;
      }

      .result-more-range {
        font-size: 10px;
        font-weight: 700;
        opacity: 0.78;
      }

      .result-more-arrow {
        font-size: 12px;
        line-height: 1;
      }

      @media (max-width: 640px) {
        .result-more-button {
          width: calc(100% - 12px);
          min-height: 28px;
          margin: 5px 6px 6px;
          padding: 5px 6px;
          gap: 4px;
          border-radius: 8px;
          font-size: 9px;
        }

        .result-more-range {
          font-size: 8px;
          letter-spacing: -0.03em;
        }

        .result-more-arrow {
          font-size: 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function dateLabelToMmdd(label) {
    const match = String(label || "").trim().match(/^(\d{2})\/(\d{2})/);
    if (!match) return null;
    return Number(match[1]) * 100 + Number(match[2]);
  }

  function compactDateLabel(label) {
    const match = String(label || "").trim().match(/^(\d{2}\/\d{2})/);
    return match ? match[1] : String(label || "").trim();
  }

  function visibleCutoffMmdd() {
    const targetKey =
      window.CGV_WATCHER_TARGET ||
      localStorage.getItem("cgv-watcher-selected-target-v1") ||
      "odyssey_imax";
    return TARGET_VISIBLE_MMDD[targetKey] ?? DEFAULT_VISIBLE_MMDD;
  }

  function applyDateMoreToggles() {
    ensureDateMoreStyles();
    const cutoffMmdd = visibleCutoffMmdd();

    document.querySelectorAll(".theater-card .result-list").forEach((list) => {
      const rows = Array.from(list.children).filter((node) =>
        node.classList?.contains("result-row")
      );
      if (!rows.length) return;

      const signature = `${cutoffMmdd}|${rows
        .map((row) => row.querySelector(".result-date")?.textContent?.trim() || "")
        .join("|")}`;
      if (list.dataset.dateMoreSignature === signature) return;
      list.dataset.dateMoreSignature = signature;

      list.querySelector(".result-more-button")?.remove();
      rows.forEach((row) => {
        row.hidden = false;
        row.classList.remove("result-extra-row");
      });

      const extraRows = rows.filter((row) => {
        const label = row.querySelector(".result-date")?.textContent;
        const mmdd = dateLabelToMmdd(label);
        return mmdd !== null && mmdd > cutoffMmdd;
      });

      if (!extraRows.length) return;

      extraRows.forEach((row) => {
        row.classList.add("result-extra-row");
        row.hidden = true;
      });

      const firstDate = compactDateLabel(
        extraRows[0].querySelector(".result-date")?.textContent
      );
      const lastDate = compactDateLabel(
        extraRows[extraRows.length - 1].querySelector(".result-date")?.textContent
      );
      const hasOpen = extraRows.some(
        (row) => row.querySelector(".status-open") || row.querySelector(".result-booking-link")
      );

      const button = document.createElement("button");
      button.type = "button";
      button.className = `result-more-button${hasOpen ? " has-open" : ""}`;
      button.setAttribute("aria-expanded", "false");
      button.innerHTML = `
        <span class="result-more-label">더보기</span>
        <span class="result-more-range">${firstDate} ~ ${lastDate}</span>
        <span class="result-more-arrow">⌄</span>
      `;

      button.addEventListener("click", () => {
        const expanded = button.getAttribute("aria-expanded") === "true";
        const nextExpanded = !expanded;
        button.setAttribute("aria-expanded", String(nextExpanded));
        extraRows.forEach((row) => {
          row.hidden = !nextExpanded;
        });

        const label = button.querySelector(".result-more-label");
        const arrow = button.querySelector(".result-more-arrow");
        if (label) label.textContent = nextExpanded ? "접기" : "더보기";
        if (arrow) arrow.textContent = nextExpanded ? "⌃" : "⌄";
      });

      list.appendChild(button);
    });
  }

  let observer = null;
  let stopTimer = null;
  let contentObserver = null;

  function refreshTheaterUi() {
    removeGenericBookingButtons();
    applyDateMoreToggles();
  }

  function attachContentObserver() {
    const content = document.getElementById("content");
    if (!content || content.dataset.dateMoreObserved === "true") return;

    content.dataset.dateMoreObserved = "true";
    contentObserver?.disconnect();
    contentObserver = new MutationObserver(() => {
      window.requestAnimationFrame(refreshTheaterUi);
    });
    contentObserver.observe(content, {
      childList: true,
      subtree: true,
    });
    refreshTheaterUi();
  }

  function verifyOrder() {
    const placed = placeInteractiveSections();
    attachContentObserver();
    refreshTheaterUi();
    if (!placed) return;

    if (stopTimer) window.clearTimeout(stopTimer);
    stopTimer = window.setTimeout(() => {
      placeInteractiveSections();
      attachContentObserver();
      refreshTheaterUi();
      observer?.disconnect();
    }, 2500);
  }

  observer = new MutationObserver(() => {
    verifyOrder();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  document.addEventListener("cgv:movie-target-changed", () => {
    window.requestAnimationFrame(refreshTheaterUi);
  });

  RETRY_DELAYS.forEach((delay) => {
    window.setTimeout(verifyOrder, delay);
  });

  window.addEventListener("load", verifyOrder, { once: true });
})();
