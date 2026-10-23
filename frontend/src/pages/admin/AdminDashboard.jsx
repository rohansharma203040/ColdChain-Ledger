import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Package, PlusCircle, RefreshCw, ArrowRight, Truck, TrendingUp,
  CheckCircle2, AlertTriangle, ShieldCheck, Thermometer, FileText,
  ClipboardList, AlertCircle, Download, Search, XCircle, Shield,
  Hash, Key, Eye
} from 'lucide-react';
import { getShipments, runVerification, downloadReport } from '../../services/api';

function StatusBadge({ status }) {
  const map = {
    APPROVED:   { label: 'Approved',     cls: 'badge-success' },
    DELIVERED:  { label: 'Delivered',    cls: 'badge-primary' },
    IN_TRANSIT: { label: 'On Route',     cls: 'badge-warning' },
    HELD:       { label: 'Under Review', cls: 'badge-danger'  },
    REJECTED:   { label: 'Rejected',     cls: 'badge-danger'  },
    COMMITTED:  { label: 'Committed',    cls: 'badge-primary' },
    CREATED:    { label: 'Processing',   cls: 'badge-neutral' },
  };
  const { label, cls } = map[status] || { label: status, cls: 'badge-neutral' };
  return <span className={`badge ${cls}`}>{label}</span>;
}

