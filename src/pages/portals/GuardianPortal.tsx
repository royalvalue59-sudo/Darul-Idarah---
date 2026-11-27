import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Bell,
  CalendarCheck,
  CalendarClock,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Printer,
  Receipt,
} from 'lucide-react';
import { AppShell, type NavItem } from '../../components/layout/AppShell';
import { apiFetch, formatBDT, formatDateDMY } from '../../lib/api';
import { DAILY_DAY_OPTION, expandWeeklySchedules, isDailySchedule } from '../../lib/routineDays';
import { useApp } from '../../context/AppContext';
import {
  EmptyState,
  PageHeader,
  PrintReceiptModal,
  StatCard,
  StatusText,
  TableSkeleton,
  inputClass,
  labelClass,
  primaryBtnClass,
  tableHeadClass,
} from '../../components/ui/Primitives';

const GUARDIAN_NAV: NavItem[] = [
  { id: 'dashboard', label: 'অভিভাবক ড্যাশবোর্ড', icon: LayoutDashboard },
  { id: 'attendance', label: 'সন্তানের উপস্থিতি', icon: CalendarCheck },
  { id: 'routine', label: 'ক্লাস রুটিন', icon: CalendarClock },
  { id: 'results', label: 'পরীক্ষার ফলাফল', icon: Award },
  { id: 'payments', label: 'ফি ও রসিদ', icon: Receipt },
  { id: 'notices', label: 'নোটিশ বোর্ড', icon: Bell },
  { id: 'password', label: 'পাসওয়ার্ড পরিবর্তন', icon: KeyRound },
  { id: 'logout', label: 'লগআউট', icon: LogOut },
];

