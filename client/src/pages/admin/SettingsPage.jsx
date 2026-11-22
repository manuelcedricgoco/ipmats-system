import { RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import Button from '../../components/common/Button.jsx';
import { Card, CardBody, CardHeader, PageHeader } from '../../components/common/Card.jsx';
import { Alert, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Field, Input, fieldErrors } from '../../components/common/Form.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { dateTime } from '../../lib/format.js';

/** The flag rules, grouped as the concept document describes the automatic checks (§4.2). */
const GROUPS = [
  {
    title: 'Schedule check',
    text: 'Actual accomplishment compared with the planned accomplishment for today.',
    fields: [
      ['slippage_green_max', 'Green up to (% points behind)', 'At or below this slippage the project stays Green.', '%'],
      ['slippage_yellow_max', 'Yellow up to (% points behind)', 'Above the Green limit up to this value is Yellow; above it is Red.', '%'],
      ['late_completion_tolerance_days', 'Late completion allowed (days)', 'Completed later than the target date by more than this → Yellow.', 'days'],
    ],
  },
  {
    title: 'Documentation check (360° photos)',
    text: 'Missing, outdated or questionable site photos.',
    fields: [
      ['image_max_age_days', 'Latest photo older than (days) → Yellow', 'The newest 360° photo must be at most this old.', 'days'],
      ['gps_tolerance_m', 'Photo farther than (m) → Yellow', 'Distance between the photo GPS and the project site.', 'm'],
      ['gps_red_m', 'Photo farther than (m) → Red', 'Must be larger than the Yellow distance.', 'm'],
      ['image_date_tolerance_days', 'Capture date vs inspection date (days)', 'More days apart than this → Yellow.', 'days'],
    ],
  },
  {
    title: 'Financial check',
    text: 'Disbursements compared with physical accomplishment.',
    fields: [
      ['financial_variance_yellow', 'Paid ahead of work by more than (% points) → Yellow', 'Financial % minus physical %.', '%'],
      ['financial_variance_red', 'Paid ahead of work by more than (% points) → Red', 'Must be larger than the Yellow gap.', '%'],
    ],
  },
];

/**
 * Gap fix (concept document §7.1 "Manage system configurations", §14 "thresholds … configurable by the
 * System Administrator"): the Admin changes the automatic flag thresholds; every project is re-checked at once.
 */
export default function SettingsPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi('/settings/flag-rules', undefined, { select: (r) => r.data });
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (data) setForm(Object.fromEntries(Object.entries(data.rules).map(([k, v]) => [k, String(v)])));
  }, [data]);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!form) return null;
  const fe = fieldErrors(err);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!window.confirm('Save the new rules? Every project is re-checked right away and flags may change.')) return;
    setSaving(true);
    setErr(null);
    setResult(null);
    try {
      const res = await api.put('/settings/flag-rules', Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)])));
      setResult(res.data.recheck);
      toast.success('Flag rules saved and all projects re-checked.');
      reload();
    } catch (e2) {
      setErr(e2);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save}>
      <PageHeader
        eyebrow="System configuration"
        title="Automatic flag rules"
        description="Thresholds used by the automatic flagging. Base them on approved project documents and DPWH guidelines."
        actions={
          <>
            <Button variant="secondary" icon={RotateCcw} onClick={() => setForm(Object.fromEntries(Object.entries(data.defaults).map(([k, v]) => [k, String(v)])))}>
              Defaults
            </Button>
            <Button type="submit" icon={Save} loading={saving}>Save and re-check</Button>
          </>
        }
      />
      {data.updated_at && (
        <p className="-mt-3 mb-4 text-xs text-slate-500">
          Last changed {dateTime(data.updated_at)}{data.updated_by_name ? ` by ${data.updated_by_name}` : ''}.
        </p>
      )}
      {err && (
        <Alert tone="error" title="Not saved" className="mb-4">
          {err.message}
          {err.details?.length > 0 && <ul className="mt-1 list-disc pl-4">{err.details.map((d, i) => <li key={i}>{d.message}</li>)}</ul>}
        </Alert>
      )}
      {result && (
        <Alert tone="info" title="All projects re-checked" className="mb-4">
          {result.evaluated} project(s) evaluated — Green {result.green}, Yellow {result.yellow}, Red {result.red}. {result.changed} flag(s) changed
          {result.changes?.length > 0 && `: ${result.changes.map((c) => `${c.project_code} ${String(c.from || '—').toUpperCase()} → ${String(c.to).toUpperCase()}`).join(', ')}`}.
        </Alert>
      )}
      <div className="stagger grid grid-cols-1 gap-6 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <Card key={g.title}>
            <CardHeader title={g.title} description={g.text} />
            <CardBody className="space-y-4">
              {g.fields.map(([key, label, hint, unit]) => (
                <Field key={key} label={label} hint={fe[key] || hint} error={fe[key]}>
                  {(a) => (
                    <div className="relative">
                      <Input {...a} type="number" inputMode="decimal" step="any" min="0" value={form[key] ?? ''} onChange={set(key)} required className="pr-14" />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">{unit}</span>
                    </div>
                  )}
                </Field>
              ))}
            </CardBody>
          </Card>
        ))}
      </div>
      <p className="mt-6 flex items-start gap-2 text-xs text-slate-500">
        <SlidersHorizontal className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Other rules are fixed: a target date passed without completion, a reused photo, a photo taken before the Notice to Proceed, or a contract above
        its approved budget is always Red. Every change is recorded in the activity log.
      </p>
    </form>
  );
}
