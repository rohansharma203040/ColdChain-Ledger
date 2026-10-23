/**
 * ColdChain Ledger — API Service Layer
 * All frontend-to-backend communication goes through here.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── Auth Token Management ─────────────────────────────────────────────────

export function getToken() {
  return sessionStorage.getItem('cc_token');
}

export function setToken(token) {
  sessionStorage.setItem('cc_token', token);
}

export function clearToken() {
  sessionStorage.removeItem('cc_token');
  sessionStorage.removeItem('cc_user');
}

export function getUser() {
  const u = sessionStorage.getItem('cc_user');
  return u ? JSON.parse(u) : null;
}

export function setUser(user) {
  sessionStorage.setItem('cc_user', JSON.stringify(user));
}

// ── Core Fetch ────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 204) return null;

  // Try to parse JSON; fall back to text
  let data;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else if (contentType.includes('application/octet-stream') ||
    contentType.includes('text/csv') ||
    contentType.includes('text/plain')) {
    data = await response.blob();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const message = (data && data.error) || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────

export async function login(username, password) {
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(data.access_token);
  setUser(data.user);
  return data;
}

export async function logout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    clearToken();
  }
}

export async function getMe() {
  return apiFetch('/api/auth/me');
}

// ── Shipments ─────────────────────────────────────────────────────────────

export async function getShipments(params = {}) {
  const query = new URLSearchParams(params).toString();
  return apiFetch(`/api/shipments/${query ? '?' + query : ''}`);
}

export async function getShipment(shipmentId) {
  return apiFetch(`/api/shipments/${shipmentId}`);
}

export async function createShipment(data) {
  return apiFetch('/api/shipments/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function assignTransporter(shipmentId, transporterUsername) {
  return apiFetch(`/api/shipments/${shipmentId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ transporter_username: transporterUsername }),
  });
}

export async function initTrustedData(shipmentId, temperatures, journeyStartUtc) {
  return apiFetch(`/api/shipments/${shipmentId}/init-trusted-data`, {
    method: 'POST',
    body: JSON.stringify({ temperatures, journey_start_utc: journeyStartUtc }),
  });
}

// ── Journey & Readings ────────────────────────────────────────────────────

export async function startJourney(shipmentId) {
  return apiFetch(`/api/journeys/${shipmentId}/start`, { method: 'POST' });
}

export async function markDelivered(shipmentId) {
  return apiFetch(`/api/journeys/${shipmentId}/deliver`, { method: 'POST' });
}

export async function submitReading(shipmentId, temperature, measuredAt, notes) {
  return apiFetch(`/api/readings/${shipmentId}`, {
    method: 'POST',
    body: JSON.stringify({
      temperature_celsius: temperature,
      measured_at: measuredAt,
      notes: notes || '',
    }),
  });
}

export async function getReadings(shipmentId) {
  return apiFetch(`/api/readings/${shipmentId}`);
}

// ── Trusted Data ─────────────────────────────────────────────────────────

export async function getTrustedData(shipmentId) {
  return apiFetch(`/api/trusted-data/${shipmentId}`);
}

// ── Verification ──────────────────────────────────────────────────────────

export async function runVerification(shipmentId) {
  return apiFetch(`/api/verification/${shipmentId}`, { method: 'POST' });
}

export async function runOfflineVerification(shipmentId, payload) {
  return apiFetch(`/api/verification/${shipmentId}/offline`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Decisions ─────────────────────────────────────────────────────────────

export async function recordDecision(shipmentId, decision, reason) {
  return apiFetch(`/api/decisions/${shipmentId}`, {
    method: 'POST',
    body: JSON.stringify({ decision, reason }),
  });
}

export async function getDecision(shipmentId) {
  return apiFetch(`/api/decisions/${shipmentId}`);
}

// ── Audit ─────────────────────────────────────────────────────────────────

export async function getAudit(shipmentId) {
  return apiFetch(`/api/audit/${shipmentId}`);
}

// ── Report Download ───────────────────────────────────────────────────────


export async function fetchReportBlob(shipmentId) {
  const token = getToken();
  const url = `${API_BASE}/api/reports/${encodeURIComponent(shipmentId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Failed to fetch report PDF.");
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/pdf")) {
    throw new Error(
      `Expected a PDF, but the server returned ${contentType || "an unknown format"}.`
    );
  }

  return await res.blob();
}

export async function downloadReport(shipmentId) {
  const blob = await fetchReportBlob(shipmentId);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `coldchain_report_${shipmentId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export async function fetchReportPdfFile(shipmentId) {
  const blob = await fetchReportBlob(shipmentId);
  return new File([blob], `coldchain_report_${shipmentId}.pdf`, {
    type: "application/pdf",
  });
}

export async function createShareToken(shipmentId) {
  return apiFetch(`/api/reports/${encodeURIComponent(shipmentId)}/share-token`, {
    method: "POST",
  });
}

export async function emailReport(shipmentId, payload) {
  return apiFetch(`/api/reports/${encodeURIComponent(shipmentId)}/email`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


// ── Users ─────────────────────────────────────────────────────────────────

export async function getTransporters() {
  return apiFetch('/api/users/transporters');
}

// ── Health ────────────────────────────────────────────────────────────────

export async function checkHealth() {
  return apiFetch('/api/health');
}
