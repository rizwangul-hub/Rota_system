import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../context/AuthContext';
import { CheckCircle2, DollarSign, Eye, RefreshCw, X, Filter } from 'lucide-react';

export default function SalaryDistributor() {
  const [salaries, setSalaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [selectedShop, setSelectedShop] = useState('');
  const [shops, setShops] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [payModalSalary, setPayModalSalary] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [payNotes, setPayNotes] = useState('');
  const [detailModalSalary, setDetailModalSalary] = useState(null);
  const [salaryDetails, setSalaryDetails] = useState(null);
  const [paymentReceipt, setPaymentReceipt] = useState(null);

  useEffect(() => {
    fetchShops();
    fetchDistributorData();
  }, [selectedWeek, selectedShop]);

  const fetchShops = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/shops`);
      if (res.data.success) setShops(res.data.shops);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDistributorData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedWeek) params.weekLabel = selectedWeek;
      const res = await axios.get(`${API_BASE_URL}/dashboard/distributor`, { params });
      if (res.data.success) {
        let list = res.data.salaries;
        if (selectedShop) {
          list = list.filter(s => s.shop?._id === selectedShop || s.shop === selectedShop);
        }
        setSalaries(list);
        setMetrics(res.data.metrics || {});
        if (!selectedWeek && res.data.currentWeek) {
          setSelectedWeek(res.data.currentWeek);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openPayModal = (salary) => {
    setPayModalSalary(salary);
    setPayAmount(salary.balanceRemaining > 0 ? salary.balanceRemaining : salary.finalSalary);
    setPaymentMethod('Cash');
    setPayNotes('');
  };

  const [isPaying, setIsPaying] = useState(false);

  const handleConfirmPayment = async (e) => {
    e.preventDefault();
    if (!payModalSalary) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > Number(payModalSalary.balanceRemaining || 0)) {
      alert(`Enter an amount between £0.01 and the outstanding £${Number(payModalSalary.balanceRemaining || 0).toFixed(2)}.`);
      return;
    }
    setIsPaying(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/salaries/${payModalSalary._id}/pay`, {
        amount,
        paymentMethod,
        notes: payNotes,
        clientReference: `${payModalSalary._id}-${Date.now()}`
      });
      if (res.data.success) {
        setPaymentReceipt(res.data.receipt || {
          employeeName: payModalSalary.employeeName,
          weekLabel: payModalSalary.weekLabel,
          paymentAmount: amount,
          paymentDate: new Date(),
          paymentMethod,
          previousPaid: payModalSalary.totalPaid,
          newTotalPaid: (payModalSalary.totalPaid || 0) + amount,
          remainingOutstanding: Math.max(0, (payModalSalary.balanceRemaining || 0) - amount),
          paidByName: 'Salary Distributor',
          status: Math.max(0, (payModalSalary.balanceRemaining || 0) - amount) === 0 ? 'PAID' : 'PARTIALLY_PAID'
        });
        setPayModalSalary(null);
        fetchDistributorData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Payment recording failed');
    } finally {
      setIsPaying(false);
    }
  };

  const openDetailsModal = async (salary) => {
    setDetailModalSalary(salary);
    try {
      const res = await axios.get(`${API_BASE_URL}/salaries/${salary._id}`);
      if (res.data.success) {
        setSalaryDetails(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>
            Salary Distributor Disbursement
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px' }}>
            Handover cash or bank transfer to staff • Mark paid on physical disbursement
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={fetchDistributorData}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="stat-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
          <div className="stat-lbl">Total Payable</div>
          <div className="stat-val" style={{ color: '#2563eb' }}>£{metrics.totalPayable?.toFixed(2) || '0.00'}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Finalized wages
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="stat-lbl">Disbursed / Paid</div>
          <div className="stat-val" style={{ color: '#059669' }}>£{metrics.totalPaid?.toFixed(2) || '0.00'}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Completed payouts
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="stat-lbl">Pending Handover</div>
          <div className="stat-val" style={{ color: '#d97706' }}>£{metrics.totalOutstanding?.toFixed(2) || '0.00'}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            {metrics.pendingCount || 0} employees awaiting pay
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="card" style={{ marginBottom: '20px', padding: '12px 18px' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label className="form-label" style={{ margin: 0 }}>Shop:</label>
            <select
              className="form-select"
              style={{ width: '180px' }}
              value={selectedShop}
              onChange={(e) => setSelectedShop(e.target.value)}
            >
              <option value="">All Shops</option>
              {shops.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Mobile-First Card List on Small Screens / Clean Table on Desktop */}
      <div className="card">
        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Shop Location</th>
                <th>Week Period</th>
                <th>Final Salary</th>
                <th>Bonus Included</th>
                <th>Paid So Far</th>
                <th>Balance Outstanding</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {salaries.map(s => (
                <tr key={s._id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{s.employeeName}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{s.employeeId}</div>
                  </td>
                  <td>{s.shopName}</td>
                  <td style={{ fontSize: '12px', color: '#475569' }}>{s.weekLabel}</td>
                  <td style={{ fontWeight: 600 }}>£{s.finalSalary?.toFixed(2)}</td>
                  <td style={{ color: s.bonus > 0 ? '#16a34a' : '#94a3b8' }}>
                    {s.bonus > 0 ? `+£${s.bonus.toFixed(2)}` : '—'}
                  </td>
                  <td style={{ color: '#059669', fontWeight: 500 }}>
                    £{s.totalPaid?.toFixed(2)}
                  </td>
                  <td>
                    <span style={{
                      fontWeight: 700,
                      color: s.balanceRemaining > 0 ? '#d97706' : '#16a34a',
                      fontSize: '14px'
                    }}>
                      £{s.balanceRemaining?.toFixed(2)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${s.status === 'PAID' ? 'paid' : s.status === 'PARTIALLY_PAID' ? 'pending' : 'finalized'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => openDetailsModal(s)}
                        title="View breakdown"
                      >
                        <Eye size={13} /> View Details
                      </button>
                      {s.balanceRemaining > 0 ? (
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => openPayModal(s)}
                          style={{ fontWeight: 600 }}
                        >
                          <CheckCircle2 size={14} /> OK / PAY
                        </button>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={14} /> Fully Paid
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {salaries.length === 0 && !loading && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    No salary records found for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pay Modal */}
      {payModalSalary && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                Disburse Payment: {payModalSalary.employeeName}
              </h2>
              <button
                onClick={() => setPayModalSalary(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleConfirmPayment}>
              <div className="modal-body">
                <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: '#64748b' }}>Week Period:</span>
                    <strong>{payModalSalary.weekLabel}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: '#64748b' }}>Total Final Salary:</span>
                    <strong>£{payModalSalary.finalSalary?.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: '#64748b' }}>Already Paid:</span>
                    <span style={{ color: '#10b981' }}>£{payModalSalary.totalPaid?.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                    <span style={{ fontWeight: 600 }}>Remaining Balance:</span>
                    <strong style={{ color: '#2563eb', fontSize: '16px' }}>£{payModalSalary.balanceRemaining?.toFixed(2)}</strong>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Disbursement Amount (£)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={payModalSalary.balanceRemaining}
                    className="form-input"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    Supports partial installments (e.g. £20,000 + £40,000) or full payment.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select
                    className="form-select"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="Cash">Cash Handover</option>
                    <option value="Bank">Bank Transfer</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Notes / Reference</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Paid in shop by Distributor"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                  />
                </div>

                {payAmount && (
                  <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '10px 14px', borderRadius: '8px', marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#475569' }}>Disbursement Amount:</span>
                      <strong style={{ color: '#059669' }}>£{Number(payAmount || 0).toFixed(2)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '4px', borderTop: '1px dashed #6ee7b7', paddingTop: '4px' }}>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>Remaining After Payment:</span>
                      <strong style={{ color: Math.max(0, Number(payModalSalary.balanceRemaining || 0) - Number(payAmount || 0)) > 0 ? '#d97706' : '#059669' }}>
                        £{Math.max(0, Number(payModalSalary.balanceRemaining || 0) - Number(payAmount || 0)).toFixed(2)}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setPayModalSalary(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-success btn-lg" disabled={isPaying}>
                  {isPaying ? 'Recording Payment...' : `Confirm Payment (£${Number(payAmount || 0).toFixed(2)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {detailModalSalary && salaryDetails && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                Salary Breakdown: {detailModalSalary.employeeName}
              </h2>
              <button
                onClick={() => setDetailModalSalary(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>WORKING DAYS</div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>{detailModalSalary.workingDays} days</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>HOURS WORKED</div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>{detailModalSalary.actualHours} hrs</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>NET ATTENDANCE PAY</div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>£{detailModalSalary.netAttendancePay?.toFixed(2)}</div>
                </div>
              </div>

              {/* Adjustments */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Allowances & Deductions</div>
                <div style={{ fontSize: '12px', color: '#475569' }}>
                  • Travel Allowance: £{detailModalSalary.travelAllowance?.toFixed(2) || '0.00'}<br />
                  • Other Allowances: £{detailModalSalary.otherAllowances?.toFixed(2) || '0.00'}<br />
                  • Manual Deductions: -£{detailModalSalary.manualDeductions?.toFixed(2) || '0.00'}<br />
                  • Bonus / Commission: +£{detailModalSalary.bonus?.toFixed(2) || '0.00'}
                </div>
              </div>

              {/* Payments History */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Disbursement History</div>
                {salaryDetails.payments?.length > 0 ? (
                  <table className="custom-table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Amount</th>
                        <th>Paid By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salaryDetails.payments.map(p => (
                        <tr key={p._id}>
                          <td>{new Date(p.paymentDate).toLocaleDateString('en-GB')}</td>
                          <td>{p.paymentMethod}</td>
                          <td style={{ fontWeight: 600, color: '#059669' }}>£{p.amount.toFixed(2)}</td>
                          <td>{p.paidByName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>No payments disbursed yet.</div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setDetailModalSalary(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Confirmation Receipt Modal */}
      {paymentReceipt && (
        <div className="modal-overlay" style={{ zIndex: 10002 }}>
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header" style={{ background: '#ecfdf5', borderBottom: '1px solid #a7f3d0' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#065f46', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color="#059669" /> Payment Confirmation Receipt
              </h2>
              <button onClick={() => setPaymentReceipt(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>AMOUNT DISBURSED</div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#059669' }}>
                  £{paymentReceipt.paymentAmount?.toFixed(2)}
                </div>
                <span className={`badge badge-${paymentReceipt.status === 'PAID' ? 'paid' : 'pending'}`}>
                  {paymentReceipt.status}
                </span>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Employee:</span>
                  <strong>{paymentReceipt.employeeName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Salary Week:</span>
                  <span>{paymentReceipt.weekLabel}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Payment Date:</span>
                  <span>{new Date(paymentReceipt.paymentDate).toLocaleString('en-GB')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Method:</span>
                  <strong>{paymentReceipt.paymentMethod}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Previous Paid:</span>
                  <span>£{paymentReceipt.previousPaid?.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>New Total Paid:</span>
                  <strong style={{ color: '#059669' }}>£{paymentReceipt.newTotalPaid?.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                  <span style={{ fontWeight: 600 }}>Remaining Outstanding:</span>
                  <strong style={{ color: (paymentReceipt.remainingOutstanding || 0) > 0 ? '#d97706' : '#059669' }}>
                    £{paymentReceipt.remainingOutstanding?.toFixed(2)}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Disbursed By:</span>
                  <span>{paymentReceipt.paidByName}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => window.print()}>
                Print Receipt
              </button>
              <button className="btn btn-primary" onClick={() => setPaymentReceipt(null)}>
                Done / Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
