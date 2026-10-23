"""
Readings routes — transporter reading submission and journey control.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from datetime import datetime, timezone
import json

from ..models.database import (
    Shipment, ShipmentAssignment, TransporterReading, TrustedSensorRecord, AuditEvent,
    ShipmentStatus, AuditEventType, UserRole, get_session
)
from .auth import require_role

readings_bp = Blueprint("readings", __name__, url_prefix="/api")


def _reading_to_dict(r):
    return {
        "id": r.id,
        "sequence_number": r.sequence_number,
        "measured_at": r.measured_at.isoformat() if r.measured_at else None,
        "server_received_at": r.server_received_at.isoformat() if r.server_received_at else None,
        "temperature_celsius": r.temperature_celsius,
        "unit": r.unit,
        "is_out_of_range": r.is_out_of_range,
        "is_correction": r.is_correction,
        "correction_reason": r.correction_reason,
        "notes": r.notes,
    }


def _trusted_to_dict(r):
    return {
        "id": r.id,
        "sequence_number": r.sequence_number,
        "device_id": r.device_id,
        "measured_at": r.measured_at.isoformat() if r.measured_at else None,
        "temperature_celsius": r.temperature_celsius,
        "unit": r.unit,
        "data_source": r.data_source,
        "record_hash": r.record_hash,
        "previous_hash": r.previous_hash,
    }


# ── Journey Control ───────────────────────────────────────────────────────────

@readings_bp.route("/journeys/<string:shipment_id>/start", methods=["POST"])
@require_role(UserRole.TRANSPORTER.value)
def start_journey(shipment_id):
    user_id = int(get_jwt_identity())
    session = get_session()
    try:
        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        if not s:
            return jsonify({"error": "Shipment not found."}), 404

        # Auth: transporter must be assigned
        if not s.assignment or s.assignment.transporter_id != user_id:
            return jsonify({"error": "Not authorized for this shipment."}), 403

        if s.status == ShipmentStatus.IN_TRANSIT.value:
            return jsonify({"error": "Journey already started."}), 409
        if s.status not in (ShipmentStatus.CREATED.value, ShipmentStatus.COMMITTED.value):
            return jsonify({"error": f"Cannot start journey from status '{s.status}'."}), 400

        now = datetime.now(timezone.utc)
        s.status = ShipmentStatus.IN_TRANSIT.value
        s.journey_started_at = now

        session.add(AuditEvent(
            event_type=AuditEventType.JOURNEY_STARTED.value,
            shipment_id_fk=s.id,
            actor_id=user_id,
            actor_role=UserRole.TRANSPORTER.value,
            occurred_at=now,
            outcome="SUCCESS",
            description=f"Journey started.",
        ))
        session.commit()
        return jsonify({"message": "Journey started.", "status": s.status,
                        "journey_started_at": now.isoformat()}), 200
    finally:
        session.close()


@readings_bp.route("/journeys/<string:shipment_id>/deliver", methods=["POST"])
@require_role(UserRole.TRANSPORTER.value)
def mark_delivered(shipment_id):
    user_id = int(get_jwt_identity())
    session = get_session()
    try:
        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        if not s:
            return jsonify({"error": "Shipment not found."}), 404

        if not s.assignment or s.assignment.transporter_id != user_id:
            return jsonify({"error": "Not authorized for this shipment."}), 403

        if s.status != ShipmentStatus.IN_TRANSIT.value:
            return jsonify({"error": f"Cannot deliver from status '{s.status}'."}), 400

        now = datetime.now(timezone.utc)
        s.status = ShipmentStatus.DELIVERED.value
        s.delivered_at = now

        session.add(AuditEvent(
            event_type=AuditEventType.SHIPMENT_DELIVERED.value,
            shipment_id_fk=s.id,
            actor_id=user_id,
            actor_role=UserRole.TRANSPORTER.value,
            occurred_at=now,
            outcome="SUCCESS",
            description="Shipment marked delivered.",
        ))
        session.commit()
        return jsonify({"message": "Shipment delivered.", "status": s.status,
                        "delivered_at": now.isoformat()}), 200
    finally:
        session.close()


# ── Reading Submission ────────────────────────────────────────────────────────

@readings_bp.route("/readings/<string:shipment_id>", methods=["POST"])
@require_role(UserRole.TRANSPORTER.value)
def submit_reading(shipment_id):
    """Submit one manual temperature reading."""
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    session = get_session()
    try:
        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        if not s:
            return jsonify({"error": "Shipment not found."}), 404

        if not s.assignment or s.assignment.transporter_id != user_id:
            return jsonify({"error": "Not authorized for this shipment."}), 403

        if s.status != ShipmentStatus.IN_TRANSIT.value:
            return jsonify({"error": f"Readings can only be submitted when shipment is IN_TRANSIT. Current status: {s.status}"}), 400

        # Validate temperature
        temp_raw = data.get("temperature_celsius")
        if temp_raw is None:
            return jsonify({"error": "temperature_celsius is required."}), 400
        try:
            temp = float(temp_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "temperature_celsius must be a number."}), 400
        if temp < -80 or temp > 200:
            return jsonify({"error": "temperature_celsius out of plausible range (-80 to 200°C)."}), 400

        # Validate measured_at
        measured_at_str = data.get("measured_at")
        if measured_at_str:
            try:
                measured_at = datetime.fromisoformat(measured_at_str.replace("Z", "+00:00"))
                if measured_at.tzinfo is None:
                    measured_at = measured_at.replace(tzinfo=timezone.utc)
            except ValueError:
                return jsonify({"error": "Invalid measured_at format. Use ISO 8601."}), 400
        else:
            measured_at = datetime.now(timezone.utc)

        server_received_at = datetime.now(timezone.utc)

        # Determine next sequence number
        existing_count = session.query(TransporterReading).filter_by(
            shipment_id_fk=s.id, is_correction=False
        ).count()
        seq_num = existing_count + 1

        is_oor = temp < s.min_temp or temp > s.max_temp

        reading = TransporterReading(
            shipment_id_fk=s.id,
            transporter_id=user_id,
            sequence_number=seq_num,
            measured_at=measured_at,
            server_received_at=server_received_at,
            temperature_celsius=temp,
            unit="C",
            is_out_of_range=is_oor,
            is_correction=False,
            notes=data.get("notes", ""),
        )
        session.add(reading)
        session.flush()

        session.add(AuditEvent(
            event_type=AuditEventType.READING_SUBMITTED.value,
            shipment_id_fk=s.id,
            actor_id=user_id,
            actor_role=UserRole.TRANSPORTER.value,
            outcome="SUCCESS",
            description=f"Reading #{seq_num}: {temp}°C at {measured_at.isoformat()}. {'OUT OF RANGE' if is_oor else 'In range.'}",
        ))
        session.commit()

        return jsonify({
            "message": "Reading submitted.",
            "reading": _reading_to_dict(reading),
            "out_of_range_warning": is_oor,
            "min_temp": s.min_temp,
            "max_temp": s.max_temp,
        }), 201
    finally:
        session.close()


@readings_bp.route("/readings/<string:shipment_id>", methods=["GET"])
@jwt_required()
def get_readings(shipment_id):
    """Get transporter readings for a shipment."""
    claims = get_jwt()
    role = claims.get("role")
    user_id = int(get_jwt_identity())

    session = get_session()
    try:
        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        if not s:
            return jsonify({"error": "Shipment not found."}), 404

        # Transporter: only their own shipment
        if role == UserRole.TRANSPORTER.value:
            if not s.assignment or s.assignment.transporter_id != user_id:
                return jsonify({"error": "Not authorized."}), 403

        readings = session.query(TransporterReading).filter_by(
            shipment_id_fk=s.id
        ).order_by(TransporterReading.sequence_number).all()
        return jsonify([_reading_to_dict(r) for r in readings]), 200
    finally:
        session.close()


# ── Trusted Data (receiver + admin only) ─────────────────────────────────────

@readings_bp.route("/trusted-data/<string:shipment_id>", methods=["GET"])
@require_role(UserRole.ADMIN.value, UserRole.RECEIVER.value)
def get_trusted_data(shipment_id):
    """Retrieve trusted sensor records — NOT available to transporters."""
    session = get_session()
    try:
        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        if not s:
            return jsonify({"error": "Shipment not found."}), 404

        records = session.query(TrustedSensorRecord).filter_by(
            shipment_id_fk=s.id
        ).order_by(TrustedSensorRecord.sequence_number).all()

        manifest = s.dataset_manifest
        manifest_dict = None
        if manifest:
            manifest_dict = {
                "shipment_id": manifest.shipment_ref,
                "device_id": manifest.device_id,
                "schema_version": manifest.schema_version,
                "record_count": manifest.record_count,
                "dataset_fingerprint": manifest.dataset_fingerprint,
                "signing_key_id": manifest.signing_key_id,
                "signature": manifest.signature,
                "data_source": manifest.data_source,
                "is_simulated": manifest.is_simulated,
                "created_at": manifest.created_at.isoformat() if manifest.created_at else None,
            }

        bc = s.blockchain_commitment
        bc_dict = None
        if bc:
            bc_dict = {
                "dataset_fingerprint": bc.dataset_fingerprint,
                "transaction_hash": bc.transaction_hash,
                "block_number": bc.block_number,
                "chain_id": bc.chain_id,
                "committed_at": bc.committed_at.isoformat() if bc.committed_at else None,
                "is_demo": bc.is_demo,
                "is_confirmed": bc.is_confirmed,
                "verification_status": bc.verification_status,
            }

        return jsonify({
            "shipment_id": shipment_id,
            "records": [_trusted_to_dict(r) for r in records],
            "manifest": manifest_dict,
            "blockchain_commitment": bc_dict,
            "data_source_warning": (
                "⚠️ SIMULATED DATA — These records were generated by software, "
                "not a physical sensor device. For demonstration purposes only."
                if records and records[0].data_source == "SIMULATED"
                else None
            ),
        }), 200
    finally:
        session.close()
