import { ArrowLeft, Building2, CalendarClock, Landmark, MapPin, Pencil, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pill, StatusBadge } from '../../components/common/Badges.jsx';
import Button from '../../components/common/Button.jsx';
import { Card, CardBody, CardHeader, DetailList, PageHeader } from '../../components/common/Card.jsx';
import { Alert, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import Modal from '../../components/common/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { PROJECT_TYPES } from '../../lib/constants.js';
import { date, dateTime, peso } from '../../lib/format.js';

/** WEEK 1 — Project record: identification, office, contractor, location, budget and duration. */
export default function ProjectDetailPage() {
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
  const savings = p.contract_amount != null ? Number(p.approved_budget) - Number(p.contract_amount) : null;

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
          description={p.description}
          actions={
            <>
              {canEdit && <Button icon={Pencil} to={`/app/projects/${id}/edit`}>Edit</Button>}
              {canDelete && <Button variant="secondary" icon={Trash2} onClick={() => setConfirmDelete(true)} className="text-red-700">Delete</Button>}
            </>
          }
        />
      </div>
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={p.status} />
        <Pill>{PROJECT_TYPES[p.project_type]}</Pill>
        {!canEdit && <Pill className="bg-slate-800 text-white">Read-only</Pill>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Summary icon={Wallet} label="Approved budget (ABC)" value={peso(p.approved_budget)} />
        <Summary icon={Wallet} label="Contract amount" value={p.contract_amount != null ? peso(p.contract_amount) : 'Not yet awarded'} hint={savings > 0 ? `${peso(savings)} below ABC` : null} />
        <Summary icon={CalendarClock} label="Duration" value={p.duration_days ? `${p.duration_days} calendar days` : '—'} hint={p.target_completion_date ? `Target ${date(p.target_completion_date)}` : null} />
        <Summary icon={Building2} label="Contractor" value={p.contractor_name || 'Not yet awarded'} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Implementation" />
          <CardBody>
            <DetailList
              items={[
                ['Implementing office', <span key="a" className="inline-flex items-center gap-1.5"><Landmark className="h-4 w-4 text-slate-400" aria-hidden />{p.agency_name}</span>],
                ['Contractor', p.contractor_name || 'Not yet awarded'],
                ['Contract reference no.', p.contract_ref_no],
                ['Fund source', p.fund_source],
                ['Project type', PROJECT_TYPES[p.project_type]],
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Schedule" />
          <CardBody>
            <DetailList
              items={[
                ['Notice to Proceed', date(p.notice_to_proceed)],
                ['Contract duration', p.duration_days ? `${p.duration_days} calendar days` : null],
                ['Target completion', date(p.target_completion_date)],
                ['Actual completion', p.actual_completion_date ? date(p.actual_completion_date) : null],
                ['Status', <StatusBadge key="s" status={p.status} />],
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Location" />
          <CardBody>
            <DetailList
              items={[
                ['Municipality', p.municipality_name],
                ['Barangay', p.barangay_name],
                ['Coordinates', <span key="c" className="inline-flex items-center gap-1.5 font-mono text-xs"><MapPin className="h-4 w-4 text-slate-400" aria-hidden />{Number(p.latitude).toFixed(5)}, {Number(p.longitude).toFixed(5)}</span>],
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Budget" />
          <CardBody>
            <DetailList
              items={[
                ['Approved budget (ABC)', peso(p.approved_budget)],
                ['Contract amount', p.contract_amount != null ? peso(p.contract_amount) : null],
                ['Bid savings', savings != null ? peso(savings) : null],
                ['Record created', dateTime(p.created_at)],
                ['Last updated', dateTime(p.updated_at)],
              ]}
            />
          </CardBody>
        </Card>
      </div>

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
        <p className="text-sm text-slate-600">The project record is removed permanently. This cannot be undone.</p>
        {deleteError && <Alert tone="error" className="mt-3">{deleteError}</Alert>}
      </Modal>
    </>
  );
}

function Summary({ icon: Icon, label, value, hint }) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-brand-50 p-2 text-brand-700"><Icon className="h-4 w-4" aria-hidden /></span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 truncate font-semibold text-slate-900">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
      </div>
    </Card>
  );
}
