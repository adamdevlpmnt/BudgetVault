import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, SlidersHorizontal, Edit3, Trash2, X, Target, Sparkles, Check } from 'lucide-react';
import { offlineApi as api } from '../utils/offlineApi.js';
import { formatMoney } from '../utils/format';
import { sync, syncEvents } from '../utils/syncEngine.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import PullToRefresh from '../components/PullToRefresh.jsx';
import SegmentedProgressBar from '../components/SegmentedProgressBar.jsx';
import GoalCard from '../components/GoalCard.jsx';
import toast from 'react-hot-toast';

const COLORS = [
  '#ef4444','#f97316','#f59e0b','#84cc16','#10b981','#06b6d4',
  '#3b82f6','#6366f1','#8b5cf6','#ec4899','#64748b','#78716c'
];

const ICONS = [
  'shopping-cart','beef','fish','apple','car','home','gamepad-2','heart-pulse',
  'shirt','book-open','utensils','repeat','package','coffee','gift','plane',
  'music','smartphone','zap','droplet','baby','dog','dumbbell','graduation-cap','wrench','tag'
];

const DEFAULT_GOALS = [
  { id: 1, name: 'Mouton de l’Aïd', current_amount: 52000, target_amount: 90000, target_date: 'Mai 2027', emoji: '🐑', color: '#f59e0b' },
  { id: 2, name: 'Vacances d’été', current_amount: 64000, target_amount: 150000, target_date: 'Juil 2027', emoji: '🏖️', color: '#0ea5e9' },
  { id: 3, name: 'Fonds d’urgence', current_amount: 120000, target_amount: 200000, target_date: 'Déc 2027', emoji: '🛡️', color: '#10b981' },
];

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [categorySpending, setCategorySpending] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', color: '#6366f1', icon: 'tag', budget: '' });

  // Savings goals state (persisted locally)
  const [goals, setGoals] = useState(() => {
    try {
      const stored = localStorage.getItem('budgetvault_savings_goals');
      return stored ? JSON.parse(stored) : DEFAULT_GOALS;
    } catch {
      return DEFAULT_GOALS;
    }
  });
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [goalForm, setGoalForm] = useState({ name: '', current_amount: '', target_amount: '', target_date: '', emoji: '🎯' });

  // Load budgets stored in localStorage per category
  const [categoryBudgets, setCategoryBudgets] = useState(() => {
    try {
      const stored = localStorage.getItem('budgetvault_cat_budgets');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial && categories.length === 0) setLoading(true);
    try {
      const [cats, byCatData] = await Promise.all([
        api.getCategories(),
        api.getByCategory(),
      ]);
      setCategories(cats || []);

      // Map spending per category ID
      const spendMap = {};
      if (byCatData?.categories) {
        byCatData.categories.forEach(c => {
          if (c.id) spendMap[c.id] = c.total;
        });
      }
      setCategorySpending(spendMap);
    } catch (err) {
      console.warn('[Categories] loadData error:', err);
      if (isInitial) toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [categories.length]);

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

  // Category Modal Handlers
  const openNewCategory = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    setEditCat(null);
    setCatForm({ name: '', color: '#6366f1', icon: 'tag', budget: '' });
    setShowCatModal(true);
  };

  const openEditCategory = (cat) => {
    if (navigator.vibrate) navigator.vibrate(10);
    setEditCat(cat);
    setCatForm({
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      budget: categoryBudgets[cat.id] || '',
    });
    setShowCatModal(true);
  };

  const handleSaveCategory = async () => {
    if (!catForm.name.trim()) { toast.error('Nom requis'); return; }
    try {
      if (navigator.vibrate) navigator.vibrate(15);
      let catId = editCat?.id;
      if (editCat) {
        await api.updateCategory(editCat.id, {
          name: catForm.name.trim(),
          color: catForm.color,
          icon: catForm.icon,
        });
        toast.success('Catégorie modifiée');
      } else {
        const created = await api.createCategory({
          name: catForm.name.trim(),
          color: catForm.color,
          icon: catForm.icon,
        });
        catId = created.id;
        toast.success('Catégorie créée');
      }

      // Save category budget
      if (catId && catForm.budget) {
        const updatedBudgets = { ...categoryBudgets, [catId]: parseFloat(catForm.budget) };
        setCategoryBudgets(updatedBudgets);
        localStorage.setItem('budgetvault_cat_budgets', JSON.stringify(updatedBudgets));
      }

      setShowCatModal(false);
      loadData(false);
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!confirm('Supprimer cette catégorie ?')) return;
    try {
      if (navigator.vibrate) navigator.vibrate(20);
      await api.deleteCategory(id);
      toast.success('Catégorie supprimée');
      loadData(false);
    } catch {
      toast.error('Erreur');
    }
  };

  // Savings Goal Handlers
  const openNewGoal = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    setEditGoal(null);
    setGoalForm({ name: '', current_amount: '', target_amount: '', target_date: '', emoji: '🎯' });
    setShowGoalModal(true);
  };

  const openEditGoal = (goal) => {
    if (navigator.vibrate) navigator.vibrate(10);
    setEditGoal(goal);
    setGoalForm({
      name: goal.name,
      current_amount: String(goal.current_amount || 0),
      target_amount: String(goal.target_amount || 0),
      target_date: goal.target_date || '',
      emoji: goal.emoji || '🎯',
    });
    setShowGoalModal(true);
  };

  const handleSaveGoal = () => {
    if (!goalForm.name.trim() || !goalForm.target_amount) {
      toast.error('Nom et montant cible requis');
      return;
    }
    const targetAmt = parseFloat(goalForm.target_amount);
    const currAmt = parseFloat(goalForm.current_amount) || 0;

    let updated;
    if (editGoal) {
      updated = goals.map(g => g.id === editGoal.id ? {
        ...g,
        name: goalForm.name.trim(),
        target_amount: targetAmt,
        current_amount: currAmt,
        target_date: goalForm.target_date.trim(),
        emoji: goalForm.emoji,
      } : g);
      toast.success('Objectif modifié');
    } else {
      const newG = {
        id: Date.now(),
        name: goalForm.name.trim(),
        target_amount: targetAmt,
        current_amount: currAmt,
        target_date: goalForm.target_date.trim(),
        emoji: goalForm.emoji,
        color: '#f59e0b',
      };
      updated = [...goals, newG];
      toast.success('Objectif créé');
    }
    setGoals(updated);
    localStorage.setItem('budgetvault_savings_goals', JSON.stringify(updated));
    setShowGoalModal(false);
  };

  const handleDeleteGoal = (id) => {
    if (!confirm('Supprimer cet objectif ?')) return;
    const updated = goals.filter(g => g.id !== id);
    setGoals(updated);
    localStorage.setItem('budgetvault_savings_goals', JSON.stringify(updated));
    setShowGoalModal(false);
    toast.success('Objectif supprimé');
  };

  return (
    <div className="budgets-page">
      <PullToRefresh pullDistance={pullDistance} isRefreshing={isRefreshing} isReady={isReady} />

      {/* Header (budgets.webp) */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title" style={{ fontSize: '1.9rem', fontWeight: 900, margin: 0 }}>
            Budgets & objectifs
          </h1>
          <p className="page-subtitle" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
            Plafonds mensuels et épargne
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: 42, height: 42, padding: 0, borderRadius: '50%', border: '1px solid var(--border)' }}
          onClick={openNewCategory}
          title="Ajouter une catégorie"
        >
          <Plus size={20} color="var(--gold-light)" />
        </button>
      </div>

      {/* Category Budgets Grid (2 columns as in budgets.webp) */}
      <div className="budgets-grid">
        {loading && categories.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="budget-card" style={{ height: 130 }}>
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10, marginBottom: 12 }} />
              <div className="skeleton" style={{ width: '70%', height: 16, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '100%', height: 6 }} />
            </div>
          ))
        ) : categories.length === 0 ? (
          <div className="card text-center py-5 col-span-2" style={{ gridColumn: '1 / -1' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Aucune catégorie configurée</p>
            <button className="btn btn-primary btn-sm mt-2" onClick={openNewCategory}>
              <Plus size={16} /> Créer une catégorie
            </button>
          </div>
        ) : (
          categories.map(cat => {
            const spent = categorySpending[cat.id] || 0;
            // Default target budget if not configured
            const budgetMax = categoryBudgets[cat.id] || (spent > 0 ? Math.ceil(spent * 1.25 / 100) * 100 : 1000);
            const ratio = spent / (budgetMax || 1);
            const pct = Math.round(ratio * 100);

            let pillClass = 'safe';
            if (pct >= 100) pillClass = 'danger';
            else if (pct >= 85) pillClass = 'warning';

            return (
              <div
                key={cat.id}
                className="budget-card"
                onClick={() => openEditCategory(cat)}
              >
                <div className="budget-card-top">
                  <div
                    className="squircle-badge"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: `${cat.color || '#6366f1'}25`,
                      color: cat.color || '#6366f1',
                      fontSize: '1.1rem',
                    }}
                  >
                    <span>{EMOJI_MAP[cat.icon] || '🏷️'}</span>
                  </div>

                  <span className={`budget-pct-pill ${pillClass}`}>
                    {pct}%
                  </span>
                </div>

                <div>
                  <div className="budget-card-name">{cat.name}</div>
                  <div className="budget-card-ratio">
                    {formatMoney(spent)} / {formatMoney(budgetMax)}
                  </div>
                </div>

                {/* Segmented Dash Bar (budgets.webp) */}
                <SegmentedProgressBar value={spent} max={budgetMax} totalSegments={12} />
              </div>
            );
          })
        )}
      </div>

      {/* Savings Goals Section (budgets.webp) */}
      <div className="goals-section">
        <div className="goals-header">
          <h3 className="goals-title">Objectifs d'épargne</h3>
          <button className="new-goal-btn" onClick={openNewGoal}>
            + Nouvel objectif
          </button>
        </div>

        {goals.map(g => (
          <GoalCard
            key={g.id}
            goal={g}
            onEdit={openEditGoal}
          />
        ))}
      </div>

      {/* Category Edit / Create Modal */}
      {showCatModal && (
        <div className="modal-overlay" onClick={() => setShowCatModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editCat ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h3>
              <button className="modal-close" onClick={() => setShowCatModal(false)}><X size={18} /></button>
            </div>

            <div className="input-group">
              <label>Nom de la catégorie</label>
              <input
                className="input"
                value={catForm.name}
                onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Courses, Restauration..."
                autoFocus
              />
            </div>

            <div className="input-group">
              <label>Plafond budgétaire mensuel (€ / DA)</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={catForm.budget}
                onChange={e => setCatForm(f => ({ ...f, budget: e.target.value }))}
                placeholder="Ex: 30000"
              />
            </div>

            <div className="input-group">
              <label>Couleur</label>
              <div className="color-grid">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`color-swatch ${catForm.color === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setCatForm(f => ({ ...f, color: c }))}
                  />
                ))}
              </div>
            </div>

            <div className="input-group">
              <label>Icône</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 130, overflowY: 'auto' }}>
                {ICONS.map(ic => (
                  <button
                    key={ic}
                    type="button"
                    className={`category-chip ${catForm.icon === ic ? 'selected' : ''}`}
                    style={{ padding: '8px 10px', minWidth: 'auto' }}
                    onClick={() => setCatForm(f => ({ ...f, icon: ic }))}
                  >
                    <span style={{ fontSize: '1.2rem' }}>{EMOJI_MAP[ic] || '🏷️'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                className="btn btn-primary btn-block"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#0b131e', fontWeight: 800 }}
                onClick={handleSaveCategory}
              >
                {editCat ? 'Modifier' : 'Créer'}
              </button>
              {editCat && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    handleDeleteCategory(editCat.id);
                    setShowCatModal(false);
                  }}
                  style={{ width: 50, padding: 0 }}
                  title="Supprimer"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Savings Goal Edit / Create Modal */}
      {showGoalModal && (
        <div className="modal-overlay" onClick={() => setShowGoalModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editGoal ? 'Modifier l’objectif' : 'Nouvel objectif d’épargne'}</h3>
              <button className="modal-close" onClick={() => setShowGoalModal(false)}><X size={18} /></button>
            </div>

            <div className="input-group">
              <label>Nom du projet / objectif</label>
              <input
                className="input"
                value={goalForm.name}
                onChange={e => setGoalForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Voyage, Voiture, Mariage..."
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <div className="input-group" style={{ flex: 1 }}>
                <label>Montant actuel</label>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  value={goalForm.current_amount}
                  onChange={e => setGoalForm(f => ({ ...f, current_amount: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="input-group" style={{ flex: 1 }}>
                <label>Montant cible</label>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  value={goalForm.target_amount}
                  onChange={e => setGoalForm(f => ({ ...f, target_amount: e.target.value }))}
                  placeholder="100000"
                />
              </div>
            </div>

            <div className="input-group">
              <label>Date cible (optionnelle)</label>
              <input
                className="input"
                value={goalForm.target_date}
                onChange={e => setGoalForm(f => ({ ...f, target_date: e.target.value }))}
                placeholder="Ex: Juin 2027"
              />
            </div>

            <div className="input-group">
              <label>Emoji</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['🎯', '🐑', '🏖️', '🚗', '🏠', '💻', '🛡️', '💍', '👶'].map(em => (
                  <button
                    key={em}
                    type="button"
                    className={`filter-pill ${goalForm.emoji === em ? 'active' : ''}`}
                    style={{ padding: '8px 12px', fontSize: '1.2rem' }}
                    onClick={() => setGoalForm(f => ({ ...f, emoji: em }))}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                className="btn btn-primary btn-block"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#0b131e', fontWeight: 800 }}
                onClick={handleSaveGoal}
              >
                Enregistrer l'objectif
              </button>
              {editGoal && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleDeleteGoal(editGoal.id)}
                  style={{ width: 50, padding: 0 }}
                  title="Supprimer"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const EMOJI_MAP = {
  'shopping-cart':'🛒','car':'🚗','home':'🏠','gamepad-2':'🎮','heart-pulse':'❤️',
  'shirt':'👕','book-open':'📚','utensils':'🍽️','repeat':'🔄','package':'📦',
  'tag':'🏷️','coffee':'☕','gift':'🎁','plane':'✈️','music':'🎵','smartphone':'📱',
  'zap':'⚡','droplet':'💧','baby':'👶','dog':'🐕','dumbbell':'💪','graduation-cap':'🎓',
  'wrench':'🔧','beef':'🥩','fish':'🐟','apple':'🍎'
};
