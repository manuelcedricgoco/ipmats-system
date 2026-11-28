import { Building2, CalendarClock, Landmark, MapPin, Wallet } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { StatusBadge } from '../../../components/common/Badges.jsx';
import { Card, CardBody, CardHeader, DetailList } from '../../../components/common/Card.jsx';
import { PROJECT_TYPES } from '../../../lib/constants.js';
import { date, dateTime, peso } from '../../../lib/format.js';

/** WEEK 1 — Project record (Overview tab): office, contractor, location, budget and duration. */
export default function OverviewTab() {
  const { project: p } = useOutletContext();
  const savings = p.contract_amount != null ? Number(p.approved_budget) - Number(p.contract_amount) : null;

  return (
    <>
      {p.description && <p className="mb-6 max-w-3xl text-sm text-slate-600">{p.description}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Summary icon={Wallet} label="Approved budget (ABC)" value={peso(p.approved_budget)} />
        <Summary icon={Wallet} label="Contract amount" value={p.contract_amount != null ? peso(p.contract_amount) : 'Not yet awarded'} hint={savings > 0 ? `${peso(savings)} below ABC` : null} />
        <Summary icon={CalendarClock} label="Duration" value={p.duration_days ? `${p.duration_days} calendar days` : '—'} hint={p.target_completion_date ? `Target ${date(p.target_completion_date)}` : null} />
        <Summary icon={Building2} label="Contractor" value={p.contractor_name || 'Not yet awarded'} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                ['Status', <StatusBadge key="s" status={p.status} verifiedAt={p.completion_verified_at} />],
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
          <p className="mt-1 break-words font-semibold text-slate-900">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
      </div>
    </Card>
  );
}
