import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { PageLoader } from './components/common/Feedback.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import PaccLayout from './components/layout/PaccLayout.jsx';
import PublicLayout from './components/layout/PublicLayout.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';

// Week 1 (Objective 1): secure login/registration + project, contractor, agency, budget and duration records.
// Public portal: open to everyone, no account needed
const PortalHome = lazy(() => import('./pages/public/PortalHome.jsx'));
const PublicProjectsPage = lazy(() => import('./pages/public/PublicProjectsPage.jsx'));
const PublicMapPage = lazy(() => import('./pages/public/PublicMapPage.jsx'));
// Authentication
const LoginPage = lazy(() => import('./pages/auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage.jsx'));
const AccountPendingPage = lazy(() => import('./pages/auth/AccountPendingPage.jsx'));
const SetPasswordPage = lazy(() => import('./pages/auth/SetPasswordPage.jsx'));
// Staff workspace
const DashboardPage = lazy(() => import('./pages/shared/DashboardPage.jsx'));
const ProjectsPage = lazy(() => import('./pages/dpwh/ProjectsPage.jsx'));
const ProjectFormPage = lazy(() => import('./pages/dpwh/ProjectFormPage.jsx'));
const ProjectLayout = lazy(() => import('./pages/dpwh/project/ProjectLayout.jsx'));
const OverviewTab = lazy(() => import('./pages/dpwh/project/OverviewTab.jsx'));
// Week 2 (Objectives 3 and 4): phase-by-phase progress and financial monitoring
const ProgressTab = lazy(() => import('./pages/dpwh/project/ProgressTab.jsx'));
const FinanceTab = lazy(() => import('./pages/dpwh/project/FinanceTab.jsx'));
const ProgressPage = lazy(() => import('./pages/dpwh/ProgressPage.jsx'));
const FinancePage = lazy(() => import('./pages/dpwh/FinancePage.jsx'));
// Week 3 (Objectives 2 and 5): 360° images, automatic flags, audit, map, dashboards, reports
const ImagesTab = lazy(() => import('./pages/dpwh/project/ImagesTab.jsx'));
const FlagsTab = lazy(() => import('./pages/dpwh/project/FlagsTab.jsx'));
// Gap fixes (concept document): documents, activity logs, flag-rule settings
const DocumentsTab = lazy(() => import('./pages/dpwh/project/DocumentsTab.jsx'));
const ActivityLogPage = lazy(() => import('./pages/admin/ActivityLogPage.jsx'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage.jsx'));
const MapPage = lazy(() => import('./pages/shared/MapPage.jsx'));
const AuditPage = lazy(() => import('./pages/auditor/AuditPage.jsx'));
const ReportsPage = lazy(() => import('./pages/auditor/ReportsPage.jsx'));
const ContractorsPage = lazy(() => import('./pages/dpwh/ContractorsPage.jsx'));
const AgenciesPage = lazy(() => import('./pages/dpwh/AgenciesPage.jsx'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage.jsx'));
const AccountPage = lazy(() => import('./pages/shared/AccountPage.jsx'));
// PACC portal (Presidential Anti-Corruption Commission)
const PaccInboxPage = lazy(() => import('./pages/pacc/PaccInboxPage.jsx'));
const PaccProjectPage = lazy(() => import('./pages/pacc/PaccProjectPage.jsx'));
const PaccCasesPage = lazy(() => import('./pages/pacc/PaccCasesPage.jsx'));
const PaccCasePage = lazy(() => import('./pages/pacc/PaccCasePage.jsx'));
const PaccMembersPage = lazy(() => import('./pages/pacc/PaccMembersPage.jsx'));
const PaccActivityPage = lazy(() => import('./pages/pacc/PaccActivityPage.jsx'));

const STAFF = ['admin', 'dpwh_personnel', 'auditor'];
const EDITORS = ['admin', 'dpwh_personnel'];

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public portal: open to everyone, no account (top navigation, no sidebar) */}
        <Route element={<PublicLayout />}>
          <Route index element={<PortalHome />} />
          <Route path="/projects" element={<PublicProjectsPage />} />
          <Route path="/map" element={<PublicMapPage />} />
        </Route>
        {/* Earlier portal addresses keep working */}
        <Route path="/portal" element={<Navigate to="/" replace />} />
        <Route path="/portal/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/portal/map" element={<Navigate to="/map" replace />} />
        <Route path="/portal/projects/:id" element={<OldProjectAddress />} />
        <Route path="/portal/*" element={<Navigate to="/" replace />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/account" element={<Navigate to="/app/account" replace />} />
        <Route path="/projects/:id" element={<OldProjectAddress />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/account-pending" element={<AccountPendingPage />} />
        <Route path="/set-password" element={<SetPasswordPage />} />

        <Route path="/app" element={<ProtectedRoute roles={STAFF} />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route element={<ProtectedRoute roles={EDITORS} />}>
              <Route path="projects/new" element={<ProjectFormPage />} />
              <Route path="projects/:id/edit" element={<ProjectFormPage />} />
            </Route>
            <Route path="projects/:id" element={<ProjectLayout />}>
              <Route index element={<OverviewTab />} />
              <Route path="progress" element={<ProgressTab />} />
              <Route path="finance" element={<FinanceTab />} />
              <Route path="images" element={<ImagesTab />} />
              <Route path="flags" element={<FlagsTab />} />
              <Route path="documents" element={<DocumentsTab />} />
            </Route>
            <Route path="map" element={<MapPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="contractors" element={<ContractorsPage />} />
            <Route path="agencies" element={<AgenciesPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route element={<ProtectedRoute roles={['admin', 'auditor']} />}>
              <Route path="activity" element={<ActivityLogPage />} />
            </Route>
            <Route element={<ProtectedRoute roles={['admin']} />}>
              <Route path="users" element={<UsersPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage homeTo="/app" homeLabel="Back to the dashboard" />} />
          </Route>
        </Route>

        <Route path="/pacc" element={<ProtectedRoute roles={['pacc']} />}>
          <Route element={<PaccLayout />}>
            <Route index element={<PaccInboxPage />} />
            <Route path="projects/:id" element={<PaccProjectPage />} />
            <Route path="cases" element={<PaccCasesPage />} />
            <Route path="cases/:caseId" element={<PaccCasePage />} />
            <Route path="members" element={<PaccMembersPage />} />
            <Route path="activity" element={<PaccActivityPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="*" element={<NotFoundPage homeTo="/pacc" homeLabel="Back to the inbox" />} />
          </Route>
        </Route>

        <Route path="*" element={<div className="min-h-screen bg-slate-50 px-4"><NotFoundPage /></div>} />
      </Routes>
    </Suspense>
  );
}

/** Old project addresses (/projects/:id, /portal/projects/:id) → the project's drawer on the map */
function OldProjectAddress() {
  const { id } = useParams();
  return <Navigate to={`/map?project=${encodeURIComponent(id)}`} replace />;
}
