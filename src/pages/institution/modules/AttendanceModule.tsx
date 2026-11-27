import React, { useCallback, useEffect, useState } from 'react';
import { CheckCheck, Clock, Save } from 'lucide-react';
import { apiFetch, getTodayDhakaYMD } from '../../../lib/api';
import { isDailySchedule } from '../../../lib/routineDays';
import { useApp } from '../../../context/AppContext';
import {
  EmptyState,
  PageHeader,
  emeraldBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  secondaryBtnClass,
  tableHeadClass,
} from '../../../components/ui/Primitives';

export function AttendanceModule() {
  const { toast } = useApp();
  const [tab, setTab] = useState<'students' | 'teachers'>('students');
  const [departments, setDepartments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [jamaats, setJamaats] = useState<any[]>([]);

  const [deptId, setDeptId] = useState('');
  const [classId, setClassId] = useState('');
  const [jamaatId, setJamaatId] = useState('');
  const [date, setDate] = useState(getTodayDhakaYMD());
  const [session, setSession] = useState('সকাল');
  const [studentRows, setStudentRows] = useState<any[]>([]);
  const [scheduledClasses, setScheduledClasses] = useState<any[]>([]);
  const [attWeekday, setAttWeekday] = useState('');
  const [teacherRows, setTeacherRows] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch('/api/inst/departments'), apiFetch('/api/inst/classes'), apiFetch('/api/inst/jamaats')])
      .then(([dRes, cRes, jRes]) => {
        setDepartments(dRes.departments || []);
        setClasses(cRes.classes || []);
        setJamaats(jRes.jamaats || []);
      })
      .catch(() => {});
  }, []);

  const loadStudentAtt = useCallback(async () => {
    const q = new URLSearchParams({ date, session });
    if (deptId) q.set('department_id', deptId);
    if (classId) q.set('class_id', classId);
    if (jamaatId) q.set('jamaat_id', jamaatId);
    const res = await apiFetch(`/api/inst/attendance/students?${q.toString()}`);
    setAttWeekday(res.weekday || '');
    setScheduledClasses(res.scheduled_classes || []);
    setStudentRows(
      (res.records || []).map((r: any) => ({
        ...r,
        status: r.status || 'present',
        note: r.note || '',
      }))
    );
  }, [date, session, deptId, classId, jamaatId]);

  const loadTeacherAtt = useCallback(async () => {
    const res = await apiFetch(`/api/inst/attendance/teachers?date=${date}`);
    setAttWeekday(res.weekday || '');
    setTeacherRows(
      (res.records || []).map((r: any) => ({
        ...r,
        status: r.status || 'present',
        check_in: r.check_in || '08:00',
        check_out: r.check_out || '16:00',
        note: r.note || '',
      }))
    );
  }, [date]);

  useEffect(() => {
    if (tab === 'students') loadStudentAtt().catch(() => {});
    else loadTeacherAtt().catch(() => {});
  }, [tab, loadStudentAtt, loadTeacherAtt]);

  const saveStudentAttendance = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/inst/attendance/students/bulk', {
        method: 'POST',
        body: {
          date,
          session,
          department_id: deptId ? Number(deptId) : null,
          class_id: classId ? Number(classId) : null,
          entries: studentRows.map((r) => ({
            student_id: r.student_id,
            status: r.status,
            note: r.note,
          })),
        },
      });
      toast('success', 'শিক্ষার্থীদের উপস্থিতি সংরক্ষিত হয়েছে', `${studentRows.length} জন শিক্ষার্থী`);
    } catch (err: any) {
      toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveTeacherAttendance = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/inst/attendance/teachers/bulk', {
        method: 'POST',
        body: {
          date,
          entries: teacherRows.map((r) => ({
            teacher_id: r.teacher_id,
            status: r.status,
            check_in: r.check_in,
            check_out: r.check_out,
            note: r.note,
          })),
        },
      });
      toast('success', 'শিক্ষক ও কর্মচারীদের উপস্থিতি সংরক্ষিত হয়েছে');
    } catch (err: any) {
      toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
    } finally {
      setSaving(false);
    }
  };

  const markAllStudents = (status: string) => {
    setStudentRows((prev) => prev.map((r) => ({ ...r, status })));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="উপস্থিতি ব্যবস্থাপনা"
        subtitle="বিভাগ, শ্রেণী ও তারিখ অনুযায়ী শিক্ষার্থী এবং শিক্ষক-কর্মচারীদের দৈনিক হাজিরা গ্রহণ"
      />

      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setTab('students')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
            tab === 'students' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          শিক্ষার্থী উপস্থিতি
        </button>
        <button
          type="button"
          onClick={() => setTab('teachers')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
            tab === 'teachers' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          শিক্ষক ও কর্মচারী উপস্থিতি
        </button>
      </div>

      {tab === 'students' ? (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className={labelClass}>বিভাগ</label>
              <select value={deptId} onChange={(e) => { setDeptId(e.target.value); setJamaatId(''); setClassId(''); }} className={inputClass}>
                <option value="">সকল বিভাগ</option>
                {departments.filter((d) => d.status !== 'archived').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>শ্রেণী / জামাত</label>
              <select value={jamaatId} onChange={(e) => { setJamaatId(e.target.value); setClassId(''); }} className={inputClass}>
                <option value="">সকল জামাত</option>
                {jamaats
                  .filter((j) => j.status !== 'archived' && (!deptId || !j.department_id || String(j.department_id) === deptId))
                  .map((j) => (
                    <option key={j.id} value={j.id}>{j.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>ক্লাস</label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputClass}>
                <option value="">সকল ক্লাস</option>
                {classes
                  .filter((c) => {
                    if (c.status === 'archived') return false;
                    if (deptId && String(c.department_id) !== deptId) return false;
                    if (jamaatId) {
                      const jids: number[] = Array.isArray(c.jamaat_ids) ? c.jamaat_ids : [];
                      if (String(c.jamaat_id || '') !== jamaatId && !jids.includes(Number(jamaatId))) return false;
                    }
                    return true;
                  })
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>তারিখ</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>সেশন</label>
              <select value={session} onChange={(e) => setSession(e.target.value)} className={inputClass}>
                <option value="সকাল">সকাল</option>
                <option value="দুপুর">দুপুর</option>
                <option value="বিকাল">বিকাল</option>
                <option value="রাত">রাত (তাকরার)</option>
                {scheduledClasses.map((sc) => {
                  const val = `${sc.subject_name} (${sc.start_time}–${sc.end_time})`;
                  return (
                    <option key={`${sc.source}-${sc.id}`} value={val}>
                      {sc.class_name}: {val}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {scheduledClasses.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#047857]" />
                {attWeekday ? `${attWeekday}-এর` : 'নির্বাচিত তারিখের'} নির্ধারিত ক্লাস রুটিন (ডেইলি সহ — {scheduledClasses.length} টি)
              </div>
              <div className="flex flex-wrap gap-2">
                {scheduledClasses.slice(0, 12).map((sc) => {
                  const slotSession = `${sc.subject_name} (${sc.start_time}–${sc.end_time})`;
                  const active = session === slotSession;
                  return (
                    <button
                      key={`${sc.source}-${sc.id}`}
                      type="button"
                      onClick={() => setSession(slotSession)}
                      className={`text-[11px] px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#047857] text-white border-[#047857]'
                          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#047857]'
                      }`}
                    >
                      <span className="font-semibold">{sc.subject_name}</span>
                      <span className="opacity-80"> · {sc.class_name} · {sc.start_time}–{sc.end_time}</span>
                      {isDailySchedule(sc) && (
                        <span className={`ml-1.5 text-[10px] font-semibold ${active ? 'text-emerald-100' : 'text-[#047857] dark:text-emerald-400'}`}>
                          [ডেইলি]
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {studentRows.length === 0 ? (
            <EmptyState title="কোনো সক্রিয় শিক্ষার্থী নেই" description="এই বিভাগ বা শ্রেণীতে কোনো সক্রিয় শিক্ষার্থী ভর্তি নেই।" />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => markAllStudents('present')} className={secondaryBtnClass}>
                    <CheckCheck className="w-4 h-4 text-[#047857]" /> সকলকে উপস্থিত
                  </button>
                  <button type="button" onClick={() => markAllStudents('absent')} className={secondaryBtnClass}>
                    সকলকে অনুপস্থিত
                  </button>
                </div>
                <button type="button" onClick={saveStudentAttendance} disabled={saving} className={emeraldBtnClass}>
                  <Save className="w-4 h-4" />
                  {saving ? 'সংরক্ষণ হচ্ছে...' : 'হাজিরা সংরক্ষণ করুন'}
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className={tableHeadClass}>
                      <tr>
                        <th className="px-5 py-3">রোল</th>
                        <th className="px-4 py-3">শিক্ষার্থী</th>
                        <th className="px-4 py-3">অবস্থা</th>
                        <th className="px-5 py-3">মন্তব্য</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {studentRows.map((row, idx) => (
                        <tr key={row.student_id}>
                          <td className="px-5 py-3 font-mono-num text-xs font-bold text-[#6D28D9]">{row.roll_number}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{row.full_name}</div>
                            <div className="text-xs text-slate-500">
                              {row.department_name} · {row.class_name}
                              {row.jamaat_name && row.jamaat_name !== row.class_name ? ` (${row.jamaat_name})` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {[
                                { v: 'present', l: 'উপস্থিত', active: 'bg-[#047857] text-white border-[#047857]' },
                                { v: 'absent', l: 'অনুপস্থিত', active: 'bg-red-600 text-white border-red-600' },
                                { v: 'late', l: 'বিলম্ব', active: 'bg-amber-600 text-white border-amber-600' },
                                { v: 'leave', l: 'ছুটি', active: 'bg-sky-600 text-white border-sky-600' },
                              ].map((opt) => (
                                <button
                                  key={opt.v}
                                  type="button"
                                  onClick={() => {
                                    const next = [...studentRows];
                                    next[idx] = { ...row, status: opt.v };
                                    setStudentRows(next);
                                  }}
                                  className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                                    row.status === opt.v
                                      ? opt.active
                                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  {opt.l}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <input
                              value={row.note}
                              onChange={(e) => {
                                const next = [...studentRows];
                                next[idx] = { ...row, note: e.target.value };
                                setStudentRows(next);
                              }}
                              placeholder="মন্তব্য..."
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="w-56">
              <label className={labelClass}>তারিখ</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <button type="button" onClick={saveTeacherAttendance} disabled={saving} className={primaryBtnClass}>
              <Save className="w-4 h-4" /> শিক্ষক হাজিরা সংরক্ষণ করুন
            </button>
          </div>

          {teacherRows.length === 0 ? (
            <EmptyState title="কোনো সক্রিয় শিক্ষক/কর্মচারী নেই" />
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="px-5 py-3">শিক্ষক / কর্মচারী</th>
                    <th className="px-4 py-3">অবস্থা</th>
                    <th className="px-4 py-3">প্রবেশ</th>
                    <th className="px-5 py-3">প্রস্থান</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {teacherRows.map((r, idx) => (
                    <tr key={r.teacher_id}>
                      <td className="px-5 py-3">
                        <div className="font-medium">{r.full_name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                          <span>{r.department_name || '—'}</span>
                          {Number(r.today_class_count || 0) > 0 && (
                            <span className="text-[11px] text-[#047857] dark:text-emerald-400 font-medium">
                              · {attWeekday ? `${attWeekday}` : 'আজকের'} নির্ধারিত ক্লাস: {r.today_class_count} টি
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={r.status}
                          onChange={(e) => {
                            const next = [...teacherRows];
                            next[idx] = { ...r, status: e.target.value };
                            setTeacherRows(next);
                          }}
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          <option value="present">উপস্থিত</option>
                          <option value="absent">অনুপস্থিত</option>
                          <option value="late">বিলম্ব</option>
                          <option value="leave">ছুটি</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="time"
                          value={r.check_in}
                          onChange={(e) => {
                            const next = [...teacherRows];
                            next[idx] = { ...r, check_in: e.target.value };
                            setTeacherRows(next);
                          }}
                          className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-transparent font-mono-num"
                        />
                      </td>
                      <td className="px-5 py-3">
                        <input
                          type="time"
                          value={r.check_out}
                          onChange={(e) => {
                            const next = [...teacherRows];
                            next[idx] = { ...r, check_out: e.target.value };
                            setTeacherRows(next);
                          }}
                          className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-transparent font-mono-num"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
