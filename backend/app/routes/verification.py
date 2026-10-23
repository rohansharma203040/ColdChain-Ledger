"""
Verification and receiver decision routes.
"""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from xml.sax.saxutils import escape
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Image as PDFImage
from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from datetime import datetime, timezone
import json
import csv
import io

from ..models.database import (
    Shipment, TrustedSensorRecord, TransporterReading, DatasetManifest,
    BlockchainCommitment, VerificationRun, ReceiverDecisionRecord, AuditEvent,
    ShipmentStatus, AuditEventType, UserRole, ReceiverDecision, get_session
)
from ..services.verification_service import run_full_verification
from ..services.crypto_service import verify_hash_chain, verify_manifest_signature
from .auth import require_role
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

verification_bp = Blueprint("verification", __name__, url_prefix="/api")


def _trusted_to_dict(r):
    return {
        "sequence_number": r.sequence_number,
        "device_id": r.device_id,
        "measured_at": r.measured_at.isoformat() if r.measured_at else None,
        "temperature_celsius": r.temperature_celsius,
        "unit": r.unit,
        "data_source": r.data_source,
        "record_hash": r.record_hash,
        "previous_hash": r.previous_hash,
    }


def _reading_to_dict(r):
    return {
        "sequence_number": r.sequence_number,
        "measured_at": r.measured_at.isoformat() if r.measured_at else None,
        "temperature_celsius": r.temperature_celsius,
        "unit": r.unit,
        "is_out_of_range": r.is_out_of_range,
        "is_correction": r.is_correction,
    }


@verification_bp.route("/verification/<string:shipment_id>", methods=["POST"])
@require_role(UserRole.RECEIVER.value, UserRole.ADMIN.value)
def run_verification(shipment_id):
    """Run full verification on a shipment and persist the run record."""
    user_id = int(get_jwt_identity())
    session = get_session()
    try:
        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        if not s:
            return jsonify({"error": "Shipment not found."}), 404

        trusted_recs = session.query(TrustedSensorRecord).filter_by(
            shipment_id_fk=s.id
        ).order_by(TrustedSensorRecord.sequence_number).all()

        transporter_recs = session.query(TransporterReading).filter_by(
            shipment_id_fk=s.id, is_correction=False
        ).order_by(TransporterReading.sequence_number).all()

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
            }

        bc = s.blockchain_commitment
        bc_dict = None
        if bc:
            bc_dict = {
                "dataset_fingerprint": bc.dataset_fingerprint,
                "transaction_hash": bc.transaction_hash,
                "block_number": bc.block_number,
                "is_demo": bc.is_demo,
            }

        shipment_dict = {
            "shipment_id": s.shipment_id,
            "min_temp": s.min_temp,
            "max_temp": s.max_temp,
            "reading_interval_minutes": s.reading_interval_minutes,
        }

        result = run_full_verification(
            shipment=shipment_dict,
            trusted_records=[_trusted_to_dict(r) for r in trusted_recs],
            transporter_records=[_reading_to_dict(r) for r in transporter_recs],
            manifest=manifest_dict,
            blockchain_commitment=bc_dict,
        )

        # Persist the run
        vr = VerificationRun(
            shipment_id_fk=s.id,
            run_by_id=user_id,
            mode="ONLINE",
            trusted_record_count=result["trusted_record_count"],
            transporter_record_count=result["transporter_record_count"],
            mismatch_count=result["mismatch_count"],
            missing_count=result["missing_count"],
            extra_count=result["extra_count"],
            duplicate_count=result["duplicate_count"],
            out_of_order_count=result["out_of_order_count"],
            hash_chain_status=result["hash_chain"]["status"],
            signature_status=result["signature"]["status"],
            blockchain_status=result["blockchain"]["status"],
            record_match_status=result["record_comparison"]["status"],
            excursion_status=result["excursion_analysis"]["status"],
            overall_integrity_status=result["overall_integrity_status"],
            overall_compliance_status=result["overall_compliance_status"],
            excursion_count=result["excursion_analysis"]["excursion_reading_count"],
            trusted_excursion_count=result["trusted_excursion_count"],
            recommended_action=result["recommended_action"],
            result_json=json.dumps(result),
        )
        session.add(vr)
        session.flush()

        session.add(AuditEvent(
            event_type=AuditEventType.VERIFICATION_RUN.value,
            shipment_id_fk=s.id,
            actor_id=user_id,
            actor_role=UserRole.RECEIVER.value,
            outcome="SUCCESS",
            description=f"Verification run. Integrity: {result['overall_integrity_status']}. Compliance: {result['overall_compliance_status']}.",
        ))
        session.commit()

        result["verification_run_id"] = vr.id
        return jsonify(result), 200
    finally:
        session.close()


