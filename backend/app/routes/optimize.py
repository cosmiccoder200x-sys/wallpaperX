"""Optimization endpoints.

Contract (also documented in instructions.md and README.md):
* success for /optimize and /optimize-url is always a real image body with the
  actual encoded MIME type, Content-Disposition and X-* metadata headers;
* every failure is structured JSON with a meaningful HTTP status.
"""

import io
import logging
import math
import re
from typing import Any, Mapping, Optional, Tuple

from flask import Blueprint, Response, jsonify, request, send_file

from app.config import config
from app.models import (
    ImageAnalysis,
    ImageFormat,
    OptimizationRequest,
    OptimizationResult,
    PlanLimits,
    User,
    get_plan_limits,
)
from app.services.auth import create_anonymous_user, get_user_from_token
from app.services.database import DatabaseUnavailable, create_optimization
from app.services.image_optimizer import (
    ImageOptimizer,
    OptimizationError,
    format_bytes,
    validate_image,
)
from app.services.quota import QuotaExceeded, check_quota, record_usage, remaining_for
from app.services.url_fetcher import url_fetcher

logger = logging.getLogger(__name__)

optimize_bp = Blueprint("optimize", __name__)

MB = 1024 * 1024
MIN_TARGET_BYTES = 1024
DEFAULT_TARGET_MB = 10


# --------------------------------------------------------------------- helpers
def _api_error(code: str, message: str, status: int = 400) -> Tuple[Response, int]:
    return jsonify({"success": False, "error": {"code": code, "message": message}}), status


def _current_user() -> Optional[User]:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        if token:
            return get_user_from_token(token)
    return None


def _client_ip() -> str:
    if config.TRUST_PROXY:
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _client_identifier(user: User) -> str:
    return f"ip:{_client_ip()}" if user.is_anonymous else f"user:{user.id}"


def _parse_number(raw: Any) -> Optional[float]:
    if raw is None or raw == "":
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("must be a number") from exc
    if not math.isfinite(value) or value <= 0:
        raise ValueError("must be a positive number")
    return value


def _parse_dimension(raw: Any) -> Optional[int]:
    if raw is None or raw == "":
        return None
    try:
        value = int(float(raw))
    except (TypeError, ValueError) as exc:
        raise ValueError("must be a whole number of pixels") from exc
    if value < 16 or value > config.MAX_DIMENSION:
        raise ValueError(f"must be between 16 and {config.MAX_DIMENSION} pixels")
    return value


def _parse_params(source: Mapping[str, Any], limits: PlanLimits) -> dict:
    """Validate optimization options server-side, independent of the UI."""
    max_output = limits.max_output_mb * MB
    try:
        size_kb = _parse_number(source.get("target_size_kb"))
        size_mb = _parse_number(source.get("target_size_mb"))
    except ValueError as exc:
        raise OptimizationError("INVALID_TARGET_SIZE", f"Target size {exc}", 400) from exc

    if size_kb is not None:
        target_size = int(size_kb * 1024)
    elif size_mb is not None:
        target_size = int(size_mb * MB)
    else:
        target_size = min(DEFAULT_TARGET_MB * MB, max_output)

    if target_size < MIN_TARGET_BYTES:
        raise OptimizationError(
            "INVALID_TARGET_SIZE",
            f"Target size must be at least {format_bytes(MIN_TARGET_BYTES)}",
            400,
        )
    if target_size > max_output:
        raise OptimizationError(
            "TARGET_TOO_LARGE",
            f"Your plan allows a maximum output of {limits.max_output_mb} MB",
            400,
        )

    raw_format = source.get("output_format")
    output_format: Optional[ImageFormat] = None
    if raw_format not in (None, "", "auto", "AUTO", "Auto"):
        try:
            output_format = ImageFormat(str(raw_format).upper())
        except ValueError as exc:
            supported = ", ".join(f.value for f in ImageFormat)
            raise OptimizationError(
                "INVALID_OUTPUT_FORMAT",
                f"Unsupported output format. Choose one of: {supported}",
                400,
            ) from exc

    try:
        target_width = _parse_dimension(source.get("target_width"))
        target_height = _parse_dimension(source.get("target_height"))
    except ValueError as exc:
        raise OptimizationError("INVALID_RESOLUTION", f"Resolution {exc}", 400) from exc

    return {
        "target_size": target_size,
        "output_format": output_format,
        "target_width": target_width,
        "target_height": target_height,
    }


