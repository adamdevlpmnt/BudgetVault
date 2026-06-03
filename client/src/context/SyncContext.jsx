import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { syncEvents, sync, startAutoSync, stopAutoSync, isOnline as checkOnline } from '../utils/syncEngine.js';
import { getPendingCount, getLastSyncTime } from '../utils/offlineDb.js';

const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | error | offline
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTimeState] = useState(null);
  const [lastError, setLastError] = useState(null);
  const initialized = useRef(false);

  // Update pending count
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch (e) {
      // IndexedDB may not be ready yet
    }
  }, []);

  // Update last sync time
  const refreshLastSyncTime = useCallback(async () => {
    try {
      const time = await getLastSyncTime();
      setLastSyncTimeState(time);
    } catch (e) {
      // IndexedDB may not be ready yet
    }
  }, []);

  // Trigger manual sync
  const triggerSync = useCallback(async () => {
    if (!checkOnline()) return;
    await sync();
  }, []);

  // Initialize sync engine and listeners
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Initial state
    refreshPendingCount();
    refreshLastSyncTime();

    // Sync event listeners
    const unsubStart = syncEvents.on('syncStart', () => {
      setSyncStatus('syncing');
    });

    const unsubComplete = syncEvents.on('syncComplete', () => {
      setSyncStatus('idle');
      setLastError(null);
      refreshPendingCount();
      refreshLastSyncTime();
    });

    const unsubError = syncEvents.on('syncError', ({ error }) => {
      setSyncStatus('error');
      setLastError(error);
      refreshPendingCount();
    });

    const unsubOnline = syncEvents.on('online', () => {
      setIsOnline(true);
      setSyncStatus('idle');
    });

    const unsubOffline = syncEvents.on('offline', () => {
      setIsOnline(false);
      setSyncStatus('offline');
    });

    const unsubPending = syncEvents.on('pendingChange', () => {
      refreshPendingCount();
    });

    const unsubConflict = syncEvents.on('syncConflict', ({ conflicts }) => {
      console.warn('[SyncContext] Conflicts resolved:', conflicts.length);
    });

    // Browser online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Start auto-sync if we have a token
    const token = localStorage.getItem('budgetvault_token');
    if (token) {
      startAutoSync();
      // Initial sync
      if (navigator.onLine) {
        setTimeout(() => sync(), 2000);
      }
    }

    return () => {
      unsubStart();
      unsubComplete();
      unsubError();
      unsubOnline();
      unsubOffline();
      unsubPending();
      unsubConflict();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      stopAutoSync();
    };
  }, [refreshPendingCount, refreshLastSyncTime]);

  const value = {
    isOnline,
    syncStatus,
    pendingCount,
    lastSyncTime,
    lastError,
    triggerSync,
    refreshPendingCount,
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
