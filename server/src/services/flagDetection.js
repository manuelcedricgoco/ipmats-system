/**
 * WEEK 3 — Automatic completion, status and flag detection (Objective 5).
 *
 * evaluateProject() is a PURE function: given a project and its related rows it
 * returns the detected completion status, lifecycle status, metrics and a
 * GREEN / YELLOW / RED flag with the reasons that produced it.
 *
 * Persisting the result (and recording history) is done by projectEvaluation.js.
 * Thresholds come from system_settings.flag_rules (fixed defaults in Week 3).
 *
 * Flag = the most severe reason found:
 *   RED    target date passed, severe slippage, terminated, reused photo, photo far
 *          from the site, contract above ABC, payments far ahead of the work
 *   YELLOW minor slippage, suspended, completed late, no / outdated / undated photo,
 *          photo GPS or date doubtful, payments somewhat ahead, missing completion requirements
 *   GREEN  on track (or completed with every requirement met)
 */
import { computePlannedProgress, daysBetween, detectCompletion, round2, toDate } from './completion.js';
import { haversineMeters } from '../utils/geo.js';

export const DEFAULT_RULES = Object.freeze({
  slippage_green_max: 5,
  slippage_yellow_max: 15,
  image_max_age_days: 30,
  gps_tolerance_m: 500,
  gps_red_m: 2000,
  financial_variance_yellow: 10,
  financial_variance_red: 25,
  late_completion_tolerance_days: 0,
  image_date_tolerance_days: 7,
});

const RANK = { info: -1, green: 0, yellow: 1, red: 2 };

export function maxFlag(a, b) {
  return RANK[b] > RANK[a] ? b : a;
}

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * @param {object}   input
 * @param {object}   input.project      projects row
 * @param {object[]} input.phases       project_phases rows
 * @param {object[]} input.images       site_images rows for the project
 * @param {object[]} input.financials   financial_records rows for the project
 * @param {Set<string>} [input.hashesUsedElsewhere] file hashes that also appear in OTHER projects
 * @param {object}   [input.rules]      flag rules (merged over DEFAULT_RULES)
 * @param {Date|string} [input.today]
 */
