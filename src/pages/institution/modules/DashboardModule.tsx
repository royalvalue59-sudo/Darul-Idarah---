import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch, formatBDT, formatDateDMY } from '../../../lib/api';
import { LIVE_STATUS_LABELS, PageHeader, StatCard, StatusText, TableSkeleton } from '../../../components/ui/Primitives';
import { useApp } from '../../../context/AppContext';

export function DashboardModule({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { institution, toast, hasPermission, teacherLiveStatuses, setTeacherLiveStatuses } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const canFinance = hasPermission('finance', 'view');
  const canHostel = hasPermission('hostel', 'view') || hasPermission('students', 'view');
  const canLibrary = hasPermission('library', 'view');
  const canStudents = hasPermission('students', 'view');
  const canNotices = hasPermission('notices', 'view');
  const canTeachers = hasPermission('teachers', 'view');

  useEffect(() => {
    apiFetch('/api/inst/dashboard')
      .then(setData)
      .catch((err: any) => toast('error', 'ড্যাশবোর্ড লোড ব্যর্থ', err.message))
      .finally(() => setLoading(false));
    if (canTeachers) {
      apiFetch<{ statuses: any[] }>('/api/inst/teachers/live-status')
        .then((res) => setTeacherLiveStatuses(res.statuses || []))
        .catch(() => {});
    }
  }, [toast, canTeachers, setTeacherLiveStatuses]);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="প্রতিষ্ঠান ড্যাশবোর্ড" subtitle={institution?.name} />
        <TableSkeleton rows={5} cols={4} />
      </div>
    );
  }

  const s = data.stats;

  return (
    <div className="space-y-6">
      <PageHeader
        title="প্রতিষ্ঠান ড্যাশবোর্ড"
        subtitle={`${institution?.name || ''} · শিক্ষাবর্ষ: ${institution?.academic_year || 'বর্তমান'}`}
      />

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="সক্রিয় শিক্ষার্থী"
          value={s.activeStudents}
          subtext={`মোট ${s.totalStudents} · নিষ্ক্রিয় ${s.inactiveStudents}`}
          tone="purple"
        />
        <StatCard
          label="শিক্ষক ও কর্মচারী"
          value={s.activeTeachers}
          subtext={`${s.departments} বিভাগ · ${s.classes} শ্রেণী`}
          tone="navy"
        />
        <StatCard
          label="আজকের উপস্থিতি"
          value={`${s.todayPresent} জন`}
          subtext={`অনুপস্থিত ${s.todayAbsent} · বিলম্ব ${s.todayLate} · ছুটি ${s.todayLeave}`}
          tone="emerald"
        />
        {canFinance && (
          <StatCard
            label="বর্তমান তহবিল ব্যালেন্স"
            value={formatBDT(s.balance)}
            subtext={`মোট আয় ${formatBDT(s.totalIncome)} · ব্যয় ${formatBDT(s.totalExpense)}`}
            tone={s.balance >= 0 ? 'emerald' : 'crimson'}
          />
        )}
      </div>

      {/* Secondary Row */}
      {(canFinance || canHostel || canLibrary) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {canFinance && <StatCard label="আজকের আয়" value={formatBDT(s.todayIncome)} tone="emerald" />}
          {canFinance && <StatCard label="আজকের ব্যয়" value={formatBDT(s.todayExpense)} tone="crimson" />}
          {canHostel && <StatCard label="দারুল একামা আবাসিক" value={`${s.hostelResidents} জন`} tone="gold" />}
          {canLibrary && <StatCard label="লাইব্রেরি ইস্যুকৃত কিতাব" value={`${s.issuedBooks} টি`} tone="purple" />}
        </div>
      )}

      {/* Charts & Lists */}
      <div className="grid lg:grid-cols-12 gap-6">
        {canFinance && (
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">মাসিক আয় ও ব্যয় বিশ্লেষণ (৳)</h2>
              <button
                type="button"
                onClick={() => onNavigate('finance')}
                className="text-xs font-medium text-[#6D28D9] dark:text-violet-400 hover:underline cursor-pointer"
              >
                হিসাব দেখুন
              </button>
            </div>
            {data.monthlySeries.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-xs text-slate-500">
                আর্থিক লেনদেন যুক্ত হলে এখানে মাসিক চার্ট প্রদর্শিত হবে।
              </div>
            ) : (
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthlySeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(val: any) => formatBDT(val)} />
                    <Bar dataKey="income" name="আয়" fill="#047857" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="ব্যয়" fill="#DC2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        <div
          className={`${
            canFinance ? 'lg:col-span-5' : 'lg:col-span-12'
          } bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5`}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">বিভাগভিত্তিক শিক্ষার্থী</h2>
            {canStudents && (
              <button
                type="button"
                onClick={() => onNavigate('students')}
                className="text-xs font-medium text-[#6D28D9] dark:text-violet-400 hover:underline cursor-pointer"
              >
                শিক্ষার্থী তালিকা
              </button>
            )}
          </div>
          <div className="space-y-3">
            {data.deptBreakdown.length === 0 ? (
              <div className="text-xs text-slate-500 py-8 text-center">কোনো বিভাগ নেই।</div>
            ) : (
              data.deptBreakdown.map((d: any) => {
                const max = Math.max(1, ...data.deptBreakdown.map((x: any) => x.students));
                const pct = Math.round((d.students / max) * 100);
                return (
                  <div key={d.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{d.name}</span>
                      <span className="font-mono-num text-slate-500">{d.students} জন</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-[#6D28D9] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Real-time Teacher Live Status Widget */}
      {canTeachers && teacherLiveStatuses.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">শিক্ষকদের লাইভ স্ট্যাটাস</h2>
              <p className="text-xs text-slate-500 mt-0.5 font-mono-num">
                ক্লাসে {teacherLiveStatuses.filter((t) => t.status === 'in_class').length} · বিরতি{' '}
                {teacherLiveStatuses.filter((t) => t.status === 'break').length} · অবসর{' '}
                {teacherLiveStatuses.filter((t) => t.status === 'free').length} · ছুটি{' '}
                {teacherLiveStatuses.filter((t) => t.status === 'on_leave').length} · অনুপস্থিত{' '}
                {teacherLiveStatuses.filter((t) => t.status === 'absent').length}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('teacher_live')}
              className="text-xs font-medium text-[#6D28D9] dark:text-violet-400 hover:underline cursor-pointer shrink-0"
            >
              পূর্ণ লাইভ ভিউ
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {teacherLiveStatuses.slice(0, 6).map((t) => (
              <div key={t.teacher_id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">
                    {t.full_name}{' '}
                    <span className="font-mono-num text-[11px] font-normal text-slate-400">{t.teacher_code}</span>
                  </div>
                  <div className="text-slate-500 truncate mt-0.5">
                    {t.status === 'in_class'
                      ? `${t.current_class || ''}${t.current_subject ? ` · ${t.current_subject}` : ''}${t.room_number ? ` · রুম ${t.room_number}` : ''} (${t.start_time}–${t.end_time})`
                      : t.status === 'break'
                      ? `${t.current_subject || 'বিরতি'} (${t.start_time}–${t.end_time})`
                      : t.status === 'on_leave'
                      ? t.leave_reason || 'অনুমোদিত ছুটি'
                      : t.next_class_time
                      ? `পরবর্তী ক্লাস: ${t.next_class_time}${t.next_class_name ? ` · ${t.next_class_name}` : ''}`
                      : 'অবসর'}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <StatusText status={t.status} labelMap={LIVE_STATUS_LABELS} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Notices & Transactions */}
      <div className={`grid ${canFinance ? 'lg:grid-cols-2' : 'lg:grid-cols-1'} gap-6`}>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold">সাম্প্রতিক নোটিশ</h2>
            {canNotices && (
              <button
                type="button"
                onClick={() => onNavigate('notices')}
                className="text-xs font-medium text-[#6D28D9] dark:text-violet-400 hover:underline cursor-pointer"
              >
                নোটিশ বোর্ড
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.recentNotices.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">কোনো নোটিশ প্রকাশিত হয়নি।</div>
            ) : (
              data.recentNotices.map((n: any) => (
                <div key={n.id} className="px-5 py-3.5 text-xs">
                  <div className="font-semibold text-slate-900 dark:text-white">{n.title}</div>
                  <div className="text-slate-500 mt-0.5 font-mono-num">
                    {formatDateDMY(n.publish_date)} · {n.created_by_name}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {canFinance && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold">সাম্প্রতিক আর্থিক লেনদেন</h2>
              <button
                type="button"
                onClick={() => onNavigate('finance')}
                className="text-xs font-medium text-[#6D28D9] dark:text-violet-400 hover:underline cursor-pointer"
              >
                সকল লেনদেন
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recentTransactions.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">কোনো লেনদেন রেকর্ড হয়নি।</div>
              ) : (
                data.recentTransactions.map((tx: any) => (
                  <div key={tx.id} className="px-5 py-3.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{tx.description}</div>
                      <div className="text-slate-500 font-mono-num">
                        {formatDateDMY(tx.tx_date)} · {tx.category_name} · {tx.payment_method}
                      </div>
                    </div>
                    <div
                      className={`font-mono-num font-bold shrink-0 ${
                        tx.type === 'income' ? 'text-[#047857]' : 'text-red-600'
                      }`}
                    >
                      {tx.type === 'income' ? '+' : '-'}
                      {formatBDT(tx.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
