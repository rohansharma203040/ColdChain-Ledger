"""
ColdChain Ledger — Verification Service
Compares trusted sensor records vs transporter readings,
detects mismatches, excursions, and data-quality issues.
"""

from datetime import datetime, timezone, timedelta
from .crypto_service import verify_hash_chain, verify_manifest_signature, compute_dataset_fingerprint


def _parse_ts(ts) -> datetime | None:
    if ts is None:
        return None
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            return ts.replace(tzinfo=timezone.utc)
        return ts
    if isinstance(ts, str):
        ts = ts.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(ts)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            return None
    return None


def _rec_to_dict(rec) -> dict:
    """Convert ORM record or plain dict to comparison dict."""
    if hasattr(rec, "__dict__"):
        return {
            "sequence_number": rec.sequence_number,
            "measured_at": rec.measured_at,
            "temperature_celsius": rec.temperature_celsius,
            "unit": getattr(rec, "unit", "C"),
            "record_hash": getattr(rec, "record_hash", None),
            "previous_hash": getattr(rec, "previous_hash", None),
            "shipment_id": getattr(rec, "shipment_id", None),
            "device_id": getattr(rec, "device_id", "SIMULATED-DEVICE-001"),
        }
    return rec


def run_full_verification(
    shipment: dict,
    trusted_records: list,
    transporter_records: list,
    manifest: dict | None = None,
    blockchain_commitment: dict | None = None,
) -> dict:
    """
    Run all verification checks and return a structured result.

    shipment: dict with keys shipment_id, min_temp, max_temp, reading_interval_minutes
    trusted_records: list of dicts/ORM objects (the authoritative trusted records)
    transporter_records: list of dicts/ORM objects (submitted by transporter)
    manifest: optional dataset manifest dict for signature verification
    blockchain_commitment: optional blockchain commitment dict
    """
    shipment_id = shipment["shipment_id"]
    min_temp = float(shipment["min_temp"])
    max_temp = float(shipment["max_temp"])
    interval_minutes = int(shipment.get("reading_interval_minutes", 10))

    trusted = [_rec_to_dict(r) for r in trusted_records]
    transporter = [_rec_to_dict(r) for r in transporter_records]

    # ── 1. Record Counts ───────────────────────────────────────────────────
    trusted_count = len(trusted)
    transporter_count = len(transporter)

    # ── 2. Sequence Analysis (trusted) ────────────────────────────────────
    seq_analysis = _analyze_sequences(trusted, "trusted")
    transport_seq_analysis = _analyze_sequences(transporter, "transporter")

    # ── 3. Record Comparison ──────────────────────────────────────────────
    comparison = _compare_records(trusted, transporter)

    # ── 4. Hash Chain Verification ────────────────────────────────────────
    device_id = trusted[0].get("device_id", "SIMULATED-DEVICE-001") if trusted else "SIMULATED-DEVICE-001"
    chain_result = verify_hash_chain(trusted, shipment_id, device_id) if trusted else {
        "status": "INCOMPLETE_EVIDENCE", "detail": "No trusted records.", "errors": []
    }

    # ── 5. Signature Verification ─────────────────────────────────────────
    if manifest and manifest.get("signature"):
        sig_result = verify_manifest_signature(manifest)
    elif manifest:
        sig_result = {"status": "NOT_VERIFIED", "detail": "Manifest present but no signature found."}
    else:
        sig_result = {"status": "UNAVAILABLE", "detail": "No manifest available for signature verification."}

    # ── 6. Blockchain Verification ────────────────────────────────────────
    bc_result = _check_blockchain(blockchain_commitment, trusted, shipment_id)

    # ── 7. Excursion Analysis (trusted records are authoritative) ─────────
    excursion_result = _analyze_excursions(trusted, min_temp, max_temp, interval_minutes)

    # ── 8. Overall Statuses ───────────────────────────────────────────────
    integrity_status = _compute_integrity_status(chain_result, sig_result, comparison, seq_analysis)
    compliance_status = _compute_compliance_status(excursion_result)
    recommended_action = _recommend_action(integrity_status, compliance_status, comparison, seq_analysis)

    return {
        "shipment_id": shipment_id,
        "verified_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "trusted_record_count": trusted_count,
        "transporter_record_count": transporter_count,

        "sequence_analysis": seq_analysis,
        "transport_sequence_analysis": transport_seq_analysis,
        "record_comparison": comparison,
        "hash_chain": chain_result,
        "signature": sig_result,
        "blockchain": bc_result,
        "excursion_analysis": excursion_result,

        "overall_integrity_status": integrity_status,
        "overall_compliance_status": compliance_status,
        "recommended_action": recommended_action,

        # Convenience counts
        "mismatch_count": comparison["mismatch_count"],
        "missing_count": seq_analysis["missing_count"],
        "extra_count": comparison["extra_in_transporter"],
        "duplicate_count": seq_analysis["duplicate_count"] + transport_seq_analysis["duplicate_count"],
        "out_of_order_count": seq_analysis["out_of_order_count"],
        "trusted_excursion_count": excursion_result["excursion_reading_count"],
    }


