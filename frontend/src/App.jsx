import { useState, useEffect, useCallback } from 'react';
import LoginView from './views/LoginView.jsx';
import DeliveryView from './views/DeliveryView.jsx';
import SupervisorView from './views/SupervisorView.jsx';
import InventoryView from './views/InventoryView.jsx';
import FinanceView from './views/FinanceView.jsx';
import ManagerView from './views/ManagerView.jsx';

const ROLE_LABELS = {
  delivery_guy: '🚚 Delivery',
  supervisor:   '👔 Supervisor',
  inventory:    '📦 Inventory',
  finance:      '💰 Finance',
  manager:      '📊 Manager',
};

// Toast system
let _addToast;
export const toast = {
  success: (msg) => _addToast?.({ msg, type: 'success' }),
  error:   (msg) => _addToast?.({ msg, type: 'error' }),
  info:    (msg) => _addToast?.({ msg, type: 'info' }),
};

function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    _addToast = ({ msg, type }) => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, msg, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };
    return () => { _addToast = null; };
  }, []);

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span>{icons[t.type]}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

function Topbar({ user, onLogout }) {
  const initials = user.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="brand-icon">🚚</div>
        Delivery Express
      </div>
      <div className="topbar-right">
        <span style={{ fontSize: 13, color: 'var(--clr-text-muted)' }}>
          {ROLE_LABELS[user.role] || user.role}
        </span>
        <div className="user-chip">
          <div className="user-avatar">{initials}</div>
          <span>{user.name}</span>
        </div>
        <button className="btn btn-ghost btn-sm" id="logout-btn" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </header>
  );
}

const VIEWS = {
  delivery_guy: DeliveryView,
  supervisor:   SupervisorView,
  inventory:    InventoryView,
  finance:      FinanceView,
  manager:      ManagerView,
};

export default function App() {
  const [auth, setAuth] = useState(() => {
    try {
      const stored = localStorage.getItem('delivery_express_auth');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  const handleLogin = useCallback((token, user) => {
    const authData = { token, user };
    localStorage.setItem('delivery_express_auth', JSON.stringify(authData));
    setAuth(authData);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('delivery_express_auth');
    setAuth(null);
  }, []);

  if (!auth) {
    return (
      <>
        <LoginView onLogin={handleLogin} />
        <ToastContainer />
      </>
    );
  }

  const RoleView = VIEWS[auth.user.role];

  return (
    <div className="app-shell">
      <Topbar user={auth.user} onLogout={handleLogout} />
      <main className="main-content">
        {RoleView
          ? <RoleView token={auth.token} user={auth.user} />
          : <div className="empty-state"><p>Unknown role: {auth.user.role}</p></div>
        }
      </main>
      <ToastContainer />
    </div>
  );
}
