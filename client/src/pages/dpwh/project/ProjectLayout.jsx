import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Pill, StatusBadge } from '../../../components/common/Badges.jsx';
import Button from '../../../components/common/Button.jsx';
import { PageHeader } from '../../../components/common/Card.jsx';
import { Alert, ErrorState, PageLoader } from '../../../components/common/Feedback.jsx';
import Modal from '../../../components/common/Modal.jsx';
import ProgressBar from '../../../components/common/ProgressBar.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { api } from '../../../lib/api.js';
import { PROJECT_TYPES } from '../../../lib/constants.js';

const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'progress', label: 'Phases & progress' }, // Week 2 — Objective 3
  { to: 'finance', label: 'Finance' }, // Week 2 — Objective 4
];

/** Project page frame: header, tabs, and the selected tab (Overview / Phases & progress / Finance). */
export default function ProjectLayout() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: p, loading, error, reload } = useApi(`/projects/${id}`, undefined, { select: (r) => r.data });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  if (loading && !p) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const canEdit = hasRole('dpwh_personnel', 'admin');
  const canDelete = hasRole('admin');

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.del(`/projects/${id}`);
      toast.success(`Project ${p.project_code} deleted.`);
      navigate('/app/projects', { replace: true });
    } catch (e) {
      setDeleteError(e.message);
      setDeleting(false);
    }
  };

  return (
    <>
      <Link to="/app/projects" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All projects
      </Link>
      <div className="mt-3">
        <PageHeader
          eyebrow={<span className="font-mono">{p.project_code}</span>}
          title={p.name}
          actions={
            <>
              {canEdit && <Button icon={Pencil} to={`/app/projects/${id}/edit`}>Edit</Button>}
              {canDelete && <Button variant="secondary" icon={Trash2} onClick={() => setConfirmDelete(true)} className="text-red-700">Delete</Button>}
            </>
          }
        />
      </div>
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <StatusBadge status={p.status} />
        <Pill>{PROJECT_TYPES[p.project_type]}</Pill>
        {!canEdit && <Pill className="bg-slate-800 text-white">Read-only</Pill>}
        <ProgressBar value={p.overall_progress} size="sm" className="w-48" />
      </div>

      <nav aria-label="Project sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
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

      {/* each tab gets the project and a reload function */}
      <Outlet context={{ project: p, reloadProject: reload, canEdit, canDelete }} />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this project?"
        description={`${p.project_code} · ${p.name}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" icon={Trash2} loading={deleting} onClick={remove}>Delete project</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">The project record, its phases, progress reports and financial records are removed permanently. This cannot be undone.</p>
        {deleteError && <Alert tone="error" className="mt-3">{deleteError}</Alert>}
      </Modal>
    </>
  );
}
