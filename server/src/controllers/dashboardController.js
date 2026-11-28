/**
 * WEEK 3 — Dashboard APIs
 *   GET /dashboard/performance   project performance, flag counts, overall progress (Julina Mae Escabosa)
 *   GET /dashboard/financial     budgets, disbursements and fund utilization (Manuel Cedric Goco)
 * Both accept the project list filters.
 */
import { behindSchedule, round2 } from '../services/completion.js';
import { unwrap } from '../utils/httpError.js';
import { applyProjectFilters } from './projectsController.js';

async function rowsFor(req, columns) {
  let q = req.db.from('v_project_summary').select(columns);
  q = applyProjectFilters(q, req.query);
  return unwrap(await q);
}
const countBy = (rows, key) => rows.reduce((acc, r) => ({ ...acc, [r[key] ?? 'none']: (acc[r[key] ?? 'none'] || 0) + 1 }), {});
const sum = (rows, key) => round2(rows.reduce((s, r) => s + Number(r[key] || 0), 0));

export async function performance(req, res) {
  const rows = await rowsFor(
    req,
    'id, project_code, name, project_type, status, completion_status, current_flag, flag_review_status, municipality_name, contractor_name, overall_progress, planned_progress, image_count',
  );
  const avg = (key) => (rows.length ? round2(sum(rows, key) / rows.length) : 0);
  const byMunicipality = {};
  for (const r of rows) {
    const m = (byMunicipality[r.municipality_name] ||= { municipality: r.municipality_name, projects: 0, progress_total: 0, green: 0, yellow: 0, red: 0 });
    m.projects += 1;
    m.progress_total += Number(r.overall_progress || 0);
    if (r.current_flag) m[r.current_flag] += 1;
  }
  res.json({
    data: {
      total_projects: rows.length,
      by_flag: countBy(rows, 'current_flag'),
      by_status: countBy(rows, 'status'),
      by_type: countBy(rows, 'project_type'),
      completed: rows.filter((r) => r.completion_status === 'completed').length,
      delayed: rows.filter((r) => r.status === 'delayed').length,
      pending_review: rows.filter((r) => r.flag_review_status === 'pending' && r.current_flag && r.current_flag !== 'green').length,
      without_images: rows.filter((r) => !r.image_count).length,
      average_progress: { actual: avg('overall_progress'), planned: avg('planned_progress') },
      by_municipality: Object.values(byMunicipality)
        .map(({ progress_total, ...m }) => ({ ...m, average_progress: round2(progress_total / m.projects) }))
        .sort((a, b) => b.projects - a.projects),
      // Projects furthest behind schedule (for the "needs attention" chart/list)
      most_behind: rows
        .map((r) => ({ id: r.id, project_code: r.project_code, name: r.name, actual: Number(r.overall_progress), planned: Number(r.planned_progress), slippage: behindSchedule(r), current_flag: r.current_flag }))
        .filter((r) => r.slippage > 0)
        .sort((a, b) => b.slippage - a.slippage)
        .slice(0, 8),
    },
  });
}

export async function financialSummary(req, res) {
  const rows = await rowsFor(
    req,
    'id, project_code, name, municipality_name, current_flag, approved_budget, contract_amount, variation_orders, revised_contract_amount, total_obligated, total_disbursed, total_expenses, remaining_balance, financial_progress, overall_progress',
  );
  const totals = {
    approved_budget: sum(rows, 'approved_budget'),
    contract_amount: sum(rows, 'contract_amount'),
    variation_orders: sum(rows, 'variation_orders'),
    revised_contract_amount: sum(rows, 'revised_contract_amount'),
    total_obligated: sum(rows, 'total_obligated'),
    total_disbursed: sum(rows, 'total_disbursed'),
    total_expenses: sum(rows, 'total_expenses'),
    remaining_balance: sum(rows, 'remaining_balance'),
  };
  totals.fund_utilization_pct = totals.revised_contract_amount ? round2((totals.total_disbursed / totals.revised_contract_amount) * 100) : 0;
  totals.bid_savings = round2(totals.approved_budget - totals.contract_amount);
  const byMunicipality = {};
  for (const r of rows) {
    const m = (byMunicipality[r.municipality_name] ||= { municipality: r.municipality_name, revised_contract_amount: 0, total_disbursed: 0 });
    m.revised_contract_amount += Number(r.revised_contract_amount || 0);
    m.total_disbursed += Number(r.total_disbursed || 0);
  }
  res.json({
    data: {
      totals,
      by_municipality: Object.values(byMunicipality)
        .map((m) => ({ ...m, revised_contract_amount: round2(m.revised_contract_amount), total_disbursed: round2(m.total_disbursed) }))
        .sort((a, b) => b.revised_contract_amount - a.revised_contract_amount),
      // Paid well ahead of the work done
      paid_ahead: rows
        .map((r) => ({ id: r.id, project_code: r.project_code, name: r.name, financial: Number(r.financial_progress), physical: Number(r.overall_progress), gap: round2(Number(r.financial_progress) - Number(r.overall_progress)) }))
        .filter((r) => r.gap > 10)
        .sort((a, b) => b.gap - a.gap),
    },
  });
}
