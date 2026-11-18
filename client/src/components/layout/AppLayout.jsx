import { Building2, FolderKanban, Landmark, LayoutDashboard, Menu, UserRound, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import ErrorBoundary from '../common/ErrorBoundary.jsx';
import { useApi } from '../../hooks/useApi.js';
import { ROLE_LABELS } from '../../lib/constants.js';
import Logo from './Logo.jsx';
import UserMenu from './UserMenu.jsx';

const ALL = ['admin', 'dpwh_personnel', 'auditor'];
// Week 1 modules. Later weeks add Phases, Financial, 360° monitoring, GIS map, Flags, Audit and Reports here.
const SECTIONS = [
  {
    title: 'Records',
    items: [
      { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ALL },
      { to: '/app/projects', label: 'Project Management', icon: FolderKanban, roles: ALL },
      { to: '/app/contractors', label: 'Contractors', icon: Building2, roles: ALL },
      { to: '/app/agencies', label: 'Offices & Agencies', icon: Landmark, roles: ALL },
    ],
  },
  {
    title: 'Administration',
    items: [{ to: '/app/users', label: 'User Management', icon: Users, roles: ['admin'] }],
  },
];

function SidebarNav({ role, onNavigate, badges = {} }) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Workspace">
      {SECTIONS.map((section) => {
        const items = section.items.filter((i) => i.roles.includes(role));
        if (!items.length) return null;
        return (
          <div key={section.title}>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-300">{section.title}</p>
            <ul className="mt-2 space-y-0.5">
              {items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
                        isActive ? 'bg-white/10 text-white shadow-[inset_3px_0_0_#f6b92b]' : 'text-brand-100 hover:translate-x-0.5 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" aria-hidden />
                    {label}
                    {badges[to] > 0 && (
                      <span className="ml-auto rounded-full bg-accent-400 px-1.5 text-[11px] font-bold text-brand-950" aria-label={`${badges[to]} pending`}>
                        {badges[to]}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export default function AppLayout() {
  const { role, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  // Admins see how many staff access requests are waiting (refreshes on navigation).
  const pendingUsers = useApi('/users', { approval_status: 'pending', pageSize: 1, _: pathname }, { enabled: role === 'admin', select: (r) => r.total });
  const badges = { '/app/users': pendingUsers.data || 0 };

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-900">
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <Logo to="/app" light subtitle={false} />
      </div>
      <SidebarNav role={role} badges={badges} onNavigate={() => setOpen(false)} />
      <div className="space-y-0.5 border-t border-white/10 p-3">
        <NavLink to="/app/account" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-brand-100 transition-colors hover:bg-white/5 hover:text-white">
          <UserRound className="h-4 w-4" aria-hidden /> My account
        </NavLink>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[3000] focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-[1000] hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-[1300] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/60 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-slide-in-left shadow-panel">
            {sidebar}
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded p-1 text-white hover:bg-white/10" aria-label="Close navigation">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-[900] flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-md p-2 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden text-sm sm:block">
              <span className="font-semibold text-slate-900">{ROLE_LABELS[role]}</span>
              {profile?.position && <span className="text-slate-500"> · {profile.position}</span>}
            </div>
          </div>
          <UserMenu />
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          <ErrorBoundary key={pathname}>
            <div key={pathname} className="animate-page-in">
              <Outlet />
            </div>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
