import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Building2,
  DatabaseBackup,
  FileBarChart2,
  FileText,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
  Eye,
  Edit3,
  History,
  Download,
  Copy,
  ExternalLink,
  Folder,
  Printer,
} from 'lucide-react';
import { AppShell, type NavItem } from '../../components/layout/AppShell';
import {
  EmptyState,
  Modal,
  PageHeader,
  StatCard,
  StatusText,
  TableSkeleton,
  emeraldBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  secondaryBtnClass,
  tableHeadClass,
} from '../../components/ui/Primitives';
import { FileUploadField } from '../../components/ui/FileUploadField';
import { apiFetch, exportRowsToCsv, formatBDT, formatDateDMY, formatDateTimeDMY } from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { FirebaseCloudPanel } from '../../components/cloud/FirebaseCloudPanel';

const SUPER_NAV: NavItem[] = [
  { id: 'dashboard', label: 'ড্যাশবোর্ড', icon: LayoutDashboard },
  { id: 'institutions', label: 'প্রতিষ্ঠানসমূহ', icon: Building2 },
  { id: 'users', label: 'ব্যবহারকারী', icon: Users },
  { id: 'roles', label: 'রোল ও পারমিশন', icon: Shield },
  { id: 'support', label: 'সাপোর্ট সেন্টার', icon: LifeBuoy },
  { id: 'reports', label: 'রিপোর্ট', icon: FileBarChart2 },
  { id: 'notifications', label: 'নোটিফিকেশন', icon: Bell },
  { id: 'settings', label: 'সিস্টেম সেটিংস', icon: Settings },
  { id: 'audit', label: 'অডিট লগ', icon: FileText },
  { id: 'security', label: 'নিরাপত্তা', icon: ShieldAlert },
  { id: 'updates', label: 'অ্যাপ আপডেট', icon: Sparkles },
  { id: 'backup', label: 'ব্যাকআপ ও রিকভারি', icon: DatabaseBackup },
  { id: 'logout', label: 'লগআউট', icon: LogOut },
];

