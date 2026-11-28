import { ArrowRight, CameraOff, LocateFixed, Megaphone, ShieldAlert, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FlagBadge, Pill, StatusBadge } from '../common/Badges.jsx';
import Button from '../common/Button.jsx';
import { ErrorState, Skeleton } from '../common/Feedback.jsx';
import PanoramaViewer from '../viewer360/PanoramaViewer.jsx';
import ReportProblemModal from './ReportProblemModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useReference } from '../../hooks/useReference.js';
import { PROJECT_TYPES } from '../../lib/constants.js';
import { date, pesoWhole, sentenceCase } from '../../lib/format.js';
import { PUBLIC_CASE_STATUS_LABELS } from '../../lib/pacc.js';

/** The open project lives in the URL (?project=<id>), so a drawer can be linked to and survives a reload. */
export function useOpenProject() {
  const [params, setParams] = useSearchParams();
  const openId = params.get('project');
  const setParam = useCallback(
    (id) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('project', id);
          else next.delete('project');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return { openId, open: setParam, close: useCallback(() => setParam(null), [setParam]) };
}

function Detail({ label, children }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-900">{children}</dd>
    </>
  );
}

/**
 * PUBLIC PORTAL — project drawer. It sits OVER THE MAP (inside the map box): a panel on the right
 * on wider screens, a bottom sheet on phones, so the map stays visible and usable beside it.
 * Header → 360° viewer (or a slim "no photo" row) → status and physical progress → contract
 * cost → location / office / contractor → actions → "Magsumbong / Report a problem". It scrolls on its own;
 * the page does not. The API sends only public fields (no automatic flag, findings, finances or activity).
 * A PACC case status is shown only when PACC chose to make it public (`pacc_public_status`); it appears here
 * only, never on cards or map pins, and no report counts are shown anywhere public.
 */
