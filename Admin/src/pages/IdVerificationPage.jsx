import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Building2,
  Calendar,
  Search,
  Sparkles,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

export default function IdVerificationPage() {
  const { code: paramCode } = useParams();
  const [code, setCode] = useState(paramCode || '');
  const [verifiedEmployee, setVerifiedEmployee] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const handleVerify = async (codeToVerify) => {
    const c = (codeToVerify || code).trim();
    if (!c) return;

    setLoading(true);
    setError('');
    setVerifiedEmployee(null);
    setSearched(true);

    try {
      // Endpoint is open for workforce verification
      const res = await axios.get(`${API_BASE_URL}/verify-id/${encodeURIComponent(c)}`);
      if (res.data?.success && res.data.verified) {
        setVerifiedEmployee(res.data.employee);
      } else {
        setError('No valid employee record found for this verification pass.');
      }
    } catch (err) {
      console.error('ID verification error:', err);
      setError(err.response?.data?.message || 'Invalid or unverified employee pass code.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (paramCode) {
      handleVerify(paramCode);
    }
  }, [paramCode]);

  return (
    <div style={{ maxWidth: '640px', margin: '40px auto', padding: '0 16px', color: '#fff' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <div style={{ display: 'inline-flex', padding: '12px', background: 'rgba(2, 132, 199, 0.15)', borderRadius: '16px', color: '#38bdf8', marginBottom: '12px' }}>
          <ShieldCheck size={36} />
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 6px' }}>Workforce ID Pass Verification</h1>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
          Pixx Technologies Ltd • Official Digital Identity Validation
        </p>
      </div>

      {/* Code Input Card */}
      <div style={{ background: 'var(--bg-card, #1e293b)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '20px', marginBottom: '24px' }}>
        <form onSubmit={(e) => { e.preventDefault(); handleVerify(); }} style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            placeholder="Enter security token (e.g. PIXX-A1B2C3D4...)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '12px',
              background: '#0f172a',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff',
              fontSize: '14px',
              fontFamily: 'monospace'
            }}
          />
          <button
            type="submit"
            disabled={loading || !code.trim()}
            style={{
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              padding: '12px 20px',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {loading ? <RefreshCw size={16} className="spin" /> : <Search size={16} />}
            <span>Verify</span>
          </button>
        </form>
      </div>

      {/* Result State */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px' }} />
          <div>Checking cryptographic verification records...</div>
        </div>
      ) : error ? (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '16px', padding: '24px', textAlign: 'center', color: '#fca5a5' }}>
          <XCircle size={40} style={{ margin: '0 auto 10px', color: '#ef4444' }} />
          <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800 }}>Invalid Identification Pass</h3>
          <p style={{ margin: 0, fontSize: '13px' }}>{error}</p>
        </div>
      ) : verifiedEmployee ? (
        <div style={{ background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)', borderRadius: '24px', border: '1px solid #10b981', padding: '28px', boxShadow: '0 20px 40px -15px rgba(16, 185, 129, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 800, fontSize: '14px' }}>
              <CheckCircle2 size={20} />
              <span>OFFICIALLY VERIFIED EMPLOYEE</span>
            </div>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Checked {new Date(verifiedEmployee.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: 'linear-gradient(135deg, #0284c7, #38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 800, color: '#fff', margin: '0 auto 12px' }}>
              {verifiedEmployee.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 4px' }}>{verifiedEmployee.name}</h2>
            <div style={{ fontSize: '13px', color: '#38bdf8', fontWeight: 600 }}>{verifiedEmployee.jobTitle}</div>
            <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.08)', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontFamily: 'monospace', marginTop: '6px' }}>
              {verifiedEmployee.employeeId}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'rgba(0,0,0,0.25)', borderRadius: '14px', padding: '16px', marginBottom: '20px', fontSize: '12px' }}>
            <div>
              <span style={{ color: '#94a3b8' }}>Assigned Branch</span>
              <div style={{ fontWeight: 700, color: '#fff', marginTop: '2px' }}>{verifiedEmployee.shopName}</div>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Standing Status</span>
              <div style={{ fontWeight: 700, color: '#10b981', marginTop: '2px' }}>● {verifiedEmployee.employmentStatus}</div>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Service Start</span>
              <div style={{ fontWeight: 700, color: '#fff', marginTop: '2px' }}>{verifiedEmployee.formattedStartDate}</div>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Company</span>
              <div style={{ fontWeight: 700, color: '#fff', marginTop: '2px' }}>{verifiedEmployee.companyLegalName}</div>
            </div>
          </div>

          <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', lineHeight: '1.4' }}>
            Official digital identity credential verified against Pixx workforce database. Confidential employee records, compensation, and right-to-work documents remain shielded.
          </div>
        </div>
      ) : searched ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>Enter a code to verify</div>
      ) : null}
    </div>
  );
}
