"""
ColdChain Ledger — Backend Tests
Covers: auth, shipments, readings, verification, crypto, RBAC.
"""

import pytest
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app
from app.models.database import (
    Base, User, Shipment, TrustedSensorRecord, TransporterReading,
    UserRole, ShipmentStatus, DataSource, get_session
)
from app.services.crypto_service import (
    build_hash_chain, compute_record_hash, compute_dataset_fingerprint,
    verify_hash_chain, generate_dev_keypair, sign_manifest, verify_manifest_signature,
    load_private_key, GENESIS_HASH
)
from app.services.verification_service import run_full_verification
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from werkzeug.security import generate_password_hash


# ── Test App Fixture ──────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def app():
    test_app = create_app({
        "TESTING": True,
        "DATABASE_URL": "sqlite:///:memory:",
        "JWT_SECRET_KEY": "test-jwt-secret",
        "SECRET_KEY": "test-secret",
    })

    # Init test DB and seed minimal data
    from app.models.database import init_db, create_db_engine, SessionFactory
    import app.models.database as db_module

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    init_db(engine)
    Session = sessionmaker(bind=engine)
    db_module.SessionFactory = Session

    # Create test users
    session = Session()
    admin = User(username="test_admin", email="admin@test.com",
                 password_hash=generate_password_hash("Admin@1234"),
                 role=UserRole.ADMIN.value, full_name="Test Admin", is_active=True)
    receiver = User(username="test_receiver", email="receiver@test.com",
                    password_hash=generate_password_hash("Receiver@1234"),
                    role=UserRole.RECEIVER.value, full_name="Test Receiver", is_active=True)
    transporter = User(username="test_transport", email="transport@test.com",
                       password_hash=generate_password_hash("Transport@1234"),
                       role=UserRole.TRANSPORTER.value, full_name="Test Transporter", is_active=True)
    session.add_all([admin, receiver, transporter])
    session.commit()
    session.close()

    yield test_app


@pytest.fixture()
def client(app):
    return app.test_client()


