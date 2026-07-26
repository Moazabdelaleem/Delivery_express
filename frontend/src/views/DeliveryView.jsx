import { useState, useEffect, useCallback } from 'react';
import { getMyDeliveries, updateDeliveryStatus, getWalletSummary, logExpense, updateOnlineStatus, getDriverLedger } from '../api.js';
import { toast } from '../App.jsx';

const STATUS_LABEL = {
  created:            'Created',
  assigned:           'Assigned',
  notified_inventory: 'Notified Inventory',
  handed_to_delivery: 'Handed to You',
  pickup_failed:      'Pickup Failed',
  in_transit:         'In Transit',
  delivered:          'Delivered',
  delivery_failed:    'Delivery Failed',
  returned_to_company:'Returned',
  cash_cleared:       'Cash Cleared',
};

const TERMINAL = ['pickup_failed', 'delivery_failed', 'returned_to_company', 'cash_cleared'];

export default function DeliveryView({ token, user }) {
  const [orders, setOrders]         = useState([]);
  const [wallet, setWallet]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [onlineStatus, setOnline]   = useState(user.online_status || 'offline');
  const [expenseModal, setExpModal] = useState(false);
  const [expAmt, setExpAmt]         = useState('');
  const [expReason, setExpReason]   = useState('');
  const [submitting, setSub]        = useState({});
  const [failModal, setFailModal]   = useState(null); // order to mark failed
  const [failReason, setFailReason] = useState('');

  const [ledgerModal, setLedgerModal] = useState(false);
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [ord, wal] = await Promise.all([
        getMyDeliveries(token),
        getWalletSummary(token),
      ]);
      setOrders(ord);
      setWallet(wal);
    } catch (err) {
      toast.error('Failed to load data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 20000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const toggleStatus = async () => {
    const next = onlineStatus === 'online' ? 'offline' : 'online';
    try {
      await updateOnlineStatus(next, token);
      setOnline(next);
      toast.success(`Status set to ${next}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const changeStatus = async (orderId, status, extra = {}) => {
    setSub(s => ({ ...s, [orderId + status]: true }));
    try {
      await updateDeliveryStatus(orderId, { status, ...extra }, token);
      toast.success(`Order updated to: ${STATUS_LABEL[status]}`);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSub(s => { const n = { ...s }; delete n[orderId + status]; return n; });
    }
  };

  const handleExpense = async (e) => {
    e.preventDefault();
    if (!expReason.trim()) { toast.error('Reason is mandatory.'); return; }
    try {
      await logExpense({ amount: parseFloat(expAmt), reason: expReason.trim() }, token);
      toast.success('Expense logged successfully.');
      setExpModal(false); setExpAmt(''); setExpReason('');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleOpenLedger = async () => {
    setLedgerModal(true);
    setLedgerData(null);
    setLedgerLoading(true);
    try {
      const data = await getDriverLedger(user.id, token);
      setLedgerData(data);
    } catch (err) {
      toast.error('Failed to load ledger: ' + err.message);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleFail = async (e) => {
    e.preventDefault();
    await changeStatus(failModal, 'delivery_failed', { failure_reason: failReason });
    setFailModal(null); setFailReason('');
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /><p>Loading your dashboard…</p></div>;

  const todayStr = new Date().toDateString();
  const active = orders.filter(o => !TERMINAL.includes(o.status) && o.status !== 'cash_cleared');
  const done   = orders.filter(o => {
    const isDone = TERMINAL.includes(o.status) || o.status === 'cash_cleared' || o.status === 'delivered';
    if (!isDone) return false;
    const dateToCheck = o.delivered_at || o.updated_at || o.created_at;
    return new Date(dateToCheck).toDateString() === todayStr;
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="section-title">My Deliveries</h1>
          <p className="section-sub">Your assigned orders and wallet</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            id="toggle-online-btn"
            className={`btn ${onlineStatus === 'online' ? 'btn-success' : 'btn-ghost'}`}
            onClick={toggleStatus}
          >
            {onlineStatus === 'online' ? '🟢 Online' : '⚫ Offline'}
          </button>
          <button id="log-expense-btn" className="btn btn-ghost" onClick={() => setExpModal(true)}>+ Log Expense</button>
        </div>
      </div>

      {/* Wallet Cards */}
      {wallet && (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', marginBottom: 24 }}>
          <div className="wallet-card">
            <div className="wallet-label">💰 Collection Cash</div>
            <div className="wallet-amount"><span>EGP</span>{parseFloat(wallet.collection_wallet?.current_balance || 0).toFixed(2)}</div>
            <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginTop: 6 }}>Pending finance pullout</div>
          </div>
          <div className="wallet-card" onClick={handleOpenLedger} style={{ cursor: 'pointer', transition: 'transform 0.2s' }} title="Click to view ledger history">
            <div className="wallet-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🎒 Pocket Allowance</span>
              <span style={{ fontSize: 10, color: 'var(--clr-accent)', fontWeight: 600 }}>📜 Ledger ➔</span>
            </div>
            <div className="wallet-amount"><span>EGP</span>{parseFloat(wallet.pocket_wallet?.current_balance || 0).toFixed(2)}</div>
            <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginTop: 6 }}>Total spent: EGP {parseFloat(wallet.pocket_wallet?.total_spent || 0).toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Active Orders */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">🚚 Active Orders <span style={{ background: 'var(--clr-accent)', color: 'white', borderRadius: 999, padding: '1px 8px', fontSize: 11, marginLeft: 6 }}>{active.length}</span></span>
        </div>
        {active.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">📭</div><p>No active orders assigned to you.</p></div>
        ) : (
          <div className="card-grid">
            {active.map(o => (
              <OrderCard
                key={o.id}
                order={o}
                submitting={submitting}
                onChangeStatus={changeStatus}
                onFail={(id) => setFailModal(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Completed Orders */}
      {done.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">✅ Completed Orders</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tracking</th><th>Client</th><th>Amount</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {done.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600, color: 'var(--clr-accent)' }}>{o.tracking_number}</td>
                    <td>{o.client_name}</td>
                    <td className="amount">EGP {parseFloat(o.order_amount).toFixed(2)}</td>
                    <td><span className={`badge badge-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {expenseModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">💸 Log Pocket Expense</h2>
            <form id="expense-form" onSubmit={handleExpense}>
              <div className="form-group">
                <label className="form-label">Amount (EGP)</label>
                <input id="expense-amount" className="form-input" type="number" min="0.01" step="0.01" placeholder="e.g. 35.00" value={expAmt} onChange={e => setExpAmt(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Reason <span style={{ color: 'var(--clr-danger)' }}>*</span></label>
                <textarea id="expense-reason" className="form-textarea" placeholder="e.g. Fuel refill for delivery route" value={expReason} onChange={e => setExpReason(e.target.value)} required />
                <div className="form-hint">Reason is mandatory for all pocket expenses.</div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setExpModal(false)}>Cancel</button>
                <button id="expense-submit" type="submit" className="btn btn-primary">Log Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delivery Failed Modal */}
      {failModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">❌ Mark Delivery Failed</h2>
            <form onSubmit={handleFail}>
              <div className="form-group">
                <label className="form-label">Reason <span style={{ color: 'var(--clr-danger)' }}>*</span></label>
                <textarea className="form-textarea" placeholder="e.g. Client unreachable after 3 attempts" value={failReason} onChange={e => setFailReason(e.target.value)} required />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setFailModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-danger">Confirm Failure</button>
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
                <h2 className="modal-title" style={{ marginBottom: 2 }}>📜 Pocket Wallet Ledger</h2>
                <p style={{ fontSize: 13, color: 'var(--clr-text-muted)' }}>
                  Driver: <strong>{user.name}</strong> (@{user.username})
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setLedgerModal(false)}>✕</button>
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
              <button className="btn btn-ghost" onClick={() => setLedgerModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({ order: o, submitting, onChangeStatus, onFail }) {
  const isLoading = (status) => submitting[o.id + status];

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--clr-accent)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, color: 'var(--clr-accent)', fontSize: 13 }}>{o.tracking_number}</span>
        <span className={`badge badge-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{o.client_name}</div>
      <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 4 }}>📞 {o.client_phone}</div>
      <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 10 }}>📍 {o.client_address}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <a href={`tel:${o.client_phone}`} className="btn btn-ghost btn-sm">📞 Call</a>
        <a href={`https://maps.google.com/?q=${encodeURIComponent(o.client_address)}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">🗺️ Map</a>
      </div>
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--clr-success)', marginBottom: 12 }}>
        EGP {parseFloat(o.order_amount).toFixed(2)}
      </div>
      <div className="row-actions">
        {o.status === 'handed_to_delivery' && (
          <button className="btn btn-primary btn-sm" disabled={isLoading('in_transit')} onClick={() => onChangeStatus(o.id, 'in_transit')}>
            {isLoading('in_transit') ? <span className="spinner" /> : '🚚 Start Transit'}
          </button>
        )}
        {o.status === 'in_transit' && (
          <>
            <button className="btn btn-success btn-sm" disabled={isLoading('delivered')} onClick={() => onChangeStatus(o.id, 'delivered')}>
              {isLoading('delivered') ? <span className="spinner" /> : '✅ Delivered'}
            </button>
            <button className="btn btn-danger btn-sm" disabled={isLoading('delivery_failed')} onClick={() => onFail(o.id)}>
              ❌ Failed
            </button>
          </>
        )}
        {o.status === 'delivery_failed' && (
          <button className="btn btn-warning btn-sm" disabled={isLoading('returned_to_company')} onClick={() => onChangeStatus(o.id, 'returned_to_company')}>
            {isLoading('returned_to_company') ? <span className="spinner" /> : '↩️ Return to Warehouse'}
          </button>
        )}
      </div>
    </div>
  );
}
