import { FolderSearch, History, Inbox, Info, UserRound, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_LABELS } from '../../lib/constants.js';
import WorkspaceShell from './WorkspaceShell.jsx';

const SECTIONS = [
  {
    title: 'Investigation',
    items: [
      { to: '/pacc', label: 'Inbox', icon: Inbox, end: true },
      { to: '/pacc/cases', label: 'Cases', icon: FolderSearch },
    ],
  },
  {
    title: 'PACC',
    items: [
      { to: '/pacc/members', label: 'Members', icon: Users },
      { to: '/pacc/activity', label: 'Activity log', icon: History },
      { to: '/pacc/account', label: 'My account', icon: UserRound },
    ],
  },
];

const FOOTER_LINKS = [{ to: '/', label: 'About the system', icon: Info, end: true }];

/** PACC portal (Presidential Anti-Corruption Commission): the same frame as the staff workspace. */
export default function PaccLayout() {
  const { role, profile } = useAuth();
  return (
    <WorkspaceShell
      homeTo="/pacc"
      tag="PACC"
      sections={SECTIONS}
      footerLinks={FOOTER_LINKS}
      headerLeft={
        <p className="truncate">
          <span className="font-semibold text-slate-900">{ROLE_LABELS[role]}</span>
          {profile?.position && <span className="hidden text-slate-500 sm:inline"> · {profile.position}</span>}
        </p>
      }
    />
  );
}