@verification_bp.route("/verification/<string:shipment_id>/offline", methods=["POST"])
@require_role(UserRole.RECEIVER.value, UserRole.ADMIN.value)
def run_offline_verification(shipment_id):
    """
    Offline verification: accepts imported trusted + transporter JSON data.
    Runs local comparison and chain check without database lookups for records.
    """
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    trusted_records = data.get("trusted_records", [])
    transporter_records = data.get("transporter_records", [])
    manifest = data.get("manifest")
    blockchain_commitment = data.get("blockchain_commitment")

    if not trusted_records:
        return jsonify({"error": "trusted_records required for offline verification."}), 400

    session = get_session()
    try:
        # Still look up shipment config from DB for min/max temp
        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        if s:
            shipment_dict = {
                "shipment_id": shipment_id,
                "min_temp": s.min_temp,
                "max_temp": s.max_temp,
                "reading_interval_minutes": s.reading_interval_minutes,
            }
        else:
            # Use provided config if shipment not in local DB
            shipment_dict = {
                "shipment_id": shipment_id,
                "min_temp": data.get("min_temp", 2.0),
                "max_temp": data.get("max_temp", 8.0),
                "reading_interval_minutes": data.get("reading_interval_minutes", 10),
            }

        result = run_full_verification(
            shipment=shipment_dict,
            trusted_records=trusted_records,
            transporter_records=transporter_records,
            manifest=manifest,
            blockchain_commitment=blockchain_commitment,
        )
        result["mode"] = "OFFLINE"
        result["blockchain"]["status"] = "UNAVAILABLE"
        result["blockchain"]["detail"] = "Offline mode: live blockchain check not available."

        session.add(AuditEvent(
            event_type=AuditEventType.OFFLINE_IMPORT_ATTEMPTED.value,
            shipment_id_fk=s.id if s else None,
            actor_id=user_id,
            actor_role=UserRole.RECEIVER.value,
            outcome="SUCCESS",
            description=f"Offline verification for {shipment_id}. Trusted: {len(trusted_records)}, Transporter: {len(transporter_records)} records.",
        ))
        session.commit()
        return jsonify(result), 200
    finally:
        session.close()


@verification_bp.route("/decisions/<string:shipment_id>", methods=["POST"])
@require_role(UserRole.RECEIVER.value)
def record_decision(shipment_id):
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    decision_str = (data.get("decision") or "").upper()
    if decision_str not in (ReceiverDecision.APPROVE.value, ReceiverDecision.REJECT.value, ReceiverDecision.HOLD.value):
        return jsonify({"error": "decision must be APPROVE, REJECT, or HOLD."}), 400

    if decision_str in (ReceiverDecision.REJECT.value, ReceiverDecision.HOLD.value):
        if not data.get("reason"):
            return jsonify({"error": "reason is required for REJECT and HOLD decisions."}), 400

    session = get_session()
    try:
        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        if not s:
            return jsonify({"error": "Shipment not found."}), 404

        # Upsert decision
        existing = session.query(ReceiverDecisionRecord).filter_by(shipment_id_fk=s.id).first()
        now = datetime.now(timezone.utc)
        if existing:
            existing.decision = decision_str
            existing.reason = data.get("reason", "")
            existing.decided_by_id = user_id
            existing.decided_at = now
        else:
            dr = ReceiverDecisionRecord(
                shipment_id_fk=s.id,
                decided_by_id=user_id,
                decision=decision_str,
                reason=data.get("reason", ""),
                decided_at=now,
            )
            session.add(dr)

        # Update shipment status
        if decision_str == ReceiverDecision.APPROVE.value:
            s.status = ShipmentStatus.APPROVED.value
        elif decision_str == ReceiverDecision.REJECT.value:
            s.status = ShipmentStatus.REJECTED.value
        elif decision_str == ReceiverDecision.HOLD.value:
            s.status = ShipmentStatus.HELD.value

        session.add(AuditEvent(
            event_type=AuditEventType.RECEIVER_DECISION_MADE.value,
            shipment_id_fk=s.id,
            actor_id=user_id,
            actor_role=UserRole.RECEIVER.value,
            occurred_at=now,
            outcome="SUCCESS",
            description=f"Decision: {decision_str}. Reason: {data.get('reason', '')}",
        ))
        session.commit()
        return jsonify({"message": f"Decision '{decision_str}' recorded.", "shipment_status": s.status}), 200
    finally:
        session.close()


