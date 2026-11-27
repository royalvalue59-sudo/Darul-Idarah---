import React, { useState } from 'react';
import {
  Archive,
  Building2,
  CheckCircle2,
  Cloud,
  CloudUpload,
  LogOut,
  Megaphone,
  Plus,
  RefreshCw,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { useFirebase, type CloudNoteRecord } from '../../context/FirebaseContext';
import { useApp } from '../../context/AppContext';
import { apiFetch, formatBDT, formatDateTimeDMY } from '../../lib/api';
import {
  emeraldBtnClass,
  EmptyState,
  inputClass,
  labelClass,
  primaryBtnClass,
  secondaryBtnClass,
} from '../ui/Primitives';

export function FirebaseCloudPanel({ mode = 'workspace' }: { mode?: 'super_backup' | 'workspace' }) {
  const { user, institution, toast, confirm } = useApp();
  const {
    firebaseUser,
    authReady,
    profileReady,
    firestoreStatus,
    isFirebaseAdmin,
    cloudInstitutions,
    cloudBackups,
    cloudNotes,
    cloudAnnouncements,
    signInWithGoogle,
    signOutFirebase,
    syncInstitutionToCloud,
    deleteCloudInstitution,
    createCloudBackup,
    archiveCloudBackup,
    deleteCloudBackup,
    createCloudNote,
    completeCloudNote,
    deleteCloudNote,
    createCloudAnnouncement,
    archiveCloudAnnouncement,
    deleteCloudAnnouncement,
  } = useFirebase();

  const canCreateBackup =
    user?.account_type === 'super_admin' ||
    user?.account_type === 'institution_admin' ||
    user?.account_type === 'staff';

  const [subTab, setSubTab] = useState<'institutions' | 'backups' | 'notes' | 'announcements'>(
    mode === 'super_backup' ? 'backups' : canCreateBackup ? 'institutions' : 'notes'
  );
  const [busy, setBusy] = useState(false);

  // Backup form
  const [backupTitle, setBackupTitle] = useState('');
  const [backupSummary, setBackupSummary] = useState('');

  // Note form
  const [noteForm, setNoteForm] = useState<{
    title: string;
    body: string;
    category: CloudNoteRecord['category'];
  }>({ title: '', body: '', category: 'general' });

  // Announcement form (Firebase Admin only)
  const [annForm, setAnnForm] = useState<{
    title: string;
    message: string;
    priority: 'normal' | 'important' | 'urgent';
  }>({ title: '', message: '', priority: 'normal' });

  const handleSaveCloudBackup = async () => {
    setBusy(true);
    try {
      let metrics = { institutions: 0, users: 0, students: 0, teachers: 0, transactions: 0, notices: 0 };
      let recordCount = 0;
      let instName = institution?.name || 'দারুল ইদারা প্ল্যাটফর্ম';
      let scope: 'platform' | 'institution' = user?.account_type === 'super_admin' ? 'platform' : 'institution';

      if (scope === 'platform') {
        const dash = await apiFetch('/api/super/dashboard');
        const exportRes = await apiFetch('/api/super/backup/export');
        const tables = exportRes?.tables || {};
        metrics = {
          institutions: dash?.stats?.totalInstitutions || (tables.institutions?.length ?? 0),
          users: dash?.stats?.totalUsers || 0,
          students: tables.students?.length ?? 0,
          teachers: tables.teachers?.length ?? 0,
          transactions: tables.finance_transactions?.length ?? 0,
          notices: tables.notices?.length ?? 0,
        };
        recordCount = Object.values(tables).reduce<number>(
          (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
          0
        );
      } else if (user?.account_type === 'institution_admin' || user?.account_type === 'staff') {
        const dash = await apiFetch('/api/inst/dashboard');
        metrics = {
          institutions: 1,
          users: (dash?.stats?.totalStudents || 0) + (dash?.stats?.activeTeachers || 0),
          students: dash?.stats?.totalStudents || 0,
          teachers: dash?.stats?.activeTeachers || 0,
          transactions: dash?.recentTransactions?.length || 0,
          notices: dash?.recentNotices?.length || 0,
        };
        recordCount = metrics.students + metrics.teachers + metrics.transactions + metrics.notices;
      }

      const exportedAtDhaka = formatDateTimeDMY(new Date().toISOString());
      await createCloudBackup({
        scope,
        title: backupTitle.trim() || `${instName} — ক্লাউড স্ন্যাপশট`,
        institutionName: instName,
        recordCount,
        summaryText:
          backupSummary.trim() ||
          `মোট রেকর্ড: ${recordCount} | শিক্ষার্থী: ${metrics.students} | শিক্ষক: ${metrics.teachers}`,
        exportedAtDhaka,
        metrics,
        tags: [scope, 'firestore'],
      });
      setBackupTitle('');
      setBackupSummary('');
      toast('success', 'Firestore ক্লাউড ব্যাকআপ সংরক্ষিত হয়েছে');
    } catch (err: any) {
      toast('error', 'ক্লাউড ব্যাকআপ ব্যর্থ', err?.message || 'আবার চেষ্টা করুন');
    } finally {
      setBusy(false);
    }
  };

  const handleSyncInstitutionsToFirestore = async () => {
    setBusy(true);
    try {
      if (user?.account_type === 'super_admin') {
        const res = await apiFetch<{ institutions: any[] }>('/api/super/institutions');
        const list = res.institutions || [];
        if (list.length === 0) {
          toast('info', 'সিঙ্ক করার মতো কোনো প্রতিষ্ঠান এখনও তৈরি হয়নি');
          return;
        }
        for (const inst of list) {
          await syncInstitutionToCloud({
            institutionCode: inst.code || `INST-${inst.id}`,
            name: inst.name,
            status: inst.status || 'active',
            academicYear: inst.academic_year || '',
            studentCount: Number(inst.student_count || 0),
            teacherCount: Number(inst.teacher_count || 0),
            totalIncome: Number(inst.total_income || 0),
            totalExpense: Number(inst.total_expense || 0),
          });
        }
        toast('success', `${list.length}টি প্রতিষ্ঠান Cloud Firestore-এ সিঙ্ক হয়েছে`);
      } else if (user?.account_type === 'institution_admin' || user?.account_type === 'staff') {
        const [profRes, dashRes] = await Promise.all([
          apiFetch<{ institution: any }>('/api/inst/profile'),
          apiFetch<{ stats: any }>('/api/inst/dashboard'),
        ]);
        const inst = profRes.institution;
        const stats = dashRes.stats || {};
        await syncInstitutionToCloud({
          institutionCode: inst.code || `INST-${inst.id}`,
          name: inst.name,
          status: inst.status || 'active',
          academicYear: inst.academic_year || '',
          studentCount: Number(stats.totalStudents || 0),
          teacherCount: Number(stats.activeTeachers || 0),
          totalIncome: Number(stats.totalIncome || 0),
          totalExpense: Number(stats.totalExpense || 0),
        });
        toast('success', `${inst.name} সফলভাবে Cloud Firestore-এ সিঙ্ক হয়েছে`);
      }
    } catch (err: any) {
      toast('error', 'প্রতিষ্ঠান সিঙ্ক ব্যর্থ', err?.message || 'আবার চেষ্টা করুন');
    } finally {
      setBusy(false);
    }
  };

  if (!authReady) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-sm text-slate-500">
        Firebase ক্লাউড সংযোগ প্রস্তুত হচ্ছে...
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#0F172A] text-amber-400 flex items-center justify-center shrink-0">
            <Cloud className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Firebase ক্লাউড সিঙ্ক ও রিয়েল-টাইম ব্যাকআপ
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Google অ্যাকাউন্ট দিয়ে সংযুক্ত হলে আপনার প্রশাসনিক নোট, ক্লাউড ব্যাকআপ স্ন্যাপশট এবং প্ল্যাটফর্ম ঘোষণা সরাসরি Firebase Firestore-এ রিয়েল-টাইমে সংরক্ষিত ও সিঙ্ক হবে।
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={signInWithGoogle}
          className={primaryBtnClass}
        >
          <Cloud className="w-4 h-4" />
          Google দিয়ে Firebase সংযুক্ত করুন
        </button>
      </div>
    );
  }

  const activeTab =
    !canCreateBackup && (subTab === 'institutions' || subTab === 'backups') ? 'notes' : subTab;

  return (
    <div className="space-y-5">
      {/* Connected Account Strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          {firebaseUser.photoURL ? (
            <img
              src={firebaseUser.photoURL}
              alt={firebaseUser.displayName || 'Google'}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-[#047857] text-white flex items-center justify-center font-bold shrink-0">
              {(firebaseUser.displayName || firebaseUser.email || 'F').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {firebaseUser.displayName || 'Google ব্যবহারকারী'}
              {isFirebaseAdmin && (
                <span className="ml-2 text-xs font-semibold text-[#6D28D9] dark:text-violet-400">
                  · ক্লাউড অ্যাডমিন
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {firebaseUser.email} ·{' '}
              {firestoreStatus === 'offline'
                ? 'Cloud Firestore অফলাইন'
                : profileReady
                ? 'Cloud Firestore সক্রিয় ও সিঙ্ককৃত'
                : 'প্রোফাইল সিঙ্ক হচ্ছে...'}
            </div>
          </div>
        </div>
        <button type="button" onClick={signOutFirebase} className={secondaryBtnClass}>
          <LogOut className="w-3.5 h-3.5" />
          সংযোগ বিচ্ছিন্ন করুন
        </button>
      </div>

      {/* Sub-navigation */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit flex-wrap">
        {canCreateBackup && (
          <button
            type="button"
            onClick={() => setSubTab('institutions')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              activeTab === 'institutions' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            প্রতিষ্ঠান সিঙ্ক ({cloudInstitutions.length})
          </button>
        )}
        {canCreateBackup && (
          <button
            type="button"
            onClick={() => setSubTab('backups')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              activeTab === 'backups' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            ক্লাউড ব্যাকআপ ({cloudBackups.length})
          </button>
        )}
        <button
          type="button"
          onClick={() => setSubTab('notes')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
            activeTab === 'notes' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          ক্লাউড নোটস ({cloudNotes.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('announcements')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
            activeTab === 'announcements' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          প্ল্যাটফর্ম ঘোষণা ({cloudAnnouncements.length})
        </button>
      </div>

      {/* TAB 0: CLOUD FIRESTORE INSTITUTIONS SYNC */}
      {activeTab === 'institutions' && canCreateBackup && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#6D28D9]" />
                প্রতিষ্ঠানসমূহ Cloud Firestore-এ রিয়েল-টাইম সিঙ্ক
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                আপনার মাদ্রাসাগুলোর শিক্ষার্থী, শিক্ষক ও আর্থিক সারসংক্ষেপ সরাসরি Cloud Firestore ডাটাবেসে সংরক্ষণ ও রিয়েল-টাইমে হালনাগাদ করুন।
              </p>
            </div>
            <button
              type="button"
              disabled={busy || !profileReady}
              onClick={handleSyncInstitutionsToFirestore}
              className={emeraldBtnClass}
            >
              <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
              {busy ? 'সিঙ্ক হচ্ছে...' : 'এখনই Firestore-এ সিঙ্ক করুন'}
            </button>
          </div>

          {cloudInstitutions.length === 0 ? (
            <EmptyState
              title="এখনও কোনো প্রতিষ্ঠান Cloud Firestore-এ সিঙ্ক হয়নি"
              description="উপরের বাটনে ক্লিক করে আপনার বর্তমান মাদ্রাসার তথ্য Cloud Firestore-এ সংরক্ষণ করুন।"
            />
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {cloudInstitutions.map((ci) => (
                <div
                  key={ci.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">{ci.name}</div>
                      <div className="text-xs font-mono-num text-slate-500">
                        {ci.institutionCode} {ci.academicYear ? `· ${ci.academicYear}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'ক্লাউড প্রতিষ্ঠান রেকর্ড মুছুন',
                          message: `"${ci.name}" এর Cloud Firestore স্ন্যাপশট মুছতে চান?`,
                          danger: true,
                        });
                        if (!ok) return;
                        try {
                          await deleteCloudInstitution(ci.id);
                          toast('success', 'ক্লাউড রেকর্ড মুছে ফেলা হয়েছে');
                        } catch (err: any) {
                          toast('error', 'মুছতে ব্যর্থ', err?.message);
                        }
                      }}
                      className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded cursor-pointer"
                      title="ক্লাউড রেকর্ড মুছুন"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono-num pt-1 border-t border-slate-100 dark:border-slate-800">
                    <div>শিক্ষার্থী: <strong>{ci.studentCount}</strong></div>
                    <div>শিক্ষক: <strong>{ci.teacherCount}</strong></div>
                    <div className="text-[#047857]">আয়: {formatBDT(ci.totalIncome)}</div>
                    <div className="text-red-600">ব্যয়: {formatBDT(ci.totalExpense)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 1: FIRESTORE CLOUD BACKUPS */}
      {activeTab === 'backups' && canCreateBackup && (
        <div className="grid lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <CloudUpload className="w-4 h-4 text-[#047857]" />
              নতুন Firestore ব্যাকআপ স্ন্যাপশট
            </h4>
            <div>
              <label className={labelClass}>ব্যাকআপ শিরোনাম</label>
              <input
                type="text"
                maxLength={120}
                value={backupTitle}
                onChange={(e) => setBackupTitle(e.target.value)}
                placeholder="যেমন: মাসিক ব্যাকআপ — নভেম্বর"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>সংক্ষিপ্ত মন্তব্য (ঐচ্ছিক)</label>
              <textarea
                rows={3}
                maxLength={2000}
                value={backupSummary}
                onChange={(e) => setBackupSummary(e.target.value)}
                placeholder="ব্যাকআপের উদ্দেশ্য বা বিশেষ নোট লিখুন..."
                className={inputClass}
              />
            </div>
            <button
              type="button"
              disabled={busy || !profileReady}
              onClick={handleSaveCloudBackup}
              className={emeraldBtnClass}
            >
              <CloudUpload className="w-4 h-4" />
              {busy ? 'সংরক্ষণ হচ্ছে...' : 'Firestore ক্লাউডে সংরক্ষণ করুন'}
            </button>
          </div>

          <div className="lg:col-span-7 space-y-3">
            {cloudBackups.length === 0 ? (
              <EmptyState
                title="কোনো ক্লাউড ব্যাকআপ সংরক্ষিত নেই"
                description="বাম পাশের ফর্ম ব্যবহার করে আপনার প্রথম Firestore ক্লাউড স্ন্যাপশট তৈরি করুন।"
              />
            ) : (
              cloudBackups.map((b) => (
                <div
                  key={b.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm text-slate-900 dark:text-white">{b.title}</div>
                      <div className="text-xs text-slate-500 font-mono-num mt-0.5">
                        {b.institutionName} · {b.exportedAtDhaka} · মোট রেকর্ড: {b.recordCount}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        b.status === 'archived' ? 'text-slate-400' : 'text-[#047857]'
                      }`}
                    >
                      {b.status === 'archived' ? 'আর্কাইভকৃত' : 'সক্রিয়'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{b.summaryText}</p>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1 text-[11px] font-mono-num text-slate-500">
                    <div>প্রতিষ্ঠান: {b.metrics?.institutions ?? 0}</div>
                    <div>ব্যবহারকারী: {b.metrics?.users ?? 0}</div>
                    <div>শিক্ষার্থী: {b.metrics?.students ?? 0}</div>
                    <div>শিক্ষক: {b.metrics?.teachers ?? 0}</div>
                    <div>লেনদেন: {b.metrics?.transactions ?? 0}</div>
                    <div>নোটিশ: {b.metrics?.notices ?? 0}</div>
                  </div>
                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {b.status === 'active' && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await archiveCloudBackup(b.id);
                            toast('success', 'ব্যাকআপ আর্কাইভ করা হয়েছে');
                          } catch (err: any) {
                            toast('error', 'ব্যর্থ', err?.message);
                          }
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                      >
                        <Archive className="w-3.5 h-3.5" /> আর্কাইভ
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'ক্লাউড ব্যাকআপ মুছুন',
                          message: `"${b.title}" স্থায়ীভাবে মুছে ফেলতে চান?`,
                          danger: true,
                        });
                        if (!ok) return;
                        try {
                          await deleteCloudBackup(b.id);
                          toast('success', 'ব্যাকআপ মুছে ফেলা হয়েছে');
                        } catch (err: any) {
                          toast('error', 'মুছতে ব্যর্থ', err?.message);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> মুছুন
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PERSONAL REAL-TIME CLOUD NOTES */}
      {activeTab === 'notes' && (
        <div className="grid lg:grid-cols-12 gap-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await createCloudNote(noteForm);
                setNoteForm({ title: '', body: '', category: 'general' });
                toast('success', 'নোটটি Firebase-এ সংরক্ষিত হয়েছে');
              } catch (err: any) {
                toast('error', 'সংরক্ষণ ব্যর্থ', err?.message);
              } finally {
                setBusy(false);
              }
            }}
            className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit"
          >
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-[#6D28D9]" />
              নতুন প্রশাসনিক ক্লাউড নোট
            </h4>
            <div>
              <label className={labelClass}>শিরোনাম</label>
              <input
                required
                maxLength={120}
                value={noteForm.title}
                onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                placeholder="যেমন: বার্ষিক পরীক্ষার রুটিন চূড়ান্তকরণ"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>বিভাগ</label>
              <select
                value={noteForm.category}
                onChange={(e) =>
                  setNoteForm({ ...noteForm, category: e.target.value as CloudNoteRecord['category'] })
                }
                className={inputClass}
              >
                <option value="general">সাধারণ</option>
                <option value="academic">একাডেমিক</option>
                <option value="finance">হিসাব ও ফি</option>
                <option value="hostel">দারুল ইকামা</option>
                <option value="support">সাপোর্ট</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>বিবরণ</label>
              <textarea
                required
                rows={4}
                maxLength={2000}
                value={noteForm.body}
                onChange={(e) => setNoteForm({ ...noteForm, body: e.target.value })}
                placeholder="আপনার ব্যক্তিগত কর্মতালিকা বা নোট লিখুন..."
                className={inputClass}
              />
            </div>
            <button type="submit" disabled={busy || !profileReady} className={primaryBtnClass}>
              <Plus className="w-4 h-4" />
              ক্লাউডে সংরক্ষণ করুন
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {cloudNotes.length === 0 ? (
              <EmptyState
                title="কোনো ক্লাউড নোট নেই"
                description="আপনার ব্যক্তিগত নোটগুলো Firebase Firestore-এ সুরক্ষিত ও রিয়েল-টাইমে সিঙ্ক থাকে।"
              />
            ) : (
              cloudNotes.map((n) => (
                <div
                  key={n.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div
                        className={`font-semibold text-sm ${
                          n.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {n.title}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        ক্যাটাগরি: {n.category} · অবস্থা: {n.status === 'done' ? 'সম্পন্ন' : 'চলমান'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {n.status === 'open' && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await completeCloudNote(n.id);
                              toast('success', 'নোটটি সম্পন্ন হিসেবে চিহ্নিত হয়েছে');
                            } catch (err: any) {
                              toast('error', 'ব্যর্থ', err?.message);
                            }
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#047857] hover:underline cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> সম্পন্ন
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await deleteCloudNote(n.id);
                            toast('success', 'নোট মুছে ফেলা হয়েছে');
                          } catch (err: any) {
                            toast('error', 'ব্যর্থ', err?.message);
                          }
                        }}
                        className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{n.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PLATFORM CLOUD ANNOUNCEMENTS */}
      {activeTab === 'announcements' && (
        <div className="grid lg:grid-cols-12 gap-5">
          {isFirebaseAdmin && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await createCloudAnnouncement({
                    title: annForm.title,
                    message: annForm.message,
                    priority: annForm.priority,
                    status: 'published',
                  });
                  setAnnForm({ title: '', message: '', priority: 'normal' });
                  toast('success', 'ক্লাউড ঘোষণা প্রকাশিত হয়েছে');
                } catch (err: any) {
                  toast('error', 'প্রকাশ ব্যর্থ', err?.message);
                } finally {
                  setBusy(false);
                }
              }}
              className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit"
            >
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-[#6D28D9]" />
                নতুন প্ল্যাটফর্ম ক্লাউড ঘোষণা
              </h4>
              <div>
                <label className={labelClass}>শিরোনাম</label>
                <input
                  required
                  maxLength={150}
                  value={annForm.title}
                  onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>অগ্রাধিকার</label>
                <select
                  value={annForm.priority}
                  onChange={(e) =>
                    setAnnForm({ ...annForm, priority: e.target.value as 'normal' | 'important' | 'urgent' })
                  }
                  className={inputClass}
                >
                  <option value="normal">সাধারণ</option>
                  <option value="important">গুরুত্বপূর্ণ</option>
                  <option value="urgent">জরুরি</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>বিবরণ</label>
                <textarea
                  required
                  rows={4}
                  maxLength={2000}
                  value={annForm.message}
                  onChange={(e) => setAnnForm({ ...annForm, message: e.target.value })}
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={busy} className={primaryBtnClass}>
                প্রকাশ করুন
              </button>
            </form>
          )}

          <div className={`${isFirebaseAdmin ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-3`}>
            {cloudAnnouncements.length === 0 ? (
              <EmptyState title="কোনো ক্লাউড ঘোষণা নেই" />
            ) : (
              cloudAnnouncements.map((a) => (
                <div
                  key={a.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">{a.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        অগ্রাধিকার: {a.priority} · অবস্থা: {a.status}
                      </div>
                    </div>
                    {isFirebaseAdmin && (
                      <div className="flex items-center gap-2">
                        {a.status !== 'archived' && (
                          <button
                            type="button"
                            onClick={() => archiveCloudAnnouncement(a.id)}
                            className="text-xs text-amber-600 hover:underline cursor-pointer"
                          >
                            আর্কাইভ
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteCloudAnnouncement(a.id)}
                          className="text-xs text-red-600 hover:underline cursor-pointer"
                        >
                          মুছুন
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{a.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
