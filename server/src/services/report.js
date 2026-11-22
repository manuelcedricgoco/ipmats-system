/**
 * WEEK 3 — Downloadable audit reports (Manuel Cedric Goco), redesigned layout:
 *   buildAuditReportPdf          one project: profile, finance, phases, flag reasons, auditor decisions, findings, history
 *   buildFlaggedProjectsPdf      every flagged project: summary table, then each project's reasons, review and findings
 * Layout (letterhead, sections, tables, footer) lives in pdfLayout.js so both reports look the same.
 */
import { COLORS, FLAG_STYLE, Report, fmt } from './pdfLayout.js';

const DISCLAIMER =
  'Automatic flags are a monitoring aid computed from data submitted by DPWH personnel (schedule, phase accomplishment, ' +
  'payments and 360° site photos). They do not replace an engineering inspection or a formal audit. ' +
  'A 360° image documents visible site conditions only.';

const flagCell = (f) => (f ? { flag: f, text: FLAG_STYLE[f]?.label } : { text: 'Not evaluated', color: COLORS.muted });
const slippageColor = (s) => (s > 15 ? FLAG_STYLE.red.color : s > 5 ? FLAG_STYLE.yellow.color : FLAG_STYLE.green.color);
const severityStyle = {
  low: { color: '#334155', tint: '#e2e8f0' },
  medium: { color: FLAG_STYLE.yellow.color, tint: FLAG_STYLE.yellow.tint },
  high: { color: FLAG_STYLE.red.color, tint: FLAG_STYLE.red.tint },
  critical: { color: '#ffffff', tint: '#7f1d1d' },
};

/**
 * @param {object} data { project, phases, findings, reviews, financials, history, generatedBy }
 * @returns {PDFKit.PDFDocument} stream – pipe it to the response
 */
