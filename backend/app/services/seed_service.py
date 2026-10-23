"""
ColdChain Ledger — Sample Data Seeder
Creates three deterministic demo shipments with signed, hash-chained records.
All simulated sensor records are clearly labelled as SIMULATED.
"""

from datetime import datetime, timezone, timedelta
from werkzeug.security import generate_password_hash
import json

from ..models.database import (
    User, Shipment, ShipmentAssignment, TrustedSensorRecord, TransporterReading,
    DatasetManifest, BlockchainCommitment, AuditEvent,
    UserRole, ShipmentStatus, DataSource, AuditEventType, get_session
)
from ..services.crypto_service import (
    build_hash_chain, compute_dataset_fingerprint, sign_manifest, generate_dev_keypair,
    load_private_key
)

# Deterministic base timestamp (well before now)
BASE_TIME = datetime(2026, 10, 20, 6, 0, 0, tzinfo=timezone.utc)


def _dt(hours=0, minutes=0) -> datetime:
    return BASE_TIME + timedelta(hours=hours, minutes=minutes)


DEMO_USERS = [
    {
        "username": "admin",
        "email": "admin@coldchain.demo",
        "password": "Admin@1234",
        "role": UserRole.ADMIN.value,
        "full_name": "Admin Sender",
    },
    {
        "username": "receiver",
        "email": "receiver@coldchain.demo",
        "password": "Receiver@1234",
        "role": UserRole.RECEIVER.value,
        "full_name": "Quality Receiver",
    },
    {
        "username": "transporter1",
        "email": "transporter1@coldchain.demo",
        "password": "Transport@1234",
        "role": UserRole.TRANSPORTER.value,
        "full_name": "Ravi Kumar",
    },
    {
        "username": "transporter2",
        "email": "transporter2@coldchain.demo",
        "password": "Transport@1234",
        "role": UserRole.TRANSPORTER.value,
        "full_name": "Priya Singh",
    },
]

DEMO_SHIPMENTS = [
    {
        "shipment_id": "SHIP-1001",
        "medicine_name": "Insulin",
        "batch_number": "INS-2026-01",
        "origin": "Chennai",
        "destination": "Bengaluru",
        "vehicle_registration": "TN-XX-1001",
        "min_temp": 2.0,
        "max_temp": 8.0,
        "reading_interval_minutes": 10,
        "status": ShipmentStatus.DELIVERED.value,
        "transporter_username": "transporter1",
        # Trusted sensor records (SIMULATED)
        "trusted_temps": [4.2, 4.5, 5.1, 5.6, 4.8],
        # Transporter readings MATCH trusted (clean shipment)
        "transporter_temps": [4.2, 4.5, 5.1, 5.6, 4.8],
        "journey_hour_offset": 0,
        "notes": "SHIP-1001: Clean shipment — all records match, no excursion.",
    },
    {
        "shipment_id": "SHIP-1002",
        "medicine_name": "Insulin",
        "batch_number": "INS-2026-02",
        "origin": "Chennai",
        "destination": "Bengaluru",
        "vehicle_registration": "TN-XX-1002",
        "min_temp": 2.0,
        "max_temp": 8.0,
        "reading_interval_minutes": 10,
        "status": ShipmentStatus.HELD.value,
        "transporter_username": "transporter1",
        # Trusted includes excursion readings
        "trusted_temps": [4.2, 4.5, 8.7, 9.1, 5.3],
        # Transporter ALTERED the excursion readings to hide them
        "transporter_temps": [4.2, 4.5, 5.7, 5.9, 5.3],
        "journey_hour_offset": 2,
        "notes": "SHIP-1002: Tampering — transporter altered excursion readings.",
    },
    {
        "shipment_id": "SHIP-1003",
        "medicine_name": "Vaccine",
        "batch_number": "VAC-2026-03",
        "origin": "Coimbatore",
        "destination": "Chennai",
        "vehicle_registration": "TN-XX-1003",
        "min_temp": 2.0,
        "max_temp": 8.0,
        "reading_interval_minutes": 10,
        "status": ShipmentStatus.HELD.value,
        "transporter_username": "transporter2",
        # Trusted: 6 records, seq 1-6, missing seq 4, excursion at seq 3
        "trusted_temps": [3.5, 4.1, 9.2, 6.8, 5.5],  # seq 4 is MISSING
        # Transporter: includes missing + duplicate timestamp at seq 2
        "transporter_temps": [3.5, 4.1, 4.1, 9.2, 6.8, 5.5],  # seq 2 duplicated
        "journey_hour_offset": 4,
        "notes": "SHIP-1003: Missing trusted record, duplicate transporter timestamp, excursion.",
        "trusted_missing_seq": True,  # Marker for special handling
    },
]


