import { api } from './api.js';
import {
  getAllExpenses, putExpense, markExpenseDeleted, getExpense, removeExpense,
  getAllCategories, putCategory, markCategoryDeleted, getCategory,
  getAllRecurring, putRecurring, markRecurringDeleted,
  getBudget as getLocalBudget, putBudget,
  addToSyncQueue, getPendingCount, bulkPutExpenses, bulkPutCategories, bulkPutRecurring,
  getDb
} from './offlineDb.js';
import { sync, syncEvents, isOnline } from './syncEngine.js';

/**
 * Generate a temporary ID for offline-created records
 * Uses negative numbers to distinguish from server IDs
 */
let _tempIdCounter = -1;
function generateTempId() {
  return _tempIdCounter--;
}

/**
 * Helper to calculate start & end date for a cycle
 */
function getCycleDates(startDay, cycleKey) {
  const [year, month] = cycleKey.split('-').map(Number);
  const startDate = new Date(year, month - 1, startDay);
  const endDate = new Date(year, month, startDay - 1);
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

/**
 * Helper to get the cycle key for a date
 */
function getCycleKey(dateStr, startDay = 1) {
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  let year = d.getFullYear();
  let month = d.getMonth() + 1;
  if (d.getDate() < startDay) {
    month -= 1;
    if (month < 1) { month = 12; year -= 1; }
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Get current cycle key
 */
function getCurrentCycleKey(startDay) {
  const today = new Date().toISOString().split('T')[0];
  return getCycleKey(today, startDay);
}

/**
 * Get user's cycle start day from localStorage
 */
function getUserCycleStartDay() {
  try {
    const user = JSON.parse(localStorage.getItem('budgetvault_user') || '{}');
    return user.cycleStartDay || 1;
  } catch {
    return 1;
  }
}

// Background sync debounce trigger
let _bgSyncTimeout = null;
function triggerBackgroundSync() {
  if (!isOnline()) return;
  if (_bgSyncTimeout) return;
  _bgSyncTimeout = setTimeout(() => {
    _bgSyncTimeout = null;
    sync().catch(() => {});
  }, 1000);
}

// ==================== OFFLINE API ====================

export const offlineApi = {

  // ========== AUTH (pass-through — always needs network) ==========
  login: (...args) => api.login(...args),
  changePassword: (...args) => api.changePassword(...args),
  getMe: (...args) => api.getMe(...args),
  updateSettings: (...args) => api.updateSettings(...args),

  // ========== BUDGET ==========

  async getBudget() {
    const local = await getLocalBudget();
    if (local && local.balance !== undefined) {
      triggerBackgroundSync();
      return local;
    }

    if (isOnline()) {
      try {
        const result = await api.getBudget();
        await putBudget({ ...result, user_id: result.user_id || 1 });
        return result;
      } catch (err) {
        console.warn('[OfflineApi] getBudget network fallback:', err.message);
      }
    }
    return local || { balance: 0 };
  },

  async updateBudget(balance) {
    // Optimistic update
    const localBudget = await getLocalBudget() || { userId: 1 };
    const updatedBudget = { ...localBudget, balance: parseFloat(balance), userId: localBudget.userId || 1 };
    await putBudget(updatedBudget);

    if (isOnline()) {
      try {
        const result = await api.updateBudget(balance);
        await putBudget({ ...result, user_id: result.user_id || 1 });
        return result;
      } catch (err) {
        console.warn('[OfflineApi] updateBudget failed, queued:', err.message);
      }
    }

    // Queue for sync
    await addToSyncQueue({
      type: 'update',
      entity: 'budget',
      data: { balance: parseFloat(balance) },
    });
    syncEvents.emit('pendingChange');
    return updatedBudget;
  },

  // ========== EXPENSES ==========

  async getExpenses(params = {}) {
    const localData = await getAllExpenses(params);
    if (localData && localData.expenses && localData.expenses.length > 0) {
      triggerBackgroundSync();
      return localData;
    }

    // If local is empty and online, fetch from server to seed local DB
    if (isOnline()) {
      try {
        const result = await api.getExpenses(params);
        if (result.expenses && result.expenses.length > 0) {
          await bulkPutExpenses(result.expenses);
        }
        return result;
      } catch (err) {
        console.warn('[OfflineApi] getExpenses network error, using cache:', err.message);
      }
    }

    return localData || { expenses: [], total: 0, limit: 50, offset: 0 };
  },

  async createExpense(data) {
    const tempId = generateTempId();
    const startDay = getUserCycleStartDay();
    const cycleKey = getCycleKey(data.date, startDay);
    const now = new Date().toISOString();

    const localExpense = {
      id: tempId,
      user_id: 1,
      category_id: data.categoryId ? parseInt(data.categoryId) : null,
      amount: parseFloat(data.amount),
      description: data.description || '',
      note: data.note || '',
      date: data.date,
      receipt_image: data.receiptImage || null,
      cycle_key: cycleKey,
      type: data.type || 'expense',
      created_at: now,
      updated_at: now,
      _pendingSync: true,
      _tempId: tempId,
    };

    // Enrich with category info from local cache
    if (data.categoryId) {
      const cat = await getCategory(parseInt(data.categoryId));
      if (cat) {
        localExpense.category_name = cat.name;
        localExpense.category_color = cat.color;
        localExpense.category_icon = cat.icon;
      }
    }

    // Save to IndexedDB immediately
    await putExpense(localExpense);

    // Adjust local balance
    const localBudget = await getLocalBudget() || { userId: 1, balance: 0 };
    if (localExpense.type === 'income') {
      localBudget.balance = (localBudget.balance || 0) + localExpense.amount;
    } else {
      localBudget.balance = (localBudget.balance || 0) - localExpense.amount;
    }
    await putBudget(localBudget);

    if (isOnline()) {
      try {
        const result = await api.createExpense(data);
        await removeExpense(tempId);
        if (result.expense) {
          await putExpense(result.expense);
        }
        if (result.newBalance !== undefined) {
          await putBudget({ ...localBudget, balance: result.newBalance });
        }
        return result;
      } catch (err) {
        console.warn('[OfflineApi] createExpense failed, queued:', err.message);
      }
    }

    // Queue for sync
    await addToSyncQueue({
      type: 'create',
      entity: 'expense',
      tempId: tempId,
      data: data,
    });
    syncEvents.emit('pendingChange');
    return { expense: localExpense, newBalance: localBudget.balance };
  },

  async updateExpense(id, data) {
    const existing = await getExpense(id);
    const now = new Date().toISOString();

    const updatedExpense = {
      ...existing,
      amount: data.amount !== undefined ? parseFloat(data.amount) : existing?.amount,
      description: data.description !== undefined ? data.description : existing?.description,
      note: data.note !== undefined ? data.note : existing?.note,
      date: data.date || existing?.date,
      category_id: data.categoryId !== undefined ? (data.categoryId ? parseInt(data.categoryId) : null) : existing?.category_id,
      receipt_image: data.receiptImage !== undefined ? data.receiptImage : existing?.receipt_image,
      updated_at: now,
      _pendingSync: true,
    };

    // Recalculate cycle key
    const startDay = getUserCycleStartDay();
    updatedExpense.cycle_key = getCycleKey(updatedExpense.date, startDay);

    // Enrich with category info
    if (updatedExpense.category_id) {
      const cat = await getCategory(updatedExpense.category_id);
      if (cat) {
        updatedExpense.category_name = cat.name;
        updatedExpense.category_color = cat.color;
        updatedExpense.category_icon = cat.icon;
      }
    }

    await putExpense(updatedExpense);

    // Adjust local balance for amount difference
    if (existing && data.amount !== undefined) {
      const amountDiff = parseFloat(data.amount) - existing.amount;
      if (amountDiff !== 0) {
        const localBudget = await getLocalBudget() || { userId: 1, balance: 0 };
        const entryType = existing.type || 'expense';
        if (entryType === 'income') {
          localBudget.balance += amountDiff;
        } else {
          localBudget.balance -= amountDiff;
        }
        await putBudget(localBudget);
      }
    }

    if (isOnline()) {
      try {
        const result = await api.updateExpense(id, data);
        if (result.expense) {
          result.expense._pendingSync = false;
          await putExpense(result.expense);
        }
        if (result.newBalance !== undefined) {
          const lb = await getLocalBudget() || { userId: 1, balance: 0 };
          await putBudget({ ...lb, balance: result.newBalance });
        }
        return result;
      } catch (err) {
        console.warn('[OfflineApi] updateExpense failed, queued:', err.message);
      }
    }

    // Queue for sync
    await addToSyncQueue({
      type: 'update',
      entity: 'expense',
      data: { id, ...data },
    });
    syncEvents.emit('pendingChange');
    const lb = await getLocalBudget();
    return { expense: updatedExpense, newBalance: lb?.balance };
  },

  async deleteExpense(id) {
    const existing = await getExpense(id);

    // Mark as deleted in IndexedDB
    await markExpenseDeleted(id);

    // Adjust local balance
    if (existing) {
      const localBudget = await getLocalBudget() || { userId: 1, balance: 0 };
      const entryType = existing.type || 'expense';
      if (entryType === 'income') {
        localBudget.balance -= existing.amount;
      } else {
        localBudget.balance += existing.amount;
      }
      await putBudget(localBudget);
    }

    if (isOnline()) {
      try {
        if (id > 0) {
          const result = await api.deleteExpense(id);
          await removeExpense(id);
          if (result.newBalance !== undefined) {
            const lb = await getLocalBudget() || { userId: 1, balance: 0 };
            await putBudget({ ...lb, balance: result.newBalance });
          }
          return result;
        } else {
          // Temp record — just remove locally
          await removeExpense(id);
          const lb = await getLocalBudget();
          return { message: 'Entrée supprimée', newBalance: lb?.balance };
        }
      } catch (err) {
        console.warn('[OfflineApi] deleteExpense failed, queued:', err.message);
      }
    }

    // Queue for sync (only for server records)
    if (id > 0) {
      await addToSyncQueue({
        type: 'delete',
        entity: 'expense',
        data: { id },
      });
    }
    syncEvents.emit('pendingChange');
    const lb = await getLocalBudget();
    return { message: 'Entrée supprimée', newBalance: lb?.balance };
  },

  // ========== CATEGORIES ==========

  async getCategories() {
    const local = await getAllCategories();
    if (local && local.length > 0) {
      triggerBackgroundSync();
      return local;
    }

    if (isOnline()) {
      try {
        const result = await api.getCategories();
        if (result && result.length > 0) {
          await bulkPutCategories(result);
        }
        return result;
      } catch (err) {
        console.warn('[OfflineApi] getCategories network fallback:', err.message);
      }
    }
    return local || [];
  },

  async createCategory(data) {
    const tempId = generateTempId();
    const now = new Date().toISOString();
    const categories = await getAllCategories();
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order || 0), 0);

    const localCategory = {
      id: tempId,
      user_id: 1,
      name: (data.name || '').trim(),
      color: data.color || '#6366f1',
      icon: data.icon || 'tag',
      custom_icon_path: data.customIconPath || null,
      sort_order: maxOrder + 1,
      created_at: now,
      updated_at: now,
      _pendingSync: true,
      _tempId: tempId,
    };

    await putCategory(localCategory);

    if (isOnline()) {
      try {
        const result = await api.createCategory(data);
        const db = await getDb();
        await db.delete('categories', tempId);
        await putCategory(result);
        return result;
      } catch (err) {
        console.warn('[OfflineApi] createCategory failed, queued:', err.message);
      }
    }

    await addToSyncQueue({ type: 'create', entity: 'category', tempId, data });
    syncEvents.emit('pendingChange');
    return localCategory;
  },

  async updateCategory(id, data) {
    const existing = await getCategory(id);
    const now = new Date().toISOString();

    const updated = {
      ...existing,
      name: data.name !== undefined ? (data.name || '').trim() : existing?.name,
      color: data.color !== undefined ? data.color : existing?.color,
      icon: data.icon !== undefined ? data.icon : existing?.icon,
      custom_icon_path: data.customIconPath !== undefined ? data.customIconPath : existing?.custom_icon_path,
      sort_order: data.sortOrder !== undefined ? data.sortOrder : existing?.sort_order,
      updated_at: now,
      _pendingSync: true,
    };

    await putCategory(updated);

    if (isOnline()) {
      try {
        const result = await api.updateCategory(id, data);
        result._pendingSync = false;
        await putCategory(result);
        return result;
      } catch (err) {
        console.warn('[OfflineApi] updateCategory failed, queued:', err.message);
      }
    }

    await addToSyncQueue({ type: 'update', entity: 'category', data: { id, ...data } });
    syncEvents.emit('pendingChange');
    return updated;
  },

  async deleteCategory(id) {
    await markCategoryDeleted(id);

    if (isOnline()) {
      try {
        const db = await getDb();
        if (id > 0) {
          const result = await api.deleteCategory(id);
          await db.delete('categories', id);
          return result;
        } else {
          await db.delete('categories', id);
          return { message: 'Catégorie supprimée', expensesAffected: 0 };
        }
      } catch (err) {
        console.warn('[OfflineApi] deleteCategory failed, queued:', err.message);
      }
    }

    if (id > 0) {
      await addToSyncQueue({ type: 'delete', entity: 'category', data: { id } });
    }
    syncEvents.emit('pendingChange');
    return { message: 'Catégorie supprimée', expensesAffected: 0 };
  },

  // ========== RECURRING ==========

  async getRecurring() {
    const local = await getAllRecurring();
    if (local && local.length > 0) {
      triggerBackgroundSync();
      return local;
    }

    if (isOnline()) {
      try {
        const result = await api.getRecurring();
        if (result && result.length > 0) {
          await bulkPutRecurring(result);
        }
        return result;
      } catch (err) {
        console.warn('[OfflineApi] getRecurring network fallback:', err.message);
      }
    }
    return local || [];
  },

  async createRecurring(data) {
    const tempId = generateTempId();
    const now = new Date().toISOString();

    const localItem = {
      id: tempId,
      user_id: 1,
      type: data.type,
      amount: parseFloat(data.amount),
      description: (data.description || '').trim(),
      category_id: data.categoryId ? parseInt(data.categoryId) : null,
      day_of_month: parseInt(data.dayOfMonth) || 1,
      is_active: 1,
      last_applied: null,
      created_at: now,
      updated_at: now,
      _pendingSync: true,
      _tempId: tempId,
    };

    if (data.categoryId) {
      const cat = await getCategory(parseInt(data.categoryId));
      if (cat) {
        localItem.category_name = cat.name;
        localItem.category_color = cat.color;
        localItem.category_icon = cat.icon;
      }
    }

    await putRecurring(localItem);

    if (isOnline()) {
      try {
        const result = await api.createRecurring(data);
        const db = await getDb();
        await db.delete('recurring', tempId);
        await putRecurring(result);
        return result;
      } catch (err) {
        console.warn('[OfflineApi] createRecurring failed, queued:', err.message);
      }
    }

    await addToSyncQueue({ type: 'create', entity: 'recurring', tempId, data });
    syncEvents.emit('pendingChange');
    return localItem;
  },

  async updateRecurring(id, data) {
    const db = await getDb();
    const existing = await db.get('recurring', id);
    const now = new Date().toISOString();

    const updated = {
      ...existing,
      type: data.type || existing?.type,
      amount: data.amount ? parseFloat(data.amount) : existing?.amount,
      description: data.description !== undefined ? (data.description || '').trim() : existing?.description,
      category_id: data.categoryId !== undefined ? (data.categoryId ? parseInt(data.categoryId) : null) : existing?.category_id,
      day_of_month: data.dayOfMonth !== undefined ? parseInt(data.dayOfMonth) : existing?.day_of_month,
      is_active: data.isActive !== undefined ? (data.isActive ? 1 : 0) : existing?.is_active,
      updated_at: now,
      _pendingSync: true,
    };

    await putRecurring(updated);

    if (isOnline()) {
      try {
        const result = await api.updateRecurring(id, data);
        result._pendingSync = false;
        await putRecurring(result);
        return result;
      } catch (err) {
        console.warn('[OfflineApi] updateRecurring failed, queued:', err.message);
      }
    }

    await addToSyncQueue({ type: 'update', entity: 'recurring', data: { id, ...data } });
    syncEvents.emit('pendingChange');
    return updated;
  },

  async deleteRecurring(id) {
    await markRecurringDeleted(id);

    if (isOnline()) {
      try {
        const db = await getDb();
        if (id > 0) {
          const result = await api.deleteRecurring(id);
          await db.delete('recurring', id);
          return result;
        } else {
          await db.delete('recurring', id);
          return { message: 'Supprimé' };
        }
      } catch (err) {
        console.warn('[OfflineApi] deleteRecurring failed, queued:', err.message);
      }
    }

    if (id > 0) {
      await addToSyncQueue({ type: 'delete', entity: 'recurring', data: { id } });
    }
    syncEvents.emit('pendingChange');
    return { message: 'Supprimé' };
  },

  // ========== ANALYTICS (Instant local computation) ==========

  async getSummary(cycle) {
    const local = await computeLocalSummary(cycle);
    triggerBackgroundSync();
    return local;
  },

  async getByCategory(params = {}) {
    const local = await computeLocalByCategory(params);
    triggerBackgroundSync();
    return local;
  },

  async getHistory(limit = 12) {
    const local = await computeLocalHistory(limit);
    triggerBackgroundSync();
    return local;
  },

  async getDaily(params = {}) {
    const local = await computeLocalDaily(params);
    triggerBackgroundSync();
    return local;
  },

  // ========== UPLOAD (pass-through — needs network) ==========

  async uploadReceipt(file) {
    if (!isOnline()) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({ filename: `pending_${Date.now()}`, path: reader.result, _pendingUpload: true });
        };
        reader.onerror = () => reject(new Error('Lecture du fichier échouée'));
        reader.readAsDataURL(file);
      });
    }
    return api.uploadReceipt(file);
  },

  uploadCategoryIcon: (...args) => api.uploadCategoryIcon(...args),

  // ========== PUSH (pass-through — needs network) ==========
  getVapidKey: () => api.getVapidKey(),
  subscribePush: (...args) => api.subscribePush(...args),
  unsubscribePush: () => api.unsubscribePush(),
};

