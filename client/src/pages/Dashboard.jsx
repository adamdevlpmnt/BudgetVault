import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Plus, Wallet, ArrowDownCircle, Edit3, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { api } from '../utils/api';
import { formatMoney, formatDate, today } from '../utils/format';
import { useAuth } from '../context/AuthContext';
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

  const loadData = useCallback(async () => {
    try {
      const [budgetData, summaryData, expensesData, cats, historyData] = await Promise.all([
        api.getBudget(),
        api.getSummary(),
        api.getExpenses({ limit: 5 }),
        api.getCategories(),
        api.getHistory(2),
      ]);
      setBalance(budgetData.balance);
      setSummary(summaryData);
      setRecentExpenses(expensesData.expenses);
      setCategories(cats);

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
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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

  const handleExpenseAdded = () => {
    setShowExpenseModal(false);
    loadData();
    toast.success('Dépense ajoutée');
  };

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ height: 160, borderRadius: 20, marginBottom: 16 }} />
        <div className="stats-grid">
          <div className="skeleton" style={{ height: 90, borderRadius: 10 }} />
          <div className="skeleton" style={{ height: 90, borderRadius: 10 }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Bonjour,</div>
          <h1 className="page-title">{user?.displayName || user?.username} 👋</h1>
        </div>
      </div>

      {/* Balance Card */}
      <div className="balance-card" id="balance-card">
        <div className="balance-label">
          <Wallet size={16} />
          <span>Solde du compte</span>
          <button className="balance-toggle" onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setShowBalance(s => !s); }} style={{ marginLeft: 'auto' }}>
            {showBalance ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {showBalance ? (
          <div className={`balance-amount ${balance < 0 ? 'negative' : ''}`} onClick={() => { setNewBalance(String(balance || 0)); setShowBalanceEdit(true); }} style={{ cursor: 'pointer' }}>
            {formatMoney(balance)}
            <Edit3 size={16} style={{ marginLeft: 8, opacity: 0.5, verticalAlign: 'middle' }} />
          </div>
        ) : (
          <div className="balance-hidden">• • • • •</div>
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

      {/* Recent Expenses */}
      <div className="section-title mt-4">Dernières dépenses</div>
      <div className="card">
        {recentExpenses.length === 0 ? (
          <div className="empty-state">
            <ArrowDownCircle size={40} />
            <p>Aucune dépense</p>
            <p style={{ fontSize: '0.8rem', marginTop: 4 }}>Ajoutez votre première dépense !</p>
          </div>
        ) : (
          recentExpenses.map(exp => (
            <div key={exp.id} className="expense-item" onClick={() => navigate('/expenses')}>
              <div className="expense-icon" style={{ background: (exp.category_color || '#64748b') + '20' }}>
                <span style={{ fontSize: '1.2rem' }}>
                  {getCategoryEmoji(exp.category_icon)}
                </span>
              </div>
              <div className="expense-info">
                <div className="expense-desc">{exp.description || exp.category_name || 'Dépense'}</div>
                <div className="expense-meta">{formatDate(exp.date)} • {exp.category_name || 'Sans catégorie'}</div>
              </div>
              <div className="expense-amount">-{formatMoney(exp.amount)}</div>
            </div>
          ))
        )}
        {recentExpenses.length > 0 && (
          <button className="btn btn-ghost btn-block btn-sm mt-3" onClick={() => navigate('/expenses')}>
            Voir tout
          </button>
        )}
      </div>

      {/* FAB */}
      <button className="fab" onClick={() => setShowExpenseModal(true)} id="add-expense-fab">
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