export function SuperAdminPanel() {
  const { setSession, toast, confirm, refreshBranding } = useApp();
  const [activeNav, setActiveNav] = useState('dashboard');
  const [loading, setLoading] = useState(false);

  const institutionLoginUrl = typeof window !== 'undefined' ? `${window.location.origin}/` : '/';
  const copyInstitutionLoginUrl = async () => {
    try {
      await navigator.clipboard.writeText(institutionLoginUrl);
      toast('success', 'প্রতিষ্ঠান ব্যবহারকারী লগইন লিংক কপি হয়েছে', institutionLoginUrl);
    } catch {
      toast('info', 'প্রতিষ্ঠান লগইন লিংক', institutionLoginUrl);
    }
  };

  // Dashboard
  const [dash, setDash] = useState<any>(null);

  // Institutions
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [instSearch, setInstSearch] = useState('');
  const [instStatusFilter, setInstStatusFilter] = useState('all');
  const [addInstModal, setAddInstModal] = useState(false);
  const [newInstForm, setNewInstForm] = useState({ name: '', username: '', password: '' });
  const [editInst, setEditInst] = useState<any>(null);
  const [viewInst, setViewInst] = useState<any>(null);
  const [resetPassTarget, setResetPassTarget] = useState<{ type: 'inst' | 'user'; id: number; name: string } | null>(null);
  const [resetPassVal, setResetPassVal] = useState('');
  const [instLoginHistory, setInstLoginHistory] = useState<{ name: string; rows: any[] } | null>(null);

  // Users
  const [users, setUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState('all');

  // Roles
  const [roles, setRoles] = useState<any[]>([]);

  // Support
  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketStatusFilter, setTicketStatusFilter] = useState('all');
  const [activeTicket, setActiveTicket] = useState<{ ticket: any; replies: any[] } | null>(null);
  const [replyText, setReplyText] = useState('');

  // Reports
  const [reportData, setReportData] = useState<any>(null);

  // Notifications
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifForm, setNotifForm] = useState({ title: '', description: '', audience_type: 'institutions' });

  // Settings, Application Branding & Global Support Settings
  const [sysSettings, setSysSettings] = useState<any>({});
  const [brandingForm, setBrandingForm] = useState({ app_name: 'DARUL IDARAH', logo_url: '', logo_filename: '' });
  const [savingBranding, setSavingBranding] = useState(false);
  const [supportForm, setSupportForm] = useState({
    whatsapp_number: '',
    whatsapp_enabled: true,
    facebook_url: '',
    facebook_enabled: true,
    support_email: '',
    support_description: '',
  });
  const [savingSupport, setSavingSupport] = useState(false);

  // Audit Logs + Institution Folders
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditFolders, setAuditFolders] = useState<any>({ system_logs_count: 0, total_logs: 0, folders: [] });
  const [auditCategories, setAuditCategories] = useState<any[]>([]);
  const [selectedAuditFolder, setSelectedAuditFolder] = useState<string>('all');
  const [auditModuleFilter, setAuditModuleFilter] = useState<string>('all');
  const [auditStatusFilter, setAuditStatusFilter] = useState<string>('all');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [auditSearch, setAuditSearch] = useState('');

  // Security
  const [security, setSecurity] = useState<any>(null);
  const [secTab, setSecTab] = useState<'sessions' | 'history' | 'failed' | 'suspicious'>('sessions');

  // Updates
  const [updates, setUpdates] = useState<any[]>([]);
  const [updateForm, setUpdateForm] = useState({ version: '', title: '', notes: '' });

  // Backup
  const [lastBackupSummary, setLastBackupSummary] = useState<any>(null);

  const loadSection = useCallback(async (section: string) => {
    setLoading(true);
    try {
      if (section === 'dashboard') {
        setDash(await apiFetch('/api/super/dashboard'));
      } else if (section === 'institutions') {
        const q = new URLSearchParams();
        if (instSearch) q.set('search', instSearch);
        if (instStatusFilter !== 'all') q.set('status', instStatusFilter);
        const res = await apiFetch(`/api/super/institutions?${q.toString()}`);
        setInstitutions(res.institutions || []);
      } else if (section === 'users') {
        const q = new URLSearchParams();
        if (userSearch) q.set('search', userSearch);
        if (userTypeFilter !== 'all') q.set('account_type', userTypeFilter);
        const res = await apiFetch(`/api/super/users?${q.toString()}`);
        setUsers(res.users || []);
      } else if (section === 'roles') {
        const res = await apiFetch('/api/super/roles');
        setRoles(res.roles || []);
      } else if (section === 'support') {
        const q = ticketStatusFilter !== 'all' ? `?status=${ticketStatusFilter}` : '';
        const res = await apiFetch(`/api/super/support${q}`);
        setTickets(res.tickets || []);
      } else if (section === 'reports') {
        setReportData(await apiFetch('/api/super/reports'));
      } else if (section === 'notifications') {
        const res = await apiFetch('/api/super/notifications');
        setNotifications(res.notifications || []);
      } else if (section === 'settings') {
        const [res, bRes, sRes] = await Promise.all([
          apiFetch('/api/super/settings'),
          apiFetch('/api/super/branding'),
          apiFetch('/api/super/support-settings').catch(() => null),
        ]);
        setSysSettings(res.settings || {});
        if (bRes?.branding) {
          setBrandingForm({
            app_name: bRes.branding.app_name || 'DARUL IDARAH',
            logo_url: bRes.branding.logo_url || '',
            logo_filename: bRes.branding.logo_filename || '',
          });
        }
        if (sRes?.support) {
          setSupportForm({
            whatsapp_number: sRes.support.whatsapp_number || '',
            whatsapp_enabled: sRes.support.whatsapp_enabled !== false,
            facebook_url: sRes.support.facebook_url || '',
            facebook_enabled: sRes.support.facebook_enabled !== false,
            support_email: sRes.support.support_email || '',
            support_description: sRes.support.support_description || '',
          });
        }
      } else if (section === 'audit') {
        const q = new URLSearchParams();
        if (selectedAuditFolder !== 'all') q.set('institution_id', selectedAuditFolder);
        if (auditModuleFilter !== 'all') q.set('module', auditModuleFilter);
        if (auditStatusFilter !== 'all') q.set('status', auditStatusFilter);
        if (auditFrom) q.set('from', auditFrom);
        if (auditTo) q.set('to', auditTo);
        if (auditSearch.trim()) q.set('search', auditSearch.trim());
        const [res, fRes] = await Promise.all([
          apiFetch(`/api/super/audit-logs?${q.toString()}`),
          apiFetch('/api/super/audit-logs/folders').catch(() => null),
        ]);
        setAuditLogs(res.logs || []);
        if (res.categories) setAuditCategories(res.categories);
        if (fRes) setAuditFolders(fRes);
      } else if (section === 'security') {
        setSecurity(await apiFetch('/api/super/security'));
      } else if (section === 'updates') {
        const res = await apiFetch('/api/super/updates');
        setUpdates(res.updates || []);
      }
    } catch (err: any) {
      toast('error', 'ডাটা লোড করা যায়নি', err.message);
    } finally {
      setLoading(false);
    }
  }, [
    instSearch,
    instStatusFilter,
    userSearch,
    userTypeFilter,
    ticketStatusFilter,
    selectedAuditFolder,
    auditModuleFilter,
    auditStatusFilter,
    auditFrom,
    auditTo,
    auditSearch,
    toast,
  ]);

  useEffect(() => {
    if (activeNav !== 'backup') {
      loadSection(activeNav);
    }
  }, [activeNav, loadSection]);

  // Add Institution (ONLY Name, Username, Password/PIN + Activate or Draft!)
  const handleCreateInstitution = async (mode: 'active' | 'draft') => {
    try {
      await apiFetch('/api/super/institutions', {
        method: 'POST',
        body: { ...newInstForm, mode },
      });
      toast(
        'success',
        mode === 'active' ? 'প্রতিষ্ঠান তৈরি ও সক্রিয় করা হয়েছে' : 'প্রতিষ্ঠান ড্রাফট হিসেবে সংরক্ষিত হয়েছে',
        `ইউজারনেম: ${newInstForm.username}`
      );
      setAddInstModal(false);
      setNewInstForm({ name: '', username: '', password: '' });
      loadSection('institutions');
    } catch (err: any) {
      toast('error', 'প্রতিষ্ঠান তৈরি ব্যর্থ', err.message);
    }
  };

  const handleUpdateInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editInst) return;
    try {
      await apiFetch(`/api/super/institutions/${editInst.id}`, {
        method: 'PUT',
        body: {
          name: editInst.name,
          address: editInst.address,
          phone: editInst.phone,
          academic_year: editInst.academic_year,
        },
      });
      toast('success', 'প্রতিষ্ঠানের তথ্য হালনাগাদ হয়েছে');
      setEditInst(null);
      loadSection('institutions');
    } catch (err: any) {
      toast('error', 'হালনাগাদ ব্যর্থ', err.message);
    }
  };

  const handleInstStatus = async (inst: any, status: string) => {
    try {
      await apiFetch(`/api/super/institutions/${inst.id}/status`, {
        method: 'PATCH',
        body: { status },
      });
      toast('success', 'স্ট্যাটাস পরিবর্তিত হয়েছে');
      loadSection('institutions');
    } catch (err: any) {
      toast('error', 'ত্রুটি', err.message);
    }
  };

  const handleDeleteInst = async (inst: any) => {
    const ok = await confirm({
      title: 'প্রতিষ্ঠান মুছে ফেলুন',
      message: `আপনি কি নিশ্চিতভাবে "${inst.name}" এবং এর সকল তথ্য স্থায়ীভাবে মুছে ফেলতে চান?`,
      confirmLabel: 'স্থায়ীভাবে মুছুন',
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/super/institutions/${inst.id}`, { method: 'DELETE' });
      toast('success', 'প্রতিষ্ঠান মুছে ফেলা হয়েছে');
      loadSection('institutions');
    } catch (err: any) {
      toast('error', 'ত্রুটি', err.message);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassTarget) return;
    try {
      const url =
        resetPassTarget.type === 'inst'
          ? `/api/super/institutions/${resetPassTarget.id}/reset-password`
          : `/api/super/users/${resetPassTarget.id}/reset-password`;
      await apiFetch(url, { method: 'POST', body: { password: resetPassVal } });
      toast('success', 'পাসওয়ার্ড/পিন সফলভাবে রিসেট করা হয়েছে');
      setResetPassTarget(null);
      setResetPassVal('');
    } catch (err: any) {
      toast('error', 'রিসেট ব্যর্থ', err.message);
    }
  };

  const handleLoginAsInstitution = async (inst: any) => {
    try {
      const data = await apiFetch(`/api/super/institutions/${inst.id}/login-as`, { method: 'POST' });
      setSession(data.token, data.user, data.institution);
      toast('info', `${inst.name} প্যানেলে প্রবেশ করা হয়েছে`);
    } catch (err: any) {
      toast('error', 'প্রবেশ করা যায়নি', err.message);
    }
  };

  const openInstLoginHistory = async (inst: any) => {
    try {
      const res = await apiFetch(`/api/super/institutions/${inst.id}/login-history`);
      setInstLoginHistory({ name: inst.name, rows: res.history || [] });
    } catch (err: any) {
      toast('error', 'ইতিহাস লোড ব্যর্থ', err.message);
    }
  };

  const openTicketDetail = async (id: number) => {
    try {
      const res = await apiFetch(`/api/super/support/${id}`);
      setActiveTicket(res);
    } catch (err: any) {
      toast('error', 'টিকেট লোড ব্যর্থ', err.message);
    }
  };

  const sendTicketReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !replyText.trim()) return;
    try {
      await apiFetch(`/api/super/support/${activeTicket.ticket.id}/reply`, {
        method: 'POST',
        body: { message: replyText.trim() },
      });
      setReplyText('');
      openTicketDetail(activeTicket.ticket.id);
      loadSection('support');
      toast('success', 'উত্তর পাঠানো হয়েছে');
    } catch (err: any) {
      toast('error', 'উত্তর পাঠানো যায়নি', err.message);
    }
  };

  const updateTicketMeta = async (id: number, patch: Record<string, string>) => {
    try {
      await apiFetch(`/api/super/support/${id}`, { method: 'PATCH', body: patch });
      openTicketDetail(id);
      loadSection('support');
      toast('success', 'টিকেট আপডেট হয়েছে');
    } catch (err: any) {
      toast('error', 'আপডেট ব্যর্থ', err.message);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const snapshot = await apiFetch('/api/super/backup/export');
      setLastBackupSummary(snapshot);
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `darul-idarah-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('success', 'ডাটাবেস ব্যাকআপ ডাউনলোড হয়েছে');
    } catch (err: any) {
      toast('error', 'ব্যাকআপ ব্যর্থ', err.message);
    }
  };

  return (
    <AppShell
      brandSubtitle="সুপার অ্যাডমিন প্ল্যাটফর্ম"
      navItems={SUPER_NAV}
      activeNav={activeNav}
      onSelectNav={setActiveNav}
    >
      {/* 1. DASHBOARD */}
      {activeNav === 'dashboard' && (
        <div className="space-y-6">
          <PageHeader
            title="প্ল্যাটফর্ম ড্যাশবোর্ড"
            subtitle="দারুল ইদারা মাল্টি-ইনস্টিটিউশন SaaS প্ল্যাটফর্মের সার্বিক পরিসংখ্যান ও অবস্থা"
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={copyInstitutionLoginUrl} className={secondaryBtnClass}>
                  <Copy className="w-4 h-4" />
                  লগইন লিংক কপি
                </button>
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={secondaryBtnClass}
                >
                  <ExternalLink className="w-4 h-4" />
                  প্রতিষ্ঠান লগইন
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setActiveNav('institutions');
                    setAddInstModal(true);
                  }}
                  className={emeraldBtnClass}
                >
                  <Plus className="w-4 h-4" />
                  নতুন প্রতিষ্ঠান যোগ করুন
                </button>
              </div>
            }
          />

          {loading || !dash ? (
            <TableSkeleton rows={4} cols={4} />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard label="মোট প্রতিষ্ঠান" value={dash.stats.totalInstitutions} tone="navy" />
                <StatCard label="সক্রিয় প্রতিষ্ঠান" value={dash.stats.activeInstitutions} tone="emerald" />
                <StatCard label="ড্রাফট / স্থগিত প্রতিষ্ঠান" value={`${dash.stats.draftInstitutions} / ${dash.stats.suspendedInstitutions}`} tone="gold" />
                <StatCard label="মোট ব্যবহারকারী" value={dash.stats.totalUsers} subtext={`সক্রিয়: ${dash.stats.activeUsers}`} tone="purple" />
                <StatCard label="মোট শিক্ষার্থী (সকল মাদ্রাসা)" value={dash.stats.totalStudents ?? 0} tone="emerald" />
                <StatCard label="মোট শিক্ষক (সকল মাদ্রাসা)" value={dash.stats.totalTeachers ?? 0} tone="navy" />
                <StatCard label="খোলা সাপোর্ট টিকেট" value={dash.stats.openSupportTickets} subtext={`অমীমাংসিত: ${dash.stats.unresolvedIssues}`} tone="gold" />
                <StatCard
                  label="সিস্টেম স্বাস্থ্য"
                  value={dash.stats.systemHealth.status}
                  subtext={`${dash.stats.systemHealth.dbEngine} · মেমোরি ${dash.stats.systemHealth.memoryMb} MB`}
                  tone="emerald"
                />
              </div>

              <div className="grid lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">সাম্প্রতিক প্রতিষ্ঠানসমূহ</h2>
                    <button
                      type="button"
                      onClick={() => setActiveNav('institutions')}
                      className="text-xs font-medium text-[#6D28D9] dark:text-violet-400 hover:underline cursor-pointer"
                    >
                      সকল প্রতিষ্ঠান দেখুন
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className={tableHeadClass}>
                        <tr>
                          <th className="px-5 py-3">প্রতিষ্ঠান</th>
                          <th className="px-4 py-3">ইউজারনেম</th>
                          <th className="px-4 py-3 text-right">শিক্ষার্থী</th>
                          <th className="px-4 py-3">অবস্থা</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {dash.recentInstitutions.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-5 py-8 text-center text-xs text-slate-500">
                              এখনও কোনো প্রতিষ্ঠান তৈরি করা হয়নি।
                            </td>
                          </tr>
                        ) : (
                          dash.recentInstitutions.map((inst: any) => (
                            <tr key={inst.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="px-5 py-3 font-medium">{inst.name}</td>
                              <td className="px-4 py-3 font-mono-num text-xs text-slate-500">@{inst.username}</td>
                              <td className="px-4 py-3 text-right font-mono-num">{inst.student_count}</td>
                              <td className="px-4 py-3"><StatusText status={inst.status} /></td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">সাম্প্রতিক অডিট কার্যক্রম</h2>
                    <button
                      type="button"
                      onClick={() => setActiveNav('audit')}
                      className="text-xs font-medium text-[#6D28D9] dark:text-violet-400 hover:underline cursor-pointer"
                    >
                      বিস্তারিত
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {dash.recentAudit.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">কোনো অডিট লগ নেই।</div>
                    ) : (
                      dash.recentAudit.map((log: any) => (
                        <div key={log.id} className="px-5 py-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">{log.action}</span>
                            <span className="font-mono-num text-slate-400">{formatDateTimeDMY(log.created_at)}</span>
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                            {log.actor_name} · {log.target_label || log.target_type}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 2. INSTITUTIONS */}
      {activeNav === 'institutions' && (
        <div className="space-y-6">
          <PageHeader
            title="প্রতিষ্ঠান ব্যবস্থাপনা"
            subtitle="নতুন মাদ্রাসা যুক্ত করুন, সক্রিয় বা ড্রাফট রাখুন, পাসওয়ার্ড রিসেট করুন অথবা প্রতিষ্ঠানে সরাসরি প্রবেশ করুন"
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={copyInstitutionLoginUrl} className={secondaryBtnClass}>
                  <Copy className="w-4 h-4" />
                  প্রতিষ্ঠান লগইন লিংক কপি
                </button>
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={secondaryBtnClass}
                >
                  <ExternalLink className="w-4 h-4" />
                  প্রতিষ্ঠান লগইন পেজ
                </a>
                <button type="button" onClick={() => setAddInstModal(true)} className={emeraldBtnClass}>
                  <Plus className="w-4 h-4" />
                  নতুন প্রতিষ্ঠান যোগ করুন
                </button>
              </div>
            }
          />

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={instSearch}
                onChange={(e) => setInstSearch(e.target.value)}
                placeholder="প্রতিষ্ঠানের নাম, কোড বা ইউজারনেম খুঁজুন..."
                className={`${inputClass} pl-10`}
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
              {[
                { id: 'all', label: 'সকল' },
                { id: 'active', label: 'সক্রিয়' },
                { id: 'draft', label: 'ড্রাফট' },
                { id: 'suspended', label: 'স্থগিত' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setInstStatusFilter(t.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    instStatusFilter === t.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : institutions.length === 0 ? (
            <EmptyState
              title="কোনো প্রতিষ্ঠান পাওয়া যায়নি"
              description="প্রথম মাদ্রাসা তৈরি করে দারুল ইদারা প্ল্যাটফর্ম চালু করুন।"
              action={
                <button type="button" onClick={() => setAddInstModal(true)} className={emeraldBtnClass}>
                  <Plus className="w-4 h-4" />
                  প্রথম প্রতিষ্ঠান যুক্ত করুন
                </button>
              }
            />
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-5 py-3">প্রতিষ্ঠানের নাম</th>
                      <th className="px-4 py-3">ইউজারনেম</th>
                      <th className="px-4 py-3 text-right">শিক্ষার্থী / শিক্ষক</th>
                      <th className="px-4 py-3">অবস্থা</th>
                      <th className="px-4 py-3">তৈরির তারিখ</th>
                      <th className="px-5 py-3 text-right">কার্যক্রম</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {institutions.map((inst) => (
                      <tr key={inst.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-slate-900 dark:text-white">{inst.name}</div>
                          <div className="text-xs text-slate-500 font-mono-num">{inst.code}</div>
                        </td>
                        <td className="px-4 py-3.5 font-mono-num text-xs text-slate-600 dark:text-slate-300">
                          @{inst.username}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono-num text-xs">
                          {inst.student_count} · {inst.teacher_count}
                        </td>
                        <td className="px-4 py-3.5"><StatusText status={inst.status} /></td>
                        <td className="px-4 py-3.5 font-mono-num text-xs text-slate-500">
                          {formatDateDMY(inst.created_at)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {inst.status === 'active' && (
                              <button
                                type="button"
                                onClick={() => handleLoginAsInstitution(inst)}
                                title="প্রতিষ্ঠান হিসেবে লগইন করুন"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#6D28D9] text-white hover:opacity-90 whitespace-nowrap cursor-pointer"
                              >
                                <LogIn className="w-3.5 h-3.5" />
                                প্রবেশ
                              </button>
                            )}
                            {inst.status !== 'active' ? (
                              <button
                                type="button"
                                onClick={() => handleInstStatus(inst, 'active')}
                                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#047857] text-white hover:opacity-90 whitespace-nowrap cursor-pointer"
                              >
                                সক্রিয় করুন
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleInstStatus(inst, 'suspended')}
                                className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 whitespace-nowrap cursor-pointer"
                              >
                                স্থগিত
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setViewInst(inst)}
                              title="বিস্তারিত দেখুন"
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditInst({ ...inst })}
                              title="সম্পাদনা"
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setResetPassTarget({ type: 'inst', id: inst.id, name: inst.name })}
                              title="পাসওয়ার্ড/পিন রিসেট"
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openInstLoginHistory(inst)}
                              title="লগইন ইতিহাস"
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteInst(inst)}
                              title="মুছে ফেলুন"
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. USERS */}
      {activeNav === 'users' && (
        <div className="space-y-6">
          <PageHeader title="প্ল্যাটফর্ম ব্যবহারকারী" subtitle="সকল প্রতিষ্ঠানের অ্যাডমিন, শিক্ষক, শিক্ষার্থী ও অভিভাবক অ্যাকাউন্ট" />
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="নাম, ইউজারনেম বা প্রতিষ্ঠান খুঁজুন..."
              className={`${inputClass} flex-1`}
            />
            <select
              value={userTypeFilter}
              onChange={(e) => setUserTypeFilter(e.target.value)}
              className={`${inputClass} sm:w-52`}
            >
              <option value="all">সকল ধরন</option>
              <option value="super_admin">সুপার অ্যাডমিন</option>
              <option value="institution_admin">প্রতিষ্ঠান অ্যাডমিন</option>
              <option value="teacher">শিক্ষক</option>
              <option value="staff">কর্মচারী</option>
              <option value="student">শিক্ষার্থী</option>
              <option value="guardian">অভিভাবক</option>
            </select>
          </div>

          {loading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-5 py-3">ব্যবহারকারী</th>
                      <th className="px-4 py-3">প্রতিষ্ঠান</th>
                      <th className="px-4 py-3">অ্যাকাউন্ট ধরন</th>
                      <th className="px-4 py-3">অবস্থা</th>
                      <th className="px-5 py-3 text-right">কার্যক্রম</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3">
                          <div className="font-medium">{u.full_name}</div>
                          <div className="text-xs font-mono-num text-slate-500">@{u.username}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">{u.institution_name || 'প্ল্যাটফর্ম'}</td>
                        <td className="px-4 py-3 text-xs">{u.role_name || u.account_type}</td>
                        <td className="px-4 py-3"><StatusText status={u.status} /></td>
                        <td className="px-5 py-3 text-right space-x-2">
                          {u.account_type !== 'super_admin' && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  const next = u.status === 'active' ? 'locked' : 'active';
                                  await apiFetch(`/api/super/users/${u.id}/status`, { method: 'PATCH', body: { status: next } });
                                  toast('success', 'অ্যাকাউন্ট স্ট্যাটাস হালনাগাদ হয়েছে');
                                  loadSection('users');
                                }}
                                className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                              >
                                {u.status === 'active' ? 'লক করুন' : 'সক্রিয় করুন'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setResetPassTarget({ type: 'user', id: u.id, name: u.username })}
                                className="text-xs font-medium text-[#6D28D9] dark:text-violet-400 hover:underline cursor-pointer"
                              >
                                পাসওয়ার্ড রিসেট
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. ROLES */}
      {activeNav === 'roles' && (
        <div className="space-y-6">
          <PageHeader title="রোল ও পারমিশন ম্যাট্রিক্স" subtitle="সকল প্রতিষ্ঠানে কনফিগারকৃত ভূমিকা ও অনুমতিসমূহের সারসংক্ষেপ" />
          {loading ? (
            <TableSkeleton rows={6} cols={4} />
          ) : roles.length === 0 ? (
            <EmptyState title="কোনো রোল পাওয়া যায়নি" description="নতুন প্রতিষ্ঠান যুক্ত করলে স্বয়ংক্রিয়ভাবে ৮টি মৌলিক মাদ্রাসা রোল তৈরি হবে।" />
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-5 py-3">প্রতিষ্ঠান</th>
                      <th className="px-4 py-3">ভূমিকা (Role)</th>
                      <th className="px-4 py-3">বিবরণ</th>
                      <th className="px-4 py-3">অনুমোদিত মডিউল</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {roles.map((r) => (
                      <tr key={r.id}>
                        <td className="px-5 py-3 text-xs font-medium">{r.institution_name || 'প্ল্যাটফর্ম'}</td>
                        <td className="px-4 py-3 font-semibold">{r.name}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{r.description}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                          {Object.keys(r.permissions || {}).join(' · ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. SUPPORT CENTER */}
      {activeNav === 'support' && (
        <div className="space-y-6">
          <PageHeader
            title="সাপোর্ট সেন্টার"
            subtitle="প্রতিষ্ঠান ও ব্যবহারকারীদের সমস্যা পর্যবেক্ষণ, উত্তর প্রদান এবং সমাধান পরিচালনা"
          />
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit flex-wrap">
            {[
              { id: 'all', label: 'সকল' },
              { id: 'open', label: 'খোলা' },
              { id: 'in_progress', label: 'চলমান' },
              { id: 'waiting_for_user', label: 'অপেক্ষমাণ' },
              { id: 'resolved', label: 'সমাধানকৃত' },
              { id: 'closed', label: 'বন্ধ' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setTicketStatusFilter(s.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  ticketStatusFilter === s.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-2.5">
              {tickets.length === 0 ? (
                <EmptyState title="কোনো সাপোর্ট টিকেট নেই" description="প্রতিষ্ঠানসমূহ টিকেট জমা দিলে এখানে প্রদর্শিত হবে।" />
              ) : (
                tickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTicketDetail(t.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                      activeTicket?.ticket.id === t.id
                        ? 'bg-violet-50/60 dark:bg-violet-950/30 border-[#6D28D9]'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono-num font-semibold text-[#6D28D9]">{t.ticket_code}</span>
                      <StatusText status={t.status} />
                    </div>
                    <div className="font-semibold text-sm mt-1 text-slate-900 dark:text-white">{t.subject}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {t.institution_name || 'অজানা'} · {t.category} · অগ্রাধিকার: {t.priority}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="lg:col-span-7">
              {activeTicket ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <div className="text-xs font-mono-num text-[#6D28D9]">{activeTicket.ticket.ticket_code}</div>
                      <h3 className="text-lg font-bold mt-0.5">{activeTicket.ticket.subject}</h3>
                      <div className="text-xs text-slate-500 mt-1">
                        {activeTicket.ticket.institution_name} · {activeTicket.ticket.created_by_name} · {formatDateTimeDMY(activeTicket.ticket.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={activeTicket.ticket.status}
                        onChange={(e) => updateTicketMeta(activeTicket.ticket.id, { status: e.target.value })}
                        className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        <option value="open">খোলা (Open)</option>
                        <option value="in_progress">চলমান (In Progress)</option>
                        <option value="waiting_for_user">ব্যবহারকারীর অপেক্ষায়</option>
                        <option value="resolved">সমাধানকৃত (Resolved)</option>
                        <option value="closed">বন্ধ (Closed)</option>
                      </select>
                      <input
                        type="text"
                        defaultValue={activeTicket.ticket.assigned_to || ''}
                        placeholder="দায়িত্বপ্রাপ্ত স্টাফ"
                        onBlur={(e) => updateTicketMeta(activeTicket.ticket.id, { assigned_to: e.target.value })}
                        className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 w-36"
                      />
                    </div>
                  </div>

                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg">
                    {activeTicket.ticket.description}
                  </p>

                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {activeTicket.replies.map((r) => (
                      <div key={r.id} className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                        <div className="flex items-center justify-between text-slate-500">
                          <strong className="text-slate-900 dark:text-white">{r.author_name} ({r.author_role})</strong>
                          <span className="font-mono-num">{formatDateTimeDMY(r.created_at)}</span>
                        </div>
                        <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{r.message}</p>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={sendTicketReply} className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <textarea
                      rows={3}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="সাপোর্ট উত্তর লিখুন..."
                      className={inputClass}
                    />
                    <button type="submit" className={primaryBtnClass}>উত্তর পাঠান</button>
                  </form>
                </div>
              ) : (
                <EmptyState title="একটি টিকেট নির্বাচন করুন" description="বাম তালিকা থেকে যেকোনো টিকেটে ক্লিক করে উত্তর ও অবস্থা পরিচালনা করুন।" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. REPORTS */}
      {activeNav === 'reports' && (
        <div className="space-y-6">
          <PageHeader
            title="প্ল্যাটফর্ম রিপোর্ট"
            subtitle="প্রতিষ্ঠানভিত্তিক শিক্ষার্থী, শিক্ষক এবং আর্থিক সারসংক্ষেপ"
            actions={
              reportData?.institutionBreakdown?.length > 0 && (
                <button
                  type="button"
                  onClick={() => exportRowsToCsv('darul-idarah-platform-report.csv', reportData.institutionBreakdown)}
                  className={secondaryBtnClass}
                >
                  <Download className="w-4 h-4" />
                  CSV এক্সপোর্ট
                </button>
              )
            }
          />
          {reportData && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-5 py-3">প্রতিষ্ঠান</th>
                      <th className="px-4 py-3">অবস্থা</th>
                      <th className="px-4 py-3 text-right">সক্রিয় শিক্ষার্থী</th>
                      <th className="px-4 py-3 text-right">সক্রিয় শিক্ষক</th>
                      <th className="px-4 py-3 text-right">মোট আয়</th>
                      <th className="px-5 py-3 text-right">মোট ব্যয়</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {reportData.institutionBreakdown.map((row: any) => (
                      <tr key={row.id}>
                        <td className="px-5 py-3 font-medium">{row.name}</td>
                        <td className="px-4 py-3"><StatusText status={row.status} /></td>
                        <td className="px-4 py-3 text-right font-mono-num">{row.active_students}</td>
                        <td className="px-4 py-3 text-right font-mono-num">{row.active_teachers}</td>
                        <td className="px-4 py-3 text-right font-mono-num text-[#047857]">{formatBDT(row.total_income)}</td>
                        <td className="px-5 py-3 text-right font-mono-num text-red-600">{formatBDT(row.total_expense)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. NOTIFICATIONS */}
      {activeNav === 'notifications' && (
        <div className="space-y-6">
          <PageHeader title="প্ল্যাটফর্ম নোটিফিকেশন" subtitle="সকল প্রতিষ্ঠানে তাৎক্ষণিক রিয়েল-টাইম বিজ্ঞপ্তি প্রেরণ করুন" />
          <div className="grid lg:grid-cols-12 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiFetch('/api/super/notifications', { method: 'POST', body: notifForm });
                  toast('success', 'নোটিফিকেশন তাৎক্ষণিকভাবে সম্প্রচার করা হয়েছে');
                  setNotifForm({ title: '', description: '', audience_type: 'institutions' });
                  loadSection('notifications');
                } catch (err: any) {
                  toast('error', 'প্রেরণ ব্যর্থ', err.message);
                }
              }}
              className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 h-fit"
            >
              <h3 className="text-sm font-semibold">নতুন ঘোষণা পাঠান</h3>
              <div>
                <label className={labelClass}>শিরোনাম</label>
                <input
                  required
                  value={notifForm.title}
                  onChange={(e) => setNotifForm({ ...notifForm, title: e.target.value })}
                  className={inputClass}
                  placeholder="যেমন: সিস্টেম রক্ষণাবেক্ষণ বিজ্ঞপ্তি"
                />
              </div>
              <div>
                <label className={labelClass}>লক্ষ্যবস্তু</label>
                <select
                  value={notifForm.audience_type}
                  onChange={(e) => setNotifForm({ ...notifForm, audience_type: e.target.value })}
                  className={inputClass}
                >
                  <option value="institutions">সকল প্রতিষ্ঠান</option>
                  <option value="all">সকল ব্যবহারকারী</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>বিবরণ</label>
                <textarea
                  required
                  rows={4}
                  value={notifForm.description}
                  onChange={(e) => setNotifForm({ ...notifForm, description: e.target.value })}
                  className={inputClass}
                />
              </div>
              <button type="submit" className={primaryBtnClass}>তাৎক্ষণিক পাঠান</button>
            </form>

            <div className="lg:col-span-7 space-y-3">
              {notifications.length === 0 ? (
                <EmptyState title="কোনো প্ল্যাটফর্ম বিজ্ঞপ্তি নেই" />
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-semibold text-sm">{n.title}</h4>
                      <span className="text-xs font-mono-num text-slate-400">{formatDateDMY(n.publish_date)}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">{n.description}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 8. SYSTEM SETTINGS */}
      {activeNav === 'settings' && (
        <div className="space-y-6">
          <PageHeader title="সিস্টেম সেটিংস ও অ্যাপ্লিকেশন ব্র্যান্ডিং" subtitle="অ্যাপ্লিকেশনের মূল লোগো, নিরাপত্তা নীতিমালা, সেশন সময়সীমা এবং প্ল্যাটফর্ম কনফিগারেশন" />

          {/* Application Branding (Global Logo Management — 20 MB policy) */}
          <div className="max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold">Application Branding (অ্যাপ্লিকেশন লোগো)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                এখান থেকে সম্পূর্ণ অ্যাপ্লিকেশনের মূল লোগো পরিবর্তন করুন (লগইন পেজ, ড্যাশবোর্ড, সাইডবার, ফেভিকন ও রসিদে প্রদর্শিত হবে)।
              </p>
            </div>
            <FileUploadField
              category="logo"
              module="branding"
              buttonLabel={brandingForm.logo_url ? 'নতুন লোগো পরিবর্তন করুন' : 'নতুন লোগো আপলোড করুন'}
              valueUrl={brandingForm.logo_url}
              valueName={brandingForm.logo_filename}
              previewFallbackUrl="/src/assets/images/darul_idarah_emblem_1795577863106.jpg"
              showImagePreview
              previewClassName="w-20 h-20 rounded-xl object-contain bg-slate-50 dark:bg-slate-800 p-1.5 border border-slate-200 dark:border-slate-700"
              onUploaded={(res) =>
                setBrandingForm((f) => ({ ...f, logo_url: res.url, logo_filename: res.original_name }))
              }
              onClear={
                brandingForm.logo_url
                  ? () => setBrandingForm((f) => ({ ...f, logo_url: '', logo_filename: '' }))
                  : undefined
              }
              onError={(msg) => toast('error', 'লোগো আপলোড ব্যর্থ', msg)}
            />
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                disabled={savingBranding}
                onClick={async () => {
                  setSavingBranding(true);
                  try {
                    await apiFetch('/api/super/branding', {
                      method: 'PUT',
                      body: {
                        app_name: brandingForm.app_name,
                        logo_url: brandingForm.logo_url,
                        logo_filename: brandingForm.logo_filename,
                      },
                    });
                    await refreshBranding();
                    toast('success', 'অ্যাপ্লিকেশন লোগো সফলভাবে সংরক্ষিত হয়েছে');
                  } catch (err: any) {
                    toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
                  } finally {
                    setSavingBranding(false);
                  }
                }}
                className={primaryBtnClass}
              >
                {savingBranding ? 'সংরক্ষণ হচ্ছে...' : 'লোগো সংরক্ষণ করুন'}
              </button>
              {brandingForm.logo_url && (
                <button
                  type="button"
                  disabled={savingBranding}
                  onClick={async () => {
                    setSavingBranding(true);
                    try {
                      await apiFetch('/api/super/branding', { method: 'DELETE' });
                      setBrandingForm((f) => ({ ...f, logo_url: '', logo_filename: '' }));
                      await refreshBranding();
                      toast('success', 'কাস্টম লোগো সরিয়ে ডিফল্ট লোগো চালু করা হয়েছে');
                    } catch (err: any) {
                      toast('error', 'অপসারণ ব্যর্থ', err.message);
                    } finally {
                      setSavingBranding(false);
                    }
                  }}
                  className={secondaryBtnClass}
                >
                  ডিফল্ট লোগো ফিরিয়ে আনুন
                </button>
              )}
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch('/api/super/settings', { method: 'PUT', body: { settings: sysSettings } });
                toast('success', 'সিস্টেম সেটিংস সংরক্ষিত হয়েছে');
              } catch (err: any) {
                toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
              }
            }}
            className="max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <div>
              <label className={labelClass}>প্ল্যাটফর্মের নাম</label>
              <input
                value={sysSettings.platform_name || ''}
                onChange={(e) => setSysSettings({ ...sysSettings, platform_name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>সর্বোচ্চ ভুল লগইন চেষ্টা</label>
                <input
                  type="number"
                  min={3}
                  max={20}
                  value={sysSettings.max_failed_logins ?? 5}
                  onChange={(e) => setSysSettings({ ...sysSettings, max_failed_logins: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>লকআউট সময় (মিনিট)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={sysSettings.lockout_minutes ?? 15}
                  onChange={(e) => setSysSettings({ ...sysSettings, lockout_minutes: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>সেশন মেয়াদ (ঘণ্টা)</label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={sysSettings.session_ttl_hours ?? 24}
                  onChange={(e) => setSysSettings({ ...sysSettings, session_ttl_hours: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="text-xs text-slate-500">
              টাইমজোন: <strong className="font-mono-num">Asia/Dhaka</strong> · মুদ্রা: <strong>বাংলাদেশী টাকা (৳)</strong>
            </div>
            <button type="submit" className={primaryBtnClass}>সেটিংস সংরক্ষণ করুন</button>
          </form>

          {/* Global Support & Contact Settings (WhatsApp & Facebook) */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSavingSupport(true);
              try {
                await apiFetch('/api/super/support-settings', { method: 'PUT', body: supportForm });
                await refreshBranding();
                toast('success', 'গ্লোবাল সাপোর্ট ও যোগাযোগ সেটিংস সংরক্ষিত হয়েছে');
              } catch (err: any) {
                toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
              } finally {
                setSavingSupport(false);
              }
            }}
            className="max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                গ্লোবাল সাপোর্ট ও যোগাযোগ (WhatsApp & Facebook)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                লগইন পেজ, হেল্প সেন্টার এবং যেসব মাদ্রাসার নিজস্ব সাপোর্ট নম্বর নেই সেখানে এই যোগাযোগ তথ্য প্রদর্শিত হবে।
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>গ্লোবাল হোয়াটসঅ্যাপ নম্বর</label>
                <input
                  value={supportForm.whatsapp_number}
                  onChange={(e) => setSupportForm({ ...supportForm, whatsapp_number: e.target.value })}
                  placeholder="+8801XXXXXXXXX"
                  className={`${inputClass} font-mono-num`}
                />
                <label className="mt-2 inline-flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={supportForm.whatsapp_enabled}
                    onChange={(e) => setSupportForm({ ...supportForm, whatsapp_enabled: e.target.checked })}
                    className="accent-[#047857]"
                  />
                  WhatsApp সাপোর্ট সক্রিয় রাখুন
                </label>
              </div>
              <div>
                <label className={labelClass}>গ্লোবাল ফেসবুক পেজ / লিংক</label>
                <input
                  value={supportForm.facebook_url}
                  onChange={(e) => setSupportForm({ ...supportForm, facebook_url: e.target.value })}
                  placeholder="https://facebook.com/darulidarah"
                  className={inputClass}
                />
                <label className="mt-2 inline-flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={supportForm.facebook_enabled}
                    onChange={(e) => setSupportForm({ ...supportForm, facebook_enabled: e.target.checked })}
                    className="accent-[#6D28D9]"
                  />
                  Facebook সাপোর্ট সক্রিয় রাখুন
                </label>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>সাপোর্ট ইমেইল</label>
                <input
                  type="email"
                  value={supportForm.support_email}
                  onChange={(e) => setSupportForm({ ...supportForm, support_email: e.target.value })}
                  placeholder="support@darulidarah.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>সাপোর্ট বিবরণ / সময়সূচি</label>
                <input
                  value={supportForm.support_description}
                  onChange={(e) => setSupportForm({ ...supportForm, support_description: e.target.value })}
                  placeholder="সকাল ৯টা – রাত ১০টা (সপ্তাহে ৭ দিন)"
                  className={inputClass}
                />
              </div>
            </div>
            <button type="submit" disabled={savingSupport} className={emeraldBtnClass}>
              {savingSupport ? 'সংরক্ষণ হচ্ছে...' : 'গ্লোবাল সাপোর্ট সেটিংস সংরক্ষণ করুন'}
            </button>
          </form>
        </div>
      )}

      {/* 9. AUDIT LOGS (WITH INSTITUTION AUDIT LOG FOLDER STRUCTURE) */}
      {activeNav === 'audit' && (
        <div className="space-y-6">
          <PageHeader
            title="অডিট লগ ও প্রতিষ্ঠান ফোল্ডার"
            subtitle="প্রতিটি প্রতিষ্ঠানের জন্য পৃথক ফোল্ডারে অপরিবর্তনীয় (Append-Only) নিরাপত্তা ও কার্যক্রম লগ"
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() =>
                    exportRowsToCsv(
                      `darul-idarah-audit-logs-${selectedAuditFolder}.csv`,
                      auditLogs.map((l) => ({
                        time: formatDateTimeDMY(l.created_at),
                        actor: l.actor_name,
                        role: l.actor_role || '',
                        module: l.module || '',
                        action: l.action,
                        institution: l.institution_name || 'প্ল্যাটফর্ম সিস্টেম',
                        target: l.target_label || l.target_type || '',
                        description: l.description || '',
                        result: l.result || 'success',
                      }))
                    )
                  }
                  className={secondaryBtnClass}
                >
                  <Download className="w-4 h-4" />
                  CSV এক্সপোর্ট
                </button>
                <button type="button" onClick={() => window.print()} className={primaryBtnClass}>
                  <Printer className="w-4 h-4" />
                  প্রিন্ট / PDF
                </button>
              </div>
            }
          />

          <div className="grid lg:grid-cols-12 gap-6">
            {/* Institution Folder Tree */}
            <div className="lg:col-span-3 space-y-2 no-print">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-1">
                <div className="px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  অডিট ফোল্ডারসমূহ
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAuditFolder('all')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium cursor-pointer ${
                    selectedAuditFolder === 'all'
                      ? 'bg-violet-50 dark:bg-violet-950/40 text-[#6D28D9] dark:text-violet-300'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 truncate">
                    <Folder className="w-4 h-4 shrink-0" />
                    সকল অডিট লগ
                  </span>
                  <span className="font-mono-num text-[11px]">{auditFolders.total_logs ?? auditLogs.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAuditFolder('system')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium cursor-pointer ${
                    selectedAuditFolder === 'system'
                      ? 'bg-violet-50 dark:bg-violet-950/40 text-[#6D28D9] dark:text-violet-300'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 truncate">
                    <Shield className="w-4 h-4 shrink-0" />
                    প্ল্যাটফর্ম / সুপার অ্যাডমিন
                  </span>
                  <span className="font-mono-num text-[11px]">{auditFolders.system_logs_count ?? 0}</span>
                </button>
                {(auditFolders.folders || []).length > 0 && (
                  <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 max-h-[420px] overflow-y-auto">
                    <div className="px-2 py-1 text-[11px] font-semibold text-slate-400">প্রতিষ্ঠানভিত্তিক ফোল্ডার</div>
                    {(auditFolders.folders || []).map((f: any) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setSelectedAuditFolder(String(f.id))}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs text-left cursor-pointer ${
                          selectedAuditFolder === String(f.id)
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[#047857] dark:text-emerald-300 font-semibold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <Folder className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{f.name}</span>
                        </span>
                        <span className="font-mono-num text-[11px] shrink-0">{f.log_count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Filters + Audit Table */}
            <div className="lg:col-span-9 space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 grid sm:grid-cols-2 lg:grid-cols-5 gap-2.5 no-print">
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="কার্যক্রম, অ্যাডমিন বা বিবরণ খুঁজুন..."
                  className={`${inputClass} lg:col-span-2`}
                />
                <select value={auditModuleFilter} onChange={(e) => setAuditModuleFilter(e.target.value)} className={inputClass}>
                  <option value="all">সকল মডিউল</option>
                  {auditCategories.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name_bn}
                    </option>
                  ))}
                </select>
                <select value={auditStatusFilter} onChange={(e) => setAuditStatusFilter(e.target.value)} className={inputClass}>
                  <option value="all">সকল অবস্থা</option>
                  <option value="success">সফল</option>
                  <option value="failure">ব্যর্থ</option>
                </select>
                <div className="grid grid-cols-2 gap-1">
                  <input type="date" value={auditFrom} onChange={(e) => setAuditFrom(e.target.value)} className={inputClass} />
                  <input type="date" value={auditTo} onChange={(e) => setAuditTo(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className={tableHeadClass}>
                      <tr>
                        <th className="px-4 py-3">সময়</th>
                        <th className="px-4 py-3">ব্যবহারকারী</th>
                        <th className="px-4 py-3">মডিউল ও অ্যাকশন</th>
                        <th className="px-4 py-3">লক্ষ্য ও বিবরণ</th>
                        <th className="px-4 py-3">প্রতিষ্ঠান</th>
                        <th className="px-4 py-3">ফলাফল</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                            এই ফোল্ডারে বা ফিল্টারে কোনো অডিট লগ পাওয়া যায়নি।
                          </td>
                        </tr>
                      ) : (
                        auditLogs.map((l) => (
                          <tr key={l.id} className={l.action === 'LOGIN_AS_INSTITUTION' ? 'bg-violet-50/40 dark:bg-violet-950/20' : ''}>
                            <td className="px-4 py-3 font-mono-num text-xs text-slate-500 whitespace-nowrap">{formatDateTimeDMY(l.created_at)}</td>
                            <td className="px-4 py-3 text-xs">
                              <div className="font-medium">{l.actor_name}</div>
                              {l.actor_role && <div className="text-[11px] text-slate-500">{l.actor_role}</div>}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <div className="font-mono-num font-semibold text-[#6D28D9] dark:text-violet-400">{l.action}</div>
                              <div className="text-[11px] text-slate-500">{l.module || l.category_code || 'administration'}</div>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <div>{l.description || l.target_label || l.target_type}</div>
                            </td>
                            <td className="px-4 py-3 text-xs">{l.institution_name || 'প্ল্যাটফর্ম'}</td>
                            <td className={`px-4 py-3 text-xs font-semibold ${l.result === 'failure' ? 'text-red-600' : 'text-[#047857]'}`}>
                              {l.result === 'failure' ? 'ব্যর্থ' : 'সফল'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 10. SECURITY */}
      {activeNav === 'security' && (
        <div className="space-y-6">
          <PageHeader
            title="নিরাপত্তা কেন্দ্র"
            subtitle="সক্রিয় সেশন, ব্যর্থ লগইন চেষ্টা, সন্দেহজনক কার্যক্রম এবং তাৎক্ষণিক ফোর্স লগআউট"
            actions={
              <button type="button" onClick={() => loadSection('security')} className={secondaryBtnClass}>
                <RefreshCw className="w-4 h-4" />
                রিফ্রেশ
              </button>
            }
          />
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit flex-wrap">
            {[
              { id: 'sessions', label: `সক্রিয় সেশন (${security?.activeSessions?.length || 0})` },
              { id: 'history', label: 'লগইন ইতিহাস' },
              { id: 'failed', label: `ব্যর্থ চেষ্টা (${security?.failedAttempts?.length || 0})` },
              { id: 'suspicious', label: `সন্দেহজনক (${security?.suspiciousActivity?.length || 0})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSecTab(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  secTab === tab.id ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {security && secTab === 'sessions' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-5 py-3">ব্যবহারকারী</th>
                      <th className="px-4 py-3">প্রতিষ্ঠান</th>
                      <th className="px-4 py-3">IP ঠিকানা</th>
                      <th className="px-4 py-3">সর্বশেষ সক্রিয়</th>
                      <th className="px-5 py-3 text-right">কার্যক্রম</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {security.activeSessions.map((s: any) => (
                      <tr key={s.token}>
                        <td className="px-5 py-3">
                          <div className="font-medium">{s.full_name}</div>
                          <div className="text-xs font-mono-num text-slate-500">@{s.username} · {s.account_type}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">{s.institution_name || 'প্ল্যাটফর্ম'}</td>
                        <td className="px-4 py-3 font-mono-num text-xs">{s.ip_address || '—'}</td>
                        <td className="px-4 py-3 font-mono-num text-xs text-slate-500">{formatDateTimeDMY(s.last_active_at)}</td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiFetch('/api/super/security/force-logout', { method: 'POST', body: { token: s.token } });
                                toast('success', 'সেশনটি ফোর্স লগআউট করা হয়েছে');
                                loadSection('security');
                              } catch (err: any) {
                                toast('error', 'ব্যর্থ', err.message);
                              }
                            }}
                            className="text-xs font-semibold text-red-600 hover:underline cursor-pointer"
                          >
                            ফোর্স লগআউট
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {security && secTab !== 'sessions' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-5 py-3">সময়</th>
                      <th className="px-4 py-3">ইউজারনেম</th>
                      <th className="px-4 py-3">প্রতিষ্ঠান</th>
                      <th className="px-4 py-3">কারণ</th>
                      <th className="px-5 py-3">ফলাফল</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(secTab === 'history'
                      ? security.loginHistory
                      : secTab === 'failed'
                      ? security.failedAttempts
                      : security.suspiciousActivity
                    ).map((h: any) => (
                      <tr key={h.id}>
                        <td className="px-5 py-3 font-mono-num text-xs text-slate-500">{formatDateTimeDMY(h.created_at)}</td>
                        <td className="px-4 py-3 font-mono-num text-xs font-medium">@{h.username}</td>
                        <td className="px-4 py-3 text-xs">{h.institution_name || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{h.reason}</td>
                        <td className="px-5 py-3 text-xs font-semibold">
                          {h.success ? <span className="text-[#047857]">সফল</span> : <span className="text-red-600">ব্যর্থ</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 11. APP UPDATES */}
      {activeNav === 'updates' && (
        <div className="space-y-6">
          <PageHeader title="অ্যাপ আপডেট ও রিলিজ নোট" subtitle="প্ল্যাটফর্মের ভার্সন ও নতুন সুবিধাসমূহ প্রকাশ করুন" />
          <div className="grid lg:grid-cols-12 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiFetch('/api/super/updates', { method: 'POST', body: updateForm });
                  toast('success', 'নতুন আপডেট প্রকাশিত হয়েছে');
                  setUpdateForm({ version: '', title: '', notes: '' });
                  loadSection('updates');
                } catch (err: any) {
                  toast('error', 'ত্রুটি', err.message);
                }
              }}
              className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 h-fit"
            >
              <h3 className="text-sm font-semibold">নতুন আপডেট প্রকাশ</h3>
              <div>
                <label className={labelClass}>ভার্সন</label>
                <input required value={updateForm.version} onChange={(e) => setUpdateForm({ ...updateForm, version: e.target.value })} placeholder="যেমন: 1.1.0" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>শিরোনাম</label>
                <input required value={updateForm.title} onChange={(e) => setUpdateForm({ ...updateForm, title: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>পরিবর্তনের বিবরণ</label>
                <textarea rows={4} value={updateForm.notes} onChange={(e) => setUpdateForm({ ...updateForm, notes: e.target.value })} className={inputClass} />
              </div>
              <button type="submit" className={primaryBtnClass}>প্রকাশ করুন</button>
            </form>
            <div className="lg:col-span-7 space-y-3">
              {updates.map((u) => (
                <div key={u.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono-num font-bold text-[#6D28D9]">v{u.version}</span>
                    <span className="font-mono-num text-slate-400">{formatDateDMY(u.released_at)}</span>
                  </div>
                  <div className="font-semibold text-sm mt-1">{u.title}</div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{u.notes}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 12. BACKUP & RECOVERY */}
      {activeNav === 'backup' && (
        <div className="space-y-6">
          <PageHeader title="ব্যাকআপ ও রিকভারি" subtitle="সম্পূর্ণ ডাটাবেস স্ন্যাপশট JSON ফরম্যাটে ডাউনলোড অথবা Firebase Firestore ক্লাউডে সংরক্ষণ করুন" />
          <div className="max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold">পূর্ণাঙ্গ প্ল্যাটফর্ম ব্যাকআপ এক্সপোর্ট</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              সকল প্রতিষ্ঠান, শিক্ষার্থী, শিক্ষক, পরীক্ষা, হিসাব, দারুল ইকামা এবং লাইব্রেরি টেবিলের বর্তমান রেকর্ড একটি সুরক্ষিত JSON ফাইলে ডাউনলোড হবে।
            </p>
            <button type="button" onClick={handleDownloadBackup} className={emeraldBtnClass}>
              <Download className="w-4 h-4" />
              ডাটাবেস ব্যাকআপ ডাউনলোড করুন
            </button>
            {lastBackupSummary && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold mb-2">
                  সর্বশেষ ব্যাকআপ ({formatDateTimeDMY(lastBackupSummary.exportedAt)}):
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono-num">
                  {Object.entries(lastBackupSummary.counts || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between p-2 rounded bg-slate-50 dark:bg-slate-800">
                      <span className="truncate text-slate-500">{k}</span>
                      <span className="font-semibold">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <FirebaseCloudPanel mode="super_backup" />
        </div>
      )}

      {/* MODALS */}
      {/* Add Institution Modal — STRICTLY ONLY 3 FIELDS: Institution Name, Username, Password/PIN */}
      <Modal
        open={addInstModal}
        onClose={() => setAddInstModal(false)}
        title="নতুন প্রতিষ্ঠান যুক্ত করুন"
        subtitle="প্রতিষ্ঠানের নাম, ইউজারনেম এবং পাসওয়ার্ড/পিন দিন। কোনো অতিরিক্ত বাধ্যতামূলক ফিল্ড নেই।"
      >
        <div className="space-y-4">
          <div>
            <label className={labelClass}>প্রতিষ্ঠানের নাম (Institution Name) *</label>
            <input
              type="text"
              value={newInstForm.name}
              onChange={(e) => setNewInstForm({ ...newInstForm, name: e.target.value })}
              placeholder="যেমন: জামিয়া ইসলামিয়া দারুল উলুম"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>ইউজারনেম (Unique Username) *</label>
            <input
              type="text"
              value={newInstForm.username}
              onChange={(e) => setNewInstForm({ ...newInstForm, username: e.target.value })}
              placeholder="যেমন: jamia_darul_ulum"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>পাসওয়ার্ড / পিন (৪, ৬, ৮ বা ততোধিক অক্ষর) *</label>
            <input
              type="password"
              value={newInstForm.password}
              onChange={(e) => setNewInstForm({ ...newInstForm, password: e.target.value })}
              placeholder="কমপক্ষে ৪ অঙ্কের পিন বা পাসওয়ার্ড"
              className={inputClass}
              required
            />
          </div>
          <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => handleCreateInstitution('draft')}
              className={secondaryBtnClass}
            >
              ড্রাফট হিসেবে সংরক্ষণ (Save as Draft)
            </button>
            <button
              type="button"
              onClick={() => handleCreateInstitution('active')}
              className={emeraldBtnClass}
            >
              তৈরি ও সক্রিয় করুন (Create & Activate)
            </button>
          </div>
        </div>
      </Modal>

      {/* View Institution Modal */}
      <Modal open={Boolean(viewInst)} onClose={() => setViewInst(null)} title={viewInst?.name || ''}>
        {viewInst && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="text-slate-500">প্রতিষ্ঠান কোড</div>
                <div className="font-mono-num font-semibold mt-0.5">{viewInst.code}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="text-slate-500">ইউজারনেম</div>
                <div className="font-mono-num font-semibold mt-0.5">@{viewInst.username}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="text-slate-500">অবস্থা</div>
                <div className="mt-0.5"><StatusText status={viewInst.status} /></div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="text-slate-500">শিক্ষার্থী / শিক্ষক</div>
                <div className="font-mono-num font-semibold mt-0.5">
                  {viewInst.student_count} জন · {viewInst.teacher_count} জন
                </div>
              </div>
            </div>
            {viewInst.address && <div className="text-xs text-slate-600 dark:text-slate-400">ঠিকানা: {viewInst.address}</div>}
            {viewInst.phone && <div className="text-xs text-slate-600 dark:text-slate-400">ফোন: {viewInst.phone}</div>}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                প্রতিষ্ঠান ব্যবহারকারী লগইন লিংক (Institution User Login)
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <code className="text-xs font-mono-num text-[#6D28D9] dark:text-violet-300 break-all">
                  {institutionLoginUrl}
                </code>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={copyInstitutionLoginUrl}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" /> কপি
                  </button>
                  <a
                    href="/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-[#047857] text-white hover:opacity-90"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> খুলুন
                  </a>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                মাদ্রাসার মূল অ্যাকাউন্ট, মুহতামিম, নাজেম, শিক্ষক, কর্মচারী, শিক্ষার্থী ও অভিভাবক — সবাই এই একক লিংকে লগইন করবেন।
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Institution Modal */}
      <Modal open={Boolean(editInst)} onClose={() => setEditInst(null)} title="প্রতিষ্ঠানের তথ্য সম্পাদনা">
        {editInst && (
          <form onSubmit={handleUpdateInstitution} className="space-y-4">
            <div>
              <label className={labelClass}>প্রতিষ্ঠানের নাম</label>
              <input value={editInst.name} onChange={(e) => setEditInst({ ...editInst, name: e.target.value })} className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>ঠিকানা</label>
              <input value={editInst.address || ''} onChange={(e) => setEditInst({ ...editInst, address: e.target.value })} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>ফোন</label>
                <input value={editInst.phone || ''} onChange={(e) => setEditInst({ ...editInst, phone: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>শিক্ষাবর্ষ</label>
                <input value={editInst.academic_year || ''} onChange={(e) => setEditInst({ ...editInst, academic_year: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditInst(null)} className={secondaryBtnClass}>বাতিল</button>
              <button type="submit" className={primaryBtnClass}>সংরক্ষণ করুন</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        open={Boolean(resetPassTarget)}
        onClose={() => {
          setResetPassTarget(null);
          setResetPassVal('');
        }}
        title="পাসওয়ার্ড / পিন রিসেট"
        subtitle={resetPassTarget?.name}
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <label className={labelClass}>নতুন পাসওয়ার্ড / পিন (কমপক্ষে ৪ অক্ষর)</label>
            <input
              type="password"
              required
              minLength={4}
              value={resetPassVal}
              onChange={(e) => setResetPassVal(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setResetPassTarget(null)} className={secondaryBtnClass}>বাতিল</button>
            <button type="submit" className={primaryBtnClass}>রিসেট করুন</button>
          </div>
        </form>
      </Modal>

      {/* Institution Login History Modal */}
      <Modal
        open={Boolean(instLoginHistory)}
        onClose={() => setInstLoginHistory(null)}
        title={`লগইন ইতিহাস — ${instLoginHistory?.name || ''}`}
        maxWidth="max-w-2xl"
      >
        {instLoginHistory && (
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {instLoginHistory.rows.length === 0 ? (
              <div className="py-8 text-center text-slate-500">কোনো লগইন ইতিহাস নেই।</div>
            ) : (
              instLoginHistory.rows.map((h) => (
                <div key={h.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-mono-num font-semibold">@{h.username}</span> ·{' '}
                    <span className="text-slate-500">{h.reason}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono-num text-slate-400">{formatDateTimeDMY(h.created_at)}</span>
                    <span className={h.success ? 'text-[#047857] font-semibold' : 'text-red-600 font-semibold'}>
                      {h.success ? 'সফল' : 'ব্যর্থ'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