def _analyze_sequences(records: list, label: str) -> dict:
    if not records:
        return {
            "label": label, "record_count": 0, "missing_count": 0,
            "duplicate_count": 0, "out_of_order_count": 0,
            "missing_sequences": [], "duplicate_sequences": [], "issues": [],
        }

    sorted_recs = sorted(records, key=lambda r: r["sequence_number"])
    seqs = [r["sequence_number"] for r in sorted_recs]

    # Duplicates
    seen = {}
    duplicates = []
    for s in seqs:
        seen[s] = seen.get(s, 0) + 1
    for s, count in seen.items():
        if count > 1:
            duplicates.append(s)

    # Missing sequences (between min and max)
    if seqs:
        expected = set(range(min(seqs), max(seqs) + 1))
        missing = sorted(expected - set(seqs))
    else:
        missing = []

    # Out of order
    out_of_order = []
    for i in range(1, len(sorted_recs)):
        ts_prev = _parse_ts(sorted_recs[i - 1]["measured_at"])
        ts_curr = _parse_ts(sorted_recs[i]["measured_at"])
        if ts_prev and ts_curr and ts_curr < ts_prev:
            out_of_order.append(sorted_recs[i]["sequence_number"])

    # Duplicate timestamps
    ts_seen = {}
    dup_ts = []
    for r in records:
        ts = str(_parse_ts(r["measured_at"]))
        ts_seen[ts] = ts_seen.get(ts, 0) + 1
    for ts, count in ts_seen.items():
        if count > 1:
            dup_ts.append(ts)

    issues = []
    if missing:
        issues.append(f"Missing sequences: {missing}")
    if duplicates:
        issues.append(f"Duplicate sequences: {duplicates}")
    if out_of_order:
        issues.append(f"Out-of-order sequences: {out_of_order}")
    if dup_ts:
        issues.append(f"Duplicate timestamps: {dup_ts}")

    return {
        "label": label,
        "record_count": len(records),
        "missing_count": len(missing),
        "duplicate_count": len(duplicates),
        "out_of_order_count": len(out_of_order),
        "missing_sequences": missing,
        "duplicate_sequences": duplicates,
        "out_of_order_sequences": out_of_order,
        "duplicate_timestamps": dup_ts,
        "issues": issues,
    }


