import { Building2, ClipboardCheck, Coins, FileBarChart, FolderKanban, History, Info, Landmark, LayoutDashboard, Map, SlidersHorizontal, TrendingUp, Users } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { ROLE_LABELS } from '../../lib/constants.js';
import OfflineUploads from '../common/OfflineUploads.jsx';
import WorkspaceShell from './WorkspaceShell.jsx';

const ALL = ['admin', 'dpwh_personnel', 'auditor'];
// Weeks 1–3 modules.
const SECTIONS = [
  {
    title: 'Records',
    items: [
      { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ALL },
      { to: '/app/projects', label: 'Project Management', icon: FolderKanban, roles: ALL },
      { to: '/app/map', label: 'Project Map', icon: Map, roles: ALL }, // Week 3
      { to: '/app/progress', label: 'Progress Monitoring', icon: TrendingUp, roles: ALL }, // Week 2
      { to: '/app/finance', label: 'Financial Monitoring', icon: Coins, roles: ALL }, // Week 2
      { to: '/app/audit', label: 'Flags & Audit', icon: ClipboardCheck, roles: ALL }, // Week 3
      { to: '/app/reports', label: 'Reports', icon: FileBarChart, roles: ALL }, // Week 3
      { to: '/app/contractors', label: 'Contractors', icon: Building2, roles: ALL },
      { to: '/app/agencies', label: 'Offices & Agencies', icon: Landmark, roles: ALL },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/app/users', label: 'User Management', icon: Users, roles: ['admin'] },
      { to: '/app/activity', label: 'Activity Logs', icon: History, roles: ['admin', 'auditor'] }, // gap fix
      { to: '/app/settings', label: 'System Settings', icon: SlidersHorizontal, roles: ['admin'] }, // gap fix
    ],
  },
];

// "My account" and "Public portal" are in the account menu (top right), so the sidebar fits without scrolling.
const FOOTER_LINKS = [{ to: '/', label: 'About the system', icon: Info, end: true }];

/** Staff workspace (Admin, DPWH Personnel, Auditor). */
export default function AppLayout() {
  const { role, profile } = useAuth();
  const { pathname } = useLocation();
  // Admins see how many staff access requests are waiting (refreshes on navigation).
  const pendingUsers = useApi('/users', { approval_status: 'pending', pageSize: 1, _: pathname }, { enabled: role === 'admin', select: (r) => r.total });
  const badges = { '/app/users': pendingUsers.data || 0 };
  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role)).map((i) => ({ ...i, badge: badges[i.to] })) }));

  return (
    <WorkspaceShell
      homeTo="/app"
      tag="Staff"
      sections={sections}
      footerLinks={FOOTER_LINKS}
      headerExtra={['admin', 'dpwh_personnel'].includes(role) ? <OfflineUploads /> : null}
      headerLeft={
        <p className="truncate">
          <span className="font-semibold text-slate-900">{ROLE_LABELS[role]}</span>
          {profile?.position && <span className="hidden text-slate-500 sm:inline"> · {profile.position}</span>}
        </p>
      }
    />
  );
}
