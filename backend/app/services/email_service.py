"""
ColdChain Ledger — Email Service
Provides automated, secure email delivery of PDF verification reports via SMTP.
Credentials and configuration are loaded strictly from environment variables.
"""

import os
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


def is_valid_email(email: str) -> bool:
    """Validate email address format."""
    if not email or not isinstance(email, str):
        return False
    return bool(EMAIL_REGEX.match(email.strip()))


def is_smtp_configured() -> bool:
    """Check if SMTP credentials / host are configured."""
    return bool(os.environ.get("SMTP_HOST"))


def send_report_email(
    recipient_email: str,
    shipment_id: str,
    pdf_bytes: bytes,
    shipment_info: dict = None,
    notes: str = None
) -> dict:
    """
    Send verification report PDF as an email attachment.
    Returns dict with success (bool), message (str), and optional error/code.
    """
    cleaned_email = (recipient_email or "").strip()
    if not is_valid_email(cleaned_email):
        return {
            "success": False,
            "error": f"Invalid recipient email address format: '{recipient_email}'",
            "code": "INVALID_EMAIL"
        }

    smtp_host = os.environ.get("SMTP_HOST")
    if not smtp_host:
        return {
            "success": False,
            "error": "SMTP server not configured on the backend. Please configure SMTP_HOST, SMTP_PORT, and credentials in the environment.",
            "code": "SMTP_NOT_CONFIGURED"
        }

    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_password = os.environ.get("SMTP_PASSWORD", "")
    smtp_from = os.environ.get("SMTP_FROM") or smtp_user or "no-reply@coldchainledger.internal"
    use_tls = os.environ.get("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
    use_ssl = os.environ.get("SMTP_USE_SSL", "false").lower() in ("true", "1", "yes")

    # Build email message
    msg = MIMEMultipart()
    msg["From"] = smtp_from
    msg["To"] = cleaned_email
    msg["Subject"] = f"[ColdChain Ledger] Verification Report — {shipment_id}"

    medicine = shipment_info.get("medicine_name", "Pharmaceutical Consignment") if shipment_info else "Pharmaceutical Consignment"
    batch = shipment_info.get("batch_number", "N/A") if shipment_info else "N/A"
    status = shipment_info.get("status", "N/A") if shipment_info else "N/A"

    body_text = f"""ColdChain Ledger — Tamper-Evident Transport Verification Report

Shipment ID : {shipment_id}
Medicine    : {medicine}
Batch Number: {batch}
Status      : {status}

The complete cryptographic verification report and sensor audit dossier is attached to this email as a PDF document.

{f'Inspector Notes: {notes.strip()}' if notes else ''}

Notice: This report contains dual-stream IoT sensor logs verified with SHA-256 hash chains and Ed25519 digital signatures.
"""

    msg.attach(MIMEText(body_text, "plain", "utf-8"))

    # Attach PDF
    pdf_attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    pdf_attachment.add_header(
        "Content-Disposition",
        "attachment",
        filename=f"coldchain_report_{shipment_id}.pdf"
    )
    msg.attach(pdf_attachment)

    # Dispatch via SMTP
    try:
        if use_ssl:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
            if use_tls:
                server.starttls()

        if smtp_user and smtp_password:
            server.login(smtp_user, smtp_password)

        server.sendmail(smtp_from, [cleaned_email], msg.as_string())
        server.quit()

        return {
            "success": True,
            "message": f"Report successfully dispatched to {cleaned_email}."
        }
    except smtplib.SMTPAuthenticationError as auth_err:
        return {
            "success": False,
            "error": f"SMTP Authentication failed: {str(auth_err)}",
            "code": "SMTP_AUTH_ERROR"
        }
    except smtplib.SMTPConnectError as conn_err:
        return {
            "success": False,
            "error": f"Could not connect to SMTP server at {smtp_host}:{smtp_port}: {str(conn_err)}",
            "code": "SMTP_CONNECT_ERROR"
        }
    except Exception as exc:
        return {
            "success": False,
            "error": f"Failed to send email: {str(exc)}",
            "code": "SMTP_SEND_FAILED"
        }
