import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import Button from '../../components/common/Button.jsx';
import { Card, CardBody, CardHeader, PageHeader } from '../../components/common/Card.jsx';
import { Field, Select } from '../../components/common/Form.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useReference } from '../../hooks/useReference.js';
import { api } from '../../lib/api.js';
import { STATUS_META } from '../../lib/constants.js';
import { todayIso } from '../../lib/format.js';

/**
 * WEEK 3 — Reports page (Tracy Ann Milaflores, front-end): download the audit report of
 * flagged projects (PDF / Excel), one project's audit report (PDF), and the financial summary (Excel).
 */
export default function ReportsPage() {
  const toast = useToast();
  const { ref } = useReference();
  const projects = useApi('/projects', { pageSize: 100, sort: 'project_code', order: 'asc' }, { select: (r) => r.data });
  const [f, setF] = useState({ flag: 'flagged', municipality_id: '', contractor_id: '', status: '' });
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const filters = Object.fromEntries(Object.entries(f).filter(([, v]) => v));

  const download = async (key, path, query, name) => {
    setBusy(key);
    try {
      await api.download(path, query, name);
      toast.success('Download started.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <PageHeader eyebrow="Reports" title="Downloadable reports" description="Audit reports of flagged projects with their flag reasons, auditor decisions and findings, plus the financial summary." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title="Audit report of flagged projects" description="Every matching project with its flag, the reasons, the auditor's decision and the audit findings." />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Flags">
                {(a) => (
                  <Select {...a} value={f.flag} onChange={set('flag')}>
                    <option value="flagged">Yellow and Red</option>
                    <option value="red">Red only</option>
                    <option value="yellow">Yellow only</option>
                    <option value="all">All projects</option>
                  </Select>
                )}
              </Field>
              <Field label="Municipality">
                {(a) => (
                  <Select {...a} value={f.municipality_id} onChange={set('municipality_id')}>
                    <option value="">All</option>
                    {ref?.municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Contractor">
                {(a) => (
                  <Select {...a} value={f.contractor_id} onChange={set('contractor_id')}>
                    <option value="">All</option>
                    {ref?.contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Status">
                {(a) => (
                  <Select {...a} value={f.status} onChange={set('status')}>
                    <option value="">Any</option>
                    {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                  </Select>
                )}
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button icon={FileText} loading={busy === 'pdf'} onClick={() => download('pdf', '/reports/flagged.pdf', filters, `ipmats-flagged-projects-${todayIso()}.pdf`)}>Download PDF</Button>
              <Button variant="secondary" icon={FileSpreadsheet} loading={busy === 'xlsx'} onClick={() => download('xlsx', '/reports/flagged.xlsx', filters, `ipmats-flagged-projects-${todayIso()}.xlsx`)}>Download Excel (.xlsx)</Button>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Audit report of one project" description="Profile, progress, finances, flag reasons, auditor decisions, findings and flag history." />
          <CardBody className="space-y-4">
            <Field label="Project">
              {(a) => (
                <Select {...a} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Choose a project</option>
                  {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.project_code} – {p.name}</option>)}
                </Select>
              )}
            </Field>
            <Button icon={Download} disabled={!projectId} loading={busy === 'one'} onClick={() => download('one', `/reports/projects/${projectId}/audit.pdf`, undefined, 'audit-report.pdf')}>Download PDF</Button>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Financial summary" description="Approved budget, contract amount, variation orders, obligations, disbursements, remaining balance and fund utilization of every project." />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button icon={FileSpreadsheet} loading={busy === 'finx'} onClick={() => download('finx', '/reports/financial.xlsx', undefined, `ipmats-financial-${todayIso()}.xlsx`)}>Download Excel (.xlsx)</Button>
            </div>
            <p className="text-xs text-slate-500">Opens in Excel like a normal sheet (headers in row 1) with automatic column widths, colours and totals.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
