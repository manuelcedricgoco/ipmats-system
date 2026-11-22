import { useEffect, useRef, useState } from 'react';

/**
 * Fades and lifts its content into view the first time it scrolls on screen.
 * `delay` (ms) staggers neighbours. People who prefer reduced motion see the content at once (index.css).
 */
export default function Reveal({ as: As = 'div', delay = 0, className = '', children, ...props }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <As ref={ref} className={`reveal ${shown ? 'is-visible' : ''} ${className}`} style={{ '--reveal-delay': `${delay}ms` }} {...props}>
      {children}
    </As>
  );
}
