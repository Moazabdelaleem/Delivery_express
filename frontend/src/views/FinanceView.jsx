import { useState, useEffect, useCallback } from 'react';
import { getAllWallets, pulloutCollection, topupPocket, getExpenses, getDriverLedger, getGlobalAudit, getPendingPayments, confirmPayment, rejectPayment } from '../api.js';
import { toast } from '../App.jsx';

export default function FinanceView({ token }) {
  const [wallets, setWallets]           = useState([]);
  const [expenses, setExpenses]         = useState(null);
  const [globalAudit, setGlobalAudit]   = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [pullModal, setPullModal]       = useState(null); // driver
  const [topupModal, setTopup]          = useState(null); // driver
  const [ledgerModal, setLedgerModal]   = useState(null); // driver
  const [confirmActionModal, setConfirmActionModal] = useState(null); // { payment, action: 'confirm' | 'reject' }
  const [ledgerData, setLedgerData]     = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [pullAmt, setPullAmt]           = useState('');
  const [topupAmt, setTopupAmt]         = useState('');
  const [topupNote, setTopupNote]       = useState('');
  const [submitting, setSub]            = useState(false);
  const [activeTab, setActiveTab]       = useState('pending');

  const fetchData = useCallback(async () => {
    try {
      const [wal, exp, aud, pend] = await Promise.all([
        getAllWallets(token),
        getExpenses(token),
        getGlobalAudit(token).catch(() => []),
        getPendingPayments(token).catch(() => [])
      ]);
      setWallets(Array.isArray(wal) ? wal : []);
      setExpenses(exp);
      setGlobalAudit(Array.isArray(aud) ? aud : []);
      setPendingPayments(Array.isArray(pend) ? pend : []);
    } catch (err) {
      toast.error('Failed to load: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 20000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const handleConfirmPayment = async (paymentId) => {
    setSub(true);
    try {
      await confirmPayment(paymentId, token);
      toast.success('Payment confirmed successfully!');
      setConfirmActionModal(null);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSub(false);
    }
  };

  const handleRejectPayment = async (paymentId) => {
    setSub(true);
    try {
      await rejectPayment(paymentId, token);
      toast.success('Payment rejected.');
      setConfirmActionModal(null);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSub(false);
    }
  };

  const handleOpenLedger = async (driver) => {
    setLedgerModal(driver);
    setLedgerData(null);
    setLedgerLoading(true);
    try {
      const data = await getDriverLedger(driver.id, token);
      setLedgerData(data);
    } catch (err) {
      toast.error('Failed to load ledger: ' + err.message);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handlePullout = async (e) => {
    e.preventDefault();
    setSub(true);
    try {
      await pulloutCollection({
        delivery_guy_id: pullModal.id,
        amount_to_pull: pullAmt ? parseFloat(pullAmt) : undefined,
        notes: 'Finance cash pullout',
      }, token);
      toast.success(`Cash pulled from ${pullModal.name}`);
      setPullModal(null); setPullAmt('');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSub(false);
    }
  };

  const handleTopup = async (e) => {
    e.preventDefault();
    setSub(true);
    try {
      await topupPocket({
        delivery_guy_id: topupModal.id,
        amount: parseFloat(topupAmt),
        notes: topupNote.trim() || 'Weekly pocket allowance',
      }, token);
      toast.success(`Topped up EGP ${topupAmt} for ${topupModal.name}`);
      setTopup(null); setTopupAmt(''); setTopupNote('');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSub(false);
    }
  };

  const totalCollection = wallets.reduce((s, w) => s + parseFloat(w.collection_balance || 0), 0);
  const totalPocket     = wallets.reduce((s, w) => s + parseFloat(w.pocket_balance || 0), 0);

  if (loading) return <div className="loading-screen"><div className="spinner" /><p>Loading finance data…</p></div>;

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">Finance Dashboard</h1>
          <p className="section-sub">Manage driver wallets, cash pullouts, and pocket allowances</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Pending Cash</div>
          <div className="stat-value amount-positive">EGP {totalCollection.toFixed(2)}</div>
          <div className="stat-sub">Across all drivers</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Pocket Balance</div>
          <div className="stat-value" style={{ color: 'var(--clr-accent)' }}>EGP {totalPocket.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Expenses Paid</div>
          <div className="stat-value" style={{ color: 'var(--clr-warning)' }}>
            EGP {parseFloat(expenses?.grand_total_spent || 0).toFixed(2)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Drivers</div>
          <div className="stat-value">{wallets.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-row" style={{ marginBottom: 20 }}>
        <button className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
          ⏳ Pending Payment Review {pendingPayments.length > 0 && <span className="badge badge-warning" style={{ marginLeft: 6 }}>{pendingPayments.length}</span>}
        </button>
        <button className={`tab-btn ${activeTab === 'wallets' ? 'active' : ''}`} onClick={() => setActiveTab('wallets')}>
          💰 Wallets
        </button>
        <button className={`tab-btn ${activeTab === 'expenses' ? 'active' : ''}`} onClick={() => setActiveTab('expenses')}>
          💸 Expenses
        </button>
        <button className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
          🧾 Cash Flow Audit
        </button>
      </div>

      {activeTab === 'pending' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">⏳ Order Payments Awaiting Finance Confirmation</span>
            <span style={{ fontSize: 13, color: 'var(--clr-text-muted)' }}>
              Confirming cash payments will deposit the amount to collection wallets. E-payments are recorded directly.
            </span>
          </div>
          <div className="table-wrap">
            {pendingPayments.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">✅</div><p>No payments currently awaiting finance review.</p></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Tracking #</th>
                    <th>Address</th>
                    <th>Recorded By</th>
                    <th>Driver</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPayments.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 700, color: 'var(--clr-accent)' }}>#{p.tracking_number}</td>
                      <td style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>{p.client_address}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{p.recorded_by_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', textTransform: 'capitalize' }}>{p.recorded_by_role}</div>
                      </td>
                      <td>{p.delivery_guy_name || '—'}</td>
                      <td>
                        <span className="badge badge-assigned" style={{ textTransform: 'uppercase', fontSize: 11 }}>
                          {p.payment_method}
                        </span>
                      </td>
                      <td className="amount amount-positive">
                        EGP {parseFloat(p.amount).toFixed(2)}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--clr-text-dim)' }}>
                        {new Date(p.created_at || p.paid_at).toLocaleString()}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="btn btn-success btn-sm"
                            disabled={submitting}
                            onClick={() => setConfirmActionModal({ payment: p, action: 'confirm' })}
                          >
                            ✓ Confirm
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={submitting}
                            onClick={() => setConfirmActionModal({ payment: p, action: 'reject' })}
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'wallets' && (
        <div className="card">
          <div className="table-wrap">
            {wallets.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">👤</div><p>No drivers registered yet.</p></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Status</th>
                    <th>Collection Cash</th>
                    <th>Pocket Balance</th>
                    <th>Total Topped Up</th>
                    <th>Total Spent</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map(w => (
                    <tr key={w.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{w.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>@{w.username}</div>
                      </td>
                      <td>
                        <span className={`badge badge-${w.online_status}`}>
                          {w.online_status === 'online' && <span className="pulse" />}
                          {w.online_status}
                        </span>
                      </td>
                      <td>
                        <span className={`amount ${parseFloat(w.collection_balance) > 0 ? 'amount-positive' : ''}`}>
                          EGP {parseFloat(w.collection_balance || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="amount" onClick={() => handleOpenLedger(w)} style={{ cursor: 'pointer', textDecoration: 'underline' }} title="Click to view ledger history">EGP {parseFloat(w.pocket_balance || 0).toFixed(2)}</td>
                      <td style={{ color: 'var(--clr-text-muted)' }}>EGP {parseFloat(w.total_topped_up || 0).toFixed(2)}</td>
                      <td style={{ color: 'var(--clr-warning)' }}>EGP {parseFloat(w.total_spent || 0).toFixed(2)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            id={`pullout-${w.id}`}
                            className="btn btn-success btn-sm"
                            disabled={parseFloat(w.collection_balance) <= 0}
                            onClick={() => { setPullModal(w); setPullAmt(''); }}
                          >
                            💵 Pull Cash
                          </button>
                          <button
                            id={`topup-${w.id}`}
                            className="btn btn-primary btn-sm"
                            onClick={() => { setTopup(w); setTopupAmt(''); setTopupNote(''); }}
                          >
                            ➕ Top Up
                          </button>
                          <button
                            id={`ledger-${w.id}`}
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleOpenLedger(w)}
                          >
                            📜 Ledger ➔
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">🧾 Pocket Expenses</span>
            <span style={{ fontWeight: 700, color: 'var(--clr-warning)' }}>
              Grand Total: EGP {parseFloat(expenses?.grand_total_spent || 0).toFixed(2)}
            </span>
          </div>
          <div className="table-wrap">
            {!expenses?.breakdown?.length ? (
              <div className="empty-state"><div className="empty-icon">🧾</div><p>No expenses recorded yet.</p></div>
            ) : (
              <table>
                <thead>
                  <tr><th>Driver</th><th>Amount</th><th>Reason</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {expenses.breakdown.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 500 }}>{e.delivery_guy_name}</td>
                      <td className="amount amount-negative">EGP {parseFloat(e.amount).toFixed(2)}</td>
                      <td style={{ color: 'var(--clr-text-muted)', fontSize: 13 }}>{e.reason}</td>
                      <td style={{ fontSize: 11, color: 'var(--clr-text-dim)' }}>{new Date(e.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">🧾 Cash Flow Audit Log</span>
            <span style={{ fontSize: 13, color: 'var(--clr-text-muted)' }}>
              Recorded cash inflows and outflows with precise date-times
            </span>
          </div>
          <div className="table-wrap">
            {globalAudit.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">🧾</div><p>No cash flow logs recorded yet.</p></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Driver</th>
                    <th>Amount</th>
                    <th>Balance After</th>
                    <th>Reason / Details</th>
                    <th>Performed By</th>
                    <th>Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {globalAudit.map(tx => {
                    const isTopup = tx.transaction_type === 'finance_topup' || tx.transaction_type === 'topup' || (parseFloat(tx.amount) > 0 && tx.transaction_type !== 'pocket_expense' && tx.transaction_type !== 'collection_pullout');
                    const isPull = tx.transaction_type === 'collection_pullout' || tx.transaction_type === 'pullout';
                    
                    let badgeClass = 'badge-delivered';
                    let label = '💳 Pocket Top-Up';
                    
                    if (isPull) {
                      badgeClass = 'badge-assigned';
                      label = '📥 Coll. Pullout';
                    } else if (tx.transaction_type === 'pocket_expense') {
                      badgeClass = 'badge-delivery_failed';
                      label = '⛽ Pocket Expense';
                    }

                    const isOutflow = tx.transaction_type === 'pocket_expense' || tx.transaction_type === 'finance_topup' || tx.transaction_type === 'topup';
                    
                    return (
                      <tr key={tx.id}>
                        <td><span className={`badge ${badgeClass}`}>{label}</span></td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{tx.driver_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>@{tx.driver_username}</div>
                        </td>
                        <td style={{ fontWeight: 700, color: isOutflow ? 'var(--clr-danger)' : 'var(--clr-success)' }}>
                          {isOutflow ? '-' : '+'}EGP {parseFloat(tx.amount).toFixed(2)}
                        </td>
                        <td style={{ fontWeight: 600 }}>EGP {parseFloat(tx.balance_after).toFixed(2)}</td>
                        <td style={{ fontSize: 13, color: 'var(--clr-text-muted)' }}>
                          {tx.notes_or_reason || '—'}
                        </td>
                        <td>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{tx.performed_by_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', textTransform: 'capitalize' }}>
                            {tx.performed_by_role}
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--clr-text-dim)', whiteSpace: 'nowrap' }}>
                          <strong>{new Date(tx.created_at).toLocaleDateString()}</strong> {new Date(tx.created_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Pull Cash Modal */}
      {pullModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">💵 Pull Cash — {pullModal.name}</h2>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 13, marginBottom: 16 }}>
              Collection balance: <strong style={{ color: 'var(--clr-success)' }}>EGP {parseFloat(pullModal.collection_balance).toFixed(2)}</strong>
            </p>
            <form onSubmit={handlePullout}>
              <div className="form-group">
                <label className="form-label">Amount to Pull <span style={{ color: 'var(--clr-text-dim)' }}>(leave blank for full balance)</span></label>
                <input
                  id="pullout-amount"
                  className="form-input"
                  type="number" min="0.01" step="0.01"
                  placeholder={`Max: ${parseFloat(pullModal.collection_balance).toFixed(2)}`}
                  value={pullAmt}
                  onChange={e => setPullAmt(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setPullModal(null)}>Cancel</button>
                <button id="pullout-submit" type="submit" className="btn btn-success" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : '✅ Confirm Pullout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top-up Modal */}
      {topupModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">➕ Top Up Pocket — {topupModal.name}</h2>
            <form onSubmit={handleTopup}>
              <div className="form-group">
                <label className="form-label">Amount (EGP) <span style={{ color: 'var(--clr-danger)' }}>*</span></label>
                <input
                  id="topup-amount"
                  className="form-input"
                  type="number" min="1" step="0.01"
                  placeholder="e.g. 50.00"
                  value={topupAmt}
                  onChange={e => setTopupAmt(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Note</label>
                <input
                  id="topup-note"
                  className="form-input"
                  placeholder="e.g. Weekly pocket allowance"
                  value={topupNote}
                  onChange={e => setTopupNote(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setTopup(null)}>Cancel</button>
                <button id="topup-submit" type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : '➕ Top Up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Driver Pocket Wallet Ledger Modal */}
      {ledgerModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 680, width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 className="modal-title" style={{ marginBottom: 2 }}>📜 Driver Pocket Wallet Ledger</h2>
                <p style={{ fontSize: 13, color: 'var(--clr-text-muted)' }}>
                  Driver: <strong>{ledgerModal.name}</strong> (@{ledgerModal.username})
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setLedgerModal(null)}>✕</button>
            </div>

            {ledgerLoading ? (
              <div className="loading-screen" style={{ padding: 40 }}><div className="spinner" /><p>Fetching ledger history…</p></div>
            ) : ledgerData ? (
              <div>
                {/* Summary Banner */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20,
                  background: 'var(--clr-bg-subtle)', padding: 14, borderRadius: 'var(--r-md)', border: '1px solid var(--clr-border)'
                }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', fontWeight: 600 }}>AVAILABLE BALANCE</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--clr-success)' }}>
                      EGP {parseFloat(ledgerData.pocket_wallet?.current_balance || 0).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', fontWeight: 600 }}>TOTAL TOPPED UP</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--clr-accent)' }}>
                      EGP {parseFloat(ledgerData.pocket_wallet?.total_topped_up || 0).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', fontWeight: 600 }}>TOTAL SPENT</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--clr-warning)' }}>
                      EGP {parseFloat(ledgerData.pocket_wallet?.total_spent || 0).toFixed(2)}
                    </div>
                  </div>
                </div>

                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Chronological Transaction History</h4>
                <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {!ledgerData.transactions || ledgerData.transactions.length === 0 ? (
                    <div className="empty-state" style={{ padding: 20 }}><p>No transactions recorded yet.</p></div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Type</th><th>Amount</th><th>Balance After</th><th>By / Reason</th><th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerData.transactions.map((tx, idx) => {
                          const isTopup = tx.transaction_type === 'finance_topup' || parseFloat(tx.amount) > 0 && tx.transaction_type !== 'pocket_expense';
                          return (
                            <tr key={tx.id || idx}>
                              <td>
                                <span className={`badge ${isTopup ? 'badge-delivered' : 'badge-delivery_failed'}`}>
                                  {isTopup ? '💳 Top-Up' : '⛽ Expense'}
                                </span>
                              </td>
                              <td style={{ fontWeight: 700, color: isTopup ? 'var(--clr-success)' : 'var(--clr-danger)' }}>
                                {isTopup ? '+' : '-'}EGP {parseFloat(tx.amount).toFixed(2)}
                              </td>
                              <td style={{ fontWeight: 600 }}>EGP {parseFloat(tx.balance_after).toFixed(2)}</td>
                              <td style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>
                                {tx.notes_or_reason || tx.performed_by_name || '—'}
                              </td>
                              <td style={{ fontSize: 11, color: 'var(--clr-text-dim)' }}>
                                {new Date(tx.created_at).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : null}

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setLedgerModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      {confirmActionModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">
              {confirmActionModal.action === 'confirm' ? 'Confirm Payment Verification' : 'Reject Payment Submission'}
            </h2>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
              Are you sure you want to {confirmActionModal.action === 'confirm' ? 'CONFIRM' : 'REJECT'} payment of{' '}
              <strong style={{ color: 'var(--clr-accent)' }}>EGP {parseFloat(confirmActionModal.payment.amount).toFixed(2)}</strong> for order #{confirmActionModal.payment.tracking_number}?
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmActionModal(null)}>Cancel</button>
              <button
                className={`btn ${confirmActionModal.action === 'confirm' ? 'btn-success' : 'btn-danger'}`}
                disabled={submitting}
                onClick={() => confirmActionModal.action === 'confirm'
                  ? handleConfirmPayment(confirmActionModal.payment.id)
                  : handleRejectPayment(confirmActionModal.payment.id)
                }
              >
                {confirmActionModal.action === 'confirm' ? 'Confirm Payment' : 'Reject Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
