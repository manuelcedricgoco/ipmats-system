import { KeyRound, LogIn } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button.jsx';
import { Alert, Spinner } from '../../components/common/Feedback.jsx';
import { Field, PasswordInput } from '../../components/common/Form.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { friendlyAuthError } from '../../lib/imageFile.js';
import { homePathForRole } from '../../lib/pacc.js';
import { supabase } from '../../lib/supabaseClient.js';
import AuthShell from './AuthShell.jsx';

const MIN_LENGTH = 8;

/**
 * Set a new password after opening a set-password (recovery) link, e.g. the one a new PACC account receives.
 * supabase-js signs in from the link itself (detectSessionInUrl); without that session the link was not
 * valid, so the page explains that instead of showing the form.
 */
export default function SetPasswordPage() {
  const { loading, session, role } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ next: '', confirm: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (loading) {
    return (
      <AuthShell title="Set your password">
        <p className="flex items-center gap-2 text-sm text-slate-600" role="status"><Spinner className="h-4 w-4" /> Checking the link…</p>
      </AuthShell>
    );
  }

  if (!session) {
    return (
      <AuthShell title="Set your password">
        <Alert tone="warning" title="This link can no longer be used">
          This link has expired or was already used. Ask a PACC member to send a new one.
        </Alert>
        <Button to="/login" variant="secondary" icon={LogIn} className="mt-6 w-full">Go to sign in</Button>
      </AuthShell>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.next.length < MIN_LENGTH) return setError(`The password must be at least ${MIN_LENGTH} characters.`);
    if (form.next !== form.confirm) return setError('The passwords do not match.');
    setSaving(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password: form.next });
      if (updErr) throw new Error(friendlyAuthError(updErr.message));
      toast.success('Password set. You are signed in.');
      navigate(homePathForRole(role), { replace: true });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <AuthShell title="Set your password" subtitle={session.user?.email}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="New password" required hint={`At least ${MIN_LENGTH} characters`}>
          {(a) => <PasswordInput {...a} autoComplete="new-password" value={form.next} onChange={set('next')} required minLength={MIN_LENGTH} autoFocus />}
        </Field>
        <Field label="Confirm new password" required>
          {(a) => <PasswordInput {...a} autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required minLength={MIN_LENGTH} />}
        </Field>
        <Button type="submit" icon={KeyRound} loading={saving} className="w-full">Set password</Button>
      </form>
    </AuthShell>
  );
}
