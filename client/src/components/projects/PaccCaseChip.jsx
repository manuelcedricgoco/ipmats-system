import { ShieldAlert } from 'lucide-react';
import { PACC_CASE_STATUS_LABELS } from '../../lib/constants.js';

const CLS = {
  under_investigation: 'bg-violet-50 text-violet-800 ring-violet-600/20',
  case_filed: 'bg-red-50 text-red-800 ring-red-600/20',
};

/**
 * Staff only: the project has a non-closed PACC case (`pacc_case_status`, migration 027). Shown whether or not PACC
 * shows the status on the public portal. Only the status, never the case contents. Nothing when there is no open case.
 */
export default function PaccCaseChip({ status, size = 'md' }) {
  const label = PACC_CASE_STATUS_LABELS[status];
  if (!label) return null;
  const sz = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset ${CLS[status]} ${sz}`}>
      <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </span>
  );
}
