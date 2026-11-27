import { Building2, ClipboardCheck, Coins, FileBarChart, FolderKanban, History, Info, Landmark, LayoutDashboard, Map, SlidersHorizontal, Trash2, TrendingUp, UserRound, Users } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { ROLE_LABELS } from '../../lib/constants.js';
import { CONTRACTOR_NAV, isContractor } from '../../lib/contractor.js';
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
      { to: '/app/deletion-requests', label: 'Deletion requests', icon: Trash2, roles: ['admin'] }, // 027
      { to: '/app/activity', label: 'Activity Logs', icon: History, roles: ['admin', 'auditor'] }, // gap fix
      { to: '/app/settings', label: 'System Settings', icon: SlidersHorizontal, roles: ['admin'] }, // gap fix
    ],
  },
];

// 029: a contractor account's sidebar (its own company's projects only).
const CONTRACTOR_ICONS = { '/app': LayoutDashboard, '/app/projects': FolderKanban, '/app/account': UserRound };
const CONTRACTOR_SECTIONS = [{ title: 'My work', items: CONTRACTOR_NAV.map((i) => ({ ...i, icon: CONTRACTOR_ICONS[i.to] })) }];

// "My account" and "Public portal" are in the account menu (top right), so the sidebar fits without scrolling.
const FOOTER_LINKS = [{ to: '/', label: 'About the system', icon: Info, end: true }];

/** Staff workspace (Admin, DPWH Personnel, Auditor), and the contractor workspace (029) with its own sidebar. */
export default function AppLayout() {
  const { role, profile } = useAuth();
  const { pathname } = useLocation();
  // Admins see how many staff access requests are waiting (refreshes on navigation).
  const pendingUsers = useApi('/users', { approval_status: 'pending', pageSize: 1, _: pathname }, { enabled: role === 'admin', select: (r) => r.total });
  // …and how many project deletion requests wait for a decision (027).
  const pendingDeletions = useApi('/deletion-requests', { status: 'pending', pageSize: 1, _: pathname }, { enabled: role === 'admin', select: (r) => r.total });
  const badges = { '/app/users': pendingUsers.data || 0, '/app/deletion-requests': pendingDeletions.data || 0 };
  const contractor = isContractor(role);
  const sections = contractor
    ? CONTRACTOR_SECTIONS
    : SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role)).map((i) => ({ ...i, badge: badges[i.to] })) }));

  return (
    <WorkspaceShell
      homeTo="/app"
      tag={contractor ? 'Contractor' : 'Staff'}
      sections={sections}
      footerLinks={FOOTER_LINKS}
      // Offline 360° photos are uploaded by the accounts that upload photos: DPWH Personnel (027) and contractors (029).
      // The queue is per account (lib/offlineUploads.js), so one account never sends another's photos.
      headerExtra={role === 'dpwh_personnel' || contractor ? <OfflineUploads /> : null}
      headerLeft={
        <p className="truncate">
          <span className="font-semibold text-slate-900">{ROLE_LABELS[role]}</span>
          {contractor && profile?.contractor?.name && <span className="text-slate-500"> · {profile.contractor.name}</span>}
          {!contractor && profile?.position && <span className="hidden text-slate-500 sm:inline"> · {profile.position}</span>}
        </p>
      }
    />
  );
}