export function evaluateProject({
  project,
  phases = [],
  images = [],
  financials = [],
  hashesUsedElsewhere = new Set(),
  rules: rulesInput = {},
  today: todayInput = new Date(),
}) {
  const rules = { ...DEFAULT_RULES, ...(rulesInput || {}) };
  const today = toDate(todayInput);
  const reasons = [];
  const add = (check, severity, code, message) => reasons.push({ check, severity, code, message });

  const ntp = toDate(project.notice_to_proceed);
  const target = toDate(project.target_completion_date);
  const hasStarted = Boolean(ntp && today >= ntp);
  const manualStatus = ['suspended', 'terminated'].includes(project.status) ? project.status : null;

  // ---------------------------------------------------------------- completion
  const completion = detectCompletion({ project, phases, images });
  const overallProgress = completion.overallProgress;
  const isCompleted = completion.isCompleted;

  if (isCompleted) {
    add('completion', 'green', 'COMPLETED', 'All phases are 100% accomplished, completion date recorded and final 360° image on file.');
  } else if (overallProgress >= 100 || completion.hasCompletionDate) {
    add(
      'completion',
      'yellow',
      'COMPLETION_INCOMPLETE_REQUIREMENTS',
      `Project reported as finished but is missing: ${completion.missing.join(', ')}.`,
    );
  }
  if (!phases.length) {
    add('completion', 'yellow', 'NO_PHASES', 'No construction phases are set up for this project.');
  }

  // ------------------------------------------------------------------ schedule
  const plannedProgress = isCompleted ? 100 : computePlannedProgress(project, phases, today);
  const slippage = isCompleted ? 0 : round2(plannedProgress - overallProgress); // + = behind schedule
  let status;

  if (manualStatus) {
    status = manualStatus;
    if (manualStatus === 'suspended') {
      add('schedule', 'yellow', 'SUSPENDED', 'Project is suspended; work is not progressing.');
    } else if (!isCompleted) {
      add('schedule', 'red', 'TERMINATED_INCOMPLETE', `Contract terminated at ${overallProgress}% accomplishment.`);
    }
  } else if (isCompleted) {
    status = 'completed';
    const actual = toDate(project.actual_completion_date);
    if (target && actual) {
      const lateDays = daysBetween(target, actual);
      if (lateDays > rules.late_completion_tolerance_days) {
        add('schedule', 'yellow', 'COMPLETED_LATE', `Completed ${lateDays} day(s) after the target completion date.`);
      }
    }
  } else if (!hasStarted) {
    status = 'not_started';
    if (!ntp) add('schedule', 'info', 'NO_NTP', 'No Notice to Proceed date recorded yet.');
    else add('schedule', 'info', 'NOT_STARTED', `Works have not started; Notice to Proceed effective ${project.notice_to_proceed}.`);
  } else if (target && today > target) {
    status = 'delayed';
    const overdue = daysBetween(target, today);
    add(
      'schedule',
      'red',
      'TARGET_DATE_PASSED',
      `Target completion date passed ${overdue} day(s) ago without completion (${overallProgress}% accomplished).`,
    );
  } else if (slippage > rules.slippage_yellow_max) {
    status = 'delayed';
    add('schedule', 'red', 'SLIPPAGE_SEVERE', `Slippage of ${slippage}% (planned ${plannedProgress}%, actual ${overallProgress}%).`);
  } else if (slippage > rules.slippage_green_max) {
    status = 'delayed';
    add('schedule', 'yellow', 'SLIPPAGE_MINOR', `Slippage of ${slippage}% (planned ${plannedProgress}%, actual ${overallProgress}%).`);
  } else {
    status = 'ongoing';
  }

  // ------------------------------------------------------------- documentation
  const sortedImages = [...images].sort((a, b) => toDate(b.inspection_date) - toDate(a.inspection_date));
  const latest = sortedImages[0];

  if (!images.length) {
    add(
      'documentation',
      hasStarted || isCompleted ? 'yellow' : 'info',
      'NO_360_IMAGE',
      'No 360° image is on record for this project.',
    );
  } else if (!isCompleted && hasStarted && latest) {
    const age = daysBetween(latest.inspection_date, today);
    if (age > rules.image_max_age_days) {
      add('documentation', 'yellow', 'IMAGE_OUTDATED', `Latest 360° image is ${age} days old (limit ${rules.image_max_age_days}).`);
    }
  }

  // Reused images: same file hash in another project, or reused on different
  // inspection dates within this project.
  const reused = new Set();
  const byHash = new Map();
  for (const img of images) {
    if (!img.file_hash) continue;
    if (hashesUsedElsewhere.has(img.file_hash)) reused.add(img.file_hash);
    const dates = byHash.get(img.file_hash) || new Set();
    dates.add(String(img.inspection_date));
    byHash.set(img.file_hash, dates);
  }
  for (const [hash, dates] of byHash) if (dates.size > 1) reused.add(hash);
  if (reused.size) {
    add('documentation', 'red', 'IMAGE_REUSED', `${reused.size} 360° image(s) appear to be reused (identical file found elsewhere).`);
  }

  // GPS consistency
  let maxDistance = 0;
  let farCount = 0;
  let veryFarCount = 0;
  let noGpsCount = 0;
  for (const img of images) {
    if (img.latitude == null || img.longitude == null) {
      noGpsCount += 1;
      continue;
    }
    const d = haversineMeters(project.latitude, project.longitude, img.latitude, img.longitude);
    maxDistance = Math.max(maxDistance, d);
    if (d > rules.gps_red_m) veryFarCount += 1;
    else if (d > rules.gps_tolerance_m) farCount += 1;
  }
  if (veryFarCount) {
    add('documentation', 'red', 'GPS_FAR', `${veryFarCount} image(s) were taken more than ${rules.gps_red_m} m from the project site.`);
  }
  if (farCount) {
    add('documentation', 'yellow', 'GPS_MISMATCH', `${farCount} image(s) were taken more than ${rules.gps_tolerance_m} m from the project site.`);
  }
  if (noGpsCount) {
    add('documentation', 'yellow', 'GPS_MISSING', `${noGpsCount} image(s) have no GPS coordinates.`);
  }

  // Timestamp consistency (capture time stored in the photo vs. the inspection date)
  let undated = 0;
  let dateMismatch = 0;
  let beforeNtp = 0;
  for (const img of images) {
    if (!img.captured_at) {
      undated += 1;
      continue;
    }
    const captured = toDate(img.captured_at);
    if (Math.abs(daysBetween(captured, img.inspection_date)) > rules.image_date_tolerance_days) dateMismatch += 1;
    if (ntp && captured < ntp) beforeNtp += 1;
  }
  if (beforeNtp) {
    add('documentation', 'red', 'IMAGE_BEFORE_NTP', `${beforeNtp} image(s) were taken before the Notice to Proceed, so they cannot show this project's works.`);
  }
  if (dateMismatch) {
    add(
      'documentation',
      'yellow',
      'IMAGE_DATE_MISMATCH',
      `${dateMismatch} image(s) were taken more than ${rules.image_date_tolerance_days} days away from their inspection date.`,
    );
  }
  if (undated) {
    add('documentation', 'yellow', 'IMAGE_UNDATED', `${undated} image(s) have no capture date in the file.`);
  }
  // ----------------------------------------------------------------- financial
  const sumOf = (type) =>
    financials.filter((f) => f.record_type === type).reduce((s, f) => s + Number(f.amount || 0), 0);
  const baseContract = Number(project.contract_amount ?? project.approved_budget ?? 0);
  const variationOrders = sumOf('variation_order');
  const revisedContractAmount = round2(baseContract + variationOrders);
  const totalDisbursed = round2(sumOf('disbursement'));
  const totalObligated = round2(sumOf('obligation'));
  const financialProgress = revisedContractAmount > 0 ? round2((totalDisbursed / revisedContractAmount) * 100) : 0;
  const financialVariance = round2(financialProgress - overallProgress); // + = paid ahead of physical work

  if (project.contract_amount != null && Number(project.contract_amount) > Number(project.approved_budget)) {
    add(
      'financial',
      'red',
      'CONTRACT_EXCEEDS_ABC',
      `Contract amount ${peso(project.contract_amount)} exceeds the approved budget ${peso(project.approved_budget)}.`,
    );
  }
  if (totalDisbursed > revisedContractAmount && revisedContractAmount > 0) {
    add(
      'financial',
      'red',
      'DISBURSEMENT_EXCEEDS_CONTRACT',
      `Disbursements ${peso(totalDisbursed)} exceed the revised contract amount ${peso(revisedContractAmount)}.`,
    );
  } else if (financialVariance > rules.financial_variance_red) {
    add(
      'financial',
      'red',
      'FINANCIAL_AHEAD_SEVERE',
      `Financial accomplishment (${financialProgress}%) is ${financialVariance}% ahead of physical accomplishment (${overallProgress}%).`,
    );
  } else if (financialVariance > rules.financial_variance_yellow) {
    add(
      'financial',
      'yellow',
      'FINANCIAL_AHEAD_MINOR',
      `Financial accomplishment (${financialProgress}%) is ${financialVariance}% ahead of physical accomplishment (${overallProgress}%).`,
    );
  }

  // ---------------------------------------------------------------- final flag
  const flag = reasons.reduce((acc, r) => (r.severity === 'info' ? acc : maxFlag(acc, r.severity)), 'green');
  if (flag === 'green' && status !== 'not_started' && !reasons.some((r) => r.severity === 'green')) {
    add('summary', 'green', 'ON_TRACK', 'Reported progress meets the planned schedule and documentation is complete.');
  }

  return {
    flag,
    completionStatus: isCompleted ? 'completed' : 'not_completed',
    status,
    reasons,
    metrics: {
      overallProgress,
      plannedProgress,
      slippage,
      financialProgress,
      financialVariance,
      totalDisbursed,
      totalObligated,
      variationOrders: round2(variationOrders),
      revisedContractAmount,
      imageCount: images.length,
      latestImageDate: latest ? String(latest.inspection_date) : null,
      maxImageDistanceM: Math.round(maxDistance),
      completionMissing: completion.missing,
      evaluatedFor: today.toISOString().slice(0, 10),
    },
  };
}
