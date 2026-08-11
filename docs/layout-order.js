(() => {
  function placeInteractiveSections() {
    const main = document.querySelector("main.app");
    const footer = main?.querySelector("footer.footer");
    const reactionGame = document.getElementById("reaction-game");
    const liveChat = document.getElementById("imax-live-chat");

    if (!main || !footer || !reactionGame || !liveChat) {
      return false;
    }

    // Final order: live chat first, reaction-speed test directly below it.
    main.insertBefore(liveChat, footer);
    main.insertBefore(reactionGame, footer);

    return true;
  }

  if (placeInteractiveSections()) return;

  const observer = new MutationObserver(() => {
    if (placeInteractiveSections()) {
      observer.disconnect();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.setTimeout(() => {
    placeInteractiveSections();
    observer.disconnect();
  }, 5000);
})();
