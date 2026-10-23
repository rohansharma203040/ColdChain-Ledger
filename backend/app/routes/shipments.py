"""
Shipment routes — CRUD, assignment, trusted data init.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from datetime import datetime, timezone
import json

from ..models.database import (
    Shipment, ShipmentAssignment, TrustedSensorRecord, DatasetManifest,
    BlockchainCommitment, AuditEvent, User,
    ShipmentStatus, DataSource, AuditEventType, UserRole, get_session
)
from ..services.crypto_service import build_hash_chain, compute_dataset_fingerprint, sign_manifest
from .auth import require_role

shipments_bp = Blueprint("shipments", __name__, url_prefix="/api/shipments")


def _shipment_to_dict(s, include_assignment=True):
    d = {
        "id": s.id,
        "shipment_id": s.shipment_id,
        "medicine_name": s.medicine_name,
        "batch_number": s.batch_number,
        "origin": s.origin,
        "destination": s.destination,
        "vehicle_registration": s.vehicle_registration,
        "min_temp": s.min_temp,
        "max_temp": s.max_temp,
        "reading_interval_minutes": s.reading_interval_minutes,
        "status": s.status,
        "notes": s.notes,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "journey_started_at": s.journey_started_at.isoformat() if s.journey_started_at else None,
        "delivered_at": s.delivered_at.isoformat() if s.delivered_at else None,
        "trusted_record_count": len(s.trusted_records) if s.trusted_records else 0,
        "transporter_reading_count": len(s.transporter_readings) if s.transporter_readings else 0,
        "has_manifest": s.dataset_manifest is not None,
        "has_blockchain_commitment": s.blockchain_commitment is not None,
    }

    # Derive real operational telemetry & excursion status
    latest_temp = None
    has_excursion = False

    if s.transporter_readings:
        sorted_readings = sorted(s.transporter_readings, key=lambda r: r.sequence_number)
        latest_temp = sorted_readings[-1].temperature_celsius
        for r in sorted_readings:
            if r.is_out_of_range or (s.min_temp is not None and (r.temperature_celsius < s.min_temp or r.temperature_celsius > s.max_temp)):
                has_excursion = True

    if latest_temp is None and s.trusted_records:
        sorted_trusted = sorted(s.trusted_records, key=lambda r: r.sequence_number)
        latest_temp = sorted_trusted[-1].temperature_celsius
        for r in sorted_trusted:
            if s.min_temp is not None and (r.temperature_celsius < s.min_temp or r.temperature_celsius > s.max_temp):
                has_excursion = True

    latest_ver = None
    if s.verification_runs:
        sorted_runs = sorted(s.verification_runs, key=lambda vr: vr.run_at, reverse=True)
        vr = sorted_runs[0]
        try:
            ver_data = json.loads(vr.result_json) if vr.result_json else {}
            latest_ver = {
                "overall_integrity_status": ver_data.get("overall_integrity_status"),
                "overall_compliance_status": ver_data.get("overall_compliance_status"),
                "recommended_action": ver_data.get("recommended_action")
            }
            if ver_data.get("overall_compliance_status") == "EXCURSION_DETECTED":
                has_excursion = True
        except Exception:
            pass

    d["latest_temperature"] = latest_temp
    d["has_excursion"] = has_excursion or (s.status in ("HELD", "REJECTED"))
    d["updated_at"] = s.updated_at.isoformat() if s.updated_at else d["created_at"]
    d["latest_verification"] = latest_ver

    if include_assignment and s.assignment:
        d["assignment"] = {
            "transporter_id": s.assignment.transporter_id,
            "transporter_username": s.assignment.transporter.username if s.assignment.transporter else None,
            "transporter_full_name": s.assignment.transporter.full_name if s.assignment.transporter else None,
            "assigned_at": s.assignment.assigned_at.isoformat(),
        }
    else:
        d["assignment"] = None
    return d


@shipments_bp.route("/", methods=["GET"])
@jwt_required()
def list_shipments():
    claims = get_jwt()
    role = claims.get("role")
    user_id = int(get_jwt_identity())

    session = get_session()
    try:
        query = session.query(Shipment)

        # Transporters see only their assigned shipments
        if role == UserRole.TRANSPORTER.value:
            query = query.join(ShipmentAssignment,
                               ShipmentAssignment.shipment_id_fk == Shipment.id
                               ).filter(ShipmentAssignment.transporter_id == user_id,
                                        ShipmentAssignment.is_active == True)

        # Optional filters
        status_filter = request.args.get("status")
        if status_filter:
            query = query.filter(Shipment.status == status_filter)

        shipments = query.order_by(Shipment.created_at.desc()).all()
        return jsonify([_shipment_to_dict(s) for s in shipments]), 200
    finally:
        session.close()


@shipments_bp.route("/<string:shipment_id>", methods=["GET"])
@jwt_required()
def get_shipment(shipment_id):
    claims = get_jwt()
    role = claims.get("role")
    user_id = int(get_jwt_identity())

    session = get_session()
    try:
        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        if not s:
            return jsonify({"error": "Shipment not found."}), 404

        # Transporter authorization: must be assigned to this shipment
        if role == UserRole.TRANSPORTER.value:
            if not s.assignment or s.assignment.transporter_id != user_id:
                return jsonify({"error": "Not authorized to view this shipment."}), 403

        return jsonify(_shipment_to_dict(s)), 200
    finally:
        session.close()


@shipments_bp.route("/", methods=["POST"])
@require_role(UserRole.ADMIN.value)
def create_shipment():
    data = request.get_json(silent=True) or {}
    user_id = int(get_jwt_identity())

    required = ["shipment_id", "medicine_name", "batch_number", "origin", "destination",
                 "vehicle_registration", "min_temp", "max_temp", "reading_interval_minutes"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {missing}"}), 400

    interval = int(data["reading_interval_minutes"])
    if interval not in (5, 10):
        return jsonify({"error": "reading_interval_minutes must be 5 or 10."}), 400

    min_t = float(data["min_temp"])
    max_t = float(data["max_temp"])
    if min_t >= max_t:
        return jsonify({"error": "min_temp must be less than max_temp."}), 400

    session = get_session()
    try:
        existing = session.query(Shipment).filter_by(shipment_id=data["shipment_id"]).first()
        if existing:
            return jsonify({"error": f"Shipment ID '{data['shipment_id']}' already exists."}), 409

        s = Shipment(
            shipment_id=data["shipment_id"],
            medicine_name=data["medicine_name"],
            batch_number=data["batch_number"],
            origin=data["origin"],
            destination=data["destination"],
            vehicle_registration=data["vehicle_registration"],
            min_temp=min_t,
            max_temp=max_t,
            reading_interval_minutes=interval,
            status=ShipmentStatus.CREATED.value,
            created_by_id=user_id,
            notes=data.get("notes", ""),
        )
        session.add(s)
        session.flush()

        session.add(AuditEvent(
            event_type=AuditEventType.SHIPMENT_CREATED.value,
            shipment_id_fk=s.id,
            actor_id=user_id,
            actor_role=UserRole.ADMIN.value,
            outcome="SUCCESS",
            description=f"Shipment {s.shipment_id} created.",
        ))

        # Auto-assign transporter if provided
        if data.get("transporter_username"):
            transporter = session.query(User).filter_by(
                username=data["transporter_username"],
                role=UserRole.TRANSPORTER.value
            ).first()
            if transporter:
                asgn = ShipmentAssignment(
                    shipment_id_fk=s.id,
                    transporter_id=transporter.id,
                    assigned_by_id=user_id,
                )
                session.add(asgn)
                session.add(AuditEvent(
                    event_type=AuditEventType.TRANSPORTER_ASSIGNED.value,
                    shipment_id_fk=s.id,
                    actor_id=user_id,
                    actor_role=UserRole.ADMIN.value,
                    outcome="SUCCESS",
                    description=f"Transporter {transporter.username} assigned to {s.shipment_id}.",
                ))

        session.commit()
        s = session.query(Shipment).filter_by(shipment_id=data["shipment_id"]).first()
        return jsonify(_shipment_to_dict(s)), 201
    finally:
        session.close()


@shipments_bp.route("/<string:shipment_id>/assign", methods=["POST"])
@require_role(UserRole.ADMIN.value)
def assign_transporter(shipment_id):
    data = request.get_json(silent=True) or {}
    user_id = int(get_jwt_identity())

    session = get_session()
    try:
        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        if not s:
            return jsonify({"error": "Shipment not found."}), 404

        transporter_username = data.get("transporter_username")
        if not transporter_username:
            return jsonify({"error": "transporter_username required."}), 400

        transporter = session.query(User).filter_by(
            username=transporter_username, role=UserRole.TRANSPORTER.value
        ).first()
        if not transporter:
            return jsonify({"error": f"Transporter '{transporter_username}' not found."}), 404

        # Deactivate existing
        existing = session.query(ShipmentAssignment).filter_by(
            shipment_id_fk=s.id, is_active=True
        ).first()
        if existing:
            existing.is_active = False

        asgn = ShipmentAssignment(
            shipment_id_fk=s.id,
            transporter_id=transporter.id,
            assigned_by_id=user_id,
        )
        session.add(asgn)
        session.add(AuditEvent(
            event_type=AuditEventType.TRANSPORTER_ASSIGNED.value,
            shipment_id_fk=s.id,
            actor_id=user_id,
            actor_role=UserRole.ADMIN.value,
            outcome="SUCCESS",
            description=f"Transporter {transporter.username} assigned.",
        ))
        session.commit()
        return jsonify({"message": f"Transporter {transporter.username} assigned to {shipment_id}."}), 200
    finally:
        session.close()


@shipments_bp.route("/<string:shipment_id>/init-trusted-data", methods=["POST"])
@require_role(UserRole.ADMIN.value)
def init_trusted_data(shipment_id):
    """
    Initialize trusted sensor data (simulated) for a shipment.
    Generates hash-chained, signed records. Marks data source as SIMULATED.
    """
    data = request.get_json(silent=True) or {}
    user_id = int(get_jwt_identity())

    session = get_session()
    try:
        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        if not s:
            return jsonify({"error": "Shipment not found."}), 404

        if s.dataset_manifest:
            return jsonify({"error": "Trusted dataset already initialized. Cannot silently overwrite."}), 409

        # Expect a list of temperature readings or generate simulated ones
        raw_temps = data.get("temperatures")
        if not raw_temps:
            return jsonify({"error": "Provide 'temperatures' list."}), 400

        start_time_str = data.get("journey_start_utc") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        try:
            start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
        except ValueError:
            return jsonify({"error": "Invalid journey_start_utc format."}), 400

        interval = s.reading_interval_minutes
        raw_records = []
        for idx, temp in enumerate(raw_temps):
            from datetime import timedelta
            measured = start_time + timedelta(minutes=idx * interval)
            raw_records.append({
                "sequence_number": idx + 1,
                "measured_at": measured.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "temperature_celsius": float(temp),
                "unit": "C",
                "data_source": DataSource.SIMULATED.value,
            })

        chained = build_hash_chain(raw_records, shipment_id)
        fingerprint = compute_dataset_fingerprint([
            {"sequence_number": r["sequence_number"], "record_hash": r["record_hash"]}
            for r in chained
        ])

        for rec in chained:
            from datetime import timedelta
            tr = TrustedSensorRecord(
                shipment_id_fk=s.id,
                sequence_number=rec["sequence_number"],
                device_id="SIMULATED-DEVICE-001",
                measured_at=datetime.fromisoformat(rec["measured_at"].replace("Z", "+00:00")),
                temperature_celsius=rec["temperature_celsius"],
                unit="C",
                data_source=DataSource.SIMULATED.value,
                record_hash=rec["record_hash"],
                previous_hash=rec["previous_hash"],
            )
            session.add(tr)

        manifest_dict = {
            "schema_version": "1.0",
            "shipment_id": shipment_id,
            "device_id": "SIMULATED-DEVICE-001",
            "record_count": len(chained),
            "dataset_fingerprint": fingerprint,
            "data_source": DataSource.SIMULATED.value,
            "is_simulated": True,
            "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        sig = None
        key_id = None
        try:
            signed = sign_manifest(manifest_dict)
            sig = signed.get("signature")
            key_id = signed.get("signing_key_id")
        except Exception as e:
            pass  # Signature optional at this stage

        manifest = DatasetManifest(
            shipment_id_fk=s.id,
            shipment_ref=shipment_id,
            device_id="SIMULATED-DEVICE-001",
            schema_version="1.0",
            record_count=len(chained),
            dataset_fingerprint=fingerprint,
            signing_key_id=key_id,
            signature=sig,
            data_source=DataSource.SIMULATED.value,
            is_simulated=True,
        )
        session.add(manifest)

        s.status = ShipmentStatus.COMMITTED.value
        session.add(AuditEvent(
            event_type=AuditEventType.TRUSTED_DATASET_INITIALIZED.value,
            shipment_id_fk=s.id,
            actor_id=user_id,
            actor_role=UserRole.ADMIN.value,
            outcome="SUCCESS",
            description=f"Simulated trusted dataset initialized. Records: {len(chained)}. Fingerprint: {fingerprint[:24]}...",
        ))
        session.commit()
        return jsonify({
            "message": "Trusted dataset initialized.",
            "record_count": len(chained),
            "dataset_fingerprint": fingerprint,
            "is_simulated": True,
            "signature_status": "SIGNED" if sig else "UNSIGNED",
        }), 201
    finally:
        session.close()
