import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { useApp } from '../../../context/AppContext';
import type { TeacherLiveStatusItem } from '../../../types';
import {
  EmptyState,
  LIVE_STATUS_LABELS,
  PageHeader,
  StatCard,
  StatusText,
  TableSkeleton,
  secondaryBtnClass,
  tableHeadClass,
} from '../../../components/ui/Primitives';

export function TeacherLiveStatusModule() {
  const { teacherLiveStatuses, setTeacherLiveStatuses, toast } = useApp();
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [serverTime, setServerTime] = useState<{ date: string; weekday: string; hm: string }>({
    date: '',
    weekday: '',
    hm: '',
  });
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        statuses: TeacherLiveStatusItem[];
        serverDateYMD: string;
        serverWeekday: string;
        serverTimeHM: string;
      }>('/api/inst/teachers/live-status');
      setTeacherLiveStatuses(res.statuses || []);
      setServerTime({
        date: res.serverDateYMD || '',
        weekday: res.serverWeekday || '',
        hm: res.serverTimeHM || '',
      });
    } catch (err: any) {
      toast('error', 'লাইভ স্ট্যাটাস লোড করা যায়নি', err.message);
    } finally {
      setLoading(false);
    }
  }, [setTeacherLiveStatuses, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep Dhaka clock ticking locally every 15s for display parity
  useEffect(() => {
    const t = setInterval(() => {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Dhaka',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now);
      setServerTime((prev) => ({ ...prev, hm: parts }));
    }, 15_000);
    return () => clearInterval(t);
  }, []);

  const handleConfirmPresence = async (item: TeacherLiveStatusItem) => {
    setConfirmingId(item.teacher_id);
    try {
      await apiFetch('/api/inst/teachers/live-status/confirm', {
        method: 'POST',
        body: { teacher_id: item.teacher_id, schedule_id: item.current_schedule_id || null },
      });
      toast('success', `${item.full_name}-এর ক্লাস উপস্থিতি নিশ্চিত করা হয়েছে`);
      load();
    } catch (err: any) {
      toast('error', 'নিশ্চিতকরণ ব্যর্থ', err.message);
    } finally {
      setConfirmingId(null);
    }
  };

  const counts = {
    in_class: teacherLiveStatuses.filter((s) => s.status === 'in_class').length,
    break: teacherLiveStatuses.filter((s) => s.status === 'break').length,
    free: teacherLiveStatuses.filter((s) => s.status === 'free').length,
    on_leave: teacherLiveStatuses.filter((s) => s.status === 'on_leave').length,
    absent: teacherLiveStatuses.filter((s) => s.status === 'absent').length,
  };

  const visible =
    filterStatus === 'all'
      ? teacherLiveStatuses
      : teacherLiveStatuses.filter((s) => s.status === filterStatus);

  return (
    <div className="space-y-6">
      <PageHeader
        title="শিক্ষক রিয়েল-টাইম লাইভ স্ট্যাটাস"
        subtitle="Asia/Dhaka সময়, ক্লাস শিডিউল, উপস্থিতি নিশ্চিতকরণ এবং অনুমোদিত ছুটির ভিত্তিতে স্বয়ংক্রিয় রিয়েল-টাইম আপডেট"
        actions={
          <div className="flex items-center gap-3">
            <div className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono-num flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[#6D28D9]" />
              <span>{serverTime.weekday}</span>
              <span className="font-bold text-slate-900 dark:text-white">{serverTime.hm}</span>
              <span className="text-slate-400">BST</span>
            </div>
            <button type="button" onClick={load} className={secondaryBtnClass}>
              <RefreshCw className="w-4 h-4" />
              রিফ্রেশ
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="ক্লাসে আছেন" value={counts.in_class} tone="emerald" />
        <StatCard label="বিরতিতে" value={counts.break} tone="gold" />
        <StatCard label="অবসর" value={counts.free} tone="navy" />
        <StatCard label="ছুটিতে আছেন" value={counts.on_leave} tone="purple" />
        <StatCard label="অনুপস্থিত" value={counts.absent} tone="crimson" />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {[
          { id: 'all', label: `সকল শিক্ষক (${teacherLiveStatuses.length})` },
          { id: 'in_class', label: `ক্লাসে আছেন (${counts.in_class})` },
          { id: 'break', label: `বিরতি (${counts.break})` },
          { id: 'free', label: `অবসর (${counts.free})` },
          { id: 'on_leave', label: `ছুটি (${counts.on_leave})` },
          { id: 'absent', label: `অনুপস্থিত (${counts.absent})` },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilterStatus(f.id)}
            className={`px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              filterStatus === f.id
                ? 'border-[#6D28D9] text-[#6D28D9] dark:text-violet-400'
                : 'border-transparent text-slate-600 dark:text-slate-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && teacherLiveStatuses.length === 0 ? (
        <TableSkeleton rows={6} cols={5} />
      ) : visible.length === 0 ? (
        <EmptyState title="এই অবস্থায় বর্তমানে কোনো শিক্ষক নেই" />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-4 py-3">শিক্ষক</th>
                  <th className="px-4 py-3">বর্তমান অবস্থা</th>
                  <th className="px-4 py-3">বর্তমান কার্যক্রম / ক্লাস / বিরতি</th>
                  <th className="px-4 py-3">উপস্থিতি যাচাই</th>
                  <th className="px-4 py-3 text-right">নিশ্চিতকরণ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visible.map((item) => (
                  <tr key={item.teacher_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.photo_url ? (
                          <img
                            src={item.photo_url}
                            alt={item.full_name}
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-[#0F172A] text-white flex items-center justify-center font-bold shrink-0">
                            {item.full_name?.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">{item.full_name}</div>
                          <div className="text-[11px] font-mono-num text-slate-500">
                            {item.teacher_code} · {item.teacher_department_name || '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusText status={item.status} labelMap={LIVE_STATUS_LABELS} />
                    </td>
                    <td className="px-4 py-3">
                      {item.status === 'in_class' ? (
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {item.current_class}
                            {item.current_jamaat ? ` (${item.current_jamaat})` : ''} · {item.current_subject || 'সাধারণ'}
                          </div>
                          <div className="text-[11px] font-mono-num text-slate-500">
                            রুম {item.room_number || '—'} · {item.start_time} – {item.end_time}
                          </div>
                        </div>
                      ) : item.status === 'break' ? (
                        <div>
                          <div className="font-medium text-amber-700 dark:text-amber-400">{item.current_subject || 'বিরতি'}</div>
                          <div className="text-[11px] font-mono-num text-slate-500">
                            {item.start_time} – {item.end_time}
                          </div>
                        </div>
                      ) : item.status === 'on_leave' ? (
                        <div className="text-sky-700 dark:text-sky-400">
                          {item.leave_reason || 'অনুমোদিত ছুটি'}
                          {item.leave_start_date && item.leave_end_date
                            ? ` (${item.leave_start_date} – ${item.leave_end_date})`
                            : ''}
                        </div>
                      ) : item.status === 'absent' ? (
                        <div className="text-red-700 dark:text-red-400">আজকের হাজিরায় অনুপস্থিত চিহ্নিত</div>
                      ) : (
                        <div className="text-slate-600 dark:text-slate-400">
                          {item.next_class_time
                            ? `পরবর্তী ক্লাস: ${item.next_class_time}${item.next_class_name ? ` · ${item.next_class_name}` : ''}`
                            : 'আজ আর কোনো নির্ধারিত ক্লাস নেই'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.status === 'in_class' ? (
                        <StatusText status={item.verification_state} />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.status === 'in_class' && item.verification_state !== 'confirmed' ? (
                        <button
                          type="button"
                          disabled={confirmingId === item.teacher_id}
                          onClick={() => handleConfirmPresence(item)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#047857] hover:bg-[#065F46] text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {confirmingId === item.teacher_id ? 'অপেক্ষা...' : 'উপস্থিতি নিশ্চিত করুন'}
                        </button>
                      ) : item.status === 'in_class' && item.verification_state === 'confirmed' ? (
                        <span className="text-xs font-semibold text-[#047857] dark:text-emerald-400">নিশ্চিতকৃত</span>
                      ) : (
                        <span className="text-slate-400">—</span>
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
  );
}