@verification_bp.route("/decisions/<string:shipment_id>", methods=["GET"])
@require_role(UserRole.RECEIVER.value, UserRole.ADMIN.value)
def get_decision(shipment_id):
    session = get_session()
    try:
        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        if not s:
            return jsonify({"error": "Shipment not found."}), 404
        d = s.receiver_decision
        if not d:
            return jsonify({"decision": None}), 200
        return jsonify({
            "decision": d.decision,
            "reason": d.reason,
            "decided_at": d.decided_at.isoformat(),
            "decided_by_id": d.decided_by_id,
        }), 200
    finally:
        session.close()


@verification_bp.route("/audit/<string:shipment_id>", methods=["GET"])
@jwt_required()
def get_audit(shipment_id):
    claims = get_jwt()
    role = claims.get("role")
    user_id = int(get_jwt_identity())

    session = get_session()
    try:
        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        if not s:
            return jsonify({"error": "Shipment not found."}), 404

        if role == UserRole.TRANSPORTER.value:
            if not s.assignment or s.assignment.transporter_id != user_id:
                return jsonify({"error": "Not authorized."}), 403

        events = session.query(AuditEvent).filter_by(
            shipment_id_fk=s.id
        ).order_by(AuditEvent.occurred_at.asc()).all()

        return jsonify([{
            "id": e.id,
            "event_type": e.event_type,
            "actor_id": e.actor_id,
            "actor_role": e.actor_role,
            "occurred_at": e.occurred_at.isoformat(),
            "outcome": e.outcome,
            "description": e.description,
        } for e in events]), 200
    finally:
        session.close()


