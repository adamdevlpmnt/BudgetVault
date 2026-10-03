import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, ZoomIn, Calendar, Repeat, Check, ChevronDown } from 'lucide-react';
import { offlineApi as api } from '../utils/offlineApi.js';
import { today, getCurrency, CURRENCIES } from '../utils/format';
import Keypad from './Keypad.jsx';
import CategoryIcon from './CategoryIcon.jsx';
import toast from 'react-hot-toast';

export default function ExpenseModal({ categories: propCategories, onClose, onSaved, expense }) {
  const isEditing = !!expense;
  const initialTab = expense?.type === 'income' ? 'income' : 'expense';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [amountStr, setAmountStr] = useState(expense ? String(expense.amount) : '');
  const [description, setDescription] = useState(expense?.description || '');
  const [note, setNote] = useState(expense?.note || '');
  const [date, setDate] = useState(expense?.date || today());
  const [categoryId, setCategoryId] = useState(expense?.category_id || '');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [receiptImage, setReceiptImage] = useState(expense?.receipt_image || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState(propCategories || []);
  const [showReceiptLightbox, setShowReceiptLightbox] = useState(false);
  const fileRef = useRef();

  const apiBase = import.meta.env.DEV ? 'http://localhost:3001' : '';
  const activeCurrency = getCurrency();
  const currencySymbol = activeCurrency === 'DZD' ? 'DA' : (CURRENCIES[activeCurrency]?.symbol || '€');

  // Load categories if not passed
  useEffect(() => {
    if (!propCategories || propCategories.length === 0) {
      api.getCategories().then(c => {
        if (c && c.length > 0) {
          setCategories(c);
          if (!categoryId && !isEditing) {
            setCategoryId(c[0].id);
          }
        }
      });
    } else if (!categoryId && propCategories.length > 0 && !isEditing) {
      setCategoryId(propCategories[0].id);
    }
  }, [propCategories, categoryId, isEditing]);

  // Handle keyboard typing on desktop
  useEffect(() => {
    const handleKeyDown = (e) => {
      // If focus is in an input or textarea, let default typing occur
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === '.' || e.key === ',') {
        handleDigit('.');
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [amountStr]);

  const handleDigit = (digit) => {
    if (amountStr.length >= 10) return;
    if (digit === '.' && amountStr.includes('.')) return;
    if (amountStr === '0' && digit !== '.') {
      setAmountStr(digit);
    } else {
      setAmountStr(prev => prev + digit);
    }
  };

  const handleDelete = () => {
    setAmountStr(prev => (prev.length > 1 ? prev.slice(0, -1) : ''));
  };

  const handleTripleZero = () => {
    if (!amountStr || amountStr === '0' || amountStr.length >= 7) return;
    setAmountStr(prev => prev + '000');
  };

  const getReceiptUrl = (img) => {
    if (!img) return null;
    if (img.startsWith('http') || img.startsWith('blob:') || img.startsWith('data:')) return img;
    if (img.startsWith('/uploads/')) return `${apiBase}${img}`;
    return `${apiBase}/uploads/${img}`;
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const data = await api.uploadReceipt(file);
      setReceiptImage(data.path);
      toast.success('Ticket photo ajouté');
    } catch {
      toast.error('Erreur upload ticket');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const numAmount = parseFloat(amountStr);
    if (!amountStr || isNaN(numAmount) || numAmount <= 0) {
      toast.error('Veuillez saisir un montant');
      return;
    }

    setSaving(true);
    try {
      if (navigator.vibrate) navigator.vibrate(15);

      const data = {
        amount: numAmount,
        description: description.trim() || (activeTab === 'income' ? 'Revenu' : 'Dépense'),
        note: note.trim(),
        date,
        categoryId: activeTab === 'expense' ? (categoryId || null) : null,
        receiptImage: activeTab === 'expense' ? receiptImage : null,
        type: activeTab,
      };

      if (isEditing) {
        await api.updateExpense(expense.id, data);
      } else {
        await api.createExpense(data);

        // If recurring toggle was active, create recurring record as well
        if (repeatMonthly) {
          const day = new Date(date).getDate();
          await api.createRecurring({
            type: activeTab,
            amount: numAmount,
            description: data.description,
            categoryId: data.categoryId,
            dayOfMonth: Math.min(28, Math.max(1, day)),
          }).catch(err => console.warn('Recurring creation error:', err));
        }
      }

      const successMsg = isEditing
        ? 'Opération modifiée avec succès !'
        : (activeTab === 'income' ? 'Revenu enregistré avec succès !' : 'Dépense enregistrée avec succès !');
      toast.success(successMsg, { id: 'expense-save', duration: 3500 });
      if (onSaved) onSaved(activeTab);
    } catch (err) {
      toast.error(err.message || 'Erreur lors de l’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const todayStr = today();
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ paddingBottom: 'calc(24px + var(--safe-bottom))' }}>
          
          {/* Top Bar: Segmented Switch + Close */}
          <div className="flex items-center justify-between mb-2">
            {!isEditing ? (
              <div className="type-toggle-tabs" style={{ margin: 0, padding: 3, width: 220 }}>
                <button
                  type="button"
                  className={`type-tab ${activeTab === 'expense' ? 'active' : ''}`}
                  onClick={() => {
                    if (navigator.vibrate) navigator.vibrate(8);
                    setActiveTab('expense');
                  }}
                  style={activeTab === 'expense' ? { background: '#ffffff', color: '#0b131e', fontWeight: 700 } : {}}
                >
                  Dépense
                </button>
                <button
                  type="button"
                  className={`type-tab ${activeTab === 'income' ? 'active' : ''}`}
                  onClick={() => {
                    if (navigator.vibrate) navigator.vibrate(8);
                    setActiveTab('income');
                  }}
                  style={activeTab === 'income' ? { background: '#ffffff', color: '#0b131e', fontWeight: 700 } : {}}
                >
                  Revenu
                </button>
              </div>
            ) : (
              <h3 className="modal-title" style={{ margin: 0 }}>Modifier l'opération</h3>
            )}

            <button className="modal-close" onClick={onClose} aria-label="Fermer">
              <X size={18} />
            </button>
          </div>

          {/* Huge Amount Display (add.webp) */}
          <div className="modal-amount-display">
            <span className="modal-amount-val">
              {amountStr ? Number(amountStr).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '0'}
            </span>
            <span className="modal-currency-tag">{currencySymbol}</span>
          </div>

          {/* Category Dropdown Selector */}
          {activeTab === 'expense' && categories.length > 0 && (
            <div className="category-select-wrapper mb-3" style={{ position: 'relative' }}>
              <button
                type="button"
                className="category-dropdown-btn"
                onClick={() => setCategoryDropdownOpen(o => !o)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 14px',
                  borderRadius: 14,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  minHeight: 48,
                  transition: 'border-color 0.2s',
                }}
              >
                {(() => {
                  const selCat = categories.find(c => c.id == categoryId) || categories[0];
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 9,
                          background: `${selCat?.color || '#6366f1'}25`,
                          color: selCat?.color || '#6366f1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <CategoryIcon icon={selCat?.icon} size={18} color={selCat?.color} />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                        {selCat?.name || 'Sélectionner une catégorie'}
                      </span>
                    </div>
                  );
                })()}
                <ChevronDown
                  size={18}
                  color="var(--text-muted)"
                  style={{
                    transform: categoryDropdownOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s ease',
                  }}
                />
              </button>

              {categoryDropdownOpen && (
                <div
                  className="category-dropdown-list"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    boxShadow: 'var(--shadow-lg)',
                    maxHeight: 220,
                    overflowY: 'auto',
                    zIndex: 100,
                    padding: 6,
                  }}
                >
                  {categories.map(cat => {
                    const isSelected = categoryId == cat.id;
                    return (
                      <div
                        key={cat.id}
                        onClick={() => {
                          if (navigator.vibrate) navigator.vibrate(8);
                          setCategoryId(cat.id);
                          setCategoryDropdownOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: 10,
                          cursor: 'pointer',
                          background: isSelected ? 'var(--bg-hover)' : 'transparent',
                          transition: 'background 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              background: `${cat.color}25`,
                              color: cat.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <CategoryIcon icon={cat.icon} size={16} color={cat.color} />
                          </div>
                          <span style={{ fontSize: '0.9rem', fontWeight: isSelected ? 700 : 500, color: 'var(--text)' }}>
                            {cat.name}
                          </span>
                        </div>
                        {isSelected && <Check size={16} color="var(--primary)" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Description & Note Input */}
          <div className="flex gap-2 mb-2">
            <input
              className="input"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={activeTab === 'income' ? 'Libellé (ex: Salaire, Freelance...)' : 'Libellé (ex: Marché, Café, Yassir...)'}
              style={{ flex: 2, padding: '10px 14px', minHeight: 42, fontSize: '0.9rem' }}
            />
            <input
              type="date"
              className="input"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{ flex: 1, padding: '10px 12px', minHeight: 42, fontSize: '0.85rem' }}
            />
          </div>

          {/* Recurrence Toggle Button */}
          {!isEditing && (
            <div
              className={`repeat-monthly-toggle ${repeatMonthly ? 'active' : ''}`}
              onClick={() => setRepeatMonthly(r => !r)}
            >
              <div className="flex items-center gap-2">
                <Repeat size={16} />
                <span>Répéter chaque mois (récurrent)</span>
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                {repeatMonthly ? '✓ Activé' : 'Désactivé'}
              </span>
            </div>
          )}

          {/* Photo ticket attachment */}
          {activeTab === 'expense' && (
            <div className="mb-2">
              {receiptImage ? (
                <div className="flex items-center justify-between" style={{ background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: 12 }}>
                  <div className="flex items-center gap-2" onClick={() => setShowReceiptLightbox(true)} style={{ cursor: 'pointer' }}>
                    <img src={getReceiptUrl(receiptImage)} alt="Ticket" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Ticket attaché</span>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReceiptImage(null)} style={{ color: 'var(--danger)', padding: 4 }}>
                    Retirer
                  </button>
                </div>
              ) : (
                <div
                  className="flex items-center justify-center gap-2"
                  style={{ background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: 12, cursor: 'pointer', border: '1px dashed var(--border)' }}
                  onClick={() => fileRef.current?.click()}
                >
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} hidden />
                  <Camera size={16} color="var(--text-muted)" />
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {uploading ? 'Upload...' : 'Ajouter photo du ticket'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Custom Numpad (add.webp) */}
          <Keypad
            onKeyPress={handleDigit}
            onDelete={handleDelete}
            onTripleZero={handleTripleZero}
          />

          {/* Save Button */}
          <button
            type="button"
            className="btn btn-block"
            onClick={handleSubmit}
            disabled={saving || !amountStr || parseFloat(amountStr) <= 0}
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
              color: '#0b131e',
              fontWeight: 800,
              fontSize: '1.05rem',
              borderRadius: 16,
              padding: '14px 20px',
              border: 'none',
              boxShadow: '0 4px 18px rgba(245, 158, 11, 0.4)',
            }}
          >
            {saving ? 'Enregistrement...' : (
              isEditing ? '✓ Mettre à jour' : (activeTab === 'income' ? '✓ Enregistrer le revenu' : '✓ Enregistrer la dépense')
            )}
          </button>
        </div>
      </div>

      {/* Lightbox for receipt photo */}
      {showReceiptLightbox && receiptImage && (
        <div className="lightbox-overlay" onClick={() => setShowReceiptLightbox(false)}>
          <button className="lightbox-close" onClick={() => setShowReceiptLightbox(false)}>
            <X size={24} />
          </button>
          <img src={getReceiptUrl(receiptImage)} alt="Ticket" className="lightbox-image" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}
