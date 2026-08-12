(() => {
  const ADMIN_NICKNAME = "관리자";
  const ROOT_ID = "imax-live-chat";

  function isOfficialAdmin(value) {
    return String(value || "").trim() === ADMIN_NICKNAME;
  }

  function decorateMessage(item) {
    if (!(item instanceof HTMLElement)) return;

    const name = item.querySelector(".imax-chat-meta strong");
    if (!name || !isOfficialAdmin(name.textContent)) return;

    item.classList.add("imax-chat-official-admin");

    item.style.setProperty("border", "0", "important");
    item.style.setProperty("background", "transparent", "important");
    item.style.setProperty("box-shadow", "none", "important");

    name.style.setProperty("color", "#ff7b72", "important");
    name.style.setProperty("font-weight", "900", "important");

    const message = item.querySelector(".imax-chat-text");
    if (message) {
      message.style.setProperty("color", "var(--text)", "important");
      message.style.setProperty("font-weight", "700", "important");
    }

    item.querySelectorAll(".imax-chat-admin-badge").forEach((badge) => {
      badge.style.setProperty("display", "none", "important");
    });
  }

  function decoratePresence(item) {
    if (!(item instanceof HTMLElement)) return;

    const name = item.querySelector(".imax-chat-presence-name");
    if (!name || !isOfficialAdmin(name.textContent)) return;

    item.classList.add("imax-chat-official-admin-presence");
    name.style.setProperty("color", "#ff7b72", "important");
    name.style.setProperty("font-weight", "900", "important");

    const dot = item.querySelector(".imax-chat-online-dot");
    if (dot) {
      dot.style.setProperty("background", "#ff7b72", "important");
      dot.style.setProperty("box-shadow", "0 0 10px rgba(255,123,114,.8)", "important");
    }

    if (!item.querySelector(".imax-chat-presence-admin-badge")) {
      const badge = document.createElement("span");
      badge.className = "imax-chat-presence-admin-badge";
      badge.textContent = "관리자";
      badge.title = "공식 관리자";
      badge.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "padding:2px 6px",
        "border:1px solid rgba(255,123,114,.45)",
        "border-radius:999px",
        "background:rgba(255,123,114,.12)",
        "color:#ff7b72",
        "font-size:10px",
        "font-weight:900",
        "line-height:1.2",
      ].join(";");
      item.appendChild(badge);
    }
  }

  function decorate(root = document) {
    root.querySelectorAll?.(".imax-chat-item").forEach(decorateMessage);
    root.querySelectorAll?.(".imax-chat-presence-user").forEach(decoratePresence);
  }

  function start() {
    decorate(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;

          if (node.matches?.(".imax-chat-item")) decorateMessage(node);
          if (node.matches?.(".imax-chat-presence-user")) decoratePresence(node);
          decorate(node);
        });
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
