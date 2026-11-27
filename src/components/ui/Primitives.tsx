import React from 'react';
import { X, AlertTriangle, CheckCircle2, Info, AlertCircle, Printer, Download } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatBDT, formatDateDMY } from '../../lib/api';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2.5 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  subtext,
  tone = 'navy',
}: {
  label: string;
  value: string | number;
  subtext?: string;
  tone?: 'navy' | 'purple' | 'emerald' | 'gold' | 'crimson';
}) {
  const accentMap: Record<string, string> = {
    navy: 'text-slate-900 dark:text-white',
    purple: 'text-[#6D28D9] dark:text-violet-400',
    emerald: 'text-[#047857] dark:text-emerald-400',
    gold: 'text-[#B45309] dark:text-amber-400',
    crimson: 'text-red-700 dark:text-red-400',
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 transition-colors">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-bold font-mono-num tabular-nums ${accentMap[tone]}`}>
        {value}
      </div>
      {subtext && (
        <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{subtext}</div>
      )}
    </div>
  );
}

export function StatusText({
  status,
  labelMap,
}: {
  status: string;
  labelMap?: Record<string, { label: string; color: string }>;
}) {
  const defaults: Record<string, { label: string; color: string }> = {
    active: { label: 'সক্রিয়', color: 'text-[#047857] dark:text-emerald-400' },
    draft: { label: 'ড্রাফট', color: 'text-amber-700 dark:text-amber-400' },
    pending: { label: 'অপেক্ষমাণ', color: 'text-amber-700 dark:text-amber-400' },
    suspended: { label: 'স্থগিত', color: 'text-red-700 dark:text-red-400' },
    inactive: { label: 'নিষ্ক্রিয়', color: 'text-slate-500 dark:text-slate-400' },
    archived: { label: 'আর্কাইভড', color: 'text-amber-700 dark:text-amber-400' },
    locked: { label: 'লক করা', color: 'text-red-700 dark:text-red-400' },
    open: { label: 'খোলা', color: 'text-[#6D28D9] dark:text-violet-400' },
    in_progress: { label: 'চলমান', color: 'text-amber-700 dark:text-amber-400' },
    waiting_for_user: { label: 'ব্যবহারকারীর অপেক্ষায়', color: 'text-sky-700 dark:text-sky-400' },
    resolved: { label: 'সমাধানকৃত', color: 'text-[#047857] dark:text-emerald-400' },
    closed: { label: 'বন্ধ', color: 'text-slate-500 dark:text-slate-400' },
    published: { label: 'প্রকাশিত', color: 'text-[#047857] dark:text-emerald-400' },
    ongoing: { label: 'চলমান', color: 'text-[#6D28D9] dark:text-violet-400' },
    completed: { label: 'সম্পন্ন', color: 'text-sky-700 dark:text-sky-400' },
    present: { label: 'উপস্থিত', color: 'text-[#047857] dark:text-emerald-400' },
    absent: { label: 'অনুপস্থিত', color: 'text-red-700 dark:text-red-400' },
    late: { label: 'বিলম্ব', color: 'text-amber-700 dark:text-amber-400' },
    leave: { label: 'ছুটি', color: 'text-sky-700 dark:text-sky-400' },
    issued: { label: 'ইস্যুকৃত', color: 'text-[#6D28D9] dark:text-violet-400' },
    returned: { label: 'ফেরতপ্রাপ্ত', color: 'text-[#047857] dark:text-emerald-400' },
    overdue: { label: 'মেয়াদোত্তীর্ণ', color: 'text-red-700 dark:text-red-400' },
    one_time: { label: 'এককালীন পেমেন্ট', color: 'text-[#6D28D9] dark:text-violet-400' },
    regular: { label: 'নিয়মিত পেমেন্ট', color: 'text-[#047857] dark:text-emerald-400' },
    free: { label: 'ফ্রি (বেতনমুক্ত)', color: 'text-amber-700 dark:text-amber-400' },
    in_class: { label: 'ক্লাসে আছেন', color: 'text-[#047857] dark:text-emerald-400' },
    break: { label: 'বিরতিতে', color: 'text-amber-700 dark:text-amber-400' },
    on_leave: { label: 'ছুটিতে আছেন', color: 'text-sky-700 dark:text-sky-400' },
    approved: { label: 'অনুমোদিত', color: 'text-[#047857] dark:text-emerald-400' },
    rejected: { label: 'প্রত্যাখ্যাত', color: 'text-red-700 dark:text-red-400' },
    paid: { label: 'পরিশোধিত', color: 'text-[#047857] dark:text-emerald-400' },
    partial: { label: 'আংশিক পরিশোধিত', color: 'text-amber-700 dark:text-amber-400' },
    confirmed: { label: 'উপস্থিতি নিশ্চিত', color: 'text-[#047857] dark:text-emerald-400' },
    unconfirmed: { label: 'সময়সূচি অনুযায়ী (অপেক্ষমাণ)', color: 'text-amber-700 dark:text-amber-400' },
  };
  const merged = labelMap ? { ...defaults, ...labelMap } : defaults;
  const info = merged[status] || { label: status, color: 'text-slate-600 dark:text-slate-400' };
  return <span className={`text-xs font-semibold ${info.color}`}>{info.label}</span>;
}

