from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from src.cgv_imax_watcher import subscriber_mailer_targeted

KST = timezone(timedelta(hours=9))
_original_fetch_open_events = subscriber_mailer_targeted.mailer.fetch_open_events


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


# Production safety guard: keep dashboard/event-state synchronization intact,
# but never allow a past screening date to become a new outbound alert.
subscriber_mailer_targeted.mailer.fetch_open_events = _fetch_open_events_without_past_dates
main = subscriber_mailer_targeted.main


if __name__ == "__main__":
    raise SystemExit(main())
