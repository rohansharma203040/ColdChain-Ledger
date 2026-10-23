"""
ColdChain Ledger — Database Models
SQLAlchemy ORM definitions for all entities.
"""

from datetime import datetime, timezone
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Boolean,
    DateTime, Text, ForeignKey, Enum, UniqueConstraint, Index
)
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
import enum
import os

Base = declarative_base()


# ─── Enumerations ────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    RECEIVER = "RECEIVER"
    TRANSPORTER = "TRANSPORTER"


class ShipmentStatus(str, enum.Enum):
    CREATED = "CREATED"
    COMMITTED = "COMMITTED"      # Trusted data committed to blockchain
    IN_TRANSIT = "IN_TRANSIT"
    DELIVERED = "DELIVERED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    HELD = "HELD"


class DataSource(str, enum.Enum):
    SIMULATED = "SIMULATED"
    IMPORTED_CSV = "IMPORTED_CSV"
    IMPORTED_JSON = "IMPORTED_JSON"
    REAL_DEVICE = "REAL_DEVICE"


class VerificationStatus(str, enum.Enum):
    VERIFIED = "VERIFIED"
    FAILED = "FAILED"
    MISMATCH_DETECTED = "MISMATCH_DETECTED"
    EXCURSION_DETECTED = "EXCURSION_DETECTED"
    INCOMPLETE_EVIDENCE = "INCOMPLETE_EVIDENCE"
    PENDING = "PENDING"
    UNAVAILABLE = "UNAVAILABLE"
    NOT_VERIFIED = "NOT_VERIFIED"
    DEMO_ONLY = "DEMO_ONLY"


class ReceiverDecision(str, enum.Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    HOLD = "HOLD"


class AuditEventType(str, enum.Enum):
    SHIPMENT_CREATED = "SHIPMENT_CREATED"
    SHIPMENT_UPDATED = "SHIPMENT_UPDATED"
    TRANSPORTER_ASSIGNED = "TRANSPORTER_ASSIGNED"
    TRUSTED_DATASET_INITIALIZED = "TRUSTED_DATASET_INITIALIZED"
    TRUSTED_DATASET_COMMITTED = "TRUSTED_DATASET_COMMITTED"
    BLOCKCHAIN_COMMITMENT_RECORDED = "BLOCKCHAIN_COMMITMENT_RECORDED"
    JOURNEY_STARTED = "JOURNEY_STARTED"
    READING_SUBMITTED = "READING_SUBMITTED"
    READING_CORRECTED = "READING_CORRECTED"
    SHIPMENT_DELIVERED = "SHIPMENT_DELIVERED"
    VERIFICATION_RUN = "VERIFICATION_RUN"
    OFFLINE_IMPORT_ATTEMPTED = "OFFLINE_IMPORT_ATTEMPTED"
    RECEIVER_DECISION_MADE = "RECEIVER_DECISION_MADE"
    LOGIN_SUCCESS = "LOGIN_SUCCESS"
    LOGIN_FAILED = "LOGIN_FAILED"
    UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS"


# ─── Tables ───────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(128), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    role = Column(String(20), nullable=False)  # UserRole enum value
    full_name = Column(String(128))
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    last_login_at = Column(DateTime)

    assignments = relationship("ShipmentAssignment", back_populates="transporter",
                               foreign_keys="ShipmentAssignment.transporter_id")
    audit_events = relationship("AuditEvent", back_populates="actor")


class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True)
    shipment_id = Column(String(32), unique=True, nullable=False, index=True)
    medicine_name = Column(String(128), nullable=False)
    batch_number = Column(String(64), nullable=False)
    origin = Column(String(128), nullable=False)
    destination = Column(String(128), nullable=False)
    vehicle_registration = Column(String(32), nullable=False)
    min_temp = Column(Float, nullable=False)
    max_temp = Column(Float, nullable=False)
    reading_interval_minutes = Column(Integer, nullable=False, default=10)
    status = Column(String(20), nullable=False, default=ShipmentStatus.CREATED.value)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
    journey_started_at = Column(DateTime)
    delivered_at = Column(DateTime)
    notes = Column(Text)

    created_by = relationship("User", foreign_keys=[created_by_id])
    assignment = relationship("ShipmentAssignment", back_populates="shipment", uselist=False)
    trusted_records = relationship("TrustedSensorRecord", back_populates="shipment",
                                   order_by="TrustedSensorRecord.sequence_number")
    transporter_readings = relationship("TransporterReading", back_populates="shipment",
                                        order_by="TransporterReading.sequence_number")
    dataset_manifest = relationship("DatasetManifest", back_populates="shipment", uselist=False)
    blockchain_commitment = relationship("BlockchainCommitment", back_populates="shipment", uselist=False)
    verification_runs = relationship("VerificationRun", back_populates="shipment")
    receiver_decision = relationship("ReceiverDecisionRecord", back_populates="shipment", uselist=False)
    audit_events = relationship("AuditEvent", back_populates="shipment")


