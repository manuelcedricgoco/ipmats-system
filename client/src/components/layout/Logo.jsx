import { Link } from 'react-router-dom';

/** DPWH seal + product name. `light` = for dark (navy) backgrounds. */
export default function Logo({ to = '/login', light = false, subtitle = true, size = 'md' }) {
  const img = size === 'lg' ? 'h-14 w-14' : 'h-10 w-10';
  return (
    <Link
      to={to}
      className="group flex items-center gap-2.5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
    >
      <img
        src="/dpwh-logo.png"
        alt=""
        width="40"
        height="40"
        className={`${img} shrink-0 rounded-full bg-white shadow-sm ring-2 ring-white/70 transition-transform duration-500 ease-out group-hover:rotate-[30deg]`}
      />
      <span className="leading-tight">
        <span className={`block text-base font-bold tracking-tight ${light ? 'text-white' : 'text-brand-900'}`}>DPWH 360°</span>
        {subtitle && <span className={`hidden text-[11px] sm:block ${light ? 'text-brand-200' : 'text-slate-500'}`}>Occidental Mindoro · Project Records</span>}
      </span>
    </Link>
  );
}
