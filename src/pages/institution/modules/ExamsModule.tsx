import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { apiFetch, formatDateDMY, getTodayDhakaYMD } from '../../../lib/api';
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

export function ExamsModule() {
  const { toast, confirm, institution } = useApp();
  const [tab, setTab] = useState<'exams' | 'marks' | 'results'>('exams');

  const [departments, setDepartments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [jamaats, setJamaats] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);

  // Exam creation
  const [examForm, setExamForm] = useState({
    name: '১ম সাময়িক পরীক্ষা',
    academic_year: institution?.academic_year || '১৪৪৭-৪৮ হি. / ২০২৬',
    department_id: '',
    class_id: '',
    jamaat_id: '',
    start_date: getTodayDhakaYMD(),
    end_date: getTodayDhakaYMD(),
    status: 'ongoing',
  });

  // Marks entry
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [marksSheet, setMarksSheet] = useState<any[]>([]);
  const [marksSubjectInfo, setMarksSubjectInfo] = useState<any>(null);

  // EXACT RESULT NAVIGATION HIERARCHY (Section 14):
  // বিভাগ -> ক্লাস -> শিক্ষার্থী -> শিক্ষার্থীর সকল বিষয়ের ফলাফল
  const [resDept, setResDept] = useState<any>(null);
  const [resClass, setResClass] = useState<any>(null);
  const [resClassStudents, setResClassStudents] = useState<any[]>([]);
  const [resStudentProfile, setResStudentProfile] = useState<any>(null);

  const loadBase = useCallback(async () => {
    const [dRes, cRes, jRes, eRes] = await Promise.all([
      apiFetch('/api/inst/departments'),
      apiFetch('/api/inst/classes'),
      apiFetch('/api/inst/jamaats'),
      apiFetch('/api/inst/exams'),
    ]);
    setDepartments(dRes.departments || []);
    setClasses(cRes.classes || []);
    setJamaats(jRes.jamaats || []);
    setExams(eRes.exams || []);
  }, []);

  useEffect(() => {
    loadBase().catch(() => {});
  }, [loadBase]);

  // Load marks sheet when exam + subject selected
  useEffect(() => {
    if (!selectedExamId || !selectedSubjectId) {
      setMarksSheet([]);
      setMarksSubjectInfo(null);
      return;
    }
    apiFetch(`/api/inst/exams/${selectedExamId}/marks?subject_id=${selectedSubjectId}`)
      .then((res) => {
        setMarksSubjectInfo(res.subjectInfo);
        setMarksSheet(
          (res.rows || []).map((r: any) => ({
            ...r,
            obtained_marks: r.obtained_marks ?? '',
          }))
        );
      })
      .catch(() => {});
  }, [selectedExamId, selectedSubjectId]);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/inst/exams', {
        method: 'POST',
        body: {
          ...examForm,
          department_id: Number(examForm.department_id),
          class_id: Number(examForm.class_id),
          jamaat_id: examForm.jamaat_id ? Number(examForm.jamaat_id) : null,
        },
      });
      toast('success', 'নতুন পরীক্ষা তৈরি হয়েছে এবং শ্রেণীর সকল বিষয় স্বয়ংক্রিয়ভাবে যুক্ত হয়েছে');
      loadBase();
    } catch (err: any) {
      toast('error', 'পরীক্ষা তৈরি ব্যর্থ', err.message);
    }
  };

  const handleSaveMarks = async () => {
    try {
      const entries = marksSheet
        .filter((r) => r.obtained_marks !== '' && r.obtained_marks !== null)
        .map((r) => ({ student_id: r.student_id, obtained_marks: Number(r.obtained_marks) }));
      await apiFetch(`/api/inst/exams/${selectedExamId}/marks`, {
        method: 'POST',
        body: { subject_id: Number(selectedSubjectId), entries },
      });
      toast('success', 'নম্বর সফলভাবে সংরক্ষিত ও গ্রেড হিসাব করা হয়েছে');
    } catch (err: any) {
      toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
    }
  };

  const openResClass = async (cls: any) => {
    setResClass(cls);
    setResStudentProfile(null);
    const res = await apiFetch(`/api/inst/students?class_id=${cls.id}&status=active`);
    setResClassStudents(res.students || []);
  };

  const openResStudent = async (studentId: number) => {
    const res = await apiFetch(`/api/inst/results/student/${studentId}`);
    setResStudentProfile(res);
  };

  const selectedExam = exams.find((e) => String(e.id) === selectedExamId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="পরীক্ষা ও ফলাফল ব্যবস্থাপনা"
        subtitle="পরীক্ষা তৈরি, বিষয় নির্ধারণ, নম্বর এন্ট্রি, ফলাফল প্রকাশ এবং বিভাগ → ক্লাস → শিক্ষার্থী ফলাফল প্রোফাইল"
      />

      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit flex-wrap no-print">
        {[
          { id: 'exams', label: `পরীক্ষাসমূহ (${exams.length})` },
          { id: 'marks', label: 'নম্বর এন্ট্রি' },
          { id: 'results', label: 'ফলাফল (বিভাগ → ক্লাস → শিক্ষার্থী)' },
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

      {/* TAB 1: EXAMS */}
      {tab === 'exams' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateExam}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5 h-fit"
          >
            <h3 className="text-sm font-semibold">নতুন পরীক্ষা তৈরি করুন</h3>
            <div>
              <label className={labelClass}>পরীক্ষার নাম *</label>
              <input
                required
                list="exam-presets"
                value={examForm.name}
                onChange={(e) => setExamForm({ ...examForm, name: e.target.value })}
                className={inputClass}
              />
              <datalist id="exam-presets">
                <option value="১ম সাময়িক পরীক্ষা" />
                <option value="অর্ধবার্ষিক পরীক্ষা" />
                <option value="২য় সাময়িক পরীক্ষা" />
                <option value="বার্ষিক পরীক্ষা" />
              </datalist>
            </div>
            <div>
              <label className={labelClass}>শিক্ষাবর্ষ *</label>
              <input required value={examForm.academic_year} onChange={(e) => setExamForm({ ...examForm, academic_year: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>বিভাগ *</label>
              <select
                required
                value={examForm.department_id}
                onChange={(e) => setExamForm({ ...examForm, department_id: e.target.value, class_id: '', jamaat_id: '' })}
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
                value={examForm.class_id}
                onChange={(e) => {
                  const nextCid = e.target.value;
                  const clsObj = classes.find((c) => String(c.id) === nextCid);
                  const firstJ = clsObj?.jamaats?.find((j: any) => j.status === 'active');
                  setExamForm({
                    ...examForm,
                    class_id: nextCid,
                    jamaat_id: firstJ ? String(firstJ.id) : '',
                  });
                }}
                className={inputClass}
              >
                <option value="">-- ক্লাস --</option>
                {classes
                  .filter((c) => String(c.department_id) === examForm.department_id && c.status === 'active')
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>শ্রেণী / জামাতের নাম (ঐচ্ছিক)</label>
              <select
                value={examForm.jamaat_id}
                onChange={(e) => setExamForm({ ...examForm, jamaat_id: e.target.value })}
                className={inputClass}
              >
                <option value="">-- শ্রেণী / জামাত --</option>
                {(() => {
                  const clsObj = classes.find((c) => String(c.id) === examForm.class_id);
                  const list =
                    clsObj?.jamaats?.filter((j: any) => j.status === 'active')?.length > 0
                      ? clsObj.jamaats.filter((j: any) => j.status === 'active')
                      : jamaats.filter(
                          (j) =>
                            j.status === 'active' &&
                            (!examForm.department_id || !j.department_id || String(j.department_id) === examForm.department_id)
                        );
                  return list.map((j: any) => (
                    <option key={j.id} value={j.id}>{j.name}</option>
                  ));
                })()}
              </select>
            </div>
            {(() => {
              const clsObj = classes.find((c) => String(c.id) === examForm.class_id);
              const effBooks = clsObj?.effective_books || [];
              if (!clsObj || effBooks.length === 0) return null;
              return (
                <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/50 text-xs space-y-1.5">
                  <div className="font-semibold text-[#047857] dark:text-emerald-400">
                    সংযুক্ত কিতাব: {effBooks.length} টি · পরীক্ষার বিষয়: {clsObj.subject_count || 0} টি
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 line-clamp-2">
                    {effBooks.map((b: any) => b.name).join(', ')}
                  </div>
                  {Number(clsObj.subject_count || 0) < effBooks.length && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await apiFetch('/api/inst/subjects/from-books', {
                            method: 'POST',
                            body: { class_id: clsObj.id },
                          });
                          toast('success', `${res.createdCount} টি কিতাব পরীক্ষার বিষয় হিসেবে যুক্ত হয়েছে`);
                          loadBase();
                        } catch (err: any) {
                          toast('error', 'সিঙ্ক ব্যর্থ', err.message);
                        }
                      }}
                      className="text-[#6D28D9] dark:text-violet-400 font-semibold hover:underline cursor-pointer"
                    >
                      + কিতাবগুলো পরীক্ষার বিষয় হিসেবে সিঙ্ক করুন
                    </button>
                  )}
                </div>
              );
            })()}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>শুরুর তারিখ</label>
                <input type="date" value={examForm.start_date} onChange={(e) => setExamForm({ ...examForm, start_date: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>শেষ তারিখ</label>
                <input type="date" value={examForm.end_date} onChange={(e) => setExamForm({ ...examForm, end_date: e.target.value })} className={inputClass} />
              </div>
            </div>
            <button type="submit" className={emeraldBtnClass}><Plus className="w-4 h-4" /> পরীক্ষা তৈরি করুন</button>
          </form>

          <div className="lg:col-span-8 space-y-4">
            {exams.length === 0 ? (
              <EmptyState title="কোনো পরীক্ষা তৈরি হয়নি" description="বাম ফর্ম থেকে ১ম সাময়িক, অর্ধবার্ষিক বা বার্ষিক পরীক্ষা তৈরি করুন।" />
            ) : (
              exams.map((ex) => (
                <div key={ex.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-base">{ex.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {ex.department_name} · {ex.class_name}
                        {ex.jamaat_name && ex.jamaat_name !== ex.class_name ? ` (${ex.jamaat_name})` : ''} · {ex.academic_year} · {formatDateDMY(ex.start_date)} থেকে {formatDateDMY(ex.end_date)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusText status={ex.status} />
                      {ex.status !== 'published' ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/inst/exams/${ex.id}/status`, { method: 'PATCH', body: { status: 'published' } });
                            toast('success', 'ফলাফল প্রকাশিত হয়েছে', 'এখন শিক্ষার্থী ও অভিভাবক ড্যাশবোর্ডে ফলাফল দেখা যাবে।');
                            loadBase();
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#047857] text-white hover:opacity-90 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> ফলাফল প্রকাশ করুন
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/inst/exams/${ex.id}/status`, { method: 'PATCH', body: { status: 'completed' } });
                            toast('info', 'ফলাফল অপ্রকাশিত করা হয়েছে');
                            loadBase();
                          }}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                        >
                          প্রকাশনা স্থগিত
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await confirm({ title: 'পরীক্ষা মুছুন', message: `"${ex.name}" মুছে ফেলবেন?`, danger: true });
                          if (!ok) return;
                          await apiFetch(`/api/inst/exams/${ex.id}`, { method: 'DELETE' });
                          loadBase();
                        }}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Included / Excluded Subjects */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-medium text-slate-500 mb-2">পরীক্ষার অন্তর্ভুক্ত বিষয়সমূহ (ক্লিক করে অন্তর্ভুক্ত/বাদ দিন):</div>
                    <div className="flex flex-wrap gap-2">
                      {(ex.subjects || []).map((sub: any) => (
                        <button
                          key={sub.subject_id}
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/inst/exams/${ex.id}/subjects/${sub.subject_id}`, {
                              method: 'PATCH',
                              body: { included: sub.included ? 0 : 1 },
                            });
                            loadBase();
                          }}
                          className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                            sub.included
                              ? 'border-[#047857] text-[#047857] dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
                              : 'border-slate-200 dark:border-slate-700 text-slate-400 line-through'
                          }`}
                        >
                          {sub.subject_name} ({sub.full_marks})
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MARKS ENTRY */}
      {tab === 'marks' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>পরীক্ষা নির্বাচন করুন</label>
              <select
                value={selectedExamId}
                onChange={(e) => { setSelectedExamId(e.target.value); setSelectedSubjectId(''); }}
                className={inputClass}
              >
                <option value="">-- পরীক্ষা নির্বাচন --</option>
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} — {ex.department_name} / {ex.class_name} ({ex.academic_year})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>বিষয় নির্বাচন করুন</label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                disabled={!selectedExam}
                className={inputClass}
              >
                <option value="">-- বিষয় নির্বাচন --</option>
                {(selectedExam?.subjects || [])
                  .filter((s: any) => s.included)
                  .map((s: any) => (
                    <option key={s.subject_id} value={s.subject_id}>
                      {s.subject_name} (পূর্ণমান: {s.full_marks})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {marksSheet.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  বিষয়: <strong>{marksSubjectInfo?.subject_name}</strong> · পূর্ণমান: <strong className="font-mono-num">{marksSubjectInfo?.full_marks}</strong> · পাস নম্বর: <strong className="font-mono-num">{marksSubjectInfo?.pass_marks}</strong>
                </div>
                <button type="button" onClick={handleSaveMarks} className={emeraldBtnClass}>
                  <Save className="w-4 h-4" /> নম্বর সংরক্ষণ করুন
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-5 py-3">রোল</th>
                      <th className="px-4 py-3">শিক্ষার্থীর নাম</th>
                      <th className="px-4 py-3 text-right">প্রাপ্ত নম্বর</th>
                      <th className="px-5 py-3 text-right">বর্তমান গ্রেড / GPA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {marksSheet.map((row, idx) => (
                      <tr key={row.student_id}>
                        <td className="px-5 py-3 font-mono-num text-xs font-bold text-[#6D28D9]">{row.roll_number}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.full_name}</div>
                          {row.jamaat_name && <div className="text-[11px] text-slate-500">{row.jamaat_name}</div>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            max={marksSubjectInfo?.full_marks || 100}
                            step="0.5"
                            value={row.obtained_marks}
                            onChange={(e) => {
                              const next = [...marksSheet];
                              next[idx] = { ...row, obtained_marks: e.target.value };
                              setMarksSheet(next);
                            }}
                            className="w-28 text-right px-3 py-1.5 text-sm font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </td>
                        <td className="px-5 py-3 text-right text-xs font-mono-num">
                          {row.grade ? `${row.grade} (${row.gpa})` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState title="নম্বর এন্ট্রির জন্য পরীক্ষা ও বিষয় নির্বাচন করুন" description="শ্রেণীর সকল সক্রিয় শিক্ষার্থীর তালিকা স্বয়ংক্রিয়ভাবে লোড হবে।" />
          )}
        </div>
      )}

      {/* TAB 3: EXACT RESULT NAVIGATION HIERARCHY: বিভাগ ↓ ক্লাস ↓ শিক্ষার্থী ↓ শিক্ষার্থীর সকল বিষয়ের ফলাফল */}
      {tab === 'results' && (
        <div className="space-y-5">
          {/* Breadcrumb Stepper */}
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 flex-wrap no-print">
            <button
              type="button"
              onClick={() => { setResDept(null); setResClass(null); setResStudentProfile(null); }}
              className={`font-semibold cursor-pointer ${!resDept ? 'text-[#6D28D9]' : 'hover:underline'}`}
            >
              বিভাগসমূহ
            </button>
            {resDept && (
              <>
                <span>/</span>
                <button
                  type="button"
                  onClick={() => { setResClass(null); setResStudentProfile(null); }}
                  className={`font-semibold cursor-pointer ${!resClass ? 'text-[#6D28D9]' : 'hover:underline'}`}
                >
                  {resDept.name}
                </button>
              </>
            )}
            {resClass && (
              <>
                <span>/</span>
                <button
                  type="button"
                  onClick={() => setResStudentProfile(null)}
                  className={`font-semibold cursor-pointer ${!resStudentProfile ? 'text-[#6D28D9]' : 'hover:underline'}`}
                >
                  {resClass.name}
                </button>
              </>
            )}
            {resStudentProfile && (
              <>
                <span>/</span>
                <span className="font-semibold text-[#6D28D9]">{resStudentProfile.student.full_name}</span>
              </>
            )}
          </div>

          {/* Step 1: Department List */}
          {!resDept && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {departments.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setResDept(d)}
                  className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#6D28D9] rounded-xl p-5 transition-colors cursor-pointer"
                >
                  <div className="text-base font-bold text-slate-900 dark:text-white">{d.name}</div>
                  <div className="text-xs text-slate-500 mt-1 font-mono-num">
                    {d.class_count} টি শ্রেণী · {d.student_count} জন শিক্ষার্থী
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Class List */}
          {resDept && !resClass && (
            <div className="space-y-3">
              <button type="button" onClick={() => setResDept(null)} className={`${secondaryBtnClass} text-xs`}>
                <ArrowLeft className="w-3.5 h-3.5" /> বিভাগে ফিরুন
              </button>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {classes
                  .filter((c) => c.department_id === resDept.id)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openResClass(c)}
                      className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#6D28D9] rounded-xl p-5 transition-colors cursor-pointer"
                    >
                      <div className="text-base font-bold">{c.name}</div>
                      <div className="text-xs text-slate-500 mt-1 font-mono-num">
                        {c.subject_count} টি বিষয় · {c.student_count} জন শিক্ষার্থী
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Step 3: Student List */}
          {resClass && !resStudentProfile && (
            <div className="space-y-3">
              <button type="button" onClick={() => setResClass(null)} className={`${secondaryBtnClass} text-xs`}>
                <ArrowLeft className="w-3.5 h-3.5" /> শ্রেণীতে ফিরুন
              </button>
              {resClassStudents.length === 0 ? (
                <EmptyState title="এই শ্রেণীতে কোনো শিক্ষার্থী নেই" />
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className={tableHeadClass}>
                      <tr>
                        <th className="px-5 py-3">শিক্ষার্থী</th>
                        <th className="px-4 py-3">রোল ও আইডি</th>
                        <th className="px-4 py-3">বিভাগ ও শ্রেণী</th>
                        <th className="px-5 py-3 text-right">ফলাফল</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {resClassStudents.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              {s.photo_url ? (
                                <img src={s.photo_url} alt={s.full_name} referrerPolicy="no-referrer" className="w-8 h-8 rounded-lg object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-[#0F172A] text-white flex items-center justify-center text-xs font-bold">
                                  {s.full_name.charAt(0)}
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => openResStudent(s.id)}
                                className="font-semibold hover:text-[#6D28D9] cursor-pointer text-left"
                              >
                                {s.full_name}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono-num text-xs">
                            <span className="font-bold text-[#6D28D9]">{s.roll_number}</span> · {s.student_code}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{s.department_name} · {s.class_name}</td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openResStudent(s.id)}
                              className="text-xs font-semibold text-[#047857] hover:underline cursor-pointer"
                            >
                              সকল বিষয়ের ফলাফল দেখুন
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

          {/* Step 4: Student Complete Result Profile */}
          {resStudentProfile && (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3 no-print">
                <button type="button" onClick={() => setResStudentProfile(null)} className={`${secondaryBtnClass} text-xs`}>
                  <ArrowLeft className="w-3.5 h-3.5" /> শিক্ষার্থী তালিকায় ফিরুন
                </button>
                <button type="button" onClick={() => window.print()} className={primaryBtnClass}>
                  <Printer className="w-4 h-4" /> ফলাফলপত্র প্রিন্ট / PDF
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6 print-container">
                <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h2 className="text-xl font-bold">{institution?.name}</h2>
                    <p className="text-xs text-slate-500">শিক্ষার্থীর পূর্ণাঙ্গ একাডেমিক ফলাফলপত্র</p>
                  </div>
                  <div className="text-right text-xs font-mono-num">
                    <div className="font-bold text-sm">{resStudentProfile.student.full_name}</div>
                    <div>রোল: {resStudentProfile.student.roll_number} · আইডি: {resStudentProfile.student.student_code}</div>
                    <div className="text-slate-500">
                      {resStudentProfile.student.department_name} · {resStudentProfile.student.class_name}
                      {resStudentProfile.student.jamaat_name && resStudentProfile.student.jamaat_name !== resStudentProfile.student.class_name
                        ? ` (${resStudentProfile.student.jamaat_name})`
                        : ''}
                    </div>
                  </div>
                </div>

                {resStudentProfile.examResults.length === 0 ? (
                  <EmptyState title="এই শিক্ষার্থীর কোনো পরীক্ষার ফলাফল নেই" />
                ) : (
                  resStudentProfile.examResults.map((item: any) => (
                    <div key={item.exam.id} className="space-y-3 pb-6 border-b last:border-b-0 border-slate-200 dark:border-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-base font-bold">{item.exam.name}</h3>
                          <div className="text-xs text-slate-500">শিক্ষাবর্ষ: {item.exam.academic_year}</div>
                        </div>
                        <StatusText status={item.exam.status} />
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border border-slate-200 dark:border-slate-800">
                          <thead className={tableHeadClass}>
                            <tr>
                              <th className="px-4 py-2.5">বিষয় / কিতাব</th>
                              <th className="px-4 py-2.5 text-right">পূর্ণমান</th>
                              <th className="px-4 py-2.5 text-right">প্রাপ্ত নম্বর</th>
                              <th className="px-4 py-2.5 text-right">গ্রেড</th>
                              <th className="px-4 py-2.5 text-right">GPA</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {item.subjects.map((sub: any) => (
                              <tr key={sub.subject_id}>
                                <td className="px-4 py-2.5 font-medium">{sub.subject_name}</td>
                                <td className="px-4 py-2.5 text-right font-mono-num">{sub.full_marks}</td>
                                <td className="px-4 py-2.5 text-right font-mono-num font-semibold">
                                  {sub.obtained_marks !== null && sub.obtained_marks !== undefined ? sub.obtained_marks : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right text-xs">{sub.grade || '—'}</td>
                                <td className="px-4 py-2.5 text-right font-mono-num">{sub.gpa ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Result Summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-lg">
                        <div><span className="text-slate-500 block">মোট বিষয়</span><strong className="font-mono-num">{item.summary.totalSubjects}</strong></div>
                        <div><span className="text-slate-500 block">মোট পূর্ণমান</span><strong className="font-mono-num">{item.summary.totalFullMarks}</strong></div>
                        <div><span className="text-slate-500 block">মোট প্রাপ্ত</span><strong className="font-mono-num">{item.summary.totalObtainedMarks}</strong></div>
                        <div><span className="text-slate-500 block">গড় নম্বর</span><strong className="font-mono-num">{item.summary.averageMarks}</strong></div>
                        <div><span className="text-slate-500 block">GPA</span><strong className="font-mono-num">{item.summary.gpa}</strong></div>
                        <div><span className="text-slate-500 block">গ্রেড ও ফলাফল</span><strong className={item.summary.passFail === 'কৃতকার্য' ? 'text-[#047857]' : 'text-red-600'}>{item.summary.grade} ({item.summary.passFail})</strong></div>
                        <div><span className="text-slate-500 block">মেধাক্রম</span><strong className="font-mono-num">{item.summary.position ? `${item.summary.position}ম` : '—'}</strong></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
