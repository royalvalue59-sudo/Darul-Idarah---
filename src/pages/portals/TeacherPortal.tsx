import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Printer,
  Send,
  Upload,
  UserCircle2,
  Users,
} from 'lucide-react';
import { AppShell, type NavItem } from '../../components/layout/AppShell';
import { apiFetch, formatBDT, formatDateDMY, getTodayDhakaYMD } from '../../lib/api';
import { FileUploadField } from '../../components/ui/FileUploadField';
import { DAILY_DAY_OPTION, expandWeeklySchedules, isDailySchedule } from '../../lib/routineDays';
import { useApp } from '../../context/AppContext';
import {
  EmptyState,
  LIVE_STATUS_LABELS,
  PageHeader,
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
} from '../../components/ui/Primitives';
import { AttendanceModule } from '../institution/modules/AttendanceModule';
import { ExamsModule } from '../institution/modules/ExamsModule';

const TEACHER_NAV: NavItem[] = [
  { id: 'dashboard', label: 'শিক্ষক ড্যাশবোর্ড', icon: LayoutDashboard },
  { id: 'profile_finance', label: 'প্রোফাইল ও বেতন', icon: UserCircle2 },
  { id: 'students', label: 'আমার শিক্ষার্থী', icon: Users },
  { id: 'routine', label: 'ক্লাস রুটিন ও বিরতি', icon: CalendarClock },
  { id: 'leaves', label: 'ছুটির আবেদন', icon: CalendarOff },
  { id: 'attendance', label: 'উপস্থিতি গ্রহণ', icon: CalendarCheck },
  { id: 'exams', label: 'পরীক্ষা ও নম্বর', icon: Award },
  { id: 'notices', label: 'নোটিশ বোর্ড', icon: Bell },
  { id: 'password', label: 'পাসওয়ার্ড পরিবর্তন', icon: KeyRound },
  { id: 'logout', label: 'লগআউট', icon: LogOut },
];

const LEAVE_TYPES = ['অসুস্থতা জনিত ছুটি', 'পারিবারিক জরুরি ছুটি', 'নৈমিত্তিক ছুটি', 'অন্যান্য'];

function countDaysInclusive(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.floor((e - s) / 86_400_000) + 1;
}

