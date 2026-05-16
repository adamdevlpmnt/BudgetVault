import React, { useState, useEffect } from 'react';
import { Plus, Edit3, Trash2, X } from 'lucide-react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

const COLORS = ['#ef4444','#f97316','#f59e0b','#84cc16','#10b981','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#ec4899','#64748b','#78716c'];
const ICONS = ['shopping-cart','beef','fish','apple','car','home','gamepad-2','heart-pulse','shirt','book-open','utensils','repeat','package','coffee','gift','plane','music','smartphone','zap','droplet','baby','dog','dumbbell','graduation-cap','wrench','tag'];

const EMOJI_MAP = { 'shopping-cart':'🛒','car':'🚗','home':'🏠','gamepad-2':'🎮','heart-pulse':'❤️','shirt':'👕','book-open':'📚','utensils':'🍽️','repeat':'🔄','package':'📦','tag':'🏷️','coffee':'☕','gift':'🎁','plane':'✈️','music':'🎵','smartphone':'📱','zap':'⚡','droplet':'💧','baby':'👶','dog':'🐕','dumbbell':'💪','graduation-cap':'🎓','wrench':'🔧','beef':'🥩','fish':'🐟','apple':'🍎' };

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#6366f1', icon: 'tag' });

  useEffect(() => { loadCategories(); }, []);

  const loadCategories = async () => {
    try {
      const cats = await api.getCategories();
      setCategories(cats);
    } catch { toast.error('Erreur'); }
    finally { setLoading(false); }
  };

  const openNew = () => { setEditCat(null); setForm({ name: '', color: '#6366f1', icon: 'tag' }); setShowModal(true); };
  const openEdit = (cat) => { setEditCat(cat); setForm({ name: cat.name, color: cat.color, icon: cat.icon }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nom requis'); return; }
    try {
      if (editCat) { await api.updateCategory(editCat.id, form); toast.success('Modifiée'); }
      else { await api.createCategory(form); toast.success('Créée'); }
      setShowModal(false);
      loadCategories();
    } catch { toast.error('Erreur'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette catégorie ?')) return;
    try { await api.deleteCategory(id); toast.success('Supprimée'); loadCategories(); }
    catch { toast.error('Erreur'); }
  };

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Catégories</h1>
          <p className="page-subtitle">{categories.length} catégorie{categories.length > 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={18} /> Ajouter</button>
      </div>

      <div className="card">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 52, marginBottom: 8, borderRadius: 10 }} />)
        ) : categories.map(cat => (
          <div key={cat.id} className="expense-item" style={{ cursor: 'pointer' }} onClick={() => openEdit(cat)}>
            <div className="expense-icon" style={{ background: cat.color + '25' }}>
              <span style={{ fontSize: '1.2rem' }}>{EMOJI_MAP[cat.icon] || '🏷️'}</span>
            </div>
            <div className="expense-info">
              <div className="expense-desc">{cat.name}</div>
              <div className="expense-meta flex items-center gap-2">
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color, display: 'inline-block' }} />
                {cat.icon}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost btn-sm" style={{ padding: 6, minHeight: 'auto' }} onClick={e => { e.stopPropagation(); handleDelete(cat.id); }}>
                <Trash2 size={16} color="var(--danger)" />
              </button>
            </div>
          </div>
        ))}
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
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Alimentation" />
            </div>

            <div className="input-group">
              <label>Couleur</label>
              <div className="color-grid">
                {COLORS.map(c => (
                  <button key={c} className={`color-swatch ${form.color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setForm(f => ({ ...f, color: c }))} />
                ))}
              </div>
            </div>

            <div className="input-group">
              <label>Icône</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ICONS.map(ic => (
                  <button key={ic} className={`category-chip ${form.icon === ic ? 'selected' : ''}`} style={{ padding: '8px 10px', minWidth: 'auto' }} onClick={() => setForm(f => ({ ...f, icon: ic }))}>
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