// ==================== LOCAL ANALYTICS COMPUTATION ====================

async function computeLocalSummary(cycle) {
  const startDay = getUserCycleStartDay();
  const currentCycleKey = cycle || getCurrentCycleKey(startDay);
  const { startDate, endDate } = getCycleDates(startDay, currentCycleKey);

  const { expenses: allExpenses } = await getAllExpenses({ limit: 99999 });
  const budget = await getLocalBudget();
  const todayStr = new Date().toISOString().split('T')[0];

  let totalExpenses = 0;
  let expenseCount = 0;
  let todayExpenses = 0;

  for (const exp of allExpenses) {
    if (exp.type === 'income') continue;

    // Check date within cycle range
    if (exp.date >= startDate && exp.date <= endDate) {
      totalExpenses += exp.amount;
      expenseCount++;
    }

    if (exp.date === todayStr) {
      todayExpenses += exp.amount;
    }
  }

  const cycleDays = Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000));
  const avgDaily = expenseCount > 0 ? totalExpenses / cycleDays : 0;

  return {
    cycleKey: currentCycleKey,
    startDate,
    endDate,
    balance: budget?.balance || 0,
    totalExpenses,
    expenseCount,
    todayExpenses,
    avgDaily,
  };
}

async function computeLocalByCategory(params = {}) {
  const startDay = getUserCycleStartDay();
  let startDate = params.startDate;
  let endDate = params.endDate;

  if (!startDate || !endDate) {
    const cycleKey = params.cycle || getCurrentCycleKey(startDay);
    const dates = getCycleDates(startDay, cycleKey);
    startDate = dates.startDate;
    endDate = dates.endDate;
  }

  const { expenses: allExpenses } = await getAllExpenses({ startDate, endDate, limit: 99999 });
  const categories = await getAllCategories();
  const catMap = {};

  for (const cat of categories) {
    catMap[cat.id] = {
      id: cat.id,
      name: cat.name,
      color: cat.color || '#64748b',
      icon: cat.icon || 'tag',
      total: 0,
      count: 0,
    };
  }

  let grandTotal = 0;
  for (const exp of allExpenses) {
    if (exp.type === 'income') continue;
    const catId = exp.category_id;
    if (catId && catMap[catId]) {
      catMap[catId].total += exp.amount;
      catMap[catId].count++;
    } else {
      if (!catMap[0]) {
        catMap[0] = { id: 0, name: 'Sans catégorie', color: '#64748b', icon: 'help-circle', total: 0, count: 0 };
      }
      catMap[0].total += exp.amount;
      catMap[0].count++;
    }
    grandTotal += exp.amount;
  }

  const result = Object.values(catMap)
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .map(c => ({
      ...c,
      percentage: grandTotal > 0 ? ((c.total / grandTotal) * 100).toFixed(1) : '0.0',
    }));

  return {
    categories: result,
    total: grandTotal,
    startDate,
    endDate,
  };
}

