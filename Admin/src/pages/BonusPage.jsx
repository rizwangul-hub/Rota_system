import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import { Plus, Download, RefreshCw, X, Trash2, Edit } from 'lucide-react';

export default function BonusPage() {
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ totalSales: 0, totalBonus: 0 });
  const [month, setMonth] = useState('Aug');
  const [year, setYear] = useState('2026');
  const [employees, setEmployees] = useState([]);
  const [shops, setShops] = useState([]);

  // Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [empId, setEmpId] = useState('');
  const [shopId, setShopId] = useState('');
  const [salesAmount, setSalesAmount] = useState('');
  const [rate, setRate] = useState(1);
  const [commitment, setCommitment] = useState('');

  useEffect(() => {
    fetchEmployeesAndShops();
    fetchBonuses();
  }, [month, year]);

  const fetchEmployeesAndShops = async () => {
    try {
      const [empRes, shopRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/employees`),
        axios.get(`${API_BASE_URL}/shops`)
      ]);
      if (empRes.data.success) setEmployees(empRes.data.employees);
      if (shopRes.data.success) setShops(shopRes.data.shops);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBonuses = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/bonuses`, { params: { month, year } });
      if (res.data.success) {
        setBonuses(res.data.bonuses);
        setTotals(res.data.totals || { totalSales: 0, totalBonus: 0 });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBonus = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE_URL}/bonuses`, {
        employeeId: empId,
        shopId: shopId || undefined,
        month,
        year: Number(year),
        salesAmount: Number(salesAmount),
        bonusPercentage: Number(rate),
        commitmentText: commitment
      });
      if (res.data.success) {
        setIsAddModalOpen(false);
        setSalesAmount('');
        fetchBonuses();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create commission entry');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this commission entry?')) return;
    try {
      const res = await axios.delete(`${API_BASE_URL}/bonuses/${id}`);
      if (res.data.success) fetchBonuses();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const downloadExcel = () => {
    window.open(`${API_BASE_URL}/reports/commission/excel?month=${month}&year=${year}`, '_blank');
  };

  const calculatedCommission = salesAmount ? Number(((Number(salesAmount) * Number(rate)) / 100).toFixed(2)) : 0;

  return (
    <div className="page-container">
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>
            Monthly Sales Commission & Bonus
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px' }}>
            Formatted according to PixxTechnologies monthly shop commission spreadsheet
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-outline btn-sm" onClick={downloadExcel}>
            <Download size={14} /> Download Excel
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setIsAddModalOpen(true)}>
            <Plus size={14} /> Add Commission
          </button>
        </div>
      </div>

      {/* Month & Year Filter */}
      <div className="card" style={{ marginBottom: '20px', padding: '12px 18px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label className="form-label" style={{ margin: 0 }}>Month:</label>
            <select className="form-select" style={{ width: '120px' }} value={month} onChange={(e) => setMonth(e.target.value)}>
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label className="form-label" style={{ margin: 0 }}>Year:</label>
            <select className="form-select" style={{ width: '120px' }} value={year} onChange={(e) => setYear(e.target.value)}>
              {[2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button className="btn btn-outline btn-sm" onClick={fetchBonuses}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Spreadsheet Presentation Matching User Reference Image 1 */}
      <div className="card" style={{ padding: '0', overflow: 'hidden', border: '2px solid #000' }}>
        {/* Title Banner */}
        <div style={{ textAlign: 'center', padding: '14px', background: '#ffffff', borderBottom: '1px solid #cbd5e1' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
            Commission Details
          </h2>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#334155' }}>
            {month} {year}
          </div>
        </div>

        {/* Table with yellow headers matching user image 1 */}
        <div className="table-responsive" style={{ border: 'none' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: 'Arial, sans-serif', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#ffff00', color: '#000000', fontWeight: 'bold', borderTop: '2px solid #000', borderBottom: '2px solid #000' }}>
                <th style={{ padding: '10px 14px', border: '1px solid #000', width: '50px', textAlign: 'center' }}>No</th>
                <th style={{ padding: '10px 14px', border: '1px solid #000' }}>Name</th>
                <th style={{ padding: '10px 14px', border: '1px solid #000' }}>Commitment</th>
                <th style={{ padding: '10px 14px', border: '1px solid #000', textAlign: 'right' }}>Monthly Sale</th>
                <th style={{ padding: '10px 14px', border: '1px solid #000', textAlign: 'center', width: '80px' }}>Rate</th>
                <th style={{ padding: '10px 14px', border: '1px solid #000', textAlign: 'right' }}>Commision</th>
                <th style={{ padding: '10px 14px', border: '1px solid #000', textAlign: 'center', width: '70px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {bonuses.map((b, idx) => (
                <tr key={b._id} style={{ borderBottom: '1px solid #cbd5e1' }}>
                  <td style={{ padding: '10px 14px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                  <td style={{ padding: '10px 14px', border: '1px solid #cbd5e1', fontWeight: 600 }}>{b.employeeName}</td>
                  <td style={{ padding: '10px 14px', border: '1px solid #cbd5e1' }}>
                    {b.commitmentText || `${b.bonusPercentage}% - ${b.shopName}`}
                  </td>
                  <td style={{ padding: '10px 14px', border: '1px solid #cbd5e1', textAlign: 'right' }}>
                    {b.salesAmount ? `£${b.salesAmount.toLocaleString()}` : '£0'}
                  </td>
                  <td style={{ padding: '10px 14px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                    {b.bonusPercentage}%
                  </td>
                  <td style={{ padding: '10px 14px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                    £{b.bonusAmount?.toFixed(2)}
                  </td>
                  <td style={{ padding: '10px 14px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                    <button
                      onClick={() => handleDelete(b._id)}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}

              {bonuses.length === 0 && !loading && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                    No commission records for {month} {year}. Click "Add Commission" above.
                  </td>
                </tr>
              )}
            </tbody>
            {/* Yellow Total Row matching user image 1 */}
            <tfoot>
              <tr style={{ background: '#ffff00', color: '#000000', fontWeight: 'bold', borderTop: '2px solid #000' }}>
                <td colSpan="5" style={{ padding: '10px 14px', border: '1px solid #000', textAlign: 'center', fontSize: '14px' }}>
                  Total
                </td>
                <td style={{ padding: '10px 14px', border: '1px solid #000', textAlign: 'right', fontSize: '15px' }}>
                  £{totals.totalBonus?.toFixed(2) || '0.00'}
                </td>
                <td style={{ border: '1px solid #000' }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Add Commission Modal */}
      {isAddModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Add Monthly Commission</h2>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateBonus}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Employee</label>
                  <select
                    className="form-select"
                    value={empId}
                    onChange={(e) => {
                      setEmpId(e.target.value);
                      const emp = employees.find(x => x._id === e.target.value);
                      if (emp && emp.assignedShop) {
                        setShopId(emp.assignedShop._id || emp.assignedShop);
                        setCommitment(`${rate}% - ${emp.assignedShop.name || 'Shop'}`);
                      }
                    }}
                    required
                  >
                    <option value="">Select Employee</option>
                    {employees.map(e => <option key={e._id} value={e._id}>{e.name} ({e.employeeId})</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Shop Location</label>
                  <select
                    className="form-select"
                    value={shopId}
                    onChange={(e) => {
                      setShopId(e.target.value);
                      const s = shops.find(x => x._id === e.target.value);
                      if (s) setCommitment(`${rate}% - ${s.name}`);
                    }}
                  >
                    <option value="">Select Shop</option>
                    {shops.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Monthly Sales Amount (£)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      placeholder="e.g. 10000"
                      value={salesAmount}
                      onChange={(e) => setSalesAmount(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Rate / Percentage (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-input"
                      placeholder="e.g. 1, 2, 3"
                      value={rate}
                      onChange={(e) => {
                        setRate(e.target.value);
                        const s = shops.find(x => x._id === shopId);
                        if (s) setCommitment(`${e.target.value}% - ${s.name}`);
                      }}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Commitment Label (Shown in Report)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 1% - Leebridge"
                    value={commitment}
                    onChange={(e) => setCommitment(e.target.value)}
                  />
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Calculated Commission:</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#2563eb' }}>
                    £{calculatedCommission.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Formula: £{Number(salesAmount || 0)} × {rate}% / 100</div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Commission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
