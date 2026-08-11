(() => {
  const RETRY_DELAYS = [0, 100, 300, 700, 1500, 3000, 6000];

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

  let observer = null;
  let stopTimer = null;

  function verifyOrder() {
    const placed = placeInteractiveSections();
    if (!placed) return;

    if (stopTimer) window.clearTimeout(stopTimer);
    stopTimer = window.setTimeout(() => {
      placeInteractiveSections();
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

  RETRY_DELAYS.forEach((delay) => {
    window.setTimeout(verifyOrder, delay);
  });

  window.addEventListener("load", verifyOrder, { once: true });
})();
