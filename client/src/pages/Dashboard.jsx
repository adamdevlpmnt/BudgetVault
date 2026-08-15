import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Plus, Wallet, ArrowDownCircle, ArrowUpCircle, Edit3, ArrowUpRight, ArrowDownRight, Minus, TrendingUp, Sparkles } from 'lucide-react';
import { offlineApi as api } from '../utils/offlineApi.js';
import { formatMoney, formatDate, today } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { sync, syncEvents } from '../utils/syncEngine.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import PullToRefresh from '../components/PullToRefresh.jsx';
import toast from 'react-hot-toast';
import ExpenseModal from '../components/ExpenseModal';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState(null);
  const [summary, setSummary] = useState(null);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showBalance, setShowBalance] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showBalanceEdit, setShowBalanceEdit] = useState(false);
  const [newBalance, setNewBalance] = useState('');
  const [loading, setLoading] = useState(true);
  const [monthComparison, setMonthComparison] = useState(null);

  const loadData = useCallback(async (isInitial = false) => {
    try {
      const [budgetData, summaryData, expensesData, cats, historyData] = await Promise.all([
        api.getBudget(),
        api.getSummary(),
        api.getExpenses({ limit: 5 }),
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

    // Auto-refresh when background sync completes or local data changes
    const unsubSync = syncEvents.on('syncComplete', () => loadData(false));
    const unsubPending = syncEvents.on('pendingChange', () => loadData(false));

    return () => {
      unsubSync();
      unsubPending();
    };
  }, [loadData]);

  // Mobile pull to refresh
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
    } catch { toast.error('Erreur'); }
  };

  const handleExpenseAdded = (type) => {
    setShowExpenseModal(false);
    loadData(false);
    toast.success(type === 'income' ? 'Revenu ajouté' : 'Dépense ajoutée');
  };

  const toggleBalance = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (navigator.vibrate) navigator.vibrate(10);
    setShowBalance(s => !s);
  };

  return (
    <div className="dashboard-container">
      <PullToRefresh pullDistance={pullDistance} isRefreshing={isRefreshing} isReady={isReady} />

      <div className="page-header flex items-center justify-between">
        <div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Bonjour,</div>
          <h1 className="page-title">{user?.displayName || user?.username} 👋</h1>
        </div>
      </div>

      {/* Balance Card */}
      <div className="balance-card active-card" id="balance-card">
        <div className="balance-label">
          <Wallet size={16} />
          <span>Solde du compte</span>
          <button className="balance-toggle" onPointerDown={toggleBalance} style={{ marginLeft: 'auto' }}>
            {showBalance ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {showBalance ? (
          <div className={`balance-amount ${balance < 0 ? 'negative' : ''}`} onClick={() => { setNewBalance(String(balance ?? 0)); setShowBalanceEdit(true); }} style={{ cursor: 'pointer' }}>
            {formatMoney(balance ?? 0)}
            <Edit3 size={16} style={{ marginLeft: 8, opacity: 0.5, verticalAlign: 'middle' }} />
          </div>
        ) : (
          <div className="balance-hidden" onClick={toggleBalance} style={{ cursor: 'pointer' }}>• • • • •</div>
        )}
      </div>

      {/* Balance Edit Modal */}
      {showBalanceEdit && (
        <div className="modal-overlay" onClick={() => setShowBalanceEdit(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Modifier le solde</h3>
              <button className="modal-close" onClick={() => setShowBalanceEdit(false)}>✕</button>
            </div>
            <div className="input-group">
              <label>Nouveau solde (€)</label>
              <input className="input input-amount" type="number" inputMode="decimal" step="0.01" value={newBalance} onChange={e => setNewBalance(e.target.value)} autoFocus />
            </div>
            <button className="btn btn-primary btn-block" onClick={handleBalanceUpdate}>Mettre à jour</button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--danger-light)' }}>
            {formatMoney(summary?.totalExpenses || 0)}
          </div>
          <div className="stat-label">Ce cycle</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--warning-light)' }}>
            {formatMoney(summary?.todayExpenses || 0)}
          </div>
          <div className="stat-label">Aujourd'hui</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--info)' }}>
            {summary?.expenseCount || 0}
          </div>
          <div className="stat-label">Transactions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--primary-light)' }}>
            {formatMoney(summary?.avgDaily || 0)}
          </div>
          <div className="stat-label">Moy./jour</div>
        </div>
      </div>

      {/* Month Comparison */}
      {monthComparison && monthComparison.previousLabel && (
        <div className="card mt-4" style={{ padding: 16 }}>
          <div className="flex items-center gap-2 mb-2">
            {monthComparison.diff > 0 ? (
              <ArrowUpRight size={18} color="var(--danger-light)" />
            ) : monthComparison.diff < 0 ? (
              <ArrowDownRight size={18} color="var(--success-light)" />
            ) : (
              <Minus size={18} color="var(--text-muted)" />
            )}
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Comparaison mensuelle</span>
          </div>
          <div className="flex items-center justify-between" style={{ gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 4 }}>Mois précédent</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{formatMoney(monthComparison.previousTotal)}</div>
            </div>
            <div style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: '0.85rem',
              fontWeight: 700,
              background: monthComparison.diff > 0 ? 'rgba(239,68,68,0.12)' : monthComparison.diff < 0 ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
              color: monthComparison.diff > 0 ? 'var(--danger-light)' : monthComparison.diff < 0 ? 'var(--success-light)' : 'var(--text-muted)',
            }}>
              {monthComparison.diff > 0 ? '+' : ''}{monthComparison.percentage}%
            </div>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 4 }}>Mois actuel</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{formatMoney(monthComparison.currentTotal)}</div>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            {monthComparison.diff < 0 ? (
              <span style={{ color: 'var(--success-light)' }}>📉 Vous avez économisé {formatMoney(Math.abs(monthComparison.diff))} par rapport au mois dernier</span>
            ) : monthComparison.diff > 0 ? (
              <span style={{ color: 'var(--danger-light)' }}>📈 Vous avez dépensé {formatMoney(monthComparison.diff)} de plus que le mois dernier</span>
            ) : (
              <span>Même niveau de dépenses que le mois dernier</span>
            )}
          </div>
        </div>
      )}

      {/* Recent Activities */}
      <div className="section-title mt-4 flex items-center justify-between">
        <span>Dernières activités</span>
        {recentExpenses.length > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => navigate('/expenses')}>
            Voir tout →
          </button>
        )}
      </div>

      <div className="card">
        {loading && recentExpenses.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="expense-item">
              <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 12 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ width: '60%', height: 16, marginBottom: 6 }} />
                <div className="skeleton" style={{ width: '40%', height: 12 }} />
              </div>
            </div>
          ))
        ) : recentExpenses.length === 0 ? (
          <div className="empty-state">
            <ArrowDownCircle size={40} />
            <p>Aucune activité</p>
            <p style={{ fontSize: '0.8rem', marginTop: 4 }}>Ajoutez votre première entrée !</p>
          </div>
        ) : (
          recentExpenses.map(exp => {
            const isIncome = exp.type === 'income';
            return (
              <div key={exp.id} className="expense-item active-item" onClick={() => navigate('/expenses')}>
                <div className="expense-icon" style={{ background: isIncome ? 'rgba(16,185,129,0.15)' : (exp.category_color || '#64748b') + '20' }}>
                  <span style={{ fontSize: '1.2rem' }}>
                    {isIncome ? '💵' : getCategoryEmoji(exp.category_icon)}
                  </span>
                </div>
                <div className="expense-info">
                  <div className="expense-desc">{exp.description || (isIncome ? 'Revenu' : (exp.category_name || 'Dépense'))}</div>
                  <div className="expense-meta">
                    {formatDate(exp.date)}
                    {isIncome ? ' • Revenu' : (exp.category_name ? ` • ${exp.category_name}` : ' • Sans catégorie')}
                  </div>
                </div>
                <div className={`expense-amount ${isIncome ? 'income' : ''}`}>
                  {isIncome ? '+' : '-'}{formatMoney(exp.amount)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FAB */}
      <button className="fab" onClick={() => {
        if (navigator.vibrate) navigator.vibrate(15);
        setShowExpenseModal(true);
      }} id="add-expense-fab">
        <Plus size={28} />
      </button>

      {showExpenseModal && (
        <ExpenseModal
          categories={categories}
          onClose={() => setShowExpenseModal(false)}
          onSaved={handleExpenseAdded}
        />
      )}
    </div>
  );
}

function getCategoryEmoji(icon) {
  const map = {
    'shopping-cart': '🛒', 'car': '🚗', 'home': '🏠', 'gamepad-2': '🎮',
    'heart-pulse': '❤️', 'shirt': '👕', 'book-open': '📚', 'utensils': '🍽️',
    'repeat': '🔄', 'package': '📦', 'tag': '🏷️', 'help-circle': '❓',
    'coffee': '☕', 'gift': '🎁', 'plane': '✈️', 'music': '🎵',
    'smartphone': '📱', 'zap': '⚡', 'droplet': '💧', 'baby': '👶',
    'dog': '🐕', 'dumbbell': '💪', 'graduation-cap': '🎓', 'wrench': '🔧',
    'beef': '🥩', 'fish': '🐟', 'apple': '🍎',
  };
  return map[icon] || '💰';
}
