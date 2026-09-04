from datetime import date

from run_subscriber_mailer import (
    _EventKeyDeliveryHistory,
    _is_current_or_future_event,
)


def test_delivery_history_blocks_new_signature_for_same_subscription_and_event():
    history = _EventKeyDeliveryHistory(
        {("sub-1", "event-1", "signature-a")}
    )

    assert ("sub-1", "event-1", "signature-a") in history
    assert ("sub-1", "event-1", "signature-b") in history


def test_delivery_history_keeps_other_subscriptions_and_events_independent():
    history = _EventKeyDeliveryHistory(
        {("sub-1", "event-1", "signature-a")}
    )

    assert ("sub-2", "event-1", "signature-b") not in history
    assert ("sub-1", "event-2", "signature-b") not in history


def test_delivery_history_add_updates_event_key_deduplication():
    history = _EventKeyDeliveryHistory()

    history.add(("sub-1", "event-1", "signature-a"))

    assert ("sub-1", "event-1", "signature-b") in history


def test_date_guard_blocks_past_but_allows_today_and_future():
    today = date(2026, 9, 4)

    assert not _is_current_or_future_event("2026-09-03", today)
    assert _is_current_or_future_event("2026-09-04", today)
    assert _is_current_or_future_event("2026-09-05", today)


def test_date_guard_preserves_unknown_date_behavior():
    assert _is_current_or_future_event("unknown", date(2026, 9, 4))
