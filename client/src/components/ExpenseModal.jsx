import React, { useState, useRef } from 'react';
import { X, Camera, Upload } from 'lucide-react';
import { api } from '../utils/api';
import { today } from '../utils/format';
import toast from 'react-hot-toast';

export default function ExpenseModal({ categories, onClose, onSaved, expense }) {
  const [amount, setAmount] = useState(expense?.amount || '');
  const [description, setDescription] = useState(expense?.description || '');
  const [note, setNote] = useState(expense?.note || '');
  const [date, setDate] = useState(expense?.date || today());
  const [categoryId, setCategoryId] = useState(expense?.category_id || '');
  const [receiptImage, setReceiptImage] = useState(expense?.receipt_image || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

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
      const data = { amount: parseFloat(amount), description, note, date, categoryId: categoryId || null, receiptImage };
      if (expense) { await api.updateExpense(expense.id, data); }
      else { await api.createExpense(data); }
      onSaved();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{expense ? 'Modifier' : 'Nouvelle dépense'}</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Montant (€)</label>
            <input className="input input-amount" type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus required />
          </div>

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

          <div className="input-group">
            <label>Description</label>
            <input className="input" type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Courses Carrefour" />
          </div>

          <div className="input-group">
            <label>Date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>

          <div className="input-group">
            <label>Note (optionnel)</label>
            <textarea className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Note..." rows={2} />
          </div>

          <div className="input-group">
            <label>Ticket de caisse</label>
            {receiptImage ? (
              <div className="flex items-center gap-3">
                <img src={receiptImage} alt="Ticket" className="receipt-preview" />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReceiptImage(null)}>Supprimer</button>
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

          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Enregistrement...' : (expense ? 'Modifier' : 'Ajouter la dépense')}
          </button>
        </form>
      </div>
    </div>
  );
}

function getCatEmoji(icon) {
  const m = { 'shopping-cart':'🛒','car':'🚗','home':'🏠','gamepad-2':'🎮','heart-pulse':'❤️','shirt':'👕','book-open':'📚','utensils':'🍽️','repeat':'🔄','package':'📦','tag':'🏷️','coffee':'☕','gift':'🎁','plane':'✈️','music':'🎵','smartphone':'📱','zap':'⚡','droplet':'💧','baby':'👶','dog':'🐕','dumbbell':'💪','graduation-cap':'🎓','wrench':'🔧','beef':'🥩','fish':'🐟','apple':'🍎' };
  return m[icon] || '💰';
}
