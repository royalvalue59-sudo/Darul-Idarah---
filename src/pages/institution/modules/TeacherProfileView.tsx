import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Calendar, CheckCircle2, Clock, Edit3, Printer, ShieldCheck, Wallet } from 'lucide-react';
import { apiFetch, formatBDT, formatDateDMY } from '../../../lib/api';
import { DAILY_DAY_OPTION, expandWeeklySchedules, isDailySchedule } from '../../../lib/routineDays';
import { useApp } from '../../../context/AppContext';
import {
  EmptyState,
  LIVE_STATUS_LABELS,
  Modal,
  SalaryReceiptModal,
  StatCard,
  StatusText,
  TableSkeleton,
  emeraldBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  secondaryBtnClass,
  tableHeadClass,
} from '../../../components/ui/Primitives';
import { FileUploadField } from '../../../components/ui/FileUploadField';

const DUE_ENTRY_LABELS: Record<string, { label: string; color: string }> = {
  advance: { label: 'অতিরিক্ত উত্তোলন (+)', color: 'text-red-700 dark:text-red-400' },
  salary_deduction: { label: 'বেতন থেকে সমন্বয় (-)', color: 'text-[#047857] dark:text-emerald-400' },
  cash_return: { label: 'নগদ ফেরত (-)', color: 'text-[#047857] dark:text-emerald-400' },
  adjustment: { label: 'হিসাব সমন্বয় (-)', color: 'text-[#6D28D9] dark:text-violet-400' },
};