def build_pdf_report_bytes(session, shipment_id):
    """
    Generate the authentic ColdChain Ledger PDF report bytes for a given shipment.
    Returns: (pdf_bytes, report_dict, error_string)
    """
    s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
    if not s:
        return None, None, "Shipment not found."

    try:
        # Get latest verification run
        vr = session.query(VerificationRun).filter_by(
            shipment_id_fk=s.id
        ).order_by(VerificationRun.run_at.desc()).first()

        trusted_recs = session.query(TrustedSensorRecord).filter_by(
            shipment_id_fk=s.id
        ).order_by(TrustedSensorRecord.sequence_number).all()
        transporter_recs = session.query(TransporterReading).filter_by(
            shipment_id_fk=s.id
        ).order_by(TransporterReading.sequence_number).all()

        decision = s.receiver_decision
        events = session.query(AuditEvent).filter_by(
            shipment_id_fk=s.id
        ).order_by(AuditEvent.occurred_at.asc()).all()

        report = {
            "report_generated_at": datetime.now(timezone.utc).isoformat(),
            "report_type": "ColdChain Ledger Verification Report",
            "shipment": {
                "shipment_id": s.shipment_id,
                "medicine_name": s.medicine_name,
                "batch_number": s.batch_number,
                "origin": s.origin,
                "destination": s.destination,
                "vehicle_registration": s.vehicle_registration,
                "min_temp_celsius": s.min_temp,
                "max_temp_celsius": s.max_temp,
                "reading_interval_minutes": s.reading_interval_minutes,
                "status": s.status,
                "journey_started_at": s.journey_started_at.isoformat() if s.journey_started_at else None,
                "delivered_at": s.delivered_at.isoformat() if s.delivered_at else None,
            },
            "verification_summary": json.loads(vr.result_json) if vr and vr.result_json else None,
            "trusted_records": [{"seq": r.sequence_number, "temp": r.temperature_celsius,
                                  "at": r.measured_at.isoformat(), "source": r.data_source,
                                  "hash": r.record_hash} for r in trusted_recs],
            "transporter_records": [{"seq": r.sequence_number, "temp": r.temperature_celsius,
                                      "at": r.measured_at.isoformat(), "oor": r.is_out_of_range}
                                    for r in transporter_recs],
            "receiver_decision": {
                "decision": decision.decision if decision else None,
                "reason": decision.reason if decision else None,
                "decided_at": decision.decided_at.isoformat() if decision else None,
            },
            "audit_trail": [{"type": e.event_type, "role": e.actor_role,
                              "at": e.occurred_at.isoformat(), "desc": e.description}
                            for e in events],
            "data_disclaimer": (
                "DEMO DATA: Sensor records are SIMULATED and were not produced by a physical device. "
                "Blockchain commitments are marked is_demo=true and are not real on-chain transactions."
            ),
        }

        
        # Build a professional ColdChain Ledger PDF
        buffer = io.BytesIO()
        generated_at = report["report_generated_at"]
        report_id = f"CCL-{shipment_id}-{s.id}"

        navy = colors.HexColor("#163B65")
        teal = colors.HexColor("#0F9D91")
        light_blue = colors.HexColor("#EAF1F8")
        muted = colors.HexColor("#586779")

        styles = getSampleStyleSheet()
        styles.add(ParagraphStyle(
            name="CompanyTitle",
            parent=styles["Title"],
            textColor=navy,
            fontSize=22,
            leading=26,
            alignment=0,
            spaceAfter=4,
        ))
        styles.add(ParagraphStyle(
            name="SectionTitle",
            parent=styles["Heading2"],
            textColor=navy,
            fontSize=12,
            leading=15,
            spaceBefore=8,
            spaceAfter=7,
            keepWithNext=True,
        ))
        styles.add(ParagraphStyle(
            name="CellText",
            parent=styles["BodyText"],
            fontSize=7.5,
            leading=9,
            wordWrap="CJK",
        ))
        styles.add(ParagraphStyle(
            name="SmallText",
            parent=styles["BodyText"],
            fontSize=8,
            leading=11,
            textColor=muted,
        ))

        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=14 * mm,
            leftMargin=14 * mm,
            topMargin=20 * mm,
            bottomMargin=19 * mm,
            title=f"ColdChain Ledger Report - {shipment_id}",
            author="ColdChain Ledger",
        )

        story = []

        def heading(text):
            story.append(Paragraph(escape(str(text)), styles["SectionTitle"]))

        def make_table(rows, widths=None):
            if not rows:
                return

            col_count = max(len(row) for row in rows)
            page_width = A4[0] - 28 * mm

            if widths is None:
                widths = [page_width / col_count] * col_count

            formatted = []
            for row in rows:
                formatted_row = []
                for value in row:
                    value = "N/A" if value is None else str(value)
                    formatted_row.append(
                        Paragraph(escape(value), styles["CellText"])
                    )
                formatted.append(formatted_row)

            table = Table(
                formatted,
                colWidths=widths,
                repeatRows=1,
                hAlign="LEFT",
            )
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), navy),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D5DEE8")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1),
                 [colors.white, light_blue]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            story.append(table)
            story.append(Spacer(1, 5 * mm))

        def draw_footer(canvas, document):
            canvas.saveState()
            page_width, page_height = A4

            canvas.setStrokeColor(teal)
            canvas.setLineWidth(1.2)
            canvas.line(
                14 * mm, page_height - 13 * mm,
                page_width - 14 * mm, page_height - 13 * mm,
            )

            canvas.setFont("Helvetica-Bold", 8)
            canvas.setFillColor(navy)
            canvas.drawString(
                14 * mm, page_height - 10 * mm, "ColdChain Ledger"
            )

            canvas.setFont("Helvetica", 7)
            canvas.setFillColor(muted)
            canvas.drawString(
                14 * mm, 10 * mm, f"Report ID: {report_id}"
            )
            canvas.drawCentredString(
                page_width / 2, 10 * mm, f"Generated: {generated_at}"
            )
            canvas.drawRightString(
                page_width - 14 * mm, 10 * mm,
                f"Page {document.page}",
            )
            canvas.restoreState()

        # Company header
        story.append(Paragraph("ColdChain Ledger", styles["CompanyTitle"]))
        story.append(Paragraph(
            "TRANSPORT VERIFICATION REPORT",
            styles["Heading2"],
        ))
        story.append(Paragraph(
            f"Report ID: {escape(report_id)}",
            styles["SmallText"],
        ))
        story.append(Paragraph(
            f"Generated at: {escape(generated_at)}",
            styles["SmallText"],
        ))
        story.append(Spacer(1, 5 * mm))

        # 1. Shipment details
        heading("1. Shipment Details")
        sh = report["shipment"]
        make_table([
            ["Field", "Details"],
            ["Shipment ID", sh["shipment_id"]],
            ["Medicine", sh["medicine_name"]],
            ["Batch Number", sh["batch_number"]],
            ["Origin", sh["origin"]],
            ["Destination", sh["destination"]],
            ["Vehicle", sh["vehicle_registration"]],
            ["Allowed Temperature", 
             f'{sh["min_temp_celsius"]} to {sh["max_temp_celsius"]} °C'],
            ["Shipment Status", sh["status"]],
            ["Journey Started", sh["journey_started_at"]],
            ["Delivered At", sh["delivered_at"]],
        ], [45 * mm, 125 * mm])

        # 2. Recorded verification summary — do not infer a pass
        
        # 2. Verification Summary and Record Comparison
        heading("2. Verification Summary")
        summary = report["verification_summary"]

        if summary is not None:
            comparison = summary.get("record_comparison", {})
            excursion = summary.get("excursion_analysis", {})
            hash_chain = summary.get("hash_chain", {})
            signature = summary.get("signature", {})
            blockchain = summary.get("blockchain", {})

            integrity = summary.get("overall_integrity_status", "UNKNOWN")
            compliance = summary.get("overall_compliance_status", "UNKNOWN")
            action = summary.get("recommended_action", "UNKNOWN")

            # Summary status table: use recorded verification results.
            summary_rows = [
                ["Verification Check", "Recorded Result"],
                ["Overall Integrity", str(integrity)],
                ["Temperature Compliance", str(compliance)],
                ["Recommended Action", str(action)],
                ["Trusted Records", str(summary.get("trusted_record_count", 0))],
                ["Transporter Records", str(summary.get("transporter_record_count", 0))],
                ["Matched Records", str(comparison.get("matched_count", 0))],
                ["Mismatched Records", str(comparison.get("mismatch_count", 0))],
                ["Extra Transporter Records", str(comparison.get("extra_in_transporter", 0))],
                ["Missing Transporter Records", str(comparison.get("missing_in_transporter", 0))],
                ["Duplicate Transporter Timestamps",
                 str(len(summary.get("transport_sequence_analysis", {}).get("duplicate_timestamps", [])))],
                ["Hash Chain", str(hash_chain.get("status", "UNKNOWN"))],
                ["Digital Signature", str(signature.get("status", "UNKNOWN"))],
                ["Blockchain", str(blockchain.get("status", "UNKNOWN"))],
                ["Excursion Analysis", str(excursion.get("status", "UNKNOWN"))],
            ]

            make_table(summary_rows, [65 * mm, 105 * mm])

            # Color-coded integrity outcome. This reflects the saved result.
            if integrity == "VERIFIED":
                status_color = colors.HexColor("#DDF4E4")
            elif integrity in ("FAILED", "INVALID"):
                status_color = colors.HexColor("#FCE4E4")
            else:
                status_color = colors.HexColor("#FFF0CC")

            status_label = (
                f"Integrity: {integrity} | "
                f"Compliance: {compliance} | "
                f"Action: {action}"
            )
            status_box = Table(
                [[Paragraph(escape(status_label), styles["CellText"])]],
                colWidths=[170 * mm],
            )
            status_box.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), status_color),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#C6D0DC")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]))
            story.append(status_box)
            story.append(Spacer(1, 5 * mm))

            # Build comparison by sequence number from the actual report records.
            heading("Record-by-Record Comparison")

            trusted_by_seq = {
                int(r["seq"]): r for r in report["trusted_records"]
            }
            transporter_by_seq = {
                int(r["seq"]): r for r in report["transporter_records"]
            }

            all_sequences = sorted(
                set(trusted_by_seq) | set(transporter_by_seq)
            )

            comparison_rows = [[
                "Seq.",
                "Trusted °C",
                "Transporter °C",
                "Difference °C",
                "Result",
            ]]

            for seq in all_sequences:
                trusted = trusted_by_seq.get(seq)
                transporter = transporter_by_seq.get(seq)

                trusted_temp = trusted.get("temp") if trusted else None
                transporter_temp = transporter.get("temp") if transporter else None

                if trusted is None:
                    result_label = "EXTRA TRANSPORTER"
                    difference = "N/A"
                elif transporter is None:
                    result_label = "MISSING TRANSPORTER"
                    difference = "N/A"
                else:
                    difference_value = float(transporter_temp) - float(trusted_temp)
                    difference = f"{difference_value:+.2f}"

                    trusted_time = trusted.get("at")
                    transporter_time = transporter.get("at")

                    if (
                        abs(difference_value) < 1e-6
                        and trusted_time == transporter_time
                    ):
                        result_label = "MATCH"
                    else:
                        result_label = "MISMATCH"

                comparison_rows.append([
                    str(seq),
                    f"{trusted_temp:.2f}" if trusted_temp is not None else "N/A",
                    f"{transporter_temp:.2f}" if transporter_temp is not None else "N/A",
                    difference,
                    result_label,
                ])

            make_table(
                comparison_rows,
                [17 * mm, 31 * mm, 35 * mm, 32 * mm, 55 * mm],
            )

            # Explain the mismatch details recorded by the verification engine.
            mismatches = comparison.get("mismatches", [])
            if mismatches:
                heading("Recorded Discrepancies")
                discrepancy_rows = [[
                    "Sequence",
                    "Trusted °C",
                    "Transporter °C",
                    "Difference °C",
                ]]
                for item in mismatches:
                    discrepancy_rows.append([
                        str(item.get("sequence_number", "N/A")),
                        str(item.get("trusted_temp", "N/A")),
                        str(item.get("transporter_temp", "N/A")),
                        str(item.get("difference", "N/A")),
                    ])
                make_table(
                    discrepancy_rows,
                    [30 * mm, 40 * mm, 45 * mm, 55 * mm],
                )

            # Surface duplicate timestamps from the recorded analysis.
            duplicate_times = (
                summary.get("transport_sequence_analysis", {})
                .get("duplicate_timestamps", [])
            )
            if duplicate_times:
                heading("Duplicate Timestamp Warnings")
                for timestamp in duplicate_times:
                    story.append(Paragraph(
                        escape(str(timestamp)),
                        styles["CellText"],
                    ))
                story.append(Spacer(1, 4 * mm))

        else:
            story.append(Paragraph(
                "No verification run is recorded for this shipment.",
                styles["BodyText"],
            ))

        story.append(Spacer(1, 5 * mm))

        # 3. Temperature chart from actual records
        heading("3. Temperature Comparison")

        chart_buffer = io.BytesIO()
        fig, ax = plt.subplots(figsize=(8.0, 3.2))

        trusted_times = [r.measured_at for r in trusted_recs]
        trusted_temps = [r.temperature_celsius for r in trusted_recs]
        transporter_times = [r.measured_at for r in transporter_recs]
        transporter_temps = [r.temperature_celsius for r in transporter_recs]

        if trusted_times:
            ax.plot(
                trusted_times, trusted_temps,
                marker="o", markersize=3, linewidth=1.5,
                label="Trusted sensor",
            )
        if transporter_times:
            ax.plot(
                transporter_times, transporter_temps,
                marker="x", markersize=3, linewidth=1.2,
                linestyle="--", label="Transporter",
            )

        minimum = sh["min_temp_celsius"]
        maximum = sh["max_temp_celsius"]
        ax.axhspan(minimum, maximum, alpha=0.12, color="green",
                   label="Permitted range")
        ax.axhline(minimum, linewidth=0.8, linestyle=":", color="green")
        ax.axhline(maximum, linewidth=0.8, linestyle=":", color="green")

        ax.set_ylabel("Temperature (°C)")
        ax.set_xlabel("Measurement time")
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%m-%d %H:%M"))
        fig.autofmt_xdate()
        ax.grid(True, alpha=0.25)
        ax.legend(fontsize=7, loc="best")
        fig.tight_layout()
        fig.savefig(chart_buffer, format="png", dpi=160, bbox_inches="tight")
        plt.close(fig)
        chart_buffer.seek(0)

        if trusted_times or transporter_times:
            story.append(PDFImage(chart_buffer, width=170 * mm, height=68 * mm))
        else:
            story.append(Paragraph(
                "No temperature readings are available to plot.",
                styles["BodyText"],
            ))
        story.append(Spacer(1, 5 * mm))

        # 4. Trusted sensor evidence
        heading("4. Trusted Sensor Records")
        trusted_rows = [[
            "Sequence", "Temp (°C)", "Measured At", "Source", "Record Hash"
        ]]
        for r in trusted_recs:
            trusted_rows.append([
                r.sequence_number,
                r.temperature_celsius,
                r.measured_at.isoformat() if r.measured_at else "N/A",
                r.data_source,
                r.record_hash or "N/A",
            ])
        make_table(
            trusted_rows,
            [18 * mm, 22 * mm, 48 * mm, 28 * mm, 54 * mm],
        )

        # 5. Transporter evidence
        heading("5. Transporter Readings")
        transporter_rows = [[
            "Sequence", "Temp (°C)", "Measured At", "Out of Range"
        ]]
        for r in transporter_recs:
            transporter_rows.append([
                r.sequence_number,
                r.temperature_celsius,
                r.measured_at.isoformat() if r.measured_at else "N/A",
                "Yes" if r.is_out_of_range else "No",
            ])
        make_table(
            transporter_rows,
            [25 * mm, 30 * mm, 78 * mm, 37 * mm],
        )

        # 6. Receiver decision
        heading("6. Receiver Decision")
        decision = report["receiver_decision"]
        make_table([
            ["Field", "Recorded Value"],
            ["Decision", decision["decision"]],
            ["Reason", decision["reason"]],
            ["Decision Time", decision["decided_at"]],
        ], [45 * mm, 125 * mm])

        # 7. Audit trail
        heading("7. Audit Trail")
        audit_rows = [["Event", "Role", "Timestamp", "Description"]]
        for event in report["audit_trail"]:
            audit_rows.append([
                event["type"], event["role"], event["at"], event["desc"]
            ])
        make_table(
            audit_rows,
            [15 * mm, 20 * mm, 42 * mm, 25 * mm, 68 * mm],
        )

        # 8. Data disclaimer
        heading("8. Data Disclaimer")
        story.append(Paragraph(
            escape(report["data_disclaimer"]),
            styles["BodyText"],
        ))

        doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
        buffer.seek(0)
        return buffer.getvalue(), report, None
    except Exception as exc:
        return None, None, f"Failed to generate report PDF: {str(exc)}"


