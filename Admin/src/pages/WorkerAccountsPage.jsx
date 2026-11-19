import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import {
  ShieldCheck,
  Search,
  UserCheck,
  UserX,
  KeyRound,
  PlusCircle,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function WorkerAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [metrics, setMetrics] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    accountsCreated: 0,
    accountsActive: 0,
    accountsDeactivated: 0,
    accountsMissing: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [shopFilter, setShopFilter] = useState('ALL');
  const [shops, setShops] = useState([]);

  // Modal States
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [credentialSuccess, setCredentialSuccess] = useState(null);
  const [copied, setCopied] = useState(false);

  // Reset Password Modal State
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetAccount, setResetAccount] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    fetchAccounts();
    fetchShops();
  }, []);

  const fetchShops = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/shops`);
      if (res.data?.success) {
        setShops(res.data.shops || []);
      }
    } catch (err) {
      console.warn('Could not load shops:', err.message);
    }
  };

  const fetchAccounts = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_BASE_URL}/admin/worker-accounts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.success) {
        setAccounts(res.data.accounts || []);
        if (res.data.metrics) {
          setMetrics(res.data.metrics);
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to load worker accounts.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = (account) => {
    setSelectedEmp(account);
    setFormEmail(account.employeeEmail || '');
    setFormPassword('');
    setCredentialSuccess(null);
    setCopied(false);
    setCreateModalOpen(true);
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!selectedEmp) return;
    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_BASE_URL}/admin/worker-accounts`,
        {
          employeeId: selectedEmp._id,
          email: formEmail,
          password: formPassword || undefined
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data?.success) {
        setCredentialSuccess(res.data.account);
        fetchAccounts();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create worker account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (account) => {
    if (!account.userId) return;
    const isActivating = account.accountStatus !== 'ACTIVE';
    const actionWord = isActivating ? 'activate' : 'deactivate';

    if (!window.confirm(`Are you sure you want to ${actionWord} portal access for ${account.name}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await axios.patch(
        `${API_BASE_URL}/admin/worker-accounts/${account.userId}/toggle-status`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.success) {
        fetchAccounts();
      }
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${actionWord} account`);
    }
  };

  const handleOpenResetModal = (account) => {
    setResetAccount(account);
    setNewPassword('');
    setCredentialSuccess(null);
    setCopied(false);
    setResetModalOpen(true);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetAccount) return;
    setSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_BASE_URL}/admin/worker-accounts/${resetAccount.userId}/reset-password`,
        { newPassword: newPassword || undefined },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data?.success) {
        setCredentialSuccess({
          email: resetAccount.portalEmail,
          name: resetAccount.name,
          temporaryPassword: res.data.temporaryPassword
        });
        fetchAccounts();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const copyCredentials = (email, password) => {
    const text = `PIXX Rota Worker Portal Login:\nEmail: ${email}\nPassword: ${password}\nURL: ${window.location.origin.replace('3000', '5173')}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Filter accounts
  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch =
      acc.name.toLowerCase().includes(search.toLowerCase()) ||
      acc.employeeId.toLowerCase().includes(search.toLowerCase()) ||
      (acc.portalEmail && acc.portalEmail.toLowerCase().includes(search.toLowerCase())) ||
      (acc.employeeEmail && acc.employeeEmail.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && acc.accountStatus === 'ACTIVE') ||
      (statusFilter === 'DEACTIVATED' && acc.accountStatus === 'DEACTIVATED') ||
      (statusFilter === 'NO_ACCOUNT' && acc.accountStatus === 'NO_ACCOUNT');

    const matchesShop =
      shopFilter === 'ALL' ||
      (acc.assignedShop && (acc.assignedShop._id === shopFilter || acc.assignedShop.name === shopFilter));

    return matchesSearch && matchesStatus && matchesShop;
  });

  return (
    <div className="page-container">
      {/* Top Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={28} color="#0284c7" />
            Worker Portal Accounts
          </h1>
          <p className="page-subtitle">
            Manage worker portal accounts, email authentication credentials, and access activation status.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline"
          onClick={fetchAccounts}
          disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Metrics Banner */}
      <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #0284c7' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Staff</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginTop: '4px' }}>
            {metrics.totalEmployees}
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{metrics.activeEmployees} currently active</div>
        </div>

        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Portal Accounts Active</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>
            {metrics.accountsActive}
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Can log in & view rota/payslips</div>
        </div>

        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>No Account Yet</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#f59e0b', marginTop: '4px' }}>
            {metrics.accountsMissing}
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Awaiting account creation</div>
        </div>

        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Deactivated Accounts</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#ef4444', marginTop: '4px' }}>
            {metrics.accountsDeactivated}
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Access locked out</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '18px', padding: '14px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              className="form-control"
              placeholder="Search by name, ID code or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: '160px' }}
            >
              <option value="ALL">All Accounts</option>
              <option value="ACTIVE">Active Accounts</option>
              <option value="NO_ACCOUNT">No Account</option>
              <option value="DEACTIVATED">Deactivated</option>
            </select>

            <select
              className="form-control"
              value={shopFilter}
              onChange={(e) => setShopFilter(e.target.value)}
              style={{ width: '160px' }}
            >
              <option value="ALL">All Shops</option>
              {shops.map(s => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Employee Code</th>
                <th>Employee Name</th>
                <th>Assigned Shop</th>
                <th>Employment</th>
                <th>Portal Access</th>
                <th>Login Email</th>
                <th>Last Active</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    <RefreshCw size={22} className="spin" style={{ margin: '0 auto 8px' }} />
                    Loading worker accounts...
                  </td>
                </tr>
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    No matching worker accounts found.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map(acc => (
                  <tr key={acc._id}>
                    <td>
                      <Link to={`/employees/${acc._id}`} className="table-link-primary">
                        {acc.employeeId}
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{acc.name}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{acc.jobTitle}</div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}>
                        {acc.assignedShop?.name || 'Unassigned'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${acc.employmentStatus === 'Active' ? 'present' : 'absent'}`}>
                        {acc.employmentStatus}
                      </span>
                    </td>
                    <td>
                      {acc.accountStatus === 'ACTIVE' && (
                        <span className="badge" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 600 }}>
                          <Check size={12} style={{ display: 'inline', marginRight: '3px' }} /> Active
                        </span>
                      )}
                      {acc.accountStatus === 'DEACTIVATED' && (
                        <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: 600 }}>
                          <UserX size={12} style={{ display: 'inline', marginRight: '3px' }} /> Deactivated
                        </span>
                      )}
                      {acc.accountStatus === 'NO_ACCOUNT' && (
                        <span className="badge" style={{ background: '#fef3c7', color: '#b45309', fontWeight: 600 }}>
                          No Account
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: '13px', color: acc.portalEmail ? '#0f172a' : '#94a3b8' }}>
                      {acc.portalEmail || acc.employeeEmail || <em>None set</em>}
                    </td>
                    <td style={{ fontSize: '12px', color: '#64748b' }}>
                      {acc.lastLogin ? new Date(acc.lastLogin).toLocaleDateString() : 'Never'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {!acc.hasAccount ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleOpenCreateModal(acc)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', fontSize: '12px' }}
                          >
                            <PlusCircle size={13} /> Create Account
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={`btn btn-sm ${acc.accountStatus === 'ACTIVE' ? 'btn-outline' : 'btn-primary'}`}
                              onClick={() => handleToggleStatus(acc)}
                              title={acc.accountStatus === 'ACTIVE' ? 'Deactivate Account' : 'Activate Account'}
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                            >
                              {acc.accountStatus === 'ACTIVE' ? <UserX size={13} /> : <UserCheck size={13} />}
                              <span style={{ marginLeft: '4px' }}>
                                {acc.accountStatus === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                              </span>
                            </button>

                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => handleOpenResetModal(acc)}
                              title="Reset Password"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                            >
                              <KeyRound size={13} />
                              <span style={{ marginLeft: '4px' }}>Reset Pass</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Worker Account Modal */}
      {createModalOpen && selectedEmp && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050, padding: '16px' }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '24px', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} color="#0284c7" />
                Create Worker Account
              </h3>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setCreateModalOpen(false)}
                style={{ border: 'none', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {credentialSuccess ? (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 600, marginBottom: '8px' }}>
                  <Check size={18} /> Account Created Successfully!
                </div>
                <p style={{ fontSize: '13px', color: '#15803d', margin: '0 0 12px' }}>
                  Provide these credentials to <strong>{credentialSuccess.name}</strong> to access the Worker Portal:
                </p>
                <div style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '12px', fontSize: '13px', fontFamily: 'monospace' }}>
                  <div><strong>Email:</strong> {credentialSuccess.email}</div>
                  <div style={{ marginTop: '4px' }}><strong>Temp Password:</strong> {credentialSuccess.temporaryPassword}</div>
                </div>
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => copyCredentials(credentialSuccess.email, credentialSuccess.temporaryPassword)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied to Clipboard!' : 'Copy Credentials'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setCreateModalOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateAccount}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                    Employee
                  </label>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary, #0f172a)' }}>
                    {selectedEmp.name} ({selectedEmp.employeeId}) — {selectedEmp.assignedShop?.name || 'Unassigned'}
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                    Login Email (Required) *
                  </label>
                  <input
                    type="email"
                    required
                    className="form-control"
                    placeholder="worker@example.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                    Worker will use this email address to log in to the portal.
                  </div>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                    Initial Password (Optional)
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Leave empty to auto-generate secure password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                    If left blank, a secure temporary password will be automatically generated.
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setCreateModalOpen(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModalOpen && resetAccount && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050, padding: '16px' }}>
          <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '24px', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={20} color="#0284c7" />
                Reset Worker Password
              </h3>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setResetModalOpen(false)}
                style={{ border: 'none', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {credentialSuccess ? (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 600, marginBottom: '8px' }}>
                  <Check size={18} /> Password Reset Successfully!
                </div>
                <div style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '12px', fontSize: '13px', fontFamily: 'monospace' }}>
                  <div><strong>Email:</strong> {credentialSuccess.email}</div>
                  <div style={{ marginTop: '4px' }}><strong>New Password:</strong> {credentialSuccess.temporaryPassword}</div>
                </div>
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => copyCredentials(credentialSuccess.email, credentialSuccess.temporaryPassword)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied to Clipboard!' : 'Copy Credentials'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setResetModalOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetPassword}>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 14px' }}>
                  Reset password for <strong>{resetAccount.name}</strong> ({resetAccount.portalEmail}).
                </p>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                    New Password (Optional)
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Leave empty to auto-generate secure password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                    If left blank, a temporary password will be auto-generated.
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setResetModalOpen(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
