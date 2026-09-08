import { useState, useEffect, useCallback } from 'react';
import { getInventoryQueue, inventoryHandoff, getReturnsQueue, verifyReturn, receiveItems, castVote } from '../api.js';
import PhotoCapture from '../components/PhotoCapture.jsx';
import { toast } from '../App.jsx';
import { STATUS_LABEL } from '../constants/statusLabels.js';

const HANDOFF_STATUSES = ['assigned', 'notified_inventory'];

// Return status display config
const RETURN_STATUS = {
  pending_pickup:       { label: '🚗 With Driver',        color: '#f59e0b' },
  in_transit_back:      { label: '🚗 Heading Back',       color: '#f59e0b' },
  pending_verification: { label: '📦 At Warehouse',       color: '#3b82f6' },
  awaiting_second_vote: { label: '🗳️ Awaiting 2nd Vote',  color: '#8b5cf6' },
  vote_conflict:        { label: '⚠️ Votes Conflict',     color: '#ef4444' },
  cancelled:            { label: '❌ Cancelled',           color: '#6b7280' },
  reassigned:           { label: '✅ Reassigned',          color: '#10b981' },
  verified:             { label: '✅ Verified',            color: '#10b981' },
};

// VotePanel — shown for inventory when return is at warehouse
function VotePanel({ ret, myRole, onVote, submitting }) {
  const [showDriverPick, setShowDriverPick] = useState(false);
  const [driverId, setDriverId] = useState(ret.reassign_driver_id || '');

  const myVote     = myRole === 'inventory' ? ret.inventory_vote : ret.supervisor_vote;
  const theirVote  = myRole === 'inventory' ? ret.supervisor_vote : ret.inventory_vote;
  const otherLabel = myRole === 'inventory' ? 'Supervisor' : 'Inventory';
  const canVote    = ['pending_verification','awaiting_second_vote','vote_conflict'].includes(ret.status);

  if (!canVote) return null;

  return (
    <div style={{ background: 'var(--clr-surface)', borderRadius: 10, padding: 14, marginTop: 10 }}>
      {/* Vote status row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, background: myVote === 'kill' ? '#fee2e2' : myVote === 'reassign' ? '#d1fae5' : '#f3f4f6',
          color: myVote === 'kill' ? '#dc2626' : myVote === 'reassign' ? '#059669' : '#6b7280',
          borderRadius: 6, padding: '3px 10px', fontWeight: 700 }}>
          You: {myVote ? (myVote === 'kill' ? '🔴 Kill' : '🟢 Reassign') : '⏳ Not voted'}
        </span>
        <span style={{ fontSize: 12, background: theirVote === 'kill' ? '#fee2e2' : theirVote === 'reassign' ? '#d1fae5' : '#f3f4f6',
          color: theirVote === 'kill' ? '#dc2626' : theirVote === 'reassign' ? '#059669' : '#6b7280',
          borderRadius: 6, padding: '3px 10px', fontWeight: 700 }}>
          {otherLabel}: {theirVote ? (theirVote === 'kill' ? '🔴 Kill' : '🟢 Reassign') : '⏳ Not voted'}
        </span>
      </div>

      {ret.status === 'vote_conflict' && (
        <div style={{ background: '#fef2f2', borderRadius: 6, padding: '6px 10px', marginBottom: 10,
          fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
          ⚠️ You and {otherLabel} disagree. Change your vote to match theirs or ask them to change.
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 10 }}>
        <strong>Items returned:</strong> EGP {parseFloat(ret.returned_items_amount || 0).toFixed(2)}
        {ret.returned_quantity > 0 && ` · ${ret.returned_quantity} items`}
        <br /><strong>Reason:</strong> {ret.reason}
      </p>

      {!showDriverPick ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-danger btn-sm"
            disabled={submitting}
            onClick={() => onVote(ret.id, 'kill', null)}
          >
            🔴 Kill Order
          </button>
          <button
            className="btn btn-success btn-sm"
            disabled={submitting}
            onClick={() => setShowDriverPick(true)}
          >
            🟢 Reassign
          </button>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 12, marginBottom: 6, color: 'var(--clr-text-muted)' }}>
            Enter driver ID to reassign to (leave blank = same driver):
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              type="number"
              placeholder="Driver ID (optional)"
              value={driverId}
              onChange={e => setDriverId(e.target.value)}
              style={{ maxWidth: 160 }}
            />
            <button
              className="btn btn-success btn-sm"
              disabled={submitting}
              onClick={() => onVote(ret.id, 'reassign', driverId || ret.reassign_driver_id)}
            >
              Confirm Reassign
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowDriverPick(false)}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InventoryView({ token }) {
  const [activeTab, setActiveTab]   = useState('handoff');
  const [orders, setOrders]         = useState([]);
  const [returnsList, setReturns]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSub]        = useState({});
  const [noteModal, setNoteModal]   = useState(null);
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
    const handleVisibility = () => { if (!document.hidden) fetchData(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [fetchData]);

  const openHandoff = (id, handed) => { setNoteModal({ id, handed }); setNote(''); setHandoffAtt(null); };

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

  const handleReceive = async (returnId) => {
    setSub(s => ({ ...s, [`rcv_${returnId}`]: true }));
    try {
      await receiveItems(returnId, token);
      toast.success('Items received at warehouse. Both parties notified to vote.');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSub(s => { const n = { ...s }; delete n[`rcv_${returnId}`]; return n; });
    }
  };

  const handleVote = async (returnId, vote, driverId) => {
    if (vote === 'kill' && !window.confirm('Are you sure you want to cancel the remaining items? This cannot be undone once the other party agrees.')) return;
    setSub(s => ({ ...s, [`vote_${returnId}`]: true }));
    try {
      const result = await castVote(returnId, { vote, driver_id: driverId ? parseInt(driverId) : undefined }, token);
      if (result.action) {
        toast.success(`✅ Both parties agreed: ${result.action === 'kill' ? 'Items cancelled.' : 'Follow-up order created!'}`);
      } else if (result.conflict) {
        toast.error('⚠️ Vote conflict! The other party voted differently. They have been notified.');
      } else {
        toast.success(`Vote recorded (${vote}). Waiting for ${result.waiting_for}'s vote.`);
      }
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSub(s => { const n = { ...s }; delete n[`vote_${returnId}`]; return n; });
    }
  };

  const pending        = orders.filter(o => HANDOFF_STATUSES.includes(o.status));
  const activeReturns  = returnsList.filter(r => !['cancelled','reassigned','verified','rejected'].includes(r.status));
  const needsAttention = returnsList.filter(r => ['pending_verification','awaiting_second_vote','vote_conflict'].includes(r.status));

  if (loading) return (
    <div style={{ padding: '28px 24px' }}>
      <div className="section-header">
        <div className="skeleton-title" style={{ width: '45%' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          {[1,2].map(i => <div key={i} className="skeleton-line" style={{ width: 100, height: 32, borderRadius: 'var(--r-md)' }} />)}
        </div>
      </div>
      <div className="card-grid">
        {[1,2,3].map(i => (
          <div key={i} className="skeleton-card">
            <div className="skeleton-header">
              <div className="skeleton-title" style={{ width: '50%' }} />
              <div className="skeleton-line" style={{ width: 60, height: 20, borderRadius: 999 }} />
            </div>
            <div className="skeleton-line" />
            <div className="skeleton-line" style={{ width: '70%' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <div className="skeleton-line" style={{ width: 80, height: 32, borderRadius: 'var(--r-md)' }} />
              <div className="skeleton-line" style={{ width: 80, height: 32, borderRadius: 'var(--r-md)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">Warehouse Management</h1>
          <p className="section-sub">Confirm package handoffs and manage returned inventory</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${activeTab === 'handoff' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('handoff')}>
            🚚 Driver Handoff ({pending.length})
          </button>
          <button className={`btn ${activeTab === 'returns' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('returns')}>
            ↩️ Returns {needsAttention.length > 0 && <span style={{ background: '#ef4444', color: 'white', borderRadius: 999, padding: '1px 7px', fontSize: 11, marginLeft: 4 }}>{needsAttention.length}</span>}
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Awaiting Handoff</div>
          <div className="stat-value" style={{ color: 'var(--clr-warning)' }}>{pending.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Returns</div>
          <div className="stat-value" style={{ color: needsAttention.length > 0 ? '#ef4444' : 'var(--clr-text)' }}>{activeReturns.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Needs Your Vote</div>
          <div className="stat-value" style={{ color: needsAttention.length > 0 ? '#ef4444' : 'var(--clr-success)' }}>{needsAttention.length}</div>
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
                      <button className="btn btn-success btn-sm" disabled={submitting[o.id]} onClick={() => openHandoff(o.id, true)}>
                        ✅ Hand Over
                      </button>
                      <button className="btn btn-danger btn-sm" disabled={submitting[o.id]} onClick={() => openHandoff(o.id, false)}>
                        ❌ Pickup Failed
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">📋 All Orders</span></div>
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
        <div>
          {returnsList.length === 0 ? (
            <div className="card">
              <div className="empty-state"><div className="empty-icon">📦</div><p>No return records found.</p></div>
            </div>
          ) : (
            <div className="card-grid">
              {returnsList.map(ret => {
                const statusCfg = RETURN_STATUS[ret.status] || { label: ret.status, color: '#6b7280' };
                const needsReceive = ret.status === 'in_transit_back';
                const needsVote    = ['pending_verification','awaiting_second_vote','vote_conflict'].includes(ret.status);
                const isConflict   = ret.status === 'vote_conflict';

                return (
                  <div key={ret.id} className="card" style={{
                    borderLeft: `3px solid ${statusCfg.color}`,
                    background: isConflict ? 'var(--clr-danger-soft, #fef2f2)' : undefined
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, color: 'var(--clr-accent)', fontSize: 13 }}>
                        #{ret.tracking_number}
                        <span style={{ marginLeft: 6, fontSize: 11, color: '#6b7280', fontWeight: 400 }}>
                          {ret.return_type === 'full' ? '· Full Return' : '· Partial Return'}
                        </span>
                      </span>
                      <span style={{ fontSize: 11, background: statusCfg.color + '22', color: statusCfg.color,
                        borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>
                        {statusCfg.label}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 4 }}>📍 {ret.client_address}</div>
                    <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 4 }}>
                      🚚 Driver: <strong>{ret.driver_name || '—'}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 10 }}>
                      Reason: {ret.reason}
                    </div>

                    {/* "Receive Items" button for in_transit_back */}
                    {needsReceive && (
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ width: '100%' }}
                        disabled={submitting[`rcv_${ret.id}`]}
                        onClick={() => handleReceive(ret.id)}
                      >
                        📦 Mark Items as Received at Warehouse
                      </button>
                    )}

                    {/* Vote panel for pending_verification / awaiting_second_vote / vote_conflict */}
                    {needsVote && (
                      <VotePanel
                        ret={ret}
                        myRole="inventory"
                        onVote={handleVote}
                        submitting={submitting[`vote_${ret.id}`]}
                      />
                    )}

                    {/* Resolved state */}
                    {['cancelled','reassigned','verified','rejected'].includes(ret.status) && (
                      <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', fontStyle: 'italic' }}>
                        {ret.status === 'reassigned' ? `✅ Follow-up order created` : `Closed: ${ret.status}`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
                  placeholder={noteModal.handed ? 'e.g. Package verified, good condition' : 'e.g. Driver did not arrive on time'}
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
