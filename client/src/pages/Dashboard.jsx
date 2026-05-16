import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Plus, TrendingDown, Calendar, Wallet, ArrowDownCircle, Edit3 } from 'lucide-react';
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
  const [showBalance, setShowBalance] = useState(true);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showBalanceEdit, setShowBalanceEdit] = useState(false);
  const [newBalance, setNewBalance] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [budgetData, summaryData, expensesData, cats] = await Promise.all([
        api.getBudget(),
        api.getSummary(),
        api.getExpenses({ limit: 5 }),
        api.getCategories(),
      ]);
      setBalance(budgetData.balance);
      setSummary(summaryData);
      setRecentExpenses(expensesData.expenses);
      setCategories(cats);
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
          <button className="balance-toggle" onClick={() => setShowBalance(!showBalance)} style={{ marginLeft: 'auto' }}>
            {showBalance ? <EyeOff size={16} /> : <Eye size={16} />}
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
              <input className="input input-amount" type="number" step="0.01" value={newBalance} onChange={e => setNewBalance(e.target.value)} autoFocus />
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
  };
  return map[icon] || '💰';
}
