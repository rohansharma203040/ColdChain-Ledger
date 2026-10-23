import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Package, 
  ArrowLeft, 
  Save, 
  AlertCircle, 
  CheckCircle2, 
  Truck, 
  Thermometer
} from 'lucide-react';
import { createShipment, getTransporters, initTrustedData } from '../../services/api';

export default function CreateShipment() {
  const navigate = useNavigate();
  const [transporters, setTransporters] = useState([]);
  const [loadingTransporters, setLoadingTransporters] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [form, setForm] = useState({
    shipment_id: `SHIP-${Math.floor(1000 + Math.random() * 9000)}`,
    medicine_name: 'Insulin Glargine',
    batch_number: `BAT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    origin: 'Chennai Cold Storage Hub',
    destination: 'Bengaluru Distribution Center',
    vehicle_registration: 'TN-09-CC-4821',
    min_temp: 2.0,
    max_temp: 8.0,
    reading_interval_minutes: 10,
    transporter_username: '',
    notes: 'Priority cold chain medical shipment. Maintain continuous 2-8°C refrigeration.',
    auto_init_sensor: true,
  });

  useEffect(() => {
    async function loadTransporters() {
      try {
        const list = await getTransporters();
        setTransporters(list);
        if (list.length > 0) {
          setForm(prev => ({ ...prev, transporter_username: list[0].username }));
        }
      } catch (err) {
        console.error('Failed to load transporters', err);
      } finally {
        setLoadingTransporters(false);
      }
    }
    loadTransporters();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const payload = {
        shipment_id: form.shipment_id.trim(),
        medicine_name: form.medicine_name.trim(),
        batch_number: form.batch_number.trim(),
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        vehicle_registration: form.vehicle_registration.trim(),
        min_temp: parseFloat(form.min_temp),
        max_temp: parseFloat(form.max_temp),
        reading_interval_minutes: parseInt(form.reading_interval_minutes, 10),
        transporter_username: form.transporter_username || undefined,
        notes: form.notes,
      };

      const created = await createShipment(payload);

      // Optionally initialize sensor baseline telemetry
      if (form.auto_init_sensor) {
        try {
          const sampleTemps = [4.2, 4.5, 4.9, 5.2, 4.7];
          const nowIso = new Date().toISOString();
          await initTrustedData(created.shipment_id, sampleTemps, nowIso);
        } catch (initErr) {
          console.warn('Could not auto-initialize trusted sensor:', initErr);
        }
      }

      setSuccess(`Shipment ${created.shipment_id} created successfully!`);
      setTimeout(() => {
        navigate(`/admin/shipments/${created.shipment_id}`);
      }, 1000);
    } catch (err) {
      setError(err.message || 'Failed to create shipment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '800px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link to="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          <ArrowLeft size={16} />
          <span>Back to Shipments</span>
        </Link>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>
          Create New Shipment
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Initialize medicine custody batch, set temperature excursion criteria, and assign driver.
        </p>
      </div>

      {error && (
        <div style={{ padding: '14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', color: '#ef4444', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div style={{ padding: '14px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: 'var(--radius-md)', color: '#10b981', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <CheckCircle2 size={18} />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Section 1: Identifier & Cargo */}
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px', color: 'var(--cc-blue-500)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={18} />
            <span>Cargo & Manifest Identifiers</span>
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Shipment ID *
              </label>
              <input
                type="text"
                name="shipment_id"
                value={form.shipment_id}
                onChange={handleChange}
                required
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Medicine Name *
              </label>
              <input
                type="text"
                name="medicine_name"
                value={form.medicine_name}
                onChange={handleChange}
                required
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Batch Number *
              </label>
              <input
                type="text"
                name="batch_number"
                value={form.batch_number}
                onChange={handleChange}
                required
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Route & Vehicle */}
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px', color: 'var(--cc-teal-400)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Truck size={18} />
            <span>Route & Transporter Assignment</span>
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Origin Hub *
              </label>
              <input
                type="text"
                name="origin"
                value={form.origin}
                onChange={handleChange}
                required
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Destination *
              </label>
              <input
                type="text"
                name="destination"
                value={form.destination}
                onChange={handleChange}
                required
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Vehicle Registration *
              </label>
              <input
                type="text"
                name="vehicle_registration"
                value={form.vehicle_registration}
                onChange={handleChange}
                required
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Assigned Transporter Driver
              </label>
              <select
                name="transporter_username"
                value={form.transporter_username}
                onChange={handleChange}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
              >
                <option value="">-- Select Driver --</option>
                {transporters.map(t => (
                  <option key={t.username} value={t.username}>
                    {t.full_name} ({t.username})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Cold Chain Thresholds */}
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Thermometer size={18} />
            <span>Temperature Thresholds & Logging Rate</span>
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Min Temp (°C) *
              </label>
              <input
                type="number"
                step="0.1"
                name="min_temp"
                value={form.min_temp}
                onChange={handleChange}
                required
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Max Temp (°C) *
              </label>
              <input
                type="number"
                step="0.1"
                name="max_temp"
                value={form.max_temp}
                onChange={handleChange}
                required
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Reading Interval (Minutes) *
              </label>
              <select
                name="reading_interval_minutes"
                value={form.reading_interval_minutes}
                onChange={handleChange}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
              >
                <option value={5}>5 Minutes</option>
                <option value={10}>10 Minutes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 4: Sensor & Cryptography */}
        <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              name="auto_init_sensor"
              checked={form.auto_init_sensor}
              onChange={handleChange}
              style={{ width: '18px', height: '18px', accentColor: 'var(--cc-blue-500)' }}
            />
            <div>
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                Initialize baseline trusted sensor records (SIMULATED)
              </strong>
              <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', margin: 0 }}>
                Generates canonical SHA-256 hash-chained records with Ed25519 digital signature manifest.
              </p>
            </div>
          </label>
        </div>

        {/* Notes */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Special Handling Instructions & Notes
          </label>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={3}
            style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
          <Link to="/admin" className="btn btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', fontWeight: 600 }}
          >
            <Save size={16} />
            <span>{submitting ? 'Creating...' : 'Create Shipment & Seal'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
