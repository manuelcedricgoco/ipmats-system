import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import Logo from '../../components/layout/Logo.jsx';

export default function AuthShell({ title, subtitle, children, wide = false }) {
  return (
    <div className="grid grid-cols-1 min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-950 lg:flex lg:flex-col">
        {/* DPWH seal over an aerial view, shown at its natural proportions (sharp) and fading into navy */}
        <div className="relative overflow-hidden">
          <img
            src="/auth-bg.webp"
            alt=""
            className="aspect-[768/402] w-full animate-[authZoom_24s_ease-in-out_infinite_alternate] object-cover motion-reduce:animate-none"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-950/70 via-brand-950/10 to-brand-950" aria-hidden />
          <div className="absolute left-12 top-10">
            <Logo light />
          </div>
        </div>
        <div className="relative flex flex-1 flex-col justify-between gap-10 px-12 pb-12 pt-4 text-white">
          <div className="max-w-md animate-page-in">
            <p className="text-3xl font-bold leading-tight">One secure record of every infrastructure project in Occidental Mindoro.</p>
            <p className="mt-4 text-brand-100">Projects, contractors, implementing offices, budgets and contract duration — managed in one place by DPWH personnel, auditors and administrators.</p>
          </div>
          <p className="text-xs text-brand-300">Region IV-B MIMAROPA · Abra de Ilog · Calintaan · Looc · Lubang · Magsaysay · Mamburao · Paluan · Rizal · Sablayan · San Jose · Santa Cruz</p>
        </div>
      </div>
      <div className="relative flex items-center justify-center bg-white px-4 py-12 sm:px-8">
        {/* phones: a slim photo band on top */}
        <div className="absolute inset-x-0 top-0 h-28 overflow-hidden lg:hidden" aria-hidden>
          <img src="/auth-bg.webp" alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-950/70 to-white" />
        </div>
        <div className={`relative w-full animate-page-in ${wide ? 'max-w-lg' : 'max-w-sm'}`}>
          <div className="mb-8 lg:hidden"><Logo light={false} /></div>
          <Link to="/" className="group mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-brand-700">
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" aria-hidden /> Back to home
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
