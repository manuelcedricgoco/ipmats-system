import { LayoutDashboard, LogIn, UserPlus } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Button from '../common/Button.jsx';
import ErrorBoundary from '../common/ErrorBoundary.jsx';
import Logo from './Logo.jsx';
import UserMenu from './UserMenu.jsx';

/** PUBLIC PORTAL frame: open to everyone; signed-in users see their account menu. */
export default function PublicLayout() {
  const { isAuthenticated, isStaff } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[3000] focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-[1100] border-b border-brand-950 bg-brand-900 text-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo light />
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                {isStaff && (
                  <Button to="/app" variant="accent" size="sm" icon={LayoutDashboard}>
                    <span className="hidden sm:inline">Staff workspace</span>
                    <span className="sm:hidden">Workspace</span>
                  </Button>
                )}
                <UserMenu dark />
              </>
            ) : (
              <>
                <Link to="/register" className="hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:inline-flex">
                  <UserPlus className="h-4 w-4" aria-hidden /> Register
                </Link>
                <Button to="/login" variant="accent" size="sm" icon={LogIn}>
                  Sign in
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        <ErrorBoundary key={pathname}>
          <div key={pathname} className="animate-page-in">
            <Outlet />
          </div>
        </ErrorBoundary>
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:justify-between sm:px-6">
          <p>IPMATS · DPWH 360° Infrastructure Project Monitoring and Transparency System · Occidental Mindoro (Region IV-B MIMAROPA)</p>
          <p>Figures are reported by DPWH personnel. They are for transparency and do not replace an official audit.</p>
        </div>
      </footer>
    </div>
  );
}
