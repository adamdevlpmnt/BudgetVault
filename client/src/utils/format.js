/**
 * Currency configuration
 */
const CURRENCIES = {
  EUR: { code: 'EUR', symbol: '€', locale: 'fr-FR', label: 'Euro (€)' },
  USD: { code: 'USD', symbol: '$', locale: 'en-US', label: 'Dollar ($)' },
  DZD: { code: 'DZD', symbol: 'د.ج', locale: 'fr-DZ', label: 'Dinar algérien (د.ج)' },
};

export { CURRENCIES };

// Current currency — set from AuthContext
let _currency = 'EUR';

export function setCurrency(code) {
  _currency = CURRENCIES[code] ? code : 'EUR';
}

export function getCurrency() {
  return _currency;
}

/**
 * Format a number as currency (uses the active currency)
 */
export function formatMoney(amount) {
  const cfg = CURRENCIES[_currency] || CURRENCIES.EUR;
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: 'currency',
      currency: cfg.code,
      minimumFractionDigits: cfg.code === 'DZD' ? 0 : 2,
      maximumFractionDigits: cfg.code === 'DZD' ? 0 : 2,
    }).format(amount || 0);
  } catch {
    // Fallback for DZD in some browsers
    const val = cfg.code === 'DZD'
      ? Math.round(amount || 0).toLocaleString('fr-FR')
      : (amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });
    return `${val} ${cfg.symbol}`;
  }
}

/**
 * Format a date string to localized display
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function today() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get cycle display name from key
 */
export function cycleName(cycleKey) {
  if (!cycleKey) return '';
  const [year, month] = cycleKey.split('-');
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  return `${months[parseInt(month) - 1]} ${year}`;
}
