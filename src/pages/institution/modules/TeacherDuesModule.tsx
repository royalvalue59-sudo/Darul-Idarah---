import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Printer, Scale } from 'lucide-react';
import { apiFetch, formatBDT, formatDateDMY, getTodayDhakaYMD } from '../../../lib/api';
import { useApp } from '../../../context/AppContext';
import {
  EmptyState,
  Modal,
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
} from '../../../components/ui/Primitives';

const LEDGER_LABELS: Record<string, { label: string; color: string }> = {
  advance: { label: 'অতিরিক্ত উত্তোলন (+)', color: 'text-red-700 dark:text-red-400' },
  salary_deduction: { label: 'বেতন থেকে সমন্বয় (-)', color: 'text-[#047857] dark:text-emerald-400' },
  cash_return: { label: 'নগদ ফেরত (-)', color: 'text-[#047857] dark:text-emerald-400' },
  adjustment: { label: 'হিসাব সমন্বয় (-)', color: 'text-[#6D28D9] dark:text-violet-400' },
};

export function TeacherDuesModule() {
  const { institution, hasPermission, toast } = useApp();
  const [summaries, setSummaries] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'summary' | 'advances' | 'ledger'>('summary');
  const [saving, setSaving] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<any>(null);
  const [settleTarget, setSettleTarget] = useState<any>(null);

  const [advForm, setAdvForm] = useState({
    teacher_id: '',
    withdrawal_date: getTodayDhakaYMD(),
    amount: '',
    reason: '',
    payment_method: 'Cash',
    remarks: '',
  });

  const [settleForm, setSettleForm] = useState({
    entry_type: 'cash_return',
    amount: '',
    entry_date: getTodayDhakaYMD(),
    payment_method: 'Cash',
    note: '',
  });

  const canCreate = hasPermission('finance', 'create');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dueRes, advRes] = await Promise.all([
        apiFetch<{ summaries: any[]; ledger: any[] }>('/api/inst/teachers/dues'),
        apiFetch<{ advances: any[] }>('/api/inst/teachers/advances'),
      ]);
      setSummaries(dueRes.summaries || []);
      setLedger(dueRes.ledger || []);
      setAdvances(advRes.advances || []);
    } catch (err: any) {
      toast('error', 'বকেয়া তথ্য লোড করা যায়নি', err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRecordAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advForm.teacher_id || Number(advForm.amount) <= 0) {
      toast('error', 'শিক্ষক এবং সঠিক টাকার পরিমাণ দিন');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ id: number; receipt: any }>('/api/inst/teachers/advances', {
        method: 'POST',
        body: {
          teacher_id: Number(advForm.teacher_id),
          withdraw_date: advForm.withdrawal_date,
          amount: Number(advForm.amount),
          reason: advForm.reason,
          payment_method: advForm.payment_method,
          remarks: advForm.remarks,
        },
      });
      toast('success', 'অতিরিক্ত টাকা উত্তোলন রেকর্ড হয়েছে এবং বকেয়া লেজারে যুক্ত হয়েছে');
      if (res.receipt) setActiveReceipt(res.receipt);
      setAdvForm({
        teacher_id: '',
        withdrawal_date: getTodayDhakaYMD(),
        amount: '',
        reason: '',
        payment_method: 'Cash',
        remarks: '',
      });
      await loadAll();
    } catch (err: any) {
      toast('error', 'অগ্রিম রেকর্ড ব্যর্থ হয়েছে', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSettleDue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleTarget) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ id: number; receipt: any }>('/api/inst/teachers/dues/settle', {
        method: 'POST',
        body: {
          teacher_id: settleTarget.id,
          entry_type: settleForm.entry_type,
          amount: Number(settleForm.amount),
          entry_date: settleForm.entry_date,
          payment_method: settleForm.payment_method,
          note: settleForm.note,
        },
      });
      toast('success', 'বকেয়া সফলভাবে সমন্বয় করা হয়েছে');
      setSettleTarget(null);
      if (res.receipt) setActiveReceipt(res.receipt);
      await loadAll();
    } catch (err: any) {
      toast('error', 'বকেয়া সমন্বয় ব্যর্থ হয়েছে', err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalAdvanceAll = summaries.reduce((a, s) => a + Number(s.total_advance || 0), 0);
  const totalSettledAll = summaries.reduce((a, s) => a + Number(s.total_settled || 0), 0);
  const totalCurrentDueAll = summaries.reduce((a, s) => a + Number(s.current_due || 0), 0);
  const totalObligationAll = summaries.reduce((a, s) => a + Number(s.total_financial_obligation || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="অতিরিক্ত টাকা উত্তোলন ও বকেয়া লেজার"
        subtitle="অগ্রিম উত্তোলন রেকর্ড, প্রতিষ্ঠানের ব্যয়ে স্বয়ংক্রিয় হিসাব এবং শিক্ষকভিত্তিক বকেয়া সমন্বয়"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="মোট অতিরিক্ত উত্তোলন" value={formatBDT(totalAdvanceAll)} tone="gold" />
        <StatCard label="মোট সমন্বয় / ফেরত" value={formatBDT(totalSettledAll)} tone="emerald" />
        <StatCard label="বর্তমান মোট বকেয়া" value={formatBDT(totalCurrentDueAll)} tone="crimson" />
        <StatCard label="মোট আর্থিক দায়বদ্ধতা (বেতন+বকেয়া)" value={formatBDT(totalObligationAll)} tone="purple" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setTab('summary')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            tab === 'summary'
              ? 'border-[#6D28D9] text-[#6D28D9] dark:text-violet-400'
              : 'border-transparent text-slate-600 dark:text-slate-400'
          }`}
        >
          অগ্রিম প্রদান ও বকেয়া সারসংক্ষেপ
        </button>
        <button
          type="button"
          onClick={() => setTab('advances')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            tab === 'advances'
              ? 'border-[#6D28D9] text-[#6D28D9] dark:text-violet-400'
              : 'border-transparent text-slate-600 dark:text-slate-400'
          }`}
        >
          অতিরিক্ত উত্তোলনের তালিকা ({advances.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('ledger')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            tab === 'ledger'
              ? 'border-[#6D28D9] text-[#6D28D9] dark:text-violet-400'
              : 'border-transparent text-slate-600 dark:text-slate-400'
          }`}
        >
          সম্পূর্ণ বকেয়া লেজার ({ledger.length})
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : tab === 'summary' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Extra Money Withdrawal Form */}
          {canCreate && (
            <form
              onSubmit={handleRecordAdvance}
              className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <ArrowUpRight className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">অতিরিক্ত টাকা উত্তোলন (অগ্রিম)</h2>
              </div>

              <div>
                <label className={labelClass}>শিক্ষক নির্বাচন *</label>
                <select
                  required
                  value={advForm.teacher_id}
                  onChange={(e) => setAdvForm((f) => ({ ...f, teacher_id: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">শিক্ষক বাছাই করুন</option>
                  {summaries.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} ({t.teacher_code}) — বকেয়া {formatBDT(t.current_due)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>তারিখ *</label>
                  <input
                    type="date"
                    required
                    value={advForm.withdrawal_date}
                    onChange={(e) => setAdvForm((f) => ({ ...f, withdrawal_date: e.target.value }))}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelClass}>টাকার পরিমাণ (৳) *</label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    required
                    value={advForm.amount}
                    onChange={(e) => setAdvForm((f) => ({ ...f, amount: e.target.value }))}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>উত্তোলনের কারণ *</label>
                <input
                  type="text"
                  required
                  value={advForm.reason}
                  onChange={(e) => setAdvForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="যেমন: পারিবারিক জরুরি প্রয়োজন / চিকিৎসা"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>পেমেন্ট মাধ্যম *</label>
                <select
                  value={advForm.payment_method}
                  onChange={(e) => setAdvForm((f) => ({ ...f, payment_method: e.target.value }))}
                  className={inputClass}
                >
                  <option value="Cash">Cash (নগদ)</option>
                  <option value="bKash">bKash</option>
                  <option value="Nagad">Nagad</option>
                  <option value="Bank">Bank (ব্যাংক)</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>মন্তব্য</label>
                <input
                  type="text"
                  value={advForm.remarks}
                  onChange={(e) => setAdvForm((f) => ({ ...f, remarks: e.target.value }))}
                  placeholder="ঐচ্ছিক মন্তব্য"
                  className={inputClass}
                />
              </div>

              <button type="submit" disabled={saving} className={`${primaryBtnClass} w-full`}>
                {saving ? 'সংরক্ষণ হচ্ছে...' : 'অগ্রিম প্রদান ও রসিদ তৈরি করুন'}
              </button>
            </form>
          )}

          {/* Teacher Due Summary Table */}
          <div
            className={`${
              canCreate ? 'xl:col-span-8' : 'xl:col-span-12'
            } bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#6D28D9]" />
              শিক্ষকভিত্তিক বকেয়া ও আর্থিক দায়বদ্ধতা
            </div>
            {summaries.length === 0 ? (
              <EmptyState title="কোনো শিক্ষক পাওয়া যায়নি" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-4 py-3">শিক্ষক</th>
                      <th className="px-4 py-3 text-right">মাসিক বেতন</th>
                      <th className="px-4 py-3 text-right">মোট অগ্রিম</th>
                      <th className="px-4 py-3 text-right">সমন্বয়/ফেরত</th>
                      <th className="px-4 py-3 text-right">বর্তমান বকেয়া</th>
                      <th className="px-4 py-3 text-right">মোট দায়বদ্ধতা</th>
                      <th className="px-4 py-3 text-right">কার্যক্রম</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {summaries.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{s.full_name}</div>
                          <div className="text-[11px] font-mono-num text-slate-500">{s.teacher_code}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num">{formatBDT(s.monthly_salary)}</td>
                        <td className="px-4 py-3 text-right font-mono-num text-amber-700 dark:text-amber-400">
                          {formatBDT(s.total_advance)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num text-[#047857] dark:text-emerald-400">
                          {formatBDT(s.total_settled)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num font-bold text-red-700 dark:text-red-400">
                          {formatBDT(s.current_due)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num font-semibold text-[#6D28D9] dark:text-violet-400">
                          {formatBDT(s.total_financial_obligation)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canCreate && Number(s.current_due) > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSettleTarget(s);
                                setSettleForm({
                                  entry_type: 'cash_return',
                                  amount: String(s.current_due),
                                  entry_date: getTodayDhakaYMD(),
                                  payment_method: 'Cash',
                                  note: '',
                                });
                              }}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[#047857] dark:text-emerald-400 hover:underline cursor-pointer"
                            >
                              <ArrowDownLeft className="w-3.5 h-3.5" />
                              বকেয়া সমন্বয়
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : tab === 'advances' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {advances.length === 0 ? (
            <EmptyState title="এখনো কোনো অতিরিক্ত উত্তোলন রেকর্ড নেই" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="px-4 py-3">তারিখ</th>
                    <th className="px-4 py-3">শিক্ষক</th>
                    <th className="px-4 py-3">কারণ</th>
                    <th className="px-4 py-3 text-right">পরিমাণ</th>
                    <th className="px-4 py-3">মাধ্যম</th>
                    <th className="px-4 py-3">অনুমোদনকারী</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {advances.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 font-mono-num">{formatDateDMY(a.withdraw_date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{a.teacher_name}</div>
                        <div className="text-[11px] font-mono-num text-slate-500">{a.teacher_code}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{a.reason}</div>
                        {a.remarks && <div className="text-[11px] text-slate-500">{a.remarks}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num font-bold text-amber-700 dark:text-amber-400">
                        {formatBDT(a.amount)}
                      </td>
                      <td className="px-4 py-3">{a.payment_method}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{a.approved_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {ledger.length === 0 ? (
            <EmptyState title="বকেয়া লেজার এখনো খালি" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="px-4 py-3">তারিখ</th>
                    <th className="px-4 py-3">শিক্ষক</th>
                    <th className="px-4 py-3">লেনদেনের ধরন</th>
                    <th className="px-4 py-3 text-right">পূর্বের বকেয়া</th>
                    <th className="px-4 py-3 text-right">পরিমাণ</th>
                    <th className="px-4 py-3 text-right">নতুন বকেয়া</th>
                    <th className="px-4 py-3">নোট</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ledger.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-3 font-mono-num">{formatDateDMY(l.entry_date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{l.teacher_name}</div>
                        <div className="text-[11px] font-mono-num text-slate-500">{l.teacher_code}</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusText status={l.entry_type} labelMap={LEDGER_LABELS} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num">{formatBDT(l.previous_due)}</td>
                      <td className="px-4 py-3 text-right font-mono-num font-semibold">{formatBDT(l.amount)}</td>
                      <td className="px-4 py-3 text-right font-mono-num font-bold">{formatBDT(l.new_due)}</td>
                      <td className="px-4 py-3 text-slate-500">{l.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Settle Due Modal */}
      <Modal
        open={Boolean(settleTarget)}
        onClose={() => setSettleTarget(null)}
        title={`বকেয়া সমন্বয় — ${settleTarget?.full_name || ''}`}
        subtitle={`বর্তমান বকেয়া: ${formatBDT(settleTarget?.current_due || 0)}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSettleDue} className="space-y-4">
          <div>
            <label className={labelClass}>সমন্বয়ের ধরন *</label>
            <select
              value={settleForm.entry_type}
              onChange={(e) => setSettleForm((f) => ({ ...f, entry_type: e.target.value }))}
              className={inputClass}
            >
              <option value="cash_return">নগদ ফেরত (Cash Return — আয় হিসেবে যুক্ত হবে)</option>
              <option value="adjustment">হিসাব সমন্বয় (Manual Adjustment)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>পরিমাণ (৳) *</label>
              <input
                type="number"
                min={1}
                max={settleTarget?.current_due || 0}
                step="0.01"
                required
                value={settleForm.amount}
                onChange={(e) => setSettleForm((f) => ({ ...f, amount: e.target.value }))}
                className={`${inputClass} font-mono-num`}
              />
            </div>
            <div>
              <label className={labelClass}>তারিখ *</label>
              <input
                type="date"
                required
                value={settleForm.entry_date}
                onChange={(e) => setSettleForm((f) => ({ ...f, entry_date: e.target.value }))}
                className={`${inputClass} font-mono-num`}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>মাধ্যম</label>
            <select
              value={settleForm.payment_method}
              onChange={(e) => setSettleForm((f) => ({ ...f, payment_method: e.target.value }))}
              className={inputClass}
            >
              <option value="Cash">Cash</option>
              <option value="bKash">bKash</option>
              <option value="Nagad">Nagad</option>
              <option value="Bank">Bank</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>নোট</label>
            <input
              type="text"
              value={settleForm.note}
              onChange={(e) => setSettleForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="সমন্বয়ের বিবরণ"
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setSettleTarget(null)} className={secondaryBtnClass}>
              বাতিল
            </button>
            <button type="submit" disabled={saving} className={emeraldBtnClass}>
              <Printer className="w-4 h-4" />
              {saving ? 'সংরক্ষণ হচ্ছে...' : 'সমন্বয় নিশ্চিত করুন'}
            </button>
          </div>
        </form>
      </Modal>

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
