import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Search, X, Image } from 'lucide-react';
import { api } from '../utils/api';
import { formatMoney, formatDate } from '../utils/format';
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
  const [offset, setOffset] = useState(0);
  const [lightboxImage, setLightboxImage] = useState(null);
  const limit = 20;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit, offset };
      if (filterCat) params.categoryId = filterCat;
      const [data, cats] = await Promise.all([api.getExpenses(params), api.getCategories()]);
      setExpenses(data.expenses);
      setTotal(data.total);
      setCategories(cats);
    } catch { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, [filterCat, offset]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette dépense ?')) return;
    try {
      await api.deleteExpense(id);
      toast.success('Dépense supprimée');
      loadData();
    } catch { toast.error('Erreur'); }
  };

  const handleSaved = () => {
    setShowModal(false);
    setEditExpense(null);
    loadData();
    toast.success(editExpense ? 'Dépense modifiée' : 'Dépense ajoutée');
  };

  const openReceipt = (e, receiptUrl) => {
    e.stopPropagation();
    setLightboxImage(receiptUrl);
  };

  const apiBase = import.meta.env.DEV ? 'http://localhost:3001' : '';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dépenses</h1>
        <p className="page-subtitle">{total} transaction{total > 1 ? 's' : ''}</p>
      </div>

      {/* Category Filter */}
      <div className="filter-bar mb-4">
        <button className={`filter-chip ${!filterCat ? 'active' : ''}`} onClick={() => { setFilterCat(''); setOffset(0); }}>
          Toutes
        </button>
        {categories.map(c => (
          <button key={c.id} className={`filter-chip ${filterCat == c.id ? 'active' : ''}`}
            onClick={() => { setFilterCat(c.id); setOffset(0); }}
            style={filterCat == c.id ? { background: c.color, borderColor: c.color } : {}}>
            {c.name}
          </button>
        ))}
      </div>

      {/* Expense List */}
      <div className="card">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="expense-item">
              <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 12 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ width: '60%', height: 16, marginBottom: 6 }} />
                <div className="skeleton" style={{ width: '40%', height: 12 }} />
              </div>
            </div>
          ))
        ) : expenses.length === 0 ? (
          <div className="empty-state">
            <Search size={40} />
            <p>Aucune dépense trouvée</p>
          </div>
        ) : (
          expenses.map(exp => (
            <div key={exp.id} className="expense-item" onClick={() => { setEditExpense(exp); setShowModal(true); }}>
              <div className="expense-icon" style={{ background: (exp.category_color || '#64748b') + '20' }}>
                <span style={{ fontSize: '1.2rem' }}>{getEmoji(exp.category_icon)}</span>
              </div>
              <div className="expense-info">
                <div className="expense-desc">{exp.description || exp.category_name || 'Dépense'}</div>
                <div className="expense-meta">
                  {formatDate(exp.date)}
                  {exp.category_name && ` • ${exp.category_name}`}
                  {exp.receipt_image && ' 📎'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {exp.receipt_image && (
                  <img
                    src={exp.receipt_image.startsWith('/uploads/') ? `${apiBase}${exp.receipt_image}` : `${apiBase}/uploads/${exp.receipt_image}`}
                    alt="Ticket"
                    className="receipt-badge"
                    onClick={(e) => openReceipt(e, exp.receipt_image.startsWith('/uploads/') ? `${apiBase}${exp.receipt_image}` : `${apiBase}/uploads/${exp.receipt_image}`)}
                  />
                )}
                <span className="expense-amount">-{formatMoney(exp.amount)}</span>
                <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); handleDelete(exp.id); }} style={{ padding: 6, minHeight: 'auto' }}>
                  <Trash2 size={16} color="var(--danger)" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex justify-between mt-3 gap-2">
          <button className="btn btn-ghost btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
            ← Précédent
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', alignSelf: 'center' }}>
            {offset + 1}-{Math.min(offset + limit, total)} / {total}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
            Suivant →
          </button>
        </div>
      )}

      <button className="fab" onClick={() => { setEditExpense(null); setShowModal(true); }}>
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
  const m = { 'shopping-cart':'🛒','car':'🚗','home':'🏠','gamepad-2':'🎮','heart-pulse':'❤️','shirt':'👕','book-open':'📚','utensils':'🍽️','repeat':'🔄','package':'📦','tag':'🏷️','beef':'🥩','fish':'🐟','apple':'🍎' };
  return m[icon] || '💰';
}
