import React, { useEffect, useState } from 'react';
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  Sun,
  X,
  ArrowLeftCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useFirebase } from '../../context/FirebaseContext';
import { apiFetch, formatDateDMY } from '../../lib/api';
import { Modal } from '../ui/Primitives';
import { FirebaseCloudPanel } from '../cloud/FirebaseCloudPanel';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
}

export function AppShell({
  brandSubtitle,
  navItems,
  activeNav,
  onSelectNav,
  children,
}: {
  brandSubtitle: string;
  navItems: NavItem[];
  activeNav: string;
  onSelectNav: (id: string) => void;
  children: React.ReactNode;
}) {
  const {
    user,
    institution,
    unreadNotices,
    liveNotices,
    notifications,
    unreadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    theme,
    toggleTheme,
    logout,
    exitImpersonation,
    markNoticeRead,
    refreshMe,
    toast,
    effectiveAppLogo,
  } = useApp();
  const totalUnread = unreadNotices + unreadNotifications;

  const { firebaseUser } = useFirebase();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  // Auto-open parent folder whenever one of its child submenus is active
  useEffect(() => {
    for (const item of navItems) {
      if (item.children?.some((c) => c.id === activeNav)) {
        setOpenFolders((prev) => (prev[item.id] ? prev : { ...prev, [item.id]: true }));
      }
    }
  }, [activeNav, navItems]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdForm.new_password.length < 4) {
      toast('error', 'নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।');
      return;
    }
    if (pwdForm.new_password !== pwdForm.confirm_password) {
      toast('error', 'নতুন পাসওয়ার্ড ও নিশ্চিতকরণ মিলছে না।');
      return;
    }
    setPwdSaving(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: {
          current_password: pwdForm.current_password,
          new_password: pwdForm.new_password,
        },
      });
      toast('success', 'পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে');
      setPwdForm({ current_password: '', new_password: '', confirm_password: '' });
      setPwdModalOpen(false);
      await refreshMe();
    } catch (err: any) {
      toast('error', 'পরিবর্তন ব্যর্থ হয়েছে', err.message);
    } finally {
      setPwdSaving(false);
    }
  };

  let activeItem: NavItem | undefined;
  let activeParent: NavItem | undefined;
  for (const n of navItems) {
    if (n.id === activeNav) {
      activeItem = n;
      break;
    }
    const foundChild = n.children?.find((c) => c.id === activeNav);
    if (foundChild) {
      activeParent = n;
      activeItem = foundChild;
      break;
    }
  }

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] dark:bg-[#0B1120] text-[#0F172A] dark:text-slate-100">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden no-print"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen flex flex-col bg-[#0F172A] text-slate-200 border-r border-slate-800 transition-all duration-200 no-print ${
          collapsed ? 'w-[72px]' : 'w-[264px]'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Brand */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={institution?.logo_url || effectiveAppLogo}
              alt="DARUL IDARAH"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-lg object-cover border border-amber-500/30 shrink-0"
            />
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-sm font-bold tracking-tight text-white truncate">
                  {institution?.name || 'DARUL IDARAH'}
                </div>
                <div className="text-[11px] text-amber-400/90 truncate">{brandSubtitle}</div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="সাইডবার সংকুচিত করুন"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white"
            aria-label="মেনু বন্ধ করুন"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav List */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const hasChildren = Array.isArray(item.children) && item.children.length > 0;
            const hasActiveChild = hasChildren && item.children!.some((c) => c.id === activeNav);
            const isFolderOpen = Boolean(openFolders[item.id] || hasActiveChild);
            const isActive = activeNav === item.id;

            if (hasChildren) {
              return (
                <div key={item.id} className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (collapsed) {
                        setCollapsed(false);
                        setOpenFolders((prev) => ({ ...prev, [item.id]: true }));
                      } else {
                        setOpenFolders((prev) => ({ ...prev, [item.id]: !isFolderOpen }));
                      }
                    }}
                    title={collapsed ? item.label : undefined}
                    aria-expanded={isFolderOpen}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      hasActiveChild
                        ? 'bg-slate-800/90 text-white'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon className="w-4 h-4 shrink-0 text-amber-400/90" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </span>
                    {!collapsed && (
                      <ChevronDown
                        className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                          isFolderOpen ? 'rotate-0' : '-rotate-90'
                        }`}
                      />
                    )}
                  </button>

                  {!collapsed && isFolderOpen && (
                    <div className="pl-3.5 ml-3 border-l border-slate-700/80 space-y-0.5 py-0.5">
                      {item.children!.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = activeNav === child.id;
                        return (
                          <button
                            key={child.id}
                            type="button"
                            onClick={() => {
                              onSelectNav(child.id);
                              setMobileOpen(false);
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                              childActive
                                ? 'bg-[#6D28D9] text-white'
                                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                            }`}
                          >
                            <ChildIcon className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{child.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'logout') {
                    logout();
                  } else {
                    onSelectNav(item.id);
                  }
                  setMobileOpen(false);
                }}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#6D28D9] text-white'
                    : item.id === 'logout'
                    ? 'text-red-300 hover:bg-red-950/50 hover:text-red-200 mt-2'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User Footer */}
        {!collapsed && user && (
          <div className="p-3.5 border-t border-slate-800 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {user.photo_url ? (
                <img
                  src={user.photo_url}
                  alt={user.full_name}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-[#047857] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {user.full_name.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate">{user.full_name}</div>
                <div className="text-[11px] text-slate-400 truncate">
                  {user.role_name} · @{user.username}
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Impersonation Warning Strip (only when Super Admin uses Login as Institution) */}
        {user?.impersonated_by_user_id && (
          <div className="bg-[#6D28D9] text-white px-4 py-2 flex items-center justify-between gap-4 text-xs no-print">
            <span>
              সুপার অ্যাডমিন হিসেবে <strong>{institution?.name}</strong> প্যানেলে প্রবেশ করেছেন (অডিট লগে সংরক্ষিত)।
            </span>
            <button
              type="button"
              onClick={exitImpersonation}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white/15 hover:bg-white/25 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeftCircle className="w-3.5 h-3.5" />
              সুপার অ্যাডমিনে ফিরুন
            </button>
          </div>
        )}

        {/* First-Login Password Change Prompt Banner */}
        {user?.must_change_password === 1 && !user.impersonated_by_user_id && (
          <div className="bg-amber-500 text-slate-950 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs no-print">
            <span className="font-medium">
              নিরাপত্তার স্বার্থে আপনার প্রাথমিক পাসওয়ার্ড/পিন পরিবর্তন করে নতুন পাসওয়ার্ড সেট করুন।
            </span>
            <button
              type="button"
              onClick={() => setPwdModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-950 text-white hover:bg-slate-800 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              এখনই পাসওয়ার্ড পরিবর্তন করুন
            </button>
          </div>
        )}

        {/* Top Bar */}
        <header className="h-16 sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 lg:px-8 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="মেনু খুলুন"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline truncate">
                {institution?.name || 'দারুল ইদারা প্ল্যাটফর্ম'}
              </span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              {activeParent && (
                <>
                  <span className="text-slate-500 dark:text-slate-400 hidden md:inline truncate">
                    {activeParent.label}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700 hidden md:inline">/</span>
                </>
              )}
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {activeItem?.label || 'ড্যাশবোর্ড'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Firebase Cloud Workspace Button */}
            <button
              type="button"
              onClick={() => setCloudModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                firebaseUser
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-[#047857] dark:text-emerald-400'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title="Firebase ক্লাউড সিঙ্ক ও নোটস"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{firebaseUser ? 'ক্লাউড সংযুক্ত' : 'Firebase ক্লাউড'}</span>
            </button>

            {/* Live Notification Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                className="relative p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="নোটিফিকেশন"
              >
                <Bell className="w-4 h-4" />
                {totalUnread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold font-mono-num flex items-center justify-center">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      নোটিফিকেশন ({totalUnread})
                    </span>
                    <div className="flex items-center gap-2">
                      {unreadNotifications > 0 && (
                        <button
                          type="button"
                          onClick={() => markAllNotificationsRead()}
                          className="text-[11px] font-medium text-[#6D28D9] dark:text-violet-400 hover:underline cursor-pointer"
                        >
                          সব পঠিত
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 && liveNotices.length === 0 ? (
                      <div className="p-5 text-center text-xs text-slate-500 dark:text-slate-400">
                        নতুন কোনো রিয়েল-টাইম নোটিফিকেশন বা নোটিশ আসলে এখানে তাৎক্ষণিকভাবে দেখা যাবে।
                      </div>
                    ) : (
                      <>
                        {notifications.map((n) => (
                          <div
                            key={`notif-${n.id}`}
                            onClick={() => {
                              markNotificationRead(n.id);
                              const targetTab =
                                n.reference_type === 'teacher_leave' || n.reference_type === 'student_leave'
                                  ? 'leaves'
                                  : n.reference_type === 'teacher_salary'
                                  ? 'teacher_salary'
                                  : n.reference_type === 'teacher_advance' || n.reference_type === 'teacher_due'
                                  ? 'teacher_dues'
                                  : n.reference_type === 'teacher_schedule'
                                  ? 'routine'
                                  : '';
                              if (targetTab) {
                                onSelectNav(targetTab);
                                setNotifOpen(false);
                              }
                            }}
                            className={`p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer ${
                              n.is_read ? 'opacity-75' : 'bg-violet-50/40 dark:bg-violet-950/20'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                                {n.title}
                              </div>
                              {!n.is_read && (
                                <span className="text-[10px] font-semibold text-[#6D28D9] dark:text-violet-400 shrink-0">
                                  নতুন
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                              {n.message}
                            </p>
                            <div className="text-[11px] text-slate-400 mt-1 font-mono-num">
                              {formatDateDMY(n.created_at)}
                            </div>
                          </div>
                        ))}
                        {liveNotices.map((n) => (
                          <div
                            key={`notice-${n.id}`}
                            onClick={() => markNoticeRead(n.id)}
                            className="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                          >
                            <div className="text-xs font-semibold text-slate-900 dark:text-white">
                              নোটিশ: {n.title}
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                              {n.description}
                            </p>
                            <div className="text-[11px] text-slate-400 mt-1 font-mono-num">
                              {formatDateDMY(n.publish_date)} · {n.created_by_name}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Change Password Quick Button */}
            {!user?.impersonated_by_user_id && (
              <button
                type="button"
                onClick={() => setPwdModalOpen(true)}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="পাসওয়ার্ড পরিবর্তন"
                aria-label="পাসওয়ার্ড পরিবর্তন"
              >
                <KeyRound className="w-4 h-4" />
              </button>
            )}

            {/* Light / Dark Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="থিম পরিবর্তন করুন"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Quick Logout */}
            <button
              type="button"
              onClick={logout}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              লগআউট
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      <Modal
        open={cloudModalOpen}
        onClose={() => setCloudModalOpen(false)}
        title="Firebase ক্লাউড ওয়ার্কস্পেস ও সিঙ্ক"
        maxWidth="max-w-4xl"
      >
        <FirebaseCloudPanel mode="workspace" />
      </Modal>

      <Modal
        open={pwdModalOpen}
        onClose={() => setPwdModalOpen(false)}
        title="পাসওয়ার্ড / পিন পরিবর্তন করুন"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleChangePassword} className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            পাসওয়ার্ড পরিবর্তন করলে আপনার রোল নম্বর বা নিবন্ধিত মোবাইল নম্বরে কোনো পরিবর্তন হবে না।
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">বর্তমান পাসওয়ার্ড / পিন</label>
            <input
              type="password"
              required
              value={pwdForm.current_password}
              onChange={(e) => setPwdForm((f) => ({ ...f, current_password: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">নতুন পাসওয়ার্ড / পিন (কমপক্ষে ৪ অক্ষর)</label>
            <input
              type="password"
              required
              minLength={4}
              value={pwdForm.new_password}
              onChange={(e) => setPwdForm((f) => ({ ...f, new_password: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">নতুন পাসওয়ার্ড নিশ্চিত করুন</label>
            <input
              type="password"
              required
              minLength={4}
              value={pwdForm.confirm_password}
              onChange={(e) => setPwdForm((f) => ({ ...f, confirm_password: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPwdModalOpen(false)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={pwdSaving}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#047857] hover:bg-[#065F46] text-white disabled:opacity-50 cursor-pointer"
            >
              {pwdSaving ? 'সংরক্ষণ হচ্ছে...' : 'পাসওয়ার্ড আপডেট করুন'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
