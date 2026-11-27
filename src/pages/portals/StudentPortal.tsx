import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Printer,
  Receipt,
  Send,
  Upload,
  Users,
} from 'lucide-react';
import { AppShell, type NavItem } from '../../components/layout/AppShell';
import { apiFetch, formatBDT, formatDateDMY, getTodayDhakaYMD } from '../../lib/api';
import { FileUploadField } from '../../components/ui/FileUploadField';
import { DAILY_DAY_OPTION, expandWeeklySchedules, isDailySchedule } from '../../lib/routineDays';
import { useApp } from '../../context/AppContext';
import {
  EmptyState,
  PageHeader,
  PrintReceiptModal,
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

const STUDENT_NAV: NavItem[] = [
  { id: 'dashboard', label: 'আমার ড্যাশবোর্ড', icon: LayoutDashboard },
  { id: 'attendance', label: 'উপস্থিতি ইতিহাস', icon: CalendarCheck },
  { id: 'leaves', label: 'ছুটির আবেদন', icon: CalendarOff },
  { id: 'routine', label: 'ক্লাস রুটিন', icon: CalendarClock },
  { id: 'teachers', label: 'শিক্ষকমণ্ডলী', icon: Users },
  { id: 'results', label: 'পরীক্ষার ফলাফল', icon: Award },
  { id: 'payments', label: 'ফি ও রসিদ', icon: Receipt },
  { id: 'notices', label: 'নোটিশ বোর্ড', icon: Bell },
  { id: 'password', label: 'পাসওয়ার্ড পরিবর্তন', icon: KeyRound },
  { id: 'logout', label: 'লগআউট', icon: LogOut },
];

const STUDENT_LEAVE_TYPES = ['অসুস্থতা জনিত ছুটি', 'পারিবারিক অনুষ্ঠান / জরুরি প্রয়োজন', 'বাড়ি যাওয়ার ছুটি', 'অন্যান্য'];

function countDaysInclusive(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.floor((e - s) / 86_400_000) + 1;
}

export function StudentPortal() {
  const { institution, toast, liveNotices, notifications } = useApp();
  const [activeNav, setActiveNav] = useState('dashboard');
  const [data, setData] = useState<any>(null);
  const [routineViewMode, setRoutineViewMode] = useState<'weekly' | 'list'>('weekly');
  const [loading, setLoading] = useState(true);
  const [receiptModal, setReceiptModal] = useState<any>(null);
  const [passForm, setPassForm] = useState({ current_password: '', new_password: '', confirm: '' });

  const todayYMD = getTodayDhakaYMD();
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: STUDENT_LEAVE_TYPES[0],
    start_date: todayYMD,
    end_date: todayYMD,
    reason: '',
    application_body: '',
    attachment_url: '',
    attachment_name: '',
  });

  const loadDashboard = useCallback(async () => {
    try {
      const res = await apiFetch('/api/portal/student/dashboard');
      setData(res);
    } catch (err: any) {
      toast('error', 'তথ্য লোড ব্যর্থ', err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, liveNotices.length, notifications.length]);

  const todayAttLabel = (status: string) => {
    if (status === 'present') return 'আজকের উপস্থিতি: উপস্থিত';
    if (status === 'absent') return 'আজকের উপস্থিতি: অনুপস্থিত';
    if (status === 'late') return 'আজকের উপস্থিতি: বিলম্ব';
    if (status === 'leave') return 'আজকের উপস্থিতি: ছুটি';
    return 'আজকের উপস্থিতি: এখনও গৃহীত হয়নি';
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalDays = countDaysInclusive(leaveForm.start_date, leaveForm.end_date);
    if (totalDays <= 0) {
      toast('error', 'শুরুর তারিখ শেষের তারিখের আগে বা সমান হতে হবে');
      return;
    }
    setLeaveSubmitting(true);
    try {
      await apiFetch('/api/portal/student/leaves', {
        method: 'POST',
        body: leaveForm,
      });
      toast('success', 'আপনার ছুটির আবেদন প্রশাসনে জমা হয়েছে');
      setLeaveForm({
        leave_type: STUDENT_LEAVE_TYPES[0],
        start_date: todayYMD,
        end_date: todayYMD,
        reason: '',
        application_body: '',
        attachment_url: '',
        attachment_name: '',
      });
      loadDashboard();
    } catch (err: any) {
      toast('error', 'আবেদন জমা ব্যর্থ', err.message);
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const calculatedDays = countDaysInclusive(leaveForm.start_date, leaveForm.end_date);

  return (
    <AppShell
      brandSubtitle="শিক্ষার্থী পোর্টাল"
      navItems={STUDENT_NAV}
      activeNav={activeNav}
      onSelectNav={setActiveNav}
    >
      {loading || !data ? (
        <TableSkeleton rows={5} cols={4} />
      ) : (
        <>
          {activeNav === 'dashboard' && (
            <div className="space-y-6">
              {data.activeLeave && (
                <div className="p-4 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 text-xs text-sky-900 dark:text-sky-200 flex items-center justify-between gap-3">
                  <span>
                    <strong>অনুমোদিত ছুটি চলমান:</strong> {data.activeLeave.leave_type} ({formatDateDMY(data.activeLeave.start_date)} – {formatDateDMY(data.activeLeave.end_date)})
                  </span>
                </div>
              )}

              {/* Student Profile Hero Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                <div className="flex items-center gap-4">
                  {data.student.photo_url ? (
                    <img src={data.student.photo_url} alt={data.student.full_name} referrerPolicy="no-referrer" className="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700" />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-[#0F172A] text-white flex items-center justify-center text-2xl font-bold shrink-0">
                      {data.student.full_name.charAt(0)}
                    </div>
                  )}
                  <div className="space-y-1">
                    <h1 className="text-xl font-bold">{data.student.full_name}</h1>
                    <div className="text-xs font-mono-num text-[#6D28D9] dark:text-violet-400 font-semibold">
                      রোল: {data.student.roll_number} · আইডি: {data.student.student_code} · @{data.student.username}
                    </div>
                    <div className="text-xs text-slate-500">
                      {data.student.department_name} · {data.student.class_name}
                      {data.student.jamaat_name ? ` (${data.student.jamaat_name})` : ''} · রক্তের গ্রুপ: {data.student.blood_group || '—'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-sm font-bold ${
                      data.attendance.today === 'present'
                        ? 'text-[#047857] dark:text-emerald-400'
                        : data.attendance.today === 'absent'
                        ? 'text-red-600'
                        : data.attendance.today === 'leave'
                        ? 'text-sky-600 dark:text-sky-400'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {todayAttLabel(data.attendance.today)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-mono-num">
                    উপস্থিতির হার: {data.attendance.percentage}%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="মোট উপস্থিত" value={`${data.attendance.totalPresent} দিন`} tone="emerald" />
                <StatCard label="মোট অনুপস্থিত" value={`${data.attendance.totalAbsent} দিন`} tone="crimson" />
                <StatCard label="প্রকাশিত পরীক্ষার ফলাফল" value={data.results.length} tone="purple" />
                <StatCard
                  label="মোট ফি পরিশোধ"
                  value={data.feeSummary.feeType === 'free' ? 'ফ্রি' : formatBDT(data.feeSummary.totalPaid)}
                  subtext={data.feeSummary.feeType === 'free' ? 'বেতনমুক্ত শিক্ষার্থী' : `বকেয়া: ${formatBDT(data.feeSummary.totalDue)}`}
                  tone="gold"
                />
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold">সাম্প্রতিক নোটিশ</h3>
                  {data.notices.length === 0 ? (
                    <div className="text-xs text-slate-500 py-4">কোনো নোটিশ নেই।</div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.notices.slice(0, 5).map((n: any) => (
                        <div key={n.id} className="py-2.5">
                          <div className="font-semibold text-xs">{n.title}</div>
                          <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.description}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold">ক্লাস রুটিন (সংক্ষিপ্ত)</h3>
                  {data.routine.length === 0 ? (
                    <div className="text-xs text-slate-500 py-4">কোনো রুটিন যুক্ত হয়নি।</div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {data.routine.slice(0, 6).map((r: any) => (
                        <div key={`${r.source || 'r'}-${r.id}`} className="py-2 flex justify-between gap-2">
                          <span className="font-medium flex items-center gap-1.5 flex-wrap">
                            <span>{isDailySchedule(r) ? DAILY_DAY_OPTION : r.day_of_week} · {r.subject_name}</span>
                            {isDailySchedule(r) && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                প্রতিদিন
                              </span>
                            )}
                          </span>
                          <span className="font-mono-num text-slate-500 shrink-0">{r.start_time} – {r.end_time}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {Array.isArray(data.books) && data.books.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-[#047857]" />
                      আমার ক্লাসের নির্ধারিত পাঠ্য কিতাব / বইসমূহ ({data.books.length} টি)
                    </h3>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {data.books.map((b: any) => (
                      <div
                        key={b.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60"
                      >
                        {b.cover_image_url ? (
                          <img
                            src={b.cover_image_url}
                            alt={b.name}
                            referrerPolicy="no-referrer"
                            className="w-10 h-12 rounded-md object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                          />
                        ) : (
                          <div className="w-10 h-12 rounded-md bg-[#0F172A] text-emerald-400 flex items-center justify-center shrink-0">
                            <BookOpen className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-slate-900 dark:text-white truncate">{b.name}</div>
                          {b.arabic_name && (
                            <div dir="rtl" className="text-xs text-slate-600 dark:text-slate-300 truncate">
                              {b.arabic_name}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            <span className="font-mono-num text-[#6D28D9] dark:text-violet-400">{b.book_code}</span>
                            {b.author_name ? ` · ${b.author_name}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeNav === 'leaves' && (
            <div className="space-y-6">
              <PageHeader
                title="ছুটির আবেদন"
                subtitle="মাদ্রাসা প্রশাসনের কাছে ছুটির আবেদন পাঠান ও অনুমোদনের অবস্থা দেখুন"
              />

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                <form
                  onSubmit={handleSubmitLeave}
                  className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
                >
                  <h3 className="text-sm font-semibold pb-3 border-b border-slate-100 dark:border-slate-800">
                    নতুন ছুটির আবেদন ফর্ম
                  </h3>

                  <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs">
                    <div>
                      <span className="text-slate-500 block">শিক্ষার্থীর নাম</span>
                      <span className="font-semibold">{data.student.full_name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">শিক্ষার্থী আইডি</span>
                      <span className="font-mono-num font-semibold text-[#6D28D9] dark:text-violet-400">
                        {data.student.student_code}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">বিভাগ</span>
                      <span className="font-medium">{data.student.department_name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">ক্লাস / জামাত</span>
                      <span className="font-medium">
                        {data.student.class_name || '—'}
                        {data.student.jamaat_name ? ` (${data.student.jamaat_name})` : ''}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>ছুটির ধরন *</label>
                    <select
                      value={leaveForm.leave_type}
                      onChange={(e) => setLeaveForm((f) => ({ ...f, leave_type: e.target.value }))}
                      className={inputClass}
                    >
                      {STUDENT_LEAVE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>শুরুর তারিখ *</label>
                      <input
                        type="date"
                        required
                        value={leaveForm.start_date}
                        onChange={(e) => setLeaveForm((f) => ({ ...f, start_date: e.target.value }))}
                        className={`${inputClass} font-mono-num`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>শেষের তারিখ *</label>
                      <input
                        type="date"
                        required
                        value={leaveForm.end_date}
                        onChange={(e) => setLeaveForm((f) => ({ ...f, end_date: e.target.value }))}
                        className={`${inputClass} font-mono-num`}
                      />
                    </div>
                  </div>

                  <div className="text-xs font-mono-num text-slate-600 dark:text-slate-300">
                    মোট ছুটির দিন: <strong className="text-[#6D28D9] dark:text-violet-400">{calculatedDays} দিন</strong>
                  </div>

                  <div>
                    <label className={labelClass}>ছুটির সংক্ষিপ্ত কারণ *</label>
                    <input
                      type="text"
                      required
                      value={leaveForm.reason}
                      onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
                      placeholder="যেমন: জ্বর / পারিবারিক জরুরি কাজ"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>আবেদনপত্রের বিবরণ *</label>
                    <textarea
                      rows={4}
                      required
                      value={leaveForm.application_body}
                      onChange={(e) => setLeaveForm((f) => ({ ...f, application_body: e.target.value }))}
                      placeholder="জনাব নাজেমে তালিমাত সাহেব, সবিনয় নিবেদন এই যে..."
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>সংযুক্তি (ঐচ্ছিক — ছবি, PDF বা ডকুমেন্ট)</label>
                    <FileUploadField
                      category="attachment"
                      module="student_leave"
                      buttonLabel={leaveForm.attachment_name ? 'অন্য ফাইল নির্বাচন করুন' : 'ফাইল নির্বাচন করুন'}
                      valueUrl={leaveForm.attachment_url}
                      valueName={leaveForm.attachment_name}
                      compact
                      onUploaded={(res) => setLeaveForm((f) => ({ ...f, attachment_url: res.url, attachment_name: res.original_name }))}
                      onClear={leaveForm.attachment_url ? () => setLeaveForm((f) => ({ ...f, attachment_url: '', attachment_name: '' })) : undefined}
                      onError={(msg) => toast('error', 'ফাইল আপলোড ব্যর্থ', msg)}
                    />
                  </div>

                  <button type="submit" disabled={leaveSubmitting} className={`${emeraldBtnClass} w-full`}>
                    <Send className="w-4 h-4" />
                    {leaveSubmitting ? 'জমা হচ্ছে...' : 'ছুটির আবেদন জমা দিন'}
                  </button>
                </form>

                <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
                    আমার ছুটির আবেদনসমূহ ({data.myLeaves?.length || 0})
                  </div>
                  {!(data.myLeaves || []).length ? (
                    <EmptyState title="এখনো কোনো ছুটির আবেদন জমা দেননি" />
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.myLeaves.map((l: any) => (
                        <div key={l.id} className="p-4 text-xs space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm text-slate-900 dark:text-white">{l.leave_type}</span>
                            <StatusText status={l.status} />
                          </div>
                          <div className="font-mono-num text-slate-500">
                            {formatDateDMY(l.start_date)} – {formatDateDMY(l.end_date)} ({l.total_days} দিন)
                          </div>
                          <div className="text-slate-700 dark:text-slate-300">{l.reason}</div>
                          {l.admin_comment && (
                            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
                              <strong>প্রশাসনিক মন্তব্য:</strong> {l.admin_comment}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeNav === 'attendance' && (
            <div className="space-y-6">
              <PageHeader title="মাসিক উপস্থিতি ইতিহাস" subtitle={todayAttLabel(data.attendance.today)} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="মোট উপস্থিত" value={data.attendance.totalPresent} tone="emerald" />
                <StatCard label="মোট অনুপস্থিত" value={data.attendance.totalAbsent} tone="crimson" />
                <StatCard label="বিলম্ব / ছুটি" value={`${data.attendance.totalLate} / ${data.attendance.totalLeave}`} tone="gold" />
                <StatCard label="উপস্থিতির হার" value={`${data.attendance.percentage}%`} tone="purple" />
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-5 py-3">তারিখ</th>
                      <th className="px-4 py-3">সেশন</th>
                      <th className="px-4 py-3">অবস্থা</th>
                      <th className="px-5 py-3">মন্তব্য</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.attendance.history.map((h: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-5 py-3 font-mono-num text-xs">{formatDateDMY(h.attendance_date)}</td>
                        <td className="px-4 py-3 text-xs">{h.session_name}</td>
                        <td className="px-4 py-3"><StatusText status={h.status} /></td>
                        <td className="px-5 py-3 text-xs text-slate-500">{h.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeNav === 'routine' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <PageHeader title="আমার ক্লাস রুটিন" subtitle={`${data.student.department_name} · ${data.student.class_name}`} />
                {data.routine.length > 0 && (
                  <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setRoutineViewMode('weekly')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                        routineViewMode === 'weekly' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      সাপ্তাহিক (শনি–শুক্র)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoutineViewMode('list')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                        routineViewMode === 'list' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      তালিকা ভিউ
                    </button>
                  </div>
                )}
              </div>
              {data.routine.length === 0 ? (
                <EmptyState title="কোনো রুটিন নেই" />
              ) : routineViewMode === 'weekly' ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {expandWeeklySchedules(data.routine).map((bucket) => (
                    <div
                      key={bucket.day}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
                    >
                      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{bucket.day}</span>
                        <span className="text-[11px] font-mono-num text-slate-500">{bucket.items.length} টি ক্লাস</span>
                      </div>
                      {bucket.items.length === 0 ? (
                        <div className="p-4 text-xs text-slate-400">কোনো ক্লাস নেই</div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {bucket.items.map((r: any) => (
                            <div key={`${bucket.day}-${r.source || 'r'}-${r.id}`} className="px-4 py-2.5 flex items-start justify-between gap-2 text-xs">
                              <div className="min-w-0">
                                <div className="font-semibold flex items-center gap-1.5 flex-wrap">
                                  <span>{r.subject_name}</span>
                                  {isDailySchedule(r) && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                      ডেইলি
                                    </span>
                                  )}
                                </div>
                                <div className="text-slate-500 mt-0.5">
                                  {r.teacher_name}{r.room ? ` · কক্ষ ${r.room}` : ''}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-mono-num font-semibold">{r.start_time}–{r.end_time}</div>
                                {r.period_number > 0 && <div className="text-[10px] text-slate-400">পিরিয়ড #{r.period_number}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className={tableHeadClass}>
                      <tr>
                        <th className="px-5 py-3">বার ও পিরিয়ড</th>
                        <th className="px-4 py-3">সময়</th>
                        <th className="px-4 py-3">বিষয়</th>
                        <th className="px-4 py-3">শিক্ষক</th>
                        <th className="px-5 py-3">কক্ষ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.routine.map((r: any) => (
                        <tr key={`${r.source || 'r'}-${r.id}`}>
                          <td className="px-5 py-3 font-medium">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>
                                {isDailySchedule(r) ? DAILY_DAY_OPTION : r.day_of_week}
                                {r.period_number > 0 ? ` · #${r.period_number}` : ''}
                              </span>
                              {isDailySchedule(r) && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                  শনি–শুক্র
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono-num text-xs">{r.start_time} – {r.end_time}</td>
                          <td className="px-4 py-3 font-semibold">{r.subject_name}</td>
                          <td className="px-4 py-3 text-xs">{r.teacher_name}</td>
                          <td className="px-5 py-3 text-xs text-slate-500">{r.room || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeNav === 'teachers' && (
            <div className="space-y-6">
              <PageHeader title="আমার শ্রেণীর শিক্ষকমণ্ডলী" />
              {data.teachers.length === 0 ? (
                <EmptyState title="কোনো শিক্ষক নির্ধারিত নেই" />
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.teachers.map((t: any) => (
                    <div key={t.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-[#0F172A] text-white flex items-center justify-center font-bold">
                        {t.full_name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{t.full_name}</div>
                        <div className="text-xs text-[#6D28D9]">{t.primary_designation || 'শিক্ষক'}</div>
                        <div className="text-xs font-mono-num text-slate-500">{t.mobile || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeNav === 'results' && (
            <div className="space-y-6">
              <PageHeader title="প্রকাশিত পরীক্ষার ফলাফল" subtitle="শুধুমাত্র প্রকাশিত পরীক্ষাসমূহের ফলাফল এখানে প্রদর্শিত হয়" />
              {data.results.length === 0 ? (
                <EmptyState title="কোনো প্রকাশিত ফলাফল নেই" description="প্রতিষ্ঠান থেকে ফলাফল প্রকাশ করা হলে এখানে দেখা যাবে।" />
              ) : (
                data.results.map((item: any) => (
                  <div key={item.exam.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-base">{item.exam.name}</h3>
                        <div className="text-xs text-slate-500">শিক্ষাবর্ষ: {item.exam.academic_year}</div>
                      </div>
                      <span className="text-xs font-bold text-[#047857]">
                        {item.summary.grade} · GPA {item.summary.gpa} ({item.summary.passFail})
                      </span>
                    </div>
                    <table className="w-full text-sm border border-slate-200 dark:border-slate-800">
                      <thead className={tableHeadClass}>
                        <tr>
                          <th className="px-4 py-2.5">বিষয়</th>
                          <th className="px-4 py-2.5 text-right">পূর্ণমান</th>
                          <th className="px-4 py-2.5 text-right">প্রাপ্ত নম্বর</th>
                          <th className="px-4 py-2.5 text-right">গ্রেড</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {item.subjects.map((sub: any) => (
                          <tr key={sub.subject_id}>
                            <td className="px-4 py-2.5 font-medium">{sub.subject_name}</td>
                            <td className="px-4 py-2.5 text-right font-mono-num">{sub.full_marks}</td>
                            <td className="px-4 py-2.5 text-right font-mono-num font-semibold">{sub.obtained_marks ?? '—'}</td>
                            <td className="px-4 py-2.5 text-right text-xs">{sub.grade || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          )}

          {activeNav === 'payments' && (
            <div className="space-y-6">
              <PageHeader title="বেতন, খাবার খরচ ও রসিদ" subtitle="আপনার নির্ধারিত মাসিক প্রদেয়, খাবার খরচ এবং পরিশোধের ইতিহাস" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="মাসিক বেতন/ফি" value={formatBDT(data.feeSummary?.monthlyFee || 0)} tone="navy" />
                <StatCard label="মাসিক খাবার খরচ" value={formatBDT(data.feeSummary?.monthlyMealCost || 0)} tone="gold" />
                <StatCard
                  label="মোট মাসিক প্রদেয়"
                  value={formatBDT(
                    data.feeSummary?.totalMonthlyPayable ??
                      Number(data.feeSummary?.monthlyFee || 0) + Number(data.feeSummary?.monthlyMealCost || 0)
                  )}
                  tone="purple"
                />
                <StatCard
                  label="মোট পরিশোধ / বকেয়া"
                  value={formatBDT(data.feeSummary?.totalPaid || 0)}
                  subtext={`অবশিষ্ট বকেয়া: ${formatBDT(data.feeSummary?.totalDue || 0)}`}
                  tone="emerald"
                />
              </div>
              {data.payments.length === 0 ? (
                <EmptyState title="কোনো পেমেন্ট রেকর্ড নেই" />
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className={tableHeadClass}>
                        <tr>
                          <th className="px-4 py-3">রসিদ ও তারিখ</th>
                          <th className="px-3 py-3">মাস ও ধরন</th>
                          <th className="px-3 py-3 text-right">মাসিক ফি</th>
                          <th className="px-3 py-3 text-right">খাবার খরচ</th>
                          <th className="px-3 py-3 text-right">পরিশোধ (৳)</th>
                          <th className="px-3 py-3 text-right">বকেয়া (৳)</th>
                          <th className="px-4 py-3 text-right">রসিদ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {data.payments.map((p: any) => (
                          <tr key={p.id}>
                            <td className="px-4 py-3 font-mono-num">
                              <div className="font-bold text-[#6D28D9] dark:text-violet-400">{p.receipt_number}</div>
                              <div className="text-slate-500">{formatDateDMY(p.payment_date)}</div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="font-mono-num font-medium">{p.payment_month || p.payment_period || '—'}</div>
                              <StatusText status={p.payment_type} />
                            </td>
                            <td className="px-3 py-3 text-right font-mono-num">{formatBDT(p.monthly_payable || 0)}</td>
                            <td className="px-3 py-3 text-right font-mono-num text-amber-700 dark:text-amber-400">
                              {formatBDT(p.meal_cost || 0)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono-num font-bold text-[#047857]">{formatBDT(p.amount_paid)}</td>
                            <td className="px-3 py-3 text-right font-mono-num text-red-600">{formatBDT(p.remaining_due)}</td>
                            <td className="px-4 py-3 text-right">
                              <button type="button" onClick={() => setReceiptModal(p)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#6D28D9] hover:underline cursor-pointer">
                                <Printer className="w-3.5 h-3.5" /> রসিদ
                              </button>
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

          {activeNav === 'notices' && (
            <div className="space-y-6">
              <PageHeader title="নোটিশ বোর্ড" />
              <div className="space-y-3">
                {data.notices.map((n: any) => (
                  <div key={n.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                    <div className="flex justify-between gap-2">
                      <h4 className="font-bold text-sm">{n.title}</h4>
                      <span className="text-xs font-mono-num text-slate-400">{formatDateDMY(n.publish_date)}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 whitespace-pre-wrap">{n.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeNav === 'password' && (
            <div className="space-y-6">
              <PageHeader title="পাসওয়ার্ড / পিন পরিবর্তন" subtitle="নিরাপত্তার জন্য প্রাথমিক রোল-পিন পরিবর্তন করে নিন" />
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (passForm.new_password !== passForm.confirm) {
                    toast('error', 'নতুন পাসওয়ার্ড মিলছে না');
                    return;
                  }
                  try {
                    await apiFetch('/api/auth/change-password', {
                      method: 'POST',
                      body: { current_password: passForm.current_password, new_password: passForm.new_password },
                    });
                    setPassForm({ current_password: '', new_password: '', confirm: '' });
                    toast('success', 'পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে');
                  } catch (err: any) {
                    toast('error', 'ব্যর্থ', err.message);
                  }
                }}
                className="max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
              >
                <div>
                  <label className={labelClass}>বর্তমান পাসওয়ার্ড / পিন</label>
                  <input type="password" required value={passForm.current_password} onChange={(e) => setPassForm({ ...passForm, current_password: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>নতুন পাসওয়ার্ড / পিন (কমপক্ষে ৪ অক্ষর)</label>
                  <input type="password" required minLength={4} value={passForm.new_password} onChange={(e) => setPassForm({ ...passForm, new_password: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>নতুন পাসওয়ার্ড নিশ্চিত করুন</label>
                  <input type="password" required minLength={4} value={passForm.confirm} onChange={(e) => setPassForm({ ...passForm, confirm: e.target.value })} className={inputClass} />
                </div>
                <button type="submit" className={primaryBtnClass}>পরিবর্তন করুন</button>
              </form>
            </div>
          )}
        </>
      )}

      <PrintReceiptModal
        payment={receiptModal}
        institutionName={institution?.name || 'DARUL IDARAH'}
        institutionLogo={institution?.logo_url}
        institutionAddress={institution?.address}
        onClose={() => setReceiptModal(null)}
      />
    </AppShell>
  );
}
