import { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP = 8; // px between the trigger and the tooltip
const EDGE = 8; // px kept clear of the viewport edges
const SHOW_DELAY = 150; // ms of hover before the tooltip appears (focus shows it at once)

/** Top edge of the visible area for `el`: the viewport, or a scroll/overflow-hidden ancestor below it. */
function visibleTop(el) {
  let top = 0;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(p);
    if (/(auto|scroll|hidden|clip)/.test(overflowX + overflowY)) top = Math.max(top, p.getBoundingClientRect().top);
  }
  return top;
}

/**
 * Small text tooltip for one element (icon buttons in tables, etc.).
 * Shows on hover and keyboard focus, hides on leave, blur, click and Esc.
 * Rendered in a portal with `position: fixed`, so `overflow-x-auto` / `overflow-hidden`
 * table wrappers and cards never clip it. Sits above the trigger and flips below when
 * there is no room above (viewport or an overflow container). While it is shown, the
 * trigger's native `title` is set aside so the browser tooltip does not double up;
 * without JavaScript the `title` remains as the fallback.
 */
export default function Tooltip({ label, children, placement = 'top' }) {
  const id = useId();
  const wrap = useRef(null);
  const tip = useRef(null);
  const timer = useRef(null);
  const savedTitle = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  const trigger = () => wrap.current?.firstElementChild || wrap.current;

  const show = useCallback((delay) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  }, []);
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);

  // Set the native title aside while the custom tooltip is shown.
  useEffect(() => {
    const el = trigger();
    if (!el) return undefined;
    if (open && el.hasAttribute('title')) {
      savedTitle.current = el.getAttribute('title');
      el.removeAttribute('title');
    }
    return () => {
      if (savedTitle.current !== null) {
        el.setAttribute('title', savedTitle.current);
        savedTitle.current = null;
      }
    };
  }, [open]);

  const place = useCallback(() => {
    const el = trigger();
    if (!el || !tip.current) return;
    const r = el.getBoundingClientRect();
    const { width: w, height: h } = tip.current.getBoundingClientRect();
    const aboveTop = r.top - GAP - h;
    const roomAbove = aboveTop >= Math.max(EDGE, visibleTop(el));
    const roomBelow = r.bottom + GAP + h <= window.innerHeight - EDGE;
    const side = placement === 'bottom' ? (roomBelow || !roomAbove ? 'bottom' : 'top') : roomAbove || !roomBelow ? 'top' : 'bottom';
    const center = r.left + r.width / 2;
    const left = Math.min(Math.max(center - w / 2, EDGE), window.innerWidth - w - EDGE);
    setPos({ side, top: side === 'top' ? aboveTop : r.bottom + GAP, left, arrow: center - left });
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    place();
    const onKey = (e) => e.key === 'Escape' && hide();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, place, hide]);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!label) return children;

  const onFocus = (e) => {
    // Keyboard focus only: a mouse click also focuses the button, and should not reopen the tooltip.
    let visible = true;
    try {
      visible = e.target.matches(':focus-visible');
    } catch {
      /* older browsers: always show */
    }
    if (visible) show(0);
  };

  // Triggers without an accessible name of their own get the tooltip as their description.
  const child = isValidElement(children) && open && !children.props['aria-label'] ? cloneElement(children, { 'aria-describedby': id }) : children;

  return (
    <span ref={wrap} className="inline-flex" onMouseEnter={() => show(SHOW_DELAY)} onMouseLeave={hide} onFocus={onFocus} onBlur={hide} onPointerDown={hide}>
      {child}
      {open &&
        createPortal(
          <div
            ref={tip}
            id={id}
            role="tooltip"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
            className="pointer-events-none fixed z-[1600] max-w-xs animate-fade-in whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white shadow-lg"
          >
            {label}
            {pos && (
              <span
                aria-hidden
                style={{ left: pos.arrow }}
                className={`absolute h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-900 ${pos.side === 'top' ? '-bottom-1' : '-top-1'}`}
              />
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
