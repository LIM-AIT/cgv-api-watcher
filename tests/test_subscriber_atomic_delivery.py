from src.cgv_imax_watcher import subscriber_mailer_targeted as targeted
from src.cgv_imax_watcher import subscriber_mailer_v3 as mailer


def make_event(event_key: str, target_date: str) -> mailer.OpenEvent:
    return mailer.OpenEvent(
        target_key="odyssey_imax",
        format_name="IMAX",
        movie_no="30001323",
        movie_keyword="오디세이",
        event_key=event_key,
        signature="a" * 64,
        opened_at="2026-09-10T02:34:42+00:00",
        theater_name="용산아이파크몰",
        site_no="0013",
        target_date=target_date,
        movie_name="The Odyssey",
        booking_url="https://example.com/book",
    )


def make_subscription(subscription_id: str) -> mailer.Subscription:
    return mailer.Subscription(
        id=subscription_id,
        email="user@example.com",
        token="token",
        verified=True,
        verified_at="2026-09-01T00:00:00+00:00",
        confirmation_sent_at="2026-09-01T00:00:01+00:00",
        targets=frozenset({"odyssey_imax"}),
    )


def test_delivery_claim_is_recipient_and_event_scoped(monkeypatch):
    calls = []

    def fake_call_rpc(session, base_url, name, payload):
        calls.append((name, payload))
        return True

    monkeypatch.setattr(targeted.mailer, "call_rpc", fake_call_rpc)

    event = make_event("0013|2026-09-20|03", "2026-09-20")
    sub_a = make_subscription("sub-a")
    sub_b = make_subscription("sub-b")

    assert targeted.reserve_delivery_claim(
        object(), "https://db", "secret", sub_a, "user@example.com", event
    )
    assert targeted.reserve_delivery_claim(
        object(), "https://db", "secret", sub_b, "user@example.com", event
    )

    assert len(calls) == 2
    assert all(name == "reserve_cgv_email_delivery_claim" for name, _ in calls)
    first = calls[0][1]
    second = calls[1][1]
    assert first["p_email_fingerprint"] == second["p_email_fingerprint"]
    assert first["p_event_key"] == second["p_event_key"]
    assert first["p_email_fingerprint"] == targeted.email_fingerprint(
        "user@example.com"
    )


def test_digest_combines_multiple_open_dates_into_one_message():
    first = make_event("0013|2026-09-16|03", "2026-09-16")
    second = make_event("0013|2026-09-17|03", "2026-09-17")

    message = targeted.digest_alert_message(
        "sender@example.com",
        "user@example.com",
        [second, first],
    )

    assert message["To"] == "user@example.com"
    assert message["Subject"] == "[CGV WATCHER] 예매 오픈 2건"
    body = message.get_content()
    assert "09/16" in body
    assert "09/17" in body
    assert body.count("https://example.com/book") == 2


def test_failed_claim_is_marked_without_release(monkeypatch):
    calls = []

    def fake_call_rpc(session, base_url, name, payload):
        calls.append((name, payload))
        return True

    monkeypatch.setattr(targeted.mailer, "call_rpc", fake_call_rpc)
    event = make_event("0013|2026-09-20|03", "2026-09-20")

    assert targeted.mark_delivery_claim_failed(
        object(),
        "https://db",
        "secret",
        "user@example.com",
        event,
        "SMTPException: ambiguous send result",
    )

    assert calls[0][0] == "mark_cgv_email_delivery_claim_failed"
    assert calls[0][1]["p_event_key"] == event.event_key
    assert "ambiguous send result" in calls[0][1]["p_failure_reason"]
