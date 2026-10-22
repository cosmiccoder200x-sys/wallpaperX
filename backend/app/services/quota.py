"""Usage quotas for the optimizer.

Authenticated users are limited by their plan's daily allowance, tracked in
PostgreSQL. Anonymous users get the free-plan daily allowance tracked per IP in
process memory (multi-worker deployments therefore enforce the limit per worker;
documented in instructions.md, use a shared store for strict global limits).

Per-minute burst protection applies to everyone.
"""

import logging
import threading
from datetime import date
from typing import Dict, Tuple

from app.config import config
from app.models import PlanLimits, User
from app.services.database import (
    DatabaseUnavailable,
    get_user_daily_optimizations,
    increment_optimization_count,
)

logger = logging.getLogger(__name__)


class QuotaExceeded(Exception):
    def __init__(self, message: str, retry_after: int = 60, code: str = "QUOTA_EXCEEDED"):
        super().__init__(message)
        self.message = message
        self.retry_after = retry_after
        self.code = code


_lock = threading.Lock()
_minute_windows: Dict[str, Tuple[int, int]] = {}
_daily_counts: Dict[str, Tuple[date, int]] = {}


def _prune(now: int, today: date) -> None:
    if len(_minute_windows) > 10_000:
        for key, (minute, _count) in list(_minute_windows.items()):
            if minute != now:
                _minute_windows.pop(key, None)
    if len(_daily_counts) > 100_000:
        for key, (day, _count) in list(_daily_counts.items()):
            if day != today:
                _daily_counts.pop(key, None)


def _consume_minute(key: str) -> None:
    import time

    now = int(time.time() // 60)
    with _lock:
        minute, count = _minute_windows.get(key, (now, 0))
        if minute != now:
            minute, count = now, 0
        count += 1
        _minute_windows[key] = (minute, count)
    if count > config.RATE_LIMIT_PER_MINUTE:
        raise QuotaExceeded(
            "Too many requests. Please wait a moment and try again.",
            retry_after=60,
            code="RATE_LIMITED",
        )


def _anonymous_daily_remaining(identifier: str, limit: int) -> int:
    today = date.today()
    with _lock:
        day, count = _daily_counts.get(identifier, (today, 0))
        if day != today:
            return limit
        return max(0, limit - count)


def check_quota(user: User, limits: PlanLimits, client_identifier: str) -> None:
    """Raise QuotaExceeded when the caller may not run another optimization."""
    _consume_minute(client_identifier)

    if limits.daily_optimizations <= 0:
        return

    if not user.is_anonymous:
        try:
            used = get_user_daily_optimizations(user.id)
        except DatabaseUnavailable:
            # Fail closed rather than granting unlimited usage.
            raise QuotaExceeded(
                "Usage limits are temporarily unavailable. Please try again shortly.",
                retry_after=60,
                code="QUOTA_UNAVAILABLE",
            )
        if used >= limits.daily_optimizations:
            raise QuotaExceeded(
                f"Daily limit of {limits.daily_optimizations} optimizations reached. "
                "Sign in or try again tomorrow.",
                retry_after=3600,
            )
        return

    remaining = _anonymous_daily_remaining(client_identifier, limits.daily_optimizations)
    if remaining <= 0:
        raise QuotaExceeded(
            f"Daily limit of {limits.daily_optimizations} optimizations reached. "
            "Try again tomorrow.",
            retry_after=3600,
        )


def record_usage(user: User, client_identifier: str) -> None:
    """Record a successful optimization. Never fails the user's request."""
    if not user.is_anonymous:
        try:
            increment_optimization_count(user.id)
        except DatabaseUnavailable:
            logger.warning("Could not persist usage counter (database unavailable)")
        return

    today = date.today()
    with _lock:
        day, count = _daily_counts.get(client_identifier, (today, 0))
        if day != today:
            day, count = today, 0
        _daily_counts[client_identifier] = (day, count + 1)
        _prune(int(__import__("time").time() // 60), today)


def remaining_for(user: User, limits: PlanLimits, client_identifier: str) -> int:
    if limits.daily_optimizations <= 0:
        return -1
    if not user.is_anonymous:
        try:
            used = get_user_daily_optimizations(user.id)
        except DatabaseUnavailable:
            return 0
        return max(0, limits.daily_optimizations - used)
    return _anonymous_daily_remaining(client_identifier, limits.daily_optimizations)
