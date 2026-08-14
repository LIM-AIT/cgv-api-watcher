from __future__ import annotations

import base64
import hashlib
import json
import os
import smtplib
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
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
WEEKDAYS = ("월", "화", "수", "목", "금", "토", "일")
TARGET_LABELS = {
    "odyssey_imax": "오디세이 · IMAX",
    "spiderman_screenx": "스파이더맨 · SCREENX",
}


@dataclass(frozen=True)
class Subscription:
    id: str
    email: str
    token: str
    verified: bool
    verified_at: str | None
    confirmation_sent_at: str | None
    targets: frozenset[str]


@dataclass(frozen=True)
class OpenEvent:
    target_key: str
    format_name: str
    movie_no: str
    movie_keyword: str
    event_key: str
    signature: str
    opened_at: str
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
            "User-Agent": "cgv-api-watcher-subscriber-mailer/3.0",
        }
    )
    return session, base_url


def fetch_subscriptions(session: requests.Session, base_url: str) -> list[dict]:
    response = session.get(
        f"{base_url}/rest/v1/cgv_email_subscriptions",
        params={
            "select": (
                "id,email_ciphertext,created_at,verified,verified_at,"
                "confirmation_sent_at"
            ),
            "active": "eq.true",
            "order": "created_at.asc",
        },
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def fetch_deliveries(
    session: requests.Session,
    base_url: str,
) -> set[tuple[str, str, str]]:
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


def call_rpc_json(
    session: requests.Session,
    base_url: str,
    name: str,
    payload: dict,
):
    response = session.post(
        f"{base_url}/rest/v1/rpc/{name}",
        json=payload,
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def call_rpc(
    session: requests.Session,
    base_url: str,
    name: str,
    payload: dict,
) -> bool:
    return call_rpc_json(session, base_url, name, payload) is True


def fetch_targets(
    session: requests.Session,
    base_url: str,
    subscription_id: str,
    token: str,
) -> frozenset[str]:
    rows = call_rpc_json(
        session,
        base_url,
        "get_cgv_email_subscription_targets",
        {"p_id": subscription_id, "p_token": token},
    )
    return frozenset(
        str(row.get("target_key", ""))
        for row in (rows or [])
        if isinstance(row, dict) and bool(row.get("active"))
    )


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def status_targets(status: dict) -> dict[str, dict]:
    targets = status.get("targets")
    if isinstance(targets, dict) and targets:
        return {
            str(key): value
            for key, value in targets.items()
            if isinstance(value, dict)
        }

    # Backward-compatible fallback while the first multi-target watcher cycle deploys.
    return {
        "odyssey_imax": {
            "display_name": "The Odyssey",
            "movie_keyword": str(status.get("movie_keyword", "오디세이")),
            "movie_no": "30001323",
            "format": "IMAX",
            "theaters": status.get("theaters") or [],
        }
    }


def legacy_compatible_event_key(
    target_key: str,
    site_no: str,
    target_date: str,
    format_name: str,
) -> str:
    if target_key == "odyssey_imax":
        # Preserve v2 state/delivery identity to prevent duplicate Odyssey alerts.
        return f"{site_no}|{target_date}|03"
    return f"{target_key}|{site_no}|{target_date}|{format_name}"


def fetch_open_events(
    session: requests.Session,
    base_url: str,
) -> list[OpenEvent]:
    status_url = env("STATUS_URL", DEFAULT_STATUS_URL)
    response = requests.get(
        status_url,
        params={"t": str(int(__import__("time").time()))},
        headers={"Cache-Control": "no-cache"},
        timeout=20,
    )
    response.raise_for_status()
    status = response.json()

    observations: list[dict] = []
    details: dict[str, dict] = {}

    for target_key, target in status_targets(status).items():
        format_name = str(target.get("format") or "IMAX").strip().upper()
        movie_keyword = str(target.get("movie_keyword") or "").strip()
        movie_no = str(target.get("movie_no") or "").strip()

        for theater in target.get("theaters") or []:
            site_no = str(theater.get("site_no", "")).strip()
            theater_name = str(theater.get("name", "")).strip()
            fallback_booking_url = str(theater.get("booking_url", "")).strip()

            for result in theater.get("results") or []:
                target_date = str(result.get("date", "")).strip()
                if not site_no or not target_date:
                    continue

                event_key = legacy_compatible_event_key(
                    target_key,
                    site_no,
                    target_date,
                    format_name,
                )
                is_open = bool(
                    result.get("format_open")
                    if "format_open" in result
                    else result.get("imax_open")
                )
                movie_name = str(
                    result.get("movie_name") or target.get("display_name") or movie_keyword
                ).strip()
                booking_url = str(
                    result.get("booking_url") or fallback_booking_url
                ).strip()

                observations.append({"event_key": event_key, "is_open": is_open})
                details[event_key] = {
                    "target_key": target_key,
                    "format_name": format_name,
                    "movie_no": movie_no,
                    "movie_keyword": movie_keyword,
                    "is_open": is_open,
                    "theater_name": theater_name,
                    "site_no": site_no,
                    "target_date": target_date,
                    "movie_name": movie_name,
                    "booking_url": booking_url,
                }

    state_rows = call_rpc_json(
        session,
        base_url,
        "sync_cgv_email_event_states",
        {"p_states": observations},
    )
    state_by_key = {
        str(row.get("event_key", "")): row
        for row in (state_rows or [])
        if isinstance(row, dict)
    }

    events: list[OpenEvent] = []
    for event_key, detail in details.items():
        if not detail["is_open"]:
            continue
        state = state_by_key.get(event_key)
        if not state:
            continue
        generation = int(state.get("open_generation") or 0)
        opened_at = str(state.get("last_changed_at") or "")
        if generation <= 0 or not opened_at:
            continue

        signature_payload = "|".join(
            [
                event_key,
                detail["movie_keyword"],
                detail["movie_name"].lower(),
                "OPEN",
                str(generation),
            ]
        )
        signature = hashlib.sha256(signature_payload.encode("utf-8")).hexdigest()
        events.append(
            OpenEvent(
                target_key=detail["target_key"],
                format_name=detail["format_name"],
                movie_no=detail["movie_no"],
                movie_keyword=detail["movie_keyword"],
                event_key=event_key,
                signature=signature,
                opened_at=opened_at,
                theater_name=detail["theater_name"],
                site_no=detail["site_no"],
                target_date=detail["target_date"],
                movie_name=detail["movie_name"],
                booking_url=detail["booking_url"],
            )
        )
    return events


def event_opened_after_verification(
    event: OpenEvent,
    subscription: Subscription,
) -> bool:
    opened_at = parse_timestamp(event.opened_at)
    verified_at = parse_timestamp(subscription.verified_at)
    return bool(opened_at and verified_at and opened_at > verified_at)


def format_date_label(value: str) -> str:
    try:
        parsed = date.fromisoformat(value)
        return f"{parsed:%m/%d}({WEEKDAYS[parsed.weekday()]})"
    except ValueError:
        return value


def event_booking_url(event: OpenEvent) -> str:
    if event.booking_url:
        return event.booking_url
    if not event.movie_no or not event.site_no or not event.target_date:
        return env("DASHBOARD_URL", DEFAULT_DASHBOARD_URL)
    params = urlencode(
        {
            "movNo": event.movie_no,
            "scnYmd": event.target_date.replace("-", ""),
            "siteNm": f"CGV {event.theater_name}",
            "siteNo": event.site_no,
        }
    )
    return f"https://cgv.co.kr/cnm/movieBook/movie?{params}"


def verification_url(subscription: Subscription) -> str:
    dashboard = env("DASHBOARD_URL", DEFAULT_DASHBOARD_URL).rstrip("/") + "/"
    value = f"{subscription.id}.{subscription.token}"
    return f"{dashboard}app.html?{urlencode({'email_verify': value})}#imax-email-alert"


def target_unsubscribe_url(
    target_key: str,
    subscriptions: list[Subscription],
) -> str:
    dashboard = env("DASHBOARD_URL", DEFAULT_DASHBOARD_URL).rstrip("/") + "/"
    values = ",".join(
        f"{sub.id}.{sub.token}.{target_key}" for sub in subscriptions
    )
    return (
        f"{dashboard}?"
        f"{urlencode({'email_unsubscribe_target': values})}"
        "#imax-email-alert"
    )


def confirmation_message(
    sender: str,
    subscription: Subscription,
) -> EmailMessage:
    target_labels = [
        TARGET_LABELS[key] for key in subscription.targets if key in TARGET_LABELS
    ]
    target_label = ", ".join(target_labels) or "CGV 특별관"
    message = EmailMessage()
    message["From"] = sender
    message["To"] = subscription.email
    message["Subject"] = "[CGV WATCHER] 이메일 알림 등록 확인"
    message.set_content(
        f"{target_label} 예매 오픈 이메일 알림 등록 요청이 접수되었습니다.\n\n"
        "본인이 요청한 경우 아래 링크를 눌러 등록을 완료해주세요.\n\n"
        f"{verification_url(subscription)}\n\n"
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
    booking_url = event_booking_url(event)
    label = TARGET_LABELS.get(
        event.target_key,
        f"{event.movie_name} · {event.format_name}",
    )
    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = (
        f"[CGV {event.format_name} 오픈] {date_label} {event.theater_name}"
    )
    message.set_content(
        f"CGV {event.format_name} 예매가 새로 열렸습니다.\n\n"
        f"극장: {event.theater_name}\n"
        f"날짜: {date_label}\n"
        f"영화: {event.movie_name}\n"
        f"포맷: {event.format_name}\n\n"
        "메일 알림 등록 이후 예매 가능 상태로 변경된 것이 확인되어 발송된 알림입니다.\n\n"
        f"{label} 바로 예매하기:\n"
        f"{booking_url}\n\n"
        "자동 예매가 아닌 오픈 감지 알림입니다.\n"
        "링크를 열어 날짜와 회차를 직접 확인하고 예매하세요.\n\n"
        f"{label} 알림만 해지:\n"
        f"{target_unsubscribe_url(event.target_key, subscriptions)}"
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
                targets = fetch_targets(
                    session,
                    base_url,
                    str(row.get("id", "")),
                    token,
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
                    verified_at=row.get("verified_at"),
                    confirmation_sent_at=row.get("confirmation_sent_at"),
                    targets=targets,
                )
            )

        pending = [
            sub
            for sub in subscriptions
            if not sub.verified and not sub.confirmation_sent_at and sub.targets
        ]
        verified = [sub for sub in subscriptions if sub.verified and sub.targets]
        events = fetch_open_events(session, base_url)
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
                    if event.target_key in sub.targets
                    and event_opened_after_verification(event, sub)
                    and (
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
                f"{len(verified)} verified / "
                f"{len(events)} currently open / "
                "no new OPEN transitions"
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
                target_subscriptions = [
                    sub
                    for sub in verified_by_email[recipient]
                    if event.target_key in sub.targets
                ]
                smtp.send_message(
                    alert_message(
                        sender,
                        recipient,
                        event,
                        target_subscriptions,
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
            f"confirmations={confirmation_count}, "
            f"alerts={alert_count}, "
            f"verified={len(verified)}, "
            f"currently_open={len(events)}"
        )
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
