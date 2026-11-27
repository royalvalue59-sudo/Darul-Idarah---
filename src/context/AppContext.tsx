import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, setAuthToken, setUnauthorizedHandler } from '../lib/api';
import { useRealtime } from '../lib/useRealtime';
import type {
  AppNotification,
  AuthUser,
  ConfirmOptions,
  InstitutionInfo,
  RealtimeNotice,
  TeacherLiveStatusItem,
  ToastMessage,
} from '../types';

export interface AppBrandingState {
  app_name: string;
  logo_url: string;
  logo_mime: string;
  logo_filename: string;
  logo_version: number;
  updated_at: string;
}

const DEFAULT_APP_LOGO = '/src/assets/images/darul_idarah_emblem_1795577863106.jpg';

interface AppContextValue {
  user: AuthUser | null;
  institution: InstitutionInfo | null;
  appBranding: AppBrandingState;
  effectiveAppLogo: string;
  refreshBranding: () => Promise<void>;
  unreadNotices: number;
  liveNotices: RealtimeNotice[];
  notifications: AppNotification[];
  unreadNotifications: number;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: number) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  teacherLiveStatuses: TeacherLiveStatusItem[];
  liveStatusUpdatedAt: string | null;
  setTeacherLiveStatuses: React.Dispatch<React.SetStateAction<TeacherLiveStatusItem[]>>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setSession: (token: string, user: AuthUser, institution: InstitutionInfo | null) => void;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
  exitImpersonation: () => Promise<void>;
  markNoticeRead: (noticeId: number) => Promise<void>;
  toast: (type: ToastMessage['type'], title: string, description?: string) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmState: { options: ConfirmOptions; resolve: (val: boolean) => void } | null;
  resolveConfirm: (val: boolean) => void;
  hasPermission: (moduleName: string, action: string) => boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [institution, setInstitution] = useState<InstitutionInfo | null>(null);
  const [unreadNotices, setUnreadNotices] = useState(0);
  const [liveNotices, setLiveNotices] = useState<RealtimeNotice[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [teacherLiveStatuses, setTeacherLiveStatuses] = useState<TeacherLiveStatusItem[]>([]);
  const [liveStatusUpdatedAt, setLiveStatusUpdatedAt] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [appBranding, setAppBranding] = useState<AppBrandingState>({
    app_name: 'DARUL IDARAH',
    logo_url: '',
    logo_mime: '',
    logo_filename: '',
    logo_version: 1,
    updated_at: '',
  });
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (val: boolean) => void;
  } | null>(null);

  const effectiveAppLogo = appBranding.logo_url || DEFAULT_APP_LOGO;

  const refreshBranding = useCallback(async () => {
    try {
      const res = await apiFetch<{ branding?: AppBrandingState }>('/api/public/branding', { skipAuth: true });
      if (res?.branding) {
        setAppBranding(res.branding);
      }
    } catch {
      // ignore initial branding fetch errors
    }
  }, []);

  useEffect(() => {
    refreshBranding();
  }, [refreshBranding]);

  useEffect(() => {
    const href = appBranding.logo_url || DEFAULT_APP_LOGO;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
  }, [appBranding.logo_url]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const toast = useCallback((type: ToastMessage['type'], title: string, description?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, title, description }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const resolveConfirm = useCallback((val: boolean) => {
    setConfirmState((prev) => {
      if (prev) prev.resolve(val);
      return null;
    });
  }, []);

  const clearSession = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setInstitution(null);
    setUnreadNotices(0);
    setLiveNotices([]);
    setNotifications([]);
    setUnreadNotifications(0);
    setTeacherLiveStatuses([]);
    setLiveStatusUpdatedAt(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      toast('error', 'সেশন সমাপ্ত হয়েছে', 'অনুগ্রহ করে পুনরায় লগইন করুন।');
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession, toast]);

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: AppNotification[]; unreadCount: number }>('/api/inst/notifications');
      setNotifications(data.notifications || []);
      setUnreadNotifications(data.unreadCount || 0);
    } catch {
      // ignore for super_admin without institution context
    }
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: AuthUser; institution: InstitutionInfo | null; unreadNotices: number }>(
        '/api/auth/me'
      );
      setUser(data.user);
      setInstitution(data.institution);
      setUnreadNotices(data.unreadNotices || 0);
      if (data.user?.institution_id) {
        refreshNotifications();
      }
    } catch {
      // handled by unauthorizedHandler
    }
  }, [refreshNotifications]);

  const setSession = useCallback(
    (token: string, nextUser: AuthUser, nextInst: InstitutionInfo | null) => {
      setAuthToken(token);
      setUser(nextUser);
      setInstitution(nextInst);
      setLiveNotices([]);
      setNotifications([]);
      setUnreadNotifications(0);
      setTeacherLiveStatuses([]);
      setLiveStatusUpdatedAt(null);
      apiFetch<{ unreadNotices: number }>('/api/auth/me')
        .then((d) => setUnreadNotices(d.unreadNotices || 0))
        .catch(() => {});
      if (nextUser.institution_id) {
        apiFetch<{ notifications: AppNotification[]; unreadCount: number }>('/api/inst/notifications')
          .then((d) => {
            setNotifications(d.notifications || []);
            setUnreadNotifications(d.unreadCount || 0);
          })
          .catch(() => {});
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore network error on logout
    } finally {
      clearSession();
      toast('info', 'সফলভাবে লগআউট হয়েছে');
    }
  }, [clearSession, toast]);

  const exitImpersonation = useCallback(async () => {
    try {
      const data = await apiFetch<{ token: string; user: AuthUser; institution: null }>(
        '/api/auth/exit-impersonation',
        { method: 'POST' }
      );
      setSession(data.token, data.user, null);
      toast('info', 'সুপার অ্যাডমিন প্যানেলে ফিরে আসা হয়েছে');
    } catch (err: any) {
      toast('error', 'সমস্যা হয়েছে', err.message);
    }
  }, [setSession, toast]);

  const markNoticeRead = useCallback(async (noticeId: number) => {
    try {
      await apiFetch(`/api/inst/notices/${noticeId}/read`, { method: 'POST' });
      setUnreadNotices((c) => Math.max(0, c - 1));
      setLiveNotices((prev) => prev.map((n) => (n.id === noticeId ? { ...n, is_read: 1 } : n)));
    } catch {
      // ignore
    }
  }, []);

  const markNotificationRead = useCallback(async (notificationId: number) => {
    try {
      await apiFetch(`/api/inst/notifications/${notificationId}/read`, { method: 'POST' });
      setNotifications((prev) => {
        const target = prev.find((n) => n.id === notificationId);
        if (target && !target.is_read) {
          setUnreadNotifications((c) => Math.max(0, c - 1));
        }
        return prev.map((n) => (n.id === notificationId ? { ...n, is_read: 1 } : n));
      });
    } catch {
      // ignore
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    try {
      await apiFetch('/api/inst/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadNotifications(0);
    } catch {
      // ignore
    }
  }, []);

  const hasPermission = useCallback(
    (moduleName: string, action: string) => {
      if (!user) return false;
      if (user.account_type === 'super_admin' || user.account_type === 'institution_admin') return true;
      const list = user.permissions?.[moduleName];
      if (!Array.isArray(list)) return false;
      return list.includes(action) || list.includes('manage');
    },
    [user]
  );

  useRealtime({
    enabled: Boolean(user),
    onNotice: (notice) => {
      setLiveNotices((prev) => {
        if (prev.some((n) => n.id === notice.id)) return prev;
        return [notice, ...prev];
      });
      setUnreadNotices((c) => c + 1);
      toast('info', `নতুন নোটিশ: ${notice.title}`, notice.description.slice(0, 90));
    },
    onNotification: (notif) => {
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notif.id)) return prev;
        return [notif, ...prev].slice(0, 60);
      });
      setUnreadNotifications((c) => c + 1);
      toast('info', notif.title, notif.message.slice(0, 110));
    },
    onTeacherLiveStatus: (statuses, updatedAt) => {
      setTeacherLiveStatuses(statuses);
      setLiveStatusUpdatedAt(updatedAt);
    },
    onSessionRevoked: () => {
      clearSession();
      toast('error', 'সেশন বিচ্ছিন্ন করা হয়েছে', 'অ্যাডমিন আপনার সেশনটি ফোর্স লগআউট করেছেন।');
    },
  });

  return (
    <AppContext.Provider
      value={{
        user,
        institution,
        appBranding,
        effectiveAppLogo,
        refreshBranding,
        unreadNotices,
        liveNotices,
        notifications,
        unreadNotifications,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
        teacherLiveStatuses,
        liveStatusUpdatedAt,
        setTeacherLiveStatuses,
        theme,
        toggleTheme,
        setSession,
        refreshMe,
        logout,
        exitImpersonation,
        markNoticeRead,
        toast,
        toasts,
        dismissToast,
        confirm,
        confirmState,
        resolveConfirm,
        hasPermission,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
