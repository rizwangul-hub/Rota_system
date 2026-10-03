import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import { Search, Edit, Eye, UserPlus, X, ArrowUpRight, UserCheck, UserX, ArrowUpDown, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';


export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalEmployee, setEditModalEmployee] = useState(null);
  const [nextEmployeeId, setNextEmployeeId] = useState('');

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    dailyWage: ''
  });

  useEffect(() => {
    fetchEmployees();
  }, [selectedStatus, search, sortBy, sortOrder]);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const params = { sortBy, sortOrder };
      if (selectedStatus) params.status = selectedStatus;
      if (search) params.search = search;

      const res = await axios.get(`${API_BASE_URL}/employees`, { params });
      if (res.data.success) setEmployees(res.data.employees);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (employee) => {
    const action = employee.employmentStatus === 'Active' ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} ${employee.name}?`)) return;
    try {
      const res = await axios.patch(`${API_BASE_URL}/employees/${employee._id}/toggle-status`);
      if (res.data.success) {
        fetchEmployees();
      }
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${action} employee`);
    }
  };

  const handleDeleteWorker = async (employee) => {
    if (!window.confirm(`Are you sure you want to permanently delete worker ${employee.name} (${employee.employeeId})?\n\nThis will remove the worker and all associated records. This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await axios.delete(`${API_BASE_URL}/employees/${employee._id}`);
      if (res.data.success) {
        alert(res.data.message || `Worker ${employee.name} deleted successfully.`);
        fetchEmployees();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete worker');
    }
  };


  const [submitting, setSubmitting] = useState(false);

  const openCreateModal = async () => {
    setCreateModalOpen(true);
    setNextEmployeeId('');
    setFormData({ name: '', email: '', dailyWage: '' });
    try {
      const response = await axios.get(`${API_BASE_URL}/employees/next-id`);
      if (response.data.success) setNextEmployeeId(response.data.employeeId);
    } catch (err) {
      console.error('Unable to preview next employee ID:', err);
      alert(err.response?.data?.message || 'Could not generate an employee ID. Please try again.');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!nextEmployeeId) {
      alert('An employee ID has not been generated yet. Close this form and try again.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/employees`, formData);
      if (res.data.success) {
        setCreateModalOpen(false);
        window.alert(`Employee ${res.data.employee.name} was added with ID ${res.data.employee.employeeId}.`);
        setFormData({
          name: '',
          email: '',
          dailyWage: ''
        });
        setNextEmployeeId('');
        fetchEmployees();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create employee');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editModalEmployee) return;
    setSubmitting(true);
    try {
      const res = await axios.put(`${API_BASE_URL}/employees/${editModalEmployee._id}`, {
        name: editModalEmployee.name,
        email: editModalEmployee.email,
        dailyWage: Number(editModalEmployee.dailyWage),
        employmentStatus: editModalEmployee.employmentStatus,
        wageChangeReason: editModalEmployee.wageChangeReason || ''
      });
      if (res.data.success) {
        setEditModalEmployee(null);
        fetchEmployees();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update employee');
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="page-container">
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>
            Staff & Employee Management
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px' }}>
            Manage employee details and daily wages used for attendance-based pay
          </p>
        </div>

        <button className="btn btn-primary btn-sm" onClick={openCreateModal}>
          <UserPlus size={15} /> Add Employee
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: '200px', position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '9px', color: '#94a3b8' }}>
              <Search size={15} />
            </span>
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '34px' }}
              placeholder="Search by worker name or employee ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label className="form-label" style={{ margin: 0, fontSize: '12px' }}>Status:</label>
            <select
              className="form-select"
              style={{ width: '120px' }}
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label className="form-label" style={{ margin: 0, fontSize: '12px' }}>Sort:</label>
            <select
              className="form-select"
              style={{ width: '130px' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="name">Name</option>
              <option value="wage">Daily Wage</option>
              <option value="startDate">Start Date</option>
              <option value="employeeId">Employee ID</option>
            </select>

            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ padding: '6px 10px' }}
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              title={`Sorting: ${sortOrder.toUpperCase()}`}
            >
              <ArrowUpDown size={13} /> {sortOrder.toUpperCase()}
            </button>
          </div>
        </div>
      </div>

      {/* Employees Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Full Name</th>
                <th>Daily Wage</th>
                <th>Email</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp._id}>
                  <td style={{ fontWeight: 600, color: '#2563eb' }}>{emp.employeeId}</td>
                  <td style={{ fontWeight: 600 }}>{emp.name}</td>
                  <td style={{ fontWeight: 600 }}>£{emp.dailyWage?.toFixed(2)}</td>
                  <td style={{ color: '#64748b' }}>{emp.email || '—'}</td>
                  <td>
                    <span className={`badge badge-${emp.employmentStatus === 'Active' ? 'present' : 'absent'}`}>
                      {emp.employmentStatus}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                      <Link to={`/employees/${emp._id}`} className="btn btn-outline btn-sm" title="View Full Profile & History">
                        <Eye size={13} /> Profile
                      </Link>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditModalEmployee({ ...emp })} title="Edit Employee">
                        <Edit size={13} />
                      </button>
                      <button
                        className={`btn btn-sm ${emp.employmentStatus === 'Active' ? 'btn-outline' : 'btn-primary'}`}
                        style={{ padding: '4px 8px', fontSize: '11px', color: emp.employmentStatus === 'Active' ? '#dc2626' : undefined }}
                        onClick={() => handleToggleStatus(emp)}
                        title={emp.employmentStatus === 'Active' ? 'Deactivate Employee' : 'Activate Employee'}
                      >
                        {emp.employmentStatus === 'Active' ? <UserX size={13} /> : <UserCheck size={13} />}
                        {emp.employmentStatus === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ padding: '4px 8px', fontSize: '11px', color: '#dc2626', borderColor: '#fca5a5' }}
                        onClick={() => handleDeleteWorker(emp)}
                        title="Delete Worker Permanently"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {employees.length === 0 && !loading && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div style={{ color: '#334155', fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>No employees found</div>
                    <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '14px' }}>There are no employee records matching your current search or filters.</div>
                    {(search || selectedStatus) && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => { setSearch(''); setSelectedStatus(''); }}
                      >
                        Clear Filters
                      </button>
                    )}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan="6" style={{ padding: '24px' }}>
                    <div className="skeleton skeleton-text" style={{ width: '100%', marginBottom: '10px' }}></div>
                    <div className="skeleton skeleton-text" style={{ width: '85%', marginBottom: '10px' }}></div>
                    <div className="skeleton skeleton-text" style={{ width: '92%' }}></div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>


      {/* Create Modal */}
      {createModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Add New Employee</h2>
              <button onClick={() => setCreateModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Shahab Ahmad"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Employee ID (Automatic)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={nextEmployeeId || 'Generating ID...'}
                      readOnly
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Daily Wage (£)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-input"
                      placeholder="Enter daily wage"
                      value={formData.dailyWage}
                      onChange={(e) => setFormData({ ...formData, dailyWage: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="worker@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting || !nextEmployeeId}>
                  {submitting ? 'Creating...' : 'Create Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModalEmployee && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                Edit Employee: {editModalEmployee.name} ({editModalEmployee.employeeId})
              </h2>
              <button onClick={() => setEditModalEmployee(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="modal-body">
                <div style={{ background: '#eff6ff', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', color: '#1e40af', marginBottom: '16px' }}>
                  ℹ️ <strong>Historical Integrity Note:</strong> Daily wage changes apply to new attendance records. Past attendance and salaries remain unchanged. Select the shop separately on each day’s attendance.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editModalEmployee.name || ''}
                      onChange={(e) => setEditModalEmployee({ ...editModalEmployee, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Employee ID (Automatic)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editModalEmployee.employeeId || ''}
                      readOnly
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Daily Wage (£)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-input"
                      value={editModalEmployee.dailyWage ?? ''}
                      onChange={(e) => setEditModalEmployee({ ...editModalEmployee, dailyWage: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="worker@example.com"
                      value={editModalEmployee.email || ''}
                      onChange={(e) => setEditModalEmployee({ ...editModalEmployee, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Wage Adjustment Reason (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Reason for changing daily wage"
                    value={editModalEmployee.wageChangeReason || ''}
                    onChange={(e) => setEditModalEmployee({ ...editModalEmployee, wageChangeReason: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select
                      className="form-select"
                      value={editModalEmployee.employmentStatus}
                      onChange={(e) => setEditModalEmployee({ ...editModalEmployee, employmentStatus: e.target.value })}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Suspended">Suspended</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editModalEmployee.phone || ''}
                      onChange={(e) => setEditModalEmployee({ ...editModalEmployee, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-textarea"
                    rows="2"
                    value={editModalEmployee.notes || ''}
                    onChange={(e) => setEditModalEmployee({ ...editModalEmployee, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditModalEmployee(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
