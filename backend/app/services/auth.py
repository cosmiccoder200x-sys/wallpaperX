import os
import jwt
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, Tuple
from uuid import UUID
from app.config import config
from app.models import User, PlanType
from app.services.database import get_user_by_email, create_user, update_user_plan

JWT_SECRET = config.JWT_SECRET
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = 24 * 30  # 30 days


def create_access_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "plan": user.plan.value,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRY_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_user_from_token(token: str) -> Optional[User]:
    payload = decode_token(token)
    if not payload:
        return None
    
    user_id = payload.get("sub")
    if not user_id:
        return None
    
    from app.services.database import get_user_by_id
    return get_user_by_id(UUID(user_id))


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hash_obj = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}:{hash_obj.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, hash_val = stored_hash.split(':')
        hash_obj = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return hash_obj.hex() == hash_val
    except Exception:
        return False


def create_anonymous_user() -> User:
    anon_id = secrets.token_hex(16)
    email = f"anon_{anon_id}@x.local"
    return create_user(email=email, name="Anonymous", plan=PlanType.FREE)


def get_or_create_user_from_supabase(supabase_user: dict) -> User:
    email = supabase_user.get("email")
    if not email:
        raise ValueError("Supabase user missing email")
    
    user = get_user_by_email(email)
    if user:
        if user.name != supabase_user.get("user_metadata", {}).get("full_name"):
            from app.services.database import execute_one
            execute_one(
                "UPDATE users SET name = %s, avatar_url = %s, updated_at = NOW() WHERE id = %s",
                (supabase_user.get("user_metadata", {}).get("full_name"),
                 supabase_user.get("user_metadata", {}).get("avatar_url"),
                 str(user.id))
            )
            user.name = supabase_user.get("user_metadata", {}).get("full_name")
            user.avatar_url = supabase_user.get("user_metadata", {}).get("avatar_url")
        return user
    
    name = supabase_user.get("user_metadata", {}).get("full_name")
    avatar = supabase_user.get("user_metadata", {}).get("avatar_url")
    return create_user(email=email, name=name, plan=PlanType.FREE)


def get_plan_limits(user: User):
    from app.models import get_plan_limits
    return get_plan_limits(user.plan)