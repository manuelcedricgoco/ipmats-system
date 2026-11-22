import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageLoader } from '../components/common/Feedback.jsx';

/** Guards a route subtree by authentication and (optionally) role. */
export default function ProtectedRoute({ roles }) {
  const { loading, isAuthenticated, role, isPending } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(role)) {
    // Pending/declined staff requests → request status; Public accounts → public portal; other staff → dashboard
    if (isPending) return <Navigate to="/account-pending" replace />;
    return <Navigate to={role === 'public' ? '/portal/dashboard' : '/app'} replace />;
  }
  return <Outlet />;
}
