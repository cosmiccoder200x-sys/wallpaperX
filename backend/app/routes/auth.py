import logging
import re

from flask import Blueprint, jsonify, request

from app.config import config
from app.models import PlanType, User
from app.services.auth import (
    create_access_token,
    get_or_create_user_from_supabase,
    get_user_from_token,
    hash_password,
    verify_password,
)
from app.services.database import (
    create_user,
    get_user_by_email,
    get_user_password_hash,
)

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD_LENGTH = 8


def _error(code: str, message: str, status: int):
    return jsonify({"success": False, "error": {"code": code, "message": message}}), status


def _user_payload(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "avatar_url": user.avatar_url,
        "plan": user.plan.value,
    }


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return _error("INVALID_REQUEST", "Invalid request body", 400)

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    name = str(data.get("name", "")).strip()[:120]

    if not email or not password:
        return _error("MISSING_FIELDS", "Email and password are required", 400)
    if not EMAIL_RE.match(email) or len(email) > 254:
        return _error("INVALID_EMAIL", "Please provide a valid email address", 400)
    if len(password) < MIN_PASSWORD_LENGTH:
        return _error(
            "WEAK_PASSWORD",
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
            400,
        )

    if get_user_by_email(email):
        return _error(
            "EMAIL_EXISTS", "An account with this email already exists", 409
        )

    user = create_user(
        email=email,
        name=name or None,
        plan=PlanType.FREE,
        password_hash=hash_password(password),
    )

    return jsonify(
        {"success": True, "data": {"user": _user_payload(user), "token": create_access_token(user)}}
    ), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return _error("INVALID_REQUEST", "Invalid request body", 400)

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not email or not password:
        return _error("MISSING_FIELDS", "Email and password are required", 400)

    user = get_user_by_email(email)
    stored_hash = get_user_password_hash(email) if user else None
    if not user or not stored_hash or not verify_password(password, stored_hash):
        return _error("INVALID_CREDENTIALS", "Invalid email or password", 401)

    if not user.is_active:
        return _error(
            "ACCOUNT_DISABLED", "This account has been disabled", 403
        )

    return jsonify(
        {"success": True, "data": {"user": _user_payload(user), "token": create_access_token(user)}}
    )


@auth_bp.route("/supabase", methods=["POST"])
def supabase_auth():
    """Verify a Supabase access token and return a backend JWT."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data.get("access_token"):
        return _error("NO_TOKEN", "Supabase access token required", 400)

    if not config.SUPABASE_URL or not config.SUPABASE_ANON_KEY:
        return _error(
            "AUTH_NOT_CONFIGURED",
            "Supabase authentication is not configured on this server",
            503,
        )

    import requests

    try:
        response = requests.get(
            f"{config.SUPABASE_URL.rstrip('/')}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {data['access_token']}",
                "apikey": config.SUPABASE_ANON_KEY,
            },
            timeout=(5, 10),
        )
    except requests.RequestException:
        logger.warning("Supabase token verification request failed")
        return _error(
            "AUTH_UNAVAILABLE", "Authentication provider is unavailable", 503
        )

    if response.status_code != 200:
        return _error("INVALID_TOKEN", "Invalid or expired Supabase token", 401)

    try:
        supabase_user = response.json()
        user = get_or_create_user_from_supabase(supabase_user)
    except ValueError:
        return _error("INVALID_TOKEN", "The Supabase token has no usable identity", 401)
    except Exception:
        logger.exception("Supabase account provisioning failed")
        return _error("AUTH_FAILED", "Could not complete sign-in", 500)

    return jsonify(
        {"success": True, "data": {"user": _user_payload(user), "token": create_access_token(user)}}
    )


@auth_bp.route("/me", methods=["GET"])
def get_current_user():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return _error("NO_TOKEN", "Authorization token required", 401)

    user = get_user_from_token(auth_header[7:].strip())
    if not user:
        return _error("INVALID_TOKEN", "Invalid or expired token", 401)

    return jsonify(
        {
            "success": True,
            "data": {
                **_user_payload(user),
                "is_active": user.is_active,
            },
        }
    )


@auth_bp.route("/refresh", methods=["POST"])
def refresh_token():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return _error("NO_TOKEN", "Authorization token required", 401)

    user = get_user_from_token(auth_header[7:].strip())
    if not user:
        return _error("INVALID_TOKEN", "Invalid or expired token", 401)

    return jsonify({"success": True, "data": {"token": create_access_token(user)}})
