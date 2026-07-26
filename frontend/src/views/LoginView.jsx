import { useState } from 'react';
import { login, register, checkUsername } from '../api.js';
import { toast } from '../App.jsx';

const ROLES = [
  { value: 'delivery_guy', label: '🚚 Delivery Guy' },
  { value: 'supervisor',   label: '👔 Supervisor'   },
  { value: 'inventory',    label: '📦 Inventory'    },
  { value: 'finance',      label: '💰 Finance'      },
  { value: 'manager',      label: '📊 Manager'      },
];

export default function LoginView({ onLogin }) {
  const [tab, setTab]       = useState('login');
  const [loading, setLoad]  = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');

  // Login form
  const [lUsername, setLU] = useState('');
  const [lPassword, setLP] = useState('');

  // Register form
  const [rUsername, setRU] = useState('');
  const [rName, setRN]     = useState('');
  const [rPassword, setRP] = useState('');
  const [rPhone, setRPh]   = useState('');
  const [rRole, setRR]     = useState('delivery_guy');
  const [usernameOk, setUsernameOk] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setLoad(true);
    try {
      const data = await login(lUsername.trim(), lPassword);
      toast.success(`Welcome back, ${data.user.name}!`);
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoad(false);
    }
  };

  const handleUsernameBlur = async () => {
    if (rUsername.trim().length < 3) { setUsernameOk(null); return; }
    try {
      const d = await checkUsername(rUsername.trim());
      setUsernameOk(d.available);
    } catch { setUsernameOk(null); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoad(true);
    try {
      const data = await register({
        username: rUsername.trim(),
        name:     rName.trim(),
        password: rPassword,
        role:     rRole,
        phone:    rPhone.trim() || undefined,
      });
      if (data.requiresApproval) {
        setSuccess('Manager account submitted — awaiting approval from an active Executive Manager.');
        setTab('login');
      } else {
        toast.success(`Account created! Welcome, ${data.user.name}`);
        onLogin(data.token, data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoad(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-logo">
          <div className="logo-icon">🚚</div>
          <h1>Delivery Express</h1>
          <p>Operations Management Platform</p>
        </div>

        <div className="tab-row">
          <button
            id="tab-login"
            className={`tab-btn ${tab === 'login' ? 'active' : ''}`}
            onClick={() => { setTab('login'); setError(''); setSuccess(''); }}
          >Sign In</button>
          <button
            id="tab-register"
            className={`tab-btn ${tab === 'register' ? 'active' : ''}`}
            onClick={() => { setTab('register'); setError(''); setSuccess(''); }}
          >Register</button>
        </div>

        {error   && <div className="error-msg">⚠️ {error}</div>}
        {success && <div className="success-msg">✅ {success}</div>}

        {tab === 'login' ? (
          <form id="login-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                id="login-username"
                className="form-input"
                placeholder="e.g. sami_delivery"
                value={lUsername}
                onChange={e => setLU(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                id="login-password"
                type="password"
                className="form-input"
                placeholder="Your password"
                value={lPassword}
                onChange={e => setLP(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <button id="login-submit" type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Sign In'}
            </button>
            <p style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'var(--clr-text-dim)' }}>
              Demo password for all seeded accounts: <strong style={{ color: 'var(--clr-text-muted)' }}>Admin123!</strong>
            </p>
          </form>
        ) : (
          <form id="register-form" onSubmit={handleRegister}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                id="reg-username"
                className="form-input"
                placeholder="e.g. ahmed_driver"
                value={rUsername}
                onChange={e => { setRU(e.target.value); setUsernameOk(null); }}
                onBlur={handleUsernameBlur}
                required
              />
              {usernameOk === true  && <div className="form-hint" style={{ color: 'var(--clr-success)' }}>✓ Username available</div>}
              {usernameOk === false && <div className="form-hint" style={{ color: 'var(--clr-danger)' }}>✗ Username taken</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input id="reg-name" className="form-input" placeholder="Ahmed Hassan" value={rName} onChange={e => setRN(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password <span style={{ color: 'var(--clr-text-dim)' }}>(min 6 chars)</span></label>
              <input id="reg-password" type="password" className="form-input" placeholder="Min 6 characters" value={rPassword} onChange={e => setRP(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Phone <span style={{ color: 'var(--clr-text-dim)' }}>(optional)</span></label>
              <input id="reg-phone" className="form-input" placeholder="01xxxxxxxxx" value={rPhone} onChange={e => setRPh(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select
                id="reg-role"
                className="form-select"
                value={rRole}
                onChange={e => setRR(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--r-md)', border: '1px solid var(--clr-border)', backgroundColor: 'var(--clr-bg-subtle)', color: 'var(--clr-text)', fontSize: 14 }}
              >
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {rRole === 'manager' && (
                <div className="form-hint" style={{ marginTop: 6, color: 'var(--clr-warning)' }}>
                  ⚠️ Manager accounts require approval from an existing Executive Manager before login.
                </div>
              )}
            </div>
            <button id="register-submit" type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading || usernameOk === false}>
              {loading ? <span className="spinner" /> : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