class ShipmentAssignment(Base):
    __tablename__ = "shipment_assignments"

    id = Column(Integer, primary_key=True)
    shipment_id_fk = Column(Integer, ForeignKey("shipments.id"), nullable=False)
    transporter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    shipment = relationship("Shipment", back_populates="assignment")
    transporter = relationship("User", foreign_keys=[transporter_id], back_populates="assignments")
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])

    __table_args__ = (
        UniqueConstraint("shipment_id_fk", name="uq_shipment_assignment"),
    )


class TrustedSensorRecord(Base):
    """
    Immutable trusted sensor records generated or imported BEFORE the journey.
    These are the authoritative baseline.
    SIMULATED records are clearly labelled via data_source.
    """
    __tablename__ = "trusted_sensor_records"

    id = Column(Integer, primary_key=True)
    shipment_id_fk = Column(Integer, ForeignKey("shipments.id"), nullable=False)
    sequence_number = Column(Integer, nullable=False)
    device_id = Column(String(64), default="SIMULATED-DEVICE-001")
    measured_at = Column(DateTime, nullable=False)        # Measurement timestamp (UTC)
    temperature_celsius = Column(Float, nullable=False)
    unit = Column(String(8), default="C", nullable=False)
    data_source = Column(String(20), nullable=False)      # DataSource enum
    record_hash = Column(String(64))                      # SHA-256 of canonical record
    previous_hash = Column(String(64))                    # Hash of previous record (chain)
    signature = Column(Text)                              # Base64 Ed25519 signature
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    shipment = relationship("Shipment", back_populates="trusted_records")

    __table_args__ = (
        UniqueConstraint("shipment_id_fk", "sequence_number",
                         name="uq_trusted_record_sequence"),
        Index("ix_trusted_shipment_seq", "shipment_id_fk", "sequence_number"),
    )


class TransporterReading(Base):
    """
    Readings submitted manually by the transporter during the journey.
    Stored separately from trusted records to preserve comparison integrity.
    """
    __tablename__ = "transporter_readings"

    id = Column(Integer, primary_key=True)
    shipment_id_fk = Column(Integer, ForeignKey("shipments.id"), nullable=False)
    transporter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sequence_number = Column(Integer, nullable=False)
    measured_at = Column(DateTime, nullable=False)          # Entered by transporter
    server_received_at = Column(DateTime, nullable=False)   # Backend server timestamp
    temperature_celsius = Column(Float, nullable=False)
    unit = Column(String(8), default="C", nullable=False)
    is_out_of_range = Column(Boolean, default=False)
    is_correction = Column(Boolean, default=False)
    corrects_reading_id = Column(Integer, ForeignKey("transporter_readings.id"))
    correction_reason = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    shipment = relationship("Shipment", back_populates="transporter_readings")
    transporter = relationship("User", foreign_keys=[transporter_id])
    original_reading = relationship("TransporterReading", remote_side=[id])

    __table_args__ = (
        Index("ix_transporter_shipment_seq", "shipment_id_fk", "sequence_number"),
    )


class DatasetManifest(Base):
    """
    Canonical manifest of the trusted dataset, created before commitment.
    """
    __tablename__ = "dataset_manifests"

    id = Column(Integer, primary_key=True)
    shipment_id_fk = Column(Integer, ForeignKey("shipments.id"), nullable=False, unique=True)
    shipment_ref = Column(String(32), nullable=False)         # Denormalized for verification
    device_id = Column(String(64))
    schema_version = Column(String(16), default="1.0")
    record_count = Column(Integer, nullable=False)
    dataset_fingerprint = Column(String(64), nullable=False)  # SHA-256 of canonical dataset
    merkle_root = Column(String(64))                          # Merkle root if available
    signing_key_id = Column(String(64))
    signature = Column(Text)                                  # Base64 Ed25519 over manifest
    data_source = Column(String(20), nullable=False)
    is_simulated = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    shipment = relationship("Shipment", back_populates="dataset_manifest")


