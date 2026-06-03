import { openDB } from 'idb';

const DB_NAME = 'budgetvault-offline';
const DB_VERSION = 1;

let dbPromise = null;

/**
 * Initialize / open the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Expenses store
        if (!db.objectStoreNames.contains('expenses')) {
          const expenseStore = db.createObjectStore('expenses', { keyPath: 'id' });
          expenseStore.createIndex('cycleKey', 'cycle_key', { unique: false });
          expenseStore.createIndex('date', 'date', { unique: false });
          expenseStore.createIndex('categoryId', 'category_id', { unique: false });
        }

        // Categories store
        if (!db.objectStoreNames.contains('categories')) {
          const catStore = db.createObjectStore('categories', { keyPath: 'id' });
          catStore.createIndex('sortOrder', 'sort_order', { unique: false });
        }

        // Recurring store
        if (!db.objectStoreNames.contains('recurring')) {
          db.createObjectStore('recurring', { keyPath: 'id' });
        }

        // Budget store
        if (!db.objectStoreNames.contains('budget')) {
          db.createObjectStore('budget', { keyPath: 'userId' });
        }

        // Sync queue — stores pending operations
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('entity', 'entity', { unique: false });
          syncStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Metadata store — lastSync timestamps, etc.
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// ==================== EXPENSES ====================

/** Get all expenses, optionally filtered */
export async function getAllExpenses(filters = {}) {
  const db = await getDb();
  let expenses = await db.getAll('expenses');

  // Filter out soft-deleted
  expenses = expenses.filter(e => !e._deleted);

  if (filters.cycle) {
    expenses = expenses.filter(e => e.cycle_key === filters.cycle);
  }
  if (filters.startDate) {
    expenses = expenses.filter(e => e.date >= filters.startDate);
  }
  if (filters.endDate) {
    expenses = expenses.filter(e => e.date <= filters.endDate);
  }
  if (filters.categoryId) {
    expenses = expenses.filter(e => e.category_id === parseInt(filters.categoryId));
  }

  // Sort by date desc, then created_at desc
  expenses.sort((a, b) => {
    const dateCompare = (b.date || '').localeCompare(a.date || '');
    if (dateCompare !== 0) return dateCompare;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

  // Apply pagination
  const total = expenses.length;
  const limit = parseInt(filters.limit) || 50;
  const offset = parseInt(filters.offset) || 0;
  const paginated = expenses.slice(offset, offset + limit);

  return { expenses: paginated, total, limit, offset };
}

/** Get a single expense by id */
export async function getExpense(id) {
  const db = await getDb();
  return db.get('expenses', id);
}

/** Put (insert or update) an expense */
export async function putExpense(expense) {
  const db = await getDb();
  await db.put('expenses', expense);
  return expense;
}

/** Mark an expense as deleted locally */
export async function markExpenseDeleted(id) {
  const db = await getDb();
  const expense = await db.get('expenses', id);
  if (expense) {
    expense._deleted = true;
    await db.put('expenses', expense);
  }
  return expense;
}

/** Bulk put expenses (for sync) */
export async function bulkPutExpenses(expenses) {
  const db = await getDb();
  const tx = db.transaction('expenses', 'readwrite');
  for (const expense of expenses) {
    await tx.store.put(expense);
  }
  await tx.done;
}

/** Delete an expense permanently from IndexedDB */
export async function removeExpense(id) {
  const db = await getDb();
  await db.delete('expenses', id);
}

// ==================== CATEGORIES ====================

/** Get all categories */
export async function getAllCategories() {
  const db = await getDb();
  let categories = await db.getAll('categories');
  categories = categories.filter(c => !c._deleted);
  categories.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.name || '').localeCompare(b.name || ''));
  return categories;
}

/** Get a single category by id */
export async function getCategory(id) {
  const db = await getDb();
  return db.get('categories', id);
}

/** Put (insert or update) a category */
export async function putCategory(category) {
  const db = await getDb();
  await db.put('categories', category);
  return category;
}

