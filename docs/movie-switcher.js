(() => {
  const STORAGE_KEY = "cgv-watcher-selected-target-v1";
  const DEFAULT_TARGET = "odyssey_imax";
  const TARGET_LABELS = {
    odyssey_imax: "오디세이",
    spiderman_screenx: "스파이더맨",
  };
  const RAW_STATUS_URL =
    "https://raw.githubusercontent.com/LIM-AIT/cgv-api-watcher/main/docs/status.json";

  let latestData = null;
  let selectedTarget = localStorage.getItem(STORAGE_KEY) || DEFAULT_TARGET;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function selectedData(data = latestData) {
    if (!data) return null;
    const targets = data.targets || {};
    if (!targets[selectedTarget]) {
      selectedTarget = data.default_target || DEFAULT_TARGET;
      localStorage.setItem(STORAGE_KEY, selectedTarget);
    }
    return targets[selectedTarget] || data;
  }

  function formatDate(value) {
    if (!value) return "-";
    const [, month, day] = String(value).split("-");
    if (!month || !day) return String(value);
    const parsed = new Date(`${value}T00:00:00+09:00`);
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const weekday = Number.isNaN(parsed.getTime()) ? "" : weekdays[parsed.getDay()];
    return `${month}/${day}${weekday ? ` ${weekday}` : ""}`;
  }

  function formatDateRange(from, to) {
    const left = formatDate(from).split(" ")[0];
    const right = formatDate(to).split(" ")[0];
    return from && to ? `${left} ~ ${right}` : "-";
  }

  function ensureStyles() {
    if (document.getElementById("movie-switcher-style-v1")) return;
    const style = document.createElement("style");
    style.id = "movie-switcher-style-v1";
    style.textContent = `
      .movie-selector-title {
        display: flex !important;
        align-items: center !important;
        flex-wrap: wrap !important;
        gap: 7px !important;
      }
      .movie-selector-label {
        margin-right: 2px;
      }
      .movie-select-button {
        min-height: 30px;
        padding: 5px 10px;
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.035);
        color: var(--muted);
        font: inherit;
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
      }
      .movie-select-button:hover {
        border-color: rgba(88, 166, 255, 0.45);
        color: var(--text);
      }
      .movie-select-button.active {
        border-color: rgba(88, 166, 255, 0.62);
        background: rgba(88, 166, 255, 0.14);
        color: #a5d6ff;
        box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.08) inset;
      }
      @media (max-width: 640px) {
        .movie-selector-title {
          gap: 5px !important;
          font-size: 15px !important;
        }
        .movie-select-button {
          min-height: 27px;
          padding: 4px 7px;
          border-radius: 8px;
          font-size: 9px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function updateHeaderBrand() {
    const title = document.querySelector("header h1, header .title");
    if (title) title.textContent = "CGV WATCHER";
  }

  function ensureSelector() {
    const candidates = Array.from(
      document.querySelectorAll(".section-title, h2"),
    );
    const title = candidates.find((node) =>
      node.textContent.includes("극장별 감시 상태") ||
      node.classList.contains("movie-selector-title"),
    );
    if (!title) return false;

    if (!title.classList.contains("movie-selector-title")) {
      title.classList.add("movie-selector-title");
      title.innerHTML = `
        <span class="movie-selector-label">영화 선택 :</span>
        <button type="button" class="movie-select-button" data-target="odyssey_imax">오디세이</button>
        <button type="button" class="movie-select-button" data-target="spiderman_screenx">스파이더맨</button>
      `;
      title.querySelectorAll(".movie-select-button").forEach((button) => {
        button.addEventListener("click", () => selectMovie(button.dataset.target));
      });
    }
    updateSelectorState(title);
    return true;
  }

  function updateSelectorState(root = document) {
    root.querySelectorAll?.(".movie-select-button").forEach((button) => {
      const active = button.dataset.target === selectedTarget;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderSummary(target) {
    const summary = document.getElementById("summary");
    if (!summary || !target) return;
    summary.innerHTML = `
      <article class="summary-card">
        <div class="summary-label">감시 영화</div>
        <div class="summary-value">${escapeHtml(target.display_name || target.movie_keyword || "-")}</div>
      </article>
      <article class="summary-card">
        <div class="summary-label">감시 포맷</div>
        <div class="summary-value">${escapeHtml(target.format || "-")}</div>
      </article>
      <article class="summary-card">
        <div class="summary-label">감시 기간</div>
        <div class="summary-value">${escapeHtml(formatDateRange(target.date_from, target.date_to))}</div>
      </article>
      <article class="summary-card">
        <div class="summary-label">감시 극장</div>
        <div class="summary-value">${Array.isArray(target.theaters) ? target.theaters.length : 0}개</div>
      </article>
    `;
  }

  function resultStatusLabel(result, target) {
    const status = result.status || "NO_SCHEDULE";
    if (status === "OPEN") return "예매 오픈";
    if (status === "WAIT") return `${target.format || "특별관"} 미오픈`;
    if (status === "ERROR") return "조회 오류";
    return "상영 일정 없음";
  }

  function statusClass(status) {
    if (status === "OPEN") return "status-open";
    if (status === "WAIT") return "status-wait";
    if (status === "ERROR") return "status-error";
    return "status-idle";
  }

  function renderResult(result, target) {
    const open = Boolean(result.format_open ?? result.imax_open ?? result.status === "OPEN");
    const movieName = result.movie_name
      ? `<div class="movie-name">${escapeHtml(result.movie_name)}</div>`
      : "";
    const formatDetail = open && result.format_name && result.format_name !== target.format
      ? `<div class="movie-name">${escapeHtml(result.format_name)}</div>`
      : "";
    const errorMessage = result.error
      ? `<div class="error-message">${escapeHtml(result.error)}</div>`
      : "";
    const bookingAction = open && result.booking_url
      ? `<a class="result-booking-link" href="${escapeHtml(result.booking_url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(formatDate(result.date))} ${escapeHtml(target.display_name)} ${escapeHtml(target.format)} 예매">예매 ↗</a>`
      : "";

    return `
      <div class="result-row">
        <div class="result-date">${escapeHtml(formatDate(result.date))}</div>
        <div class="result-main">
          <div class="status-line ${statusClass(result.status)}">
            <span class="status-dot"></span>
            <span class="status-label">${escapeHtml(resultStatusLabel(result, target))}</span>
          </div>
          ${movieName}
          ${formatDetail}
          ${errorMessage}
        </div>
        <div class="result-actions">${bookingAction}</div>
      </div>
    `;
  }

  function renderTheaters(target) {
    const content = document.getElementById("content");
    if (!content || !target) return;
    const theaters = Array.isArray(target.theaters) ? target.theaters : [];
    if (!theaters.length) {
      content.className = "empty";
      content.textContent = "설정된 극장이 없습니다.";
      return;
    }
    content.className = "theater-list";
    content.innerHTML = theaters.map((theater) => {
      const results = Array.isArray(theater.results) ? theater.results : [];
      const rows = results.length
        ? results.map((result) => renderResult(result, target)).join("")
        : `<div class="result-row"><div class="result-main"><div class="status-line status-idle"><span class="status-dot"></span><span class="status-label">표시할 결과가 없습니다.</span></div></div></div>`;
      return `
        <article class="theater-card">
          <div class="theater-header">
            <h3 class="theater-name">${escapeHtml(theater.name)}</h3>
            <div class="theater-code">Theater Code: ${escapeHtml(theater.site_no)}</div>
          </div>
          <div class="result-list">${rows}</div>
        </article>
      `;
    }).join("");
  }

  function updateServiceStatus(target) {
    const label = document.getElementById("service-status");
    const dot = document.getElementById("service-dot");
    const badge = label?.parentElement;
    if (!label || !dot || !target) return;
    dot.classList.remove("opening-pulse");
    badge?.classList.remove("booking-open");
    if (target.status === "OPEN") {
      label.textContent = "예매 오픈 감지";
      dot.style.background = "var(--open)";
      dot.classList.add("opening-pulse");
      badge?.classList.add("booking-open");
      return;
    }
    if (target.status === "DEGRADED") {
      label.textContent = "일부 조회 오류";
      dot.style.background = "var(--error)";
      return;
    }
    label.textContent = "정상 감시 중";
    dot.style.background = "var(--open)";
  }

  function renderSelected(data = latestData) {
    if (!data) return;
    latestData = data;
    const target = selectedData(data);
    if (!target) return;
    updateHeaderBrand();
    ensureSelector();
    renderSummary(target);
    renderTheaters(target);
    updateServiceStatus(target);
    window.CGV_WATCHER_TARGET = selectedTarget;
    window.CGV_WATCHER_TARGET_DATA = target;
    document.dispatchEvent(new CustomEvent("cgv:movie-target-changed", {
      detail: { targetKey: selectedTarget, target },
    }));
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }

  function selectMovie(targetKey) {
    if (!TARGET_LABELS[targetKey] || targetKey === selectedTarget) return;
    selectedTarget = targetKey;
    localStorage.setItem(STORAGE_KEY, selectedTarget);
    updateSelectorState();
    renderSelected();
  }

  async function fetchLatest() {
    const urls = [
      `./status.json?timestamp=${Date.now()}`,
      `${RAW_STATUS_URL}?timestamp=${Date.now()}`,
    ];
    for (const url of urls) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) continue;
        const data = await response.json();
        if (data?.targets) {
          latestData = data;
          return data;
        }
      } catch {
        // Try the fallback URL.
      }
    }
    return null;
  }

  function patchLegacyRenderers() {
    if (typeof window.renderSummary === "function") {
      window.renderSummary = (data) => {
        latestData = data;
        renderSummary(selectedData(data));
      };
    }
    if (typeof window.renderTheaters === "function") {
      window.renderTheaters = (data) => {
        latestData = data;
        renderTheaters(selectedData(data));
      };
    }
    if (typeof window.updateServiceStatus === "function") {
      window.updateServiceStatus = (data) => {
        latestData = data;
        updateServiceStatus(selectedData(data));
      };
    }
  }

  async function init() {
    ensureStyles();
    updateHeaderBrand();
    patchLegacyRenderers();
    ensureSelector();
    window.CGV_WATCHER_TARGET = selectedTarget;
    const data = await fetchLatest();
    if (data) renderSelected(data);

    window.setInterval(async () => {
      const refreshed = await fetchLatest();
      if (refreshed) renderSelected(refreshed);
    }, 150000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
