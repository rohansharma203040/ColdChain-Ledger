"""Auth routes — login, logout, current user."""

from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import (
    create_access_token, jwt_required, get_jwt_identity, get_jwt
)
from werkzeug.security import check_password_hash, generate_password_hash
from datetime import timedelta
import json

from ..models.database import User, AuditEvent, AuditEventType, UserRole, get_session

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

TOKEN_EXPIRES = timedelta(hours=12)


def _log_event(session, event_type, user=None, outcome="SUCCESS", description="", metadata=None):
    ev = AuditEvent(
        event_type=event_type,
        actor_id=user.id if user else None,
        actor_role=user.role if user else None,
        outcome=outcome,
        description=description,
        metadata_json=json.dumps(metadata) if metadata else None,
    )
    session.add(ev)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    session = get_session()
    try:
        user = session.query(User).filter_by(username=username, is_active=True).first()
        if user is None or not check_password_hash(user.password_hash, password):
            _log_event(session, AuditEventType.LOGIN_FAILED.value,
                       outcome="FAILURE", description=f"Failed login for '{username}'.")
            session.commit()
            return jsonify({"error": "Invalid credentials."}), 401

        token = create_access_token(
            identity=str(user.id),
            expires_delta=TOKEN_EXPIRES,
            additional_claims={"role": user.role, "username": user.username},
        )

        from datetime import datetime, timezone
        user.last_login_at = datetime.now(timezone.utc)
        _log_event(session, AuditEventType.LOGIN_SUCCESS.value, user=user,
                   outcome="SUCCESS", description=f"User {username} logged in.")
        session.commit()

        return jsonify({
            "access_token": token,
            "user": {
                "id": user.id,
                "username": user.username,
                "full_name": user.full_name,
                "role": user.role,
                "email": user.email,
            },
        }), 200
    finally:
        session.close()


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    session = get_session()
    try:
        user = session.get(User, user_id)
        if not user:
            return jsonify({"error": "User not found."}), 404
        return jsonify({
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "email": user.email,
        }), 200
    finally:
        session.close()


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    # JWT-Extended stateless — client must discard the token.
    # A token blocklist could be added for production.
    return jsonify({"message": "Logged out. Discard your access token."}), 200


def require_role(*roles):
    """Decorator factory: restrict endpoint to users with one of the given roles."""
    from functools import wraps

    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            role = claims.get("role", "")
            if role not in [r if isinstance(r, str) else r.value for r in roles]:
                return jsonify({"error": f"Access denied. Required role(s): {roles}"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
