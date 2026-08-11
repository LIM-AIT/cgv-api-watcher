(() => {
  function placeInteractiveSections() {
    const main = document.querySelector("main.app");
    const footer = main?.querySelector("footer.footer");
    const reactionGame = document.getElementById("reaction-game");
    const liveChat = document.getElementById("imax-live-chat");

    if (!main || !footer || !reactionGame || !liveChat) {
      return false;
    }

    // Keep both interactive sections in the normal page flow and swap
    // their previous visual order: reaction test first, live chat second.
    main.insertBefore(reactionGame, footer);
    main.insertBefore(liveChat, footer);

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
