import { api } from './api.js';
import {
  bulkPutExpenses, bulkPutCategories, bulkPutRecurring,
  putBudget, removeExpense,
  getSyncQueue, clearSyncQueueItems,
  getLastSyncTime, setLastSyncTime,
  getAllCategories, getAllExpenses, getAllRecurring,
  getBudget as getLocalBudget,
} from './offlineDb.js';

/** Custom event emitter for sync status updates */
class SyncEventEmitter {
  constructor() {
    this._listeners = {};
  }

  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(cb => {
      try { cb(data); } catch (e) { console.error('SyncEvent listener error:', e); }
    });
  }
}

export const syncEvents = new SyncEventEmitter();

// Sync state
let _isSyncing = false;
let _autoSyncInterval = null;
let _retryTimeout = null;
let _retryCount = 0;
const MAX_RETRY_DELAY = 30000; // 30 seconds
const AUTO_SYNC_INTERVAL = 30000; // 30 seconds

/**
 * Check if the app is currently online
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Perform a full synchronization cycle:
 * 1. Pull remote changes
 * 2. Apply remote changes to IndexedDB
 * 3. Push local changes to server
 * 4. Handle results (conflicts, id mapping)
 */
export async function sync() {
  if (_isSyncing) {
    console.log('[Sync] Already syncing, skipping');
    return { status: 'skipped' };
  }

  if (!isOnline()) {
    console.log('[Sync] Offline, skipping');
    return { status: 'offline' };
  }

  _isSyncing = true;
  syncEvents.emit('syncStart');

  try {
    // Step 1: Pull remote changes
    const lastSync = await getLastSyncTime();
    console.log('[Sync] Pulling changes since:', lastSync || 'full sync');

    const token = localStorage.getItem('budgetvault_token');
    if (!token) {
      console.log('[Sync] No auth token, skipping');
      _isSyncing = false;
      return { status: 'no_auth' };
    }

    const pullParams = lastSync ? `?since=${encodeURIComponent(lastSync)}` : '?fullSync=true';
    const remoteData = await api.request(`/sync${pullParams}`);

    // Step 2: Apply remote changes to IndexedDB
    await applyRemoteChanges(remoteData);

    // Step 3: Push local changes
    const queue = await getSyncQueue();
    let pushResults = null;

    if (queue.length > 0) {
      console.log(`[Sync] Pushing ${queue.length} local operations`);
      const operations = queue.map(op => ({
        type: op.type,
        entity: op.entity,
        data: op.data,
        clientTimestamp: op.createdAt,
        tempId: op.tempId || null,
      }));

      pushResults = await api.request('/sync', {
        method: 'POST',
        body: JSON.stringify({ operations }),
      });

      // Step 4: Handle push results
      await handlePushResults(pushResults, queue);
    }

    // Step 5: Update last sync timestamp
    const serverTimestamp = pushResults?.serverTimestamp || remoteData.serverTimestamp;
    if (serverTimestamp) {
      await setLastSyncTime(serverTimestamp);
    }

    _retryCount = 0;
    _isSyncing = false;
    syncEvents.emit('syncComplete', { pushResults, remoteData });
    console.log('[Sync] Complete');
    return { status: 'ok', pushResults, remoteData };

  } catch (err) {
    console.error('[Sync] Error:', err);
    _isSyncing = false;
    _retryCount++;
    syncEvents.emit('syncError', { error: err.message, retryCount: _retryCount });

    // Schedule retry with exponential backoff
    scheduleRetry();

    return { status: 'error', error: err.message };
  }
}

/**
 * Apply remote changes from the server to IndexedDB
 */
async function applyRemoteChanges(remoteData) {
  const { expenses, categories, recurring, budget, fullSync } = remoteData;

  if (fullSync) {
    // On full sync, we trust the server completely
    if (expenses && expenses.length > 0) {
      await bulkPutExpenses(expenses);
    }
    if (categories && categories.length > 0) {
      await bulkPutCategories(categories);
    }
    if (recurring && recurring.length > 0) {
      await bulkPutRecurring(recurring);
    }
    if (budget) {
      await putBudget(budget);
    }
    console.log(`[Sync] Full sync applied: ${expenses?.length || 0} expenses, ${categories?.length || 0} categories, ${recurring?.length || 0} recurring`);
    return;
  }

  // Incremental sync — handle soft-deleted records
  if (expenses && expenses.length > 0) {
    const active = [];
    const deleted = [];
    for (const exp of expenses) {
      if (exp.deleted_at) {
        deleted.push(exp);
      } else {
        active.push(exp);
      }
    }
    if (active.length > 0) await bulkPutExpenses(active);
    for (const exp of deleted) {
      await removeExpense(exp.id);
    }
  }

  if (categories && categories.length > 0) {
    const active = categories.filter(c => !c.deleted_at);
    const deleted = categories.filter(c => c.deleted_at);
    if (active.length > 0) await bulkPutCategories(active);
    for (const cat of deleted) {
      const db = (await import('./offlineDb.js'));
      const dbInstance = await db.getDb();
      await dbInstance.delete('categories', cat.id);
    }
  }

  if (recurring && recurring.length > 0) {
    const active = recurring.filter(r => !r.deleted_at);
    const deleted = recurring.filter(r => r.deleted_at);
    if (active.length > 0) await bulkPutRecurring(active);
    for (const rec of deleted) {
      const db = (await import('./offlineDb.js'));
      const dbInstance = await db.getDb();
      await dbInstance.delete('recurring', rec.id);
    }
  }

  if (budget) {
    await putBudget(budget);
  }

  console.log(`[Sync] Incremental sync applied: ${expenses?.length || 0} expenses, ${categories?.length || 0} categories, ${recurring?.length || 0} recurring`);
}

