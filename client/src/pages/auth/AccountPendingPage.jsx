import { Clock3, LogOut, XCircle } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button.jsx';
import { PageLoader } from '../../components/common/Feedback.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_LABELS } from '../../lib/constants.js';
import { homePathForRole } from '../../lib/pacc.js';
import { dateTime } from '../../lib/format.js';
import AuthShell from './AuthShell.jsx';

/** Shown to signed-in accounts whose staff access request is pending or declined. */
export default function AccountPendingPage() {
  const { loading, isAuthenticated, profile, isStaff, isPending, signOut } = useAuth();
  const navigate = useNavigate();
  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isStaff) return <Navigate to="/app" replace />;
  if (!isPending) return <Navigate to={homePathForRole(profile.role)} replace />;

  const declined = profile.approval_status === 'rejected';
  return (
    <AuthShell title={declined ? 'Access request declined' : 'Awaiting approval'} subtitle={profile.email}>
      <div className={`animate-scale-in rounded-lg border p-5 text-sm ${declined ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        {declined ? <XCircle className="h-6 w-6 text-red-600" aria-hidden /> : <Clock3 className="h-6 w-6 text-amber-600" aria-hidden />}
        {declined ? (
          <>
            <p className="mt-2 font-semibold">The System Administrator declined your request.</p>
            {profile.review_note && <p className="mt-1">Reason: {profile.review_note}</p>}
            <p className="mt-2">Contact your DPWH office if you believe this is a mistake. You can still browse the public portal, as anyone can.</p>
          </>
        ) : (
          <>
            <p className="mt-2 font-semibold">Your request for {ROLE_LABELS[profile.requested_role] || 'staff'} access is being reviewed.</p>
            {profile.requested_contractor && <p className="mt-1">Company: {profile.requested_contractor.name}</p>}
            <p className="mt-1">You&rsquo;ll be able to open {profile.requested_role === 'contractor' ? 'your company’s projects' : 'the staff workspace'} once the System Administrator approves it; until then you can browse the public portal only. Requested {dateTime(profile.requested_at)}.</p>
          </>
        )}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button to="/" variant="secondary">Public portal</Button>
        <Button
          variant="ghost"
          icon={LogOut}
          onClick={async () => {
            await signOut();
            navigate('/login');
          }}
        >
          Sign out
        </Button>
      </div>
    </AuthShell>
  );
}
