from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from src.cgv_imax_watcher import subscriber_mailer_targeted

KST = timezone(timedelta(hours=9))
_original_fetch_open_events = subscriber_mailer_targeted.mailer.fetch_open_events
_original_fetch_deliveries = subscriber_mailer_targeted.fetch_deliveries


class _EventKeyDeliveryHistory(set):
    """Treat one subscription + event key as permanently delivered.

    Event signatures include the OPEN generation. A transient CLOSED -> OPEN
    observation must not make the same screening date eligible for another
    email, so membership intentionally ignores the signature component.
    """

    def __init__(self, rows=()):
        super().__init__(rows)
        self._event_keys = {
            (str(row[0]), str(row[1]))
            for row in rows
            if isinstance(row, tuple) and len(row) >= 2
        }

    def __contains__(self, item):
        if isinstance(item, tuple) and len(item) >= 2:
            return (str(item[0]), str(item[1])) in self._event_keys
        return super().__contains__(item)

    def add(self, item):
        super().add(item)
        if isinstance(item, tuple) and len(item) >= 2:
            self._event_keys.add((str(item[0]), str(item[1])))


def _is_current_or_future_event(target_date: str, today_kst: date) -> bool:
    try:
        return date.fromisoformat(target_date) >= today_kst
    except ValueError:
        # Preserve existing behavior for malformed/unknown dates rather than
        # accidentally suppressing a legitimate alert.
        return True


def _fetch_open_events_without_past_dates(session, base_url):
    events = _original_fetch_open_events(session, base_url)
    today_kst = datetime.now(KST).date()
    return [
        event
        for event in events
        if _is_current_or_future_event(event.target_date, today_kst)
    ]


def _fetch_deliveries_once_per_event(session, base_url, mailer_secret):
    rows = _original_fetch_deliveries(session, base_url, mailer_secret)
    return _EventKeyDeliveryHistory(rows)


# Production safety guards:
# 1. Keep dashboard/event-state synchronization intact but never alert for a
#    past screening date.
# 2. A subscriber receives at most one alert for the same target/theater/date,
#    even if transient source data creates another OPEN generation/signature.
subscriber_mailer_targeted.mailer.fetch_open_events = _fetch_open_events_without_past_dates
subscriber_mailer_targeted.fetch_deliveries = _fetch_deliveries_once_per_event
main = subscriber_mailer_targeted.main


if __name__ == "__main__":
    raise SystemExit(main())
