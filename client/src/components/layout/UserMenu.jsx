import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDown, Clock3, Globe2, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Avatar from '../common/Avatar.jsx';
import { ROLE_LABELS } from '../../lib/constants.js';

const item = 'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors data-[focus]:bg-slate-100';

export default function UserMenu({ dark = false }) {
  const { profile, isStaff, isPending, signOut } = useAuth();
  const navigate = useNavigate();
  if (!profile) return null;
  const roleLabel = isPending ? (profile.approval_status === 'rejected' ? 'Access declined' : 'Awaiting approval') : ROLE_LABELS[profile.role];

  return (
    <Menu>
      <MenuButton
        className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
          dark ? 'text-white hover:bg-white/10 data-[open]:bg-white/10' : 'text-slate-700 hover:bg-slate-100 data-[open]:bg-slate-100'
        }`}
      >
        <Avatar src={profile.avatar_url} name={profile.full_name} email={profile.email} ring="ring-2 ring-transparent transition-all group-hover:ring-accent-300/60" />
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-[160px] truncate font-semibold">{profile.full_name || profile.email}</span>
          <span className={`block text-xs ${dark ? 'text-brand-200' : 'text-slate-500'}`}>{roleLabel}</span>
        </span>
        <ChevronDown className="h-4 w-4 opacity-70 transition-transform duration-200 group-data-[open]:rotate-180" aria-hidden />
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        transition
        className="z-[1600] w-60 origin-top-right rounded-lg border border-slate-200 bg-white p-1 shadow-popover [--anchor-gap:8px] focus:outline-none transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
      >
        <div className="border-b border-slate-100 px-3 pb-2 pt-1.5">
          <p className="truncate text-sm font-medium text-slate-900">{profile.email}</p>
          <p className="text-xs text-slate-500">{roleLabel}</p>
        </div>
        <div className="py-1">
          {isStaff && (
            <MenuItem>
              <Link to="/app" className={`${item} text-slate-700`}>
                <LayoutDashboard className="h-4 w-4 text-slate-400" aria-hidden /> Staff workspace
              </Link>
            </MenuItem>
          )}
          <MenuItem>
            <Link to={isStaff ? '/app/account' : '/account'} className={`${item} text-slate-700`}>
              <UserRound className="h-4 w-4 text-slate-400" aria-hidden /> My account
            </Link>
          </MenuItem>
          <MenuItem>
            <Link to="/" className={`${item} text-slate-700`}>
              <Globe2 className="h-4 w-4 text-slate-400" aria-hidden /> Public portal
            </Link>
          </MenuItem>
          {isPending && (
            <MenuItem>
              <Link to="/account-pending" className={`${item} text-slate-700`}>
                <Clock3 className="h-4 w-4 text-amber-500" aria-hidden /> Request status
              </Link>
            </MenuItem>
          )}
        </div>
        <div className="border-t border-slate-100 pt-1">
          <MenuItem>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
              className={`${item} text-red-700 data-[focus]:bg-red-50`}
            >
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </button>
          </MenuItem>
        </div>
      </MenuItems>
    </Menu>
  );
}