export function GuardianPortal() {
  const { institution, toast, liveNotices } = useApp();
  const [activeNav, setActiveNav] = useState('dashboard');
  const [data, setData] = useState<any>(null);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [routineViewMode, setRoutineViewMode] = useState<'weekly' | 'list'>('weekly');
  const [loading, setLoading] = useState(true);
  const [receiptModal, setReceiptModal] = useState<any>(null);
  const [passForm, setPassForm] = useState({ current_password: '', new_password: '', confirm: '' });

  const load = useCallback(async (childId?: number | null) => {
    setLoading(true);
    try {
      const q = childId ? `?student_id=${childId}` : '';
      const res = await apiFetch(`/api/portal/guardian/dashboard${q}`);
      setData(res);
      if (res.selectedChild?.student?.id) {
        setSelectedChildId(res.selectedChild.student.id);
      }
    } catch (err: any) {
      toast('error', 'তথ্য লোড ব্যর্থ', err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load(selectedChildId);
  }, [liveNotices.length]);

  const child = data?.selectedChild;

  return (
    <AppShell
      brandSubtitle="অভিভাবক প্যানেল"
      navItems={GUARDIAN_NAV}
      activeNav={activeNav}
      onSelectNav={setActiveNav}
    >
      {/* Multi-Child Selector Strip */}
      {data?.children?.length > 1 && (
        <div className="mb-6 flex items-center gap-2 flex-wrap bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
          <span className="text-xs font-semibold text-slate-500 px-2">সন্তান নির্বাচন করুন:</span>
          {data.children.map((c: any) => (
            <button
              key={c.id}
              type="button"
              onClick={() => load(c.id)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                selectedChildId === c.id
                  ? 'bg-[#6D28D9] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {c.full_name} ({c.roll_number})
            </button>
          ))}
        </div>
      )}

      {loading || !data ? (
        <TableSkeleton rows={5} cols={4} />
      ) : !child ? (
        <EmptyState title="কোনো সন্তান সংযুক্ত নেই" description="মাদ্রাসা অফিসে যোগাযোগ করে আপনার সন্তানের প্রোফাইল সংযুক্ত করুন।" />
      ) : (
        <>
          {activeNav === 'dashboard' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {child.student.photo_url ? (
                    <img src={child.student.photo_url} alt={child.student.full_name} referrerPolicy="no-referrer" className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-[#0F172A] text-white flex items-center justify-center text-xl font-bold">
                      {child.student.full_name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h1 className="text-xl font-bold">{child.student.full_name}</h1>
                    <div className="text-xs font-mono-num text-[#6D28D9]">
                      রোল: {child.student.roll_number} · আইডি: {child.student.student_code}
                    </div>
                    <div className="text-xs text-slate-500">
                      {child.student.department_name} · {child.student.class_name}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-right">
                  <div className="text-slate-500">অভিভাবক: <strong>{data.guardian.full_name}</strong></div>
                  <div className="font-mono-num text-slate-500 mt-0.5">উপস্থিতি হার: {child.attendance.percentage}%</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="মোট উপস্থিত" value={`${child.attendance.totalPresent} দিন`} tone="emerald" />
                <StatCard label="মোট অনুপস্থিত" value={`${child.attendance.totalAbsent} দিন`} tone="crimson" />
                <StatCard label="প্রকাশিত ফলাফল" value={child.results.length} tone="purple" />
                <StatCard
                  label="মোট ফি পরিশোধ"
                  value={child.feeSummary.feeType === 'free' ? 'ফ্রি' : formatBDT(child.feeSummary.totalPaid)}
                  subtext={child.feeSummary.feeType === 'free' ? 'বেতনমুক্ত' : `বকেয়া: ${formatBDT(child.feeSummary.totalDue)}`}
                  tone="gold"
                />
              </div>
            </div>
          )}

          {activeNav === 'attendance' && (
            <div className="space-y-6">
              <PageHeader title={`${child.student.full_name} — উপস্থিতি`} />
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-5 py-3">তারিখ</th>
                      <th className="px-4 py-3">সেশন</th>
                      <th className="px-5 py-3">অবস্থা</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {child.attendance.history.map((h: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-5 py-3 font-mono-num text-xs">{formatDateDMY(h.attendance_date)}</td>
                        <td className="px-4 py-3 text-xs">{h.session_name}</td>
                        <td className="px-5 py-3"><StatusText status={h.status} /></td>
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
                <PageHeader title={`${child.student.full_name} — ক্লাস রুটিন`} />
                {child.routine.length > 0 && (
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
              {child.routine.length === 0 ? (
                <EmptyState title="কোনো রুটিন নেই" />
              ) : routineViewMode === 'weekly' ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {expandWeeklySchedules(child.routine).map((bucket) => (
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
                                <div className="text-slate-500 mt-0.5">{r.teacher_name}</div>
                              </div>
                              <span className="font-mono-num font-semibold shrink-0">{r.start_time}–{r.end_time}</span>
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
                        <th className="px-5 py-3">শিক্ষক</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {child.routine.map((r: any) => (
                        <tr key={`${r.source || 'r'}-${r.id}`}>
                          <td className="px-5 py-3 font-medium">
                            {isDailySchedule(r) ? DAILY_DAY_OPTION : r.day_of_week}
                            {r.period_number > 0 ? ` · #${r.period_number}` : ''}
                          </td>
                          <td className="px-4 py-3 font-mono-num text-xs">{r.start_time} – {r.end_time}</td>
                          <td className="px-4 py-3 font-semibold">{r.subject_name}</td>
                          <td className="px-5 py-3 text-xs">{r.teacher_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeNav === 'results' && (
            <div className="space-y-6">
              <PageHeader title={`${child.student.full_name} — প্রকাশিত ফলাফল`} />
              {child.results.length === 0 ? (
                <EmptyState title="কোনো প্রকাশিত ফলাফল নেই" />
              ) : (
                child.results.map((item: any) => (
                  <div key={item.exam.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                    <div className="flex justify-between">
                      <h3 className="font-bold text-base">{item.exam.name} ({item.exam.academic_year})</h3>
                      <span className="text-xs font-bold text-[#047857]">{item.summary.grade} · GPA {item.summary.gpa}</span>
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
              <PageHeader title={`${child.student.full_name} — বেতন, খাবার খরচ ও রসিদ`} />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="মাসিক বেতন/ফি" value={formatBDT(child.feeSummary?.monthlyFee || 0)} tone="navy" />
                <StatCard label="মাসিক খাবার খরচ" value={formatBDT(child.feeSummary?.monthlyMealCost || 0)} tone="gold" />
                <StatCard
                  label="মোট মাসিক প্রদেয়"
                  value={formatBDT(
                    child.feeSummary?.totalMonthlyPayable ??
                      Number(child.feeSummary?.monthlyFee || 0) + Number(child.feeSummary?.monthlyMealCost || 0)
                  )}
                  tone="purple"
                />
                <StatCard
                  label="মোট পরিশোধ / বকেয়া"
                  value={formatBDT(child.feeSummary?.totalPaid || 0)}
                  subtext={`অবশিষ্ট বকেয়া: ${formatBDT(child.feeSummary?.totalDue || 0)}`}
                  tone="emerald"
                />
              </div>
              {child.payments.length === 0 ? (
                <EmptyState title="কোনো পেমেন্ট রেকর্ড নেই" />
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className={tableHeadClass}>
                        <tr>
                          <th className="px-4 py-3">রসিদ ও তারিখ</th>
                          <th className="px-3 py-3">মাস</th>
                          <th className="px-3 py-3 text-right">মাসিক ফি</th>
                          <th className="px-3 py-3 text-right">খাবার খরচ</th>
                          <th className="px-3 py-3 text-right">পরিশোধ (৳)</th>
                          <th className="px-3 py-3 text-right">বকেয়া (৳)</th>
                          <th className="px-4 py-3 text-right">রসিদ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {child.payments.map((p: any) => (
                          <tr key={p.id}>
                            <td className="px-4 py-3 font-mono-num">
                              <div className="font-bold text-[#6D28D9] dark:text-violet-400">{p.receipt_number}</div>
                              <div className="text-slate-500">{formatDateDMY(p.payment_date)}</div>
                            </td>
                            <td className="px-3 py-3 font-mono-num">{p.payment_month || p.payment_period || '—'}</td>
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
                {child.notices.map((n: any) => (
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
