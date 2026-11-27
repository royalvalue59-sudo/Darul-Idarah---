import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'darul_idarah.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export function getDhakaNowISO(): string {
  return new Date().toISOString();
}

export function getDhakaDateYMD(date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date); // YYYY-MM-DD
}

export const BENGALI_WEEKDAYS = [
  'শনিবার',
  'রবিবার',
  'সোমবার',
  'মঙ্গলবার',
  'বুধবার',
  'বৃহস্পতিবার',
  'শুক্রবার',
] as const;

export const DAILY_DAY_OPTION = 'ডেইলি (প্রতিদিন)' as const;

export const ROUTINE_DAY_OPTIONS = [DAILY_DAY_OPTION, ...BENGALI_WEEKDAYS] as const;

// Dedicated separate finance categories for Teacher & Student Monthly Payable vs Meal Cost
export const FIN_CAT_STUDENT_FEE = 'শিক্ষার্থীদের মাসিক বেতন/ফি';
export const FIN_CAT_STUDENT_MEAL = 'শিক্ষার্থীদের খাবার খরচ';
export const FIN_CAT_TEACHER_SALARY = 'শিক্ষকদের মাসিক বেতন';
export const FIN_CAT_TEACHER_MEAL = 'শিক্ষকদের খাবার খরচ';

export function generateUniqueTxCode(instId: number, prefix = 'TXN'): string {
  db.prepare('UPDATE institutions SET tx_counter = COALESCE(tx_counter, 0) + 1 WHERE id = ?').run(instId);
  const row = db.prepare('SELECT tx_counter FROM institutions WHERE id = ?').get(instId) as
    | { tx_counter: number }
    | undefined;
  const seq = Number(row?.tx_counter || 1);
  return `${prefix}-${instId}-${String(seq).padStart(6, '0')}`;
}

export const AUDIT_CATEGORIES: Array<{
  code: string;
  name_bn: string;
  name_en: string;
  module: string;
  description: string;
}> = [
  { code: 'account', name_bn: 'অ্যাকাউন্ট ও নিরাপত্তা', name_en: 'Account Activities', module: 'account', description: 'লগইন, লগআউট, ব্যর্থ লগইন, পাসওয়ার্ড রিসেট এবং অ্যাকাউন্ট পরিবর্তন' },
  { code: 'student', name_bn: 'শিক্ষার্থী কার্যক্রম', name_en: 'Student Activities', module: 'student', description: 'শিক্ষার্থী ভর্তি, প্রোফাইল আপডেট, তথ্য পরিবর্তন ও আর্কাইভ' },
  { code: 'teacher', name_bn: 'শিক্ষক কার্যক্রম', name_en: 'Teacher Activities', module: 'teacher', description: 'শিক্ষক নিয়োগ, প্রোফাইল আপডেট, বেতন, অতিরিক্ত উত্তোলন ও বকেয়া সমন্বয়' },
  { code: 'academic', name_bn: 'একাডেমিক কার্যক্রম', name_en: 'Academic Activities', module: 'academic', description: 'বিভাগ, শ্রেণী, জামাত, কিতাব/বই, বিষয় ও ক্লাস রুটিন ব্যবস্থাপনা' },
  { code: 'examination', name_bn: 'পরীক্ষা ও ফলাফল', name_en: 'Examination Activities', module: 'examination', description: 'পরীক্ষা তৈরি, ফলাফল প্রকাশ, হালনাগাদ ও আর্কাইভ' },
  { code: 'finance', name_bn: 'হিসাব ও অর্থব্যবস্থা', name_en: 'Finance Activities', module: 'finance', description: 'শিক্ষার্থী ফি, আয়-ব্যয় এন্ট্রি, রসিদ তৈরি ও লেনদেন ব্যবস্থাপনা' },
  { code: 'administration', name_bn: 'প্রশাসন ও সেটিংস', name_en: 'Administration Activities', module: 'administration', description: 'রোল ও পারমিশন, ছুটি অনুমোদন/প্রত্যাখ্যান, নোটিশ, ব্র্যান্ডিং ও সেটিংস' },
];

export function normalizeWhatsAppNumber(raw: unknown): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  return digits.slice(0, 15);
}

export function buildWhatsAppUrl(raw: unknown): string {
  const digits = normalizeWhatsAppNumber(raw);
  if (digits.length < 7) return '';
  return `https://wa.me/${digits}`;
}

export function validateFacebookUrl(raw: unknown): { ok: true; url: string } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, url: '' };
  const trimmed = String(raw).trim();
  if (!trimmed) return { ok: true, url: '' };
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, error: 'শুধুমাত্র বৈধ HTTP/HTTPS ফেসবুক লিংক অনুমোদিত।' };
    }
    const host = parsed.hostname.toLowerCase();
    const allowedHosts = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'www.fb.com', 'fb.me', 'www.fb.me'];
    if (!allowedHosts.includes(host)) {
      return { ok: false, error: 'অনুগ্রহ করে বৈধ Facebook Page URL (facebook.com বা fb.com) প্রদান করুন।' };
    }
    parsed.protocol = 'https:';
    return { ok: true, url: parsed.toString() };
  } catch {
    return { ok: false, error: 'ফেসবুক পেজ লিংকটি সঠিক নয়।' };
  }
}

export function sanitizeBrandLogoDataUrl(raw: unknown): { ok: true; dataUrl: string; mime: string } | { ok: false; error: string } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, error: 'লোগো ফাইল প্রদান করুন।' };
  }
  const trimmed = raw.trim();

  // Support disk-backed global uploads (/api/uploads/<uuid>) up to 20 MB
  if (/^\/api\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    const fileId = trimmed.split('/').pop() || '';
    const fileRow = db
      .prepare('SELECT mime_type, size_bytes FROM uploaded_files WHERE id = ?')
      .get(fileId) as { mime_type: string; size_bytes: number } | undefined;
    if (!fileRow) {
      return { ok: false, error: 'আপলোডকৃত লোগো ফাইলটি খুঁজে পাওয়া যায়নি।' };
    }
    if (fileRow.size_bytes > 20 * 1024 * 1024) {
      return { ok: false, error: 'ফাইলের সর্বোচ্চ সাইজ ২০ MB হতে পারবে। অনুগ্রহ করে ছোট ফাইল নির্বাচন করুন।' };
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(fileRow.mime_type)) {
      return { ok: false, error: 'শুধুমাত্র PNG, JPG, WEBP অথবা SVG ফরম্যাটের লোগো অনুমোদিত।' };
    }
    return { ok: true, dataUrl: trimmed, mime: fileRow.mime_type };
  }

  const maxBase64Chars = Math.ceil((20 * 1024 * 1024 * 4) / 3) + 256;
  if (trimmed.length > maxBase64Chars) {
    return { ok: false, error: 'ফাইলের সর্বোচ্চ সাইজ ২০ MB হতে পারবে। অনুগ্রহ করে ছোট ফাইল নির্বাচন করুন।' };
  }

  const rasterMatch = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(trimmed);
  if (rasterMatch) {
    const decodedBytes = Buffer.byteLength(rasterMatch[2], 'base64');
    if (decodedBytes > 20 * 1024 * 1024) {
      return { ok: false, error: 'ফাইলের সর্বোচ্চ সাইজ ২০ MB হতে পারবে। অনুগ্রহ করে ছোট ফাইল নির্বাচন করুন।' };
    }
    const mime = rasterMatch[1] === 'image/jpg' ? 'image/jpeg' : rasterMatch[1];
    return { ok: true, dataUrl: `data:${mime};base64,${rasterMatch[2]}`, mime };
  }

  const svgMatch = /^data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)$/.exec(trimmed);
  if (svgMatch) {
    try {
      const rawBuf = Buffer.from(svgMatch[1], 'base64');
      if (rawBuf.length > 20 * 1024 * 1024) {
        return { ok: false, error: 'ফাইলের সর্বোচ্চ সাইজ ২০ MB হতে পারবে। অনুগ্রহ করে ছোট ফাইল নির্বাচন করুন।' };
      }
      const decoded = rawBuf.toString('utf8').trim();
      if (!/<svg[\s>]/i.test(decoded) || !/<\/svg>/i.test(decoded)) {
        return { ok: false, error: 'SVG ফাইলটি সঠিক নয়।' };
      }
      // Strictly reject active content/script vectors inside uploaded SVG
      const dangerousPattern = /<script\b|<iframe\b|<object\b|<embed\b|<foreignObject\b|\bon[a-z]+\s*=|javascript:|vbscript:|data:text\/html/i;
      if (dangerousPattern.test(decoded)) {
        return { ok: false, error: 'নিরাপত্তার কারণে এই SVG ফাইলটি গ্রহণযোগ্য নয় (স্ক্রিপ্ট বা অরক্ষিত ট্যাগ সনাক্ত হয়েছে)।' };
      }
      const cleanBase64 = Buffer.from(decoded, 'utf8').toString('base64');
      return { ok: true, dataUrl: `data:image/svg+xml;base64,${cleanBase64}`, mime: 'image/svg+xml' };
    } catch {
      return { ok: false, error: 'SVG ফাইল ডিকোড করা যায়নি।' };
    }
  }

  return { ok: false, error: 'শুধুমাত্র PNG, JPG, WEBP অথবা SVG ফরম্যাটের লোগো অনুমোদিত।' };
}