/** Mark a category as deleted locally */
export async function markCategoryDeleted(id) {
  const db = await getDb();
  const cat = await db.get('categories', id);
  if (cat) {
    cat._deleted = true;
    await db.put('categories', cat);
  }
  return cat;
}

/** Bulk put categories (for sync) */
export async function bulkPutCategories(categories) {
  const db = await getDb();
  const tx = db.transaction('categories', 'readwrite');
  for (const cat of categories) {
    await tx.store.put(cat);
  }
  await tx.done;
}

// ==================== RECURRING ====================

/** Get all recurring items */
export async function getAllRecurring() {
  const db = await getDb();
  let items = await db.getAll('recurring');
  items = items.filter(r => !r._deleted);
  items.sort((a, b) => (a.type || '').localeCompare(b.type || '') || (a.day_of_month || 0) - (b.day_of_month || 0));
  return items;
}

/** Put (insert or update) a recurring item */
export async function putRecurring(item) {
  const db = await getDb();
  await db.put('recurring', item);
  return item;
}

/** Mark a recurring item as deleted locally */
export async function markRecurringDeleted(id) {
  const db = await getDb();
  const item = await db.get('recurring', id);
  if (item) {
    item._deleted = true;
    await db.put('recurring', item);
  }
  return item;
}

/** Bulk put recurring items (for sync) */
export async function bulkPutRecurring(items) {
  const db = await getDb();
  const tx = db.transaction('recurring', 'readwrite');
  for (const item of items) {
    await tx.store.put(item);
  }
  await tx.done;
}

// ==================== BUDGET ====================

/** Get the budget for a user */
export async function getBudget(userId = 1) {
  const db = await getDb();
  return db.get('budget', userId);
}

/** Put (update) the budget */
export async function putBudget(budget) {
  const db = await getDb();
  // Normalize the key
  const data = { ...budget, userId: budget.userId || budget.user_id || 1 };
  await db.put('budget', data);
  return data;
}

// ==================== SYNC QUEUE ====================

/** Add an operation to the sync queue */
export async function addToSyncQueue(operation) {
  const db = await getDb();
  const op = {
    ...operation,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  const id = await db.add('syncQueue', op);
  return { ...op, id };
}

/** Get all pending operations from the sync queue */
export async function getSyncQueue() {
  const db = await getDb();
  const all = await db.getAll('syncQueue');
  return all.filter(op => op.status === 'pending');
}

/** Get the count of pending operations */
export async function getPendingCount() {
  const queue = await getSyncQueue();
  return queue.length;
}

/** Mark operations as completed and remove them */
export async function clearSyncQueueItems(ids) {
  const db = await getDb();
  const tx = db.transaction('syncQueue', 'readwrite');
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}

/** Clear all items from the sync queue */
export async function clearSyncQueue() {
  const db = await getDb();
  await db.clear('syncQueue');
}

// ==================== METADATA ====================

/** Get the last sync timestamp */
export async function getLastSyncTime() {
  const db = await getDb();
  const meta = await db.get('metadata', 'lastSyncTime');
  return meta?.value || null;
}

/** Set the last sync timestamp */
export async function setLastSyncTime(timestamp) {
  const db = await getDb();
  await db.put('metadata', { key: 'lastSyncTime', value: timestamp });
}

/** Get a metadata value */
export async function getMetadata(key) {
  const db = await getDb();
  const meta = await db.get('metadata', key);
  return meta?.value || null;
}

/** Set a metadata value */
export async function setMetadata(key, value) {
  const db = await getDb();
  await db.put('metadata', { key, value });
}

// ==================== CLEAR ALL ====================

/** Clear all data (used on logout) */
export async function clearAll() {
  const db = await getDb();
  const tx = db.transaction(
    ['expenses', 'categories', 'recurring', 'budget', 'syncQueue', 'metadata'],
    'readwrite'
  );
  await Promise.all([
    tx.objectStore('expenses').clear(),
    tx.objectStore('categories').clear(),
    tx.objectStore('recurring').clear(),
    tx.objectStore('budget').clear(),
    tx.objectStore('syncQueue').clear(),
    tx.objectStore('metadata').clear(),
    tx.done,
  ]);
}
