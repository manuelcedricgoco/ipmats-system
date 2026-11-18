import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageLoader } from '../components/common/Feedback.jsx';

/** Guards a route subtree by authentication and (optionally) role. */
export default function ProtectedRoute({ roles }) {
  const { loading, isAuthenticated, role, isPending } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  // Accounts without a staff role (pending/declined sign-ups) only see their request status.
  if (roles && !roles.includes(role)) {
    return <Navigate to={isPending || role === 'public' ? '/account-pending' : '/app'} replace />;
  }
  return <Outlet />;
}
