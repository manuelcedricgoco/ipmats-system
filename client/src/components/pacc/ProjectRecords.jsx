import { Fragment } from 'react';
import { ExternalLink, FileText, ImageOff } from 'lucide-react';
import Button from '../common/Button.jsx';
import { Pill } from '../common/Badges.jsx';
import { Card, CardBody, CardHeader, DetailList } from '../common/Card.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import ReportPhotos from '../progress/ReportPhotos.jsx';
import { LiquidationSummary, ReceiptList, RecordLiquidationCell } from '../finance/Liquidation.jsx';
import { acceptsReceipts } from '../../lib/liquidation.js';
import { RECORD_TYPE_CLS, RECORD_TYPES } from '../../lib/constants.js';
import { date, dateTime, pct, peso } from '../../lib/format.js';

const TH = 'px-4 py-2.5';
const sizeText = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const LINKS_NOTE = 'Links open for one hour; reload the page for fresh links.';

/**
 * PACC investigation page, read-only project records kept by DPWH personnel: phases and progress reports,
 * financial records, 360° photos and supporting documents (GET /pacc/projects/:id). PACC can change none of them.
 * Finance liquidation (031): the liquidation summary and each disbursement's / expense's receipts (every status,
 * with the uploader and the Auditor's decision), read-only.
 */
