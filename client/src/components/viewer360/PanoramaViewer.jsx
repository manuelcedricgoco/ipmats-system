import 'pannellum/build/pannellum.css';
import 'pannellum/build/pannellum.js';
import { ImageOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Interactive 360° viewer (Pannellum) for an equirectangular panorama.
 * Shows a clear notice when no image is available (spec §5).
 */
export default function PanoramaViewer({
  url,
  title,
  className = 'h-72',
  autoRotate = true,
  compact = false,
  emptyHint = 'No panoramic site image has been uploaded for this project yet. Projects without documentation are flagged Yellow.',
}) {
  const el = useRef(null);
  const viewer = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setError(null);
    if (!url || !el.current || !window.pannellum) return undefined;
    viewer.current = window.pannellum.viewer(el.current, {
      type: 'equirectangular',
      panorama: url,
      autoLoad: true,
      autoRotate: autoRotate ? -2 : 0,
      autoRotateInactivityDelay: 4000,
      compass: !compact,
      showZoomCtrl: !compact,
      showFullscreenCtrl: true,
      hfov: 105,
      ...(compact || !title ? {} : { title }),
      crossOrigin: 'anonymous',
      strings: { loadingLabel: 'Loading 360° image…' },
    });
    viewer.current.on('error', (msg) => setError(msg || 'Unable to load the 360° image.'));
    return () => {
      try {
        viewer.current?.destroy();
      } catch {
        /* already destroyed */
      }
      viewer.current = null;
    };
  }, [url, title, autoRotate, compact]);

  if (!url) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-100 px-6 text-center ${className}`}>
        <ImageOff className="h-7 w-7 text-slate-400" aria-hidden />
        <p className="text-sm font-semibold text-slate-700">No 360° image available</p>
        <p className="max-w-xs text-xs text-slate-500">{emptyHint}</p>
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden rounded-lg bg-slate-900 ${className}`}>
      <div ref={el} className="h-full w-full" role="img" aria-label={`360° site image${title ? ` – ${title}` : ''}. Drag to look around.`} />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 p-4 text-center text-sm text-white" role="alert">
          {String(error)}
        </div>
      )}
    </div>
  );
}
