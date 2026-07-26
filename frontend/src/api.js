// =========================================================
// api.js — All backend fetch helpers
// BASE_URL reads from Vite env var (or falls back to localhost)
// =========================================================

export const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const headers = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

const handle = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

// ---- Auth ----
export const login = (username, password) =>
  fetch(`${BASE_URL}/auth/login`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ username, password })
  }).then(handle);

export const register = (payload) =>
  fetch(`${BASE_URL}/auth/register`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify(payload)
  }).then(handle);

export const checkUsername = (username) =>
  fetch(`${BASE_URL}/auth/check-username/${username}`).then(handle);

export const getUsersByRole = (role, token) =>
  fetch(`${BASE_URL}/auth/role/${role}`, { headers: headers(token) }).then(handle);

export const getPendingUsers = (token) =>
  fetch(`${BASE_URL}/auth/pending-users`, { headers: headers(token) }).then(handle);

export const getPendingManagers = getPendingUsers;

export const approveUser = (id, token) =>
  fetch(`${BASE_URL}/auth/approve-user/${id}`, {
    method: 'PUT', headers: headers(token)
  }).then(handle);

export const approveManager = approveUser;

export const rejectUser = (id, token) =>
  fetch(`${BASE_URL}/auth/reject-user/${id}`, {
    method: 'DELETE', headers: headers(token)
  }).then(handle);

export const rejectManager = rejectUser;

export const updateOnlineStatus = (status, token) =>
  fetch(`${BASE_URL}/auth/status`, {
    method: 'PUT', headers: headers(token),
    body: JSON.stringify({ status })
  }).then(handle);

// ---- Orders ----
export const getAllOrders = (token) =>
  fetch(`${BASE_URL}/orders/all`, { headers: headers(token) }).then(handle);

export const getMyDeliveries = (token) =>
  fetch(`${BASE_URL}/orders/my-deliveries`, { headers: headers(token) }).then(handle);

export const getInventoryQueue = (token) =>
  fetch(`${BASE_URL}/orders/all`, { headers: headers(token) }).then(handle);

export const createOrder = (payload, token) =>
  fetch(`${BASE_URL}/orders`, {
    method: 'POST', headers: headers(token),
    body: JSON.stringify(payload)
  }).then(handle);

export const updateDeliveryStatus = (orderId, payload, token) =>
  fetch(`${BASE_URL}/orders/${orderId}/delivery-status`, {
    method: 'PUT', headers: headers(token),
    body: JSON.stringify(payload)
  }).then(handle);

export const inventoryHandoff = (orderId, payload, token) =>
  fetch(`${BASE_URL}/orders/${orderId}/handoff`, {
    method: 'PUT', headers: headers(token),
    body: JSON.stringify(payload)
  }).then(handle);

export const getOrderAuditTrail = (orderId, token) =>
  fetch(`${BASE_URL}/orders/${orderId}/audit-trail`, { headers: headers(token) }).then(handle);

// ---- Wallets ----
export const getWalletSummary = (token) =>
  fetch(`${BASE_URL}/wallets/summary`, { headers: headers(token) }).then(handle);

export const getAllWallets = (token) =>
  fetch(`${BASE_URL}/wallets/summary`, { headers: headers(token) }).then(handle);

export const pulloutCollection = (payload, token) =>
  fetch(`${BASE_URL}/wallets/collection/pullout`, {
    method: 'POST', headers: headers(token),
    body: JSON.stringify(payload)
  }).then(handle);

export const topupPocket = (payload, token) =>
  fetch(`${BASE_URL}/wallets/pocket/topup`, {
    method: 'POST', headers: headers(token),
    body: JSON.stringify(payload)
  }).then(handle);

export const logExpense = (payload, token) =>
  fetch(`${BASE_URL}/wallets/pocket/expense`, {
    method: 'POST', headers: headers(token),
    body: JSON.stringify(payload)
  }).then(handle);

export const getExpenses = (token) =>
  fetch(`${BASE_URL}/wallets/pocket/breakdown`, { headers: headers(token) }).then(handle);

export const getDriverLedger = (driverId, token) =>
  fetch(`${BASE_URL}/wallets/ledger/${driverId}`, { headers: headers(token) }).then(handle);

export const getGlobalAudit = (token) =>
  fetch(`${BASE_URL}/wallets/audit`, { headers: headers(token) }).then(handle);

// ---- System ----
export const healthCheck = () =>
  fetch(`${BASE_URL}/health`).then(handle);
