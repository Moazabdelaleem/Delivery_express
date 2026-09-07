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
  success: (msg, title) => _addToast?.({ msg, title: title || 'Success', type: 'success' }),
  error:   (msg, title) => _addToast?.({ msg, title: title || 'Error', type: 'error' }),
  info:    (msg, title) => _addToast?.({ msg, title: title || 'Information', type: 'info' }),
  warning: (msg, title) => _addToast?.({ msg, title: title || 'Warning', type: 'warning' }),
};

// Global Buffer Loader System
let _setBufferLoader;
export const bufferLoader = {
  show: (msg = 'Processing operation...') => _setBufferLoader?.({ active: true, msg }),
  hide: () => _setBufferLoader?.({ active: false, msg: '' }),
};

function GlobalBufferLoader() {
  const [loader, setLoader] = useState({ active: false, msg: '' });

  useEffect(() => {
    _setBufferLoader = setLoader;
    return () => { _setBufferLoader = null; };
  }, []);

  if (!loader.active) return null;

  return (
    <div className="buffer-overlay">
      <div className="buffer-card">
        <div className="buffer-spinner-container">
          <div className="buffer-ring-outer" />
          <div className="buffer-ring-inner" />
          <div className="buffer-icon-center">🚚</div>
        </div>
        <div className="buffer-title">{loader.msg}</div>
        <div className="buffer-subtitle">
          Please wait a moment
          <span className="buffer-dots"><span>.</span><span>.</span><span>.</span></span>
        </div>
      </div>
    </div>
  );
}

function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    _addToast = ({ msg, title, type }) => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, msg, title, type }]);
      const duration = type === 'error' ? 8000 : 4000;
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    };
    return () => { _addToast = null; };
  }, []);

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  };

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          role="alert"
          style={{ '--toast-duration': t.type === 'error' ? '8s' : '4s' }}
        >
          <div className="toast-icon-badge">
            {icons[t.type]}
          </div>
          <div className="toast-content">
            <div className="toast-title">{t.title}</div>
            <div className="toast-message">{t.msg}</div>
          </div>
          <button className="toast-close-btn" onClick={() => removeToast(t.id)}>✕</button>
          <div className="toast-progress-bar" />
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
        <GlobalBufferLoader />
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
      <GlobalBufferLoader />
      <ToastContainer />
    </div>
  );
}
