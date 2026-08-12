(() => {
  const VERSION_URL = "./app-version.json";
  const VERSION_PARAM = "appv";
  const CHECK_INTERVAL_MS = 60000;
  let checking = false;

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
