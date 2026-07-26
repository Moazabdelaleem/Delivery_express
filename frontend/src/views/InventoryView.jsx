import { useState, useEffect, useCallback } from 'react';
import { getInventoryQueue, inventoryHandoff } from '../api.js';
import { toast } from '../App.jsx';

const STATUS_LABEL = {
  created: 'Created', assigned: 'Assigned', notified_inventory: 'Notified',
  handed_to_delivery: 'Handed Over', pickup_failed: 'Pickup Failed',
  in_transit: 'In Transit', delivered: 'Delivered', delivery_failed: 'Failed',
  returned_to_company: 'Returned', cash_cleared: 'Cash Cleared',
};

const HANDOFF_STATUSES = ['assigned', 'notified_inventory'];

export default function InventoryView({ token }) {
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSub]    = useState({});
  const [noteModal, setNoteModal] = useState(null); // { id, handed }
  const [note, setNote]         = useState('');

  const fetchData = useCallback(async () => {
    try {
      const ord = await getInventoryQueue(token);
      setOrders(ord);
    } catch (err) {
      toast.error('Failed to load queue: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 20000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const openHandoff = (id, handed) => {
    setNoteModal({ id, handed });
    setNote('');
  };

  const confirmHandoff = async (e) => {
    e.preventDefault();
    const { id, handed } = noteModal;
    setSub(s => ({ ...s, [id]: true }));
    try {
      await inventoryHandoff(id, { handed_over: handed, note: note.trim() || undefined }, token);
      toast.success(handed ? 'Order handed to delivery driver.' : 'Pickup marked as failed.');
      setNoteModal(null);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSub(s => { const n = { ...s }; delete n[id]; return n; });
    }
  };

  const pending  = orders.filter(o => HANDOFF_STATUSES.includes(o.status));
  const otherOrd = orders.filter(o => !HANDOFF_STATUSES.includes(o.status));

  if (loading) return <div className="loading-screen"><div className="spinner" /><p>Loading handoff queue…</p></div>;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="section-title">Warehouse Queue</h1>
        <p className="section-sub">Confirm physical handoff of packages to delivery drivers</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Awaiting Handoff</div>
          <div className="stat-value" style={{ color: 'var(--clr-warning)' }}>{pending.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">All Orders Visible</div>
          <div className="stat-value">{orders.length}</div>
        </div>
      </div>

      {/* Pending Handoff */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">
            ⏳ Pending Handoff
            <span style={{ background: 'var(--clr-warning)', color: 'white', borderRadius: 999, padding: '1px 8px', fontSize: 11 }}>{pending.length}</span>
          </span>
        </div>
        {pending.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">✅</div><p>Queue is clear — no packages pending handoff.</p></div>
        ) : (
          <div className="card-grid">
            {pending.map(o => (
              <div key={o.id} className="card" style={{ borderLeft: '3px solid var(--clr-warning)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: 'var(--clr-accent)', fontSize: 13 }}>{o.tracking_number}</span>
                  <span className={`badge badge-${o.status}`}>{STATUS_LABEL[o.status]}</span>
                </div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{o.client_name}</div>
                <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 4 }}>📍 {o.client_address}</div>
                <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 10 }}>
                  🚚 Driver: <strong>{o.delivery_guy_name || 'Unassigned'}</strong>
                  {o.delivery_guy_status === 'online' && <span className="pulse" style={{ marginLeft: 6 }} />}
                </div>
                <div style={{ fontWeight: 700, color: 'var(--clr-success)', marginBottom: 14 }}>
                  EGP {parseFloat(o.order_amount).toFixed(2)}
                </div>
                <div className="row-actions">
                  <button
                    id={`handoff-yes-${o.id}`}
                    className="btn btn-success btn-sm"
                    disabled={submitting[o.id]}
                    onClick={() => openHandoff(o.id, true)}
                  >
                    ✅ Hand Over
                  </button>
                  <button
                    id={`handoff-no-${o.id}`}
                    className="btn btn-danger btn-sm"
                    disabled={submitting[o.id]}
                    onClick={() => openHandoff(o.id, false)}
                  >
                    ❌ Pickup Failed
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All Orders */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📋 All Orders</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Tracking</th><th>Client</th><th>Driver</th><th>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 700, color: 'var(--clr-accent)' }}>{o.tracking_number}</td>
                  <td>{o.client_name}</td>
                  <td>{o.delivery_guy_name || <span style={{ color: 'var(--clr-text-dim)' }}>—</span>}</td>
                  <td className="amount">EGP {parseFloat(o.order_amount).toFixed(2)}</td>
                  <td><span className={`badge badge-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Handoff Confirmation Modal */}
      {noteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">
              {noteModal.handed ? '✅ Confirm Handoff' : '❌ Confirm Pickup Failure'}
            </h2>
            <form onSubmit={confirmHandoff}>
              <div className="form-group">
                <label className="form-label">Note <span style={{ color: 'var(--clr-text-dim)' }}>(optional)</span></label>
                <textarea
                  className="form-textarea"
                  placeholder={noteModal.handed
                    ? 'e.g. Package verified, good condition'
                    : 'e.g. Driver did not arrive on time'}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setNoteModal(null)}>Cancel</button>
                <button type="submit" className={`btn ${noteModal.handed ? 'btn-success' : 'btn-danger'}`}>
                  {noteModal.handed ? 'Confirm Handoff' : 'Confirm Failure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
