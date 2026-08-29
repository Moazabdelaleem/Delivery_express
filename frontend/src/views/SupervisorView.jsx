import { useState, useEffect, useCallback } from 'react';
import { getAllOrders, createOrder, getUsersByRole, createReturn, getShiftSummary } from '../api.js';
import PhotoCapture from '../components/PhotoCapture.jsx';
import { toast } from '../App.jsx';
import { STATUS_LABEL } from '../constants/statusLabels.js';

export default function SupervisorView({ token, user }) {
  const [orders, setOrders]                 = useState([]);
  const [drivers, setDrivers]               = useState([]);
  const [shiftSummaries, setShiftSummaries] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [showModal, setShowModal]           = useState(false);
  const [submitting, setSub]                = useState(false);
  const [filter, setFilter]                 = useState('all');
  const [detailsModal, setDetailsModal]     = useState(false);
  const [detailsType, setDetailsType]       = useState('');

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

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 20000);
    return () => clearInterval(iv);
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

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const counts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  if (loading) return <div className="loading-screen"><div className="spinner" /><p>Loading orders…</p></div>;

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
        <div className="stat-card" onClick={() => handleOpenDetails('all_orders')} style={{ cursor: 'pointer' }} title="Click for details">
          <div className="stat-label">📋 Total Orders</div>
          <div className="stat-value">{orders.length}</div>
        </div>
        <div className="stat-card" onClick={() => handleOpenDetails('in_transit')} style={{ cursor: 'pointer' }} title="Click for details">
          <div className="stat-label">🚚 In Transit</div>
          <div className="stat-value" style={{ color: 'var(--clr-purple)' }}>{counts.in_transit || 0}</div>
        </div>
        <div className="stat-card" onClick={() => handleOpenDetails('delivered')} style={{ cursor: 'pointer' }} title="Click for details">
          <div className="stat-label">✅ Delivered</div>
          <div className="stat-value" style={{ color: 'var(--clr-success)' }}>{counts.delivered || 0}</div>
        </div>
        <div className="stat-card" onClick={() => handleOpenDetails('cash_cleared')} style={{ cursor: 'pointer' }} title="Click for details">
          <div className="stat-label">💵 Cash Cleared</div>
          <div className="stat-value" style={{ color: 'var(--clr-accent)' }}>{counts.cash_cleared || 0}</div>
        </div>
        <div className="stat-card" onClick={() => handleOpenDetails('failed_returned')} style={{ cursor: 'pointer' }} title="Click for details">
          <div className="stat-label">⚠️ Failed/Returned</div>
          <div className="stat-value" style={{ color: 'var(--clr-danger)' }}>
            {(counts.delivery_failed || 0) + (counts.returned_to_company || 0)}
          </div>
        </div>
        <div className="stat-card" onClick={() => handleOpenDetails('drivers')} style={{ cursor: 'pointer' }} title="Click for details">
          <div className="stat-label">👥 Drivers Status</div>
          <div className="stat-value" style={{ color: 'var(--clr-text)' }}>
            {drivers.filter(d => d.online_status === 'online').length}/{drivers.length}
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
                    <td><span className={`badge badge-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--clr-text-dim)' }}>{new Date(o.created_at).toLocaleDateString()}</td>
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
            <form id="create-order-form" onSubmit={handleCreate}>
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
                      <th>Phone</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drivers.map(d => (
                      <tr key={d.id}>
                        <td><strong>{d.name}</strong></td>
                        <td>@{d.username}</td>
                        <td>{d.phone || 'N/A'}</td>
                        <td>
                          <span className={`badge ${d.online_status === 'online' ? 'badge-delivered' : 'badge-ghost'}`}>
                            {d.online_status === 'online' ? '🟢 Online' : '⚫ Offline'}
                          </span>
                        </td>
                      </tr>
                    ))}
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
    </div>
  );
}