function KpiCard({ icon, iconBg, iconColor, value, label, badge, badgeColor, badgeBg }) {
  return (
    <div className="card" style={{ padding: '22px 24px', display: 'flex', alignItems: 'center', gap: '18px' }}>
      <div style={{ width: '54px', height: '54px', borderRadius: '16px', background: iconBg, color: iconColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {value}
          </span>
          {badge && (
            <span style={{ background: badgeBg, color: badgeColor, fontSize: '0.725rem', fontWeight: 700,
              padding: '2px 8px', borderRadius: 'var(--radius-pill)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, body, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
      <div style={{ marginBottom: '14px', opacity: 0.45 }}>{icon}</div>
      <h3 style={{ color: 'var(--text-primary)', marginBottom: '6px', fontSize: '1rem' }}>{title}</h3>
      {body && <p style={{ fontSize: '0.875rem', marginBottom: '16px' }}>{body}</p>}
      {action}
    </div>
  );
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em',
          color: 'var(--text-primary)', marginBottom: '4px' }}>{title}</h1>
        {subtitle && <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const SHIPMENT_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'On Route', value: 'IN_TRANSIT' },
  { label: 'Processing', value: 'CREATED' },
  { label: 'Under Review', value: 'HELD' },
];

﻿function OverviewTab({ shipments, loading, onRefresh }) {
  const stats = {
    total:       shipments.length,
    inTransit:   shipments.filter(s => s.status === 'IN_TRANSIT').length,
    delivered:   shipments.filter(s => s.status === 'DELIVERED').length,
    excursions:  shipments.filter(s => s.has_excursion).length,
    needsReview: shipments.filter(s => ['HELD','UNDER_REVIEW','REJECTED'].includes(s.status)).length,
  };
  const recent = [...shipments]
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
    .slice(0, 5);
  return (
    <>
      <SectionHeader title="Overview"
        subtitle="Live operational metrics across all pharmaceutical consignments."
        action={
          <button onClick={onRefresh} className="btn btn-secondary btn-sm"
            style={{ borderRadius: 'var(--radius-pill)', display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px' }}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /><span>Refresh</span>
          </button>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        <KpiCard icon={<Package size={24} />} iconBg="#eef0fe" iconColor="#5051f9"
          value={stats.total} label="Total Shipments"
          badge={<><TrendingUp size={11} /> Active</>} badgeColor="#10b981" badgeBg="#e6f9ed" />
        <KpiCard icon={<Truck size={24} />} iconBg="#e0f8fb" iconColor="#06b6d4"
          value={stats.inTransit} label="In Transit"
          badge={stats.inTransit > 0 ? 'Live' : 'None'} badgeColor="#06b6d4" badgeBg="#e0f8fb" />
        <KpiCard icon={<CheckCircle2 size={24} />} iconBg="#e6f9ed" iconColor="#10b981"
          value={stats.delivered} label="Delivered"
          badge={<><TrendingUp size={11} /> Completed</>} badgeColor="#10b981" badgeBg="#e6f9ed" />
        <KpiCard icon={<Thermometer size={24} />} iconBg="#fff1e9" iconColor="#f97316"
          value={stats.excursions} label="Temp Excursions"
          badge={stats.excursions > 0 ? 'Alert' : 'Clear'}
          badgeColor={stats.excursions > 0 ? '#ef4444' : '#10b981'}
          badgeBg={stats.excursions > 0 ? '#fef0f0' : '#e6f9ed'} />
        <KpiCard icon={<AlertTriangle size={24} />} iconBg="#fef6e7" iconColor="#f59e0b"
          value={stats.needsReview} label="Requiring Review"
          badge={stats.needsReview > 0 ? 'Action Needed' : 'All Clear'}
          badgeColor={stats.needsReview > 0 ? '#ef4444' : '#10b981'}
          badgeBg={stats.needsReview > 0 ? '#fef0f0' : '#e6f9ed'} />
      </div>
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 className="card-title" style={{ margin: 0 }}>Recent Activity</h2>
          <Link to="/admin?tab=shipments" className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: 'var(--radius-pill)', padding: '7px 16px', fontSize: '0.8rem' }}>
            View All <ArrowRight size={13} />
          </Link>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <RefreshCw size={22} className="spin" style={{ margin: '0 auto 10px' }} /><p>Loading...</p>
          </div>
        ) : recent.length === 0 ? (
          <EmptyState icon={<Package size={40} />} title="No Shipments Yet"
            body="Create your first shipment to get started."
            action={<Link to="/admin/shipments/new" className="btn btn-primary btn-sm">Create Shipment</Link>} />
        ) : (
          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead><tr>
                <th>Order ID</th><th>Medicine</th><th>Route</th>
                <th>Temp Range</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th>
              </tr></thead>
              <tbody>
                {recent.map(s => (
                  <tr key={s.id}>
                    <td><span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>#{s.shipment_id}</span></td>
                    <td>
                      <strong style={{ color: 'var(--text-primary)' }}>{s.medicine_name}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Batch: {s.batch_number}</div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{s.origin} {'->'} {s.destination}</td>
                    <td>
                      <span className="mono" style={{ background: '#f4f6fa', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>
                        {s.min_temp}C - {s.max_temp}C
                      </span>
                    </td>
                    <td><StatusBadge status={s.status} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/admin/shipments/${s.shipment_id}`} className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', fontSize: '0.78rem' }}>
                        Details <ArrowRight size={12} />
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

﻿function ShipmentsTab({ shipments, loading, onRefresh, statusFilter, setStatusFilter }) {
  return (
    <>
      <SectionHeader title="Shipments"
        subtitle="All pharmaceutical consignments with cryptographic tracking."
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={onRefresh} className="btn btn-secondary btn-sm"
              style={{ borderRadius: 'var(--radius-pill)', display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px' }}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} /><span>Refresh</span>
            </button>
            <Link to="/admin/shipments/new" className="btn btn-primary"
              style={{ borderRadius: 'var(--radius-pill)', padding: '10px 22px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PlusCircle size={16} /> Add Shipment
            </Link>
          </div>
        } />
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '6px', background: 'var(--surface)', padding: '4px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)' }}>
            {SHIPMENT_FILTERS.map(tab => {
              const active = statusFilter === tab.value;
              return (
                <button key={tab.value} onClick={() => setStatusFilter(tab.value)} style={{
                  background: active ? 'var(--cc-blue-500)' : 'transparent',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  border: 'none', borderRadius: 'var(--radius-pill)',
                  padding: '6px 16px', fontSize: '0.8rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s ease'
                }}>{tab.label}</button>
              );
            })}
          </div>
          <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            {shipments.length} record{shipments.length !== 1 ? 's' : ''}
          </span>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
            <p>Loading shipment records...</p>
          </div>
        ) : shipments.length === 0 ? (
          <EmptyState icon={<Package size={40} />} title="No Shipments Found"
            body="No shipments match your criteria."
            action={<Link to="/admin/shipments/new" className="btn btn-primary btn-sm">Create One Now</Link>} />
        ) : (
          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead><tr>
                <th>Order ID</th><th>Medicine / Batch</th><th>Origin</th><th>Destination</th>
                <th>Temp Range</th><th>Transporter</th><th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr></thead>
              <tbody>
                {shipments.map(s => (
                  <tr key={s.id}>
                    <td><span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>#{s.shipment_id}</span></td>
                    <td>
                      <strong style={{ color: 'var(--text-primary)' }}>{s.medicine_name}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Batch: {s.batch_number}</div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{s.origin}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{s.destination}</td>
                    <td>
                      <span className="mono" style={{ background: '#f4f6fa', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>
                        {s.min_temp}C - {s.max_temp}C
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>
                      {s.assignment?.transporter_full_name || s.assignment?.transporter_username ||
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unassigned</span>}
                    </td>
                    <td><StatusBadge status={s.status} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/admin/shipments/${s.shipment_id}`} className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '0.785rem' }}>
                        Details <ArrowRight size={13} />
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

﻿function TempLogsTab({ shipments, loading }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const rows = shipments.map(s => {
    const latest = s.latest_temperature;
    const inRange = (latest !== undefined && latest !== null)
      ? (latest >= s.min_temp && latest <= s.max_temp) : null;
    return { ...s, latest, inRange, excursion: s.has_excursion };
  });
  const filtered = rows.filter(r => {
    if (filter === 'excursion' && !r.excursion) return false;
    if (filter === 'clear' && r.excursion) return false;
    if (search && !r.shipment_id.toLowerCase().includes(search.toLowerCase())
      && !r.medicine_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const excCount = rows.filter(r => r.excursion).length;
  const clrCount = rows.filter(r => !r.excursion && r.latest !== null && r.latest !== undefined).length;
  return (
    <>
      <SectionHeader title="Temperature Logs"
        subtitle="Live sensor readings, threshold compliance, and excursion detection." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '18px', marginBottom: '24px' }}>
        <KpiCard icon={<Thermometer size={22} />} iconBg="#eef0fe" iconColor="#5051f9" value={rows.length} label="Monitored Shipments" />
        <KpiCard icon={<AlertTriangle size={22} />} iconBg="#fef0f0" iconColor="#ef4444" value={excCount} label="Temperature Excursions"
          badge={excCount > 0 ? 'Alert' : 'Clear'} badgeColor={excCount > 0 ? '#ef4444' : '#10b981'} badgeBg={excCount > 0 ? '#fef0f0' : '#e6f9ed'} />
        <KpiCard icon={<CheckCircle2 size={22} />} iconBg="#e6f9ed" iconColor="#10b981" value={clrCount} label="Within Safe Range" />
      </div>
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '6px', background: 'var(--surface)', padding: '4px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)' }}>
            {[['all','All'],['excursion','Excursions'],['clear','In Range']].map(([val,lbl]) => (
              <button key={val} onClick={() => setFilter(val)} style={{
                background: filter === val ? 'var(--cc-blue-500)' : 'transparent',
                color: filter === val ? '#fff' : 'var(--text-secondary)',
                border: 'none', borderRadius: 'var(--radius-pill)',
                padding: '6px 16px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s'
              }}>{lbl}</button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search shipment..."
              style={{ paddingLeft: '30px', paddingRight: '12px', paddingTop: '7px', paddingBottom: '7px',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', fontSize: '0.82rem', outline: 'none', width: '200px' }} />
          </div>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>
            <RefreshCw size={22} className="spin" style={{ margin: '0 auto 10px' }} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Thermometer size={40} />} title="No Records Found" body="No shipments match your filter." />
        ) : (
          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead><tr>
                <th>Shipment ID</th><th>Medicine</th><th>Safe Range</th>
                <th>Latest Reading</th><th>Compliance</th><th>Status</th>
                <th style={{ textAlign: 'right' }}>Details</th>
              </tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td><span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>#{r.shipment_id}</span></td>
                    <td><strong>{r.medicine_name}</strong><div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{r.batch_number}</div></td>
                    <td><span className="mono" style={{ background: '#f4f6fa', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>{r.min_temp}C - {r.max_temp}C</span></td>
                    <td>
                      {r.latest !== null && r.latest !== undefined ? (
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: r.inRange ? '#10b981' : '#ef4444' }}>{r.latest}C</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.82rem' }}>No readings</span>
                      )}
                    </td>
                    <td>
                      {r.latest !== null && r.latest !== undefined ? (r.inRange ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#10b981', fontWeight: 600, fontSize: '0.82rem' }}>
                          <CheckCircle2 size={14} /> In Range
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#ef4444', fontWeight: 600, fontSize: '0.82rem' }}>
                          <AlertCircle size={14} /> Excursion
                        </span>
                      )) : <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>-</span>}
                    </td>
                    <td><StatusBadge status={r.status} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/admin/shipments/${r.shipment_id}`} className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', fontSize: '0.78rem' }}>
                        View <ArrowRight size={12} />
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

﻿function AuditTab({ shipments, loading }) {
  const [verifying, setVerifying] = useState(null);
  const [results, setResults] = useState({});
  const handleVerify = async (shipmentId) => {
    setVerifying(shipmentId);
    try {
      const r = await runVerification(shipmentId);
      setResults(prev => ({ ...prev, [shipmentId]: r }));
    } catch (e) {
      setResults(prev => ({ ...prev, [shipmentId]: { error: e.message } }));
    } finally {
      setVerifying(null);
    }
  };
  const auditable = shipments.filter(s =>
    ['DELIVERED','COMMITTED','APPROVED','REJECTED','HELD'].includes(s.status)
  );
  const verifiedCount = Object.values(results).filter(r => r && !r.error).length;
  return (
    <>
      <SectionHeader title="Verification & Audit"
        subtitle="Run cryptographic integrity checks: SHA-256 hash chains, Ed25519 digital signatures, temperature compliance." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '18px', marginBottom: '24px' }}>
        <KpiCard icon={<ClipboardList size={22} />} iconBg="#eef0fe" iconColor="#5051f9" value={auditable.length} label="Auditable Shipments" />
        <KpiCard icon={<ShieldCheck size={22} />} iconBg="#e6f9ed" iconColor="#10b981" value={verifiedCount} label="Verified This Session" />
        <KpiCard icon={<Hash size={22} />} iconBg="#e0f8fb" iconColor="#06b6d4" value="SHA-256" label="Hash Chain Algorithm" />
        <KpiCard icon={<Key size={22} />} iconBg="#f3eefd" iconColor="#8b5cf6" value="Ed25519" label="Signature Algorithm" />
      </div>
      <div style={{ background: '#f8f9ff', border: '1px solid #c7d2fe', borderRadius: 'var(--radius-lg)',
        padding: '14px 18px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <Shield size={18} color="#5051f9" style={{ marginTop: '1px', flexShrink: 0 }} />
        <div style={{ fontSize: '0.83rem', color: '#4338ca', lineHeight: 1.55 }}>
          <strong>Independent cryptographic facts:</strong> Hash-chain verification, digital-signature verification,
          trusted vs. transporter reading comparison, temperature compliance, and blockchain commitment
          are each checked independently. A valid seal does not imply temperature compliance.
        </div>
      </div>
      <div className="card" style={{ padding: '24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>
            <RefreshCw size={22} className="spin" style={{ margin: '0 auto 10px' }} />
          </div>
        ) : auditable.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={40} />} title="No Auditable Shipments"
            body="Shipments become auditable once delivered, committed, or under review." />
        ) : (
          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead><tr>
                <th>Shipment</th><th>Medicine</th><th>Status</th>
                <th>Excursion</th><th>Audit Result</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr></thead>
              <tbody>
                {auditable.map(s => {
                  const res = results[s.shipment_id];
                  const isV = verifying === s.shipment_id;
                  return (
                    <tr key={s.id}>
                      <td><span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>#{s.shipment_id}</span></td>
                      <td><strong>{s.medicine_name}</strong><div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{s.batch_number}</div></td>
                      <td><StatusBadge status={s.status} /></td>
                      <td>
                        {s.has_excursion ? (
                          <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <AlertCircle size={13} /> Yes
                          </span>
                        ) : (
                          <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={13} /> None
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {res ? (res.error ? (
                          <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <XCircle size={13} /> Error
                          </span>
                        ) : (
                          <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <ShieldCheck size={13} /> Passed
                          </span>
                        )) : (
                          <span style={{ color: 'var(--text-muted)' }}>
                            {s.latest_verification ? 'Previously run' : 'Not run'}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button onClick={() => handleVerify(s.shipment_id)} disabled={isV}
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', fontSize: '0.78rem' }}>
                            {isV ? <><RefreshCw size={12} className="spin" /> Checking...</> : <><ShieldCheck size={12} /> Run Audit</>}
                          </button>
                          <Link to={`/admin/shipments/${s.shipment_id}`} className="btn btn-secondary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', fontSize: '0.78rem' }}>
                            <Eye size={12} />
                          </Link>
                        </div>
                      </td>
                    </tr>
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

﻿function ReportsTab({ shipments, loading }) {
  const [downloading, setDownloading] = useState(null);
  const handleDownload = async (shipmentId) => {
    setDownloading(shipmentId);
    try { await downloadReport(shipmentId); }
    catch (e) { alert('Failed to download report: ' + e.message); }
    finally { setDownloading(null); }
  };
  const reportable = shipments.filter(s =>
    ['DELIVERED','COMMITTED','APPROVED','REJECTED','HELD'].includes(s.status)
  );
  return (
    <>
      <SectionHeader title="Reports"
        subtitle="Download verified cryptographic PDF reports for delivered or audited shipments." />
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-lg)',
        padding: '14px 18px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <FileText size={18} color="#059669" style={{ marginTop: '1px', flexShrink: 0 }} />
        <div style={{ fontSize: '0.83rem', color: '#065f46', lineHeight: 1.55 }}>
          <strong>PDF reports</strong> include the full audit trail: shipment metadata, temperature log,
          hash chain verification, Ed25519 signature validation, trusted vs. transporter comparison,
          and blockchain commitment status. Reports can also be shared via WhatsApp, Telegram, email,
          or a secure link from the shipment detail page.
        </div>
      </div>
      <div className="card" style={{ padding: '24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>
            <RefreshCw size={22} className="spin" style={{ margin: '0 auto 10px' }} />
          </div>
        ) : reportable.length === 0 ? (
          <EmptyState icon={<FileText size={40} />} title="No Reports Available"
            body="Reports are generated once a shipment has been delivered or audited." />
        ) : (
          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead><tr>
                <th>Shipment ID</th><th>Medicine / Batch</th><th>Route</th>
                <th>Excursion</th><th>Status</th><th style={{ textAlign: 'right' }}>Download</th>
              </tr></thead>
              <tbody>
                {reportable.map(s => (
                  <tr key={s.id}>
                    <td><span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>#{s.shipment_id}</span></td>
                    <td><strong>{s.medicine_name}</strong><div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{s.batch_number}</div></td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.83rem' }}>{s.origin} {'→'} {s.destination}</td>
                    <td>
                      {s.has_excursion ? (
                        <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <AlertCircle size={13} /> Flagged
                        </span>
                      ) : (
                        <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} /> Clean
                        </span>
                      )}
                    </td>
                    <td><StatusBadge status={s.status} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleDownload(s.shipment_id)}
                          disabled={downloading === s.shipment_id}
                          className="btn btn-primary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 14px', fontSize: '0.78rem' }}>
                          {downloading === s.shipment_id
                            ? <><RefreshCw size={12} className="spin" /> Generating...</>
                            : <><Download size={12} /> PDF</>}
                        </button>
                        <Link to={`/admin/shipments/${s.shipment_id}`} className="btn btn-secondary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', fontSize: '0.78rem' }}>
                          <ArrowRight size={12} />
                        </Link>
                      </div>
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

export default function AdminDashboard() {
  const location = useLocation();
  const tab = new URLSearchParams(location.search).get('tab') || 'overview';
  const [allShipments, setAllShipments] = useState([]);
  const [filteredShipments, setFilteredShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');

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

  useEffect(() => { fetchShipments(); }, [fetchShipments]);

  useEffect(() => {
    setFilteredShipments(
      statusFilter ? allShipments.filter(s => s.status === statusFilter) : allShipments
    );
  }, [allShipments, statusFilter]);

  return (
    <div style={{ padding: '32px 36px 60px', maxWidth: '1600px', margin: '0 auto' }}>
      {error && <div className="alert alert-danger" style={{ marginBottom: '20px' }}>{error}</div>}
      {tab === 'overview'   && <OverviewTab shipments={allShipments} loading={loading} onRefresh={fetchShipments} />}
      {tab === 'shipments'  && <ShipmentsTab shipments={filteredShipments} loading={loading} onRefresh={fetchShipments} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />}
      {tab === 'monitoring' && <TempLogsTab shipments={allShipments} loading={loading} />}
      {tab === 'audit'      && <AuditTab shipments={allShipments} loading={loading} />}
      {tab === 'reports'    && <ReportsTab shipments={allShipments} loading={loading} />}
    </div>
  );
}

