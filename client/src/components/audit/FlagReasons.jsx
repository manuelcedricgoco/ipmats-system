import { FLAG_META } from '../../lib/constants.js';

const DOT = { info: 'bg-slate-400', green: FLAG_META.green.dot, yellow: FLAG_META.yellow.dot, red: FLAG_META.red.dot };

/** WEEK 3 — reasons behind a flag (Tracy Ann Milaflores). `hideInfo` hides the informational ones. */
export default function FlagReasons({ reasons = [], hideInfo = false, compact = false }) {
  const list = reasons.filter((r) => !(hideInfo && r.severity === 'info'));
  if (!list.length) return <p className="text-sm text-slate-500">No issues found.</p>;
  return (
    <ul className={compact ? 'space-y-1' : 'space-y-2'}>
      {list.map((r, i) => (
        <li key={`${r.code}-${i}`} className={`flex items-start gap-2 ${compact ? 'text-xs' : 'text-sm'} text-slate-700`}>
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[r.severity] || 'bg-slate-400'}`} aria-hidden />
          <span>
            <span className="sr-only">{r.severity}: </span>
            {r.message}
          </span>
        </li>
      ))}
    </ul>
  );
}
