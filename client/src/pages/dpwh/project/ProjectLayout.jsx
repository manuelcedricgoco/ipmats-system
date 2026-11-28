import { ArrowLeft, Pencil } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { FlagBadge, Pill, StatusBadge } from '../../../components/common/Badges.jsx';
import Button from '../../../components/common/Button.jsx';
import { PageHeader } from '../../../components/common/Card.jsx';
import { ErrorState, PageLoader } from '../../../components/common/Feedback.jsx';
import ProgressBar from '../../../components/common/ProgressBar.jsx';
import DeleteProjectControls, { DeletionRequestNotice } from '../../../components/projects/DeleteProjectControls.jsx';
import PaccCaseChip from '../../../components/projects/PaccCaseChip.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { PROJECT_TYPES } from '../../../lib/constants.js';
import { projectPermissions } from '../../../lib/contractor.js';
import { isLocked } from '../../../lib/progress.js';

const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'bidding', label: 'Bidding' }, // 032 — bidding of the contract (read only for everyone but DPWH Personnel)
  { to: 'progress', label: 'Phases & progress' }, // Week 2 — Objective 3
  { to: 'finance', label: 'Finance' }, // Week 2 — Objective 4
  { to: 'images', label: '360° images' }, // Week 3 — Objective 2
  { to: 'flags', label: 'Flag & audit' }, // Week 3 — Objective 5
  { to: 'documents', label: 'Documents' }, // gap fix — supporting project documents
];

/** Project page frame: header, tabs, and the selected tab (Overview / Bidding / Phases & progress / Finance / …). */
export default function ProjectLayout() {
  const { id } = useParams();
  const { role } = useAuth();
  // Only DPWH Personnel create and edit project data (027); the Admin keeps the deletes. DPWH Personnel and
  // contractors (029, own company's projects only) report progress and upload photos; only Personnel confirm completion.
  const perms = projectPermissions(role);
  const { canEdit, canDelete, canReport, showPacc } = perms;
  const { data: p, loading, error, reload } = useApi(`/projects/${id}`, undefined, { select: (r) => r.data });
  // The project's latest deletion request: Personnel ask / cancel / use an approval; the Admin sees a pending one.
  // Wrapped, so `null` means "not loaded (yet), or the request failed" and a project with no request still reads as
  // loaded. A reload keeps the last answer, so the buttons do not flicker.
  const deletion = useApi(`/projects/${id}/deletion-request`, undefined, { enabled: canEdit || canDelete, select: (r) => ({ request: r.data }) });
  const tabsRef = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => {
    // Scroll only the tab strip sideways (not the page) so the open tab is centred.
    const nav = tabsRef.current;
    const active = nav?.querySelector('a[aria-current="page"]');
    if (nav && active) nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [pathname, p]);

  if (loading && !p) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <Link to="/app/projects" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {perms.isContractor ? 'My projects' : 'All projects'}
      </Link>
      <div className="mt-3">
        <PageHeader
          eyebrow={<span className="font-mono">{p.project_code}</span>}
          title={p.name}
          actions={
            <>
              {canEdit && <Button icon={Pencil} to={`/app/projects/${id}/edit`}>Edit</Button>}
              <DeleteProjectControls project={p} request={deletion.data?.request} requestLoaded={Boolean(deletion.data)} onChanged={deletion.reload} />
            </>
          }
        />
      </div>
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <FlagBadge flag={p.current_flag} />
        <StatusBadge status={p.status} verifiedAt={p.completion_verified_at} />
        {/* Staff only: contractors never see PACC data (the API strips it as well) */}
        {showPacc && <PaccCaseChip status={p.pacc_case_status} />}
        <Pill>{PROJECT_TYPES[p.project_type]}</Pill>
        {!canEdit && !canDelete && !canReport && <Pill className="bg-slate-800 text-white">Read-only</Pill>}
        <ProgressBar value={p.overall_progress} size="sm" className="w-full max-w-[12rem]" />
        {isLocked(p) && <Pill className="bg-emerald-700 text-white">Progress locked</Pill>}
      </div>
      <DeletionRequestNotice request={deletion.data?.request} />

      {/* On phones the seven tabs scroll sideways: the fade on the right shows there is more, and the open tab is scrolled into view. */}
      <div className="relative mb-6">
      <nav ref={tabsRef} aria-label="Project sections" className="relative flex gap-1 overflow-x-auto border-b border-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <NavLink
            key={t.label}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `relative whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'text-brand-800' : 'text-slate-500 hover:text-slate-800'}`
            }
          >
            {({ isActive }) => (
              <>
                {t.label}
                <span className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-700 transition-transform duration-300 ${isActive ? 'scale-x-100' : 'scale-x-0'}`} aria-hidden />
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <span className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-slate-50 to-transparent md:hidden" aria-hidden />
      </div>

      {/* each tab gets the project and a reload function. locked (030): the completion was verified, so progress,
          the phase plan and 360° photos can no longer change (finance and documents still can). */}
      <Outlet context={{ project: p, reloadProject: reload, ...perms, locked: isLocked(p) }} />
    </>
  );
}
