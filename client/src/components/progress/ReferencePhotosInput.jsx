import { ImagePlus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { MAX_REFERENCE_PHOTOS, addReferencePhotos } from '../../lib/progress.js';

/**
 * Progress rules (030): 1–5 reference photos for a progress report (JPEG, PNG or WebP, up to 10 MB each),
 * with previews. The previews are object URLs, revoked when the photos change or the form closes.
 * The server checks the actual bytes again.
 */
export default function ReferencePhotosInput({ files, onChange, invalid = false, disabled = false }) {
  const id = useId();
  const [problem, setProblem] = useState(null);
  // One object URL per chosen file, made when it is first shown; revoked when the file is removed or the form closes.
  const urls = useRef(new Map());
  const previewOf = (file) => {
    if (!urls.current.has(file)) {
      let url = null;
      try {
        url = URL.createObjectURL(file);
      } catch {
        url = null; // not a real File (server rendering in tests): the file name is shown instead
      }
      urls.current.set(file, url);
    }
    return urls.current.get(file);
  };
  useEffect(() => {
    for (const [file, url] of urls.current) {
      if (files.includes(file)) continue;
      if (url) URL.revokeObjectURL(url);
      urls.current.delete(file);
    }
  }, [files]);
  useEffect(() => {
    const map = urls.current;
    return () => {
      for (const url of map.values()) if (url) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  const pick = (e) => {
    const picked = [...(e.target.files || [])];
    e.target.value = '';
    if (!picked.length) return;
    const out = addReferencePhotos(files, picked);
    setProblem(out.error);
    onChange(out.files);
  };
  const remove = (i) => {
    setProblem(null);
    onChange(files.filter((_, j) => j !== i));
  };
  const full = files.length >= MAX_REFERENCE_PHOTOS;

  return (
    <div>
      <p id={`${id}-label`} className="mb-1 text-sm font-medium text-slate-700">
        Reference photos<span className="ml-0.5 text-red-600" aria-hidden>*</span>
      </p>
      <ul className="flex flex-wrap gap-2" aria-labelledby={`${id}-label`}>
        {files.map((f, i) => {
          const url = previewOf(f);
          return (
            <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="relative">
              {url ? (
                <img src={url} alt={`Reference photo ${i + 1}: ${f.name}`} className="h-20 w-28 rounded-lg object-cover ring-1 ring-slate-200" />
              ) : (
                <span className="grid h-20 w-28 place-items-center rounded-lg bg-slate-100 px-1 text-center text-[11px] text-slate-500 ring-1 ring-slate-200">{f.name}</span>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white text-slate-600 shadow ring-1 ring-slate-300 hover:text-red-700"
                aria-label={`Remove reference photo ${i + 1}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          );
        })}
        {!full && (
          <li>
            <label
              className={`grid h-20 w-28 cursor-pointer place-items-center rounded-lg border-2 border-dashed text-center text-xs font-semibold transition-colors ${invalid ? 'border-red-300 text-red-700' : 'border-slate-300 text-slate-600 hover:border-brand-400 hover:text-brand-700'} ${disabled ? 'pointer-events-none opacity-50' : ''}`}
            >
              <span>
                <ImagePlus className="mx-auto mb-1 h-5 w-5" aria-hidden />
                Add photos
              </span>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} disabled={disabled} aria-describedby={`${id}-hint`} />
            </label>
          </li>
        )}
      </ul>
      <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
        {files.length} of {MAX_REFERENCE_PHOTOS} · Photos of the work this report describes (JPG, PNG or WebP, up to 10 MB each). Seen by DPWH staff, PACC and the project's contractor, never the public.
      </p>
      {problem && <p className="mt-1 text-xs font-medium text-red-700">{problem}</p>}
    </div>
  );
}