export const LIVE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  in_class: { label: 'ক্লাসে আছেন', color: 'text-[#047857] dark:text-emerald-400' },
  break: { label: 'বিরতিতে', color: 'text-amber-700 dark:text-amber-400' },
  free: { label: 'অবসর', color: 'text-slate-600 dark:text-slate-300' },
  on_leave: { label: 'ছুটিতে আছেন', color: 'text-sky-700 dark:text-sky-400' },
  absent: { label: 'অনুপস্থিত', color: 'text-red-700 dark:text-red-400' },
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px] no-print">
      <div
        className={`w-full ${maxWidth} max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="বন্ধ করুন"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog() {
  const { confirmState, resolveConfirm } = useApp();
  if (!confirmState) return null;
  const { options } = confirmState;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-[2px]">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg shrink-0 ${options.danger ? 'bg-red-50 dark:bg-red-950/40 text-red-600' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{options.title}</h3>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{options.message}</p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => resolveConfirm(false)}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            বাতিল
          </button>
          <button
            type="button"
            onClick={() => resolveConfirm(true)}
            className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors whitespace-nowrap shrink-0 ${
              options.danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#0F172A] dark:bg-[#6D28D9] hover:opacity-90'
            }`}
          >
            {options.confirmLabel || 'নিশ্চিত করুন'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 max-w-sm w-full no-print">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg"
        >
          {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-[#047857] shrink-0 mt-0.5" />}
          {t.type === 'error' && <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
          {t.type === 'info' && <Info className="w-5 h-5 text-[#6D28D9] shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">{t.title}</div>
            {t.description && (
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 break-words">{t.description}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid gap-4 px-5 py-3.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }).map((__, c) => (
              <div key={c} className="h-4 bg-slate-200/70 dark:bg-slate-800 rounded animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-12 px-6 text-center">
      <div className="text-base font-semibold text-slate-900 dark:text-white">{title}</div>
      {description && (
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (nextPage: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-4 text-xs text-slate-600 dark:text-slate-400">
      <span className="font-mono-num">
        মোট {total} টি রেকর্ড · পৃষ্ঠা {page} / {totalPages}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          পূর্ববর্তী
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          পরবর্তী
        </button>
      </div>
    </div>
  );
}

export function PrintReceiptModal({
  payment,
  institutionName,
  institutionLogo,
  institutionAddress,
  onClose,
}: {
  payment: any;
  institutionName: string;
  institutionLogo?: string;
  institutionAddress?: string;
  onClose: () => void;
}) {
  const { effectiveAppLogo } = useApp();
  if (!payment) return null;

  const paymentTypeLabel =
    payment.payment_type === 'one_time'
      ? 'এককালীন পেমেন্ট'
      : payment.payment_type === 'free'
      ? 'ফ্রি (বেতনমুক্ত)'
      : 'নিয়মিত পেমেন্ট';

  const monthlyPayable = Number(payment.monthly_payable ?? 0);
  const mealCost = Number(payment.meal_cost ?? 0);
  const otherFee = Number(payment.other_fee ?? 0);
  const prevDue = Number(payment.previous_due ?? 0);
  const discount = Number(payment.discount ?? 0);
  const amountPaid = Number(payment.amount_paid ?? 0);
  const remainingDue = Number(payment.remaining_due ?? 0);
  const computedTotal = Math.max(0, Number((monthlyPayable + mealCost + otherFee + prevDue - discount).toFixed(2)));
  const totalPayable =
    payment.total_payable !== undefined && payment.total_payable !== null && Number(payment.total_payable) > 0
      ? Number(payment.total_payable)
      : computedTotal > 0
      ? computedTotal
      : Number((amountPaid + remainingDue).toFixed(2));
  const isLegacyUnitemized =
    monthlyPayable === 0 && mealCost === 0 && otherFee === 0 && prevDue === 0 && amountPaid > 0;

  const triggerPrint = (asPdf = false) => {
    const prevTitle = document.title;
    if (asPdf && payment.receipt_number) {
      document.title = `Student-Receipt-${payment.receipt_number}`;
    }
    window.print();
    if (asPdf) {
      window.setTimeout(() => {
        document.title = prevTitle;
      }, 600);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white text-slate-900 rounded-xl border border-slate-200 shadow-2xl print-container my-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-slate-200 no-print">
          <div className="text-sm font-semibold text-slate-900">
            শিক্ষার্থী পেমেন্ট রসিদ — <span className="font-mono-num">{payment.receipt_number}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => triggerPrint(false)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              প্রিন্ট করুন
            </button>
            <button
              type="button"
              onClick={() => triggerPrint(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#047857] text-white hover:bg-[#065F46] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              PDF ডাউনলোড
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-7 sm:p-8 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 pb-5 border-b-2 border-slate-200">
            <div className="flex items-center gap-3.5">
              <img
                src={institutionLogo || effectiveAppLogo}
                alt={institutionName}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
              />
              <div>
                <h2 className="text-xl font-bold text-[#0F172A]">{institutionName}</h2>
                {institutionAddress && <p className="text-xs text-slate-500">{institutionAddress}</p>}
                <p className="text-xs font-semibold text-[#047857] mt-0.5">
                  অফিশিয়াল শিক্ষার্থী বেতন ও খাবার খরচ রসিদ
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">রসিদ নম্বর</div>
              <div className="text-base font-bold font-mono-num text-[#6D28D9]">{payment.receipt_number}</div>
              <div className="text-xs text-slate-500 mt-1 font-mono-num">
                তারিখ: {formatDateDMY(payment.payment_date)}
              </div>
            </div>
          </div>

          {/* Student Info */}
          <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
            {payment.student_photo ? (
              <img
                src={payment.student_photo}
                alt={payment.student_name}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-[#0F172A] text-white flex items-center justify-center font-bold text-lg shrink-0">
                {(payment.student_name || 'S').charAt(0)}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-2 flex-1 text-xs">
              <div>
                <span className="text-slate-500 block">শিক্ষার্থীর নাম</span>
                <span className="font-semibold text-slate-900">{payment.student_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block">শিক্ষার্থী আইডি / রোল</span>
                <span className="font-mono-num font-semibold text-slate-900">
                  {payment.student_code || '—'} · রোল {payment.roll_number || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">পেমেন্টের মাস</span>
                <span className="font-mono-num font-semibold text-slate-900">
                  {payment.payment_month || payment.payment_period || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">বিভাগ</span>
                <span className="font-medium text-slate-900">{payment.department_name || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">ক্লাস ও জামাত</span>
                <span className="font-medium text-slate-900">
                  {payment.class_name || '—'}
                  {payment.jamaat_name && payment.jamaat_name !== payment.class_name ? ` (${payment.jamaat_name})` : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">পেমেন্ট ধরন</span>
                <span className="font-medium text-slate-900">{paymentTypeLabel}</span>
              </div>
            </div>
          </div>

          {/* Itemized Financial Breakdown Table */}
          <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
            <thead className="bg-slate-100 text-slate-700 text-xs">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">আর্থিক খাতের বিবরণ</th>
                <th className="text-right px-4 py-2.5 font-semibold">পরিমাণ (৳)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLegacyUnitemized ? (
                <tr>
                  <td className="px-4 py-2.5 font-medium">{payment.fee_category || 'মাসিক বেতন / ফি'}</td>
                  <td className="px-4 py-2.5 text-right font-mono-num">{formatBDT(totalPayable)}</td>
                </tr>
              ) : (
                <>
                  <tr>
                    <td className="px-4 py-2.5">মাসিক প্রদেয় (বেতন / ফি)</td>
                    <td className="px-4 py-2.5 text-right font-mono-num">{formatBDT(monthlyPayable)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">খাবার খরচ</td>
                    <td className="px-4 py-2.5 text-right font-mono-num">{formatBDT(mealCost)}</td>
                  </tr>
                  {otherFee > 0 && (
                    <tr>
                      <td className="px-4 py-2.5">অন্যান্য ফি</td>
                      <td className="px-4 py-2.5 text-right font-mono-num">{formatBDT(otherFee)}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="px-4 py-2.5">পূর্বের বকেয়া</td>
                    <td className="px-4 py-2.5 text-right font-mono-num">{formatBDT(prevDue)}</td>
                  </tr>
                  {discount > 0 && (
                    <tr>
                      <td className="px-4 py-2.5">ছাড় (-)</td>
                      <td className="px-4 py-2.5 text-right font-mono-num text-amber-700">-{formatBDT(discount)}</td>
                    </tr>
                  )}
                </>
              )}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-2.5 text-slate-900">মোট প্রদেয়</td>
                <td className="px-4 py-2.5 text-right font-mono-num text-slate-900">{formatBDT(totalPayable)}</td>
              </tr>
              <tr className="bg-emerald-50/70 font-bold">
                <td className="px-4 py-3 text-slate-900">পরিশোধিত টাকা</td>
                <td className="px-4 py-3 text-right font-mono-num text-base text-[#047857]">
                  {formatBDT(amountPaid)}
                </td>
              </tr>
              <tr className="font-semibold">
                <td className="px-4 py-2.5 text-slate-700">অবশিষ্ট বকেয়া</td>
                <td
                  className={`px-4 py-2.5 text-right font-mono-num ${
                    remainingDue > 0 ? 'text-red-700' : 'text-slate-700'
                  }`}
                >
                  {formatBDT(remainingDue)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
            <div>
              পেমেন্ট মাধ্যম: <strong className="text-slate-900">{payment.payment_method}</strong> · গ্রহণকারী:{' '}
              <strong className="text-slate-900">{payment.received_by_name || '—'}</strong>
            </div>
            {payment.note && (
              <div>
                মন্তব্য: <span className="text-slate-900">{payment.note}</span>
              </div>
            )}
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12 pt-10 text-xs text-center text-slate-600">
            <div className="border-t border-slate-300 pt-2">শিক্ষার্থী / অভিভাবকের স্বাক্ষর</div>
            <div className="border-t border-slate-300 pt-2">মুহাসিব / আদায়কারীর স্বাক্ষর ও সিল</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SalaryReceiptModal({
  receipt,
  institutionName,
  institutionLogo,
  institutionAddress,
  onClose,
}: {
  receipt: any;
  institutionName: string;
  institutionLogo?: string;
  institutionAddress?: string;
  onClose: () => void;
}) {
  const { effectiveAppLogo } = useApp();
  if (!receipt) return null;

  const isAdvance = receipt.receipt_type === 'advance';
  const isDueSettle = receipt.receipt_type === 'due_settlement';
  const titleText = isAdvance
    ? 'অতিরিক্ত টাকা উত্তোলন (অগ্রিম) রসিদ'
    : isDueSettle
    ? 'বকেয়া সমন্বয় / ফেরত রসিদ'
    : 'অফিশিয়াল শিক্ষক বেতন ও খাবার খরচ রসিদ';

  const baseSalary = Number(receipt.base_salary || 0);
  const mealCost = Number(receipt.meal_cost || 0);
  const bonus = Number(receipt.bonus || 0);
  const deduction = Number(receipt.deduction || 0);
  const previousDue = Number(receipt.previous_due || 0);
  const dueAdjusted = Number(receipt.due_adjusted || 0);
  const paidAmount = Number(receipt.paid_amount || 0);
  const remainingDue = Number(receipt.remaining_due ?? 0);
  const computedTotalPayable = Math.max(
    0,
    Number((baseSalary + mealCost + bonus - deduction - dueAdjusted).toFixed(2))
  );
  const totalPayable =
    receipt.total_payable !== undefined && receipt.total_payable !== null && Number(receipt.total_payable) > 0
      ? Number(receipt.total_payable)
      : computedTotalPayable;

  const triggerPrint = (asPdf = false) => {
    const prevTitle = document.title;
    if (asPdf && receipt.receipt_number) {
      document.title = `Teacher-Salary-Receipt-${receipt.receipt_number}`;
    }
    window.print();
    if (asPdf) {
      window.setTimeout(() => {
        document.title = prevTitle;
      }, 600);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white text-slate-900 rounded-xl border border-slate-200 shadow-2xl print-container my-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-slate-200 no-print">
          <div className="text-sm font-semibold text-slate-900">
            {titleText} — <span className="font-mono-num">{receipt.receipt_number}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => triggerPrint(false)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              প্রিন্ট করুন
            </button>
            <button
              type="button"
              onClick={() => triggerPrint(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#047857] text-white hover:bg-[#065F46] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              PDF ডাউনলোড
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-7 sm:p-8 space-y-5">
          <div className="flex items-center justify-between gap-4 pb-5 border-b-2 border-slate-200">
            <div className="flex items-center gap-3.5">
              <img
                src={receipt.institution_logo || institutionLogo || effectiveAppLogo}
                alt={receipt.institution_name || institutionName}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
              />
              <div>
                <h2 className="text-xl font-bold text-[#0F172A]">{receipt.institution_name || institutionName}</h2>
                {(receipt.institution_address || institutionAddress) && (
                  <p className="text-xs text-slate-500">{receipt.institution_address || institutionAddress}</p>
                )}
                <p className="text-xs font-semibold text-[#047857] mt-0.5">{titleText}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">রসিদ নম্বর</div>
              <div className="text-base font-bold font-mono-num text-[#6D28D9]">{receipt.receipt_number}</div>
              <div className="text-xs text-slate-500 mt-1 font-mono-num">
                তারিখ: {formatDateDMY(receipt.payment_date)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5 bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block">শিক্ষকের নাম</span>
              <span className="font-semibold text-slate-900">{receipt.teacher_name || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">টিচার আইডি</span>
              <span className="font-mono-num font-semibold text-slate-900">{receipt.teacher_code || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">{isAdvance ? 'উত্তোলনের ধরন' : 'বেতনের মাস'}</span>
              <span className="font-mono-num font-semibold text-slate-900">
                {receipt.salary_month || (isAdvance ? 'অতিরিক্ত / অগ্রিম' : 'বকেয়া সমন্বয়')}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">পেমেন্ট মাধ্যম</span>
              <span className="font-semibold text-slate-900">{receipt.payment_method}</span>
            </div>
            <div>
              <span className="text-slate-500 block">ট্রানজেকশন আইডি</span>
              <span className="font-mono-num font-medium text-slate-900">{receipt.transaction_id || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">অনুমোদনকারী</span>
              <span className="font-semibold text-slate-900">{receipt.approved_by_name || '—'}</span>
            </div>
          </div>

          <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
            <thead className="bg-slate-100 text-slate-700 text-xs">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">আর্থিক খাতের বিবরণ</th>
                <th className="text-right px-4 py-2.5 font-semibold">পরিমাণ (৳)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {!isAdvance && !isDueSettle && (
                <>
                  <tr>
                    <td className="px-4 py-2.5">মাসিক প্রদেয় (মূল বেতন)</td>
                    <td className="px-4 py-2.5 text-right font-mono-num">{formatBDT(baseSalary)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">খাবার খরচ</td>
                    <td className="px-4 py-2.5 text-right font-mono-num">{formatBDT(mealCost)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">বোনাস (+)</td>
                    <td className="px-4 py-2.5 text-right font-mono-num text-[#047857]">+{formatBDT(bonus)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">কর্তন (-)</td>
                    <td className="px-4 py-2.5 text-right font-mono-num text-red-700">-{formatBDT(deduction)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">পূর্বের Due</td>
                    <td className="px-4 py-2.5 text-right font-mono-num">{formatBDT(previousDue)}</td>
                  </tr>
                  {dueAdjusted > 0 && (
                    <tr>
                      <td className="px-4 py-2.5">অগ্রিম বকেয়া সমন্বয় (-)</td>
                      <td className="px-4 py-2.5 text-right font-mono-num text-amber-700">
                        -{formatBDT(dueAdjusted)}
                      </td>
                    </tr>
                  )}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-4 py-2.5 text-slate-900">মোট প্রদেয়</td>
                    <td className="px-4 py-2.5 text-right font-mono-num text-slate-900">{formatBDT(totalPayable)}</td>
                  </tr>
                </>
              )}
              <tr className="bg-emerald-50/70 font-bold">
                <td className="px-4 py-3 text-slate-900">
                  {isAdvance ? 'উত্তোলিত অতিরিক্ত অর্থ' : isDueSettle ? 'সমন্বয়কৃত / ফেরতকৃত অর্থ' : 'পরিশোধিত টাকা'}
                </td>
                <td className="px-4 py-3 text-right font-mono-num text-base text-[#047857]">
                  {formatBDT(paidAmount)}
                </td>
              </tr>
              {!isAdvance && !isDueSettle && (
                <tr className="font-semibold">
                  <td className="px-4 py-2.5 text-slate-700">অবশিষ্ট Due</td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono-num ${
                      remainingDue > 0 ? 'text-red-700' : 'text-slate-700'
                    }`}
                  >
                    {formatBDT(remainingDue)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {receipt.remarks && (
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
              <span className="font-semibold text-slate-800">মন্তব্য / কারণ:</span> {receipt.remarks}
            </div>
          )}

          <div className="grid grid-cols-2 gap-12 pt-10 text-xs text-center text-slate-600">
            <div className="border-t border-slate-300 pt-2">শিক্ষকের স্বাক্ষর</div>
            <div className="border-t border-slate-300 pt-2">মুহতামিম / নাজেমে মালিয়ার স্বাক্ষর ও সিল</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const inputClass =
  'w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/30 focus:border-[#6D28D9] transition-colors';

export const labelClass = 'block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5';

export const primaryBtnClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-[#0F172A] dark:bg-[#6D28D9] text-white hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap shrink-0 cursor-pointer';

export const emeraldBtnClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-[#047857] text-white hover:bg-[#065F46] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer';

export const secondaryBtnClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer';

export const tableHeadClass =
  'bg-slate-50 dark:bg-slate-800/60 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800';
