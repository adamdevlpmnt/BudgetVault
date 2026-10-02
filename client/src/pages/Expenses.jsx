import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, X, Trash2, Camera, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { offlineApi as api } from '../utils/offlineApi.js';
import { formatMoney, formatDate, today } from '../utils/format';
import { sync, syncEvents } from '../utils/syncEngine.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import PullToRefresh from '../components/PullToRefresh.jsx';
import ReceiptCard from '../components/ReceiptCard.jsx';
import ExpenseModal from '../components/ExpenseModal.jsx';
import toast from 'react-hot-toast';

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editExpense, setEditExpense] = useState(null);
  const [filterType, setFilterType] = useState('all'); // 'all' | 'expense' | 'income'
  const [filterCat, setFilterCat] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxImage, setLightboxImage] = useState(null);

  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial && expenses.length === 0) setLoading(true);
    try {
      const params = { limit: 300, offset: 0 };
      if (filterCat) params.categoryId = filterCat;
      const [data, cats] = await Promise.all([api.getExpenses(params), api.getCategories()]);
      setExpenses(data?.expenses || []);
      setCategories(cats || []);
    } catch (err) {
      console.warn('[Expenses] loadData error:', err);
      if (isInitial) toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [filterCat, expenses.length]);

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

  const handleDelete = async (e, id, type) => {
    e.stopPropagation();
    const label = type === 'income' ? 'ce revenu' : 'cette dépense';
    if (!confirm(`Supprimer ${label} ?`)) return;
    try {
      if (navigator.vibrate) navigator.vibrate(20);
      await api.deleteExpense(id);
      toast.success('Transaction supprimée');
      loadData(false);
    } catch {
      toast.error('Erreur');
    }
  };

  const handleSaved = () => {
    setEditExpense(null);
    loadData(false);
  };

  const openReceipt = (e, receiptUrl) => {
    e.stopPropagation();
    setLightboxImage(receiptUrl);
  };

  // Filtered expenses based on search, type, and category
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      if (filterType === 'expense' && exp.type === 'income') return false;
      if (filterType === 'income' && exp.type !== 'income') return false;
      if (filterCat && exp.category_id !== parseInt(filterCat)) return false;

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

  // Group expenses by date (for receipt card look)
  const groupedByDate = useMemo(() => {
    const todayStr = today();
    const yesterdayDate = new Date(Date.now() - 86400000);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    const groups = {};
    for (const exp of filteredExpenses) {
      const d = exp.date || 'Non daté';
      if (!groups[d]) {
        let label = d;
        if (d === todayStr) label = "Aujourd'hui";
        else if (d === yesterdayStr) label = 'Hier';
        else {
          try {
            const dt = new Date(d + 'T00:00:00');
            label = dt.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
          } catch {
            label = d;
          }
        }
        groups[d] = { date: d, label, items: [], total: 0 };
      }
      groups[d].items.push(exp);
      if (exp.type === 'income') {
        groups[d].total += exp.amount;
      } else {
        groups[d].total -= exp.amount;
      }
    }

    // Return array sorted by date descending
    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredExpenses]);

  const apiBase = import.meta.env.DEV ? 'http://localhost:3001' : '';

  return (
    <div className="expenses-page">
      <PullToRefresh pullDistance={pullDistance} isRefreshing={isRefreshing} isReady={isReady} />

      {/* Header (activity.webp) */}
      <div className="page-header" style={{ marginBottom: 14 }}>
        <h1 className="page-title" style={{ fontSize: '2rem', fontWeight: 900 }}>Activité</h1>
        <p className="page-subtitle" style={{ color: 'var(--text-muted)' }}>
          {filteredExpenses.length} transaction{filteredExpenses.length > 1 ? 's' : ''}
        </p>
      </div>

      {/* Capsule Search Bar (activity.webp) */}
      <div className="search-capsule">
        <Search size={18} className="search-capsule-icon" />
        <input
          type="text"
          placeholder="Rechercher (courses, restaurant, facture...)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="search-capsule-clear" onClick={() => setSearchQuery('')}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Horizontal Filter Pills (activity.webp) */}
      <div className="filter-pills-row">
        <button
          className={`filter-pill ${filterType === 'all' && !filterCat ? 'active' : ''}`}
          onClick={() => { setFilterType('all'); setFilterCat(''); }}
        >
          Toutes
        </button>
        <button
          className={`filter-pill ${filterType === 'expense' && !filterCat ? 'active' : ''}`}
          onClick={() => { setFilterType('expense'); setFilterCat(''); }}
        >
          Dépenses
        </button>
        <button
          className={`filter-pill ${filterType === 'income' && !filterCat ? 'active' : ''}`}
          onClick={() => { setFilterType('income'); setFilterCat(''); }}
        >
          Revenus
        </button>

        {/* Categories as filter pills */}
        {categories.map(c => (
          <button
            key={c.id}
            className={`filter-pill ${filterCat == c.id ? 'active' : ''}`}
            onClick={() => {
              setFilterCat(filterCat == c.id ? '' : c.id);
            }}
          >
            <span>{getCatEmoji(c.icon)}</span>
            <span>{c.name}</span>
          </button>
        ))}
      </div>

      {/* List of Receipt Cards grouped by Date (activity.webp) */}
      {loading && expenses.length === 0 ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card mb-4" style={{ height: 160 }}>
            <div className="skeleton" style={{ width: '40%', height: 20, marginBottom: 16 }} />
            <div className="skeleton" style={{ width: '100%', height: 40, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: '100%', height: 40 }} />
          </div>
        ))
      ) : groupedByDate.length === 0 ? (
        <div className="card text-center py-6" style={{ background: 'var(--bg-surface)' }}>
          <Search size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 700, fontSize: '1rem', color: '#ffffff' }}>Aucune transaction trouvée</p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {searchQuery ? 'Modifiez votre mot-clé de recherche' : 'Appuyez sur le bouton + pour en ajouter une !'}
          </p>
        </div>
      ) : (
        groupedByDate.map(group => {
          const isNetNegative = group.total < 0;
          const displayTotal = `${isNetNegative ? '− ' : '+ '}${formatMoney(Math.abs(group.total))}`;

          return (
            <ReceiptCard
              key={group.date}
              title={group.label}
              rightText={displayTotal}
              rightColor={isNetNegative ? '#0f172a' : '#10b981'}
              hasSawtooth={true}
            >
              {group.items.map(exp => {
                const isIncome = exp.type === 'income';
                const hasReceipt = !isIncome && !!exp.receipt_image;
                const receiptUrl = hasReceipt
                  ? (exp.receipt_image.startsWith('/uploads/') || exp.receipt_image.startsWith('data:')
                      ? exp.receipt_image
                      : `${apiBase}/uploads/${exp.receipt_image}`)
                  : null;

                // Format time if available from created_at
                let timeStr = '';
                if (exp.created_at) {
                  try {
                    const timeDate = new Date(exp.created_at);
                    if (!isNaN(timeDate.getTime())) {
                      timeStr = timeDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    }
                  } catch { timeStr = ''; }
                }

                return (
                  <div
                    key={exp.id}
                    className="receipt-item"
                    onClick={() => {
                      if (navigator.vibrate) navigator.vibrate(8);
                      setEditExpense(exp);
                    }}
                  >
                    {/* Squircle Badge */}
                    <div
                      className="squircle-badge"
                      style={{
                        background: isIncome ? 'rgba(16, 185, 129, 0.15)' : `${exp.category_color || '#64748b'}25`,
                        color: isIncome ? '#10b981' : (exp.category_color || '#475569'),
                      }}
                    >
                      <span>{isIncome ? '💵' : getCatEmoji(exp.category_icon)}</span>
                    </div>

                    {/* Info */}
                    <div className="receipt-item-info">
                      <div className="receipt-item-title">
                        {exp.description || (isIncome ? 'Revenu' : (exp.category_name || 'Dépense'))}
                      </div>
                      <div className="receipt-item-sub">
                        <span>{isIncome ? 'Revenu' : (exp.category_name || 'Autre')}</span>
                        {exp.note && <span>· {exp.note}</span>}
                        {timeStr && <span>· {timeStr}</span>}
                        {hasReceipt && (
                          <span
                            onClick={(e) => openReceipt(e, receiptUrl)}
                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', color: '#6366f1' }}
                            title="Voir le reçu"
                          >
                            📎
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Amount & Delete */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className={`receipt-item-amount ${isIncome ? 'income' : ''}`}>
                        {isIncome ? '+ ' : '− '}{formatMoney(exp.amount)}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => handleDelete(e, exp.id, exp.type)}
                        style={{ padding: 4, minHeight: 'auto', border: 'none', color: '#94a3b8' }}
                        title="Supprimer"
                      >
                        <Trash2 size={15} color="#ef4444" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </ReceiptCard>
          );
        })
      )}

      {/* Edit Modal */}
      {editExpense && (
        <ExpenseModal
          categories={categories}
          expense={editExpense}
          onClose={() => setEditExpense(null)}
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