class BlockchainCommitment(Base):
    """
    On-chain commitment anchoring the trusted dataset fingerprint.
    """
    __tablename__ = "blockchain_commitments"

    id = Column(Integer, primary_key=True)
    shipment_id_fk = Column(Integer, ForeignKey("shipments.id"), nullable=False, unique=True)
    shipment_ref = Column(String(32), nullable=False)
    dataset_fingerprint = Column(String(64), nullable=False)
    transaction_hash = Column(String(66))    # 0x + 64 hex chars
    block_number = Column(Integer)
    chain_id = Column(Integer)
    contract_address = Column(String(42))
    committed_at = Column(DateTime)
    is_confirmed = Column(Boolean, default=False)
    is_demo = Column(Boolean, default=False)  # True if not a real blockchain tx
    verification_status = Column(String(30), default=VerificationStatus.PENDING.value)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    shipment = relationship("Shipment", back_populates="blockchain_commitment")


class VerificationRun(Base):
    """
    Record of each verification attempt by the receiver.
    """
    __tablename__ = "verification_runs"

    id = Column(Integer, primary_key=True)
    shipment_id_fk = Column(Integer, ForeignKey("shipments.id"), nullable=False)
    run_by_id = Column(Integer, ForeignKey("users.id"))
    run_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    mode = Column(String(16), default="ONLINE")  # ONLINE or OFFLINE

    # Record counts
    trusted_record_count = Column(Integer, default=0)
    transporter_record_count = Column(Integer, default=0)
    mismatch_count = Column(Integer, default=0)
    missing_count = Column(Integer, default=0)
    extra_count = Column(Integer, default=0)
    duplicate_count = Column(Integer, default=0)
    out_of_order_count = Column(Integer, default=0)

    # Verification results (VerificationStatus enum values)
    hash_chain_status = Column(String(30), default=VerificationStatus.PENDING.value)
    signature_status = Column(String(30), default=VerificationStatus.PENDING.value)
    blockchain_status = Column(String(30), default=VerificationStatus.PENDING.value)
    record_match_status = Column(String(30), default=VerificationStatus.PENDING.value)
    excursion_status = Column(String(30), default=VerificationStatus.PENDING.value)
    overall_integrity_status = Column(String(30), default=VerificationStatus.PENDING.value)
    overall_compliance_status = Column(String(30), default=VerificationStatus.PENDING.value)

    # Temperature
    excursion_count = Column(Integer, default=0)
    trusted_excursion_count = Column(Integer, default=0)

    result_json = Column(Text)   # Full structured results as JSON
    recommended_action = Column(String(32))

    run_by = relationship("User", foreign_keys=[run_by_id])
    shipment = relationship("Shipment", back_populates="verification_runs")


class ReceiverDecisionRecord(Base):
    """
    The final or latest receiver decision for a shipment.
    """
    __tablename__ = "receiver_decisions"

    id = Column(Integer, primary_key=True)
    shipment_id_fk = Column(Integer, ForeignKey("shipments.id"), nullable=False, unique=True)
    decided_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    verification_run_id = Column(Integer, ForeignKey("verification_runs.id"))
    decision = Column(String(10), nullable=False)  # ReceiverDecision enum
    reason = Column(Text)
    decided_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    shipment = relationship("Shipment", back_populates="receiver_decision")
    decided_by = relationship("User", foreign_keys=[decided_by_id])
    verification_run = relationship("VerificationRun")


class AuditEvent(Base):
    """
    Append-only audit log for all significant events.
    """
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True)
    event_type = Column(String(40), nullable=False)
    shipment_id_fk = Column(Integer, ForeignKey("shipments.id"))
    actor_id = Column(Integer, ForeignKey("users.id"))
    actor_role = Column(String(20))
    occurred_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    outcome = Column(String(20))   # SUCCESS, FAILURE, WARNING
    description = Column(Text)
    metadata_json = Column(Text)   # Additional context as JSON

    actor = relationship("User", back_populates="audit_events")
    shipment = relationship("Shipment", back_populates="audit_events")

    __table_args__ = (
        Index("ix_audit_shipment", "shipment_id_fk"),
        Index("ix_audit_actor", "actor_id"),
        Index("ix_audit_occurred", "occurred_at"),
    )


# ─── Engine and Session Factory ───────────────────────────────────────────────

def get_database_url():
    return os.environ.get(
        "DATABASE_URL",
        "sqlite:///coldchain.db"
    )


def create_db_engine(db_url=None):
    url = db_url or get_database_url()
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
    return create_engine(url, connect_args=connect_args, echo=False)


def init_db(engine=None):
    if engine is None:
        engine = create_db_engine()
    Base.metadata.create_all(engine)
    return engine


SessionFactory = None


def get_session():
    global SessionFactory
    if SessionFactory is None:
        engine = create_db_engine()
        init_db(engine)
        SessionFactory = sessionmaker(bind=engine)
    return SessionFactory()
