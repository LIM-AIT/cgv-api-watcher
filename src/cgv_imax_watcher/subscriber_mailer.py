from __future__ import annotations

import base64
import hashlib
import json
import os
import smtplib
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import urlencode

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

DEFAULT_SUPABASE_URL = "https://yxrfarlhcyaaslwmdyww.supabase.co"
DEFAULT_SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4cmZhcmxoY3lhYXNsd21keXd3Iiw"
    "icm9sZSI6ImFub24iLCJpYXQiOjE3NzE5OTk2NDksImV4cCI6MjA4NzU3NTY0OX0."
    "z7_2YgAz2HetxJ2dYV54WfLM_3TQMe8YtH1oq_p-k-Q"
)
DEFAULT_STATUS_URL = (
    "https://raw.githubusercontent.com/LIM-AIT/cgv-api-watcher/"
    "main/docs/status.json"
)
DEFAULT_DASHBOARD_URL = "https://lim-ait.github.io/cgv-api-watcher/"
IMAX_GRADE_CODE = "03"
WEEKDAYS = ("월", "화", "수", "목", "금", "토", "일")


@dataclass(frozen=True)
class Subscription:
    id: str
    email: str
    token: str
    verified: bool
    confirmation_sent_at: str | None


@dataclass(frozen=True)
class OpenEvent:
    event_key: str
    signature: str
    theater_name: str
    site_no: str
    target_date: str
    movie_name: str
    booking_url: str


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def smtp_password() -> str:
    return env("SMTP_APP_PASSWORD").replace(" ", "")


def load_private_key(path: Path, password: str):
    payload = json.loads(path.read_text(encoding="utf-8"))
    salt = base64.b64decode(payload["salt"])
    nonce = base64.b64decode(payload["nonce"])
    ciphertext = base64.b64decode(payload["ciphertext"])
    iterations = int(payload.get("iterations", 600_000))

    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=iterations,
    )
    key = kdf.derive(password.encode("utf-8"))
    private_pem = AESGCM(key).decrypt(
        nonce,
        ciphertext,
        b"cgv-email-alert-private-key-v1",
    )
    return serialization.load_pem_private_key(private_pem, password=None)


