import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { apiFetch, formatBDT, formatDateDMY, getTodayDhakaYMD } from '../../../lib/api';
import { useApp } from '../../../context/AppContext';
import {
  EmptyState,
  PageHeader,
  StatusText,
  emeraldBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  tableHeadClass,
} from '../../../components/ui/Primitives';

export function HostelModule() {
  const { toast } = useApp();
  const [tab, setTab] = useState<'rooms' | 'allocations' | 'attendance' | 'meals'>('rooms');
  const [data, setData] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);

  const [unitForm, setUnitForm] = useState({ name: '', supervisor_name: '', capacity: '40' });
  const [roomForm, setRoomForm] = useState({ unit_id: '', room_number: '', total_beds: '6', monthly_fee: '1500' });
  const [allocForm, setAllocForm] = useState({ student_id: '', room_id: '', bed_number: '', start_date: getTodayDhakaYMD(), note: '' });
  const [mealForm, setMealForm] = useState({
    meal_date: getTodayDhakaYMD(),
    breakfast: 'রুটি ও ডাল',
    lunch: 'ভাত, মাছ ও সবজি',
    dinner: 'ভাত ও ডিম/মাংস',
    total_students: '0',
    cost: '0',
  });
  const [attRows, setAttRows] = useState<any[]>([]);

  const loadAll = useCallback(async () => {
    const [hRes, sRes] = await Promise.all([
      apiFetch('/api/inst/hostel/overview'),
      apiFetch('/api/inst/hostel/students'),
    ]);
    setData(hRes);
    setStudents(sRes.students || []);
    setAttRows((hRes.attendance || []).map((a: any) => ({ ...a, status: a.status || 'present', note: a.note || '' })));
  }, []);

  useEffect(() => {
    loadAll().catch((err: any) => toast('error', 'দারুল ইকামা লোড ব্যর্থ', err.message));
  }, [loadAll, toast]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="দারুল একামা (আবাসিক ছাত্রাবাস ব্যবস্থাপনা)"
        subtitle="ভবন/ইউনিট, কক্ষ ও সিট বরাদ্দ (কেন্দ্রীয় শিক্ষার্থী রেকর্ড থেকে), কক্ষ পরিবর্তন, আবাসিক হাজিরা ও খাবার ব্যবস্থাপনা"
      />

      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit flex-wrap">
        {[
          { id: 'rooms', label: `ভবন ও কক্ষ (${data?.rooms?.length || 0})` },
          { id: 'allocations', label: `সিট বরাদ্দ ও স্থানান্তর (${data?.allocations?.length || 0})` },
          { id: 'attendance', label: 'আবাসিক হাজিরা' },
          { id: 'meals', label: 'খাবার ও মেস ব্যবস্থাপনা' },
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

      {data && tab === 'rooms' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-5">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/inst/hostel/units', { method: 'POST', body: { ...unitForm, capacity: Number(unitForm.capacity) } });
                setUnitForm({ name: '', supervisor_name: '', capacity: '40' });
                toast('success', 'আবাসিক ভবন/ইউনিট যুক্ত হয়েছে');
                loadAll();
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
            >
              <h3 className="text-sm font-semibold">নতুন আবাসিক ভবন / ইউনিট</h3>
              <input required value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} placeholder="যেমন: দারুল ইকামা ভবন-১" className={inputClass} />
              <div className="grid grid-cols-2 gap-3">
                <input value={unitForm.supervisor_name} onChange={(e) => setUnitForm({ ...unitForm, supervisor_name: e.target.value })} placeholder="তত্ত্বাবধায়কের নাম" className={inputClass} />
                <input type="number" value={unitForm.capacity} onChange={(e) => setUnitForm({ ...unitForm, capacity: e.target.value })} placeholder="ধারণক্ষমতা" className={inputClass} />
              </div>
              <button type="submit" className={emeraldBtnClass}><Plus className="w-4 h-4" /> ভবন যুক্ত করুন</button>
            </form>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/inst/hostel/rooms', {
                  method: 'POST',
                  body: {
                    unit_id: Number(roomForm.unit_id),
                    room_number: roomForm.room_number,
                    total_beds: Number(roomForm.total_beds),
                    monthly_fee: Number(roomForm.monthly_fee),
                  },
                });
                setRoomForm({ ...roomForm, room_number: '' });
                toast('success', 'নতুন কক্ষ যুক্ত হয়েছে');
                loadAll();
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
            >
              <h3 className="text-sm font-semibold">নতুন কক্ষ ও সিট যুক্ত করুন</h3>
              <select required value={roomForm.unit_id} onChange={(e) => setRoomForm({ ...roomForm, unit_id: e.target.value })} className={inputClass}>
                <option value="">-- ভবন নির্বাচন --</option>
                {data.units.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <input required value={roomForm.room_number} onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })} placeholder="কক্ষ নং" className={inputClass} />
                <input type="number" min={1} value={roomForm.total_beds} onChange={(e) => setRoomForm({ ...roomForm, total_beds: e.target.value })} placeholder="মোট সিট" className={inputClass} />
                <input type="number" min={0} value={roomForm.monthly_fee} onChange={(e) => setRoomForm({ ...roomForm, monthly_fee: e.target.value })} placeholder="মাসিক ফি" className={inputClass} />
              </div>
              <button type="submit" className={primaryBtnClass}><Plus className="w-4 h-4" /> কক্ষ যুক্ত করুন</button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden h-fit">
            <table className="w-full text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-5 py-3">ভবন ও কক্ষ</th>
                  <th className="px-4 py-3 text-right">বরাদ্দ / মোট সিট</th>
                  <th className="px-5 py-3 text-right">মাসিক ফি</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.rooms.length === 0 ? (
                  <tr><td colSpan={3} className="px-5 py-8 text-center text-xs text-slate-500">কোনো কক্ষ তৈরি হয়নি।</td></tr>
                ) : (
                  data.rooms.map((r: any) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3">
                        <div className="font-semibold">কক্ষ {r.room_number}</div>
                        <div className="text-xs text-slate-500">{r.unit_name}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num text-xs">
                        <span className={r.occupied_beds >= r.total_beds ? 'text-red-600 font-bold' : 'text-[#047857] font-bold'}>
                          {r.occupied_beds}
                        </span> / {r.total_beds}
                      </td>
                      <td className="px-5 py-3 text-right font-mono-num">{formatBDT(r.monthly_fee)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && tab === 'allocations' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch('/api/inst/hostel/allocations', {
                  method: 'POST',
                  body: {
                    student_id: Number(allocForm.student_id),
                    room_id: Number(allocForm.room_id),
                    bed_number: allocForm.bed_number,
                    start_date: allocForm.start_date,
                    note: allocForm.note,
                  },
                });
                toast('success', 'শিক্ষার্থীকে আবাসিক সিট বরাদ্দ/স্থানান্তর করা হয়েছে');
                setAllocForm({ student_id: '', room_id: '', bed_number: '', start_date: getTodayDhakaYMD(), note: '' });
                loadAll();
              } catch (err: any) {
                toast('error', 'বরাদ্দ ব্যর্থ', err.message);
              }
            }}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5 h-fit"
          >
            <h3 className="text-sm font-semibold">সিট বরাদ্দ বা কক্ষ পরিবর্তন</h3>
            <p className="text-xs text-slate-500">বিদ্যমান আবাসিক শিক্ষার্থীকে নতুন কক্ষে বরাদ্দ দিলে পূর্বের কক্ষ স্বয়ংক্রিয়ভাবে স্থানান্তর (Transferred) হবে।</p>
            <div>
              <label className={labelClass}>শিক্ষার্থী (কেন্দ্রীয় তালিকা থেকে) *</label>
              <select required value={allocForm.student_id} onChange={(e) => setAllocForm({ ...allocForm, student_id: e.target.value })} className={inputClass}>
                <option value="">-- শিক্ষার্থী নির্বাচন --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.roll_number} — {s.full_name} ({s.class_name})</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>কক্ষ নির্বাচন *</label>
              <select required value={allocForm.room_id} onChange={(e) => setAllocForm({ ...allocForm, room_id: e.target.value })} className={inputClass}>
                <option value="">-- কক্ষ --</option>
                {data.rooms.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.unit_name} — কক্ষ {r.room_number} (খালি: {r.total_beds - r.occupied_beds})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>সিট নম্বর</label>
                <input value={allocForm.bed_number} onChange={(e) => setAllocForm({ ...allocForm, bed_number: e.target.value })} placeholder="যেমন: সিট-০১" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>শুরুর তারিখ</label>
                <input type="date" value={allocForm.start_date} onChange={(e) => setAllocForm({ ...allocForm, start_date: e.target.value })} className={inputClass} />
              </div>
            </div>
            <button type="submit" className={emeraldBtnClass}>বরাদ্দ / স্থানান্তর করুন</button>
          </form>

          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-4 py-3">শিক্ষার্থী</th>
                  <th className="px-4 py-3">ভবন, কক্ষ ও সিট</th>
                  <th className="px-4 py-3">অবস্থা</th>
                  <th className="px-4 py-3 text-right">কার্যক্রম</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.allocations.map((a: any) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{a.student_name}</div>
                      <div className="text-xs font-mono-num text-slate-500">রোল: {a.roll_number} · {a.class_name}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium">{a.unit_name} · কক্ষ {a.room_number}</div>
                      <div className="text-slate-500">{a.bed_number} · শুরু {formatDateDMY(a.start_date)}</div>
                    </td>
                    <td className="px-4 py-3"><StatusText status={a.status} /></td>
                    <td className="px-4 py-3 text-right">
                      {a.status === 'active' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/inst/hostel/allocations/${a.id}/vacate`, { method: 'PATCH' });
                            toast('info', 'সিট খালি করা হয়েছে');
                            loadAll();
                          }}
                          className="text-xs font-medium text-red-600 hover:underline cursor-pointer"
                        >
                          সিট ত্যাগ
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && tab === 'attendance' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">আজকের তারিখ: <span className="font-mono-num">{formatDateDMY(data.today)}</span></div>
            <button
              type="button"
              onClick={async () => {
                await apiFetch('/api/inst/hostel/attendance', {
                  method: 'POST',
                  body: { date: data.today, entries: attRows },
                });
                toast('success', 'আবাসিক হাজিরা সংরক্ষিত হয়েছে');
              }}
              className={emeraldBtnClass}
            >
              <Save className="w-4 h-4" /> হাজিরা সংরক্ষণ করুন
            </button>
          </div>
          {attRows.length === 0 ? (
            <EmptyState title="কোনো আবাসিক শিক্ষার্থী বরাদ্দ নেই" />
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="px-5 py-3">রোল ও শিক্ষার্থী</th>
                    <th className="px-4 py-3">ভবন ও কক্ষ</th>
                    <th className="px-5 py-3">উপস্থিতি</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {attRows.map((r, idx) => (
                    <tr key={r.student_id}>
                      <td className="px-5 py-3 font-medium">{r.roll_number} — {r.full_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{r.unit_name} · কক্ষ {r.room_number}</td>
                      <td className="px-5 py-3">
                        <select
                          value={r.status}
                          onChange={(e) => {
                            const next = [...attRows];
                            next[idx] = { ...r, status: e.target.value };
                            setAttRows(next);
                          }}
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          <option value="present">উপস্থিত</option>
                          <option value="absent">অনুপস্থিত</option>
                          <option value="leave">ছুটি</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {data && tab === 'meals' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiFetch('/api/inst/hostel/meals', {
                method: 'POST',
                body: { ...mealForm, total_students: Number(mealForm.total_students), cost: Number(mealForm.cost) },
              });
              toast('success', 'খাবার ও মেস রেকর্ড সংরক্ষিত হয়েছে');
              loadAll();
            }}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
          >
            <h3 className="text-sm font-semibold">দৈনিক খাবার ও খরচ এন্ট্রি</h3>
            <div>
              <label className={labelClass}>তারিখ</label>
              <input type="date" value={mealForm.meal_date} onChange={(e) => setMealForm({ ...mealForm, meal_date: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>সকালের নাস্তা</label>
              <input value={mealForm.breakfast} onChange={(e) => setMealForm({ ...mealForm, breakfast: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>দুপুরের খাবার</label>
              <input value={mealForm.lunch} onChange={(e) => setMealForm({ ...mealForm, lunch: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>রাতের খাবার</label>
              <input value={mealForm.dinner} onChange={(e) => setMealForm({ ...mealForm, dinner: e.target.value })} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>ছাত্র সংখ্যা</label>
                <input type="number" value={mealForm.total_students} onChange={(e) => setMealForm({ ...mealForm, total_students: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>মোট খরচ (৳)</label>
                <input type="number" value={mealForm.cost} onChange={(e) => setMealForm({ ...mealForm, cost: e.target.value })} className={`${inputClass} font-mono-num`} />
              </div>
            </div>
            <button type="submit" className={primaryBtnClass}>সংরক্ষণ করুন</button>
          </form>

          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-4 py-3">তারিখ</th>
                  <th className="px-4 py-3">খাবার তালিকা</th>
                  <th className="px-4 py-3 text-right">ছাত্র</th>
                  <th className="px-4 py-3 text-right">খরচ (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.meals.map((m: any) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 font-mono-num text-xs">{formatDateDMY(m.meal_date)}</td>
                    <td className="px-4 py-3 text-xs">সকাল: {m.breakfast} · দুপুর: {m.lunch} · রাত: {m.dinner}</td>
                    <td className="px-4 py-3 text-right font-mono-num">{m.total_students}</td>
                    <td className="px-4 py-3 text-right font-mono-num font-semibold">{formatBDT(m.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function LibraryModule() {
  const { toast } = useApp();
  const [tab, setTab] = useState<'books' | 'issues'>('books');
  const [books, setBooks] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  const [bookForm, setBookForm] = useState({
    book_code: '',
    title: '',
    category: 'হাদিস ও ফিকহ',
    author: '',
    publisher: '',
    quantity: '5',
    shelf_location: '',
  });
  const [issueForm, setIssueForm] = useState({
    book_id: '',
    borrower_type: 'student',
    borrower_id: '',
    issue_date: getTodayDhakaYMD(),
    due_date: '',
  });

  const loadAll = useCallback(async () => {
    const lRes = await apiFetch('/api/inst/library/overview');
    setBooks(lRes.books || []);
    setIssues(lRes.issues || []);
    setStudents(lRes.students || []);
    setTeachers(lRes.teachers || []);
  }, []);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="মাকতাবা / লাইব্রেরি ব্যবস্থাপনা"
        subtitle="কিতাব সংরক্ষণ, কপি সংখ্যা, শিক্ষার্থী ও শিক্ষকদের কিতাব ইস্যু এবং ফেরত ব্যবস্থাপনা"
      />

      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setTab('books')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${tab === 'books' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
        >
          কিতাব তালিকা ({books.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('issues')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${tab === 'issues' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
        >
          ইস্যু ও ফেরত ({issues.length})
        </button>
      </div>

      {tab === 'books' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch('/api/inst/library/books', {
                  method: 'POST',
                  body: { ...bookForm, quantity: Number(bookForm.quantity || 1) },
                });
                setBookForm({ book_code: '', title: '', category: 'হাদিস ও ফিকহ', author: '', publisher: '', quantity: '5', shelf_location: '' });
                toast('success', 'নতুন কিতাব লাইব্রেরিতে যুক্ত হয়েছে');
                loadAll();
              } catch (err: any) {
                toast('error', 'ব্যর্থ', err.message);
              }
            }}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 h-fit"
          >
            <h3 className="text-sm font-semibold">নতুন কিতাব যুক্ত করুন</h3>
            <div>
              <label className={labelClass}>কিতাবের নাম *</label>
              <input required value={bookForm.title} onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>বুক আইডি</label>
                <input value={bookForm.book_code} onChange={(e) => setBookForm({ ...bookForm, book_code: e.target.value })} placeholder="স্বয়ংক্রিয়" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>ক্যাটাগরি</label>
                <input value={bookForm.category} onChange={(e) => setBookForm({ ...bookForm, category: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>লেখক</label>
                <input value={bookForm.author} onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>প্রকাশনী</label>
                <input value={bookForm.publisher} onChange={(e) => setBookForm({ ...bookForm, publisher: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>মোট কপি *</label>
                <input type="number" min={1} value={bookForm.quantity} onChange={(e) => setBookForm({ ...bookForm, quantity: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>আলমারি / তাক</label>
                <input value={bookForm.shelf_location} onChange={(e) => setBookForm({ ...bookForm, shelf_location: e.target.value })} className={inputClass} />
              </div>
            </div>
            <button type="submit" className={emeraldBtnClass}><BookOpen className="w-4 h-4" /> কিতাব যুক্ত করুন</button>
          </form>

          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-4 py-3">কিতাব ও আইডি</th>
                  <th className="px-4 py-3">লেখক / প্রকাশনী</th>
                  <th className="px-4 py-3 text-right">উপলব্ধ / মোট</th>
                  <th className="px-4 py-3 text-right">মুছুন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {books.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{b.title}</div>
                      <div className="text-xs font-mono-num text-slate-500">{b.book_code} · {b.category}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {b.author || '—'}{b.publisher ? ` · ${b.publisher}` : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num text-xs">
                      <strong className={b.available_copies > 0 ? 'text-[#047857]' : 'text-red-600'}>{b.available_copies}</strong> / {b.quantity}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/inst/library/books/${b.id}`, { method: 'DELETE' });
                          loadAll();
                        }}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
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

      {tab === 'issues' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch('/api/inst/library/issues', {
                  method: 'POST',
                  body: {
                    ...issueForm,
                    book_id: Number(issueForm.book_id),
                    borrower_id: Number(issueForm.borrower_id),
                  },
                });
                toast('success', 'কিতাব ইস্যু করা হয়েছে');
                setIssueForm({ ...issueForm, book_id: '', borrower_id: '' });
                loadAll();
              } catch (err: any) {
                toast('error', 'ইস্যু ব্যর্থ', err.message);
              }
            }}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3.5 h-fit"
          >
            <h3 className="text-sm font-semibold">কিতাব ইস্যু করুন</h3>
            <div>
              <label className={labelClass}>কিতাব নির্বাচন *</label>
              <select required value={issueForm.book_id} onChange={(e) => setIssueForm({ ...issueForm, book_id: e.target.value })} className={inputClass}>
                <option value="">-- কিতাব --</option>
                {books.filter((b) => b.available_copies > 0).map((b) => (
                  <option key={b.id} value={b.id}>{b.title} (উপলব্ধ: {b.available_copies})</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>গ্রহীতার ধরন</label>
              <select value={issueForm.borrower_type} onChange={(e) => setIssueForm({ ...issueForm, borrower_type: e.target.value, borrower_id: '' })} className={inputClass}>
                <option value="student">শিক্ষার্থী</option>
                <option value="teacher">শিক্ষক</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{issueForm.borrower_type === 'student' ? 'শিক্ষার্থী নির্বাচন *' : 'শিক্ষক নির্বাচন *'}</label>
              <select required value={issueForm.borrower_id} onChange={(e) => setIssueForm({ ...issueForm, borrower_id: e.target.value })} className={inputClass}>
                <option value="">-- নির্বাচন করুন --</option>
                {issueForm.borrower_type === 'student'
                  ? students.map((s) => <option key={s.id} value={s.id}>{s.roll_number} — {s.full_name}</option>)
                  : teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>ইস্যু তারিখ</label>
                <input type="date" value={issueForm.issue_date} onChange={(e) => setIssueForm({ ...issueForm, issue_date: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>ফেরতের শেষ তারিখ *</label>
                <input type="date" required value={issueForm.due_date} onChange={(e) => setIssueForm({ ...issueForm, due_date: e.target.value })} className={inputClass} />
              </div>
            </div>
            <button type="submit" className={primaryBtnClass}>ইস্যু নিশ্চিত করুন</button>
          </form>

          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-4 py-3">কিতাব</th>
                  <th className="px-4 py-3">গ্রহীতা</th>
                  <th className="px-4 py-3">ইস্যু / ফেরতের তারিখ</th>
                  <th className="px-4 py-3">অবস্থা</th>
                  <th className="px-4 py-3 text-right">কার্যক্রম</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {issues.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{i.book_title}</div>
                      <div className="text-xs font-mono-num text-slate-500">{i.book_code}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{i.borrower_name}</td>
                    <td className="px-4 py-3 font-mono-num text-xs text-slate-500">
                      {formatDateDMY(i.issue_date)} → {formatDateDMY(i.due_date)}
                    </td>
                    <td className="px-4 py-3"><StatusText status={i.status} /></td>
                    <td className="px-4 py-3 text-right">
                      {i.status !== 'returned' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/inst/library/issues/${i.id}/return`, { method: 'PATCH', body: {} });
                            toast('success', 'কিতাব ফেরত নেওয়া হয়েছে');
                            loadAll();
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#047857] hover:underline cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> ফেরত নিন
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
