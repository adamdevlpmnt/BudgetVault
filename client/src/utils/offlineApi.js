import { api } from './api.js';
import {
  getAllExpenses, putExpense, markExpenseDeleted, getExpense,
  getAllCategories, putCategory, markCategoryDeleted,
  getAllRecurring, putRecurring, markRecurringDeleted,
  getBudget as getLocalBudget, putBudget,
  addToSyncQueue, getPendingCount,
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
 * Helper to get the cycle key for a date
 */
function getCycleKey(dateStr, startDay = 1) {
  const d = new Date(dateStr);
  let year = d.getFullYear();
  let month = d.getMonth() + 1;
  if (d.getDate() < startDay) {
    month -= 1;
    if (month < 1) { month = 12; year -= 1; }
  }
  return `${year}-${String(month).padStart(2, '0')}`;
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

// ==================== OFFLINE API ====================

export const offlineApi = {

  // ========== AUTH (pass-through — always needs network) ==========
  login: (...args) => api.login(...args),
  changePassword: (...args) => api.changePassword(...args),
  getMe: (...args) => api.getMe(...args),
  updateSettings: (...args) => api.updateSettings(...args),

  // ========== BUDGET ==========

  async getBudget() {
    try {
      if (isOnline()) {
        const result = await api.getBudget();
        // Cache locally
        await putBudget({ ...result, user_id: result.user_id || 1 });
        return result;
      }
    } catch (err) {
      console.warn('[OfflineApi] getBudget network error, using cache:', err.message);
    }
    // Fallback to IndexedDB
    const local = await getLocalBudget();
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
    try {
      if (isOnline()) {
        const result = await api.getExpenses(params);
        // Cache each expense in IndexedDB
        if (result.expenses && result.expenses.length > 0) {
          const { bulkPutExpenses } = await import('./offlineDb.js');
          await bulkPutExpenses(result.expenses);
        }
        return result;
      }
    } catch (err) {
      console.warn('[OfflineApi] getExpenses network error, using cache:', err.message);
    }
    // Fallback to IndexedDB
    return getAllExpenses(params);
  },

  async createExpense(data) {
    const tempId = generateTempId();
    const startDay = getUserCycleStartDay();
    const cycleKey = getCycleKey(data.date, startDay);
    const now = new Date().toISOString();

    const localExpense = {
      id: tempId,
      user_id: 1,
      category_id: data.categoryId || null,
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
      const { getCategory } = await import('./offlineDb.js');
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
      localBudget.balance += localExpense.amount;
    } else {
      localBudget.balance -= localExpense.amount;
    }
    await putBudget(localBudget);

    if (isOnline()) {
      try {
        const result = await api.createExpense(data);
        // Replace temp record with server record
        const { removeExpense } = await import('./offlineDb.js');
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
    // Get existing from IndexedDB
    const existing = await getExpense(id);
    const now = new Date().toISOString();

    const updatedExpense = {
      ...existing,
      amount: data.amount !== undefined ? parseFloat(data.amount) : existing?.amount,
      description: data.description !== undefined ? data.description : existing?.description,
      note: data.note !== undefined ? data.note : existing?.note,
      date: data.date || existing?.date,
      category_id: data.categoryId !== undefined ? data.categoryId : existing?.category_id,
      receipt_image: data.receiptImage !== undefined ? data.receiptImage : existing?.receipt_image,
      updated_at: now,
      _pendingSync: true,
    };

    // Recalculate cycle key
    const startDay = getUserCycleStartDay();
    updatedExpense.cycle_key = getCycleKey(updatedExpense.date, startDay);

    // Enrich with category info
    if (data.categoryId) {
      const { getCategory } = await import('./offlineDb.js');
      const cat = await getCategory(parseInt(data.categoryId));
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
        // Only send to server if it has a real server ID (positive)
        if (id > 0) {
          const result = await api.deleteExpense(id);
          const { removeExpense } = await import('./offlineDb.js');
          await removeExpense(id);
          if (result.newBalance !== undefined) {
            const lb = await getLocalBudget() || { userId: 1, balance: 0 };
            await putBudget({ ...lb, balance: result.newBalance });
          }
          return result;
        } else {
          // Temp record — just remove locally
          const { removeExpense } = await import('./offlineDb.js');
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
    try {
      if (isOnline()) {
        const result = await api.getCategories();
        if (result && result.length > 0) {
          const { bulkPutCategories } = await import('./offlineDb.js');
          await bulkPutCategories(result);
        }
        return result;
      }
    } catch (err) {
      console.warn('[OfflineApi] getCategories network error, using cache:', err.message);
    }
    return getAllCategories();
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
        const { getDb } = await import('./offlineDb.js');
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
    const { getCategory } = await import('./offlineDb.js');
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
        if (id > 0) {
          const result = await api.deleteCategory(id);
          const { getDb } = await import('./offlineDb.js');
          const db = await getDb();
          await db.delete('categories', id);
          return result;
        } else {
          const { getDb } = await import('./offlineDb.js');
          const db = await getDb();
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
    try {
      if (isOnline()) {
        const result = await api.getRecurring();
        if (result && result.length > 0) {
          const { bulkPutRecurring } = await import('./offlineDb.js');
          await bulkPutRecurring(result);
        }
        return result;
      }
    } catch (err) {
      console.warn('[OfflineApi] getRecurring network error, using cache:', err.message);
    }
    return getAllRecurring();
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
      category_id: data.categoryId || null,
      day_of_month: data.dayOfMonth,
      is_active: 1,
      last_applied: null,
      created_at: now,
      updated_at: now,
      _pendingSync: true,
      _tempId: tempId,
    };

    // Enrich with category info
    if (data.categoryId) {
      const { getCategory } = await import('./offlineDb.js');
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
        const { getDb } = await import('./offlineDb.js');
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
    const { getDb } = await import('./offlineDb.js');
    const db = await getDb();
    const existing = await db.get('recurring', id);
    const now = new Date().toISOString();

    const updated = {
      ...existing,
      type: data.type || existing?.type,
      amount: data.amount ? parseFloat(data.amount) : existing?.amount,
      description: data.description !== undefined ? (data.description || '').trim() : existing?.description,
      category_id: data.categoryId !== undefined ? data.categoryId : existing?.category_id,
      day_of_month: data.dayOfMonth || existing?.day_of_month,
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
        if (id > 0) {
          const result = await api.deleteRecurring(id);
          const { getDb } = await import('./offlineDb.js');
          const db = await getDb();
          await db.delete('recurring', id);
          return result;
        } else {
          const { getDb } = await import('./offlineDb.js');
          const db = await getDb();
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

  // ========== ANALYTICS ==========
  // Computed locally from IndexedDB when offline

  async getSummary(cycle) {
    try {
      if (isOnline()) {
        return await api.getSummary(cycle);
      }
    } catch (err) {
      console.warn('[OfflineApi] getSummary network error, computing locally:', err.message);
    }
    return computeLocalSummary(cycle);
  },

  async getByCategory(params = {}) {
    try {
      if (isOnline()) {
        return await api.getByCategory(params);
      }
    } catch (err) {
      console.warn('[OfflineApi] getByCategory network error, computing locally:', err.message);
    }
    return computeLocalByCategory(params);
  },

  async getHistory(limit) {
    try {
      if (isOnline()) {
        return await api.getHistory(limit);
      }
    } catch (err) {
      console.warn('[OfflineApi] getHistory network error, computing locally:', err.message);
    }
    return computeLocalHistory(limit);
  },

  async getDaily(params = {}) {
    try {
      if (isOnline()) {
        return await api.getDaily(params);
      }
    } catch (err) {
      console.warn('[OfflineApi] getDaily network error, computing locally:', err.message);
    }
    return [];
  },

  // ========== UPLOAD (pass-through — needs network) ==========

  async uploadReceipt(file) {
    if (!isOnline()) {
      // Store as base64 in memory for later upload
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
  const { expenses: allExpenses } = await getAllExpenses({ cycle, limit: 99999 });
  const budget = await getLocalBudget();
  const today = new Date().toISOString().split('T')[0];

  let totalExpenses = 0;
  let totalIncome = 0;
  let todayTotal = 0;
  let count = 0;

  for (const exp of allExpenses) {
    if (exp.type === 'income') {
      totalIncome += exp.amount;
    } else {
      totalExpenses += exp.amount;
      count++;
    }
    if (exp.date === today) {
      todayTotal += exp.type === 'income' ? 0 : exp.amount;
    }
  }

  return {
    totalExpenses,
    totalIncome,
    todayExpenses: todayTotal,
    transactionCount: count,
    balance: budget?.balance || 0,
    avgDaily: count > 0 ? totalExpenses / 30 : 0,
  };
}

async function computeLocalByCategory(params) {
  const { expenses: allExpenses } = await getAllExpenses({ ...params, limit: 99999 });
  const categories = await getAllCategories();
  const catMap = {};

  for (const cat of categories) {
    catMap[cat.id] = { ...cat, total: 0, count: 0 };
  }

  for (const exp of allExpenses) {
    if (exp.type === 'income') continue;
    const catId = exp.category_id;
    if (catId && catMap[catId]) {
      catMap[catId].total += exp.amount;
      catMap[catId].count++;
    }
  }

  const data = Object.values(catMap)
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total);

  return { categories: data };
}

async function computeLocalHistory(limit = 12) {
  const { expenses: allExpenses } = await getAllExpenses({ limit: 99999 });
  const cycleMap = {};

  for (const exp of allExpenses) {
    if (exp.type === 'income') continue;
    const key = exp.cycle_key;
    if (!key) continue;
    if (!cycleMap[key]) cycleMap[key] = 0;
    cycleMap[key] += exp.amount;
  }

  const history = Object.entries(cycleMap)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limit)
    .map(([cycleKey, total]) => ({ cycle_key: cycleKey, total }))
    .reverse();

  return { history };
}
