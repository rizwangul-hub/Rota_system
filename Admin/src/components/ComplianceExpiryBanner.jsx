import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import { ShieldAlert, AlertTriangle, Clock, ChevronDown, ChevronUp, FileText, ArrowUpRight, CheckCircle2 } from 'lucide-react';

export default function ComplianceExpiryBanner({ onEditEmployee, refreshTrigger }) {
  const [data, setData] = useState({ counts: { total: 0, expired: 0, urgent: 0, warning: 0 }, alerts: [] });
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchComplianceAlerts();
  }, [refreshTrigger]);

  const fetchComplianceAlerts = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/employees/compliance/expiring-documents`);
      if (res.data?.success) {
        setData({
          counts: res.data.counts || { total: 0, expired: 0, urgent: 0, warning: 0 },
          alerts: res.data.alerts || []
        });
      }
    } catch (err) {
      console.warn('Could not load compliance document alerts:', err.message);
    }
  };

  const { counts, alerts } = data;

  if (!counts.total || counts.total === 0) {
    return null;
  }

  const hasExpired = counts.expired > 0;
  const hasUrgent = counts.urgent > 0;

  const bannerBg = hasExpired ? '#fef2f2' : hasUrgent ? '#fff7ed' : '#fffbeb';
  const borderColor = hasExpired ? '#f87171' : hasUrgent ? '#fb923c' : '#fcd34d';
  const titleColor = hasExpired ? '#991b1b' : hasUrgent ? '#9a3412' : '#92400e';

  return (
    <div
      style={{
        marginBottom: '20px',
        borderRadius: '10px',
        border: `1.5px solid ${borderColor}`,
        background: bannerBg,
        boxShadow: hasExpired ? '0 4px 12px rgba(239, 68, 68, 0.15)' : '0 2px 8px rgba(245, 158, 11, 0.1)',
        overflow: 'hidden'
      }}
    >
      {/* Banner Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          background: hasExpired ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.06)',
          borderBottom: collapsed ? 'none' : `1px solid ${borderColor}`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: hasExpired ? '#ef4444' : hasUrgent ? '#f97316' : '#f59e0b',
              color: '#ffffff'
            }}
          >
            <ShieldAlert size={16} />
          </div>

          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: titleColor, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Compliance Alert: {counts.total} Expiring / Expired Document{counts.total === 1 ? '' : 's'}</span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: hasExpired ? '#dc2626' : hasUrgent ? '#ea580c' : '#d97706',
                  color: '#ffffff',
                  textTransform: 'uppercase'
                }}
              >
                {hasExpired ? 'Action Required: Expired' : hasUrgent ? 'Urgent (1 Week)' : '1 Month Notice'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
              Per UK Right-to-Work regulations, permissions and identity documents must remain active. Update records before work continues.
            </div>
          </div>
        </div>

        <button
          onClick={() => setCollapsed(prev => !prev)}
          className="btn btn-outline btn-sm"
          style={{
            borderColor,
            color: titleColor,
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            fontWeight: 600,
            padding: '5px 10px'
          }}
        >
          {collapsed ? (
            <>View Details ({counts.total}) <ChevronDown size={14} /></>
          ) : (
            <>Collapse <ChevronUp size={14} /></>
          )}
        </button>
      </div>

      {/* Expanded Document Alert Cards */}
      {!collapsed && (
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {alerts.map((item, idx) => {
            const isExp = item.urgency === 'EXPIRED';
            const isUrg = item.urgency === 'URGENT';

            const cardBg = isExp ? '#ffffff' : isUrg ? '#ffffff' : '#ffffff';
            const pillBg = isExp ? '#fee2e2' : isUrg ? '#ffedd5' : '#fef3c7';
            const pillColor = isExp ? '#b91c1c' : isUrg ? '#c2410c' : '#b45309';

            return (
              <div
                key={`${item.employeeMongoId}_${item.documentName}_${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: cardBg,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px' }}>
                  <div
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 800,
                      background: pillBg,
                      color: pillColor,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <Clock size={13} />
                    <span>{item.statusText}</span>
                  </div>

                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                      {item.employeeName} <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>({item.employeeId})</span>
                      {item.shopName && (
                        <span style={{ fontSize: '11px', marginLeft: '6px', color: '#0284c7', background: '#f0f9ff', padding: '1px 6px', borderRadius: '4px' }}>
                          {item.shopName}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                      <strong>{item.documentName}</strong> • Expiry Date: <span style={{ fontWeight: 600 }}>{item.expiryDate}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => onEditEmployee && onEditEmployee(item.employeeMongoId, 'right_to_work')}
                    className="btn btn-sm"
                    style={{
                      background: isExp ? '#dc2626' : isUrg ? '#ea580c' : '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                    }}
                  >
                    <FileText size={13} />
                    Update Document & Expiry
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
