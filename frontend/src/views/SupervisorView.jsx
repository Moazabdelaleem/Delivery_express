import { useState, useEffect, useCallback } from 'react';
import { getAllOrders, createOrder, updateOrder, deleteOrder, getUsersByRole, createReturn, getShiftSummary, castVote, cancelReturn, forceTransitReturn } from '../api.js';
import PhotoCapture from '../components/PhotoCapture.jsx';
import { toast } from '../App.jsx';
import { STATUS_LABEL } from '../constants/statusLabels.js';
import { useWindowFocus } from '../useWindowFocus.js';

export default function SupervisorView({ token, user }) {
  const [orders, setOrders]                 = useState([]);
  const [drivers, setDrivers]               = useState([]);
  const [shiftSummaries, setShiftSummaries] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [showModal, setShowModal]           = useState(false);
  const [editModal, setEditModal]           = useState(null); // order being edited
  const [submitting, setSub]                = useState(false);
  const [filter, setFilter]                 = useState('all');
  const [detailsModal, setDetailsModal]     = useState(false);
  const [detailsType, setDetailsType]       = useState('');

  const [deleteModal, setDeleteModal]       = useState(null); // { id, tracking_number }
  const [deleting, setDeleting]             = useState(false);

  const [returnModal, setReturnModal]   = useState(null); // order object
  const [retType, setRetType]           = useState('full');
  const [retReason, setRetReason]       = useState('');
  const [retAmount, setRetAmount]       = useState('');

  const [isThirdParty, setIsThirdParty]   = useState(false);
  const [thirdPartyAtt, setThirdPartyAtt] = useState(null);

  const [form, setForm] = useState({
    client_address: '',
    order_details: '', order_amount: '', delivery_guy_id: '', payment_type: 'pay_after_delivery'
  });

  const [editForm, setEditForm] = useState({
    tracking_number: '', client_address: '', order_details: '', order_amount: '', delivery_guy_id: '', payment_type: 'pay_after_delivery'
  });

  const fetchData = useCallback(async () => {
    try {
      const [ord, drv, shSummary] = await Promise.all([
        getAllOrders(token),
        getUsersByRole('delivery_guy', token),
        getShiftSummary(null, token).catch(() => ({ summaries: [] }))
      ]);
      setOrders(ord);
      setDrivers(drv);
      setShiftSummaries(shSummary.summaries || []);
    } catch (err) {
      toast.error('Failed to load: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useWindowFocus(fetchData);

  const handleCancelReturn = async (returnId) => {
    if (!window.confirm('Cancel return and send order back out on delivery route?')) return;
    try {
      await cancelReturn(returnId, token);
      toast.success('Return cancelled — order restored to active delivery state.');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleForceTransit = async (returnId) => {
    try {
      await forceTransitReturn(returnId, token);
      toast.success('Return manually marked as heading back to warehouse.');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 20000);
    // C1: Pause polling when tab is hidden to save bandwidth
    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(iv);
      } else {
        fetchData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchData]);

  const handleOpenDetails = (type) => {
    setDetailsType(type);
    setDetailsModal(true);
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    setSub(true);
    try {
      const payload = { ...form };
      if (!payload.delivery_guy_id) delete payload.delivery_guy_id;
      if (isThirdParty) {
        payload.is_third_party = true;
        if (thirdPartyAtt) {
          payload.third_party_receipt_attachment_id = thirdPartyAtt.id;
        }
      }
      await createOrder(payload, token);
      toast.success('Order created and dispatched successfully!');
      setShowModal(false);
      setIsThirdParty(false);
      setThirdPartyAtt(null);
      setForm({ client_address: '', order_details: '', order_amount: '', delivery_guy_id: '', payment_type: 'pay_after_delivery' });
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSub(false);
    }
  };

  const openEditOrderModal = (o) => {
    setEditModal(o);
    setEditForm({
      tracking_number: o.tracking_number || '',
      client_address: o.client_address || '',
      order_details: o.order_details || '',
      order_amount: o.order_amount ? String(o.order_amount) : '',
      delivery_guy_id: o.delivery_guy_id || '',
      payment_type: o.payment_type || 'pay_after_delivery'
    });
  };

  const handleUpdateOrder = async (e) => {
    e.preventDefault();
    if (!editModal) return;
    setSub(true);
    try {
      const payload = {
        tracking_number: editForm.tracking_number.trim(),
        client_address: editForm.client_address.trim(),
        order_details: editForm.order_details,
        order_amount: parseFloat(editForm.order_amount) || 0,
        payment_type: editForm.payment_type,
        delivery_guy_id: editForm.delivery_guy_id || null
      };
      await updateOrder(editModal.id, payload, token);
      toast.success('Order updated successfully!');
      setEditModal(null);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSub(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!deleteModal || deleting) return;
    setDeleting(true);
    // H2: Optimistic removal — remove from list immediately
    setOrders(prev => prev.filter(o => o.id !== deleteModal.id));
    try {
      await deleteOrder(deleteModal.id, token);
      toast.success(`Order #${deleteModal.tracking_number} deleted successfully.`);
      setDeleteModal(null);
      fetchData();
    } catch (err) {
      // Rollback optimistic update on failure
      fetchData();
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleInitiateReturn = async (e) => {
    e.preventDefault();
    try {
      await createReturn({
        order_id: returnModal.id,
        return_type: retType,
        returned_items_amount: retAmount ? parseFloat(retAmount) : undefined,
        reason: retReason.trim()
      }, token);
      toast.success(`Return initiated for order #${returnModal.tracking_number}`);
      setReturnModal(null);
      setRetAmount('');
      setRetReason('');
      fetchData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const liableOrders = orders.filter(o => o.is_liable);
  const filtered = filter === 'liable'
    ? liableOrders
    : filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const counts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  if (loading) return (
    <div style={{ padding: '28px 24px' }}>
      <div className="section-header">
        <div>
          <div className="skeleton-title" style={{ marginBottom: 8 }} />
          <div className="skeleton-line" style={{ width: 220 }} />
        </div>
        <div className="skeleton-line" style={{ width: 100, height: 36, borderRadius: 'var(--r-md)' }} />
      </div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', marginBottom: 24 }}>
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="skeleton-stat-card">
            <div className="skeleton-label" />
            <div className="skeleton-value" />
          </div>
        ))}
      </div>
      <div className="skeleton-table-wrap">
        <div className="skeleton-thead" />
        {[1,2,3,4,5].map(i => <div key={i} className="skeleton-row" />)}
      </div>
    </div>
  );

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">Supervisor Dashboard</h1>
          <p className="section-sub">Create and monitor all delivery orders</p>
        </div>
        <button id="new-order-btn" className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Order
        </button>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <div className="stat-card stat-card-clickable" onClick={() => handleOpenDetails('all_orders')} title="Click for details">
          <div className="stat-label">📋 Total Orders</div>
          <div className="stat-value">{orders.length}</div>
        </div>
        <div className="stat-card stat-card-clickable" onClick={() => handleOpenDetails('in_transit')} title="Click for details">
          <div className="stat-label">🚚 In Transit</div>
          <div className="stat-value" style={{ color: 'var(--clr-purple)' }}>{counts.in_transit || 0}</div>
        </div>
        <div className="stat-card stat-card-clickable" onClick={() => handleOpenDetails('delivered')} title="Click for details">
          <div className="stat-label">✅ Delivered</div>
          <div className="stat-value" style={{ color: 'var(--clr-success)' }}>{counts.delivered || 0}</div>
        </div>
        <div className="stat-card stat-card-clickable" onClick={() => handleOpenDetails('cash_cleared')} title="Click for details">
          <div className="stat-label">💵 Cash Cleared</div>
          <div className="stat-value" style={{ color: 'var(--clr-accent)' }}>{counts.cash_cleared || 0}</div>
        </div>
        <div className="stat-card stat-card-clickable" onClick={() => handleOpenDetails('failed_returned')} title="Click for details">
          <div className="stat-label">⚠️ Failed/Returned</div>
          <div className="stat-value" style={{ color: 'var(--clr-danger)' }}>
            {(counts.delivery_failed || 0) + (counts.returned_to_company || 0)}
          </div>
        </div>
        <div className="stat-card stat-card-clickable" onClick={() => handleOpenDetails('drivers')} title="Click for details">
          <div className="stat-label">👥 Drivers Status</div>
          <div className="stat-value" style={{ color: 'var(--clr-text)' }}>
            {drivers.filter(d => d.online_status === 'online').length}/{drivers.length}
          </div>
        </div>
        <div className="stat-card stat-card-clickable" onClick={() => setFilter('liable')} title="Orders with outstanding cash">
          <div className="stat-label">⚠️ Liable Orders</div>
          <div className="stat-value" style={{ color: liableOrders.length > 0 ? '#f59e0b' : 'var(--clr-success)' }}>
            {liableOrders.length}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', 'assigned', 'in_transit', 'delivered', 'cash_cleared', 'delivery_failed'].map(s => (
          <button
            key={s}
            className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(s)}
          >
            {s === 'all' ? 'All' : STATUS_LABEL[s]}
            {s !== 'all' && counts[s] ? ` (${counts[s]})` : ''}
          </button>
        ))}
        <button
          className={`btn btn-sm ${filter === 'liable' ? 'btn-warning' : 'btn-ghost'}`}
          onClick={() => setFilter('liable')}
          style={filter !== 'liable' && liableOrders.length > 0 ? { borderColor: '#f59e0b', color: '#f59e0b' } : {}}
        >
          ⚠️ Liable {liableOrders.length > 0 ? `(${liableOrders.length})` : ''}
        </button>
      </div>

      {/* Orders Table */}
      <div className="card">
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📋</div><p>No orders in this category.</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Tracking</th><th>Address</th>
                  <th>Amount</th><th>Type</th><th>Driver</th><th>Status</th><th>Created</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 700, color: 'var(--clr-accent)' }}>{o.tracking_number}</td>
                    <td style={{ fontSize: 12, color: 'var(--clr-text-muted)', maxWidth: 180 }}>{o.client_address}</td>
                    <td className="amount">EGP {parseFloat(o.order_amount).toFixed(2)}</td>
                    <td>
                      <span className="badge badge-ghost" style={{ textTransform: 'capitalize' }}>
                        {(o.payment_type || 'pay_after_delivery').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      {o.delivery_guy_name
                        ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {o.delivery_guy_status === 'online' && <span className="pulse" />}
                            <span style={{ fontSize: 13 }}>{o.delivery_guy_name}</span>
                          </div>
                        : <span style={{ color: 'var(--clr-text-dim)' }}>Unassigned</span>
                      }
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className={`badge badge-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span>
                        {o.is_liable && (
                          <span style={{ fontSize: 11, background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>
                            ⚠️ EGP {parseFloat(o.outstanding_amount || 0).toFixed(2)} outstanding
                          </span>
                        )}
                        {o.active_return_status && ['pending_verification','awaiting_second_vote','vote_conflict'].includes(o.active_return_status) && (
                          <span style={{ fontSize: 11, background: o.active_return_status === 'vote_conflict' ? '#fef2f2' : '#f5f3ff', color: o.active_return_status === 'vote_conflict' ? '#dc2626' : '#7c3aed', border: '1px solid ' + (o.active_return_status === 'vote_conflict' ? '#fca5a5' : '#c4b5fd'), borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>
                            {o.active_return_status === 'vote_conflict' ? '⚠️ Vote Conflict' : '🗳️ Vote Needed'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--clr-text-dim)' }}>{new Date(o.created_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => openEditOrderModal(o)}>✏️ Edit</button>
                        <button className="btn btn-sm btn-danger" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setDeleteModal(o)}>🗑️</button>
                        {o.active_return_id && (
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ padding: '2px 6px', fontSize: 11, color: 'var(--clr-warning)' }}
                            title="Customer turnaround — cancel return and send back out"
                            onClick={() => handleCancelReturn(o.active_return_id)}
                          >
                            ↩️ Turnaround
                          </button>
                        )}
                        {o.active_return_id && o.active_return_status === 'pending_pickup' && (
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ padding: '2px 6px', fontSize: 11 }}
                            title="Force mark as heading back to warehouse"
                            onClick={() => handleForceTransit(o.active_return_id)}
                          >
                            ⚡ Force Transit
                          </button>
                        )}
                        {o.active_return_id && ['pending_verification','awaiting_second_vote','vote_conflict'].includes(o.active_return_status) && (
                          <>
                            <button className="btn btn-sm btn-danger" style={{ padding: '2px 8px', fontSize: 11 }}
                              onClick={async () => {
                                if (!window.confirm('Kill remaining items for this order? This will cancel them once Inventory agrees.')) return;
                                try {
                                  const res = await castVote(o.active_return_id, { vote: 'kill' }, token);
                                  if (res.action) toast.success('Both parties agreed — items cancelled.');
                                  else if (res.conflict) toast.error('Vote conflict — Inventory voted differently.');
                                  else toast.success(`Vote cast. Waiting for ${res.waiting_for}.`);
                                  fetchData();
                                } catch (err) { toast.error(err.message); }
                              }}>🔴 Kill</button>
                            <button className="btn btn-sm btn-success" style={{ padding: '2px 8px', fontSize: 11 }}
                              onClick={async () => {
                                const dId = window.prompt('Driver ID to reassign to (blank = same driver):');
                                if (dId === null) return;
                                try {
                                  const res = await castVote(o.active_return_id, { vote: 'reassign', driver_id: dId ? parseInt(dId) : undefined }, token);
                                  if (res.action) toast.success('Both agreed — follow-up order created!');
                                  else if (res.conflict) toast.error('Vote conflict — Inventory voted differently.');
                                  else toast.success(`Vote cast. Waiting for ${res.waiting_for}.`);
                                  fetchData();
                                } catch (err) { toast.error(err.message); }
                              }}>🟢 Reassign</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Order Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2 className="modal-title">📦 New Delivery Order</h2>
            <form id="create-order-form" onSubmit={handleCreateOrder}>
              <div className="form-group">
                <label className="form-label">Delivery Address <span style={{ color: 'var(--clr-danger)' }}>*</span></label>
                <input id="order-address" className="form-input" placeholder="Building, Street, Area" value={form.client_address} onChange={e => setForm(f => ({ ...f, client_address: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Order Details</label>
                <input id="order-details" className="form-input" placeholder="e.g. 1x Laptop, 2x Headphones" value={form.order_details} onChange={e => setForm(f => ({ ...f, order_details: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Amount (EGP)</label>
                <input id="order-amount" className="form-input" type="number" min="0" step="0.01" placeholder="0.00" value={form.order_amount} onChange={e => setForm(f => ({ ...f, order_amount: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 'bold', color: 'var(--clr-primary)' }}>💳 Payment Type *</label>
                <select id="order-payment-type" className="form-select" style={{ fontWeight: 'bold' }} value={form.payment_type} onChange={e => setForm(f => ({ ...f, payment_type: e.target.value }))}>
                  <option value="pay_after_delivery">Pay After Delivery (كاش بعد التسليم)</option>
                  <option value="full_upfront">Full Upfront (دفع مقدم كامل)</option>
                  <option value="accounts_payable">Accounts Payable (آجل / حسابات)</option>
                  <option value="installments">Installments (تقسيط / أقساط)</option>
                  <option value="other">Other / Transfer (آخر / تحويل)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Assign Driver <span style={{ color: 'var(--clr-danger)' }}>*</span></label>
                <select id="order-driver" className="form-select" value={form.delivery_guy_id} onChange={e => setForm(f => ({ ...f, delivery_guy_id: e.target.value }))}>
                  <option value="">— Select driver —</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.online_status === 'online' ? '🟢' : '⚫'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button id="order-submit" type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : 'Create Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Order Modal */}
      {editModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2 className="modal-title">✏️ Edit Order #{editModal.tracking_number}</h2>
            <form id="edit-order-form" onSubmit={handleUpdateOrder}>
              <div className="form-group">
                <label className="form-label">Tracking Number / Code <span style={{ color: 'var(--clr-danger)' }}>*</span></label>
                <input className="form-input" value={editForm.tracking_number} onChange={e => setEditForm(f => ({ ...f, tracking_number: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Delivery Address <span style={{ color: 'var(--clr-danger)' }}>*</span></label>
                <input className="form-input" placeholder="Building, Street, Area" value={editForm.client_address} onChange={e => setEditForm(f => ({ ...f, client_address: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Order Details</label>
                <input className="form-input" placeholder="e.g. 1x Laptop, 2x Headphones" value={editForm.order_details} onChange={e => setEditForm(f => ({ ...f, order_details: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Amount (EGP)</label>
                <input className="form-input" type="number" min="0" step="0.01" placeholder="0.00" value={editForm.order_amount} onChange={e => setEditForm(f => ({ ...f, order_amount: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 'bold', color: 'var(--clr-primary)' }}>💳 Payment Type *</label>
                <select className="form-select" style={{ fontWeight: 'bold' }} value={editForm.payment_type} onChange={e => setEditForm(f => ({ ...f, payment_type: e.target.value }))}>
                  <option value="pay_after_delivery">Pay After Delivery (كاش بعد التسليم)</option>
                  <option value="full_upfront">Full Upfront (دفع مقدم كامل)</option>
                  <option value="accounts_payable">Accounts Payable (آجل / حسابات)</option>
                  <option value="installments">Installments (تقسيط / أقساط)</option>
                  <option value="other">Other / Transfer (آخر / تحويل)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Assign Driver</label>
                <select className="form-select" value={editForm.delivery_guy_id} onChange={e => setEditForm(f => ({ ...f, delivery_guy_id: e.target.value }))}>
                  <option value="">— Select driver —</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.online_status === 'online' ? '🟢' : '⚫'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* KPI Details Modal */}
      {detailsModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 800, width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 className="modal-title" style={{ marginBottom: 0 }}>
                {detailsType === 'all_orders' && '📋 Total Orders List'}
                {detailsType === 'in_transit' && '🚚 Orders In Transit'}
                {detailsType === 'delivered' && '✅ Delivered Orders'}
                {detailsType === 'cash_cleared' && '💵 Cash Cleared Orders'}
                {detailsType === 'failed_returned' && '⚠️ Failed & Returned Orders'}
                {detailsType === 'drivers' && '👥 Drivers Status Roster'}
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setDetailsModal(false)}>✕</button>
            </div>

            <div style={{ maxHeight: 400, overflowY: 'auto' }} className="table-wrap">
              {detailsType === 'drivers' ? (
                <table>
                  <thead>
                    <tr>
                      <th>Driver Name</th>
                      <th>Username</th>
                      <th>Status</th>
                      <th>⏱️ Worked Today (Daily)</th>
                      <th>📅 Worked This Month (Accumulated)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drivers.map(d => {
                      const sh = shiftSummaries.find(s => String(s.driver_id) === String(d.id));
                      return (
                        <tr key={d.id}>
                          <td><strong>{d.name}</strong></td>
                          <td>@{d.username}</td>
                          <td>
                            <span className={`badge ${d.online_status === 'online' ? 'badge-delivered' : 'badge-ghost'}`}>
                              {d.online_status === 'online' ? '🟢 Online' : '⚫ Offline'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--clr-accent)' }}>
                            ⏱️ {sh ? (sh.daily_hours || sh.total_hours_today || '0.00') : '0.00'} hrs
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--clr-purple)' }}>
                            📅 {sh ? (sh.monthly_hours || sh.total_hours_month || '0.00') : '0.00'} hrs
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Tracking #</th>
                      <th>Client</th>
                      <th>Amount</th>
                      <th>Driver</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders
                      .filter(o => {
                        if (detailsType === 'in_transit') return o.status === 'in_transit';
                        if (detailsType === 'delivered') return o.status === 'delivered';
                        if (detailsType === 'cash_cleared') return o.status === 'cash_cleared';
                        if (detailsType === 'failed_returned') return o.status === 'delivery_failed' || o.status === 'returned_to_company';
                        return true; // all_orders
                      })
                      .map(o => (
                        <tr key={o.id}>
                          <td style={{ fontWeight: 600, color: 'var(--clr-accent)' }}>#{o.tracking_number}</td>
                          <td style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>{o.client_address}</td>
                          <td>EGP {parseFloat(o.order_amount || 0).toFixed(2)}</td>
                          <td>{o.delivery_guy_name || <span style={{ color: 'var(--clr-warning)' }}>Unassigned</span>}</td>
                          <td>
                            <span className={`badge badge-${o.status}`}>
                              {STATUS_LABEL[o.status] || o.status}
                            </span>
                          </td>
                          <td>
                            <button className="btn btn-sm btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }} onClick={() => openEditOrderModal(o)}>✏️ Edit</button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setDetailsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <h2 className="modal-title" style={{ color: 'var(--clr-danger)' }}>🗑️ Confirm Delete</h2>
            <p style={{ margin: '16px 0', fontSize: 14 }}>
              Are you sure you want to delete order <strong>#{deleteModal.tracking_number}</strong>?
            </p>
            <p style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginBottom: 20 }}>
              This action will permanently delete status history, expense records, and pending payments associated with this order.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDeleteModal(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteOrder} disabled={deleting}>
                {deleting ? <span className="spinner" /> : 'Delete Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
