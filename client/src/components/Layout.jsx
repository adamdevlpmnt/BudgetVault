import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Receipt, PieChart, Tag, Settings } from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Accueil' },
  { path: '/expenses', icon: Receipt, label: 'Dépenses' },
  { path: '/analytics', icon: PieChart, label: 'Stats' },
  { path: '/categories', icon: Tag, label: 'Catégories' },
  { path: '/settings', icon: Settings, label: 'Réglages' },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="app-layout">
      <main className="page-content fade-in">
        <Outlet />
      </main>

      <nav className="bottom-nav" id="main-navigation">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
          return (
            <button
              key={path}
              className={`nav-item ${active ? 'active' : ''}`}
              onClick={() => navigate(path)}
              id={`nav-${label.toLowerCase()}`}
            >
              <span className="nav-icon">
                <Icon size={22} />
              </span>
              <span className="nav-label">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
