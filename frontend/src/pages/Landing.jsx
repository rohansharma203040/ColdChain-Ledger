import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  ClipboardCheck,
  Truck,
  ArrowRight,
  Lock,
  Thermometer,
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  AlertCircle
} from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-primary, #f8fafc)',
      color: 'var(--text-primary, #0f172a)',
      fontFamily: 'inherit'
    }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header style={{
        height: '60px',
        borderBottom: '1px solid var(--border, #e2e8f0)',
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        position: 'relative',
        zIndex: 50,
        flexShrink: 0
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: '#4338ca',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 2px 6px rgba(67, 56, 202, 0.25)'
          }}>
            <ShieldCheck size={18} />
          </div>
          <span style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary, #0f172a)' }}>
            ColdChain Ledger
          </span>
        </div>

        {/* Header Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} ref={dropdownRef}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen(prev => !prev)}
              className="btn btn-primary btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              id="portal-login-button"
            >
              <span>Portal Login</span>
              <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: dropdownOpen ? 'rotate(180deg)' : 'none' }} />
            </button>

            {dropdownOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                width: '220px',
                background: '#ffffff',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: '8px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                padding: '6px',
                zIndex: 100
              }}>
                <Link
                  to="/admin/login"
                  onClick={() => setDropdownOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: '0.825rem',
                    fontWeight: 500,
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <ShieldCheck size={16} color="#4338ca" />
                  <div>
                    <div style={{ fontWeight: 600 }}>Admin / Sender</div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted, #64748b)' }}>Manage shipments</div>
                  </div>
                </Link>

                <Link
                  to="/receiver/login"
                  onClick={() => setDropdownOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: '0.825rem',
                    fontWeight: 500,
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <ClipboardCheck size={16} color="#059669" />
                  <div>
                    <div style={{ fontWeight: 600 }}>Receiver</div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted, #64748b)' }}>Verify deliveries</div>
                  </div>
                </Link>

                <div style={{ borderTop: '1px solid #f1f5f9', margin: '4px 0' }} />

                <Link
                  to="/transporter/login"
                  onClick={() => setDropdownOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: '0.825rem',
                    fontWeight: 500,
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Truck size={16} color="#0284c7" />
                  <div>
                    <div style={{ fontWeight: 600 }}>Transporter</div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted, #64748b)' }}>Record transit data</div>
                  </div>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Viewport Content (Hero + Portal Entry + Capability) ────── */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '24px 32px 16px',
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box'
      }}>

        {/* Hero Section Grid */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: '1.15fr 0.85fr',
          gap: '36px',
          alignItems: 'center',
          marginBottom: '28px'
        }} className="hero-grid">

          {/* Left Column: Headline, Description & Portal Selection */}
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '20px',
              background: '#eef2ff',
              border: '1px solid #c7d2fe',
              color: '#4338ca',
              fontSize: '0.775rem',
              fontWeight: 700,
              marginBottom: '16px'
            }}>
              <Thermometer size={13} />
              <span>Pharmaceutical Cold-Chain Security</span>
            </div>

            <h1 style={{
              fontSize: '2.5rem',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.18,
              margin: '0 0 14px 0',
              color: 'var(--text-primary, #0f172a)'
            }}>
              Cold-chain integrity you can verify.
            </h1>

            <p style={{
              fontSize: '1.02rem',
              lineHeight: 1.6,
              color: 'var(--text-secondary, #475569)',
              margin: '0 0 24px 0',
              maxWidth: '520px'
            }}>
              Monitor shipment temperatures, detect discrepancies, and verify tamper-evident transport records.
            </p>

            {/* Three Portal Entry Points */}
            <div>
              <div style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted, #64748b)',
                marginBottom: '10px'
              }}>
                Choose your portal
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px'
              }} className="portal-cards">

                {/* Option 1: Admin / Sender */}
                <Link
                  to="/admin/login"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '14px',
                    borderRadius: '10px',
                    background: '#ffffff',
                    border: '1px solid var(--border, #e2e8f0)',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'all 0.18s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                  }}
                  className="portal-card"
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#4338ca';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(67, 56, 202, 0.08)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border, #e2e8f0)';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: '#eef2ff',
                      color: '#4338ca',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <ShieldCheck size={18} />
                    </div>
                    <ArrowRight size={14} color="#64748b" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary, #0f172a)' }}>
                      Admin / Sender
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #475569)', marginTop: '2px' }}>
                      Manage shipments
                    </div>
                  </div>
                </Link>

                {/* Option 2: Receiver */}
                <Link
                  to="/receiver/login"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '14px',
                    borderRadius: '10px',
                    background: '#ffffff',
                    border: '1px solid var(--border, #e2e8f0)',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'all 0.18s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                  }}
                  className="portal-card"
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#059669';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(5, 150, 105, 0.08)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border, #e2e8f0)';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: '#ecfdf5',
                      color: '#059669',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <ClipboardCheck size={18} />
                    </div>
                    <ArrowRight size={14} color="#64748b" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary, #0f172a)' }}>
                      Receiver
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #475569)', marginTop: '2px' }}>
                      Verify deliveries
                    </div>
                  </div>
                </Link>

                {/* Option 3: Transporter */}
                <Link
                  to="/transporter/login"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '14px',
                    borderRadius: '10px',
                    background: '#ffffff',
                    border: '1px solid var(--border, #e2e8f0)',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'all 0.18s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                  }}
                  className="portal-card"
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#0284c7';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(2, 132, 199, 0.08)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border, #e2e8f0)';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: '#f0f9ff',
                      color: '#0284c7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Truck size={18} />
                    </div>
                    <ArrowRight size={14} color="#64748b" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary, #0f172a)' }}>
                      Transporter
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #475569)', marginTop: '2px' }}>
                      Record transit data
                    </div>
                  </div>
                </Link>

              </div>
            </div>
          </div>

          {/* Right Column: Restrained Professional Visual */}
          <div style={{
            background: '#ffffff',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: '12px',
            boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
            padding: '20px',
            maxWidth: '460px',
            marginLeft: 'auto',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            {/* Visual Card Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '12px',
              borderBottom: '1px solid #f1f5f9',
              marginBottom: '14px'
            }}>
              <div>
                <span style={{ fontSize: '0.725rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #64748b)' }}>
                  Audit Evidence Preview
                </span>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary, #0f172a)', marginTop: '2px' }}>
                  Shipment SHIP-1794
                </div>
              </div>
              <span style={{
                background: '#e0f2fe',
                color: '#0369a1',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '12px'
              }}>
                Delivered
              </span>
            </div>

            {/* Verification Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

              {/* Row 1: Temperature */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: '#f8fafc',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Thermometer size={15} color="#059669" />
                  <span style={{ fontSize: '0.825rem', fontWeight: 500, color: 'var(--text-secondary, #475569)' }}>
                    Temperature Range
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                    4.2°C (2°C – 8°C)
                  </span>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: '#059669',
                    background: '#ecfdf5',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    Compliant
                  </span>
                </div>
              </div>

              {/* Row 2: Hash Chain */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: '#f8fafc',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Lock size={15} color="#4338ca" />
                  <span style={{ fontSize: '0.825rem', fontWeight: 500, color: 'var(--text-secondary, #475569)' }}>
                    SHA-256 Hash Chain
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                    14 Chained Records
                  </span>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: '#059669',
                    background: '#ecfdf5',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    Verified
                  </span>
                </div>
              </div>

              {/* Row 3: Ed25519 Signature */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: '#f8fafc',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={15} color="#4338ca" />
                  <span style={{ fontSize: '0.825rem', fontWeight: 500, color: 'var(--text-secondary, #475569)' }}>
                    Ed25519 Digital Seal
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                    Device Key #001
                  </span>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: '#059669',
                    background: '#ecfdf5',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    Valid
                  </span>
                </div>
              </div>

              {/* Row 4: Transporter Comparison */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: '#f8fafc',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileCheck2 size={15} color="#0284c7" />
                  <span style={{ fontSize: '0.825rem', fontWeight: 500, color: 'var(--text-secondary, #475569)' }}>
                    Telemetry Comparison
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                    0 Discrepancies
                  </span>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: '#059669',
                    background: '#ecfdf5',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    Matched
                  </span>
                </div>
              </div>

            </div>

            {/* Independent Evaluation Notice */}
            <div style={{
              marginTop: '12px',
              padding: '8px 10px',
              borderRadius: '6px',
              background: '#fffbeb',
              border: '1px solid #fef3c7',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px'
            }}>
              <AlertCircle size={13} color="#d97706" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div style={{ fontSize: '0.72rem', color: '#92400e', lineHeight: 1.4 }}>
                <strong>Independent Evaluation:</strong> Cryptographic verification and temperature compliance are evaluated separately. A valid digital signature confirms data integrity, not temperature adherence.
              </div>
            </div>

          </div>

        </section>

        {/* ── Three Concise Capability Highlights ─────────────────────────── */}
        <section style={{
          borderTop: '1px solid var(--border, #e2e8f0)',
          paddingTop: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '24px'
        }} className="capability-grid">

          {/* Capability 1 */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#f0fdf4',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '1px solid #dcfce7'
            }}>
              <Thermometer size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary, #0f172a)', marginBottom: '3px' }}>
                Temperature Monitoring
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #475569)', lineHeight: 1.5 }}>
                Continuous sensor logging compared against strict product bounds with excursion detection.
              </div>
            </div>
          </div>

          {/* Capability 2 */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#eef2ff',
              color: '#4338ca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '1px solid #e0e7ff'
            }}>
              <Lock size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary, #0f172a)', marginBottom: '3px' }}>
                Tamper-Evident Records
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #475569)', lineHeight: 1.5 }}>
                Every reading is sealed into a SHA-256 hash chain and authenticated via Ed25519 digital signatures.
              </div>
            </div>
          </div>

          {/* Capability 3 */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#f0f9ff',
              color: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '1px solid #e0f2fe'
            }}>
              <ClipboardCheck size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary, #0f172a)', marginBottom: '3px' }}>
                Shipment Verification
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #475569)', lineHeight: 1.5 }}>
                Independent receiver verification, transporter-versus-trusted comparisons, and audit-ready PDF reports.
              </div>
            </div>
          </div>

        </section>

      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{
        height: '42px',
        borderTop: '1px solid var(--border, #e2e8f0)',
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        fontSize: '0.75rem',
        color: 'var(--text-muted, #64748b)',
        flexShrink: 0
      }}>
        <span>
          ColdChain Ledger — Academic Logistics Verification Demonstration (PS08)
        </span>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Link to="/admin/login" style={{ color: 'var(--text-secondary, #475569)', textDecoration: 'none' }}>Admin Login</Link>
          <Link to="/receiver/login" style={{ color: 'var(--text-secondary, #475569)', textDecoration: 'none' }}>Receiver Login</Link>
          <Link to="/transporter/login" style={{ color: 'var(--text-secondary, #475569)', textDecoration: 'none' }}>Transporter Login</Link>
        </div>
      </footer>

      {/* Responsive Styles */}
      <style>{`
        @media (max-width: 900px) {
          .hero-grid {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }
          .portal-cards {
            grid-template-columns: 1fr !important;
          }
          .capability-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
        }
      `}</style>

    </div>
  );
}
