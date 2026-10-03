import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { PieChart, BarChart3, Calendar, RefreshCw, ChevronRight } from 'lucide-react';
import { offlineApi as api } from '../utils/offlineApi.js';
import { useAuth } from '../context/AuthContext';
import { formatMoney, formatDate, formatDateFull, cycleName, getCurrency, CURRENCIES } from '../utils/format';
import { sync, syncEvents } from '../utils/syncEngine.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import PullToRefresh from '../components/PullToRefresh.jsx';
import toast from 'react-hot-toast';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

export default function Analytics() {
  const { user } = useAuth();
  const [categoryData, setCategoryData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cycleDates, setCycleDates] = useState({ startDate: '', endDate: '' });
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [useCustomRange, setUseCustomRange] = useState(false);
  const initialLoadedRef = useRef(false);

  const loadData = useCallback(async (params = {}, isInitial = false) => {
    if (isInitial && !initialLoadedRef.current) setLoading(true);
    try {
      const [catData, histData] = await Promise.all([
        api.getByCategory(params),
        api.getHistory(12),
      ]);
      setCategoryData(catData);
      setHistory(Array.isArray(histData) ? histData : (histData?.history || []));
      initialLoadedRef.current = true;

      // Store cycle dates from response
      if (!params.startDate && catData?.startDate && catData?.endDate) {
        setCycleDates({ startDate: catData.startDate, endDate: catData.endDate });
        setDateRange(prev => {
          if (!prev.startDate) {
            return { startDate: catData.startDate, endDate: catData.endDate };
          }
          return prev;
        });
      }
    } catch (err) {
      console.warn('[Analytics] loadData error:', err);
      if (isInitial) toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(useCustomRange ? dateRange : {}, !initialLoadedRef.current);

    const unsubSync = syncEvents.on('syncComplete', () => loadData(useCustomRange ? dateRange : {}, false));
    const unsubPending = syncEvents.on('pendingChange', () => loadData(useCustomRange ? dateRange : {}, false));

    return () => {
      unsubSync();
      unsubPending();
    };
  }, [loadData, useCustomRange, dateRange]);

  // Mobile pull to refresh
  const handlePullRefresh = useCallback(async () => {
    await sync();
    await loadData(useCustomRange ? dateRange : {}, false);
  }, [loadData, useCustomRange, dateRange]);

  const { pullDistance, isRefreshing, isReady } = usePullToRefresh(handlePullRefresh);

  const handleFilter = () => {
    if (dateRange.startDate && dateRange.endDate) {
      setUseCustomRange(true);
      loadData({ startDate: dateRange.startDate, endDate: dateRange.endDate });
    }
  };

  const resetFilter = () => {
    setUseCustomRange(false);
    setDateRange({ startDate: cycleDates.startDate, endDate: cycleDates.endDate });
    loadData({});
  };

  const currencySymbol = CURRENCIES[getCurrency()]?.symbol || '€';

  const pieData = useMemo(() => {
    if (!categoryData?.categories?.length) return null;
    return {
      labels: categoryData.categories.map(c => c.name),
      datasets: [{
        data: categoryData.categories.map(c => c.total),
        backgroundColor: categoryData.categories.map(c => c.color),
        borderColor: 'transparent',
        borderWidth: 2,
        hoverOffset: 6,
      }],
    };
  }, [categoryData]);

  const pieOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    animation: {
      duration: 350,
      easing: 'easeOutQuad',
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#111c2a',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        titleColor: '#ffffff',
        bodyColor: '#94a3b8',
        padding: 12,
        cornerRadius: 12,
        callbacks: {
          label: (ctx) => ` ${formatMoney(ctx.raw)} (${categoryData?.categories?.[ctx.dataIndex]?.percentage || 0}%)`,
        },
      },
    },
  }), [categoryData]);

  const barData = useMemo(() => ({
    labels: history.map(h => cycleName(h.cycleKey || h.cycle_key)).reverse(),
    datasets: [{
      label: 'Dépenses',
      data: history.map(h => h.totalExpenses ?? h.total ?? 0).reverse(),
      backgroundColor: 'rgba(245, 158, 11, 0.65)',
      borderColor: '#f59e0b',
      borderWidth: 1.5,
      borderRadius: 8,
    }],
  }), [history]);

  const barOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 350,
      easing: 'easeOutQuad',
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#111c2a',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        titleColor: '#ffffff',
        bodyColor: '#94a3b8',
        padding: 12,
        cornerRadius: 12,
        callbacks: { label: (ctx) => ` ${formatMoney(ctx.raw)}` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11, weight: 600 } } },
      y: { grid: { color: 'rgba(150,150,150,0.1)' }, ticks: { color: '#64748b', callback: v => `${v}${currencySymbol}` } },
    },
  }), [currencySymbol]);

  // Period label for subtitle
  const periodLabel = useCustomRange
    ? `${formatDateFull(dateRange.startDate)} → ${formatDateFull(dateRange.endDate)}`
    : cycleDates.startDate
      ? `Cycle : ${formatDateFull(cycleDates.startDate)} → ${formatDateFull(cycleDates.endDate)}`
      : '';

  return (
    <div className="analytics-container">
      <PullToRefresh pullDistance={pullDistance} isRefreshing={isRefreshing} isReady={isReady} />

      <div className="page-header mb-4">
        <h1 className="page-title" style={{ fontSize: '2rem', fontWeight: 900 }}>Statistiques</h1>
        <p className="page-subtitle" style={{ color: 'var(--text-muted)' }}>{periodLabel}</p>
      </div>

      {/* Date Filter Card */}
      <div className="card mb-4" style={{ background: 'var(--bg-surface)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={16} color="var(--gold-light)" />
          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>
            {useCustomRange ? 'Période personnalisée' : 'Période du cycle en cours'}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            className="input"
            type="date"
            value={dateRange.startDate}
            onChange={e => setDateRange(p => ({ ...p, startDate: e.target.value }))}
            style={{ flex: 1, padding: '10px 12px', minHeight: 42, fontSize: '0.85rem' }}
          />
          <input
            className="input"
            type="date"
            value={dateRange.endDate}
            onChange={e => setDateRange(p => ({ ...p, endDate: e.target.value }))}
            style={{ flex: 1, padding: '10px 12px', minHeight: 42, fontSize: '0.85rem' }}
          />
        </div>
        <div className="flex gap-2 mt-3">
          <button
            className="btn btn-sm"
            onClick={handleFilter}
            style={{ flex: 1, background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#0b131e', fontWeight: 800 }}
          >
            Filtrer
          </button>
          {useCustomRange && (
            <button className="btn btn-ghost btn-sm" onClick={resetFilter}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Pie Chart Card */}
      <div className="chart-container mb-4" style={{ background: 'var(--bg-surface)' }}>
        <div className="chart-title" style={{ color: 'var(--text)', fontWeight: 800 }}>
          <PieChart size={18} color="var(--gold-light)" />
          Répartition par catégorie
        </div>
        {loading && !categoryData ? (
          <div className="skeleton" style={{ height: 250, borderRadius: 16 }} />
        ) : categoryData && categoryData.categories && categoryData.categories.length > 0 ? (
          <>
            <div style={{ height: 240, position: 'relative', margin: '14px 0' }}>
              <Doughnut data={pieData} options={pieOptions} />
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)' }}>
                  {formatMoney(categoryData.total)}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total dépensé</div>
              </div>
            </div>

            {/* Detailed Categories breakdown */}
            <div className="mt-3">
              {categoryData.categories.map(c => (
                <div
                  key={c.id || 'none'}
                  className="flex items-center justify-between"
                  style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        background: c.color,
                        boxShadow: `0 0 8px ${c.color}50`,
                      }}
                    />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{c.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>{c.percentage}%</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)' }}>{formatMoney(c.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state"><p>Aucune donnée pour cette période</p></div>
        )}
      </div>

      {/* Bar Chart - History */}
      <div className="chart-container" style={{ background: 'var(--bg-surface)' }}>
        <div className="chart-title" style={{ color: 'var(--text)', fontWeight: 800 }}>
          <BarChart3 size={18} color="var(--gold-light)" />
          Historique mensuel
        </div>
        {history.length > 0 ? (
          <div style={{ height: 250, marginTop: 12 }}>
            <Bar data={barData} options={barOptions} />
          </div>
        ) : (
          <div className="empty-state"><p>Pas assez de données</p></div>
        )}
      </div>
    </div>
  );
}
