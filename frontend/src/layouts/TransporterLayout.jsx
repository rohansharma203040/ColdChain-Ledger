import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Truck, LogOut, User } from 'lucide-react';

export default function TransporterLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="app-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="navbar" style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <NavLink to="/transporter" className="navbar-brand">
            <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #10b981, #0d9488)' }}>
              <Truck size={18} color="#fff" />
            </div>
            <span style={{ fontSize: '1rem' }}>Driver Portal</span>
          </NavLink>
          <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
            TRANSPORTER
          </span>
        </div>

        <div className="navbar-right" style={{ gap: '8px' }}>
          <div style={{ display: 'none', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }} className="user-desktop">
            <User size={14} />
            <span>{user?.full_name || user?.username}</span>
          </div>

          <button 
            onClick={handleLogout} 
            className="btn btn-secondary btn-sm"
            style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <LogOut size={14} />
            <span style={{ fontSize: '0.75rem' }}>Logout</span>
          </button>
        </div>
      </header>

      <main className="main-content" style={{ flex: 1, padding: '16px' }}>
        <Outlet />
      </main>
    </div>
  );
}