@verification_bp.route("/reports/<string:shipment_id>", methods=["GET"])
@require_role(UserRole.RECEIVER.value, UserRole.ADMIN.value)
def download_report(shipment_id):
    """Generate and download verification report as PDF."""
    session = get_session()
    try:
        pdf_bytes, report, error = build_pdf_report_bytes(session, shipment_id)
        if error:
            return jsonify({"error": error}), 404

        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={
                "Content-Disposition":
                    f'attachment; filename="coldchain_report_{shipment_id}.pdf"'
            },
        )
    finally:
        session.close()


@verification_bp.route("/reports/<string:shipment_id>/email", methods=["POST"])
@require_role(UserRole.RECEIVER.value, UserRole.ADMIN.value)
def email_report(shipment_id):
    """
    Email the verification report PDF as an attachment to a validated recipient address.
    Authenticates through role permissions, validates email format, and checks SMTP delivery.
    """
    from ..services.email_service import is_valid_email, send_report_email

    data = request.get_json() or {}
    recipient = (data.get("email") or "").strip()
    notes = data.get("notes", "")

    if not recipient:
        return jsonify({
            "success": False,
            "error": "Recipient email address is required.",
            "code": "MISSING_EMAIL"
        }), 400

    if not is_valid_email(recipient):
        return jsonify({
            "success": False,
            "error": f"Invalid recipient email format: '{recipient}'",
            "code": "INVALID_EMAIL"
        }), 400

    session = get_session()
    try:
        pdf_bytes, report, error = build_pdf_report_bytes(session, shipment_id)
        if error:
            return jsonify({"success": False, "error": error}), 404

        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        shipment_info = {
            "medicine_name": s.medicine_name,
            "batch_number": s.batch_number,
            "status": s.status
        }

        result = send_report_email(
            recipient_email=recipient,
            shipment_id=shipment_id,
            pdf_bytes=pdf_bytes,
            shipment_info=shipment_info,
            notes=notes
        )

        if not result["success"]:
            code = result.get("code")
            status_code = 400 if code in ("INVALID_EMAIL", "SMTP_NOT_CONFIGURED") else 502
            return jsonify(result), status_code

        # Record audit event on verified send
        actor = get_jwt_identity()
        claims = get_jwt()
        event = AuditEvent(
            shipment_id_fk=s.id,
            event_type="REPORT_EMAILED",
            actor_id=str(actor) if actor else "system",
            actor_role=claims.get("role", "RECEIVER"),
            occurred_at=datetime.now(timezone.utc),
            outcome="SUCCESS",
            description=f"Verification report PDF emailed to {recipient}."
        )
        session.add(event)
        session.commit()

        return jsonify({
            "success": True,
            "message": result["message"],
            "recipient": recipient
        }), 200
    finally:
        session.close()


