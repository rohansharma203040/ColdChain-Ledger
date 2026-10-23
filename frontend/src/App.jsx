import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Layouts
import AdminLayout from './layouts/AdminLayout';
import TransporterLayout from './layouts/TransporterLayout';

// Landing & 404
import Landing from './pages/Landing';
import NotFound from './pages/NotFound';

// Portal 1: Admin/Sender & Receiver pages
import AdminLogin from './pages/admin/AdminLogin';
import ReceiverLogin from './pages/receiver/ReceiverLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import CreateShipment from './pages/admin/CreateShipment';
import AdminShipmentDetail from './pages/admin/AdminShipmentDetail';
import ReceiverDashboard from './pages/receiver/ReceiverDashboard';
import ReceiverShipmentDetail from './pages/receiver/ReceiverShipmentDetail';

// Portal 2: Transporter pages
import TransporterLogin from './pages/transporter/TransporterLogin';
import TransporterDashboard from './pages/transporter/TransporterDashboard';
import TransporterShipment from './pages/transporter/TransporterShipment';

// ── Role Guard with Strict Non-Escalation ─────────────────────────────────────
function RequireRole({ role, children, redirectTo = '/' }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="spinner" style={{ width: '36px', height: '36px', border: '3px solid var(--border)', borderTopColor: 'var(--cc-teal-400)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  // Not logged in -> go to login screen
  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  // Logged in with different role -> prevent permission escalation, bounce to own portal
  if (role && user.role !== role) {
    if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
    if (user.role === 'RECEIVER') return <Navigate to="/receiver" replace />;
    if (user.role === 'TRANSPORTER') return <Navigate to="/transporter" replace />;
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Landing */}
          <Route path="/" element={<Landing />} />

          {/* ══════════════════════════════════════════════════════════════
              PORTAL 1: ADMIN & RECEIVER (Shared Application Shell)
              ══════════════════════════════════════════════════════════════ */}
          {/* Admin / Sender Experience */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={
            <RequireRole role="ADMIN" redirectTo="/admin/login">
              <AdminLayout portalName="Admin" />
            </RequireRole>
          }>
            <Route index element={<AdminDashboard />} />
            <Route path="shipments/new" element={<CreateShipment />} />
            <Route path="shipments/:shipmentId" element={<AdminShipmentDetail />} />
          </Route>

          {/* Receiver / Quality Inspector Experience */}
          <Route path="/receiver/login" element={<ReceiverLogin />} />
          <Route path="/receiver" element={
            <RequireRole role="RECEIVER" redirectTo="/receiver/login">
              <AdminLayout portalName="Receiver" />
            </RequireRole>
          }>
            <Route index element={<ReceiverDashboard />} />
            <Route path="shipments/:shipmentId" element={<ReceiverShipmentDetail />} />
          </Route>

          {/* ══════════════════════════════════════════════════════════════
              PORTAL 2: TRANSPORTER (Dedicated Mobile-First Shell)
              ══════════════════════════════════════════════════════════════ */}
          <Route path="/transporter/login" element={<TransporterLogin />} />
          <Route path="/transporter" element={
            <RequireRole role="TRANSPORTER" redirectTo="/transporter/login">
              <TransporterLayout />
            </RequireRole>
          }>
            <Route index element={<TransporterDashboard />} />
            <Route path="shipments/:shipmentId" element={<TransporterShipment />} />
          </Route>

          {/* 404 Not Found Page */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
