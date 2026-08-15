import React from 'react';
import { RefreshCw, ArrowDown } from 'lucide-react';

/**
 * Visual indicator for pull-to-refresh
 */
export default function PullToRefresh({ pullDistance, isRefreshing, isReady }) {
  if (pullDistance <= 0 && !isRefreshing) return null;

  const opacity = Math.min(pullDistance / 40, 1);
  const rotation = Math.min(pullDistance * 2.5, 180);

  return (
    <div
      className="pull-to-refresh-container"
      style={{
        transform: `translateY(${Math.min(pullDistance, 60)}px)`,
        opacity,
      }}
    >
      <div className={`pull-to-refresh-badge ${isReady ? 'ready' : ''} ${isRefreshing ? 'refreshing' : ''}`}>
        {isRefreshing ? (
          <RefreshCw size={18} className="pull-spinner" />
        ) : (
          <ArrowDown
            size={18}
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: 'transform 0.1s ease',
            }}
          />
        )}
        <span className="pull-text">
          {isRefreshing
            ? 'Synchronisation...'
            : isReady
            ? 'Relâcher pour actualiser'
            : 'Tirer pour actualiser'}
        </span>
      </div>
    </div>
  );
}
