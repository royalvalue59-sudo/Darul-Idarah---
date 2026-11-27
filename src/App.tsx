import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { FirebaseProvider } from './context/FirebaseContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ConfirmDialog, ToastContainer } from './components/ui/Primitives';
import { LoginPage } from './pages/LoginPage';
import { SuperAdminLoginPage } from './pages/SuperAdminLoginPage';
import { SuperAdminPanel } from './pages/super/SuperAdminPanel';
import { InstitutionPanel } from './pages/institution/InstitutionPanel';
import { TeacherPortal } from './pages/portals/TeacherPortal';
import { StudentPortal } from './pages/portals/StudentPortal';
import { GuardianPortal } from './pages/portals/GuardianPortal';

function AuthenticatedRouter() {
  const { user } = useApp();
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (!user) {
    if (/^\/super-admin\/login\/?$/.test(pathname)) {
      return <SuperAdminLoginPage />;
    }
    return <LoginPage />;
  }

  // Strictly route based on backend-verified dashboard_route (with account_type fallback)
  const route =
    user.dashboard_route ||
    (user.account_type === 'super_admin' && !user.impersonated_by_user_id
      ? 'super_admin'
      : user.account_type === 'student'
      ? 'student'
      : user.account_type === 'guardian'
      ? 'guardian'
      : user.account_type === 'teacher'
      ? 'teacher'
      : 'institution');

  if (route === 'super_admin' && !user.impersonated_by_user_id) {
    return <SuperAdminPanel />;
  }
  if (route === 'student') {
    return <StudentPortal />;
  }
  if (route === 'guardian') {
    return <GuardianPortal />;
  }
  if (route === 'teacher') {
    return <TeacherPortal />;
  }
  return <InstitutionPanel />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <FirebaseProvider>
          <AuthenticatedRouter />
          <ConfirmDialog />
          <ToastContainer />
        </FirebaseProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}

