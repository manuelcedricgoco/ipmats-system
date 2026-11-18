import { ClipboardCheck, Globe2, HardHat, MailCheck, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import Button from '../../components/common/Button.jsx';
import { Alert } from '../../components/common/Feedback.jsx';
import { Field, Input, Select } from '../../components/common/Form.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useReference } from '../../hooks/useReference.js';
import AuthShell from './AuthShell.jsx';
import PhotoPicker from '../../components/common/PhotoPicker.jsx';
import { savePendingAvatar } from '../../lib/pendingAvatar.js';

const ACCESS = [
  { value: 'public', label: 'Public', icon: Globe2, hint: 'View projects, progress and finances. Ready right after you confirm your email.' },
  { value: 'dpwh_personnel', label: 'DPWH Personnel', icon: HardHat, hint: 'Register projects and submit progress. Needs administrator approval.' },
  { value: 'auditor', label: 'Auditor', icon: ClipboardCheck, hint: 'Review project records. Needs administrator approval.' },
];

/**
 * WEEK 1 — Register page (Jonalyn Pagilagan, front-end).
 * Public accounts are approved automatically (view-only). DPWH Personnel and Auditor
 * requests wait for the System Administrator; the database never grants a staff role
 * from the sign-up form (trigger handle_new_user).
 */
export default function RegisterPage() {
  const { signUp, isAuthenticated } = useAuth();
  const { ref } = useReference();
  const [form, setForm] = useState({ full_name: '', email: '', requested_role: 'public', agency_id: '', position: '', password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const isStaffRequest = form.requested_role !== 'public';
  if (isAuthenticated) return <Navigate to="/login" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      const res = await signUp({
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        // Public: no requested staff role → the database creates an approved Public account
        requested_role: isStaffRequest ? form.requested_role : null,
        agency_id: isStaffRequest ? form.agency_id : null,
        position: isStaffRequest ? form.position.trim() : '',
      });
      // Kept on this device; uploaded automatically the first time the person signs in.
      if (photo && res.userId) await savePendingAvatar(res.userId, photo);
      if (res.needsConfirmation) setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      wide
      title="Create an account"
      subtitle="Public viewers register here to see the portal. Staff accounts are approved by the System Administrator."
    >
      {done ? (
        <div className="animate-scale-in rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <MailCheck className="h-6 w-6 text-emerald-600" aria-hidden />
          <p className="mt-2 font-semibold">Check your email</p>
          <p className="mt-1">
            We sent a confirmation link to <strong>{form.email}</strong>. After confirming, sign in.{' '}
            {isStaffRequest ? (
              <>Your request will show as <strong>awaiting approval</strong> until the System Administrator grants access.</>
            ) : (
              <>Your Public account opens the public portal right away.</>
            )}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {error && <Alert tone="error" className="sm:col-span-2">{error}</Alert>}
          <Field label="Full name" required className="sm:col-span-2">
            {(a) => <Input {...a} value={form.full_name} onChange={set('full_name')} required minLength={2} autoComplete="name" />}
          </Field>
          <Field label="Email" required className="sm:col-span-2">
            {(a) => <Input {...a} type="email" value={form.email} onChange={set('email')} required autoComplete="email" />}
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium text-slate-700">Account type <span className="text-red-600">*</span></legend>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
              {ACCESS.map(({ value, label, icon: Icon, hint }) => {
                const active = form.requested_role === value;
                return (
                  <label
                    key={value}
                    className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-all duration-150 ${
                      active ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'
                    }`}
                  >
                    <input type="radio" name="requested_role" value={value} checked={active} onChange={set('requested_role')} className="sr-only" />
                    <span className="flex items-center gap-2 font-semibold text-slate-900">
                      <Icon className={`h-4 w-4 ${active ? 'text-brand-700' : 'text-slate-400'}`} aria-hidden /> {label}
                    </span>
                    <span className="text-xs text-slate-500">{hint}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {isStaffRequest && (
            <>
              <Field label="Office" required>
                {(a) => (
                  <Select {...a} value={form.agency_id} onChange={set('agency_id')} required>
                    <option value="">Select your office</option>
                    {ref?.agencies.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Position / designation">
                {(a) => <Input {...a} value={form.position} onChange={set('position')} placeholder="e.g. Project Engineer II" maxLength={120} />}
              </Field>
            </>
          )}
          <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Profile photo <span className="font-normal text-slate-500">(optional)</span></p>
            <PhotoPicker
              name={form.full_name}
              email={form.email}
              size="h-20 w-20"
              onChange={(file, err) => {
                setPhoto(file);
                setPhotoError(err);
              }}
            />
            {photo && <p className="mt-2 text-xs text-slate-600">Your photo will be added after you confirm your email and sign in.</p>}
            {photoError && <p className="mt-2 text-xs font-medium text-red-700">{photoError}</p>}
          </div>
          <Field label="Password" required hint="At least 8 characters">
            {(a) => <Input {...a} type="password" value={form.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />}
          </Field>
          <Field label="Confirm password" required>
            {(a) => <Input {...a} type="password" value={form.confirm} onChange={set('confirm')} required minLength={8} autoComplete="new-password" />}
          </Field>
          <Button type="submit" icon={UserPlus} loading={loading} className="w-full sm:col-span-2">
            {isStaffRequest ? 'Submit request' : 'Create account'}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account? <Link to="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
