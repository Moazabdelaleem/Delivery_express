import { useState, useEffect, useCallback } from 'react';
import { getMyDeliveries, updateDeliveryStatus, getWalletSummary, logExpense, updateOnlineStatus, getDriverLedger, recordPayment, getDriverReturnPickups, clockIn, clockOut } from '../api.js';
import { DELIVERY_OUTCOMES, DELIVERY_OUTCOMES_STEP1, DELIVERY_OUTCOMES_STEP2, PAYMENT_METHODS_STEP3, COLLECTION_FILTER_MAP, getValidCollectionOutcomes, getOutcomeByKey } from '../deliveryOutcomes.js';
import PhotoCapture from '../components/PhotoCapture.jsx';
import VoiceFeedbackRecorder from '../components/VoiceFeedbackRecorder.jsx';
import { toast } from '../App.jsx';
import { STATUS_LABEL } from '../constants/statusLabels.js';

const TERMINAL = ['pickup_failed', 'delivery_failed', 'returned_to_company', 'cash_cleared'];

export default function DeliveryView({ token, user }) {
  const [orders, setOrders]               = useState([]);
  const [returnPickups, setReturnPickups] = useState([]);
  const [wallet, setWallet]               = useState(null);
  const [loading, setLoading]             = useState(true);
  const [onlineStatus, setOnline]         = useState(user.online_status || 'offline');
  const [clocking, setClocking]           = useState(false);
  const [expenseModal, setExpModal]       = useState(false);
  const [expAmt, setExpAmt]               = useState('');
  const [expReason, setExpReason]         = useState('');
  const [submitting, setSub]              = useState({});
  const [failModal, setFailModal]         = useState(null); // order to mark failed
  const [failReason, setFailReason]       = useState('');

  const [paymentModal, setPaymentModal] = useState(null); // order to record payment for
  const [payAmt, setPayAmt]             = useState('');
  const [payMethod, setPayMethod]       = useState(''); // Explicit selection required (no default guess!)
  const [paymentAtt, setPaymentAtt]     = useState(null);

  const [outcomeModal, setOutcomeModal] = useState(null); // order to select status outcome for
  const [outcomeStep, setOutcomeStep]   = useState(1);
  const [step1Outcome, setStep1Outcome] = useState('full');
  const [step2Outcome, setStep2Outcome] = useState('full');
  const [step3PaymentMethod, setStep3PaymentMethod] = useState('cash');
  const [delItemAmt, setDelItemAmt]     = useState('');
  const [retItemAmt, setRetItemAmt]     = useState('');
  const [retQty, setRetQty]             = useState('');
  const [retNotes, setRetNotes]         = useState('');
  const [deliveryAtt, setDeliveryAtt]   = useState(null);

  const [ledgerModal, setLedgerModal] = useState(false);
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [ord, wal, retP] = await Promise.all([
        getMyDeliveries(token),
        getWalletSummary(token),
        getDriverReturnPickups(token)
      ]);
      setOrders(ord);
      setWallet(wal);
      setReturnPickups(retP.return_pickups || []);
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
    if (onlineStatus === 'online') {
      // Clock Out - Go Offline (no location requirement)
      setClocking(true);
      try {
        await clockOut(token);
        setOnline('offline');
        toast.success('Clock-out successful. You are now offline.');
      } catch (err) {
        toast.error(err.message);
      } finally {
        setClocking(false);
      }
    } else {
      // Clock In - Go Active (requires GPS location within warehouse radius)
      if (!navigator.geolocation) {
        toast.error('Geolocation is not supported by your browser.');
        return;
      }
      setClocking(true);
      toast.info('Capturing GPS location for warehouse confirmation...');
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            await clockIn({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }, token);
            setOnline('online');
            toast.success('Warehouse radius verified. You are now ONLINE!');
          } catch (err) {
            toast.error(err.message);
          } finally {
            setClocking(false);
          }
        },
        (geoErr) => {
          setClocking(false);
          toast.error('GPS Location error: ' + geoErr.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  const changeStatus = async (orderId, newStatus, extra = {}) => {
    setSub(s => ({ ...s, [orderId]: true }));
    try {
      await updateDeliveryStatus(orderId, { status: newStatus, ...extra }, token);
      toast.success(`Order status updated to ${STATUS_LABEL[newStatus] || newStatus}`);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSub(s => { const n = { ...s }; delete n[orderId]; return n; });
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

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!payMethod) {
      toast.error('Payment method selection is required.');
      return;
    }
    if (!payAmt || parseFloat(payAmt) <= 0) {
      toast.error('Valid positive payment amount is required.');
      return;
    }
    const isEpayment = ['e_wallet', 'instapay', 'vodafone_cash'].includes(payMethod);
    if (isEpayment && !paymentAtt) {
      toast.error('Proof attachment photo is required for e-payment methods.');
      return;
    }
    try {
      await recordPayment(paymentModal.id, {
        amount: parseFloat(payAmt),
        payment_method: payMethod,
        proof_attachment_id: paymentAtt ? paymentAtt.id : undefined
      }, token);
      toast.success('Payment submitted for Finance review!');
      setPaymentModal(null); setPayAmt(''); setPayMethod(''); setPaymentAtt(null);
      fetchData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSubmitOutcome = async (e) => {
    if (e) e.preventDefault();
    const payload = {
      delivery_outcome: step1Outcome,
      collection_outcome: step2Outcome,
      payment_method: step2Outcome === 'none' ? 'none' : step3PaymentMethod
    };

    if (step1Outcome === 'partial') {
      const delVal = parseFloat(delItemAmt || 0);
      const retVal = parseFloat(retItemAmt || 0);
      const orderTotal = parseFloat(outcomeModal.order_amount || 0);

      if (delVal + retVal === 0) {
        toast.error('Please enter the delivered items amount or returned items amount.');
        return;
      }
      payload.delivered_items_amount = delVal;
      payload.returned_items_amount = retVal > 0 ? retVal : Math.max(0, orderTotal - delVal);
      payload.returned_quantity = parseInt(retQty) || 0;
      payload.return_notes = retNotes.trim();
    }

    try {
      const targetOrder = outcomeModal;
      const finalStatus = ['full', 'partial'].includes(step1Outcome) ? 'delivered' : 'delivery_failed';
      await updateDeliveryStatus(targetOrder.id, { status: finalStatus, ...payload }, token);
      toast.success(`Order status updated successfully.`);
      setOutcomeModal(null);
      setDelItemAmt(''); setRetItemAmt(''); setRetQty(''); setRetNotes('');
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
      <div className="section-header">
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

      {/* Return Pickups Section (Requirement 4: Return-only pickups distinct from normal deliveries) */}
      {returnPickups.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--clr-danger)' }}>
          <div className="card-header">
            <span className="card-title" style={{ color: 'var(--clr-danger)' }}>
              ↩️ Return Pickups Assigned to You
              <span style={{ background: 'var(--clr-danger)', color: 'white', borderRadius: 999, padding: '1px 8px', fontSize: 11, marginLeft: 6 }}>
                {returnPickups.length}
              </span>
            </span>
          </div>
          <div className="card-grid">
            {returnPickups.map(ret => (
              <div key={ret.id} className="card" style={{ background: 'var(--clr-bg-subtle)', border: '1px solid var(--clr-danger)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: 'var(--clr-danger)', fontSize: 13 }}>#{ret.tracking_number}</span>
                  <span className="badge badge-delivery_failed">
                    ↩️ Return ({ret.return_type})
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--clr-text)', fontWeight: 600, marginBottom: 10 }}>📍 {ret.client_address}</div>
                <div style={{ background: 'var(--clr-bg)', padding: 10, borderRadius: 'var(--r-sm)', marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--clr-danger)', fontWeight: 600 }}>
                    Returned Portion: EGP {parseFloat(ret.returned_items_amount || 0).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--clr-text-muted)', marginTop: 4 }}>
                    Reason: {ret.reason}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--clr-text-dim)', marginTop: 4 }}>
                    Initiated by: {ret.initiated_by_name}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--clr-warning)', fontWeight: 600 }}>
                  📦 Status: {ret.status === 'pending_pickup' ? 'Awaiting pickup from client' : 'Package in transit to warehouse'}
                </div>
              </div>
            ))}
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
                onSelectOutcome={(orderObj) => { setOutcomeModal(orderObj); setOutcomeStep(1); setStep1Outcome('full'); setStep2Outcome('full'); setStep3PaymentMethod('cash'); setDelItemAmt(String(orderObj.order_amount)); setRetItemAmt('0'); setRetQty(''); setRetNotes(''); }}
                onRecordPayment={(orderObj) => { setPaymentModal(orderObj); setPayAmt(orderObj.outstanding_balance ? String(orderObj.outstanding_balance) : String(orderObj.order_amount)); setPayMethod(''); setPaymentAtt(null); }}
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
                  <th>Tracking</th><th>Address</th><th>Amount</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {done.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600, color: 'var(--clr-accent)' }}>{o.tracking_number}</td>
                    <td style={{ fontSize: 12, color: 'var(--clr-text-muted)' }}>{o.client_address}</td>
                    <td className="amount">EGP {parseFloat(o.order_amount).toFixed(2)}</td>
                    <td><span className={`badge badge-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Outcome Status Selector Modal (3-Step Wizard) */}
      {outcomeModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 540 }}>
            {outcomeStep === 1 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h2 className="modal-title" style={{ margin: 0 }}>📋 Step 1 of 3: How was it delivered? (حالة التسليم)</h2>
                  <span style={{ background: 'var(--clr-accent)', color: 'white', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>1 / 3</span>
                </div>
                <p style={{ color: 'var(--clr-text-muted)', fontSize: 13, marginBottom: 14 }}>
                  Order: <strong>#{outcomeModal.tracking_number}</strong> | Address: <strong>{outcomeModal.client_address}</strong>
                </p>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>Select Delivery Outcome:</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {DELIVERY_OUTCOMES_STEP1.map((item) => {
                      const isSelected = step1Outcome === item.value;
                      return (
                        <div
                          key={item.value}
                          onClick={() => {
                            setStep1Outcome(item.value);
                            const validStep2 = getValidCollectionOutcomes(item.value);
                            if (validStep2.length > 0) {
                              setStep2Outcome(validStep2[0].value);
                            }
                          }}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 'var(--r-sm)',
                            border: isSelected ? '2px solid var(--clr-accent)' : '1px solid var(--clr-border)',
                            background: isSelected ? 'rgba(37,99,235,0.08)' : 'var(--clr-bg-subtle)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontWeight: isSelected ? 700 : 500
                          }}
                        >
                          <span>{item.label_ar} ({item.label_en})</span>
                          {isSelected && <span style={{ color: 'var(--clr-accent)', fontWeight: 'bold' }}>✓</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Partial Delivery Breakdown Section at End of Step 1 */}
                {step1Outcome === 'partial' && (
                  <div style={{ background: 'var(--clr-bg-subtle)', padding: 12, borderRadius: 'var(--r-sm)', marginBottom: 14, border: '1px solid var(--clr-border)' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--clr-warning)' }}>
                      📦 Partial Delivery Details (بيانات التسليم الجزئي)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="form-group">
                        <label className="form-label">Delivered Amount (مبلغ المقبول)</label>
                        <input
                          className="form-input"
                          type="number" min="0" step="0.01"
                          placeholder="0.00"
                          value={delItemAmt}
                          onChange={e => {
                            const v = e.target.value;
                            setDelItemAmt(v);
                            const total = parseFloat(outcomeModal.order_amount || 0);
                            if (v !== '' && !isNaN(parseFloat(v))) {
                              setRetItemAmt(String(Math.max(0, total - parseFloat(v))));
                            }
                          }}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Returned Amount (مبلغ الراجع)</label>
                        <input
                          className="form-input"
                          type="number" min="0" step="0.01"
                          placeholder="0.00"
                          value={retItemAmt}
                          onChange={e => setRetItemAmt(e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                      <div className="form-group">
                        <label className="form-label">Returned Qty (الكمية)</label>
                        <input
                          className="form-input"
                          type="number" min="0" step="1"
                          placeholder="0"
                          value={retQty}
                          onChange={e => setRetQty(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Return Notes (ملاحظات الراجع)</label>
                        <input
                          className="form-input"
                          placeholder="e.g. Size mismatch / item rejected"
                          value={retNotes}
                          onChange={e => setRetNotes(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="modal-actions" style={{ marginTop: 16 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setOutcomeModal(null)}>Cancel</button>
                  <button type="button" className="btn btn-primary" onClick={() => setOutcomeStep(2)}>Next: Collection Outcome →</button>
                </div>
              </div>
            )}

            {outcomeStep === 2 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h2 className="modal-title" style={{ margin: 0 }}>📋 Step 2 of 3: What was collected? (حالة التحصيل)</h2>
                  <span style={{ background: '#10b981', color: 'white', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>2 / 3</span>
                </div>

                {/* Step 1 Summary Badge Pill */}
                <div style={{ background: 'rgba(37,99,235,0.08)', padding: '10px 14px', borderRadius: 'var(--r-sm)', border: '1px solid #bfdbfe', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--clr-accent)', fontWeight: 600, display: 'block' }}>Delivery Outcome (Step 1):</span>
                    <strong style={{ fontSize: 13 }}>
                      {DELIVERY_OUTCOMES_STEP1.find(s => s.value === step1Outcome)?.label_ar} ({DELIVERY_OUTCOMES_STEP1.find(s => s.value === step1Outcome)?.label_en})
                    </strong>
                  </div>
                  <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setOutcomeStep(1)}>Change</button>
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>Select Collection Outcome:</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {getValidCollectionOutcomes(step1Outcome).map((item) => {
                      const isSelected = step2Outcome === item.value;
                      return (
                        <div
                          key={item.value}
                          onClick={() => setStep2Outcome(item.value)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 'var(--r-sm)',
                            border: isSelected ? '2px solid #10b981' : '1px solid var(--clr-border)',
                            background: isSelected ? 'rgba(16,185,129,0.08)' : 'var(--clr-bg-subtle)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontWeight: isSelected ? 700 : 500
                          }}
                        >
                          <span>{item.label_ar} ({item.label_en})</span>
                          {isSelected && <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="modal-actions" style={{ marginTop: 16 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setOutcomeStep(1)}>← Back</button>
                  {step2Outcome === 'none' ? (
                    <button type="button" className="btn btn-primary" onClick={handleSubmitOutcome}>Confirm Outcome</button>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={() => setOutcomeStep(3)}>Next: Payment Method →</button>
                  )}
                </div>
              </div>
            )}

            {outcomeStep === 3 && (
              <form onSubmit={handleSubmitOutcome}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h2 className="modal-title" style={{ margin: 0 }}>📋 Step 3 of 3: Payment Method & Details (طريقة الدفع)</h2>
                  <span style={{ background: '#8b5cf6', color: 'white', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>3 / 3</span>
                </div>

                {/* Summary Badges */}
                <div style={{ background: 'rgba(139,92,246,0.08)', padding: '10px 14px', borderRadius: 'var(--r-sm)', border: '1px solid #ddd6fe', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>Delivery: <strong>{DELIVERY_OUTCOMES_STEP1.find(s => s.value === step1Outcome)?.label_ar}</strong></span>
                    <span>Collection: <strong>{DELIVERY_OUTCOMES_STEP2.find(s => s.value === step2Outcome)?.label_ar}</strong></span>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>Select Payment Method:</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {PAYMENT_METHODS_STEP3.map((item) => {
                      const isSelected = step3PaymentMethod === item.value;
                      return (
                        <div
                          key={item.value}
                          onClick={() => setStep3PaymentMethod(item.value)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 'var(--r-sm)',
                            border: isSelected ? '2px solid #8b5cf6' : '1px solid var(--clr-border)',
                            background: isSelected ? 'rgba(139,92,246,0.08)' : 'var(--clr-bg-subtle)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontWeight: isSelected ? 700 : 500
                          }}
                        >
                          <span>{item.label_ar} ({item.label_en})</span>
                          {isSelected && <span style={{ color: '#8b5cf6', fontWeight: 'bold' }}>✓</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <PhotoCapture
                  orderId={outcomeModal.id}
                  stage="customer_delivery"
                  required={false}
                  token={token}
                  onAttachmentUploaded={(att) => setDeliveryAtt(att)}
                  label="📷 Customer Proof of Delivery Photo (Optional)"
                />

                <VoiceFeedbackRecorder
                  orderId={outcomeModal.id}
                  token={token}
                />

                <div className="modal-actions" style={{ marginTop: 16 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setOutcomeStep(2)}>← Back</button>
                  <button type="submit" className="btn btn-primary">Submit Final Outcome</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Record Payment Modal (Explicit Picker - No Default Guess) */}
      {paymentModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">💳 Record Payment — #{paymentModal.tracking_number}</h2>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 13, marginBottom: 12 }}>
              Total Order Amount: <strong>EGP {parseFloat(paymentModal.order_amount).toFixed(2)}</strong><br />
              Outstanding Balance: <strong style={{ color: 'var(--clr-danger)' }}>EGP {parseFloat(paymentModal.outstanding_balance ?? paymentModal.order_amount).toFixed(2)}</strong>
            </p>
            <form onSubmit={handleRecordPayment}>
              <div className="form-group">
                <label className="form-label">Payment Method (Required)</label>
                <select className="form-select" value={payMethod} onChange={e => setPayMethod(e.target.value)} required>
                  <option value="" disabled>-- Select Payment Method --</option>
                  <option value="cash">💵 Cash / نقداً</option>
                  <option value="e_wallet">📱 E-Wallet / محفظة إلكترونية</option>
                  <option value="instapay">⚡ InstaPay / إنستا باي</option>
                  <option value="vodafone_cash">🔴 Vodafone Cash / فودافون كاش</option>
                  <option value="other">🌐 Other / أخرى</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Payment Amount (EGP)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={payAmt}
                  onChange={e => setPayAmt(e.target.value)}
                  placeholder="Enter partial or full amount"
                  required
                />
              </div>
              {payMethod && (
                <PhotoCapture
                  orderId={paymentModal.id}
                  stage="payment_confirmation"
                  required={['e_wallet', 'instapay', 'vodafone_cash'].includes(payMethod)}
                  token={token}
                  onAttachmentUploaded={(att) => setPaymentAtt(att)}
                  label={['e_wallet', 'instapay', 'vodafone_cash'].includes(payMethod) ? '📸 Payment Transfer Proof Photo' : '📷 Optional Receipt Photo'}
                />
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setPaymentModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!payMethod}>Submit Payment</button>
              </div>
            </form>
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

function OrderCard({ order: o, submitting, onChangeStatus, onFail, onSelectOutcome, onRecordPayment }) {
  const isLoading = (status) => submitting[o.id + status];
  const pendingPaid = parseFloat(o.pending_paid || 0);

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--clr-accent)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, color: 'var(--clr-accent)', fontSize: 13 }}>{o.tracking_number}</span>
        <span className={`badge badge-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--clr-text)', fontWeight: 600, marginBottom: 10 }}>📍 {o.client_address}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <a href={`https://maps.google.com/?q=${encodeURIComponent(o.client_address)}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">🗺️ Map</a>
      </div>

      <div style={{ background: 'var(--clr-bg-subtle)', padding: 10, borderRadius: 'var(--r-sm)', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--clr-text-muted)' }}>Order Amount:</span>
          <strong>EGP {parseFloat(o.order_amount).toFixed(2)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
          <span style={{ color: 'var(--clr-text-muted)' }}>Outstanding Balance:</span>
          <strong style={{ color: 'var(--clr-danger)' }}>EGP {parseFloat(o.outstanding_balance ?? o.order_amount).toFixed(2)}</strong>
        </div>
        {pendingPaid > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--clr-warning)', fontWeight: 600 }}>
            ⏳ EGP {pendingPaid.toFixed(2)} Awaiting Confirmation
          </div>
        )}
      </div>

      <div className="row-actions">
        <button className="btn btn-primary btn-sm" onClick={() => onSelectOutcome(o)}>
          📋 Outcome Status
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onRecordPayment(o)}>
          💳 Payment
        </button>
        {o.status === 'handed_to_delivery' && (
          <button className="btn btn-primary btn-sm" disabled={isLoading('in_transit')} onClick={() => onChangeStatus(o.id, 'in_transit')}>
            {isLoading('in_transit') ? <span className="spinner" /> : '🚚 Start Transit'}
          </button>
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
