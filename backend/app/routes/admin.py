from flask import Blueprint, request, jsonify
from app.services.auth import get_user_from_token
from app.services.database import (
    get_admin_stats, get_daily_stats, get_popular_wallpapers,
    list_wallpapers, get_user_by_id, update_user_plan
)
from app.models import PlanType

admin_bp = Blueprint('admin', __name__)


def require_admin():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None, jsonify({"success": False, "error": {"code": "UNAUTHORIZED", "message": "Authentication required"}}), 401
    
    user = get_user_from_token(auth_header[7:])
    if not user or not user.is_admin:
        return None, jsonify({"success": False, "error": {"code": "FORBIDDEN", "message": "Admin access required"}}), 403
    
    return user, None, None


@admin_bp.route('/stats', methods=['GET'])
def admin_stats():
    user, error, code = require_admin()
    if error:
        return error, code
    
    stats = get_admin_stats()
    return jsonify({"success": True, "data": stats})


@admin_bp.route('/analytics', methods=['GET'])
def admin_analytics():
    user, error, code = require_admin()
    if error:
        return error, code
    
    days = max(1, min(request.args.get('days', 30, type=int), 365))
    daily = get_daily_stats(days)
    popular = get_popular_wallpapers(20)
    
    return jsonify({
        "success": True,
        "data": {
            "daily_stats": daily,
            "popular_wallpapers": [{
                "id": str(w.id),
                "title": w.title,
                "slug": w.slug,
                "category": w.category,
                "thumbnail_url": w.thumbnail_url,
                "width": w.width,
                "height": w.height,
                "file_size": w.file_size,
                "downloads": w.downloads
            } for w in popular]
        }
    })


@admin_bp.route('/users', methods=['GET'])
def admin_list_users():
    user, error, code = require_admin()
    if error:
        return error, code
    
    page = max(1, request.args.get('page', 1, type=int))
    limit = max(1, min(request.args.get('limit', 20, type=int), 100))
    offset = (page - 1) * limit
    plan_filter = request.args.get('plan')
    search = request.args.get('search')
    
    conditions = []
    params = []
    
    if plan_filter:
        conditions.append("plan = %s")
        params.append(plan_filter)
    
    if search:
        conditions.append("(email ILIKE %s OR name ILIKE %s)")
        params.extend([f"%{search}%", f"%{search}%"])
    
    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
    
    from app.services.database import execute_query, execute_one
    
    total = execute_one(f"SELECT COUNT(*) as count FROM users {where_clause}", tuple(params))['count']
    
    query = f"""
        SELECT id, email, name, avatar_url, plan, is_active, daily_optimizations, 
               last_optimization_date, created_at
        FROM users
        {where_clause}
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s
    """
    params.extend([limit, offset])
    rows = execute_query(query, tuple(params))
    
    users = [{
        "id": str(row['id']),
        "email": row['email'],
        "name": row['name'],
        "avatar_url": row['avatar_url'],
        "plan": row['plan'],
        "is_active": row['is_active'],
        "daily_optimizations": row['daily_optimizations'],
        "last_optimization_date": row['last_optimization_date'].isoformat() if row['last_optimization_date'] else None,
        "created_at": row['created_at'].isoformat() if row['created_at'] else None
    } for row in rows]
    
    return jsonify({
        "success": True,
        "data": {
            "users": users,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "pages": (total + limit - 1) // limit
            }
        }
    })


@admin_bp.route('/users/<user_id>/plan', methods=['PUT'])
def admin_update_user_plan(user_id):
    user, error, code = require_admin()
    if error:
        return error, code
    
    from uuid import UUID
    try:
        target_id = UUID(user_id)
    except ValueError:
        return jsonify({"success": False, "error": {"code": "INVALID_ID", "message": "Invalid user ID"}}), 400
    
    data = request.get_json()
    if not data or 'plan' not in data:
        return jsonify({"success": False, "error": {"code": "MISSING_PLAN", "message": "Plan is required"}}), 400
    
    try:
        new_plan = PlanType(data['plan'])
    except ValueError:
        return jsonify({"success": False, "error": {"code": "INVALID_PLAN", "message": "Invalid plan type"}}), 400
    
    updated = update_user_plan(target_id, new_plan)
    
    if not updated:
        return jsonify({"success": False, "error": {"code": "NOT_FOUND", "message": "User not found"}}), 404
    
    return jsonify({"success": True, "data": {"id": str(updated.id), "plan": updated.plan.value}})


@admin_bp.route('/users/<user_id>/disable', methods=['POST'])
def admin_disable_user(user_id):
    user, error, code = require_admin()
    if error:
        return error, code
    
    from uuid import UUID
    try:
        target_id = UUID(user_id)
    except ValueError:
        return jsonify({"success": False, "error": {"code": "INVALID_ID", "message": "Invalid user ID"}}), 400
    
    if target_id == user.id:
        return jsonify({"success": False, "error": {"code": "SELF_DISABLE", "message": "Cannot disable yourself"}}), 400
    
    from app.services.database import execute_one
    row = execute_one(
        "UPDATE users SET is_active = false, updated_at = NOW() WHERE id = %s RETURNING id",
        (str(target_id),)
    )
    
    if not row:
        return jsonify({"success": False, "error": {"code": "NOT_FOUND", "message": "User not found"}}), 404
    
    return jsonify({"success": True})


@admin_bp.route('/wallpapers', methods=['GET'])
def admin_list_wallpapers():
    user, error, code = require_admin()
    if error:
        return error, code
    
    page = max(1, request.args.get('page', 1, type=int))
    limit = max(1, min(request.args.get('limit', 20, type=int), 100))
    offset = (page - 1) * limit
    published = request.args.get('published')
    category = request.args.get('category')
    
    conditions = []
    params = []
    
    if published is not None:
        conditions.append("is_published = %s")
        params.append(published.lower() == 'true')
    
    if category:
        conditions.append("category = %s")
        params.append(category)
    
    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
    
    from app.services.database import execute_query, execute_one
    
    total = execute_one(f"SELECT COUNT(*) as count FROM wallpapers {where_clause}", tuple(params))['count']
    
    query = f"""
        SELECT * FROM wallpapers
        {where_clause}
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s
    """
    params.extend([limit, offset])
    rows = execute_query(query, tuple(params))
    
    wallpapers = [{
        "id": str(row['id']),
        "title": row['title'],
        "slug": row['slug'],
        "category": row['category'],
        "width": row['width'],
        "height": row['height'],
        "format": row['format'],
        "file_size": row['file_size'],
        "downloads": row['downloads'],
        "is_published": row['is_published'],
        "created_at": row['created_at'].isoformat() if row['created_at'] else None
    } for row in rows]
    
    return jsonify({
        "success": True,
        "data": {
            "wallpapers": wallpapers,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "pages": (total + limit - 1) // limit
            }
        }
    })