import {
  ArrowRight,
  BadgeCheck,
  Camera,
  ChevronDown,
  ClipboardCheck,
  Coins,
  Database,
  FileBarChart,
  Flag,
  HardHat,
  History,
  LayoutDashboard,
  Lock,
  LogIn,
  MapPin,
  Menu,
  ScanEye,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Reveal from '../../components/common/Reveal.jsx';
import Logo from '../../components/layout/Logo.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * LANDING PAGE — overview of the system for everyone, shown before Sign in / Register.
 * It explains what IPMATS does; the project data itself is in the public portal (/portal) after signing in.
 */

const NAV = [
  ['#features', 'What it does'],
  ['#how', 'How it works'],
  ['#flags', 'Flags'],
  ['#roles', 'Who uses it'],
];

// The eight specific objectives of the concept document (§12)
const FEATURES = [
  { icon: Database, title: 'Centralized project records', text: 'One platform for every project: contractors, approved budgets, implementing offices and project duration, with a Project ID assigned automatically.', objective: 'Objective 1' },
  { icon: Camera, title: '360° site imaging', text: 'Panoramic photos of actual site conditions. Each photo’s GPS and capture time are checked against the project site and schedule.', objective: 'Objective 2' },
  { icon: TrendingUp, title: 'Phase-by-phase progress', text: 'Each project is divided into weighted phases. Overall completion is computed from what was accomplished in every phase.', objective: 'Objective 3' },
  { icon: Coins, title: 'Financial monitoring', text: 'Budgets, obligations, disbursements, variation orders and expenses — per project and per phase — with the remaining balance and fund utilization.', objective: 'Objective 4' },
  { icon: Flag, title: 'Automatic flagging', text: 'The system detects whether a project is completed and flags delays and discrepancies Green, Yellow or Red, for auditors to verify.', objective: 'Objective 5' },
  { icon: MapPin, title: 'GIS project map', text: 'Every project on an OpenStreetMap of the province. Selecting a location opens its 360° view with the budget, contractor and other details.', objective: 'Objective 6' },
  { icon: ClipboardCheck, title: 'Audit and inspection', text: 'Auditors confirm or override flags with evidence, record findings, assign corrective actions and download PDF or Excel reports.', objective: 'Objective 7' },
  { icon: LayoutDashboard, title: 'Monitoring dashboard', text: 'Charts of project performance, flags, financial records and overall progress for each role — and a public dashboard.', objective: 'Objective 8' },
];

const STEPS = [
  { icon: HardHat, title: 'Register', text: 'DPWH personnel register the project, pin its location inside Occidental Mindoro and set up its phases.' },
  { icon: Camera, title: 'Report', text: 'Progress, payments and 360° site photos are submitted as the work goes on.' },
  { icon: ScanEye, title: 'Check', text: 'The system compares schedule, photos and payments and raises a flag when something does not add up.' },
  { icon: BadgeCheck, title: 'Review', text: 'Auditors review each flag. The public sees the projects and the reviewed results.' },
];

const FLAGS = [
  { tone: 'green', title: 'Green — on track', text: 'Work is on schedule, the site photos are recent and match the location, and payments follow the work done.' },
  { tone: 'yellow', title: 'Yellow — needs attention', text: 'Slightly behind schedule, missing or outdated 360° photos, or payments running ahead of the work.' },
  { tone: 'red', title: 'Red — for investigation', text: 'Target date passed, seriously behind, photos taken far from the site or reused, or the contract above its approved budget.' },
];
const FLAG_STYLE = {
  green: 'from-emerald-500 to-emerald-600 shadow-emerald-500/30',
  yellow: 'from-amber-400 to-amber-500 shadow-amber-500/30',
  red: 'from-red-500 to-red-600 shadow-red-500/30',
};

const ROLES = [
  { icon: ShieldCheck, title: 'System Administrator', text: 'Approves staff access requests, manages accounts and implementing offices.' },
  { icon: HardHat, title: 'DPWH Personnel', text: 'Registers projects and contractors, reports progress and payments, uploads 360° photos.' },
  { icon: ClipboardCheck, title: 'Auditor', text: 'Reviews flags, records findings and corrective actions, downloads audit reports.' },
  { icon: Users, title: 'Public', text: 'Registers for free and follows projects, progress, spending and reviewed flags on the portal.' },
];

const MUNICIPALITIES = ['Abra de Ilog', 'Calintaan', 'Looc', 'Lubang', 'Magsaysay', 'Mamburao', 'Paluan', 'Rizal', 'Sablayan', 'San Jose', 'Santa Cruz'];

const SAFEGUARDS = [
  { icon: Lock, text: 'Project data is shown only to signed-in accounts' },
  { icon: ShieldCheck, text: 'Each role sees and does only what it is allowed to' },
  { icon: History, text: 'Flag history and auditor decisions cannot be edited' },
  { icon: MapPin, text: 'Locations and photos are checked against Occidental Mindoro' },
];

/**
 * Smooth scroll to a section of this page (header links, mobile menu, the arrow under the hero).
 * The sections have scroll-margin for the fixed top bar; people who prefer reduced motion jump instead.
 */
function scrollToSection(e, href) {
  const target = document.querySelector(href);
  if (!target) return;
  e.preventDefault();
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  window.history.replaceState(null, '', href); // keep the address shareable without a jump
  target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true }); // keyboard and screen-reader users continue from the section
}