export default function ProjectDrawer({ projectId, onClose, onRecenter }) {
  const { data, loading, error, reload } = useApi(projectId ? `/public/projects/${projectId}` : null, undefined, { select: (r) => r.data });
  const { ref } = useReference();
  const { isStaff, isPending } = useAuth();
  const [imageIndex, setImageIndex] = useState(0);
  const [reporting, setReporting] = useState(false);
  const reportingRef = useRef(false);
  reportingRef.current = reporting;
  const closeBtn = useRef(null);
  const closeReport = useCallback(() => setReporting(false), []);

  useEffect(() => {
    setImageIndex(0);
    setReporting(false);
  }, [projectId]);
  useEffect(() => {
    if (!projectId) return undefined;
    closeBtn.current?.focus({ preventScroll: true });
    // Escape while the report dialog is open closes only the dialog.
    const onKey = (e) => e.key === 'Escape' && !reportingRef.current && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [projectId, onClose]);

  if (!projectId) return null;
  const p = data?.project;
  const images = data?.images || [];
  const image = images[imageIndex];
  const placeNames = [...(ref?.municipalities || []), ...(ref?.barangays || [])].map((x) => x.name);
  const progress = Math.max(0, Math.min(100, Number(p?.overall_progress || 0)));

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="project-drawer-title"
      className="absolute inset-x-0 bottom-0 z-[1001] flex max-h-[65%] animate-slide-up flex-col overflow-hidden rounded-t-xl bg-white shadow-panel ring-1 ring-slate-200 sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-3 sm:max-h-none sm:w-[360px] sm:animate-slide-in-right sm:rounded-xl"
    >
      {/* 1. Header */}
      <div className="flex items-start gap-2 border-b border-slate-200 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] text-brand-700">
            {p ? `${p.project_code} · ${PROJECT_TYPES[p.project_type] || p.project_type}` : 'Project'}
          </p>
          <h2 id="project-drawer-title" className="text-[15px] font-semibold leading-snug text-slate-900">
            {p ? sentenceCase(p.name, placeNames) : loading ? 'Loading…' : 'Project'}
          </h2>
        </div>
        <button
          ref={closeBtn}
          type="button"
          onClick={onClose}
          className="-mr-1.5 shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
          aria-label="Close project details"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {error && <div className="p-4"><ErrorState error={error} onRetry={reload} /></div>}
        {!error && loading && !data && (
          <div className="space-y-3 p-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}
        {!error && p && (
          <div className="divide-y divide-slate-100">
            {/* 2. 360° viewer, or one slim row when there is no published photo */}
            {image ? (
              <div className="px-3 pb-2 pt-3">
                <PanoramaViewer key={image.id} url={image.url} className="h-[200px]" />
                {(images.length > 1 || image.caption) && (
                  <div className="flex flex-wrap items-center gap-1.5 px-1 pt-2 text-xs">
                    {images.length > 1 &&
                      images.map((img, i) => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => setImageIndex(i)}
                          aria-pressed={i === imageIndex}
                          className={`rounded px-1.5 py-0.5 ring-1 ring-inset transition-colors ${i === imageIndex ? 'bg-brand-700 text-white ring-brand-700' : 'text-slate-600 ring-slate-300 hover:bg-slate-100'}`}
                        >
                          {date(img.inspection_date)}
                        </button>
                      ))}
                    {image.caption && <span className="text-slate-500">{image.caption}</span>}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-9 items-center gap-2 bg-slate-50 px-4 text-xs text-slate-500">
                <CameraOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
                No 360° photo published yet
              </div>
            )}

            {/* 3. Status and physical progress (weighted accomplishment of the construction phases) */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={p.status} verifiedAt={p.completion_verified_at} />
                  <FlagBadge flag={p.public_flag} long size="sm" emptyLabel="Flag under review" />
                  {PUBLIC_CASE_STATUS_LABELS[p.pacc_public_status] && (
                    <Pill className="bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200">
                      <ShieldAlert className="mr-1 h-3 w-3" aria-hidden />
                      {PUBLIC_CASE_STATUS_LABELS[p.pacc_public_status]}
                    </Pill>
                  )}
                </span>
                <p className="text-xs text-slate-600">
                  Physical progress <span className="font-semibold tabular-nums text-slate-900">{progress.toFixed(1)}%</span>
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Physical progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Start {date(p.notice_to_proceed)} · Target {date(p.target_completion_date)}
                {p.actual_completion_date && ` · Completed ${date(p.actual_completion_date)}`}
              </p>
            </div>

            {/* 4. Contract cost */}
            <div className="px-4 py-3">
              <p className="text-xs text-slate-500">Contract cost</p>
              <p className="text-xl font-bold tabular-nums text-slate-900">{pesoWhole(p.contract_amount)}</p>
            </div>

            {/* 5. Details */}
            <dl className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-2.5 px-4 py-3 text-[13px] leading-snug">
              <Detail label="Location">
                {p.barangay_name ? `Barangay ${p.barangay_name}, ` : ''}
                {p.municipality_name}
              </Detail>
              <Detail label="Office">{p.agency_name}</Detail>
              <Detail label="Contractor">{p.contractor_name || 'Not yet awarded'}</Detail>
            </dl>

            {/* 6. Actions */}
            <div className="flex items-center gap-2 px-4 py-3">
              {isStaff && !isPending && (
                <Button to={`/app/projects/${p.id}`} size="sm" icon={ArrowRight} className="flex-1">
                  View full project
                </Button>
              )}
              {onRecenter && (
                <Button
                  variant="secondary"
                  size="icon"
                  icon={LocateFixed}
                  onClick={onRecenter}
                  aria-label="Recenter the map on this project"
                  title="Recenter the map on this project"
                  className={isStaff && !isPending ? '' : 'ml-auto'}
                />
              )}
            </div>

            {/* 7. Anonymous problem report (goes to PACC only) */}
            <div className="px-4 py-3">
              <p className="mb-2 text-xs text-slate-500">See something wrong at this project? You can report it without an account.</p>
              <Button variant="warning-outline" size="sm" icon={Megaphone} onClick={() => setReporting(true)} className="w-full">
                Magsumbong / Report a problem
              </Button>
            </div>
          </div>
        )}
      </div>
      {reporting && p && <ReportProblemModal project={p} onClose={closeReport} />}
    </aside>
  );
}
