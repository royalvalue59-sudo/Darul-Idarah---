import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, FileText, XCircle } from 'lucide-react';
import { apiFetch, formatDateDMY } from '../../../lib/api';
import { useApp } from '../../../context/AppContext';
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
  secondaryBtnClass,
  tableHeadClass,
} from '../../../components/ui/Primitives';

export function LeaveManagementModule() {
  const { hasPermission, toast } = useApp();
  const [tab, setTab] = useState<'teacher' | 'student' | 'history'>('teacher');
  const [statusFilter, setStatusFilter] = useState('all');
  const [teacherLeaves, setTeacherLeaves] = useState<any[]>([]);
  const [studentLeaves, setStudentLeaves] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [counts, setCounts] = useState({ teacherPending: 0, studentPending: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ kind: 'teacher' | 'student'; item: any } | null>(null);
  const [adminComment, setAdminComment] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const canReviewTeacher = hasPermission('teachers', 'edit') || hasPermission('attendance', 'edit');
  const canReviewStudent = hasPermission('students', 'edit') || hasPermission('attendance', 'edit');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        teacherLeaves: any[];
        studentLeaves: any[];
        approvalHistory: any[];
        counts: { teacherPending: number; studentPending: number };
      }>(`/api/inst/leaves?status=${encodeURIComponent(statusFilter)}`);
      setTeacherLeaves(res.teacherLeaves || []);
      setStudentLeaves(res.studentLeaves || []);
      setHistory(res.approvalHistory || []);
      setCounts(res.counts || { teacherPending: 0, studentPending: 0 });
    } catch (err: any) {
      toast('error', 'ছুটির আবেদন লোড করা যায়নি', err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReview = async (action: 'approved' | 'rejected') => {
    if (!selected) return;
    setReviewing(true);
    try {
      const endpoint =
        selected.kind === 'teacher'
          ? `/api/inst/leaves/teacher/${selected.item.id}/review`
          : `/api/inst/leaves/student/${selected.item.id}/review`;
      await apiFetch(endpoint, {
        method: 'POST',
        body: { action, admin_comment: adminComment },
      });
      toast(
        'success',
        action === 'approved'
          ? 'ছুটির আবেদন অনুমোদিত হয়েছে এবং হাজিরা স্বয়ংক্রিয়ভাবে আপডেট হয়েছে'
          : 'ছুটির আবেদন প্রত্যাখ্যাত হয়েছে'
      );
      setSelected(null);
      setAdminComment('');
      load();
    } catch (err: any) {
      toast('error', 'সিদ্ধান্ত সংরক্ষণ ব্যর্থ হয়েছে', err.message);
    } finally {
      setReviewing(false);
    }
  };

  const renderTable = (rows: any[], kind: 'teacher' | 'student') => {
    if (rows.length === 0) {
      return <EmptyState title="এই ফিল্টারে কোনো ছুটির আবেদন পাওয়া যায়নি" />;
    }
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className={tableHeadClass}>
              <tr>
                <th className="px-4 py-3">{kind === 'teacher' ? 'শিক্ষক' : 'শিক্ষার্থী'}</th>
                <th className="px-4 py-3">বিভাগ / শ্রেণী</th>
                <th className="px-4 py-3">ছুটির ধরন ও কারণ</th>
                <th className="px-4 py-3">তারিখ ও দিন</th>
                <th className="px-4 py-3">অবস্থা</th>
                <th className="px-4 py-3 text-right">বিস্তারিত</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900 dark:text-white">{l.applicant_name}</div>
                    <div className="text-[11px] font-mono-num text-slate-500">{l.applicant_code || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {l.department_name || '—'}
                    {kind === 'student' && l.class_name ? ` · ${l.class_name}` : ''}
                    {kind === 'student' && l.jamaat_name ? ` (${l.jamaat_name})` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">{l.leave_type}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-1">{l.reason}</div>
                  </td>
                  <td className="px-4 py-3 font-mono-num">
                    <div>
                      {formatDateDMY(l.start_date)} – {formatDateDMY(l.end_date)}
                    </div>
                    <div className="text-[11px] text-slate-500">মোট {l.total_days} দিন</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusText status={l.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelected({ kind, item: l });
                        setAdminComment(l.admin_comment || '');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      দেখুন / সিদ্ধান্ত
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="কেন্দ্রীয় ছুটি ব্যবস্থাপনা ড্যাশবোর্ড"
        subtitle="শিক্ষক ও শিক্ষার্থীদের ছুটির আবেদন পর্যালোচনা, অনুমোদন, প্রত্যাখ্যান এবং স্বয়ংক্রিয় হাজিরা ও লাইভ স্ট্যাটাস সিঙ্ক"
        actions={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value="all">সকল অবস্থা</option>
            <option value="pending">অপেক্ষমাণ (Pending)</option>
            <option value="approved">অনুমোদিত (Approved)</option>
            <option value="rejected">প্রত্যাখ্যাত (Rejected)</option>
          </select>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="অপেক্ষমাণ শিক্ষক আবেদন" value={counts.teacherPending} tone="gold" />
        <StatCard label="অপেক্ষমাণ শিক্ষার্থী আবেদন" value={counts.studentPending} tone="purple" />
        <StatCard label="মোট অনুমোদন ইতিহাস" value={history.length} tone="emerald" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab('teacher')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            tab === 'teacher'
              ? 'border-[#6D28D9] text-[#6D28D9] dark:text-violet-400'
              : 'border-transparent text-slate-600 dark:text-slate-400'
          }`}
        >
          শিক্ষক ছুটির আবেদন ({teacherLeaves.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('student')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            tab === 'student'
              ? 'border-[#6D28D9] text-[#6D28D9] dark:text-violet-400'
              : 'border-transparent text-slate-600 dark:text-slate-400'
          }`}
        >
          শিক্ষার্থী ছুটির আবেদন ({studentLeaves.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            tab === 'history'
              ? 'border-[#6D28D9] text-[#6D28D9] dark:text-violet-400'
              : 'border-transparent text-slate-600 dark:text-slate-400'
          }`}
        >
          অনুমোদন ইতিহাস ({history.length})
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : tab === 'teacher' ? (
        renderTable(teacherLeaves, 'teacher')
      ) : tab === 'student' ? (
        renderTable(studentLeaves, 'student')
      ) : history.length === 0 ? (
        <EmptyState title="এখনো কোনো অনুমোদন ইতিহাস নেই" />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-4 py-3">তারিখ</th>
                  <th className="px-4 py-3">আবেদনকারী</th>
                  <th className="px-4 py-3">সিদ্ধান্ত</th>
                  <th className="px-4 py-3">অনুমোদনকারী</th>
                  <th className="px-4 py-3">মন্তব্য</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-3 font-mono-num">{formatDateDMY(h.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {h.applicant_type === 'teacher' ? 'শিক্ষক' : 'শিক্ষার্থী'} আবেদন #{h.leave_application_id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusText status={h.action} />
                    </td>
                    <td className="px-4 py-3">{h.actor_name}</td>
                    <td className="px-4 py-3 text-slate-500">{h.comment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Details & Review Modal */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={`ছুটির আবেদন বিস্তারিত — ${selected?.item?.applicant_name || ''}`}
        subtitle={`${selected?.item?.leave_type || ''} · ${selected?.item?.total_days || 0} দিন`}
        maxWidth="max-w-xl"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
              <div>
                <span className="text-slate-500 block">আবেদনকারী</span>
                <span className="font-semibold text-slate-900 dark:text-white">{selected.item.applicant_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block">আইডি</span>
                <span className="font-mono-num font-semibold">{selected.item.applicant_code || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">সময়কাল</span>
                <span className="font-mono-num font-semibold">
                  {formatDateDMY(selected.item.start_date)} – {formatDateDMY(selected.item.end_date)} ({selected.item.total_days} দিন)
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">বর্তমান অবস্থা</span>
                <StatusText status={selected.item.status} />
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">সংক্ষিপ্ত কারণ</div>
              <div className="text-slate-900 dark:text-white font-medium">{selected.item.reason}</div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">আবেদনপত্রের পূর্ণ বিবরণ</div>
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">
                {selected.item.application_body}
              </div>
            </div>

            {selected.item.attachment_data && (
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1.5">সংযুক্তি ({selected.item.attachment_name || 'ফাইল'})</div>
                {String(selected.item.attachment_data).startsWith('data:image/') ||
                /\.(jpg|jpeg|png|webp)$/i.test(String(selected.item.attachment_name || '')) ? (
                  <div className="space-y-2">
                    <img
                      src={selected.item.attachment_data}
                      alt={selected.item.attachment_name || 'সংযুক্তি'}
                      className="max-h-56 rounded-lg border border-slate-200 dark:border-slate-700 object-contain"
                    />
                    <a
                      href={
                        String(selected.item.attachment_data).startsWith('/api/uploads/')
                          ? `${selected.item.attachment_data}?download=1`
                          : selected.item.attachment_data
                      }
                      download={selected.item.attachment_name || 'attachment'}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6D28D9] dark:text-violet-400 hover:underline"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      ছবি ডাউনলোড করুন ({selected.item.attachment_name || 'ফাইল'})
                    </a>
                  </div>
                ) : (
                  <a
                    href={
                      String(selected.item.attachment_data).startsWith('/api/uploads/')
                        ? `${selected.item.attachment_data}?download=1`
                        : selected.item.attachment_data
                    }
                    download={selected.item.attachment_name || 'attachment'}
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <FileText className="w-4 h-4 text-[#6D28D9]" />
                    সংযুক্তি ডাউনলোড করুন ({selected.item.attachment_name || 'ফাইল'})
                  </a>
                )}
              </div>
            )}

            {selected.item.status === 'pending' &&
            ((selected.kind === 'teacher' && canReviewTeacher) || (selected.kind === 'student' && canReviewStudent)) ? (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <label className={labelClass}>প্রশাসনিক মন্তব্য (ঐচ্ছিক)</label>
                  <textarea
                    rows={2}
                    value={adminComment}
                    onChange={(e) => setAdminComment(e.target.value)}
                    placeholder="অনুমোদন বা প্রত্যাখ্যানের মন্তব্য লিখুন..."
                    className={inputClass}
                  />
                </div>
                <div className="flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    disabled={reviewing}
                    onClick={() => handleReview('rejected')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    প্রত্যাখ্যান করুন
                  </button>
                  <button
                    type="button"
                    disabled={reviewing}
                    onClick={() => handleReview('approved')}
                    className={emeraldBtnClass}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    অনুমোদন করুন
                  </button>
                </div>
              </div>
            ) : (
              selected.item.admin_comment && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs">
                  <span className="font-semibold">প্রশাসনিক মন্তব্য ({selected.item.reviewed_by_name || 'প্রশাসন'}): </span>
                  {selected.item.admin_comment}
                </div>
              )
            )}

            <div className="flex justify-end pt-1">
              <button type="button" onClick={() => setSelected(null)} className={secondaryBtnClass}>
                বন্ধ করুন
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
