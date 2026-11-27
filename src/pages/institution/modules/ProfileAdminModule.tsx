import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Shield, Trash2 } from 'lucide-react';
import { apiFetch, formatDateTimeDMY } from '../../../lib/api';
import { useApp } from '../../../context/AppContext';
import {
  EmptyState,
  Modal,
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
import { FileUploadField } from '../../../components/ui/FileUploadField';
import { FirebaseCloudPanel } from '../../../components/cloud/FirebaseCloudPanel';

const MODULE_LABELS: Record<string, string> = {
  profile: 'প্রতিষ্ঠান প্রোফাইল',
  admin_departments: 'প্রশাসনিক বিভাগ',
  designations: 'পদবি',
  academic: 'শ্রেণী ও রুটিন',
  teachers: 'শিক্ষক ও কর্মচারী',
  students: 'শিক্ষার্থী',
  attendance: 'উপস্থিতি',
  exams: 'পরীক্ষা ও ফলাফল',
  hostel: 'দারুল একামা',
  library: 'লাইব্রেরি',
  finance: 'হিসাব ও অর্থব্যবস্থা',
  notices: 'নোটিশ বোর্ড',
  reports: 'রিপোর্ট',
  support: 'সাপোর্ট সেন্টার',
  settings: 'সেটিংস',
};

const ACTION_LIST = ['view', 'create', 'edit', 'delete', 'approve', 'publish', 'export', 'manage'];

export function ProfileModule() {
  const { toast, refreshMe, effectiveAppLogo } = useApp();
  const [profile, setProfile] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/api/inst/profile')
      .then((res) => setProfile(res.institution))
      .catch((err: any) => toast('error', 'প্রোফাইল লোড ব্যর্থ', err.message));
  }, [toast]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/inst/profile', { method: 'PUT', body: profile });
      await refreshMe();
      toast('success', 'প্রতিষ্ঠানের প্রোফাইল সংরক্ষিত হয়েছে');
    } catch (err: any) {
      toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return <TableSkeleton rows={5} cols={2} />;

  return (
    <div className="space-y-6">
      <PageHeader title="প্রতিষ্ঠান প্রোফাইল" subtitle="মাদ্রাসার নাম, লোগো, ঠিকানা ও শিক্ষাবর্ষ পরিচালনা করুন" />
      <form
        onSubmit={handleSave}
        className="max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5"
      >
        <FileUploadField
          category="logo"
          module="institution_logo"
          buttonLabel="প্রতিষ্ঠানের লোগো আপলোড"
          valueUrl={profile.logo_url || ''}
          previewFallbackUrl={effectiveAppLogo}
          showImagePreview
          previewClassName="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
          helperText="রসিদ ও ফলাফলপত্রে এই লোগো ব্যবহৃত হবে"
          onUploaded={(res) => setProfile({ ...profile, logo_url: res.url })}
          onClear={profile.logo_url ? () => setProfile({ ...profile, logo_url: '' }) : undefined}
          onError={(msg) => toast('error', 'ছবি আপলোড ব্যর্থ', msg)}
        />

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelClass}>প্রতিষ্ঠানের নাম</label>
            <input value={profile.name || ''} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>প্রতিষ্ঠান কোড</label>
            <input value={profile.code || ''} disabled className={`${inputClass} opacity-60 font-mono-num`} />
          </div>
          <div>
            <label className={labelClass}>শিক্ষাবর্ষ</label>
            <input value={profile.academic_year || ''} onChange={(e) => setProfile({ ...profile, academic_year: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>ফোন নম্বর</label>
            <input value={profile.phone || ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>স্থাপিত সাল</label>
            <input value={profile.established_year || ''} onChange={(e) => setProfile({ ...profile, established_year: e.target.value })} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>মাদ্রাসার আদর্শ/স্লোগান (Motto)</label>
            <input value={profile.motto || ''} onChange={(e) => setProfile({ ...profile, motto: e.target.value })} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>পূর্ণাঙ্গ ঠিকানা</label>
            <textarea rows={2} value={profile.address || ''} onChange={(e) => setProfile({ ...profile, address: e.target.value })} className={inputClass} />
          </div>
        </div>

        <button type="submit" disabled={saving} className={primaryBtnClass}>
          {saving ? 'সংরক্ষণ হচ্ছে...' : 'প্রোফাইল সংরক্ষণ করুন'}
        </button>
      </form>
    </div>
  );
}

export function AdminDepartmentsModule() {
  const { toast, confirm } = useApp();
  const [departments, setDepartments] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', head_name: '', description: '' });

  const load = useCallback(async () => {
    const res = await apiFetch('/api/inst/admin-departments');
    setDepartments(res.departments || []);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/inst/admin-departments', { method: 'POST', body: form });
      setForm({ name: '', head_name: '', description: '' });
      toast('success', 'প্রশাসনিক বিভাগ যোগ করা হয়েছে');
      load();
    } catch (err: any) {
      toast('error', 'ব্যর্থ', err.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="প্রশাসনিক বিভাগ" subtitle="মুহতামিম দপ্তর, তালিমাত, দারুল ইকামা, মালিয়া ও অন্যান্য দপ্তর ব্যবস্থাপনা" />
      <div className="grid lg:grid-cols-12 gap-6">
        <form onSubmit={handleAdd} className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit">
          <h3 className="text-sm font-semibold">নতুন প্রশাসনিক বিভাগ</h3>
          <div>
            <label className={labelClass}>বিভাগের নাম *</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="যেমন: ফতোয়া বিভাগ" />
          </div>
          <div>
            <label className={labelClass}>বিভাগীয় প্রধান</label>
            <input value={form.head_name} onChange={(e) => setForm({ ...form, head_name: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>বিবরণ</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
          </div>
          <button type="submit" className={emeraldBtnClass}><Plus className="w-4 h-4" /> যুক্ত করুন</button>
        </form>

        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className={tableHeadClass}>
              <tr>
                <th className="px-5 py-3">প্রশাসনিক বিভাগ</th>
                <th className="px-4 py-3">প্রধান</th>
                <th className="px-4 py-3">বিবরণ</th>
                <th className="px-5 py-3 text-right">মুছুন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {departments.map((d) => (
                <tr key={d.id}>
                  <td className="px-5 py-3 font-semibold">{d.name}</td>
                  <td className="px-4 py-3 text-xs">{d.head_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{d.description || '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm({ title: 'বিভাগ মুছুন', message: `"${d.name}" মুছে ফেলবেন?`, danger: true });
                        if (!ok) return;
                        await apiFetch(`/api/inst/admin-departments/${d.id}`, { method: 'DELETE' });
                        toast('success', 'মুছে ফেলা হয়েছে');
                        load();
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
  );
}

export function DesignationsModule() {
  const { toast, confirm } = useApp();
  const [designations, setDesignations] = useState<any[]>([]);
  const [catFilter, setCatFilter] = useState('all');
  const [form, setForm] = useState({ name: '', category: 'administrative' });

  const load = useCallback(async () => {
    const res = await apiFetch('/api/inst/designations');
    setDesignations(res.designations || []);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const catLabel = (c: string) =>
    c === 'administrative' ? 'প্রশাসনিক' : c === 'academic' ? 'একাডেমিক / শিক্ষকমণ্ডলী' : 'অন্যান্য কর্মচারী';

  const filtered = catFilter === 'all' ? designations : designations.filter((d) => d.category === catFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="পদবি ব্যবস্থাপনা"
        subtitle="প্রতিষ্ঠানের প্রশাসনিক, একাডেমিক এবং অন্যান্য পদবি (পদবি এবং অ্যাপ পারমিশন রোল সম্পূর্ণ পৃথক)"
      />
      <div className="grid lg:grid-cols-12 gap-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/inst/designations', { method: 'POST', body: form });
              setForm({ name: '', category: 'administrative' });
              toast('success', 'নতুন পদবি তৈরি হয়েছে');
              load();
            } catch (err: any) {
              toast('error', 'ব্যর্থ', err.message);
            }
          }}
          className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit"
        >
          <h3 className="text-sm font-semibold">কাস্টম পদবি তৈরি করুন</h3>
          <div>
            <label className={labelClass}>পদবির নাম *</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="যেমন: সহকারী মুহতামিম" />
          </div>
          <div>
            <label className={labelClass}>শ্রেণীবিভাগ</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
              <option value="administrative">প্রশাসনিক</option>
              <option value="academic">একাডেমিক / শিক্ষকমণ্ডলী</option>
              <option value="other">অন্যান্য কর্মচারী</option>
            </select>
          </div>
          <button type="submit" className={emeraldBtnClass}><Plus className="w-4 h-4" /> পদবি যুক্ত করুন</button>
        </form>

        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit flex-wrap">
            {[
              { id: 'all', label: `সকল (${designations.length})` },
              { id: 'administrative', label: 'প্রশাসনিক' },
              { id: 'academic', label: 'একাডেমিক' },
              { id: 'other', label: 'অন্যান্য স্টাফ' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCatFilter(t.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  catFilter === t.id ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-5 py-3">পদবির নাম</th>
                  <th className="px-4 py-3">ধরন</th>
                  <th className="px-4 py-3 text-right">নিযুক্ত ব্যক্তি</th>
                  <th className="px-5 py-3 text-right">কার্যক্রম</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((d) => (
                  <tr key={d.id}>
                    <td className="px-5 py-3 font-medium">{d.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{catLabel(d.category)}</td>
                    <td className="px-4 py-3 text-right font-mono-num text-xs">{d.assigned_count} জন</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await confirm({ title: 'পদবি মুছুন', message: `"${d.name}" মুছে ফেলবেন?`, danger: true });
                          if (!ok) return;
                          await apiFetch(`/api/inst/designations/${d.id}`, { method: 'DELETE' });
                          toast('success', 'পদবি মুছে ফেলা হয়েছে');
                          load();
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
    </div>
  );
}

export function SettingsModule() {
  const { toast, hasPermission } = useApp();
  const canManageUsers = hasPermission('settings', 'manage');
  const [tab, setTab] = useState<'roles' | 'users' | 'reset_logs' | 'support_contact' | 'grading' | 'admission' | 'cloud' | 'password'>('roles');
  const [roles, setRoles] = useState<any[]>([]);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [instUsers, setInstUsers] = useState<any[]>([]);
  const [newUserForm, setNewUserForm] = useState({
    full_name: '',
    username: '',
    mobile: '',
    password: '',
    account_type: 'staff',
    role_ids: [] as number[],
    photo_url: '',
  });
  const [editRolesTarget, setEditRolesTarget] = useState<any>(null);
  const [editRoleIds, setEditRoleIds] = useState<number[]>([]);
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');
  const [gradingScale, setGradingScale] = useState<any[]>([]);
  const [admissionFields, setAdmissionFields] = useState<Record<string, { enabled: boolean; required: boolean }>>({});
  const [passForm, setPassForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [supportForm, setSupportForm] = useState({
    whatsapp_number: '',
    whatsapp_enabled: true,
    facebook_url: '',
    facebook_enabled: true,
    support_email: '',
    support_description: '',
  });
  const [effectiveSupport, setEffectiveSupport] = useState<any>(null);
  const [savingSupport, setSavingSupport] = useState(false);
  const [resetLogs, setResetLogs] = useState<any[]>([]);

  const loadUsers = useCallback(async () => {
    if (!canManageUsers) return;
    try {
      const [uRes, logRes] = await Promise.all([
        apiFetch('/api/inst/users'),
        apiFetch('/api/inst/password-reset-logs').catch(() => ({ logs: [] })),
      ]);
      setInstUsers(uRes.users || []);
      setResetLogs(logRes.logs || []);
    } catch {
      // ignore
    }
  }, [canManageUsers]);

  const loadSupportSettings = useCallback(async () => {
    try {
      const sRes = await apiFetch<any>('/api/inst/support-settings');
      if (sRes?.institution) {
        setSupportForm({
          whatsapp_number: sRes.institution.whatsapp_number || '',
          whatsapp_enabled: sRes.institution.whatsapp_enabled !== false,
          facebook_url: sRes.institution.facebook_url || '',
          facebook_enabled: sRes.institution.facebook_enabled !== false,
          support_email: sRes.institution.support_email || '',
          support_description: sRes.institution.support_description || '',
        });
      }
      setEffectiveSupport(sRes?.effective || null);
    } catch {
      // ignore
    }
  }, []);

  const loadAll = useCallback(async () => {
    const [rRes, pRes] = await Promise.all([apiFetch('/api/inst/roles'), apiFetch('/api/inst/profile')]);
    setRoles(rRes.roles || []);
    if (rRes.roles?.length && !selectedRole) setSelectedRole(rRes.roles[0]);
    setGradingScale(pRes.institution.grading_scale || []);
    setAdmissionFields(pRes.institution.admission_fields || {});
    await Promise.all([loadUsers(), loadSupportSettings()]);
  }, [selectedRole, loadUsers, loadSupportSettings]);

  useEffect(() => {
    loadAll().catch(() => {});
  }, []);

  const togglePerm = (mod: string, action: string) => {
    if (!selectedRole) return;
    const current: string[] = selectedRole.permissions?.[mod] || [];
    const next = current.includes(action) ? current.filter((a) => a !== action) : [...current, action];
    setSelectedRole({
      ...selectedRole,
      permissions: { ...selectedRole.permissions, [mod]: next },
    });
  };

  const saveRole = async () => {
    if (!selectedRole) return;
    try {
      await apiFetch(`/api/inst/roles/${selectedRole.id}`, {
        method: 'PUT',
        body: {
          name: selectedRole.name,
          description: selectedRole.description,
          permissions: selectedRole.permissions,
        },
      });
      toast('success', `"${selectedRole.name}" রোলের পারমিশন সংরক্ষিত হয়েছে`);
      const rRes = await apiFetch('/api/inst/roles');
      setRoles(rRes.roles || []);
    } catch (err: any) {
      toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
    }
  };

  const saveSettings = async () => {
    try {
      await apiFetch('/api/inst/settings', {
        method: 'PUT',
        body: { grading_scale: gradingScale, admission_fields: admissionFields },
      });
      toast('success', 'প্রতিষ্ঠানের কনফিগারেশন সংরক্ষিত হয়েছে');
    } catch (err: any) {
      toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="প্রতিষ্ঠান সেটিংস ও পারমিশন"
        subtitle="ভূমিকাভিত্তিক অনুমতি (RBAC), গ্রেডিং স্কেল, ভর্তি ফর্ম ফিল্ড এবং পাসওয়ার্ড পরিবর্তন"
      />

      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit flex-wrap">
        {[
          { id: 'roles', label: 'রোল ও পারমিশন' },
          ...(canManageUsers ? [{ id: 'users', label: `ব্যবহারকারী ও অ্যাকাউন্ট (${instUsers.length})` }] : []),
          ...(canManageUsers ? [{ id: 'reset_logs', label: `পাসওয়ার্ড রিসেট ইতিহাস (${resetLogs.length})` }] : []),
          { id: 'support_contact', label: 'সাপোর্ট ও যোগাযোগ (WhatsApp/FB)' },
          { id: 'grading', label: 'গ্রেডিং স্কেল' },
          { id: 'admission', label: 'ভর্তি ফর্ম কনফিগারেশন' },
          { id: 'cloud', label: 'Firebase ক্লাউড সিঙ্ক' },
          { id: 'password', label: 'পাসওয়ার্ড পরিবর্তন' },
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

      {tab === 'roles' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3 space-y-2">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRole(r)}
                className={`w-full text-left p-3.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                  selectedRole?.id === r.id
                    ? 'bg-violet-50/70 dark:bg-violet-950/30 border-[#6D28D9]'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="font-semibold text-sm">{r.name}</div>
                <div className="text-slate-500 mt-0.5 line-clamp-2">{r.description}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            {selectedRole ? (
              <>
                <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h3 className="font-bold text-base">{selectedRole.name}</h3>
                    <p className="text-xs text-slate-500">{selectedRole.description}</p>
                  </div>
                  <button type="button" onClick={saveRole} className={emeraldBtnClass}>
                    পারমিশন সংরক্ষণ করুন
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className={tableHeadClass}>
                      <tr>
                        <th className="px-3 py-2.5">মডিউল</th>
                        {ACTION_LIST.map((a) => (
                          <th key={a} className="px-2 py-2.5 text-center capitalize">{a}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {Object.entries(MODULE_LABELS).map(([modKey, modLabel]) => (
                        <tr key={modKey}>
                          <td className="px-3 py-2.5 font-medium">{modLabel}</td>
                          {ACTION_LIST.map((act) => {
                            const checked = (selectedRole.permissions?.[modKey] || []).includes(act);
                            return (
                              <td key={act} className="px-2 py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePerm(modKey, act)}
                                  className="w-4 h-4 accent-[#6D28D9] cursor-pointer"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <EmptyState title="একটি রোল নির্বাচন করুন" />
            )}
          </div>
        </div>
      )}

      {tab === 'users' && canManageUsers && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-12 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const res = await apiFetch('/api/inst/users', {
                    method: 'POST',
                    body: newUserForm,
                  });
                  toast(
                    'success',
                    'নতুন ব্যবহারকারী অ্যাকাউন্ট তৈরি হয়েছে',
                    res?.usedMobileAsPassword
                      ? `ইউজারনেম: @${newUserForm.username} · প্রাথমিক পাসওয়ার্ড: মোবাইল নম্বর`
                      : `ইউজারনেম: @${newUserForm.username}`
                  );
                  setNewUserForm({
                    full_name: '',
                    username: '',
                    mobile: '',
                    password: '',
                    account_type: 'staff',
                    role_ids: [],
                    photo_url: '',
                  });
                  loadUsers();
                } catch (err: any) {
                  toast('error', 'অ্যাকাউন্ট তৈরি ব্যর্থ', err.message);
                }
              }}
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5 h-fit"
            >
              <h3 className="text-sm font-semibold">নতুন কর্মকর্তা / ব্যবহারকারী অ্যাকাউন্ট</h3>
              <p className="text-xs text-slate-500">
                মুহতামিম, নাজেমে তালিমাত, নাজেমে মালিয়া, নাজেমে দারুল ইকামা বা অন্য কর্মকর্তাদের অ্যাকাউন্ট তৈরি করুন।
              </p>
              <FileUploadField
                category="image"
                module="user_photo"
                buttonLabel="প্রোফাইল ছবি (ঐচ্ছিক)"
                valueUrl={newUserForm.photo_url}
                showImagePreview
                compact
                previewClassName="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                onUploaded={(res) => setNewUserForm((f) => ({ ...f, photo_url: res.url }))}
                onClear={newUserForm.photo_url ? () => setNewUserForm((f) => ({ ...f, photo_url: '' })) : undefined}
                onError={(msg) => toast('error', 'ছবি আপলোড ব্যর্থ', msg)}
              />
              <div>
                <label className={labelClass}>অ্যাকাউন্টের ধরন *</label>
                <select
                  value={newUserForm.account_type}
                  onChange={(e) => setNewUserForm({ ...newUserForm, account_type: e.target.value })}
                  className={inputClass}
                >
                  <option value="staff">প্রশাসনিক কর্মকর্তা / কর্মচারী</option>
                  <option value="institution_admin">প্রতিষ্ঠান অ্যাডমিন / মুহতামিম</option>
                  <option value="teacher">শিক্ষক</option>
                  <option value="guardian">অভিভাবক</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>পূর্ণ নাম *</label>
                <input
                  required
                  value={newUserForm.full_name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, full_name: e.target.value })}
                  className={inputClass}
                  placeholder="যেমন: মাওলানা মাহমুদুল হাসান"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={labelClass}>ইউজারনেম *</label>
                  <input
                    required
                    value={newUserForm.username}
                    onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                    className={inputClass}
                    placeholder="mahmud"
                  />
                </div>
                <div>
                  <label className={labelClass}>মোবাইল নম্বর</label>
                  <input
                    value={newUserForm.mobile}
                    onChange={(e) => setNewUserForm({ ...newUserForm, mobile: e.target.value })}
                    className={inputClass}
                    placeholder="017XXXXXXXX"
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>
                  পাসওয়ার্ড / পিন {newUserForm.account_type === 'institution_admin' ? '*' : '(খালি রাখলে মোবাইল নম্বর)'}
                </label>
                <input
                  type="password"
                  required={newUserForm.account_type === 'institution_admin'}
                  minLength={4}
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  className={inputClass}
                  placeholder="কমপক্ষে ৪ অক্ষর"
                />
              </div>
              <div>
                <label className={labelClass}>রোল ও অনুমতি (একাধিক নির্বাচন করা যাবে)</label>
                <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  {roles
                    .filter((r) => !['student', 'guardian'].includes(r.slug))
                    .map((r) => (
                      <label key={r.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newUserForm.role_ids.includes(r.id)}
                          onChange={() => {
                            const exists = newUserForm.role_ids.includes(r.id);
                            setNewUserForm({
                              ...newUserForm,
                              role_ids: exists
                                ? newUserForm.role_ids.filter((x) => x !== r.id)
                                : [...newUserForm.role_ids, r.id],
                            });
                          }}
                          className="accent-[#6D28D9]"
                        />
                        <span>{r.name}</span>
                      </label>
                    ))}
                </div>
              </div>
              <button type="submit" className={emeraldBtnClass}>
                <Plus className="w-4 h-4" /> অ্যাকাউন্ট তৈরি করুন
              </button>
            </form>

            <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-4 py-3">ব্যবহারকারী</th>
                      <th className="px-4 py-3">রোল ও ধরন</th>
                      <th className="px-4 py-3">অবস্থা</th>
                      <th className="px-4 py-3">সর্বশেষ লগইন</th>
                      <th className="px-4 py-3 text-right">কার্যক্রম</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {instUsers.map((u) => (
                      <tr key={u.id}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-sm">{u.full_name}</div>
                          <div className="font-mono-num text-slate-500">@{u.username} · {u.phone || u.mobile || '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {Array.isArray(u.role_names) && u.role_names.length ? u.role_names.join(' · ') : u.role_name || u.account_type}
                          </div>
                          <div className="text-slate-500">{u.account_type}</div>
                        </td>
                        <td className="px-4 py-3"><StatusText status={u.status} /></td>
                        <td className="px-4 py-3 font-mono-num text-slate-500">
                          {u.last_login_at ? formatDateTimeDMY(u.last_login_at) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                          {!['student', 'guardian'].includes(u.account_type) && (
                            <button
                              type="button"
                              title="রোল পরিবর্তন"
                              onClick={() => {
                                setEditRolesTarget(u);
                                setEditRoleIds(Array.isArray(u.role_ids) && u.role_ids.length ? u.role_ids : u.role_id ? [u.role_id] : []);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Shield className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="পাসওয়ার্ড রিসেট"
                            onClick={() => {
                              setResetTarget(u);
                              setResetPasswordVal('');
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const nextStatus = u.status === 'active' ? 'inactive' : 'active';
                              try {
                                await apiFetch(`/api/inst/users/${u.id}/status`, {
                                  method: 'PATCH',
                                  body: { status: nextStatus },
                                });
                                toast('success', 'ব্যবহারকারীর অবস্থা হালনাগাদ হয়েছে');
                                loadUsers();
                              } catch (err: any) {
                                toast('error', 'ব্যর্থ', err.message);
                              }
                            }}
                            className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            {u.status === 'active' ? 'নিষ্ক্রিয়' : 'সক্রিয়'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <Modal
            open={Boolean(editRolesTarget)}
            onClose={() => setEditRolesTarget(null)}
            title={`রোল ও অনুমতি নির্ধারণ — ${editRolesTarget?.full_name || ''}`}
          >
            <div className="space-y-4">
              <div className="space-y-2 max-h-60 overflow-y-auto p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                {roles
                  .filter((r) => !['student', 'guardian'].includes(r.slug))
                  .map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editRoleIds.includes(r.id)}
                        onChange={() =>
                          setEditRoleIds((prev) =>
                            prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id]
                          )
                        }
                        className="accent-[#6D28D9]"
                      />
                      <span className="font-medium">{r.name}</span>
                    </label>
                  ))}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditRolesTarget(null)} className={secondaryBtnClass}>বাতিল</button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiFetch(`/api/inst/users/${editRolesTarget.id}/roles`, {
                        method: 'PATCH',
                        body: { role_ids: editRoleIds },
                      });
                      toast('success', 'ব্যবহারকারীর রোল হালনাগাদ হয়েছে');
                      setEditRolesTarget(null);
                      loadUsers();
                    } catch (err: any) {
                      toast('error', 'হালনাগাদ ব্যর্থ', err.message);
                    }
                  }}
                  className={emeraldBtnClass}
                >
                  সংরক্ষণ করুন
                </button>
              </div>
            </div>
          </Modal>

          <Modal
            open={Boolean(resetTarget)}
            onClose={() => setResetTarget(null)}
            title={`পাসওয়ার্ড রিসেট — ${resetTarget?.full_name || ''}`}
            subtitle={`ইউজারনেম: @${resetTarget?.username || ''}`}
          >
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiFetch(`/api/inst/users/${resetTarget.id}/reset-password`, {
                    method: 'POST',
                    body: { new_password: resetPasswordVal },
                  });
                  toast('success', 'পাসওয়ার্ড সফলভাবে রিসেট করা হয়েছে');
                  setResetTarget(null);
                  setResetPasswordVal('');
                } catch (err: any) {
                  toast('error', 'রিসেট ব্যর্থ', err.message);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className={labelClass}>নতুন পাসওয়ার্ড / পিন (কমপক্ষে ৪ অক্ষর)</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setResetTarget(null)} className={secondaryBtnClass}>বাতিল</button>
                <button type="submit" className={primaryBtnClass}>রিসেট করুন</button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {tab === 'grading' && (
        <div className="max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">প্রতিষ্ঠানের নিজস্ব গ্রেডিং স্কেল</h3>
              <p className="text-xs text-slate-500">পরীক্ষার ফলাফল ও জিপিএ হিসাব এই স্কেল অনুযায়ী হবে।</p>
            </div>
            <button
              type="button"
              onClick={() => setGradingScale([...gradingScale, { min: 0, max: 0, grade: '', gpa: 0 }])}
              className={secondaryBtnClass}
            >
              <Plus className="w-3.5 h-3.5" /> ধাপ যোগ করুন
            </button>
          </div>
          <div className="space-y-2.5">
            {gradingScale.map((row, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2.5 items-center">
                <input
                  type="number"
                  value={row.min}
                  onChange={(e) => {
                    const next = [...gradingScale];
                    next[idx] = { ...row, min: Number(e.target.value) };
                    setGradingScale(next);
                  }}
                  placeholder="সর্বনিম্ন %"
                  className={`${inputClass} col-span-2 font-mono-num`}
                />
                <input
                  type="number"
                  value={row.max}
                  onChange={(e) => {
                    const next = [...gradingScale];
                    next[idx] = { ...row, max: Number(e.target.value) };
                    setGradingScale(next);
                  }}
                  placeholder="সর্বোচ্চ %"
                  className={`${inputClass} col-span-2 font-mono-num`}
                />
                <input
                  type="text"
                  value={row.grade}
                  onChange={(e) => {
                    const next = [...gradingScale];
                    next[idx] = { ...row, grade: e.target.value };
                    setGradingScale(next);
                  }}
                  placeholder="গ্রেড নাম"
                  className={`${inputClass} col-span-5`}
                />
                <input
                  type="number"
                  step="0.1"
                  value={row.gpa}
                  onChange={(e) => {
                    const next = [...gradingScale];
                    next[idx] = { ...row, gpa: Number(e.target.value) };
                    setGradingScale(next);
                  }}
                  placeholder="GPA"
                  className={`${inputClass} col-span-2 font-mono-num`}
                />
                <button
                  type="button"
                  onClick={() => setGradingScale(gradingScale.filter((_, i) => i !== idx))}
                  className="col-span-1 p-2 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={saveSettings} className={emeraldBtnClass}>গ্রেডিং স্কেল সংরক্ষণ করুন</button>
        </div>
      )}

      {tab === 'admission' && (
        <div className="max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold">ভর্তি ফর্মের কনফিগারযোগ্য ফিল্ডসমূহ</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {Object.entries(admissionFields).map(([key, cfg]) => (
              <div key={key} className="py-3 flex items-center justify-between gap-4">
                <span className="font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                <div className="flex items-center gap-6 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.enabled}
                      onChange={(e) =>
                        setAdmissionFields({ ...admissionFields, [key]: { ...cfg, enabled: e.target.checked } })
                      }
                      className="accent-[#6D28D9]"
                    />
                    প্রদর্শন
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.required}
                      onChange={(e) =>
                        setAdmissionFields({ ...admissionFields, [key]: { ...cfg, required: e.target.checked } })
                      }
                      className="accent-[#047857]"
                    />
                    আবশ্যক
                  </label>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={saveSettings} className={emeraldBtnClass}>ফর্ম সেটিংস সংরক্ষণ করুন</button>
        </div>
      )}

      {tab === 'cloud' && <FirebaseCloudPanel mode="workspace" />}

      {tab === 'support_contact' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSavingSupport(true);
            try {
              await apiFetch('/api/inst/support-settings', { method: 'PUT', body: supportForm });
              await loadSupportSettings();
              toast('success', 'প্রতিষ্ঠানের সাপোর্ট ও যোগাযোগ সেটিংস সংরক্ষিত হয়েছে');
            } catch (err: any) {
              toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
            } finally {
              setSavingSupport(false);
            }
          }}
          className="max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
        >
          <div>
            <h3 className="text-sm font-semibold">প্রতিষ্ঠানের হোয়াটসঅ্যাপ ও ফেসবুক সাপোর্ট সেটিংস</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              এখানে আপনার মাদ্রাসার নিজস্ব হোয়াটসঅ্যাপ নম্বর বা ফেসবুক পেজ যুক্ত করুন। খালি রাখলে স্বয়ংক্রিয়ভাবে গ্লোবাল দারুল ইদারা সাপোর্ট নম্বর ব্যবহৃত হবে।
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>প্রতিষ্ঠানের হোয়াটসঅ্যাপ নম্বর</label>
              <input
                value={supportForm.whatsapp_number}
                onChange={(e) => setSupportForm({ ...supportForm, whatsapp_number: e.target.value })}
                placeholder="+8801XXXXXXXXX"
                className={`${inputClass} font-mono-num`}
              />
              <label className="mt-2 inline-flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={supportForm.whatsapp_enabled}
                  onChange={(e) => setSupportForm({ ...supportForm, whatsapp_enabled: e.target.checked })}
                  className="accent-[#047857]"
                />
                হোয়াটসঅ্যাপ সাপোর্ট চালু রাখুন
              </label>
            </div>
            <div>
              <label className={labelClass}>প্রতিষ্ঠানের ফেসবুক পেজ / সাপোর্ট লিংক</label>
              <input
                value={supportForm.facebook_url}
                onChange={(e) => setSupportForm({ ...supportForm, facebook_url: e.target.value })}
                placeholder="https://facebook.com/yourmadrasa"
                className={inputClass}
              />
              <label className="mt-2 inline-flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={supportForm.facebook_enabled}
                  onChange={(e) => setSupportForm({ ...supportForm, facebook_enabled: e.target.checked })}
                  className="accent-[#6D28D9]"
                />
                ফেসবুক সাপোর্ট চালু রাখুন
              </label>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>সাপোর্ট ইমেইল (ঐচ্ছিক)</label>
              <input
                type="email"
                value={supportForm.support_email}
                onChange={(e) => setSupportForm({ ...supportForm, support_email: e.target.value })}
                placeholder="office@madrasa.org"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>সাপোর্ট সময়সূচি / বিবরণ</label>
              <input
                value={supportForm.support_description}
                onChange={(e) => setSupportForm({ ...supportForm, support_description: e.target.value })}
                placeholder="শনিবার–বৃহস্পতিবার সকাল ৮টা–বিকাল ৫টা"
                className={inputClass}
              />
            </div>
          </div>
          {effectiveSupport && (
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div className="font-semibold text-slate-700 dark:text-slate-200">বর্তমানে কার্যকর সাপোর্ট চ্যানেল:</div>
              <div>
                WhatsApp:{' '}
                <span className="font-mono-num font-semibold text-[#047857]">
                  {effectiveSupport.whatsapp_number || 'নির্ধারিত নয়'}
                </span>
                {effectiveSupport.whatsapp_source === 'global' && ' (গ্লোবাল ফলব্যাক)'}
                {effectiveSupport.whatsapp_source === 'institution' && ' (প্রতিষ্ঠানের নিজস্ব)'}
              </div>
              <div>
                Facebook:{' '}
                <span className="font-semibold text-[#6D28D9]">
                  {effectiveSupport.facebook_url || 'নির্ধারিত নয়'}
                </span>
                {effectiveSupport.facebook_source === 'global' && ' (গ্লোবাল ফলব্যাক)'}
                {effectiveSupport.facebook_source === 'institution' && ' (প্রতিষ্ঠানের নিজস্ব)'}
              </div>
            </div>
          )}
          <button type="submit" disabled={savingSupport} className={emeraldBtnClass}>
            {savingSupport ? 'সংরক্ষণ হচ্ছে...' : 'সাপোর্ট সেটিংস সংরক্ষণ করুন'}
          </button>
        </form>
      )}

      {tab === 'reset_logs' && canManageUsers && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold">পাসওয়ার্ড রিসেট ও রিকভারি ইতিহাস</h3>
            <p className="text-xs text-slate-500 mt-0.5">প্রতিষ্ঠানের সকল পাসওয়ার্ড রিসেট কার্যক্রমের নিরাপত্তা লগ</p>
          </div>
          {resetLogs.length === 0 ? (
            <div className="p-6">
              <EmptyState title="কোনো পাসওয়ার্ড রিসেট রেকর্ড নেই" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="px-4 py-3">তারিখ ও সময়</th>
                    <th className="px-4 py-3">লক্ষ্য ব্যবহারকারী</th>
                    <th className="px-4 py-3">ধরন</th>
                    <th className="px-4 py-3">রিসেটকারী</th>
                    <th className="px-4 py-3">পদ্ধতি</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {resetLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-3 text-xs font-mono-num text-slate-500">
                        {formatDateTimeDMY(log.created_at)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-semibold">{log.target_full_name || log.target_username}</div>
                        <div className="font-mono-num text-slate-500">@{log.target_username}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{log.target_role || '—'}</td>
                      <td className="px-4 py-3 text-xs font-medium">{log.reset_by_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {log.used_roll_as_pin ? 'রোল নম্বর পিন হিসেবে' : 'নতুন পাসওয়ার্ড/পিন'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'password' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (passForm.new_password !== passForm.confirm) {
              toast('error', 'নতুন পাসওয়ার্ড মিলছে না');
              return;
            }
            try {
              await apiFetch('/api/auth/change-password', {
                method: 'POST',
                body: { current_password: passForm.current_password, new_password: passForm.new_password },
              });
              setPassForm({ current_password: '', new_password: '', confirm: '' });
              toast('success', 'পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে');
            } catch (err: any) {
              toast('error', 'পরিবর্তন ব্যর্থ', err.message);
            }
          }}
          className="max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
        >
          <h3 className="text-sm font-semibold">পাসওয়ার্ড / পিন পরিবর্তন</h3>
          <div>
            <label className={labelClass}>বর্তমান পাসওয়ার্ড / পিন</label>
            <input type="password" required value={passForm.current_password} onChange={(e) => setPassForm({ ...passForm, current_password: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>নতুন পাসওয়ার্ড / পিন (কমপক্ষে ৪ অক্ষর)</label>
            <input type="password" required minLength={4} value={passForm.new_password} onChange={(e) => setPassForm({ ...passForm, new_password: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>নতুন পাসওয়ার্ড নিশ্চিত করুন</label>
            <input type="password" required minLength={4} value={passForm.confirm} onChange={(e) => setPassForm({ ...passForm, confirm: e.target.value })} className={inputClass} />
          </div>
          <button type="submit" className={primaryBtnClass}>পাসওয়ার্ড হালনাগাদ করুন</button>
        </form>
      )}
    </div>
  );
}
