import { useState, useEffect } from 'react';
import { useSync } from '../context/SyncContext.jsx';
import { Wifi, WifiOff, RefreshCw, AlertCircle, Check, Clock } from 'lucide-react';

/**
 * SyncStatusBar — displays online/offline status, sync progress, and pending changes
 * Shown at the top of the app, auto-hides when synced
 */
export default function SyncStatusBar() {
  const { isOnline, syncStatus, pendingCount, lastSyncTime, lastError, triggerSync } = useSync();
  const [visible, setVisible] = useState(false);
  const [hideTimeout, setHideTimeout] = useState(null);

  useEffect(() => {
    // Show bar on status changes
    if (syncStatus === 'syncing' || syncStatus === 'error' || !isOnline || pendingCount > 0) {
      setVisible(true);
      if (hideTimeout) clearTimeout(hideTimeout);
    } else if (syncStatus === 'idle' && isOnline && pendingCount === 0) {
      // Show "synced" briefly then hide
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 3000);
      setHideTimeout(t);
    }

    return () => {
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, [syncStatus, isOnline, pendingCount]);

  const formatLastSync = (timestamp) => {
    if (!timestamp) return 'Jamais';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const getStatusConfig = () => {
    if (!isOnline) {
      return {
        className: 'sync-bar sync-bar--offline',
        icon: <WifiOff size={14} />,
        text: pendingCount > 0
          ? `Hors ligne • ${pendingCount} modif${pendingCount > 1 ? 's' : ''} en attente`
          : 'Hors ligne',
        showRetry: false,
      };
    }

    if (syncStatus === 'syncing') {
      return {
        className: 'sync-bar sync-bar--syncing',
        icon: <RefreshCw size={14} className="sync-spinner" />,
        text: pendingCount > 0 ? `Synchronisation... (${pendingCount})` : 'Synchronisation...',
        showRetry: false,
      };
    }

    if (syncStatus === 'error') {
      return {
        className: 'sync-bar sync-bar--error',
        icon: <AlertCircle size={14} />,
        text: lastError || 'Erreur de synchronisation',
        showRetry: true,
      };
    }

    if (pendingCount > 0) {
      return {
        className: 'sync-bar sync-bar--pending',
        icon: <Clock size={14} />,
        text: `${pendingCount} modif${pendingCount > 1 ? 's' : ''} en attente`,
        showRetry: true,
      };
    }

    return {
      className: 'sync-bar sync-bar--synced',
      icon: <Check size={14} />,
      text: `Synchronisé • ${formatLastSync(lastSyncTime)}`,
      showRetry: false,
    };
  };

  if (!visible) return null;

  const config = getStatusConfig();

  return (
    <div className={config.className}>
      <div className="sync-bar__content">
        <span className="sync-bar__icon">{config.icon}</span>
        <span className="sync-bar__text">{config.text}</span>
        {config.showRetry && (
          <button className="sync-bar__retry" onClick={triggerSync} aria-label="Réessayer la synchronisation">
            <RefreshCw size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