def _compare_records(trusted: list, transporter: list) -> dict:
    """Compare trusted vs transporter records by sequence number."""
    trusted_map = {r["sequence_number"]: r for r in trusted}
    transport_map = {r["sequence_number"]: r for r in transporter}

    all_seqs = sorted(set(trusted_map.keys()) | set(transport_map.keys()))

    mismatches = []
    matched = 0
    missing_in_transporter = []
    extra_in_transporter = []

    for seq in all_seqs:
        t_rec = trusted_map.get(seq)
        r_rec = transport_map.get(seq)

        if t_rec is None:
            extra_in_transporter.append(seq)
            continue
        if r_rec is None:
            missing_in_transporter.append(seq)
            continue

        # Compare temperatures (allow 0.001 float tolerance)
        t_temp = round(float(t_rec["temperature_celsius"]), 4)
        r_temp = round(float(r_rec["temperature_celsius"]), 4)
        if abs(t_temp - r_temp) > 0.001:
            mismatches.append({
                "sequence_number": seq,
                "trusted_temp": t_temp,
                "transporter_temp": r_temp,
                "difference": round(r_temp - t_temp, 4),
                "trusted_measured_at": str(_parse_ts(t_rec["measured_at"])),
                "transporter_measured_at": str(_parse_ts(r_rec["measured_at"])),
            })
        else:
            matched += 1

    status = "VERIFIED" if not mismatches else "MISMATCH_DETECTED"
    if not trusted:
        status = "INCOMPLETE_EVIDENCE"

    return {
        "status": status,
        "matched_count": matched,
        "mismatch_count": len(mismatches),
        "missing_in_transporter": len(missing_in_transporter),
        "missing_sequences": missing_in_transporter,
        "extra_in_transporter": len(extra_in_transporter),
        "extra_sequences": extra_in_transporter,
        "mismatches": mismatches,
    }


def _check_blockchain(commitment: dict | None, trusted: list, shipment_id: str) -> dict:
    """Compare blockchain commitment against trusted dataset fingerprint."""
    if commitment is None:
        return {"status": "UNAVAILABLE", "detail": "No blockchain commitment recorded for this shipment."}

    if commitment.get("is_demo"):
        return {
            "status": "DEMO_ONLY",
            "detail": "This commitment was recorded in demo mode; not a real blockchain transaction.",
            "transaction_hash": commitment.get("transaction_hash"),
            "committed_fingerprint": commitment.get("dataset_fingerprint"),
        }

    if not commitment.get("transaction_hash"):
        return {"status": "PENDING", "detail": "Transaction hash not yet recorded."}

    # Recompute fingerprint from trusted records
    if not trusted:
        return {"status": "INCOMPLETE_EVIDENCE", "detail": "No trusted records to compute fingerprint."}

    recs_for_fingerprint = []
    for r in trusted:
        recs_for_fingerprint.append({
            "sequence_number": r["sequence_number"],
            "record_hash": r.get("record_hash", ""),
        })

    # If record hashes are empty, we can't verify
    if not all(r["record_hash"] for r in recs_for_fingerprint):
        return {"status": "INCOMPLETE_EVIDENCE", "detail": "Trusted records lack hash values; cannot compute fingerprint."}

    current_fingerprint = compute_dataset_fingerprint(recs_for_fingerprint)
    committed_fingerprint = commitment.get("dataset_fingerprint", "")

    if current_fingerprint == committed_fingerprint:
        return {
            "status": "VERIFIED",
            "detail": "Dataset fingerprint matches the on-chain commitment.",
            "transaction_hash": commitment.get("transaction_hash"),
            "block_number": commitment.get("block_number"),
            "committed_fingerprint": committed_fingerprint,
            "computed_fingerprint": current_fingerprint,
        }
    else:
        return {
            "status": "MISMATCH_DETECTED",
            "detail": "Dataset fingerprint does NOT match the on-chain commitment — records may have been altered.",
            "committed_fingerprint": committed_fingerprint,
            "computed_fingerprint": current_fingerprint,
        }


