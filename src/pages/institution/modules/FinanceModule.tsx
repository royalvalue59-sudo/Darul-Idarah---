import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, BarChart3, Plus, Printer, Receipt, RotateCcw, Search } from 'lucide-react';
import { apiFetch, formatBDT, formatDateDMY, getTodayDhakaYMD } from '../../../lib/api';
import { useApp } from '../../../context/AppContext';
import {
  EmptyState,
  Modal,
  PageHeader,
  PrintReceiptModal,
  StatCard,
  StatusText,
  emeraldBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  secondaryBtnClass,
  tableHeadClass,
} from '../../../components/ui/Primitives';

export function FinanceModule() {
  const { toast, institution } = useApp();
  const [tab, setTab] = useState<'dashboard' | 'fees' | 'history' | 'reports' | 'income_expense' | 'accounts'>('dashboard');
  const [fin, setFin] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [receiptModal, setReceiptModal] = useState<any>(null);

  // Fee Entry state
  const currentMonth = getTodayDhakaYMD().slice(0, 7);
  const [stuQuery, setStuQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [monthStatus, setMonthStatus] = useState<any>(null);
  const [feeSubmitting, setFeeSubmitting] = useState(false);
  const [feeForm, setFeeForm] = useState({
    payment_month: currentMonth,
    payment_type: 'regular',
    fee_category: 'মাসিক বেতন ও খাবার খরচ',
    payment_period: currentMonth,
    monthly_payable: '0',
    meal_cost: '0',
    other_fee: '0',
    previous_due: '0',
    discount: '0',
    amount_paid: '',
    payment_date: getTodayDhakaYMD(),
    payment_method: 'নগদ',
    account_id: '',
    note: '',
  });

  // Finance Reports state (Monthly & Yearly)
  const [reportPeriod, setReportPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [reportMonth, setReportMonth] = useState(currentMonth);
  const [reportYear, setReportYear] = useState(currentMonth.slice(0, 4));
  const [finReport, setFinReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Income/Expense transaction form
  const [txForm, setTxForm] = useState({
    type: 'income',
    tx_date: getTodayDhakaYMD(),
    category_id: '',
    account_id: '',
    description: '',
    amount: '',
    payment_method: 'নগদ',
    reference: '',
    note: '',
  });
  const [txFilterType, setTxFilterType] = useState('all');
  const [reverseTarget, setReverseTarget] = useState<any>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);

  // Category & Account forms
  const [catForm, setCatForm] = useState({ name: '', type: 'income' });
  const [accForm, setAccForm] = useState({ name: '', account_type: 'নগদ', opening_balance: '0' });

  const loadAll = useCallback(async () => {
    const [fRes, pRes, sRes, tRes] = await Promise.all([
      apiFetch('/api/inst/finance/dashboard'),
      apiFetch('/api/inst/fees/payments'),
      apiFetch('/api/inst/finance/students'),
      apiFetch('/api/inst/finance/transactions'),
    ]);
    setFin(fRes);
    setPayments(pRes.payments || []);
    setStudents(sRes.students || []);
    setTransactions(tRes.transactions || []);
  }, []);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  const loadFinanceReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const qs =
        reportPeriod === 'monthly'
          ? `period=monthly&month=${encodeURIComponent(reportMonth)}`
          : `period=yearly&year=${encodeURIComponent(reportYear)}`;
      const res = await apiFetch<any>(`/api/inst/finance/reports?${qs}`);
      setFinReport(res);
    } catch {
      setFinReport(null);
    } finally {
      setReportLoading(false);
    }
  }, [reportPeriod, reportMonth, reportYear]);

  useEffect(() => {
    if (tab === 'reports') {
      loadFinanceReport();
    }
  }, [tab, loadFinanceReport]);

  const loadStudentMonthStatus = useCallback(async (studentId: number, payMonth: string) => {
    if (!studentId || !payMonth) {
      setMonthStatus(null);
      return;
    }
    try {
      const res = await apiFetch<any>(
        `/api/inst/fees/month-status?student_id=${encodeURIComponent(String(studentId))}&month=${encodeURIComponent(payMonth)}`
      );
      setMonthStatus(res);
      const isPartial = Boolean(res.is_partial_installment);
      const nextMonthly = isPartial ? 0 : Number(res.monthly_payable ?? res.monthly_fee ?? 0);
      const nextMeal = isPartial ? 0 : Number(res.meal_cost ?? res.monthly_meal_cost ?? 0);
      const nextPrevDue = Number(res.previous_due ?? 0);
      const totalDueNow = Math.max(0, Number((nextMonthly + nextMeal + nextPrevDue).toFixed(2)));
      setFeeForm((prev) => ({
        ...prev,
        payment_month: payMonth,
        payment_period: payMonth,
        payment_type: res.fee_type || res.student?.fee_type || prev.payment_type || 'regular',
        monthly_payable: String(nextMonthly),
        meal_cost: String(nextMeal),
        other_fee: '0',
        previous_due: String(nextPrevDue),
        discount: '0',
        amount_paid: res.is_fully_paid ? '0' : String(totalDueNow),
      }));
    } catch {
      setMonthStatus(null);
    }
  }, []);

  const selectStudentForFee = (s: any) => {
    setSelectedStudent(s);
    setStuQuery('');
    const targetMonth = feeForm.payment_month || currentMonth;
    loadStudentMonthStatus(s.id, targetMonth);
  };

  useEffect(() => {
    if (selectedStudent?.id && feeForm.payment_month) {
      loadStudentMonthStatus(selectedStudent.id, feeForm.payment_month);
    }
  }, [selectedStudent?.id, feeForm.payment_month, loadStudentMonthStatus]);

  const monthlyPayableNum = Number(feeForm.monthly_payable || 0);
  const mealCostNum = Number(feeForm.meal_cost || 0);
  const otherFeeNum = Number(feeForm.other_fee || 0);
  const prevDueNum = Number(feeForm.previous_due || 0);
  const discountNum = Number(feeForm.discount || 0);
  const computedTotalPayable = Math.max(
    0,
    Number((monthlyPayableNum + mealCostNum + otherFeeNum + prevDueNum - discountNum).toFixed(2))
  );
  const amountPaidNum = Number(feeForm.amount_paid || 0);
  const computedRemainingDue = Math.max(0, Number((computedTotalPayable - amountPaidNum).toFixed(2)));
  const isDuplicateStudentMonth = Boolean(monthStatus?.is_fully_paid) && feeForm.payment_type === 'regular';

  const handleRecordFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) {
      toast('error', 'অনুগ্রহ করে প্রথমে একজন শিক্ষার্থী নির্বাচন করুন');
      return;
    }
    if (isDuplicateStudentMonth) {
      toast('error', 'ডুপ্লিকেট পেমেন্ট অনুমোদিত নয়', 'এই মাসের পূর্ণ বেতন ও খাবার খরচ ইতিমধ্যেই পরিশোধ করা হয়েছে।');
      return;
    }
    setFeeSubmitting(true);
    try {
      const res = await apiFetch<any>('/api/inst/fees/payments', {
        method: 'POST',
        body: {
          student_id: selectedStudent.id,
          payment_type: feeForm.payment_type,
          fee_category: feeForm.fee_category,
          payment_month: feeForm.payment_month,
          payment_period: feeForm.payment_period || feeForm.payment_month,
          monthly_payable: monthlyPayableNum,
          meal_cost: mealCostNum,
          other_fee: otherFeeNum,
          previous_due: prevDueNum,
          discount: discountNum,
          amount_paid: amountPaidNum,
          payment_date: feeForm.payment_date,
          payment_method: feeForm.payment_method,
          account_id: feeForm.account_id ? Number(feeForm.account_id) : null,
          note: feeForm.note,
        },
      });
      toast('success', 'পেমেন্ট সংরক্ষণ ও রসিদ তৈরি হয়েছে', `রসিদ: ${res.payment.receipt_number}`);
      setReceiptModal(res.payment);
      await loadAll();
      await loadStudentMonthStatus(selectedStudent.id, feeForm.payment_month);
    } catch (err: any) {
      toast('error', 'পেমেন্ট সংরক্ষণ ব্যর্থ', err.message);
    } finally {
      setFeeSubmitting(false);
    }
  };

  const matchingStudents = stuQuery.trim()
    ? students
        .filter((s) =>
          `${s.full_name} ${s.roll_number} ${s.student_code} ${s.guardian_mobile}`
            .toLowerCase()
            .includes(stuQuery.toLowerCase())
        )
        .slice(0, 6)
    : [];

  const filteredTx =
    txFilterType === 'all' ? transactions : transactions.filter((t) => t.type === txFilterType);

  return (
    <div className="space-y-6">
      <PageHeader
        title="হিসাব ও অর্থব্যবস্থা (৳)"
        subtitle="শিক্ষার্থী ফি আদায়, তাৎক্ষণিক রসিদ, আয়-ব্যয় খাত, তহবিল ব্যালেন্স ও লেনদেন ইতিহাস"
        actions={
          <button type="button" onClick={() => setTab('fees')} className={emeraldBtnClass}>
            <Receipt className="w-4 h-4" />
            শিক্ষার্থী ফি গ্রহণ
          </button>
        }
      />

      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit flex-wrap">
        {[
          { id: 'dashboard', label: 'আর্থিক ড্যাশবোর্ড' },
          { id: 'fees', label: 'শিক্ষার্থী ফি ও খাবার এন্ট্রি' },
          { id: 'history', label: `পেমেন্ট ও রসিদ (${payments.length})` },
          { id: 'reports', label: 'মাসিক ও বার্ষিক রিপোর্ট' },
          { id: 'income_expense', label: 'আয় ও ব্যয় লেনদেন' },
          { id: 'accounts', label: 'খাত ও তহবিল অ্যাকাউন্ট' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as any)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              tab === t.id ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: DASHBOARD */}
      {tab === 'dashboard' && fin && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="মোট আয়" value={formatBDT(fin.summary.totalIncome)} tone="emerald" />
            <StatCard label="মোট ব্যয়" value={formatBDT(fin.summary.totalExpense)} tone="crimson" />
            <StatCard
              label="বর্তমান ব্যালেন্স (আয় - ব্যয়)"
              value={formatBDT(fin.summary.currentBalance)}
              tone={fin.summary.currentBalance >= 0 ? 'navy' : 'crimson'}
            />
            <StatCard
              label="চলতি মাসের আয় / ব্যয়"
              value={formatBDT(fin.summary.monthlyIncome)}
              subtext={`ব্যয়: ${formatBDT(fin.summary.monthlyExpense)} · আজকের আয়: ${formatBDT(fin.summary.todayIncome)}`}
              tone="purple"
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="শিক্ষার্থীদের মাসিক বেতন/ফি (আয়)" value={formatBDT(fin.summary.studentFeeIncome)} tone="emerald" />
            <StatCard label="শিক্ষার্থীদের খাবার খরচ (আয়)" value={formatBDT(fin.summary.studentMealIncome || 0)} tone="gold" />
            <StatCard label="শিক্ষকদের মাসিক বেতন (ব্যয়)" value={formatBDT(fin.summary.teacherSalaryExpense || 0)} tone="crimson" />
            <StatCard label="শিক্ষকদের খাবার খরচ (ব্যয়)" value={formatBDT(fin.summary.teacherMealExpense || 0)} tone="navy" />
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
              সাম্প্রতিক লেনদেনসমূহ
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="px-5 py-3">তারিখ</th>
                    <th className="px-4 py-3">খাত ও বিবরণ</th>
                    <th className="px-4 py-3">মাধ্যম / রেফারেন্স</th>
                    <th className="px-5 py-3 text-right">পরিমাণ (৳)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {fin.recentTransactions.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-8 text-center text-xs text-slate-500">কোনো লেনদেন নেই।</td></tr>
                  ) : (
                    fin.recentTransactions.map((tx: any) => (
                      <tr key={tx.id}>
                        <td className="px-5 py-3 font-mono-num text-xs text-slate-500">
                          <div>{formatDateDMY(tx.tx_date)}</div>
                          {tx.tx_code && <div className="text-[11px] text-[#6D28D9] dark:text-violet-400">{tx.tx_code}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium flex items-center gap-2 flex-wrap">
                            <span>{tx.description}</span>
                            {Boolean(tx.is_reversed) && (
                              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">(সমন্বয়কৃত)</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">{tx.category_name} · {tx.handled_by}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 font-mono-num">
                          {tx.payment_method}{tx.reference ? ` · ${tx.reference}` : ''}
                        </td>
                        <td className={`px-5 py-3 text-right font-mono-num font-bold ${tx.type === 'income' ? 'text-[#047857]' : 'text-red-600'}`}>
                          {tx.type === 'income' ? '+' : '-'}{formatBDT(tx.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STUDENT FEE ENTRY */}
      {tab === 'fees' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold">১. শিক্ষার্থী খুঁজুন</h3>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  value={stuQuery}
                  onChange={(e) => setStuQuery(e.target.value)}
                  placeholder="নাম, রোল (000001) বা মোবাইল লিখে খুঁজুন..."
                  className={`${inputClass} pl-10`}
                />
              </div>
              {matchingStudents.length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  {matchingStudents.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectStudentForFee(s)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2 text-xs cursor-pointer"
                    >
                      <div>
                        <div className="font-semibold">{s.full_name}</div>
                        <div className="text-slate-500">{s.department_name} · {s.class_name}</div>
                      </div>
                      <span className="font-mono-num font-bold text-[#6D28D9]">{s.roll_number}</span>
                    </button>
                  ))}
                </div>
              )}
              {!stuQuery && students.length > 0 && !selectedStudent && (
                <div className="space-y-1.5 pt-2">
                  <div className="text-xs text-slate-500">দ্রুত নির্বাচন:</div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {students.slice(0, 10).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => selectStudentForFee(s)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs cursor-pointer"
                      >
                        <span className="font-medium truncate">{s.full_name}</span>
                        <span className="font-mono-num text-[#6D28D9]">{s.roll_number}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedStudent && (
              <div className="bg-white dark:bg-slate-900 border border-[#6D28D9]/40 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3.5">
                  {selectedStudent.photo_url ? (
                    <img src={selectedStudent.photo_url} alt={selectedStudent.full_name} referrerPolicy="no-referrer" className="w-14 h-14 rounded-xl object-cover border" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-[#0F172A] text-white flex items-center justify-center text-lg font-bold">
                      {selectedStudent.full_name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-base truncate">{selectedStudent.full_name}</div>
                    <div className="text-xs font-mono-num text-[#6D28D9] dark:text-violet-400">
                      আইডি: {selectedStudent.student_code} · রোল: {selectedStudent.roll_number}
                    </div>
                    <div className="text-xs text-slate-500">
                      বিভাগ: {selectedStudent.department_name || '—'} · ক্লাস: {selectedStudent.class_name || '—'}
                      {selectedStudent.jamaat_name ? ` · জামাত: ${selectedStudent.jamaat_name}` : ''}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <div className="text-[11px] text-slate-500">মাসিক বেতন/ফি</div>
                    <div className="font-mono-num font-bold">{formatBDT(selectedStudent.monthly_fee || 0)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <div className="text-[11px] text-slate-500">খাবার খরচ</div>
                    <div className="font-mono-num font-bold text-amber-700 dark:text-amber-400">
                      {formatBDT(selectedStudent.monthly_meal_cost || 0)}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <div className="text-[11px] text-slate-500">মোট মাসিক</div>
                    <div className="font-mono-num font-bold text-[#047857] dark:text-emerald-400">
                      {formatBDT(
                        selectedStudent.total_monthly_payable ??
                          Number(selectedStudent.monthly_fee || 0) + Number(selectedStudent.monthly_meal_cost || 0)
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span>
                    মোট আদায়কৃত:{' '}
                    <strong className="font-mono-num text-[#047857]">{formatBDT(selectedStudent.total_paid)}</strong>
                  </span>
                  <StatusText status={selectedStudent.fee_type} />
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={handleRecordFee}
            className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <h3 className="text-sm font-semibold">২. শিক্ষার্থী পেমেন্ট বিবরণ (মাসিক প্রদেয় ও খাবার খরচ পৃথক)</h3>

            {monthStatus && selectedStudent && (
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">নির্বাচিত মাস ({feeForm.payment_month}) ইতিমধ্যে পরিশোধিত:</span>
                  <span className="font-mono-num font-semibold text-[#047857] dark:text-emerald-400">
                    {formatBDT(monthStatus.already_paid_this_month ?? monthStatus.already_paid_for_month ?? 0)}
                  </span>
                </div>
                {monthStatus.is_partial_installment && (
                  <div className="text-amber-700 dark:text-amber-400 font-medium">
                    এই মাসের আংশিক বকেয়া কিস্তি বাকি আছে — পূর্বের অবশিষ্ট বকেয়া ({formatBDT(monthStatus.previous_due)}) স্বয়ংক্রিয়ভাবে বসানো হয়েছে।
                  </div>
                )}
                {isDuplicateStudentMonth && (
                  <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-semibold pt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    এই মাসের পূর্ণ বেতন ও খাবার খরচ ইতিমধ্যেই পরিশোধ করা হয়েছে (ডুপ্লিকেট পেমেন্ট অনুমোদিত নয়)।
                  </div>
                )}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>কোন মাসের পেমেন্ট *</label>
                <input
                  type="month"
                  required
                  value={feeForm.payment_month}
                  onChange={(e) => setFeeForm({ ...feeForm, payment_month: e.target.value, payment_period: e.target.value })}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelClass}>পেমেন্ট ধরন *</label>
                <select
                  value={feeForm.payment_type}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFeeForm({
                      ...feeForm,
                      payment_type: val,
                      monthly_payable: val === 'free' ? '0' : feeForm.monthly_payable,
                      amount_paid: val === 'free' ? '0' : feeForm.amount_paid,
                    });
                  }}
                  className={inputClass}
                >
                  <option value="regular">নিয়মিত পেমেন্ট (মাসিক বেতন ও খাবার)</option>
                  <option value="one_time">এককালীন পেমেন্ট (ভর্তি / উন্নয়ন / পরীক্ষা ফি)</option>
                  <option value="free">ফ্রি (বেতনমুক্ত — ০৳ হলে আয় হিসেবে গণ্য হবে না)</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>মাসিক প্রদেয় / বেতন-ফি (৳)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={feeForm.monthly_payable}
                  onChange={(e) => {
                    const nextVal = Number(e.target.value || 0);
                    const nextTotal = Math.max(0, Number((nextVal + mealCostNum + otherFeeNum + prevDueNum - discountNum).toFixed(2)));
                    setFeeForm({ ...feeForm, monthly_payable: e.target.value, amount_paid: String(nextTotal) });
                  }}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelClass}>খাবার খরচ (৳ — ঐচ্ছিক)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={feeForm.meal_cost}
                  onChange={(e) => {
                    const nextMeal = Number(e.target.value || 0);
                    const nextTotal = Math.max(0, Number((monthlyPayableNum + nextMeal + otherFeeNum + prevDueNum - discountNum).toFixed(2)));
                    setFeeForm({ ...feeForm, meal_cost: e.target.value, amount_paid: String(nextTotal) });
                  }}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelClass}>অন্যান্য ফি (৳ — ঐচ্ছিক)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={feeForm.other_fee}
                  onChange={(e) => {
                    const nextOther = Number(e.target.value || 0);
                    const nextTotal = Math.max(0, Number((monthlyPayableNum + mealCostNum + nextOther + prevDueNum - discountNum).toFixed(2)));
                    setFeeForm({ ...feeForm, other_fee: e.target.value, amount_paid: String(nextTotal) });
                  }}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelClass}>পূর্বের বকেয়া (৳)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={feeForm.previous_due}
                  onChange={(e) => {
                    const nextPrev = Number(e.target.value || 0);
                    const nextTotal = Math.max(0, Number((monthlyPayableNum + mealCostNum + otherFeeNum + nextPrev - discountNum).toFixed(2)));
                    setFeeForm({ ...feeForm, previous_due: e.target.value, amount_paid: String(nextTotal) });
                  }}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelClass}>ছাড় / মওকুফ (-৳ — ঐচ্ছিক)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={feeForm.discount}
                  onChange={(e) => {
                    const nextDisc = Number(e.target.value || 0);
                    const nextTotal = Math.max(0, Number((monthlyPayableNum + mealCostNum + otherFeeNum + prevDueNum - nextDisc).toFixed(2)));
                    setFeeForm({ ...feeForm, discount: e.target.value, amount_paid: String(nextTotal) });
                  }}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelClass}>পেমেন্ট তারিখ *</label>
                <input
                  type="date"
                  required
                  value={feeForm.payment_date}
                  onChange={(e) => setFeeForm({ ...feeForm, payment_date: e.target.value })}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
            </div>

            {/* Live Auto-calculated Total Summary Strip */}
            <div className="grid grid-cols-3 gap-3 p-3.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs">
              <div>
                <div className="text-[11px] text-slate-500">মোট প্রদেয়</div>
                <div className="font-mono-num text-sm font-bold text-slate-900 dark:text-white">
                  {formatBDT(computedTotalPayable)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">পরিশোধিত টাকা</div>
                <div className="font-mono-num text-sm font-bold text-[#047857] dark:text-emerald-400">
                  {formatBDT(amountPaidNum)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">অবশিষ্ট বকেয়া</div>
                <div className="font-mono-num text-sm font-bold text-red-600 dark:text-red-400">
                  {formatBDT(computedRemainingDue)}
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>পরিশোধিত টাকা (৳ — আংশিক পেমেন্ট সম্ভব) *</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={feeForm.amount_paid}
                  onChange={(e) => setFeeForm({ ...feeForm, amount_paid: e.target.value })}
                  className={`${inputClass} font-mono-num font-bold`}
                />
              </div>
              <div>
                <label className={labelClass}>পেমেন্ট মাধ্যম *</label>
                <select value={feeForm.payment_method} onChange={(e) => setFeeForm({ ...feeForm, payment_method: e.target.value })} className={inputClass}>
                  <option value="নগদ">নগদ (Cash)</option>
                  <option value="বিকাশ">বিকাশ (bKash)</option>
                  <option value="নগদ মোবাইল">নগদ (Nagad)</option>
                  <option value="ব্যাংক">ব্যাংক ট্রান্সফার</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>জমা তহবিল অ্যাকাউন্ট</label>
                <select value={feeForm.account_id} onChange={(e) => setFeeForm({ ...feeForm, account_id: e.target.value })} className={inputClass}>
                  <option value="">প্রাথমিক নগদ তহবিল</option>
                  {(fin?.accounts || []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>মন্তব্য (ঐচ্ছিক)</label>
                <input value={feeForm.note} onChange={(e) => setFeeForm({ ...feeForm, note: e.target.value })} placeholder="যেমন: প্রথম কিস্তি / বোর্ডিংসহ" className={inputClass} />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button type="submit" disabled={!selectedStudent || feeSubmitting || isDuplicateStudentMonth} className={emeraldBtnClass}>
                <Receipt className="w-4 h-4" />
                {feeSubmitting ? 'সংরক্ষণ হচ্ছে...' : 'পেমেন্ট সংরক্ষণ ও রসিদ তৈরি করুন'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: PAYMENT HISTORY & RECEIPTS */}
      {tab === 'history' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {payments.length === 0 ? (
            <EmptyState title="কোনো পেমেন্ট রসিদ নেই" description="শিক্ষার্থী ফি গ্রহণ করলে এখানে সকল রসিদ দেখা যাবে।" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="px-4 py-3">রসিদ ও তারিখ</th>
                    <th className="px-4 py-3">শিক্ষার্থী</th>
                    <th className="px-3 py-3">মাস ও ধরন</th>
                    <th className="px-3 py-3 text-right">মাসিক ফি</th>
                    <th className="px-3 py-3 text-right">খাবার খরচ</th>
                    <th className="px-3 py-3 text-right">মোট প্রদেয়</th>
                    <th className="px-3 py-3 text-right">পরিশোধ (৳)</th>
                    <th className="px-3 py-3 text-right">বকেয়া (৳)</th>
                    <th className="px-4 py-3 text-right">রসিদ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-mono-num">
                        <div className="font-bold text-[#6D28D9] dark:text-violet-400">{p.receipt_number}</div>
                        <div className="text-slate-500">{formatDateDMY(p.payment_date)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{p.student_name}</div>
                        <div className="text-[11px] font-mono-num text-slate-500">
                          {p.student_code} · রোল: {p.roll_number} · {p.class_name}
                          {p.jamaat_name && p.jamaat_name !== p.class_name ? ` (${p.jamaat_name})` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-mono-num font-medium">{p.payment_month || p.payment_period || '—'}</div>
                        <StatusText status={p.payment_type} />
                      </td>
                      <td className="px-3 py-3 text-right font-mono-num">{formatBDT(p.monthly_payable || 0)}</td>
                      <td className="px-3 py-3 text-right font-mono-num text-amber-700 dark:text-amber-400">
                        {formatBDT(p.meal_cost || 0)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono-num font-semibold">
                        {formatBDT(p.total_payable || Number(p.amount_paid || 0) + Number(p.remaining_due || 0))}
                      </td>
                      <td className="px-3 py-3 text-right font-mono-num font-bold text-[#047857]">{formatBDT(p.amount_paid)}</td>
                      <td className="px-3 py-3 text-right font-mono-num text-red-600">{formatBDT(p.remaining_due)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setReceiptModal(p)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#6D28D9] dark:text-violet-400 hover:underline cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" /> রসিদ দেখুন
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: MONTHLY & YEARLY FINANCIAL REPORTS */}
      {tab === 'reports' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setReportPeriod('monthly')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    reportPeriod === 'monthly' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  মাসিক রিপোর্ট
                </button>
                <button
                  type="button"
                  onClick={() => setReportPeriod('yearly')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    reportPeriod === 'yearly' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  বার্ষিক রিপোর্ট
                </button>
              </div>

              {reportPeriod === 'monthly' ? (
                <input
                  type="month"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-num"
                />
              ) : (
                <select
                  value={reportYear}
                  onChange={(e) => setReportYear(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-num"
                >
                  {[2024, 2025, 2026, 2027, 2028].map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              )}
            </div>

            <button type="button" onClick={() => window.print()} className={secondaryBtnClass}>
              <Printer className="w-4 h-4" />
              রিপোর্ট প্রিন্ট / PDF
            </button>
          </div>

          {reportLoading || !finReport ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-xs text-slate-500">
              রিপোর্ট লোড হচ্ছে...
            </div>
          ) : (
            <div className="space-y-5 print-container">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="w-5 h-5 text-[#047857]" />
                  <div>
                    <div className="font-bold text-base text-slate-900 dark:text-white">
                      {institution?.name || 'DARUL IDARAH'} — {reportPeriod === 'monthly' ? 'মাসিক' : 'বার্ষিক'} আর্থিক রিপোর্ট
                    </div>
                    <div className="text-xs text-slate-500 font-mono-num">
                      সময়কাল: {finReport.label} · তারিখ: {formatDateDMY(getTodayDhakaYMD())}
                    </div>
                  </div>
                </div>
              </div>

              {/* Separated Student & Teacher Financial Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="শিক্ষার্থী মোট বেতন/ফি (আদায়)"
                  value={formatBDT(finReport.students.collected_fee)}
                  subtext={`বিলকৃত: ${formatBDT(finReport.students.billed_monthly_fee)}`}
                  tone="emerald"
                />
                <StatCard
                  label="শিক্ষার্থী মোট খাবার খরচ (আদায়)"
                  value={formatBDT(finReport.students.collected_meal)}
                  subtext={`বিলকৃত: ${formatBDT(finReport.students.billed_meal_cost)}`}
                  tone="gold"
                />
                <StatCard
                  label="শিক্ষার্থী মোট আদায়"
                  value={formatBDT(finReport.students.total_collected)}
                  subtext={`অবশিষ্ট বকেয়া: ${formatBDT(finReport.students.total_due)}`}
                  tone="purple"
                />
                <StatCard
                  label="শিক্ষার্থী বকেয়া"
                  value={formatBDT(finReport.students.total_due)}
                  tone="crimson"
                />
                <StatCard
                  label="শিক্ষক মোট মাসিক বেতন (পরিশোধ)"
                  value={formatBDT(finReport.teachers.paid_salary)}
                  subtext={`বিলকৃত: ${formatBDT(finReport.teachers.billed_base_salary)}`}
                  tone="navy"
                />
                <StatCard
                  label="শিক্ষক মোট খাবার খরচ (পরিশোধ)"
                  value={formatBDT(finReport.teachers.paid_meal)}
                  subtext={`বিলকৃত: ${formatBDT(finReport.teachers.billed_meal_cost)}`}
                  tone="gold"
                />
                <StatCard
                  label="শিক্ষক মোট পরিশোধ"
                  value={formatBDT(finReport.teachers.total_paid)}
                  subtext={`বোনাস: ${formatBDT(finReport.teachers.total_bonus)} · কর্তন: ${formatBDT(finReport.teachers.total_deduction)}`}
                  tone="crimson"
                />
                <StatCard
                  label="শিক্ষক অবশিষ্ট Due"
                  value={formatBDT(finReport.teachers.total_due)}
                  tone="crimson"
                />
              </div>

              {/* Overall Income vs Expense Summary */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
                  আর্থিক খাতভিত্তিক সারসংক্ষেপ ({finReport.label})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className={tableHeadClass}>
                      <tr>
                        <th className="px-5 py-3">আর্থিক খাত</th>
                        <th className="px-4 py-3">ধরন</th>
                        <th className="px-4 py-3 text-right">নির্ধারিত / বিলকৃত</th>
                        <th className="px-4 py-3 text-right">মোট আদায় / পরিশোধ</th>
                        <th className="px-5 py-3 text-right">বকেয়া / Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      <tr>
                        <td className="px-5 py-3 font-medium">শিক্ষার্থীদের মাসিক বেতন/ফি</td>
                        <td className="px-4 py-3 text-[#047857] font-semibold">আয়</td>
                        <td className="px-4 py-3 text-right font-mono-num">{formatBDT(finReport.students.billed_monthly_fee)}</td>
                        <td className="px-4 py-3 text-right font-mono-num font-bold text-[#047857]">{formatBDT(finReport.students.collected_fee)}</td>
                        <td className="px-5 py-3 text-right font-mono-num text-slate-400">—</td>
                      </tr>
                      <tr>
                        <td className="px-5 py-3 font-medium">শিক্ষার্থীদের খাবার খরচ</td>
                        <td className="px-4 py-3 text-[#047857] font-semibold">আয়</td>
                        <td className="px-4 py-3 text-right font-mono-num">{formatBDT(finReport.students.billed_meal_cost)}</td>
                        <td className="px-4 py-3 text-right font-mono-num font-bold text-[#047857]">{formatBDT(finReport.students.collected_meal)}</td>
                        <td className="px-5 py-3 text-right font-mono-num text-slate-400">—</td>
                      </tr>
                      <tr className="bg-emerald-50/40 dark:bg-emerald-950/20 font-semibold">
                        <td className="px-5 py-3">মোট শিক্ষার্থী আদায় ও বকেয়া</td>
                        <td className="px-4 py-3 text-[#047857]">আয়</td>
                        <td className="px-4 py-3 text-right font-mono-num">
                          {formatBDT(finReport.students.billed_monthly_fee + finReport.students.billed_meal_cost + finReport.students.billed_other_fee)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num text-[#047857]">{formatBDT(finReport.students.total_collected)}</td>
                        <td className="px-5 py-3 text-right font-mono-num text-red-600">{formatBDT(finReport.students.total_due)}</td>
                      </tr>
                      <tr>
                        <td className="px-5 py-3 font-medium">শিক্ষকদের মাসিক বেতন</td>
                        <td className="px-4 py-3 text-red-600 font-semibold">ব্যয়</td>
                        <td className="px-4 py-3 text-right font-mono-num">{formatBDT(finReport.teachers.billed_base_salary)}</td>
                        <td className="px-4 py-3 text-right font-mono-num font-bold text-red-600">{formatBDT(finReport.teachers.paid_salary)}</td>
                        <td className="px-5 py-3 text-right font-mono-num text-slate-400">—</td>
                      </tr>
                      <tr>
                        <td className="px-5 py-3 font-medium">শিক্ষকদের খাবার খরচ</td>
                        <td className="px-4 py-3 text-red-600 font-semibold">ব্যয়</td>
                        <td className="px-4 py-3 text-right font-mono-num">{formatBDT(finReport.teachers.billed_meal_cost)}</td>
                        <td className="px-4 py-3 text-right font-mono-num font-bold text-red-600">{formatBDT(finReport.teachers.paid_meal)}</td>
                        <td className="px-5 py-3 text-right font-mono-num text-slate-400">—</td>
                      </tr>
                      <tr className="bg-red-50/40 dark:bg-red-950/20 font-semibold">
                        <td className="px-5 py-3">মোট শিক্ষক পরিশোধ ও অবশিষ্ট Due</td>
                        <td className="px-4 py-3 text-red-600">ব্যয়</td>
                        <td className="px-4 py-3 text-right font-mono-num">
                          {formatBDT(finReport.teachers.billed_base_salary + finReport.teachers.billed_meal_cost)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num text-red-600">{formatBDT(finReport.teachers.total_paid)}</td>
                        <td className="px-5 py-3 text-right font-mono-num text-red-600">{formatBDT(finReport.teachers.total_due)}</td>
                      </tr>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 font-bold">
                        <td className="px-5 py-3">সর্বমোট প্রাতিষ্ঠানিক আয় ও ব্যয় (সকল খাতসহ)</td>
                        <td className="px-4 py-3">নিট ব্যালেন্স</td>
                        <td className="px-4 py-3 text-right font-mono-num text-[#047857]">
                          আয়: {formatBDT(finReport.overall.total_income)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num text-red-600">
                          ব্যয়: {formatBDT(finReport.overall.total_expense)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono-num text-slate-900 dark:text-white">
                          {formatBDT(finReport.overall.net_balance)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 12-Month Breakdown Table in Yearly Mode */}
              {reportPeriod === 'yearly' && Array.isArray(finReport.monthly_breakdown) && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
                    মাসওয়ারী বার্ষিক বিবরণ ({reportYear})
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className={tableHeadClass}>
                        <tr>
                          <th className="px-4 py-3">মাস</th>
                          <th className="px-3 py-3 text-right">শিক্ষার্থী ফি</th>
                          <th className="px-3 py-3 text-right">শিক্ষার্থী খাবার</th>
                          <th className="px-3 py-3 text-right">মোট আদায়</th>
                          <th className="px-3 py-3 text-right">শিক্ষক বেতন</th>
                          <th className="px-3 py-3 text-right">শিক্ষক খাবার</th>
                          <th className="px-3 py-3 text-right">মোট পরিশোধ</th>
                          <th className="px-4 py-3 text-right">নিট পার্থক্য</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {finReport.monthly_breakdown.map((m: any) => (
                          <tr key={m.month}>
                            <td className="px-4 py-2.5 font-mono-num font-semibold">{m.month}</td>
                            <td className="px-3 py-2.5 text-right font-mono-num">{formatBDT(m.student_fee)}</td>
                            <td className="px-3 py-2.5 text-right font-mono-num text-amber-700 dark:text-amber-400">{formatBDT(m.student_meal)}</td>
                            <td className="px-3 py-2.5 text-right font-mono-num font-bold text-[#047857]">{formatBDT(m.student_total)}</td>
                            <td className="px-3 py-2.5 text-right font-mono-num">{formatBDT(m.teacher_salary)}</td>
                            <td className="px-3 py-2.5 text-right font-mono-num text-amber-700 dark:text-amber-400">{formatBDT(m.teacher_meal)}</td>
                            <td className="px-3 py-2.5 text-right font-mono-num font-bold text-red-600">{formatBDT(m.teacher_total)}</td>
                            <td className="px-4 py-2.5 text-right font-mono-num font-semibold">
                              {formatBDT(m.student_total - m.teacher_total)}
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
        </div>
      )}

      {/* TAB 4: INCOME & EXPENSE */}
      {tab === 'income_expense' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch('/api/inst/finance/transactions', {
                  method: 'POST',
                  body: {
                    ...txForm,
                    category_id: txForm.category_id ? Number(txForm.category_id) : null,
                    account_id: txForm.account_id ? Number(txForm.account_id) : null,
                    amount: Number(txForm.amount),
                  },
                });
                toast('success', txForm.type === 'income' ? 'আয় সংরক্ষিত হয়েছে' : 'ব্যয় সংরক্ষিত হয়েছে');
                setTxForm({ ...txForm, description: '', amount: '', reference: '', note: '' });
                loadAll();
              } catch (err: any) {
                toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
              }
            }}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5 h-fit"
          >
            <h3 className="text-sm font-semibold">নতুন আয় / ব্যয় এন্ট্রি</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTxForm({ ...txForm, type: 'income', category_id: '' })}
                className={`py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                  txForm.type === 'income' ? 'bg-[#047857] text-white border-[#047857]' : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                আয় (Income)
              </button>
              <button
                type="button"
                onClick={() => setTxForm({ ...txForm, type: 'expense', category_id: '' })}
                className={`py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                  txForm.type === 'expense' ? 'bg-red-600 text-white border-red-600' : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                ব্যয় (Expense)
              </button>
            </div>
            <div>
              <label className={labelClass}>তারিখ</label>
              <input type="date" value={txForm.tx_date} onChange={(e) => setTxForm({ ...txForm, tx_date: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>খাত (Category)</label>
              <select value={txForm.category_id} onChange={(e) => setTxForm({ ...txForm, category_id: e.target.value })} className={inputClass}>
                <option value="">-- খাত নির্বাচন --</option>
                {(fin?.categories || [])
                  .filter((c: any) => c.type === txForm.type)
                  .map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>অ্যাকাউন্ট</label>
              <select value={txForm.account_id} onChange={(e) => setTxForm({ ...txForm, account_id: e.target.value })} className={inputClass}>
                <option value="">প্রাথমিক তহবিল</option>
                {(fin?.accounts || []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>বিবরণ *</label>
              <input required value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} placeholder="যেমন: বিদ্যুৎ বিল পরিশোধ / অনুদান" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>টাকার পরিমাণ (৳) *</label>
              <input type="number" required min={0.01} step="0.01" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} className={`${inputClass} font-mono-num`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>মাধ্যম</label>
                <select value={txForm.payment_method} onChange={(e) => setTxForm({ ...txForm, payment_method: e.target.value })} className={inputClass}>
                  <option value="নগদ">নগদ</option>
                  <option value="ব্যাংক">ব্যাংক</option>
                  <option value="বিকাশ">বিকাশ</option>
                  <option value="নগদ মোবাইল">নগদ মোবাইল</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>রেফারেন্স / ভাউচার</label>
                <input value={txForm.reference} onChange={(e) => setTxForm({ ...txForm, reference: e.target.value })} className={inputClass} />
              </div>
            </div>
            <button type="submit" className={primaryBtnClass}>লেনদেন সংরক্ষণ করুন</button>
          </form>

          <div className="lg:col-span-8 space-y-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
              {[
                { id: 'all', label: 'সকল' },
                { id: 'income', label: 'আয়' },
                { id: 'expense', label: 'ব্যয়' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTxFilterType(t.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    txFilterType === t.id ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-4 py-3">তারিখ / আইডি</th>
                      <th className="px-4 py-3">খাত ও বিবরণ</th>
                      <th className="px-4 py-3">মাধ্যম</th>
                      <th className="px-4 py-3 text-right">পরিমাণ (৳)</th>
                      <th className="px-4 py-3 text-right">কার্যক্রম</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredTx.map((tx) => (
                      <tr key={tx.id} className={tx.is_reversed ? 'opacity-70 bg-slate-50/50 dark:bg-slate-800/20' : ''}>
                        <td className="px-4 py-3 font-mono-num text-xs text-slate-500">
                          <div>{formatDateDMY(tx.tx_date)}</div>
                          {tx.tx_code && <div className="text-[11px] font-semibold text-[#6D28D9] dark:text-violet-400">{tx.tx_code}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{tx.description}</div>
                          <div className="text-xs text-slate-500">
                            {tx.category_name} {tx.reference ? `· ${tx.reference}` : ''}
                            {tx.is_reversed ? ` · রিভার্সাল: ${tx.reversal_reason || 'সমন্বয়কৃত'}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{tx.payment_method}</td>
                        <td className={`px-4 py-3 text-right font-mono-num font-bold ${tx.type === 'income' ? 'text-[#047857]' : 'text-red-600'}`}>
                          {tx.type === 'income' ? '+' : '-'}{formatBDT(tx.amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {tx.is_reversed ? (
                            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">সমন্বয়কৃত</span>
                          ) : tx.source_type === 'reversal' || tx.reversal_of_id ? (
                            <span className="text-[11px] font-semibold text-slate-500">রিভার্সাল এন্ট্রি</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setReverseTarget(tx);
                                setReverseReason('');
                              }}
                              className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              রিভার্সাল
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: CATEGORIES & ACCOUNTS */}
      {tab === 'accounts' && fin && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold">তহবিল অ্যাকাউন্টসমূহ</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/inst/finance/accounts', {
                  method: 'POST',
                  body: { ...accForm, opening_balance: Number(accForm.opening_balance || 0) },
                });
                setAccForm({ name: '', account_type: 'নগদ', opening_balance: '0' });
                toast('success', 'নতুন অ্যাকাউন্ট যুক্ত হয়েছে');
                loadAll();
              }}
              className="grid sm:grid-cols-3 gap-2"
            >
              <input required value={accForm.name} onChange={(e) => setAccForm({ ...accForm, name: e.target.value })} placeholder="অ্যাকাউন্ট নাম" className={inputClass} />
              <input type="number" value={accForm.opening_balance} onChange={(e) => setAccForm({ ...accForm, opening_balance: e.target.value })} placeholder="প্রারম্ভিক ব্যালেন্স" className={`${inputClass} font-mono-num`} />
              <button type="submit" className={emeraldBtnClass}><Plus className="w-4 h-4" /> যোগ</button>
            </form>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {fin.accounts.map((a: any) => (
                <div key={a.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-slate-500">{a.account_type}</div>
                  </div>
                  <div className="font-mono-num font-bold text-[#047857]">{formatBDT(a.current_balance)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold">আয় ও ব্যয়ের খাত (Categories)</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/inst/finance/categories', { method: 'POST', body: catForm });
                setCatForm({ name: '', type: catForm.type });
                toast('success', 'নতুন খাত যুক্ত হয়েছে');
                loadAll();
              }}
              className="grid sm:grid-cols-3 gap-2"
            >
              <input required value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="খাতের নাম" className={inputClass} />
              <select value={catForm.type} onChange={(e) => setCatForm({ ...catForm, type: e.target.value })} className={inputClass}>
                <option value="income">আয়</option>
                <option value="expense">ব্যয়</option>
              </select>
              <button type="submit" className={emeraldBtnClass}><Plus className="w-4 h-4" /> যোগ</button>
            </form>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="font-semibold text-[#047857] mb-2">আয়ের খাত</div>
                <ul className="space-y-1.5">
                  {fin.categories.filter((c: any) => c.type === 'income').map((c: any) => (
                    <li key={c.id} className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">{c.name}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="font-semibold text-red-600 mb-2">ব্যয়ের খাত</div>
                <ul className="space-y-1.5">
                  {fin.categories.filter((c: any) => c.type === 'expense').map((c: any) => (
                    <li key={c.id} className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">{c.name}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(reverseTarget)}
        onClose={() => setReverseTarget(null)}
        title="অনুমোদিত লেনদেন সংশোধন / রিভার্সাল"
        subtitle="আর্থিক ইতিহাস মুছে ফেলা হয় না — একটি বিপরীত সমন্বয় এন্ট্রি তৈরি করে ব্যালেন্স সংশোধন করা হয়"
      >
        {reverseTarget && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!reverseReason.trim()) return;
              setReversing(true);
              try {
                const res = await apiFetch<any>(`/api/inst/finance/transactions/${reverseTarget.id}/reverse`, {
                  method: 'POST',
                  body: { reason: reverseReason.trim() },
                });
                toast(
                  'success',
                  'সমন্বয়/রিভার্সাল সম্পন্ন হয়েছে',
                  `নতুন সমন্বয় আইডি: ${res.reversal_transaction?.tx_code || ''}`
                );
                setReverseTarget(null);
                setReverseReason('');
                loadAll();
              } catch (err: any) {
                toast('error', 'রিভার্সাল ব্যর্থ', err.message);
              } finally {
                setReversing(false);
              }
            }}
            className="space-y-4"
          >
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div>লেনদেন আইডি: <strong className="font-mono-num text-[#6D28D9]">{reverseTarget.tx_code || `#${reverseTarget.id}`}</strong></div>
              <div>বিবরণ: <strong>{reverseTarget.description}</strong></div>
              <div>
                পরিমাণ: <strong className="font-mono-num">{formatBDT(reverseTarget.amount)}</strong> ({reverseTarget.type === 'income' ? 'আয়' : 'ব্যয়'})
              </div>
            </div>
            <div>
              <label className={labelClass}>সংশোধন / রিভার্সালের কারণ *</label>
              <textarea
                required
                rows={3}
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="যেমন: ভুল অঙ্ক এন্ট্রি অথবা ডুপ্লিকেট ভাউচার সমন্বয়"
                className={inputClass}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setReverseTarget(null)} className={secondaryBtnClass}>
                বাতিল
              </button>
              <button type="submit" disabled={reversing} className={primaryBtnClass}>
                {reversing ? 'প্রক্রিয়াকরণ...' : 'রিভার্সাল নিশ্চিত করুন'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <PrintReceiptModal
        payment={receiptModal}
        institutionName={institution?.name || 'DARUL IDARAH'}
        institutionLogo={institution?.logo_url}
        institutionAddress={institution?.address}
        onClose={() => setReceiptModal(null)}
      />
    </div>
  );
}
