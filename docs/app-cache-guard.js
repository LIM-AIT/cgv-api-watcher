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

      const workerUrl = `./sw.js?swv=8&t=${encodeURIComponent(pageToken)}`;

      await navigator.serviceWorker.register(workerUrl, {
        scope: SERVICE_WORKER_SCOPE,
        updateViaCache: "none",
      });

      // Deliberately do not reload on controllerchange.
      // The root bootstrap already gives each visit a fresh app.html?t=... URL,
      // and the worker will transparently control subsequent requests/visits.
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

  function checkedAtTime(data) {
    const value = data?.checked_at;
    const parsed = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : -1;
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
    const pagesUrl = new URL(requestUrl);
    pagesUrl.searchParams.set("fresh", token);

    const rawUrl = new URL(RAW_STATUS_URL);
    rawUrl.searchParams.set("fresh", token);

    const results = await Promise.allSettled([
      fetchJsonCandidate(pagesUrl.toString(), init),
      fetchJsonCandidate(rawUrl.toString(), init),
    ]);

    const candidates = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    if (!candidates.length) {
      return originalFetch(input, init);
    }

    const freshest = candidates.reduce((latest, candidate) => {
      return checkedAtTime(candidate) > checkedAtTime(latest)
        ? candidate
        : latest;
    });

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

  // app.html starts its first status request before this guard is guaranteed to
  // be active. That request can still be in-flight, so a zero-delay retry may be
  // ignored by loadStatus() while isLoading is true. Retry after the initial
  // request has had time to finish so a browser refresh cannot stay on stale
  // GitHub Pages data.
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
    // app.html used to maintain a separate 5-minute aligned timer. Clear any
    // instance that may have been created before this deferred guard executed.
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

    // Do not spin aggressively if GitHub is delayed. Fall back to a modest
    // retry, while the existing manual refresh and safety interval still work.
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

  // Seed the aligned scheduler if the initial status request completed before
  // this deferred guard installed the wrappers.
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