/**
 * Handle results from pushing local changes
 */
async function handlePushResults(pushResults, queue) {
  if (!pushResults?.results) return;

  const completedIds = [];
  const conflicts = [];

  for (let i = 0; i < pushResults.results.length; i++) {
    const result = pushResults.results[i];
    const queueItem = queue[i];

    if (!queueItem) continue;

    if (result.status === 'ok') {
      completedIds.push(queueItem.id);

      // If a temp ID was used, update the local record with the server ID
      if (result.serverId && queueItem.tempId) {
        await remapLocalId(queueItem.entity, queueItem.tempId, result.serverId, result.data);
      } else if (result.data) {
        // Update local record with server data
        await updateLocalRecord(queueItem.entity, result.data);
      }
    } else if (result.status === 'conflict') {
      completedIds.push(queueItem.id); // Remove from queue — server wins
      conflicts.push(result);
      if (result.data) {
        await updateLocalRecord(queueItem.entity, result.data);
      }
      console.warn('[Sync] Conflict resolved (server wins):', result);
    } else if (result.status === 'not_found') {
      completedIds.push(queueItem.id); // Remove from queue — nothing to do
      console.warn('[Sync] Record not found on server:', result);
    } else if (result.status === 'error') {
      // Keep in queue for retry
      console.error('[Sync] Operation error:', result.error);
    }
  }

  // Clear completed operations from queue
  if (completedIds.length > 0) {
    await clearSyncQueueItems(completedIds);
  }

  if (conflicts.length > 0) {
    syncEvents.emit('syncConflict', { conflicts });
  }
}

/**
 * Remap a temporary local ID to the server-assigned ID
 */
async function remapLocalId(entity, tempId, serverId, serverData) {
  const storeMap = {
    expense: 'expenses',
    category: 'categories',
    recurring: 'recurring',
  };
  const storeName = storeMap[entity];
  if (!storeName) return;

  const { getDb } = await import('./offlineDb.js');
  const db = await getDb();
  const tx = db.transaction(storeName, 'readwrite');

  // Delete the temp record
  try {
    await tx.store.delete(tempId);
  } catch (e) {
    // Temp record may not exist
  }

  // Insert with server data
  if (serverData) {
    await tx.store.put(serverData);
  }

  await tx.done;
}

/**
 * Update a local record with server data
 */
async function updateLocalRecord(entity, data) {
  const { putExpense, putCategory, putRecurring, putBudget } = await import('./offlineDb.js');

  switch (entity) {
    case 'expense':
      await putExpense(data);
      break;
    case 'category':
      await putCategory(data);
      break;
    case 'recurring':
      await putRecurring(data);
      break;
    case 'budget':
      await putBudget(data);
      break;
  }
}

/**
 * Schedule a retry with exponential backoff
 */
function scheduleRetry() {
  if (_retryTimeout) clearTimeout(_retryTimeout);
  const delay = Math.min(1000 * Math.pow(2, _retryCount - 1), MAX_RETRY_DELAY);
  console.log(`[Sync] Retry scheduled in ${delay}ms (attempt ${_retryCount})`);
  _retryTimeout = setTimeout(() => {
    if (isOnline()) sync();
  }, delay);
}

/**
 * Start automatic sync on a regular interval
 */
export function startAutoSync() {
  stopAutoSync();
  _autoSyncInterval = setInterval(() => {
    if (isOnline() && !_isSyncing) {
      sync();
    }
  }, AUTO_SYNC_INTERVAL);

  // Listen for online event to trigger immediate sync
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  console.log('[Sync] Auto-sync started');
}

/**
 * Stop automatic sync
 */
export function stopAutoSync() {
  if (_autoSyncInterval) {
    clearInterval(_autoSyncInterval);
    _autoSyncInterval = null;
  }
  if (_retryTimeout) {
    clearTimeout(_retryTimeout);
    _retryTimeout = null;
  }
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  console.log('[Sync] Auto-sync stopped');
}

function handleOnline() {
  console.log('[Sync] Back online — triggering sync');
  syncEvents.emit('online');
  _retryCount = 0;
  setTimeout(() => sync(), 1000); // Small delay to let network stabilize
}

function handleOffline() {
  console.log('[Sync] Gone offline');
  syncEvents.emit('offline');
}

/**
 * Get current sync state
 */
export function isSyncing() {
  return _isSyncing;
}
