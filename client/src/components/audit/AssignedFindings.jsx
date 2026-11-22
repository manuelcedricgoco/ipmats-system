import { ClipboardList, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { ACTION_STATUS, SEVERITY_META } from '../../lib/constants.js';
import { date } from '../../lib/format.js';
import { Pill } from '../common/Badges.jsx';
import Button from '../common/Button.jsx';
import { Card, CardHeader } from '../common/Card.jsx';
import CorrectiveActionModal from './CorrectiveActionModal.jsx';

/**
 * Gap fix (concept document §4.6 "Assign audit findings and corrective actions"):
 * DPWH personnel see the findings an auditor assigned to them and report on the corrective action.
 */
export default function AssignedFindings() {
  const toast = useToast();
  const { data, reload } = useApi('/findings/assigned', undefined, { select: (r) => r.data });
  const [acting, setActing] = useState(null);
  const open = (data || []).filter((f) => f.action_status !== 'closed');
  if (!data) return null;

  return (
    <Card className="mt-6 overflow-hidden">
      <CardHeader
        title="Findings assigned to you"
        description={open.length ? `${open.length} corrective action(s) to work on. The auditor closes a finding after checking it.` : 'No open findings are assigned to you.'}
      />
      {data.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-6 text-sm text-slate-500"><ClipboardList className="h-4 w-4" /> When an auditor assigns a finding to you, it appears here.</p>
      ) : (
        <ul className="stagger divide-y divide-slate-100">
          {data.map((f) => (
            <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{f.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <Pill className={SEVERITY_META[f.severity]?.cls}>{SEVERITY_META[f.severity]?.label}</Pill>
                  <Pill>{ACTION_STATUS[f.action_status]}</Pill>
                  <Link to={`/app/projects/${f.project_id}/flags`} className="font-mono font-semibold text-brand-700 hover:underline">{f.project_code}</Link>
                  <span>· by {f.auditor_name || 'Auditor'}{f.due_date ? ` · due ${date(f.due_date)}` : ''}</span>
                </p>
                {f.corrective_action && <p className="mt-1 text-xs text-slate-600"><strong>Your update:</strong> {f.corrective_action}</p>}
              </div>
              {f.action_status !== 'closed' && <Button size="sm" variant="secondary" icon={UserCheck} onClick={() => setActing(f)}>Update action</Button>}
            </li>
          ))}
        </ul>
      )}
      <CorrectiveActionModal
        finding={acting}
        open={Boolean(acting)}
        onClose={() => setActing(null)}
        onSaved={(msg) => {
          setActing(null);
          toast.success(msg);
          reload();
        }}
      />
    </Card>
  );
}
