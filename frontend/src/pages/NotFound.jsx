import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Home, Truck, ShieldCheck, ClipboardCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function NotFound() {
  const { user } = useAuth();

  const getPortalHome = () => {
    if (!user) return '/';
    if (user.role === 'ADMIN') return '/admin';
    if (user.role === 'RECEIVER') return '/receiver';
    if (user.role === 'TRANSPORTER') return '/transporter';
    return '/';
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      padding: '24px'
    }}>
      <div className="card" style={{ maxWidth: '520px', width: '100%', textAlign: 'center', padding: '40px 24px' }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(239, 68, 68, 0.15)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px'
        }}>
          <ShieldAlert size={32} color="#ef4444" />
        </div>

        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '8px' }}>404 — Page Not Found</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px', lineHeight: 1.6 }}>
          The requested route does not exist or you do not have permission to access it.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '320px', margin: '0 auto 24px' }}>
          <Link to={getPortalHome()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Home size={16} />
            <span>Go to {user ? `${user.role} Dashboard` : 'Home'}</span>
          </Link>

          {!user && (
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
              <Link to="/admin/login" className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={14} />
                <span>Admin Login</span>
              </Link>
              <Link to="/receiver/login" className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ClipboardCheck size={14} />
                <span>Receiver</span>
              </Link>
              <Link to="/transporter/login" className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Truck size={14} />
                <span>Transporter</span>
              </Link>
            </div>
          )}
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          ColdChain Ledger PS08 • Tamper-Evident Transport System
        </div>
      </div>
    </div>
  );
}
