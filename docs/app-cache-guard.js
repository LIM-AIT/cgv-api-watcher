(() => {
  const VERSION_URL = "./app-version.json";
  const VERSION_PARAM = "appv";
  const CHECK_INTERVAL_MS = 60000;
  const SERVICE_WORKER_URL = "./sw.js";
  const SERVICE_WORKER_SCOPE = "./";

  let checking = false;
  let reloadingForController = false;

  async function registerFreshNetworkWorker() {
    if (!("serviceWorker" in navigator)) return;

    try {
      await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
        scope: SERVICE_WORKER_SCOPE,
        updateViaCache: "none",
      });

      await navigator.serviceWorker.ready;

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadingForController) return;
        reloadingForController = true;
        window.location.reload();
      });
    } catch (error) {
      console.debug("Service worker registration skipped", error);
    }
  }

  async function checkLatestVersion() {
    if (checking) return;
    checking = true;

    try {
      const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });

      if (!response.ok) return;

      const payload = await response.json();
      const latestVersion = String(payload?.version || "").trim();
      if (!latestVersion) return;

      const url = new URL(window.location.href);
      const currentVersion = url.searchParams.get(VERSION_PARAM);

      if (currentVersion === latestVersion) return;

      url.searchParams.set(VERSION_PARAM, latestVersion);
      window.location.replace(url.toString());
    } catch (error) {
      console.debug("UI version check skipped", error);
    } finally {
      checking = false;
    }
  }

  void registerFreshNetworkWorker();
  void checkLatestVersion();

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void checkLatestVersion();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void checkLatestVersion();
  });

  window.setInterval(() => {
    if (!document.hidden) void checkLatestVersion();
  }, CHECK_INTERVAL_MS);
})();