def _login(client, username, password):
    resp = client.post("/api/auth/login",
                       json={"username": username, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
    return resp.get_json()["access_token"]


def _auth_header(token):
    return {"Authorization": f"Bearer {token}"}


# ── Health Check ──────────────────────────────────────────────────────────────

def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "ok"


# ── Auth Tests ────────────────────────────────────────────────────────────────

def test_login_success(client):
    resp = client.post("/api/auth/login",
                       json={"username": "test_admin", "password": "Admin@1234"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert "access_token" in data
    assert data["user"]["role"] == "ADMIN"


def test_login_wrong_password(client):
    resp = client.post("/api/auth/login",
                       json={"username": "test_admin", "password": "wrongpassword"})
    assert resp.status_code == 401


def test_login_missing_fields(client):
    resp = client.post("/api/auth/login", json={"username": "test_admin"})
    assert resp.status_code == 400


def test_me_endpoint(client):
    token = _login(client, "test_admin", "Admin@1234")
    resp = client.get("/api/auth/me", headers=_auth_header(token))
    assert resp.status_code == 200
    assert resp.get_json()["username"] == "test_admin"


def test_unauthorized_without_token(client):
    resp = client.get("/api/shipments/")
    assert resp.status_code == 401


# ── Shipment Tests ────────────────────────────────────────────────────────────

def _create_shipment(client, token, shipment_id="TEST-001"):
    return client.post("/api/shipments/", headers=_auth_header(token), json={
        "shipment_id": shipment_id,
        "medicine_name": "TestMed",
        "batch_number": "BATCH-001",
        "origin": "CityA",
        "destination": "CityB",
        "vehicle_registration": "TN-99-0001",
        "min_temp": 2.0,
        "max_temp": 8.0,
        "reading_interval_minutes": 10,
    })


def test_create_shipment_as_admin(client):
    token = _login(client, "test_admin", "Admin@1234")
    resp = _create_shipment(client, token, "TEST-S001")
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["shipment_id"] == "TEST-S001"
    assert data["status"] == "CREATED"


def test_create_shipment_duplicate_id(client):
    token = _login(client, "test_admin", "Admin@1234")
    _create_shipment(client, token, "TEST-DUP")
    resp = _create_shipment(client, token, "TEST-DUP")
    assert resp.status_code == 409


def test_create_shipment_invalid_interval(client):
    token = _login(client, "test_admin", "Admin@1234")
    resp = client.post("/api/shipments/", headers=_auth_header(token), json={
        "shipment_id": "TEST-BAD",
        "medicine_name": "Med",
        "batch_number": "B001",
        "origin": "A", "destination": "B",
        "vehicle_registration": "XX-00",
        "min_temp": 2.0, "max_temp": 8.0,
        "reading_interval_minutes": 7,  # Invalid: must be 5 or 10
    })
    assert resp.status_code == 400


def test_create_shipment_as_transporter_forbidden(client):
    token = _login(client, "test_transport", "Transport@1234")
    resp = _create_shipment(client, token, "TEST-NOPE")
    assert resp.status_code == 403


def test_transporter_cannot_see_other_shipments(client):
    """Transporter only sees their assigned shipments."""
    admin_token = _login(client, "test_admin", "Admin@1234")
    # Create a shipment NOT assigned to test_transport
    _create_shipment(client, admin_token, "TEST-OTHER")
    transport_token = _login(client, "test_transport", "Transport@1234")
    resp = client.get("/api/shipments/", headers=_auth_header(transport_token))
    assert resp.status_code == 200
    # Should be empty (no assignment)
    data = resp.get_json()
    ship_ids = [s["shipment_id"] for s in data]
    assert "TEST-OTHER" not in ship_ids


def test_get_shipment_not_found(client):
    token = _login(client, "test_admin", "Admin@1234")
    resp = client.get("/api/shipments/NONEXISTENT", headers=_auth_header(token))
    assert resp.status_code == 404


# ── Transporter Reading Tests ─────────────────────────────────────────────────

def _setup_journey(client):
    """Create shipment, assign transporter, start journey. Returns shipment_id and tokens."""
    admin_token = _login(client, "test_admin", "Admin@1234")
    ship_id = "TEST-JOURNEY-001"
    _create_shipment(client, admin_token, ship_id)
    # Assign transporter
    client.post(f"/api/shipments/{ship_id}/assign",
                headers=_auth_header(admin_token),
                json={"transporter_username": "test_transport"})
    transport_token = _login(client, "test_transport", "Transport@1234")
    # Start journey
    resp = client.post(f"/api/journeys/{ship_id}/start", headers=_auth_header(transport_token))
    assert resp.status_code == 200
    return ship_id, admin_token, transport_token


def test_submit_reading(client):
    ship_id, admin_token, transport_token = _setup_journey(client)
    resp = client.post(f"/api/readings/{ship_id}",
                       headers=_auth_header(transport_token),
                       json={"temperature_celsius": 4.5,
                             "measured_at": "2026-10-20T06:10:00Z"})
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["reading"]["temperature_celsius"] == 4.5
    assert data["out_of_range_warning"] is False


def test_submit_out_of_range_reading(client):
    ship_id, _, transport_token = _setup_journey(client) if False else ("TEST-JOURNEY-001", None, _login(client, "test_transport", "Transport@1234"))
    resp = client.post(f"/api/readings/TEST-JOURNEY-001",
                       headers=_auth_header(transport_token),
                       json={"temperature_celsius": 12.0,
                             "measured_at": "2026-10-20T06:20:00Z"})
    assert resp.status_code == 201  # Out-of-range submissions are allowed
    data = resp.get_json()
    assert data["out_of_range_warning"] is True


def test_submit_reading_invalid_temp(client):
    transport_token = _login(client, "test_transport", "Transport@1234")
    resp = client.post("/api/readings/TEST-JOURNEY-001",
                       headers=_auth_header(transport_token),
                       json={"temperature_celsius": "not-a-number"})
    assert resp.status_code == 400


def test_transporter_cannot_access_trusted_data(client):
    """Critical: transporter must NOT be able to retrieve trusted sensor records."""
    transport_token = _login(client, "test_transport", "Transport@1234")
    resp = client.get("/api/trusted-data/TEST-JOURNEY-001",
                      headers=_auth_header(transport_token))
    assert resp.status_code == 403


def test_receiver_can_access_trusted_data(client):
    receiver_token = _login(client, "test_receiver", "Receiver@1234")
    resp = client.get("/api/trusted-data/TEST-JOURNEY-001",
                      headers=_auth_header(receiver_token))
    # Shipment may have no trusted data but should be 200 (not 403)
    assert resp.status_code in (200, 404)


# ── Crypto Tests ──────────────────────────────────────────────────────────────

def test_canonical_hash_deterministic():
    rec = {
        "shipment_id": "SHIP-001",
        "device_id": "DEV-001",
        "sequence_number": 1,
        "measured_at": "2026-10-20T06:00:00Z",
        "temperature_celsius": 4.2,
        "unit": "C",
        "previous_hash": GENESIS_HASH,
    }
    h1 = compute_record_hash(rec)
    h2 = compute_record_hash(rec)
    assert h1 == h2
    assert len(h1) == 64  # SHA-256 hex


def test_hash_chain_valid():
    records = [
        {"sequence_number": 1, "measured_at": "2026-10-20T06:00:00Z",
         "temperature_celsius": 4.2, "unit": "C"},
        {"sequence_number": 2, "measured_at": "2026-10-20T06:10:00Z",
         "temperature_celsius": 4.5, "unit": "C"},
        {"sequence_number": 3, "measured_at": "2026-10-20T06:20:00Z",
         "temperature_celsius": 5.1, "unit": "C"},
    ]
    chained = build_hash_chain(records, "SHIP-001")
    result = verify_hash_chain(chained, "SHIP-001")
    assert result["status"] == "VERIFIED"
    assert len(result["errors"]) == 0


def test_hash_chain_detects_altered_temperature():
    records = [
        {"sequence_number": 1, "measured_at": "2026-10-20T06:00:00Z",
         "temperature_celsius": 4.2, "unit": "C"},
        {"sequence_number": 2, "measured_at": "2026-10-20T06:10:00Z",
         "temperature_celsius": 4.5, "unit": "C"},
    ]
    chained = build_hash_chain(records, "SHIP-001")
    # Tamper with temperature after hashing
    chained[1] = dict(chained[1], temperature_celsius=7.9)
    result = verify_hash_chain(chained, "SHIP-001")
    assert result["status"] == "FAILED"
    assert len(result["errors"]) > 0


def test_hash_chain_broken_previous_hash():
    records = [
        {"sequence_number": 1, "measured_at": "2026-10-20T06:00:00Z",
         "temperature_celsius": 4.2, "unit": "C"},
        {"sequence_number": 2, "measured_at": "2026-10-20T06:10:00Z",
         "temperature_celsius": 4.5, "unit": "C"},
    ]
    chained = build_hash_chain(records, "SHIP-001")
    chained[1] = dict(chained[1], previous_hash="deadbeef" * 8)
    result = verify_hash_chain(chained, "SHIP-001")
    assert result["status"] == "FAILED"


def test_signature_verification_valid():
    generate_dev_keypair()
    manifest = {
        "schema_version": "1.0",
        "shipment_id": "SHIP-SIG-001",
        "device_id": "DEV-001",
        "record_count": 3,
        "dataset_fingerprint": "a" * 64,
        "data_source": "SIMULATED",
        "is_simulated": True,
        "created_at": "2026-10-20T05:00:00Z",
    }
    signed = sign_manifest(manifest)
    result = verify_manifest_signature(signed)
    assert result["status"] == "VERIFIED"


def test_signature_verification_fails_on_altered_manifest():
    generate_dev_keypair()
    manifest = {
        "schema_version": "1.0",
        "shipment_id": "SHIP-SIG-002",
        "device_id": "DEV-001",
        "record_count": 3,
        "dataset_fingerprint": "b" * 64,
        "data_source": "SIMULATED",
        "is_simulated": True,
        "created_at": "2026-10-20T05:00:00Z",
    }
    signed = sign_manifest(manifest)
    # Alter the manifest after signing
    signed["record_count"] = 999
    result = verify_manifest_signature(signed)
    assert result["status"] == "FAILED"


# ── Verification Engine Tests ─────────────────────────────────────────────────

def _make_trusted(temps, shipment_id="VSHIP"):
    from datetime import datetime, timezone, timedelta
    base = datetime(2026, 10, 20, 6, 0, 0, tzinfo=timezone.utc)
    records = [
        {"sequence_number": i + 1,
         "measured_at": (base + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M:%SZ"),
         "temperature_celsius": t, "unit": "C"}
        for i, t in enumerate(temps)
    ]
    return build_hash_chain(records, shipment_id)


def test_verification_clean_shipment():
    trusted = _make_trusted([4.2, 4.5, 5.1, 5.6, 4.8])
    transporter = [
        {"sequence_number": r["sequence_number"],
         "measured_at": r["measured_at"],
         "temperature_celsius": r["temperature_celsius"],
         "unit": r["unit"]}
        for r in trusted
    ]
    result = run_full_verification(
        shipment={"shipment_id": "VSHIP", "min_temp": 2.0, "max_temp": 8.0, "reading_interval_minutes": 10},
        trusted_records=trusted,
        transporter_records=transporter,
    )
    assert result["record_comparison"]["mismatch_count"] == 0
    assert result["excursion_analysis"]["excursion_reading_count"] == 0
    # Without manifest/signature, integrity is INCOMPLETE_EVIDENCE (no sig to verify) which is correct
    assert result["overall_integrity_status"] in ("VERIFIED", "INCOMPLETE_EVIDENCE")


def test_verification_detects_altered_readings():
    trusted = _make_trusted([4.2, 4.5, 8.7, 9.1, 5.3])
    transporter = [
        {"sequence_number": 1, "measured_at": trusted[0]["measured_at"], "temperature_celsius": 4.2, "unit": "C"},
        {"sequence_number": 2, "measured_at": trusted[1]["measured_at"], "temperature_celsius": 4.5, "unit": "C"},
        {"sequence_number": 3, "measured_at": trusted[2]["measured_at"], "temperature_celsius": 5.7, "unit": "C"},  # ALTERED
        {"sequence_number": 4, "measured_at": trusted[3]["measured_at"], "temperature_celsius": 5.9, "unit": "C"},  # ALTERED
        {"sequence_number": 5, "measured_at": trusted[4]["measured_at"], "temperature_celsius": 5.3, "unit": "C"},
    ]
    result = run_full_verification(
        shipment={"shipment_id": "VSHIP", "min_temp": 2.0, "max_temp": 8.0, "reading_interval_minutes": 10},
        trusted_records=trusted,
        transporter_records=transporter,
    )
    assert result["record_comparison"]["status"] == "MISMATCH_DETECTED"
    assert result["record_comparison"]["mismatch_count"] == 2
    assert result["excursion_analysis"]["excursion_reading_count"] == 2  # trusted data has excursion
    assert result["overall_integrity_status"] in ("MISMATCH_DETECTED", "FAILED")


def test_verification_detects_missing_records():
    trusted = _make_trusted([3.5, 4.1, 9.2, 6.8, 5.5])
    # Transporter has only 4 readings (seq 3 missing)
    transporter = [
        {"sequence_number": 1, "measured_at": trusted[0]["measured_at"], "temperature_celsius": 3.5, "unit": "C"},
        {"sequence_number": 2, "measured_at": trusted[1]["measured_at"], "temperature_celsius": 4.1, "unit": "C"},
        # seq 3 missing
        {"sequence_number": 4, "measured_at": trusted[3]["measured_at"], "temperature_celsius": 6.8, "unit": "C"},
        {"sequence_number": 5, "measured_at": trusted[4]["measured_at"], "temperature_celsius": 5.5, "unit": "C"},
    ]
    result = run_full_verification(
        shipment={"shipment_id": "VSHIP", "min_temp": 2.0, "max_temp": 8.0, "reading_interval_minutes": 10},
        trusted_records=trusted,
        transporter_records=transporter,
    )
    assert result["record_comparison"]["missing_in_transporter"] >= 1


def test_verification_excursion_detected():
    trusted = _make_trusted([4.2, 4.5, 8.7, 9.1, 5.3])
    result = run_full_verification(
        shipment={"shipment_id": "VSHIP", "min_temp": 2.0, "max_temp": 8.0, "reading_interval_minutes": 10},
        trusted_records=trusted,
        transporter_records=trusted,
    )
    assert result["excursion_analysis"]["status"] == "EXCURSION_DETECTED"
    assert result["excursion_analysis"]["excursion_reading_count"] == 2
    assert result["overall_compliance_status"] == "EXCURSION_DETECTED"


def test_verification_missing_trusted_records():
    result = run_full_verification(
        shipment={"shipment_id": "VSHIP", "min_temp": 2.0, "max_temp": 8.0, "reading_interval_minutes": 10},
        trusted_records=[],
        transporter_records=[],
    )
    assert result["overall_integrity_status"] in ("INCOMPLETE_EVIDENCE", "UNAVAILABLE")


# ── Receiver Decision Tests ───────────────────────────────────────────────────

def test_receiver_decision_requires_reason_for_hold(client):
    receiver_token = _login(client, "test_receiver", "Receiver@1234")
    resp = client.post("/api/decisions/TEST-JOURNEY-001",
                       headers=_auth_header(receiver_token),
                       json={"decision": "HOLD"})  # Missing reason
    assert resp.status_code == 400


def test_receiver_decision_approve(client):
    receiver_token = _login(client, "test_receiver", "Receiver@1234")
    resp = client.post("/api/decisions/TEST-JOURNEY-001",
                       headers=_auth_header(receiver_token),
                       json={"decision": "APPROVE"})
    assert resp.status_code == 200


def test_transporter_cannot_make_decision(client):
    transport_token = _login(client, "test_transport", "Transport@1234")
    resp = client.post("/api/decisions/TEST-JOURNEY-001",
                       headers=_auth_header(transport_token),
                       json={"decision": "APPROVE"})
    assert resp.status_code == 403


# ── Share & Email Report Tests ───────────────────────────────────────────────

def test_download_report_pdf(client):
    receiver_token = _login(client, "test_receiver", "Receiver@1234")
    resp = client.get("/api/reports/TEST-JOURNEY-001",
                      headers=_auth_header(receiver_token))
    assert resp.status_code == 200
    assert "application/pdf" in resp.content_type
    assert resp.data.startswith(b"%PDF")


def test_share_token_generation_and_public_access(client):
    receiver_token = _login(client, "test_receiver", "Receiver@1234")
    # Generate token
    token_resp = client.post("/api/reports/TEST-JOURNEY-001/share-token",
                             headers=_auth_header(receiver_token))
    assert token_resp.status_code == 200
    data = token_resp.get_json()
    assert data["success"] is True
    assert "token" in data
    token = data["token"]

    # Public access with unguessable token (no auth header needed)
    public_resp = client.get(f"/api/public/reports/{token}")
    assert public_resp.status_code == 200
    assert "application/pdf" in public_resp.content_type
    assert public_resp.data.startswith(b"%PDF")

    # Tampered token
    tampered_resp = client.get("/api/public/reports/tampered-invalid-token")
    assert tampered_resp.status_code == 403
    assert tampered_resp.get_json()["code"] == "INVALID_TOKEN"


def test_email_report_endpoint_validation(client):
    receiver_token = _login(client, "test_receiver", "Receiver@1234")

    # Missing email
    r1 = client.post("/api/reports/TEST-JOURNEY-001/email",
                     headers=_auth_header(receiver_token),
                     json={})
    assert r1.status_code == 400
    assert r1.get_json()["code"] == "MISSING_EMAIL"

    # Invalid email syntax
    r2 = client.post("/api/reports/TEST-JOURNEY-001/email",
                     headers=_auth_header(receiver_token),
                     json={"email": "invalid-address"})
    assert r2.status_code == 400
    assert r2.get_json()["code"] == "INVALID_EMAIL"

    # Valid syntax, but unconfigured SMTP (default test environment)
    r3 = client.post("/api/reports/TEST-JOURNEY-001/email",
                     headers=_auth_header(receiver_token),
                     json={"email": "compliance@pharmacy.com", "notes": "Urgent review"})
    assert r3.status_code == 400
    assert r3.get_json()["code"] == "SMTP_NOT_CONFIGURED"

