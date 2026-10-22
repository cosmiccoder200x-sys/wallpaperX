"""Authentication helpers.

Anonymous optimizer use must not require a database row (otherwise the core
feature is down whenever PostgreSQL is down). ``create_anonymous_user`` returns
a transient identity whose usage is tracked per IP by ``services.quota``.
"""

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

import jwt

from app.config import config
from app.models import PlanType, User
from app.services.database import DatabaseUnavailable, get_user_by_email

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = 24 * 30  # 30 days
PBKDF2_ITERATIONS = 260_000
LEGACY_PBKDF2_ITERATIONS = 100_000
ANONYMOUS_DOMAIN = "@anonymous.local"


def _jwt_secret() -> str:
    # In development a deterministic fallback keeps local runs simple; in
    # production Config.validate() refuses to boot with a placeholder.
    return config.JWT_SECRET or "development-only-insecure-jwt-secret-please-change"


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "plan": user.plan.value,
        "iat": now,
        "exp": now + timedelta(hours=TOKEN_EXPIRY_HOURS),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_user_from_token(token: str) -> Optional[User]:
    """Return an active user for a valid token, or None.

    A database outage fails closed (treated as unauthenticated) so that nobody
    inherits privileges they cannot be verified for.
    """
    payload = decode_token(token)
    if not payload:
        return None

    subject = payload.get("sub")
    if not subject:
        return None

    try:
        user_id = UUID(str(subject))
    except (ValueError, AttributeError, TypeError):
        return None

    try:
        from app.services.database import get_user_by_id

        user = get_user_by_id(user_id)
    except DatabaseUnavailable:
        logger.warning("Auth lookup skipped: database unavailable")
        return None

    if not user or not user.is_active:
        return None
    return user


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    if not stored_hash:
        return False
    try:
        if stored_hash.startswith("pbkdf2_sha256$"):
            _, iterations, salt, expected = stored_hash.split("$", 3)
            digest = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), salt.encode("utf-8"), int(iterations)
            )
            return hmac.compare_digest(digest.hex(), expected)
        # Legacy format written by the first release: "<salt>:<hash>"
        salt, expected = stored_hash.split(":", 1)
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            LEGACY_PBKDF2_ITERATIONS,
        )
        return hmac.compare_digest(digest.hex(), expected)
    except Exception:
        return False


def create_anonymous_user() -> User:
    """A transient, non-persisted free-plan identity."""
    return User(
        id=uuid4(),
        email=f"anon_{secrets.token_hex(8)}{ANONYMOUS_DOMAIN}",
        name="Anonymous",
        plan=PlanType.FREE,
        is_active=True,
    )


def get_or_create_user_from_supabase(supabase_user: dict) -> User:
    email = (supabase_user.get("email") or "").strip().lower()
    if not email:
        raise ValueError("Supabase user is missing an email address")

    user = get_user_by_email(email)
    metadata = supabase_user.get("user_metadata") or {}
    name = metadata.get("full_name") or metadata.get("name")
    avatar = metadata.get("avatar_url")

    if user:
        if name and (user.name != name or user.avatar_url != avatar):
            from app.services.database import execute_one

            execute_one(
                "UPDATE users SET name = %s, avatar_url = %s, updated_at = NOW() WHERE id = %s",
                (name, avatar, str(user.id)),
            )
            user.name = name
            user.avatar_url = avatar
        return user

    from app.services.database import create_user

    return create_user(email=email, name=name, plan=PlanType.FREE)


def get_plan_limits(user: User):
    from app.models import get_plan_limits

    return get_plan_limits(user.plan)