@verification_bp.route("/reports/<string:shipment_id>/share-token", methods=["POST"])
@require_role(UserRole.RECEIVER.value, UserRole.ADMIN.value)
def generate_share_token(shipment_id):
    """
    Generate an unguessable, cryptographically signed, time-limited token for sharing the report.
    Valid for 24 hours. Does not expose user secrets or predictability.
    """
    from itsdangerous import URLSafeTimedSerializer
    from flask import current_app

    session = get_session()
    try:
        s = session.query(Shipment).filter_by(shipment_id=shipment_id).first()
        if not s:
            return jsonify({"error": "Shipment not found."}), 404

        secret = current_app.config.get("SECRET_KEY", "coldchain-ledger-secret")
        serializer = URLSafeTimedSerializer(secret, salt="coldchain-share-salt")
        token = serializer.dumps({
            "shipment_id": shipment_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

        return jsonify({
            "success": True,
            "token": token,
            "shipment_id": shipment_id,
            "expires_in_seconds": 86400,
            "share_path": f"/api/public/reports/{token}"
        }), 200
    finally:
        session.close()


@verification_bp.route("/public/reports/<string:token>", methods=["GET"])
def public_view_report(token):
    """
    Publicly accessible report download using an unguessable signed token.
    Validates token signature and 24-hour expiration.
    Returns authentic ReportLab PDF with verification findings.
    """
    from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadSignature
    from flask import current_app

    secret = current_app.config.get("SECRET_KEY", "coldchain-ledger-secret")
    serializer = URLSafeTimedSerializer(secret, salt="coldchain-share-salt")

    try:
        data = serializer.loads(token, max_age=86400)
        shipment_id = data.get("shipment_id")
    except SignatureExpired:
        return jsonify({
            "error": "This report link has expired (24h limit). Please request a fresh share link.",
            "code": "LINK_EXPIRED"
        }), 410
    except BadSignature:
        return jsonify({
            "error": "Invalid or tampered report access token.",
            "code": "INVALID_TOKEN"
        }), 403

    session = get_session()
    try:
        pdf_bytes, report, error = build_pdf_report_bytes(session, shipment_id)
        if error:
            return jsonify({"error": error}), 404

        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="coldchain_report_{shipment_id}.pdf"',
                "Cache-Control": "private, max-age=3600"
            },
        )
    finally:
        session.close()

