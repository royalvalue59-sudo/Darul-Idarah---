import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Calendar, Pencil, Plus, Trash2, X } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import {
  DAILY_DAY_OPTION,
  ROUTINE_DAY_OPTIONS,
  expandWeeklySchedules,
  isDailySchedule,
  matchesDayFilter,
} from '../../../lib/routineDays';
import { useApp } from '../../../context/AppContext';
import {
  EmptyState,
  PageHeader,
  emeraldBtnClass,
  inputClass,
  labelClass,
  secondaryBtnClass,
  tableHeadClass,
} from '../../../components/ui/Primitives';

export function AcademicModule() {
  const { toast, confirm } = useApp();
  const [tab, setTab] = useState<'departments' | 'classes' | 'subjects' | 'routine'>('departments');

  const [departments, setDepartments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [jamaats, setJamaats] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);

  const [deptForm, setDeptForm] = useState({ name: '', description: '' });
  const [classForm, setClassForm] = useState({ department_id: '', jamaat_id: '', name: '', display_order: '1' });
  const [subjForm, setSubjForm] = useState({ class_id: '', book_id: '', name: '', code: '', full_marks: '100', pass_marks: '33' });
  const [subjClassFilter, setSubjClassFilter] = useState('');
  const [subjSearch, setSubjSearch] = useState('');

  const emptyRoutineForm = {
    department_id: '',
    class_id: '',
    jamaat_id: '',
    subject_id: '',
    teacher_id: '',
    day_of_week: ROUTINE_DAY_OPTIONS[0] as string,
    period_number: '1',
    start_time: '08:00',
    end_time: '08:45',
    room: '',
  };
  const [routineForm, setRoutineForm] = useState(emptyRoutineForm);
  const [editingRoutineId, setEditingRoutineId] = useState<number | null>(null);
  const [routineClassFilter, setRoutineClassFilter] = useState('');
  const [routineDayFilter, setRoutineDayFilter] = useState('');
  const [routineViewMode, setRoutineViewMode] = useState<'list' | 'weekly'>('list');

  const loadAll = useCallback(async () => {
    const [dRes, cRes, jRes, bRes, sRes, tRes, rRes] = await Promise.all([
      apiFetch('/api/inst/departments'),
      apiFetch('/api/inst/classes'),
      apiFetch('/api/inst/jamaats'),
      apiFetch('/api/inst/books'),
      apiFetch('/api/inst/subjects'),
      apiFetch('/api/inst/teachers'),
      apiFetch('/api/inst/routines'),
    ]);
    setDepartments(dRes.departments || []);
    setClasses(cRes.classes || []);
    setJamaats(jRes.jamaats || []);
    setBooks(bRes.books || []);
    setSubjects(sRes.subjects || []);
    setTeachers(tRes.teachers || []);
    setRoutines(rRes.routines || []);
  }, []);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  const filteredSubjects = subjects.filter((s) => {
    if (subjClassFilter && String(s.class_id) !== subjClassFilter) return false;
    if (subjSearch && !`${s.name} ${s.code}`.toLowerCase().includes(subjSearch.toLowerCase())) return false;
    return true;
  });

  const filteredRoutines = routines.filter((r) => {
    if (routineClassFilter && String(r.class_id) !== routineClassFilter) return false;
    if (routineDayFilter && !matchesDayFilter(r, routineDayFilter)) return false;
    return true;
  });

  const weeklyRoutines = expandWeeklySchedules(
    routineClassFilter ? routines.filter((r) => String(r.class_id) === routineClassFilter) : routines
  );

  const startEditRoutine = (r: any) => {
    setEditingRoutineId(r.id);
    setRoutineForm({
      department_id: String(r.department_id || ''),
      class_id: String(r.class_id || ''),
      jamaat_id: r.jamaat_id ? String(r.jamaat_id) : '',
      subject_id: String(r.subject_id || ''),
      teacher_id: String(r.teacher_id || ''),
      day_of_week: isDailySchedule(r) ? DAILY_DAY_OPTION : String(r.day_of_week || ROUTINE_DAY_OPTIONS[1]),
      period_number: String(r.period_number || '1'),
      start_time: String(r.start_time || '08:00'),
      end_time: String(r.end_time || '08:45'),
      room: String(r.room || ''),
    });
  };

  const routineClassesForDept = classes.filter((c) => !routineForm.department_id || String(c.department_id) === routineForm.department_id);
  const routineSubjectsForClass = subjects.filter((s) => String(s.class_id) === routineForm.class_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="বিভাগ, শ্রেণী, বিষয় ও ক্লাস রুটিন"
        subtitle="একাডেমিক বিভাগ থেকে শ্রেণী, সীমাহীন বিষয় এবং দ্বন্দ্বমুক্ত ক্লাস রুটিন পরিচালনা করুন"
      />

      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit flex-wrap">
        {[
          { id: 'departments', label: `বিভাগ (${departments.length})` },
          { id: 'classes', label: `শ্রেণী / জামাত (${classes.length})` },
          { id: 'subjects', label: `বিষয়সমূহ (${subjects.length})` },
          { id: 'routine', label: `ক্লাস রুটিন (${routines.length})` },
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

      {/* DEPARTMENTS */}
      {tab === 'departments' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch('/api/inst/departments', { method: 'POST', body: deptForm });
                setDeptForm({ name: '', description: '' });
                toast('success', 'নতুন একাডেমিক বিভাগ যুক্ত হয়েছে');
                loadAll();
              } catch (err: any) {
                toast('error', 'ব্যর্থ', err.message);
              }
            }}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit"
          >
            <h3 className="text-sm font-semibold">নতুন একাডেমিক বিভাগ</h3>
            <div>
              <label className={labelClass}>বিভাগের নাম *</label>
              <input required value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} placeholder="যেমন: হিফজ বিভাগ, কিতাব বিভাগ" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>বিবরণ</label>
              <textarea rows={3} value={deptForm.description} onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} className={inputClass} />
            </div>
            <button type="submit" className={emeraldBtnClass}><Plus className="w-4 h-4" /> বিভাগ যোগ করুন</button>
          </form>

          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-5 py-3">বিভাগের নাম</th>
                  <th className="px-4 py-3 text-right">শ্রেণী সংখ্যা</th>
                  <th className="px-4 py-3 text-right">শিক্ষার্থী</th>
                  <th className="px-5 py-3 text-right">মুছুন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {departments.map((d) => (
                  <tr key={d.id}>
                    <td className="px-5 py-3">
                      <div className="font-semibold">{d.name}</div>
                      {d.description && <div className="text-xs text-slate-500">{d.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num">{d.class_count}</td>
                    <td className="px-4 py-3 text-right font-mono-num">{d.student_count}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await confirm({ title: 'বিভাগ মুছুন', message: `"${d.name}" মুছে ফেলবেন? যুক্ত রেকর্ড থাকলে আর্কাইভ করতে হবে।`, danger: true });
                          if (!ok) return;
                          try {
                            await apiFetch(`/api/inst/departments/${d.id}`, { method: 'DELETE' });
                            toast('success', 'বিভাগ মুছে ফেলা হয়েছে');
                            loadAll();
                          } catch (err: any) {
                            toast('error', 'মুছে ফেলা যায়নি', err.message);
                          }
                        }}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CLASSES */}
      {tab === 'classes' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch('/api/inst/classes', {
                  method: 'POST',
                  body: {
                    ...classForm,
                    department_id: Number(classForm.department_id),
                    jamaat_id: classForm.jamaat_id ? Number(classForm.jamaat_id) : null,
                    display_order: Number(classForm.display_order),
                  },
                });
                setClassForm({ department_id: classForm.department_id, jamaat_id: '', name: '', display_order: '1' });
                toast('success', 'নতুন শ্রেণী/ক্লাস যুক্ত হয়েছে');
                loadAll();
              } catch (err: any) {
                toast('error', 'ব্যর্থ', err.message);
              }
            }}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit"
          >
            <h3 className="text-sm font-semibold">নতুন শ্রেণী / ক্লাস</h3>
            <div>
              <label className={labelClass}>বিভাগ নির্বাচন *</label>
              <select required value={classForm.department_id} onChange={(e) => setClassForm({ ...classForm, department_id: e.target.value })} className={inputClass}>
                <option value="">-- বিভাগ নির্বাচন করুন --</option>
                {departments.filter((d) => d.status === 'active').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>শ্রেণী / জামাত (ঐচ্ছিক)</label>
              <select value={classForm.jamaat_id} onChange={(e) => setClassForm({ ...classForm, jamaat_id: e.target.value })} className={inputClass}>
                <option value="">-- শ্রেণী / জামাত --</option>
                {jamaats
                  .filter((j) => j.status === 'active' && (!classForm.department_id || !j.department_id || String(j.department_id) === classForm.department_id))
                  .map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>ক্লাসের নাম *</label>
              <input required value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} placeholder="যেমন: মিজান, নাহবেমীর, কাফিয়া" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>ক্রম (Order)</label>
              <input type="number" value={classForm.display_order} onChange={(e) => setClassForm({ ...classForm, display_order: e.target.value })} className={inputClass} />
            </div>
            <button type="submit" className={emeraldBtnClass}><Plus className="w-4 h-4" /> শ্রেণী যোগ করুন</button>
          </form>

          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-5 py-3">ক্লাস ও জামাত</th>
                  <th className="px-4 py-3">বিভাগ</th>
                  <th className="px-4 py-3 text-right">কিতাব / বিষয়</th>
                  <th className="px-4 py-3 text-right">শিক্ষার্থী</th>
                  <th className="px-5 py-3 text-right">মুছুন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-3">
                      <div className="font-semibold">{c.name}</div>
                      {c.jamaat_name && c.jamaat_name !== c.name && (
                        <div className="text-xs text-[#6D28D9] dark:text-violet-400">{c.jamaat_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{c.department_name}</td>
                    <td className="px-4 py-3 text-right font-mono-num text-xs">
                      <span className="text-[#047857] font-semibold">{c.book_count || 0}</span> কিতাব ·{' '}
                      <span>{c.subject_count || 0}</span> বিষয়
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num">{c.student_count}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await confirm({ title: 'শ্রেণী মুছুন', message: `"${c.name}" মুছে ফেলবেন? যুক্ত রেকর্ড থাকলে আর্কাইভ করতে হবে।`, danger: true });
                          if (!ok) return;
                          try {
                            await apiFetch(`/api/inst/classes/${c.id}`, { method: 'DELETE' });
                            toast('success', 'মুছে ফেলা হয়েছে');
                            loadAll();
                          } catch (err: any) {
                            toast('error', 'মুছে ফেলা যায়নি', err.message);
                          }
                        }}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBJECTS */}
      {tab === 'subjects' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch('/api/inst/subjects', {
                  method: 'POST',
                  body: {
                    class_id: Number(subjForm.class_id),
                    book_id: subjForm.book_id ? Number(subjForm.book_id) : null,
                    name: subjForm.name,
                    code: subjForm.code,
                    full_marks: Number(subjForm.full_marks),
                    pass_marks: Number(subjForm.pass_marks),
                  },
                });
                setSubjForm({ ...subjForm, book_id: '', name: '', code: '' });
                toast('success', 'নতুন বিষয়/কিতাব যুক্ত হয়েছে');
                loadAll();
              } catch (err: any) {
                toast('error', 'ব্যর্থ', err.message);
              }
            }}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit"
          >
            <h3 className="text-sm font-semibold">নতুন বিষয় / কিতাব যুক্ত করুন</h3>
            <div>
              <label className={labelClass}>শ্রেণী / ক্লাস নির্বাচন *</label>
              <select required value={subjForm.class_id} onChange={(e) => setSubjForm({ ...subjForm, class_id: e.target.value })} className={inputClass}>
                <option value="">-- ক্লাস নির্বাচন করুন --</option>
                {classes.filter((c) => c.status === 'active').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.department_name} — {c.name}{c.jamaat_name && c.jamaat_name !== c.name ? ` (${c.jamaat_name})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>কিতাব তালিকা থেকে নির্বাচন (ঐচ্ছিক)</label>
              <select
                value={subjForm.book_id}
                onChange={(e) => {
                  const bid = e.target.value;
                  const bObj = books.find((b) => String(b.id) === bid);
                  setSubjForm((prev) => ({
                    ...prev,
                    book_id: bid,
                    name: bObj ? bObj.name : prev.name,
                    code: bObj ? bObj.short_name || bObj.book_code || prev.code : prev.code,
                  }));
                }}
                className={inputClass}
              >
                <option value="">-- কিতাব / বই থেকে বাছাই করুন --</option>
                {books
                  .filter((b) => b.status === 'active')
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.book_code}){b.arabic_name ? ` — ${b.arabic_name}` : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>বিষয়ের নাম *</label>
              <input required value={subjForm.name} onChange={(e) => setSubjForm({ ...subjForm, name: e.target.value })} placeholder="যেমন: সহীহ বুখারী শরীফ" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>বিষয় কোড</label>
              <input value={subjForm.code} onChange={(e) => setSubjForm({ ...subjForm, code: e.target.value })} placeholder="যেমন: KTB-105" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>পূর্ণমান</label>
                <input type="number" value={subjForm.full_marks} onChange={(e) => setSubjForm({ ...subjForm, full_marks: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>পাস নম্বর</label>
                <input type="number" value={subjForm.pass_marks} onChange={(e) => setSubjForm({ ...subjForm, pass_marks: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button type="submit" className={emeraldBtnClass}><Plus className="w-4 h-4" /> বিষয় যোগ করুন</button>
              {subjForm.class_id && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await apiFetch('/api/inst/subjects/from-books', {
                        method: 'POST',
                        body: {
                          class_id: Number(subjForm.class_id),
                          full_marks: Number(subjForm.full_marks || 100),
                          pass_marks: Number(subjForm.pass_marks || 33),
                        },
                      });
                      toast(
                        'success',
                        `${res.createdCount} টি কিতাব বিষয় হিসেবে যুক্ত হয়েছে`,
                        res.skippedCount > 0 ? `${res.skippedCount} টি আগেই যুক্ত ছিল` : undefined
                      );
                      loadAll();
                    } catch (err: any) {
                      toast('error', 'আমদানি ব্যর্থ', err.message);
                    }
                  }}
                  className={secondaryBtnClass}
                >
                  <BookOpen className="w-4 h-4 text-[#047857]" /> ক্লাসের সংযুক্ত কিতাবগুলো এক ক্লিকে আমদানি করুন
                </button>
              )}
            </div>
          </form>

          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <select value={subjClassFilter} onChange={(e) => setSubjClassFilter(e.target.value)} className={`${inputClass} sm:w-64`}>
                <option value="">সকল শ্রেণী</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.department_name} — {c.name}</option>)}
              </select>
              <input value={subjSearch} onChange={(e) => setSubjSearch(e.target.value)} placeholder="বিষয় বা কোড খুঁজুন..." className={`${inputClass} flex-1`} />
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="px-5 py-3">বিষয় / কিতাব</th>
                    <th className="px-4 py-3">শ্রেণী ও বিভাগ</th>
                    <th className="px-4 py-3 text-right">পূর্ণমান / পাস</th>
                    <th className="px-5 py-3 text-right">মুছুন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSubjects.map((s) => (
                    <tr key={s.id}>
                      <td className="px-5 py-3">
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-2">
                          {s.code && <span className="font-mono-num">{s.code}</span>}
                          {s.book_code && (
                            <span className="font-mono-num text-[#047857] dark:text-emerald-400">
                              কিতাব: {s.book_code}
                            </span>
                          )}
                          {s.book_arabic_name && <span dir="rtl">{s.book_arabic_name}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {s.department_name} · {s.class_name}
                        {s.jamaat_name && s.jamaat_name !== s.class_name ? ` (${s.jamaat_name})` : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num text-xs">{s.full_marks} / {s.pass_marks}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/inst/subjects/${s.id}`, { method: 'DELETE' });
                            toast('success', 'বিষয় মুছে ফেলা হয়েছে');
                            loadAll();
                          }}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ROUTINE */}
      {tab === 'routine' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const payload = {
                ...routineForm,
                department_id: Number(routineForm.department_id),
                class_id: Number(routineForm.class_id),
                jamaat_id: routineForm.jamaat_id ? Number(routineForm.jamaat_id) : null,
                subject_id: Number(routineForm.subject_id),
                teacher_id: Number(routineForm.teacher_id),
                period_number: Number(routineForm.period_number),
              };
              try {
                if (editingRoutineId) {
                  await apiFetch(`/api/inst/routines/${editingRoutineId}`, {
                    method: 'PUT',
                    body: payload,
                  });
                  toast('success', 'ক্লাস রুটিন সফলভাবে আপডেট হয়েছে');
                  setEditingRoutineId(null);
                  setRoutineForm(emptyRoutineForm);
                } else {
                  await apiFetch('/api/inst/routines', {
                    method: 'POST',
                    body: payload,
                  });
                  toast(
                    'success',
                    routineForm.day_of_week === DAILY_DAY_OPTION
                      ? 'ডেইলি (প্রতিদিন) ক্লাস রুটিন যুক্ত হয়েছে'
                      : 'ক্লাস রুটিনে পিরিয়ড যুক্ত হয়েছে'
                  );
                }
                loadAll();
              } catch (err: any) {
                toast('error', 'রুটিন দ্বন্দ্ব / ত্রুটি', err.message);
              }
            }}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5 h-fit"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {editingRoutineId ? 'রুটিন পিরিয়ড সম্পাদনা করুন' : 'নতুন রুটিন পিরিয়ড'}
              </h3>
              {editingRoutineId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRoutineId(null);
                    setRoutineForm(emptyRoutineForm);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" /> বাতিল
                </button>
              )}
            </div>
            <div>
              <label className={labelClass}>বিভাগ *</label>
              <select
                required
                value={routineForm.department_id}
                onChange={(e) => setRoutineForm({ ...routineForm, department_id: e.target.value, class_id: '', jamaat_id: '', subject_id: '' })}
                className={inputClass}
              >
                <option value="">-- বিভাগ --</option>
                {departments.filter((d) => d.status === 'active').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>ক্লাস *</label>
              <select
                required
                value={routineForm.class_id}
                onChange={(e) => {
                  const nextCid = e.target.value;
                  const clsObj = classes.find((c) => String(c.id) === nextCid);
                  const firstJ = clsObj?.jamaats?.find((j: any) => j.status === 'active');
                  setRoutineForm({
                    ...routineForm,
                    class_id: nextCid,
                    jamaat_id: firstJ ? String(firstJ.id) : '',
                    subject_id: '',
                  });
                }}
                className={inputClass}
              >
                <option value="">-- ক্লাস --</option>
                {routineClassesForDept.filter((c) => c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>শ্রেণী / জামাতের নাম (ঐচ্ছিক)</label>
              <select
                value={routineForm.jamaat_id}
                onChange={(e) => setRoutineForm({ ...routineForm, jamaat_id: e.target.value })}
                className={inputClass}
              >
                <option value="">-- শ্রেণী / জামাত --</option>
                {(() => {
                  const clsObj = classes.find((c) => String(c.id) === routineForm.class_id);
                  const list =
                    clsObj?.jamaats?.filter((j: any) => j.status === 'active')?.length > 0
                      ? clsObj.jamaats.filter((j: any) => j.status === 'active')
                      : jamaats.filter((j) => j.status === 'active');
                  return list.map((j: any) => (
                    <option key={j.id} value={j.id}>{j.name}</option>
                  ));
                })()}
              </select>
            </div>
            <div>
              <label className={labelClass}>বিষয় *</label>
              <select required value={routineForm.subject_id} onChange={(e) => setRoutineForm({ ...routineForm, subject_id: e.target.value })} className={inputClass}>
                <option value="">-- বিষয় --</option>
                {routineSubjectsForClass.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>শিক্ষক *</label>
              <select required value={routineForm.teacher_id} onChange={(e) => setRoutineForm({ ...routineForm, teacher_id: e.target.value })} className={inputClass}>
                <option value="">-- শিক্ষক --</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>বার *</label>
                <select value={routineForm.day_of_week} onChange={(e) => setRoutineForm({ ...routineForm, day_of_week: e.target.value })} className={inputClass}>
                  {ROUTINE_DAY_OPTIONS.map((day) => <option key={day} value={day}>{day}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>পিরিয়ড নং</label>
                <input type="number" min={1} value={routineForm.period_number} onChange={(e) => setRoutineForm({ ...routineForm, period_number: e.target.value })} className={inputClass} />
              </div>
            </div>
            {routineForm.day_of_week === DAILY_DAY_OPTION && (
              <div className="text-[11px] rounded-lg px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                ডেইলি নির্বাচিত: একটি মাত্র রেকর্ড হিসেবে সংরক্ষিত হবে এবং শনিবার থেকে শুক্রবার প্রতিদিন কার্যকর থাকবে।
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>শুরুর সময়</label>
                <input type="time" value={routineForm.start_time} onChange={(e) => setRoutineForm({ ...routineForm, start_time: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>শেষ সময়</label>
                <input type="time" value={routineForm.end_time} onChange={(e) => setRoutineForm({ ...routineForm, end_time: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>কক্ষ নম্বর (Room)</label>
              <input value={routineForm.room} onChange={(e) => setRoutineForm({ ...routineForm, room: e.target.value })} placeholder="যেমন: কক্ষ-১০২" className={inputClass} />
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" className={emeraldBtnClass}>
                {editingRoutineId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {editingRoutineId ? 'রুটিন আপডেট করুন' : 'রুটিনে যোগ করুন'}
              </button>
              {editingRoutineId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRoutineId(null);
                    setRoutineForm(emptyRoutineForm);
                  }}
                  className={secondaryBtnClass}
                >
                  বাতিল
                </button>
              )}
            </div>
          </form>

          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <select value={routineClassFilter} onChange={(e) => setRoutineClassFilter(e.target.value)} className={`${inputClass} sm:w-56`}>
                  <option value="">সকল শ্রেণীর রুটিন</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.department_name} — {c.name}</option>)}
                </select>
                {routineViewMode === 'list' && (
                  <select value={routineDayFilter} onChange={(e) => setRoutineDayFilter(e.target.value)} className={`${inputClass} sm:w-44`}>
                    <option value="">সকল বার</option>
                    {ROUTINE_DAY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setRoutineViewMode('list')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    routineViewMode === 'list' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  তালিকা ভিউ
                </button>
                <button
                  type="button"
                  onClick={() => setRoutineViewMode('weekly')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer inline-flex items-center gap-1.5 ${
                    routineViewMode === 'weekly' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  সাপ্তাহিক (শনি–শুক্র)
                </button>
              </div>
            </div>

            {routineViewMode === 'list' ? (
              filteredRoutines.length === 0 ? (
                <EmptyState title="কোনো রুটিন তৈরি হয়নি" description="বাম ফর্ম থেকে শ্রেণী ও শিক্ষকের ক্লাস রুটিন নির্ধারণ করুন।" />
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className={tableHeadClass}>
                        <tr>
                          <th className="px-4 py-3">বার ও পিরিয়ড</th>
                          <th className="px-4 py-3">সময়</th>
                          <th className="px-4 py-3">শ্রেণী ও বিষয়</th>
                          <th className="px-4 py-3">শিক্ষক ও কক্ষ</th>
                          <th className="px-4 py-3 text-right">কার্যক্রম</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredRoutines.map((r) => (
                          <tr key={r.id} className={editingRoutineId === r.id ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''}>
                            <td className="px-4 py-3">
                              <div className="font-semibold flex items-center gap-1.5 flex-wrap">
                                <span>{isDailySchedule(r) ? DAILY_DAY_OPTION : r.day_of_week}</span>
                                {isDailySchedule(r) && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                    শনি–শুক্র
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500">পিরিয়ড #{r.period_number}</div>
                            </td>
                            <td className="px-4 py-3 font-mono-num text-xs">{r.start_time} – {r.end_time}</td>
                            <td className="px-4 py-3">
                              <div className="font-medium">{r.subject_name}</div>
                              <div className="text-xs text-slate-500">
                                {r.department_name} · {r.class_name}
                                {r.jamaat_name && r.jamaat_name !== r.class_name ? ` (${r.jamaat_name})` : ''}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <div className="font-medium">{r.teacher_name}</div>
                              <div className="text-slate-500">{r.room || '—'}</div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  title="সম্পাদনা"
                                  onClick={() => startEditRoutine(r)}
                                  className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  title="মুছুন"
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: 'রুটিন মুছে ফেলবেন?',
                                      message: 'এই রুটিন পিরিয়ডটি স্থায়ীভাবে মুছে ফেলা হবে।',
                                      confirmLabel: 'মুছে ফেলুন',
                                      danger: true,
                                    });
                                    if (!ok) return;
                                    await apiFetch(`/api/inst/routines/${r.id}`, { method: 'DELETE' });
                                    if (editingRoutineId === r.id) {
                                      setEditingRoutineId(null);
                                      setRoutineForm(emptyRoutineForm);
                                    }
                                    toast('success', 'রুটিন মুছে ফেলা হয়েছে');
                                    loadAll();
                                  }}
                                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {weeklyRoutines.map((bucket) => (
                  <div
                    key={bucket.day}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
                  >
                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{bucket.day}</span>
                      <span className="text-[11px] font-mono-num text-slate-500">{bucket.items.length} টি ক্লাস</span>
                    </div>
                    {bucket.items.length === 0 ? (
                      <div className="p-4 text-xs text-slate-400">কোনো ক্লাস নির্ধারিত নেই</div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {bucket.items.map((r) => (
                          <div key={`${bucket.day}-${r.id}`} className="px-4 py-2.5 flex items-start justify-between gap-2 text-xs">
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                                <span>{r.subject_name}</span>
                                {isDailySchedule(r) && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                    ডেইলি
                                  </span>
                                )}
                              </div>
                              <div className="text-slate-500 mt-0.5">
                                {r.class_name} · {r.teacher_name}
                                {r.room ? ` · কক্ষ ${r.room}` : ''}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono-num font-semibold text-slate-700 dark:text-slate-200">
                                {r.start_time}–{r.end_time}
                              </div>
                              <div className="text-[10px] text-slate-400">পিরিয়ড #{r.period_number}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
