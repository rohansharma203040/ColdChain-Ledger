import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ClipboardCheck, 
  ArrowLeft, 
  RefreshCw, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  Lock, 
  Database, 
  FileText, 
  Download, 
  UploadCloud,
  Thermometer,
  Share2
} from 'lucide-react';
import { 
  getShipment, 
  getReadings, 
  getTrustedData, 
  runVerification, 
  runOfflineVerification,
  recordDecision, 
  getDecision,
  downloadReport 
} from '../../services/api';
import ShareReportModal from '../../components/ShareReportModal';

export default function ReceiverShipmentDetail() {
  const { shipmentId } = useParams();
  const [shipment, setShipment] = useState(null);
  const [trustedData, setTrustedData] = useState(null);
  const [transporterReadings, setTransporterReadings] = useState([]);
  const [verificationResult, setVerificationResult] = useState(null);
  const [existingDecision, setExistingDecision] = useState(null);

  // Decision form
  const [decisionChoice, setDecisionChoice] = useState('APPROVE');
  const [decisionReason, setDecisionReason] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Offline modal
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [offlineJson, setOfflineJson] = useState('');

  // Share modal
  const [showShareModal, setShowShareModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [sData, tData, rData, dData] = await Promise.all([
        getShipment(shipmentId),
        getTrustedData(shipmentId).catch(() => null),
        getReadings(shipmentId).catch(() => []),
        getDecision(shipmentId).catch(() => null),
      ]);

      setShipment(sData);
      setTrustedData(tData);
      setTransporterReadings(rData);
      if (dData && dData.decision) {
        setExistingDecision(dData);
        setDecisionChoice(dData.decision);
        setDecisionReason(dData.reason || '');
      }
    } catch (err) {
      setError(err.message || 'Failed to load consignment data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [shipmentId]);

  const handleRunVerification = async () => {
    setVerifying(true);
    setError('');
    setMessage('');
    try {
      const res = await runVerification(shipmentId);
      setVerificationResult(res);
      setMessage('Cryptographic multi-point verification completed.');
      // Auto-select recommended decision
      if (res.recommended_action === 'APPROVE') setDecisionChoice('APPROVE');
      else if (res.recommended_action === 'REJECT') setDecisionChoice('REJECT');
      else if (res.recommended_action === 'HOLD_FOR_INVESTIGATION') setDecisionChoice('HOLD');
    } catch (err) {
      setError(err.message || 'Verification execution failed.');
    } finally {
      setVerifying(false);
    }
  };

  const handleOfflineVerification = async (e) => {
    e.preventDefault();
    setVerifying(true);
    setError('');
    try {
      const parsed = JSON.parse(offlineJson);
      const res = await runOfflineVerification(shipmentId, parsed);
      setVerificationResult(res);
      setShowOfflineModal(false);
      setMessage('Offline air-gapped verification executed successfully.');
    } catch (err) {
      setError(`Offline verification error: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmitDecision = async (e) => {
    e.preventDefault();
    if ((decisionChoice === 'REJECT' || decisionChoice === 'HOLD') && !decisionReason.trim()) {
      setError('A documented regulatory reason is required when rejecting or holding a shipment.');
      return;
    }

    setSubmittingDecision(true);
    setError('');
    setMessage('');
    try {
      await recordDecision(shipmentId, decisionChoice, decisionReason.trim());
      setMessage(`Formal decision recorded: Consignment marked as ${decisionChoice}.`);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to submit decision.');
    } finally {
      setSubmittingDecision(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '80px 20px' }}>
        <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px', color: 'var(--cc-teal-400)' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading consignment verification portal...</p>
      </div>
    );
  }

  if (error && !shipment) {
    return (
      <div className="page-container">
        <Link to="/receiver" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
          <ArrowLeft size={16} />
          <span>Back to Consignments</span>
        </Link>
        <div style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', color: '#ef4444' }}>
          {error}
        </div>
      </div>
    );
  }

  // Build telemetry comparison rows
  const trustedList = trustedData?.records || [];
  const transporterMap = {};
  transporterReadings.forEach(r => { transporterMap[r.sequence_number] = r; });
  const trustedMap = {};
  trustedList.forEach(r => { trustedMap[r.sequence_number] = r; });

  const allSeqNumbers = Array.from(new Set([
    ...trustedList.map(r => r.sequence_number),
    ...transporterReadings.map(r => r.sequence_number)
  ])).sort((a, b) => a - b);

  return (
    <div className="page-container">
      {/* Top Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <Link to="/receiver" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            <ArrowLeft size={16} />
            <span>Back to Receiver Dashboard</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
              Consignment {shipment.shipment_id}
            </h1>
            <span className={`badge ${
              shipment.status === 'APPROVED' ? 'badge-success' : 
              shipment.status === 'HELD' || shipment.status === 'REJECTED' ? 'badge-danger' : 
              shipment.status === 'DELIVERED' ? 'badge-primary' : 'badge-neutral'
            }`}>
              {shipment.status}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setShowOfflineModal(true)} 
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <UploadCloud size={14} />
            <span>Offline Verify</span>
          </button>

          <button 
            onClick={() => setShowShareModal(true)} 
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Share report via WhatsApp, Telegram, Email, or Device"
          >
            <Share2 size={14} color="var(--cc-blue-500)" />
            <span>Share Report</span>
          </button>

          <button 
            onClick={() => downloadReport(shipmentId)} 
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} />
            <span>Export Report</span>
          </button>

          <button 
            onClick={handleRunVerification} 
            disabled={verifying}
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10b981, #047857)' }}
          >
            <ShieldCheck size={16} />
            <span>{verifying ? 'Verifying...' : 'Run Verification Engine'}</span>
          </button>
        </div>
      </div>

      {message && (
        <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: 'var(--radius-md)', color: '#10b981', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={16} />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', color: '#ef4444', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Consignment Profile Bar */}
      <div className="card" style={{ marginBottom: '24px', padding: '16px 20px', background: 'var(--surface)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', fontSize: '0.85rem' }}>
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Medicine & Batch</span>
            <strong style={{ color: 'var(--text-primary)' }}>{shipment.medicine_name}</strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Batch: <code>{shipment.batch_number}</code></div>
          </div>

          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Required Limits</span>
            <strong style={{ color: 'var(--cc-teal-400)' }}>{shipment.min_temp}°C to {shipment.max_temp}°C</strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Interval: {shipment.reading_interval_minutes}m</div>
          </div>

          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Vehicle & Transporter</span>
            <div>{shipment.vehicle_registration}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{shipment.assignment?.transporter_full_name || 'Unassigned'}</div>
          </div>

          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Telemetry Records</span>
            <div><strong>{transporterReadings.length}</strong> driver readings</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}><strong>{trustedList.length}</strong> authoritative IoT records</div>
          </div>
        </div>
      </div>

      {/* VERIFICATION RESULTS PANEL */}
      {verificationResult ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '24px' }}>
          {/* Executive Verdict Banner */}
          <div className="card" style={{ 
            borderLeft: `6px solid ${
              verificationResult.overall_integrity_status === 'VERIFIED' && verificationResult.overall_compliance_status === 'COMPLIANT' 
                ? 'var(--status-verified)' : 'var(--status-failed)'
            }`,
            background: 'var(--bg-card)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Verification Engine Verdict
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
                    {verificationResult.overall_integrity_status === 'VERIFIED' && verificationResult.overall_compliance_status === 'COMPLIANT' ? (
                      <span style={{ color: 'var(--status-verified)' }}>Consignment Integrity & Cold Chain Verified</span>
                    ) : (
                      <span style={{ color: 'var(--status-failed)' }}>Integrity Breach or Excursion Detected</span>
                    )}
                  </h2>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '6px' }}>
                  Recommended Action: <strong style={{ color: 'var(--text-primary)' }}>{verificationResult.recommended_action}</strong>
                </p>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ textAlign: 'center', padding: '8px 16px', background: 'var(--surface)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Mismatches</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: verificationResult.mismatch_count > 0 ? 'var(--status-failed)' : 'var(--status-verified)' }}>
                    {verificationResult.mismatch_count}
                  </div>
                </div>

                <div style={{ textAlign: 'center', padding: '8px 16px', background: 'var(--surface)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Excursions</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: verificationResult.trusted_excursion_count > 0 ? 'var(--status-failed)' : 'var(--status-verified)' }}>
                    {verificationResult.trusted_excursion_count}
                  </div>
                </div>

                <div style={{ textAlign: 'center', padding: '8px 16px', background: 'var(--surface)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Missing Seqs</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: verificationResult.missing_count > 0 ? 'var(--status-failed)' : 'var(--status-verified)' }}>
                    {verificationResult.missing_count}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Security Pillars Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            {/* 1. SHA-256 Hash Chain */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Lock size={18} color="var(--cc-teal-400)" />
                <strong style={{ fontSize: '0.9rem' }}>SHA-256 Hash Chain</strong>
              </div>
              <span className={`badge ${verificationResult.hash_chain.status === 'VERIFIED' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem' }}>
                {verificationResult.hash_chain.status}
              </span>
              <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.4 }}>
                {verificationResult.hash_chain.detail}
              </p>
            </div>

            {/* 2. Ed25519 Signature */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <ShieldCheck size={18} color="var(--cc-blue-500)" />
                <strong style={{ fontSize: '0.9rem' }}>Ed25519 Signature</strong>
              </div>
              <span className={`badge ${
                verificationResult.signature.status === 'VERIFIED' ? 'badge-success' : 
                verificationResult.signature.status === 'FAILED' ? 'badge-danger' : 'badge-neutral'
              }`} style={{ fontSize: '0.7rem' }}>
                {verificationResult.signature.status}
              </span>
              <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.4 }}>
                {verificationResult.signature.detail}
              </p>
            </div>

            {/* 3. Blockchain Fingerprint */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Database size={18} color="#a855f7" />
                <strong style={{ fontSize: '0.9rem' }}>Blockchain Ledger</strong>
              </div>
              <span className={`badge ${
                verificationResult.blockchain.status === 'VERIFIED' ? 'badge-success' : 
                verificationResult.blockchain.status === 'DEMO_ONLY' ? 'badge-primary' : 'badge-neutral'
              }`} style={{ fontSize: '0.7rem' }}>
                {verificationResult.blockchain.status}
              </span>
              <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.4 }}>
                {verificationResult.blockchain.detail}
              </p>
            </div>

            {/* 4. Excursion Analysis */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Thermometer size={18} color="#f59e0b" />
                <strong style={{ fontSize: '0.9rem' }}>Temperature Integrity</strong>
              </div>
              <span className={`badge ${verificationResult.overall_compliance_status === 'COMPLIANT' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem' }}>
                {verificationResult.overall_compliance_status}
              </span>
              <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.4 }}>
                {verificationResult.excursion_analysis.status === 'COMPLIANT'
                  ? 'All readings strictly within prescribed 2-8°C threshold.'
                  : `${verificationResult.excursion_analysis.excursion_reading_count} reading(s) breached limits.`}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '36px 20px', marginBottom: '24px', background: 'var(--surface)' }}>
          <ShieldAlert size={32} color="var(--cc-teal-400)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>Verification Engine Ready</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '540px', margin: '0 auto 16px' }}>
            Cross-verify driver checkpoint logs against authoritative IoT sensors sealed with Ed25519 signatures and SHA-256 hash chains.
          </p>
          <button 
            onClick={handleRunVerification} 
            disabled={verifying}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #10b981, #047857)' }}
          >
            <ShieldCheck size={18} />
            <span>{verifying ? 'Analyzing...' : 'Run Automated Cross-Verification'}</span>
          </button>
        </div>
      )}

      {/* TELEMETRY COMPARISON TABLE */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h3 className="card-title">
            <ClipboardCheck size={18} color="var(--cc-teal-400)" />
            <span>Dual-Dataset Telemetry Cross-Comparison</span>
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Comparing Transporter Submissions vs Authoritative Sealed Sensor
          </span>
        </div>

        {allSeqNumbers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            No telemetry records available to compare.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '10px 12px' }}>Seq #</th>
                  <th style={{ padding: '10px 12px' }}>Timestamp</th>
                  <th style={{ padding: '10px 12px' }}>Authoritative IoT Temp</th>
                  <th style={{ padding: '10px 12px' }}>Transporter Logged Temp</th>
                  <th style={{ padding: '10px 12px' }}>Delta</th>
                  <th style={{ padding: '10px 12px' }}>Cross-Check Status</th>
                </tr>
              </thead>
              <tbody>
                {allSeqNumbers.map(seq => {
                  const tRec = trustedMap[seq];
                  const rRec = transporterMap[seq];

                  const tTemp = tRec ? tRec.temperature_celsius : null;
                  const rTemp = rRec ? rRec.temperature_celsius : null;

                  const isMissingTrusted = !tRec && !!rRec;
                  const isMissingTransporter = !!tRec && !rRec;
                  const isMismatch = tRec && rRec && Math.abs(tTemp - rTemp) > 0.001;
                  const isExcursion = tRec && (tTemp < shipment.min_temp || tTemp > shipment.max_temp);

                  let rowBg = 'transparent';
                  if (isMismatch) rowBg = 'rgba(239, 68, 68, 0.08)';
                  else if (isMissingTrusted || isMissingTransporter) rowBg = 'rgba(245, 158, 11, 0.08)';

                  return (
                    <tr key={seq} style={{ borderBottom: '1px solid var(--border-light)', background: rowBg }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{seq}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {tRec ? new Date(tRec.measured_at).toLocaleTimeString() : 
                         rRec ? new Date(rRec.measured_at).toLocaleTimeString() : '—'}
                      </td>

                      {/* Trusted Temp */}
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        {tTemp !== null ? (
                          <span style={{ color: isExcursion ? 'var(--status-failed)' : 'var(--cc-teal-400)' }}>
                            {tTemp}°C {isExcursion && '⚠️ EXCURSION'}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--status-mismatch)' }}>MISSING IN IOT</span>
                        )}
                      </td>

                      {/* Transporter Temp */}
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        {rTemp !== null ? (
                          <span>{rTemp}°C</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>UNLOGGED BY DRIVER</span>
                        )}
                      </td>

                      {/* Delta */}
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
                        {tTemp !== null && rTemp !== null ? (
                          <span style={{ color: isMismatch ? 'var(--status-failed)' : 'var(--text-muted)', fontWeight: isMismatch ? 700 : 400 }}>
                            {Math.abs(rTemp - tTemp).toFixed(2)}°C
                          </span>
                        ) : '—'}
                      </td>

                      {/* Cross-Check Status */}
                      <td style={{ padding: '10px 12px' }}>
                        {isMismatch ? (
                          <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                            TAMPERING / MISMATCH
                          </span>
                        ) : isMissingTrusted ? (
                          <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                            UNVERIFIED DRIVER LOG
                          </span>
                        ) : isMissingTransporter ? (
                          <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                            MISSING SUBMISSION
                          </span>
                        ) : (
                          <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                            MATCHED & VERIFIED
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FORMAL RECEIVER DECISION PANEL */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '16px' }}>
          <FileText size={18} color="var(--cc-blue-500)" />
          <span>Regulatory Custody Decision</span>
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Make a binding pharmaceutical acceptance decision based on cryptographic verification and cold chain compliance.
        </p>

        {existingDecision && (
          <div style={{ padding: '12px 16px', background: 'var(--surface)', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '0.85rem' }}>
            <div>
              <strong>Current Status:</strong> <span className={`badge ${existingDecision.decision === 'APPROVE' ? 'badge-success' : 'badge-danger'}`} style={{ marginLeft: '6px' }}>{existingDecision.decision}</span>
            </div>
            {existingDecision.reason && (
              <div style={{ marginTop: '6px', color: 'var(--text-secondary)' }}>
                <strong>Documented Reason:</strong> {existingDecision.reason}
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Decided by: {existingDecision.decided_by_name || 'Quality Inspector'} on {new Date(existingDecision.decided_at).toLocaleString()}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmitDecision}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px',
              background: decisionChoice === 'APPROVE' ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface)',
              border: `1px solid ${decisionChoice === 'APPROVE' ? '#10b981' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)', cursor: 'pointer', flex: 1, minWidth: '160px'
            }}>
              <input 
                type="radio" 
                name="decisionChoice" 
                value="APPROVE" 
                checked={decisionChoice === 'APPROVE'}
                onChange={() => setDecisionChoice('APPROVE')}
                style={{ accentColor: '#10b981' }}
              />
              <div>
                <strong style={{ color: '#10b981', display: 'block', fontSize: '0.9rem' }}>APPROVE</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Release to Pharmacy</span>
              </div>
            </label>

            <label style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px',
              background: decisionChoice === 'HOLD' ? 'rgba(245, 158, 11, 0.15)' : 'var(--surface)',
              border: `1px solid ${decisionChoice === 'HOLD' ? '#f59e0b' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)', cursor: 'pointer', flex: 1, minWidth: '160px'
            }}>
              <input 
                type="radio" 
                name="decisionChoice" 
                value="HOLD" 
                checked={decisionChoice === 'HOLD'}
                onChange={() => setDecisionChoice('HOLD')}
                style={{ accentColor: '#f59e0b' }}
              />
              <div>
                <strong style={{ color: '#f59e0b', display: 'block', fontSize: '0.9rem' }}>HOLD</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Investigate Quarantine</span>
              </div>
            </label>

            <label style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px',
              background: decisionChoice === 'REJECT' ? 'rgba(239, 68, 68, 0.15)' : 'var(--surface)',
              border: `1px solid ${decisionChoice === 'REJECT' ? '#ef4444' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)', cursor: 'pointer', flex: 1, minWidth: '160px'
            }}>
              <input 
                type="radio" 
                name="decisionChoice" 
                value="REJECT" 
                checked={decisionChoice === 'REJECT'}
                onChange={() => setDecisionChoice('REJECT')}
                style={{ accentColor: '#ef4444' }}
              />
              <div>
                <strong style={{ color: '#ef4444', display: 'block', fontSize: '0.9rem' }}>REJECT</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Destroy / Return Consignment</span>
              </div>
            </label>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Regulatory Justification Reason {decisionChoice !== 'APPROVE' && '* (Required)'}
            </label>
            <textarea
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              placeholder={decisionChoice === 'APPROVE' ? 'Consignment satisfies all cold chain integrity specs.' : 'Specify exact excursion or mismatch reason...'}
              rows={3}
              style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
            />
          </div>

          <button
            type="submit"
            disabled={submittingDecision}
            className="btn btn-primary"
            style={{ padding: '10px 24px', fontWeight: 600 }}
          >
            {submittingDecision ? 'Submitting Decision...' : 'Commit Regulatory Decision'}
          </button>
        </form>
      </div>

      {/* OFFLINE MODAL */}
      {showOfflineModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px', zIndex: 1000
        }}>
          <div className="card" style={{ maxWidth: '640px', width: '100%', padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UploadCloud size={20} color="var(--cc-teal-400)" />
              <span>Offline Air-Gapped Verification</span>
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Paste offline telemetry JSON containing <code>trusted_records</code> and optional <code>transporter_records</code> for air-gapped cryptographic inspection.
            </p>

            <form onSubmit={handleOfflineVerification}>
              <textarea
                value={offlineJson}
                onChange={(e) => setOfflineJson(e.target.value)}
                placeholder='{"trusted_records": [{"sequence_number": 1, "measured_at": "2026-10-20T06:00:00Z", "temperature_celsius": 4.5, "unit": "C"}], "transporter_records": []}'
                rows={8}
                required
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.8rem', marginBottom: '16px' }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowOfflineModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary btn-sm"
                >
                  Run Offline Verification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Report Modal */}
      <ShareReportModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shipment={shipment}
        verificationResult={verificationResult}
      />
    </div>
  );
}
