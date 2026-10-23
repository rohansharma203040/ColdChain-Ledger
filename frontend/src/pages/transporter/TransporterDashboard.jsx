import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Truck, 
  Package, 
  RefreshCw, 
  ArrowRight
} from 'lucide-react';
import { getShipments } from '../../services/api';

export default function TransporterDashboard() {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAssigned = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getShipments();
      setShipments(data);
    } catch (err) {
      setError(err.message || 'Failed to load assigned shipments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssigned();
  }, []);

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
            My Active Shipments
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Select an active consignment to start journey or submit readings.
          </p>
        </div>

        <button 
          onClick={fetchAssigned}
          className="btn btn-secondary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px' }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', color: '#ef4444', marginBottom: '16px', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: 'var(--cc-teal-400)' }} />
          <p>Fetching assigned shipments...</p>
        </div>
      ) : shipments.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
          <Truck size={36} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
          <h3 style={{ color: 'var(--text-primary)', marginBottom: '4px' }}>No Assigned Shipments</h3>
          <p style={{ fontSize: '0.85rem' }}>You do not currently have any active medicine transport consignments assigned.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {shipments.map(s => {
            const isTransit = s.status === 'IN_TRANSIT';
            const isDelivered = s.status === 'DELIVERED' || s.status === 'APPROVED' || s.status === 'HELD';
            return (
              <Link 
                key={s.id} 
                to={`/transporter/shipments/${s.shipment_id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div 
                  className="card"
                  style={{
                    padding: '16px',
                    borderLeft: isTransit ? '4px solid var(--status-mismatch)' : isDelivered ? '4px solid var(--status-verified)' : '4px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                        {s.shipment_id}
                      </span>
                      <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                        {s.medicine_name} • {s.vehicle_registration}
                      </div>
                    </div>
                    <span className={`badge ${
                      s.status === 'IN_TRANSIT' ? 'badge-warning' : 
                      s.status === 'DELIVERED' ? 'badge-primary' : 
                      s.status === 'APPROVED' ? 'badge-success' : 'badge-neutral'
                    }`} style={{ fontSize: '0.75rem' }}>
                      {s.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--surface)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                    <span>Route: <strong>{s.origin} → {s.destination}</strong></span>
                    <span>Target: <strong style={{ color: 'var(--cc-teal-400)' }}>{s.min_temp}°C - {s.max_temp}°C</strong></span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {s.transporter_reading_count} checkpoints logged
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--cc-teal-400)', fontWeight: 600 }}>
                      <span>Open Controls</span>
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