def _safe_download_name(original_filename: str, fmt: ImageFormat) -> str:
    stem = (original_filename or "image").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    stem = re.sub(r"\.[A-Za-z0-9]{1,5}$", "", stem)
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-._") or "image"
    return f"{stem[:80]}-optimized.{fmt.extension}"


def _binary_response(
    *,
    data: bytes,
    fmt: ImageFormat,
    width: int,
    height: int,
    analysis: ImageAnalysis,
    target_size: int,
    quality: Optional[int],
    processing_ms: int,
    target_met: bool,
    message: Optional[str],
    original_filename: str,
    reencoded: bool,
) -> Response:
    filename = _safe_download_name(original_filename, fmt)
    response = send_file(
        io.BytesIO(data),
        mimetype=fmt.mime_type,
        as_attachment=True,
        download_name=filename,
        max_age=0,
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"

    saved_bytes = analysis.size - len(data)
    ratio = (saved_bytes / analysis.size * 100) if analysis.size else 0.0

    headers = {
        "X-Original-Size": str(analysis.size),
        "X-Original-Width": str(analysis.width),
        "X-Original-Height": str(analysis.height),
        "X-Original-Format": analysis.format.value,
        "X-Output-Size": str(len(data)),
        "X-Output-Width": str(width),
        "X-Output-Height": str(height),
        "X-Output-Format": fmt.value,
        "X-Target-Size": str(target_size),
        "X-Target-Met": "true" if target_met else "false",
        "X-Processing-Time-Ms": str(processing_ms),
        "X-Compression-Ratio": f"{ratio:.2f}",
        "X-Saved-Bytes": str(saved_bytes),
        "X-Filename": filename,
        "X-Reencoded": "true" if reencoded else "false",
    }
    if quality is not None:
        headers["X-Quality-Used"] = str(quality)
    if message:
        headers["X-Message"] = message[:500]
    response.headers.extend(headers)
    return response


def _failure_from_result(result: OptimizationResult) -> Tuple[Response, int]:
    status_map = {
        "INVALID_TARGET_SIZE": 400,
        "INVALID_RESOLUTION": 400,
        "TARGET_TOO_LARGE": 400,
        "INVALID_OUTPUT_FORMAT": 400,
        "UNSUPPORTED_FORMAT": 415,
        "AVIF_UNSUPPORTED": 422,
        "WEBP_UNSUPPORTED": 422,
        "RESOLUTION_TOO_HIGH": 422,
        "ENCODING_FAILED": 500,
        "OPTIMIZATION_FAILED": 500,
    }
    status = status_map.get(result.error_code or "", 422)
    return _api_error(
        result.error_code or "OPTIMIZATION_FAILED",
        result.error or "The image could not be optimized",
        status,
    )


def _persist_history(
    user: User, analysis: ImageAnalysis, result: OptimizationResult, target_size: int
) -> None:
    if user.is_anonymous or result.output_format is None:
        return
    try:
        create_optimization(
            user_id=user.id,
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
            processing_time_ms=result.processing_time_ms,
        )
    except DatabaseUnavailable:
        logger.warning("Optimization history not persisted (database unavailable)")


def _needs_transform(analysis: ImageAnalysis, params: dict) -> bool:
    if params["target_width"] is not None or params["target_height"] is not None:
        return True
    fmt = params["output_format"]
    return fmt is not None and fmt != analysis.format


def _passthrough_response(
    data: bytes, analysis: ImageAnalysis, params: dict, original_filename: str
) -> Response:
    return _binary_response(
        data=data,
        fmt=analysis.format,
        width=analysis.width,
        height=analysis.height,
        analysis=analysis,
        target_size=params["target_size"],
        quality=None,
        processing_ms=0,
        target_met=len(data) <= params["target_size"],
        message=(
            "The original file already meets the target size and no conversion was "
            "requested, so it is returned unchanged."
        ),
        original_filename=original_filename,
        reencoded=False,
    )


def _read_upload(file, max_bytes: int):
    """Read an upload once, bounded by the plan limit."""
    try:
        data = file.stream.read(max_bytes + 1)
    except Exception:
        return _api_error("READ_FAILED", "The uploaded file could not be read", 400)
    if len(data) > max_bytes:
        return _api_error(
            "FILE_TOO_LARGE",
            f"File size exceeds limit of {max_bytes // (1024 * 1024)} MB",
            413,
        )
    return data


def _quota_response(exc: QuotaExceeded) -> Tuple[Response, int]:
    response, status = _api_error(exc.code, exc.message, 429)
    response.headers["Retry-After"] = str(exc.retry_after)
    return response, status


# --------------------------------------------------------------------- routes
@optimize_bp.route("/analyze", methods=["POST"])
def analyze_image():
    file = request.files.get("file")
    if file is None:
        return _api_error("NO_FILE", "No file uploaded")
    if not file.filename:
        return _api_error("NO_FILE", "No file selected")

    user = _current_user() or create_anonymous_user()
    limits = get_plan_limits(user.plan)

    try:
        check_quota(user, limits, _client_identifier(user))
    except QuotaExceeded as exc:
        return _quota_response(exc)

    upload = _read_upload(file, limits.max_input_mb * MB)
    if isinstance(upload, tuple):
        return upload

    is_valid, error, code = validate_image(io.BytesIO(upload), limits.max_input_mb * MB)
    if not is_valid:
        return _api_error(code or "INVALID_IMAGE", error or "Invalid image")

    try:
        analysis = ImageOptimizer(limits).analyze(io.BytesIO(upload), file.filename)
    except OptimizationError as exc:
        return _api_error(exc.code, exc.message, exc.status)

    return jsonify(
        {
            "success": True,
            "data": {
                "filename": analysis.filename,
                "format": analysis.format.value,
                "mime_type": analysis.format.mime_type,
                "size": analysis.size,
                "size_formatted": format_bytes(analysis.size),
                "width": analysis.width,
                "height": analysis.height,
                "dimensions": f"{analysis.width} × {analysis.height}",
                "aspect_ratio": analysis.aspect_ratio,
                "megapixels": round(analysis.megapixels, 1),
                "has_transparency": analysis.has_transparency,
                "mode": analysis.mode,
                "estimated_optimization": analysis.estimated_optimization,
            },
        }
    )


@optimize_bp.route("/optimize", methods=["POST"])
def optimize_image():
    file = request.files.get("file")
    if file is None:
        return _api_error("NO_FILE", "No file uploaded")
    if not file.filename:
        return _api_error("NO_FILE", "No file selected")

    user = _current_user() or create_anonymous_user()
    limits = get_plan_limits(user.plan)

    try:
        check_quota(user, limits, _client_identifier(user))
        params = _parse_params(request.form, limits)
    except QuotaExceeded as exc:
        return _quota_response(exc)
    except OptimizationError as exc:
        return _api_error(exc.code, exc.message, exc.status)

    upload = _read_upload(file, limits.max_input_mb * MB)
    if isinstance(upload, tuple):
        return upload

    is_valid, error, code = validate_image(io.BytesIO(upload), limits.max_input_mb * MB)
    if not is_valid:
        return _api_error(code or "INVALID_IMAGE", error or "Invalid image")

    optimizer = ImageOptimizer(limits)
    try:
        analysis = optimizer.analyze(io.BytesIO(upload), file.filename)
    except OptimizationError as exc:
        return _api_error(exc.code, exc.message, exc.status)

    if analysis.size <= params["target_size"] and not _needs_transform(analysis, params):
        record_usage(user, _client_identifier(user))
        return _passthrough_response(upload, analysis, params, file.filename)

    result = optimizer.optimize(
        io.BytesIO(upload),
        OptimizationRequest(
            target_size=params["target_size"],
            output_format=params["output_format"],
            target_width=params["target_width"],
            target_height=params["target_height"],
        ),
        analysis,
    )

    if not result.success or not result.data or result.output_format is None:
        return _failure_from_result(result)

    _persist_history(user, analysis, result, params["target_size"])
    record_usage(user, _client_identifier(user))

    return _binary_response(
        data=result.data,
        fmt=result.output_format,
        width=result.output_width,
        height=result.output_height,
        analysis=analysis,
        target_size=params["target_size"],
        quality=result.quality_used,
        processing_ms=result.processing_time_ms,
        target_met=result.target_met,
        message=result.message,
        original_filename=file.filename,
        reencoded=True,
    )


@optimize_bp.route("/optimize-url", methods=["POST"])
def optimize_url():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return _api_error("INVALID_REQUEST", "A JSON body with a url field is required")

    url = data.get("url")
    if not isinstance(url, str) or not url.strip():
        return _api_error("NO_URL", "Please provide an image URL")

    user = _current_user() or create_anonymous_user()
    limits = get_plan_limits(user.plan)

    try:
        check_quota(user, limits, _client_identifier(user))
        params = _parse_params(data, limits)
    except QuotaExceeded as exc:
        return _quota_response(exc)
    except OptimizationError as exc:
        return _api_error(exc.code, exc.message, exc.status)

    buffer, _content_type, fetch_error = url_fetcher.fetch(url.strip())
    if fetch_error or buffer is None:
        return _api_error(
            "URL_FETCH_FAILED", fetch_error or "The image could not be downloaded"
        )

    filename = url.rsplit("/", 1)[-1].split("?")[0] or "remote-image"
    optimizer = ImageOptimizer(limits)
    try:
        analysis = optimizer.analyze(buffer, filename)
    except OptimizationError as exc:
        return _api_error(exc.code, exc.message, exc.status)

    if analysis.size <= params["target_size"] and not _needs_transform(analysis, params):
        buffer.seek(0)
        record_usage(user, _client_identifier(user))
        return _passthrough_response(buffer.read(), analysis, params, filename)

    result = optimizer.optimize(
        buffer,
        OptimizationRequest(
            target_size=params["target_size"],
            output_format=params["output_format"],
            target_width=params["target_width"],
            target_height=params["target_height"],
        ),
        analysis,
    )

    if not result.success or not result.data or result.output_format is None:
        return _failure_from_result(result)

    _persist_history(user, analysis, result, params["target_size"])
    record_usage(user, _client_identifier(user))

    return _binary_response(
        data=result.data,
        fmt=result.output_format,
        width=result.output_width,
        height=result.output_height,
        analysis=analysis,
        target_size=params["target_size"],
        quality=result.quality_used,
        processing_ms=result.processing_time_ms,
        target_met=result.target_met,
        message=result.message,
        original_filename=filename,
        reencoded=True,
    )


@optimize_bp.route("/history", methods=["GET"])
def get_history():
    user = _current_user()
    if not user:
        return _api_error("AUTH_REQUIRED", "Authentication required", 401)

    limit = max(1, min(request.args.get("limit", 50, type=int), 100))
    offset = max(0, request.args.get("offset", 0, type=int))

    from app.services.database import get_optimization_history

    optimizations = get_optimization_history(user.id, limit, offset)

    return jsonify(
        {
            "success": True,
            "data": [
                {
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
                    "created_at": opt.created_at.isoformat() if opt.created_at else None,
                }
                for opt in optimizations
            ],
        }
    )


@optimize_bp.route("/limits", methods=["GET"])
def get_limits():
    user = _current_user() or create_anonymous_user()
    limits = get_plan_limits(user.plan)
    remaining = remaining_for(user, limits, _client_identifier(user))

    return jsonify(
        {
            "success": True,
            "data": {
                "plan": user.plan.value,
                "max_input_mb": limits.max_input_mb,
                "max_output_mb": limits.max_output_mb,
                "daily_optimizations": limits.daily_optimizations,
                "daily_used": (
                    limits.daily_optimizations - remaining
                    if limits.daily_optimizations > 0 and remaining >= 0
                    else 0
                ),
                "daily_remaining": remaining,
                "priority_processing": limits.priority_processing,
                "batch_processing": limits.batch_processing,
                "no_ads": limits.no_ads,
                "history_retention_days": limits.history_retention_days,
                "supported_formats": [f.value for f in ImageFormat],
            },
        }
    )