export function buildAuditReportPdf({ project: p, phases, findings, reviews, financials, history, generatedBy }) {
  const r = new Report({
    title: p.name,
    docType: 'PROJECT AUDIT REPORT',
    reference: `AR-${p.project_code}-${fmt.stamp()}`,
    subtitle: `${p.barangay_name ? `Barangay ${p.barangay_name}, ` : ''}${p.municipality_name}, Occidental Mindoro`,
    generatedBy,
    meta: [['Project ID', p.project_code]],
  });

  const planned = Number(p.planned_progress || 0);
  const actual = Number(p.overall_progress || 0);
  const slip = Math.round((planned - actual) * 100) / 100;
  const flag = p.current_flag;
  r.kpis([
    { label: 'Current flag', value: flag ? FLAG_STYLE[flag].label : 'NOT EVALUATED', color: flag ? FLAG_STYLE[flag].color : COLORS.muted, hint: `${fmt.label(p.flag_review_status)} · automatic ${String(p.auto_flag || '—').toUpperCase()}` },
    { label: 'Work accomplished', value: fmt.pct(actual), hint: `Planned ${fmt.pct(planned)} as of today` },
    { label: 'Slippage', value: `${slip > 0 ? '' : slip < 0 ? '+' : ''}${Math.abs(slip).toFixed(2)} pts`, color: slippageColor(slip), hint: slip > 15 ? 'Behind schedule (severe)' : slip > 5 ? 'Behind schedule' : slip > 0 ? 'Slightly behind (within 5 pts)' : 'On or ahead of schedule' },
    { label: 'Funds disbursed', value: fmt.pct(p.financial_progress), hint: `${fmt.peso(p.total_disbursed)} paid` },
  ]);

  r.section('Project profile');
  r.keyValue([
    ['Project ID', p.project_code],
    ['Project type', fmt.label(p.project_type)],
    ['Implementing office', p.agency_name],
    ['Contractor', p.contractor_name || 'Not yet awarded'],
    ['Contract reference', p.contract_ref_no],
    ['Fund source', p.fund_source],
    ['Location', `${p.barangay_name ? `Brgy. ${p.barangay_name}, ` : ''}${p.municipality_name}`],
    ['Coordinates', `${Number(p.latitude).toFixed(6)}, ${Number(p.longitude).toFixed(6)}`],
    ['Notice to proceed', fmt.date(p.notice_to_proceed)],
    ['Contract duration', p.duration_days ? `${p.duration_days} calendar days` : '—'],
    ['Target completion', fmt.date(p.target_completion_date)],
    ['Actual completion', fmt.date(p.actual_completion_date)],
    ['Project status', fmt.label(p.status)],
    ['Audit status', fmt.label(p.audit_status)],
  ]);

  r.section('Financial summary');
  const obligated = p.total_obligated ?? financials.filter((f) => f.record_type === 'obligation').reduce((s, f) => s + Number(f.amount), 0);
  r.table(
    [
      { header: 'Item', width: 3, value: (x) => ({ text: x[0], bold: x[2] }) },
      { header: 'Amount', width: 2, align: 'right', value: (x) => ({ text: x[1], bold: x[2] }) },
    ],
    [
      ['Approved budget for the contract (ABC)', fmt.peso(p.approved_budget)],
      ['Contract amount', fmt.peso(p.contract_amount)],
      ['Variation orders', fmt.peso(p.variation_orders)],
      ['Revised contract amount', fmt.peso(p.revised_contract_amount), true],
      ['Total obligated', fmt.peso(obligated)],
      ['Total disbursed', fmt.peso(p.total_disbursed)],
      ['Remaining balance', fmt.peso(p.remaining_balance ?? Number(p.revised_contract_amount || 0) - Number(p.total_disbursed || 0)), true],
      ['Fund utilization (disbursed / revised contract)', fmt.pct(p.financial_progress)],
    ],
  );

  r.section('Construction phases');
  r.table(
    [
      { header: 'No.', width: 0.45, align: 'center', value: (ph) => ph.sequence_no },
      { header: 'Phase', width: 3, value: (ph) => ({ text: ph.name, bold: true }) },
      { header: 'Weight', width: 0.9, align: 'right', value: (ph) => fmt.pct(ph.weight, 0) },
      { header: 'Progress', width: 1, align: 'right', value: (ph) => ({ text: fmt.pct(ph.accomplishment), color: Number(ph.accomplishment) >= 100 ? FLAG_STYLE.green.color : COLORS.text }) },
      { header: 'Planned schedule', width: 2, value: (ph) => `${fmt.date(ph.planned_start)} – ${fmt.date(ph.planned_end)}` },
      { header: 'Actual schedule', width: 2, value: (ph) => (ph.actual_start ? `${fmt.date(ph.actual_start)} – ${ph.actual_end ? fmt.date(ph.actual_end) : 'ongoing'}` : 'Not started') },
    ],
    phases,
    { emptyText: 'No construction phases have been set up for this project.' },
  );

  r.section('Automatic flag reasons');
  const reasons = (p.auto_flag_reasons || []).filter((x) => x.severity !== 'info');
  r.table(
    [
      { header: 'Severity', width: 1, value: (x) => flagCell(x.severity) },
      { header: 'Check', width: 1.6, value: (x) => ({ text: fmt.label(x.check), bold: true }) },
      { header: 'Finding', width: 5, value: (x) => x.message },
    ],
    reasons,
    { emptyText: `No issues detected. Last automatic check: ${fmt.dateTime(p.auto_flag_evaluated_at)}.` },
  );

  r.section('Auditor flag decisions');
  if (!reviews.length) r.paragraph('No auditor decision has been recorded for this project yet.', { color: COLORS.muted, size: 8.5 });
  for (const v of reviews) {
    r.card({
      accent: FLAG_STYLE[v.final_flag]?.color,
      title: `${fmt.label(v.decision)} — ${fmt.dateTime(v.created_at)}`,
      badges: [
        { text: `AUTOMATIC ${String(v.auto_flag).toUpperCase()}`, flag: v.auto_flag },
        { text: `FINAL ${String(v.final_flag).toUpperCase()}`, flag: v.final_flag },
      ],
      fields: [
        ['Auditor', v.auditor_name || 'Auditor'],
        ['Reason', v.reason],
        ...(v.evidence_path ? [['Evidence', 'Attached in the system (audit-evidence storage)']] : []),
      ],
    });
  }

  r.section('Audit findings and corrective actions');
  if (!findings.length) r.paragraph('No audit findings have been recorded for this project.', { color: COLORS.muted, size: 8.5 });
  for (const f of findings) {
    r.card({
      accent: severityStyle[f.severity]?.tint === '#7f1d1d' ? '#7f1d1d' : severityStyle[f.severity]?.color,
      title: f.title,
      badges: [
        { text: `${String(f.severity).toUpperCase()} SEVERITY`, style: severityStyle[f.severity] },
        { text: fmt.label(f.action_status).toUpperCase(), style: { color: COLORS.brand, tint: COLORS.brandTint } },
        ...(f.due_date ? [{ text: `DUE ${fmt.date(f.due_date).toUpperCase()}`, style: { color: '#334155', tint: '#e2e8f0' } }] : []),
      ],
      fields: [
        ['Description', f.description],
        ...(f.recommendation ? [['Recommendation', f.recommendation]] : []),
        ...(f.corrective_action ? [['Corrective action', f.corrective_action]] : []),
        ['Recorded', fmt.dateTime(f.created_at)],
      ],
    });
  }

  r.section('Flag history (latest checks)');
  r.table(
    [
      { header: 'Date and time', width: 1.7, value: (h) => fmt.dateTime(h.created_at) },
      { header: 'Source', width: 1, value: (h) => fmt.label(h.source) },
      { header: 'Trigger', width: 1.9, value: (h) => fmt.label(h.trigger_event) },
      { header: 'Flag', width: 0.9, value: (h) => flagCell(h.flag) },
      { header: 'Project status', width: 1.2, value: (h) => fmt.label(h.project_status) },
    ],
    history.slice(0, 15),
    { emptyText: 'No flag history yet.' },
  );

  r.signatures([
    { label: 'Prepared by', name: generatedBy.replace(/\s*\([^)]*\)$/, '') },
    { label: 'Reviewed by' },
    { label: 'Noted by' },
  ]);
  r.note(DISCLAIMER);
  return r.end();
}

