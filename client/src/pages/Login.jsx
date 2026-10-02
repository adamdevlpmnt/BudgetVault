import React, { useState } from 'react';
import { Wallet, Lock, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message || 'Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card fade-in" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div className="login-logo">
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))',
              border: '1px solid rgba(245,158,11,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <Wallet size={36} color="var(--gold-light)" />
          </div>
          <h1 style={{ fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em' }}>BudgetVault</h1>
          <p style={{ fontSize: '0.72rem', color: 'var(--gold-light)', opacity: 0.8, marginTop: 2, marginBottom: 8, letterSpacing: '0.1em', fontWeight: 700 }}>
            v2.2.0 • EDITION PREMIUM
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Gérez votre budget en toute simplicité</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="login-username">Nom d'utilisateur</label>
            <div style={{ position: 'relative' }}>
              <User size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--text-muted)' }} />
              <input
                id="login-username"
                className="input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                style={{ paddingLeft: 42 }}
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="login-password">Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--text-muted)' }} />
              <input
                id="login-password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ paddingLeft: 42 }}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-block"
            disabled={loading}
            id="login-submit"
            style={{
              marginTop: 12,
              background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
              color: '#0b131e',
              fontWeight: 800,
              fontSize: '1rem',
              padding: '14px',
              borderRadius: 14,
              border: 'none',
              boxShadow: '0 4px 18px rgba(245, 158, 11, 0.4)',
            }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
