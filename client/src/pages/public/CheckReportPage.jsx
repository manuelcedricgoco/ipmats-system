import { Search } from 'lucide-react';
import { useState } from 'react';
import Button from '../../components/common/Button.jsx';
import { Card, CardBody } from '../../components/common/Card.jsx';
import { Alert } from '../../components/common/Feedback.jsx';
import { Field, Input } from '../../components/common/Form.jsx';
import { api } from '../../lib/api.js';
import { date } from '../../lib/format.js';
import { formatTrackingCodeInput } from '../../lib/pacc.js';

/** What each reporter-facing status means (server: services/citizenReports.js reporterStatusLabel). */
const STATUS_HELP = {
  Received: 'PACC has your report but has not looked at it yet.',
  'Under review': 'PACC is looking into your report.',
  Closed: 'PACC has finished with your report.',
};

/**
 * PUBLIC PORTAL — "Check a report" (/report-status). The visitor types the tracking code they got after
 * reporting a problem and sees only the status and the date it was sent. The request carries no sign-in token
 * (`anonymous: true`), the code is sent in the request body (never in the URL) and it is not kept anywhere in the browser.
 */
export default function CheckReportPage() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState(null);

  const check = async (e) => {
    e.preventDefault();
    setResult(null);
    if (code.length !== 11) return setErr({ message: 'Enter the 10-character tracking code.' });
    setChecking(true);
    setErr(null);
    try {
      // The code goes in the body, never in the URL: request paths are kept in hosting logs.
      const res = await api.post('/public/reports/status', { code }, { anonymous: true });
      setResult(res.data);
    } catch (e2) {
      setErr(e2);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Check a report</h1>
      <p className="mb-5 mt-1 text-sm text-slate-600">
        Enter the tracking code you received after reporting a problem on a project. Only the status of the report is shown.
      </p>
      <Card>
        <CardBody>
          <form onSubmit={check} className="space-y-4" noValidate>
            <Field label="Tracking code" hint="10 letters and numbers, for example K7Q4M-2XDPA. Upper or lower case both work.">
              {(a) => (
                <Input
                  {...a}
                  value={code}
                  onChange={(e) => {
                    setCode(formatTrackingCodeInput(e.target.value));
                    setResult(null);
                  }}
                  placeholder="XXXXX-XXXXX"
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  className="font-mono text-base tracking-widest"
                />
              )}
            </Field>
            {err && <Alert tone="error">{err.message}</Alert>}
            <Button type="submit" icon={Search} loading={checking}>Check</Button>
          </form>

          {result && (
            <div role="status" className="mt-5 rounded-lg bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-slate-500">Status</dt>
                <dd className="font-semibold text-slate-900">{result.status}</dd>
                <dt className="text-slate-500">Sent on</dt>
                <dd className="text-slate-900">{date(result.submitted_on)}</dd>
              </dl>
              {STATUS_HELP[result.status] && <p className="mt-3 text-xs text-slate-600">{STATUS_HELP[result.status]}</p>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
