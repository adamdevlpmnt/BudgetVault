import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import Analytics from './pages/Analytics';
import Categories from './pages/Categories';
import Settings from './pages/Settings';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="login-page"><div className="skeleton" style={{width:200,height:40}} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="categories" element={<Categories />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  // Apply stored theme on initial mount
  useEffect(() => {
    const stored = localStorage.getItem('budgetvault-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', stored);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', stored === 'light' ? '#f1f5f9' : '#0a0a1a');
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: 'var(--bg-card)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              fontSize: '0.9rem',
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
