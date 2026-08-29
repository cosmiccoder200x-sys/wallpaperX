import hashlib
from flask import Blueprint, request, jsonify
from app.services.database import (
    list_wallpapers, get_wallpaper_by_slug, get_wallpaper_by_id,
    create_wallpaper, update_wallpaper, delete_wallpaper,
    increment_wallpaper_downloads, record_download
)
from app.models import Wallpaper, ImageFormat
from app.services.auth import get_user_from_token
from uuid import UUID

wallpapers_bp = Blueprint('wallpapers', __name__)


def get_client_ip_hash():
    ip = request.remote_addr or 'unknown'
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


@wallpapers_bp.route('', methods=['GET'])
def get_wallpapers_list():
    category = request.args.get('category')
    limit = min(request.args.get('limit', 20, type=int), 100)
    offset = request.args.get('offset', 0, type=int)
    published_only = request.args.get('published', 'true').lower() == 'true'
    
    wallpapers = list_wallpapers(category, limit, offset, published_only)
    
    return jsonify({
        "success": True,
        "data": [{
            "id": str(w.id),
            "title": w.title,
            "slug": w.slug,
            "description": w.description,
            "category": w.category,
            "image_url": w.image_url,
            "thumbnail_url": w.thumbnail_url,
            "width": w.width,
            "height": w.height,
            "dimensions": f"{w.width} × {w.height}",
            "aspect_ratio": w.aspect_ratio,
            "resolution_label": w.resolution_label,
            "format": w.format.value,
            "file_size": w.file_size,
            "downloads": w.downloads,
            "is_published": w.is_published,
            "created_at": w.created_at.isoformat() if w.created_at else None
        } for w in wallpapers]
    })


@wallpapers_bp.route('/categories', methods=['GET'])
def get_categories():
    from app.services.database import execute_query
    
    rows = execute_query("""
        SELECT category, COUNT(*) as count 
        FROM wallpapers 
        WHERE is_published = true 
        GROUP BY category 
        ORDER BY count DESC
    """)
    
    categories = [
        {"name": row['category'], "count": row['count'], "slug": row['category'].lower().replace(' ', '-')}
        for row in rows
    ]
    
    return jsonify({"success": True, "data": categories})


@wallpapers_bp.route('/<slug>', methods=['GET'])
def get_wallpaper(slug):
    wallpaper = get_wallpaper_by_slug(slug)
    
    if not wallpaper:
        return jsonify({"success": False, "error": {"code": "NOT_FOUND", "message": "Wallpaper not found"}}), 404
    
    return jsonify({
        "success": True,
        "data": {
            "id": str(wallpaper.id),
            "title": wallpaper.title,
            "slug": wallpaper.slug,
            "description": wallpaper.description,
            "category": wallpaper.category,
            "image_url": wallpaper.image_url,
            "thumbnail_url": wallpaper.thumbnail_url,
            "width": wallpaper.width,
            "height": wallpaper.height,
            "dimensions": f"{wallpaper.width} × {wallpaper.height}",
            "aspect_ratio": wallpaper.aspect_ratio,
            "resolution_label": wallpaper.resolution_label,
            "format": wallpaper.format.value,
            "file_size": wallpaper.file_size,
            "downloads": wallpaper.downloads,
            "created_at": wallpaper.created_at.isoformat() if wallpaper.created_at else None
        }
    })


@wallpapers_bp.route('/<wallpaper_id>/download', methods=['POST'])
def download_wallpaper(wallpaper_id):
    try:
        wallpaper_uuid = UUID(wallpaper_id)
    except ValueError:
        return jsonify({"success": False, "error": {"code": "INVALID_ID", "message": "Invalid wallpaper ID"}}), 400
    
    wallpaper = get_wallpaper_by_id(wallpaper_uuid)
    
    if not wallpaper:
        return jsonify({"success": False, "error": {"code": "NOT_FOUND", "message": "Wallpaper not found"}}), 404
    
    if not wallpaper.is_published:
        return jsonify({"success": False, "error": {"code": "NOT_PUBLISHED", "message": "Wallpaper is not published"}}), 403
    
    auth_header = request.headers.get('Authorization', '')
    user = None
    if auth_header.startswith('Bearer '):
        from app.services.auth import get_user_from_token
        user = get_user_from_token(auth_header[7:])
    
    increment_wallpaper_downloads(wallpaper_uuid)
    record_download(wallpaper_uuid, user.id if user else None, get_client_ip_hash())
    
    return jsonify({
        "success": True,
        "data": {
            "download_url": wallpaper.image_url,
            "filename": f"{wallpaper.slug}.{wallpaper.format.value.lower()}"
        }
    })


