import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  QrCode,
  Download,
  Building2,
  Calendar,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Sparkles
} from 'lucide-react';

export default function MyDigitalId({ onBack }) {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchCard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/worker/id-card');
      if (res.data?.success) {
        setCard(res.data.card);
      }
    } catch (err) {
      console.error('Failed to load ID card:', err);
      setError(err.response?.data?.message || 'Unable to load digital employee pass.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCard();
  }, []);

  const handleDownloadPDF = async () => {
    if (!card) return;
    setDownloading(true);
    try {
      const res = await api.get('/worker/id-card/pdf', {
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Pixx_ID_Pass_${card.employeeId || 'Worker'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download PDF badge:', err);
      alert('Could not generate ID card PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyCode = () => {
    if (!card?.qrVerificationCode) return;
    navigator.clipboard.writeText(card.qrVerificationCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="id-card-view-container">
        <div className="view-header-bar">
          <div>
            <h2 className="view-title">Digital Employee Pass</h2>
            <p className="view-subtitle">Official verified workforce credential</p>
          </div>
        </div>
        <div className="id-card-skeleton-loader">
          <div className="skeleton-line" style={{ height: '360px', borderRadius: '24px' }}></div>
        </div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="id-card-view-container">
        <div className="attendance-error-box">
          <AlertCircle size={20} />
          <span>{error || 'Digital ID Pass not available.'}</span>
          <button type="button" onClick={fetchCard} className="retry-btn">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const initials = card.name
    ? card.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'PX';

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(
    card.qrVerificationUrl || card.qrVerificationCode
  )}`;

  return (
    <div className="id-card-view-container">
      {/* View Header */}
      <div className="view-header-bar">
        <div>
          <div className="view-title-row">
            <h2 className="view-title">Digital Employee Pass</h2>
            <span className="phase-pill">Official</span>
          </div>
          <p className="view-subtitle">Verified digital badge for Pixx Technologies workforce</p>
        </div>
        <div className="view-header-actions">
          <button
            type="button"
            className="btn-download-pdf"
            onClick={handleDownloadPDF}
            disabled={downloading}
          >
            <Download size={15} />
            <span>{downloading ? 'Generating…' : 'Download PDF Badge'}</span>
          </button>
        </div>
      </div>

      {/* Main Digital Pass Card Container */}
      <div className="digital-pass-wrapper">
        <div className="digital-pass-card">
          {/* Top Brand Banner */}
          <div className="pass-brand-banner">
            <div className="pass-brand-left">
              <span className="brand-logo-badge">PIXX</span>
              <div>
                <div className="pass-company-name">PIXX TECHNOLOGIES</div>
                <div className="pass-sub-text">Retail London • Verified Workforce</div>
              </div>
            </div>
            <div className="pass-security-shield">
              <ShieldCheck size={22} className="shield-icon" />
              <span>AUTHENTIC</span>
            </div>
          </div>

          {/* Holographic Strip Accent */}
          <div className="pass-hologram-strip"></div>

          {/* Profile Section */}
          <div className="pass-body">
            <div className="pass-avatar-wrap">
              {card.profilePicture ? (
                <img src={card.profilePicture} alt={card.name} className="pass-avatar-img" />
              ) : (
                <div className="pass-avatar-fallback">{initials}</div>
              )}
              <div className="pass-status-indicator">
                <span className="status-dot-pulse"></span>
                {card.employmentStatus}
              </div>
            </div>

            <div className="pass-identity-info">
              <h3 className="pass-worker-name">{card.name}</h3>
              <p className="pass-job-title">{card.jobTitle}</p>
              <div className="pass-emp-id-badge">
                <span className="id-label">ID</span>
                <span className="id-val">{card.employeeId}</span>
              </div>
            </div>

            {/* Details Grid */}
            <div className="pass-meta-grid">
              <div className="meta-item">
                <div className="meta-label">
                  <Building2 size={13} /> Assigned Branch
                </div>
                <div className="meta-val">{card.assignedShop?.name || 'Central London'}</div>
              </div>

              <div className="meta-item">
                <div className="meta-label">
                  <Calendar size={13} /> Joining Date
                </div>
                <div className="meta-val">{card.formattedStartDate}</div>
              </div>
            </div>

            {/* QR Verification Area */}
            <div className="pass-qr-section">
              <div className="qr-box">
                <img
                  src={qrImageUrl}
                  alt="Identity Verification QR Code"
                  className="qr-img"
                  onError={(e) => {
                    // Fallback to placeholder if offline
                    e.target.style.display = 'none';
                    e.target.nextElementSibling.style.display = 'flex';
                  }}
                />
                <div className="qr-fallback-box" style={{ display: 'none' }}>
                  <QrCode size={64} color="#0284c7" />
                  <span>Scan Verification</span>
                </div>
              </div>

              <div className="qr-details">
                <div className="qr-heading">
                  <Sparkles size={14} className="sparkle-icon" />
                  <span>Instant Verification</span>
                </div>
                <p className="qr-subtext">
                  Supervisors & security can scan this QR code to authenticate active employment in real-time.
                </p>
                <div className="token-copy-pill" onClick={handleCopyCode} title="Click to copy security code">
                  <span className="token-code">{card.qrVerificationCode}</span>
                  <button type="button" className="btn-copy-token">
                    {copied ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                  </button>
                </div>
                {copied && <span className="copied-toast">Copied to clipboard!</span>}
              </div>
            </div>

            {/* Security Footer Notice */}
            <div className="pass-footer-notice">
              <p>
                Property of Pixx Technologies Ltd. Strictly for workforce verification. Does not expose confidential salary, banking, or document records.
              </p>
            </div>
          </div>
        </div>

        {/* Action Panel */}
        <div className="pass-actions-panel">
          <div className="action-card">
            <h4>Security & Verification</h4>
            <p>
              Your digital pass is linked to your verified employee profile. The security code updates automatically and verifies your active standing without displaying sensitive personal payroll information.
            </p>
            <div className="action-buttons-stack">
              <button
                type="button"
                className="btn-primary-action"
                onClick={handleDownloadPDF}
                disabled={downloading}
              >
                <Download size={16} />
                <span>{downloading ? 'Preparing PDF...' : 'Download Official Printable Pass'}</span>
              </button>
              <button
                type="button"
                className="btn-secondary-action"
                onClick={() => {
                  if (card.qrVerificationUrl) {
                    window.open(card.qrVerificationUrl, '_blank');
                  }
                }}
              >
                <ExternalLink size={15} />
                <span>Open Verification Page</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
