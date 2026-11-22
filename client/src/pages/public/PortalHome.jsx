import { AlertTriangle, CheckCircle2, FolderKanban, Hammer, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button.jsx';
import { StatCard } from '../../components/common/Card.jsx';
import ProjectCardGrid from '../../components/public/ProjectCardGrid.jsx';
import { useOpenProject } from '../../components/public/ProjectDrawer.jsx';
import PublicProjectMap from '../../components/public/PublicProjectMap.jsx';
import { useApi } from '../../hooks/useApi.js';

/**
 * PUBLIC PORTAL — landing page (no account needed): hero with search, live project counters,
 * the project map and the browsable project cards. Pins and cards open the drawer over the map.
 */
export default function PortalHome() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const stats = useApi('/public/stats', undefined, { select: (r) => r.data });
  const { openId, open, close } = useOpenProject();
  const s = stats.data;
  const count = (n) => (s ? String(n) : '—');

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl bg-brand-950 text-white shadow-panel">
        <img src="/auth-bg.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-950 via-brand-950/90 to-brand-900/60" aria-hidden />
        <div className="relative px-5 py-10 sm:px-10 sm:py-14">
          <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">Infrastructure transparency for Occidental Mindoro</h1>
          <p className="mt-3 max-w-2xl text-brand-100">See every DPWH project in the province: where it is, who is building it, what it costs and how far along it is.</p>
          <form
            role="search"
            className="mt-6 flex max-w-xl flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(q.trim() ? `/projects?search=${encodeURIComponent(q.trim())}` : '/projects');
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search a project name or municipality"
                aria-label="Search a project name or municipality"
                className="h-11 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
            <Button type="submit" variant="accent" size="lg">Search</Button>
          </form>
        </div>
      </section>

      <section aria-label="Project counts" className="stagger mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total projects" value={count(s?.total_projects)} icon={FolderKanban} />
        <StatCard label="Ongoing" value={count(s?.ongoing)} icon={Hammer} tone="brand" />
        <StatCard label="Completed" value={count(s?.completed)} icon={CheckCircle2} tone="green" />
        <StatCard label="Delayed or stalled" value={count(s?.delayed_or_stalled)} hint="Delayed or suspended" icon={AlertTriangle} tone="yellow" />
      </section>

      <section aria-labelledby="map-heading" className="mt-8">
        <h2 id="map-heading" className="text-xl font-bold text-slate-900">Project map</h2>
        <p className="mb-3 text-sm text-slate-600">Click a pin to see the project and its 360° site photo.</p>
        <PublicProjectMap openId={openId} onOpen={open} onClose={close} />
      </section>

      <section aria-labelledby="projects-heading" className="mt-10">
        <h2 id="projects-heading" className="mb-3 text-xl font-bold text-slate-900">Projects</h2>
        <ProjectCardGrid onOpen={open} pageSize={9} />
      </section>
    </>
  );
}
