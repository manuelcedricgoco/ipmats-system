import { useEffect, useRef, useState } from 'react';

/** Total splash time, counted from the "Sign in" click (includes the closing fade). */
const SPLASH_MS = 5_000;
const EXIT_MS = 400;
const STEPS = ['Verifying your account', 'Loading your portal', 'Preparing your workspace', 'Almost ready'];

/**
 * Formal entry screen shown after "Sign in" is clicked, before the person's portal opens:
 * DPWH and Province of Occidental Mindoro seals, system name, progress — with staged entrance
 * animations and a fade into the system. It lasts SPLASH_MS; if signing in takes longer, it waits
 * for `ready` and then fades out.
 */
export default function SplashScreen({ onDone, ready = true, durationMs = SPLASH_MS, name }) {
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const exitTimer = useRef(null);
  const showFor = Math.max(500, durationMs - EXIT_MS);

  useEffect(() => {
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / showFor);
      setProgress(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const t = setTimeout(() => setElapsed(true), showFor);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(t);
    };
  }, [showFor]);

  // Fade out once the time is up AND the sign-in has finished.
  useEffect(() => {
    if (elapsed && ready && !exitTimer.current) {
      setLeaving(true);
      exitTimer.current = setTimeout(() => onDoneRef.current?.(), EXIT_MS);
    }
  }, [elapsed, ready]);
  useEffect(() => () => clearTimeout(exitTimer.current), []);

  const step = elapsed ? STEPS.length - 1 : Math.min(STEPS.length - 1, Math.floor(progress * STEPS.length));
  const secondsLeft = Math.max(0, Math.ceil((durationMs * (1 - progress)) / 1000));
  const delay = (ms) => ({ animationDelay: `${ms}ms` });

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Signing you in. ${secondsLeft} seconds remaining.`}
      className={`fixed inset-0 z-[3000] flex flex-col overflow-hidden bg-brand-950 text-white transition-all duration-[400ms] ease-out ${
        leaving ? 'scale-[1.03] opacity-0' : 'scale-100 opacity-100 animate-fade-in'
      }`}
    >
      {/* moving light + fine grid behind everything */}
      <div className="pointer-events-none absolute -left-1/4 -top-1/3 h-[70vmax] w-[70vmax] animate-drift rounded-full bg-brand-600/30 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-1/3 -right-1/4 h-[60vmax] w-[60vmax] animate-drift-slow rounded-full bg-brand-400/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" aria-hidden />

      {/* official colour band */}
      <div className="relative z-10 flex h-1.5 shrink-0 origin-left animate-grow-x" aria-hidden>
        <div className="flex-[3] bg-brand-500" />
        <div className="flex-1 bg-red-600" />
        <div className="flex-1 bg-accent-400" />
      </div>

      <main className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
        {/* seals */}
        <div className="flex items-center gap-6 sm:gap-10">
          {[
            ['/dpwh-logo.png', 'Department of Public Works and Highways seal', 0],
            ['/occidental-seal.png', 'Province of Occidental Mindoro seal', 140],
          ].map(([src, alt, d], i) => (
            <div key={src} className="contents">
              {i === 1 && <span className="h-16 w-px origin-center animate-grow-y bg-white/25 sm:h-24" style={delay(260)} aria-hidden />}
              <span className="relative grid place-items-center">
                <span className="absolute inset-0 animate-ring rounded-full border-2 border-accent-300/60" style={delay(700 + d)} aria-hidden />
                <span className="grid h-24 w-24 animate-pop-in place-items-center rounded-full bg-white shadow-[0_0_40px_-6px_rgba(246,185,43,0.55)] sm:h-32 sm:w-32" style={delay(d)}>
                  <img src={src} alt={alt} className="h-20 w-20 object-contain sm:h-28 sm:w-28" />
                </span>
              </span>
            </div>
          ))}
        </div>

        {/* system name */}
        <p className="mt-9 animate-blur-in text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-300 sm:text-xs sm:tracking-[0.24em]" style={delay(380)}>
          Department of Public Works and Highways
        </p>
        <h1 className="mt-2 animate-blur-in bg-gradient-to-r from-white via-brand-100 to-white bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl" style={delay(480)}>
          DPWH 360°
        </h1>
        <p className="mt-3 max-w-md animate-blur-in text-sm text-brand-100 sm:text-base" style={delay(580)}>
          Infrastructure Project Monitoring and Transparency System
        </p>

        {/* progress */}
        <div className="mt-10 flex w-full max-w-xs animate-page-in flex-col items-center" style={delay(760)}>
          <p className="flex h-5 items-baseline gap-2 text-sm font-medium text-white">
            <span key={step} className="animate-step-in">{STEPS[step]}…</span>
            <span className="font-mono text-xs tabular-nums text-brand-300">{secondsLeft > 0 ? `${secondsLeft}s` : ''}</span>
          </p>
          <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-accent-500 to-accent-300" style={{ width: `${progress * 100}%` }}>
              <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" aria-hidden />
            </div>
          </div>
          <div className="mt-3 flex gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <span key={s} className={`h-1.5 rounded-full transition-all duration-500 ${i <= step ? 'w-6 bg-accent-400' : 'w-1.5 bg-white/25'}`} />
            ))}
          </div>
          {name && (
            <p className="mt-5 animate-fade-in text-xs text-brand-200">
              Signing in as <span className="font-semibold text-white">{name}</span>
            </p>
          )}
        </div>
      </main>

      <footer className="relative animate-fade-in px-6 pb-6 text-center text-[11px] leading-relaxed text-brand-300 sm:text-xs" style={delay(900)}>
        <span className="block sm:inline">Republic of the Philippines</span>
        <span className="hidden sm:inline"> · </span>
        <span className="block sm:inline">Province of Occidental Mindoro · Region IV-B MIMAROPA</span>
      </footer>
    </div>
  );
}
