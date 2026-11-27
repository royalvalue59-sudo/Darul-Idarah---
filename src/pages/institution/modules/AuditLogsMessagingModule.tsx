import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCheck,
  Download,
  Inbox,
  Mail,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { apiFetch, formatDateTimeDMY } from '../../../lib/api';
import { useApp } from '../../../context/AppContext';
import {
  EmptyState,
  PageHeader,
  StatCard,
  StatusText,
  emeraldBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  secondaryBtnClass,
  tableHeadClass,
} from '../../../components/ui/Primitives';

// ==================== 1. INSTITUTION AUDIT LOGS MODULE (APPEND-ONLY) ====================
export function InstitutionAuditLogsModule() {
  const { toast, institution } = useApp();
  const [logs, setLogs] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (moduleFilter !== 'all') params.set('module', moduleFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch<{ logs: any[]; categories: any[] }>(
        `/api/inst/audit-logs?${params.toString()}`
      );
      setLogs(res.logs || []);
      setCategories(res.categories || []);
    } catch (err: any) {
      toast('error', 'অডিট লগ লোড ব্যর্থ', err.message);
    } finally {
      setLoading(false);
    }
  }, [moduleFilter, statusFilter, fromDate, toDate, search, toast]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const exportCsv = () => {
    if (!logs.length) {
      toast('info', 'এক্সপোর্ট করার মতো কোনো অডিট লগ নেই');
      return;
    }
    const headers = ['তারিখ ও সময়', 'ব্যবহারকারী', 'ভূমিকা', 'মডিউল', 'কার্যক্রম', 'লক্ষ্য', 'বিবরণ', 'অবস্থা'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = logs.map((l) => [
      formatDateTimeDMY(l.created_at),
      l.actor_name,
      l.actor_role || '',
      l.module || l.category_code || '',
      l.action,
      l.target_label || l.target_type || '',
      l.description || '',
      l.result || 'success',
    ]);
    const csv = '\uFEFF' + [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${institution?.code || 'institution'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const successCount = logs.filter((l) => (l.result || 'success') === 'success').length;
  const failCount = logs.length - successCount;

  return (
    <div className="space-y-6">
      <PageHeader
        title="প্রতিষ্ঠান অডিট লগ"
        subtitle="সকল একাডেমিক, আর্থিক ও প্রশাসনিক কার্যক্রমের অপরিবর্তনীয় (Append-Only) ইতিহাস"
        actions={
          <>
            <button type="button" onClick={loadLogs} className={secondaryBtnClass}>
              <RefreshCw className="w-4 h-4" />
              রিফ্রেশ
            </button>
            <button type="button" onClick={exportCsv} className={secondaryBtnClass}>
              <Download className="w-4 h-4" />
              CSV এক্সপোর্ট
            </button>
            <button type="button" onClick={() => window.print()} className={primaryBtnClass}>
              <Printer className="w-4 h-4" />
              প্রিন্ট / PDF
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 no-print">
        <StatCard label="প্রদর্শিত অডিট রেকর্ড" value={logs.length} tone="navy" />
        <StatCard label="সফল কার্যক্রম" value={successCount} tone="emerald" />
        <StatCard label="ব্যর্থ / সতর্কতা" value={failCount} tone={failCount > 0 ? 'crimson' : 'navy'} />
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 no-print">
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ব্যবহারকারী, অ্যাকশন বা বিবরণ খুঁজুন..."
            className={`${inputClass} pl-9`}
          />
        </div>
        <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className={inputClass}>
          <option value="all">সকল মডিউল</option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name_bn}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
          <option value="all">সকল অবস্থা</option>
          <option value="success">সফল</option>
          <option value="failure">ব্যর্থ</option>
        </select>
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            aria-label="শুরুর তারিখ"
            className={inputClass}
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            aria-label="শেষের তারিখ"
            className={inputClass}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
            <ShieldAlert className="w-4 h-4 text-[#6D28D9]" />
            অপরিবর্তনীয় নিরাপত্তা লগ — {institution?.name || 'প্রতিষ্ঠান'}
          </span>
          <span className="font-mono-num">মোট: {logs.length} টি রেকর্ড</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">অডিট লগ লোড হচ্ছে...</div>
        ) : logs.length === 0 ? (
          <div className="p-6">
            <EmptyState title="কোনো অডিট লগ পাওয়া যায়নি" description="নির্বাচিত ফিল্টারে কোনো কার্যক্রম রেকর্ড নেই।" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-4 py-3">তারিখ ও সময়</th>
                  <th className="px-4 py-3">ব্যবহারকারী</th>
                  <th className="px-4 py-3">মডিউল ও অ্যাকশন</th>
                  <th className="px-4 py-3">বিবরণ / লক্ষ্য</th>
                  <th className="px-4 py-3">অবস্থা</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-xs font-mono-num text-slate-500 whitespace-nowrap">
                      {formatDateTimeDMY(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-xs text-slate-900 dark:text-white">{log.actor_name}</div>
                      {log.actor_role && <div className="text-[11px] text-slate-500">{log.actor_role}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono-num text-xs font-semibold text-[#6D28D9] dark:text-violet-400">
                        {log.action}
                      </div>
                      <div className="text-[11px] text-slate-500">{log.module || log.category_code || 'administration'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                      <div>{log.description || log.target_label || '—'}</div>
                      {log.description && log.target_label && (
                        <div className="text-[11px] text-slate-500 mt-0.5">{log.target_label}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusText
                        status={log.result === 'failure' ? 'rejected' : 'active'}
                        labelMap={{
                          active: { label: 'সফল', color: 'text-[#047857] dark:text-emerald-400' },
                          rejected: { label: 'ব্যর্থ', color: 'text-red-700 dark:text-red-400' },
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 2. INSTITUTION INTERNAL MESSAGING MODULE ====================
export function MessagingModule() {
  const { toast } = useApp();
  const [box, setBox] = useState<'inbox' | 'sent'>('inbox');
  const [messages, setMessages] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ recipient_user_id: '', subject: '', body: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [msgRes, recRes] = await Promise.all([
        apiFetch<{ messages: any[]; unreadCount: number }>(`/api/inst/messages?box=${box}`),
        apiFetch<{ recipients: any[] }>('/api/inst/messages/recipients'),
      ]);
      setMessages(msgRes.messages || []);
      setUnreadCount(msgRes.unreadCount || 0);
      setRecipients(recRes.recipients || []);
    } catch (err: any) {
      toast('error', 'বার্তা লোড ব্যর্থ', err.message);
    } finally {
      setLoading(false);
    }
  }, [box, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.recipient_user_id || !form.body.trim()) {
      toast('error', 'প্রাপক এবং বার্তার বিবরণ আবশ্যক');
      return;
    }
    setSending(true);
    try {
      await apiFetch('/api/inst/messages', {
        method: 'POST',
        body: {
          recipient_user_id: Number(form.recipient_user_id),
          subject: form.subject.trim() || 'নতুন বার্তা',
          body: form.body.trim(),
        },
      });
      toast('success', 'বার্তা সফলভাবে পাঠানো হয়েছে');
      setForm({ recipient_user_id: '', subject: '', body: '' });
      setBox('sent');
      await loadData();
    } catch (err: any) {
      toast('error', 'বার্তা পাঠানো ব্যর্থ', err.message);
    } finally {
      setSending(false);
    }
  };

  const markRead = async (id: number) => {
    try {
      await apiFetch(`/api/inst/messages/${id}/read`, { method: 'PATCH' });
      loadData();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="অভ্যন্তরীণ মেসেজিং"
        subtitle="প্রতিষ্ঠানের অ্যাডমিন, শিক্ষক, স্টাফ, শিক্ষার্থী ও অভিভাবকদের মধ্যে নিরাপদ অভ্যন্তরীণ যোগাযোগ"
        actions={
          <button type="button" onClick={loadData} className={secondaryBtnClass}>
            <RefreshCw className="w-4 h-4" />
            রিফ্রেশ
          </button>
        }
      />

      <div className="grid lg:grid-cols-12 gap-6">
        <form
          onSubmit={sendMessage}
          className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="w-4 h-4 text-[#6D28D9]" />
            নতুন বার্তা পাঠান
          </div>
          <div>
            <label className={labelClass}>প্রাপক নির্বাচন করুন *</label>
            <select
              required
              value={form.recipient_user_id}
              onChange={(e) => setForm({ ...form, recipient_user_id: e.target.value })}
              className={inputClass}
            >
              <option value="">-- প্রাপক নির্বাচন করুন --</option>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name} ({r.role_name} · @{r.username})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>বিষয় (Subject)</label>
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="যেমন: ক্লাস রুটিন / অভিভাবক সাক্ষাৎ"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>বার্তা *</label>
            <textarea
              required
              rows={4}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="আপনার বার্তা বিস্তারিত লিখুন..."
              className={inputClass}
            />
          </div>
          <button type="submit" disabled={sending} className={emeraldBtnClass}>
            <Send className="w-4 h-4" />
            {sending ? 'পাঠানো হচ্ছে...' : 'বার্তা পাঠান'}
          </button>
        </form>

        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setBox('inbox')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                box === 'inbox' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              ইনবক্স {unreadCount > 0 ? `(${unreadCount} অপঠিত)` : ''}
            </button>
            <button
              type="button"
              onClick={() => setBox('sent')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                box === 'sent' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              পাঠানো বার্তা
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              বার্তা লোড হচ্ছে...
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              title={box === 'inbox' ? 'ইনবক্সে কোনো বার্তা নেই' : 'কোনো বার্তা পাঠানো হয়নি'}
              description="বাম পাশের ফর্ম থেকে প্রতিষ্ঠানের যেকোনো সদস্যকে নিরাপদ বার্তা পাঠাতে পারবেন।"
            />
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`bg-white dark:bg-slate-900 border rounded-xl p-4 space-y-2 ${
                    box === 'inbox' && !m.is_read
                      ? 'border-[#6D28D9]/60 bg-violet-50/20 dark:bg-violet-950/10'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{m.subject}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {box === 'inbox'
                          ? `প্রেরক: ${m.sender_name} (${m.sender_role})`
                          : `প্রাপক: ${m.recipient_name} (${m.recipient_role})`}
                        {' · '}
                        <span className="font-mono-num">{formatDateTimeDMY(m.created_at)}</span>
                      </div>
                    </div>
                    {box === 'inbox' && !m.is_read ? (
                      <button
                        type="button"
                        onClick={() => markRead(m.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#6D28D9] hover:underline shrink-0 cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        পঠিত চিহ্নিত করুন
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {m.is_read ? 'পঠিত' : 'প্রেরিত'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {m.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
