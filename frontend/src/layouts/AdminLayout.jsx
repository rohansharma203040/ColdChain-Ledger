import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  ShieldCheck, 
  Package, 
  PlusCircle, 
  LogOut, 
  ClipboardCheck,
  Search,
  LayoutDashboard,
  Thermometer,
  FileText,
  User
} from 'lucide-react';

export default function AdminLayout({ portalName }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isReceiver = portalName === 'Receiver' || user?.role === 'RECEIVER';
  const roleTitle = isReceiver ? 'Receiver Portal' : 'Admin / Sender';
  const basePath = isReceiver ? '/receiver' : '/admin';

  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get('tab') || 'overview';

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const userInitials = (user?.full_name || user?.username || 'U')
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  // Helper to determine exact single-active state
  const isItemActive = (path, tabKey) => {
    if (tabKey === 'new_shipment') {
      return location.pathname === '/admin/shipments/new';
    }
    if (location.pathname.startsWith('/admin/shipments/') && location.pathname !== '/admin/shipments/new') {
      return tabKey === 'shipments';
    }
    if (location.pathname.startsWith('/receiver/shipments/')) {
      return tabKey === 'r_shipments';
    }
    if (location.pathname === path) {
      return activeTab === tabKey;
    }
    return false;
  };

  return (
    <div className="app-shell">
      {/* ── Left Sidebar (Task-Oriented & Professional) ─────────────────── */}
      <aside className="sidebar-container" style={{ width: '240px' }}>
        <div>
          {/* Professional Brand Area */}
          <Link to={basePath} className="sidebar-brand" style={{ paddingLeft: '4px', marginBottom: '24px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#4338ca',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(67, 56, 202, 0.25)',
              flexShrink: 0
            }}>
              <ShieldCheck size={18} />
            </div>
            <div>
              <div style={{ 
                fontSize: '0.95rem', 
                fontWeight: 800, 
                letterSpacing: '-0.02em', 
                color: 'var(--text-primary)',
                lineHeight: 1.15
              }}>
                ColdChain Ledger
              </div>
              <div style={{ fontSize: '0.675rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
                {roleTitle}
              </div>
            </div>
          </Link>

          {/* Task-Oriented Navigation Links (Strictly Single-Active) */}
          <nav className="sidebar-nav">
            {/* Overview */}
            <Link
              to={basePath}
              className={`sidebar-item ${isItemActive(basePath, 'overview') ? 'active' : ''}`}
            >
              <LayoutDashboard size={17} />
              <span>Overview</span>
            </Link>

            {!isReceiver ? (
              <>
                {/* Shipments List */}
                <Link
                  to="/admin?tab=shipments"
                  className={`sidebar-item ${isItemActive('/admin', 'shipments') ? 'active' : ''}`}
                >
                  <Package size={17} />
                  <span>Shipments</span>
                </Link>

                {/* Create Shipment */}
                <Link
                  to="/admin/shipments/new"
                  className={`sidebar-item ${isItemActive('/admin/shipments/new', 'new_shipment') ? 'active' : ''}`}
                >
                  <PlusCircle size={17} />
                  <span>Create Shipment</span>
                </Link>
              </>
            ) : (
              /* Receiver: three task-focused links */
              <>
                <Link
                  to="/receiver?tab=shipments"
                  className={`sidebar-item ${isItemActive('/receiver', 'shipments') || isItemActive('/receiver', 'r_shipments') ? 'active' : ''}`}
                >
                  <ClipboardCheck size={17} />
                  <span>My Shipments</span>
                </Link>

                <Link
                  to="/receiver?tab=verify"
                  className={`sidebar-item ${isItemActive('/receiver', 'verify') ? 'active' : ''}`}
                >
                  <ShieldCheck size={17} />
                  <span>Verification & Reports</span>
                </Link>
              </>
            )}

            {/* Admin-only: Temperature Logs, Audit, Reports */}
            {!isReceiver && (
              <>
                <Link
                  to={`${basePath}?tab=monitoring`}
                  className={`sidebar-item ${isItemActive(basePath, 'monitoring') ? 'active' : ''}`}
                >
                  <Thermometer size={17} />
                  <span>Temperature Logs</span>
                </Link>

                <Link
                  to={`${basePath}?tab=audit`}
                  className={`sidebar-item ${isItemActive(basePath, 'audit') ? 'active' : ''}`}
                >
                  <ShieldCheck size={17} />
                  <span>Verification & Audit</span>
                </Link>

                <Link
                  to={`${basePath}?tab=reports`}
                  className={`sidebar-item ${isItemActive(basePath, 'reports') ? 'active' : ''}`}
                >
                  <FileText size={17} />
                  <span>Reports</span>
                </Link>
              </>
            )}

            <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0 8px' }} />

            {/* Logout */}
            <button 
              onClick={handleLogout}
              className="sidebar-item"
              style={{ 
                background: 'none', 
                border: 'none', 
                width: '100%', 
                textAlign: 'left',
                color: 'var(--text-secondary)'
              }}
            >
              <LogOut size={17} />
              <span>Logout</span>
            </button>
          </nav>
        </div>

        {/* Professional Node Status Widget (No Cartoonish Promo) */}
        <div className="sidebar-status-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--status-verified)' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Ledger Node Active
            </span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
            SHA-256 Chain & Ed25519 Signatures Operational
          </div>
        </div>
      </aside>

      {/* ── Main Viewport Container ───────────────────────────────────────── */}
      <div className="content-shell">
        {/* Topbar (Clean & Aligned) */}
        <header className="topbar-container" style={{ height: '64px', padding: '0 28px' }}>
          {/* Role & Context Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Pharmaceutical Cold Chain Transport Log
            </span>
          </div>

          {/* Right section: User Profile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '4px 10px 4px 6px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: '#ffffff'
            }}>
              <div style={{
                width: '30px',
                height: '30px',
                borderRadius: '6px',
                background: isReceiver ? '#059669' : '#4338ca',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.775rem'
              }}>
                {userInitials}
              </div>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.825rem' }}>
                  {user?.full_name || user?.username || 'User'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {user?.role === 'ADMIN' ? 'Sender Admin' : user?.role === 'RECEIVER' ? 'Receiver Inspector' : 'User'}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content Outlet */}
        <main style={{ flex: 1 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
