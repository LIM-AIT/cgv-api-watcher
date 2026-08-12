(() => {
  const VERSION_URL = "./app-version.json";
  const VERSION_PARAM = "appv";
  const CHECK_INTERVAL_MS = 60000;
  const SERVICE_WORKER_SCOPE = "./";
  const CONTROLLER_RELOAD_KEY = "cgv-sw-controller-reload-v3";

  let checking = false;
  let reloadingForController = false;

  function reloadOnceForController() {
    if (reloadingForController) return;
    if (sessionStorage.getItem(CONTROLLER_RELOAD_KEY) === "1") return;

    reloadingForController = true;
    sessionStorage.setItem(CONTROLLER_RELOAD_KEY, "1");
    window.location.reload();
  }

  async function registerFreshNetworkWorker() {
    if (!("serviceWorker" in navigator)) return;

    try {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!navigator.serviceWorker.controller) return;
        reloadOnceForController();
      });

      const pageUrl = new URL(window.location.href);
      const pageToken =
        pageUrl.searchParams.get("t") ||
        pageUrl.searchParams.get(VERSION_PARAM) ||
        Date.now().toString();

      const workerUrl = `./sw.js?swv=3&t=${encodeURIComponent(pageToken)}`;

      await navigator.serviceWorker.register(workerUrl, {
        scope: SERVICE_WORKER_SCOPE,
        updateViaCache: "none",
      });

      await navigator.serviceWorker.ready;

      if (!navigator.serviceWorker.controller) {
        reloadOnceForController();
        return;
      }

      sessionStorage.removeItem(CONTROLLER_RELOAD_KEY);
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
    if (event.persisted) {
      void registerFreshNetworkWorker();
      void checkLatestVersion();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void registerFreshNetworkWorker();
      void checkLatestVersion();
    }
  });

  window.setInterval(() => {
    if (!document.hidden) void checkLatestVersion();
  }, CHECK_INTERVAL_MS);
})();