export function TeacherProfileView({
  teacherId,
  onBack,
  onNavigate,
}: {
  teacherId: number;
  onBack: () => void;
  onNavigate?: (tab: string) => void;
}) {
  const { institution, hasPermission, toast, teacherLiveStatuses } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'personal' | 'work' | 'financial'>('personal');
  const [scheduleView, setScheduleView] = useState<'list' | 'weekly'>('list');
  const [receiptModal, setReceiptModal] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editForm, setEditForm] = useState({
    photo_url: '',
    email: '',
    education: '',
    monthly_salary: '',
    monthly_meal_cost: '0',
    notes: '',
    document_name: '',
    document_url: '',
  });

  const canEdit = hasPermission('teachers', 'edit');
  const canEditFinance = hasPermission('finance', 'edit');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/api/inst/teachers/${teacherId}/profile`);
      setData(res);
      setEditForm({
        photo_url: res.personal?.photo_url || '',
        email: res.personal?.email || '',
        education: res.personal?.education || '',
        monthly_salary: res.financial ? String(res.financial.monthly_salary ?? '') : '',
        monthly_meal_cost: res.financial ? String(res.financial.monthly_meal_cost ?? 0) : '0',
        notes: res.personal?.notes || '',
        document_name: res.personal?.document_name || '',
        document_url: res.personal?.document_url || '',
      });
    } catch (err: any) {
      toast('error', 'শিক্ষক প্রোফাইল লোড করা যায়নি', err.message);
    } finally {
      setLoading(false);
    }
  }, [teacherId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const liveFromSocket = teacherLiveStatuses.find((s) => s.teacher_id === teacherId);
  const liveStatus = liveFromSocket || data?.work?.liveStatus;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, any> = {
        photo_url: editForm.photo_url,
        email: editForm.email,
        education: editForm.education,
        notes: editForm.notes,
        document_name: editForm.document_name,
        document_url: editForm.document_url,
      };
      if (canEditFinance) {
        if (editForm.monthly_salary !== '') {
          body.monthly_salary = Number(editForm.monthly_salary);
        }
        body.monthly_meal_cost = editForm.monthly_meal_cost !== '' ? Number(editForm.monthly_meal_cost) : 0;
      }
      await apiFetch(`/api/inst/teachers/${teacherId}/profile`, { method: 'PUT', body });
      toast('success', 'শিক্ষক প্রোফাইল আপডেট হয়েছে');
      setEditOpen(false);
      load();
    } catch (err: any) {
      toast('error', 'আপডেট ব্যর্থ হয়েছে', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmClass = async () => {
    setConfirming(true);
    try {
      await apiFetch('/api/inst/teachers/live-status/confirm', {
        method: 'POST',
        body: { teacher_id: teacherId, schedule_id: liveStatus?.current_schedule_id || null },
      });
      toast('success', 'ক্লাসে উপস্থিতি নিশ্চিত করা হয়েছে');
      load();
    } catch (err: any) {
      toast('error', 'নিশ্চিতকরণ ব্যর্থ হয়েছে', err.message);
    } finally {
      setConfirming(false);
    }
  };

  if (loading) return <TableSkeleton rows={6} cols={4} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className={secondaryBtnClass}>
          <ArrowLeft className="w-4 h-4" />
          শিক্ষক তালিকায় ফিরুন
        </button>
        <EmptyState title="শিক্ষকের প্রোফাইল পাওয়া যায়নি" />
      </div>
    );
  }

  const { personal, work, canViewFinance, financial } = data;
  const primaryDesig = personal.designations?.find((d: any) => d.is_primary)?.name || personal.designations?.[0]?.name || 'শিক্ষক';

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className={secondaryBtnClass}>
          <ArrowLeft className="w-4 h-4" />
          শিক্ষক তালিকায় ফিরুন
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <button type="button" onClick={() => setEditOpen(true)} className={secondaryBtnClass}>
              <Edit3 className="w-4 h-4" />
              প্রোফাইল সম্পাদনা
            </button>
          )}
          {canViewFinance && onNavigate && (
            <button type="button" onClick={() => onNavigate('teacher_salary')} className={emeraldBtnClass}>
              <Wallet className="w-4 h-4" />
              বেতন প্রদান
            </button>
          )}
        </div>
      </div>

      {/* Hero Profile Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            {personal.photo_url ? (
              <img
                src={personal.photo_url}
                alt={personal.full_name}
                referrerPolicy="no-referrer"
                className="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-[#0F172A] dark:bg-[#6D28D9] text-white flex items-center justify-center text-2xl font-bold shrink-0">
                {personal.full_name?.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">{personal.full_name}</h1>
                <span className="text-xs font-mono-num font-semibold text-[#6D28D9] dark:text-violet-400">
                  {personal.teacher_code}
                </span>
                <StatusText status={personal.status} />
              </div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {primaryDesig} · {personal.department_name || 'বিভাগ নির্ধারিত নয়'} · @{personal.username}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono-num">মোবাইল: {personal.mobile || '—'}</span>
                {personal.email && <span>ইমেইল: {personal.email}</span>}
                <span className="font-mono-num">যোগদান: {formatDateDMY(personal.joining_date)}</span>
              </div>
            </div>
          </div>

          {/* Live Status Summary Strip */}
          {liveStatus && (
            <div className="border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 pt-4 md:pt-0 md:pl-6 min-w-[240px]">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                বর্তমান লাইভ স্ট্যাটাস
              </div>
              <div className="mt-1 flex items-center gap-2">
                <StatusText status={liveStatus.status} labelMap={LIVE_STATUS_LABELS} />
                {liveStatus.status === 'in_class' && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    ({liveStatus.verification_state === 'confirmed' ? 'উপস্থিতি নিশ্চিত' : 'সময়সূচি অনুযায়ী'})
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {liveStatus.status === 'in_class'
                  ? `${liveStatus.current_class || ''}${liveStatus.current_jamaat ? ` (${liveStatus.current_jamaat})` : ''} · ${liveStatus.current_subject || ''} · রুম ${liveStatus.room_number || '—'} (${liveStatus.start_time}–${liveStatus.end_time})`
                  : liveStatus.status === 'break'
                  ? `${liveStatus.current_subject || 'বিরতি'} (${liveStatus.start_time}–${liveStatus.end_time})`
                  : liveStatus.status === 'on_leave'
                  ? liveStatus.leave_reason || 'অনুমোদিত ছুটিতে আছেন'
                  : liveStatus.next_class_time
                  ? `পরবর্তী ক্লাস: ${liveStatus.next_class_time} (${liveStatus.next_class_name || ''})`
                  : 'বর্তমানে নির্ধারিত ক্লাস নেই'}
              </div>
              {liveStatus.status === 'in_class' && liveStatus.verification_state !== 'confirmed' && (
                <button
                  type="button"
                  disabled={confirming}
                  onClick={handleConfirmClass}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#047857] dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {confirming ? 'নিশ্চিত হচ্ছে...' : 'ক্লাসে উপস্থিতি নিশ্চিত করুন'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab('personal')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            tab === 'personal'
              ? 'border-[#6D28D9] text-[#6D28D9] dark:text-violet-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          ব্যক্তিগত তথ্য
        </button>
        <button
          type="button"
          onClick={() => setTab('work')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            tab === 'work'
              ? 'border-[#6D28D9] text-[#6D28D9] dark:text-violet-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          কর্মসংক্রান্ত তথ্য ও রুটিন
        </button>
        {canViewFinance && financial && (
          <button
            type="button"
            onClick={() => setTab('financial')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'financial'
                ? 'border-[#6D28D9] text-[#6D28D9] dark:text-violet-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            আর্থিক তথ্য, বকেয়া ও রসিদ
          </button>
        )}
      </div>

      {/* TAB 1: PERSONAL */}
      {tab === 'personal' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">ব্যক্তিগত ও অ্যাকাউন্ট তথ্য</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 text-sm">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">পূর্ণ নাম</dt>
              <dd className="mt-1 font-medium text-slate-900 dark:text-white">{personal.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">টিচার আইডি</dt>
              <dd className="mt-1 font-mono-num font-semibold text-[#6D28D9] dark:text-violet-400">{personal.teacher_code}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">ইউজারনেম</dt>
              <dd className="mt-1 font-mono-num text-slate-900 dark:text-white">@{personal.username}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">পদবি সমূহ</dt>
              <dd className="mt-1 text-slate-900 dark:text-white">
                {personal.designations?.length > 0
                  ? personal.designations.map((d: any) => d.name).join(' · ')
                  : 'নির্ধারিত নয়'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">মূল বিভাগ</dt>
              <dd className="mt-1 text-slate-900 dark:text-white">{personal.department_name || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">অ্যাকাউন্ট স্ট্যাটাস</dt>
              <dd className="mt-1">
                <StatusText status={personal.account_status || personal.status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">মোবাইল নম্বর</dt>
              <dd className="mt-1 font-mono-num text-slate-900 dark:text-white">{personal.mobile || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">ইমেইল</dt>
              <dd className="mt-1 text-slate-900 dark:text-white">{personal.email || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">যোগদানের তারিখ</dt>
              <dd className="mt-1 font-mono-num text-slate-900 dark:text-white">{formatDateDMY(personal.joining_date)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500 dark:text-slate-400">শিক্ষাগত যোগ্যতা</dt>
              <dd className="mt-1 text-slate-900 dark:text-white">{personal.education || '—'}</dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="text-xs text-slate-500 dark:text-slate-400">ঠিকানা</dt>
              <dd className="mt-1 text-slate-900 dark:text-white">{personal.address || '—'}</dd>
            </div>
            {personal.notes && (
              <div className="sm:col-span-3">
                <dt className="text-xs text-slate-500 dark:text-slate-400">বিশেষ নোট</dt>
                <dd className="mt-1 text-slate-700 dark:text-slate-300">{personal.notes}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* TAB 2: WORK & SCHEDULE */}
      {tab === 'work' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="মোট উপস্থিতি" value={work.attendanceSummary?.present || 0} tone="emerald" />
            <StatCard label="মোট অনুপস্থিতি" value={work.attendanceSummary?.absent || 0} tone="crimson" />
            <StatCard label="বিলম্ব উপস্থিতি" value={work.attendanceSummary?.late || 0} tone="gold" />
            <StatCard label="অনুমোদিত ছুটি (দিন)" value={work.attendanceSummary?.leave_days || 0} tone="purple" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Assigned Departments / Classes / Subjects */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">দায়িত্বপ্রাপ্ত বিভাগসমূহ</h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {work.departments?.length > 0 ? work.departments.join(' · ') : 'কোনো বিভাগ নির্ধারিত নেই'}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">নির্ধারিত ক্লাস ও বিষয়</h3>
                {work.assignments?.length === 0 ? (
                  <p className="text-xs text-slate-500">কোনো ক্লাস বা বিষয় অ্যাসাইন করা হয়নি।</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                    {work.assignments.map((a: any) => (
                      <div key={a.id} className="py-2 text-xs flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900 dark:text-white">
                          {a.department_name} · {a.class_name}
                          {a.jamaat_name ? ` (${a.jamaat_name})` : ''}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">{a.subject_name || 'সব বিষয়'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {Array.isArray(work.books) && work.books.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-[#047857]" />
                    পাঠদানকৃত কিতাব / বইসমূহ ({work.books.length})
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {work.books.map((b: any) => (
                      <span
                        key={b.id}
                        className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50 text-xs text-slate-800 dark:text-slate-200"
                      >
                        <span className="font-medium">{b.name}</span>
                        {b.book_code && (
                          <span className="ml-1.5 text-[10px] font-mono-num text-[#047857] dark:text-emerald-400">
                            ({b.book_code})
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Weekly Class Schedule */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#6D28D9]" />
                  ক্লাস শিডিউল ({work.schedules?.length || 0})
                </h3>
                <div className="flex items-center gap-2">
                  {(work.schedules?.length || 0) > 0 && (
                    <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-[11px]">
                      <button
                        type="button"
                        onClick={() => setScheduleView('list')}
                        className={`px-2 py-0.5 rounded cursor-pointer ${
                          scheduleView === 'list' ? 'bg-white dark:bg-slate-900 shadow-sm font-semibold' : 'text-slate-500'
                        }`}
                      >
                        তালিকা
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduleView('weekly')}
                        className={`px-2 py-0.5 rounded cursor-pointer ${
                          scheduleView === 'weekly' ? 'bg-white dark:bg-slate-900 shadow-sm font-semibold' : 'text-slate-500'
                        }`}
                      >
                        শনি–শুক্র
                      </button>
                    </div>
                  )}
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('teacher_schedules')}
                      className="text-xs font-medium text-[#6D28D9] dark:text-violet-400 hover:underline cursor-pointer"
                    >
                      শিডিউল পরিচালনা
                    </button>
                  )}
                </div>
              </div>
              {work.schedules?.length === 0 ? (
                <p className="text-xs text-slate-500">এখনো কোনো ক্লাস শিডিউল যোগ করা হয়নি।</p>
              ) : scheduleView === 'list' ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                  {work.schedules.map((sc: any) => (
                    <div key={`${sc.source || 'ts'}-${sc.id}`} className="py-2.5 text-xs flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                          <span>
                            {isDailySchedule(sc) ? DAILY_DAY_OPTION : sc.day_of_week} · {sc.class_name}
                            {sc.jamaat_name ? ` (${sc.jamaat_name})` : ''}
                          </span>
                          {isDailySchedule(sc) && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                              প্রতিদিন
                            </span>
                          )}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {sc.subject_name || 'সাধারণ'} · রুম {sc.room_number || '—'}
                        </div>
                      </div>
                      <div className="text-right font-mono-num font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                        {sc.start_time} – {sc.end_time}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {expandWeeklySchedules(work.schedules || []).map((bucket) => (
                    <div key={bucket.day} className="border border-slate-100 dark:border-slate-800 rounded-lg p-2.5">
                      <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between mb-1">
                        <span>{bucket.day}</span>
                        <span className="font-mono-num text-slate-400">{bucket.items.length} টি</span>
                      </div>
                      {bucket.items.length === 0 ? (
                        <div className="text-[11px] text-slate-400">ক্লাস নেই</div>
                      ) : (
                        <div className="space-y-1">
                          {bucket.items.map((sc: any) => (
                            <div key={`${bucket.day}-${sc.source || 'ts'}-${sc.id}`} className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="truncate text-slate-700 dark:text-slate-200">
                                {sc.class_name} · {sc.subject_name || 'সাধারণ'}
                                {isDailySchedule(sc) ? ' (ডেইলি)' : ''}
                              </span>
                              <span className="font-mono-num text-slate-500 shrink-0">
                                {sc.start_time}–{sc.end_time}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Attendance History & Leave History */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white">
                সাম্প্রতিক উপস্থিতি ইতিহাস
              </div>
              {work.attendanceHistory?.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">কোনো উপস্থিতি রেকর্ড নেই।</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-4 py-2.5">তারিখ</th>
                      <th className="px-4 py-2.5">অবস্থা</th>
                      <th className="px-4 py-2.5">সময়</th>
                      <th className="px-4 py-2.5">নোট</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {work.attendanceHistory.slice(0, 15).map((att: any) => (
                      <tr key={att.id}>
                        <td className="px-4 py-2.5 font-mono-num">{formatDateDMY(att.attendance_date)}</td>
                        <td className="px-4 py-2.5">
                          <StatusText status={att.status} />
                        </td>
                        <td className="px-4 py-2.5 font-mono-num text-slate-500">
                          {att.check_in || '—'} {att.check_out ? `– ${att.check_out}` : ''}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{att.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#6D28D9]" />
                ছুটির আবেদন ইতিহাস
              </div>
              {work.leaves?.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">কোনো ছুটির আবেদন নেই।</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-4 py-2.5">ধরন</th>
                      <th className="px-4 py-2.5">তারিখ</th>
                      <th className="px-4 py-2.5">দিন</th>
                      <th className="px-4 py-2.5">অবস্থা</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {work.leaves.map((l: any) => (
                      <tr key={l.id}>
                        <td className="px-4 py-2.5 font-medium">{l.leave_type}</td>
                        <td className="px-4 py-2.5 font-mono-num">
                          {formatDateDMY(l.start_date)} – {formatDateDMY(l.end_date)}
                        </td>
                        <td className="px-4 py-2.5 font-mono-num">{l.total_days}</td>
                        <td className="px-4 py-2.5">
                          <StatusText status={l.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FINANCIAL (STRICTLY FINANCE PERMISSION OR OWN PROFILE) */}
      {tab === 'financial' && canViewFinance && financial && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="মাসিক প্রদেয় (মূল বেতন)" value={formatBDT(financial.monthly_salary)} tone="navy" />
            <StatCard label="মাসিক খাবার খরচ" value={formatBDT(financial.monthly_meal_cost || 0)} tone="gold" />
            <StatCard
              label="মোট মাসিক প্রদেয়"
              value={formatBDT(
                financial.total_monthly_payable ??
                  Number(financial.monthly_salary || 0) + Number(financial.monthly_meal_cost || 0)
              )}
              tone="purple"
            />
            <StatCard
              label="মোট বেতন ও খাবার পরিশোধ"
              value={formatBDT(financial.total_salary_paid)}
              subtext={financial.last_salary_date ? `সর্বশেষ: ${formatDateDMY(financial.last_salary_date)}` : 'এখনো বেতন হয়নি'}
              tone="emerald"
            />
            <StatCard
              label="বর্তমান অগ্রিম বকেয়া"
              value={formatBDT(financial.current_due)}
              subtext={`অতিরিক্ত উত্তোলন: ${formatBDT(financial.total_advance_withdrawn)}`}
              tone="crimson"
            />
          </div>

          {/* Salary History */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">বেতন ও খাবার খরচ প্রদানের ইতিহাস</span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#047857]" /> আর্থিক রেকর্ড সুরক্ষিত
              </span>
            </div>
            {financial.salary_records?.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">এখনো কোনো বেতন রেকর্ড নেই।</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-4 py-3">মাস</th>
                      <th className="px-4 py-3 text-right">মাসিক প্রদেয়</th>
                      <th className="px-4 py-3 text-right">খাবার খরচ</th>
                      <th className="px-4 py-3 text-right">বোনাস / কর্তন</th>
                      <th className="px-4 py-3 text-right">মোট প্রদেয়</th>
                      <th className="px-4 py-3 text-right">পরিশোধিত</th>
                      <th className="px-4 py-3 text-right">অবশিষ্ট Due</th>
                      <th className="px-4 py-3">মাধ্যম ও তারিখ</th>
                      <th className="px-4 py-3">অবস্থা</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {financial.salary_records.map((r: any) => {
                      const remDue = Number(r.remaining_due ?? r.remaining_payable ?? 0);
                      const totPay = Number(
                        r.total_payable ??
                          Number(r.base_salary || 0) + Number(r.meal_cost || 0) + Number(r.bonus || 0) - Number(r.deduction || 0)
                      );
                      return (
                        <tr key={r.id}>
                          <td className="px-4 py-3 font-mono-num font-semibold">{r.salary_month}</td>
                          <td className="px-4 py-3 text-right font-mono-num">{formatBDT(r.base_salary)}</td>
                          <td className="px-4 py-3 text-right font-mono-num text-amber-700 dark:text-amber-400">
                            {formatBDT(r.meal_cost || 0)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono-num">
                            <span className="text-[#047857]">+{formatBDT(r.bonus)}</span> /{' '}
                            <span className="text-red-600">-{formatBDT(r.deduction)}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono-num font-semibold">{formatBDT(totPay)}</td>
                          <td className="px-4 py-3 text-right font-mono-num font-bold text-[#047857]">{formatBDT(r.paid_amount)}</td>
                          <td className="px-4 py-3 text-right font-mono-num font-semibold text-red-600 dark:text-red-400">
                            {formatBDT(remDue)}
                          </td>
                          <td className="px-4 py-3 font-mono-num text-slate-600 dark:text-slate-400">
                            {r.payment_method} · {formatDateDMY(r.payment_date)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusText status={remDue <= 0 ? 'paid' : 'partial'} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Receipts Archive & Due Ledger */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white">
                রসিদ আর্কাইভ ({financial.receipts?.length || 0})
              </div>
              {financial.receipts?.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">কোনো রসিদ সংরক্ষিত নেই।</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                  {financial.receipts.map((rc: any) => (
                    <div key={rc.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="font-mono-num font-semibold text-[#6D28D9] dark:text-violet-400">
                          {rc.receipt_number}
                        </div>
                        <div className="text-slate-500 mt-0.5 font-mono-num">
                          {rc.salary_month || (rc.receipt_type === 'advance' ? 'অতিরিক্ত উত্তোলন' : 'বকেয়া সমন্বয়')} · {formatDateDMY(rc.payment_date)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono-num font-bold text-slate-900 dark:text-white">
                          {formatBDT(rc.paid_amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setReceiptModal(rc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          রসিদ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white">
                বকেয়া ও অগ্রিম লেজার
              </div>
              {financial.due_ledger?.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">কোনো বকেয়া বা অগ্রিম লেনদেন নেই।</div>
              ) : (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className={tableHeadClass}>
                      <tr>
                        <th className="px-4 py-2.5">তারিখ</th>
                        <th className="px-4 py-2.5">ধরন</th>
                        <th className="px-4 py-2.5 text-right">পরিমাণ</th>
                        <th className="px-4 py-2.5 text-right">নতুন বকেয়া</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {financial.due_ledger.map((l: any) => (
                        <tr key={l.id}>
                          <td className="px-4 py-2.5 font-mono-num">{formatDateDMY(l.entry_date)}</td>
                          <td className="px-4 py-2.5">
                            <StatusText status={l.entry_type} labelMap={DUE_ENTRY_LABELS} />
                            {l.note && <div className="text-[11px] text-slate-500">{l.note}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-num font-semibold">{formatBDT(l.amount)}</td>
                          <td className="px-4 py-2.5 text-right font-mono-num font-bold text-slate-900 dark:text-white">
                            {formatBDT(l.new_due)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="শিক্ষক প্রোফাইল আপডেট" maxWidth="max-w-lg">
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <FileUploadField
            category="image"
            module="teacher_photo"
            buttonLabel="শিক্ষকের ছবি পরিবর্তন করুন"
            valueUrl={editForm.photo_url}
            showImagePreview
            compact
            previewClassName="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
            onUploaded={(res) => setEditForm((f) => ({ ...f, photo_url: res.url }))}
            onClear={editForm.photo_url ? () => setEditForm((f) => ({ ...f, photo_url: '' })) : undefined}
            onError={(msg) => toast('error', 'ছবি আপলোড ব্যর্থ', msg)}
          />
          <div>
            <label className={labelClass}>ইমেইল</label>
            <input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="teacher@madrasa.org"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>শিক্ষাগত যোগ্যতা</label>
            <input
              type="text"
              value={editForm.education}
              onChange={(e) => setEditForm((f) => ({ ...f, education: e.target.value }))}
              placeholder="যেমন: দাওরায়ে হাদিস (তাকমিল), কামিল"
              className={inputClass}
            />
          </div>
          {canEditFinance && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>মাসিক প্রদেয় / মূল বেতন (৳)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.monthly_salary}
                    onChange={(e) => setEditForm((f) => ({ ...f, monthly_salary: e.target.value }))}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelClass}>মাসিক খাবার খরচ (৳ — ঐচ্ছিক)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.monthly_meal_cost}
                    onChange={(e) => setEditForm((f) => ({ ...f, monthly_meal_cost: e.target.value }))}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs">
                <span className="text-slate-700 dark:text-slate-300 font-medium">মোট মাসিক প্রদেয়</span>
                <span className="font-mono-num font-bold text-[#047857] dark:text-emerald-400">
                  {formatBDT(Number(editForm.monthly_salary || 0) + Number(editForm.monthly_meal_cost || 0))}
                </span>
              </div>
            </div>
          )}
          <div>
            <label className={labelClass}>শিক্ষকের ডকুমেন্ট / সনদপত্র (ঐচ্ছিক)</label>
            <FileUploadField
              category="attachment"
              module="teacher_document"
              buttonLabel="ডকুমেন্ট আপলোড করুন"
              valueUrl={editForm.document_url}
              valueName={editForm.document_name}
              compact
              onUploaded={(res) => setEditForm((f) => ({ ...f, document_url: res.url, document_name: res.original_name }))}
              onClear={editForm.document_url ? () => setEditForm((f) => ({ ...f, document_url: '', document_name: '' })) : undefined}
              onError={(msg) => toast('error', 'ডকুমেন্ট আপলোড ব্যর্থ', msg)}
            />
          </div>
          <div>
            <label className={labelClass}>বিশেষ নোট</label>
            <textarea
              rows={3}
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditOpen(false)} className={secondaryBtnClass}>
              বাতিল
            </button>
            <button type="submit" disabled={saving} className={primaryBtnClass}>
              {saving ? 'সংরক্ষণ হচ্ছে...' : 'আপডেট সংরক্ষণ করুন'}
            </button>
          </div>
        </form>
      </Modal>

      <SalaryReceiptModal
        receipt={receiptModal}
        institutionName={institution?.name || 'DARUL IDARAH'}
        institutionLogo={institution?.logo_url}
        institutionAddress={institution?.address}
        onClose={() => setReceiptModal(null)}
      />
    </div>
  );
}
