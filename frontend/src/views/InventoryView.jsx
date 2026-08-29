import { useState, useEffect, useCallback } from 'react';
import { getInventoryQueue, inventoryHandoff, getReturnsQueue, verifyReturn } from '../api.js';
import PhotoCapture from '../components/PhotoCapture.jsx';
import { toast } from '../App.jsx';
import { STATUS_LABEL } from '../constants/statusLabels.js';

const HANDOFF_STATUSES = ['assigned', 'notified_inventory'];

export default function InventoryView({ token }) {
  const [activeTab, setActiveTab]   = useState('handoff'); // 'handoff' | 'returns'
  const [orders, setOrders]         = useState([]);
  const [returnsList, setReturns]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSub]        = useState({});
  const [noteModal, setNoteModal]   = useState(null); // { id, handed }
  const [note, setNote]             = useState('');
  const [handoffAtt, setHandoffAtt] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [ord, ret] = await Promise.all([
        getInventoryQueue(token),
        getReturnsQueue(null, token)
      ]);
      setOrders(ord);
      setReturns(ret.returns || []);
    } catch (err) {
      toast.error('Failed to load inventory data: ' + err.message);
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

  const handleVerifyReturn = async (returnId, targetStatus) => {
    setSub(s => ({ ...s, [`ret_${returnId}`]: true }));
    try {
      await verifyReturn(returnId, { status: targetStatus, notes: `Inventory verified as ${targetStatus}` }, token);
      toast.success(`Return record ${targetStatus}!`);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSub(s => { const n = { ...s }; delete n[`ret_${returnId}`]; return n; });
    }
  };

  const pending        = orders.filter(o => HANDOFF_STATUSES.includes(o.status));
  const pendingReturns = returnsList.filter(r => r.status === 'pending_verification' || r.status === 'pending_pickup');

  if (loading) return <div className="loading-screen"><div className="spinner" /><p>Loading warehouse dashboard…</p></div>;

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">Warehouse Management</h1>
          <p className="section-sub">Confirm package handoffs and verify returned inventory</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn ${activeTab === 'handoff' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('handoff')}
          >
            🚚 Driver Handoff ({pending.length})
          </button>
          <button
            className={`btn ${activeTab === 'returns' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('returns')}
          >
            ↩️ Returns Queue ({pendingReturns.length})
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Awaiting Handoff</div>
          <div className="stat-value" style={{ color: 'var(--clr-warning)' }}>{pending.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Return Verification</div>
          <div className="stat-value" style={{ color: 'var(--clr-danger)' }}>{pendingReturns.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Returns Records</div>
          <div className="stat-value">{returnsList.length}</div>
        </div>
      </div>

      {/* TAB 1: HANDOFF QUEUE */}
      {activeTab === 'handoff' && (
        <>
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
                    <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 4 }}>📍 {o.client_address}</div>
                    <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 10 }}>
                      🚚 Driver: <strong>{o.delivery_guy_name || 'Unassigned'}</strong>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--clr-success)', marginBottom: 14 }}>
                      EGP {parseFloat(o.order_amount).toFixed(2)}
                    </div>
                    <div className="row-actions">
                      <button
                        className="btn btn-success btn-sm"
                        disabled={submitting[o.id]}
                        onClick={() => openHandoff(o.id, true)}
                      >
                        ✅ Hand Over
                      </button>
                      <button
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

          <div className="card">
            <div className="card-header">
              <span className="card-title">📋 All Orders</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Tracking</th><th>Address</th><th>Driver</th><th>Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 700, color: 'var(--clr-accent)' }}>{o.tracking_number}</td>
                      <td style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>{o.client_address}</td>
                      <td>{o.delivery_guy_name || <span style={{ color: 'var(--clr-text-dim)' }}>—</span>}</td>
                      <td className="amount">EGP {parseFloat(o.order_amount).toFixed(2)}</td>
                      <td><span className={`badge badge-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TAB 2: RETURNS QUEUE */}
      {activeTab === 'returns' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">↩️ Warehouse Returns Verification Queue</span>
          </div>
          {returnsList.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📦</div><p>No return records found.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tracking #</th>
                    <th>Address</th>
                    <th>Type</th>
                    <th>Returned Portion</th>
                    <th>Reason</th>
                    <th>Initiated By</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {returnsList.map(ret => (
                    <tr key={ret.id}>
                      <td style={{ fontWeight: 700, color: 'var(--clr-accent)' }}>{ret.tracking_number}</td>
                      <td style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>📍 {ret.client_address}</td>
                      <td>
                        <span className={`badge ${ret.return_type === 'full' ? 'badge-delivery_failed' : 'badge-warning'}`}>
                          {ret.return_type === 'full' ? '🔴 Full Return' : '🟡 Partial Return'}
                        </span>
                      </td>
                      <td className="amount" style={{ color: 'var(--clr-danger)' }}>
                        EGP {parseFloat(ret.returned_items_amount || 0).toFixed(2)}
                        {ret.returned_quantity > 0 && <span style={{ fontSize: 11, display: 'block', color: 'var(--clr-text-muted)' }}>({ret.returned_quantity} items)</span>}
                      </td>
                      <td>{ret.reason}</td>
                      <td>{ret.initiated_by_name} ({ret.initiated_by_role})</td>
                      <td>
                        <span className={`badge badge-${ret.status === 'verified' ? 'delivered' : (ret.status === 'rejected' ? 'delivery_failed' : 'warning')}`}>
                          {ret.status}
                        </span>
                      </td>
                      <td>
                        {ret.status === 'pending_verification' || ret.status === 'pending_pickup' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn btn-success btn-sm"
                              disabled={submitting[`ret_${ret.id}`]}
                              onClick={() => handleVerifyReturn(ret.id, 'verified')}
                            >
                              ✅ Verify
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={submitting[`ret_${ret.id}`]}
                              onClick={() => handleVerifyReturn(ret.id, 'rejected')}
                            >
                              ❌ Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>Verified by {ret.verified_by_name || 'System'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {/* Handoff Confirmation Modal */}
      {noteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">
              {noteModal.handed ? '✅ Confirm Handoff' : '❌ Confirm Pickup Failure'}
            </h2>
            <form onSubmit={confirmHandoff}>
              {noteModal.handed && (
                <PhotoCapture
                  orderId={noteModal.id}
                  stage="inventory_handoff"
                  required={true}
                  token={token}
                  onAttachmentUploaded={(att) => setHandoffAtt(att)}
                  label="📷 Package Handoff Photo"
                />
              )}
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
                <button
                  type="submit"
                  className={`btn ${noteModal.handed ? 'btn-success' : 'btn-danger'}`}
                  disabled={noteModal.handed && !handoffAtt}
                >
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
