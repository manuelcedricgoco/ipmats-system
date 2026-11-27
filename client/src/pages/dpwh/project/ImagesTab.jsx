import { AlertTriangle, CalendarClock, CloudOff, Columns2, Crosshair, MapPin, Star, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FlagBadge, Pill } from '../../../components/common/Badges.jsx';
import Button from '../../../components/common/Button.jsx';
import { Card, CardHeader } from '../../../components/common/Card.jsx';
import { Alert, EmptyState, ErrorState, PageLoader } from '../../../components/common/Feedback.jsx';
import { Checkbox, Field, Input, Select } from '../../../components/common/Form.jsx';
import Modal from '../../../components/common/Modal.jsx';
import PanoramaViewer from '../../../components/viewer360/PanoramaViewer.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { api } from '../../../lib/api.js';
import { date, dateTime, todayIso } from '../../../lib/format.js';
import { isNetworkError, queueUpload } from '../../../lib/offlineUploads.js';

/** What the server found when it checked the photo's GPS and timestamp. */
function Checks({ img }) {
  const v = img.validation || {};
  const far = v.distance_m != null && v.distance_m > 500;
  return (
    <div className="space-y-1 text-xs text-slate-600">
      <p className="inline-flex items-center gap-1">
        <MapPin className="h-3 w-3 shrink-0" aria-hidden />
        {img.latitude != null ? `${Number(img.latitude).toFixed(5)}, ${Number(img.longitude).toFixed(5)}` : 'No GPS'}
        <span className="text-slate-400">({img.gps_source === 'exif' ? 'from photo' : img.gps_source === 'manual' ? 'entered' : 'none'})</span>
        {v.distance_m != null && <span className={far ? 'font-semibold text-amber-700' : ''}>· {v.distance_m} m from site</span>}
      </p>
      <p className="inline-flex items-center gap-1">
        <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
        {img.captured_at ? `Taken ${dateTime(img.captured_at)}` : 'No capture time'}
        <span className="text-slate-400">({v.timestamp_source === 'exif' ? 'from photo' : v.timestamp_source === 'manual' ? 'entered' : 'none'})</span>
      </p>
      {(v.warnings || []).map((w) => (
        <p key={w} className="flex items-start gap-1 text-amber-800">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {w}
        </p>
      ))}
    </div>
  );
}

/**
 * WEEK 3 — 360° image upload and Pannellum viewer (Tracy Ann Milaflores, front-end).
 * Shows the site photos of one project in an interactive 360° viewer, lets DPWH personnel
 * upload new ones, and shows the GPS / timestamp checks made by the server.
 * Every uploaded photo is shown on the public portal at once (no approval step); with no connection a photo is
 * saved on the device and uploaded later (lib/offlineUploads.js).
 */