export function TeacherPortal() {
  const { institution, toast, liveNotices, notifications, teacherLiveStatuses } = useApp();
  const [activeNav, setActiveNav] = useState('dashboard');
  const [data, setData] = useState<any>(null);
  const [routineViewMode, setRoutineViewMode] = useState<'weekly' | 'list'>('weekly');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [receiptModal, setReceiptModal] = useState<any>(null);
  const [passForm, setPassForm] = useState({ current_password: '', new_password: '', confirm: '' });

  const todayYMD = getTodayDhakaYMD();
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: LEAVE_TYPES[0],
    start_date: todayYMD,
    end_date: todayYMD,
    reason: '',
    application_body: '',
    attachment_url: '',
    attachment_name: '',
  });

  const loadDashboard = useCallback(async () => {
    try {
      const res = await apiFetch('/api/portal/teacher/dashboard');
      setData(res);
    } catch (err: any) {
      toast('error', 'ড্যাশবোর্ড লোড ব্যর্থ', err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, liveNotices.length, notifications.length]);

  const liveFromSocket = data?.teacher?.id
    ? teacherLiveStatuses.find((s) => s.teacher_id === data.teacher.id)
    : undefined;
  const liveStatus = liveFromSocket || data?.liveStatus;

  const handleConfirmClass = async () => {
    setConfirming(true);
    try {
      await apiFetch('/api/portal/teacher/confirm-class', {
        method: 'POST',
        body: { schedule_id: liveStatus?.current_schedule_id || null },
      });
      toast('success', 'ক্লাসে উপস্থিতি নিশ্চিত করা হয়েছে');
      loadDashboard();
    } catch (err: any) {
      toast('error', 'উপস্থিতি নিশ্চিতকরণ ব্যর্থ', err.message);
    } finally {
      setConfirming(false);
    }
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
      await apiFetch('/api/portal/teacher/leaves', {
        method: 'POST',
        body: leaveForm,
      });
      toast('success', 'ছুটির আবেদন প্রশাসনে জমা হয়েছে', 'অনুমোদনের পর আপনাকে তাৎক্ষণিক নোটিফিকেশন পাঠানো হবে।');
      setLeaveForm({
        leave_type: LEAVE_TYPES[0],
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
      brandSubtitle="শিক্ষক ড্যাশবোর্ড"
      navItems={TEACHER_NAV}
      activeNav={activeNav}
      onSelectNav={setActiveNav}
    >
      {activeNav === 'dashboard' && (
        <div className="space-y-6">
          <PageHeader
            title={`আসসালামু আলাইকুম, ${data?.teacher?.full_name || 'উস্তাদ'}`}
            subtitle={
              data?.designations?.length
                ? `${data.teacher?.teacher_code || ''} · ${data.designations.map((d: any) => `${d.name}${d.is_primary ? ' (প্রাথমিক)' : ''}`).join(' · ')}`
                : `${data?.teacher?.teacher_code || ''} · শিক্ষকমণ্ডলী প্যানেল`
            }
          />

          {loading || !data ? (
            <TableSkeleton rows={4} cols={3} />
          ) : (
            <>
              {/* Teacher Live Status Banner + Class Presence Confirmation */}
              {liveStatus && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-xs text-slate-500">আপনার বর্তমান লাইভ স্ট্যাটাস:</span>
                      <StatusText status={liveStatus.status} labelMap={LIVE_STATUS_LABELS} />
                      {liveStatus.status === 'in_class' && (
                        <StatusText status={liveStatus.verification_state} />
                      )}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {liveStatus.status === 'in_class'
                        ? `${liveStatus.current_class || ''}${liveStatus.current_jamaat ? ` (${liveStatus.current_jamaat})` : ''} · ${liveStatus.current_subject || 'সাধারণ'} · রুম ${liveStatus.room_number || '—'} (${liveStatus.start_time} – ${liveStatus.end_time})`
                        : liveStatus.status === 'break'
                        ? `${liveStatus.current_subject || 'বিরতি'} (${liveStatus.start_time} – ${liveStatus.end_time})`
                        : liveStatus.status === 'on_leave'
                        ? liveStatus.leave_reason || 'আপনি আজ অনুমোদিত ছুটিতে আছেন'
                        : liveStatus.next_class_time
                        ? `পরবর্তী ক্লাস: ${liveStatus.next_class_time}${liveStatus.next_class_name ? ` · ${liveStatus.next_class_name}` : ''}`
                        : 'বর্তমানে কোনো ক্লাস নির্ধারিত নেই'}
                    </div>
                  </div>
                  {liveStatus.status === 'in_class' && liveStatus.verification_state !== 'confirmed' && (
                    <button
                      type="button"
                      disabled={confirming}
                      onClick={handleConfirmClass}
                      className={emeraldBtnClass}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {confirming ? 'নিশ্চিত হচ্ছে...' : 'ক্লাসে উপস্থিতি নিশ্চিত করুন'}
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="নির্ধারিত শ্রেণী ও বিষয়" value={data.assignments.length} tone="purple" />
                <StatCard label="নির্ধারিত শিক্ষার্থী" value={(data.assignedStudents || []).length} tone="emerald" />
                <StatCard
                  label="সাপ্তাহিক ক্লাস শিডিউল"
                  value={(data.schedules?.length || 0) + (data.routine?.length || 0)}
                  tone="gold"
                />
                <StatCard
                  label="মোট মাসিক প্রদেয়"
                  value={formatBDT(
                    data.financial?.total_monthly_payable ??
                      Number(data.financial?.monthly_salary || 0) + Number(data.financial?.monthly_meal_cost || 0)
                  )}
                  subtext={`বেতন: ${formatBDT(data.financial?.monthly_salary || 0)} · খাবার: ${formatBDT(data.financial?.monthly_meal_cost || 0)}`}
                  tone="navy"
                />
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold">নির্ধারিত শ্রেণী ও বিষয়সমূহ</h3>
                  {data.assignments.length === 0 ? (
                    <div className="text-xs text-slate-500 py-4">এখনও কোনো শ্রেণী বরাদ্দ হয়নি।</div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {data.assignments.map((a: any) => (
                        <div key={a.id} className="py-2.5 flex justify-between">
                          <span className="font-semibold">
                            {a.department_name} · {a.class_name}
                            {a.jamaat_name ? ` (${a.jamaat_name})` : ''}
                          </span>
                          <span className="text-slate-500">{a.subject_name || 'সকল বিষয়'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold">সাম্প্রতিক নিজস্ব উপস্থিতি</h3>
                  {data.myAttendance.length === 0 ? (
                    <div className="text-xs text-slate-500 py-4">কোনো উপস্থিতি রেকর্ড নেই।</div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {data.myAttendance.slice(0, 8).map((att: any, idx: number) => (
                        <div key={idx} className="py-2 flex items-center justify-between">
                          <span className="font-mono-num">{formatDateDMY(att.attendance_date)}</span>
                          <StatusText status={att.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeNav === 'profile_finance' && data && (
        <div className="space-y-6">
          <PageHeader
            title="আমার প্রোফাইল, বেতন ও রসিদ"
            subtitle={`টিচার আইডি: ${data.teacher?.teacher_code || '—'} · @${data.teacher?.username || ''}`}
          />

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-xs">
              <div>
                <dt className="text-slate-500">পূর্ণ নাম</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{data.teacher.full_name}</dd>
              </div>
              <div>
                <dt className="text-slate-500">বিভাগ</dt>
                <dd className="mt-1 font-medium">{data.teacher.department_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">মোবাইল ও ইমেইল</dt>
                <dd className="mt-1 font-mono-num">{data.teacher.mobile || '—'} {data.teacher.email ? `· ${data.teacher.email}` : ''}</dd>
              </div>
              <div>
                <dt className="text-slate-500">শিক্ষাগত যোগ্যতা</dt>
                <dd className="mt-1">{data.teacher.education || '—'}</dd>
              </div>
            </dl>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="মাসিক প্রদেয় (মূল বেতন)" value={formatBDT(data.financial?.monthly_salary || 0)} tone="navy" />
            <StatCard label="মাসিক খাবার খরচ" value={formatBDT(data.financial?.monthly_meal_cost || 0)} tone="gold" />
            <StatCard
              label="মোট মাসিক প্রদেয়"
              value={formatBDT(
                data.financial?.total_monthly_payable ??
                  Number(data.financial?.monthly_salary || 0) + Number(data.financial?.monthly_meal_cost || 0)
              )}
              tone="purple"
            />
            <StatCard label="মোট প্রাপ্ত বেতন ও খাবার" value={formatBDT(data.financial?.total_salary_paid || 0)} tone="emerald" />
            <StatCard
              label="বর্তমান অগ্রিম বকেয়া"
              value={formatBDT(data.financial?.current_due || 0)}
              subtext={`অতিরিক্ত উত্তোলন: ${formatBDT(data.financial?.total_advance_withdrawn || 0)}`}
              tone="crimson"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
                আমার বেতন ও অগ্রিম রসিদ ({data.financial?.receipts?.length || 0})
              </div>
              {!(data.financial?.receipts || []).length ? (
                <div className="p-6 text-center text-xs text-slate-500">কোনো রসিদ পাওয়া যায়নি।</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.financial.receipts.map((rc: any) => (
                    <div key={rc.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="font-mono-num font-semibold text-[#6D28D9] dark:text-violet-400">
                          {rc.receipt_number}
                        </div>
                        <div className="text-slate-500 font-mono-num">
                          {rc.salary_month || (rc.receipt_type === 'advance' ? 'অতিরিক্ত উত্তোলন' : 'বকেয়া সমন্বয়')} · {formatDateDMY(rc.payment_date)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono-num font-bold text-[#047857]">{formatBDT(rc.paid_amount)}</span>
                        <button
                          type="button"
                          onClick={() => setReceiptModal(rc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
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
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
                আমার বকেয়া লেজার
              </div>
              {!(data.financial?.due_ledger || []).length ? (
                <div className="p-6 text-center text-xs text-slate-500">কোনো বকেয়া লেনদেন নেই।</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-4 py-2.5">তারিখ</th>
                      <th className="px-4 py-2.5">বিবরণ</th>
                      <th className="px-4 py-2.5 text-right">পরিমাণ</th>
                      <th className="px-4 py-2.5 text-right">নতুন বকেয়া</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.financial.due_ledger.map((l: any) => (
                      <tr key={l.id}>
                        <td className="px-4 py-2.5 font-mono-num">{formatDateDMY(l.entry_date)}</td>
                        <td className="px-4 py-2.5">{l.note || l.entry_type}</td>
                        <td className="px-4 py-2.5 text-right font-mono-num">{formatBDT(l.amount)}</td>
                        <td className="px-4 py-2.5 text-right font-mono-num font-bold">{formatBDT(l.new_due)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {activeNav === 'students' && (
        <div className="space-y-6">
          <PageHeader
            title="আমার নির্ধারিত শিক্ষার্থী"
            subtitle="আপনার বরাদ্দকৃত শ্রেণী ও বিভাগের সক্রিয় শিক্ষার্থীবৃন্দ"
          />
          {!(data?.assignedStudents || []).length ? (
            <EmptyState
              title="কোনো নির্ধারিত শিক্ষার্থী পাওয়া যায়নি"
              description="আপনার জন্য শ্রেণী বরাদ্দ করা হলে সেই শ্রেণীর শিক্ষার্থীরা এখানে প্রদর্শিত হবে।"
            />
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-5 py-3">রোল ও কোড</th>
                      <th className="px-4 py-3">শিক্ষার্থীর নাম</th>
                      <th className="px-4 py-3">বিভাগ ও শ্রেণী</th>
                      <th className="px-4 py-3">অভিভাবকের মোবাইল</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.assignedStudents.map((s: any) => (
                      <tr key={s.id}>
                        <td className="px-5 py-3 font-mono-num text-xs">
                          <div className="font-semibold">{s.roll_number}</div>
                          <div className="text-slate-500">{s.student_code}</div>
                        </td>
                        <td className="px-4 py-3 font-semibold">{s.full_name}</td>
                        <td className="px-4 py-3 text-xs">
                          {s.department_name} · {s.class_name}
                          {s.jamaat_name ? ` (${s.jamaat_name})` : ''}
                        </td>
                        <td className="px-4 py-3 font-mono-num text-xs text-slate-600 dark:text-slate-300">
                          {s.guardian_mobile || '—'}
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

      {activeNav === 'routine' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PageHeader title="আমার ক্লাস শিডিউল ও বিরতি" subtitle="আপনার জন্য নির্ধারিত দৈনিক ও সাপ্তাহিক পাঠদান এবং বিরতির সময়সূচী" />
            {((data?.schedules?.length || 0) > 0 || (data?.routine?.length || 0) > 0) && (
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

          {routineViewMode === 'weekly' && ((data?.schedules?.length || 0) > 0 || (data?.routine?.length || 0) > 0) && (() => {
            const combined: any[] = [];
            const seen = new Set<string>();
            for (const sc of [
              ...(data?.schedules || []).map((x: any) => ({ ...x, _src: 'ts' })),
              ...(data?.routine || []).map((x: any) => ({ ...x, room_number: x.room, _src: 'r' })),
            ]) {
              const key = `${sc.day_of_week}|${sc.start_time}|${sc.end_time}|${sc.class_id || 0}|${sc.subject_id || 0}`;
              if (seen.has(key)) continue;
              seen.add(key);
              combined.push(sc);
            }
            return (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {expandWeeklySchedules(combined).map((bucket) => (
                  <div
                    key={bucket.day}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
                  >
                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{bucket.day}</span>
                      <span className="text-[11px] font-mono-num text-slate-500">{bucket.items.length} টি ক্লাস</span>
                    </div>
                    {bucket.items.length === 0 ? (
                      <div className="p-4 text-xs text-slate-400">কোনো ক্লাস নির্ধারিত নেই</div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {bucket.items.map((sc: any) => (
                          <div key={`${bucket.day}-${sc._src}-${sc.id}`} className="px-4 py-2.5 flex items-start justify-between gap-2 text-xs">
                            <div className="min-w-0">
                              <div className="font-semibold flex items-center gap-1.5 flex-wrap">
                                <span>{sc.subject_name || 'সাধারণ'}</span>
                                {isDailySchedule(sc) && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                    ডেইলি
                                  </span>
                                )}
                              </div>
                              <div className="text-slate-500 mt-0.5">
                                {sc.class_name}{sc.jamaat_name ? ` (${sc.jamaat_name})` : ''}
                                {sc.room_number ? ` · রুম ${sc.room_number}` : ''}
                              </div>
                            </div>
                            <span className="font-mono-num font-semibold shrink-0">{sc.start_time}–{sc.end_time}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          {routineViewMode === 'list' && (data?.schedules || []).length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
                নির্ধারিত ক্লাস শিডিউল ({data.schedules.length})
              </div>
              <table className="w-full text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="px-5 py-3">বার</th>
                    <th className="px-4 py-3">সময়</th>
                    <th className="px-4 py-3">বিভাগ / ক্লাস / জামাত</th>
                    <th className="px-4 py-3">বিষয়</th>
                    <th className="px-5 py-3">রুম</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.schedules.map((sc: any) => (
                    <tr key={sc.id}>
                      <td className="px-5 py-3 font-medium">
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          <span>{isDailySchedule(sc) ? DAILY_DAY_OPTION : sc.day_of_week}</span>
                          {isDailySchedule(sc) && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                              শনি–শুক্র
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono-num text-xs">{sc.start_time} – {sc.end_time}</td>
                      <td className="px-4 py-3 text-xs">
                        {sc.department_name || '—'} · {sc.class_name}
                        {sc.jamaat_name ? ` (${sc.jamaat_name})` : ''}
                      </td>
                      <td className="px-4 py-3 font-semibold">{sc.subject_name || 'সাধারণ'}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{sc.room_number || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(data?.breaks || []).length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
                বিরতির সময়সূচি ({data.breaks.length})
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.breaks.map((b: any) => (
                  <div key={b.id} className="px-5 py-3 flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {isDailySchedule(b) ? DAILY_DAY_OPTION : b.day_of_week} · {b.label}
                    </span>
                    <span className="font-mono-num font-semibold text-amber-700 dark:text-amber-400">
                      {b.start_time} – {b.end_time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {routineViewMode === 'list' && (data?.routine || []).length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
                একাডেমিক পিরিয়ড রুটিন ({data.routine.length})
              </div>
              <table className="w-full text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="px-5 py-3">বার ও পিরিয়ড</th>
                    <th className="px-4 py-3">সময়</th>
                    <th className="px-4 py-3">বিভাগ ও শ্রেণী</th>
                    <th className="px-4 py-3">বিষয়</th>
                    <th className="px-5 py-3">কক্ষ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.routine.map((r: any) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 font-medium">
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          <span>{isDailySchedule(r) ? DAILY_DAY_OPTION : r.day_of_week} · পিরিয়ড #{r.period_number}</span>
                          {isDailySchedule(r) && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                              শনি–শুক্র
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono-num text-xs">{r.start_time} – {r.end_time}</td>
                      <td className="px-4 py-3 text-xs">{r.department_name} · {r.class_name}</td>
                      <td className="px-4 py-3 font-semibold">{r.subject_name}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{r.room || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!(data?.schedules?.length || data?.routine?.length) && (
            <EmptyState title="কোনো রুটিন বা শিডিউল নির্ধারিত নেই" />
          )}
        </div>
      )}

      {activeNav === 'leaves' && data && (
        <div className="space-y-6">
          <PageHeader
            title="ছুটির আবেদন"
            subtitle="প্রশাসনের অনুমোদনের জন্য আপনার ছুটির আবেদন জমা দিন ও অবস্থা পর্যবেক্ষণ করুন"
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
                  <span className="text-slate-500 block">শিক্ষকের নাম</span>
                  <span className="font-semibold">{data.teacher.full_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">টিচার আইডি</span>
                  <span className="font-mono-num font-semibold text-[#6D28D9] dark:text-violet-400">
                    {data.teacher.teacher_code}
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
                  {LEAVE_TYPES.map((t) => (
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
                  placeholder="যেমন: জ্বর ও শারীরিক অসুস্থতা"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>বিস্তারিত আবেদনপত্র *</label>
                <textarea
                  rows={4}
                  required
                  value={leaveForm.application_body}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, application_body: e.target.value }))}
                  placeholder="মাননীয় মুহতামিম সাহেব, বিনীত নিবেদন এই যে..."
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>সংযুক্তি (ঐচ্ছিক — ছবি, PDF বা ডকুমেন্ট)</label>
                <FileUploadField
                  category="attachment"
                  module="teacher_leave"
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
                <EmptyState title="এখনো কোনো ছুটির আবেদন করেননি" />
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

      {activeNav === 'attendance' && <AttendanceModule />}
      {activeNav === 'exams' && <ExamsModule />}

      {activeNav === 'notices' && (
        <div className="space-y-6">
          <PageHeader title="নোটিশ বোর্ড" subtitle="প্রতিষ্ঠানের সর্বশেষ নোটিশসমূহ" />
          <div className="space-y-3">
            {(data?.notices || []).length === 0 ? (
              <EmptyState title="কোনো নোটিশ নেই" />
            ) : (
              data.notices.map((n: any) => (
                <div key={n.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <div className="flex justify-between gap-2">
                    <h4 className="font-bold text-sm">{n.title}</h4>
                    <span className="text-xs font-mono-num text-slate-400">{formatDateDMY(n.publish_date)}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 whitespace-pre-wrap">{n.description}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeNav === 'password' && (
        <div className="space-y-6">
          <PageHeader title="পাসওয়ার্ড পরিবর্তন" />
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
              <label className={labelClass}>বর্তমান পাসওয়ার্ড/পিন</label>
              <input type="password" required value={passForm.current_password} onChange={(e) => setPassForm({ ...passForm, current_password: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>নতুন পাসওয়ার্ড/পিন</label>
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

      <SalaryReceiptModal
        receipt={receiptModal}
        institutionName={institution?.name || 'DARUL IDARAH'}
        institutionLogo={institution?.logo_url}
        institutionAddress={institution?.address}
        onClose={() => setReceiptModal(null)}
      />
    </AppShell>
  );
}
