import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { PieChart, BarChart3, Calendar } from 'lucide-react';
import { offlineApi as api } from '../utils/offlineApi.js';
import { useAuth } from '../context/AuthContext';
import { formatMoney, formatDate, formatDateFull, cycleName, getCurrency, CURRENCIES } from '../utils/format';
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (params = {}) => {
    setLoading(true);
    try {
      const [catData, histData] = await Promise.all([
        api.getByCategory(params),
        api.getHistory(12),
      ]);
      setCategoryData(catData);
      setHistory(histData);

      // Store cycle dates from the API response (default = current cycle)
      if (!params.startDate && catData.startDate && catData.endDate) {
        setCycleDates({ startDate: catData.startDate, endDate: catData.endDate });
        setDateRange({ startDate: catData.startDate, endDate: catData.endDate });
      }
    } catch { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  };

  const handleFilter = () => {
    if (dateRange.startDate && dateRange.endDate) {
      setUseCustomRange(true);
      loadData({ startDate: dateRange.startDate, endDate: dateRange.endDate });
    }
  };

  const resetFilter = () => {
    setUseCustomRange(false);
    setDateRange({ startDate: cycleDates.startDate, endDate: cycleDates.endDate });
    loadData();
  };

  const currencySymbol = CURRENCIES[getCurrency()]?.symbol || '€';

  const pieData = categoryData ? {
    labels: categoryData.categories.map(c => c.name),
    datasets: [{
      data: categoryData.categories.map(c => c.total),
      backgroundColor: categoryData.categories.map(c => c.color),
      borderColor: 'transparent',
      borderWidth: 0,
      hoverOffset: 8,
    }],
  } : null;

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1a3e',
        borderColor: '#2a2a5a',
        borderWidth: 1,
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => ` ${formatMoney(ctx.raw)} (${categoryData.categories[ctx.dataIndex].percentage}%)`,
        },
      },
    },
  };

  const barData = {
    labels: history.map(h => cycleName(h.cycleKey)).reverse(),
    datasets: [{
      label: 'Dépenses',
      data: history.map(h => h.totalExpenses).reverse(),
      backgroundColor: 'rgba(99, 102, 241, 0.6)',
      borderColor: '#6366f1',
      borderWidth: 1,
      borderRadius: 6,
    }],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1a3e',
        borderColor: '#2a2a5a',
        borderWidth: 1,
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        padding: 12,
        cornerRadius: 8,
        callbacks: { label: (ctx) => ` ${formatMoney(ctx.raw)}` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', callback: v => `${v}${currencySymbol}` } },
    },
  };

  // Period label for subtitle
  const periodLabel = useCustomRange
    ? `${formatDateFull(dateRange.startDate)} → ${formatDateFull(dateRange.endDate)}`
    : cycleDates.startDate
      ? `Cycle : ${formatDateFull(cycleDates.startDate)} → ${formatDateFull(cycleDates.endDate)}`
      : '';

  if (loading) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Statistiques</h1></div>
        <div className="skeleton" style={{ height: 300, borderRadius: 16 }} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Statistiques</h1>
        <p className="page-subtitle">{periodLabel}</p>
      </div>

      {/* Date Filter */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={16} color="var(--primary-light)" />
          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
            {useCustomRange ? 'Période personnalisée' : 'Période du cycle en cours'}
          </span>
        </div>
        <div className="flex gap-2">
          <input className="input" type="date" value={dateRange.startDate} onChange={e => setDateRange(p => ({ ...p, startDate: e.target.value }))} style={{ flex: 1 }} />
          <input className="input" type="date" value={dateRange.endDate} onChange={e => setDateRange(p => ({ ...p, endDate: e.target.value }))} style={{ flex: 1 }} />
        </div>
        <div className="flex gap-2 mt-2">
          <button className="btn btn-primary btn-sm" onClick={handleFilter} style={{ flex: 1 }}>Filtrer</button>
          {useCustomRange && <button className="btn btn-ghost btn-sm" onClick={resetFilter}>Réinitialiser</button>}
        </div>
      </div>

      {/* Pie Chart */}
      <div className="chart-container">
        <div className="chart-title">
          <PieChart size={18} color="var(--primary-light)" />
          Répartition par catégorie
        </div>
        {categoryData && categoryData.categories.length > 0 ? (
          <>
            <div style={{ height: 250, position: 'relative' }}>
              <Doughnut data={pieData} options={pieOptions} />
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{formatMoney(categoryData.total)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total</div>
              </div>
            </div>
            {/* Legend */}
            <div className="mt-3">
              {categoryData.categories.map(c => (
                <div key={c.id || 'none'} className="flex items-center justify-between" style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-center gap-2">
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: c.color }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{c.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.percentage}%</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{formatMoney(c.total)}</span>
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
      <div className="chart-container">
        <div className="chart-title">
          <BarChart3 size={18} color="var(--primary-light)" />
          Historique mensuel
        </div>
        {history.length > 0 ? (
          <div style={{ height: 250 }}>
            <Bar data={barData} options={barOptions} />
          </div>
        ) : (
          <div className="empty-state"><p>Pas assez de données</p></div>
        )}
      </div>
    </div>
  );
}
