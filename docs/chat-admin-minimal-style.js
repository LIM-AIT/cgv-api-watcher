(() => {
  const STYLE_ID = "imax-chat-admin-minimal-style-v1";
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Keep official admin messages visually subtle. */
    .imax-chat-item.imax-chat-official-admin {
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    .imax-chat-item.imax-chat-official-admin:hover {
      background: rgba(255, 255, 255, 0.035) !important;
    }

    .imax-chat-item.imax-chat-official-admin .imax-chat-meta strong {
      color: #ff7b72 !important;
    }

    .imax-chat-item.imax-chat-official-admin .imax-chat-text {
      color: var(--text) !important;
      font-weight: 700 !important;
    }

    /* No extra badge inside the message list; the red nickname is enough. */
    .imax-chat-item .imax-chat-admin-badge {
      display: none !important;
    }
  `;

  document.head.appendChild(style);
})();
