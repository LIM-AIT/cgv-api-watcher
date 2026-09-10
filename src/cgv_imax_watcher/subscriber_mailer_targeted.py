from __future__ import annotations

import base64
import hashlib
import json
import smtplib
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import urlencode

import requests
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding

from . import subscriber_mailer_v3 as mailer

MANAGEMENT_WINDOW_SECONDS = 15 * 60
VALID_TARGETS = frozenset(mailer.TARGET_LABELS)


@dataclass(frozen=True)
class DuplicateRequest:
    alias_id: str
    alias_token: str
    canonical_id: str
    email: str
    target_key: str
    created_at: str | None


def target_unsubscribe_url(
    target_key: str,
    subscriptions: list[mailer.Subscription],
) -> str:
    dashboard = mailer.env(
        "DASHBOARD_URL",
        mailer.DEFAULT_DASHBOARD_URL,
    ).rstrip("/") + "/"
    values = ",".join(
        f"{sub.id}.{sub.token}.{target_key}" for sub in subscriptions
    )
    return (
        f"{dashboard}unsubscribe.html?"
        f"{urlencode({'email_unsubscribe_target': values})}"
    )


mailer.target_unsubscribe_url = target_unsubscribe_url


def fetch_subscription_rows(
    session: requests.Session,
    base_url: str,
    mailer_secret: str,
) -> list[dict]:
    rows = mailer.call_rpc_json(
        session,
        base_url,
        "fetch_cgv_email_subscriptions_for_mailer",
        {"p_mailer_secret": mailer_secret},
    )
    return [row for row in (rows or []) if isinstance(row, dict)]


def fetch_deliveries(
    session: requests.Session,
    base_url: str,
    mailer_secret: str,
) -> set[tuple[str, str, str]]:
    rows = mailer.call_rpc_json(
        session,
        base_url,
        "fetch_cgv_email_deliveries_for_mailer",
        {"p_mailer_secret": mailer_secret},
    )
    return {
        (
            str(row.get("subscription_id", "")),
            str(row.get("event_key", "")),
            str(row.get("event_signature", "")),
        )
        for row in (rows or [])
        if isinstance(row, dict)
    }


