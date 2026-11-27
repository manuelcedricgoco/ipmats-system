import { Clock3, LogIn, Menu, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import ErrorBoundary from '../common/ErrorBoundary.jsx';
import Logo from './Logo.jsx';
import UserMenu from './UserMenu.jsx';

/**
 * PUBLIC PORTAL frame — open to everyone, no account needed. A top navigation bar (no sidebar):
 * logo on the left, the portal pages in the middle, Sign in (or the account menu) on the right;
 * on phones the links fold into a menu button. The staff workspace keeps its own sidebar
 * (AppLayout → WorkspaceShell); nothing here is shared with it except the logo and account menu.
 */
const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/projects', label: 'Projects' },
  { to: '/map', label: 'Project Map' },
];

const linkClass = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 ${
    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

/** Accounts waiting for approval (or declined) see the portal like any visitor, with this notice. */
function ApprovalBanner() {
  const { isAuthenticated, isPending, profile } = useAuth();
  if (!isAuthenticated || !isPending) return null;
  const declined = profile?.approval_status === 'rejected';
  const Icon = declined ? XCircle : Clock3;
  return (
    <div role="status" className={`border-b ${declined ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      <div className="mx-auto flex max-w-7xl items-start gap-2 px-4 py-2.5 text-sm sm:px-6">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${declined ? 'text-red-600' : 'text-amber-600'}`} aria-hidden />
        <p>
          {declined
            ? 'Your staff access request was declined. You can browse the public portal like any visitor.'
            : 'Your account is pending approval by the System Administrator. Until then you can browse the public portal only.'}{' '}
          <Link to="/account-pending" className="font-semibold underline underline-offset-2">Request status</Link>
        </p>
      </div>
    </div>
  );
}

export default function PublicLayout() {
  const { pathname } = useLocation();
  const { isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-slate-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[3000] focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-[1100] border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo to="/" />
          <nav aria-label="Public portal" className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <UserMenu />
            ) : (
              <Link
                to="/login"
                className="hidden items-center gap-1.5 rounded-lg bg-brand-800 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:inline-flex"
              >
                <LogIn className="h-4 w-4" aria-hidden /> Sign in
              </Link>
            )}
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 md:hidden"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="public-mobile-nav"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="public-mobile-nav" aria-label="Public portal" className="animate-fade-in border-t border-slate-200 bg-white px-4 py-3 md:hidden">
            <ul className="space-y-1">
              {LINKS.map((l) => (
                <li key={l.to}>
                  <NavLink to={l.to} end={l.end} className={(s) => `block ${linkClass(s)}`}>
                    {l.label}
                  </NavLink>
                </li>
              ))}
              {!isAuthenticated && (
                <li className="pt-2">
                  <Link to="/login" className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-800 px-3 py-2.5 text-sm font-semibold text-white">
                    <LogIn className="h-4 w-4" aria-hidden /> Sign in
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        )}
      </header>
      <ApprovalBanner />

      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <ErrorBoundary key={pathname}>
          <div className="animate-page-in">
            <Outlet />
          </div>
        </ErrorBoundary>
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <div className="flex flex-col gap-1 border-t border-slate-200 pt-4 text-xs text-slate-500 sm:flex-row sm:justify-between">
          <p>InfraWatch PH · Infrastructure Project Monitoring and Transparency System (IPMATS) · Occidental Mindoro (Region IV-B MIMAROPA)</p>
          <p>Figures are reported by DPWH personnel. They are for transparency and do not replace an official audit.</p>
        </div>
        <p className="mt-2 text-xs">
          <Link to="/report-status" className="font-semibold text-brand-700 underline-offset-2 hover:underline">Check a report</Link>
        </p>
      </footer>
    </div>
  );
}
