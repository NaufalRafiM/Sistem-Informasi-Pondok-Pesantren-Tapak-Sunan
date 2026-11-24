import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from './lib/api';
import { AuthUser } from './types';
import { LoginPage } from './pages/LoginPage';
import { DashboardLayout, NavSection } from './components/DashboardLayout';
import { OverviewPage } from './pages/OverviewPage';
import { FinancePage } from './pages/FinancePage';
import { HealthPage } from './pages/HealthPage';
import { ClassWorkPage } from './pages/ClassWorkPage';
import { WaliAcademicPage } from './pages/WaliAcademicPage';
import { DormitoryPage } from './pages/DormitoryPage';
import { MasterAdminPage } from './pages/MasterAdminPage';
import { ReportsPage } from './pages/ReportsPage';
import { PondokProfilePage } from './pages/PondokProfilePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  const refreshNotificationCount = useCallback(async () => {
    try {
      const res = await apiFetch<{ unread_count: number }>('/notifications');
      setUnreadNotifications(res.unread_count);
    } catch {
      // ignore if logged out
    }
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setBooting(false);
      return;
    }
    apiFetch<{ user: AuthUser }>('/auth/me')
      .then((res) => {
        setUser(res.user);
        if (res.user.role === 'bendahara') {
          setActiveSection('finance');
        }
        refreshNotificationCount();
      })
      .catch(() => {
        setStoredToken(null);
      })
      .finally(() => setBooting(false));
  }, [refreshNotificationCount]);

  function handleLoginSuccess(token: string, loggedInUser: AuthUser) {
    setStoredToken(token);
    setUser(loggedInUser);
    setActiveSection(loggedInUser.role === 'bendahara' ? 'finance' : 'overview');
    refreshNotificationCount();
  }

  function handleLogout() {
    setStoredToken(null);
    setUser(null);
    setUnreadNotifications(0);
    setActiveSection('overview');
  }

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Memuat Sistem Informasi Pondok Pesantren Tapak Sunan...
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Client-side RBAC route guard matching Backend RBAC
  function renderSection() {
    if (!user) return null;
    const fallbackView =
      user.role === 'bendahara' ? (
        <FinancePage user={user} onRefreshNotifications={refreshNotificationCount} />
      ) : (
        <OverviewPage user={user} onNavigate={setActiveSection} />
      );

    if (user.role === 'bendahara') {
      switch (activeSection) {
        case 'finance':
          return <FinancePage user={user} onRefreshNotifications={refreshNotificationCount} />;
        case 'reports':
          return <ReportsPage user={user} />;
        case 'notifications':
          return <NotificationsPage onRefreshCount={refreshNotificationCount} />;
        case 'profile':
          return <ProfilePage user={user} onUserUpdated={setUser} />;
        default:
          return fallbackView;
      }
    }

    switch (activeSection) {
      case 'overview':
        return <OverviewPage user={user} onNavigate={setActiveSection} />;
      case 'finance':
        if (user.role === 'admin' || user.role === 'wali_santri') {
          return <FinancePage user={user} onRefreshNotifications={refreshNotificationCount} />;
        }
        return fallbackView;
      case 'health':
        return <HealthPage user={user} onRefreshNotifications={refreshNotificationCount} />;
      case 'classwork':
        if (
          user.role === 'admin' ||
          user.role === 'wali_salaf' ||
          user.role === 'wali_sekolah' ||
          user.role === 'wali_kelas'
        ) {
          return <ClassWorkPage user={user} onRefreshNotifications={refreshNotificationCount} />;
        }
        return fallbackView;
      case 'wali_academic':
        if (user.role === 'wali_santri') {
          return <WaliAcademicPage />;
        }
        return fallbackView;
      case 'dormitory':
        if (user.role === 'admin' || user.role === 'pembina_asrama') {
          return <DormitoryPage user={user} />;
        }
        return fallbackView;
      case 'master':
        if (user.role === 'admin') {
          return <MasterAdminPage />;
        }
        return fallbackView;
      case 'reports':
        if (user.role !== 'wali_santri') {
          return <ReportsPage user={user} />;
        }
        return fallbackView;
      case 'pondok':
        return <PondokProfilePage user={user} />;
      case 'notifications':
        return <NotificationsPage onRefreshCount={refreshNotificationCount} />;
      case 'profile':
        return <ProfilePage user={user} onUserUpdated={setUser} />;
      default:
        return fallbackView;
    }
  }

  return (
    <>
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      <DashboardLayout
        user={user}
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        unreadNotifications={unreadNotifications}
        onLogout={handleLogout}
      >
        {renderSection()}
      </DashboardLayout>
    </>
  );
}
