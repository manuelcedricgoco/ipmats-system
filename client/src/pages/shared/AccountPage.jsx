import { Check, KeyRound, Save, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardBody, CardHeader, PageHeader } from '../../components/common/Card.jsx';
import Button from '../../components/common/Button.jsx';
import { Alert, PageLoader } from '../../components/common/Feedback.jsx';
import { Field, Input } from '../../components/common/Form.jsx';
import PhotoPicker from '../../components/common/PhotoPicker.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
import { friendlyAuthError } from '../../lib/imageFile.js';
import { ROLE_LABELS } from '../../lib/constants.js';
import { dateTime } from '../../lib/format.js';
import { supabase } from '../../lib/supabaseClient.js';

/** My account: profile photo, personal details and password change. Works for every role. */
export default function AccountPage() {
  const { profile, loading, isAuthenticated, refreshProfile } = useAuth();
  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Account" title="My account" description={`Signed in as ${profile.email}`} />
      <div className="space-y-6">
        <PhotoCard profile={profile} onSaved={refreshProfile} />
        <DetailsCard profile={profile} onSaved={refreshProfile} />
        <PasswordCard email={profile.email} />
      </div>
    </div>
  );
}

function PhotoCard({ profile, onSaved }) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const save = async () => {
    if (!file) return;
    setBusy('save');
    setError(null);
    const fd = new FormData();
    fd.append('avatar', file, file.name);
    try {
      await api.post('/me/avatar', fd);
      setFile(null);
      toast.success('Profile photo updated.');
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    setBusy('remove');
    try {
      await api.del('/me/avatar');
      toast.success('Profile photo removed.');
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader title="Profile photo" description="Shown in the menu and on your account. Visible only to you and staff." />
      <CardBody className="space-y-4">
        <PhotoPicker
          name={profile.full_name}
          email={profile.email}
          currentUrl={profile.avatar_url}
          size="h-24 w-24"
          disabled={busy !== null}
          showRemove
          onRemove={remove}
          onChange={(f, err) => {
            setFile(f);
            setError(err);
          }}
        />
        {error && <Alert tone="error">{error}</Alert>}
        {file && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <Button icon={Check} loading={busy === 'save'} onClick={save}>Save new photo</Button>
            <Button variant="ghost" onClick={() => setFile(null)} disabled={busy !== null}>Cancel</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function DetailsCard({ profile, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: profile.full_name || '', position: profile.position || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const dirty = form.full_name !== (profile.full_name || '') || form.position !== (profile.position || '');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch('/me', { full_name: form.full_name.trim(), position: form.position.trim() || null });
      toast.success('Details saved.');
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Personal details" />
      <CardBody>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {error && <Alert tone="error" className="sm:col-span-2">{error}</Alert>}
          <Field label="Full name" required className="sm:col-span-2">
            {(a) => <Input {...a} value={form.full_name} onChange={set('full_name')} required minLength={2} maxLength={120} />}
          </Field>
          <Field label="Position / designation">
            {(a) => <Input {...a} value={form.position} onChange={set('position')} maxLength={120} />}
          </Field>
          <Field label="Email" hint="Contact an administrator to change your email.">
            {(a) => <Input {...a} value={profile.email} disabled />}
          </Field>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600 sm:col-span-2">
            <span>Role: <strong className="text-slate-900">{ROLE_LABELS[profile.role] || '—'}</strong></span>
            {profile.created_at && <span>Member since {dateTime(profile.created_at)}</span>}
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" icon={Save} loading={saving} disabled={!dirty}>Save details</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function PasswordCard({ email }) {
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.next.length < 8) return setError('The new password must be at least 8 characters.');
    if (form.next !== form.confirm) return setError('The new passwords do not match.');
    if (form.next === form.current) return setError('Choose a password different from your current one.');
    setSaving(true);
    try {
      // Re-check the current password before changing it.
      const { error: checkErr } = await supabase.auth.signInWithPassword({ email, password: form.current });
      if (checkErr) throw new Error('Your current password is incorrect.');
      const { error: updErr } = await supabase.auth.updateUser({ password: form.next });
      if (updErr) throw new Error(friendlyAuthError(updErr.message));
      setForm({ current: '', next: '', confirm: '' });
      toast.success('Password changed. Use it the next time you sign in.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Change password" description="Use at least 8 characters. Avoid passwords you use elsewhere." />
      <CardBody>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {error && <Alert tone="error" className="sm:col-span-2">{error}</Alert>}
          <Field label="Current password" required className="sm:col-span-2">
            {(a) => <Input {...a} type="password" autoComplete="current-password" value={form.current} onChange={set('current')} required />}
          </Field>
          <Field label="New password" required>
            {(a) => <Input {...a} type="password" autoComplete="new-password" value={form.next} onChange={set('next')} required minLength={8} />}
          </Field>
          <Field label="Confirm new password" required>
            {(a) => <Input {...a} type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required minLength={8} />}
          </Field>
          <div className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden /> Your current password is checked before it is changed.
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" icon={KeyRound} loading={saving}>Update password</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
