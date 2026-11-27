import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Upload, Edit3, Eye } from 'lucide-react';
import { apiFetch, formatBDT, formatDateDMY, getTodayDhakaYMD } from '../../../lib/api';
import { FileUploadField } from '../../../components/ui/FileUploadField';
import { useApp } from '../../../context/AppContext';
import {
  EmptyState,
  LIVE_STATUS_LABELS,
  Modal,
  PageHeader,
  StatusText,
  emeraldBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  secondaryBtnClass,
  tableHeadClass,
} from '../../../components/ui/Primitives';
import { TeacherProfileView } from './TeacherProfileView';

export function TeachersModule({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { toast, confirm, hasPermission } = useApp();
  const canEditFinance = hasPermission('finance', 'create') || hasPermission('finance', 'edit');
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [jamaats, setJamaats] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const blankForm = {
    full_name: '',
    username: '',
    password: '',
    mobile: '',
    department_id: '',
    role_id: '',
    role_ids: [] as number[],
    account_type: 'teacher',
    joining_date: getTodayDhakaYMD(),
    address: '',
    email: '',
    education: '',
    monthly_salary: '',
    monthly_meal_cost: '0',
    photo_url: '',
    status: 'active',
    designation_ids: [] as number[],
    primary_designation_id: '' as string,
    assignments: [] as Array<{ class_id: number; subject_id: number | null; jamaat_id?: number | null }>,
  };
  const [form, setForm] = useState(blankForm);
  const [assignClassId, setAssignClassId] = useState('');
  const [assignJamaatId, setAssignJamaatId] = useState('');
  const [assignSubjectId, setAssignSubjectId] = useState('');

  const loadAll = useCallback(async () => {
    const [tRes, desRes, depRes, clsRes, jamRes, subRes, rRes] = await Promise.all([
      apiFetch('/api/inst/teachers'),
      apiFetch('/api/inst/designations'),
      apiFetch('/api/inst/departments'),
      apiFetch('/api/inst/classes'),
      apiFetch('/api/inst/jamaats'),
      apiFetch('/api/inst/subjects'),
      apiFetch('/api/inst/roles'),
    ]);
    setTeachers(tRes.teachers || []);
    setDesignations(desRes.designations || []);
    setDepartments(depRes.departments || []);
    setClasses(clsRes.classes || []);
    setJamaats(jamRes.jamaats || []);
    setSubjects(subRes.subjects || []);
    setRoles(rRes.roles || []);
  }, []);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  const toggleDesignation = (id: number) => {
    const exists = form.designation_ids.includes(id);
    const next = exists ? form.designation_ids.filter((x) => x !== id) : [...form.designation_ids, id];
    const primary =
      form.primary_designation_id && next.includes(Number(form.primary_designation_id))
        ? form.primary_designation_id
        : next[0]
        ? String(next[0])
        : '';
    setForm({ ...form, designation_ids: next, primary_designation_id: primary });
  };

  const addAssignment = () => {
    if (!assignClassId) return;
    const cid = Number(assignClassId);
    const sid = assignSubjectId ? Number(assignSubjectId) : null;
    const jid = assignJamaatId ? Number(assignJamaatId) : null;
    if (form.assignments.some((a) => a.class_id === cid && a.subject_id === sid && (a.jamaat_id ?? null) === jid)) return;
    setForm({ ...form, assignments: [...form.assignments, { class_id: cid, subject_id: sid, jamaat_id: jid }] });
    setAssignSubjectId('');
  };

  const toggleRole = (id: number) => {
    const exists = form.role_ids.includes(id);
    const next = exists ? form.role_ids.filter((x) => x !== id) : [...form.role_ids, id];
    const primary = form.role_id && next.includes(Number(form.role_id)) ? form.role_id : next[0] ? String(next[0]) : '';
    setForm({ ...form, role_ids: next, role_id: primary });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId && !form.password.trim() && !form.mobile.trim()) {
      toast('error', 'তথ্য অসম্পূর্ণ', 'পাসওয়ার্ড খালি রাখলে প্রাথমিক পাসওয়ার্ড হিসেবে মোবাইল নম্বর দিতে হবে।');
      return;
    }
    try {
      const effectiveRoleIds = form.role_ids.length
        ? form.role_ids
        : form.role_id
        ? [Number(form.role_id)]
        : [];
      const payload: Record<string, any> = {
        ...form,
        department_id: form.department_id ? Number(form.department_id) : null,
        role_id: form.role_id ? Number(form.role_id) : effectiveRoleIds[0] || null,
        role_ids: effectiveRoleIds,
        primary_designation_id: form.primary_designation_id ? Number(form.primary_designation_id) : null,
      };
      if (canEditFinance) {
        if (form.monthly_salary !== '') {
          payload.monthly_salary = Number(form.monthly_salary);
        } else {
          delete payload.monthly_salary;
        }
        payload.monthly_meal_cost = form.monthly_meal_cost !== '' ? Number(form.monthly_meal_cost) : 0;
      } else {
        delete payload.monthly_salary;
        delete payload.monthly_meal_cost;
      }
      if (editingId) {
        await apiFetch(`/api/inst/teachers/${editingId}`, { method: 'PUT', body: payload });
        toast('success', 'শিক্ষক/কর্মচারীর তথ্য হালনাগাদ হয়েছে');
      } else {
        const res = await apiFetch('/api/inst/teachers', { method: 'POST', body: payload });
        const credHint = res?.credentials?.usedMobileAsPassword
          ? `ইউজারনেম: ${form.username} · প্রাথমিক পাসওয়ার্ড: নিবন্ধিত মোবাইল নম্বর (${form.mobile})`
          : `ইউজারনেম: ${form.username}`;
        toast('success', 'নতুন শিক্ষক/কর্মচারী নিবন্ধিত হয়েছে', credHint);
      }
      setModalOpen(false);
      setEditingId(null);
      setForm(blankForm);
      loadAll();
    } catch (err: any) {
      toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
    }
  };

  const openEdit = (t: any) => {
    const dIds = (t.designations || []).map((d: any) => d.designation_id);
    const primary = (t.designations || []).find((d: any) => d.is_primary)?.designation_id || dIds[0] || '';
    const rIds: number[] = Array.isArray(t.role_ids) && t.role_ids.length ? t.role_ids : t.role_id ? [Number(t.role_id)] : [];
    setEditingId(t.id);
    setForm({
      full_name: t.full_name,
      username: t.username,
      password: '',
      mobile: t.mobile || '',
      department_id: t.department_id ? String(t.department_id) : '',
      role_id: t.role_id ? String(t.role_id) : rIds[0] ? String(rIds[0]) : '',
      role_ids: rIds,
      account_type: t.account_type === 'staff' ? 'staff' : 'teacher',
      joining_date: t.joining_date || '',
      address: t.address || '',
      email: t.email || '',
      education: t.education || '',
      monthly_salary: t.monthly_salary !== null && t.monthly_salary !== undefined ? String(t.monthly_salary) : '',
      monthly_meal_cost: t.monthly_meal_cost !== null && t.monthly_meal_cost !== undefined ? String(t.monthly_meal_cost) : '0',
      photo_url: t.photo_url || '',
      status: t.status || 'active',
      designation_ids: dIds,
      primary_designation_id: primary ? String(primary) : '',
      assignments: (t.assignments || []).map((a: any) => ({
        class_id: a.class_id,
        subject_id: a.subject_id,
        jamaat_id: a.jamaat_id ?? null,
      })),
    });
    setModalOpen(true);
  };

  if (selectedTeacherId) {
    return (
      <TeacherProfileView
        teacherId={selectedTeacherId}
        onBack={() => {
          setSelectedTeacherId(null);
          loadAll();
        }}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="শিক্ষক ও কর্মচারী তালিকা"
        subtitle="সম্পূর্ণ শিক্ষক প্রোফাইল, একাধিক পদবি, রোল-ভিত্তিক অনুমতি, লাইভ স্ট্যাটাস এবং শ্রেণী বণ্টন"
        actions={
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm(blankForm);
              setModalOpen(true);
            }}
            className={emeraldBtnClass}
          >
            <Plus className="w-4 h-4" />
            নতুন শিক্ষক / কর্মচারী
          </button>
        }
      />

      {teachers.length === 0 ? (
        <EmptyState
          title="কোনো শিক্ষক বা কর্মচারী নিবন্ধিত নেই"
          description="শিক্ষক ও প্রশাসনিক কর্মীদের যুক্ত করে শ্রেণী ও রুটিনে বরাদ্দ করুন।"
          action={
            <button type="button" onClick={() => setModalOpen(true)} className={emeraldBtnClass}>
              <Plus className="w-4 h-4" /> প্রথম শিক্ষক যুক্ত করুন
            </button>
          }
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-5 py-3">শিক্ষক / কর্মচারী</th>
                  <th className="px-4 py-3">পদবি (প্রাথমিক ও অতিরিক্ত)</th>
                  <th className="px-4 py-3">রোল ও বিভাগ</th>
                  <th className="px-4 py-3">নির্ধারিত শ্রেণী ও বিষয়</th>
                  <th className="px-4 py-3">অবস্থা</th>
                  <th className="px-5 py-3 text-right">কার্যক্রম</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {teachers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {t.photo_url ? (
                          <img src={t.photo_url} alt={t.full_name} referrerPolicy="no-referrer" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-[#0F172A] text-white flex items-center justify-center text-xs font-bold shrink-0">
                            {t.full_name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <button
                            type="button"
                            onClick={() => setSelectedTeacherId(t.id)}
                            className="font-semibold text-left hover:text-[#6D28D9] dark:hover:text-violet-400 cursor-pointer"
                          >
                            {t.full_name}
                          </button>
                          <div className="text-xs text-slate-500 font-mono-num">
                            {t.teacher_code ? `${t.teacher_code} · ` : ''}@{t.username} · {t.mobile || '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      {(t.designations || []).length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        t.designations.map((d: any, i: number) => (
                          <span key={d.designation_id}>
                            {i > 0 && ' · '}
                            <span className={d.is_primary ? 'font-semibold text-[#6D28D9] dark:text-violet-400' : ''}>
                              {d.name}{d.is_primary ? ' (প্রাথমিক)' : ''}
                            </span>
                          </span>
                        ))
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div className="font-medium">
                        {Array.isArray(t.role_names) && t.role_names.length
                          ? t.role_names.join(' · ')
                          : t.role_name || (t.account_type === 'staff' ? 'কর্মকর্তা / কর্মচারী' : 'শিক্ষক')}
                      </div>
                      <div className="text-slate-500">
                        {t.account_type === 'staff' ? 'প্রশাসনিক/কর্মচারী' : 'শিক্ষক'} · {t.department_name || '—'} · যোগদান {formatDateDMY(t.joining_date)}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                      {(t.assignments || []).length === 0
                        ? '—'
                        : t.assignments
                            .map(
                              (a: any) =>
                                `${a.class_name}${a.jamaat_name && a.jamaat_name !== a.class_name ? `/${a.jamaat_name}` : ''}${a.subject_name ? ` (${a.subject_name})` : ''}`
                            )
                            .join(' · ')}
                    </td>
                    <td className="px-4 py-3.5">
                      <div><StatusText status={t.status} /></div>
                      {t.live_status && (
                        <div className="mt-0.5">
                          <StatusText status={t.live_status} labelMap={LIVE_STATUS_LABELS} />
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedTeacherId(t.id)}
                        title="বিস্তারিত প্রোফাইল"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 mr-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        প্রোফাইল
                      </button>
                      <button type="button" onClick={() => openEdit(t)} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await confirm({ title: 'শিক্ষক মুছুন', message: `"${t.full_name}" এর অ্যাকাউন্ট মুছে ফেলবেন?`, danger: true });
                          if (!ok) return;
                          await apiFetch(`/api/inst/teachers/${t.id}`, { method: 'DELETE' });
                          toast('success', 'মুছে ফেলা হয়েছে');
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'শিক্ষক / কর্মচারী সম্পাদনা' : 'নতুন শিক্ষক / কর্মচারী নিবন্ধন'}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <FileUploadField
            category="image"
            module="teacher_photo"
            buttonLabel="শিক্ষক / কর্মচারীর ছবি নির্বাচন"
            valueUrl={form.photo_url}
            showImagePreview
            previewClassName="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
            onUploaded={(res) => setForm((f) => ({ ...f, photo_url: res.url }))}
            onClear={form.photo_url ? () => setForm((f) => ({ ...f, photo_url: '' })) : undefined}
            onError={(msg) => toast('error', 'ছবি আপলোড ব্যর্থ', msg)}
          />

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>পূর্ণ নাম *</label>
              <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>অ্যাকাউন্টের ধরন *</label>
              <select
                value={form.account_type}
                onChange={(e) => setForm({ ...form, account_type: e.target.value })}
                className={inputClass}
              >
                <option value="teacher">শিক্ষক (Teacher Portal / নির্ধারিত শ্রেণী)</option>
                <option value="staff">প্রশাসনিক কর্মকর্তা / কর্মচারী (মুহতামিম, নাজেম, হিসাবরক্ষক ইত্যাদি)</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>মোবাইল নম্বর {!editingId && !form.password.trim() ? '*' : ''}</label>
              <input
                required={!editingId && !form.password.trim()}
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                placeholder="যেমন: 017XXXXXXXX"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>ইউজারনেম *</label>
              <input required disabled={Boolean(editingId)} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={`${inputClass} ${editingId ? 'opacity-60' : ''}`} />
            </div>
            <div>
              <label className={labelClass}>
                {editingId ? 'নতুন পাসওয়ার্ড (ঐচ্ছিক)' : 'পাসওয়ার্ড / পিন (খালি রাখলে মোবাইল নম্বর)'}
              </label>
              <input
                type="password"
                minLength={4}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editingId ? 'পরিবর্তন করতে চাইলে লিখুন' : 'খালি রাখলে মোবাইল নম্বর প্রাথমিক পাসওয়ার্ড হবে'}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>বিভাগ</label>
              <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className={inputClass}>
                <option value="">-- বিভাগ --</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>যোগদানের তারিখ</label>
              <input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>ঠিকানা</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>ইমেইল</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="teacher@madrasa.org" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>শিক্ষাগত যোগ্যতা</label>
              <input value={form.education} onChange={(e) => setForm({ ...form, education: e.target.value })} placeholder="দাওরায়ে হাদিস / কামিল / হাফেজ" className={inputClass} />
            </div>
            {canEditFinance && (
              <>
                <div>
                  <label className={labelClass}>মাসিক প্রদেয় / মূল বেতন (৳)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.monthly_salary}
                    onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })}
                    placeholder="যেমন: 15000"
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelClass}>মাসিক খাবার খরচ (৳ — ঐচ্ছিক)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.monthly_meal_cost}
                    onChange={(e) => setForm({ ...form, monthly_meal_cost: e.target.value })}
                    placeholder="যেমন: 2000"
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div className="sm:col-span-2 flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    মোট মাসিক প্রদেয় (মাসিক প্রদেয় + খাবার খরচ)
                  </span>
                  <span className="font-mono-num text-sm font-bold text-[#047857] dark:text-emerald-400">
                    {formatBDT(Number(form.monthly_salary || 0) + Number(form.monthly_meal_cost || 0))}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Multi-Role RBAC Assignment */}
          <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
            <label className={labelClass}>অ্যাপ রোল ও পারমিশন (একাধিক রোল যুক্ত করা যাবে — সম্মিলিত অনুমতি কার্যকর হবে)</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40">
              {roles
                .filter((r) => !['student', 'guardian'].includes(r.slug))
                .map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.role_ids.includes(r.id)}
                      onChange={() => toggleRole(r.id)}
                      className="accent-[#6D28D9]"
                    />
                    <span>{r.name}</span>
                  </label>
                ))}
            </div>
          </div>

          {/* Multiple Designations + Primary */}
          <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
            <label className={labelClass}>প্রাতিষ্ঠানিক পদবি (একাধিক নির্বাচন করা যাবে)</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40">
              {designations.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.designation_ids.includes(d.id)}
                    onChange={() => toggleDesignation(d.id)}
                    className="accent-[#6D28D9]"
                  />
                  <span>{d.name}</span>
                </label>
              ))}
            </div>
            {form.designation_ids.length > 0 && (
              <div className="pt-2">
                <label className={labelClass}>প্রাথমিক পদবি (Primary Designation)</label>
                <select
                  value={form.primary_designation_id}
                  onChange={(e) => setForm({ ...form, primary_designation_id: e.target.value })}
                  className={inputClass}
                >
                  {designations
                    .filter((d) => form.designation_ids.includes(d.id))
                    .map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Assigned Classes, Jamaat & Subjects */}
          <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
            <label className={labelClass}>পাঠদানের ক্লাস, জামাত ও বিষয় / কিতাব বণ্টন (একাধিক)</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={assignClassId}
                onChange={(e) => {
                  const nextCid = e.target.value;
                  setAssignClassId(nextCid);
                  setAssignSubjectId('');
                  const clsObj = classes.find((c) => String(c.id) === nextCid);
                  const firstJ = clsObj?.jamaat_id
                    ? String(clsObj.jamaat_id)
                    : clsObj?.jamaats?.find((j: any) => j.status === 'active')?.id
                    ? String(clsObj.jamaats.find((j: any) => j.status === 'active').id)
                    : '';
                  setAssignJamaatId(firstJ);
                }}
                className={inputClass}
              >
                <option value="">-- ক্লাস --</option>
                {classes.filter((c) => c.status === 'active').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.department_name} — {c.name}{c.jamaat_name && c.jamaat_name !== c.name ? ` (${c.jamaat_name})` : ''}
                  </option>
                ))}
              </select>
              <select value={assignJamaatId} onChange={(e) => setAssignJamaatId(e.target.value)} className={inputClass}>
                <option value="">জামাত (ঐচ্ছিক)</option>
                {(() => {
                  const clsObj = classes.find((c) => String(c.id) === assignClassId);
                  const list =
                    clsObj?.jamaats?.filter((j: any) => j.status === 'active')?.length > 0
                      ? clsObj.jamaats.filter((j: any) => j.status === 'active')
                      : jamaats.filter((j) => j.status === 'active');
                  return list.map((j: any) => (
                    <option key={j.id} value={j.id}>{j.name}</option>
                  ));
                })()}
              </select>
              <select value={assignSubjectId} onChange={(e) => setAssignSubjectId(e.target.value)} className={inputClass}>
                <option value="">সকল বিষয় / ঐচ্ছিক</option>
                {subjects.filter((s) => String(s.class_id) === assignClassId).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.book_code ? ` [${s.book_code}]` : ''}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addAssignment} className={secondaryBtnClass}>যোগ করুন</button>
            </div>
            {(() => {
              const clsObj = classes.find((c) => String(c.id) === assignClassId);
              const effBooks = clsObj?.effective_books || [];
              if (!clsObj || effBooks.length === 0) return null;
              return (
                <div className="text-[11px] text-slate-500 px-1">
                  এই ক্লাসের নির্ধারিত কিতাব: <span className="text-[#047857] dark:text-emerald-400 font-medium">{effBooks.map((b: any) => b.name).join(', ')}</span>
                </div>
              );
            })()}
            {form.assignments.length > 0 && (
              <div className="space-y-1.5 pt-2">
                {form.assignments.map((a, idx) => {
                  const cls = classes.find((c) => c.id === a.class_id);
                  const jam = jamaats.find((j) => j.id === a.jamaat_id);
                  const sub = subjects.find((s) => s.id === a.subject_id);
                  return (
                    <div key={idx} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <span>
                        {cls?.name || a.class_id}
                        {jam ? ` · জামাত: ${jam.name}` : ''}
                        {sub ? ` — ${sub.name}` : ' (শ্রেণী শিক্ষক)'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, assignments: form.assignments.filter((_, i) => i !== idx) })}
                        className="text-red-500 hover:underline cursor-pointer"
                      >
                        বাদ দিন
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setModalOpen(false)} className={secondaryBtnClass}>বাতিল</button>
            <button type="submit" className={primaryBtnClass}>{editingId ? 'হালনাগাদ করুন' : 'নিবন্ধন সম্পন্ন করুন'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
