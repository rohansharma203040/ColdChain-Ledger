import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Truck, 
  ArrowLeft, 
  RefreshCw, 
  PlayCircle, 
  CheckCircle2, 
  Thermometer, 
  AlertTriangle, 
  Send
} from 'lucide-react';
import { 
  getShipment, 
  getReadings, 
  startJourney, 
  markDelivered, 
  submitReading 
} from '../../services/api';

export default function TransporterShipment() {
  const { shipmentId } = useParams();
  const [shipment, setShipment] = useState(null);
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');

  // Form for new reading
  const [tempInput, setTempInput] = useState('');
  const [notesInput, setNotesInput] = useState('');

  const loadShipmentData = async () => {
    setLoading(true);
    setError('');
    try {
      const [sData, rData] = await Promise.all([
        getShipment(shipmentId),
        getReadings(shipmentId).catch(() => [])
      ]);
      setShipment(sData);
      setReadings(rData);
    } catch (err) {
      setError(err.message || 'Failed to load consignment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShipmentData();
  }, [shipmentId]);

  const handleStartJourney = async () => {
    if (!window.confirm('Are you ready to depart? This initiates the cold chain transit log.')) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await startJourney(shipmentId);
      setMessage('Journey successfully started! You may now submit periodic checkpoint readings.');
      loadShipmentData();
    } catch (err) {
      setError(err.message || 'Failed to start journey.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkDelivered = async () => {
    if (!window.confirm('Confirm consignment arrival at destination receiver hub?')) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await markDelivered(shipmentId);
      setMessage('Shipment marked as DELIVERED. Receiver has been notified for quality inspection.');
      loadShipmentData();
    } catch (err) {
      setError(err.message || 'Failed to mark delivered.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReading = async (e) => {
    e.preventDefault();
    if (tempInput === '') return;

    setSubmitting(true);
    setError('');
    setMessage('');
    setWarning('');

    const tempVal = parseFloat(tempInput);
    const nowIso = new Date().toISOString();

    try {
      const res = await submitReading(shipmentId, tempVal, nowIso, notesInput.trim());
      setMessage(`Checkpoint #${res.reading.sequence_number} recorded: ${tempVal}°C.`);
      if (res.out_of_range_warning) {
        setWarning(`⚠️ WARNING: ${tempVal}°C is outside the required ${shipment.min_temp}°C - ${shipment.max_temp}°C safe limits!`);
      }
      setTempInput('');
      setNotesInput('');
      loadShipmentData();
    } catch (err) {
      setError(err.message || 'Failed to submit reading.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center', padding: '60px 16px' }}>
        <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: 'var(--cc-teal-400)' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading consignment controls...</p>
      </div>
    );
  }

  if (error && !shipment) {
    return (
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <Link to="/transporter" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
          <ArrowLeft size={16} />
          <span>Back to Shipments</span>
        </Link>
        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', color: '#ef4444' }}>
          {error}
        </div>
      </div>
    );
  }

  const isCreated = shipment.status === 'CREATED' || shipment.status === 'COMMITTED';
  const isInTransit = shipment.status === 'IN_TRANSIT';
  const isFinished = ['DELIVERED', 'APPROVED', 'HELD', 'REJECTED'].includes(shipment.status);

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div>
        <Link to="/transporter" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          <ArrowLeft size={16} />
          <span>Back to Shipments</span>
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
              {shipment.shipment_id}
            </h1>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {shipment.medicine_name} • {shipment.vehicle_registration}
            </div>
          </div>
          <span className={`badge ${
            shipment.status === 'IN_TRANSIT' ? 'badge-warning' : 
            shipment.status === 'DELIVERED' ? 'badge-primary' : 
            shipment.status === 'APPROVED' ? 'badge-success' : 'badge-neutral'
          }`}>
            {shipment.status}
          </span>
        </div>
      </div>

      {message && (
        <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: 'var(--radius-md)', color: '#10b981', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={16} />
          <span>{message}</span>
        </div>
      )}

      {warning && (
        <div style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', borderRadius: 'var(--radius-md)', color: '#f59e0b', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} />
          <span>{warning}</span>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Target Spec Card */}
      <div className="card" style={{ padding: '16px', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
          <span style={{ color: 'var(--text-muted)' }}>Safe Temperature Range:</span>
          <strong style={{ color: 'var(--cc-teal-400)', fontSize: '1rem' }}>{shipment.min_temp}°C to {shipment.max_temp}°C</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <span>Route: {shipment.origin} → {shipment.destination}</span>
          <span>Interval: Every {shipment.reading_interval_minutes}m</span>
        </div>
      </div>

      {/* JOURNEY ACTION 1: START JOURNEY */}
      {isCreated && (
        <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
          <PlayCircle size={40} color="var(--cc-teal-400)" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px' }}>Ready for Departure</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Click below when loading is complete and your vehicle departs the origin cold storage facility.
          </p>
          <button
            onClick={handleStartJourney}
            disabled={submitting}
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 600, background: 'linear-gradient(135deg, #0d9488, #059669)' }}
          >
            {submitting ? 'Starting Journey...' : 'Start Transit Journey'}
          </button>
        </div>
      )}

      {/* JOURNEY ACTION 2: IN TRANSIT SUBMISSION FORM */}
      {isInTransit && (
        <>
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--cc-teal-400)' }}>
              <Thermometer size={18} />
              <span>Log Checkpoint Reading</span>
            </h3>

            <form onSubmit={handleSubmitReading}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Measured Vehicle Temperature (°C) *
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="number"
                    step="0.1"
                    value={tempInput}
                    onChange={(e) => setTempInput(e.target.value)}
                    placeholder="e.g. 4.5"
                    required
                    style={{
                      flex: 1,
                      padding: '12px',
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)'
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontWeight: 700 }}>
                    °C
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Notes / Location (Optional)
                </label>
                <input
                  type="text"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="e.g. Highway toll checkpoint, reefer compressor running normally"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={submitting || tempInput === ''}
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'linear-gradient(135deg, #0d9488, #059669)' }}
              >
                <Send size={16} />
                <span>{submitting ? 'Submitting...' : 'Submit Checkpoint'}</span>
              </button>
            </form>

            <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              🔒 Server records non-repudiation reception timestamp upon receipt.
            </div>
          </div>

          {/* Confirm Delivery button */}
          <div className="card" style={{ padding: '16px', textAlign: 'center', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '6px' }}>Reached Destination Hub?</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Once cargo is parked at the receiving warehouse dock, mark the consignment as delivered.
            </p>
            <button
              onClick={handleMarkDelivered}
              disabled={submitting}
              className="btn btn-secondary"
              style={{ width: '100%', padding: '10px', fontWeight: 600, color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)' }}
            >
              Confirm Consignment Delivery
            </button>
          </div>
        </>
      )}

      {/* DELIVERED STATE */}
      {isFinished && (
        <div className="card" style={{ padding: '20px', textAlign: 'center', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid #10b981' }}>
          <CheckCircle2 size={36} color="#10b981" style={{ margin: '0 auto 8px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
            Consignment Transit Completed
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Delivered at: {shipment.delivered_at ? new Date(shipment.delivered_at).toLocaleString() : 'Yes'}.<br />
            Status: <strong>{shipment.status}</strong>
          </p>
        </div>
      )}

      {/* RECENT LOGGED READINGS LIST */}
      <div className="card" style={{ padding: '16px' }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px' }}>
          Submitted Checkpoint Log ({readings.length})
        </h4>

        {readings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No readings recorded yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {readings.map(r => (
              <div 
                key={r.id} 
                style={{
                  padding: '10px 12px',
                  background: 'var(--surface)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.85rem',
                  borderLeft: r.is_out_of_range ? '3px solid var(--status-failed)' : '3px solid var(--status-verified)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong>Seq #{r.sequence_number}:</strong>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: r.is_out_of_range ? 'var(--status-failed)' : 'var(--text-primary)' }}>
                      {r.temperature_celsius}°C
                    </span>
                    {r.is_out_of_range && (
                      <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>EXCURSION</span>
                    )}
                  </div>
                  {r.notes && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {r.notes}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <div>Logged: {new Date(r.measured_at).toLocaleTimeString()}</div>
                  <div>Server: {new Date(r.server_received_at).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
