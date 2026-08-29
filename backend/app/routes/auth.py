from flask import Blueprint, request, jsonify
from app.services.auth import (
    create_access_token, get_user_from_token, 
    get_or_create_user_from_supabase, hash_password, verify_password
)
from app.services.database import get_user_by_email, create_user, update_user_plan
from app.models import PlanType

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": {"code": "INVALID_REQUEST", "message": "Invalid request body"}}), 400
    
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    name = data.get('name', '').strip()
    
    if not email or not password:
        return jsonify({"success": False, "error": {"code": "MISSING_FIELDS", "message": "Email and password are required"}}), 400
    
    if len(password) < 8:
        return jsonify({"success": False, "error": {"code": "WEAK_PASSWORD", "message": "Password must be at least 8 characters"}}), 400
    
    existing = get_user_by_email(email)
    if existing:
        return jsonify({"success": False, "error": {"code": "EMAIL_EXISTS", "message": "An account with this email already exists"}}), 409
    
    password_hash = hash_password(password)
    
    from app.services.database import execute_one
    query = """
        INSERT INTO users (email, name, plan)
        VALUES (%s, %s, %s)
        RETURNING *
    """
    row = execute_one(query, (email, name or None, PlanType.FREE.value))
    
    from app.models import User
    user = User(
        id=row['id'],
        email=row['email'],
        name=row['name'],
        avatar_url=row['avatar_url'],
        plan=PlanType(row['plan']),
        is_active=row['is_active'],
        daily_optimizations=row['daily_optimizations'],
        last_optimization_date=row['last_optimization_date'],
        created_at=row['created_at'],
        updated_at=row['updated_at']
    )
    
    token = create_access_token(user)
    
    return jsonify({
        "success": True,
        "data": {
            "user": {
                "id": str(user.id),
                "email": user.email,
                "name": user.name,
                "avatar_url": user.avatar_url,
                "plan": user.plan.value
            },
            "token": token
        }
    })


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": {"code": "INVALID_REQUEST", "message": "Invalid request body"}}), 400
    
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    
    if not email or not password:
        return jsonify({"success": False, "error": {"code": "MISSING_FIELDS", "message": "Email and password are required"}}), 400
    
    user = get_user_by_email(email)
    if not user:
        return jsonify({"success": False, "error": {"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"}}), 401
    
    from app.services.database import execute_one
    row = execute_one("SELECT password_hash FROM users WHERE email = %s", (email,))
    if not row or not row['password_hash']:
        return jsonify({"success": False, "error": {"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"}}), 401
    
    if not verify_password(password, row['password_hash']):
        return jsonify({"success": False, "error": {"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"}}), 401
    
    if not user.is_active:
        return jsonify({"success": False, "error": {"code": "ACCOUNT_DISABLED", "message": "This account has been disabled"}}), 403
    
    token = create_access_token(user)
    
    return jsonify({
        "success": True,
        "data": {
            "user": {
                "id": str(user.id),
                "email": user.email,
                "name": user.name,
                "avatar_url": user.avatar_url,
                "plan": user.plan.value
            },
            "token": token
        }
    })


@auth_bp.route('/supabase', methods=['POST'])
def supabase_auth():
    data = request.get_json()
    if not data or 'access_token' not in data:
        return jsonify({"success": False, "error": {"code": "NO_TOKEN", "message": "Supabase access token required"}}), 400
    
    access_token = data['access_token']
    
    try:
        import requests
        response = requests.get(
            'https://api.supabase.com/v1/user',
            headers={'Authorization': f'Bearer {access_token}'}
        )
        if response.status_code != 200:
            return jsonify({"success": False, "error": {"code": "INVALID_TOKEN", "message": "Invalid Supabase token"}}), 401
        
        supabase_user = response.json()
        user = get_or_create_user_from_supabase(supabase_user)
        
        token = create_access_token(user)
        
        return jsonify({
            "success": True,
            "data": {
                "user": {
                    "id": str(user.id),
                    "email": user.email,
                    "name": user.name,
                    "avatar_url": user.avatar_url,
                    "plan": user.plan.value
                },
                "token": token
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": {"code": "AUTH_FAILED", "message": str(e)}}), 500


@auth_bp.route('/me', methods=['GET'])
def get_current_user():
    from app.services.auth import get_user_from_token
    
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return jsonify({"success": False, "error": {"code": "NO_TOKEN", "message": "Authorization token required"}}), 401
    
    token = auth_header[7:]
    user = get_user_from_token(token)
    
    if not user:
        return jsonify({"success": False, "error": {"code": "INVALID_TOKEN", "message": "Invalid or expired token"}}), 401
    
    return jsonify({
        "success": True,
        "data": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "plan": user.plan.value,
            "is_active": user.is_active
        }
    })


@auth_bp.route('/refresh', methods=['POST'])
def refresh_token():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return jsonify({"success": False, "error": {"code": "NO_TOKEN", "message": "Authorization token required"}}), 401
    
    token = auth_header[7:]
    user = get_user_from_token(token)
    
    if not user:
        return jsonify({"success": False, "error": {"code": "INVALID_TOKEN", "message": "Invalid or expired token"}}), 401
    
    new_token = create_access_token(user)
    
    return jsonify({
        "success": True,
        "data": {"token": new_token}
    })