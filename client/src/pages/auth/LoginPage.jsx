import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import Button from '../../components/common/Button.jsx';
import { Alert } from '../../components/common/Feedback.jsx';
import { Field, Input, PasswordInput } from '../../components/common/Form.jsx';
import SplashScreen from '../../components/common/SplashScreen.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { STAFF_ROLES, SUSPENDED_MESSAGE, isSuspensionError } from '../../lib/constants.js';
import AuthShell from './AuthShell.jsx';

/**
 * WEEK 1 — Login page (Tracy Ann Milaflores, front-end): opens the right place for each role.
 * Staff → their dashboard · Public → the public portal (/portal) · pending/declined staff requests → request status.
 * The entry splash starts the moment "Sign in" is clicked and lasts 5 seconds in total
 * (the sign-in itself happens while it plays; if it takes longer, the splash waits for it).
 */
export default function LoginPage() {
  const { signIn, isAuthenticated, role, isPending, profile, signOutNotice, clearSignOutNotice } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState(false); // splash showing
  const [splashDone, setSplashDone] = useState(false);

  // Splash: from the click until both the 5 s have passed AND the sign-in has finished.
  if (entering && !(splashDone && isAuthenticated)) {
    return <SplashScreen name={profile?.full_name} ready={isAuthenticated} onDone={() => setSplashDone(true)} />;
  }

  if (isAuthenticated) {
    if (isPending) return <Navigate to="/account-pending" replace />;
    const from = location.state?.from?.pathname;
    if (STAFF_ROLES.includes(role)) return <Navigate to={from && from.startsWith('/app') ? from : '/app'} replace />;
    // Public accounts land on the portal Dashboard, unless they were sent here from a specific portal page.
    return <Navigate to={from && from.startsWith('/portal/') ? from : '/portal/dashboard'} replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    clearSignOutNotice();
    setSplashDone(false);
    setEntering(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setEntering(false);
      // Supabase Auth refuses a suspended (banned) account; the API answers 403 "has been suspended".
      setError(isSuspensionError(err.message) ? SUSPENDED_MESSAGE : err.message);
      setLoading(false);
    }
  };
  // Signed out because the account was suspended while in use (see AuthContext).
  const message = error || signOutNotice;

  return (
    <AuthShell title="Sign in" subtitle="For registered public viewers, DPWH personnel, auditors and system administrators.">
      <form onSubmit={submit} className="space-y-4">
        {message && <Alert tone="error" title={message === SUSPENDED_MESSAGE ? 'Account suspended' : undefined}>{message}</Alert>}
        <Field label="Email" required>{(a) => <Input {...a} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />}</Field>
        <Field label="Password" required>{(a) => <PasswordInput {...a} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
        <Button type="submit" icon={LogIn} loading={loading} className="w-full">Sign in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        No account yet? <Link to="/register" className="font-semibold text-brand-700 hover:underline">Register</Link>
      </p>
      <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-600">
        The public portal of projects, progress and finances is for registered accounts. Register as <strong>Public</strong> to view it.
      </p>
    </AuthShell>
  );
}
