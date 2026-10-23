"""
Users route — list transporters for admin assignment.
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from ..models.database import User, UserRole, get_session
from .auth import require_role

users_bp = Blueprint("users", __name__, url_prefix="/api/users")


@users_bp.route("/transporters", methods=["GET"])
@require_role(UserRole.ADMIN.value)
def list_transporters():
    session = get_session()
    try:
        transporters = session.query(User).filter_by(
            role=UserRole.TRANSPORTER.value, is_active=True
        ).all()
        return jsonify([{
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "email": u.email,
        } for u in transporters]), 200
    finally:
        session.close()
