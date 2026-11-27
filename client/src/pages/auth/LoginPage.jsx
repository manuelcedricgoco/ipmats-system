import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import Button from '../../components/common/Button.jsx';
import { Alert } from '../../components/common/Feedback.jsx';
import { Field, Input, PasswordInput } from '../../components/common/Form.jsx';
import SplashScreen from '../../components/common/SplashScreen.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { SUSPENDED_MESSAGE, isSuspensionError } from '../../lib/constants.js';
import { homePathForRole } from '../../lib/pacc.js';
import AuthShell from './AuthShell.jsx';

/**
 * WEEK 1 — Login page (Tracy Ann Milaflores, front-end): opens the right place for each role.
 * Staff → their dashboard · PACC → the PACC portal · accounts waiting for approval (or declined) → the public portal, with a banner.
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
    const from = location.state?.from?.pathname;
    // Waiting for approval or declined: only the public portal (a banner explains the status).
    const home = isPending ? '/' : homePathForRole(role);
    // Back to the page that asked for sign-in, if it is inside this account's own area.
    const backToFrom = home !== '/' && from && (from === home || from.startsWith(`${home}/`));
    return <Navigate to={backToFrom ? from : home} replace />;
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
    <AuthShell title="Sign in" subtitle="For registered DPWH personnel, auditors and system administrators.">
      <form onSubmit={submit} className="space-y-4">
        {message && <Alert tone="error" title={message === SUSPENDED_MESSAGE ? 'Account suspended' : undefined}>{message}</Alert>}
        <Field label="Email" required>{(a) => <Input {...a} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />}</Field>
        <Field label="Password" required>{(a) => <PasswordInput {...a} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
        <Button type="submit" icon={LogIn} loading={loading} className="w-full">Sign in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        DPWH personnel or auditor without an account? <Link to="/register" className="font-semibold text-brand-700 hover:underline">Request one</Link>
      </p>
      <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-600">
        Sign-in is for DPWH staff and auditors. Anyone can <Link to="/" className="font-semibold text-brand-700 hover:underline">browse the public portal</Link> without an account.
      </p>
    </AuthShell>
  );
}