function useScrolled(offset = 12) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > offset);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [offset]);
  return scrolled;
}

/** Where a signed-in person continues to. */
function useContinue() {
  const { isAuthenticated, isPending, isStaff } = useAuth();
  if (!isAuthenticated) return null;
  if (isPending) return { to: '/account-pending', label: 'View your request' };
  if (isStaff) return { to: '/app', label: 'Go to your dashboard' };
  return { to: '/portal/dashboard', label: 'Go to the public portal' };
}

const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-accent-400 px-5 py-3 text-sm font-semibold text-brand-950 shadow-[0_10px_30px_-10px_rgba(246,185,43,0.8)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-accent-300 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950',
  ghost:
    'inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
};

export default function LandingPage() {
  const scrolled = useScrolled();
  const next = useContinue();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    document.title = 'DPWH 360° — Infrastructure Project Monitoring and Transparency System';
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <a href="#overview" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[3000] focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* ------------------------------------------------------------ top bar */}
      <header className={`fixed inset-x-0 top-0 z-[1100] transition-all duration-300 ${scrolled || menu ? 'bg-brand-950/90 shadow-panel backdrop-blur-md' : 'bg-transparent'}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo to="/" light />
          <nav aria-label="Sections" className="hidden items-center gap-1 lg:flex">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} onClick={(e) => scrollToSection(e, href)} className="relative rounded-lg px-3 py-2 text-sm font-medium text-brand-100 transition-colors after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-accent-400 after:transition-transform after:duration-300 hover:text-white hover:after:scale-x-100">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {next ? (
              <Link to={next.to} className={`${btn.primary} !px-4 !py-2`}>
                <LayoutDashboard className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">{next.label}</span><span className="sm:hidden">Open</span>
              </Link>
            ) : (
              <>
                <Link to="/register" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:inline-flex">
                  <UserPlus className="h-4 w-4" aria-hidden /> Register
                </Link>
                <Link to="/login" className={`${btn.primary} !px-4 !py-2`}>
                  <LogIn className="h-4 w-4" aria-hidden /> Sign in
                </Link>
              </>
            )}
            <button type="button" onClick={() => setMenu((m) => !m)} className="rounded-lg p-2 text-white transition-colors hover:bg-white/10 lg:hidden" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu}>
              {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        <div className={`grid overflow-hidden transition-all duration-300 ease-out lg:hidden ${menu ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <nav aria-label="Sections (mobile)" className="min-h-0">
            <div className="space-y-1 border-t border-white/10 px-4 py-3">
              {NAV.map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  onClick={(e) => {
                    setMenu(false);
                    scrollToSection(e, href);
                  }}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-brand-100 hover:bg-white/10 hover:text-white">
                  {label}
                </a>
              ))}
              {!next && (
                <Link to="/register" className="block rounded-lg px-3 py-2 text-sm font-semibold text-accent-300 hover:bg-white/10">
                  Register an account
                </Link>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section id="overview" className="relative overflow-hidden bg-brand-950 pb-20 pt-28 text-white sm:pb-28 sm:pt-36">
          <img src="/auth-bg.webp" alt="" className="absolute inset-0 h-full w-full animate-[authZoom_24s_ease-in-out_infinite_alternate] object-cover opacity-25 motion-reduce:animate-none" aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-950/80 via-brand-950/85 to-brand-950" aria-hidden />
          <div className="pointer-events-none absolute -left-40 top-10 h-[28rem] w-[28rem] animate-drift rounded-full bg-brand-500/30 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -right-32 bottom-0 h-[24rem] w-[24rem] animate-drift-slow rounded-full bg-accent-500/20 blur-3xl" aria-hidden />

          <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="inline-flex animate-blur-in items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-accent-300 backdrop-blur">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400" aria-hidden />
                DPWH · Province of Occidental Mindoro
              </p>
              <h1 className="mt-5 animate-blur-in text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl" style={{ animationDelay: '100ms' }}>
                Public works,{' '}
                <span className="bg-gradient-to-r from-accent-300 via-accent-400 to-accent-300 bg-clip-text text-transparent">seen in 360°</span>.
              </h1>
              <p className="mt-5 max-w-xl animate-blur-in text-base leading-relaxed text-brand-100 sm:text-lg" style={{ animationDelay: '200ms' }}>
                DPWH 360° is the Infrastructure Project Monitoring and Transparency System of Occidental Mindoro. It records every project, follows its
                progress and spending phase by phase, documents the site with 360° photos, and flags delays and discrepancies automatically.
              </p>
              <div className="mt-8 flex animate-blur-in flex-col gap-3 sm:flex-row" style={{ animationDelay: '300ms' }}>
                {next ? (
                  <Link to={next.to} className={btn.primary}>
                    {next.label} <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                ) : (
                  <>
                    <Link to="/register" className={btn.primary}>
                      Create a free account <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                    <Link to="/login" className={btn.ghost}>
                      <LogIn className="h-4 w-4" aria-hidden /> Sign in
                    </Link>
                  </>
                )}
              </div>
              <p className="mt-4 animate-fade-in text-xs text-brand-300" style={{ animationDelay: '450ms' }}>
                Anyone can register as Public to follow the projects. Staff accounts are approved by the System Administrator.
              </p>
            </div>

            {/* illustrative preview of what a project record shows */}
            <div className="relative mx-auto w-full max-w-md animate-pop-in lg:max-w-none" style={{ animationDelay: '250ms' }} aria-hidden>
              <div className="animate-float rounded-2xl border border-white/10 bg-white/[0.07] p-5 shadow-panel backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-200">Sample project record</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> YELLOW
                  </span>
                </div>
                <p className="mt-3 text-lg font-semibold">Concreting of a farm-to-market road</p>
                <p className="text-xs text-brand-200">Municipality · Contractor · Implementing office</p>
                <div className="mt-5 space-y-3">
                  {[
                    ['Work accomplished', 'bg-accent-400', '68%'],
                    ['Planned by today', 'bg-brand-300', '76%'],
                    ['Funds disbursed', 'bg-emerald-400', '61%'],
                  ].map(([label, color, w], i) => (
                    <div key={label}>
                      <div className="flex justify-between text-[11px] text-brand-100">
                        <span>{label}</span>
                        <span className="font-semibold text-white">{w}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className={`h-full origin-left animate-bar-fill rounded-full ${color}`} style={{ width: w, animationDelay: `${600 + i * 180}ms` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {['Site photo', 'GPS check', 'Time check'].map((t, i) => (
                    <div key={t} className="animate-page-in rounded-lg border border-white/10 bg-white/5 p-2 text-center" style={{ animationDelay: `${1100 + i * 120}ms` }}>
                      {i === 0 ? <Camera className="mx-auto h-4 w-4 text-accent-300" /> : <BadgeCheck className="mx-auto h-4 w-4 text-emerald-300" />}
                      <p className="mt-1 text-[10px] text-brand-100">{t}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 rounded-lg bg-amber-400/10 p-2.5 text-[11px] leading-relaxed text-amber-100">
                  Why this flag: 8 points behind the planned schedule.
                </p>
              </div>
              <div className="absolute -bottom-12 right-4 hidden animate-float rounded-xl border border-white/10 bg-brand-900/90 px-3 py-2 text-xs shadow-panel backdrop-blur sm:block [animation-delay:-3s]">
                <p className="font-semibold text-white">Checked automatically</p>
                <p className="text-brand-200">after every update and daily</p>
              </div>
            </div>
          </div>

          <a href="#features" onClick={(e) => scrollToSection(e, '#features')} className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 animate-bounce rounded-full p-2 text-brand-200 transition-colors hover:text-white sm:block" aria-label="Scroll to what it does">
            <ChevronDown className="h-6 w-6" />
          </a>
        </section>

        {/* ------------------------------------------------------------ safeguards strip */}
        <section aria-label="Safeguards" className="border-b border-slate-200 bg-slate-50">
          <ul className="mx-auto grid max-w-7xl grid-cols-1 gap-3 px-4 py-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {SAFEGUARDS.map(({ icon: Icon, text }, i) => (
              <Reveal as="li" key={text} delay={i * 80} className="flex items-center gap-3 text-sm text-slate-700">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-900 text-accent-300">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                {text}
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------------------ features */}
        <section id="features" className="scroll-mt-20 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">What the system does</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">Eight objectives, one transparent record</h2>
              <p className="mt-3 text-slate-600">Built for the DPWH offices of Occidental Mindoro, from registration of a project to its final audit.</p>
            </Reveal>
            <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, text, objective }, i) => (
                <Reveal key={title} delay={(i % 4) * 90}>
                  <article className="group relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-card-hover">
                    <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-50 transition-transform duration-500 group-hover:scale-150" aria-hidden />
                    <span className="relative grid h-11 w-11 place-items-center rounded-xl bg-brand-900 text-accent-300 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <p className="relative mt-5 text-[11px] font-semibold uppercase tracking-wider text-accent-600">{objective}</p>
                    <h3 className="relative mt-1 text-lg font-semibold text-brand-950">{title}</h3>
                    <p className="relative mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ how it works */}
        <section id="how" className="scroll-mt-20 bg-slate-50 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">How it works</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">From the site to the public, in four steps</h2>
            </Reveal>
            <ol className="relative mt-12 grid grid-cols-1 gap-8 md:grid-cols-4 md:gap-6">
              <Reveal as="li" aria-hidden className="pointer-events-none absolute left-6 right-6 top-6 hidden md:block">
                <span className="grow-on-reveal block h-0.5 origin-left bg-gradient-to-r from-brand-200 via-accent-300 to-brand-200" />
              </Reveal>
              {STEPS.map(({ icon: Icon, title, text }, i) => (
                <Reveal as="li" key={title} delay={150 + i * 140} className="relative">
                  <span className="relative z-10 grid h-12 w-12 place-items-center rounded-2xl bg-brand-900 text-accent-300 shadow-panel ring-4 ring-slate-50">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="mt-4 text-xs font-semibold text-accent-600">Step {i + 1}</p>
                  <h3 className="text-lg font-semibold text-brand-950">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------------ flags */}
        <section id="flags" className="scroll-mt-20 py-20 sm:py-24">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Automated flagging</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">Every project carries a flag — and the reasons for it</h2>
              <p className="mt-3 text-slate-600">
                The system compares the planned schedule with the work reported, checks the 360° photos and follows the payments. An auditor then
                confirms or overrides the flag, and every decision is kept in a history that cannot be edited.
              </p>
            </Reveal>
            <div className="space-y-4">
              {FLAGS.map(({ tone, title, text }, i) => (
                <Reveal key={tone} delay={i * 120}>
                  <div className="group flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-card transition-all duration-300 hover:translate-x-1 hover:shadow-card-hover">
                    <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg transition-transform duration-300 group-hover:scale-110 ${FLAG_STYLE[tone]}`}>
                      <Flag className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <h3 className="font-semibold text-brand-950">{title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ roles */}
        <section id="roles" className="scroll-mt-20 bg-brand-950 py-20 text-white sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">Who uses it</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Four roles, each with its own workspace</h2>
              <p className="mt-3 text-brand-100">Every account signs in to a workspace made for its job. Staff access is granted only after approval.</p>
            </Reveal>
            <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {ROLES.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} delay={i * 100}>
                  <article className="group h-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent-400/40 hover:bg-white/[0.08]">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-400 text-brand-950 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-brand-100">{text}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ coverage */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Coverage</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">All 11 municipalities of Occidental Mindoro</h2>
              <p className="mt-3 text-slate-600">Region IV-B MIMAROPA, including the Lubang island group. Project locations must fall inside the province boundary.</p>
            </Reveal>
            <ul className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-2.5">
              {MUNICIPALITIES.map((m, i) => (
                <Reveal as="li" key={m} delay={i * 45}>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-800">
                    <MapPin className="h-3.5 w-3.5 text-accent-500" aria-hidden /> {m}
                  </span>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------ call to action */}
        <section className="px-4 pb-20 sm:px-6">
          <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-900 to-brand-950 px-6 py-12 text-center text-white shadow-panel sm:px-12">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 animate-drift rounded-full bg-accent-500/20 blur-3xl" aria-hidden />
            <FileBarChart className="mx-auto h-10 w-10 text-accent-300" aria-hidden />
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">Follow the projects in your municipality</h2>
            <p className="mx-auto mt-3 max-w-xl text-brand-100">
              Register as Public to see every project, its progress, how much has been paid and the flags reviewed by auditors.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              {next ? (
                <Link to={next.to} className={btn.primary}>
                  {next.label} <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              ) : (
                <>
                  <Link to="/register" className={btn.primary}>
                    <UserPlus className="h-4 w-4" aria-hidden /> Register
                  </Link>
                  <Link to="/login" className={btn.ghost}>
                    <LogIn className="h-4 w-4" aria-hidden /> Sign in
                  </Link>
                </>
              )}
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img src="/dpwh-logo.png" alt="" className="h-9 w-9 rounded-full bg-white" />
            <div>
              <p className="font-semibold text-slate-800">DPWH 360° · IPMATS</p>
              <p className="text-xs">Infrastructure Project Monitoring and Transparency System · Occidental Mindoro</p>
            </div>
          </div>
          <p className="text-xs md:text-right">
            Figures are reported by DPWH personnel and are for transparency.
            <br className="hidden md:block" /> They do not replace an engineering inspection or an official audit.
          </p>
        </div>
      </footer>
    </div>
  );
}
