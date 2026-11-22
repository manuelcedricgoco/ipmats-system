import { FlagDonut, ProgressBuckets, ProgressByMunicipality, StatusBar } from '../../components/charts/Charts.jsx';
import { Card, CardBody, CardHeader, StatCard } from '../../components/common/Card.jsx';
import { ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { useApi } from '../../hooks/useApi.js';
import { FLAG_META } from '../../lib/constants.js';

/**
 * WEEK 3 — Public dashboard (Jonalyn Pagilagan, front-end): Chart.js charts of project progress
 * and flag status. Flags count only after an auditor has reviewed them; the rest are "Under review".
 */
export default function PublicDashboardPage() {
  const { data, loading, error, reload } = useApi('/public/dashboard', undefined, { select: (r) => r.data });
  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const d = data;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Public dashboard</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Project progress and flag status</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Every infrastructure project in Occidental Mindoro. A flag is shown once an auditor has reviewed it; until then the project counts as "Under review".
        </p>
      </div>
      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Projects" value={d.total_projects} />
        {Object.entries(FLAG_META).map(([k, m]) => <StatCard key={k} label={`${m.label} · ${m.long}`} value={d.by_flag[k] || 0} tone={k} />)}
        <StatCard label="Under review" value={d.by_flag.under_review || 0} tone="slate" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Flag status" description="Reviewed by auditors" />
          <CardBody><FlagDonut counts={d.by_flag} underReview /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Projects by status" />
          <CardBody><StatusBar counts={d.by_status} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="How far along are the projects?" description="Number of projects in each completion range" />
          <CardBody><ProgressBuckets buckets={d.progress_buckets} /></CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Average completion per municipality" />
        <CardBody><ProgressByMunicipality rows={d.by_municipality} /></CardBody>
      </Card>
    </div>
  );
}
