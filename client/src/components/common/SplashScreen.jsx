import { useEffect, useRef, useState } from 'react';

export const SPLASH_MS = 10_000;
const STEPS = ['Verifying your account', 'Loading your portal', 'Preparing your workspace', 'Almost ready'];

/**
 * Formal entry screen shown for SPLASH_MS after a successful sign-in, before
 * the person's portal opens: DPWH and Province of Occidental Mindoro seals,
 * system name, spinner and progress.
 */
export default function SplashScreen({ onDone, durationMs = SPLASH_MS, name }) {
  const [progress, setProgress] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / durationMs);
      setProgress(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const done = setTimeout(() => onDoneRef.current?.(), durationMs);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
    };
  }, [durationMs]);

  const step = Math.min(STEPS.length - 1, Math.floor(progress * STEPS.length));
  const secondsLeft = Math.max(0, Math.ceil((durationMs * (1 - progress)) / 1000));
  const delay = (ms) => ({ animationDelay: `${ms}ms` });

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Signing you in. ${secondsLeft} seconds remaining.`}
      className="fixed inset-0 z-[3000] flex flex-col bg-white text-slate-900 animate-fade-in"
    >
      {/* thin official colour band */}
      <div className="relative z-10 flex h-1.5 shrink-0" aria-hidden>
        <div className="flex-[3] bg-brand-900" />
        <div className="flex-1 bg-red-600" />
        <div className="flex-1 bg-accent-400" />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(238,244,251,0.7)_0%,#ffffff_60%)]" aria-hidden />

      <main className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
        {/* seals */}
        <div className="flex items-center gap-6 sm:gap-10">
          <img
            src="/dpwh-logo.png"
            alt="Department of Public Works and Highways seal"
            className="h-20 w-20 animate-scale-in object-contain drop-shadow-sm sm:h-28 sm:w-28"
          />
          <span className="h-16 w-px animate-fade-in bg-slate-200 sm:h-24" style={delay(150)} aria-hidden />
          <img
            src="/occidental-seal.png"
            alt="Province of Occidental Mindoro seal"
            className="h-20 w-20 animate-scale-in object-contain drop-shadow-sm sm:h-28 sm:w-28"
            style={delay(120)}
          />
        </div>

        {/* system name */}
        <p className="mt-8 animate-page-in text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:text-xs sm:tracking-[0.22em]" style={delay(200)}>
          Department of Public Works and Highways
        </p>
        <h1 className="mt-2 animate-page-in text-4xl font-bold tracking-tight text-brand-900 sm:text-5xl" style={delay(260)}>
          DPWH 360°
        </h1>
        <p className="mt-2 max-w-md animate-page-in text-sm text-slate-600 sm:text-base" style={delay(320)}>
          Infrastructure Project Monitoring and Transparency System
        </p>

        {/* loading */}
        <div className="mt-10 flex animate-fade-in flex-col items-center" style={delay(420)}>
          <svg className="h-10 w-10 animate-spin [animation-duration:1.1s] motion-reduce:animate-none" viewBox="0 0 40 40" aria-hidden>
            <circle cx="20" cy="20" r="16" fill="none" strokeWidth="3.5" className="stroke-slate-200" />
            <circle cx="20" cy="20" r="16" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="28 100" className="stroke-brand-700" />
          </svg>
          <p className="mt-4 flex items-baseline gap-2 text-sm font-medium text-slate-800">
            <span key={step} className="animate-fade-in">{STEPS[step]}…</span>
            <span className="font-mono text-xs tabular-nums text-slate-400">{secondsLeft > 0 ? `${secondsLeft}s` : ''}</span>
          </p>
          <div className="mt-3 h-1 w-64 overflow-hidden rounded-full bg-slate-200 sm:w-72">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-800 to-brand-500" style={{ width: `${progress * 100}%` }} />
          </div>
          {name && <p className="mt-4 text-xs text-slate-500">Signing in as <span className="font-semibold text-slate-700">{name}</span></p>}
        </div>
      </main>

      <footer className="relative px-6 pb-6 text-center text-[11px] leading-relaxed text-slate-400 sm:text-xs">
        <span className="block sm:inline">Republic of the Philippines</span>
        <span className="hidden sm:inline"> · </span>
        <span className="block sm:inline">Province of Occidental Mindoro · Region IV-B MIMAROPA</span>
      </footer>
    </div>
  );
}
