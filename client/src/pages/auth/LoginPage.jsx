import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import Button from '../../components/common/Button.jsx';
import { Alert } from '../../components/common/Feedback.jsx';
import { Field, Input } from '../../components/common/Form.jsx';
import SplashScreen from '../../components/common/SplashScreen.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { STAFF_ROLES } from '../../lib/constants.js';
import AuthShell from './AuthShell.jsx';

/** WEEK 1 — Login page (Tracy Ann Milaflores, front-end): opens the dashboard for the user's role. */
export default function LoginPage() {
  const { signIn, isAuthenticated, role, isPending, profile } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  // True from a successful sign-in until the 10-second entry splash finishes.
  const [entering, setEntering] = useState(false);

  // While the splash runs we stay on this page; once it ends the redirect below takes over.
  if (isAuthenticated && entering) return <SplashScreen name={profile?.full_name} onDone={() => setEntering(false)} />;

  if (isAuthenticated && isPending) return <Navigate to="/account-pending" replace />;
  if (isAuthenticated) {
    const from = location.state?.from?.pathname;
    return <Navigate to={from && from !== '/login' ? from : STAFF_ROLES.includes(role) ? '/app' : '/account-pending'} replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setEntering(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setEntering(false);
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Staff sign in" subtitle="For DPWH personnel, auditors and system administrators.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Email" required>{(a) => <Input {...a} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />}</Field>
        <Field label="Password" required>{(a) => <Input {...a} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
        <Button type="submit" icon={LogIn} loading={loading} className="w-full">Sign in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        DPWH staff without an account? <Link to="/register" className="font-semibold text-brand-700 hover:underline">Request staff access</Link>
      </p>
    </AuthShell>
  );
}
