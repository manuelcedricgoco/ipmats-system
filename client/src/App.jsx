import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageLoader } from './components/common/Feedback.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';

// Week 1 (Objective 1): secure login/registration + project, contractor, agency, budget and duration records.
// Authentication
const LoginPage = lazy(() => import('./pages/auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage.jsx'));
const AccountPendingPage = lazy(() => import('./pages/auth/AccountPendingPage.jsx'));
// Staff workspace
const DashboardPage = lazy(() => import('./pages/shared/DashboardPage.jsx'));
const ProjectsPage = lazy(() => import('./pages/dpwh/ProjectsPage.jsx'));
const ProjectFormPage = lazy(() => import('./pages/dpwh/ProjectFormPage.jsx'));
const ProjectDetailPage = lazy(() => import('./pages/dpwh/ProjectDetailPage.jsx'));
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
        <Route index element={<Navigate to="/login" replace />} />
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
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="contractors" element={<ContractorsPage />} />
            <Route path="agencies" element={<AgenciesPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route element={<ProtectedRoute roles={['admin']} />}>
              <Route path="users" element={<UsersPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
