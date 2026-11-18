import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { checkAvatarFile } from '../../lib/imageFile.js';
import Avatar from './Avatar.jsx';

/**
 * Profile photo chooser: shows a circular preview, validates the file, and
 * reports { file, error } upward. `currentUrl` shows the saved photo.
 */
export default function PhotoPicker({ name, email, currentUrl, onChange, onRemove, disabled = false, size = 'h-28 w-28', showRemove = false }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = checkAvatarFile(file);
    setError(problem);
    if (problem) {
      onChange?.(null, problem);
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    const url = URL.createObjectURL(file);
    setPreview(url);
    onChange?.(file, null);
  };

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
      <div className="relative">
        <Avatar src={preview || currentUrl} name={name} email={email} size={size} text="text-3xl" ring="ring-4 ring-white shadow-card" />
        <label
          className={`absolute -bottom-1 -right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-brand-800 text-white shadow-md ring-2 ring-white transition-all duration-150 hover:scale-105 hover:bg-brand-900 focus-within:ring-brand-500 ${disabled ? 'pointer-events-none opacity-50' : ''}`}
          title={currentUrl || preview ? 'Change photo' : 'Add photo'}
        >
          <Camera className="h-4 w-4" aria-hidden />
          <span className="sr-only">{currentUrl || preview ? 'Change photo' : 'Add photo'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} disabled={disabled} />
        </label>
      </div>
      <div className="text-center sm:text-left">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 transition-all duration-150 hover:bg-slate-50 hover:ring-slate-400 active:scale-[0.98]">
          <ImagePlus className="h-4 w-4 text-slate-500" aria-hidden />
          {currentUrl || preview ? 'Choose another photo' : 'Choose photo'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} disabled={disabled} />
        </label>
        {showRemove && currentUrl && !preview && (
          <button type="button" onClick={onRemove} className="ml-2 inline-flex items-center gap-1 rounded-md px-2 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50">
            <Trash2 className="h-4 w-4" aria-hidden /> Remove
          </button>
        )}
        <p className="mt-2 text-xs text-slate-500">JPG, PNG or WebP · at least 128 px · up to 2 MB. We crop it to a square.</p>
        {error && <p className="mt-1 text-xs font-medium text-red-700">{error}</p>}
      </div>
    </div>
  );
}
