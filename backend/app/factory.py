"""Flask application factory."""

import logging
import os

from dotenv import load_dotenv

load_dotenv()  # must run before app.config reads the environment

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from app.config import config
from app.routes.admin import admin_bp
from app.routes.auth import auth_bp
from app.routes.optimize import optimize_bp
from app.routes.wallpapers import wallpapers_bp
from app.services.database import DatabaseUnavailable, init_db

logging.basicConfig(
    level=logging.INFO if not config.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

EXPOSED_HEADERS = [
    "Content-Disposition",
    "X-Original-Size",
    "X-Original-Width",
    "X-Original-Height",
    "X-Original-Format",
    "X-Output-Size",
    "X-Output-Width",
    "X-Output-Height",
    "X-Output-Format",
    "X-Target-Size",
    "X-Target-Met",
    "X-Quality-Used",
    "X-Processing-Time-Ms",
    "X-Compression-Ratio",
    "X-Saved-Bytes",
    "X-Filename",
    "X-Reencoded",
    "X-Message",
    "Retry-After",
]


def _error(code: str, message: str, status: int):
    return jsonify({"success": False, "error": {"code": code, "message": message}}), status


def create_app(testing: bool = False):
    app = Flask(__name__)
    config.validate()  # refuse to start with unsafe production secrets

    app.config["SECRET_KEY"] = config.SECRET_KEY or "development-only-secret"
    app.config["MAX_CONTENT_LENGTH"] = config.max_upload_bytes
    app.config["JSON_SORT_KEYS"] = False
    if testing:
        app.config["TESTING"] = True

    CORS(
        app,
        origins=config.cors_origins,
        supports_credentials=True,
        expose_headers=EXPOSED_HEADERS,
        allow_headers=["Content-Type", "Authorization"],
    )

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(optimize_bp, url_prefix="/api/optimize")
    app.register_blueprint(wallpapers_bp, url_prefix="/api/wallpapers")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")

    @app.route("/api/health")
    def health_check():
        from PIL import features

        from app.services.database import database_available

        return jsonify(
            {
                "status": "ok",
                "version": "1.1.0",
                "database": "connected" if database_available() else "unavailable",
                "avif": features.check("avif"),
                "webp": features.check("webp"),
            }
        )

    @app.route("/api/version")
    def version():
        return jsonify({"version": "1.1.0", "name": "WallpaperX API"})

    @app.errorhandler(400)
    def bad_request(error):
        return _error("BAD_REQUEST", "The request could not be understood", 400)

    @app.errorhandler(404)
    def not_found(error):
        return _error("NOT_FOUND", "Endpoint not found", 404)

    @app.errorhandler(405)
    def method_not_allowed(error):
        return _error("METHOD_NOT_ALLOWED", "Method not allowed for this endpoint", 405)

    @app.errorhandler(413)
    def request_entity_too_large(error):
        return _error(
            "FILE_TOO_LARGE",
            f"File size exceeds the maximum allowed size of {config.MAX_UPLOAD_SIZE_MB} MB",
            413,
        )

    @app.errorhandler(DatabaseUnavailable)
    def database_unavailable(error):
        logger.error("Database unavailable: %s", type(error).__name__)
        return _error(
            "DATABASE_UNAVAILABLE",
            "This feature is temporarily unavailable. Please try again later.",
            503,
        )

    @app.errorhandler(HTTPException)
    def http_exception(error):
        return _error(
            (error.name or "HTTP_ERROR").upper().replace(" ", "_"),
            error.description or "Request failed",
            error.code or 500,
        )

    @app.errorhandler(Exception)
    def internal_error(error):
        # Log server-side, never expose exception details or stack traces.
        logger.exception("Unhandled server error on %s", request.path)
        return _error("INTERNAL_ERROR", "An internal server error occurred", 500)

    @app.route("/storage/<path:filename>")
    def serve_storage(filename):
        return send_from_directory(config.LOCAL_STORAGE_PATH, filename, max_age=3600)

    if not testing:
        try:
            init_db()
            logger.info("Database initialized")
        except DatabaseUnavailable as exc:
            logger.warning("Database initialization skipped: %s", type(exc).__name__)

    return app
