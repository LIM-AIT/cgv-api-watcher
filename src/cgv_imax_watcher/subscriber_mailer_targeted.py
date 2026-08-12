from __future__ import annotations

from urllib.parse import urlencode

from . import subscriber_mailer_v3 as mailer


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
main = mailer.main
