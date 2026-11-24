import React, { useState } from 'react';
import {
  Bell,
  BookOpen,
  Building2,
  ClipboardCheck,
  FileBarChart2,
  GraduationCap,
  HeartPulse,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { AuthUser, ROLE_LABELS, UserRole } from '../types';
import { TapakSunanLogo } from './TapakSunanLogo';

export type NavSection =
  | 'overview'
  | 'finance'
  | 'health'
  | 'classwork'
  | 'wali_academic'
  | 'dormitory'
  | 'master'
  | 'reports'
  | 'notifications'
  | 'pondok'
  | 'profile';

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.FC<{ className?: string }>;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'overview',
    label: 'Ringkasan',
    icon: LayoutDashboard,
    roles: ['admin', 'wali_santri', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'],
  },
  {
    id: 'finance',
    label: 'Keuangan & SPP',
    icon: Wallet,
    roles: ['admin', 'bendahara', 'wali_santri'],
  },
  {
    id: 'classwork',
    label: 'Kelas & Absensi',
    icon: ClipboardCheck,
    roles: ['admin', 'wali_salaf', 'wali_sekolah', 'wali_kelas'],
  },
  {
    id: 'wali_academic',
    label: 'Akademik Anak',
    icon: GraduationCap,
    roles: ['wali_santri'],
  },
  {
    id: 'health',
    label: 'Kesehatan Santri',
    icon: HeartPulse,
    roles: ['admin', 'wali_santri', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'],
  },
  {
    id: 'dormitory',
    label: 'Asrama & Kamar',
    icon: Home,
    roles: ['admin', 'pembina_asrama'],
  },
  {
    id: 'master',
    label: 'Data Master & Akun',
    icon: Users,
    roles: ['admin'],
  },
  {
    id: 'reports',
    label: 'Laporan',
    icon: FileBarChart2,
    roles: ['admin', 'bendahara', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'],
  },
  {
    id: 'pondok',
    label: 'Profil Pondok',
    icon: Building2,
    roles: ['admin', 'wali_santri'],
  },
  {
    id: 'notifications',
    label: 'Notifikasi',
    icon: Bell,
    roles: ['admin', 'bendahara', 'wali_santri', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'],
  },
  {
    id: 'profile',
    label: 'Edit Profil',
    icon: UserCog,
    roles: ['admin', 'bendahara', 'wali_santri', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'],
  },
];

interface DashboardLayoutProps {
  user: AuthUser;
  activeSection: NavSection;
  onSelectSection: (sec: NavSection) => void;
  unreadNotifications: number;
  onLogout: () => void;
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  user,
  activeSection,
  onSelectSection,
  unreadNotifications,
  onLogout,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const currentItem = visibleItems.find((i) => i.id === activeSection) || visibleItems[0];

  const handleNavigate = (sec: NavSection) => {
    onSelectSection(sec);
    setMobileMenuOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="px-5 py-5 border-b border-slate-200 flex items-center gap-3">
        <TapakSunanLogo className="w-9 h-9 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900 truncate">Tapak Sunan</div>
          <div className="text-xs text-slate-500 truncate">{ROLE_LABELS[user.role]}</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeSection;
          const label = item.id === 'reports' && user.role === 'bendahara' ? 'Laporan Keuangan' : item.label;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-emerald-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{label}</span>
              </span>
              {item.id === 'notifications' && unreadNotifications > 0 && (
                <span
                  className={`text-xs font-mono tabular-nums px-1.5 py-0.5 rounded ${
                    active ? 'bg-emerald-700 text-white' : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {unreadNotifications}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 bg-slate-50/70">
        <button
          type="button"
          onClick={() => handleNavigate('profile')}
          className="w-full flex items-center gap-2.5 text-left rounded-lg hover:bg-slate-100/80 p-1.5 -m-1.5 transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
            {user.avatar_file ? (
              <img
                src={user.avatar_file}
                alt={user.full_name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs font-bold text-emerald-900">
                {(user.full_name || user.username || 'U').slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</div>
            <div className="text-xs text-slate-500 truncate mt-0.5">@{user.username}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen no-print">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Tutup menu"
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400 whitespace-nowrap">Tapak Sunan</span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <span className="font-semibold text-slate-900 truncate">
                {currentItem?.id === 'reports' && user.role === 'bendahara'
                  ? 'Laporan Keuangan'
                  : currentItem?.label || 'Ringkasan'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleNavigate('notifications')}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Bell className="w-4 h-4 text-slate-600" />
              <span className="hidden sm:inline">Notifikasi</span>
              {unreadNotifications > 0 && (
                <span className="font-mono tabular-nums font-semibold text-amber-800">
                  ({unreadNotifications})
                </span>
              )}
            </button>

            <div className="hidden md:flex items-center gap-2 pl-3 border-l border-slate-200 text-xs text-slate-600 whitespace-nowrap">
              <BookOpen className="w-4 h-4 text-emerald-800" />
              <span className="font-medium text-slate-900">{ROLE_LABELS[user.role]}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1280px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