export default function ImagesTab() {
  const { project, reloadProject, canEdit, canDelete } = useOutletContext();
  const toast = useToast();
  const images = useApi(`/projects/${project.id}/images`, undefined, { select: (r) => r.data });
  const phases = useApi(`/projects/${project.id}/phases`, undefined, { select: (r) => r.data.phases });
  const [selected, setSelected] = useState(null);
  const [compare, setCompare] = useState(false);
  const [compareId, setCompareId] = useState(null);
  const [uploading, setUploading] = useState(false);

  if (images.loading && !images.data) return <PageLoader label="Loading 360° images…" withHeader={false} />;
  if (images.error) return <ErrorState error={images.error} onRetry={images.reload} />;
  const list = images.data;
  const current = list.find((i) => i.id === selected) || list[0];
  const previous = list.find((i) => i.id === compareId) || list[1];

  const changed = (message) => {
    toast.success(message);
    images.reload();
    reloadProject();
  };

  const setFinal = async (img) => {
    try {
      await api.patch(`/projects/${project.id}/images/${img.id}`, { is_final: !img.is_final });
      changed(img.is_final ? 'No longer marked as the final as-built image.' : 'Marked as the final as-built image.');
    } catch (e) {
      toast.error(e.message);
    }
  };
  const remove = async (img) => {
    if (!window.confirm(`Delete the 360° image from ${date(img.inspection_date)}? This cannot be undone.`)) return;
    try {
      await api.del(`/projects/${project.id}/images/${img.id}`);
      changed('360° image deleted.');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const uploadModal = (
    <UploadModal
      open={uploading}
      onClose={() => setUploading(false)}
      project={project}
      phases={phases.data || []}
      onDone={(msg) => {
        setUploading(false);
        changed(msg);
      }}
    />
  );

  if (!list.length) {
    return (
      <>
        <EmptyState
          title="No 360° images yet"
          description="Projects without panoramic site photos are flagged Yellow automatically."
          action={canEdit && <Button icon={Upload} onClick={() => setUploading(true)}>Upload a 360° image</Button>}
        />
        {uploadModal}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={compare ? 'Compare site conditions' : 'Interactive 360° viewer'}
          description="Drag to look around. Use full screen for a closer look."
          actions={
            <>
              {list.length > 1 && (
                <Button size="sm" variant={compare ? 'primary' : 'secondary'} icon={Columns2} onClick={() => setCompare((c) => !c)} aria-pressed={compare}>
                  Compare two dates
                </Button>
              )}
              {canEdit && <Button size="sm" icon={Upload} onClick={() => setUploading(true)}>Upload 360° image</Button>}
            </>
          }
        />
        <div className={`grid gap-3 p-3 ${compare ? 'md:grid-cols-2' : ''}`}>
          {compare && (
            <div>
              <Select aria-label="Earlier image" value={previous?.id || ''} onChange={(e) => setCompareId(e.target.value)} className="mb-2">
                {list.map((i) => <option key={i.id} value={i.id}>Earlier: {date(i.inspection_date)}</option>)}
              </Select>
              <PanoramaViewer url={previous?.url} title={`Earlier – ${date(previous?.inspection_date)}`} className="h-72 sm:h-80" autoRotate={false} />
            </div>
          )}
          <div>
            {compare && (
              <Select aria-label="Current image" value={current?.id || ''} onChange={(e) => setSelected(e.target.value)} className="mb-2">
                {list.map((i) => <option key={i.id} value={i.id}>Current: {date(i.inspection_date)}</option>)}
              </Select>
            )}
            <PanoramaViewer url={current?.url} title={current?.caption || project.name} className={compare ? 'h-72 sm:h-80' : 'h-80 sm:h-[28rem]'} autoRotate={!compare} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Site photos" description={`${list.length} photo(s), newest first. The server checks each photo's GPS and capture time.`} />
        <ul className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((img) => (
            <li key={img.id}>
              <div className={`group h-full rounded-lg border p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover ${img.id === current?.id ? 'border-brand-600 ring-1 ring-brand-600' : 'border-slate-200 hover:border-slate-300'}`}>
                <button type="button" onClick={() => setSelected(img.id)} className="block w-full text-left" aria-pressed={img.id === current?.id}>
                  <div className="mb-2 aspect-[2/1] overflow-hidden rounded bg-slate-200">
                    {img.url ? <img src={img.url} alt={`360° photo from ${date(img.inspection_date)}`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" /> : <div className="flex h-full items-center justify-center text-xs text-slate-500">File not available</div>}
                  </div>
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-semibold text-slate-900">Inspection {date(img.inspection_date)}</span>
                    {img.is_final && <Pill className="bg-emerald-50 text-emerald-800">Final as-built</Pill>}
                    {img.validation?.reused_elsewhere && <Pill className="bg-red-50 text-red-800">Reused file</Pill>}
                  </div>
                  {img.phase_name && <p className="text-xs text-slate-600">{img.phase_name}</p>}
                  <Checks img={img} />
                  <p className="mt-1 text-[11px] text-slate-400">Uploaded by {img.uploaded_by_name || '—'}</p>
                </button>
                {(canEdit || canDelete) && (
                  <div className="mt-2 flex flex-wrap gap-3 border-t border-slate-100 pt-2">
                    {canEdit && (
                      <button type="button" onClick={() => setFinal(img)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                        <Star className="h-3.5 w-3.5" aria-hidden /> {img.is_final ? 'Unmark final' : 'Mark as final'}
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" onClick={() => remove(img)} className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {uploadModal}
    </div>
  );
}

/** Upload one 360° panorama. The server validates GPS + timestamp, stores it and re-evaluates the flag. */
function UploadModal({ open, onClose, project, phases, onDone }) {
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);
  const [queued, setQueued] = useState(false);
  const [locating, setLocating] = useState(false);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setErr(null);
    setResult(null);
    setQueued(false);
    const currentPhase = phases.find((ph) => Number(ph.accomplishment) < 100) || phases.at(-1);
    setForm({ inspection_date: todayIso(), phase_id: currentPhase?.id || '', latitude: '', longitude: '', caption: '', is_final: false });
  }, [open, phases]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setErr({ message: 'Choose a 360° photo to upload.' });
    setSaving(true);
    setErr(null);
    // No signal: keep the photo on this device and send it later.
    const saveOffline = async () => {
      try {
        await queueUpload({ projectId: project.id, projectCode: project.project_code, fields: form, file });
        setQueued(true);
      } catch (e3) {
        setErr({ message: `No connection, and this browser cannot keep the photo offline (${e3.message}).` });
      }
    };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await saveOffline();
      setSaving(false);
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(form).forEach(([k, v]) => v !== '' && v !== undefined && fd.append(k, String(v)));
    try {
      const res = await api.post(`/projects/${project.id}/images`, fd);
      setResult(res.data);
    } catch (e2) {
      if (isNetworkError(e2)) await saveOffline();
      else setErr(e2);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={result ? () => onDone('360° image uploaded.') : queued ? () => onDone('Photo saved on this device; it will upload when you are back online.') : onClose}
      size="lg"
      title="Upload 360° panoramic image"
      description="Equirectangular (2:1) JPEG, PNG or WebP, up to 30 MB. GPS and capture time are read from the photo."
      footer={
        result ? (
          <Button onClick={() => onDone('360° image uploaded.')}>Done</Button>
        ) : queued ? (
          <Button onClick={() => onDone('Photo saved on this device; it will upload when you are back online.')}>OK</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="upload-form" loading={saving} icon={Upload}>Upload and check</Button>
          </>
        )
      }
    >
      {queued ? (
        <Alert tone="info" title="Saved on this device">
          <span className="flex items-start gap-2">
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            There is no connection right now. The photo is kept in this browser and will be uploaded automatically when you are back online —
            keep this page open. You can follow it under “waiting uploads” at the top of the page.
          </span>
        </Alert>
      ) : result ? (
        <div className="space-y-3">
          <Alert tone={result.validation.warnings.length ? 'warning' : 'info'} title="Upload complete">
            {result.validation.warnings.length ? <ul className="list-disc pl-4">{result.validation.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : 'GPS and capture time look right. No issues found.'}
          </Alert>
          <p className="text-xs text-slate-500">
            The photo is now visible to staff and on the public portal.
            {result.validation.compressed ? ' It was compressed for storage (the checks used the original file).' : ''}
          </p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-500">Distance from site</dt>
            <dd className="font-medium">{result.validation.distance_m != null ? `${result.validation.distance_m} m` : 'No GPS'}</dd>
            <dt className="text-slate-500">Capture time source</dt>
            <dd className="font-medium">{result.validation.timestamp_source === 'exif' ? 'From the photo' : result.validation.timestamp_source === 'manual' ? 'Entered' : 'None'}</dd>
            <dt className="text-slate-500">Project flag now</dt>
            <dd>{result.evaluation ? <FlagBadge flag={result.evaluation.flag} size="sm" /> : '—'}</dd>
          </dl>
        </div>
      ) : (
        <form id="upload-form" onSubmit={submit} className="space-y-4">
          {err && (
            <Alert tone="error" title="Upload refused">
              {err.message}
            </Alert>
          )}
          <Field label="360° photo" required>
            {(a) => (
              <input
                {...a}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-800 hover:file:bg-brand-100"
              />
            )}
          </Field>
          {preview && <img src={preview} alt="Selected photo preview" className="aspect-[2/1] w-full rounded-md object-cover" />}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Inspection date" required>{(a) => <Input {...a} type="date" value={form.inspection_date || ''} max={todayIso()} onChange={set('inspection_date')} required />}</Field>
            <Field label="Construction phase">
              {(a) => (
                <Select {...a} value={form.phase_id || ''} onChange={set('phase_id')}>
                  <option value="">Not phase-specific</option>
                  {phases.map((ph) => <option key={ph.id} value={ph.id}>{ph.sequence_no}. {ph.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Latitude" hint="Only used when the photo has no GPS">{(a) => <Input {...a} type="number" step="0.000001" value={form.latitude || ''} onChange={set('latitude')} placeholder={String(project.latitude)} />}</Field>
            <Field label="Longitude">{(a) => <Input {...a} type="number" step="0.000001" value={form.longitude || ''} onChange={set('longitude')} placeholder={String(project.longitude)} />}</Field>
          </div>
          <Button variant="ghost" size="sm" icon={Crosshair} onClick={useMyLocation} loading={locating}>Use my current location</Button>
          <Field label="Caption">{(a) => <Input {...a} value={form.caption || ''} onChange={set('caption')} maxLength={300} placeholder="e.g. Station 0+250, facing north" />}</Field>
          <Checkbox
            label="Final as-built 360° image"
            description="Needed alongside every phase at 100% and an actual completion date to record the project as finished."
            checked={Boolean(form.is_final)}
            onChange={set('is_final')}
          />
        </form>
      )}
    </Modal>
  );
}
