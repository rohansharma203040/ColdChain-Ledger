import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Package, 
  ArrowLeft, 
  RefreshCw, 
  Truck, 
  ShieldCheck, 
  Download, 
  Cpu, 
  AlertCircle, 
  CheckCircle2, 
  FileText,
  Key,
  Share2
} from 'lucide-react';
import { 
  getShipment, 
  getReadings, 
  getTrustedData, 
  getAudit, 
  assignTransporter, 
  initTrustedData, 
  getTransporters,
  downloadReport 
} from '../../services/api';
import ShareReportModal from '../../components/ShareReportModal';

export default function AdminShipmentDetail() {
  const { shipmentId } = useParams();
  const [shipment, setShipment] = useState(null);
  const [readings, setReadings] = useState([]);
  const [trustedData, setTrustedData] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [transporters, setTransporters] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [activeTab, setActiveTab] = useState('overview'); // overview | readings | trusted | audit
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [sData, rData, aData, tList] = await Promise.all([
        getShipment(shipmentId),
        getReadings(shipmentId).catch(() => []),
        getAudit(shipmentId).catch(() => []),
        getTransporters().catch(() => []),
      ]);

      setShipment(sData);
      setReadings(rData);
      setAuditEvents(aData);
      setTransporters(tList);
      if (sData.assignment?.transporter_username) {
        setSelectedDriver(sData.assignment.transporter_username);
      }

      // Also fetch trusted data (Admin is authorized)
      try {
        const td = await getTrustedData(shipmentId);
        setTrustedData(td);
      } catch (tdErr) {
        setTrustedData(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to load shipment details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [shipmentId]);

  const handleAssignDriver = async () => {
    if (!selectedDriver) return;
    setActionLoading(true);
    setMessage('');
    setError('');
    try {
      await assignTransporter(shipmentId, selectedDriver);
      setMessage(`Driver ${selectedDriver} assigned successfully.`);
      loadAll();
    } catch (err) {
      setError(err.message || 'Failed to assign driver.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleInitTrustedSensor = async () => {
    setActionLoading(true);
    setMessage('');
    setError('');
    try {
      const sampleTemps = [4.2, 4.4, 4.7, 5.0, 4.8];
      const nowIso = new Date().toISOString();
      await initTrustedData(shipmentId, sampleTemps, nowIso);
      setMessage('Trusted sensor dataset initialized with Ed25519 signature manifest.');
      loadAll();
    } catch (err) {
      setError(err.message || 'Failed to initialize trusted data.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      await downloadReport(shipmentId);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '80px 20px' }}>
        <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px', color: 'var(--cc-blue-500)' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading shipment {shipmentId}...</p>
      </div>
    );
  }

  if (error && !shipment) {
    return (
      <div className="page-container">
        <Link to="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
          <ArrowLeft size={16} />
          <span>Back to Shipments</span>
        </Link>
        <div style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', color: '#ef4444' }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Back button & Action Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <Link to="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            <ArrowLeft size={16} />
            <span>Back to Shipments</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
              {shipment.shipment_id}
            </h1>
            <span className={`badge ${
              shipment.status === 'APPROVED' ? 'badge-success' : 
              shipment.status === 'HELD' || shipment.status === 'REJECTED' ? 'badge-danger' : 
              shipment.status === 'IN_TRANSIT' ? 'badge-warning' : 'badge-primary'
            }`}>
              {shipment.status}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={loadAll} 
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>

          <button 
            onClick={() => setShowShareModal(true)}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Share PDF report via WhatsApp, Telegram, Email, or Device"
          >
            <Share2 size={14} color="var(--cc-blue-500)" />
            <span>Share Report</span>
          </button>

          <button 
            onClick={handleDownload}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} />
            <span>Download Report</span>
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
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
        {[
          { key: 'overview', label: 'Overview & Config' },
          { key: 'readings', label: `Driver Readings (${readings.length})` },
          { key: 'trusted', label: `Trusted IoT Data (${trustedData?.records?.length || 0})` },
          { key: 'audit', label: `Audit Log (${auditEvents.length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--cc-blue-500)' : '2px solid transparent',
              color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.key ? 600 : 400,
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {/* Metadata Card */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '16px' }}>
              <Package size={18} color="var(--cc-blue-500)" />
              <span>Medicine & Custody Metadata</span>
            </h3>
            <div style={{ display: 'grid', gap: '12px', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Medicine:</span>
                <strong>{shipment.medicine_name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Batch:</span>
                <code>{shipment.batch_number}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Origin:</span>
                <span>{shipment.origin}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Destination:</span>
                <span>{shipment.destination}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Vehicle Reg:</span>
                <code>{shipment.vehicle_registration}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Temperature Limits:</span>
                <span style={{ color: 'var(--cc-teal-400)', fontWeight: 600 }}>{shipment.min_temp}°C to {shipment.max_temp}°C</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Logging Interval:</span>
                <span>Every {shipment.reading_interval_minutes} mins</span>
              </div>
            </div>
          </div>

          {/* Transporter Assignment Card */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '16px' }}>
              <Truck size={18} color="var(--cc-teal-400)" />
              <span>Transporter Assignment</span>
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Assign certified driver authorized to initiate journeys and log manual readings for this custody batch.
            </p>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <select
                value={selectedDriver}
                onChange={(e) => setSelectedDriver(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              >
                <option value="">-- Choose Transporter --</option>
                {transporters.map(t => (
                  <option key={t.username} value={t.username}>
                    {t.full_name} ({t.username})
                  </option>
                ))}
              </select>
              <button
                onClick={handleAssignDriver}
                disabled={actionLoading || !selectedDriver}
                className="btn btn-secondary btn-sm"
              >
                {actionLoading ? 'Assigning...' : 'Update Driver'}
              </button>
            </div>

            {shipment.assignment ? (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '0.825rem' }}>
                <div><strong>Current Driver:</strong> {shipment.assignment.transporter_full_name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Assigned at: {new Date(shipment.assignment.assigned_at).toLocaleString()}</div>
              </div>
            ) : (
              <div style={{ color: 'var(--status-mismatch)', fontSize: '0.85rem' }}>
                ⚠️ No transporter assigned. Driver will not be able to log readings.
              </div>
            )}

            {/* Sensor Baseline Trigger */}
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Cpu size={16} color="var(--cc-blue-500)" />
                <span>Simulated IoT Baseline Telemetry</span>
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Initialize authoritative sensor telemetry with Ed25519 digital signature and SHA-256 hash chaining.
              </p>
              <button
                onClick={handleInitTrustedSensor}
                disabled={actionLoading}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Key size={14} />
                <span>{trustedData?.records?.length ? 'Re-Initialize Sensor Records' : 'Initialize Trusted Sensor Dataset'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DRIVER READINGS */}
      {activeTab === 'readings' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Truck size={18} color="var(--cc-teal-400)" />
              <span>Transporter Submitted Checkpoints</span>
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Server timestamped to prevent retrofitted log entries
            </span>
          </div>

          {readings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              No readings submitted by driver yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '10px 12px' }}>#</th>
                    <th style={{ padding: '10px 12px' }}>Driver Measured Time</th>
                    <th style={{ padding: '10px 12px' }}>Server Received Time</th>
                    <th style={{ padding: '10px 12px' }}>Temperature</th>
                    <th style={{ padding: '10px 12px' }}>Status</th>
                    <th style={{ padding: '10px 12px' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.sequence_number}</td>
                      <td style={{ padding: '10px 12px' }}>{new Date(r.measured_at).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{new Date(r.server_received_at).toLocaleTimeString()}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: r.is_out_of_range ? 'var(--status-failed)' : 'var(--text-primary)' }}>
                        {r.temperature_celsius}°C
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {r.is_out_of_range ? (
                          <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>EXCURSION</span>
                        ) : (
                          <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>NORMAL</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TRUSTED DATA */}
      {activeTab === 'trusted' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <ShieldCheck size={18} color="var(--cc-blue-500)" />
              <span>Independent Authoritative IoT Telemetry</span>
            </h3>
            {trustedData?.manifest && (
              <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                Ed25519 Signed Manifest
              </span>
            )}
          </div>

          {trustedData?.data_source_warning && (
            <div style={{ padding: '10px 14px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 'var(--radius-sm)', color: '#f59e0b', fontSize: '0.8rem', marginBottom: '16px' }}>
              {trustedData.data_source_warning}
            </div>
          )}

          {trustedData?.manifest && (
            <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '20px', fontSize: '0.825rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div><strong>Device ID:</strong> <code>{trustedData.manifest.device_id}</code></div>
                <div><strong>Signing Key:</strong> <code>{trustedData.manifest.signing_key_id}</code></div>
                <div><strong>Root Fingerprint:</strong> <code title={trustedData.manifest.dataset_fingerprint}>{trustedData.manifest.dataset_fingerprint?.substring(0, 16)}…</code></div>
                <div><strong>Signature:</strong> <code title={trustedData.manifest.signature}>{trustedData.manifest.signature?.substring(0, 16)}…</code></div>
              </div>
            </div>
          )}

          {!trustedData?.records || trustedData.records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              No trusted sensor data initialized yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '8px 10px' }}>Seq</th>
                    <th style={{ padding: '8px 10px' }}>Measured At</th>
                    <th style={{ padding: '8px 10px' }}>Temp</th>
                    <th style={{ padding: '8px 10px' }}>Record SHA-256 Hash</th>
                    <th style={{ padding: '8px 10px' }}>Previous Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {trustedData.records.map(r => (
                    <tr key={r.sequence_number} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.sequence_number}</td>
                      <td style={{ padding: '8px 10px' }}>{new Date(r.measured_at).toLocaleString()}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.temperature_celsius}°C</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: 'var(--cc-teal-400)' }} title={r.record_hash}>
                        {r.record_hash ? `${r.record_hash.substring(0, 14)}…` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }} title={r.previous_hash}>
                        {r.previous_hash ? `${r.previous_hash.substring(0, 14)}…` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '16px' }}>
            <FileText size={18} color="var(--cc-blue-500)" />
            <span>Immutable Custody & Event Audit Trail</span>
          </h3>

          {auditEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              No audit events recorded for this shipment.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {auditEvents.map(e => (
                <div key={e.id} style={{
                  padding: '12px 16px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px',
                  fontSize: '0.85rem'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                        {e.event_type}
                      </span>
                      <strong style={{ color: 'var(--text-primary)' }}>{e.description}</strong>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Actor: {e.actor_name || 'System'} ({e.actor_role}) • Outcome: <span style={{ color: e.outcome === 'SUCCESS' ? 'var(--status-verified)' : 'var(--status-failed)' }}>{e.outcome}</span>
                    </div>
                  </div>

                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(e.occurred_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Share Report Modal */}
      <ShareReportModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shipment={shipment}
        verificationResult={null}
      />
    </div>
  );
}
