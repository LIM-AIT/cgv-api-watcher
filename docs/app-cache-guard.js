import("./chat-official-admin-direct.js?v=1").catch((error) => {
  console.debug("Official admin chat decorator skipped", error);
});

(() => {
  const SERVICE_WORKER_SCOPE = "./";

  async function registerFreshNetworkWorker() {
    if (!("serviceWorker" in navigator)) return;

    try {
      const pageUrl = new URL(window.location.href);
      const pageToken =
        pageUrl.searchParams.get("t") ||
        pageUrl.searchParams.get("appv") ||
        Date.now().toString();

      const workerUrl = `./sw.js?swv=10&t=${encodeURIComponent(pageToken)}`;

      await navigator.serviceWorker.register(workerUrl, {
        scope: SERVICE_WORKER_SCOPE,
        updateViaCache: "none",
      });
    } catch (error) {
      console.debug("Service worker registration skipped", error);
    }
  }

  void registerFreshNetworkWorker();

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void registerFreshNetworkWorker();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void registerFreshNetworkWorker();
  });
})();

(() => {
  const originalFetch = window.fetch.bind(window);
  const RAW_STATUS_URL =
    "https://raw.githubusercontent.com/" +
    "LIM-AIT/cgv-api-watcher/main/docs/status.json";
  const CONTENTS_STATUS_URL =
    "https://api.github.com/repos/" +
    "LIM-AIT/cgv-api-watcher/contents/docs/status.json?ref=main";
  const WATCH_INTERVAL_MS = 150 * 1000;
  const API_GRACE_MS = 5 * 1000;
  const API_DUPLICATE_GUARD_MS = 5 * 1000;
  const API_STATE_KEY = "cgv-status-api-state-v3";
  const API_DEFAULT_BACKOFF_MS = 10 * 60 * 1000;

  // Never allow a later browser refresh to replace an already displayed
  // watcher result with an older RAW/CDN snapshot. This in-memory candidate is
  // refreshed whenever a newer checked_at is observed.
  let freshestAcceptedData = null;

  function checkedAtTime(data) {
    const value = data?.checked_at;
    const parsed = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : -1;
  }

  function currentDisplayedCheckedAtMs() {
    try {
      if (typeof latestCheckedAtValue === "string") {
        const parsed = Date.parse(latestCheckedAtValue);
        if (Number.isFinite(parsed)) return parsed;
      }
    } catch {
      // The dashboard's initial request can happen before this binding exists.
    }

    return -1;
  }

  function readApiState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(API_STATE_KEY) || "{}");
      return {
        lastRequestAt: Number(parsed.lastRequestAt) || 0,
        dueCycleBase: Number(parsed.dueCycleBase) || -1,
        preCycleBaseline: Number(parsed.preCycleBaseline) || -1,
        backoffUntil: Number(parsed.backoffUntil) || 0,
      };
    } catch {
      return {
        lastRequestAt: 0,
        dueCycleBase: -1,
        preCycleBaseline: -1,
        backoffUntil: 0,
      };
    }
  }

  function writeApiState(state) {
    try {
      localStorage.setItem(API_STATE_KEY, JSON.stringify(state));
    } catch {
      // RAW remains available even when storage is unavailable.
    }
  }

  function reserveContentsApiRequest() {
    const now = Date.now();
    const baseline = currentDisplayedCheckedAtMs();
    const state = readApiState();

    if (now < state.backoffUntil) return false;
    if (now - state.lastRequestAt < API_DUPLICATE_GUARD_MS) return false;

    const dueForNextWatcherResult =
      Number.isFinite(baseline) &&
      baseline > 0 &&
      now >= baseline + WATCH_INTERVAL_MS + API_GRACE_MS;

    if (dueForNextWatcherResult) {
      if (state.dueCycleBase === baseline) return false;
      state.dueCycleBase = baseline;
    } else {
      if (state.preCycleBaseline === baseline) return false;
      state.preCycleBaseline = baseline;
    }

    state.lastRequestAt = now;
    writeApiState(state);
    return true;
  }

  function markObservedStatus(data) {
    const checkedAtMs = checkedAtTime(data);
    if (checkedAtMs < 0) return;

    const state = readApiState();
    state.preCycleBaseline = checkedAtMs;
    writeApiState(state);
  }

  function markApiBackoff(response) {
    const state = readApiState();
    const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
    const resetAt = Number.isFinite(resetSeconds)
      ? resetSeconds * 1000 + 1000
      : 0;

    state.backoffUntil = Math.max(
      Date.now() + API_DEFAULT_BACKOFF_MS,
      resetAt,
    );
    writeApiState(state);
  }

  async function fetchJsonCandidate(url, init) {
    const response = await originalFetch(url, {
      ...init,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  async function fetchContentsApiCandidate(init) {
    const response = await originalFetch(CONTENTS_STATUS_URL, {
      ...init,
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        markApiBackoff(response);
      }
      throw new Error(`GitHub Contents API HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (typeof payload?.content !== "string") {
      throw new Error("GitHub Contents API returned no file content");
    }

    const binary = atob(payload.content.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const text = new TextDecoder("utf-8").decode(bytes);
    return JSON.parse(text);
  }

  window.fetch = async (input, init = {}) => {
    let requestUrl;

    try {
      if (typeof input === "string" || input instanceof URL) {
        requestUrl = new URL(input, window.location.href);
      } else if (input?.url) {
        requestUrl = new URL(input.url, window.location.href);
      } else {
        return originalFetch(input, init);
      }
    } catch {
      return originalFetch(input, init);
    }

    const isLocalStatusRequest =
      requestUrl.origin === window.location.origin &&
      requestUrl.pathname.endsWith("/cgv-api-watcher/status.json");

    if (!isLocalStatusRequest) {
      return originalFetch(input, init);
    }

    const token = Date.now().toString();
    const rawUrl = new URL(RAW_STATUS_URL);
    rawUrl.searchParams.set("fresh", token);

    const requests = [
      fetchJsonCandidate(rawUrl.toString(), init),
    ];

    if (reserveContentsApiRequest()) {
      requests.push(fetchContentsApiCandidate(init));
    }

    const results = await Promise.allSettled(requests);
    const candidates = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    // A follow-up safety refresh can arrive while RAW still exposes the
    // previous revision. Keep the newest payload already accepted by this tab
    // in the comparison so checked_at can only move forward, never backward.
    if (freshestAcceptedData) {
      candidates.push(freshestAcceptedData);
    }

    if (!candidates.length) {
      return originalFetch(input, init);
    }

    const freshest = candidates.reduce((latest, candidate) => {
      return checkedAtTime(candidate) > checkedAtTime(latest)
        ? candidate
        : latest;
    });

    freshestAcceptedData = freshest;
    markObservedStatus(freshest);

    return new Response(JSON.stringify(freshest), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  };

  function refreshStatusWhenReady() {
    if (typeof window.loadStatus === "function") {
      void window.loadStatus();
    }
  }

  [250, 1000, 2500].forEach((delay) => {
    window.setTimeout(refreshStatusWhenReady, delay);
  });

  window.addEventListener("load", () => {
    window.setTimeout(refreshStatusWhenReady, 100);
    window.setTimeout(refreshStatusWhenReady, 1000);
  });

  window.addEventListener("pageshow", () => {
    window.setTimeout(refreshStatusWhenReady, 100);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      window.setTimeout(refreshStatusWhenReady, 100);
    }
  });
})();

(() => {
  // Keep dashboard refreshes aligned to the watcher's real 150-second cycle.
  // This changes only browser-side status reads; it never calls the CGV API.
  const WATCH_INTERVAL_MS = 150 * 1000;
  const PROPAGATION_GRACE_MS = 5 * 1000;
  const STALE_RETRY_MS = 10 * 1000;
  const MAX_STALE_RETRIES = 5;
  const HIDDEN_RETRY_MS = 15 * 1000;

  let alignedTimer = null;
  let latestSeenCheckedAtMs = Number.NaN;
  let syncRefreshInFlight = false;
  let staleRetryCount = 0;

  const sectionHint = document.querySelector(".section-hint");
  if (sectionHint) {
    sectionHint.textContent =
      "상태 정보는 약 150초 주기로 자동 갱신됩니다.";
  }

  function clearAlignedTimer() {
    if (alignedTimer) {
      clearTimeout(alignedTimer);
      alignedTimer = null;
    }
  }

  function clearLegacyAlignedTimers() {
    try {
      if (typeof autoRefreshTimer !== "undefined" && autoRefreshTimer) {
        clearTimeout(autoRefreshTimer);
        autoRefreshTimer = null;
      }
      if (typeof staleRetryTimer !== "undefined" && staleRetryTimer) {
        clearTimeout(staleRetryTimer);
        staleRetryTimer = null;
      }
    } catch (error) {
      console.debug("Legacy dashboard timer cleanup skipped", error);
    }
  }

  function scheduleAlignedRefresh() {
    clearAlignedTimer();
    clearLegacyAlignedTimers();

    if (!Number.isFinite(latestSeenCheckedAtMs)) return;

    const expectedAt =
      latestSeenCheckedAtMs + WATCH_INTERVAL_MS + PROPAGATION_GRACE_MS;
    const delay = Math.max(1000, expectedAt - Date.now());

    alignedTimer = setTimeout(() => {
      void refreshUntilNewResult();
    }, delay);
  }

  async function refreshUntilNewResult() {
    clearAlignedTimer();

    if (document.hidden) {
      alignedTimer = setTimeout(() => {
        void refreshUntilNewResult();
      }, HIDDEN_RETRY_MS);
      return;
    }

    if (typeof window.loadStatus !== "function") return;

    const previousCheckedAtMs = latestSeenCheckedAtMs;
    syncRefreshInFlight = true;

    try {
      await window.loadStatus();
    } finally {
      syncRefreshInFlight = false;
    }

    if (
      Number.isFinite(latestSeenCheckedAtMs) &&
      latestSeenCheckedAtMs > previousCheckedAtMs
    ) {
      staleRetryCount = 0;
      scheduleAlignedRefresh();
      return;
    }

    staleRetryCount += 1;

    if (staleRetryCount <= MAX_STALE_RETRIES) {
      alignedTimer = setTimeout(() => {
        void refreshUntilNewResult();
      }, STALE_RETRY_MS);
      return;
    }

    staleRetryCount = 0;
    alignedTimer = setTimeout(() => {
      void refreshUntilNewResult();
    }, 30 * 1000);
  }

  const originalSetLiveReference = window.setLiveReference;

  if (
    typeof originalSetLiveReference !== "function" ||
    typeof window.loadStatus !== "function"
  ) {
    return;
  }

  window.scheduleAlignedAutoRefresh = () => {
    if (!syncRefreshInFlight) {
      scheduleAlignedRefresh();
    }
  };

  window.setLiveReference = function setAlignedLiveReference(checkedAtValue) {
    const parsed = Date.parse(checkedAtValue || "");
    if (Number.isFinite(parsed)) {
      latestSeenCheckedAtMs = parsed;
    }

    const result = originalSetLiveReference.call(this, checkedAtValue);

    if (!syncRefreshInFlight) {
      staleRetryCount = 0;
      scheduleAlignedRefresh();
    }

    return result;
  };

  try {
    if (typeof latestCheckedAtValue === "string") {
      const parsed = Date.parse(latestCheckedAtValue);
      if (Number.isFinite(parsed)) {
        latestSeenCheckedAtMs = parsed;
      }
    }
  } catch (error) {
    console.debug("Initial dashboard timestamp seed skipped", error);
  }

  clearLegacyAlignedTimers();

  if (Number.isFinite(latestSeenCheckedAtMs)) {
    scheduleAlignedRefresh();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;

    if (
      Number.isFinite(latestSeenCheckedAtMs) &&
      Date.now() >=
        latestSeenCheckedAtMs + WATCH_INTERVAL_MS + PROPAGATION_GRACE_MS
    ) {
      void refreshUntilNewResult();
      return;
    }

    scheduleAlignedRefresh();
  });
})();