def seed_database(session=None):
    """Seed the database with demo users and shipments."""
    close_session = False
    if session is None:
        session = get_session()
        close_session = True

    try:
        # Ensure signing keys exist
        if load_private_key() is None:
            print("[SEED] Generating development Ed25519 signing keys...")
            generate_dev_keypair()

        # ── Seed Users ─────────────────────────────────────────────────────
        user_map = {}
        for u_data in DEMO_USERS:
            existing = session.query(User).filter_by(username=u_data["username"]).first()
            if existing:
                user_map[u_data["username"]] = existing
                continue
            user = User(
                username=u_data["username"],
                email=u_data["email"],
                password_hash=generate_password_hash(u_data["password"]),
                role=u_data["role"],
                full_name=u_data["full_name"],
            )
            session.add(user)
            session.flush()
            user_map[u_data["username"]] = user
            print(f"[SEED] Created user: {u_data['username']} ({u_data['role']})")

        admin_user = user_map["admin"]

        # ── Seed Shipments ─────────────────────────────────────────────────
        for i, s_data in enumerate(DEMO_SHIPMENTS):
            existing = session.query(Shipment).filter_by(shipment_id=s_data["shipment_id"]).first()
            if existing:
                print(f"[SEED] Shipment {s_data['shipment_id']} already exists, skipping.")
                continue

            journey_start = _dt(hours=s_data["journey_hour_offset"])
            delivered_at = journey_start + timedelta(hours=5)

            shipment = Shipment(
                shipment_id=s_data["shipment_id"],
                medicine_name=s_data["medicine_name"],
                batch_number=s_data["batch_number"],
                origin=s_data["origin"],
                destination=s_data["destination"],
                vehicle_registration=s_data["vehicle_registration"],
                min_temp=s_data["min_temp"],
                max_temp=s_data["max_temp"],
                reading_interval_minutes=s_data["reading_interval_minutes"],
                status=s_data["status"],
                created_by_id=admin_user.id,
                created_at=journey_start - timedelta(hours=2),
                journey_started_at=journey_start,
                delivered_at=delivered_at,
                notes=s_data["notes"],
            )
            session.add(shipment)
            session.flush()

            # ── Assignment ─────────────────────────────────────────────────
            transporter = user_map[s_data["transporter_username"]]
            assignment = ShipmentAssignment(
                shipment_id_fk=shipment.id,
                transporter_id=transporter.id,
                assigned_by_id=admin_user.id,
                assigned_at=journey_start - timedelta(hours=1),
            )
            session.add(assignment)

            # ── Trusted Sensor Records (SIMULATED) ─────────────────────────
            interval = s_data["reading_interval_minutes"]
            temps = s_data["trusted_temps"]

            raw_records = []
            for seq_idx, temp in enumerate(temps):
                seq_num = seq_idx + 1
                measured_at = journey_start + timedelta(minutes=(seq_idx * interval))
                raw_records.append({
                    "sequence_number": seq_num,
                    "measured_at": measured_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "temperature_celsius": temp,
                    "unit": "C",
                    "data_source": DataSource.SIMULATED.value,
                })

            # Build hash chain
            chained = build_hash_chain(raw_records, s_data["shipment_id"])

            for chained_rec in chained:
                tr = TrustedSensorRecord(
                    shipment_id_fk=shipment.id,
                    sequence_number=chained_rec["sequence_number"],
                    device_id="SIMULATED-DEVICE-001",
                    measured_at=datetime.fromisoformat(
                        chained_rec["measured_at"].replace("Z", "+00:00")
                    ),
                    temperature_celsius=chained_rec["temperature_celsius"],
                    unit=chained_rec["unit"],
                    data_source=DataSource.SIMULATED.value,
                    record_hash=chained_rec["record_hash"],
                    previous_hash=chained_rec["previous_hash"],
                    created_at=journey_start - timedelta(hours=1),
                )
                session.add(tr)

            # ── Dataset Manifest and Signature ─────────────────────────────
            fingerprint = compute_dataset_fingerprint([
                {"sequence_number": r["sequence_number"], "record_hash": r["record_hash"]}
                for r in chained
            ])

            manifest_dict = {
                "schema_version": "1.0",
                "shipment_id": s_data["shipment_id"],
                "device_id": "SIMULATED-DEVICE-001",
                "record_count": len(chained),
                "dataset_fingerprint": fingerprint,
                "data_source": DataSource.SIMULATED.value,
                "is_simulated": True,
                "created_at": (journey_start - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }

            try:
                signed_manifest = sign_manifest(manifest_dict)
                sig = signed_manifest.get("signature")
                key_id = signed_manifest.get("signing_key_id")
                sig_status = "signed"
            except Exception as e:
                print(f"[SEED] Warning: could not sign manifest for {s_data['shipment_id']}: {e}")
                sig = None
                key_id = None
                sig_status = "unsigned"

            manifest = DatasetManifest(
                shipment_id_fk=shipment.id,
                shipment_ref=s_data["shipment_id"],
                device_id="SIMULATED-DEVICE-001",
                schema_version="1.0",
                record_count=len(chained),
                dataset_fingerprint=fingerprint,
                signing_key_id=key_id,
                signature=sig,
                data_source=DataSource.SIMULATED.value,
                is_simulated=True,
                created_at=journey_start - timedelta(hours=1),
            )
            session.add(manifest)

            # ── Demo Blockchain Commitment ─────────────────────────────────
            # Marked is_demo=True; not a real blockchain transaction.
            bc = BlockchainCommitment(
                shipment_id_fk=shipment.id,
                shipment_ref=s_data["shipment_id"],
                dataset_fingerprint=fingerprint,
                transaction_hash="0x" + ("ab12" * 16),  # Fake demo hash
                block_number=1000 + i,
                chain_id=31337,
                contract_address="0x" + ("cd34" * 10),
                committed_at=journey_start - timedelta(minutes=30),
                is_confirmed=True,
                is_demo=True,  # CLEARLY MARKED as demo — not a real transaction
                verification_status="DEMO_ONLY",
            )
            session.add(bc)

            # ── Transporter Readings ────────────────────────────────────────
            t_temps = s_data["transporter_temps"]
            for t_idx, t_temp in enumerate(t_temps):
                seq_num = t_idx + 1
                # For SHIP-1003, duplicate seq 2 timestamp
                if s_data["shipment_id"] == "SHIP-1003" and t_idx == 2:
                    # Duplicate timestamp of seq 2
                    measured_at = journey_start + timedelta(minutes=(1 * interval))
                else:
                    measured_at = journey_start + timedelta(minutes=(t_idx * interval))

                is_oor = t_temp < s_data["min_temp"] or t_temp > s_data["max_temp"]
                reading = TransporterReading(
                    shipment_id_fk=shipment.id,
                    transporter_id=transporter.id,
                    sequence_number=seq_num,
                    measured_at=measured_at,
                    server_received_at=measured_at + timedelta(seconds=15),
                    temperature_celsius=t_temp,
                    unit="C",
                    is_out_of_range=is_oor,
                    is_correction=False,
                )
                session.add(reading)

            # ── Audit Events ───────────────────────────────────────────────
            session.add(AuditEvent(
                event_type=AuditEventType.SHIPMENT_CREATED.value,
                shipment_id_fk=shipment.id,
                actor_id=admin_user.id,
                actor_role=UserRole.ADMIN.value,
                occurred_at=journey_start - timedelta(hours=2),
                outcome="SUCCESS",
                description=f"Shipment {s_data['shipment_id']} created.",
            ))
            session.add(AuditEvent(
                event_type=AuditEventType.TRUSTED_DATASET_INITIALIZED.value,
                shipment_id_fk=shipment.id,
                actor_id=admin_user.id,
                actor_role=UserRole.ADMIN.value,
                occurred_at=journey_start - timedelta(hours=1),
                outcome="SUCCESS",
                description=f"Simulated trusted sensor dataset initialized. {sig_status}. Fingerprint: {fingerprint[:16]}...",
            ))
            session.add(AuditEvent(
                event_type=AuditEventType.JOURNEY_STARTED.value,
                shipment_id_fk=shipment.id,
                actor_id=transporter.id,
                actor_role=UserRole.TRANSPORTER.value,
                occurred_at=journey_start,
                outcome="SUCCESS",
                description=f"Journey started by {transporter.full_name}.",
            ))
            session.add(AuditEvent(
                event_type=AuditEventType.SHIPMENT_DELIVERED.value,
                shipment_id_fk=shipment.id,
                actor_id=transporter.id,
                actor_role=UserRole.TRANSPORTER.value,
                occurred_at=delivered_at,
                outcome="SUCCESS",
                description=f"Shipment marked delivered by {transporter.full_name}.",
            ))

            print(f"[SEED] Created shipment {s_data['shipment_id']} ({sig_status}, {len(chained)} trusted records, {len(t_temps)} transporter readings)")

        session.commit()
        print("[SEED] Database seeded successfully.")
        return True

    except Exception as e:
        session.rollback()
        print(f"[SEED] Error seeding database: {e}")
        raise
    finally:
        if close_session:
            session.close()
