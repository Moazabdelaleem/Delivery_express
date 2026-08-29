import { useState, useEffect, useCallback } from 'react';
import { getAllOrders, getAllWallets, getPendingUsers, approveUser, rejectUser, getDriverLedger } from '../api.js';
import { toast } from '../App.jsx';
import { STATUS_LABEL } from '../constants/statusLabels.js';

export default function ManagerView({ token }) {
  const [orders, setOrders]       = useState([]);
  const [wallets, setWallets]     = useState([]);
  const [pending, setPending]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('orders');
  const [submitting, setSub]      = useState({});
  const [filter, setFilter]       = useState('all');

  const [ledgerModal, setLedgerModal] = useState(null); // driver object
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [ord, wal, pend] = await Promise.all([
        getAllOrders(token),
        getAllWallets(token),
        getPendingUsers(token),
      ]);
      setOrders(ord);
      setWallets(Array.isArray(wal) ? wal : []);
      setPending(pend);
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

  const handleApprove = async (id) => {
    setSub(s => ({ ...s, [id]: 'approve' }));
    try {
      await approveUser(id, token);
      toast.success('User account approved.');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSub(s => { const n = { ...s }; delete n[id]; return n; });
    }
  };

  const handleReject = async (id) => {
    setSub(s => ({ ...s, [id]: 'reject' }));
    try {
      await rejectUser(id, token);
      toast.info('User account rejected and removed.');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSub(s => { const n = { ...s }; delete n[id]; return n; });
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

  const counts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  const totalRevenue = orders
    .filter(o => o.status === 'cash_cleared')
    .reduce((s, o) => s + parseFloat(o.order_amount || 0), 0);

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  if (loading) return <div className="loading-screen"><div className="spinner" /><p>Loading manager data…</p></div>;

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">Executive Dashboard</h1>
          <p className="section-sub">Full system overview — read-only except approvals and system actions</p>
        </div>
      </div>

      {/* Pending Approvals Banner */}
      {pending.length > 0 && (
        <div style={{
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 'var(--r-md)', padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <span style={{ color: 'var(--clr-warning)', fontSize: 13, fontWeight: 500 }}>
            ⚠️ {pending.length} manager account{pending.length > 1 ? 's' : ''} pending approval
          </span>
          <button className="btn btn-warning btn-sm" onClick={() => setActiveTab('approvals')}>
            Review →
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Orders</div>
          <div className="stat-value">{orders.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Delivered</div>
          <div className="stat-value" style={{ color: 'var(--clr-success)' }}>{counts.delivered || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Cash Cleared</div>
          <div className="stat-value" style={{ color: 'var(--clr-accent)' }}>{counts.cash_cleared || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Revenue Cleared</div>
          <div className="stat-value amount-positive">EGP {totalRevenue.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Transit</div>
          <div className="stat-value" style={{ color: 'var(--clr-purple)' }}>{counts.in_transit || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Approvals</div>
          <div className="stat-value" style={{ color: pending.length > 0 ? 'var(--clr-warning)' : 'var(--clr-text-muted)' }}>
            {pending.length}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-row" style={{ marginBottom: 20 }}>
        <button className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>📋 Orders</button>
        <button className={`tab-btn ${activeTab === 'wallets' ? 'active' : ''}`} onClick={() => setActiveTab('wallets')}>💰 Wallets</button>
        <button className={`tab-btn ${activeTab === 'approvals' ? 'active' : ''}`} onClick={() => setActiveTab('approvals')}>
          👥 Approvals {pending.length > 0 && <span style={{ background: 'var(--clr-warning)', color: 'white', borderRadius: 999, padding: '0 6px', fontSize: 10, marginLeft: 4 }}>{pending.length}</span>}
        </button>
      </div>

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div className="card">
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {['all', 'assigned', 'in_transit', 'delivered', 'cash_cleared', 'delivery_failed'].map(s => (
              <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(s)}>
                {s === 'all' ? 'All' : STATUS_LABEL[s]}
                {s !== 'all' && counts[s] ? ` (${counts[s]})` : ''}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Tracking</th><th>Address</th><th>Driver</th><th>Amount</th><th>Status</th><th>Date</th></tr>
              </thead>
              <tbody>
                {filtered.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 700, color: 'var(--clr-accent)' }}>{o.tracking_number}</td>
                    <td style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>{o.client_address}</td>
                    <td>{o.delivery_guy_name || <span style={{ color: 'var(--clr-text-dim)' }}>—</span>}</td>
                    <td className="amount">EGP {parseFloat(o.order_amount).toFixed(2)}</td>
                    <td><span className={`badge badge-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--clr-text-dim)' }}>{new Date(o.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Wallets Tab (Read-Only) */}
      {activeTab === 'wallets' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Driver</th><th>Status</th><th>Collection Cash</th><th>Pocket Balance</th><th>Total Spent</th></tr>
              </thead>
              <tbody>
                {wallets.map(w => (
                  <tr key={w.id}>
                    <td style={{ fontWeight: 600 }}>{w.name}</td>
                    <td><span className={`badge badge-${w.online_status}`}>{w.online_status}</span></td>
                    <td className="amount amount-positive">EGP {parseFloat(w.collection_balance || 0).toFixed(2)}</td>
                    <td className="amount" onClick={() => handleOpenLedger(w)} style={{ cursor: 'pointer', textDecoration: 'underline' }} title="Click to view ledger history">EGP {parseFloat(w.pocket_balance || 0).toFixed(2)}</td>
                    <td style={{ color: 'var(--clr-warning)' }}>EGP {parseFloat(w.total_spent || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approvals Tab */}
      {activeTab === 'approvals' && (
        <div className="card">
          {pending.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">✅</div><p>No pending user approvals.</p></div>
          ) : (
            <div className="card-grid">
              {pending.map(m => (
                <div key={m.id} className="card" style={{ borderLeft: '3px solid var(--clr-warning)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{m.name}</div>
                    <span className="badge badge-assigned" style={{ textTransform: 'capitalize' }}>
                      {m.role ? m.role.replace('_', ' ') : 'User'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 4 }}>@{m.username}</div>
                  {m.phone && <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 12 }}>📞 {m.phone}</div>}
                  <div style={{ fontSize: 11, color: 'var(--clr-text-dim)', marginBottom: 14 }}>
                    Registered: {new Date(m.created_at).toLocaleDateString()}
                  </div>
                  <div className="row-actions">
                    <button
                      id={`approve-${m.id}`}
                      className="btn btn-success btn-sm"
                      disabled={submitting[m.id] === 'approve'}
                      onClick={() => handleApprove(m.id)}
                    >
                      {submitting[m.id] === 'approve' ? <span className="spinner" /> : '✅ Approve'}
                    </button>
                    <button
                      id={`reject-${m.id}`}
                      className="btn btn-danger btn-sm"
                      disabled={submitting[m.id] === 'reject'}
                      onClick={() => handleReject(m.id)}
                    >
                      {submitting[m.id] === 'reject' ? <span className="spinner" /> : '❌ Reject'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Driver Pocket Wallet Ledger Modal */}
      {ledgerModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 700, width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 className="modal-title" style={{ marginBottom: 2 }}>📜 Pocket Wallet Ledger</h2>
                <p style={{ fontSize: 13, color: 'var(--clr-text-muted)' }}>
                  Driver: <strong>{ledgerModal.name}</strong> (@{ledgerModal.username})
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setLedgerModal(null); setLedgerData(null); }}>✕</button>
            </div>

            {ledgerLoading ? (
              <div className="loading-screen" style={{ padding: 40 }}><div className="spinner" /><p>Fetching ledger history…</p></div>
            ) : ledgerData ? (
              <div>
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

                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Transaction History</h4>
                <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {!ledgerData.transactions || ledgerData.transactions.length === 0 ? (
                    <div className="empty-state" style={{ padding: 20 }}><p>No transactions recorded yet.</p></div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Type</th><th>Amount</th><th>Balance After</th><th>By / Reason</th><th>Date & Time</th>
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
                              <td>EGP {parseFloat(tx.balance_after).toFixed(2)}</td>
                              <td style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>
                                {tx.notes_or_reason || tx.performed_by_name || '—'}
                              </td>
                              <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                                <strong>{new Date(tx.created_at).toLocaleDateString()}</strong>{' '}
                                {new Date(tx.created_at).toLocaleTimeString()}
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
              <button className="btn btn-ghost" onClick={() => { setLedgerModal(null); setLedgerData(null); }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
