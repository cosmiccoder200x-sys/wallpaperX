import os
import logging
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
load_dotenv()  # Load .env file
from app.config import config
from app.routes.optimize import optimize_bp
from app.routes.auth import auth_bp
from app.routes.wallpapers import wallpapers_bp
from app.routes.admin import admin_bp
from app.services.database import init_db, get_pool

logging.basicConfig(
    level=logging.INFO if not config.DEBUG else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = config.SECRET_KEY
    app.config['MAX_CONTENT_LENGTH'] = config.max_upload_bytes
    
    cors_origins = [o.strip() for o in config.CORS_ORIGINS.split(',')]
    CORS(app, origins=cors_origins, supports_credentials=True)
    
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(optimize_bp, url_prefix='/api/optimize')
    app.register_blueprint(wallpapers_bp, url_prefix='/api/wallpapers')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    
    @app.route('/api/health')
    def health_check():
        return jsonify({"status": "ok", "version": "1.0.0"})
    
    @app.route('/api/version')
    def version():
        return jsonify({"version": "1.0.0", "name": "Wallpaper10 API"})
    
    @app.errorhandler(413)
    def request_entity_too_large(error):
        return jsonify({
            "success": False,
            "error": {
                "code": "FILE_TOO_LARGE",
                "message": f"File size exceeds maximum allowed size of {config.MAX_UPLOAD_SIZE_MB} MB"
            }
        }), 413
    
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            "success": False,
            "error": {"code": "NOT_FOUND", "message": "Endpoint not found"}
        }), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        logger.error(f"Internal server error: {error}", exc_info=True)
        return jsonify({
            "success": False,
            "error": {"code": "INTERNAL_ERROR", "message": "An internal server error occurred"}
        }), 500
    
    @app.route('/storage/<path:filename>')
    def serve_storage(filename):
        return send_from_directory(config.LOCAL_STORAGE_PATH, filename)
    
    try:
        init_db()
        logger.info("Database initialized")
    except Exception as e:
        logger.warning(f"Database initialization skipped: {e}")
    
    return app


app = create_app()

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=config.DEBUG)