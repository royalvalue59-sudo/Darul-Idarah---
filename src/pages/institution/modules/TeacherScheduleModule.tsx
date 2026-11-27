import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Calendar, Clock, Coffee, Pencil, Plus, Trash2, X } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import {
  DAILY_DAY_OPTION,
  ROUTINE_DAY_OPTIONS,
  expandWeeklySchedules,
  isDailySchedule,
} from '../../../lib/routineDays';
import { useApp } from '../../../context/AppContext';
import {
  EmptyState,
  PageHeader,
  StatusText,
  TableSkeleton,
  emeraldBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  secondaryBtnClass,
  tableHeadClass,
} from '../../../components/ui/Primitives';

export function TeacherScheduleModule() {
  const { hasPermission, toast, confirm } = useApp();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [breaks, setBreaks] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [jamaats, setJamaats] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTeacher, setFilterTeacher] = useState('');
  const [filterDay, setFilterDay] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'weekly'>('list');
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  const emptyClassForm = {
    teacher_id: '',
    department_id: '',
    class_id: '',
    jamaat_id: '',
    subject_id: '',
    day_of_week: DAILY_DAY_OPTION as string,
    start_time: '08:00',
    end_time: '08:45',
    room_number: '',
    status: 'active',
  };
  const [classForm, setClassForm] = useState(emptyClassForm);

  const [breakForm, setBreakForm] = useState({
    teacher_id: '',
    day_of_week: DAILY_DAY_OPTION as string,
    break_title: 'যোহর ও খাবার বিরতি',
    start_time: '13:00',
    end_time: '14:00',
  });

  const canCreate = hasPermission('teachers', 'create') || hasPermission('academic', 'create');
  const canEdit = hasPermission('teachers', 'edit') || hasPermission('academic', 'edit');
  const canDelete = hasPermission('teachers', 'delete') || hasPermission('academic', 'delete');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filterTeacher) q.set('teacher_id', filterTeacher);
      if (filterDay) q.set('day_of_week', filterDay);

      const [scRes, tRes, dRes, cRes, jRes, sRes] = await Promise.all([
        apiFetch<{ schedules: any[]; breaks: any[] }>(`/api/inst/teachers/schedules?${q.toString()}`),
        apiFetch<{ teachers: any[] }>('/api/inst/teachers'),
        apiFetch<{ departments: any[] }>('/api/inst/departments'),
        apiFetch<{ classes: any[] }>('/api/inst/classes'),
        apiFetch<{ jamaats: any[] }>('/api/inst/jamaats'),
        apiFetch<{ subjects: any[] }>('/api/inst/subjects'),
      ]);
      setSchedules(scRes.schedules || []);
      setBreaks(scRes.breaks || []);
      setTeachers(tRes.teachers || []);
      setDepartments(dRes.departments || []);
      setClasses(cRes.classes || []);
      setJamaats(jRes.jamaats || []);
      setSubjects(sRes.subjects || []);
    } catch (err: any) {
      toast('error', 'শিডিউল লোড করা যায়নি', err.message);
    } finally {
      setLoading(false);
    }
  }, [filterTeacher, filterDay, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filteredClasses = classForm.department_id
    ? classes.filter((c) => String(c.department_id) === classForm.department_id)
    : classes;

  const filteredSubjects = classForm.class_id
    ? subjects.filter((s) => String(s.class_id) === classForm.class_id)
    : subjects;

  const startEditSchedule = (sc: any) => {
    setConflictMsg(null);
    setEditingScheduleId(sc.id);
    setClassForm({
      teacher_id: String(sc.teacher_id || ''),
      department_id: sc.department_id ? String(sc.department_id) : '',
      class_id: sc.class_id ? String(sc.class_id) : '',
      jamaat_id: sc.jamaat_id ? String(sc.jamaat_id) : '',
      subject_id: sc.subject_id ? String(sc.subject_id) : '',
      day_of_week: isDailySchedule(sc) ? DAILY_DAY_OPTION : String(sc.day_of_week || 'শনিবার'),
      start_time: String(sc.start_time || '08:00'),
      end_time: String(sc.end_time || '08:45'),
      room_number: String(sc.room_number || ''),
      status: sc.status === 'inactive' ? 'inactive' : 'active',
    });
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setConflictMsg(null);
    setSaving(true);
    const payload = {
      teacher_id: Number(classForm.teacher_id),
      department_id: classForm.department_id ? Number(classForm.department_id) : null,
      class_id: Number(classForm.class_id),
      jamaat_id: classForm.jamaat_id ? Number(classForm.jamaat_id) : null,
      subject_id: classForm.subject_id ? Number(classForm.subject_id) : null,
      day_of_week: classForm.day_of_week,
      start_time: classForm.start_time,
      end_time: classForm.end_time,
      room_number: classForm.room_number,
      status: classForm.status,
    };
    try {
      if (editingScheduleId) {
        await apiFetch(`/api/inst/teachers/schedules/${editingScheduleId}`, {
          method: 'PUT',
          body: payload,
        });
        toast('success', 'ক্লাস শিডিউল সফলভাবে আপডেট হয়েছে');
        setEditingScheduleId(null);
        setClassForm(emptyClassForm);
      } else {
        await apiFetch('/api/inst/teachers/schedules', {
          method: 'POST',
          body: payload,
        });
        toast(
          'success',
          classForm.day_of_week === DAILY_DAY_OPTION
            ? 'ডেইলি (প্রতিদিন) ক্লাস শিডিউল যোগ করা হয়েছে'
            : 'ক্লাস শিডিউল সফলভাবে যোগ করা হয়েছে'
        );
        setClassForm((f) => ({ ...f, room_number: '' }));
      }
      loadAll();
    } catch (err: any) {
      if (err.status === 409) {
        setConflictMsg(err.message);
      }
      toast('error', 'শিডিউল সংরক্ষণ ব্যর্থ', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddBreak = async (e: React.FormEvent) => {
    e.preventDefault();
    setConflictMsg(null);
    setSaving(true);
    try {
      await apiFetch('/api/inst/teachers/breaks', {
        method: 'POST',
        body: {
          teacher_id: Number(breakForm.teacher_id),
          day_of_week: breakForm.day_of_week,
          label: breakForm.break_title,
          start_time: breakForm.start_time,
          end_time: breakForm.end_time,
        },
      });
      toast('success', 'বিরতির সময়সূচি যোগ করা হয়েছে');
      loadAll();
    } catch (err: any) {
      if (err.status === 409) {
        setConflictMsg(err.message);
      }
      toast('error', 'বিরতি যোগ ব্যর্থ', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    const ok = await confirm({
      title: 'শিডিউল মুছে ফেলবেন?',
      message: 'এই ক্লাস শিডিউলটি স্থায়ীভাবে মুছে ফেলা হবে।',
      confirmLabel: 'মুছে ফেলুন',
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/inst/teachers/schedules/${id}`, { method: 'DELETE' });
      toast('success', 'ক্লাস শিডিউল মুছে ফেলা হয়েছে');
      loadAll();
    } catch (err: any) {
      toast('error', 'মুছে ফেলা ব্যর্থ', err.message);
    }
  };

  const handleDeleteBreak = async (id: number) => {
    const ok = await confirm({
      title: 'বিরতি মুছে ফেলবেন?',
      message: 'এই বিরতির সময়সূচি স্থায়ীভাবে মুছে ফেলা হবে।',
      confirmLabel: 'মুছে ফেলুন',
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/inst/teachers/breaks/${id}`, { method: 'DELETE' });
      toast('success', 'বিরতি মুছে ফেলা হয়েছে');
      loadAll();
    } catch (err: any) {
      toast('error', 'মুছে ফেলা ব্যর্থ', err.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="শিক্ষক ক্লাস শিডিউল ও বিরতি ব্যবস্থাপনা"
        subtitle="প্রতিটি শিক্ষকের জন্য সীমাহীন ক্লাস ও বিরতির সময়সূচি এবং স্বয়ংক্রিয় ওভারল্যাপ কনফ্লিক্ট সুরক্ষা"
      />

      {conflictMsg && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-300">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
          <div>
            <div className="font-semibold">সময়সূচি কনফ্লিক্ট শনাক্ত হয়েছে!</div>
            <div className="text-xs mt-0.5">{conflictMsg}</div>
          </div>
        </div>
      )}

      {(canCreate || (canEdit && editingScheduleId !== null)) && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Add / Edit Class Schedule Form */}
          <form
            onSubmit={handleAddClass}
            className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#6D28D9]" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {editingScheduleId ? 'ক্লাস শিডিউল সম্পাদনা করুন' : 'নতুন ক্লাস শিডিউল যোগ করুন'}
                </h2>
              </div>
              {editingScheduleId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingScheduleId(null);
                    setClassForm(emptyClassForm);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" /> বাতিল
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <div>
                <label className={labelClass}>শিক্ষক *</label>
                <select
                  required
                  value={classForm.teacher_id}
                  onChange={(e) => setClassForm((f) => ({ ...f, teacher_id: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">নির্বাচন করুন</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} ({t.teacher_code || `#${t.id}`})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>বিভাগ</label>
                <select
                  value={classForm.department_id}
                  onChange={(e) => setClassForm((f) => ({ ...f, department_id: e.target.value, class_id: '', jamaat_id: '', subject_id: '' }))}
                  className={inputClass}
                >
                  <option value="">সব বিভাগ</option>
                  {departments.filter((d) => d.status === 'active').map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>ক্লাস *</label>
                <select
                  required
                  value={classForm.class_id}
                  onChange={(e) => {
                    const nextCid = e.target.value;
                    const clsObj = classes.find((c) => String(c.id) === nextCid);
                    const autoJid = clsObj?.jamaat_id
                      ? String(clsObj.jamaat_id)
                      : clsObj?.jamaats?.[0]?.id
                      ? String(clsObj.jamaats[0].id)
                      : '';
                    setClassForm((f) => ({ ...f, class_id: nextCid, jamaat_id: autoJid, subject_id: '' }));
                  }}
                  className={inputClass}
                >
                  <option value="">নির্বাচন করুন</option>
                  {filteredClasses.filter((c) => c.status === 'active').map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.jamaat_name && c.jamaat_name !== c.name ? ` (${c.jamaat_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>শ্রেণী / জামাত (ঐচ্ছিক)</label>
                <select
                  value={classForm.jamaat_id}
                  onChange={(e) => setClassForm((f) => ({ ...f, jamaat_id: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">নির্বাচন নেই</option>
                  {jamaats
                    .filter(
                      (j) =>
                        j.status === 'active' &&
                        (!classForm.department_id || !j.department_id || String(j.department_id) === classForm.department_id)
                    )
                    .map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>বিষয় / কিতাব</label>
                <select
                  value={classForm.subject_id}
                  onChange={(e) => setClassForm((f) => ({ ...f, subject_id: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">নির্বাচন নেই</option>
                  {filteredSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.book_code ? ` [${s.book_code}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>বার *</label>
                <select
                  value={classForm.day_of_week}
                  onChange={(e) => setClassForm((f) => ({ ...f, day_of_week: e.target.value }))}
                  className={inputClass}
                >
                  {ROUTINE_DAY_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>শুরুর সময় (HH:MM) *</label>
                <input
                  type="time"
                  required
                  value={classForm.start_time}
                  onChange={(e) => setClassForm((f) => ({ ...f, start_time: e.target.value }))}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelClass}>শেষের সময় (HH:MM) *</label>
                <input
                  type="time"
                  required
                  value={classForm.end_time}
                  onChange={(e) => setClassForm((f) => ({ ...f, end_time: e.target.value }))}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelClass}>রুম নম্বর</label>
                <input
                  type="text"
                  value={classForm.room_number}
                  onChange={(e) => setClassForm((f) => ({ ...f, room_number: e.target.value }))}
                  placeholder="যেমন: ২০২"
                  className={inputClass}
                />
              </div>
            </div>

            {classForm.day_of_week === DAILY_DAY_OPTION && (
              <div className="text-[11px] rounded-lg px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                ডেইলি (প্রতিদিন): একটি মাত্র শিডিউল রেকর্ড সংরক্ষিত হবে এবং শনিবার থেকে শুক্রবার প্রতিদিন Live Status ও প্রোফাইলে কার্যকর থাকবে।
              </div>
            )}

            <div className="flex justify-end gap-2">
              {editingScheduleId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingScheduleId(null);
                    setClassForm(emptyClassForm);
                  }}
                  className={secondaryBtnClass}
                >
                  বাতিল
                </button>
              )}
              <button type="submit" disabled={saving} className={emeraldBtnClass}>
                {editingScheduleId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {saving
                  ? 'সংরক্ষণ হচ্ছে...'
                  : editingScheduleId
                  ? 'শিডিউল আপডেট করুন'
                  : 'ক্লাস শিডিউল যোগ করুন'}
              </button>
            </div>
          </form>

          {/* Add Break Schedule Form */}
          <form
            onSubmit={handleAddBreak}
            className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Coffee className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">বিরতির সময়সূচি যোগ করুন</h2>
            </div>

            <div>
              <label className={labelClass}>শিক্ষক *</label>
              <select
                required
                value={breakForm.teacher_id}
                onChange={(e) => setBreakForm((f) => ({ ...f, teacher_id: e.target.value }))}
                className={inputClass}
              >
                <option value="">নির্বাচন করুন</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>বার *</label>
                <select
                  value={breakForm.day_of_week}
                  onChange={(e) => setBreakForm((f) => ({ ...f, day_of_week: e.target.value }))}
                  className={inputClass}
                >
                  {ROUTINE_DAY_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>বিরতির শিরোনাম *</label>
                <input
                  type="text"
                  required
                  value={breakForm.break_title}
                  onChange={(e) => setBreakForm((f) => ({ ...f, break_title: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>শুরুর সময় *</label>
                <input
                  type="time"
                  required
                  value={breakForm.start_time}
                  onChange={(e) => setBreakForm((f) => ({ ...f, start_time: e.target.value }))}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelClass}>শেষের সময় *</label>
                <input
                  type="time"
                  required
                  value={breakForm.end_time}
                  onChange={(e) => setBreakForm((f) => ({ ...f, end_time: e.target.value }))}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
            </div>

            <button type="submit" disabled={saving} className={`${primaryBtnClass} w-full`}>
              <Plus className="w-4 h-4" />
              বিরতি যোগ করুন
            </button>
          </form>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterTeacher}
            onChange={(e) => setFilterTeacher(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <option value="">সকল শিক্ষক</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
          {viewMode === 'list' && (
            <select
              value={filterDay}
              onChange={(e) => setFilterDay(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="">সকল বার</option>
              {ROUTINE_DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              viewMode === 'list' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            তালিকা ভিউ
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterDay('');
              setViewMode('weekly');
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer inline-flex items-center gap-1.5 ${
              viewMode === 'weekly' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            সাপ্তাহিক (শনি–শুক্র)
          </button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white">
              ক্লাস শিডিউল তালিকা ({schedules.length})
            </div>
            {schedules.length === 0 ? (
              <EmptyState title="কোনো ক্লাস শিডিউল পাওয়া যায়নি" />
            ) : viewMode === 'weekly' ? (
              <div className="p-4 grid sm:grid-cols-2 gap-3.5">
                {expandWeeklySchedules(schedules).map((bucket) => (
                  <div
                    key={bucket.day}
                    className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
                  >
                    <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{bucket.day}</span>
                      <span className="text-[11px] font-mono-num text-slate-500">{bucket.items.length} টি</span>
                    </div>
                    {bucket.items.length === 0 ? (
                      <div className="p-3 text-xs text-slate-400">কোনো ক্লাস নেই</div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {bucket.items.map((sc) => (
                          <div key={`${bucket.day}-${sc.id}`} className="px-3.5 py-2.5 flex items-start justify-between gap-2 text-xs">
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                                <span>{sc.teacher_name}</span>
                                {isDailySchedule(sc) && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                    ডেইলি
                                  </span>
                                )}
                              </div>
                              <div className="text-slate-500 mt-0.5">
                                {sc.class_name} · {sc.subject_name || 'সাধারণ'}
                                {sc.room_number ? ` · রুম ${sc.room_number}` : ''}
                              </div>
                            </div>
                            <div className="font-mono-num font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                              {sc.start_time}–{sc.end_time}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-4 py-3">শিক্ষক</th>
                      <th className="px-4 py-3">বার ও সময়</th>
                      <th className="px-4 py-3">বিভাগ / ক্লাস / জামাত</th>
                      <th className="px-4 py-3">বিষয় ও রুম</th>
                      <th className="px-4 py-3">স্ট্যাটাস</th>
                      {(canEdit || canDelete) && <th className="px-4 py-3 text-right">কার্যক্রম</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {schedules.map((sc) => (
                      <tr key={sc.id} className={editingScheduleId === sc.id ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{sc.teacher_name}</div>
                          <div className="text-[11px] font-mono-num text-slate-500">{sc.teacher_code}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                            <span>{isDailySchedule(sc) ? DAILY_DAY_OPTION : sc.day_of_week}</span>
                            {isDailySchedule(sc) && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                শনি–শুক্র
                              </span>
                            )}
                          </div>
                          <div className="font-mono-num text-slate-500">
                            {sc.start_time} – {sc.end_time}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {sc.class_name}
                            {sc.jamaat_name ? ` (${sc.jamaat_name})` : ''}
                          </div>
                          <div className="text-[11px] text-slate-500">{sc.department_name || '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{sc.subject_name || 'সাধারণ'}</div>
                          <div className="text-[11px] text-slate-500">রুম: {sc.room_number || '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusText status={sc.status} />
                        </td>
                        {(canEdit || canDelete) && (
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              {canEdit && (
                                <button
                                  type="button"
                                  title="সম্পাদনা"
                                  onClick={() => startEditSchedule(sc)}
                                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  title="মুছুন"
                                  onClick={() => handleDeleteSchedule(sc.id)}
                                  className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white">
              বিরতির সময়সূচি ({breaks.length})
            </div>
            {breaks.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">কোনো বিরতি নির্ধারিত নেই।</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {breaks.map((b) => (
                  <div key={b.id} className="px-4 py-3 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">{b.teacher_name}</div>
                      <div className="text-slate-600 dark:text-slate-400">
                        {b.day_of_week} · {b.label}
                      </div>
                      <div className="font-mono-num text-amber-700 dark:text-amber-400">
                        {b.start_time} – {b.end_time}
                      </div>
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteBreak(b.id)}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
