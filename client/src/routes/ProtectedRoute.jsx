import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageLoader } from '../components/common/Feedback.jsx';
import { canOpenWorkspacePath } from '../lib/contractor.js';
import { homePathForRole } from '../lib/pacc.js';

/** Guards a route subtree by authentication and (optionally) role. */
export default function ProtectedRoute({ roles }) {
  const { loading, isAuthenticated, role } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  // Accounts without a role (waiting for approval or declined) → the public portal, where a banner shows
  // their status; PACC → the PACC portal; staff and contractors → their dashboard. A contractor (029) may open
  // only its dashboard, project list, project pages and My account in /app: any other /app page sends it to its
  // dashboard. The API and RLS refuse all of these as well.
  if ((roles && !roles.includes(role)) || !canOpenWorkspacePath(role, location.pathname)) {
    return <Navigate to={homePathForRole(role)} replace />;
  }
  return <Outlet />;
}
