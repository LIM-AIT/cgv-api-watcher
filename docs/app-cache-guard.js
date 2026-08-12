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

      const workerUrl = `./sw.js?swv=5&t=${encodeURIComponent(pageToken)}`;

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