export function isDailyDayValue(val: unknown): boolean {
  const s = String(val || '').trim().toLowerCase();
  return s === 'daily' || s === 'everyday' || s === 'ডেইলি' || s === 'প্রতিদিন' || s === DAILY_DAY_OPTION.toLowerCase();
}

export function normalizeScheduleDay(
  val: unknown
): { ok: true; day_of_week: string; is_daily: 0 | 1 } | { ok: false } {
  const raw = String(val || '').trim();
  if (!raw) return { ok: false };
  if (isDailyDayValue(raw)) {
    return { ok: true, day_of_week: DAILY_DAY_OPTION, is_daily: 1 };
  }
  if ((BENGALI_WEEKDAYS as readonly string[]).includes(raw)) {
    return { ok: true, day_of_week: raw, is_daily: 0 };
  }
  return { ok: false };
}

export function dayOrderSql(col = 'day_of_week'): string {
  return `CASE ${col}
    WHEN '${DAILY_DAY_OPTION}' THEN 0
    WHEN 'শনিবার' THEN 1
    WHEN 'রবিবার' THEN 2
    WHEN 'সোমবার' THEN 3
    WHEN 'মঙ্গলবার' THEN 4
    WHEN 'বুধবার' THEN 5
    WHEN 'বৃহস্পতিবার' THEN 6
    WHEN 'শুক্রবার' THEN 7
    ELSE 8 END`;
}

export function getDhakaTimeHM(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${hour === '24' ? '00' : hour}:${minute}`;
}

export function getDhakaBengaliWeekday(date = new Date()): string {
  const eng = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'short',
  }).format(date);
  const map: Record<string, string> = {
    Sat: 'শনিবার',
    Sun: 'রবিবার',
    Mon: 'সোমবার',
    Tue: 'মঙ্গলবার',
    Wed: 'বুধবার',
    Thu: 'বৃহস্পতিবার',
    Fri: 'শুক্রবার',
  };
  return map[eng] || 'শনিবার';
}

export function getDhakaBengaliWeekdayFromYMD(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || '').trim())) {
    return getDhakaBengaliWeekday();
  }
  // Noon UTC avoids any timezone date-boundary drift for Asia/Dhaka (+06:00)
  const d = new Date(`${ymd.trim()}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return getDhakaBengaliWeekday();
  return getDhakaBengaliWeekday(d);
}

export const DEFAULT_GRADING_SCALE = [
  { min: 80, max: 100, grade: 'মুমতাজ (A+)', gpa: 5.0 },
  { min: 70, max: 79.99, grade: 'জায়্যিদ জিদ্দান (A)', gpa: 4.0 },
  { min: 60, max: 69.99, grade: 'জায়্যিদ (A-)', gpa: 3.5 },
  { min: 50, max: 59.99, grade: 'মাকবুল (B)', gpa: 3.0 },
  { min: 40, max: 49.99, grade: 'মাকবুল (C)', gpa: 2.0 },
  { min: 33, max: 39.99, grade: 'মাকবুল (D)', gpa: 1.0 },
  { min: 0, max: 32.99, grade: 'রাসিব (F)', gpa: 0.0 },
];

export const DEFAULT_ADMISSION_FIELDS = {
  student_photo: { enabled: true, required: false },
  father_name: { enabled: true, required: true },
  mother_name: { enabled: true, required: false },
  guardian_name: { enabled: true, required: true },
  guardian_mobile: { enabled: true, required: true },
  student_mobile: { enabled: true, required: false },
  dob: { enabled: true, required: false },
  blood_group: { enabled: true, required: false },
  address: { enabled: true, required: false },
  previous_institution: { enabled: true, required: false },
  additional_info: { enabled: true, required: false },
};

export const INITIAL_DESIGNATIONS: Array<{ name: string; category: 'administrative' | 'academic' | 'other' }> = [
  // Administrative
  { name: 'মুহতামিম', category: 'administrative' },
  { name: 'নায়েবে মুহতামিম', category: 'administrative' },
  { name: 'নাজেমে তালিমাত', category: 'administrative' },
  { name: 'নাজেমে ইমতিহানাত', category: 'administrative' },
  { name: 'নাজেমে দারুল ইকামা', category: 'administrative' },
  { name: 'নাজেমে মালিয়া', category: 'administrative' },
  { name: 'মুহাসিব', category: 'administrative' },
  { name: 'অফিস সুপার', category: 'administrative' },
  { name: 'অফিস সহকারী', category: 'administrative' },
  // Academic
  { name: 'শাইখুল হাদিস', category: 'academic' },
  { name: 'সদরুল মুদাররিসীন', category: 'academic' },
  { name: 'মুদাররিস', category: 'academic' },
  { name: 'মুয়াল্লিম', category: 'academic' },
  { name: 'কারী', category: 'academic' },
  { name: 'হিফজ শিক্ষক', category: 'academic' },
  { name: 'তাজবিদ শিক্ষক', category: 'academic' },
  { name: 'আরবি শিক্ষক', category: 'academic' },
  // Other Staff
  { name: 'লাইব্রেরিয়ান', category: 'other' },
  { name: 'ইমাম', category: 'other' },
  { name: 'খতিব', category: 'other' },
  { name: 'মুয়াজ্জিন', category: 'other' },
  { name: 'আবাসিক তত্ত্বাবধায়ক', category: 'other' },
  { name: 'বাবুর্চি', category: 'other' },
  { name: 'নিরাপত্তাকর্মী', category: 'other' },
  { name: 'পরিচ্ছন্নতা কর্মী', category: 'other' },
  { name: 'কম্পিউটার অপারেটর', category: 'other' },
];

export const DEFAULT_JAMAAT_NAMES: Array<{ name: string; short_name: string; description: string }> = [
  { name: 'মিজান', short_name: 'মিজান', description: 'সরফ ও নাহুর প্রাথমিক জামাত' },
  { name: 'নাহবেমীর', short_name: 'নাহু', description: 'নাহু ও আরবি ব্যাকরণ জামাত' },
  { name: 'হেদায়াতুন্নাহু', short_name: 'হেদায়া-নাহু', description: 'উচ্চতর নাহু ও সাহিত্য জামাত' },
  { name: 'কাফিয়া', short_name: 'কাফিয়া', description: 'কাফিয়া ও ফিকহ জামাত' },
  { name: 'শরহে বেকায়া', short_name: 'শ. বেকায়া', description: 'ফিকহ ও উসূল জামাত' },
  { name: 'জালালাইন', short_name: 'জালালাইন', description: 'তাফসীর ও ফিকহ জামাত' },
  { name: 'মেশকাত', short_name: 'মেশকাত', description: 'হাদিস শরীফ জামাত' },
  { name: 'দাওরায়ে হাদিস', short_name: 'দাওরা', description: 'সর্বোচ্চ হাদিস অধ্যায়ন জামাত' },
  { name: 'হিফজ', short_name: 'হিফজ', description: 'পবিত্র কুরআন হিফজ জামাত' },
  { name: 'নাজেরা', short_name: 'নাজেরা', description: 'বিশুদ্ধ কুরআন তেলাওয়াত জামাত' },
  { name: 'ইবতেদায়ী প্রথম', short_name: 'ইবতেদায়ী-১', description: 'ইবতেদায়ী প্রথম শ্রেণী' },
  { name: 'ইবতেদায়ী দ্বিতীয়', short_name: 'ইবতেদায়ী-২', description: 'ইবতেদায়ী দ্বিতীয় শ্রেণী' },
];

