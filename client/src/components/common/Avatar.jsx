import { useState } from 'react';

/** Profile photo with an initials fallback. */
export default function Avatar({ src, name = '', email = '', size = 'h-8 w-8', text = 'text-xs', ring = '' }) {
  const [failed, setFailed] = useState(false);
  const initials = (name || email || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  if (src && !failed) {
    return <img src={src} alt="" onError={() => setFailed(true)} className={`${size} shrink-0 rounded-full object-cover ${ring}`} />;
  }
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-accent-400 font-bold text-brand-950 ${text} ${ring}`} aria-hidden>
      {initials}
    </span>
  );
}