def _analyze_excursions(trusted: list, min_temp: float, max_temp: float, interval_minutes: int) -> dict:
    """
    Analyze temperature excursions in trusted records.
    Duration is estimated by the number of consecutive violating readings × interval.
    Uncertainty is flagged when exact start/end cannot be established.
    """
    if not trusted:
        return {
            "status": "INCOMPLETE_EVIDENCE",
            "excursion_reading_count": 0,
            "excursions": [],
            "detail": "No trusted records to analyze.",
        }

    sorted_recs = sorted(trusted, key=lambda r: r["sequence_number"])
    violations = []
    excursion_groups = []
    current_group = []

    for rec in sorted_recs:
        temp = float(rec["temperature_celsius"])
        if temp < min_temp or temp > max_temp:
            violations.append({
                "sequence_number": rec["sequence_number"],
                "measured_at": str(_parse_ts(rec["measured_at"])),
                "temperature_celsius": temp,
                "violation": "BELOW_MIN" if temp < min_temp else "ABOVE_MAX",
                "delta": round(temp - min_temp, 4) if temp < min_temp else round(temp - max_temp, 4),
            })
            current_group.append(rec)
        else:
            if current_group:
                excursion_groups.append(current_group)
                current_group = []

    if current_group:
        excursion_groups.append(current_group)

    # Estimate durations
    estimated_excursions = []
    for grp in excursion_groups:
        n = len(grp)
        # Duration is uncertain: excursion started ≤1 interval before first violation
        # and ended ≤1 interval after last violation.
        estimated_min_minutes = (n - 1) * interval_minutes
        estimated_max_minutes = (n + 1) * interval_minutes
        estimated_excursions.append({
            "first_reading_at": str(_parse_ts(grp[0]["measured_at"])),
            "last_reading_at": str(_parse_ts(grp[-1]["measured_at"])),
            "reading_count": n,
            "estimated_min_duration_minutes": estimated_min_minutes,
            "estimated_max_duration_minutes": estimated_max_minutes,
            "duration_uncertainty": "Exact start/end unknown; actual duration may exceed estimated range.",
            "max_violation": max(abs(float(r["temperature_celsius"]) - min_temp)
                                 if float(r["temperature_celsius"]) < min_temp
                                 else abs(float(r["temperature_celsius"]) - max_temp)
                                 for r in grp),
        })

    status = "EXCURSION_DETECTED" if violations else "VERIFIED"
    return {
        "status": status,
        "min_temp": min_temp,
        "max_temp": max_temp,
        "excursion_reading_count": len(violations),
        "excursion_groups": len(excursion_groups),
        "violations": violations,
        "estimated_excursions": estimated_excursions,
        "detail": f"{len(violations)} violation(s) detected." if violations else "All trusted readings within range.",
        "duration_method": (
            f"Duration estimated as (N-1) to (N+1) × {interval_minutes} min interval. "
            "Exact excursion start/end cannot be established from sample data alone."
        ),
    }


def _compute_integrity_status(chain_result, sig_result, comparison, seq_analysis) -> str:
    failures = []
    if chain_result["status"] == "FAILED":
        failures.append("HASH_CHAIN_FAILED")
    if sig_result["status"] == "FAILED":
        failures.append("SIGNATURE_FAILED")
    if comparison["status"] == "MISMATCH_DETECTED":
        failures.append("RECORD_MISMATCH")
    if seq_analysis["missing_count"] > 0 or seq_analysis["duplicate_count"] > 0:
        failures.append("DATA_QUALITY")

    if failures:
        if "HASH_CHAIN_FAILED" in failures or "SIGNATURE_FAILED" in failures:
            return "FAILED"
        if "RECORD_MISMATCH" in failures:
            return "MISMATCH_DETECTED"
        return "INCOMPLETE_EVIDENCE"

    if chain_result["status"] == "UNAVAILABLE" or sig_result["status"] == "UNAVAILABLE":
        return "INCOMPLETE_EVIDENCE"

    return "VERIFIED"


def _compute_compliance_status(excursion_result) -> str:
    if excursion_result["status"] == "EXCURSION_DETECTED":
        return "EXCURSION_DETECTED"
    if excursion_result["status"] == "INCOMPLETE_EVIDENCE":
        return "INCOMPLETE_EVIDENCE"
    return "VERIFIED"


def _recommend_action(integrity_status, compliance_status, comparison, seq_analysis) -> str:
    if integrity_status in ("FAILED", "MISMATCH_DETECTED"):
        return "REJECT_OR_HOLD"
    if compliance_status == "EXCURSION_DETECTED":
        return "HOLD_FOR_REVIEW"
    if integrity_status == "INCOMPLETE_EVIDENCE":
        return "HOLD_FOR_REVIEW"
    if seq_analysis["missing_count"] > 0 or seq_analysis["duplicate_count"] > 0:
        return "HOLD_FOR_REVIEW"
    return "APPROVE"
