import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://yxrfarlhcyaaslwmdyww.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_XPhr82oODoaWs_uYrWiXGg_Y1ypkJmC";
const DEVICE_KEY = "cgv-reaction-device-v1";
const LOCAL_RANKING_KEY = "cgv-reaction-ranking-v1";
const REFRESH_MS = 15000;

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getDeviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

function rankingList() {
  return document.getElementById("reaction-ranking-list");
}

function setRankingMessage(message) {
  const list = rankingList();
  if (!list) return;
  list.innerHTML = `<li class="reaction-ranking-empty">${escapeHtml(message)}</li>`;
}

function renderTop5(rows) {
  const list = rankingList();
  if (!list) return;

  if (!Array.isArray(rows) || rows.length === 0) {
    setRankingMessage("아직 글로벌 기록이 없습니다.");
    return;
  }

  list.innerHTML = rows
    .slice(0, 5)
    .map(
      (row, index) => `
        <li class="reaction-ranking-item">
          <span class="reaction-ranking-number">${Number(row.rank) || index + 1}</span>
          <span class="reaction-ranking-name">${escapeHtml(row.player_name || "익명")}</span>
          <span class="reaction-ranking-time">${Number(row.reaction_ms)}ms</span>
        </li>
      `,
    )
    .join("");
}

async function loadTop5({ quiet = false } = {}) {
  if (!quiet) setRankingMessage("글로벌 TOP 5 불러오는 중...");

  const { data, error } = await supabase.rpc("get_cgv_reaction_top5");
  if (error) {
    console.warn("Reaction leaderboard load failed");
    if (!quiet) setRankingMessage("랭킹을 불러오지 못했습니다.");
    return false;
  }

  renderTop5(data || []);
  return true;
}

function updateResultMessage(result, reactionMs) {
  const target = document.getElementById("reaction-target");
  if (!target?.classList.contains("result")) return;

  const main = target.querySelector(".reaction-target-main");
  const sub = target.querySelector(".reaction-target-sub");
  if (!main || !sub || main.textContent.trim() !== `${reactionMs}ms`) return;

  if (result?.top5) {
    sub.textContent = `${Number(result.rank)}위! 글로벌 TOP 5에 기록되었습니다.`;
  } else if (Number(result?.best_ms)) {
    sub.textContent = `기록 저장 완료 · 개인 최고 ${Number(result.best_ms)}ms`;
  } else {
    sub.textContent = "기록이 글로벌 랭킹에 저장되었습니다.";
  }
}

async function submitResult(name, reactionMs) {
  const normalizedName = String(name || "").trim().slice(0, 12);
  if (!normalizedName || !Number.isInteger(reactionMs)) return;

  setRankingMessage("글로벌 랭킹 반영 중...");

  const { data, error } = await supabase.rpc("submit_cgv_reaction_score", {
    p_device_id: getDeviceId(),
    p_player_name: normalizedName,
    p_reaction_ms: reactionMs,
  });

  if (error) {
    console.warn("Reaction score submit failed");
    updateResultMessage(null, reactionMs);
    await loadTop5();
    return;
  }

  updateResultMessage(data, reactionMs);
  await loadTop5({ quiet: true });
}

function attachGame() {
  const game = document.getElementById("reaction-game");
  const target = document.getElementById("reaction-target");
  if (!game || !target || game.dataset.globalRankingAttached === "true") {
    return false;
  }

  game.dataset.globalRankingAttached = "true";
  localStorage.removeItem(LOCAL_RANKING_KEY);

  const title = game.querySelector(".reaction-ranking-title");
  if (title) title.textContent = "GLOBAL TOP 5";

  let wasResult = target.classList.contains("result");

  const inspectTarget = () => {
    const isResult = target.classList.contains("result");

    if (isResult && !wasResult) {
      const text = target
        .querySelector(".reaction-target-main")
        ?.textContent.trim();
      const match = String(text || "").match(/^(\d+)ms$/);
      const name = document
        .getElementById("reaction-name-input")
        ?.value.trim();

      if (match && name) {
        const reactionMs = Number(match[1]);
        submitResult(name, reactionMs).catch(() => {
          console.warn("Reaction leaderboard update failed");
          loadTop5().catch(() => {});
        });
      }
    }

    wasResult = isResult;
  };

  const observer = new MutationObserver(inspectTarget);
  observer.observe(target, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true,
    characterData: true,
  });

  loadTop5().catch(() => {});
  return true;
}

function init() {
  if (!attachGame()) {
    const observer = new MutationObserver(() => {
      if (attachGame()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.setInterval(() => {
    if (!document.hidden) loadTop5({ quiet: true }).catch(() => {});
  }, REFRESH_MS);

  window.addEventListener("focus", () => {
    loadTop5({ quiet: true }).catch(() => {});
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
