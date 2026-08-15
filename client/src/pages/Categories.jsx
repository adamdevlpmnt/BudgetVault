import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit3, Trash2, X } from 'lucide-react';
import { offlineApi as api } from '../utils/offlineApi.js';
import { sync, syncEvents } from '../utils/syncEngine.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import PullToRefresh from '../components/PullToRefresh.jsx';
import toast from 'react-hot-toast';

const COLORS = ['#ef4444','#f97316','#f59e0b','#84cc16','#10b981','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#ec4899','#64748b','#78716c'];
const ICONS = ['shopping-cart','beef','fish','apple','car','home','gamepad-2','heart-pulse','shirt','book-open','utensils','repeat','package','coffee','gift','plane','music','smartphone','zap','droplet','baby','dog','dumbbell','graduation-cap','wrench','tag'];

const EMOJI_MAP = {
  'shopping-cart':'🛒','car':'🚗','home':'🏠','gamepad-2':'🎮','heart-pulse':'❤️',
  'shirt':'👕','book-open':'📚','utensils':'🍽️','repeat':'🔄','package':'📦',
  'tag':'🏷️','coffee':'☕','gift':'🎁','plane':'✈️','music':'🎵','smartphone':'📱',
  'zap':'⚡','droplet':'💧','baby':'👶','dog':'🐕','dumbbell':'💪','graduation-cap':'🎓',
  'wrench':'🔧','beef':'🥩','fish':'🐟','apple':'🍎'
};

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#6366f1', icon: 'tag' });

  const loadCategories = useCallback(async (isInitial = false) => {
    if (isInitial && categories.length === 0) setLoading(true);
    try {
      const cats = await api.getCategories();
      setCategories(cats || []);
    } catch (err) {
      console.warn('[Categories] loadCategories error:', err);
      if (isInitial) toast.error('Erreur');
    } finally {
      setLoading(false);
    }
  }, [categories.length]);

  useEffect(() => {
    loadCategories(true);

    const unsubSync = syncEvents.on('syncComplete', () => loadCategories(false));
    const unsubPending = syncEvents.on('pendingChange', () => loadCategories(false));

    return () => {
      unsubSync();
      unsubPending();
    };
  }, [loadCategories]);

  // Mobile pull to refresh
  const handlePullRefresh = useCallback(async () => {
    await sync();
    await loadCategories(false);
  }, [loadCategories]);

  const { pullDistance, isRefreshing, isReady } = usePullToRefresh(handlePullRefresh);

  const openNew = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    setEditCat(null);
    setForm({ name: '', color: '#6366f1', icon: 'tag' });
    setShowModal(true);
  };

  const openEdit = (cat) => {
    if (navigator.vibrate) navigator.vibrate(10);
    setEditCat(cat);
    setForm({ name: cat.name, color: cat.color, icon: cat.icon });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nom requis'); return; }
    try {
      if (navigator.vibrate) navigator.vibrate(15);
      if (editCat) {
        await api.updateCategory(editCat.id, form);
        toast.success('Catégorie modifiée');
      } else {
        await api.createCategory(form);
        toast.success('Catégorie créée');
      }
      setShowModal(false);
      loadCategories(false);
    } catch { toast.error('Erreur'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette catégorie ?')) return;
    try {
      if (navigator.vibrate) navigator.vibrate(20);
      await api.deleteCategory(id);
      toast.success('Supprimée');
      loadCategories(false);
    } catch { toast.error('Erreur'); }
  };

  return (
    <div className="categories-container">
      <PullToRefresh pullDistance={pullDistance} isRefreshing={isRefreshing} isReady={isReady} />

      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Catégories</h1>
          <p className="page-subtitle">{categories.length} catégorie{categories.length > 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={18} /> Ajouter</button>
      </div>

      <div className="card">
        {loading && categories.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 52, marginBottom: 8, borderRadius: 10 }} />)
        ) : categories.length === 0 ? (
          <div className="empty-state"><p>Aucune catégorie configurée</p></div>
        ) : (
          categories.map(cat => (
            <div key={cat.id} className="expense-item active-item" style={{ cursor: 'pointer' }} onClick={() => openEdit(cat)}>
              <div className="expense-icon" style={{ background: (cat.color || '#6366f1') + '25' }}>
                <span style={{ fontSize: '1.2rem' }}>{EMOJI_MAP[cat.icon] || '🏷️'}</span>
              </div>
              <div className="expense-info">
                <div className="expense-desc">{cat.name}</div>
                <div className="expense-meta flex items-center gap-2">
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color || '#6366f1', display: 'inline-block' }} />
                  {cat.icon}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-ghost btn-sm" style={{ padding: 6, minHeight: 'auto' }} onClick={e => { e.stopPropagation(); handleDelete(cat.id); }}>
                  <Trash2 size={16} color="var(--danger)" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editCat ? 'Modifier' : 'Nouvelle catégorie'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>

            <div className="input-group">
              <label>Nom</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Alimentation" autoFocus />
            </div>

            <div className="input-group">
              <label>Couleur</label>
              <div className="color-grid">
                {COLORS.map(c => (
                  <button key={c} type="button" className={`color-swatch ${form.color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setForm(f => ({ ...f, color: c }))} />
                ))}
              </div>
            </div>

            <div className="input-group">
              <label>Icône</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ICONS.map(ic => (
                  <button key={ic} type="button" className={`category-chip ${form.icon === ic ? 'selected' : ''}`} style={{ padding: '8px 10px', minWidth: 'auto' }} onClick={() => setForm(f => ({ ...f, icon: ic }))}>
                    <span style={{ fontSize: '1.2rem' }}>{EMOJI_MAP[ic] || '🏷️'}</span>
                  </button>
                ))}
              </div>
            </div>

            <button className="btn btn-primary btn-block mt-3" onClick={handleSave}>
              {editCat ? 'Modifier' : 'Créer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
