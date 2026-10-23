import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Package,
  RefreshCw,
  ArrowRight,
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  FileText,
  Download,
  Search,
  XCircle,
  Eye,
  Lock,
  ChevronDown,
  ChevronUp,
  FileCheck2
} from 'lucide-react';
import { getShipments, runVerification, downloadReport } from '../../services/api';

function StatusBadge({ status }) {
  const map = {
    APPROVED:   { label: 'Approved',         cls: 'badge-success' },
    DELIVERED:  { label: 'Ready for Review', cls: 'badge-primary' },
    IN_TRANSIT: { label: 'In Transit',        cls: 'badge-warning' },
    HELD:       { label: 'Held',              cls: 'badge-danger'  },
    REJECTED:   { label: 'Rejected',          cls: 'badge-danger'  },
    COMMITTED:  { label: 'Committed',         cls: 'badge-primary' },
    CREATED:    { label: 'Processing',        cls: 'badge-neutral' },
  };
  const { label, cls } = map[status] || { label: status, cls: 'badge-neutral' };
  return <span className={`badge ${cls}`}>{label}</span>;
}

function KpiCard({ icon, iconBg, iconColor, value, label, badge, badgeColor, badgeBg }) {
  return (
    <div className="card" style={{ padding: '20px 22px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '14px',
        background: iconBg,
        color: iconColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        {icon}
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {value}
          </span>
          {badge && (
            <span style={{
              background: badgeBg,
              color: badgeColor,
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 'var(--radius-pill)'
            }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, body }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted)' }}>
      <div style={{ marginBottom: '12px', opacity: 0.4 }}>{icon}</div>
      <h3 style={{ color: 'var(--text-primary)', marginBottom: '6px', fontSize: '1rem' }}>{title}</h3>
      {body && <p style={{ fontSize: '0.875rem' }}>{body}</p>}
    </div>
  );
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '24px',
      flexWrap: 'wrap',
      gap: '14px'
    }}>
      <div>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '4px' }}>
          {title}
        </h1>
        {subtitle && <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Tab: Overview ──────────────────────────────────────────────────────────

function OverviewTab({ shipments, loading, onRefresh }) {
  const needsReview  = shipments.filter(s => s.status === 'DELIVERED');
  const urgent       = shipments.filter(s => ['HELD', 'REJECTED'].includes(s.status));
  const hasExcursion = shipments.filter(s => s.has_excursion);
  const approved     = shipments.filter(s => s.status === 'APPROVED');

  return (
    <>
      <SectionHeader
        title="Overview"
        subtitle="Summary of assigned consignments, active alerts, and pending receiver actions."
        action={
          <button
            onClick={onRefresh}
            className="btn btn-secondary btn-sm"
            style={{ borderRadius: 'var(--radius-pill)', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        }
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '18px',
        marginBottom: '24px'
      }}>
        <KpiCard
          icon={<ClipboardCheck size={22} />}
          iconBg="#e0f8fb"
          iconColor="#06b6d4"
          value={needsReview.length}
          label="Ready for Review"
          badge={needsReview.length > 0 ? 'Action Pending' : 'None'}
          badgeColor="#06b6d4"
          badgeBg="#e0f8fb"
        />
        <KpiCard
          icon={<AlertTriangle size={22} />}
          iconBg="#fef0f0"
          iconColor="#ef4444"
          value={urgent.length}
          label="Held / Rejected"
          badge={urgent.length > 0 ? 'Urgent' : 'Clear'}
          badgeColor={urgent.length > 0 ? '#ef4444' : '#10b981'}
          badgeBg={urgent.length > 0 ? '#fef0f0' : '#e6f9ed'}
        />
        <KpiCard
          icon={<AlertCircle size={22} />}
          iconBg="#fff1e9"
          iconColor="#f97316"
          value={hasExcursion.length}
          label="Temp Excursions"
          badge={hasExcursion.length > 0 ? 'Alert' : 'None'}
          badgeColor={hasExcursion.length > 0 ? '#ef4444' : '#10b981'}
          badgeBg={hasExcursion.length > 0 ? '#fef0f0' : '#e6f9ed'}
        />
        <KpiCard
          icon={<CheckCircle2 size={22} />}
          iconBg="#e6f9ed"
          iconColor="#10b981"
          value={approved.length}
          label="Approved & Released"
          badge="Released"
          badgeColor="#10b981"
          badgeBg="#e6f9ed"
        />
      </div>

      {/* Urgent Attention / Action Items Table */}
      {(needsReview.length > 0 || urgent.length > 0) && (
        <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 className="card-title" style={{ margin: '0 0 4px 0' }}>Items Requiring Attention</h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Consignments delivered or flagged that require inspection, verification, or release decisions.
              </p>
            </div>
            <Link
              to="/receiver?tab=shipments"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.825rem',
                color: 'var(--cc-blue-500)',
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              <span>View all shipments</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Shipment ID</th>
                  <th>Medicine</th>
                  <th>Route</th>
                  <th>Temperature Excursion</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {[...needsReview, ...urgent].slice(0, 6).map(s => (
                  <tr key={s.id}>
                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>#{s.shipment_id}</span>
                    </td>
                    <td>
                      <strong style={{ color: 'var(--text-primary)' }}>{s.medicine_name}</strong>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Batch: {s.batch_number}</div>
                    </td>
                    <td style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                      {s.origin} {'→'} {s.destination}
                    </td>
                    <td>
                      {s.has_excursion ? (
                        <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <AlertCircle size={12} /> Excursion Detected
                        </span>
                      ) : (
                        <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <CheckCircle2 size={12} /> Within Bounds
                        </span>
                      )}
                    </td>
                    <td><StatusBadge status={s.status} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={`/receiver/shipments/${s.shipment_id}`}
                        className="btn btn-primary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 14px', fontSize: '0.78rem' }}
                      >
                        <span>Verify & Decide</span>
                        <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && needsReview.length === 0 && urgent.length === 0 && (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>
          <RefreshCw size={22} className="spin" style={{ margin: '0 auto 10px' }} />
        </div>
      )}

      {!loading && needsReview.length === 0 && urgent.length === 0 && (
        <EmptyState
          icon={<CheckCircle2 size={40} />}
          title="All Consignments Clear"
          body="No shipments are currently awaiting delivery review or flagged for investigation."
        />
      )}
    </>
  );
}

// ── Tab: My Shipments ──────────────────────────────────────────────────────

const FILTERS = [
  { label: 'All',             value: '' },
  { label: 'Ready for Review', value: 'DELIVERED' },
  { label: 'Approved',        value: 'APPROVED' },
  { label: 'Held',            value: 'HELD' },
  { label: 'In Transit',      value: 'IN_TRANSIT' },
];

function ShipmentsTab({ shipments, loading, onRefresh, statusFilter, setStatusFilter }) {
  const [search, setSearch] = useState('');

  const filtered = shipments.filter(s => {
    if (search) {
      const q = search.toLowerCase();
      const matchId = s.shipment_id?.toLowerCase().includes(q);
      const matchMed = s.medicine_name?.toLowerCase().includes(q);
      const matchBatch = s.batch_number?.toLowerCase().includes(q);
      if (!matchId && !matchMed && !matchBatch) return false;
    }
    return true;
  });

  return (
    <>
      <SectionHeader
        title="My Shipments"
        subtitle="Search, filter, and inspect assigned consignments and delivery status."
        action={
          <button
            onClick={onRefresh}
            className="btn btn-secondary btn-sm"
            style={{ borderRadius: 'var(--radius-pill)', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        }
      />

      <div className="card" style={{ padding: '24px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '18px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Status Filter Pills */}
          <div style={{
            display: 'flex',
            gap: '6px',
            background: 'var(--surface)',
            padding: '4px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--border)'
          }}>
            {FILTERS.map(tab => {
              const active = statusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setStatusFilter(tab.value)}
                  style={{
                    background: active ? 'var(--cc-blue-500)' : 'transparent',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-pill)',
                    padding: '5px 14px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <Search
              size={13}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search shipment ID, medicine..."
              style={{
                paddingLeft: '28px',
                paddingRight: '12px',
                paddingTop: '7px',
                paddingBottom: '7px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-pill)',
                fontSize: '0.82rem',
                outline: 'none',
                width: '240px'
              }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>
            <RefreshCw size={22} className="spin" style={{ margin: '0 auto 10px' }} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Package size={38} />}
            title="No Shipments Found"
            body="No consignments match the selected search query or status filter."
          />
        ) : (
          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Shipment ID</th>
                  <th>Medicine / Batch</th>
                  <th>Route</th>
                  <th>Safe Temp Range</th>
                  <th>Excursion</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>#{s.shipment_id}</span>
                    </td>
                    <td>
                      <strong style={{ color: 'var(--text-primary)' }}>{s.medicine_name}</strong>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Batch: {s.batch_number}</div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                      {s.origin} {'→'} {s.destination}
                    </td>
                    <td>
                      <span className="mono" style={{ background: '#f4f6fa', padding: '2px 6px', borderRadius: '4px', fontSize: '0.79rem' }}>
                        {s.min_temp}°C – {s.max_temp}°C
                      </span>
                    </td>
                    <td>
                      {s.has_excursion ? (
                        <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <AlertCircle size={12} /> Yes
                        </span>
                      ) : (
                        <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <CheckCircle2 size={12} /> None
                        </span>
                      )}
                    </td>
                    <td><StatusBadge status={s.status} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={`/receiver/shipments/${s.shipment_id}`}
                        className="btn btn-primary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', fontSize: '0.78rem' }}
                      >
                        <span>Details</span>
                        <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ── Tab: Verification & Reports ───────────────────────────────────────────

function VerifReportsTab({ shipments, loading }) {
  const [verifying, setVerifying] = useState(null);
  const [results, setResults] = useState({});
  const [downloading, setDownloading] = useState(null);
  const [expandedShipment, setExpandedShipment] = useState(null);

  const handleVerify = async (shipmentId) => {
    setVerifying(shipmentId);
    try {
      const res = await runVerification(shipmentId);
      setResults(prev => ({ ...prev, [shipmentId]: res }));
      setExpandedShipment(shipmentId);
    } catch (e) {
      setResults(prev => ({ ...prev, [shipmentId]: { error: e.message } }));
      setExpandedShipment(shipmentId);
    } finally {
      setVerifying(null);
    }
  };

  const handleDownload = async (shipmentId) => {
    setDownloading(shipmentId);
    try {
      await downloadReport(shipmentId);
    } catch (e) {
      alert('Failed to download PDF audit report: ' + e.message);
    } finally {
      setDownloading(null);
    }
  };

  const verifiable = shipments.filter(s =>
    ['DELIVERED', 'COMMITTED', 'APPROVED', 'REJECTED', 'HELD'].includes(s.status)
  );

  return (
    <>
      <SectionHeader
        title="Verification & Reports"
        subtitle="Multi-point cryptographic verification, trusted-versus-transporter comparison, and PDF audit reports."
      />

      {/* Independent Verification Principle Card */}
      <div style={{
        background: '#f8f9ff',
        border: '1px solid #c7d2fe',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 18px',
        marginBottom: '22px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start'
      }}>
        <ShieldCheck size={18} color="#4338ca" style={{ marginTop: '2px', flexShrink: 0 }} />
        <div style={{ fontSize: '0.825rem', color: '#4338ca', lineHeight: 1.55 }}>
          <strong>Separation of Concerns:</strong> Cryptographic integrity (SHA-256 hash chains, Ed25519 digital signatures) and temperature compliance (manufacturer cold-chain bounds) are verified independently. A valid digital signature confirms data immutability, not that the shipment remained within safe temperatures.
        </div>
      </div>

      <div className="card" style={{ padding: '24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>
            <RefreshCw size={22} className="spin" style={{ margin: '0 auto 10px' }} />
          </div>
        ) : verifiable.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={38} />}
            title="No Verifiable Consignments"
            body="Shipments appear here once delivered, committed, held, or under review."
          />
        ) : (
          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Shipment</th>
                  <th>Medicine</th>
                  <th>Safe Range</th>
                  <th>Excursion</th>
                  <th>Status</th>
                  <th>Integrity Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {verifiable.map(s => {
                  const res = results[s.shipment_id];
                  const isV = verifying === s.shipment_id;
                  const isDl = downloading === s.shipment_id;
                  const isExpanded = expandedShipment === s.shipment_id;

                  return (
                    <React.Fragment key={s.id}>
                      <tr style={{ background: isExpanded ? '#f8fafc' : 'transparent' }}>
                        <td>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>#{s.shipment_id}</span>
                        </td>
                        <td>
                          <strong style={{ color: 'var(--text-primary)' }}>{s.medicine_name}</strong>
                          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>Batch: {s.batch_number}</div>
                        </td>
                        <td>
                          <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {s.min_temp}°C – {s.max_temp}°C
                          </span>
                        </td>
                        <td>
                          {s.has_excursion ? (
                            <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <AlertCircle size={12} /> Excursion
                            </span>
                          ) : (
                            <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <CheckCircle2 size={12} /> Clean
                            </span>
                          )}
                        </td>
                        <td><StatusBadge status={s.status} /></td>
                        <td style={{ fontSize: '0.82rem' }}>
                          {res ? (
                            res.error ? (
                              <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <XCircle size={12} /> Error
                              </span>
                            ) : res.overall_integrity_status === 'VERIFIED' ? (
                              <span style={{ color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <ShieldCheck size={12} /> Verified
                              </span>
                            ) : (
                              <span style={{ color: '#f59e0b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <AlertTriangle size={12} /> {res.overall_integrity_status}
                              </span>
                            )
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Not run</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button
                              onClick={() => handleVerify(s.shipment_id)}
                              disabled={isV}
                              className="btn btn-secondary btn-sm"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '0.78rem' }}
                              title="Run full verification"
                            >
                              {isV ? (
                                <><RefreshCw size={11} className="spin" /> Verifying…</>
                              ) : (
                                <><ShieldCheck size={12} /> Verify</>
                              )}
                            </button>

                            <button
                              onClick={() => handleDownload(s.shipment_id)}
                              disabled={isDl}
                              className="btn btn-secondary btn-sm"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '0.78rem' }}
                              title="Download PDF report"
                            >
                              {isDl ? (
                                <><RefreshCw size={11} className="spin" /> …</>
                              ) : (
                                <><Download size={12} /> PDF</>
                              )}
                            </button>

                            <button
                              onClick={() => setExpandedShipment(isExpanded ? null : s.shipment_id)}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '5px 8px', fontSize: '0.78rem' }}
                              title={isExpanded ? 'Collapse evidence' : 'Expand evidence'}
                            >
                              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>

                            <Link
                              to={`/receiver/shipments/${s.shipment_id}`}
                              className="btn btn-primary btn-sm"
                              style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 8px', fontSize: '0.78rem' }}
                              title="Open consignment detail page"
                            >
                              <Eye size={12} />
                            </Link>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Verification & Audit Evidence Panel */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} style={{ background: '#f8fafc', padding: '16px 20px', borderTop: '1px dashed #e2e8f0' }}>
                            {res ? (
                              res.error ? (
                                <div style={{ color: '#ef4444', fontSize: '0.825rem' }}>
                                  Verification error: {res.error}
                                </div>
                              ) : (
                                <div>
                                  <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                    gap: '12px',
                                    marginBottom: '14px'
                                  }}>
                                    {/* Hash Chain Check */}
                                    <div style={{ background: '#ffffff', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>SHA-256 HASH CHAIN</div>
                                      <div style={{
                                        fontSize: '0.825rem',
                                        fontWeight: 700,
                                        color: res.hash_chain?.status === 'VALID' ? '#059669' : '#ef4444',
                                        marginTop: '2px'
                                      }}>
                                        {res.hash_chain?.status || 'UNKNOWN'}
                                      </div>
                                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                        {res.trusted_record_count || 0} trusted records
                                      </div>
                                    </div>

                                    {/* Digital Seal */}
                                    <div style={{ background: '#ffffff', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>ED25519 SIGNATURE</div>
                                      <div style={{
                                        fontSize: '0.825rem',
                                        fontWeight: 700,
                                        color: res.signature?.status === 'VALID' ? '#059669' : '#f59e0b',
                                        marginTop: '2px'
                                      }}>
                                        {res.signature?.status || 'NOT AVAILABLE'}
                                      </div>
                                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                        Device Key Authentication
                                      </div>
                                    </div>

                                    {/* Temperature Compliance */}
                                    <div style={{ background: '#ffffff', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>TEMPERATURE COMPLIANCE</div>
                                      <div style={{
                                        fontSize: '0.825rem',
                                        fontWeight: 700,
                                        color: res.overall_compliance_status === 'COMPLIANT' ? '#059669' : '#ef4444',
                                        marginTop: '2px'
                                      }}>
                                        {res.overall_compliance_status || 'NOT EVALUATED'}
                                      </div>
                                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                        {res.trusted_excursion_count || 0} excursions logged
                                      </div>
                                    </div>

                                    {/* Transporter vs Sensor Comparison */}
                                    <div style={{ background: '#ffffff', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>TELEMETRY COMPARISON</div>
                                      <div style={{
                                        fontSize: '0.825rem',
                                        fontWeight: 700,
                                        color: (res.mismatch_count || 0) === 0 ? '#059669' : '#ef4444',
                                        marginTop: '2px'
                                      }}>
                                        {res.mismatch_count || 0} Discrepancies
                                      </div>
                                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                        {res.transporter_record_count || 0} driver readings
                                      </div>
                                    </div>

                                    {/* Recommended Action */}
                                    <div style={{ background: '#ffffff', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>RECOMMENDATION</div>
                                      <div style={{
                                        fontSize: '0.825rem',
                                        fontWeight: 700,
                                        color: res.recommended_action === 'APPROVE' ? '#059669' : '#ef4444',
                                        marginTop: '2px'
                                      }}>
                                        {res.recommended_action || 'UNDER REVIEW'}
                                      </div>
                                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                        Automated recommendation
                                      </div>
                                    </div>
                                  </div>

                                  {/* Summary Reasons & Direct Links */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                      {res.summary_reasons && res.summary_reasons.length > 0 ? (
                                        <span><strong>Audit Evidence:</strong> {res.summary_reasons.join(' · ')}</span>
                                      ) : (
                                        <span>Cryptographic multi-point audit verification complete.</span>
                                      )}
                                    </div>
                                    <Link
                                      to={`/receiver/shipments/${s.shipment_id}`}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        color: 'var(--cc-blue-500)',
                                        textDecoration: 'none'
                                      }}
                                    >
                                      <span>Full Audit Evidence & Decision</span>
                                      <ArrowRight size={13} />
                                    </Link>
                                  </div>
                                </div>
                              )
                            ) : (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  Full cryptographic checks have not been run for #{s.shipment_id} in this session.
                                </div>
                                <button
                                  onClick={() => handleVerify(s.shipment_id)}
                                  disabled={isV}
                                  className="btn btn-secondary btn-sm"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem' }}
                                >
                                  {isV ? <><RefreshCw size={11} className="spin" /> Verifying…</> : <><ShieldCheck size={12} /> Run Full Verification</>}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ── Root Receiver Dashboard ────────────────────────────────────────────────

export default function ReceiverDashboard() {
  const location = useLocation();
  const tab = new URLSearchParams(location.search).get('tab') || 'overview';

  const [allShipments,      setAllShipments]      = useState([]);
  const [filteredShipments, setFilteredShipments] = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [statusFilter,      setStatusFilter]      = useState('');
  const [error,             setError]             = useState('');

  const fetchShipments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getShipments({});
      setAllShipments(data);
    } catch (err) {
      setError(err.message || 'Failed to load shipments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  useEffect(() => {
    setFilteredShipments(
      statusFilter ? allShipments.filter(s => s.status === statusFilter) : allShipments
    );
  }, [allShipments, statusFilter]);

  return (
    <div style={{ padding: '32px 36px 60px', maxWidth: '1600px', margin: '0 auto' }}>
      {error && <div className="alert alert-danger" style={{ marginBottom: '20px' }}>{error}</div>}
      {tab === 'overview'  && (
        <OverviewTab
          shipments={allShipments}
          loading={loading}
          onRefresh={fetchShipments}
        />
      )}
      {tab === 'shipments' && (
        <ShipmentsTab
          shipments={filteredShipments}
          loading={loading}
          onRefresh={fetchShipments}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />
      )}
      {tab === 'verify'    && (
        <VerifReportsTab
          shipments={allShipments}
          loading={loading}
        />
      )}
    </div>
  );
}