async function computeLocalHistory(limit = 12) {
  const startDay = getUserCycleStartDay();
  const { expenses: allExpenses } = await getAllExpenses({ limit: 99999 });
  const history = [];

  let [year, month] = getCurrentCycleKey(startDay).split('-').map(Number);

  for (let i = 0; i < limit; i++) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const { startDate, endDate } = getCycleDates(startDay, key);

    let totalExpenses = 0;
    for (const exp of allExpenses) {
      if (exp.type === 'income') continue;
      if (exp.date >= startDate && exp.date <= endDate) {
        totalExpenses += exp.amount;
      }
    }

    if (totalExpenses > 0 || i < 3) {
      history.push({ cycleKey: key, startDate, endDate, totalExpenses });
    }

    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }

  return history;
}

async function computeLocalDaily(params = {}) {
  const startDay = getUserCycleStartDay();
  let startDate = params.startDate;
  let endDate = params.endDate;

  if (!startDate || !endDate) {
    const cycleKey = params.cycle || getCurrentCycleKey(startDay);
    const dates = getCycleDates(startDay, cycleKey);
    startDate = dates.startDate;
    endDate = dates.endDate;
  }

  const { expenses: allExpenses } = await getAllExpenses({ startDate, endDate, limit: 99999 });
  const dailyMap = {};

  for (const exp of allExpenses) {
    if (exp.type === 'income') continue;
    if (!dailyMap[exp.date]) dailyMap[exp.date] = { date: exp.date, total: 0, count: 0 };
    dailyMap[exp.date].total += exp.amount;
    dailyMap[exp.date].count++;
  }

  const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  return { daily, startDate, endDate };
}
