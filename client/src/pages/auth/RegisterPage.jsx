import { MailCheck, UserPlus } from 'lucide-react';
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

/** WEEK 1 — Register page (Jonalyn Pagilagan, front-end). Staff sign-up: requests DPWH Personnel or Auditor access, approved by the System Administrator. */
export default function RegisterPage() {
  const { signUp, isAuthenticated } = useAuth();
  const { ref } = useReference();
  const [form, setForm] = useState({ full_name: '', email: '', requested_role: 'dpwh_personnel', agency_id: '', position: '', password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
        requested_role: form.requested_role,
        agency_id: form.agency_id,
        position: form.position.trim(),
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
      title="Request staff access"
      subtitle="For DPWH personnel and auditors. Your account is reviewed by the System Administrator before you can use the staff workspace."
    >
      {done ? (
        <div className="animate-scale-in rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <MailCheck className="h-6 w-6 text-emerald-600" aria-hidden />
          <p className="mt-2 font-semibold">Check your email</p>
          <p className="mt-1">
            We sent a confirmation link to <strong>{form.email}</strong>. After confirming, sign in. Your request will show as <strong>awaiting approval</strong> until the System Administrator grants access.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {error && <Alert tone="error" className="sm:col-span-2">{error}</Alert>}
          <Field label="Full name" required className="sm:col-span-2">
            {(a) => <Input {...a} value={form.full_name} onChange={set('full_name')} required minLength={2} autoComplete="name" />}
          </Field>
          <Field label="Work email" required className="sm:col-span-2">
            {(a) => <Input {...a} type="email" value={form.email} onChange={set('email')} required autoComplete="email" />}
          </Field>
          <Field label="Access requested" required>
            {(a) => (
              <Select {...a} value={form.requested_role} onChange={set('requested_role')} required>
                <option value="dpwh_personnel">DPWH Personnel</option>
                <option value="auditor">Auditor</option>
              </Select>
            )}
          </Field>
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
          <Field label="Position / designation" className="sm:col-span-2">
            {(a) => <Input {...a} value={form.position} onChange={set('position')} placeholder="e.g. Project Engineer II" maxLength={120} />}
          </Field>
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
            Submit request
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account? <Link to="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
