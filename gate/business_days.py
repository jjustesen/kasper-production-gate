"""Business-day arithmetic (Mon-Fri, no holiday calendar)."""

from datetime import date, timedelta


def business_days_between(start: date, end: date) -> int:
    """Business days in (start, end]. The start day is day 0 and never counts.

    Returns 0 when end is on or before start.
    """
    if end <= start:
        return 0
    days = 0
    current = start
    while current < end:
        current += timedelta(days=1)
        if current.weekday() < 5:
            days += 1
    return days


def add_business_days(start: date, n: int) -> date:
    """The earliest date that is n business days after start."""
    current = start
    added = 0
    while added < n:
        current += timedelta(days=1)
        if current.weekday() < 5:
            added += 1
    return current
