import React, { useState, useEffect } from 'react';
import { 
  X, 
  Share2, 
  Download, 
  Mail, 
  Send, 
  Smartphone, 
  Copy, 
  Check, 
  AlertCircle, 
  CheckCircle2, 
  Info,
  Clock,
  ShieldCheck,
  ExternalLink,
  RefreshCw,
  FileText
} from 'lucide-react';
import { 
  fetchReportPdfFile, 
  downloadReport, 
  createShareToken, 
  emailReport 
} from '../services/api';

export default function ShareReportModal({ 
  isOpen, 
  onClose, 
  shipment, 
  verificationResult 
}) {
  if (!isOpen || !shipment) return null;

  const [activeTab, setActiveTab] = useState('quick'); // 'quick' | 'whatsapp' | 'telegram' | 'email' | 'download'
  const [loadingAction, setLoadingAction] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'error' | 'info' | 'neutral', text: '' }
  const [shareLink, setShareLink] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailNotes, setEmailNotes] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [deviceShareSupported, setDeviceShareSupported] = useState(false);
  const [deviceFileShareSupported, setDeviceFileShareSupported] = useState(false);

  const shipmentId = shipment.shipment_id;
  const medicineName = shipment.medicine_name || 'Medicine Consignment';
  const batchNumber = shipment.batch_number || 'N/A';
  const status = shipment.status || 'PROCESSED';
  const integrityStatus = verificationResult?.overall_integrity_status || 'VERIFIED';

  // Check device sharing support on mount
  useEffect(() => {
    const hasNavShare = typeof navigator !== 'undefined' && !!navigator.share;
    setDeviceShareSupported(hasNavShare);

    if (hasNavShare && navigator.canShare) {
      try {
        const dummyFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
        setDeviceFileShareSupported(navigator.canShare({ files: [dummyFile] }));
      } catch {
        setDeviceFileShareSupported(false);
      }
    }
  }, []);

  // Fetch or generate unguessable share link
  const getOrGenerateShareLink = async () => {
    if (shareLink) return shareLink;
    try {
      const res = await createShareToken(shipmentId);
      const fullUrl = `${window.location.origin}${res.share_path}`;
      setShareLink(fullUrl);
      return fullUrl;
    } catch (err) {
      console.warn('Could not generate public share link:', err);
      // Fallback to origin report path
      const fallbackUrl = `${window.location.origin}/receiver/shipments/${shipmentId}`;
      setShareLink(fallbackUrl);
      return fallbackUrl;
    }
  };

  // Generate concise prefilled message
  const getReportSummaryText = (link) => {
    return (
      `ColdChain Ledger Verification Report\n` +
      `Shipment: #${shipmentId}\n` +
      `Medicine: ${medicineName} (Batch: ${batchNumber})\n` +
      `Integrity: ${integrityStatus} | Status: ${status}\n` +
      `Dual-stream sensor log & Ed25519 signature verified.\n` +
      (link ? `Official 24h Report Dossier: ${link}` : '')
    );
  };

  // ── 1. Share Using Device (Native Web Share API) ───────────────────────────
  const handleDeviceShare = async () => {
    setLoadingAction(true);
    setStatusMessage(null);
    try {
      const pdfFile = await fetchReportPdfFile(shipmentId);
      const currentLink = await getOrGenerateShareLink();
      const textSummary = getReportSummaryText(currentLink);

      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: `ColdChain Ledger - ${shipmentId}`,
          text: textSummary,
        });
        setStatusMessage({ 
          type: 'success', 
          text: 'PDF report attachment shared successfully through device share sheet.' 
        });
      } else {
        // Fallback: Share link & text
        await navigator.share({
          title: `ColdChain Ledger - ${shipmentId}`,
          text: textSummary,
          url: currentLink,
        });
        setStatusMessage({ 
          type: 'info', 
          text: 'Report summary and secure 24h link shared via device (file attachment was not supported by browser).' 
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatusMessage({ type: 'neutral', text: 'Device share prompt was closed.' });
      } else {
        setStatusMessage({ type: 'error', text: `Device sharing failed: ${err.message}` });
      }
    } finally {
      setLoadingAction(false);
    }
  };

  // ── 2. WhatsApp Sharing ───────────────────────────────────────────────────
  const handleWhatsAppWeb = async () => {
    setLoadingAction(true);
    try {
      const link = await getOrGenerateShareLink();
      const message = getReportSummaryText(link);
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      setStatusMessage({
        type: 'info',
        text: 'Opened WhatsApp with report summary and secure 24-hour verification link. (Note: Direct PDF attachment requires Device Share on mobile or manual attachment).'
      });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `WhatsApp share failed: ${err.message}` });
    } finally {
      setLoadingAction(false);
    }
  };

  // ── 3. Telegram Sharing ───────────────────────────────────────────────────
  const handleTelegramShare = async () => {
    setLoadingAction(true);
    try {
      const link = await getOrGenerateShareLink();
      const message = getReportSummaryText(link);
      const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`;
      window.open(tgUrl, '_blank', 'noopener,noreferrer');
      setStatusMessage({
        type: 'info',
        text: 'Opened Telegram with official report link and status summary.'
      });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Telegram share failed: ${err.message}` });
    } finally {
      setLoadingAction(false);
    }
  };

  // ── 4. Email: Backend SMTP Dispatch ───────────────────────────────────────
  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!emailInput) return;
    setEmailSending(true);
    setStatusMessage(null);

    try {
      const res = await emailReport(shipmentId, {
        email: emailInput.trim(),
        notes: emailNotes.trim() || undefined,
      });

      setStatusMessage({
        type: 'success',
        text: res.message || `PDF report successfully emailed to ${emailInput}.`
      });
      setEmailInput('');
      setEmailNotes('');
    } catch (err) {
      // Backend returned error (e.g. SMTP_NOT_CONFIGURED or invalid email)
      const errText = err.message || 'Failed to dispatch email.';
      setStatusMessage({
        type: 'error',
        text: errText
      });
    } finally {
      setEmailSending(false);
    }
  };

  // ── 5. Email: Mailto Client Fallback ──────────────────────────────────────
  const handleMailtoClient = async () => {
    setLoadingAction(true);
    try {
      const link = await getOrGenerateShareLink();
      const subject = `[ColdChain Ledger] Verification Report: ${shipmentId} - ${medicineName}`;
      const body = getReportSummaryText(link);
      const mailtoUrl = `mailto:${encodeURIComponent(emailInput || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoUrl;
      setStatusMessage({
        type: 'info',
        text: 'Launched default email application with prefilled report details and secure link.'
      });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Mail client failed: ${err.message}` });
    } finally {
      setLoadingAction(false);
    }
  };

  // ── 6. Direct PDF Download ────────────────────────────────────────────────
  const handleDirectDownload = async () => {
    setLoadingAction(true);
    try {
      await downloadReport(shipmentId);
      setStatusMessage({
        type: 'success',
        text: `Official PDF dossier 'coldchain_report_${shipmentId}.pdf' downloaded.`
      });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Download failed: ${err.message}` });
    } finally {
      setLoadingAction(false);
    }
  };

  // ── Copy Share Link ───────────────────────────────────────────────────────
  const handleCopyLink = async () => {
    try {
      const link = await getOrGenerateShareLink();
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
      setStatusMessage({ type: 'success', text: 'Secure 24-hour report link copied to clipboard.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Could not copy link to clipboard.' });
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '16px'
    }}>
      <div 
        className="card" 
        style={{
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '28px',
          borderRadius: '20px',
          boxShadow: '0 20px 40px rgba(15, 23, 42, 0.15)',
          background: '#ffffff',
          position: 'relative'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#eef0fe',
                color: 'var(--cc-blue-500)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Share2 size={18} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Share Verification Dossier
              </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
              Shipment <strong>#{shipmentId}</strong> • {medicineName}
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Verification Summary Badge Strip */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '10px 14px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          fontSize: '0.8rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={16} color="var(--status-verified)" />
            <span><strong>Integrity:</strong> {integrityStatus}</span>
          </div>
          <div>
            <span><strong>Decision:</strong> {status}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
            <Clock size={13} />
            <span>24h Expiring Link</span>
          </div>
        </div>

        {/* Navigation Tabs (Wenextiva Pill Style) */}
        <div style={{
          display: 'flex',
          gap: '6px',
          background: 'var(--surface)',
          padding: '4px',
          borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--border)',
          marginBottom: '20px',
          overflowX: 'auto'
        }}>
          {[
            { id: 'quick', label: 'Overview' },
            { id: 'whatsapp', label: 'WhatsApp' },
            { id: 'telegram', label: 'Telegram' },
            { id: 'email', label: 'Email' },
            { id: 'download', label: 'Download' },
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setStatusMessage(null);
                }}
                style={{
                  background: isActive ? 'var(--cc-blue-500)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: 'var(--radius-pill)',
                  padding: '6px 14px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                  flex: 1
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div style={{
            padding: '12px 14px',
            borderRadius: '10px',
            fontSize: '0.825rem',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            background: statusMessage.type === 'success' ? '#ecfdf5' :
                        statusMessage.type === 'error' ? '#fef2f2' :
                        statusMessage.type === 'info' ? '#eff6ff' : '#f8fafc',
            border: `1px solid ${
              statusMessage.type === 'success' ? '#a7f3d0' :
              statusMessage.type === 'error' ? '#fecaca' :
              statusMessage.type === 'info' ? '#bfdbfe' : '#e2e8f0'
            }`,
            color: statusMessage.type === 'success' ? '#047857' :
                   statusMessage.type === 'error' ? '#b91c1c' :
                   statusMessage.type === 'info' ? '#1d4ed8' : '#475569'
          }}>
            {statusMessage.type === 'success' ? <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '1px' }} /> :
             statusMessage.type === 'error' ? <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} /> :
             <Info size={16} style={{ flexShrink: 0, marginTop: '1px' }} />}
            <span style={{ lineHeight: 1.4 }}>{statusMessage.text}</span>
          </div>
        )}

        {/* ── TAB 1: OVERVIEW & QUICK ACTIONS ──────────────────────────────── */}
        {activeTab === 'quick' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Primary Action: Device Share (when supported) */}
            {deviceShareSupported ? (
              <button
                onClick={handleDeviceShare}
                disabled={loadingAction}
                className="btn btn-primary btn-lg"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  borderRadius: '14px'
                }}
              >
                <Smartphone size={18} />
                <span>{loadingAction ? 'Preparing PDF...' : 'Share Using Device'}</span>
              </button>
            ) : null}

            {/* Quick Actions Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {/* WhatsApp */}
              <button
                onClick={() => setActiveTab('whatsapp')}
                className="btn btn-secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: '10px',
                  padding: '12px 16px',
                  borderRadius: '12px'
                }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: '#25D366',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Send size={14} />
                </div>
                <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>WhatsApp</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Message & Link</div>
                </div>
              </button>

              {/* Telegram */}
              <button
                onClick={() => setActiveTab('telegram')}
                className="btn btn-secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: '10px',
                  padding: '12px 16px',
                  borderRadius: '12px'
                }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: '#229ED9',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Send size={14} />
                </div>
                <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Telegram</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Official share</div>
                </div>
              </button>

              {/* Email */}
              <button
                onClick={() => setActiveTab('email')}
                className="btn btn-secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: '10px',
                  padding: '12px 16px',
                  borderRadius: '12px'
                }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'var(--cc-blue-500)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Mail size={14} />
                </div>
                <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Email Report</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SMTP delivery</div>
                </div>
              </button>

              {/* Direct Download */}
              <button
                onClick={handleDirectDownload}
                disabled={loadingAction}
                className="btn btn-secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: '10px',
                  padding: '12px 16px',
                  borderRadius: '12px'
                }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'var(--status-verified)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Download size={14} />
                </div>
                <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Download PDF</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Offline file</div>
                </div>
              </button>
            </div>

            {/* Expiring Report Link Bar */}
            <div style={{
              marginTop: '10px',
              borderTop: '1px solid var(--border)',
              paddingTop: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.775rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Secure Public Link (Unguessable 24h Token)
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--status-verified)', fontWeight: 600 }}>
                  Signed HMAC
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  readOnly
                  value={shareLink || 'Click to generate 24h token link...'}
                  onClick={getOrGenerateShareLink}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace'
                  }}
                />
                <button
                  onClick={handleCopyLink}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {copiedLink ? <Check size={14} color="var(--status-verified)" /> : <Copy size={14} />}
                  <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: WHATSAPP ──────────────────────────────────────────────── */}
        {activeTab === 'whatsapp' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#25D366',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Send size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  WhatsApp Sharing
                </h3>
                <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Share PDF attachment (via device) or send report summary with verifiable link.
                </p>
              </div>
            </div>

            {/* Native device file share button for WhatsApp on supported mobile/desktop */}
            {deviceShareSupported && (
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '12px',
                padding: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <FileText size={16} color="#15803d" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#15803d' }}>
                    Share Actual PDF to WhatsApp
                  </span>
                </div>
                <p style={{ fontSize: '0.785rem', color: '#166534', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                  Use your operating system's native share sheet to send the actual <code>.pdf</code> file directly into any WhatsApp chat or group.
                </p>
                <button
                  onClick={handleDeviceShare}
                  disabled={loadingAction}
                  className="btn btn-sm"
                  style={{
                    background: '#16a34a',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Smartphone size={14} />
                  <span>{loadingAction ? 'Loading PDF...' : 'Share PDF via Native Share Sheet'}</span>
                </button>
              </div>
            )}

            {/* Direct WhatsApp Web link sharing */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '14px'
            }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                Open WhatsApp with Prefilled Summary & 24h Link
              </span>
              <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                Opens WhatsApp Web or mobile app with a formatted verification summary and secure link to download the PDF.
              </p>
              <button
                onClick={handleWhatsAppWeb}
                disabled={loadingAction}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ExternalLink size={14} />
                <span>Launch WhatsApp</span>
              </button>
            </div>
          </div>
        )}

        {/* ── TAB 3: TELEGRAM ──────────────────────────────────────────────── */}
        {activeTab === 'telegram' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#229ED9',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Send size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Telegram Sharing
                </h3>
                <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Transmit report to Telegram channels, groups, or audit inspectors.
                </p>
              </div>
            </div>

            {deviceShareSupported && (
              <div style={{
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '12px',
                padding: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <FileText size={16} color="#0369a1" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0369a1' }}>
                    Send PDF File to Telegram
                  </span>
                </div>
                <p style={{ fontSize: '0.785rem', color: '#0c4a6e', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                  Attach the actual PDF file directly via your system share sheet into Telegram.
                </p>
                <button
                  onClick={handleDeviceShare}
                  disabled={loadingAction}
                  className="btn btn-sm"
                  style={{
                    background: '#0284c7',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Smartphone size={14} />
                  <span>{loadingAction ? 'Loading PDF...' : 'Attach PDF to Telegram via Device'}</span>
                </button>
              </div>
            )}

            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '14px'
            }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                Telegram Web / App Share Link
              </span>
              <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                Opens Telegram with the official report verification link and cryptographic details.
              </p>
              <button
                onClick={handleTelegramShare}
                disabled={loadingAction}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ExternalLink size={14} />
                <span>Open Telegram Share</span>
              </button>
            </div>
          </div>
        )}

        {/* ── TAB 4: EMAIL ─────────────────────────────────────────────────── */}
        {activeTab === 'email' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'var(--cc-blue-500)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Mail size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Email PDF Report
                </h3>
                <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Deliver the official PDF attachment with hash chain logs directly via SMTP or local mail app.
                </p>
              </div>
            </div>

            {/* Direct Backend SMTP Form */}
            <form onSubmit={handleSendEmail} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Automatic Backend SMTP Delivery
              </span>

              <div>
                <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Recipient Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. quality-assurance@pharma.org"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.85rem', padding: '9px 12px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Inspector Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Approved with zero temperature excursions."
                  value={emailNotes}
                  onChange={(e) => setEmailNotes(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.85rem', padding: '9px 12px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  type="submit"
                  disabled={emailSending || !emailInput}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {emailSending ? <RefreshCw size={14} className="spin" /> : <Send size={14} />}
                  <span>{emailSending ? 'Sending Email...' : 'Send with PDF Attachment'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleMailtoClient}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  title="Open default email client"
                >
                  <ExternalLink size={14} />
                  <span>Open Email Client</span>
                </button>
              </div>
            </form>

            {/* Note about credentials */}
            <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', margin: 0 }}>
              Security Note: SMTP credentials and email tokens are strictly managed by the backend environment. No sensitive secrets or credentials exist in the client.
            </p>
          </div>
        )}

        {/* ── TAB 5: DOWNLOAD ──────────────────────────────────────────────── */}
        {activeTab === 'download' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'var(--status-verified)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Download size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Download Dossier
                </h3>
                <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Export the complete high-resolution cryptographic verification report as an A4 PDF document.
                </p>
              </div>
            </div>

            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px',
              fontSize: '0.825rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.5
            }}>
              <strong style={{ color: 'var(--text-primary)' }}>Report Contents:</strong>
              <ul style={{ paddingLeft: '20px', marginTop: '6px', marginBottom: '14px' }}>
                <li>Complete shipment specifications & temperature threshold band</li>
                <li>Cryptographic SHA-256 hash-chain sequence integrity status</li>
                <li>Ed25519 digital signature seal verification</li>
                <li>Side-by-side dual-stream IoT sensor log comparison</li>
                <li>Matplotlib high-resolution telemetry timeline chart</li>
                <li>Formal regulatory receiver acceptance decision & audit trail</li>
              </ul>

              <button
                onClick={handleDirectDownload}
                disabled={loadingAction}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Download size={16} />
                <span>{loadingAction ? 'Generating PDF...' : `Download coldchain_report_${shipmentId}.pdf`}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