# Admin routes for wallpaper management
@wallpapers_bp.route('/admin', methods=['POST'])
def admin_create_wallpaper():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return jsonify({"success": False, "error": {"code": "UNAUTHORIZED", "message": "Authentication required"}}), 401
    
    from app.services.auth import get_user_from_token
    user = get_user_from_token(auth_header[7:])
    if not user or not user.is_admin:
        return jsonify({"success": False, "error": {"code": "FORBIDDEN", "message": "Admin access required"}}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": {"code": "INVALID_REQUEST", "message": "Invalid request body"}}), 400
    
    required = ['title', 'slug', 'category', 'image_url', 'thumbnail_url', 'width', 'height', 'format', 'file_size']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": {"code": "MISSING_FIELD", "message": f"Missing required field: {field}"}}), 400
    
    try:
        format_enum = ImageFormat(data['format'].upper())
    except ValueError:
        return jsonify({"success": False, "error": {"code": "INVALID_FORMAT", "message": "Invalid image format"}}), 400
    
    wallpaper = Wallpaper(
        id=UUID(data.get('id')) if data.get('id') else None,
        title=data['title'],
        slug=data['slug'],
        description=data.get('description'),
        category=data['category'],
        image_url=data['image_url'],
        thumbnail_url=data['thumbnail_url'],
        width=data['width'],
        height=data['height'],
        format=format_enum,
        file_size=data['file_size'],
        downloads=data.get('downloads', 0),
        is_published=data.get('is_published', False)
    )
    
    created = create_wallpaper(wallpaper)
    
    return jsonify({
        "success": True,
        "data": {
            "id": str(created.id),
            "title": created.title,
            "slug": created.slug
        }
    })


@wallpapers_bp.route('/admin/<wallpaper_id>', methods=['PUT'])
def admin_update_wallpaper(wallpaper_id):
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return jsonify({"success": False, "error": {"code": "UNAUTHORIZED", "message": "Authentication required"}}), 401
    
    from app.services.auth import get_user_from_token
    user = get_user_from_token(auth_header[7:])
    if not user or not user.is_admin:
        return jsonify({"success": False, "error": {"code": "FORBIDDEN", "message": "Admin access required"}}), 403
    
    try:
        wallpaper_uuid = UUID(wallpaper_id)
    except ValueError:
        return jsonify({"success": False, "error": {"code": "INVALID_ID", "message": "Invalid wallpaper ID"}}), 400
    
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": {"code": "INVALID_REQUEST", "message": "Invalid request body"}}), 400
    
    update_data = {}
    allowed_fields = ['title', 'description', 'category', 'image_url', 'thumbnail_url', 
                      'width', 'height', 'format', 'file_size', 'is_published']
    
    for field in allowed_fields:
        if field in data:
            if field == 'format':
                try:
                    update_data[field] = ImageFormat(data[field].upper()).value
                except ValueError:
                    return jsonify({"success": False, "error": {"code": "INVALID_FORMAT", "message": "Invalid image format"}}), 400
            else:
                update_data[field] = data[field]
    
    updated = update_wallpaper(wallpaper_uuid, **update_data)
    
    if not updated:
        return jsonify({"success": False, "error": {"code": "NOT_FOUND", "message": "Wallpaper not found"}}), 404
    
    return jsonify({"success": True, "data": {"id": str(updated.id)}})


@wallpapers_bp.route('/admin/<wallpaper_id>', methods=['DELETE'])
def admin_delete_wallpaper(wallpaper_id):
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return jsonify({"success": False, "error": {"code": "UNAUTHORIZED", "message": "Authentication required"}}), 401
    
    from app.services.auth import get_user_from_token
    user = get_user_from_token(auth_header[7:])
    if not user or not user.is_admin:
        return jsonify({"success": False, "error": {"code": "FORBIDDEN", "message": "Admin access required"}}), 403
    
    try:
        wallpaper_uuid = UUID(wallpaper_id)
    except ValueError:
        return jsonify({"success": False, "error": {"code": "INVALID_ID", "message": "Invalid wallpaper ID"}}), 400
    
    success = delete_wallpaper(wallpaper_uuid)
    
    if not success:
        return jsonify({"success": False, "error": {"code": "NOT_FOUND", "message": "Wallpaper not found"}}), 404
    
    return jsonify({"success": True})