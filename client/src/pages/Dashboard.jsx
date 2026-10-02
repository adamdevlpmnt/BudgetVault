import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Edit3, Settings, CreditCard, ArrowDownLeft, ArrowUpRight, Minus, TrendingDown, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import { offlineApi as api } from '../utils/offlineApi.js';
import { formatMoney, formatDate, today } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { sync, syncEvents } from '../utils/syncEngine.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import PullToRefresh from '../components/PullToRefresh.jsx';
import ReceiptCard from '../components/ReceiptCard.jsx';
import ExpenseModal from '../components/ExpenseModal.jsx';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState(null);
  const [summary, setSummary] = useState(null);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showBalance, setShowBalance] = useState(true);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState('expense');
  const [showBalanceEdit, setShowBalanceEdit] = useState(false);
  const [newBalance, setNewBalance] = useState('');
  const [loading, setLoading] = useState(true);
  const [monthComparison, setMonthComparison] = useState(null);

  const loadData = useCallback(async (isInitial = false) => {
    try {
      const [budgetData, summaryData, expensesData, cats, historyData] = await Promise.all([
        api.getBudget(),
        api.getSummary(),
        api.getExpenses({ limit: 6 }),
        api.getCategories(),
        api.getHistory(2),
      ]);
      setBalance(budgetData?.balance ?? 0);
      setSummary(summaryData);
      setRecentExpenses(expensesData?.expenses || []);
      setCategories(cats || []);

      // Calculate month comparison
      if (historyData && historyData.length >= 2) {
        const current = historyData[0];
        const previous = historyData[1];
        const diff = current.totalExpenses - previous.totalExpenses;
        const percentage = previous.totalExpenses > 0
          ? ((diff / previous.totalExpenses) * 100).toFixed(1)
          : 0;
        setMonthComparison({
          currentTotal: current.totalExpenses,
          previousTotal: previous.totalExpenses,
          diff,
          percentage: parseFloat(percentage),
          currentLabel: current.cycleKey,
          previousLabel: previous.cycleKey,
        });
      } else if (historyData && historyData.length === 1) {
        setMonthComparison({
          currentTotal: historyData[0].totalExpenses,
          previousTotal: 0,
          diff: historyData[0].totalExpenses,
          percentage: 0,
          currentLabel: historyData[0].cycleKey,
          previousLabel: null,
        });
      }
    } catch (err) {
      console.warn('[Dashboard] loadData error:', err);
      if (isInitial) toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);

    const unsubSync = syncEvents.on('syncComplete', () => loadData(false));
    const unsubPending = syncEvents.on('pendingChange', () => loadData(false));

    return () => {
      unsubSync();
      unsubPending();
    };
  }, [loadData]);

  // Pull to refresh
  const handlePullRefresh = useCallback(async () => {
    await sync();
    await loadData(false);
  }, [loadData]);

  const { pullDistance, isRefreshing, isReady } = usePullToRefresh(handlePullRefresh);

  const handleBalanceUpdate = async () => {
    const val = parseFloat(newBalance);
    if (isNaN(val)) return;
    try {
      await api.updateBudget(val);
      setBalance(val);
      setShowBalanceEdit(false);
      toast.success('Solde mis à jour');
    } catch {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const handleOpenAdd = (type = 'expense') => {
    if (navigator.vibrate) navigator.vibrate(10);
    setModalInitialTab(type);
    setShowExpenseModal(true);
  };

  const toggleBalance = (e) => {
    e.stopPropagation();
    if (navigator.vibrate) navigator.vibrate(8);
    setShowBalance(s => !s);
  };

  // Get user initials for avatar
  const displayName = user?.displayName || user?.username || 'Adam';
  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'AD';

  return (
    <div className="dashboard-container">
      <PullToRefresh pullDistance={pullDistance} isRefreshing={isRefreshing} isReady={isReady} />

      {/* Top Header with Avatar & Settings (add.webp backdrop) */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'var(--bg-elevated)',
              border: '1.5px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.95rem',
              color: 'var(--gold-light)',
              cursor: 'pointer',
            }}
            onClick={() => navigate('/settings')}
            title="Mon profil & Réglages"
          >
            {initials}
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--gold-light)', fontWeight: 500 }}>
              Bonjour,
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', margin: 0, lineHeight: 1.2 }}>
              {displayName}
            </h2>
          </div>
        </div>

        <button
          className="btn btn-ghost btn-sm"
          style={{ width: 40, height: 40, padding: 0, borderRadius: '50%', border: '1px solid var(--border)' }}
          onClick={() => navigate('/settings')}
          aria-label="Réglages"
        >
          <Settings size={18} color="var(--text-secondary)" />
        </button>
      </div>

      {/* Wallet Hero Card with gold dashed border (wallet.webp) */}
      <div className="wallet-hero-card" id="balance-card">
        <div className="wallet-card-header">
          <div className="wallet-card-chip">
            <CreditCard size={18} color="var(--gold-light)" />
            <span>Portefeuille principal</span>
          </div>
          <button
            onClick={toggleBalance}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
            aria-label="Afficher ou masquer le solde"
          >
            {showBalance ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <div className="wallet-available-label">Solde disponible</div>

        <div className="wallet-balance-row">
          {showBalance ? (
            <>
              <div className="wallet-balance-amount">
                {formatMoney(balance ?? 0)}
              </div>
              <button
                className="wallet-edit-btn"
                onClick={() => {
                  setNewBalance(String(balance ?? 0));
                  setShowBalanceEdit(true);
                }}
                title="Modifier le solde"
              >
                <Edit3 size={15} />
              </button>
            </>
          ) : (
            <div className="wallet-balance-amount" style={{ letterSpacing: '0.25em', opacity: 0.7 }}>
              •••••••
            </div>
          )}
        </div>

        {/* Monthly Inflow / Outflow summary */}
        <div className="wallet-flow-row">
          <div className="wallet-flows">
            <div className="wallet-flow-in">
              <ArrowDownLeft size={16} />
              <span>{formatMoney(summary?.todayExpenses !== undefined ? (balance > 0 ? 0 : 0) : 0)}</span>
            </div>
            <div className="wallet-flow-out">
              <ArrowUpRight size={16} />
              <span>{formatMoney(summary?.totalExpenses || 0)}</span>
            </div>
          </div>
          <div className="wallet-cycle-tag">Ce cycle</div>
        </div>
      </div>

      {/* Quick Action Buttons (wallet.webp) */}
      <div className="quick-actions-row">
        <button
          type="button"
          className="quick-action-btn"
          onClick={() => handleOpenAdd('expense')}
        >
          <span style={{ color: '#f87171', fontWeight: 800 }}>−</span> Dépense
        </button>
        <button
          type="button"
          className="quick-action-btn"
          onClick={() => handleOpenAdd('income')}
        >
          <span style={{ color: '#34d399', fontWeight: 800 }}>+</span> Revenu
        </button>
        <button
          type="button"
          className="quick-action-btn quick-action-btn--gold"
          onClick={() => navigate('/analytics')}
        >
          <span>⇄</span> Stats
        </button>
      </div>

      {/* Month Comparison Insight Card */}
      {monthComparison && monthComparison.previousLabel && (
        <div className="card mb-4" style={{ padding: '14px 16px', background: 'var(--bg-surface)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {monthComparison.diff > 0 ? (
                <TrendingUp size={18} color="#f87171" />
              ) : (
                <TrendingDown size={18} color="#34d399" />
              )}
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#ffffff' }}>
                Bilan comparatif
              </span>
            </div>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: 8,
                background: monthComparison.diff > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                color: monthComparison.diff > 0 ? '#f87171' : '#34d399',
              }}
            >
              {monthComparison.diff > 0 ? `+${monthComparison.percentage}%` : `${monthComparison.percentage}%`}
            </span>
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 8, marginBottom: 0 }}>
            {monthComparison.diff < 0 ? (
              <span>Vous avez économisé <strong>{formatMoney(Math.abs(monthComparison.diff))}</strong> par rapport au cycle dernier.</span>
            ) : monthComparison.diff > 0 ? (
              <span>Vous avez dépensé <strong>{formatMoney(monthComparison.diff)}</strong> de plus que le cycle dernier.</span>
            ) : (
              <span>Niveau de dépenses identique au cycle précédent.</span>
            )}
          </p>
        </div>
      )}

      {/* Recent Activities Section (wallet.webp) */}
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
          Activités récentes
        </h3>
        {recentExpenses.length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '0.82rem', padding: '4px 8px', color: 'var(--gold-light)', border: 'none' }}
            onClick={() => navigate('/expenses')}
          >
            Voir tout <ArrowRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          </button>
        )}
      </div>

      {recentExpenses.length === 0 ? (
        <div className="card text-center py-5" style={{ background: 'var(--bg-surface)' }}>
          <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Aucune activité récente</p>
          <button
            className="btn btn-primary btn-sm mt-2"
            onClick={() => handleOpenAdd('expense')}
            style={{ margin: '8px auto 0' }}
          >
            <Plus size={16} /> Ajouter une opération
          </button>
        </div>
      ) : (
        <ReceiptCard
          title="Dernières écritures"
          subtitle={`${recentExpenses.length} transactions`}
          hasSawtooth={true}
        >
          {recentExpenses.map(exp => {
            const isIncome = exp.type === 'income';
            return (
              <div
                key={exp.id}
                className="receipt-item"
                onClick={() => navigate('/expenses')}
              >
                <div
                  className="squircle-badge"
                  style={{
                    background: isIncome ? 'rgba(16, 185, 129, 0.15)' : `${exp.category_color || '#64748b'}25`,
                    color: isIncome ? '#10b981' : (exp.category_color || '#475569'),
                  }}
                >
                  <span>{isIncome ? '💵' : getCatEmoji(exp.category_icon)}</span>
                </div>
                <div className="receipt-item-info">
                  <div className="receipt-item-title">
                    {exp.description || (isIncome ? 'Revenu' : (exp.category_name || 'Dépense'))}
                  </div>
                  <div className="receipt-item-sub">
                    <span>{formatDate(exp.date)}</span>
                    {exp.category_name && <span>· {exp.category_name}</span>}
                  </div>
                </div>
                <div className={`receipt-item-amount ${isIncome ? 'income' : ''}`}>
                  {isIncome ? '+ ' : '− '}{formatMoney(exp.amount)}
                </div>
              </div>
            );
          })}
        </ReceiptCard>
      )}

      {/* Balance Edit Modal */}
      {showBalanceEdit && (
        <div className="modal-overlay" onClick={() => setShowBalanceEdit(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Modifier le solde</h3>
              <button className="modal-close" onClick={() => setShowBalanceEdit(false)}>✕</button>
            </div>
            <div className="input-group">
              <label>Nouveau solde du compte</label>
              <input
                className="input input-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={newBalance}
                onChange={e => setNewBalance(e.target.value)}
                autoFocus
              />
            </div>
            <button
              className="btn btn-block"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#0b131e', fontWeight: 800 }}
              onClick={handleBalanceUpdate}
            >
              Mettre à jour le solde
            </button>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <ExpenseModal
          categories={categories}
          onClose={() => setShowExpenseModal(false)}
          onSaved={() => {
            setShowExpenseModal(false);
            loadData(false);
          }}
        />
      )}
    </div>
  );
}

function getCatEmoji(icon) {
  const m = {
    'shopping-cart':'🛒','car':'🚗','home':'🏠','gamepad-2':'🎮','heart-pulse':'❤️',
    'shirt':'👕','book-open':'📚','utensils':'🍽️','repeat':'🔄','package':'📦',
    'tag':'🏷️','coffee':'☕','gift':'🎁','plane':'✈️','music':'🎵','smartphone':'📱',
    'zap':'⚡','droplet':'💧','baby':'👶','dog':'🐕','dumbbell':'💪','graduation-cap':'🎓',
    'wrench':'🔧','beef':'🥩','fish':'🐟','apple':'🍎'
  };
  return m[icon] || '💰';
}
