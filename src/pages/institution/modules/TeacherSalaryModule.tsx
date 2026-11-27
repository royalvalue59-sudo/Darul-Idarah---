import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Banknote, Printer, ReceiptText } from 'lucide-react';
import { apiFetch, formatBDT, formatDateDMY, getTodayDhakaYMD } from '../../../lib/api';
import { useApp } from '../../../context/AppContext';
import {
  EmptyState,
  PageHeader,
  SalaryReceiptModal,
  StatCard,
  StatusText,
  TableSkeleton,
  emeraldBtnClass,
  inputClass,
  labelClass,
  tableHeadClass,
} from '../../../components/ui/Primitives';

export function TeacherSalaryModule() {
  const { institution, hasPermission, toast } = useApp();
  const [month, setMonth] = useState(getTodayDhakaYMD().slice(0, 7));
  const [tab, setTab] = useState<'pay' | 'records' | 'receipts'>('pay');
  const [overview, setOverview] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthStatus, setMonthStatus] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<any>(null);

  const [form, setForm] = useState({
    teacher_id: '',
    salary_month: getTodayDhakaYMD().slice(0, 7),
    base_salary: '',
    meal_cost: '0',
    bonus: '0',
    deduction: '0',
    due_adjusted: '0',
    paid_amount: '',
    payment_method: 'Cash',
    payment_date: getTodayDhakaYMD(),
    remarks: '',
  });

  const canCreate = hasPermission('finance', 'create');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, recRes, rctRes] = await Promise.all([
        apiFetch<{ teachers: any[] }>(`/api/inst/teachers/salary/overview?month=${encodeURIComponent(month)}`),
        apiFetch<{ records: any[] }>('/api/inst/teachers/salary/records'),
        apiFetch<{ receipts: any[] }>('/api/inst/teachers/salary/receipts'),
      ]);
      setOverview(ovRes.teachers || []);
      setRecords(recRes.records || []);
      setReceipts(rctRes.receipts || []);
    } catch (err: any) {
      toast('error', 'বেতন তথ্য লোড করা যায়নি', err.message);
    } finally {
      setLoading(false);
    }
  }, [month, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const loadMonthStatus = useCallback(
    async (teacherId: string, salMonth: string) => {
      if (!teacherId || !salMonth) {
        setMonthStatus(null);
        return;
      }
      try {
        const res = await apiFetch<any>(
          `/api/inst/teachers/salary/month-status?teacher_id=${encodeURIComponent(teacherId)}&month=${encodeURIComponent(salMonth)}`
        );
        setMonthStatus(res);
        setForm((prev) => ({
          ...prev,
          base_salary: String(res.base_salary ?? 0),
          meal_cost: String(res.meal_cost ?? 0),
          paid_amount: String(res.estimated_remaining ?? 0),
          due_adjusted: '0',
        }));
      } catch {
        setMonthStatus(null);
      }
    },
    []
  );

  useEffect(() => {
    if (form.teacher_id && form.salary_month) {
      loadMonthStatus(form.teacher_id, form.salary_month);
    }
  }, [form.teacher_id, form.salary_month, loadMonthStatus]);

  const baseNum = Number(form.base_salary || 0);
  const mealNum = Number(form.meal_cost || 0);
  const bonusNum = Number(form.bonus || 0);
  const dedNum = Number(form.deduction || 0);
  const dueAdjNum = Number(form.due_adjusted || 0);
  const alreadyPaid = Number(monthStatus?.already_paid || 0);
  const alreadyDueAdj = Number(monthStatus?.already_due_adjusted || 0);
  const priorBonus = Number(monthStatus?.prior_bonus || 0);
  const priorDed = Number(monthStatus?.prior_deduction || 0);
  const totalMonthlyFixed = Number((baseNum + mealNum).toFixed(2));
  const netPayable = Math.max(
    0,
    Number((baseNum + mealNum + priorBonus + bonusNum - priorDed - dedNum - alreadyPaid - alreadyDueAdj - dueAdjNum).toFixed(2))
  );
  const paidNum = Number(form.paid_amount || 0);
  const remainingDueAfter = Math.max(0, Number((netPayable - paidNum).toFixed(2)));
  const isDuplicateMonth = Boolean(monthStatus?.is_fully_paid) && bonusNum <= 0;

  const handlePaySalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.teacher_id) {
      toast('error', 'অনুগ্রহ করে একজন শিক্ষক নির্বাচন করুন');
      return;
    }
    if (isDuplicateMonth) {
      toast('error', 'ডুপ্লিকেট পেমেন্ট অনুমোদিত নয়', 'এই মাসের পূর্ণ বেতন ও খাবার খরচ ইতিমধ্যেই পরিশোধ করা হয়েছে।');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ id: number; receipt: any }>('/api/inst/teachers/salary/pay', {
        method: 'POST',
        body: {
          teacher_id: Number(form.teacher_id),
          salary_month: form.salary_month,
          base_salary: baseNum,
          meal_cost: mealNum,
          bonus: bonusNum,
          deduction: dedNum,
          due_adjusted: dueAdjNum,
          paid_amount: paidNum,
          payment_method: form.payment_method,
          payment_date: form.payment_date,
          remarks: form.remarks,
        },
      });
      toast('success', 'বেতন ও খাবার খরচ সফলভাবে পরিশোধ হয়েছে এবং রসিদ তৈরি হয়েছে');
      if (res.receipt) setActiveReceipt(res.receipt);
      setForm((f) => ({ ...f, bonus: '0', deduction: '0', due_adjusted: '0', remarks: '' }));
      await loadAll();
      await loadMonthStatus(form.teacher_id, form.salary_month);
    } catch (err: any) {
      toast('error', 'বেতন প্রদান ব্যর্থ হয়েছে', err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalBaseBudget = overview.reduce((acc, t) => acc + Number(t.monthly_salary || 0), 0);
  const totalMealBudget = overview.reduce((acc, t) => acc + Number(t.monthly_meal_cost || 0), 0);
  const totalMonthlyBudget = Number((totalBaseBudget + totalMealBudget).toFixed(2));
  const totalMonthPaid = overview.reduce((acc, t) => acc + Number(t.month_paid || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="শিক্ষক বেতন ও খাবার খরচ ব্যবস্থাপনা"
        subtitle="মাসিক প্রদেয় ও খাবার খরচ পৃথক হিসাব, আংশিক পেমেন্ট, ডুপ্লিকেট সুরক্ষা এবং স্বয়ংক্রিয় রসিদ"
        actions={
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">মাস:</label>
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setForm((f) => ({ ...f, salary_month: e.target.value }));
              }}
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono-num"
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="মাসিক প্রদেয় (মূল বেতন)"
          value={formatBDT(totalBaseBudget)}
          subtext={`মোট শিক্ষক: ${overview.length} জন`}
          tone="navy"
        />
        <StatCard label="মাসিক খাবার খরচ" value={formatBDT(totalMealBudget)} tone="gold" />
        <StatCard label="মোট মাসিক প্রদেয়" value={formatBDT(totalMonthlyBudget)} tone="purple" />
        <StatCard label={`${month} পরিশোধিত`} value={formatBDT(totalMonthPaid)} tone="emerald" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setTab('pay')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            tab === 'pay'
              ? 'border-[#6D28D9] text-[#6D28D9] dark:text-violet-400'
              : 'border-transparent text-slate-600 dark:text-slate-400'
          }`}
        >
          বেতন প্রদান ও সারসংক্ষেপ
        </button>
        <button
          type="button"
          onClick={() => setTab('records')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            tab === 'records'
              ? 'border-[#6D28D9] text-[#6D28D9] dark:text-violet-400'
              : 'border-transparent text-slate-600 dark:text-slate-400'
          }`}
        >
          সকল বেতন রেকর্ড ({records.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('receipts')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            tab === 'receipts'
              ? 'border-[#6D28D9] text-[#6D28D9] dark:text-violet-400'
              : 'border-transparent text-slate-600 dark:text-slate-400'
          }`}
        >
          রসিদ আর্কাইভ ({receipts.length})
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : tab === 'pay' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Salary Payment Form */}
          {canCreate && (
            <form
              onSubmit={handlePaySalary}
              className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <Banknote className="w-4 h-4 text-[#047857]" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">বেতন প্রদান ফর্ম</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className={labelClass}>শিক্ষক নির্বাচন *</label>
                  <select
                    required
                    value={form.teacher_id}
                    onChange={(e) => setForm((f) => ({ ...f, teacher_id: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">শিক্ষক বাছাই করুন</option>
                    {overview.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name} ({t.teacher_code}) — বেতন {formatBDT(t.monthly_salary)} + খাবার {formatBDT(t.monthly_meal_cost || 0)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>বেতনের মাস *</label>
                  <input
                    type="month"
                    required
                    value={form.salary_month}
                    onChange={(e) => setForm((f) => ({ ...f, salary_month: e.target.value }))}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelClass}>পেমেন্ট তারিখ *</label>
                  <input
                    type="date"
                    required
                    value={form.payment_date}
                    onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
              </div>

              {monthStatus && (
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">নির্ধারিত মাসিক (বেতন + খাবার):</span>
                    <span className="font-mono-num font-semibold">
                      {formatBDT(monthStatus.base_salary)} + {formatBDT(monthStatus.meal_cost || 0)} ={' '}
                      {formatBDT(monthStatus.total_monthly_payable ?? Number(monthStatus.base_salary || 0) + Number(monthStatus.meal_cost || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">এই মাসে ইতিমধ্যে পরিশোধিত:</span>
                    <span className="font-mono-num font-semibold text-[#047857] dark:text-emerald-400">
                      {formatBDT(monthStatus.already_paid)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">বর্তমান অগ্রিম বকেয়া (Due):</span>
                    <span className="font-mono-num font-semibold text-red-600 dark:text-red-400">
                      {formatBDT(monthStatus.current_due)}
                    </span>
                  </div>
                  {monthStatus.is_fully_paid && (
                    <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 pt-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      এই মাসের পূর্ণ বেতন ও খাবার খরচ ইতিমধ্যেই পরিশোধ করা হয়েছে।
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className={labelClass}>মাসিক প্রদেয় / মূল বেতন (৳)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={form.base_salary}
                    onChange={(e) => {
                      const nextBase = Number(e.target.value || 0);
                      const autoPaid = Math.max(
                        0,
                        Number((nextBase + mealNum + priorBonus + bonusNum - priorDed - dedNum - dueAdjNum - alreadyPaid - alreadyDueAdj).toFixed(2))
                      );
                      setForm((f) => ({ ...f, base_salary: e.target.value, paid_amount: String(autoPaid) }));
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
                    value={form.meal_cost}
                    onChange={(e) => {
                      const nextMeal = Number(e.target.value || 0);
                      const autoPaid = Math.max(
                        0,
                        Number((baseNum + nextMeal + priorBonus + bonusNum - priorDed - dedNum - dueAdjNum - alreadyPaid - alreadyDueAdj).toFixed(2))
                      );
                      setForm((f) => ({ ...f, meal_cost: e.target.value, paid_amount: String(autoPaid) }));
                    }}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelClass}>বোনাস (+৳)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.bonus}
                    onChange={(e) => {
                      const nextBonus = Number(e.target.value || 0);
                      const autoPaid = Math.max(
                        0,
                        Number((baseNum + mealNum + priorBonus + nextBonus - priorDed - dedNum - dueAdjNum - alreadyPaid - alreadyDueAdj).toFixed(2))
                      );
                      setForm((f) => ({ ...f, bonus: e.target.value, paid_amount: String(autoPaid) }));
                    }}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelClass}>কর্তন (-৳)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.deduction}
                    onChange={(e) => {
                      const nextDed = Number(e.target.value || 0);
                      const autoPaid = Math.max(
                        0,
                        Number((baseNum + mealNum + priorBonus + bonusNum - priorDed - nextDed - dueAdjNum - alreadyPaid - alreadyDueAdj).toFixed(2))
                      );
                      setForm((f) => ({ ...f, deduction: e.target.value, paid_amount: String(autoPaid) }));
                    }}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>পূর্বের অগ্রিম বকেয়া সমন্বয় (-৳)</label>
                  <input
                    type="number"
                    min={0}
                    max={monthStatus?.current_due || 0}
                    step="0.01"
                    value={form.due_adjusted}
                    onChange={(e) => {
                      const adj = Number(e.target.value || 0);
                      const autoPaid = Math.max(
                        0,
                        Number((baseNum + mealNum + priorBonus + bonusNum - priorDed - dedNum - adj - alreadyPaid - alreadyDueAdj).toFixed(2))
                      );
                      setForm((f) => ({ ...f, due_adjusted: e.target.value, paid_amount: String(autoPaid) }));
                    }}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
              </div>

              {/* Live Calculated Summary Strip */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs">
                <div>
                  <div className="text-[11px] text-slate-500">মোট মাসিক</div>
                  <div className="font-mono-num font-semibold text-slate-900 dark:text-white">{formatBDT(totalMonthlyFixed)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">মোট প্রদেয়</div>
                  <div className="font-mono-num font-bold text-[#047857] dark:text-emerald-400">{formatBDT(netPayable)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">অবশিষ্ট Due</div>
                  <div className="font-mono-num font-bold text-red-600 dark:text-red-400">{formatBDT(remainingDueAfter)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5 pt-1">
                <div>
                  <label className={labelClass}>পরিশোধিত টাকা (আংশিক সম্ভব)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={form.paid_amount}
                    onChange={(e) => setForm((f) => ({ ...f, paid_amount: e.target.value }))}
                    className={`${inputClass} font-mono-num font-bold`}
                  />
                </div>
                <div>
                  <label className={labelClass}>পেমেন্ট মাধ্যম *</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="Cash">Cash (নগদ)</option>
                    <option value="bKash">bKash</option>
                    <option value="Nagad">Nagad</option>
                    <option value="Bank">Bank (ব্যাংক)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>মন্তব্য</label>
                <input
                  type="text"
                  value={form.remarks}
                  onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                  placeholder="ঐচ্ছিক মন্তব্য"
                  className={inputClass}
                />
              </div>

              <button type="submit" disabled={saving || isDuplicateMonth} className={`${emeraldBtnClass} w-full`}>
                <ReceiptText className="w-4 h-4" />
                {saving ? 'বেতন সংরক্ষণ হচ্ছে...' : 'বেতন পরিশোধ ও রসিদ তৈরি করুন'}
              </button>
            </form>
          )}

          {/* Monthly Teacher Salary Overview Table */}
          <div
            className={`${
              canCreate ? 'xl:col-span-7' : 'xl:col-span-12'
            } bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white">
              শিক্ষকভিত্তিক মাসিক বেতন ও খাবার খরচ অবস্থা ({month})
            </div>
            {overview.length === 0 ? (
              <EmptyState title="কোনো শিক্ষক পাওয়া যায়নি" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-4 py-3">শিক্ষক</th>
                      <th className="px-3 py-3 text-right">মাসিক প্রদেয়</th>
                      <th className="px-3 py-3 text-right">খাবার খরচ</th>
                      <th className="px-3 py-3 text-right">মোট প্রদেয়</th>
                      <th className="px-3 py-3 text-right">পরিশোধিত</th>
                      <th className="px-3 py-3 text-right">অবশিষ্ট Due</th>
                      <th className="px-4 py-3 text-right">কার্যক্রম</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {overview.map((t) => {
                      const totalMonthly = Number(
                        t.total_monthly_payable ?? Number(t.monthly_salary || 0) + Number(t.monthly_meal_cost || 0)
                      );
                      const monthDue = Number(
                        t.month_remaining_due ?? Math.max(0, totalMonthly - Number(t.month_paid || 0))
                      );
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900 dark:text-white">{t.full_name}</div>
                            <div className="text-[11px] font-mono-num text-slate-500">
                              {t.teacher_code} · {t.department_name || '—'}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-mono-num">{formatBDT(t.monthly_salary)}</td>
                          <td className="px-3 py-3 text-right font-mono-num text-amber-700 dark:text-amber-400">
                            {formatBDT(t.monthly_meal_cost || 0)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono-num font-semibold">{formatBDT(totalMonthly)}</td>
                          <td className="px-3 py-3 text-right font-mono-num font-semibold text-[#047857] dark:text-emerald-400">
                            {formatBDT(t.month_paid)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono-num font-semibold text-red-700 dark:text-red-400">
                            {formatBDT(monthDue)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canCreate && (
                              <button
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, teacher_id: String(t.id), salary_month: month }))}
                                className="text-xs font-semibold text-[#6D28D9] dark:text-violet-400 hover:underline cursor-pointer"
                              >
                                নির্বাচন
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : tab === 'records' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {records.length === 0 ? (
            <EmptyState title="এখনো কোনো বেতন রেকর্ড নেই" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="px-4 py-3">শিক্ষক</th>
                    <th className="px-3 py-3">মাস</th>
                    <th className="px-3 py-3 text-right">মাসিক প্রদেয়</th>
                    <th className="px-3 py-3 text-right">খাবার খরচ</th>
                    <th className="px-3 py-3 text-right">বোনাস / কর্তন</th>
                    <th className="px-3 py-3 text-right">মোট প্রদেয়</th>
                    <th className="px-3 py-3 text-right">পরিশোধিত</th>
                    <th className="px-3 py-3 text-right">অবশিষ্ট Due</th>
                    <th className="px-3 py-3">মাধ্যম ও তারিখ</th>
                    <th className="px-4 py-3">অবস্থা</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {records.map((r) => {
                    const remDue = Number(r.remaining_due ?? r.remaining_payable ?? 0);
                    const totPay = Number(
                      r.total_payable ??
                        Number(r.base_salary || 0) + Number(r.meal_cost || 0) + Number(r.bonus || 0) - Number(r.deduction || 0)
                    );
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{r.teacher_name}</div>
                          <div className="text-[11px] font-mono-num text-slate-500">{r.teacher_code}</div>
                        </td>
                        <td className="px-3 py-3 font-mono-num font-semibold">{r.salary_month}</td>
                        <td className="px-3 py-3 text-right font-mono-num">{formatBDT(r.base_salary)}</td>
                        <td className="px-3 py-3 text-right font-mono-num text-amber-700 dark:text-amber-400">
                          {formatBDT(r.meal_cost || 0)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono-num">
                          <span className="text-[#047857]">+{formatBDT(r.bonus)}</span> /{' '}
                          <span className="text-red-600">-{formatBDT(r.deduction)}</span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono-num font-semibold">{formatBDT(totPay)}</td>
                        <td className="px-3 py-3 text-right font-mono-num font-bold text-[#047857]">{formatBDT(r.paid_amount)}</td>
                        <td className="px-3 py-3 text-right font-mono-num font-semibold text-red-600 dark:text-red-400">
                          {formatBDT(remDue)}
                        </td>
                        <td className="px-3 py-3 font-mono-num text-slate-500">
                          {r.payment_method} · {formatDateDMY(r.payment_date)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusText status={remDue <= 0 ? 'paid' : 'partial'} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {receipts.length === 0 ? (
            <EmptyState title="কোনো রসিদ পাওয়া যায়নি" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="px-4 py-3">রসিদ নম্বর</th>
                    <th className="px-4 py-3">শিক্ষক</th>
                    <th className="px-4 py-3">ধরন / মাস</th>
                    <th className="px-4 py-3 text-right">পরিমাণ</th>
                    <th className="px-4 py-3">তারিখ ও মাধ্যম</th>
                    <th className="px-4 py-3 text-right">প্রিন্ট</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {receipts.map((rc) => (
                    <tr key={rc.id}>
                      <td className="px-4 py-3 font-mono-num font-semibold text-[#6D28D9] dark:text-violet-400">
                        {rc.receipt_number}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{rc.teacher_name}</div>
                        <div className="text-[11px] font-mono-num text-slate-500">{rc.teacher_code}</div>
                      </td>
                      <td className="px-4 py-3 font-mono-num">
                        {rc.salary_month || (rc.receipt_type === 'advance' ? 'অতিরিক্ত উত্তোলন' : 'বকেয়া সমন্বয়')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num font-bold text-[#047857]">
                        {formatBDT(rc.paid_amount)}
                      </td>
                      <td className="px-4 py-3 font-mono-num text-slate-500">
                        {formatDateDMY(rc.payment_date)} · {rc.payment_method}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setActiveReceipt(rc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          দেখুন / প্রিন্ট
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

      <SalaryReceiptModal
        receipt={activeReceipt}
        institutionName={institution?.name || 'DARUL IDARAH'}
        institutionLogo={institution?.logo_url}
        institutionAddress={institution?.address}
        onClose={() => setActiveReceipt(null)}
      />
    </div>
  );
}
