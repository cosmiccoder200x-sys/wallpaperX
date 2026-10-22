from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.config import config
from app.models import FREE_LIMITS, PlanType
from app.services import quota
from app.services.auth import (
    create_access_token,
    create_anonymous_user,
    decode_token,
    hash_password,
    verify_password,
)
from app.services.quota import QuotaExceeded, check_quota, record_usage, remaining_for


def test_password_hash_round_trip():
    stored = hash_password("correct horse battery staple")
    assert stored.startswith("pbkdf2_sha256$260000$")
    assert verify_password("correct horse battery staple", stored) is True
    assert verify_password("wrong password", stored) is False
    assert verify_password("anything", "garbage") is False


def test_legacy_password_hash_is_supported():
    import hashlib

    salt = "abc123"
    digest = hashlib.pbkdf2_hmac("sha256", b"legacy-pass", salt.encode(), 100_000).hex()
    assert verify_password("legacy-pass", f"{salt}:{digest}") is True
    assert verify_password("nope", f"{salt}:{digest}") is False


def test_anonymous_user_is_transient_and_marked_anonymous():
    user = create_anonymous_user()
    assert user.is_anonymous is True
    assert user.plan is PlanType.FREE
    assert user.email.endswith("@anonymous.local")


def test_access_token_round_trip():
    user = create_anonymous_user()
    token = create_access_token(user)
    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == str(user.id)
    assert payload["plan"] == "free"


def test_expired_and_invalid_tokens_are_rejected():
    user = create_anonymous_user()
    expired = jwt.encode(
        {
            "sub": str(user.id),
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        },
        config.JWT_SECRET or "development-only-insecure-jwt-secret",
        algorithm="HS256",
    )
    assert decode_token(expired) is None
    assert decode_token("not-a-token") is None


def test_anonymous_daily_quota():
    user = create_anonymous_user()
    identifier = "ip:test-client"
    limits = FREE_LIMITS

    for _ in range(limits.daily_optimizations):
        check_quota(user, limits, identifier)
        assert remaining_for(user, limits, identifier) >= 0
        record_usage(user, identifier)

    with pytest.raises(QuotaExceeded) as exc:
        check_quota(user, limits, identifier)
    assert exc.value.code == "QUOTA_EXCEEDED"
    assert remaining_for(user, limits, identifier) == 0


def test_minute_rate_limit(monkeypatch):
    user = create_anonymous_user()
    limits = FREE_LIMITS
    monkeypatch.setattr(config, "RATE_LIMIT_PER_MINUTE", 2)
    monkeypatch.setattr(limits, "daily_optimizations", -1)

    check_quota(user, limits, "ip:burst")
    check_quota(user, limits, "ip:burst")
    with pytest.raises(QuotaExceeded) as exc:
        check_quota(user, limits, "ip:burst")
    assert exc.value.code == "RATE_LIMITED"


def test_quota_namespace_clears_between_tests():
    assert quota._daily_counts == {}
