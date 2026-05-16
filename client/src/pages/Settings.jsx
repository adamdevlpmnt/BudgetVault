import React, { useState, useEffect } from 'react';
import { LogOut, Lock, Calendar, Bell, BellOff, User, Plus, Trash2, X, RefreshCw, Sun, Moon } from 'lucide-react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { formatMoney, CURRENCIES } from '../utils/format';
import toast from 'react-hot-toast';

const CURRENCY_LIST = [
  { code: 'EUR', label: 'Euro', symbol: '€', flag: '🇪🇺' },
  { code: 'USD', label: 'Dollar US', symbol: '$', flag: '🇺🇸' },
  { code: 'DZD', label: 'Dinar algérien', symbol: 'د.ج', flag: '🇩🇿' },
];

function getStoredTheme() {
  return localStorage.getItem('budgetvault-theme') || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('budgetvault-theme', theme);
  // Update meta theme-color for mobile browser chrome
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f1f5f9' : '#0a0a1a');
}

export default function Settings() {
  const { user, logout, updateUser } = useAuth();
  const [recurring, setRecurring] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [editRec, setEditRec] = useState(null);
  const [cycleDay, setCycleDay] = useState(user?.cycleStartDay || 1);
  const [currency, setCurrencyState] = useState(user?.currency || 'EUR');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [theme, setTheme] = useState(getStoredTheme());

  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [recForm, setRecForm] = useState({ type: 'income', amount: '', description: '', dayOfMonth: 1, categoryId: '' });

  useEffect(() => {
    loadData();
    checkPush();
    // Apply stored theme on mount
    applyTheme(getStoredTheme());
  }, []);

  const loadData = async () => {
    try {
      const [recs, cats] = await Promise.all([api.getRecurring(), api.getCategories()]);
      setRecurring(recs);
      setCategories(cats);
    } catch {}
  };

  const checkPush = async () => {
    if ('Notification' in window) setPushEnabled(Notification.permission === 'granted');
  };

  const handleCycleDayChange = async (val) => {
    const day = parseInt(val);
    if (day < 1 || day > 28) return;
    setCycleDay(day);
    try {
      await api.updateSettings({ cycleStartDay: day });
      updateUser({ cycleStartDay: day });
      toast.success('Jour de cycle mis à jour');
    } catch { toast.error('Erreur'); }
  };

  const handleCurrencyChange = async (code) => {
    setCurrencyState(code);
    try {
      await api.updateSettings({ currency: code });
      updateUser({ currency: code });
      toast.success(`Devise changée : ${CURRENCY_LIST.find(c => c.code === code)?.label}`);
    } catch { toast.error('Erreur'); }
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const handlePasswordChange = async () => {
    if (pwForm.newPw !== pwForm.confirm) { toast.error('Les mots de passe ne correspondent pas'); return; }
    if (pwForm.newPw.length < 6) { toast.error('Minimum 6 caractères'); return; }
    try {
      await api.changePassword(pwForm.current, pwForm.newPw);
      toast.success('Mot de passe modifié');
      setShowPasswordModal(false);
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) { toast.error(err.message); }
  };

  const togglePush = async () => {
    if (!('Notification' in window)) { toast.error('Non supporté par votre navigateur'); return; }
    if (pushEnabled) {
      await api.unsubscribePush();
      setPushEnabled(false);
      toast.success('Notifications désactivées');
    } else {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        try {
          const { publicKey } = await api.getVapidKey();
          if (!publicKey) { toast.error('Notifications non configurées sur le serveur'); return; }
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
          await api.subscribePush(sub);
          setPushEnabled(true);
          toast.success('Notifications activées');
        } catch { toast.error('Erreur d\'activation'); }
      }
    }
  };

  const saveRecurring = async () => {
    if (!recForm.amount || !recForm.description) { toast.error('Remplissez tous les champs'); return; }
    try {
      if (editRec) { await api.updateRecurring(editRec.id, recForm); }
      else { await api.createRecurring(recForm); }
      toast.success(editRec ? 'Modifié' : 'Créé');
      setShowRecurringModal(false);
      setEditRec(null);
      loadData();
    } catch { toast.error('Erreur'); }
  };

  const deleteRecurring = async (id) => {
    if (!confirm('Supprimer ?')) return;
    try { await api.deleteRecurring(id); toast.success('Supprimé'); loadData(); }
    catch { toast.error('Erreur'); }
  };

  const currencySymbol = CURRENCY_LIST.find(c => c.code === currency)?.symbol || '€';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Réglages</h1>
      </div>

      {/* Profile */}
      <div className="card mb-4">
        <div className="settings-item" style={{ border: 'none' }}>
          <div className="settings-item-info">
            <div className="settings-item-label flex items-center gap-2"><User size={16} /> {user?.displayName || user?.username}</div>
            <div className="settings-item-desc">@{user?.username}</div>
          </div>
        </div>
      </div>

      {/* Theme */}
      <div className="section-title">Apparence</div>
      <div className="card mb-4">
        <div className="theme-switcher">
          <button
            className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => handleThemeChange('dark')}
          >
            <Moon size={16} /> Sombre
          </button>
          <button
            className={`theme-option ${theme === 'light' ? 'active' : ''}`}
            onClick={() => handleThemeChange('light')}
          >
            <Sun size={16} /> Clair
          </button>
        </div>
      </div>

      {/* Currency */}
      <div className="section-title">Devise</div>
      <div className="card mb-4">
        <div className="currency-picker">
          {CURRENCY_LIST.map(c => (
            <button
              key={c.code}
              className={`currency-option ${currency === c.code ? 'active' : ''}`}
              onClick={() => handleCurrencyChange(c.code)}
            >
              <span className="currency-flag">{c.flag}</span>
              <div className="currency-details">
                <span className="currency-name">{c.label}</span>
                <span className="currency-symbol">{c.symbol}</span>
              </div>
              {currency === c.code && <span className="currency-check">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Cycle Day */}
      <div className="section-title">Cycle budgétaire</div>
      <div className="card mb-4">
        <div className="settings-item" style={{ border: 'none' }}>
          <div className="settings-item-info">
            <div className="settings-item-label flex items-center gap-2"><Calendar size={16} /> Début du cycle</div>
            <div className="settings-item-desc">Jour du mois où commence votre cycle</div>
          </div>
          <select className="input" style={{ width: 70, minHeight: 40, padding: '8px' }} value={cycleDay} onChange={e => handleCycleDayChange(e.target.value)}>
            {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </div>
      </div>

      {/* Notifications */}
      <div className="section-title">Notifications</div>
      <div className="card mb-4">
        <div className="settings-item" style={{ border: 'none' }}>
          <div className="settings-item-info">
            <div className="settings-item-label flex items-center gap-2">{pushEnabled ? <Bell size={16} /> : <BellOff size={16} />} Rappel quotidien</div>
            <div className="settings-item-desc">Rappel à 20h pour ajouter vos dépenses</div>
          </div>
          <button className={`toggle ${pushEnabled ? 'active' : ''}`} onClick={togglePush} />
        </div>
      </div>

      {/* Recurring */}
      <div className="section-title flex items-center justify-between">
        <span>Revenus & dépenses récurrents</span>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditRec(null); setRecForm({ type: 'income', amount: '', description: '', dayOfMonth: 1, categoryId: '' }); setShowRecurringModal(true); }}>
          <Plus size={16} />
        </button>
      </div>
      <div className="card mb-4">
        {recurring.length === 0 ? (
          <div className="empty-state"><RefreshCw size={32} /><p>Aucune transaction récurrente</p></div>
        ) : recurring.map(r => (
          <div key={r.id} className="expense-item">
            <div className="expense-icon" style={{ background: r.type === 'income' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }}>
              <span>{r.type === 'income' ? '💰' : '💸'}</span>
            </div>
            <div className="expense-info">
              <div className="expense-desc">{r.description}</div>
              <div className="expense-meta">Jour {r.day_of_month} • {r.type === 'income' ? 'Revenu' : 'Dépense'}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`expense-amount ${r.type === 'income' ? 'income' : ''}`}>
                {r.type === 'income' ? '+' : '-'}{formatMoney(r.amount)}
              </span>
              <button className="btn btn-ghost btn-sm" style={{ padding: 4, minHeight: 'auto' }} onClick={() => deleteRecurring(r.id)}>
                <Trash2 size={14} color="var(--danger)" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Security */}
      <div className="section-title">Sécurité</div>
      <div className="card mb-4">
        <button className="settings-item w-full" style={{ border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }} onClick={() => setShowPasswordModal(true)}>
          <div className="settings-item-info">
            <div className="settings-item-label flex items-center gap-2"><Lock size={16} /> Changer le mot de passe</div>
          </div>
          <span style={{ color: 'var(--text-muted)' }}>→</span>
        </button>
      </div>

      <button className="btn btn-danger btn-block" onClick={logout} style={{ marginBottom: 24 }}>
        <LogOut size={18} /> Se déconnecter
      </button>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Changer le mot de passe</h3>
              <button className="modal-close" onClick={() => setShowPasswordModal(false)}><X size={18} /></button>
            </div>
            <div className="input-group"><label>Mot de passe actuel</label><input className="input" type="password" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} /></div>
            <div className="input-group"><label>Nouveau mot de passe</label><input className="input" type="password" value={pwForm.newPw} onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} /></div>
            <div className="input-group"><label>Confirmer</label><input className="input" type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} /></div>
            <button className="btn btn-primary btn-block" onClick={handlePasswordChange}>Modifier</button>
          </div>
        </div>
      )}

      {/* Recurring Modal */}
      {showRecurringModal && (
        <div className="modal-overlay" onClick={() => setShowRecurringModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editRec ? 'Modifier' : 'Nouveau récurrent'}</h3>
              <button className="modal-close" onClick={() => setShowRecurringModal(false)}><X size={18} /></button>
            </div>
            <div className="input-group">
              <label>Type</label>
              <div className="flex gap-2">
                <button className={`btn ${recForm.type === 'income' ? 'btn-primary' : 'btn-ghost'} btn-sm`} style={{ flex: 1 }} onClick={() => setRecForm(f => ({ ...f, type: 'income' }))}>Revenu</button>
                <button className={`btn ${recForm.type === 'expense' ? 'btn-primary' : 'btn-ghost'} btn-sm`} style={{ flex: 1 }} onClick={() => setRecForm(f => ({ ...f, type: 'expense' }))}>Dépense</button>
              </div>
            </div>
            <div className="input-group"><label>Description</label><input className="input" value={recForm.description} onChange={e => setRecForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Salaire" /></div>
            <div className="input-group"><label>Montant ({currencySymbol})</label><input className="input input-amount" type="number" step="0.01" value={recForm.amount} onChange={e => setRecForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <div className="input-group">
              <label>Jour du mois (1-28)</label>
              <input className="input" type="number" min="1" max="28" value={recForm.dayOfMonth} onChange={e => setRecForm(f => ({ ...f, dayOfMonth: parseInt(e.target.value) || 1 }))} />
            </div>
            {recForm.type === 'expense' && (
              <div className="input-group">
                <label>Catégorie</label>
                <select className="input" value={recForm.categoryId} onChange={e => setRecForm(f => ({ ...f, categoryId: e.target.value }))}>
                  <option value="">Sans catégorie</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <button className="btn btn-primary btn-block" onClick={saveRecurring}>{editRec ? 'Modifier' : 'Créer'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}
