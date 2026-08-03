from __future__ import annotations

import smtplib
from email.message import EmailMessage

from .config import Config


def validate_email_config(cfg: Config) -> None:
    missing = [
        key
        for key, value in {
            "SMTP_USER": cfg.smtp_user,
            "SMTP_APP_PASSWORD": cfg.smtp_app_password,
            "MAIL_TO": cfg.mail_to,
        }.items()
        if not value
    ]

    if missing:
        raise ValueError(f".env에 다음 값을 입력하세요: {', '.join(missing)}")


def send_email(cfg: Config, subject: str, body: str) -> None:
    validate_email_config(cfg)

    message = EmailMessage()
    message["From"] = cfg.smtp_user
    message["To"] = cfg.mail_to
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP_SSL(cfg.smtp_host, cfg.smtp_port, timeout=30) as smtp:
        smtp.login(cfg.smtp_user, cfg.smtp_app_password)
        smtp.send_message(message)
