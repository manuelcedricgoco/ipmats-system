import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { PageLoader } from './components/common/Feedback.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import PublicLayout from './components/layout/PublicLayout.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';

// Week 1 (Objective 1): secure login/registration + project, contractor, agency, budget and duration records.
// Public portal (open to everyone)
const PortalHome = lazy(() => import('./pages/public/PortalHome.jsx'));
const PublicProjectPage = lazy(() => import('./pages/public/PublicProjectPage.jsx'));
// Authentication
const LoginPage = lazy(() => import('./pages/auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage.jsx'));
const AccountPendingPage = lazy(() => import('./pages/auth/AccountPendingPage.jsx'));
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
const ContractorsPage = lazy(() => import('./pages/dpwh/ContractorsPage.jsx'));
const AgenciesPage = lazy(() => import('./pages/dpwh/AgenciesPage.jsx'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage.jsx'));
const AccountPage = lazy(() => import('./pages/shared/AccountPage.jsx'));

const STAFF = ['admin', 'dpwh_personnel', 'auditor'];
const EDITORS = ['admin', 'dpwh_personnel'];

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public portal: a signed-in account is required (any role, incl. Public). Visitors go to /login. */}
        <Route element={<PublicLayout />}>
          <Route element={<ProtectedRoute />}>
            <Route index element={<PortalHome />} />
            <Route path="projects/:id" element={<PublicProjectPage />} />
            <Route path="account" element={<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><AccountPage /></div>} />
          </Route>
        </Route>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/account-pending" element={<AccountPendingPage />} />

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
            </Route>
            <Route path="progress" element={<ProgressPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="contractors" element={<ContractorsPage />} />
            <Route path="agencies" element={<AgenciesPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route element={<ProtectedRoute roles={['admin']} />}>
              <Route path="users" element={<UsersPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>

        <Route element={<PublicLayout />}>
          <Route path="*" element={<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><NotFoundPage /></div>} />
        </Route>
      </Routes>
    </Suspense>
  );
}
