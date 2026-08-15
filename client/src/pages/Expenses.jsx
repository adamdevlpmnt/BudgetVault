import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, Search, X, Image, ArrowDownCircle, ArrowUpCircle, Filter } from 'lucide-react';
import { offlineApi as api } from '../utils/offlineApi.js';
import { formatMoney, formatDate } from '../utils/format';
import { sync, syncEvents } from '../utils/syncEngine.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import PullToRefresh from '../components/PullToRefresh.jsx';
import toast from 'react-hot-toast';
import ExpenseModal from '../components/ExpenseModal';

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editExpense, setEditExpense] = useState(null);
  const [filterCat, setFilterCat] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'expense' | 'income'
  const [searchQuery, setSearchQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [lightboxImage, setLightboxImage] = useState(null);
  const limit = 50;

  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial && expenses.length === 0) setLoading(true);
    try {
      const params = { limit: 200, offset: 0 };
      if (filterCat) params.categoryId = filterCat;
      const [data, cats] = await Promise.all([api.getExpenses(params), api.getCategories()]);
      setExpenses(data?.expenses || []);
      setTotal(data?.total || (data?.expenses || []).length);
      setCategories(cats || []);
    } catch (err) {
      console.warn('[Expenses] loadData error:', err);
      if (isInitial) toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [filterCat]);

  useEffect(() => {
    loadData(true);

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

  const handleDelete = async (id, type) => {
    const label = type === 'income' ? 'ce revenu' : 'cette dépense';
    if (!confirm(`Supprimer ${label} ?`)) return;
    try {
      if (navigator.vibrate) navigator.vibrate(20);
      await api.deleteExpense(id);
      toast.success(type === 'income' ? 'Revenu supprimé' : 'Dépense supprimée');
      loadData(false);
    } catch { toast.error('Erreur'); }
  };

  const handleSaved = () => {
    setShowModal(false);
    setEditExpense(null);
    loadData(false);
    toast.success(editExpense ? 'Entrée modifiée' : 'Entrée ajoutée');
  };

  const openReceipt = (e, receiptUrl) => {
    e.stopPropagation();
    setLightboxImage(receiptUrl);
  };

  // Filtered expenses based on search, type, and category
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      // Type filter
      if (filterType === 'expense' && exp.type === 'income') return false;
      if (filterType === 'income' && exp.type !== 'income') return false;

      // Category filter (if not already handled)
      if (filterCat && exp.category_id !== parseInt(filterCat)) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const desc = (exp.description || '').toLowerCase();
        const note = (exp.note || '').toLowerCase();
        const cat = (exp.category_name || '').toLowerCase();
        const amountStr = String(exp.amount || '');
        if (!desc.includes(q) && !note.includes(q) && !cat.includes(q) && !amountStr.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [expenses, filterType, filterCat, searchQuery]);

  // Calculate totals for filtered items
  const { filteredExpenseTotal, filteredIncomeTotal } = useMemo(() => {
    let expTotal = 0;
    let incTotal = 0;
    for (const exp of filteredExpenses) {
      if (exp.type === 'income') {
        incTotal += exp.amount;
      } else {
        expTotal += exp.amount;
      }
    }
    return { filteredExpenseTotal: expTotal, filteredIncomeTotal: incTotal };
  }, [filteredExpenses]);

  const apiBase = import.meta.env.DEV ? 'http://localhost:3001' : '';

  return (
    <div className="expenses-container">
      <PullToRefresh pullDistance={pullDistance} isRefreshing={isRefreshing} isReady={isReady} />

      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-subtitle">{filteredExpenses.length} transaction{filteredExpenses.length > 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="search-bar-container mb-3">
        <Search size={18} className="search-icon" />
        <input
          type="text"
          className="search-input"
          placeholder="Rechercher (courses, salaire, resto...)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Type Tabs */}
      <div className="type-toggle-tabs mb-3">
        <button
          className={`type-tab ${filterType === 'all' ? 'active' : ''}`}
          onClick={() => setFilterType('all')}
        >
          Toutes
        </button>
        <button
          className={`type-tab ${filterType === 'expense' ? 'active expense-tab' : ''}`}
          onClick={() => setFilterType('expense')}
        >
          <ArrowDownCircle size={14} /> Dépenses
        </button>
        <button
          className={`type-tab ${filterType === 'income' ? 'active income-tab' : ''}`}
          onClick={() => setFilterType('income')}
        >
          <ArrowUpCircle size={14} /> Revenus
        </button>
      </div>

      {/* Category Filter */}
      {filterType !== 'income' && categories.length > 0 && (
        <div className="filter-bar mb-3">
          <button className={`filter-chip ${!filterCat ? 'active' : ''}`} onClick={() => { setFilterCat(''); setOffset(0); }}>
            Toutes
          </button>
          {categories.map(c => (
            <button key={c.id} className={`filter-chip ${filterCat == c.id ? 'active' : ''}`}
              onClick={() => { setFilterCat(filterCat == c.id ? '' : c.id); setOffset(0); }}
              style={filterCat == c.id ? { background: c.color, borderColor: c.color } : {}}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Summary totals badge */}
      <div className="filtered-summary-banner mb-3">
        {filterType !== 'income' && (
          <div className="filtered-stat">
            <span className="label">Dépenses</span>
            <span className="val expense-val">-{formatMoney(filteredExpenseTotal)}</span>
          </div>
        )}
        {filterType !== 'expense' && (
          <div className="filtered-stat">
            <span className="label">Revenus</span>
            <span className="val income-val">+{formatMoney(filteredIncomeTotal)}</span>
          </div>
        )}
      </div>

      {/* Expense List */}
      <div className="card">
        {loading && expenses.length === 0 ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="expense-item">
              <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 12 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ width: '60%', height: 16, marginBottom: 6 }} />
                <div className="skeleton" style={{ width: '40%', height: 12 }} />
              </div>
            </div>
          ))
        ) : filteredExpenses.length === 0 ? (
          <div className="empty-state">
            <Search size={40} />
            <p>Aucune transaction trouvée</p>
            {searchQuery && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Essayez un autre mot-clé</p>}
          </div>
        ) : (
          filteredExpenses.map(exp => {
            const isIncome = exp.type === 'income';
            return (
              <div
                key={exp.id}
                className="expense-item active-item"
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(10);
                  setEditExpense(exp);
                  setShowModal(true);
                }}
              >
                <div className="expense-icon" style={{ background: isIncome ? 'rgba(16,185,129,0.15)' : (exp.category_color || '#64748b') + '20' }}>
                  <span style={{ fontSize: '1.2rem' }}>{isIncome ? '💵' : getEmoji(exp.category_icon)}</span>
                </div>
                <div className="expense-info">
                  <div className="expense-desc">{exp.description || (isIncome ? 'Revenu' : (exp.category_name || 'Dépense'))}</div>
                  <div className="expense-meta">
                    {formatDate(exp.date)}
                    {isIncome ? ' • Revenu' : (exp.category_name && ` • ${exp.category_name}`)}
                    {exp.note && ` • 📝 ${exp.note}`}
                    {!isIncome && exp.receipt_image && ' 📎'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {!isIncome && exp.receipt_image && (
                    <img
                      src={exp.receipt_image.startsWith('/uploads/') || exp.receipt_image.startsWith('data:') ? exp.receipt_image : `${apiBase}/uploads/${exp.receipt_image}`}
                      alt="Ticket"
                      className="receipt-badge"
                      onClick={(e) => openReceipt(e, exp.receipt_image.startsWith('/uploads/') || exp.receipt_image.startsWith('data:') ? exp.receipt_image : `${apiBase}/uploads/${exp.receipt_image}`)}
                    />
                  )}
                  <span className={`expense-amount ${isIncome ? 'income' : ''}`}>{isIncome ? '+' : '-'}{formatMoney(exp.amount)}</span>
                  <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); handleDelete(exp.id, exp.type); }} style={{ padding: 6, minHeight: 'auto' }}>
                    <Trash2 size={16} color="var(--danger)" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button className="fab" onClick={() => {
        if (navigator.vibrate) navigator.vibrate(15);
        setEditExpense(null);
        setShowModal(true);
      }}>
        <Plus size={28} />
      </button>

      {showModal && (
        <ExpenseModal
          categories={categories}
          expense={editExpense}
          onClose={() => { setShowModal(false); setEditExpense(null); }}
          onSaved={handleSaved}
        />
      )}

      {/* Receipt Lightbox */}
      {lightboxImage && (
        <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <button className="lightbox-close" onClick={() => setLightboxImage(null)}>
            <X size={24} />
          </button>
          <img
            src={lightboxImage}
            alt="Ticket de caisse"
            className="lightbox-image"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function getEmoji(icon) {
  const m = {
    'shopping-cart':'🛒','car':'🚗','home':'🏠','gamepad-2':'🎮','heart-pulse':'❤️',
    'shirt':'👕','book-open':'📚','utensils':'🍽️','repeat':'🔄','package':'📦',
    'tag':'🏷️','beef':'🥩','fish':'🐟','apple':'🍎','coffee':'☕','gift':'🎁',
    'plane':'✈️','music':'🎵','smartphone':'📱','zap':'⚡','droplet':'💧',
    'baby':'👶','dog':'🐕','dumbbell':'💪','graduation-cap':'🎓','wrench':'🔧'
  };
  return m[icon] || '💰';
}
