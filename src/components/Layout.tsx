import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Brain,
  LayoutDashboard,
  ClipboardList,
  Users,
  FileText,
  LogOut,
  Menu,
  ChevronRight,
  BookOpen,
  Layers,
  GraduationCap,
  BarChart2,
  UserCog,
  Shield,
  Building2,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const teacherOnlyNav = [
  { to: '/scores', icon: ClipboardList, label: 'Enter Scores' },
  { to: '/progress', icon: TrendingUp, label: 'Tracking Progress' },
  { to: '/students', icon: Users, label: 'My Students' },
  { to: '/reports', icon: FileText, label: 'Reports' },
];

const adminOverviewNav = [
  { to: '/students', icon: Users, label: 'All Students' },
  { to: '/admin/results', icon: BarChart2, label: 'Results' },
  { to: '/admin/teachers', icon: UserCog, label: 'Teachers' },
];

const adminToolsNav = [
  { to: '/scores', icon: ClipboardList, label: 'Enter Scores' },
  { to: '/progress', icon: TrendingUp, label: 'Tracking Progress' },
  { to: '/reports', icon: FileText, label: 'Reports' },
];

const adminManageNav = [
  { to: '/admin/subjects', icon: BookOpen, label: 'Subjects' },
  { to: '/admin/levels', icon: Layers, label: 'Level Subjects' },
  { to: '/admin/classes', icon: GraduationCap, label: 'Classes' },
];

function NavItem({
  to,
  icon: Icon,
  label,
  end,
  onClick,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
          isActive
            ? 'bg-blue-50 text-blue-700'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={`w-4 h-4 shrink-0 ${
              isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
            }`}
          />
          <span className="flex-1">{label}</span>
          {isActive && <ChevronRight className="w-3 h-3 text-blue-400" />}
        </>
      )}
    </NavLink>
  );
}

function NavSectionLabel({ label, icon: Icon }: { label: string; icon?: React.ElementType }) {
  return (
    <div className="flex items-center gap-1.5 px-3 pb-1 pt-3">
      {Icon && <Icon className="w-3 h-3 text-slate-400" />}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { profile, school, signOut } = useAuth();
  const navigate = useNavigate();
  const isAdmin = profile?.role === 'admin';
  const isSuperAdmin = profile?.role === 'super_admin';

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100 shrink-0">
        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-slate-900 leading-none text-sm">SANA OS</p>
          <p className="text-[10px] text-slate-400 mt-0.5 leading-none truncate">
            {isSuperAdmin ? 'System Owner' : (school?.name ?? 'Intelligence System')}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">
        {isSuperAdmin ? (
          <>
            <NavSectionLabel label="System" icon={Shield} />
            <NavItem to="/superadmin" icon={Building2} label="Schools & Admins" end onClick={onClose} />
          </>
        ) : (
          <>
            <NavSectionLabel label={isAdmin ? 'School' : 'Overview'} icon={isAdmin ? Shield : undefined} />
            <NavItem to="/" icon={LayoutDashboard} label={isAdmin ? 'School Dashboard' : 'Dashboard'} end onClick={onClose} />

            {isAdmin ? (
              <>
                <NavSectionLabel label="Monitor" icon={BarChart2} />
                {adminOverviewNav.map(item => (
                  <NavItem key={item.to} {...item} onClick={onClose} />
                ))}

                <NavSectionLabel label="Tools" icon={ClipboardList} />
                {adminToolsNav.map(item => (
                  <NavItem key={item.to} {...item} onClick={onClose} />
                ))}

                <NavSectionLabel label="Curriculum" icon={GraduationCap} />
                {adminManageNav.map(item => (
                  <NavItem key={item.to} {...item} onClick={onClose} />
                ))}
              </>
            ) : (
              <>
                <NavSectionLabel label="Classroom" />
                {teacherOnlyNav.map(item => (
                  <NavItem key={item.to} {...item} onClick={onClose} />
                ))}
              </>
            )}
          </>
        )}
      </nav>

      {/* Profile footer */}
      <div className="px-3 pb-4 border-t border-slate-100 pt-4 shrink-0">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 mb-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <span className="text-blue-700 font-semibold text-xs">
              {profile?.name ? profile.name.charAt(0).toUpperCase() : '?'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 truncate leading-none">{profile?.name ?? 'User'}</p>
            <div className="flex items-center gap-1 mt-0.5">
              {(isAdmin || isSuperAdmin) && <Shield className="w-2.5 h-2.5 text-blue-500" />}
              <p className="text-[11px] text-slate-400 capitalize truncate">
                {profile?.role === 'super_admin' ? 'Super Admin' : profile?.role ?? 'teacher'}
              </p>
            </div>
            {school && !isSuperAdmin && (
              <div className="flex items-center gap-1 mt-1">
                <Building2 className="w-2.5 h-2.5 text-slate-300 shrink-0" />
                <p className="text-[10px] text-slate-400 truncate leading-none">{school.name}</p>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-white border-r border-slate-100 shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl z-50">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-xl hover:bg-slate-100 transition"
          >
            <Menu className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900 text-sm">SANA OS</span>
          </div>
          <div className="w-9" />
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
