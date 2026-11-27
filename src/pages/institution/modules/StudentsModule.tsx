import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Edit3, Eye, Search, Trash2, Upload, UserPlus, CheckCircle2 } from 'lucide-react';
import { apiFetch, formatBDT, formatDateDMY, getTodayDhakaYMD } from '../../../lib/api';
import { FileUploadField } from '../../../components/ui/FileUploadField';
import { useApp } from '../../../context/AppContext';
import {
  EmptyState,
  Modal,
  PageHeader,
  Pagination,
  StatusText,
  emeraldBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  secondaryBtnClass,
  tableHeadClass,
} from '../../../components/ui/Primitives';

type StudentSubTab = 'all' | 'admission' | 'active' | 'inactive' | 'profiles' | 'search';

export function StudentsModule() {
  const { toast, confirm } = useApp();
  const [subTab, setSubTab] = useState<StudentSubTab>('all');
  const [students, setStudents] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [jamaats, setJamaats] = useState<any[]>([]);
  const [fieldCfg, setFieldCfg] = useState<Record<string, { enabled: boolean; required: boolean }>>({});

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [jamaatFilter, setJamaatFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [newCredentials, setNewCredentials] = useState<any>(null);
  const [editingFee, setEditingFee] = useState(false);
  const [feeEditForm, setFeeEditForm] = useState({ fee_type: 'regular', monthly_fee: '0', monthly_meal_cost: '0' });
  const [savingFee, setSavingFee] = useState(false);

  const blankAdm = {
    full_name: '',
    photo_url: '',
    father_name: '',
    mother_name: '',
    guardian_name: '',
    guardian_mobile: '',
    student_mobile: '',
    dob: '',
    blood_group: '',
    address: '',
    department_id: '',
    class_id: '',
    jamaat_id: '',
    admission_date: getTodayDhakaYMD(),
    previous_institution: '',
    additional_info: '',
    fee_type: 'regular',
    monthly_fee: '1000',
    monthly_meal_cost: '0',
    document_name: '',
    document_url: '',
    create_guardian_account: true,
  };
  const [admForm, setAdmForm] = useState(blankAdm);
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    const [sRes, dRes, cRes, jRes, pRes] = await Promise.all([
      apiFetch('/api/inst/students'),
      apiFetch('/api/inst/departments'),
      apiFetch('/api/inst/classes'),
      apiFetch('/api/inst/jamaats'),
      apiFetch('/api/inst/profile'),
    ]);
    setStudents(sRes.students || []);
    setDepartments(dRes.departments || []);
    setClasses(cRes.classes || []);
    setJamaats(jRes.jamaats || []);
    setFieldCfg(pRes.institution?.admission_fields || {});
  }, []);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  const openProfile = async (studentId: number) => {
    try {
      const res = await apiFetch<any>(`/api/inst/students/${studentId}`);
      setSelectedProfile(res);
      setEditingFee(false);
      setFeeEditForm({
        fee_type: res.student?.fee_type || 'regular',
        monthly_fee: String(res.student?.monthly_fee ?? 0),
        monthly_meal_cost: String(res.student?.monthly_meal_cost ?? 0),
      });
    } catch (err: any) {
      toast('error', 'প্রোফাইল লোড ব্যর্থ', err.message);
    }
  };

  const handleSaveStudentFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile?.student?.id) return;
    setSavingFee(true);
    try {
      await apiFetch(`/api/inst/students/${selectedProfile.student.id}`, {
        method: 'PUT',
        body: {
          fee_type: feeEditForm.fee_type,
          monthly_fee: Number(feeEditForm.monthly_fee || 0),
          monthly_meal_cost: Number(feeEditForm.monthly_meal_cost || 0),
        },
      });
      toast('success', 'শিক্ষার্থীর মাসিক ফি ও খাবার খরচ হালনাগাদ হয়েছে');
      setEditingFee(false);
      await Promise.all([openProfile(selectedProfile.student.id), loadAll()]);
    } catch (err: any) {
      toast('error', 'হালনাগাদ ব্যর্থ', err.message);
    } finally {
      setSavingFee(false);
    }
  };

  const handleAdmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/inst/students', {
        method: 'POST',
        body: {
          ...admForm,
          department_id: Number(admForm.department_id),
          class_id: Number(admForm.class_id),
          jamaat_id: admForm.jamaat_id ? Number(admForm.jamaat_id) : null,
          monthly_fee: Number(admForm.monthly_fee || 0),
          monthly_meal_cost: Number(admForm.monthly_meal_cost || 0),
        },
      });
      setNewCredentials({
        studentName: admForm.full_name,
        ...res.credentials,
      });
      setAdmForm(blankAdm);
      toast('success', 'শিক্ষার্থী ভর্তি সম্পন্ন হয়েছে', `রোল নম্বর: ${res.credentials.rollNumber}`);
      loadAll();
    } catch (err: any) {
      toast('error', 'ভর্তি ব্যর্থ', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStudentStatus = async (s: any) => {
    const nextStatus = s.status === 'active' ? 'inactive' : 'active';
    await apiFetch(`/api/inst/students/${s.id}`, { method: 'PUT', body: { status: nextStatus } });
    toast('success', `শিক্ষার্থীর অবস্থা "${nextStatus === 'active' ? 'সক্রিয়' : 'নিষ্ক্রিয়'}" করা হয়েছে`);
    loadAll();
  };

  const filtered = students.filter((s) => {
    if (subTab === 'active' && s.status !== 'active') return false;
    if (subTab === 'inactive' && s.status !== 'inactive') return false;
    if (deptFilter && String(s.department_id) !== deptFilter) return false;
    if (classFilter && String(s.class_id) !== classFilter) return false;
    if (jamaatFilter && String(s.jamaat_id) !== jamaatFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = `${s.full_name} ${s.roll_number} ${s.student_code} ${s.username} ${s.guardian_mobile} ${s.father_name} ${s.jamaat_name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const activeDepartments = departments.filter((d) => d.status === 'active');
  const admClasses = classes.filter(
    (c) => String(c.department_id) === admForm.department_id && c.status === 'active'
  );
  const selectedAdmClass = classes.find((c) => String(c.id) === admForm.class_id);
  const admJamaats =
    selectedAdmClass && Array.isArray(selectedAdmClass.jamaats) && selectedAdmClass.jamaats.filter((j: any) => j.status === 'active').length > 0
      ? selectedAdmClass.jamaats.filter((j: any) => j.status === 'active')
      : jamaats.filter(
          (j) =>
            j.status === 'active' &&
            (!admForm.department_id || !j.department_id || String(j.department_id) === admForm.department_id)
        );
  const selectedAdmJamaat = jamaats.find((j) => String(j.id) === admForm.jamaat_id);
  const admPreviewBooks = (() => {
    const map = new Map<number, any>();
    (selectedAdmClass?.effective_books || selectedAdmClass?.books || []).forEach((b: any) => {
      if (b.status !== 'archived') map.set(b.id, b);
    });
    (selectedAdmJamaat?.books || []).forEach((b: any) => {
      if (b.status !== 'archived' && !map.has(b.id)) map.set(b.id, b);
    });
    return Array.from(map.values());
  })();
  const isFieldEnabled = (k: string) => fieldCfg[k]?.enabled !== false;
  const isFieldReq = (k: string) => fieldCfg[k]?.required === true;

  return (
    <div className="space-y-6">
      <PageHeader
        title="শিক্ষার্থী ব্যবস্থাপনা ও ভর্তি"
        subtitle="সকল শিক্ষার্থী, নতুন ভর্তি ফর্ম (স্বয়ংক্রিয় রোল ও অ্যাকাউন্ট), প্রোফাইল এবং অনুসন্ধান"
        actions={
          <button type="button" onClick={() => setSubTab('admission')} className={emeraldBtnClass}>
            <UserPlus className="w-4 h-4" />
            নতুন ভর্তি ফর্ম
          </button>
        }
      />

      {/* Exact Student Sub-menu Tabs (Section 9) */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit flex-wrap">
        {[
          { id: 'all', label: `সকল শিক্ষার্থী (${students.length})` },
          { id: 'admission', label: 'ভর্তি ফর্ম' },
          { id: 'active', label: `সক্রিয় (${students.filter((s) => s.status === 'active').length})` },
          { id: 'inactive', label: `নিষ্ক্রিয় (${students.filter((s) => s.status === 'inactive').length})` },
          { id: 'profiles', label: 'শিক্ষার্থী প্রোফাইল' },
          { id: 'search', label: 'অনুসন্ধান' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setSubTab(t.id as StudentSubTab);
              setPage(1);
            }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === t.id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ADMISSION FORM TAB */}
      {subTab === 'admission' && (
        <div className="space-y-5">
          {newCredentials && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[#047857] dark:text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                ভর্তি সফল হয়েছে এবং স্বয়ংক্রিয় লগইন অ্যাকাউন্ট তৈরি হয়েছে!
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 text-xs">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200/70 dark:border-emerald-900">
                  <div className="text-slate-500">শিক্ষার্থীর নাম</div>
                  <div className="font-semibold text-sm mt-0.5">{newCredentials.studentName}</div>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200/70 dark:border-emerald-900">
                  <div className="text-slate-500">রোল নম্বর / শিক্ষার্থী আইডি</div>
                  <div className="font-mono-num font-bold text-sm mt-0.5 text-[#6D28D9]">
                    {newCredentials.rollNumber} · {newCredentials.studentCode}
                  </div>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200/70 dark:border-emerald-900">
                  <div className="text-slate-500">শিক্ষার্থী লগইন</div>
                  <div className="font-mono-num font-semibold mt-0.5">
                    ইউজারনেম: {newCredentials.username}
                    <br />
                    প্রাথমিক পিন: {newCredentials.initialPin}
                  </div>
                </div>
                {newCredentials.guardian && (
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200/70 dark:border-emerald-900">
                    <div className="text-slate-500">অভিভাবক লগইন</div>
                    <div className="font-mono-num font-semibold mt-0.5">
                      ইউজারনেম: {newCredentials.guardian.username}
                      <br />
                      প্রাথমিক পিন: {newCredentials.guardian.initialPin}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <form
            onSubmit={handleAdmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6"
          >
            <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
              <h2 className="text-base font-bold">নতুন শিক্ষার্থী ভর্তি ফর্ম</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                জমা দেওয়ার সাথে সাথেই স্বয়ংক্রিয় রোল নম্বর (০০০০০১ ক্রম), ইউনিক ইউজারনেম এবং প্রাথমিক পাসওয়ার্ড (রোল নম্বর) তৈরি হবে।
              </p>
            </div>

            {isFieldEnabled('student_photo') && (
              <FileUploadField
                category="image"
                module="student_photo"
                buttonLabel="শিক্ষার্থীর ছবি আপলোড"
                valueUrl={admForm.photo_url}
                showImagePreview
                previewClassName="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                onUploaded={(res) => setAdmForm((f) => ({ ...f, photo_url: res.url }))}
                onClear={admForm.photo_url ? () => setAdmForm((f) => ({ ...f, photo_url: '' })) : undefined}
                onError={(msg) => toast('error', 'ছবি আপলোড ব্যর্থ', msg)}
              />
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>শিক্ষার্থীর পূর্ণ নাম *</label>
                <input required value={admForm.full_name} onChange={(e) => setAdmForm({ ...admForm, full_name: e.target.value })} placeholder="যেমন: আব্দুল্লাহ আল মামুন" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>বিভাগ নির্বাচন *</label>
                <select
                  required
                  value={admForm.department_id}
                  onChange={(e) => setAdmForm({ ...admForm, department_id: e.target.value, class_id: '', jamaat_id: '' })}
                  className={inputClass}
                >
                  <option value="">-- বিভাগ --</option>
                  {activeDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>ক্লাস নির্বাচন *</label>
                <select
                  required
                  value={admForm.class_id}
                  onChange={(e) => {
                    const nextCid = e.target.value;
                    const clsObj = classes.find((c) => String(c.id) === nextCid);
                    const firstActiveJamaat = clsObj?.jamaats?.find((j: any) => j.status === 'active');
                    setAdmForm({
                      ...admForm,
                      class_id: nextCid,
                      jamaat_id: firstActiveJamaat ? String(firstActiveJamaat.id) : '',
                    });
                  }}
                  className={inputClass}
                >
                  <option value="">-- ক্লাস নির্বাচন --</option>
                  {admClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>শ্রেণী / জামাতের নাম</label>
                <select
                  value={admForm.jamaat_id}
                  onChange={(e) => setAdmForm({ ...admForm, jamaat_id: e.target.value })}
                  className={inputClass}
                >
                  <option value="">-- শ্রেণী / জামাত (ঐচ্ছিক) --</option>
                  {admJamaats.map((j: any) => (
                    <option key={j.id} value={j.id}>
                      {j.name}{j.short_name ? ` (${j.short_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {admPreviewBooks.length > 0 && (
                <div className="sm:col-span-2 lg:col-span-3 p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/60">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#047857] dark:text-emerald-400 mb-2">
                    <BookOpen className="w-3.5 h-3.5" />
                    এই ক্লাস / জামাতের নির্ধারিত পাঠ্য কিতাবসমূহ ({admPreviewBooks.length} টি)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {admPreviewBooks.map((b: any) => (
                      <div
                        key={b.id}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200/70 dark:border-emerald-800/60 text-xs"
                      >
                        <span className="font-medium text-slate-800 dark:text-slate-200">{b.name}</span>
                        {b.arabic_name && (
                          <span dir="rtl" className="ml-1.5 text-slate-500">
                            ({b.arabic_name})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isFieldEnabled('father_name') && (
                <div>
                  <label className={labelClass}>পিতার নাম {isFieldReq('father_name') ? '*' : ''}</label>
                  <input required={isFieldReq('father_name')} value={admForm.father_name} onChange={(e) => setAdmForm({ ...admForm, father_name: e.target.value })} className={inputClass} />
                </div>
              )}
              {isFieldEnabled('mother_name') && (
                <div>
                  <label className={labelClass}>মাতার নাম {isFieldReq('mother_name') ? '*' : ''}</label>
                  <input required={isFieldReq('mother_name')} value={admForm.mother_name} onChange={(e) => setAdmForm({ ...admForm, mother_name: e.target.value })} className={inputClass} />
                </div>
              )}
              {isFieldEnabled('guardian_name') && (
                <div>
                  <label className={labelClass}>অভিভাবকের নাম {isFieldReq('guardian_name') ? '*' : ''}</label>
                  <input required={isFieldReq('guardian_name')} value={admForm.guardian_name} onChange={(e) => setAdmForm({ ...admForm, guardian_name: e.target.value })} className={inputClass} />
                </div>
              )}
              {isFieldEnabled('guardian_mobile') && (
                <div>
                  <label className={labelClass}>অভিভাবকের মোবাইল {isFieldReq('guardian_mobile') ? '*' : ''}</label>
                  <input required={isFieldReq('guardian_mobile')} value={admForm.guardian_mobile} onChange={(e) => setAdmForm({ ...admForm, guardian_mobile: e.target.value })} placeholder="01XXXXXXXXX" className={inputClass} />
                </div>
              )}
              {isFieldEnabled('student_mobile') && (
                <div>
                  <label className={labelClass}>শিক্ষার্থীর মোবাইল</label>
                  <input value={admForm.student_mobile} onChange={(e) => setAdmForm({ ...admForm, student_mobile: e.target.value })} className={inputClass} />
                </div>
              )}
              {isFieldEnabled('dob') && (
                <div>
                  <label className={labelClass}>জন্ম তারিখ</label>
                  <input type="date" value={admForm.dob} onChange={(e) => setAdmForm({ ...admForm, dob: e.target.value })} className={inputClass} />
                </div>
              )}
              {isFieldEnabled('blood_group') && (
                <div>
                  <label className={labelClass}>রক্তের গ্রুপ</label>
                  <select value={admForm.blood_group} onChange={(e) => setAdmForm({ ...admForm, blood_group: e.target.value })} className={inputClass}>
                    <option value="">নির্বাচন করুন</option>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={labelClass}>ভর্তির তারিখ</label>
                <input type="date" value={admForm.admission_date} onChange={(e) => setAdmForm({ ...admForm, admission_date: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>ফি ক্যাটাগরি</label>
                <select
                  value={admForm.fee_type}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    setAdmForm({
                      ...admForm,
                      fee_type: nextType,
                      monthly_fee: nextType === 'free' ? '0' : admForm.monthly_fee || '1000',
                      monthly_meal_cost: nextType === 'free' ? '0' : admForm.monthly_meal_cost,
                    });
                  }}
                  className={inputClass}
                >
                  <option value="regular">নিয়মিত পেমেন্ট</option>
                  <option value="one_time">এককালীন পেমেন্ট</option>
                  <option value="free">ফ্রি (বেতনমুক্ত / ইয়াতিম ও গোরাবা)</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>মাসিক বেতন / ফি (৳)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={admForm.monthly_fee}
                  onChange={(e) => setAdmForm({ ...admForm, monthly_fee: e.target.value })}
                  placeholder="যেমন: 1000"
                  className={`${inputClass} font-mono-num`}
                />
              </div>
              <div>
                <label className={labelClass}>মাসিক খাবার খরচ (৳ — ঐচ্ছিক)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={admForm.monthly_meal_cost}
                  onChange={(e) => setAdmForm({ ...admForm, monthly_meal_cost: e.target.value })}
                  placeholder="যেমন: 500"
                  className={`${inputClass} font-mono-num`}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs">
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  মোট মাসিক প্রদেয় (মাসিক বেতন/ফি {formatBDT(Number(admForm.monthly_fee || 0))} + খাবার খরচ{' '}
                  {formatBDT(Number(admForm.monthly_meal_cost || 0))})
                  {admForm.fee_type === 'free' && ' · ফ্রি শিক্ষার্থীর জন্য ০ বা অনুমোদিত খাবার খরচ নির্ধারণ করা যাবে'}
                </span>
                <span className="font-mono-num text-sm font-bold text-[#047857] dark:text-emerald-400">
                  {formatBDT(Number(admForm.monthly_fee || 0) + Number(admForm.monthly_meal_cost || 0))}
                </span>
              </div>
              {isFieldEnabled('previous_institution') && (
                <div>
                  <label className={labelClass}>পূর্ববর্তী প্রতিষ্ঠান</label>
                  <input value={admForm.previous_institution} onChange={(e) => setAdmForm({ ...admForm, previous_institution: e.target.value })} className={inputClass} />
                </div>
              )}
              {isFieldEnabled('address') && (
                <div className="sm:col-span-2">
                  <label className={labelClass}>বর্তমান ও স্থায়ী ঠিকানা</label>
                  <input value={admForm.address} onChange={(e) => setAdmForm({ ...admForm, address: e.target.value })} className={inputClass} />
                </div>
              )}
              {isFieldEnabled('additional_info') && (
                <div className="sm:col-span-3">
                  <label className={labelClass}>অতিরিক্ত তথ্য</label>
                  <textarea rows={2} value={admForm.additional_info} onChange={(e) => setAdmForm({ ...admForm, additional_info: e.target.value })} className={inputClass} />
                </div>
              )}
              <div className="sm:col-span-3">
                <label className={labelClass}>শিক্ষার্থীর ডকুমেন্ট সংযুক্তি (জন্ম সনদ / পূর্ববর্তী সনদ — ঐচ্ছিক)</label>
                <FileUploadField
                  category="attachment"
                  module="student_document"
                  buttonLabel="শিক্ষার্থীর ডকুমেন্ট আপলোড"
                  valueUrl={admForm.document_url}
                  valueName={admForm.document_name}
                  onUploaded={(res) => setAdmForm((f) => ({ ...f, document_url: res.url, document_name: res.original_name }))}
                  onClear={admForm.document_url ? () => setAdmForm((f) => ({ ...f, document_url: '', document_name: '' })) : undefined}
                  onError={(msg) => toast('error', 'ডকুমেন্ট আপলোড ব্যর্থ', msg)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={admForm.create_guardian_account}
                onChange={(e) => setAdmForm({ ...admForm, create_guardian_account: e.target.checked })}
                className="accent-[#6D28D9]"
              />
              স্বয়ংক্রিয়ভাবে অভিভাবক লগইন অ্যাকাউন্ট তৈরি/সংযুক্ত করুন (একই মোবাইলে একাধিক সন্তান সংযুক্ত হবে)
            </label>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button type="button" onClick={() => setAdmForm(blankAdm)} className={secondaryBtnClass}>রিসেট</button>
              <button type="submit" disabled={submitting} className={emeraldBtnClass}>
                {submitting ? 'ভর্তি সংরক্ষণ হচ্ছে...' : 'ভর্তি সম্পন্ন ও অ্যাকাউন্ট তৈরি করুন'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* LIST / PROFILES / SEARCH TABS */}
      {subTab !== 'admission' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="নাম, রোল (000001), আইডি, জামাত বা মোবাইল..."
                className={`${inputClass} pl-10`}
              />
            </div>
            <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setClassFilter(''); setPage(1); }} className={inputClass}>
              <option value="">সকল বিভাগ</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={classFilter} onChange={(e) => { setClassFilter(e.target.value); setPage(1); }} className={inputClass}>
              <option value="">সকল ক্লাস</option>
              {classes.filter((c) => !deptFilter || String(c.department_id) === deptFilter).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={jamaatFilter} onChange={(e) => { setJamaatFilter(e.target.value); setPage(1); }} className={inputClass}>
              <option value="">সকল শ্রেণী / জামাত</option>
              {jamaats.map((j) => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="কোনো শিক্ষার্থী পাওয়া যায়নি"
              description="নতুন শিক্ষার্থী ভর্তি করুন অথবা অনুসন্ধান ফিল্টার পরিবর্তন করুন।"
              action={
                <button type="button" onClick={() => setSubTab('admission')} className={emeraldBtnClass}>
                  <UserPlus className="w-4 h-4" /> ভর্তি ফর্মে যান
                </button>
              }
            />
          ) : subTab === 'profiles' ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {paged.map((s) => (
                <div
                  key={s.id}
                  onClick={() => openProfile(s.id)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-[#6D28D9] transition-colors cursor-pointer space-y-3"
                >
                  <div className="flex items-center gap-3.5">
                    {s.photo_url ? (
                      <img src={s.photo_url} alt={s.full_name} referrerPolicy="no-referrer" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-[#0F172A] text-white flex items-center justify-center font-bold text-base shrink-0">
                        {s.full_name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{s.full_name}</div>
                      <div className="text-xs font-mono-num text-[#6D28D9]">রোল: {s.roll_number} · @{s.username}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <div>
                      {s.department_name} · {s.class_name}
                      {s.jamaat_name && s.jamaat_name !== s.class_name ? ` (${s.jamaat_name})` : ''}
                    </div>
                    <div>অভিভাবক: {s.guardian_name || '—'} · {s.guardian_mobile || '—'}</div>
                    <div className="font-mono-num text-[11px] text-slate-700 dark:text-slate-300">
                      বেতন: {formatBDT(s.monthly_fee || 0)} · খাবার: {formatBDT(s.monthly_meal_cost || 0)} ·{' '}
                      <strong className="text-[#047857] dark:text-emerald-400">
                        মোট: {formatBDT(s.total_monthly_payable ?? Number(s.monthly_fee || 0) + Number(s.monthly_meal_cost || 0))}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <StatusText status={s.status} />
                      <StatusText status={s.fee_type} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-5 py-3">রোল ও আইডি</th>
                      <th className="px-4 py-3">শিক্ষার্থী</th>
                      <th className="px-4 py-3">বিভাগ ও শ্রেণী</th>
                      <th className="px-4 py-3">অভিভাবক ও মোবাইল</th>
                      <th className="px-4 py-3">ফি / অবস্থা</th>
                      <th className="px-5 py-3 text-right">কার্যক্রম</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paged.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3 font-mono-num text-xs">
                          <div className="font-bold text-[#6D28D9] dark:text-violet-400">{s.roll_number}</div>
                          <div className="text-slate-500">{s.student_code}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {s.photo_url ? (
                              <img src={s.photo_url} alt={s.full_name} referrerPolicy="no-referrer" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-[#0F172A] text-white flex items-center justify-center text-xs font-bold shrink-0">
                                {s.full_name.charAt(0)}
                              </div>
                            )}
                            <div>
                              <button type="button" onClick={() => openProfile(s.id)} className="font-semibold hover:text-[#6D28D9] text-left cursor-pointer">
                                {s.full_name}
                              </button>
                              <div className="text-xs font-mono-num text-slate-500">@{s.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-medium">{s.department_name}</div>
                          <div className="text-slate-500">
                            {s.class_name}
                            {s.jamaat_name && s.jamaat_name !== s.class_name ? ` · ${s.jamaat_name}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div>{s.guardian_name || '—'}</div>
                          <div className="font-mono-num text-slate-500">{s.guardian_mobile || '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <StatusText status={s.status} />
                            <StatusText status={s.fee_type} />
                            <span className="text-[11px] font-mono-num text-slate-500">
                              ফি {formatBDT(s.monthly_fee || 0)} + খাবার {formatBDT(s.monthly_meal_cost || 0)}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right whitespace-nowrap space-x-1">
                          <button type="button" onClick={() => openProfile(s.id)} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer" title="প্রোফাইল">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => toggleStudentStatus(s)} className="text-xs font-medium text-[#6D28D9] hover:underline px-2 cursor-pointer">
                            {s.status === 'active' ? 'নিষ্ক্রিয়' : 'সক্রিয়'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await confirm({ title: 'শিক্ষার্থী মুছুন', message: `"${s.full_name}" (রোল ${s.roll_number}) মুছে ফেলবেন?`, danger: true });
                              if (!ok) return;
                              await apiFetch(`/api/inst/students/${s.id}`, { method: 'DELETE' });
                              toast('success', 'শিক্ষার্থী মুছে ফেলা হয়েছে');
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
          )}

          <Pagination page={page} total={filtered.length} pageSize={pageSize} onChange={setPage} />
        </div>
      )}

      {/* STUDENT COMPLETE PROFILE MODAL */}
      <Modal
        open={Boolean(selectedProfile)}
        onClose={() => setSelectedProfile(null)}
        title="শিক্ষার্থী প্রোফাইল"
        maxWidth="max-w-3xl"
      >
        {selectedProfile && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row items-start gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
              {selectedProfile.student.photo_url ? (
                <img src={selectedProfile.student.photo_url} alt={selectedProfile.student.full_name} referrerPolicy="no-referrer" className="w-20 h-20 rounded-xl object-cover border" />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-[#0F172A] text-white flex items-center justify-center text-2xl font-bold shrink-0">
                  {selectedProfile.student.full_name.charAt(0)}
                </div>
              )}
              <div className="flex-1 space-y-1">
                <h3 className="text-lg font-bold">{selectedProfile.student.full_name}</h3>
                <div className="text-xs font-mono-num text-[#6D28D9]">
                  রোল: {selectedProfile.student.roll_number} · আইডি: {selectedProfile.student.student_code} · ইউজারনেম: @{selectedProfile.student.username}
                </div>
                <div className="text-xs text-slate-500">
                  {selectedProfile.student.department_name} · {selectedProfile.student.class_name}
                  {selectedProfile.student.jamaat_name ? ` · জামাত: ${selectedProfile.student.jamaat_name}` : ''} · ভর্তির তারিখ: {formatDateDMY(selectedProfile.student.admission_date)}
                </div>
                <div className="pt-1 flex items-center gap-3">
                  <StatusText status={selectedProfile.student.status} />
                  <span>·</span>
                  <StatusText status={selectedProfile.student.fee_type} />
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div><span className="text-slate-500">পিতার নাম:</span> <strong>{selectedProfile.student.father_name || '—'}</strong></div>
              <div><span className="text-slate-500">মাতার নাম:</span> <strong>{selectedProfile.student.mother_name || '—'}</strong></div>
              <div><span className="text-slate-500">অভিভাবক:</span> <strong>{selectedProfile.student.guardian_name || '—'} ({selectedProfile.student.guardian_mobile || '—'})</strong></div>
              <div><span className="text-slate-500">অভিভাবক ইউজারনেম:</span> <strong className="font-mono-num">{selectedProfile.student.guardian_username ? `@${selectedProfile.student.guardian_username}` : '—'}</strong></div>
              <div><span className="text-slate-500">রক্তের গ্রুপ:</span> <strong>{selectedProfile.student.blood_group || '—'}</strong></div>
              <div><span className="text-slate-500">জন্ম তারিখ:</span> <strong className="font-mono-num">{formatDateDMY(selectedProfile.student.dob)}</strong></div>
              <div className="sm:col-span-2"><span className="text-slate-500">ঠিকানা:</span> <strong>{selectedProfile.student.address || '—'}</strong></div>
              {selectedProfile.student.document_url && (
                <div className="sm:col-span-2 pt-1">
                  <span className="text-slate-500">সংযুক্ত ডকুমেন্ট: </span>
                  <a
                    href={
                      String(selectedProfile.student.document_url).startsWith('/api/uploads/')
                        ? `${selectedProfile.student.document_url}?download=1`
                        : selectedProfile.student.document_url
                    }
                    download={selectedProfile.student.document_name || 'student-document'}
                    className="font-semibold text-[#6D28D9] dark:text-violet-400 hover:underline"
                  >
                    {selectedProfile.student.document_name || 'ডকুমেন্ট ডাউনলোড করুন'}
                  </a>
                </div>
              )}
            </div>

            {/* Separate Monthly Fee & Meal Cost Financial Structure */}
            <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  মাসিক প্রদেয় ও খাবার খরচ (পৃথক আর্থিক খাত)
                </div>
                <button
                  type="button"
                  onClick={() => setEditingFee((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#6D28D9] dark:text-violet-400 hover:underline cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {editingFee ? 'বাতিল' : 'সম্পাদনা করুন'}
                </button>
              </div>
              {editingFee ? (
                <form onSubmit={handleSaveStudentFee} className="grid sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className={labelClass}>ফি ক্যাটাগরি</label>
                    <select
                      value={feeEditForm.fee_type}
                      onChange={(e) => setFeeEditForm((f) => ({ ...f, fee_type: e.target.value }))}
                      className={inputClass}
                    >
                      <option value="regular">নিয়মিত পেমেন্ট</option>
                      <option value="one_time">এককালীন পেমেন্ট</option>
                      <option value="free">ফ্রি (বেতনমুক্ত)</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>মাসিক বেতন/ফি (৳)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={feeEditForm.monthly_fee}
                      onChange={(e) => setFeeEditForm((f) => ({ ...f, monthly_fee: e.target.value }))}
                      className={`${inputClass} font-mono-num`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>মাসিক খাবার খরচ (৳)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={feeEditForm.monthly_meal_cost}
                      onChange={(e) => setFeeEditForm((f) => ({ ...f, monthly_meal_cost: e.target.value }))}
                      className={`${inputClass} font-mono-num`}
                    />
                  </div>
                  <div className="sm:col-span-3 flex items-center justify-between pt-1">
                    <span className="font-mono-num font-bold text-[#047857] dark:text-emerald-400">
                      মোট মাসিক প্রদেয়: {formatBDT(Number(feeEditForm.monthly_fee || 0) + Number(feeEditForm.monthly_meal_cost || 0))}
                    </span>
                    <button type="submit" disabled={savingFee} className={primaryBtnClass}>
                      {savingFee ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-slate-500">মাসিক বেতন/ফি</div>
                    <div className="font-mono-num font-bold text-sm mt-0.5">
                      {formatBDT(selectedProfile.student.monthly_fee || 0)}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-slate-500">মাসিক খাবার খরচ</div>
                    <div className="font-mono-num font-bold text-sm mt-0.5 text-amber-700 dark:text-amber-400">
                      {formatBDT(selectedProfile.student.monthly_meal_cost || 0)}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-slate-500">মোট মাসিক প্রদেয়</div>
                    <div className="font-mono-num font-bold text-sm mt-0.5 text-[#047857] dark:text-emerald-400">
                      {formatBDT(
                        selectedProfile.student.total_monthly_payable ??
                          Number(selectedProfile.student.monthly_fee || 0) + Number(selectedProfile.student.monthly_meal_cost || 0)
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="text-slate-500">উপস্থিতি সারাংশ</div>
                <div className="font-mono-num font-bold mt-1 text-[#047857]">
                  উপস্থিত: {selectedProfile.attendanceSummary?.present || 0} · অনুপস্থিত: {selectedProfile.attendanceSummary?.absent || 0}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="text-slate-500">দারুল ইকামা</div>
                <div className="font-semibold mt-1">
                  {selectedProfile.hostel ? `${selectedProfile.hostel.unit_name} · কক্ষ ${selectedProfile.hostel.room_number} (${selectedProfile.hostel.bed_number})` : 'অনাবাসিক'}
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="text-slate-500">মোট পরিশোধ</div>
                <div className="font-mono-num font-bold mt-1">
                  {formatBDT((selectedProfile.payments || []).reduce((a: number, b: any) => a + Number(b.amount_paid || 0), 0))}
                </div>
              </div>
            </div>

            {Array.isArray(selectedProfile.books) && selectedProfile.books.length > 0 && (
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <BookOpen className="w-4 h-4 text-[#047857]" />
                  নির্ধারিত পাঠ্য কিতাব / বইসমূহ ({selectedProfile.books.length} টি)
                </div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {selectedProfile.books.map((b: any) => (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 text-xs"
                    >
                      {b.cover_image_url ? (
                        <img src={b.cover_image_url} alt={b.name} referrerPolicy="no-referrer" className="w-8 h-10 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-10 rounded bg-[#0F172A] text-emerald-400 flex items-center justify-center shrink-0">
                          <BookOpen className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">{b.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          <span className="font-mono-num text-[#6D28D9] dark:text-violet-400">{b.book_code}</span>
                          {b.arabic_name ? ` · ${b.arabic_name}` : ''}
                          {b.author_name ? ` · ${b.author_name}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
