import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import { ShieldCheck, RefreshCw, Filter } from 'lucide-react';

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = {};
      if (actionFilter) params.action = actionFilter;
      const res = await axios.get(`${API_BASE_URL}/audit`, { params });
      if (res.data.success) {
        setLogs(res.data.logs);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>
            System Audit Trail
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px' }}>
            Permanent audit record of all financial changes, attendance approvals, and payouts
          </p>
        </div>

        <button className="btn btn-outline btn-sm" onClick={fetchLogs}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="card" style={{ marginBottom: '20px', padding: '12px 18px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label className="form-label" style={{ margin: 0 }}>Filter Action:</label>
          <select
            className="form-select"
            style={{ width: '220px' }}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="">All Audit Actions</option>
            <option value="ATTENDANCE_SAVED">Attendance Saved</option>
            <option value="ATTENDANCE_EDITED">Attendance Edited</option>
            <option value="ATTENDANCE_APPROVED">Attendance Approved</option>
            <option value="WEEKLY_SALARY_GENERATED">Weekly Salary Generated</option>
            <option value="SALARY_FINALIZED">Salary Finalized</option>
            <option value="SALARY_PAID">Salary Paid</option>
            <option value="BONUS_CREATED">Bonus Created</option>
            <option value="EMPLOYEE_UPDATED">Employee Wage/Shop Updated</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Timestamp (UK)</th>
                <th>Operator / User</th>
                <th>Action</th>
                <th>Audit Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log._id}>
                  <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>
                    {new Date(log.timestamp).toLocaleString('en-GB')}
                  </td>
                  <td style={{ fontWeight: 600 }}>{log.username}</td>
                  <td>
                    <span className="badge badge-checked" style={{ fontSize: '11px' }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ color: '#1e293b' }}>{log.details}</td>
                </tr>
              ))}

              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    No audit records match the filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
