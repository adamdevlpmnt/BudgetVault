import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SyncProvider } from './context/SyncContext.jsx';
import { getDb } from './utils/offlineDb.js';
import './index.css';

// Initialize IndexedDB early
getDb().catch(err => console.warn('IndexedDB init warning:', err));

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SyncProvider>
      <App />
    </SyncProvider>
  </React.StrictMode>
);
