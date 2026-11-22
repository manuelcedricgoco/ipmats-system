import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageLoader } from '../components/common/Feedback.jsx';

/** Guards a route subtree by authentication and (optionally) role. */
export default function ProtectedRoute({ roles }) {
  const { loading, isAuthenticated, role } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(role)) {
    // Accounts without a staff role (waiting for approval or declined) → the public portal, where a banner
    // shows their status; staff without this role → their dashboard. The API and RLS refuse them as well.
    return <Navigate to={role ? '/app' : '/'} replace />;
  }
  return <Outlet />;
}
