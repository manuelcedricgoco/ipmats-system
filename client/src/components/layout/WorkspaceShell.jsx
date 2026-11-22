import { Menu, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from '../common/ErrorBoundary.jsx';
import Logo from './Logo.jsx';
import UserMenu from './UserMenu.jsx';

/**
 * Shared frame for every signed-in area (staff workspace and public portal):
 * a floating sidebar with rounded corners, a floating top bar and the page area.
 *
 * sections: [{ title, items: [{ to, label, icon, end?, badge? }] }]
 * footerLinks: [{ to, label, icon }]
 */
function SidebarPanel({ homeTo, tag, sections, footerLinks, onNavigate, onClose }) {
  let n = 0; // running index for the staggered entrance
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-r-2xl bg-gradient-to-b from-brand-900 via-brand-900 to-brand-950 text-white shadow-panel">
      {/* soft light in the corner */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-accent-500/10 blur-3xl" aria-hidden />

      <div className="relative flex h-16 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-5">
        <Logo to={homeTo} light subtitle={false} />
        {onClose ? (
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white transition-all duration-200 hover:rotate-90 hover:bg-white/10" aria-label="Close navigation">
            <X className="h-5 w-5" />
          </button>
        ) : (
          tag && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-300">{tag}</span>
        )}
      </div>

      <nav className="relative flex-1 space-y-5 overflow-y-auto px-3 py-4 [scrollbar-width:thin]" aria-label="Main">
        {sections.map((section) =>
          section.items.length ? (
            <div key={section.title}>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-300">{section.title}</p>
              <ul className="mt-1.5 space-y-0.5">
                {section.items.map(({ to, label, icon: Icon, end, badge }) => (
                  <li key={to} className="animate-nav-in" style={{ animationDelay: `${60 + n++ * 35}ms` }}>
                    <NavLink
                      to={to}
                      end={end}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        `group relative flex items-center gap-3 rounded-xl px-3 py-1 text-sm font-medium outline-none transition-all duration-300 ease-out focus-visible:ring-2 focus-visible:ring-accent-400 ${
                          isActive ? 'bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'text-brand-100 hover:translate-x-1 hover:bg-white/[0.06] hover:text-white'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className={`absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-accent-400 transition-transform duration-300 ease-out ${isActive ? 'scale-y-100' : 'scale-y-0'}`}
                            aria-hidden
                          />
                          <span
                            className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-all duration-300 ${
                              isActive ? 'bg-accent-400 text-brand-950 shadow-[0_6px_16px_-6px_rgba(246,185,43,0.7)]' : 'bg-white/[0.06] text-brand-100 group-hover:bg-white/10 group-hover:text-white'
                            }`}
                          >
                            <Icon className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" aria-hidden />
                          </span>
                          <span className="truncate">{label}</span>
                          {badge > 0 && (
                            <span className="ml-auto animate-pop-in rounded-full bg-accent-400 px-1.5 text-[11px] font-bold text-brand-950" aria-label={`${badge} pending`}>
                              {badge}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </nav>

      {footerLinks?.length > 0 && (
        <div className="relative space-y-0.5 border-t border-white/10 p-2.5">
          {footerLinks.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300 hover:translate-x-1 ${isActive ? 'bg-white/[0.12] text-white' : 'text-brand-100 hover:bg-white/[0.06] hover:text-white'}`
              }
            >
              <Icon className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" aria-hidden /> {label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkspaceShell({ homeTo, tag, sections, footerLinks, headerLeft, headerExtra, pageFooter }) {
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState('closed'); // closed | open | closing
  const closeTimer = useRef(null);

  const close = useCallback(() => {
    setDrawer((d) => (d === 'open' ? 'closing' : d));
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setDrawer('closed'), 220);
  }, []);

  useEffect(() => close(), [pathname, close]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (drawer !== 'open') return undefined;
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [drawer, close]);

  const panel = (onNavigate, onClose) => <SidebarPanel homeTo={homeTo} tag={tag} sections={sections} footerLinks={footerLinks} onNavigate={onNavigate} onClose={onClose} />;
  const closing = drawer === 'closing';

  return (
    <div className="min-h-screen bg-slate-100/70">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[3000] focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* desktop: full-height sidebar on the left edge, right corners rounded */}
      <aside className="fixed inset-y-0 left-0 z-[1000] hidden w-64 animate-slide-in-left lg:block">{panel(undefined)}</aside>

      {/* phones / tablets: the same sidebar as a drawer that slides in and out */}
      {drawer !== 'closed' && (
        <div className="fixed inset-0 z-[1300] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className={`absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] ${closing ? 'animate-fade-out' : 'animate-fade-in'}`} onClick={close} />
          <div className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] ${closing ? 'animate-slide-out-left' : 'animate-slide-in-left'}`}>
            {panel(close, close)}
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        {/* top bar: a normal flat bar across the page (no rounded corners) */}
        <header className="sticky top-0 z-[900]">
          <div className="flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="rounded-lg p-2 text-slate-600 transition-all duration-200 hover:bg-slate-100 active:scale-95 lg:hidden"
                onClick={() => setDrawer('open')}
                aria-label="Open navigation"
                aria-expanded={drawer === 'open'}
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0 text-sm">{headerLeft}</div>
            </div>
            <div className="flex items-center gap-2">
              {headerExtra}
              <UserMenu />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          <ErrorBoundary key={pathname}>
            <div key={pathname} className="animate-page-in">
              <Outlet />
            </div>
          </ErrorBoundary>
        </main>
        {pageFooter && <footer className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">{pageFooter}</footer>}
      </div>
    </div>
  );
}

