from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from src.cgv_imax_watcher import subscriber_mailer_targeted as wrapper

mailer = wrapper.mailer


def main() -> int:
    password = mailer.smtp_password()
    if not password:
        raise RuntimeError("SMTP_APP_PASSWORD is required for private-key validation")

    private_key = mailer.load_private_key(
        Path(".github/secure/alert-private-key.enc.json"),
        password,
    )
    session, base_url = mailer.supabase_session()
    try:
        rows = mailer.fetch_subscriptions(session, base_url)
        subscriptions = []
        unreadable = 0

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
            except Exception:
                unreadable += 1
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

        verified = [sub for sub in subscriptions if sub.verified and sub.targets]
        pending = [sub for sub in subscriptions if not sub.verified and sub.targets]
        events = mailer.fetch_open_events(session, base_url)
        deliveries = mailer.fetch_deliveries(session, base_url)

        by_email = defaultdict(list)
        for sub in verified:
            by_email[sub.email].append(sub)

        eligible_jobs = 0
        for email_subscriptions in by_email.values():
            for event in events:
                eligible = any(
                    event.target_key in sub.targets
                    and mailer.event_opened_after_verification(event, sub)
                    and (sub.id, event.event_key, event.signature) not in deliveries
                    for sub in email_subscriptions
                )
                if eligible:
                    eligible_jobs += 1

        odyssey_subs = sum(
            1 for sub in verified if "odyssey_imax" in sub.targets
        )
        spider_subs = sum(
            1 for sub in verified if "spiderman_screenx" in sub.targets
        )
        odyssey_events = sum(
            1 for event in events if event.target_key == "odyssey_imax"
        )
        spider_events = sum(
            1 for event in events if event.target_key == "spiderman_screenx"
        )

        print("Target mailer dry-run validation: OK")
        print(f"active_rows={len(rows)}")
        print(f"decrypted_rows={len(subscriptions)}")
        print(f"unreadable_rows={unreadable}")
        print(f"verified_with_targets={len(verified)}")
        print(f"pending_with_targets={len(pending)}")
        print(f"odyssey_verified_targets={odyssey_subs}")
        print(f"spiderman_verified_targets={spider_subs}")
        print(f"odyssey_open_events={odyssey_events}")
        print(f"spiderman_open_events={spider_events}")
        print(f"eligible_email_event_jobs={eligible_jobs}")
        print("emails_sent=0")
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