/**
 * Portfolio audit report: every flagged project (Yellow / Red, or as filtered),
 * with its flag reasons, the auditor's decision and audit findings.
 * @param {object} data { projects, findingsByProject, reviewsByProject, filters, generatedBy }
 */
export function buildFlaggedProjectsPdf({ projects, findingsByProject, reviewsByProject, filters, generatedBy }) {
  const r = new Report({
    title: 'Audit Report of Flagged Projects',
    docType: 'FLAGGED PROJECTS REPORT',
    reference: `FPR-${fmt.stamp()}`,
    subtitle: 'Infrastructure projects flagged by the automatic checks, with the flag reasons, the auditor decisions and the audit findings.',
    generatedBy,
    meta: [['Filters', filters || 'None']],
  });
  const count = (f) => projects.filter((p) => p.current_flag === f).length;
  const pending = projects.filter((p) => p.flag_review_status === 'pending' && p.current_flag && p.current_flag !== 'green').length;
  r.kpis([
    { label: 'Projects listed', value: String(projects.length), hint: 'Matching the filters' },
    { label: 'Red · investigation', value: String(count('red')), color: FLAG_STYLE.red.color },
    { label: 'Yellow · attention', value: String(count('yellow')), color: FLAG_STYLE.yellow.color },
    { label: 'Green · on track', value: String(count('green')), color: FLAG_STYLE.green.color },
    { label: 'Awaiting review', value: String(pending), color: COLORS.brand, hint: 'No auditor decision yet' },
  ]);

  r.section('Summary of flagged projects');
  r.table(
    [
      { header: 'Project ID', width: 1.25, value: (p) => ({ text: p.project_code, bold: true }) },
      { header: 'Project', width: 3, value: (p) => p.name },
      { header: 'Municipality', width: 1.2, value: (p) => p.municipality_name },
      { header: 'Status', width: 1, value: (p) => fmt.label(p.status) },
      { header: 'Actual / planned', width: 1.25, align: 'right', value: (p) => `${fmt.pct(p.overall_progress)} / ${fmt.pct(p.planned_progress)}` },
      { header: 'Flag', width: 0.95, value: (p) => flagCell(p.current_flag) },
      { header: 'Review', width: 1.05, value: (p) => fmt.label(p.flag_review_status) },
    ],
    projects,
    { emptyText: 'No projects match the selected filters.', fontSize: 7.8 },
  );

  if (projects.length) r.section('Project details');
  for (const p of projects) {
    const reasons = (p.auto_flag_reasons || []).filter((x) => x.severity === 'yellow' || x.severity === 'red');
    const review = (reviewsByProject[p.id] || [])[0];
    const findings = findingsByProject[p.id] || [];
    r.card({
      accent: FLAG_STYLE[p.current_flag]?.color,
      title: `${p.project_code} — ${p.name}`,
      badges: [
        flagCell(p.current_flag).flag ? { text: `${FLAG_STYLE[p.current_flag].label} FLAG`, flag: p.current_flag } : { text: 'NOT EVALUATED', style: { color: COLORS.muted, tint: '#e2e8f0' } },
        { text: fmt.label(p.status).toUpperCase(), style: { color: COLORS.brand, tint: COLORS.brandTint } },
        { text: `AUDIT: ${fmt.label(p.audit_status).toUpperCase()}`, style: { color: '#334155', tint: '#e2e8f0' } },
      ],
      fields: [
        ['Location / contractor', `${p.municipality_name} · ${p.contractor_name || 'No contractor yet'}`],
        ['Progress', `${fmt.pct(p.overall_progress)} done, ${fmt.pct(p.planned_progress)} planned · paid ${fmt.peso(p.total_disbursed)} of ${fmt.peso(p.revised_contract_amount)}`],
        ['Flag reasons', reasons.length ? reasons.map((x) => `[${x.severity.toUpperCase()}] ${x.message}`).join('\n') : 'None'],
        [
          'Auditor decision',
          review
            ? `${fmt.label(review.decision)} ${String(review.auto_flag).toUpperCase()} to ${String(review.final_flag).toUpperCase()} by ${review.auditor_name || 'Auditor'} on ${fmt.date(review.created_at)}: ${review.reason}`
            : 'Awaiting auditor review',
        ],
        [
          'Audit findings',
          findings.length
            ? findings.map((f) => `${f.title} (${fmt.label(f.severity)}, ${fmt.label(f.action_status)}${f.due_date ? `, due ${fmt.date(f.due_date)}` : ''}): ${f.description}`).join('\n')
            : 'None recorded',
        ],
      ],
    });
  }

  r.signatures([
    { label: 'Prepared by', name: generatedBy.replace(/\s*\([^)]*\)$/, '') },
    { label: 'Reviewed by' },
    { label: 'Noted by' },
  ]);
  r.note(DISCLAIMER);
  return r.end();
}
