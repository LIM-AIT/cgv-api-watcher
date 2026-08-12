(() => {
  const BLOCKED_TERMS = [
    "씨발",
    "시발",
    "ㅅㅂ",
    "ㅆㅂ",
    "병신",
    "ㅂㅅ",
    "개새끼",
    "개세끼",
    "개쉐끼",
    "좆",
    "존나",
    "섹스",
    "섹슈",
    "야동",
    "포르노",
    "자위",
    "딸딸이",
    "성관계",
    "sex",
  ];

  const MESSAGE = "욕설/음란 표현은 사용할 수 없습니다.";

  function normalizeContent(value) {
    return String(value || "")
      .toLocaleLowerCase("ko-KR")
      .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]+/g, "");
  }

  const normalizedTerms = BLOCKED_TERMS.map(normalizeContent);

  function containsBlockedContent(value) {
    const normalized = normalizeContent(value);
    if (!normalized) return false;
    return normalizedTerms.some((term) => term && normalized.includes(term));
  }

  function getMessageInput() {
    return document.getElementById("imax-chat-message");
  }

  function validateInput(input, report = false) {
    if (!input) return true;

    const blocked = containsBlockedContent(input.value);
    input.setCustomValidity(blocked ? MESSAGE : "");

    if (blocked && report) {
      input.reportValidity();
      input.focus();
    }

    return !blocked;
  }

  document.addEventListener(
    "input",
    (event) => {
      if (event.target?.id !== "imax-chat-message") return;
      validateInput(event.target, false);
    },
    true,
  );

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.id !== "imax-chat-form") return;

      const input = getMessageInput();
      if (validateInput(input, true)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  window.CGV_CHAT_CONTENT_FILTER = Object.freeze({
    containsBlockedContent,
  });
})();
