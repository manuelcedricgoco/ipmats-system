import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageLoader } from '../components/common/Feedback.jsx';
import { homePathForRole } from '../lib/pacc.js';

/** Guards a route subtree by authentication and (optionally) role. */
export default function ProtectedRoute({ roles }) {
  const { loading, isAuthenticated, role } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(role)) {
    // Accounts without a role (waiting for approval or declined) → the public portal, where a banner shows
    // their status; PACC → the PACC portal; staff → their dashboard. The API and RLS refuse them as well.
    return <Navigate to={homePathForRole(role)} replace />;
  }
  return <Outlet />;
}
