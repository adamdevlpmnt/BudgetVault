import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, BarChart3, Plus, PieChart, Receipt } from 'lucide-react';
import SyncStatusBar from './SyncStatusBar.jsx';
import { useSync } from '../context/SyncContext.jsx';
import ExpenseModal from './ExpenseModal.jsx';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isOnline, pendingCount, syncStatus } = useSync();
  const [showAddModal, setShowAddModal] = useState(false);

  // Determine sync dot color
  const getSyncDotClass = () => {
    if (!isOnline) return 'sync-dot sync-dot--offline';
    if (syncStatus === 'error') return 'sync-dot sync-dot--error';
    if (syncStatus === 'syncing') return 'sync-dot sync-dot--syncing';
    if (pendingCount > 0) return 'sync-dot sync-dot--pending';
    return 'sync-dot sync-dot--ok';
  };

  const isHomeActive = location.pathname === '/';
  const isStatsActive = location.pathname.startsWith('/analytics');
  const isBudgetsActive = location.pathname.startsWith('/categories');
  const isActivityActive = location.pathname.startsWith('/expenses');

  return (
    <div className="app-layout">
      <SyncStatusBar />
      <main className="page-content fade-in">
        <Outlet />
      </main>

      <nav className="bottom-nav" id="main-navigation">
        <span className={getSyncDotClass()} />

        {/* 1. Home */}
        <button
          className={`nav-item ${isHomeActive ? 'active' : ''}`}
          onClick={() => navigate('/')}
          id="nav-home"
        >
          <span className="nav-icon">
            <Home size={20} strokeWidth={isHomeActive ? 2.4 : 1.8} />
          </span>
          <span className="nav-label">Accueil</span>
        </button>

        {/* 2. Stats */}
        <button
          className={`nav-item ${isStatsActive ? 'active' : ''}`}
          onClick={() => navigate('/analytics')}
          id="nav-stats"
        >
          <span className="nav-icon">
            <BarChart3 size={20} strokeWidth={isStatsActive ? 2.4 : 1.8} />
          </span>
          <span className="nav-label">Stats</span>
        </button>

        {/* 3. Center Golden FAB */}
        <button
          className="bottom-nav-fab"
          onClick={() => {
            if (navigator.vibrate) navigator.vibrate(15);
            setShowAddModal(true);
          }}
          id="nav-add-fab"
          aria-label="Ajouter une transaction"
        >
          <Plus size={26} strokeWidth={2.8} />
        </button>

        {/* 4. Budgets */}
        <button
          className={`nav-item ${isBudgetsActive ? 'active' : ''}`}
          onClick={() => navigate('/categories')}
          id="nav-budgets"
        >
          <span className="nav-icon">
            <PieChart size={20} strokeWidth={isBudgetsActive ? 2.4 : 1.8} />
          </span>
          <span className="nav-label">Budgets</span>
        </button>

        {/* 5. Activity */}
        <button
          className={`nav-item ${isActivityActive ? 'active' : ''}`}
          onClick={() => navigate('/expenses')}
          id="nav-activity"
        >
          <span className="nav-icon">
            <Receipt size={20} strokeWidth={isActivityActive ? 2.4 : 1.8} />
          </span>
          <span className="nav-label">Activité</span>
        </button>
      </nav>

      {showAddModal && (
        <ExpenseModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
