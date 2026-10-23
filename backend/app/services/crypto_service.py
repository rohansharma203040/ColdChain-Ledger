"""
ColdChain Ledger — Cryptographic Services
Ed25519 signing/verification and SHA-256 hashing.
"""

import hashlib
import json
import base64
import os
from datetime import datetime, timezone
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey, Ed25519PublicKey
)
from cryptography.hazmat.primitives.serialization import (
    Encoding, PublicFormat, PrivateFormat, NoEncryption,
    load_pem_private_key, load_pem_public_key
)
from cryptography.exceptions import InvalidSignature


SCHEMA_VERSION = "1.0"
GENESIS_HASH = "0" * 64  # Placeholder for first record in chain


def _canonical_record(record: dict) -> bytes:
    """
    Produce a deterministic UTF-8 JSON byte representation of a record.
    Fields are sorted, timestamps normalized, numeric values preserved as-is.
    Only defined fields are included.
    """
    canonical_fields = {
        "schema_version": record.get("schema_version", SCHEMA_VERSION),
        "shipment_id": str(record["shipment_id"]),
        "device_id": str(record.get("device_id", "SIMULATED-DEVICE-001")),
        "sequence_number": int(record["sequence_number"]),
        "measured_at": _normalize_timestamp(record["measured_at"]),
        "temperature_celsius": float(record["temperature_celsius"]),
        "unit": str(record.get("unit", "C")),
        "previous_hash": str(record.get("previous_hash", GENESIS_HASH)),
    }
    return json.dumps(canonical_fields, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _normalize_timestamp(ts) -> str:
    """Normalize a timestamp to ISO 8601 UTC string."""
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if isinstance(ts, str):
        # Accept already-normalized strings
        ts = ts.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(ts)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            raise ValueError(f"Cannot parse timestamp: {ts!r}")
    raise TypeError(f"Unsupported timestamp type: {type(ts)}")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compute_record_hash(record: dict) -> str:
    """Compute SHA-256 hash of canonical record representation."""
    return sha256_hex(_canonical_record(record))


def compute_dataset_fingerprint(records: list) -> str:
    """
    Compute SHA-256 over the concatenated record hashes in sequence order.
    Records must include their computed record_hash field.
    """
    chain = "".join(r["record_hash"] for r in sorted(records, key=lambda r: r["sequence_number"]))
    return sha256_hex(chain.encode("utf-8"))


def build_hash_chain(records: list, shipment_id: str, device_id: str = "SIMULATED-DEVICE-001") -> list:
    """
    Build a hash chain over a list of records sorted by sequence_number.
    Returns records with record_hash and previous_hash populated.
    """
    sorted_recs = sorted(records, key=lambda r: r["sequence_number"])
    prev_hash = GENESIS_HASH
    result = []
    for rec in sorted_recs:
        enriched = dict(rec)
        enriched["shipment_id"] = shipment_id
        enriched["device_id"] = device_id
        enriched["previous_hash"] = prev_hash
        enriched["schema_version"] = SCHEMA_VERSION
        record_hash = compute_record_hash(enriched)
        enriched["record_hash"] = record_hash
        prev_hash = record_hash
        result.append(enriched)
    return result


# ─── Key Management ───────────────────────────────────────────────────────────

KEYS_DIR = os.environ.get("SIGNING_KEYS_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "keys"))
PRIVATE_KEY_FILE = os.path.join(KEYS_DIR, "signing_key.pem")
PUBLIC_KEY_FILE = os.path.join(KEYS_DIR, "signing_key_pub.pem")
KEY_ID = "dev-key-001"


def generate_dev_keypair():
    """Generate a development Ed25519 keypair and save to KEYS_DIR."""
    os.makedirs(KEYS_DIR, exist_ok=True)
    private_key = Ed25519PrivateKey.generate()
    pub_key = private_key.public_key()

    priv_pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    pub_pem = pub_key.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)

    with open(PRIVATE_KEY_FILE, "wb") as f:
        f.write(priv_pem)
    with open(PUBLIC_KEY_FILE, "wb") as f:
        f.write(pub_pem)

    return private_key, pub_key


def load_private_key() -> Ed25519PrivateKey | None:
    """Load private key from file. Returns None if unavailable."""
    path = os.environ.get("SIGNING_PRIVATE_KEY_FILE", PRIVATE_KEY_FILE)
    try:
        with open(path, "rb") as f:
            return load_pem_private_key(f.read(), password=None)
    except FileNotFoundError:
        return None


def load_public_key() -> Ed25519PublicKey | None:
    """Load public key from file. Returns None if unavailable."""
    path = os.environ.get("SIGNING_PUBLIC_KEY_FILE", PUBLIC_KEY_FILE)
    try:
        with open(path, "rb") as f:
            return load_pem_public_key(f.read())
    except FileNotFoundError:
        return None


def get_public_key_hex() -> str | None:
    """Return the public key as hex-encoded raw bytes."""
    pub = load_public_key()
    if pub is None:
        return None
    raw = pub.public_bytes(Encoding.Raw, PublicFormat.Raw)
    return raw.hex()


# ─── Signing ─────────────────────────────────────────────────────────────────

def sign_manifest(manifest_dict: dict) -> dict:
    """
    Sign a dataset manifest with the private key.
    Returns the manifest with 'signature' and 'signing_key_id' fields added.
    Raises RuntimeError if private key is unavailable.
    """
    private_key = load_private_key()
    if private_key is None:
        raise RuntimeError("Signing private key not found. Run generate_dev_keypair() first.")

    # Sign the canonical JSON (exclude existing signature field)
    signable = {k: v for k, v in manifest_dict.items() if k not in ("signature", "signing_key_id")}
    canonical = json.dumps(signable, sort_keys=True, separators=(",", ":")).encode("utf-8")
    sig_bytes = private_key.sign(canonical)
    sig_b64 = base64.b64encode(sig_bytes).decode("utf-8")

    return {**manifest_dict, "signature": sig_b64, "signing_key_id": KEY_ID}


def verify_manifest_signature(manifest_dict: dict) -> dict:
    """
    Verify the Ed25519 signature on a manifest.
    Returns a result dict with 'status' and 'detail'.
    """
    pub_key = load_public_key()
    if pub_key is None:
        return {"status": "UNAVAILABLE", "detail": "Trusted public key file not found."}

    signature_b64 = manifest_dict.get("signature")
    if not signature_b64:
        return {"status": "NOT_VERIFIED", "detail": "No signature present in manifest."}

    signable = {k: v for k, v in manifest_dict.items() if k not in ("signature", "signing_key_id")}
    canonical = json.dumps(signable, sort_keys=True, separators=(",", ":")).encode("utf-8")

    try:
        sig_bytes = base64.b64decode(signature_b64)
        pub_key.verify(sig_bytes, canonical)
        return {"status": "VERIFIED", "detail": "Ed25519 signature is valid."}
    except InvalidSignature:
        return {"status": "FAILED", "detail": "Ed25519 signature verification failed — manifest may have been altered."}
    except Exception as e:
        return {"status": "FAILED", "detail": f"Signature verification error: {e}"}


# ─── Hash Chain Verification ─────────────────────────────────────────────────

def verify_hash_chain(records: list, shipment_id: str, device_id: str = "SIMULATED-DEVICE-001") -> dict:
    """
    Verify the hash chain integrity of a list of trusted records.
    Returns structured result.
    """
    if not records:
        return {
            "status": "INCOMPLETE_EVIDENCE",
            "detail": "No records provided.",
            "broken_at_sequence": None,
            "errors": [],
        }

    sorted_recs = sorted(records, key=lambda r: r["sequence_number"])
    expected_prev = GENESIS_HASH
    errors = []

    for rec in sorted_recs:
        seq = rec["sequence_number"]

        # Check previous_hash linkage
        actual_prev = rec.get("previous_hash", "")
        if actual_prev != expected_prev:
            errors.append({
                "sequence_number": seq,
                "issue": "BROKEN_CHAIN",
                "detail": f"Seq {seq}: expected previous_hash {expected_prev[:16]}… got {actual_prev[:16]}…",
            })

        # Recompute record hash
        check_rec = {
            "schema_version": rec.get("schema_version", SCHEMA_VERSION),
            "shipment_id": str(shipment_id),
            "device_id": str(device_id),
            "sequence_number": int(seq),
            "measured_at": rec["measured_at"],
            "temperature_celsius": float(rec["temperature_celsius"]),
            "unit": rec.get("unit", "C"),
            "previous_hash": rec.get("previous_hash", expected_prev),
        }
        computed_hash = compute_record_hash(check_rec)
        stored_hash = rec.get("record_hash", "")

        if stored_hash and stored_hash != computed_hash:
            errors.append({
                "sequence_number": seq,
                "issue": "HASH_MISMATCH",
                "detail": f"Seq {seq}: stored hash {stored_hash[:16]}… does not match recomputed {computed_hash[:16]}…",
            })

        expected_prev = computed_hash  # Use recomputed hash for chain continuity check

    if errors:
        return {
            "status": "FAILED",
            "detail": f"Hash chain broken at {len(errors)} point(s).",
            "broken_at_sequence": errors[0]["sequence_number"],
            "errors": errors,
        }

    return {
        "status": "VERIFIED",
        "detail": f"All {len(sorted_recs)} records form a valid hash chain.",
        "broken_at_sequence": None,
        "errors": [],
    }
