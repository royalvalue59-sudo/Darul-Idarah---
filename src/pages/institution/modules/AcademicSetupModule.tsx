import React, { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  BookMarked,
  BookOpen,
  Edit3,
  FolderPlus,
  Layers,
  Plus,
  RotateCcw,
  Search,
  Tags,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch, formatDateDMY } from '../../../lib/api';
import { FileUploadField } from '../../../components/ui/FileUploadField';
import { useApp } from '../../../context/AppContext';
import {
  EmptyState,
  Modal,
  PageHeader,
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

export type AcademicSetupSection = 'departments' | 'books' | 'jamaats';

const STATUS_OPTIONS = [
  { value: 'active', label: 'সক্রিয়' },
  { value: 'inactive', label: 'নিষ্ক্রিয়' },
  { value: 'archived', label: 'আর্কাইভড' },
] as const;

export function AcademicSetupModule({ section }: { section: AcademicSetupSection }) {
  const { toast, confirm, hasPermission } = useApp();
  const canCreate = hasPermission('academic', 'create');
  const canEdit = hasPermission('academic', 'edit');
  const canDelete = hasPermission('academic', 'delete');

  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [jamaats, setJamaats] = useState<any[]>([]);

  // Sub-tab inside "শ্রেণী / জামাতের নাম" (Tab 1: শ্রেণী / জামাত, Tab 2: ক্লাস ম্যানেজমেন্ট)
  const [jamaatTab, setJamaatTab] = useState<'jamaat_list' | 'class_list'>('jamaat_list');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'archived'>('all');
  const [deptFilter, setDeptFilter] = useState('');
  const [jamaatFilter, setJamaatFilter] = useState('');

  // Department form & modal
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState<number | null>(null);
  const [deptForm, setDeptForm] = useState({ name: '', description: '', status: 'active' });

  // Book form & modal
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [editingBookId, setEditingBookId] = useState<number | null>(null);
  const [bookForm, setBookForm] = useState({
    name: '',
    arabic_name: '',
    short_name: '',
    author_name: '',
    publisher_name: '',
    description: '',
    cover_image_url: '',
    status: 'active',
  });

  // Jamaat form & modal
  const [jamModalOpen, setJamModalOpen] = useState(false);
  const [editingJamId, setEditingJamId] = useState<number | null>(null);
  const [jamBookSearch, setJamBookSearch] = useState('');
  const [jamForm, setJamForm] = useState({
    name: '',
    short_name: '',
    department_id: '',
    description: '',
    status: 'active',
    book_ids: [] as number[],
  });

  // Class form & modal
  const [clsModalOpen, setClsModalOpen] = useState(false);
  const [editingClsId, setEditingClsId] = useState<number | null>(null);
  const [clsBookSearch, setClsBookSearch] = useState('');
  const [clsForm, setClsForm] = useState({
    department_id: '',
    jamaat_id: '',
    name: '',
    description: '',
    display_order: '1',
    status: 'active',
    jamaat_ids: [] as number[],
    book_ids: [] as number[],
    sync_books_to_subjects: true,
  });

  const [saving, setSaving] = useState(false);

  // Reset filters when switching section or tab
  useEffect(() => {
    setSearch('');
    setStatusFilter('all');
    setDeptFilter('');
    setJamaatFilter('');
  }, [section, jamaatTab]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (statusFilter !== 'all') qs.set('status', statusFilter);

      if (section === 'departments') {
        const res = await apiFetch(`/api/inst/departments?${qs.toString()}`);
        setDepartments(res.departments || []);
      } else if (section === 'books') {
        const res = await apiFetch(`/api/inst/books?${qs.toString()}`);
        setBooks(res.books || []);
      } else {
        // section === 'jamaats' (2-tab hub: Jamaats + Classes + linked Departments & Books)
        if (deptFilter) qs.set('department_id', deptFilter);
        if (jamaatTab === 'class_list' && jamaatFilter) qs.set('jamaat_id', jamaatFilter);

        const [dRes, bRes, jRes, cRes] = await Promise.all([
          apiFetch('/api/inst/departments'),
          apiFetch('/api/inst/books'),
          apiFetch(`/api/inst/jamaats${jamaatTab === 'jamaat_list' ? `?${qs.toString()}` : ''}`),
          apiFetch(`/api/inst/classes${jamaatTab === 'class_list' ? `?${qs.toString()}` : ''}`),
        ]);
        setDepartments(dRes.departments || []);
        setBooks(bRes.books || []);
        setJamaats(jRes.jamaats || []);
        setClasses(cRes.classes || []);
      }
    } catch (err: any) {
      toast('error', 'তথ্য লোড ব্যর্থ হয়েছে', err.message);
    } finally {
      setLoading(false);
    }
  }, [section, jamaatTab, search, statusFilter, deptFilter, jamaatFilter, toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 140);
    return () => clearTimeout(timer);
  }, [loadData]);

  // --- Safe Status Change ---
  const handleStatusChange = async (
    entity: 'departments' | 'books' | 'classes' | 'jamaats',
    id: number,
    nextStatus: 'active' | 'inactive' | 'archived',
    label: string
  ) => {
    try {
      await apiFetch(`/api/inst/${entity}/${id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      const statusText =
        nextStatus === 'active' ? 'সক্রিয়' : nextStatus === 'archived' ? 'আর্কাইভড' : 'নিষ্ক্রিয়';
      toast('success', 'স্ট্যাটাস হালনাগাদ হয়েছে', `"${label}" এখন ${statusText} অবস্থায় রয়েছে।`);
      loadData();
    } catch (err: any) {
      toast('error', 'স্ট্যাটাস পরিবর্তন ব্যর্থ', err.message);
    }
  };

  // --- Safe Delete with Automatic Archive Fallback ---
  const handleSafeDelete = async (
    entity: 'departments' | 'books' | 'classes' | 'jamaats',
    row: any,
    entityLabel: string
  ) => {
    const inUse = Number(row.usage_count || 0) > 0;
    if (inUse) {
      const wantArchive = await confirm({
        title: `${entityLabel} সরাসরি মুছা যাবে না`,
        message: `"${row.name}" এর সাথে বর্তমানে ${row.usage_count} টি যুক্ত রেকর্ড রয়েছে। ডেটা সুরক্ষার জন্য সরাসরি মুছে ফেলার পরিবর্তে আর্কাইভ করতে চান?`,
        confirmLabel: 'নিরাপদ আর্কাইভ করুন',
        danger: false,
      });
      if (!wantArchive) return;
      await handleStatusChange(entity, row.id, 'archived', row.name);
      return;
    }

    const ok = await confirm({
      title: `${entityLabel} মুছে ফেলুন`,
      message: `আপনি কি নিশ্চিত যে "${row.name}" স্থায়ীভাবে মুছে ফেলতে চান?`,
      confirmLabel: 'মুছে ফেলুন',
      danger: true,
    });
    if (!ok) return;

    try {
      await apiFetch(`/api/inst/${entity}/${row.id}`, { method: 'DELETE' });
      toast('success', `${entityLabel} মুছে ফেলা হয়েছে`);
      loadData();
    } catch (err: any) {
      if (err?.status === 409 && err?.data?.canArchive) {
        const wantArchive = await confirm({
          title: 'যুক্ত তথ্য বিদ্যমান — আর্কাইভ করুন',
          message: `${err.message} এটিকে নিরাপদভাবে আর্কাইভ করবেন?`,
          confirmLabel: 'আর্কাইভ করুন',
          danger: false,
        });
        if (wantArchive) {
          await handleStatusChange(entity, row.id, 'archived', row.name);
        }
      } else {
        toast('error', 'মুছে ফেলা ব্যর্থ', err.message);
      }
    }
  };

  // --- Department Save ---
  const openCreateDept = () => {
    setEditingDeptId(null);
    setDeptForm({ name: '', description: '', status: 'active' });
    setDeptModalOpen(true);
  };
  const openEditDept = (d: any) => {
    setEditingDeptId(d.id);
    setDeptForm({ name: d.name || '', description: d.description || '', status: d.status || 'active' });
    setDeptModalOpen(true);
  };
  const saveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingDeptId) {
        await apiFetch(`/api/inst/departments/${editingDeptId}`, { method: 'PUT', body: deptForm });
        toast('success', 'বিভাগের তথ্য হালনাগাদ হয়েছে');
      } else {
        await apiFetch('/api/inst/departments', { method: 'POST', body: deptForm });
        toast('success', 'নতুন বিভাগ সফলভাবে যুক্ত হয়েছে');
      }
      setDeptModalOpen(false);
      loadData();
    } catch (err: any) {
      toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- Book Save ---
  const openCreateBook = () => {
    setEditingBookId(null);
    setBookForm({
      name: '',
      arabic_name: '',
      short_name: '',
      author_name: '',
      publisher_name: '',
      description: '',
      cover_image_url: '',
      status: 'active',
    });
    setBookModalOpen(true);
  };
  const openEditBook = (b: any) => {
    setEditingBookId(b.id);
    setBookForm({
      name: b.name || '',
      arabic_name: b.arabic_name || '',
      short_name: b.short_name || '',
      author_name: b.author_name || '',
      publisher_name: b.publisher_name || '',
      description: b.description || '',
      cover_image_url: b.cover_image_url || '',
      status: b.status || 'active',
    });
    setBookModalOpen(true);
  };
  const saveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingBookId) {
        await apiFetch(`/api/inst/books/${editingBookId}`, { method: 'PUT', body: bookForm });
        toast('success', 'কিতাবের তথ্য হালনাগাদ হয়েছে');
      } else {
        const res = await apiFetch('/api/inst/books', { method: 'POST', body: bookForm });
        toast(
          'success',
          'নতুন কিতাব সফলভাবে যুক্ত হয়েছে',
          res?.book?.book_code ? `ইউনিক আইডি: ${res.book.book_code}` : undefined
        );
      }
      setBookModalOpen(false);
      loadData();
    } catch (err: any) {
      toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- Jamaat Name Save ---
  const openCreateJam = () => {
    setEditingJamId(null);
    setJamBookSearch('');
    setJamForm({
      name: '',
      short_name: '',
      department_id: deptFilter || '',
      description: '',
      status: 'active',
      book_ids: [],
    });
    setJamModalOpen(true);
  };
  const openEditJam = (j: any) => {
    setEditingJamId(j.id);
    setJamBookSearch('');
    setJamForm({
      name: j.name || '',
      short_name: j.short_name || '',
      department_id: j.department_id ? String(j.department_id) : '',
      description: j.description || '',
      status: j.status || 'active',
      book_ids: Array.isArray(j.book_ids) ? j.book_ids : [],
    });
    setJamModalOpen(true);
  };
  const toggleJamBook = (bookId: number) => {
    setJamForm((prev) => ({
      ...prev,
      book_ids: prev.book_ids.includes(bookId)
        ? prev.book_ids.filter((id) => id !== bookId)
        : [...prev.book_ids, bookId],
    }));
  };
  const saveJam = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: jamForm.name,
        short_name: jamForm.short_name,
        department_id: jamForm.department_id ? Number(jamForm.department_id) : null,
        description: jamForm.description,
        status: jamForm.status,
        book_ids: jamForm.book_ids,
      };
      if (editingJamId) {
        await apiFetch(`/api/inst/jamaats/${editingJamId}`, { method: 'PUT', body: payload });
        toast('success', 'শ্রেণী / জামাতের তথ্য হালনাগাদ হয়েছে');
      } else {
        await apiFetch('/api/inst/jamaats', { method: 'POST', body: payload });
        toast('success', 'নতুন শ্রেণী / জামাত সফলভাবে যুক্ত হয়েছে');
      }
      setJamModalOpen(false);
      loadData();
    } catch (err: any) {
      toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- Class Save ---
  const openCreateCls = () => {
    setEditingClsId(null);
    setClsBookSearch('');
    const defaultDept = departments.find((d) => d.status === 'active') || departments[0];
    setClsForm({
      department_id: deptFilter || (defaultDept ? String(defaultDept.id) : ''),
      jamaat_id: jamaatFilter || '',
      name: '',
      description: '',
      display_order: String(classes.length + 1),
      status: 'active',
      jamaat_ids: jamaatFilter ? [Number(jamaatFilter)] : [],
      book_ids: [],
      sync_books_to_subjects: true,
    });
    setClsModalOpen(true);
  };
  const openEditCls = (c: any) => {
    setEditingClsId(c.id);
    setClsBookSearch('');
    setClsForm({
      department_id: String(c.department_id || ''),
      jamaat_id: c.jamaat_id ? String(c.jamaat_id) : c.jamaat_ids?.[0] ? String(c.jamaat_ids[0]) : '',
      name: c.name || '',
      description: c.description || '',
      display_order: String(c.display_order ?? 0),
      status: c.status || 'active',
      jamaat_ids: Array.isArray(c.jamaat_ids) ? c.jamaat_ids : [],
      book_ids: Array.isArray(c.book_ids) ? c.book_ids : [],
      sync_books_to_subjects: false,
    });
    setClsModalOpen(true);
  };
  const toggleClsBook = (bookId: number) => {
    setClsForm((prev) => ({
      ...prev,
      book_ids: prev.book_ids.includes(bookId)
        ? prev.book_ids.filter((id) => id !== bookId)
        : [...prev.book_ids, bookId],
    }));
  };
  const saveCls = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const selectedJamaatId = clsForm.jamaat_id ? Number(clsForm.jamaat_id) : null;
      const jamaatIds = selectedJamaatId ? [selectedJamaatId] : [];
      const payload = {
        department_id: Number(clsForm.department_id),
        jamaat_id: selectedJamaatId,
        jamaat_ids: jamaatIds,
        name: clsForm.name,
        description: clsForm.description,
        display_order: Number(clsForm.display_order || 0),
        status: clsForm.status,
        book_ids: clsForm.book_ids,
        sync_books_to_subjects: clsForm.sync_books_to_subjects,
      };
      if (editingClsId) {
        await apiFetch(`/api/inst/classes/${editingClsId}`, { method: 'PUT', body: payload });
        toast('success', 'ক্লাসের তথ্য ও কিতাব সংযোগ হালনাগাদ হয়েছে');
      } else {
        await apiFetch('/api/inst/classes', { method: 'POST', body: payload });
        toast('success', 'নতুন ক্লাস সফলভাবে যুক্ত হয়েছে');
      }
      setClsModalOpen(false);
      loadData();
    } catch (err: any) {
      toast('error', 'সংরক্ষণ ব্যর্থ', err.message);
    } finally {
      setSaving(false);
    }
  };

  const activeCount = (rows: any[]) => rows.filter((r) => r.status === 'active').length;
  const archivedCount = (rows: any[]) => rows.filter((r) => r.status === 'archived').length;

  const selectableJamaatsForCls = jamaats.filter((j) => {
    if (j.status === 'archived' && String(j.id) !== clsForm.jamaat_id) return false;
    if (!clsForm.department_id) return true;
    return !j.department_id || String(j.department_id) === clsForm.department_id || String(j.id) === clsForm.jamaat_id;
  });

  const filterBooksByQuery = (query: string, selectedIds: number[]) => {
    const q = query.trim().toLowerCase();
    return books.filter((b) => {
      if (b.status === 'archived' && !selectedIds.includes(b.id)) return false;
      if (!q) return true;
      return `${b.name} ${b.arabic_name || ''} ${b.short_name || ''} ${b.book_code || ''} ${b.author_name || ''}`
        .toLowerCase()
        .includes(q);
    });
  };

  return (
    <div className="space-y-6">
      {/* ==================== 1. বিভাগ এড (Department Management) ==================== */}
      {section === 'departments' && (
        <>
          <PageHeader
            title="বিভাগ এড (Department Management)"
            subtitle="হিফজ, নাজেরা, কিতাব, ইবতেদায়ী ও দাওরায়ে হাদিসসহ প্রতিষ্ঠানের সকল একাডেমিক বিভাগ তৈরি ও পরিচালনা করুন"
            actions={
              canCreate ? (
                <button type="button" onClick={openCreateDept} className={emeraldBtnClass}>
                  <Plus className="w-4 h-4" />
                  নতুন বিভাগ যোগ করুন
                </button>
              ) : undefined
            }
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="মোট বিভাগ" value={departments.length} tone="navy" />
            <StatCard label="সক্রিয় বিভাগ" value={activeCount(departments)} tone="emerald" />
            <StatCard
              label="মোট যুক্ত ক্লাস"
              value={departments.reduce((acc, d) => acc + Number(d.class_count || 0), 0)}
              tone="purple"
            />
            <StatCard label="আর্কাইভড বিভাগ" value={archivedCount(departments)} tone="gold" />
          </div>

          <FilterToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="বিভাগের নাম বা বিবরণ দিয়ে খুঁজুন..."
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
          />

          {loading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : departments.length === 0 ? (
            <EmptyState
              title="কোনো বিভাগ পাওয়া যায়নি"
              description="নতুন একাডেমিক বিভাগ তৈরি করুন অথবা ফিল্টার পরিবর্তন করুন।"
              action={
                canCreate ? (
                  <button type="button" onClick={openCreateDept} className={emeraldBtnClass}>
                    <FolderPlus className="w-4 h-4" /> প্রথম বিভাগ যুক্ত করুন
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-5 py-3">বিভাগের নাম</th>
                      <th className="px-4 py-3">বিবরণ</th>
                      <th className="px-4 py-3 text-center">জামাত / ক্লাস / শিক্ষার্থী</th>
                      <th className="px-4 py-3">তৈরির তারিখ</th>
                      <th className="px-4 py-3">স্ট্যাটাস</th>
                      {(canEdit || canDelete) && <th className="px-5 py-3 text-right">কার্যক্রম</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {departments.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">{d.name}</td>
                        <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400 max-w-xs">
                          {d.description || '—'}
                        </td>
                        <td className="px-4 py-3.5 text-center text-xs font-mono-num whitespace-nowrap">
                          <span className="font-semibold text-sky-700 dark:text-sky-400">{d.jamaat_count || 0}</span> জামাত ·{' '}
                          <span className="font-semibold text-[#6D28D9] dark:text-violet-400">{d.class_count || 0}</span> ক্লাস ·{' '}
                          <span className="font-semibold text-[#047857] dark:text-emerald-400">{d.student_count || 0}</span> শিক্ষার্থী
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500 font-mono-num whitespace-nowrap">
                          {formatDateDMY(d.created_at)}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {canEdit ? (
                            <select
                              aria-label={`${d.name} স্ট্যাটাস`}
                              value={d.status}
                              onChange={(e) => handleStatusChange('departments', d.id, e.target.value as any, d.name)}
                              className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 cursor-pointer"
                            >
                              {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <StatusText status={d.status} />
                          )}
                        </td>
                        {(canEdit || canDelete) && (
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openEditDept(d)}
                                title="সম্পাদনা"
                                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            )}
                            {canEdit && d.status !== 'archived' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange('departments', d.id, 'archived', d.name)}
                                title="আর্কাইভ করুন"
                                className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg cursor-pointer"
                              >
                                <Archive className="w-4 h-4" />
                              </button>
                            )}
                            {canEdit && d.status === 'archived' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange('departments', d.id, 'active', d.name)}
                                title="সক্রিয় করুন"
                                className="p-1.5 text-[#047857] hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg cursor-pointer"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleSafeDelete('departments', d, 'বিভাগ')}
                                title={d.usage_count > 0 ? 'যুক্ত রেকর্ড থাকায় আর্কাইভ প্রস্তাব করবে' : 'মুছে ফেলুন'}
                                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Modal
            open={deptModalOpen}
            onClose={() => setDeptModalOpen(false)}
            title={editingDeptId ? 'বিভাগ সম্পাদনা করুন' : 'নতুন বিভাগ যোগ করুন'}
            subtitle="উদাহরণ: হিফজ বিভাগ, নাজেরা বিভাগ, কিতাব বিভাগ, ইবতেদায়ী বিভাগ, দাওরায়ে হাদিস বিভাগ"
          >
            <form onSubmit={saveDept} className="space-y-4">
              <div>
                <label className={labelClass}>বিভাগের নাম *</label>
                <input
                  required
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  placeholder="যেমন: হিফজ বিভাগ"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>বিবরণ</label>
                <textarea
                  rows={3}
                  value={deptForm.description}
                  onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                  placeholder="বিভাগের সংক্ষিপ্ত বিবরণ লিখুন..."
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>স্ট্যাটাস</label>
                <select
                  value={deptForm.status}
                  onChange={(e) => setDeptForm({ ...deptForm, status: e.target.value })}
                  className={inputClass}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button type="button" onClick={() => setDeptModalOpen(false)} className={secondaryBtnClass}>
                  বাতিল
                </button>
                <button type="submit" disabled={saving} className={primaryBtnClass}>
                  {saving ? 'সংরক্ষণ হচ্ছে...' : editingDeptId ? 'হালনাগাদ করুন' : 'বিভাগ সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </Modal>
        </>
      )}

      {/* ==================== 2. কিতাব / বই এড (Book Management) ==================== */}
      {section === 'books' && (
        <>
          <PageHeader
            title="কিতাব / বই এড (Book Management)"
            subtitle="প্রতিষ্ঠানের সকল পাঠ্য কিতাব ও বই সীমাহীনভাবে যুক্ত করুন এবং একাধিক ক্লাস ও জামাতের সাথে সংযুক্ত করুন"
            actions={
              canCreate ? (
                <button type="button" onClick={openCreateBook} className={emeraldBtnClass}>
                  <Plus className="w-4 h-4" />
                  নতুন কিতাব / বই যোগ করুন
                </button>
              ) : undefined
            }
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="মোট কিতাব / বই" value={books.length} tone="navy" />
            <StatCard label="সক্রিয় কিতাব" value={activeCount(books)} tone="emerald" />
            <StatCard
              label="যুক্ত ক্লাস ও জামাত সংযোগ"
              value={books.reduce((acc, b) => acc + Number(b.class_count || 0) + Number(b.jamaat_count || 0), 0)}
              tone="purple"
            />
            <StatCard label="আর্কাইভড কিতাব" value={archivedCount(books)} tone="gold" />
          </div>

          <FilterToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="কিতাবের নাম, আরবি নাম, কোড (KITAB-...), লেখক বা প্রকাশক খুঁজুন..."
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
          />

          {loading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : books.length === 0 ? (
            <EmptyState
              title="কোনো কিতাব / বই পাওয়া যায়নি"
              description="প্রতিষ্ঠানের পাঠ্য কিতাব ও বই যুক্ত করুন। প্রতিটি কিতাবের জন্য স্বয়ংক্রিয় ইউনিক আইডি তৈরি হবে।"
              action={
                canCreate ? (
                  <button type="button" onClick={openCreateBook} className={emeraldBtnClass}>
                    <BookMarked className="w-4 h-4" /> প্রথম কিতাব যুক্ত করুন
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-5 py-3">কিতাব / বই</th>
                      <th className="px-4 py-3">আরবি ও সংক্ষিপ্ত নাম</th>
                      <th className="px-4 py-3">লেখক ও প্রকাশক</th>
                      <th className="px-4 py-3">যুক্ত ক্লাস / জামাত</th>
                      <th className="px-4 py-3">স্ট্যাটাস</th>
                      {(canEdit || canDelete) && <th className="px-5 py-3 text-right">কার্যক্রম</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {books.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            {b.cover_image_url ? (
                              <img
                                src={b.cover_image_url}
                                alt={b.name}
                                referrerPolicy="no-referrer"
                                className="w-10 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-12 rounded-lg bg-[#0F172A] dark:bg-slate-800 text-emerald-400 flex items-center justify-center shrink-0">
                                <BookOpen className="w-4 h-4" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-white">{b.name}</div>
                              <div className="text-[11px] font-mono-num text-[#6D28D9] dark:text-violet-400 font-semibold">
                                {b.book_code}
                              </div>
                              {b.description && (
                                <div className="text-xs text-slate-500 line-clamp-1 max-w-xs mt-0.5">{b.description}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          {b.arabic_name ? (
                            <div dir="rtl" className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                              {b.arabic_name}
                            </div>
                          ) : (
                            <div className="text-slate-400">—</div>
                          )}
                          {b.short_name && <div className="text-slate-500 mt-0.5">সংক্ষিপ্ত: {b.short_name}</div>}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                          <div>{b.author_name || '—'}</div>
                          {b.publisher_name && <div className="text-slate-500 mt-0.5">{b.publisher_name}</div>}
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          {b.classes?.length > 0 || b.jamaats?.length > 0 ? (
                            <div className="space-y-1">
                              {b.classes?.length > 0 && (
                                <div className="text-slate-700 dark:text-slate-300">
                                  <span className="font-semibold text-[#6D28D9] dark:text-violet-400">ক্লাস:</span>{' '}
                                  {b.classes.map((c: any) => c.name).join(', ')}
                                </div>
                              )}
                              {b.jamaats?.length > 0 && (
                                <div className="text-slate-600 dark:text-slate-400">
                                  <span className="font-semibold text-[#047857] dark:text-emerald-400">জামাত:</span>{' '}
                                  {b.jamaats.map((j: any) => j.name).join(', ')}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">এখনো যুক্ত হয়নি</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {canEdit ? (
                            <select
                              aria-label={`${b.name} স্ট্যাটাস`}
                              value={b.status}
                              onChange={(e) => handleStatusChange('books', b.id, e.target.value as any, b.name)}
                              className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 cursor-pointer"
                            >
                              {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <StatusText status={b.status} />
                          )}
                        </td>
                        {(canEdit || canDelete) && (
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openEditBook(b)}
                                title="সম্পাদনা"
                                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            )}
                            {canEdit && b.status !== 'archived' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange('books', b.id, 'archived', b.name)}
                                title="আর্কাইভ করুন"
                                className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg cursor-pointer"
                              >
                                <Archive className="w-4 h-4" />
                              </button>
                            )}
                            {canEdit && b.status === 'archived' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange('books', b.id, 'active', b.name)}
                                title="সক্রিয় করুন"
                                className="p-1.5 text-[#047857] hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg cursor-pointer"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleSafeDelete('books', b, 'কিতাব')}
                                title={b.usage_count > 0 ? 'যুক্ত রেকর্ড থাকায় আর্কাইভ প্রস্তাব করবে' : 'মুছে ফেলুন'}
                                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Modal
            open={bookModalOpen}
            onClose={() => setBookModalOpen(false)}
            title={editingBookId ? 'কিতাব / বই সম্পাদনা করুন' : 'নতুন কিতাব / বই যুক্ত করুন'}
            subtitle="প্রতিটি কিতাবের জন্য স্বয়ংক্রিয় ইউনিক আইডি (KITAB-XXXXXX) তৈরি হবে এবং যেকোনো ক্লাস বা জামাতে পুনরায় ব্যবহার করা যাবে"
            maxWidth="max-w-2xl"
          >
            <form onSubmit={saveBook} className="space-y-4">
              <FileUploadField
                category="image"
                module="book_cover"
                buttonLabel="কিতাবের ছবি আপলোড (ঐচ্ছিক)"
                valueUrl={bookForm.cover_image_url}
                showImagePreview
                previewClassName="w-16 h-20 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                onUploaded={(res) => setBookForm((f) => ({ ...f, cover_image_url: res.url }))}
                onClear={bookForm.cover_image_url ? () => setBookForm((f) => ({ ...f, cover_image_url: '' })) : undefined}
                onError={(msg) => toast('error', 'ছবি আপলোড ব্যর্থ', msg)}
              />

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>কিতাব / বইয়ের নাম *</label>
                  <input
                    required
                    value={bookForm.name}
                    onChange={(e) => setBookForm({ ...bookForm, name: e.target.value })}
                    placeholder="যেমন: সহীহ বুখারী শরীফ / হেদায়াতুন্নাহু"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>আরবি নাম (ঐচ্ছিক)</label>
                  <input
                    dir="rtl"
                    value={bookForm.arabic_name}
                    onChange={(e) => setBookForm({ ...bookForm, arabic_name: e.target.value })}
                    placeholder="যেমন: صحيح البخاري / هداية النحو"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>সংক্ষিপ্ত নাম (ঐচ্ছিক)</label>
                  <input
                    value={bookForm.short_name}
                    onChange={(e) => setBookForm({ ...bookForm, short_name: e.target.value })}
                    placeholder="যেমন: বুখারী-১ / হেদায়াতুন্নাহু"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>স্ট্যাটাস</label>
                  <select
                    value={bookForm.status}
                    onChange={(e) => setBookForm({ ...bookForm, status: e.target.value })}
                    className={inputClass}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>লেখকের নাম (ঐচ্ছিক)</label>
                  <input
                    value={bookForm.author_name}
                    onChange={(e) => setBookForm({ ...bookForm, author_name: e.target.value })}
                    placeholder="যেমন: ইমাম বুখারী (রহ.)"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>প্রকাশকের নাম (ঐচ্ছিক)</label>
                  <input
                    value={bookForm.publisher_name}
                    onChange={(e) => setBookForm({ ...bookForm, publisher_name: e.target.value })}
                    placeholder="যেমন: মাকতাবাতুল আশরাফ"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>বিবরণ (ঐচ্ছিক)</label>
                <textarea
                  rows={2}
                  value={bookForm.description}
                  onChange={(e) => setBookForm({ ...bookForm, description: e.target.value })}
                  placeholder="কিতাব সম্পর্কিত সংক্ষিপ্ত বিবরণ বা সিলেবাস নোট..."
                  className={inputClass}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button type="button" onClick={() => setBookModalOpen(false)} className={secondaryBtnClass}>
                  বাতিল
                </button>
                <button type="submit" disabled={saving} className={primaryBtnClass}>
                  {saving ? 'সংরক্ষণ হচ্ছে...' : editingBookId ? 'হালনাগাদ করুন' : 'কিতাব সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </Modal>
        </>
      )}

      {/* ==================== 3. শ্রেণী / জামাতের নাম (Class & Jamaat Management — 2 Tabs) ==================== */}
      {section === 'jamaats' && (
        <>
          <PageHeader
            title="শ্রেণী / জামাতের নাম (Class & Jamaat Management)"
            subtitle="প্রতিষ্ঠানের শ্রেণী / জামাত এবং প্রতিটি বিভাগের অধীনে ক্লাস তৈরি করুন ও কিতাব / বই সংযুক্ত করুন"
            actions={
              canCreate ? (
                jamaatTab === 'jamaat_list' ? (
                  <button type="button" onClick={openCreateJam} className={emeraldBtnClass}>
                    <Plus className="w-4 h-4" />
                    নতুন শ্রেণী / জামাত
                  </button>
                ) : (
                  <button type="button" onClick={openCreateCls} className={emeraldBtnClass}>
                    <Plus className="w-4 h-4" />
                    নতুন ক্লাস যোগ করুন
                  </button>
                )
              ) : undefined
            }
          />

          {/* Two Distinct Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setJamaatTab('jamaat_list')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                jamaatTab === 'jamaat_list'
                  ? 'border-[#047857] text-[#047857] dark:text-emerald-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Tags className="w-4 h-4" />
              শ্রেণী / জামাত ({jamaats.length})
            </button>
            <button
              type="button"
              onClick={() => setJamaatTab('class_list')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                jamaatTab === 'class_list'
                  ? 'border-[#6D28D9] text-[#6D28D9] dark:text-violet-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              ক্লাস ম্যানেজমেন্ট ({classes.length})
            </button>
          </div>

          {/* ---------- TAB 1: শ্রেণী / জামাত ---------- */}
          {jamaatTab === 'jamaat_list' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="মোট শ্রেণী / জামাত" value={jamaats.length} tone="navy" />
                <StatCard label="সক্রিয় জামাত" value={activeCount(jamaats)} tone="emerald" />
                <StatCard
                  label="যুক্ত কিতাব সংযোগ"
                  value={jamaats.reduce((acc, j) => acc + Number(j.book_count || 0), 0)}
                  tone="purple"
                />
                <StatCard label="আর্কাইভড জামাত" value={archivedCount(jamaats)} tone="gold" />
              </div>

              <FilterToolbar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="শ্রেণী / জামাতের নাম, সংক্ষিপ্ত নাম বা বিভাগ দিয়ে খুঁজুন..."
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                extra={
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">সকল বিভাগ</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                }
              />

              {loading ? (
                <TableSkeleton rows={6} cols={7} />
              ) : jamaats.length === 0 ? (
                <EmptyState
                  title="কোনো শ্রেণী / জামাতের নাম পাওয়া যায়নি"
                  description="মাদ্রাসার প্রচলিত শ্রেণী বা জামাতের নাম (মিজান, নাহবেমীর, হেদায়াতুন্নাহু, কাফিয়া, হিফজ ইত্যাদি) যুক্ত করুন।"
                  action={
                    canCreate ? (
                      <button type="button" onClick={openCreateJam} className={emeraldBtnClass}>
                        <Tags className="w-4 h-4" /> প্রথম শ্রেণী / জামাত যোগ করুন
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className={tableHeadClass}>
                        <tr>
                          <th className="px-5 py-3">শ্রেণী / জামাতের নাম</th>
                          <th className="px-4 py-3">সংশ্লিষ্ট বিভাগ</th>
                          <th className="px-4 py-3">যুক্ত কিতাব / বইসমূহ</th>
                          <th className="px-4 py-3 text-center">ক্লাস / শিক্ষার্থী</th>
                          <th className="px-4 py-3">স্ট্যাটাস</th>
                          {(canEdit || canDelete) && <th className="px-5 py-3 text-right">কার্যক্রম</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {jamaats.map((j) => (
                          <tr key={j.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="px-5 py-3.5">
                              <div className="font-semibold text-slate-900 dark:text-white">
                                {j.name}
                                {j.short_name ? (
                                  <span className="ml-2 text-xs font-normal text-slate-500">({j.short_name})</span>
                                ) : null}
                              </div>
                              {j.description && (
                                <div className="text-xs text-slate-500 line-clamp-1 max-w-xs mt-0.5">{j.description}</div>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                              {j.department_name || <span className="text-slate-400">সকল বিভাগ / সাধারণ</span>}
                            </td>
                            <td className="px-4 py-3.5 text-xs">
                              {Array.isArray(j.books) && j.books.length > 0 ? (
                                <div className="space-y-0.5">
                                  <div className="font-semibold text-[#047857] dark:text-emerald-400">
                                    {j.books.length} টি কিতাব
                                  </div>
                                  <div className="text-slate-600 dark:text-slate-400 line-clamp-2 max-w-xs">
                                    {j.books.map((b: any) => b.name).join(', ')}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400">নির্ধারিত নয়</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center text-xs font-mono-num whitespace-nowrap">
                              <span className="font-semibold text-[#6D28D9] dark:text-violet-400">{j.class_count || 0}</span> ক্লাস ·{' '}
                              <span className="font-semibold text-[#047857] dark:text-emerald-400">{j.student_count || 0}</span> শিক্ষার্থী
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              {canEdit ? (
                                <select
                                  aria-label={`${j.name} স্ট্যাটাস`}
                                  value={j.status}
                                  onChange={(e) => handleStatusChange('jamaats', j.id, e.target.value as any, j.name)}
                                  className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 cursor-pointer"
                                >
                                  {STATUS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <StatusText status={j.status} />
                              )}
                            </td>
                            {(canEdit || canDelete) && (
                              <td className="px-5 py-3.5 text-right whitespace-nowrap">
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => openEditJam(j)}
                                    title="সম্পাদনা"
                                    className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                )}
                                {canEdit && j.status !== 'archived' && (
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange('jamaats', j.id, 'archived', j.name)}
                                    title="আর্কাইভ করুন"
                                    className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg cursor-pointer"
                                  >
                                    <Archive className="w-4 h-4" />
                                  </button>
                                )}
                                {canEdit && j.status === 'archived' && (
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange('jamaats', j.id, 'active', j.name)}
                                    title="সক্রিয় করুন"
                                    className="p-1.5 text-[#047857] hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg cursor-pointer"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => handleSafeDelete('jamaats', j, 'শ্রেণী / জামাত')}
                                    title={j.usage_count > 0 ? 'যুক্ত রেকর্ড থাকায় আর্কাইভ প্রস্তাব করবে' : 'মুছে ফেলুন'}
                                    className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ---------- TAB 2: ক্লাস ম্যানেজমেন্ট ---------- */}
          {jamaatTab === 'class_list' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="মোট ক্লাস" value={classes.length} tone="navy" />
                <StatCard label="সক্রিয় ক্লাস" value={activeCount(classes)} tone="emerald" />
                <StatCard
                  label="মোট সংযুক্ত কিতাব"
                  value={classes.reduce((acc, c) => acc + Number(c.book_count || 0), 0)}
                  tone="purple"
                />
                <StatCard
                  label="মোট সক্রিয় শিক্ষার্থী"
                  value={classes.reduce((acc, c) => acc + Number(c.student_count || 0), 0)}
                  tone="gold"
                />
              </div>

              <FilterToolbar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="ক্লাস, বিভাগ, জামাত বা বিবরণ দিয়ে খুঁজুন..."
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                extra={
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      <option value="">সকল বিভাগ</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={jamaatFilter}
                      onChange={(e) => setJamaatFilter(e.target.value)}
                      className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      <option value="">সকল শ্রেণী / জামাত</option>
                      {jamaats.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.name}
                        </option>
                      ))}
                    </select>
                  </div>
                }
              />

              {loading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : classes.length === 0 ? (
                <EmptyState
                  title="কোনো ক্লাস পাওয়া যায়নি"
                  description="যেকোনো বিভাগ ও শ্রেণী/জামাতের অধীনে নতুন ক্লাস যোগ করুন এবং কিতাব সংযুক্ত করুন।"
                  action={
                    canCreate ? (
                      <button type="button" onClick={openCreateCls} className={emeraldBtnClass}>
                        <Layers className="w-4 h-4" /> নতুন ক্লাস যুক্ত করুন
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className={tableHeadClass}>
                        <tr>
                          <th className="px-5 py-3">বিভাগ ও জামাত</th>
                          <th className="px-4 py-3">ক্লাসের নাম</th>
                          <th className="px-4 py-3">সংযুক্ত কিতাব / বইসমূহ</th>
                          <th className="px-4 py-3 text-center">বিষয় / শিক্ষার্থী</th>
                          <th className="px-4 py-3">স্ট্যাটাস</th>
                          {(canEdit || canDelete) && <th className="px-5 py-3 text-right">কার্যক্রম</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {classes.map((c) => {
                          const displayBooks = Array.isArray(c.effective_books) && c.effective_books.length > 0
                            ? c.effective_books
                            : Array.isArray(c.books)
                            ? c.books
                            : [];
                          return (
                            <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="px-5 py-3.5 text-xs">
                                <div className="font-semibold text-slate-800 dark:text-slate-200">{c.department_name}</div>
                                <div className="text-[#6D28D9] dark:text-violet-400 mt-0.5">
                                  {c.jamaat_name ||
                                    (Array.isArray(c.jamaats) && c.jamaats.length > 0
                                      ? c.jamaats.map((j: any) => j.name).join(', ')
                                      : 'জামাত নির্ধারিত নয়')}
                                </div>
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="font-semibold text-slate-900 dark:text-white">{c.name}</div>
                                <div className="text-[11px] text-slate-400 font-mono-num">
                                  ক্রম: {c.display_order} · {formatDateDMY(c.created_at)}
                                </div>
                                {c.description && (
                                  <div className="text-xs text-slate-500 line-clamp-1 max-w-xs mt-0.5">{c.description}</div>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-xs">
                                {displayBooks.length > 0 ? (
                                  <div className="space-y-0.5">
                                    <div className="font-semibold text-[#047857] dark:text-emerald-400">
                                      {displayBooks.length} টি কিতাব
                                    </div>
                                    <div className="text-slate-600 dark:text-slate-400 line-clamp-2 max-w-sm">
                                      {displayBooks.map((b: any) => b.name).join(', ')}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">কোনো কিতাব যুক্ত নেই</span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-center text-xs font-mono-num whitespace-nowrap">
                                <span className="font-semibold text-[#6D28D9] dark:text-violet-400">{c.subject_count || 0}</span> বিষয় ·{' '}
                                <span className="font-semibold text-[#047857] dark:text-emerald-400">{c.student_count || 0}</span> শিক্ষার্থী
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                {canEdit ? (
                                  <select
                                    aria-label={`${c.name} স্ট্যাটাস`}
                                    value={c.status}
                                    onChange={(e) => handleStatusChange('classes', c.id, e.target.value as any, c.name)}
                                    className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 cursor-pointer"
                                  >
                                    {STATUS_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <StatusText status={c.status} />
                                )}
                              </td>
                              {(canEdit || canDelete) && (
                                <td className="px-5 py-3.5 text-right whitespace-nowrap">
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => openEditCls(c)}
                                      title="সম্পাদনা ও কিতাব নির্ধারণ"
                                      className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                  )}
                                  {canEdit && c.status !== 'archived' && (
                                    <button
                                      type="button"
                                      onClick={() => handleStatusChange('classes', c.id, 'archived', c.name)}
                                      title="আর্কাইভ করুন"
                                      className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg cursor-pointer"
                                    >
                                      <Archive className="w-4 h-4" />
                                    </button>
                                  )}
                                  {canEdit && c.status === 'archived' && (
                                    <button
                                      type="button"
                                      onClick={() => handleStatusChange('classes', c.id, 'active', c.name)}
                                      title="সক্রিয় করুন"
                                      className="p-1.5 text-[#047857] hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg cursor-pointer"
                                    >
                                      <RotateCcw className="w-4 h-4" />
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => handleSafeDelete('classes', c, 'ক্লাস')}
                                      title={c.usage_count > 0 ? 'যুক্ত রেকর্ড থাকায় আর্কাইভ প্রস্তাব করবে' : 'মুছে ফেলুন'}
                                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Jamaat Modal */}
          <Modal
            open={jamModalOpen}
            onClose={() => setJamModalOpen(false)}
            title={editingJamId ? 'শ্রেণী / জামাত সম্পাদনা করুন' : 'নতুন শ্রেণী / জামাত যোগ করুন'}
            subtitle="উদাহরণ: মিজান, নাহবেমীর, হেদায়াতুন্নাহু, কাফিয়া, শরহে বেকায়া, জালালাইন, মেশকাত, দাওরায়ে হাদিস, হিফজ"
            maxWidth="max-w-2xl"
          >
            <form onSubmit={saveJam} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>শ্রেণী / জামাতের নাম *</label>
                  <input
                    required
                    value={jamForm.name}
                    onChange={(e) => setJamForm({ ...jamForm, name: e.target.value })}
                    placeholder="যেমন: মিজান / হেদায়াতুন্নাহু"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>সংক্ষিপ্ত নাম (ঐচ্ছিক)</label>
                  <input
                    value={jamForm.short_name}
                    onChange={(e) => setJamForm({ ...jamForm, short_name: e.target.value })}
                    placeholder="যেমন: মিজান / হেদায়া"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>সংশ্লিষ্ট বিভাগ</label>
                  <select
                    value={jamForm.department_id}
                    onChange={(e) => setJamForm({ ...jamForm, department_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">-- বিভাগ নির্বাচন করুন (ঐচ্ছিক) --</option>
                    {departments
                      .filter((d) => d.status !== 'archived' || String(d.id) === jamForm.department_id)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>স্ট্যাটাস</label>
                  <select
                    value={jamForm.status}
                    onChange={(e) => setJamForm({ ...jamForm, status: e.target.value })}
                    className={inputClass}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>বিবরণ (ঐচ্ছিক)</label>
                <textarea
                  rows={2}
                  value={jamForm.description}
                  onChange={(e) => setJamForm({ ...jamForm, description: e.target.value })}
                  placeholder="শ্রেণী বা জামাতের সংক্ষিপ্ত বিবরণ..."
                  className={inputClass}
                />
              </div>

              {/* Multi-select Books for Jamaat */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className={labelClass + ' mb-0'}>
                    নির্ধারিত কিতাব / বইসমূহ (নির্বাচিত: {jamForm.book_ids.length} টি)
                  </label>
                  <input
                    value={jamBookSearch}
                    onChange={(e) => setJamBookSearch(e.target.value)}
                    placeholder="কিতাব খুঁজুন..."
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 w-48"
                  />
                </div>
                {books.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    কোনো কিতাব যুক্ত করা হয়নি। বাম মেনুর "কিতাব / বই এড" থেকে আগে কিতাব যোগ করুন।
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
                    {filterBooksByQuery(jamBookSearch, jamForm.book_ids).map((b) => {
                      const checked = jamForm.book_ids.includes(b.id);
                      return (
                        <label
                          key={b.id}
                          className={`flex items-start gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer border transition-colors ${
                            checked
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-[#047857] text-[#047857] dark:text-emerald-300 font-semibold'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleJamBook(b.id)}
                            className="accent-[#047857] mt-0.5"
                          />
                          <div className="min-w-0">
                            <div className="truncate">{b.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono-num">
                              {b.book_code}
                              {b.arabic_name ? ` · ${b.arabic_name}` : ''}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button type="button" onClick={() => setJamModalOpen(false)} className={secondaryBtnClass}>
                  বাতিল
                </button>
                <button type="submit" disabled={saving} className={primaryBtnClass}>
                  {saving ? 'সংরক্ষণ হচ্ছে...' : editingJamId ? 'হালনাগাদ করুন' : 'শ্রেণী / জামাত সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </Modal>

          {/* Class Modal (Tab 2: ক্লাস ম্যানেজমেন্ট) */}
          <Modal
            open={clsModalOpen}
            onClose={() => setClsModalOpen(false)}
            title={editingClsId ? 'ক্লাস ও কিতাব সম্পাদনা করুন' : 'নতুন ক্লাস যোগ করুন'}
            subtitle="বিভাগ ও শ্রেণী/জামাতের অধীনে ক্লাস তৈরি করুন এবং একাধিক পাঠ্য কিতাব / বই সংযুক্ত করুন"
            maxWidth="max-w-2xl"
          >
            <form onSubmit={saveCls} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>বিভাগ নির্বাচন *</label>
                  <select
                    required
                    value={clsForm.department_id}
                    onChange={(e) => setClsForm({ ...clsForm, department_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">-- বিভাগ নির্বাচন করুন --</option>
                    {departments
                      .filter((d) => d.status !== 'archived' || String(d.id) === clsForm.department_id)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>শ্রেণী / জামাত নির্বাচন</label>
                  <select
                    value={clsForm.jamaat_id}
                    onChange={(e) => {
                      const nextJid = e.target.value;
                      const jObj = jamaats.find((j) => String(j.id) === nextJid);
                      setClsForm((prev) => ({
                        ...prev,
                        jamaat_id: nextJid,
                        name: prev.name || (jObj ? jObj.name : ''),
                      }));
                    }}
                    className={inputClass}
                  >
                    <option value="">-- শ্রেণী / জামাত নির্বাচন করুন --</option>
                    {selectableJamaatsForCls.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name}
                        {j.short_name ? ` (${j.short_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>ক্লাসের নাম *</label>
                  <input
                    required
                    value={clsForm.name}
                    onChange={(e) => setClsForm({ ...clsForm, name: e.target.value })}
                    placeholder="যেমন: মিজান (শাখা-ক) / হিফজ-১"
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>ক্রম (Order)</label>
                    <input
                      type="number"
                      min="0"
                      value={clsForm.display_order}
                      onChange={(e) => setClsForm({ ...clsForm, display_order: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>স্ট্যাটাস</label>
                    <select
                      value={clsForm.status}
                      onChange={(e) => setClsForm({ ...clsForm, status: e.target.value })}
                      className={inputClass}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className={labelClass}>বিবরণ (ঐচ্ছিক)</label>
                <textarea
                  rows={2}
                  value={clsForm.description}
                  onChange={(e) => setClsForm({ ...clsForm, description: e.target.value })}
                  placeholder="ক্লাসের সংক্ষিপ্ত বিবরণ..."
                  className={inputClass}
                />
              </div>

              {/* Multi-select Books for Class */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className={labelClass + ' mb-0'}>
                    ক্লাসের পাঠ্য কিতাব / বইসমূহ (নির্বাচিত: {clsForm.book_ids.length} টি — একই বই একাধিক ক্লাসে যুক্ত করা যাবে)
                  </label>
                  <input
                    value={clsBookSearch}
                    onChange={(e) => setClsBookSearch(e.target.value)}
                    placeholder="কিতাব খুঁজুন..."
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 w-48"
                  />
                </div>
                {books.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    এখনো কোনো কিতাব তৈরি হয়নি। বাম মেনুর "কিতাব / বই এড" থেকে কিতাব যোগ করুন।
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
                    {filterBooksByQuery(clsBookSearch, clsForm.book_ids).map((b) => {
                      const checked = clsForm.book_ids.includes(b.id);
                      return (
                        <label
                          key={b.id}
                          className={`flex items-start gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer border transition-colors ${
                            checked
                              ? 'bg-violet-50 dark:bg-violet-950/40 border-[#6D28D9] text-[#6D28D9] dark:text-violet-300 font-semibold'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleClsBook(b.id)}
                            className="accent-[#6D28D9] mt-0.5"
                          />
                          <div className="min-w-0">
                            <div className="truncate">{b.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono-num">
                              {b.book_code}
                              {b.arabic_name ? ` · ${b.arabic_name}` : ''}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                {clsForm.book_ids.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={clsForm.sync_books_to_subjects}
                      onChange={(e) => setClsForm({ ...clsForm, sync_books_to_subjects: e.target.checked })}
                      className="accent-[#047857]"
                    />
                    নির্বাচিত কিতাবগুলো স্বয়ংক্রিয়ভাবে এই ক্লাসের পরীক্ষার বিষয় (Subjects) ও রুটিনে যুক্ত করুন
                  </label>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button type="button" onClick={() => setClsModalOpen(false)} className={secondaryBtnClass}>
                  বাতিল
                </button>
                <button type="submit" disabled={saving} className={primaryBtnClass}>
                  {saving ? 'সংরক্ষণ হচ্ছে...' : editingClsId ? 'হালনাগাদ করুন' : 'ক্লাস সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </Modal>
        </>
      )}
    </div>
  );
}

function FilterToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  statusFilter,
  onStatusChange,
  extra,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  statusFilter: 'all' | 'active' | 'inactive' | 'archived';
  onStatusChange: (v: 'all' | 'active' | 'inactive' | 'archived') => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
      <div className="relative flex-1 max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/40"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value as any)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
        >
          <option value="all">সকল স্ট্যাটাস</option>
          <option value="active">সক্রিয়</option>
          <option value="inactive">নিষ্ক্রিয়</option>
          <option value="archived">আর্কাইভড</option>
        </select>
      </div>
    </div>
  );
}
