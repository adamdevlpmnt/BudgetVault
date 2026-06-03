import React, { useState, useRef } from 'react';
import { X, Camera, ZoomIn, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { offlineApi as api } from '../utils/offlineApi.js';
import { today, getCurrency, CURRENCIES } from '../utils/format';
import toast from 'react-hot-toast';

export default function ExpenseModal({ categories, onClose, onSaved, expense }) {
  const isEditing = !!expense;
  const initialTab = expense?.type === 'income' ? 'income' : 'expense';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [amount, setAmount] = useState(expense?.amount || '');
  const [description, setDescription] = useState(expense?.description || '');
  const [note, setNote] = useState(expense?.note || '');
  const [date, setDate] = useState(expense?.date || today());
  const [categoryId, setCategoryId] = useState(expense?.category_id || '');
  const [receiptImage, setReceiptImage] = useState(expense?.receipt_image || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showReceiptLightbox, setShowReceiptLightbox] = useState(false);
  const fileRef = useRef();

  const apiBase = import.meta.env.DEV ? 'http://localhost:3001' : '';
  const currencySymbol = CURRENCIES[getCurrency()]?.symbol || '€';

  const getReceiptUrl = (img) => {
    if (!img) return null;
    if (img.startsWith('http') || img.startsWith('blob:')) return img;
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
      toast.success('Image ajoutée');
    } catch { toast.error('Erreur upload'); }
    finally { setUploading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) { toast.error('Montant invalide'); return; }
    setSaving(true);
    try {
      const data = {
        amount: parseFloat(amount),
        description,
        note,
        date,
        categoryId: activeTab === 'expense' ? (categoryId || null) : null,
        receiptImage: activeTab === 'expense' ? receiptImage : null,
        type: activeTab,
      };
      if (expense) { await api.updateExpense(expense.id, data); }
      else { await api.createExpense(data); }
      onSaved(activeTab);
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleTabChange = (tab) => {
    if (isEditing) return; // Don't allow tab change when editing
    setActiveTab(tab);
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title">{isEditing ? 'Modifier' : 'Nouvelle entrée'}</h3>
            <button className="modal-close" onClick={onClose}><X size={18} /></button>
          </div>

          {/* Tab Switcher */}
          {!isEditing && (
            <div className="modal-tabs">
              <button
                type="button"
                className={`modal-tab ${activeTab === 'expense' ? 'active expense-active' : ''}`}
                onClick={() => handleTabChange('expense')}
              >
                <ArrowDownCircle size={16} />
                <span>Dépense</span>
              </button>
              <button
                type="button"
                className={`modal-tab ${activeTab === 'income' ? 'active income-active' : ''}`}
                onClick={() => handleTabChange('income')}
              >
                <ArrowUpCircle size={16} />
                <span>Revenu</span>
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Montant ({currencySymbol})</label>
              <input
                className={`input input-amount ${activeTab === 'income' ? 'input-amount-income' : ''}`}
                type="number" inputMode="decimal" step="0.01" min="0.01"
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00" autoFocus required
              />
            </div>

            {activeTab === 'expense' && (
              <div className="input-group">
                <label>Catégorie</label>
                <div className="category-grid">
                  {categories.map(cat => (
                    <button type="button" key={cat.id} className={`category-chip ${categoryId == cat.id ? 'selected' : ''}`} onClick={() => setCategoryId(cat.id)}>
                      <div className="category-chip-icon" style={{ background: cat.color + '25' }}>
                        <span style={{ fontSize: '1rem' }}>{getCatEmoji(cat.icon)}</span>
                      </div>
                      <span className="category-chip-name">{cat.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="input-group">
              <label>Description</label>
              <input className="input" type="text" value={description} onChange={e => setDescription(e.target.value)}
                placeholder={activeTab === 'income' ? 'Ex: Salaire, Freelance...' : 'Ex: Courses Carrefour'} />
            </div>

            <div className="input-group">
              <label>Date</label>
              <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>

            <div className="input-group">
              <label>Note (optionnel)</label>
              <textarea className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Note..." rows={2} />
            </div>

            {activeTab === 'expense' && (
              <div className="input-group">
                <label>Ticket de caisse</label>
                {receiptImage ? (
                  <div className="flex items-center gap-3">
                    <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setShowReceiptLightbox(true)}>
                      <img src={getReceiptUrl(receiptImage)} alt="Ticket" className="receipt-preview" />
                      <div style={{
                        position: 'absolute', bottom: 4, right: 4,
                        background: 'rgba(0,0,0,0.6)', borderRadius: '50%',
                        width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <ZoomIn size={14} color="white" />
                      </div>
                    </div>
                    <div className="flex-col gap-2">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowReceiptLightbox(true)}>Voir en grand</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReceiptImage(null)} style={{ color: 'var(--danger)' }}>Supprimer</button>
                    </div>
                  </div>
                ) : (
                  <div className="upload-zone" onClick={() => fileRef.current?.click()}>
                    <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} hidden />
                    {uploading ? <span>Upload en cours...</span> : (
                      <>
                        <Camera size={24} style={{ marginBottom: 4 }} />
                        <div>Ajouter une photo</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              className={`btn btn-block ${activeTab === 'income' ? 'btn-success' : 'btn-primary'}`}
              disabled={saving}
            >
              {saving ? 'Enregistrement...' : (
                isEditing ? 'Modifier' : (
                  activeTab === 'income' ? 'Ajouter le revenu' : 'Ajouter la dépense'
                )
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Receipt Lightbox */}
      {showReceiptLightbox && receiptImage && (
        <div className="lightbox-overlay" onClick={() => setShowReceiptLightbox(false)}>
          <button className="lightbox-close" onClick={() => setShowReceiptLightbox(false)}>
            <X size={24} />
          </button>
          <img
            src={getReceiptUrl(receiptImage)}
            alt="Ticket de caisse"
            className="lightbox-image"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function getCatEmoji(icon) {
  const m = { 'shopping-cart':'🛒','car':'🚗','home':'🏠','gamepad-2':'🎮','heart-pulse':'❤️','shirt':'👕','book-open':'📚','utensils':'🍽️','repeat':'🔄','package':'📦','tag':'🏷️','coffee':'☕','gift':'🎁','plane':'✈️','music':'🎵','smartphone':'📱','zap':'⚡','droplet':'💧','baby':'👶','dog':'🐕','dumbbell':'💪','graduation-cap':'🎓','wrench':'🔧','beef':'🥩','fish':'🐟','apple':'🍎' };
  return m[icon] || '💰';
}
