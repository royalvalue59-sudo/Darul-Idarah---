import React, { useCallback, useEffect, useState } from 'react';
import { Download, Paperclip, Plus, Printer, Send, Trash2 } from 'lucide-react';
import { apiFetch, exportRowsToCsv, formatDateDMY, formatDateTimeDMY, getTodayDhakaYMD } from '../../../lib/api';
import { useApp } from '../../../context/AppContext';
import {
  EmptyState,
  PageHeader,
  StatusText,
  emeraldBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  secondaryBtnClass,
  tableHeadClass,
} from '../../../components/ui/Primitives';
import { FileUploadField } from '../../../components/ui/FileUploadField';

export function NoticesModule() {
  const { toast, liveNotices, markNoticeRead } = useApp();
  const [notices, setNotices] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    audience_type: 'all',
    audience_target_id: '',
    publish_date: getTodayDhakaYMD(),
    expiry_date: '',
    status: 'published',
    attachment_name: '',
    attachment_data: '',
  });

  const loadAll = useCallback(async () => {
    const [nRes, dRes, cRes, rRes] = await Promise.all([
      apiFetch('/api/inst/notices'),
      apiFetch('/api/inst/departments'),
      apiFetch('/api/inst/classes'),
      apiFetch('/api/inst/roles'),
    ]);
    setNotices(nRes.notices || []);
    setDepartments(dRes.departments || []);
    setClasses(cRes.classes || []);
    setRoles(rRes.roles || []);
  }, []);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll, liveNotices.length]);

  const audienceLabel = (a: string) => {
    const map: Record<string, string> = {
      all: 'সকল ব্যবহারকারী',
      teachers: 'সকল শিক্ষক',
      students: 'সকল শিক্ষার্থী',
      guardians: 'সকল অভিভাবক',
      department: 'নির্দিষ্ট বিভাগ',
      class: 'নির্দিষ্ট শ্রেণী',
      role: 'নির্দিষ্ট রোল',
      institutions: 'প্ল্যাটফর্ম বিজ্ঞপ্তি',
    };
    return map[a] || a;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="নোটিশ বোর্ড ও তাৎক্ষণিক বিজ্ঞপ্তি"
        subtitle="প্রকাশিত নোটিশ পেজ রিফ্রেশ ছাড়াই সংশ্লিষ্ট শিক্ষক, শিক্ষার্থী ও অভিভাবকদের ড্যাশবোর্ডে পৌঁছে যাবে"
      />

      <div className="grid lg:grid-cols-12 gap-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/inst/notices', { method: 'POST', body: form });
              setForm({ ...form, title: '', description: '', audience_target_id: '', attachment_name: '', attachment_data: '' });
              toast('success', 'নোটিশ প্রকাশিত হয়েছে ও তাৎক্ষণিকভাবে প্রেরিত হয়েছে');
              loadAll();
            } catch (err: any) {
              toast('error', 'প্রকাশ ব্যর্থ', err.message);
            }
          }}
          className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5 h-fit"
        >
          <h3 className="text-sm font-semibold">নতুন নোটিশ প্রকাশ করুন</h3>
          <div>
            <label className={labelClass}>শিরোনাম *</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>লক্ষ্য দর্শক (Target Audience)</label>
            <select value={form.audience_type} onChange={(e) => setForm({ ...form, audience_type: e.target.value, audience_target_id: '' })} className={inputClass}>
              <option value="all">সকল ব্যবহারকারী</option>
              <option value="teachers">সকল শিক্ষক</option>
              <option value="students">সকল শিক্ষার্থী</option>
              <option value="guardians">সকল অভিভাবক</option>
              <option value="department">নির্দিষ্ট বিভাগ</option>
              <option value="class">নির্দিষ্ট শ্রেণী</option>
              <option value="role">নির্দিষ্ট রোল</option>
            </select>
          </div>
          {form.audience_type === 'department' && (
            <select value={form.audience_target_id} onChange={(e) => setForm({ ...form, audience_target_id: e.target.value })} className={inputClass}>
              <option value="">-- বিভাগ নির্বাচন --</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          {form.audience_type === 'class' && (
            <select value={form.audience_target_id} onChange={(e) => setForm({ ...form, audience_target_id: e.target.value })} className={inputClass}>
              <option value="">-- শ্রেণী নির্বাচন --</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.department_name} — {c.name}</option>)}
            </select>
          )}
          {form.audience_type === 'role' && (
            <select value={form.audience_target_id} onChange={(e) => setForm({ ...form, audience_target_id: e.target.value })} className={inputClass}>
              <option value="">-- রোল নির্বাচন --</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>প্রকাশের তারিখ</label>
              <input type="date" value={form.publish_date} onChange={(e) => setForm({ ...form, publish_date: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>মেয়াদোত্তীর্ণ তারিখ</label>
              <input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>বিস্তারিত বিবরণ *</label>
            <textarea required rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>নোটিশ সংযুক্তি (ঐচ্ছিক)</label>
            <FileUploadField
              category="attachment"
              module="notice"
              buttonLabel="ফাইল সংযুক্ত করুন"
              valueUrl={form.attachment_data}
              valueName={form.attachment_name}
              compact
              onUploaded={(res) => setForm((f) => ({ ...f, attachment_data: res.url, attachment_name: res.original_name }))}
              onClear={form.attachment_data ? () => setForm((f) => ({ ...f, attachment_data: '', attachment_name: '' })) : undefined}
              onError={(msg) => toast('error', 'ফাইল আপলোড ব্যর্থ', msg)}
            />
          </div>
          <button type="submit" className={emeraldBtnClass}><Send className="w-4 h-4" /> নোটিশ প্রকাশ করুন</button>
        </form>

        <div className="lg:col-span-7 space-y-3">
          {notices.length === 0 ? (
            <EmptyState title="কোনো নোটিশ নেই" />
          ) : (
            notices.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.is_read && markNoticeRead(n.id)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-sm">{n.title}</h4>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {audienceLabel(n.audience_type)} · {formatDateDMY(n.publish_date)} · {n.created_by_name}
                    </div>
                  </div>
                  {n.institution_id && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await apiFetch(`/api/inst/notices/${n.id}`, { method: 'DELETE' });
                        loadAll();
                      }}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{n.description}</p>
                {n.attachment_data && (
                  <div className="pt-1">
                    <a
                      href={String(n.attachment_data).startsWith('/api/uploads/') ? `${n.attachment_data}?download=1` : n.attachment_data}
                      download={n.attachment_name || 'notice-attachment'}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6D28D9] dark:text-violet-400 hover:underline"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {n.attachment_name || 'সংযুক্ত ফাইল ডাউনলোড করুন'}
                    </a>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function ReportsModule() {
  const { institution, hasPermission } = useApp();
  const ALL_REPORT_TYPES = [
    { id: 'students', label: 'শিক্ষার্থী রিপোর্ট', mod: 'students' },
    { id: 'teachers', label: 'শিক্ষক ও কর্মচারী রিপোর্ট', mod: 'teachers' },
    { id: 'attendance', label: 'উপস্থিতি রিপোর্ট', mod: 'attendance' },
    { id: 'departments', label: 'বিভাগীয় রিপোর্ট', mod: 'academic' },
    { id: 'classes', label: 'শ্রেণীভিত্তিক রিপোর্ট', mod: 'academic' },
    { id: 'exams', label: 'পরীক্ষা ও মূল্যায়ন রিপোর্ট', mod: 'exams' },
    { id: 'fees', label: 'শিক্ষার্থী ফি ও খাবার খরচ আদায় রিপোর্ট', mod: 'finance' },
    { id: 'teacher_salary', label: 'শিক্ষক বেতন ও খাবার খরচ রিপোর্ট', mod: 'finance' },
    { id: 'dues', label: 'বকেয়া ফি রিপোর্ট', mod: 'finance' },
    { id: 'income', label: 'আয় রিপোর্ট', mod: 'finance' },
    { id: 'expense', label: 'ব্যয় রিপোর্ট', mod: 'finance' },
    { id: 'hostel', label: 'দারুল একামা রিপোর্ট', mod: 'hostel' },
    { id: 'library', label: 'লাইব্রেরি রিপোর্ট', mod: 'library' },
  ];
  const COLUMN_LABELS: Record<string, string> = {
    receipt_number: 'রসিদ নম্বর',
    payment_date: 'তারিখ',
    payment_month: 'মাস',
    salary_month: 'বেতনের মাস',
    student_code: 'শিক্ষার্থী আইডি',
    teacher_code: 'টিচার আইডি',
    roll_number: 'রোল',
    full_name: 'নাম',
    student_name: 'শিক্ষার্থী',
    teacher_name: 'শিক্ষক',
    department: 'বিভাগ',
    class_name: 'ক্লাস',
    jamaat_name: 'জামাত',
    fee_type: 'ফি ধরন',
    payment_type: 'পেমেন্ট ধরন',
    monthly_fee: 'মাসিক বেতন/ফি',
    monthly_salary: 'মাসিক বেতন',
    monthly_meal_cost: 'মাসিক খাবার খরচ',
    total_monthly_payable: 'মোট মাসিক প্রদেয়',
    monthly_payable: 'মাসিক প্রদেয়',
    base_salary: 'মাসিক প্রদেয়',
    meal_cost: 'খাবার খরচ',
    other_fee: 'অন্যান্য ফি',
    bonus: 'বোনাস',
    deduction: 'কর্তন',
    previous_due: 'পূর্বের বকেয়া',
    discount: 'ছাড়',
    total_payable: 'মোট প্রদেয়',
    amount_paid: 'পরিশোধিত',
    paid_amount: 'পরিশোধিত',
    fee_paid_part: 'বেতন/ফি অংশ',
    salary_paid_part: 'বেতন অংশ',
    meal_paid_part: 'খাবার অংশ',
    remaining_due: 'অবশিষ্ট বকেয়া',
    payment_method: 'মাধ্যম',
  };
  const REPORT_TYPES = ALL_REPORT_TYPES.filter((rt) => hasPermission(rt.mod, 'view'));
  const firstPermittedReport = REPORT_TYPES[0]?.id || '';

  const [reportType, setReportType] = useState(firstPermittedReport);
  const [departments, setDepartments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [deptId, setDeptId] = useState('');
  const [classId, setClassId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (firstPermittedReport && !REPORT_TYPES.some((r) => r.id === reportType)) {
      setReportType(firstPermittedReport);
    }
  }, [firstPermittedReport, reportType]);

  useEffect(() => {
    if (hasPermission('academic', 'view') || hasPermission('students', 'view') || hasPermission('attendance', 'view') || hasPermission('exams', 'view')) {
      Promise.all([apiFetch('/api/inst/departments'), apiFetch('/api/inst/classes')])
        .then(([dRes, cRes]) => {
          setDepartments(dRes.departments || []);
          setClasses(cRes.classes || []);
        })
        .catch(() => {});
    }
  }, [hasPermission]);

  const fetchReport = useCallback(async () => {
    if (!reportType) {
      setRows([]);
      return;
    }
    const q = new URLSearchParams({ type: reportType });
    if (deptId) q.set('department_id', deptId);
    if (classId) q.set('class_id', classId);
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const res = await apiFetch(`/api/inst/reports?${q.toString()}`);
    setRows(res.rows || []);
  }, [reportType, deptId, classId, from, to]);

  useEffect(() => {
    fetchReport().catch(() => {});
  }, [fetchReport]);

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="প্রাতিষ্ঠানিক রিপোর্ট সেন্টার"
        subtitle="তারিখ, বিভাগ ও শ্রেণী ফিল্টারসহ সকল মডিউলের প্রিন্ট ও এক্সপোর্টযোগ্য প্রতিবেদন"
        actions={
          <div className="flex items-center gap-2 no-print">
            {rows.length > 0 && (
              <button type="button" onClick={() => exportRowsToCsv(`darul-idarah-${reportType}-report.csv`, rows)} className={secondaryBtnClass}>
                <Download className="w-4 h-4" /> CSV
              </button>
            )}
            <button type="button" onClick={() => window.print()} className={primaryBtnClass}>
              <Printer className="w-4 h-4" /> প্রিন্ট / PDF
            </button>
          </div>
        }
      />

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 no-print">
        <div>
          <label className={labelClass}>রিপোর্টের ধরন</label>
          <select value={reportType} onChange={(e) => setReportType(e.target.value)} className={inputClass}>
            {REPORT_TYPES.map((rt) => <option key={rt.id} value={rt.id}>{rt.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>বিভাগ</label>
          <select value={deptId} onChange={(e) => { setDeptId(e.target.value); setClassId(''); }} className={inputClass}>
            <option value="">সকল বিভাগ</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>শ্রেণী</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputClass}>
            <option value="">সকল শ্রেণী</option>
            {classes.filter((c) => !deptId || String(c.department_id) === deptId).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>শুরুর তারিখ</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>শেষ তারিখ</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print-container">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="font-bold text-sm">{institution?.name}</div>
            <div className="text-xs text-slate-500">
              {REPORT_TYPES.find((r) => r.id === reportType)?.label} · মোট {rows.length} টি রেকর্ড
            </div>
          </div>
          <div className="text-xs font-mono-num text-slate-500">তারিখ: {formatDateDMY(getTodayDhakaYMD())}</div>
        </div>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">নির্বাচিত ফিল্টারে কোনো তথ্য পাওয়া যায়নি।</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className={tableHeadClass}>
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="px-4 py-3 whitespace-nowrap">
                      {COLUMN_LABELS[col] || col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-2.5 whitespace-nowrap font-mono-num">
                        {row[col] !== null && row[col] !== undefined ? String(row[col]) : '—'}
                      </td>
                    ))}
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

export function InstitutionSupportModule() {
  const { toast } = useApp();
  const [tickets, setTickets] = useState<any[]>([]);
  const [active, setActive] = useState<{ ticket: any; replies: any[] } | null>(null);
  const [supportLinks, setSupportLinks] = useState<any>(null);
  const [form, setForm] = useState({
    subject: '',
    category: 'টেকনিক্যাল',
    priority: 'medium',
    description: '',
    attachment_name: '',
    attachment_data: '',
  });
  const [replyText, setReplyText] = useState('');

  const load = useCallback(async () => {
    const [res, sRes] = await Promise.all([
      apiFetch('/api/inst/support'),
      apiFetch<any>('/api/inst/support-settings').catch(() => null),
    ]);
    setTickets(res.tickets || []);
    if (sRes?.effective) setSupportLinks(sRes.effective);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const openTicket = async (id: number) => {
    const res = await apiFetch(`/api/inst/support/${id}`);
    setActive(res);
  };

  const waHref = supportLinks?.whatsapp_number
    ? `https://wa.me/${String(supportLinks.whatsapp_number).replace(/[^\d]/g, '')}`
    : '';

  return (
    <div className="space-y-6">
      <PageHeader title="সাপোর্ট সেন্টার" subtitle="প্ল্যাটফর্ম অ্যাডমিনের কাছে সমস্যা রিপোর্ট করুন এবং সরাসরি হোয়াটসঅ্যাপ / ফেসবুকে যোগাযোগ করুন" />

      {supportLinks && (supportLinks.whatsapp_enabled || supportLinks.facebook_enabled || supportLinks.support_email) && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {supportLinks.whatsapp_enabled && waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 hover:border-emerald-400 transition-colors"
            >
              <div>
                <div className="text-xs font-semibold text-[#047857] dark:text-emerald-400">
                  WhatsApp সাপোর্ট {supportLinks.whatsapp_source === 'institution' ? '(প্রতিষ্ঠান)' : '(গ্লোবাল)'}
                </div>
                <div className="text-sm font-bold font-mono-num text-slate-900 dark:text-white mt-0.5">
                  {supportLinks.whatsapp_number}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">সরাসরি চ্যাট শুরু করতে ক্লিক করুন</div>
              </div>
              <span className="px-3 py-1.5 rounded-lg bg-[#047857] text-white text-xs font-medium shrink-0">
                চ্যাট করুন
              </span>
            </a>
          )}
          {supportLinks.facebook_enabled && supportLinks.facebook_url && (
            <a
              href={supportLinks.facebook_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 p-4 rounded-xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900/60 hover:border-violet-400 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#6D28D9] dark:text-violet-400">
                  Facebook সাপোর্ট {supportLinks.facebook_source === 'institution' ? '(প্রতিষ্ঠান)' : '(গ্লোবাল)'}
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                  অফিশিয়াল ফেসবুক পেজ
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">{supportLinks.facebook_url}</div>
              </div>
              <span className="px-3 py-1.5 rounded-lg bg-[#6D28D9] text-white text-xs font-medium shrink-0">
                ভিজিট করুন
              </span>
            </a>
          )}
          {(supportLinks.support_email || supportLinks.support_description) && (
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">সাপোর্ট তথ্য</div>
              {supportLinks.support_email && (
                <div className="text-sm font-mono-num font-semibold text-slate-900 dark:text-white mt-0.5">
                  {supportLinks.support_email}
                </div>
              )}
              {supportLinks.support_description && (
                <div className="text-xs text-slate-500 mt-1">{supportLinks.support_description}</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/inst/support', { method: 'POST', body: form });
              setForm({ subject: '', category: 'টেকনিক্যাল', priority: 'medium', description: '', attachment_name: '', attachment_data: '' });
              toast('success', 'সাপোর্ট টিকেট জমা হয়েছে');
              load();
            } catch (err: any) {
              toast('error', 'ব্যর্থ', err.message);
            }
          }}
          className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5 h-fit"
        >
          <h3 className="text-sm font-semibold">নতুন সাপোর্ট টিকেট</h3>
          <div>
            <label className={labelClass}>বিষয় *</label>
            <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>ক্যাটাগরি</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                <option value="টেকনিক্যাল">টেকনিক্যাল</option>
                <option value="অ্যাকাউন্ট">অ্যাকাউন্ট ও লগইন</option>
                <option value="হিসাব ও ফি">হিসাব ও ফি</option>
                <option value="পরীক্ষা ও ফলাফল">পরীক্ষা ও ফলাফল</option>
                <option value="অন্যান্য">অন্যান্য</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>অগ্রাধিকার</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputClass}>
                <option value="low">কম</option>
                <option value="medium">মাঝারি</option>
                <option value="high">উচ্চ</option>
                <option value="urgent">জরুরি</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>বিস্তারিত বিবরণ *</label>
            <textarea required rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>স্ক্রিনশট / ডকুমেন্ট সংযুক্তি (ঐচ্ছিক)</label>
            <FileUploadField
              category="attachment"
              module="support"
              buttonLabel="ফাইল সংযুক্ত করুন"
              valueUrl={(form as any).attachment_data || ''}
              valueName={(form as any).attachment_name || ''}
              compact
              onUploaded={(res) => setForm((f: any) => ({ ...f, attachment_data: res.url, attachment_name: res.original_name }))}
              onClear={(form as any).attachment_data ? () => setForm((f: any) => ({ ...f, attachment_data: '', attachment_name: '' })) : undefined}
              onError={(msg) => toast('error', 'ফাইল আপলোড ব্যর্থ', msg)}
            />
          </div>
          <button type="submit" className={emeraldBtnClass}><Plus className="w-4 h-4" /> টিকেট জমা দিন</button>
        </form>

        <div className="lg:col-span-8 space-y-4">
          {tickets.length === 0 ? (
            <EmptyState title="কোনো সাপোর্ট টিকেট জমা দেওয়া হয়নি" />
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2.5">
                {tickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTicket(t.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                      active?.ticket.id === t.id ? 'border-[#6D28D9] bg-violet-50/40 dark:bg-violet-950/20' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono-num font-bold text-[#6D28D9]">{t.ticket_code}</span>
                      <StatusText status={t.status} />
                    </div>
                    <div className="font-semibold text-sm mt-1">{t.subject}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{t.category} · {formatDateDMY(t.created_at)}</div>
                  </button>
                ))}
              </div>

              <div>
                {active ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                    <div>
                      <div className="text-xs font-mono-num text-[#6D28D9]">{active.ticket.ticket_code}</div>
                      <h4 className="font-bold text-sm mt-0.5">{active.ticket.subject}</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 whitespace-pre-wrap">{active.ticket.description}</p>
                      {active.ticket.attachment_data && (
                        <a
                          href={
                            String(active.ticket.attachment_data).startsWith('/api/uploads/')
                              ? `${active.ticket.attachment_data}?download=1`
                              : active.ticket.attachment_data
                          }
                          download={active.ticket.attachment_name || 'ticket-attachment'}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#6D28D9] dark:text-violet-400 hover:underline"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          {active.ticket.attachment_name || 'সংযুক্ত ফাইল ডাউনলোড'}
                        </a>
                      )}
                    </div>
                    <div className="space-y-2.5 max-h-56 overflow-y-auto">
                      {active.replies.map((r) => (
                        <div key={r.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs">
                          <div className="flex justify-between text-slate-500">
                            <strong className="text-slate-900 dark:text-white">{r.author_name}</strong>
                            <span className="font-mono-num">{formatDateTimeDMY(r.created_at)}</span>
                          </div>
                          <p className="mt-1">{r.message}</p>
                        </div>
                      ))}
                    </div>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!replyText.trim()) return;
                        await apiFetch(`/api/inst/support/${active.ticket.id}/reply`, { method: 'POST', body: { message: replyText.trim() } });
                        setReplyText('');
                        openTicket(active.ticket.id);
                      }}
                      className="space-y-2"
                    >
                      <textarea rows={2} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="উত্তর লিখুন..." className={inputClass} />
                      <button type="submit" className={primaryBtnClass}>উত্তর পাঠান</button>
                    </form>
                  </div>
                ) : (
                  <EmptyState title="বিস্তারিত দেখতে টিকেট নির্বাচন করুন" />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
