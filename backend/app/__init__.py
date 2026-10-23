"""
ColdChain Ledger — Flask Application Factory
"""

import os
from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from .models.database import init_db, create_db_engine, SessionFactory
from .routes.auth import auth_bp
from .routes.shipments import shipments_bp
from .routes.readings import readings_bp
from .routes.verification import verification_bp
from .routes.users import users_bp


def create_app(config_override=None):
    app = Flask(__name__)

    # ── Configuration ─────────────────────────────────────────────────────
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-in-production")
    app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY", "jwt-dev-secret-change-in-production")
    app.config["JWT_TOKEN_LOCATION"] = ["headers"]
    app.config["JWT_HEADER_NAME"] = "Authorization"
    app.config["JWT_HEADER_TYPE"] = "Bearer"

    if config_override:
        app.config.update(config_override)

    # ── Extensions ────────────────────────────────────────────────────────
    allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
    CORS(app, resources={r"/api/*": {"origins": allowed_origins.split(",")}},
         supports_credentials=True)

    JWTManager(app)

    # ── Database ──────────────────────────────────────────────────────────
    db_url = os.environ.get("DATABASE_URL", "sqlite:///coldchain.db")
    engine = create_db_engine(db_url)
    init_db(engine)

    # ── Blueprints ────────────────────────────────────────────────────────
    app.register_blueprint(auth_bp)
    app.register_blueprint(shipments_bp)
    app.register_blueprint(readings_bp)
    app.register_blueprint(verification_bp)
    app.register_blueprint(users_bp)

    # ── Health Check ──────────────────────────────────────────────────────
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "ColdChain Ledger API", "version": "1.0.0"}), 200

    # ── Error Handlers ────────────────────────────────────────────────────
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Endpoint not found."}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed."}), 405

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"error": "Internal server error."}), 500

    return app
