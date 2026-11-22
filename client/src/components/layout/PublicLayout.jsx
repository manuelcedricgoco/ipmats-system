import { FolderKanban, Info, LayoutDashboard, Map, UserRound } from 'lucide-react';
import WorkspaceShell from './WorkspaceShell.jsx';

/**
 * PUBLIC PORTAL frame (signed-in accounts, any role): the same rounded sidebar as the staff
 * workspace (WorkspaceShell), with the portal's own navigation. The portal's home is the
 * Dashboard. For staff, "Staff workspace" is in the account menu (top right).
 */
const SECTIONS = [
  {
    title: 'Public portal',
    items: [
      { to: '/portal/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/portal', label: 'Projects', icon: FolderKanban, end: true },
      { to: '/portal/map', label: 'Project Map', icon: Map },
    ],
  },
  { title: 'Account', items: [{ to: '/portal/account', label: 'My account', icon: UserRound }] },
];
const FOOTER_LINKS = [{ to: '/', label: 'About the system', icon: Info, end: true }];

export default function PublicLayout() {
  return (
    <WorkspaceShell
      homeTo="/portal/dashboard"
      tag="Portal"
      sections={SECTIONS}
      footerLinks={FOOTER_LINKS}
      headerLeft={
        <p className="truncate">
          <span className="font-semibold text-slate-900">Public Portal</span>
          <span className="hidden text-slate-500 sm:inline"> · Occidental Mindoro infrastructure projects</span>
        </p>
      }
      pageFooter={
        <div className="flex flex-col gap-1 border-t border-slate-200 pt-4 text-xs text-slate-500 sm:flex-row sm:justify-between">
          <p>IPMATS · DPWH 360° Infrastructure Project Monitoring and Transparency System · Occidental Mindoro (Region IV-B MIMAROPA)</p>
          <p>Figures are reported by DPWH personnel. They are for transparency and do not replace an official audit.</p>
        </div>
      }
    />
  );
}
