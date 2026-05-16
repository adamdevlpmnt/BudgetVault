import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../utils/api';
import { setCurrency } from '../utils/format';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('budgetvault_user');
    if (stored) {
      const u = JSON.parse(stored);
      setCurrency(u.currency || 'EUR');
      return u;
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('budgetvault_token');
    if (token) {
      api.getMe().then(u => {
        setUser(u);
        setCurrency(u.currency || 'EUR');
        localStorage.setItem('budgetvault_user', JSON.stringify(u));
      }).catch(() => {
        localStorage.removeItem('budgetvault_token');
        localStorage.removeItem('budgetvault_user');
        setUser(null);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const data = await api.login(username, password);
    localStorage.setItem('budgetvault_token', data.token);
    localStorage.setItem('budgetvault_user', JSON.stringify(data.user));
    setCurrency(data.user.currency || 'EUR');
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('budgetvault_token');
    localStorage.removeItem('budgetvault_user');
    setUser(null);
  };

  const updateUser = (updates) => {
    const updated = { ...user, ...updates };
    if (updates.currency) setCurrency(updates.currency);
    setUser(updated);
    localStorage.setItem('budgetvault_user', JSON.stringify(updated));
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