def load_mailer_secret(private_key) -> str:
    path = Path(
        mailer.env(
            "MAILER_PROOF_FILE",
            ".github/secure/mailer-proof.enc.json",
        )
    )
    payload = json.loads(path.read_text(encoding="utf-8"))
    ciphertext = base64.b64decode(payload["ciphertext"])
    plaintext = private_key.decrypt(
        ciphertext,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    secret = plaintext.decode("utf-8").strip()
    if not secret:
        raise ValueError("Mailer proof is empty")
    return secret


def email_fingerprint(email: str) -> str:
    return hashlib.sha256(email.encode("utf-8")).hexdigest()


def is_recent(value: str | None) -> bool:
    parsed = mailer.parse_timestamp(value)
    if parsed is None:
        return False
    now = datetime.now(timezone.utc)
    return (now - parsed).total_seconds() <= MANAGEMENT_WINDOW_SECONDS


def claim_identity(
    session: requests.Session,
    base_url: str,
    mailer_secret: str,
    subscription_id: str,
    token: str,
    email: str,
) -> str:
    result = mailer.call_rpc_json(
        session,
        base_url,
        "claim_cgv_email_identity",
        {
            "p_mailer_secret": mailer_secret,
            "p_id": subscription_id,
            "p_token": token,
            "p_email_fingerprint": email_fingerprint(email),
        },
    )
    return str(result or "")


def reserve_management_notice(
    session: requests.Session,
    base_url: str,
    mailer_secret: str,
    request: DuplicateRequest,
) -> bool:
    return mailer.call_rpc(
        session,
        base_url,
        "reserve_cgv_email_management_notice",
        {
            "p_mailer_secret": mailer_secret,
            "p_id": request.alias_id,
            "p_token": request.alias_token,
        },
    )


def reserve_delivery_claim(
    session: requests.Session,
    base_url: str,
    mailer_secret: str,
    subscription: mailer.Subscription,
    recipient: str,
    event: mailer.OpenEvent,
) -> bool:
    return mailer.call_rpc(
        session,
        base_url,
        "reserve_cgv_email_delivery_claim",
        {
            "p_mailer_secret": mailer_secret,
            "p_id": subscription.id,
            "p_token": subscription.token,
            "p_email_fingerprint": email_fingerprint(recipient),
            "p_event_key": event.event_key,
            "p_event_signature": event.signature,
        },
    )


def mark_delivery_claim_sent(
    session: requests.Session,
    base_url: str,
    mailer_secret: str,
    recipient: str,
    event: mailer.OpenEvent,
) -> bool:
    return mailer.call_rpc(
        session,
        base_url,
        "mark_cgv_email_delivery_claim_sent",
        {
            "p_mailer_secret": mailer_secret,
            "p_email_fingerprint": email_fingerprint(recipient),
            "p_event_key": event.event_key,
            "p_event_signature": event.signature,
        },
    )


def mark_delivery_claim_failed(
    session: requests.Session,
    base_url: str,
    mailer_secret: str,
    recipient: str,
    event: mailer.OpenEvent,
    reason: str,
) -> bool:
    return mailer.call_rpc(
        session,
        base_url,
        "mark_cgv_email_delivery_claim_failed",
        {
            "p_mailer_secret": mailer_secret,
            "p_email_fingerprint": email_fingerprint(recipient),
            "p_event_key": event.event_key,
            "p_event_signature": event.signature,
            "p_failure_reason": reason,
        },
    )


def collect_duplicate_requests(
    session: requests.Session,
    base_url: str,
    private_key,
    mailer_secret: str,
    rows: list[dict],
) -> list[DuplicateRequest]:
    duplicates: list[DuplicateRequest] = []

    for row in rows:
        if bool(row.get("identity_claimed")):
            continue

        subscription_id = str(row.get("id", ""))
        try:
            email, token = mailer.decrypt_subscription(
                private_key,
                str(row.get("email_ciphertext", "")),
            )
            canonical_id = claim_identity(
                session,
                base_url,
                mailer_secret,
                subscription_id,
                token,
                email,
            )
        except Exception as exc:
            print(
                "Identity claim skipped for "
                f"{subscription_id}: {type(exc).__name__}"
            )
            continue

        target_key = str(row.get("registration_target", ""))
        is_new_duplicate = (
            canonical_id
            and canonical_id != subscription_id
            and target_key in VALID_TARGETS
            and not row.get("confirmation_sent_at")
            and is_recent(row.get("created_at"))
        )
        if not is_new_duplicate:
            continue

        duplicates.append(
            DuplicateRequest(
                alias_id=subscription_id,
                alias_token=token,
                canonical_id=canonical_id,
                email=email,
                target_key=target_key,
                created_at=row.get("created_at"),
            )
        )

    return duplicates


def build_subscriptions(
    session: requests.Session,
    base_url: str,
    private_key,
    rows: list[dict],
) -> list[mailer.Subscription]:
    subscriptions: list[mailer.Subscription] = []

    for row in rows:
        try:
            email, token = mailer.decrypt_subscription(
                private_key,
                str(row.get("email_ciphertext", "")),
            )
            targets = mailer.fetch_targets(
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
            mailer.Subscription(
                id=str(row.get("id", "")),
                email=email,
                token=token,
                verified=bool(row.get("verified")),
                verified_at=row.get("verified_at"),
                confirmation_sent_at=row.get("confirmation_sent_at"),
                targets=targets,
            )
        )

    return subscriptions


def management_url(
    request: DuplicateRequest,
    status: str,
) -> str:
    dashboard = mailer.env(
        "DASHBOARD_URL",
        mailer.DEFAULT_DASHBOARD_URL,
    ).rstrip("/") + "/"
    action = f"{request.alias_id}.{request.alias_token}"
    params = {
        "email_manage_target": f"{action}.{request.target_key}",
    }
    if status == "pending":
        params["email_verify"] = action
    return f"{dashboard}app.html?{urlencode(params)}#imax-email-alert"


def management_message(
    sender: str,
    request: DuplicateRequest,
    status: str,
) -> EmailMessage:
    label = mailer.TARGET_LABELS.get(
        request.target_key,
        "CGV 특별관",
    )
    message = EmailMessage()
    message["From"] = sender
    message["To"] = request.email
    message["Subject"] = "[CGV WATCHER] 이미 등록된 이메일입니다"

    if status == "pending":
        intro = (
            "이미 CGV WATCHER에 등록 요청이 있는 이메일입니다.\n"
            "중복 구독은 만들지 않았습니다.\n\n"
            "아래 링크를 눌러 이메일 인증을 완료하고 "
            f"{label} 알림을 설정해주세요."
        )
    else:
        intro = (
            "이미 CGV WATCHER에 등록된 이메일입니다.\n"
            "중복 구독은 만들지 않았습니다.\n\n"
            f"아래 링크를 눌러 {label} 알림을 추가하거나 확인해주세요."
        )

    message.set_content(
        f"{intro}\n\n"
        f"{management_url(request, status)}\n\n"
        "본인이 요청하지 않았다면 이 메일을 무시하시면 됩니다."
    )
    return message


def digest_alert_message(
    sender: str,
    recipient: str,
    events: list[mailer.OpenEvent],
) -> EmailMessage:
    ordered = sorted(
        events,
        key=lambda event: (
            event.target_date,
            event.theater_name,
            event.target_key,
            event.event_key,
        ),
    )
    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = f"[CGV WATCHER] 예매 오픈 {len(ordered)}건"

    lines = [
        "CGV 특별관 예매 오픈 알림입니다.",
        "동시에 확인된 여러 일정은 한 통으로 묶어 안내합니다.",
        "",
    ]
    for event in ordered:
        label = mailer.TARGET_LABELS.get(
            event.target_key,
            f"{event.movie_name} · {event.format_name}",
        )
        lines.extend(
            [
                f"- {mailer.format_date_label(event.target_date)} | "
                f"{event.theater_name} | {label}",
                f"  {mailer.event_booking_url(event)}",
            ]
        )

    dashboard = mailer.env(
        "DASHBOARD_URL",
        mailer.DEFAULT_DASHBOARD_URL,
    ).rstrip("/") + "/"
    lines.extend(
        [
            "",
            "자동 예매가 아닌 오픈 감지 알림입니다.",
            f"알림 설정 관리: {dashboard}",
        ]
    )
    message.set_content("\n".join(lines))
    return message


def subscription_status(
    session: requests.Session,
    base_url: str,
    request: DuplicateRequest,
) -> str:
    result = mailer.call_rpc_json(
        session,
        base_url,
        "get_cgv_email_subscription_status",
        {
            "p_id": request.alias_id,
            "p_token": request.alias_token,
        },
    )
    return str(result or "invalid")


def main() -> int:
    sender = mailer.env("SMTP_USER")
    password = mailer.smtp_password()
    if not sender or not password:
        raise RuntimeError("SMTP_USER and SMTP_APP_PASSWORD are required")

    private_key_path = Path(
        mailer.env(
            "SUBSCRIBER_PRIVATE_KEY_FILE",
            ".github/secure/alert-private-key.enc.json",
        )
    )
    private_key = mailer.load_private_key(private_key_path, password)
    mailer_secret = load_mailer_secret(private_key)

    session, base_url = mailer.supabase_session()
    try:
        initial_rows = fetch_subscription_rows(
            session,
            base_url,
            mailer_secret,
        )
        duplicate_requests = collect_duplicate_requests(
            session,
            base_url,
            private_key,
            mailer_secret,
            initial_rows,
        )

        rows = fetch_subscription_rows(
            session,
            base_url,
            mailer_secret,
        )
        subscriptions = build_subscriptions(
            session,
            base_url,
            private_key,
            rows,
        )

        management_jobs: list[tuple[DuplicateRequest, str]] = []
        suppressed_confirmation_ids: set[str] = set()
        for request in duplicate_requests:
            status = subscription_status(session, base_url, request)
            if status not in {"pending", "verified"}:
                continue
            if not reserve_management_notice(
                session,
                base_url,
                mailer_secret,
                request,
            ):
                continue
            management_jobs.append((request, status))
            if status == "pending":
                suppressed_confirmation_ids.add(request.canonical_id)

        pending = [
            sub
            for sub in subscriptions
            if not sub.verified
            and not sub.confirmation_sent_at
            and sub.targets
            and sub.id not in suppressed_confirmation_ids
        ]
        verified = [
            sub for sub in subscriptions if sub.verified and sub.targets
        ]
        events = mailer.fetch_open_events(session, base_url)
        deliveries = fetch_deliveries(
            session,
            base_url,
            mailer_secret,
        )

        verified_by_email: dict[str, list[mailer.Subscription]] = defaultdict(list)
        for sub in verified:
            verified_by_email[sub.email].append(sub)

        alert_jobs: dict[
            str,
            list[tuple[mailer.OpenEvent, list[mailer.Subscription]]],
        ] = defaultdict(list)
        for email, email_subscriptions in verified_by_email.items():
            for event in events:
                eligible = [
                    sub
                    for sub in email_subscriptions
                    if event.target_key in sub.targets
                    and mailer.event_opened_after_verification(event, sub)
                    and (
                        sub.id,
                        event.event_key,
                        event.signature,
                    )
                    not in deliveries
                ]
                if eligible:
                    alert_jobs[email].append((event, eligible))

        if not pending and not management_jobs and not alert_jobs:
            print(
                "Subscriber mailer idle: "
                f"{len(verified)} verified / "
                f"{len(events)} currently open / "
                "no new work"
            )
            return 0

        smtp_host = mailer.env("SMTP_HOST", "smtp.gmail.com")
        smtp_port = int(mailer.env("SMTP_PORT", "465"))
        confirmation_count = 0
        management_count = 0
        alert_email_count = 0
        alert_event_count = 0
        suppressed_duplicate_count = 0

        with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30) as smtp:
            smtp.login(sender, password)

            for sub in pending:
                smtp.send_message(mailer.confirmation_message(sender, sub))
                if mailer.call_rpc(
                    session,
                    base_url,
                    "mark_cgv_email_confirmation_sent",
                    {"p_id": sub.id, "p_token": sub.token},
                ):
                    confirmation_count += 1

            for request, status in management_jobs:
                smtp.send_message(
                    management_message(sender, request, status)
                )
                if status == "pending":
                    mailer.call_rpc(
                        session,
                        base_url,
                        "mark_cgv_email_confirmation_sent",
                        {
                            "p_id": request.alias_id,
                            "p_token": request.alias_token,
                        },
                    )
                management_count += 1

            for recipient, candidates in alert_jobs.items():
                reserved: list[
                    tuple[mailer.OpenEvent, list[mailer.Subscription]]
                ] = []

                for event, eligible in candidates:
                    representative = eligible[0]
                    if reserve_delivery_claim(
                        session,
                        base_url,
                        mailer_secret,
                        representative,
                        recipient,
                        event,
                    ):
                        reserved.append((event, eligible))
                    else:
                        suppressed_duplicate_count += 1

                if not reserved:
                    continue

                reserved_events = [event for event, _ in reserved]
                try:
                    if len(reserved_events) == 1:
                        event = reserved_events[0]
                        target_subscriptions = [
                            sub
                            for sub in verified_by_email[recipient]
                            if event.target_key in sub.targets
                        ]
                        message = mailer.alert_message(
                            sender,
                            recipient,
                            event,
                            target_subscriptions,
                        )
                    else:
                        message = digest_alert_message(
                            sender,
                            recipient,
                            reserved_events,
                        )
                    smtp.send_message(message)
                except Exception as exc:
                    reason = f"{type(exc).__name__}: {exc}"
                    for event, _ in reserved:
                        mark_delivery_claim_failed(
                            session,
                            base_url,
                            mailer_secret,
                            recipient,
                            event,
                            reason,
                        )
                    print(
                        "Subscriber alert send failed after reservation; "
                        "automatic retry suppressed to prevent duplicates: "
                        f"{type(exc).__name__}"
                    )
                    continue

                alert_email_count += 1
                alert_event_count += len(reserved)

                for event, eligible in reserved:
                    if not mark_delivery_claim_sent(
                        session,
                        base_url,
                        mailer_secret,
                        recipient,
                        event,
                    ):
                        print(
                            "WARNING: delivery claim completion failed; "
                            "reservation remains and still blocks duplicate send: "
                            f"{event.event_key}"
                        )

                    for sub in eligible:
                        if mailer.call_rpc(
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

        print(
            "Subscriber mailer complete: "
            f"confirmations={confirmation_count}, "
            f"management={management_count}, "
            f"alert_emails={alert_email_count}, "
            f"alert_events={alert_event_count}, "
            f"duplicate_claims_suppressed={suppressed_duplicate_count}, "
            f"verified={len(verified)}, "
            f"currently_open={len(events)}"
        )
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