def decrypt_subscription(private_key, ciphertext: str) -> tuple[str, str]:
    plaintext = private_key.decrypt(
        base64.b64decode(ciphertext),
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    payload = json.loads(plaintext.decode("utf-8"))
    email = str(payload.get("e", "")).strip().lower()
    token = str(payload.get("t", "")).strip()

    if not email or "@" not in email or not token:
        raise ValueError("Invalid encrypted subscription payload")

    return email, token


def supabase_session() -> tuple[requests.Session, str]:
    base_url = env("SUPABASE_URL", DEFAULT_SUPABASE_URL).rstrip("/")
    key = env("SUPABASE_ANON_KEY", DEFAULT_SUPABASE_ANON_KEY)
    session = requests.Session()
    session.headers.update(
        {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "cgv-api-watcher-subscriber-mailer/1.0",
        }
    )
    return session, base_url


def fetch_subscriptions(session: requests.Session, base_url: str) -> list[dict]:
    response = session.get(
        f"{base_url}/rest/v1/cgv_email_subscriptions",
        params={
            "select": (
                "id,email_ciphertext,created_at,verified,"
                "confirmation_sent_at"
            ),
            "active": "eq.true",
            "order": "created_at.asc",
        },
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def fetch_deliveries(session: requests.Session, base_url: str) -> set[tuple[str, str, str]]:
    response = session.get(
        f"{base_url}/rest/v1/cgv_email_deliveries",
        params={"select": "subscription_id,event_key,event_signature"},
        timeout=20,
    )
    response.raise_for_status()
    return {
        (
            str(row.get("subscription_id", "")),
            str(row.get("event_key", "")),
            str(row.get("event_signature", "")),
        )
        for row in response.json()
    }


def call_rpc(
    session: requests.Session,
    base_url: str,
    name: str,
    payload: dict,
) -> bool:
    response = session.post(
        f"{base_url}/rest/v1/rpc/{name}",
        json=payload,
        timeout=20,
    )
    response.raise_for_status()
    return response.json() is True


def fetch_open_events() -> list[OpenEvent]:
    status_url = env("STATUS_URL", DEFAULT_STATUS_URL)
    response = requests.get(
        status_url,
        params={"t": str(int(__import__("time").time()))},
        headers={"Cache-Control": "no-cache"},
        timeout=20,
    )
    response.raise_for_status()
    status = response.json()
    movie_keyword = str(status.get("movie_keyword", "")).strip()

    events: list[OpenEvent] = []
    for theater in status.get("theaters") or []:
        site_no = str(theater.get("site_no", "")).strip()
        theater_name = str(theater.get("name", "")).strip()
        booking_url = str(theater.get("booking_url", "")).strip()

        for result in theater.get("results") or []:
            if not bool(result.get("imax_open")):
                continue

            target_date = str(result.get("date", "")).strip()
            movie_name = str(result.get("movie_name") or movie_keyword).strip()
            if not site_no or not target_date:
                continue

            event_key = f"{site_no}|{target_date}|{IMAX_GRADE_CODE}"
            signature_payload = "|".join(
                [
                    event_key,
                    movie_keyword,
                    movie_name.lower(),
                    "OPEN",
                ]
            )
            signature = hashlib.sha256(
                signature_payload.encode("utf-8")
            ).hexdigest()

            events.append(
                OpenEvent(
                    event_key=event_key,
                    signature=signature,
                    theater_name=theater_name,
                    site_no=site_no,
                    target_date=target_date,
                    movie_name=movie_name,
                    booking_url=booking_url,
                )
            )

    return events


def format_date_label(value: str) -> str:
    try:
        parsed = date.fromisoformat(value)
        return f"{parsed:%m/%d}({WEEKDAYS[parsed.weekday()]})"
    except ValueError:
        return value


def action_url(param: str, subscriptions: list[Subscription]) -> str:
    dashboard = env("DASHBOARD_URL", DEFAULT_DASHBOARD_URL).rstrip("/") + "/"
    values = ",".join(f"{sub.id}.{sub.token}" for sub in subscriptions)
    return f"{dashboard}?{urlencode({param: values})}#imax-email-alert"


def confirmation_message(sender: str, subscription: Subscription) -> EmailMessage:
    message = EmailMessage()
    message["From"] = sender
    message["To"] = subscription.email
    message["Subject"] = "[CGV IMAX] 이메일 알림 등록 확인"
    message.set_content(
        "CGV IMAX 예매 오픈 이메일 알림 등록 요청이 접수되었습니다.\n\n"
        "본인이 요청한 경우 아래 링크를 눌러 등록을 완료해주세요.\n\n"
        f"{action_url('email_verify', [subscription])}\n\n"
        "확인 전에는 예매 오픈 알림이 발송되지 않습니다.\n"
        "본인이 요청하지 않았다면 이 메일을 무시하시면 됩니다."
    )
    return message


def alert_message(
    sender: str,
    recipient: str,
    event: OpenEvent,
    subscriptions: list[Subscription],
) -> EmailMessage:
    date_label = format_date_label(event.target_date)
    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = f"[CGV IMAX 오픈] {date_label} {event.theater_name}"
    message.set_content(
        "CGV IMAX 예매가 열렸습니다.\n\n"
        f"극장: {event.theater_name}\n"
        f"날짜: {date_label}\n"
        f"영화: {event.movie_name}\n\n"
        "CGV 상영 일정 데이터에서 해당 영화의 IMAX 예매 오픈이 확인되었습니다.\n\n"
        "CGV 예매 페이지:\n"
        f"{event.booking_url}\n\n"
        "자동 예매가 아닌 오픈 감지 알림입니다.\n"
        "링크를 열어 날짜와 회차를 직접 확인하고 예매하세요.\n\n"
        "메일 알림 해지:\n"
        f"{action_url('email_unsubscribe', subscriptions)}"
    )
    return message


def main() -> int:
    sender = env("SMTP_USER")
    password = smtp_password()
    if not sender or not password:
        raise RuntimeError("SMTP_USER and SMTP_APP_PASSWORD are required")

    private_key_path = Path(
        env(
            "SUBSCRIBER_PRIVATE_KEY_FILE",
            ".github/secure/alert-private-key.enc.json",
        )
    )
    private_key = load_private_key(private_key_path, password)

    session, base_url = supabase_session()
    try:
        rows = fetch_subscriptions(session, base_url)
        subscriptions: list[Subscription] = []

        for row in rows:
            try:
                email, token = decrypt_subscription(
                    private_key,
                    str(row.get("email_ciphertext", "")),
                )
            except Exception as exc:
                print(
                    "Skipping unreadable subscription "
                    f"{row.get('id')}: {type(exc).__name__}"
                )
                continue

            subscriptions.append(
                Subscription(
                    id=str(row.get("id", "")),
                    email=email,
                    token=token,
                    verified=bool(row.get("verified")),
                    confirmation_sent_at=row.get("confirmation_sent_at"),
                )
            )

        pending = [
            sub
            for sub in subscriptions
            if not sub.verified and not sub.confirmation_sent_at
        ]
        verified = [sub for sub in subscriptions if sub.verified]
        events = fetch_open_events()
        deliveries = fetch_deliveries(session, base_url)

        verified_by_email: dict[str, list[Subscription]] = defaultdict(list)
        for sub in verified:
            verified_by_email[sub.email].append(sub)

        alert_jobs: list[tuple[str, OpenEvent, list[Subscription]]] = []
        for email, email_subscriptions in verified_by_email.items():
            for event in events:
                eligible = [
                    sub
                    for sub in email_subscriptions
                    if (
                        sub.id,
                        event.event_key,
                        event.signature,
                    )
                    not in deliveries
                ]
                if eligible:
                    alert_jobs.append((email, event, eligible))

        if not pending and not alert_jobs:
            print(
                "Subscriber mailer idle: "
                f"{len(verified)} verified / {len(events)} open events"
            )
            return 0

        smtp_host = env("SMTP_HOST", "smtp.gmail.com")
        smtp_port = int(env("SMTP_PORT", "465"))
        confirmation_count = 0
        alert_count = 0

        with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30) as smtp:
            smtp.login(sender, password)

            for sub in pending:
                smtp.send_message(confirmation_message(sender, sub))
                if call_rpc(
                    session,
                    base_url,
                    "mark_cgv_email_confirmation_sent",
                    {"p_id": sub.id, "p_token": sub.token},
                ):
                    confirmation_count += 1

            for recipient, event, eligible in alert_jobs:
                all_active_for_email = verified_by_email[recipient]
                smtp.send_message(
                    alert_message(
                        sender,
                        recipient,
                        event,
                        all_active_for_email,
                    )
                )

                for sub in eligible:
                    if call_rpc(
                        session,
                        base_url,
                        "record_cgv_email_delivery",
                        {
                            "p_id": sub.id,
                            "p_token": sub.token,
                            "p_event_key": event.event_key,
                            "p_event_signature": event.signature,
                        },
                    ):
                        deliveries.add(
                            (sub.id, event.event_key, event.signature)
                        )
                alert_count += 1

        print(
            "Subscriber mailer complete: "
            f"confirmations={confirmation_count}, alerts={alert_count}, "
            f"verified={len(verified)}, open_events={len(events)}"
        )
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