export default function ProjectRecords({ project: p, phases, progress, finance, records, images, documents, liquidation }) {
  const liquidated = records.filter((r) => acceptsReceipts(r.record_type));
  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Construction phases" description={`Physical progress ${pct(p.overall_progress, 1)} · plan ${pct(p.planned_progress, 1)}`} />
          {phases.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No phases set up yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th scope="col" className={TH}>Phase</th><th scope="col" className={`${TH} text-right`}>Weight</th><th scope="col" className={TH}>Work done</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {phases.map((ph) => (
                    <Fragment key={ph.id}>
                      <tr>
                        <td className="px-4 py-2.5 text-slate-900">{ph.sequence_no}. {ph.name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{pct(ph.weight, 1)}</td>
                        <td className="px-4 py-2.5"><ProgressBar value={ph.accomplishment} size="sm" /></td>
                      </tr>
                      {/* 030: sub-activities explain the phase's % */}
                      {(ph.activities || []).map((a) => (
                        <tr key={a.id} className="bg-slate-50/60 text-xs">
                          <td className="py-2 pl-8 pr-4 text-slate-700">{a.name}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-500">{pct(a.weight, 1)} of phase</td>
                          <td className="px-4 py-2"><ProgressBar value={a.accomplishment} size="sm" /></td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Progress reports" description={`Most recent 50, newest first, with the work done and the reference photos. ${LINKS_NOTE}`} />
          {progress.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No progress reports yet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-auto">
              {progress.map((u) => (
                <li key={u.id} className="px-5 py-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{date(u.report_date)}</span>
                    <Pill>{pct(u.overall_progress, 1)} done</Pill>
                    <span className="text-xs text-slate-500">by {u.submitted_by_name || '—'}</span>
                  </p>
                  {u.description && <p className="mt-1 whitespace-pre-line break-words text-slate-800">{u.description}</p>}
                  {u.remarks && <p className="mt-1 whitespace-pre-line break-words text-slate-600">{u.remarks}</p>}
                  <ReportPhotos photos={u.photos || []} className="mt-2" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Finance" description="Financial records entered by DPWH personnel" />
        <CardBody>
          <DetailList
            items={[
              ['Approved budget', peso(finance.approved_budget)],
              ['Contract amount', `${peso(finance.revised_contract_amount)}${finance.variation_orders ? ` (original ${peso(finance.contract_amount)})` : ''}`],
              ['Obligated', peso(finance.total_obligated)],
              ['Disbursed', `${peso(finance.total_disbursed)} · ${pct(finance.utilization_pct, 1)} of the contract`],
              ['Other expenses', peso(finance.total_expenses)],
              ['Balance', peso(finance.remaining_balance)],
            ]}
          />
        </CardBody>
        {records.length === 0 ? (
          <p className="border-t border-slate-100 px-5 py-6 text-sm text-slate-500">No financial records yet.</p>
        ) : (
          <div className="max-h-80 overflow-auto border-t border-slate-100">
            <table className="table-sticky-first min-w-full divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className={TH}>Date</th>
                  <th scope="col" className={TH}>Type</th>
                  <th scope="col" className={TH}>Phase</th>
                  <th scope="col" className={TH}>Reference no.</th>
                  <th scope="col" className={TH}>Description</th>
                  <th scope="col" className={`${TH} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-2.5">{date(r.record_date)}</td>
                    <td className="px-4 py-2.5"><Pill className={RECORD_TYPE_CLS[r.record_type]}>{RECORD_TYPES[r.record_type] || r.record_type}</Pill></td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{r.phase_name || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{r.reference_no || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-700">{r.description || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{peso(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {liquidation && (
        <Card className="overflow-hidden">
          <CardHeader title="Liquidation and receipts" description={`Receipts of disbursements and expenses; only receipts the Auditor accepted count as liquidated. ${LINKS_NOTE}`} />
          <CardBody className="space-y-5">
            <LiquidationSummary liquidation={liquidation} />
            {liquidated.length === 0 ? (
              <p className="text-sm text-slate-500">No disbursements or expenses yet.</p>
            ) : (
              <ul className="space-y-4" aria-label="Receipts per record">
                {liquidated.map((r) => (
                  <li key={r.id} className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                      <p className="flex flex-wrap items-center gap-2">
                        <Pill className={RECORD_TYPE_CLS[r.record_type]}>{RECORD_TYPES[r.record_type]}</Pill>
                        <span className="font-semibold tabular-nums text-slate-900">{peso(r.amount)}</span>
                        <span className="text-xs text-slate-500">{date(r.record_date)}{r.reference_no ? ` · ${r.reference_no}` : ''}</span>
                      </p>
                      <RecordLiquidationCell liquidation={r.liquidation} />
                    </div>
                    <ReceiptList receipts={r.receipts || []} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader title="360° photos" description={`${images.length} photo${images.length === 1 ? '' : 's'}, newest inspection first. Opens the full photo in a new tab. ${LINKS_NOTE}`} />
        {images.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No 360° photos yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-4" aria-label="360° photos">
            {images.map((img) => (
              <li key={img.id} className="text-xs text-slate-600">
                {img.url ? (
                  <a href={img.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg ring-1 ring-slate-200 transition hover:ring-brand-400">
                    <img src={img.url} alt={img.caption || `360° photo of ${date(img.inspection_date)}`} loading="lazy" referrerPolicy="no-referrer" className="aspect-[2/1] w-full object-cover" />
                  </a>
                ) : (
                  <span className="grid aspect-[2/1] place-items-center rounded-lg bg-slate-100 text-center text-slate-500 ring-1 ring-slate-200">
                    <span><ImageOff className="mx-auto mb-1 h-4 w-4" aria-hidden />Photo unavailable</span>
                  </span>
                )}
                <p className="mt-1 font-medium text-slate-800">Inspection {date(img.inspection_date)}{img.is_final ? ' · final as-built' : ''}</p>
                <p className="line-clamp-2">{[img.phase_name, img.caption].filter(Boolean).join(' · ') || '—'}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Supporting documents" description={`${documents.length} document${documents.length === 1 ? '' : 's'}. ${LINKS_NOTE}`} />
        {documents.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No documents uploaded.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5 text-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><FileText className="h-5 w-5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{d.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <Pill className="bg-brand-50 text-brand-800">{d.type_label}</Pill>
                    {d.document_date && <span>Dated {date(d.document_date)}</span>}
                    {d.phase_name && <span>· {d.phase_name}</span>}
                    <span>· {d.file_name} ({sizeText(d.size_bytes)})</span>
                  </p>
                  {d.description && <p className="mt-1 text-slate-600">{d.description}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">Uploaded by {d.uploaded_by_name || '—'} · {dateTime(d.created_at)}</p>
                </div>
                {d.url ? (
                  <Button size="sm" variant="secondary" icon={ExternalLink} onClick={() => window.open(d.url, '_blank', 'noopener')}>Open</Button>
                ) : (
                  <span className="text-xs text-slate-400">File not available</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