export const PERMISSION_MODULES = [
  'profile',
  'admin_departments',
  'designations',
  'academic',
  'teachers',
  'students',
  'attendance',
  'exams',
  'hostel',
  'library',
  'finance',
  'notices',
  'reports',
  'support',
  'settings',
] as const;

export const PERMISSION_ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'approve',
  'publish',
  'export',
  'manage',
] as const;

export type PermissionMap = Record<string, string[]>;

function fullPermissions(): PermissionMap {
  const map: PermissionMap = {};
  for (const mod of PERMISSION_MODULES) {
    map[mod] = [...PERMISSION_ACTIONS];
  }
  return map;
}

export const INITIAL_ROLES: Array<{
  name: string;
  slug: string;
  description: string;
  permissions: PermissionMap;
}> = [
  {
    name: 'মুহতামিম',
    slug: 'muhtamim',
    description: 'প্রতিষ্ঠানের সর্বোচ্চ প্রশাসনিক দায়িত্ব ও পূর্ণাঙ্গ ব্যবস্থাপনা',
    permissions: fullPermissions(),
  },
  {
    name: 'নাজেমে তালিমাত',
    slug: 'nazeme_talimat',
    description: 'শিক্ষা, শিক্ষক, শিক্ষার্থী, রুটিন, উপস্থিতি ও পরীক্ষা ব্যবস্থাপনা',
    permissions: {
      profile: ['view'],
      academic: ['view', 'create', 'edit', 'delete', 'manage'],
      teachers: ['view', 'create', 'edit', 'manage'],
      students: ['view', 'create', 'edit', 'export', 'manage'],
      attendance: ['view', 'create', 'edit', 'export', 'manage'],
      exams: ['view', 'create', 'edit', 'delete', 'approve', 'publish', 'export', 'manage'],
      notices: ['view', 'create', 'edit', 'publish'],
      reports: ['view', 'export'],
      support: ['view', 'create'],
    },
  },
  {
    name: 'নাজেমে দারুল ইকামা',
    slug: 'nazeme_darul_iqama',
    description: 'আবাসিক ছাত্রাবাস, কক্ষ, সিট বরাদ্দ, খাবার ও আবাসিক হাজিরা ব্যবস্থাপনা',
    permissions: {
      profile: ['view'],
      hostel: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'manage'],
      notices: ['view', 'create', 'publish'],
      reports: ['view', 'export'],
      support: ['view', 'create'],
    },
  },
  {
    name: 'নাজেমে মালিয়া',
    slug: 'nazeme_maliya',
    description: 'হিসাব, আয়-ব্যয়, শিক্ষার্থী ফি, রসিদ ও আর্থিক প্রতিবেদন ব্যবস্থাপনা',
    permissions: {
      profile: ['view'],
      finance: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'manage'],
      reports: ['view', 'export'],
      notices: ['view', 'create'],
      support: ['view', 'create'],
    },
  },
  {
    name: 'শিক্ষক',
    slug: 'teacher',
    description: 'নির্ধারিত শ্রেণী, বিষয়, উপস্থিতি গ্রহণ ও নম্বর এন্ট্রি',
    permissions: {
      academic: ['view'],
      students: ['view'],
      attendance: ['view', 'create', 'edit'],
      exams: ['view', 'create', 'edit'],
      library: ['view'],
      notices: ['view'],
      support: ['view', 'create'],
    },
  },
  {
    name: 'মুহাসিব',
    slug: 'muhasib',
    description: 'দৈনন্দিন ফি আদায়, রসিদ প্রদান ও আয়-ব্যয় লিপিবদ্ধকরণ',
    permissions: {
      finance: ['view', 'create', 'edit', 'export'],
      reports: ['view', 'export'],
      support: ['view', 'create'],
    },
  },
  {
    name: 'শিক্ষার্থী',
    slug: 'student',
    description: 'নিজস্ব প্রোফাইল, হাজিরা, রুটিন, ফলাফল, নোটিশ ও ফি রসিদ দর্শন',
    permissions: {
      students: ['view'],
      attendance: ['view'],
      exams: ['view'],
      finance: ['view'],
      notices: ['view'],
    },
  },
  {
    name: 'অভিভাবক',
    slug: 'guardian',
    description: 'সন্তানের প্রোফাইল, হাজিরা, রুটিন, ফলাফল, নোটিশ ও পেমেন্ট রসিদ দর্শন',
    permissions: {
      students: ['view'],
      attendance: ['view'],
      exams: ['view'],
      finance: ['view'],
      notices: ['view'],
    },
  },
];

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS institutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'pending', 'suspended')),
      logo_url TEXT DEFAULT '',
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      motto TEXT DEFAULT '',
      established_year TEXT DEFAULT '',
      academic_year TEXT DEFAULT '১৪৪৭-৪৮ হি. / ২০২৬',
      grading_scale_json TEXT NOT NULL,
      admission_fields_json TEXT NOT NULL,
      roll_counter INTEGER NOT NULL DEFAULT 0,
      receipt_counter INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT DEFAULT '',
      permissions_json TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER REFERENCES institutions(id) ON DELETE CASCADE,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK (account_type IN ('super_admin', 'institution_admin', 'teacher', 'staff', 'student', 'guardian')),
      role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
      photo_url TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'locked', 'draft')),
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      institution_id INTEGER REFERENCES institutions(id) ON DELETE CASCADE,
      impersonated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      session_scope TEXT NOT NULL DEFAULT 'institution' CHECK (session_scope IN ('super_admin', 'institution')),
      ip_address TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      photo_url TEXT DEFAULT '',
      address TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS institution_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_type TEXT NOT NULL CHECK (member_type IN ('institution_admin', 'teacher', 'staff', 'student', 'guardian')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'locked', 'draft')),
      joined_at TEXT NOT NULL,
      UNIQUE (institution_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS login_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      institution_id INTEGER REFERENCES institutions(id) ON DELETE SET NULL,
      username TEXT NOT NULL,
      success INTEGER NOT NULL,
      reason TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      is_suspicious INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT DEFAULT '',
      target_label TEXT DEFAULT '',
      institution_id INTEGER REFERENCES institutions(id) ON DELETE SET NULL,
      institution_name TEXT DEFAULT '',
      result TEXT NOT NULL DEFAULT 'success',
      details_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      head_name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS designations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('administrative', 'academic', 'other')),
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS academic_departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      department_id INTEGER NOT NULL REFERENCES academic_departments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      display_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jamaat_names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      short_name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
      created_at TEXT NOT NULL,
      UNIQUE (institution_id, name)
    );

    CREATE TABLE IF NOT EXISTS class_jamaats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      jamaat_id INTEGER NOT NULL REFERENCES jamaat_names(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE (class_id, jamaat_id)
    );

    CREATE TABLE IF NOT EXISTS academic_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      book_code TEXT NOT NULL,
      name TEXT NOT NULL,
      arabic_name TEXT DEFAULT '',
      short_name TEXT DEFAULT '',
      author_name TEXT DEFAULT '',
      publisher_name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      cover_image_url TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (institution_id, book_code)
    );

    CREATE TABLE IF NOT EXISTS class_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      book_id INTEGER NOT NULL REFERENCES academic_books(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE (class_id, book_id)
    );

    CREATE TABLE IF NOT EXISTS jamaat_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      jamaat_id INTEGER NOT NULL REFERENCES jamaat_names(id) ON DELETE CASCADE,
      book_id INTEGER NOT NULL REFERENCES academic_books(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE (jamaat_id, book_id)
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      book_id INTEGER REFERENCES academic_books(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      code TEXT DEFAULT '',
      full_marks REAL NOT NULL DEFAULT 100,
      pass_marks REAL NOT NULL DEFAULT 33,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      photo_url TEXT DEFAULT '',
      mobile TEXT DEFAULT '',
      department_id INTEGER REFERENCES academic_departments(id) ON DELETE SET NULL,
      joining_date TEXT DEFAULT '',
      address TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teacher_designations (
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      designation_id INTEGER NOT NULL REFERENCES designations(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (teacher_id, designation_id)
    );

    CREATE TABLE IF NOT EXISTS teacher_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
      UNIQUE (teacher_id, class_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS guardians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      mobile TEXT DEFAULT '',
      relation TEXT DEFAULT 'পিতা/অভিভাবক',
      address TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_code TEXT NOT NULL,
      roll_number TEXT NOT NULL,
      full_name TEXT NOT NULL,
      photo_url TEXT DEFAULT '',
      father_name TEXT DEFAULT '',
      mother_name TEXT DEFAULT '',
      guardian_id INTEGER REFERENCES guardians(id) ON DELETE SET NULL,
      guardian_name TEXT DEFAULT '',
      guardian_mobile TEXT DEFAULT '',
      student_mobile TEXT DEFAULT '',
      dob TEXT DEFAULT '',
      blood_group TEXT DEFAULT '',
      address TEXT DEFAULT '',
      department_id INTEGER REFERENCES academic_departments(id) ON DELETE SET NULL,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      admission_date TEXT NOT NULL,
      previous_institution TEXT DEFAULT '',
      additional_info TEXT DEFAULT '',
      fee_type TEXT NOT NULL DEFAULT 'regular' CHECK (fee_type IN ('regular', 'one_time', 'free')),
      monthly_fee REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL,
      UNIQUE (institution_id, roll_number),
      UNIQUE (institution_id, student_code)
    );

    CREATE TABLE IF NOT EXISTS routines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      department_id INTEGER NOT NULL REFERENCES academic_departments(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      day_of_week TEXT NOT NULL,
      period_number INTEGER NOT NULL DEFAULT 1,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      room TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      department_id INTEGER REFERENCES academic_departments(id) ON DELETE SET NULL,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      attendance_date TEXT NOT NULL,
      session_name TEXT NOT NULL DEFAULT 'সকাল',
      status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'leave')),
      marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE (institution_id, student_id, attendance_date, session_name)
    );

    CREATE TABLE IF NOT EXISTS teacher_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'leave')),
      check_in TEXT DEFAULT '',
      check_out TEXT DEFAULT '',
      marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE (institution_id, teacher_id, attendance_date)
    );

    CREATE TABLE IF NOT EXISTS examinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      department_id INTEGER NOT NULL REFERENCES academic_departments(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ongoing', 'completed', 'published')),
      published_at TEXT,
      published_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exam_subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      full_marks REAL NOT NULL DEFAULT 100,
      pass_marks REAL NOT NULL DEFAULT 33,
      included INTEGER NOT NULL DEFAULT 1,
      UNIQUE (exam_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS exam_marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      exam_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      full_marks REAL NOT NULL DEFAULT 100,
      obtained_marks REAL NOT NULL DEFAULT 0,
      grade TEXT DEFAULT '',
      gpa REAL NOT NULL DEFAULT 0,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (exam_id, student_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS exam_marks_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      exam_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      old_marks REAL,
      new_marks REAL NOT NULL,
      changed_by TEXT NOT NULL,
      changed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finance_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finance_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL DEFAULT 'নগদ',
      opening_balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finance_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      tx_date TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      category_id INTEGER REFERENCES finance_categories(id) ON DELETE SET NULL,
      category_name TEXT NOT NULL,
      account_id INTEGER REFERENCES finance_accounts(id) ON DELETE SET NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'নগদ',
      handled_by TEXT DEFAULT '',
      reference TEXT DEFAULT '',
      note TEXT DEFAULT '',
      source_type TEXT DEFAULT 'manual',
      source_id INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fee_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      receipt_number TEXT NOT NULL,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      payment_type TEXT NOT NULL CHECK (payment_type IN ('one_time', 'regular', 'free')),
      fee_category TEXT NOT NULL,
      payment_period TEXT DEFAULT '',
      previous_due REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      remaining_due REAL NOT NULL DEFAULT 0,
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'নগদ',
      account_id INTEGER REFERENCES finance_accounts(id) ON DELETE SET NULL,
      received_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      received_by_name TEXT DEFAULT '',
      note TEXT DEFAULT '',
      finance_tx_id INTEGER REFERENCES finance_transactions(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      UNIQUE (institution_id, receipt_number)
    );

    CREATE TABLE IF NOT EXISTS hostel_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      supervisor_name TEXT DEFAULT '',
      capacity INTEGER NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hostel_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      unit_id INTEGER NOT NULL REFERENCES hostel_units(id) ON DELETE CASCADE,
      room_number TEXT NOT NULL,
      total_beds INTEGER NOT NULL DEFAULT 4,
      monthly_fee REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hostel_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      unit_id INTEGER NOT NULL REFERENCES hostel_units(id) ON DELETE CASCADE,
      room_id INTEGER NOT NULL REFERENCES hostel_rooms(id) ON DELETE CASCADE,
      bed_number TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'transferred', 'vacated')),
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hostel_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'leave')),
      note TEXT DEFAULT '',
      marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      UNIQUE (institution_id, student_id, attendance_date)
    );

    CREATE TABLE IF NOT EXISTS hostel_meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      meal_date TEXT NOT NULL,
      breakfast TEXT DEFAULT '',
      lunch TEXT DEFAULT '',
      dinner TEXT DEFAULT '',
      total_students INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS library_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      book_code TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'সাধারণ',
      author TEXT DEFAULT '',
      publisher TEXT DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      available_copies INTEGER NOT NULL DEFAULT 1,
      shelf_location TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE (institution_id, book_code)
    );

    CREATE TABLE IF NOT EXISTS library_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      book_id INTEGER NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
      borrower_type TEXT NOT NULL CHECK (borrower_type IN ('student', 'teacher')),
      borrower_id INTEGER NOT NULL,
      borrower_name TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      return_date TEXT,
      status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'returned', 'overdue')),
      late_fee REAL NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER REFERENCES institutions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      attachment_name TEXT DEFAULT '',
      attachment_data TEXT DEFAULT '',
      publish_date TEXT NOT NULL,
      expiry_date TEXT DEFAULT '',
      audience_type TEXT NOT NULL DEFAULT 'all',
      audience_target_id TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'archived')),
      created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notice_reads (
      notice_id INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL,
      PRIMARY KEY (notice_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_code TEXT NOT NULL UNIQUE,
      institution_id INTEGER REFERENCES institutions(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by_name TEXT NOT NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'সাধারণ',
      description TEXT NOT NULL,
      attachment_name TEXT DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_for_user', 'resolved', 'closed')),
      assigned_to TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'released',
      released_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_institution ON users(institution_id);
    CREATE INDEX IF NOT EXISTS idx_institution_members_user ON institution_members(user_id, institution_id);
    CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
    CREATE INDEX IF NOT EXISTS idx_students_institution_class ON students(institution_id, department_id, class_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_lookup ON student_attendance(institution_id, attendance_date, class_id);
    CREATE INDEX IF NOT EXISTS idx_finance_tx_inst ON finance_transactions(institution_id, tx_date);
    CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(institution_id, student_id);
    CREATE INDEX IF NOT EXISTS idx_notices_inst ON notices(institution_id, status);
    CREATE INDEX IF NOT EXISTS idx_jamaat_names_inst ON jamaat_names(institution_id, status);
    CREATE INDEX IF NOT EXISTS idx_class_jamaats_class ON class_jamaats(institution_id, class_id);
    CREATE INDEX IF NOT EXISTS idx_class_jamaats_jamaat ON class_jamaats(institution_id, jamaat_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

    CREATE VIEW IF NOT EXISTS auth_users AS
      SELECT id, institution_id, username, full_name, account_type, role_id, photo_url, phone,
             status, failed_attempts, locked_until, must_change_password, last_login_at, created_at
      FROM users;

    CREATE VIEW IF NOT EXISTS student_profiles AS
      SELECT * FROM students;

    CREATE VIEW IF NOT EXISTS guardian_profiles AS
      SELECT * FROM guardians;
  `);

  // Replace legacy teacher_profiles VIEW (if present) with the real persistent teacher_profiles table
  const legacyTpView = db
    .prepare("SELECT type FROM sqlite_master WHERE name = 'teacher_profiles'")
    .get() as { type: string } | undefined;
  if (legacyTpView?.type === 'view') {
    db.exec('DROP VIEW IF EXISTS teacher_profiles;');
  }

  // Advanced Teacher Management, Salary, Due Ledger, Schedules, Live Status, Leave Management & Notifications Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS teacher_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL UNIQUE REFERENCES teachers(id) ON DELETE CASCADE,
      teacher_code TEXT NOT NULL,
      email TEXT DEFAULT '',
      education TEXT DEFAULT '',
      monthly_salary REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(institution_id, teacher_code)
    );

    CREATE TABLE IF NOT EXISTS teacher_salary_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      salary_month TEXT NOT NULL,
      base_salary REAL NOT NULL DEFAULT 0,
      bonus REAL NOT NULL DEFAULT 0,
      deduction REAL NOT NULL DEFAULT 0,
      due_adjusted REAL NOT NULL DEFAULT 0,
      net_payable REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      cumulative_paid REAL NOT NULL DEFAULT 0,
      remaining_payable REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'bKash', 'Nagad', 'Bank')),
      payment_date TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      remarks TEXT DEFAULT '',
      approved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approved_by_name TEXT NOT NULL,
      finance_tx_id INTEGER REFERENCES finance_transactions(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teacher_advance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      withdraw_date TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'bKash', 'Nagad', 'Bank')),
      approved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approved_by_name TEXT NOT NULL,
      remarks TEXT DEFAULT '',
      receipt_number TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      finance_tx_id INTEGER REFERENCES finance_transactions(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teacher_salary_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      receipt_type TEXT NOT NULL DEFAULT 'salary' CHECK (receipt_type IN ('salary', 'advance', 'due_settlement')),
      salary_record_id INTEGER REFERENCES teacher_salary_records(id) ON DELETE CASCADE,
      advance_record_id INTEGER REFERENCES teacher_advance_records(id) ON DELETE CASCADE,
      receipt_number TEXT NOT NULL,
      salary_month TEXT DEFAULT '',
      base_salary REAL NOT NULL DEFAULT 0,
      bonus REAL NOT NULL DEFAULT 0,
      deduction REAL NOT NULL DEFAULT 0,
      due_adjusted REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      payment_date TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      approved_by_name TEXT NOT NULL,
      remarks TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(institution_id, receipt_number)
    );

    CREATE TABLE IF NOT EXISTS teacher_due_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      entry_date TEXT NOT NULL,
      entry_type TEXT NOT NULL CHECK (entry_type IN ('advance', 'salary_deduction', 'cash_return', 'adjustment')),
      previous_due REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      new_due REAL NOT NULL DEFAULT 0,
      reference_id INTEGER,
      transaction_id TEXT DEFAULT '',
      note TEXT DEFAULT '',
      created_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teacher_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      department_id INTEGER REFERENCES academic_departments(id) ON DELETE SET NULL,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      jamaat_id INTEGER REFERENCES jamaat_names(id) ON DELETE SET NULL,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      day_of_week TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      room_number TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teacher_break_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      day_of_week TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT 'বিরতি',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teacher_live_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL UNIQUE REFERENCES teachers(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('in_class', 'break', 'free', 'on_leave', 'absent')),
      verification_state TEXT NOT NULL DEFAULT 'scheduled' CHECK (verification_state IN ('confirmed', 'unconfirmed', 'scheduled', 'leave', 'absent')),
      current_schedule_id INTEGER REFERENCES teacher_schedules(id) ON DELETE SET NULL,
      current_department TEXT DEFAULT '',
      current_class TEXT DEFAULT '',
      current_jamaat TEXT DEFAULT '',
      current_subject TEXT DEFAULT '',
      room_number TEXT DEFAULT '',
      start_time TEXT DEFAULT '',
      end_time TEXT DEFAULT '',
      next_class_time TEXT DEFAULT '',
      next_class_name TEXT DEFAULT '',
      leave_reason TEXT DEFAULT '',
      leave_start_date TEXT DEFAULT '',
      leave_end_date TEXT DEFAULT '',
      confirmed_schedule_id INTEGER,
      confirmed_at TEXT,
      confirmed_date TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teacher_leave_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      leave_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      total_days INTEGER NOT NULL DEFAULT 1,
      reason TEXT NOT NULL,
      application_body TEXT NOT NULL,
      attachment_name TEXT DEFAULT '',
      attachment_data TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      admin_comment TEXT DEFAULT '',
      reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by_name TEXT DEFAULT '',
      reviewed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_leave_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      department_id INTEGER REFERENCES academic_departments(id) ON DELETE SET NULL,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      jamaat_id INTEGER REFERENCES jamaat_names(id) ON DELETE SET NULL,
      leave_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      total_days INTEGER NOT NULL DEFAULT 1,
      reason TEXT NOT NULL,
      application_body TEXT NOT NULL,
      attachment_name TEXT DEFAULT '',
      attachment_data TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      admin_comment TEXT DEFAULT '',
      reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by_name TEXT DEFAULT '',
      reviewed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leave_approval_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      applicant_type TEXT NOT NULL CHECK (applicant_type IN ('teacher', 'student')),
      leave_application_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
      comment TEXT DEFAULT '',
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      reference_type TEXT DEFAULT '',
      reference_id INTEGER,
      dedupe_key TEXT DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS application_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS application_branding (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      app_name TEXT NOT NULL DEFAULT 'DARUL IDARAH',
      logo_data_url TEXT DEFAULT '',
      logo_mime TEXT DEFAULT '',
      logo_filename TEXT DEFAULT '',
      logo_version INTEGER NOT NULL DEFAULT 1,
      updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      whatsapp_number TEXT DEFAULT '',
      whatsapp_enabled INTEGER NOT NULL DEFAULT 1,
      facebook_url TEXT DEFAULT '',
      facebook_enabled INTEGER NOT NULL DEFAULT 1,
      support_email TEXT DEFAULT '',
      support_description TEXT DEFAULT '',
      updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS institution_settings (
      institution_id INTEGER PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
      whatsapp_number TEXT DEFAULT '',
      whatsapp_enabled INTEGER NOT NULL DEFAULT 1,
      facebook_url TEXT DEFAULT '',
      facebook_enabled INTEGER NOT NULL DEFAULT 1,
      support_email TEXT DEFAULT '',
      support_description TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER REFERENCES institutions(id) ON DELETE CASCADE,
      target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      target_username TEXT NOT NULL,
      target_full_name TEXT DEFAULT '',
      target_role TEXT DEFAULT '',
      reset_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reset_by_name TEXT NOT NULL,
      reset_by_role TEXT DEFAULT '',
      reset_scope TEXT NOT NULL CHECK (reset_scope IN ('super_admin_institution', 'super_admin_user', 'institution_admin_user')),
      used_roll_as_pin INTEGER NOT NULL DEFAULT 0,
      ip_address TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log_categories (
      code TEXT PRIMARY KEY,
      name_bn TEXT NOT NULL,
      name_en TEXT NOT NULL,
      module TEXT NOT NULL,
      description TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS uploaded_files (
      id TEXT PRIMARY KEY,
      institution_id INTEGER REFERENCES institutions(id) ON DELETE CASCADE,
      uploaded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      module TEXT NOT NULL DEFAULT 'general',
      category TEXT NOT NULL DEFAULT 'attachment',
      original_name TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS institution_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      sender_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_name TEXT NOT NULL,
      sender_role TEXT NOT NULL DEFAULT '',
      recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_name TEXT NOT NULL,
      recipient_role TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      read_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_teacher_profiles_inst ON teacher_profiles(institution_id, teacher_id);
    CREATE INDEX IF NOT EXISTS idx_teacher_salary_inst ON teacher_salary_records(institution_id, teacher_id, salary_month);
    CREATE INDEX IF NOT EXISTS idx_teacher_receipts_inst ON teacher_salary_receipts(institution_id, teacher_id);
    CREATE INDEX IF NOT EXISTS idx_teacher_advances_inst ON teacher_advance_records(institution_id, teacher_id);
    CREATE INDEX IF NOT EXISTS idx_teacher_due_ledger_inst ON teacher_due_ledger(institution_id, teacher_id);
    CREATE INDEX IF NOT EXISTS idx_teacher_schedules_lookup ON teacher_schedules(institution_id, teacher_id, day_of_week, status);
    CREATE INDEX IF NOT EXISTS idx_teacher_breaks_lookup ON teacher_break_schedules(institution_id, teacher_id, day_of_week, status);
    CREATE INDEX IF NOT EXISTS idx_teacher_live_inst ON teacher_live_status(institution_id, status);
    CREATE INDEX IF NOT EXISTS idx_teacher_leaves_inst ON teacher_leave_applications(institution_id, teacher_id, status);
    CREATE INDEX IF NOT EXISTS idx_student_leaves_inst ON student_leave_applications(institution_id, student_id, status);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(user_id, dedupe_key);
    CREATE INDEX IF NOT EXISTS idx_password_reset_logs_inst ON password_reset_logs(institution_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_uploaded_files_inst ON uploaded_files(institution_id, module, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_institution_messages_inst ON institution_messages(institution_id, recipient_user_id, sender_user_id, created_at DESC);
  `);

  // Safe schema migration for pre-existing sessions tables lacking session_scope
  const sessionCols = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
  if (!sessionCols.some((c) => c.name === 'session_scope')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN session_scope TEXT NOT NULL DEFAULT 'institution'`);
    db.exec(
      `UPDATE sessions SET session_scope = 'super_admin'
       WHERE impersonated_by_user_id IS NULL
         AND user_id IN (SELECT id FROM users WHERE account_type = 'super_admin')`
    );
  }

  // Safe schema migrations for Academic Setup (classes.description & jamaat_id links)
  const ensureColumn = (table: string, col: string, ddl: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  };
  ensureColumn('classes', 'description', `description TEXT DEFAULT ''`);
  ensureColumn('students', 'jamaat_id', `jamaat_id INTEGER REFERENCES jamaat_names(id) ON DELETE SET NULL`);
  ensureColumn('teacher_assignments', 'jamaat_id', `jamaat_id INTEGER REFERENCES jamaat_names(id) ON DELETE SET NULL`);
  ensureColumn('routines', 'jamaat_id', `jamaat_id INTEGER REFERENCES jamaat_names(id) ON DELETE SET NULL`);
  ensureColumn('examinations', 'jamaat_id', `jamaat_id INTEGER REFERENCES jamaat_names(id) ON DELETE SET NULL`);
  ensureColumn('institutions', 'salary_receipt_counter', `salary_receipt_counter INTEGER NOT NULL DEFAULT 0`);
  ensureColumn('institutions', 'teacher_code_counter', `teacher_code_counter INTEGER NOT NULL DEFAULT 0`);
  ensureColumn('audit_logs', 'actor_role', `actor_role TEXT DEFAULT ''`);
  ensureColumn('audit_logs', 'module', `module TEXT DEFAULT 'administration'`);
  ensureColumn('audit_logs', 'category_code', `category_code TEXT DEFAULT 'administration'`);
  ensureColumn('audit_logs', 'description', `description TEXT DEFAULT ''`);
  ensureColumn('audit_logs', 'ip_address', `ip_address TEXT DEFAULT ''`);
  ensureColumn('support_tickets', 'attachment_data', `attachment_data TEXT DEFAULT ''`);
  ensureColumn('students', 'document_name', `document_name TEXT DEFAULT ''`);
  ensureColumn('students', 'document_url', `document_url TEXT DEFAULT ''`);
  ensureColumn('teacher_profiles', 'document_name', `document_name TEXT DEFAULT ''`);
  ensureColumn('teacher_profiles', 'document_url', `document_url TEXT DEFAULT ''`);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_inst_created ON audit_logs(institution_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module, created_at DESC);
  `);
  ensureColumn('institutions', 'book_counter', `book_counter INTEGER NOT NULL DEFAULT 0`);
  ensureColumn('jamaat_names', 'department_id', `department_id INTEGER REFERENCES academic_departments(id) ON DELETE SET NULL`);
  ensureColumn('classes', 'jamaat_id', `jamaat_id INTEGER REFERENCES jamaat_names(id) ON DELETE SET NULL`);
  ensureColumn('subjects', 'book_id', `book_id INTEGER REFERENCES academic_books(id) ON DELETE SET NULL`);
  ensureColumn('teacher_attendance', 'note', `note TEXT DEFAULT ''`);
  ensureColumn('routines', 'is_daily', `is_daily INTEGER NOT NULL DEFAULT 0`);
  ensureColumn('teacher_schedules', 'is_daily', `is_daily INTEGER NOT NULL DEFAULT 0`);
  ensureColumn('teacher_break_schedules', 'is_daily', `is_daily INTEGER NOT NULL DEFAULT 0`);

  // Safe schema migrations for Separate Monthly Payable & Meal Cost (Teacher & Student Payment System)
  ensureColumn('teacher_profiles', 'monthly_meal_cost', `monthly_meal_cost REAL NOT NULL DEFAULT 0`);
  ensureColumn('teacher_salary_records', 'meal_cost', `meal_cost REAL NOT NULL DEFAULT 0`);
  ensureColumn('teacher_salary_records', 'previous_due', `previous_due REAL NOT NULL DEFAULT 0`);
  ensureColumn('teacher_salary_records', 'total_payable', `total_payable REAL NOT NULL DEFAULT 0`);
  ensureColumn('teacher_salary_records', 'remaining_due', `remaining_due REAL NOT NULL DEFAULT 0`);
  ensureColumn('teacher_salary_records', 'salary_paid_part', `salary_paid_part REAL NOT NULL DEFAULT 0`);
  ensureColumn('teacher_salary_records', 'meal_paid_part', `meal_paid_part REAL NOT NULL DEFAULT 0`);
  ensureColumn(
    'teacher_salary_records',
    'meal_finance_tx_id',
    `meal_finance_tx_id INTEGER REFERENCES finance_transactions(id) ON DELETE SET NULL`
  );
  ensureColumn('teacher_salary_receipts', 'meal_cost', `meal_cost REAL NOT NULL DEFAULT 0`);
  ensureColumn('teacher_salary_receipts', 'previous_due', `previous_due REAL NOT NULL DEFAULT 0`);
  ensureColumn('teacher_salary_receipts', 'total_payable', `total_payable REAL NOT NULL DEFAULT 0`);
  ensureColumn('teacher_salary_receipts', 'remaining_due', `remaining_due REAL NOT NULL DEFAULT 0`);

  ensureColumn('students', 'monthly_meal_cost', `monthly_meal_cost REAL NOT NULL DEFAULT 0`);
  ensureColumn('fee_payments', 'payment_month', `payment_month TEXT NOT NULL DEFAULT ''`);
  ensureColumn('fee_payments', 'monthly_payable', `monthly_payable REAL NOT NULL DEFAULT 0`);
  ensureColumn('fee_payments', 'meal_cost', `meal_cost REAL NOT NULL DEFAULT 0`);
  ensureColumn('fee_payments', 'other_fee', `other_fee REAL NOT NULL DEFAULT 0`);
  ensureColumn('fee_payments', 'discount', `discount REAL NOT NULL DEFAULT 0`);
  ensureColumn('fee_payments', 'total_payable', `total_payable REAL NOT NULL DEFAULT 0`);
  ensureColumn('fee_payments', 'fee_paid_part', `fee_paid_part REAL NOT NULL DEFAULT 0`);
  ensureColumn('fee_payments', 'meal_paid_part', `meal_paid_part REAL NOT NULL DEFAULT 0`);
  ensureColumn('institutions', 'tx_counter', `tx_counter INTEGER NOT NULL DEFAULT 0`);
  ensureColumn('finance_transactions', 'tx_code', `tx_code TEXT NOT NULL DEFAULT ''`);
  ensureColumn('finance_transactions', 'reversal_of_id', `reversal_of_id INTEGER REFERENCES finance_transactions(id) ON DELETE SET NULL`);
  ensureColumn('finance_transactions', 'is_reversed', `is_reversed INTEGER NOT NULL DEFAULT 0`);
  ensureColumn('finance_transactions', 'reversed_by_name', `reversed_by_name TEXT NOT NULL DEFAULT ''`);
  ensureColumn('finance_transactions', 'reversed_at', `reversed_at TEXT NOT NULL DEFAULT ''`);
  ensureColumn('finance_transactions', 'reversal_reason', `reversal_reason TEXT NOT NULL DEFAULT ''`);
  ensureColumn(
    'fee_payments',
    'meal_finance_tx_id',
    `meal_finance_tx_id INTEGER REFERENCES finance_transactions(id) ON DELETE SET NULL`
  );

  // Idempotently backfill unique tx_code for any pre-existing finance_transactions rows
  const missingTxCodes = db
    .prepare("SELECT id, institution_id FROM finance_transactions WHERE tx_code IS NULL OR tx_code = '' ORDER BY id ASC")
    .all() as Array<{ id: number; institution_id: number }>;
  for (const row of missingTxCodes) {
    const code = generateUniqueTxCode(row.institution_id, 'TXN');
    db.prepare('UPDATE finance_transactions SET tx_code = ? WHERE id = ?').run(code, row.id);
  }
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_tx_code ON finance_transactions(tx_code) WHERE tx_code != ''`
  );

  // Safe non-destructive backfill for pre-existing payment rows (preserves 100% of existing figures)
  db.exec(`
    UPDATE teacher_salary_records
    SET total_payable = MAX(0, base_salary + meal_cost + bonus - deduction),
        remaining_due = remaining_payable
    WHERE total_payable = 0 AND (base_salary > 0 OR meal_cost > 0 OR bonus > 0);

    UPDATE teacher_salary_records
    SET salary_paid_part = paid_amount
    WHERE salary_paid_part = 0 AND meal_paid_part = 0 AND paid_amount > 0;

    UPDATE teacher_salary_receipts
    SET total_payable = MAX(0, base_salary + meal_cost + bonus - deduction)
    WHERE receipt_type = 'salary' AND total_payable = 0 AND (base_salary > 0 OR meal_cost > 0 OR bonus > 0);

    UPDATE fee_payments
    SET total_payable = MAX(0, amount_paid + remaining_due),
        monthly_payable = MAX(0, amount_paid + remaining_due - previous_due)
    WHERE total_payable = 0 AND (amount_paid > 0 OR remaining_due > 0);

    UPDATE fee_payments
    SET fee_paid_part = amount_paid
    WHERE fee_paid_part = 0 AND meal_paid_part = 0 AND amount_paid > 0;
  `);

  // Safe idempotent normalization for any daily routine records
  for (const tbl of ['routines', 'teacher_schedules', 'teacher_break_schedules']) {
    db.prepare(
      `UPDATE ${tbl}
       SET is_daily = 1, day_of_week = ?
       WHERE (is_daily = 1 OR lower(trim(day_of_week)) IN ('daily', 'everyday', 'ডেইলি', 'প্রতিদিন', ?))`
    ).run(DAILY_DAY_OPTION, DAILY_DAY_OPTION.toLowerCase());
  }

  // Safe indexes for Academic Books, Class-Book, Jamaat-Book, Class-Jamaat, and Payment Month links
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_academic_books_inst ON academic_books(institution_id, status);
    CREATE INDEX IF NOT EXISTS idx_class_books_class ON class_books(institution_id, class_id);
    CREATE INDEX IF NOT EXISTS idx_class_books_book ON class_books(institution_id, book_id);
    CREATE INDEX IF NOT EXISTS idx_jamaat_books_jamaat ON jamaat_books(institution_id, jamaat_id);
    CREATE INDEX IF NOT EXISTS idx_jamaat_books_book ON jamaat_books(institution_id, book_id);
    CREATE INDEX IF NOT EXISTS idx_jamaat_names_dept ON jamaat_names(institution_id, department_id);
    CREATE INDEX IF NOT EXISTS idx_classes_jamaat ON classes(institution_id, jamaat_id);
    CREATE INDEX IF NOT EXISTS idx_routines_daily ON routines(institution_id, teacher_id, is_daily, day_of_week);
    CREATE INDEX IF NOT EXISTS idx_fee_payments_month ON fee_payments(institution_id, student_id, payment_month);
  `);

  // Refresh student_profiles view so new columns like jamaat_id & monthly_meal_cost are exposed cleanly
  db.exec(`DROP VIEW IF EXISTS student_profiles; CREATE VIEW student_profiles AS SELECT * FROM students;`);

  // Backfill teacher_profiles and teacher_live_status for all existing teachers without touching existing rows
  const allTeachers = db
    .prepare('SELECT id, institution_id, created_at FROM teachers ORDER BY id ASC')
    .all() as Array<{ id: number; institution_id: number; created_at: string }>;
  const hasProfileStmt = db.prepare('SELECT id FROM teacher_profiles WHERE teacher_id = ?');
  const bumpTeacherCode = db.prepare('UPDATE institutions SET teacher_code_counter = teacher_code_counter + 1 WHERE id = ?');
  const getTeacherCodeCounter = db.prepare('SELECT teacher_code_counter FROM institutions WHERE id = ?');
  const insProfileStmt = db.prepare(
    `INSERT OR IGNORE INTO teacher_profiles (institution_id, teacher_id, teacher_code, email, education, monthly_salary, notes, created_at, updated_at)
     VALUES (?, ?, ?, '', '', 0, '', ?, ?)`
  );
  const insLiveStmt = db.prepare(
    `INSERT OR IGNORE INTO teacher_live_status (institution_id, teacher_id, status, verification_state, updated_at)
     VALUES (?, ?, 'free', 'scheduled', ?)`
  );
  const nowBackfill = getDhakaNowISO();
  for (const t of allTeachers) {
    if (!hasProfileStmt.get(t.id)) {
      bumpTeacherCode.run(t.institution_id);
      const { teacher_code_counter } = getTeacherCodeCounter.get(t.institution_id) as { teacher_code_counter: number };
      const code = `TCH-${String(teacher_code_counter).padStart(4, '0')}`;
      insProfileStmt.run(t.institution_id, t.id, code, t.created_at || nowBackfill, nowBackfill);
    }
    insLiveStmt.run(t.institution_id, t.id, nowBackfill);
  }

  // Seed normalized permissions catalog
  const insertPerm = db.prepare('INSERT OR IGNORE INTO permissions (module, action, code) VALUES (?, ?, ?)');
  for (const mod of PERMISSION_MODULES) {
    for (const act of PERMISSION_ACTIONS) {
      insertPerm.run(mod, act, `${mod}:${act}`);
    }
  }

  // Backfill centralized identity tables (user_profiles, institution_members, user_roles, role_permissions)
  const now = getDhakaNowISO();
  const existingUsers = db.prepare('SELECT id, institution_id, full_name, phone, photo_url, account_type, role_id, status, created_at FROM users').all() as any[];
  const upsertProfile = db.prepare(
    `INSERT OR IGNORE INTO user_profiles (user_id, full_name, phone, photo_url, address, updated_at)
     VALUES (?, ?, ?, ?, '', ?)`
  );
  const upsertMember = db.prepare(
    `INSERT OR IGNORE INTO institution_members (institution_id, user_id, member_type, status, joined_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const upsertUserRole = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)');

  for (const u of existingUsers) {
    upsertProfile.run(u.id, u.full_name, u.phone || '', u.photo_url || '', u.created_at || now);
    if (u.institution_id && u.account_type !== 'super_admin') {
      upsertMember.run(u.institution_id, u.id, u.account_type, u.status || 'active', u.created_at || now);
    }
    if (u.role_id) {
      upsertUserRole.run(u.id, u.role_id);
    }
  }

  // Tighten pre-existing system roles for strict department isolation (finance/hostel should not hold general students CRUD permission)
  for (const slug of ['nazeme_maliya', 'nazeme_darul_iqama', 'muhasib']) {
    const def = INITIAL_ROLES.find((r) => r.slug === slug);
    if (def) {
      db.prepare('UPDATE roles SET permissions_json = ? WHERE slug = ? AND is_system = 1').run(
        JSON.stringify(def.permissions),
        slug
      );
    }
  }

  // Sync role_permissions table from roles.permissions_json
  const permLookup = new Map<string, number>();
  for (const row of db.prepare('SELECT id, code FROM permissions').all() as Array<{ id: number; code: string }>) {
    permLookup.set(row.code, row.id);
  }
  const allRoles = db.prepare('SELECT id, permissions_json FROM roles').all() as Array<{ id: number; permissions_json: string }>;
  const insertRP = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
  for (const r of allRoles) {
    try {
      const pmap = JSON.parse(r.permissions_json || '{}') as PermissionMap;
      for (const [mod, actions] of Object.entries(pmap)) {
        if (!Array.isArray(actions)) continue;
        for (const act of actions) {
          const pid = permLookup.get(`${mod}:${act}`);
          if (pid) insertRP.run(r.id, pid);
        }
      }
    } catch {
      // ignore malformed JSON
    }
  }

  // Seed default system settings & initial platform app update record if empty
  const hasSettings = db.prepare('SELECT COUNT(*) as c FROM system_settings').get() as { c: number };
  if (hasSettings.c === 0) {
    const insertSetting = db.prepare('INSERT OR IGNORE INTO system_settings (key, value_json, updated_at) VALUES (?, ?, ?)');
    insertSetting.run('platform_name', JSON.stringify('DARUL IDARAH (দারুল ইদারা)'), now);
    insertSetting.run('default_timezone', JSON.stringify('Asia/Dhaka'), now);
    insertSetting.run('default_currency', JSON.stringify('BDT'), now);
    insertSetting.run('max_failed_logins', JSON.stringify(5), now);
    insertSetting.run('lockout_minutes', JSON.stringify(15), now);
    insertSetting.run('session_ttl_hours', JSON.stringify(24), now);
    insertSetting.run('maintenance_mode', JSON.stringify(false), now);
  }

  const hasUpdates = db.prepare('SELECT COUNT(*) as c FROM app_updates').get() as { c: number };
  if (hasUpdates.c === 0) {
    db.prepare(
      'INSERT INTO app_updates (version, title, notes, status, released_at) VALUES (?, ?, ?, ?, ?)'
    ).run(
      '1.0.0',
      'দারুল ইদারা প্রারম্ভিক রিলিজ',
      'মাল্টি-ইনস্টিটিউশন ব্যবস্থাপনা, একাডেমিক, পরীক্ষা ও ফলাফল, হাজিরা, হিসাব ও রসিদ, দারুল ইকামা এবং লাইব্রেরি মডিউল চালু হয়েছে।',
      'released',
      now
    );
  }

  // Seed audit_log_categories, default branding, default support_settings, and mirror application_settings
  const insCat = db.prepare(
    `INSERT OR IGNORE INTO audit_log_categories (code, name_bn, name_en, module, description)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const c of AUDIT_CATEGORIES) {
    insCat.run(c.code, c.name_bn, c.name_en, c.module, c.description);
  }

  db.prepare(
    `INSERT OR IGNORE INTO application_branding (id, app_name, logo_data_url, logo_mime, logo_filename, logo_version, updated_at)
     VALUES (1, 'DARUL IDARAH', '', '', '', 1, ?)`
  ).run(now);

  db.prepare(
    `INSERT OR IGNORE INTO support_settings (id, whatsapp_number, whatsapp_enabled, facebook_url, facebook_enabled, support_email, support_description, updated_at)
     VALUES (1, '', 1, '', 1, '', 'যেকোনো কারিগরি সহায়তা, অ্যাকাউন্ট সমস্যা বা পরামর্শের জন্য আমাদের সাপোর্ট টিমের সাথে যোগাযোগ করুন।', ?)`
  ).run(now);

  const sysRows = db.prepare('SELECT key, value_json, updated_at FROM system_settings').all() as Array<{
    key: string;
    value_json: string;
    updated_at: string;
  }>;
  const insAppSet = db.prepare(
    `INSERT OR IGNORE INTO application_settings (key, value_json, updated_at) VALUES (?, ?, ?)`
  );
  for (const r of sysRows) {
    insAppSet.run(r.key, r.value_json, r.updated_at);
  }

  // Idempotent Academic Setup, Separate Payment Finance Categories, and Institution Settings migration
  const existingInstitutions = db.prepare('SELECT id FROM institutions').all() as Array<{ id: number }>;
  for (const inst of existingInstitutions) {
    migrateAcademicSetupForInstitution(inst.id);
    ensurePaymentFinanceCategories(inst.id);
    ensureInstitutionSettings(inst.id);
  }
}

export function ensureInstitutionSettings(institutionId: number) {
  const now = getDhakaNowISO();
  db.prepare(
    `INSERT OR IGNORE INTO institution_settings (institution_id, whatsapp_number, whatsapp_enabled, facebook_url, facebook_enabled, support_email, support_description, updated_at)
     VALUES (?, '', 1, '', 1, '', '', ?)`
  ).run(institutionId, now);
}

export function ensurePaymentFinanceCategories(institutionId: number) {
  const now = getDhakaNowISO();
  const findStmt = db.prepare(
    'SELECT id FROM finance_categories WHERE institution_id = ? AND name = ? AND type = ? LIMIT 1'
  );
  const insertStmt = db.prepare(
    'INSERT INTO finance_categories (institution_id, name, type, is_system, created_at) VALUES (?, ?, ?, 1, ?)'
  );
  const required: Array<[string, 'income' | 'expense']> = [
    [FIN_CAT_STUDENT_FEE, 'income'],
    [FIN_CAT_STUDENT_MEAL, 'income'],
    [FIN_CAT_TEACHER_SALARY, 'expense'],
    [FIN_CAT_TEACHER_MEAL, 'expense'],
  ];
  for (const [name, type] of required) {
    if (!findStmt.get(institutionId, name, type)) {
      insertStmt.run(institutionId, name, type, now);
    }
  }
}

export function migrateAcademicSetupForInstitution(institutionId: number) {
  const now = getDhakaNowISO();

  // 1. Seed default Jamaat/Class Names if institution has none yet
  const jamaatCount = (
    db.prepare('SELECT COUNT(*) as c FROM jamaat_names WHERE institution_id = ?').get(institutionId) as { c: number }
  ).c;

  if (jamaatCount === 0) {
    const insJamaat = db.prepare(
      `INSERT OR IGNORE INTO jamaat_names (institution_id, name, short_name, description, status, created_at)
       VALUES (?, ?, ?, ?, 'active', ?)`
    );
    for (const j of DEFAULT_JAMAAT_NAMES) {
      insJamaat.run(institutionId, j.name, j.short_name, j.description, now);
    }
  }

  // 2. Map existing classes to matching jamaat_names without duplicating or losing existing records
  const aliasMap: Record<string, string> = {
    'হিফজুল কুরআন': 'হিফজ',
    'প্রথম শ্রেণী': 'ইবতেদায়ী প্রথম',
    'দ্বিতীয় শ্রেণী': 'ইবতেদায়ী দ্বিতীয়',
  };

  const existingClasses = db
    .prepare('SELECT id, name FROM classes WHERE institution_id = ?')
    .all(institutionId) as Array<{ id: number; name: string }>;

  const hasLinkStmt = db.prepare('SELECT COUNT(*) as c FROM class_jamaats WHERE class_id = ? AND institution_id = ?');
  const findJamaatStmt = db.prepare('SELECT id FROM jamaat_names WHERE institution_id = ? AND name = ? LIMIT 1');
  const createJamaatStmt = db.prepare(
    `INSERT OR IGNORE INTO jamaat_names (institution_id, name, short_name, description, status, created_at)
     VALUES (?, ?, '', '', 'active', ?)`
  );
  const linkClassJamaatStmt = db.prepare(
    `INSERT OR IGNORE INTO class_jamaats (institution_id, class_id, jamaat_id, created_at)
     VALUES (?, ?, ?, ?)`
  );

  for (const cls of existingClasses) {
    const linked = (hasLinkStmt.get(cls.id, institutionId) as { c: number }).c;
    if (linked > 0) continue;

    const targetName = aliasMap[cls.name] || cls.name;
    let jamaat = findJamaatStmt.get(institutionId, targetName) as { id: number } | undefined;
    if (!jamaat) {
      createJamaatStmt.run(institutionId, cls.name, now);
      jamaat = findJamaatStmt.get(institutionId, cls.name) as { id: number } | undefined;
    }
    if (jamaat) {
      linkClassJamaatStmt.run(institutionId, cls.id, jamaat.id, now);
    }
  }

  // 3. Backfill classes.jamaat_id from class_jamaats where null (non-destructive)
  db.prepare(
    `UPDATE classes
     SET jamaat_id = (
       SELECT cj.jamaat_id
       FROM class_jamaats cj
       WHERE cj.class_id = classes.id AND cj.institution_id = classes.institution_id
       ORDER BY cj.id ASC
       LIMIT 1
     )
     WHERE institution_id = ? AND jamaat_id IS NULL`
  ).run(institutionId);

  // 4. Backfill students.jamaat_id from their class's primary linked jamaat when null
  db.prepare(
    `UPDATE students
     SET jamaat_id = (
       SELECT cj.jamaat_id
       FROM class_jamaats cj
       WHERE cj.class_id = students.class_id AND cj.institution_id = students.institution_id
       ORDER BY cj.id ASC
       LIMIT 1
     )
     WHERE institution_id = ? AND class_id IS NOT NULL AND jamaat_id IS NULL`
  ).run(institutionId);
}

