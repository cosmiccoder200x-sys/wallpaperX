import io
import logging
from flask import Blueprint, request, jsonify, send_file
from uuid import UUID
from app.config import config
from app.models import OptimizationRequest, ImageFormat, PlanType, get_plan_limits
from app.services.image_optimizer import ImageOptimizer, validate_image, format_bytes
from app.services.url_fetcher import url_fetcher
from app.services.auth import get_user_from_token, create_anonymous_user, get_plan_limits as get_user_limits
from app.services.database import (
    create_optimization, get_optimization_history, get_optimization_by_id,
    increment_optimization_count, get_user_daily_optimizations
)

logger = logging.getLogger(__name__)

optimize_bp = Blueprint('optimize', __name__)


def get_current_user():
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        return get_user_from_token(token)
    return None


def get_client_identifier():
    user = get_current_user()
    if user:
        return f"user:{user.id}"
    return f"ip:{request.remote_addr}"


@optimize_bp.route('/analyze', methods=['POST'])
def analyze_image():
    if 'file' not in request.files:
        return jsonify({"success": False, "error": {"code": "NO_FILE", "message": "No file uploaded"}}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": {"code": "NO_FILE", "message": "No file selected"}}), 400
    
    user = get_current_user()
    if not user:
        user = create_anonymous_user()
    
    limits = get_user_limits(user)
    max_size = limits.max_input_mb * 1024 * 1024
    
    is_valid, error, code = validate_image(file.stream, max_size)
    if not is_valid:
        return jsonify({"success": False, "error": {"code": code, "message": error}}), 400
    
    file.stream.seek(0)
    optimizer = ImageOptimizer(limits)
    analysis = optimizer.analyze(file.stream, file.filename)
    
    return jsonify({
        "success": True,
        "data": {
            "filename": analysis.filename,
            "format": analysis.format.value,
            "size": analysis.size,
            "size_formatted": format_bytes(analysis.size),
            "width": analysis.width,
            "height": analysis.height,
            "dimensions": f"{analysis.width} × {analysis.height}",
            "aspect_ratio": analysis.aspect_ratio,
            "megapixels": round(analysis.megapixels, 1),
            "has_transparency": analysis.has_transparency,
            "mode": analysis.mode,
            "estimated_optimization": analysis.estimated_optimization
        }
    })


@optimize_bp.route('/optimize', methods=['POST'])
def optimize_image():
    if 'file' not in request.files:
        return jsonify({"success": False, "error": {"code": "NO_FILE", "message": "No file uploaded"}}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": {"code": "NO_FILE", "message": "No file selected"}}), 400
    
    user = get_current_user()
    if not user:
        user = create_anonymous_user()
    
    limits = get_user_limits(user)
    max_size = limits.max_input_mb * 1024 * 1024
    
    is_valid, error, code = validate_image(file.stream, max_size)
    if not is_valid:
        return jsonify({"success": False, "error": {"code": code, "message": error}}), 400
    
    target_size_mb = request.form.get('target_size_mb', type=int)
    target_size_kb = request.form.get('target_size_kb', type=int)
    
    if target_size_kb:
        target_size = target_size_kb * 1024
    elif target_size_mb:
        target_size = target_size_mb * 1024 * 1024
    else:
        target_size = limits.max_output_mb * 1024 * 1024
    
    target_size = min(target_size, limits.max_output_mb * 1024 * 1024)
    
    output_format = request.form.get('output_format')
    if output_format and output_format != 'auto':
        try:
            output_format = ImageFormat(output_format.upper())
        except ValueError:
            output_format = None
    else:
        output_format = None
    
    target_width = request.form.get('target_width', type=int)
    target_height = request.form.get('target_height', type=int)
    
    file.stream.seek(0)
    optimizer = ImageOptimizer(limits)
    analysis = optimizer.analyze(file.stream, file.filename)
    
    if analysis.size <= target_size and (not output_format or output_format == analysis.format):
        file.stream.seek(0)
        data = file.stream.read()
        return jsonify({
            "success": True,
            "data": {
                "output_size": len(data),
                "output_size_formatted": format_bytes(len(data)),
                "output_width": analysis.width,
                "output_height": analysis.height,
                "output_format": analysis.format.value,
                "quality_used": 100,
                "processing_time_ms": 0,
                "compression_ratio": 0,
                "saved_bytes": 0,
                "download_url": f"/api/optimize/download/{analysis.filename}",
                "inline_data": True
            }
        })
    
    req = OptimizationRequest(
        target_size=target_size,
        output_format=output_format,
        target_width=target_width,
        target_height=target_height
    )
    
    file.stream.seek(0)
    result = optimizer.optimize(file.stream, req, analysis)
    
    if not result.success:
        return jsonify({"success": False, "error": {"code": result.error_code, "message": result.error}}), 500
    
    opt_record = create_optimization(
        user_id=user.id if not user.email.endswith('@x.local') else None,
        original_filename=analysis.filename,
        original_size=analysis.size,
        original_width=analysis.width,
        original_height=analysis.height,
        original_format=analysis.format,
        output_size=result.output_size,
        output_width=result.output_width,
        output_height=result.output_height,
        output_format=result.output_format,
        target_size=target_size,
        quality_used=result.quality_used,
        processing_time_ms=result.processing_time_ms
    )
    
    if user and not user.email.endswith('@x.local'):
        increment_optimization_count(user.id)
    
    buffer = io.BytesIO(result.data)
    buffer.seek(0)
    
    filename = f"x-optimized.{result.output_format.value.lower()}"
    
    return send_file(
        buffer,
        mimetype=f"image/{result.output_format.value.lower()}",
        as_attachment=True,
        download_name=filename
    )


@optimize_bp.route('/optimize-url', methods=['POST'])
def optimize_url():
    data = request.get_json()
    if not data or 'url' not in data:
        return jsonify({"success": False, "error": {"code": "NO_URL", "message": "No URL provided"}}), 400
    
    url = data['url'].strip()
    if not url:
        return jsonify({"success": False, "error": {"code": "NO_URL", "message": "URL cannot be empty"}}), 400
    
    user = get_current_user()
    if not user:
        user = create_anonymous_user()
    
    limits = get_user_limits(user)
    
    file_buffer, content_type, error = url_fetcher.fetch(url)
    if error:
        return jsonify({"success": False, "error": {"code": "URL_FETCH_FAILED", "message": error}}), 400
    
    optimizer = ImageOptimizer(limits)
    analysis = optimizer.analyze(file_buffer, url.split('/')[-1] or "image.jpg")
    
    target_size_mb = data.get('target_size_mb')
    target_size_kb = data.get('target_size_kb')
    
    if target_size_kb:
        target_size = target_size_kb * 1024
    elif target_size_mb:
        target_size = target_size_mb * 1024 * 1024
    else:
        target_size = limits.max_output_mb * 1024 * 1024
    
    target_size = min(target_size, limits.max_output_mb * 1024 * 1024)
    
    output_format = data.get('output_format')
    if output_format and output_format != 'auto':
        try:
            output_format = ImageFormat(output_format.upper())
        except ValueError:
            output_format = None
    else:
        output_format = None
    
    target_width = data.get('target_width')
    target_height = data.get('target_height')
    
    req = OptimizationRequest(
        target_size=target_size,
        output_format=output_format,
        target_width=target_width,
        target_height=target_height
    )
    
    result = optimizer.optimize(file_buffer, req, analysis)
    
    if not result.success:
        return jsonify({"success": False, "error": {"code": result.error_code, "message": result.error}}), 500
    
    opt_record = create_optimization(
        user_id=user.id if not user.email.endswith('@x.local') else None,
        original_filename=analysis.filename,
        original_size=analysis.size,
        original_width=analysis.width,
        original_height=analysis.height,
        original_format=analysis.format,
        output_size=result.output_size,
        output_width=result.output_width,
        output_height=result.output_height,
        output_format=result.output_format,
        target_size=target_size,
        quality_used=result.quality_used,
        processing_time_ms=result.processing_time_ms
    )
    
    if user and not user.email.endswith('@x.local'):
        increment_optimization_count(user.id)
    
    buffer = io.BytesIO(result.data)
    buffer.seek(0)
    
    filename = f"x-optimized.{result.output_format.value.lower()}"
    
    return send_file(
        buffer,
        mimetype=f"image/{result.output_format.value.lower()}",
        as_attachment=True,
        download_name=filename
    )


@optimize_bp.route('/history', methods=['GET'])
def get_history():
    user = get_current_user()
    if not user or user.email.endswith('@x.local'):
        return jsonify({"success": False, "error": {"code": "AUTH_REQUIRED", "message": "Authentication required"}}), 401
    
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)
    
    optimizations = get_optimization_history(user.id, limit, offset)
    
    return jsonify({
        "success": True,
        "data": [{
            "id": str(opt.id),
            "original_filename": opt.original_filename,
            "original_size": opt.original_size,
            "original_size_formatted": format_bytes(opt.original_size),
            "original_dimensions": f"{opt.original_width} × {opt.original_height}",
            "output_size": opt.output_size,
            "output_size_formatted": format_bytes(opt.output_size),
            "output_dimensions": f"{opt.output_width} × {opt.output_height}",
            "output_format": opt.output_format.value,
            "compression_ratio": round(opt.compression_ratio, 1),
            "saved_bytes": opt.saved_bytes,
            "saved_formatted": format_bytes(opt.saved_bytes),
            "quality_used": opt.quality_used,
            "processing_time_ms": opt.processing_time_ms,
            "created_at": opt.created_at.isoformat() if opt.created_at else None
        } for opt in optimizations]
    })


@optimize_bp.route('/limits', methods=['GET'])
def get_limits():
    user = get_current_user()
    if not user:
        user = create_anonymous_user()
    
    limits = get_user_limits(user)
    daily_used = get_user_daily_optimizations(user.id) if not user.email.endswith('@x.local') else 0
    
    return jsonify({
        "success": True,
        "data": {
            "plan": user.plan.value,
            "max_input_mb": limits.max_input_mb,
            "max_output_mb": limits.max_output_mb,
            "daily_optimizations": limits.daily_optimizations,
            "daily_used": daily_used,
            "daily_remaining": max(0, limits.daily_optimizations - daily_used) if limits.daily_optimizations > 0 else -1,
            "priority_processing": limits.priority_processing,
            "batch_processing": limits.batch_processing,
            "no_ads": limits.no_ads,
            "history_retention_days": limits.history_retention_days
        }
    })