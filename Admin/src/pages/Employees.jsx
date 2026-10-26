import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import { Search, Edit, Eye, UserPlus, X, ArrowUpRight, UserCheck, UserX, ArrowUpDown, Trash2, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import ComplianceExpiryBanner from '../components/ComplianceExpiryBanner';
import EmployeeJoiningModal from '../components/EmployeeJoiningModal';

// Module-level cache for employee list across tab navigation
const _employeesCache = new Map();

export default function Employees() {
  const defaultCacheKey = 'status:_search:_sort:name_asc';
  const initialCached = _employeesCache.get(defaultCacheKey);

  const [employees, setEmployees] = useState(() => initialCached?.employees || []);
  const [loading, setLoading] = useState(() => !initialCached);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [shops, setShops] = useState([]);

  // Joining / Profile Modal State
  const [joiningModalOpen, setJoiningModalOpen] = useState(false);
  const [joiningModalEmployee, setJoiningModalEmployee] = useState(null);
  const [joiningModalTab, setJoiningModalTab] = useState('personal');
  const [complianceRefresh, setComplianceRefresh] = useState(0);

  const currentCacheKey = `status:${selectedStatus}_search:${search}_sort:${sortBy}_${sortOrder}`;

  useEffect(() => {
    fetchEmployees();
  }, [selectedStatus, search, sortBy, sortOrder]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/shops`).then(res => {
      if (res.data?.success) setShops(res.data.shops || []);
    }).catch(err => console.warn('Could not load shops:', err.message));
  }, []);

  const fetchEmployees = async () => {
    const cached = _employeesCache.get(currentCacheKey);
    // If not cached, or if we have no employees at all, show initial loading
    if (!cached && employees.length === 0) {
      setLoading(true);
    }
    try {
      const params = { sortBy, sortOrder };
      if (selectedStatus) params.status = selectedStatus;
      if (search) params.search = search;

      const res = await axios.get(`${API_BASE_URL}/employees`, { params });
      if (res.data.success) {
        const list = res.data.employees || [];
        setEmployees(list);
        _employeesCache.set(currentCacheKey, { employees: list, fetchedAt: Date.now() });
      }
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
        _employeesCache.clear();
        fetchEmployees();
        setComplianceRefresh(prev => prev + 1);
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
        _employeesCache.clear();
        alert(res.data.message || `Worker ${employee.name} deleted successfully.`);
        fetchEmployees();
        setComplianceRefresh(prev => prev + 1);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete worker');
    }
  };

  const handleOpenAddEmployee = () => {
    setJoiningModalEmployee(null);
    setJoiningModalTab('personal');
    setJoiningModalOpen(true);
  };

  const handleOpenEditEmployee = (emp, tab = 'personal') => {
    setJoiningModalEmployee(emp);
    setJoiningModalTab(tab);
    setJoiningModalOpen(true);
  };

  const handleComplianceEdit = async (employeeMongoId, tab = 'right_to_work') => {
    const found = employees.find(e => String(e._id) === String(employeeMongoId));
    if (found) {
      handleOpenEditEmployee(found, tab);
    } else {
      try {
        const res = await axios.get(`${API_BASE_URL}/employees/${employeeMongoId}/profile`);
        if (res.data?.employee) {
          handleOpenEditEmployee(res.data.employee, tab);
        }
      } catch (err) {
        alert('Could not open worker record: ' + err.message);
      }
    }
  };

  const handleModalSaved = () => {
    _employeesCache.clear();
    fetchEmployees();
    setComplianceRefresh(prev => prev + 1);
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
            Manage employee joining profiles, right-to-work compliance, Cloudinary documents, and attendance pay
          </p>
        </div>

        <button className="btn btn-primary btn-sm" onClick={handleOpenAddEmployee}>
          <UserPlus size={15} /> Add Employee (Joining Form)
        </button>
      </div>

      {/* Persistent Compliance Alert Banner (1 Month & 1 Week Expiring Visas/Passports/Documents) */}
      <ComplianceExpiryBanner
        onEditEmployee={handleComplianceEdit}
        refreshTrigger={complianceRefresh}
      />

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
                <th>Opening Bal</th>
                <th>Role & Location</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp._id}>
                  <td>
                    <Link
                      to={`/employees/${emp._id}`}
                      className="table-link-primary"
                      title={`Open ${emp.name}'s Profile (${emp.employeeId})`}
                    >
                      {emp.employeeId}
                    </Link>
                  </td>
                  <td>
                    <Link
                      to={`/employees/${emp._id}`}
                      className="table-link-name"
                      title={`Open ${emp.name}'s Profile`}
                    >
                      {emp.name}
                    </Link>
                  </td>
                  <td style={{ fontWeight: 600 }}>£{emp.dailyWage?.toFixed(2)}</td>
                  <td style={{ fontWeight: 600, color: (emp.openingBalance || 0) !== 0 ? '#7c3aed' : '#94a3b8' }}>
                    {(emp.openingBalance || 0) !== 0 ? `£${Number(emp.openingBalance).toFixed(2)}` : '£0.00'}
                  </td>
                  <td style={{ color: '#64748b', fontSize: '12px' }}>
                    <div>{emp.jobTitle || 'Worker'}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{emp.workLocation || emp.assignedShop?.name || 'Pixx Retail'}</div>
                  </td>
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
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => handleOpenEditEmployee(emp, 'personal')}
                        title="Edit Joining Profile & Documents"
                      >
                        <Edit size={13} /> Edit
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
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {employees.length === 0 && !loading && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px 20px' }}>
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
                  <td colSpan="7" style={{ padding: '24px' }}>
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

      {/* Unified Employee Joining & Profile Modal (Add New Employee or Edit Worker) */}
      <EmployeeJoiningModal
        isOpen={joiningModalOpen}
        onClose={() => setJoiningModalOpen(false)}
        employee={joiningModalEmployee}
        defaultTab={joiningModalTab}
        onSaved={handleModalSaved}
        shops={shops}
      />
    </div>
  );
}
