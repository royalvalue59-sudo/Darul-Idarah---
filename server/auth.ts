import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import {
  db,
  ensureInstitutionSettings,
  ensurePaymentFinanceCategories,
  getDhakaNowISO,
  INITIAL_DESIGNATIONS,
  INITIAL_ROLES,
  migrateAcademicSetupForInstitution,
  type PermissionMap,
} from './db.ts';
import { sanitizeStoredImageRef } from './uploadPolicy.ts';

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plain: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, keyHex] = parts;
  const derived = crypto.scryptSync(plain, salt, 64);
  const stored = Buffer.from(keyHex, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a).digest();
  const digestB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export type SessionScope = 'super_admin' | 'institution';
export type DashboardRoute = 'super_admin' | 'institution' | 'teacher' | 'student' | 'guardian';

export interface AuthUser {
  id: number;
  institution_id: number | null;
  username: string;
  full_name: string;
  account_type: 'super_admin' | 'institution_admin' | 'teacher' | 'staff' | 'student' | 'guardian';
  role_id: number | null;
  role_slug: string;
  role_name: string;
  role_ids: number[];
  role_names: string[];
  permissions: PermissionMap;
  dashboard_route: DashboardRoute;
  session_scope: SessionScope;
  photo_url: string;
  phone: string;
  status: string;
  must_change_password: number;
  impersonated_by_user_id: number | null;
  session_token: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      institutionId?: number;
    }
  }
}

const ADMIN_ROLE_SLUGS = new Set([
  'muhtamim',
  'nazeme_talimat',
  'nazeme_maliya',
  'nazeme_darul_iqama',
  'muhasib',
]);

export function resolveUserRolesAndRouting(params: {
  userId: number;
  primaryRoleId: number | null;
  accountType: AuthUser['account_type'];
  impersonatedByUserId?: number | null;
}): {
  role_slug: string;
  role_name: string;
  role_ids: number[];
  role_names: string[];
  permissions: PermissionMap;
  dashboard_route: DashboardRoute;
} {
  const { userId, primaryRoleId, accountType, impersonatedByUserId } = params;

  if (accountType === 'super_admin' && !impersonatedByUserId) {
    return {
      role_slug: 'super_admin',
      role_name: 'সুপার অ্যাডমিন',
      role_ids: [],
      role_names: ['সুপার অ্যাডমিন'],
      permissions: {},
      dashboard_route: 'super_admin',
    };
  }

  // Load all roles assigned via user_roles (multi-role support) plus fallback primaryRoleId
  const assignedRows = db
    .prepare(
      `SELECT r.id, r.name, r.slug, r.permissions_json
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ?
       ORDER BY CASE WHEN r.id = ? THEN 0 ELSE 1 END, r.id ASC`
    )
    .all(userId, primaryRoleId ?? -1) as Array<{
    id: number;
    name: string;
    slug: string;
    permissions_json: string;
  }>;

  if (assignedRows.length === 0 && primaryRoleId) {
    const primary = db
      .prepare('SELECT id, name, slug, permissions_json FROM roles WHERE id = ?')
      .get(primaryRoleId) as { id: number; name: string; slug: string; permissions_json: string } | undefined;
    if (primary) assignedRows.push(primary);
  }

  const mergedPermissions: PermissionMap = {};
  const role_ids: number[] = [];
  const role_names: string[] = [];
  const roleSlugs: string[] = [];

  for (const r of assignedRows) {
    role_ids.push(r.id);
    role_names.push(r.name);
    roleSlugs.push(r.slug);
    try {
      const parsed = JSON.parse(r.permissions_json || '{}') as PermissionMap;
      for (const [mod, acts] of Object.entries(parsed)) {
        if (!Array.isArray(acts)) continue;
        const set = new Set(mergedPermissions[mod] || []);
        for (const a of acts) set.add(a);
        mergedPermissions[mod] = Array.from(set);
      }
    } catch {
      // ignore malformed permissions
    }
  }

  const primarySlug = roleSlugs[0] || accountType;
  const fallbackName =
    accountType === 'institution_admin'
      ? 'মাদ্রাসা মূল অ্যাকাউন্ট'
      : accountType === 'teacher'
      ? 'শিক্ষক'
      : accountType === 'student'
      ? 'শিক্ষার্থী'
      : accountType === 'guardian'
      ? 'অভিভাবক'
      : 'প্রশাসনিক কর্মকর্তা';
  const role_name = role_names.length > 0 ? role_names.join(' · ') : fallbackName;

  // Strictly determine dashboard route on backend
  let dashboard_route: DashboardRoute = 'institution';
  if (accountType === 'institution_admin') {
    dashboard_route = 'institution';
  } else if (accountType === 'student') {
    dashboard_route = 'student';
  } else if (accountType === 'guardian') {
    dashboard_route = 'guardian';
  } else if (accountType === 'staff') {
    dashboard_route = 'institution';
  } else if (accountType === 'teacher') {
    // If a teacher also holds an administrative role (e.g., Muhtamim, Nazeme Talimat, Nazeme Maliya, Darul Iqama, Muhasib)
    // or has management permissions on finance/hostel/settings/teachers/academic/students, route to Institution Panel
    const hasAdminRole = roleSlugs.some((s) => ADMIN_ROLE_SLUGS.has(s));
    const hasManagementPerm = ['finance', 'hostel', 'settings', 'teachers', 'academic', 'students'].some((mod) =>
      (mergedPermissions[mod] || []).some((act) => ['manage', 'publish', 'approve', 'delete'].includes(act))
    );
    dashboard_route = hasAdminRole || hasManagementPerm ? 'institution' : 'teacher';
  }

  return {
    role_slug: primarySlug,
    role_name,
    role_ids,
    role_names: role_names.length > 0 ? role_names : [fallbackName],
    permissions: mergedPermissions,
    dashboard_route,
  };
}

export function syncRolePermissions(roleId: number, permissions: PermissionMap) {
  db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
  const findPerm = db.prepare('SELECT id FROM permissions WHERE code = ?');
  const ins = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
  for (const [mod, actions] of Object.entries(permissions || {})) {
    if (!Array.isArray(actions)) continue;
    for (const act of actions) {
      const row = findPerm.get(`${mod}:${act}`) as { id: number } | undefined;
      if (row) ins.run(roleId, row.id);
    }
  }
}

export function syncUserIdentity(params: {
  userId: number;
  institutionId: number | null;
  accountType: AuthUser['account_type'];
  fullName: string;
  phone?: string;
  photoUrl?: string;
  address?: string;
  status?: string;
  roleIds?: number[];
}) {
  const now = getDhakaNowISO();
  db.prepare(
    `INSERT INTO user_profiles (user_id, full_name, phone, photo_url, address, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       full_name = excluded.full_name,
       phone = excluded.phone,
       photo_url = excluded.photo_url,
       address = excluded.address,
       updated_at = excluded.updated_at`
  ).run(params.userId, params.fullName, params.phone || '', params.photoUrl || '', params.address || '', now);

  if (params.institutionId && params.accountType !== 'super_admin') {
    db.prepare(
      `INSERT INTO institution_members (institution_id, user_id, member_type, status, joined_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(institution_id, user_id) DO UPDATE SET
         member_type = excluded.member_type,
         status = excluded.status`
    ).run(params.institutionId, params.userId, params.accountType, params.status || 'active', now);
  }

  if (Array.isArray(params.roleIds)) {
    db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(params.userId);
    const ins = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)');
    for (const rid of params.roleIds) {
      if (rid > 0) ins.run(params.userId, rid);
    }
    const primaryRoleId = params.roleIds[0] || null;
    db.prepare('UPDATE users SET role_id = ? WHERE id = ?').run(primaryRoleId, params.userId);
  }
}

export function getSessionUser(token: string): AuthUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.token, s.institution_id as session_inst_id, s.impersonated_by_user_id, s.session_scope, s.expires_at,
              u.id, u.institution_id as user_inst_id, u.username, u.full_name, u.account_type,
              u.role_id, u.photo_url, u.phone, u.status, u.must_change_password
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as any;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  if (row.status !== 'active') return null;

  const effectiveInstId = row.session_inst_id ?? row.user_inst_id ?? null;
  const sessionScope: SessionScope = row.session_scope === 'super_admin' ? 'super_admin' : 'institution';

  // Enforce strict session scope & institution membership isolation
  if (sessionScope === 'super_admin' && row.account_type !== 'super_admin') {
    return null;
  }

  if (effectiveInstId && row.account_type !== 'super_admin' && !row.impersonated_by_user_id) {
    const inst = db.prepare('SELECT status FROM institutions WHERE id = ?').get(effectiveInstId) as { status: string } | undefined;
    if (!inst || inst.status !== 'active') {
      return null;
    }
    const member = db
      .prepare('SELECT status FROM institution_members WHERE institution_id = ? AND user_id = ?')
      .get(effectiveInstId, row.id) as { status: string } | undefined;
    if (member && member.status !== 'active') {
      return null;
    }
  }

  db.prepare('UPDATE sessions SET last_active_at = ? WHERE token = ?').run(getDhakaNowISO(), token);

  const resolved = resolveUserRolesAndRouting({
    userId: row.id,
    primaryRoleId: row.role_id,
    accountType: row.account_type,
    impersonatedByUserId: row.impersonated_by_user_id || null,
  });

  return {
    id: row.id,
    institution_id: effectiveInstId,
    username: row.username,
    full_name: row.full_name,
    account_type: row.account_type,
    role_id: row.role_id,
    role_slug: resolved.role_slug,
    role_name: resolved.role_name,
    role_ids: resolved.role_ids,
    role_names: resolved.role_names,
    permissions: resolved.permissions,
    dashboard_route: resolved.dashboard_route,
    session_scope: sessionScope,
    photo_url: row.photo_url || '',
    phone: row.phone || '',
    status: row.status,
    must_change_password: row.must_change_password,
    impersonated_by_user_id: row.impersonated_by_user_id || null,
    session_token: row.token,
  };
}

export function extractBearerToken(req: Request): string {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return '';
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  const user = getSessionUser(token);
  if (!user) {
    return res.status(401).json({ error: 'অননুমোদিত প্রবেশাধিকার। অনুগ্রহ করে পুনরায় লগইন করুন।' });
  }
  req.authUser = user;
  if (user.institution_id) {
    req.institutionId = user.institution_id;
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'লগইন আবশ্যক।' });
  }
  if (
    req.authUser.account_type !== 'super_admin' ||
    req.authUser.session_scope !== 'super_admin' ||
    req.authUser.impersonated_by_user_id
  ) {
    return res.status(403).json({ error: 'শুধুমাত্র সুপার অ্যাডমিনের জন্য সংরক্ষিত।' });
  }
  next();
}

export function requireInstitution(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser || !req.authUser.institution_id || req.authUser.session_scope !== 'institution') {
    return res.status(403).json({ error: 'প্রতিষ্ঠানের প্রেক্ষাপট পাওয়া যায়নি।' });
  }
  req.institutionId = req.authUser.institution_id;
  next();
}

export function requireInstitutionStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser || !req.authUser.institution_id || req.authUser.session_scope !== 'institution') {
    return res.status(403).json({ error: 'প্রতিষ্ঠানের প্রেক্ষাপট পাওয়া যায়নি।' });
  }
  if (req.authUser.account_type === 'student' || req.authUser.account_type === 'guardian') {
    return res.status(403).json({ error: 'এই অংশটি শুধুমাত্র প্রতিষ্ঠানের প্রশাসন ও শিক্ষকমণ্ডলীর জন্য সংরক্ষিত।' });
  }
  next();
}

export function hasPermission(user: AuthUser, moduleName: string, action: string): boolean {
  if (user.account_type === 'institution_admin' || user.account_type === 'super_admin') {
    return true;
  }
  const allowed = user.permissions[moduleName];
  if (!allowed || !Array.isArray(allowed)) return false;
  return allowed.includes(action) || allowed.includes('manage');
}

export function requirePermission(moduleName: string, action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'লগইন আবশ্যক।' });
    }
    if (!hasPermission(req.authUser, moduleName, action)) {
      return res.status(403).json({ error: 'এই কাজটি করার জন্য আপনার প্রয়োজনীয় অনুমতি নেই।' });
    }
    next();
  };
}

export function requireAnyPermission(checks: Array<[string, string]>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'লগইন আবশ্যক।' });
    }
    const ok = checks.some(([mod, act]) => hasPermission(req.authUser!, mod, act));
    if (!ok) {
      return res.status(403).json({ error: 'এই তথ্য দেখার বা পরিচালনার অনুমতি আপনার নেই।' });
    }
    next();
  };
}

// Teacher-level class & subject scoping (prevents teachers from accessing unassigned classes/students/exams)
export function isClassScopedTeacher(user: AuthUser): boolean {
  if (user.account_type !== 'teacher') return false;
  if (user.dashboard_route !== 'teacher') return false;
  return !hasPermission(user, 'academic', 'manage') && !hasPermission(user, 'students', 'manage');
}

export function getTeacherAssignedScope(instId: number, userId: number): {
  teacherId: number | null;
  classIds: Set<number>;
  subjectIdsByClass: Map<number, Set<number> | null>; // null = all subjects in that class
} {
  const teacher = db
    .prepare('SELECT id FROM teachers WHERE user_id = ? AND institution_id = ?')
    .get(userId, instId) as { id: number } | undefined;

  const classIds = new Set<number>();
  const subjectIdsByClass = new Map<number, Set<number> | null>();
  if (!teacher) return { teacherId: null, classIds, subjectIdsByClass };

  const assigns = db
    .prepare('SELECT class_id, subject_id FROM teacher_assignments WHERE teacher_id = ? AND institution_id = ?')
    .all(teacher.id, instId) as Array<{ class_id: number; subject_id: number | null }>;

  for (const a of assigns) {
    classIds.add(a.class_id);
    if (a.subject_id === null) {
      subjectIdsByClass.set(a.class_id, null);
    } else if (subjectIdsByClass.get(a.class_id) !== null) {
      const set = subjectIdsByClass.get(a.class_id) || new Set<number>();
      set.add(a.subject_id);
      subjectIdsByClass.set(a.class_id, set);
    }
  }

  const routineRows = db
    .prepare('SELECT DISTINCT class_id, subject_id FROM routines WHERE teacher_id = ? AND institution_id = ?')
    .all(teacher.id, instId) as Array<{ class_id: number; subject_id: number }>;

  for (const r of routineRows) {
    classIds.add(r.class_id);
    if (subjectIdsByClass.get(r.class_id) !== null) {
      const set = subjectIdsByClass.get(r.class_id) || new Set<number>();
      set.add(r.subject_id);
      subjectIdsByClass.set(r.class_id, set);
    }
  }

  return { teacherId: teacher.id, classIds, subjectIdsByClass };
}

// Sliding-window rate limiter for login endpoints
const loginRateBuckets = new Map<string, number[]>();

export function loginRateLimiter(maxAttempts = 30, windowMs = 15 * 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;
    const recent = (loginRateBuckets.get(ip) || []).filter((ts) => ts > cutoff);
    if (recent.length >= maxAttempts) {
      return res.status(429).json({
        error: 'অতিরিক্ত লগইন প্রচেষ্টার কারণে সাময়িকভাবে অনুরোধ সীমিত করা হয়েছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।',
      });
    }
    recent.push(now);
    loginRateBuckets.set(ip, recent);
    next();
  };
}

export function createSession(params: {
  userId: number;
  institutionId: number | null;
  sessionScope?: SessionScope;
  impersonatedByUserId?: number | null;
  ipAddress?: string;
  userAgent?: string;
}): string {
  const token = generateSessionToken();
  const now = new Date();
  const ttlSetting = db.prepare('SELECT value_json FROM system_settings WHERE key = ?').get('session_ttl_hours') as { value_json: string } | undefined;
  const ttlHours = ttlSetting ? Number(JSON.parse(ttlSetting.value_json)) || 24 : 24;
  const expires = new Date(now.getTime() + ttlHours * 3600 * 1000);
  const scope: SessionScope = params.sessionScope || (params.institutionId ? 'institution' : 'super_admin');

  db.prepare(
    `INSERT INTO sessions (token, user_id, institution_id, impersonated_by_user_id, session_scope, ip_address, user_agent, created_at, expires_at, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    token,
    params.userId,
    params.institutionId,
    params.impersonatedByUserId ?? null,
    scope,
    params.ipAddress || '',
    params.userAgent || '',
    now.toISOString(),
    expires.toISOString(),
    now.toISOString()
  );

  return token;
}

function scrubSensitiveObject(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(scrubSensitiveObject);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (/pass|pin|secret|token|hash|credential|auth/i.test(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object') {
      out[k] = scrubSensitiveObject(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function inferAuditCategory(action: string, targetType: string): string {
  const a = (action || '').toUpperCase();
  const t = (targetType || '').toLowerCase();
  if (
    a.includes('LOGIN') ||
    a.includes('LOGOUT') ||
    a.includes('PASSWORD') ||
    a.includes('FORCE_LOGOUT') ||
    a.includes('BOOTSTRAP') ||
    a.includes('USER_') ||
    a.includes('CREATE_USER') ||
    a.includes('UPDATE_USER') ||
    t === 'user' ||
    t === 'session'
  ) {
    return 'account';
  }
  if (
    a.includes('FEE') ||
    a.includes('SALARY') ||
    a.includes('PAYMENT') ||
    a.includes('FINANCE') ||
    a.includes('TRANSACTION') ||
    a.includes('ADVANCE') ||
    a.includes('DUE') ||
    a.includes('RECEIPT') ||
    t.includes('finance') ||
    t.includes('fee') ||
    t.includes('salary') ||
    t.includes('payment')
  ) {
    return 'finance';
  }
  if (a.includes('EXAM') || a.includes('RESULT') || a.includes('MARK') || t.includes('exam') || t.includes('result')) {
    return 'examination';
  }
  if (a.includes('STUDENT') || t.includes('student')) {
    return 'student';
  }
  if (a.includes('TEACHER') || a.includes('LEAVE') || t.includes('teacher')) {
    return 'teacher';
  }
  if (
    a.includes('DEPARTMENT') ||
    a.includes('CLASS') ||
    a.includes('JAMAAT') ||
    a.includes('BOOK') ||
    a.includes('SUBJECT') ||
    a.includes('ROUTINE') ||
    a.includes('ATTENDANCE') ||
    t.includes('class') ||
    t.includes('jamaat') ||
    t.includes('book') ||
    t.includes('subject') ||
    t.includes('routine') ||
    t.includes('department')
  ) {
    return 'academic';
  }
  return 'administration';
}

export function getAllowedAuditModulesForUser(user: AuthUser): string[] | 'ALL' | null {
  if (
    user.account_type === 'super_admin' ||
    user.account_type === 'institution_admin' ||
    user.role_slug === 'muhtamim' ||
    hasPermission(user, 'settings', 'manage')
  ) {
    return 'ALL';
  }
  if (user.account_type === 'student' || user.account_type === 'guardian') {
    return null;
  }

  const modules = new Set<string>();
  const slugs = new Set<string>([user.role_slug]);
  const roleRows = db
    .prepare(
      `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`
    )
    .all(user.id) as Array<{ slug: string }>;
  for (const rr of roleRows) slugs.add(rr.slug);

  if (slugs.has('muhtamim')) {
    return 'ALL';
  }
  if (slugs.has('nazeme_talimat')) {
    modules.add('academic');
    modules.add('student');
    modules.add('teacher');
    modules.add('examination');
  }
  if (slugs.has('nazeme_maliya') || slugs.has('muhasib')) {
    modules.add('finance');
  }
  if (slugs.has('nazeme_darul_iqama')) {
    modules.add('administration');
    modules.add('student');
  }

  // Also check explicit RBAC permissions for custom administrative roles
  if (hasPermission(user, 'academic', 'manage') || hasPermission(user, 'exams', 'manage') || hasPermission(user, 'exams', 'publish')) {
    modules.add('academic');
    modules.add('examination');
  }
  if (hasPermission(user, 'students', 'manage')) {
    modules.add('student');
  }
  if (hasPermission(user, 'teachers', 'manage')) {
    modules.add('teacher');
  }
  if (hasPermission(user, 'finance', 'manage') || hasPermission(user, 'finance', 'view')) {
    modules.add('finance');
  }

  return modules.size > 0 ? Array.from(modules) : null;
}

export function recordAuditLog(entry: {
  actorUserId: number | null;
  actorName: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId?: string | number;
  targetLabel?: string;
  institutionId?: number | null;
  institutionName?: string;
  module?: string;
  categoryCode?: string;
  description?: string;
  ipAddress?: string;
  result?: 'success' | 'failure';
  details?: Record<string, unknown>;
}) {
  let actorRole = (entry.actorRole || '').trim();
  if (!actorRole && entry.actorUserId) {
    const uRow = db
      .prepare(
        `SELECT u.account_type, r.name as role_name
         FROM users u LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.id = ?`
      )
      .get(entry.actorUserId) as { account_type: string; role_name: string | null } | undefined;
    if (uRow) {
      actorRole =
        uRow.account_type === 'super_admin'
          ? 'সুপার অ্যাডমিন'
          : uRow.account_type === 'institution_admin'
          ? 'মাদ্রাসা মূল অ্যাকাউন্ট'
          : uRow.role_name || uRow.account_type;
    }
  }
  if (!actorRole) {
    actorRole = 'সিস্টেম';
  }

  let institutionName = (entry.institutionName || '').trim();
  if (!institutionName && entry.institutionId) {
    const iRow = db.prepare('SELECT name FROM institutions WHERE id = ?').get(entry.institutionId) as { name: string } | undefined;
    if (iRow) institutionName = iRow.name;
  }

  const category = (entry.categoryCode || entry.module || inferAuditCategory(entry.action, entry.targetType)).toLowerCase();
  const moduleName = (entry.module || category).toLowerCase();
  const safeDetails = scrubSensitiveObject(entry.details || {}) as Record<string, unknown>;
  const description =
    (entry.description || '').trim() ||
    `${entry.action}${entry.targetLabel ? ` — ${entry.targetLabel}` : ''}`;

  db.prepare(
    `INSERT INTO audit_logs (
       actor_user_id, actor_name, actor_role, action, module, category_code,
       target_type, target_id, target_label, description,
       institution_id, institution_name, ip_address, result, details_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.actorUserId,
    entry.actorName,
    actorRole,
    entry.action,
    moduleName,
    category,
    entry.targetType,
    entry.targetId != null ? String(entry.targetId) : '',
    entry.targetLabel || '',
    description,
    entry.institutionId ?? null,
    institutionName,
    entry.ipAddress || '',
    entry.result || 'success',
    JSON.stringify(safeDetails),
    getDhakaNowISO()
  );
}

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim().slice(0, 64);
  }
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
}

export function recordPasswordResetLog(params: {
  institutionId: number | null;
  institutionName?: string;
  targetUserId: number;
  targetUsername: string;
  targetFullName: string;
  targetRole: string;
  resetByUserId: number;
  resetByName: string;
  resetByRole: string;
  resetScope: 'super_admin_institution' | 'super_admin_user' | 'institution_admin_user';
  usedRollAsPin?: boolean;
  ipAddress?: string;
  actionCode?: string;
}) {
  const now = getDhakaNowISO();
  db.prepare(
    `INSERT INTO password_reset_logs (
       institution_id, target_user_id, target_username, target_full_name, target_role,
       reset_by_user_id, reset_by_name, reset_by_role, reset_scope, used_roll_as_pin, ip_address, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.institutionId ?? null,
    params.targetUserId,
    params.targetUsername,
    params.targetFullName,
    params.targetRole,
    params.resetByUserId,
    params.resetByName,
    params.resetByRole,
    params.resetScope,
    params.usedRollAsPin ? 1 : 0,
    params.ipAddress || '',
    now
  );

  const actionCode =
    params.actionCode ||
    (params.resetScope === 'super_admin_institution'
      ? 'RESET_INSTITUTION_PASSWORD'
      : params.resetScope === 'super_admin_user'
      ? 'SUPER_RESET_USER_PASSWORD'
      : 'RESET_USER_PASSWORD');

  recordAuditLog({
    actorUserId: params.resetByUserId,
    actorName: params.resetByName,
    actorRole: params.resetByRole,
    action: actionCode,
    module: 'account',
    categoryCode: 'account',
    targetType: params.resetScope === 'super_admin_institution' ? 'institution' : 'user',
    targetId: params.targetUserId,
    targetLabel: `${params.targetFullName} (${params.targetUsername})`,
    description: params.usedRollAsPin
      ? `${params.resetByName} (${params.resetByRole}) "${params.targetFullName}" (@${params.targetUsername})-এর পাসওয়ার্ড/পিন রোল নম্বর অনুযায়ী রিসেট করেছেন।`
      : `${params.resetByName} (${params.resetByRole}) ব্যবহারকারী "${params.targetFullName}" (@${params.targetUsername}, ${params.targetRole})-এর পাসওয়ার্ড রিসেট করেছেন।`,
    institutionId: params.institutionId ?? null,
    institutionName: params.institutionName,
    ipAddress: params.ipAddress,
    result: 'success',
    details: {
      reset_scope: params.resetScope,
      target_username: params.targetUsername,
      target_role: params.targetRole,
      used_roll_as_pin: Boolean(params.usedRollAsPin),
    },
  });
}

export function seedInstitutionDefaults(institutionId: number) {
  const now = getDhakaNowISO();

  // 1. Seed 26 initial designations
  const insertDesig = db.prepare(
    'INSERT INTO designations (institution_id, name, category, is_default, created_at) VALUES (?, ?, ?, 1, ?)'
  );
  for (const d of INITIAL_DESIGNATIONS) {
    insertDesig.run(institutionId, d.name, d.category, now);
  }

  // 2. Seed 8 initial RBAC roles & sync normalized role_permissions
  const insertRole = db.prepare(
    'INSERT INTO roles (institution_id, name, slug, description, permissions_json, is_system, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
  );
  let muhtamimRoleId = 0;
  for (const r of INITIAL_ROLES) {
    const info = insertRole.run(institutionId, r.name, r.slug, r.description, JSON.stringify(r.permissions), now);
    const roleId = Number(info.lastInsertRowid);
    syncRolePermissions(roleId, r.permissions);
    if (r.slug === 'muhtamim') {
      muhtamimRoleId = roleId;
    }
  }

  // 3. Seed default Administrative Departments
  const insertAdminDept = db.prepare(
    'INSERT INTO admin_departments (institution_id, name, head_name, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertAdminDept.run(institutionId, 'মুহতামিম দপ্তর', '', 'প্রতিষ্ঠানের সার্বিক প্রশাসন ও নীতিনির্ধারণ', 'active', now);
  insertAdminDept.run(institutionId, 'তালিমাত বিভাগ', '', 'শিক্ষা কার্যক্রম, রুটিন ও পরীক্ষা পরিচালনা', 'active', now);
  insertAdminDept.run(institutionId, 'দারুল ইকামা বিভাগ', '', 'আবাসিক ছাত্রাবাস ও শৃঙ্খলা পরিচালনা', 'active', now);
  insertAdminDept.run(institutionId, 'মালিয়া ও হিসাব বিভাগ', '', 'আয়-ব্যয় ও শিক্ষার্থী ফি ব্যবস্থাপনা', 'active', now);

  // 4. Seed default Academic Departments & sample classes
  const insertAcadDept = db.prepare(
    'INSERT INTO academic_departments (institution_id, name, description, status, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const insertClass = db.prepare(
    'INSERT INTO classes (institution_id, department_id, name, display_order, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertSubj = db.prepare(
    'INSERT INTO subjects (institution_id, class_id, name, code, full_marks, pass_marks, created_at) VALUES (?, ?, ?, ?, 100, 33, ?)'
  );

  const hifzId = Number(insertAcadDept.run(institutionId, 'হিফজ বিভাগ', 'পবিত্র কুরআনুল কারীম হিফজ বিভাগ', 'active', now).lastInsertRowid);
  const nazeraId = Number(insertAcadDept.run(institutionId, 'নাজেরা বিভাগ', 'বিশুদ্ধ তেলাওয়াত ও নাজেরা শিক্ষা', 'active', now).lastInsertRowid);
  const kitabId = Number(insertAcadDept.run(institutionId, 'কিতাব বিভাগ', 'দরসে নিজামী কিতাব বিভাগ', 'active', now).lastInsertRowid);
  const ibtedayiId = Number(insertAcadDept.run(institutionId, 'ইবতেদায়ী বিভাগ', 'প্রাথমিক ইসলামী ও সাধারণ শিক্ষা', 'active', now).lastInsertRowid);
  const dawraId = Number(insertAcadDept.run(institutionId, 'দাওরায়ে হাদিস', 'সর্বোচ্চ হাদিস অধ্যায়ন বিভাগ', 'active', now).lastInsertRowid);

  const hifzCls = Number(insertClass.run(institutionId, hifzId, 'হিফজুল কুরআন', 1, 'active', now).lastInsertRowid);
  insertSubj.run(institutionId, hifzCls, 'কুরআন হিফজ (সবক ও আমুখতা)', 'HFZ-01', now);
  insertSubj.run(institutionId, hifzCls, 'তাজবিদ ও মশক', 'HFZ-02', now);

  const nazCls = Number(insertClass.run(institutionId, nazeraId, 'নাজেরা', 1, 'active', now).lastInsertRowid);
  insertSubj.run(institutionId, nazCls, 'নাজেরা কুরআন', 'NZR-01', now);
  insertSubj.run(institutionId, nazCls, 'মাসনূন দোয়া ও মাসআলা', 'NZR-02', now);

  const kitabClasses = ['মিজান', 'নাহবেমীর', 'কাফিয়া', 'শরহে বেকায়া', 'জালালাইন', 'মেশকাত'];
  kitabClasses.forEach((clsName, idx) => {
    const cid = Number(insertClass.run(institutionId, kitabId, clsName, idx + 1, 'active', now).lastInsertRowid);
    if (clsName === 'মিজান') {
      insertSubj.run(institutionId, cid, 'মিজানুস সরফ ও মুনশাইব', 'KTB-101', now);
      insertSubj.run(institutionId, cid, 'নাহু ও তারকীব', 'KTB-102', now);
      insertSubj.run(institutionId, cid, 'ফিকহ (নূরুল ঈযাহ)', 'KTB-103', now);
      insertSubj.run(institutionId, cid, 'আরবি সাহিত্য', 'KTB-104', now);
    } else if (clsName === 'নাহবেমীর') {
      insertSubj.run(institutionId, cid, 'নাহবেমীর', 'KTB-201', now);
      insertSubj.run(institutionId, cid, 'ইলমুস সীগাহ', 'KTB-202', now);
      insertSubj.run(institutionId, cid, 'কুদেরী', 'KTB-203', now);
    }
  });

  const ibtCls = Number(insertClass.run(institutionId, ibtedayiId, 'প্রথম শ্রেণী', 1, 'active', now).lastInsertRowid);
  insertSubj.run(institutionId, ibtCls, 'বাংলা', 'IBT-01', now);
  insertSubj.run(institutionId, ibtCls, 'গণিত', 'IBT-02', now);
  insertSubj.run(institutionId, ibtCls, 'আরবি ও দ্বীনিয়াত', 'IBT-03', now);

  const dawCls = Number(insertClass.run(institutionId, dawraId, 'দাওরায়ে হাদিস', 1, 'active', now).lastInsertRowid);
  insertSubj.run(institutionId, dawCls, 'সহীহ বুখারী শরীফ', 'DWR-01', now);
  insertSubj.run(institutionId, dawCls, 'সহীহ মুসলিম শরীফ', 'DWR-02', now);
  insertSubj.run(institutionId, dawCls, 'জামে তিরমিযী শরীফ', 'DWR-03', now);

  // Seed default Jamaat/Class Names & link seeded classes automatically
  migrateAcademicSetupForInstitution(institutionId);

  // 5. Seed Finance Categories & Default Accounts
  const insertCat = db.prepare(
    'INSERT INTO finance_categories (institution_id, name, type, is_system, created_at) VALUES (?, ?, ?, 1, ?)'
  );
  for (const name of ['শিক্ষার্থী ফি', 'ভর্তি ফি', 'দান ও সদকা', 'বোর্ডিং ফি', 'অন্যান্য আয়']) {
    insertCat.run(institutionId, name, 'income', now);
  }
  for (const name of ['বেতন-ভাতা', 'খাবার ও বোর্ডিং', 'বিদ্যুৎ ও গ্যাস', 'ভাড়া', 'রক্ষণাবেক্ষণ', 'শিক্ষা উপকরণ', 'অন্যান্য ব্যয়']) {
    insertCat.run(institutionId, name, 'expense', now);
  }
  ensurePaymentFinanceCategories(institutionId);

  const insertAcc = db.prepare(
    'INSERT INTO finance_accounts (institution_id, name, account_type, opening_balance, created_at) VALUES (?, ?, ?, 0, ?)'
  );
  insertAcc.run(institutionId, 'প্রধান নগদ তহবিল', 'নগদ', now);
  insertAcc.run(institutionId, 'ব্যাংক হিসাব', 'ব্যাংক', now);
  insertAcc.run(institutionId, 'মোবাইল ব্যাংকিং (বিকাশ/নগদ)', 'মোবাইল ব্যাংকিং', now);

  // 6. Seed default Institution Support Settings
  ensureInstitutionSettings(institutionId);

  return { muhtamimRoleId };
}

export function sanitizeImageUrl(url: unknown, allowSvg = false): string {
  return sanitizeStoredImageRef(url, allowSvg);
}

export function slugifyNameForUsername(name: string): string {
  // Transliterate common Bengali characters to Latin or strip to clean ASCII slug
  const bnMap: Record<string, string> = {
    'অ': 'o', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u', 'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou',
    'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng', 'চ': 'ch', 'ছ': 'ch', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
    'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n', 'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
    'প': 'p', 'ফ': 'f', 'ব': 'b', 'ভ': 'bh', 'ম': 'm', 'য': 'j', 'র': 'r', 'ল': 'l', 'শ': 'sh', 'ষ': 'sh',
    'স': 's', 'হ': 'h', 'ড়': 'r', 'ঢ়': 'rh', 'য়': 'y', 'ৎ': 't', 'ং': 'ng', 'ঃ': 'h', 'ঁ': '',
    'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ৃ': 'ri', 'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou', '্': '',
  };
  let out = '';
  for (const ch of name.trim().toLowerCase()) {
    if (/[a-z0-9]/.test(ch)) {
      out += ch;
    } else if (bnMap[ch] !== undefined) {
      out += bnMap[ch];
    } else if (ch === ' ' || ch === '.' || ch === '-' || ch === '_') {
      // Stop at first word if already meaningful, or skip spaces
      if (out.length >= 4) break;
    }
  }
  out = out.replace(/[^a-z0-9]/g, '').slice(0, 18);
  return out.length >= 2 ? out : 'student';
}

export function generateUniqueUsername(baseName: string): string {
  const base = slugifyNameForUsername(baseName);
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE');
  if (!exists.get(base)) {
    return base;
  }
  for (let i = 1; i <= 9999; i++) {
    const suffix = String(i).padStart(2, '0');
    const candidate = `${base}${suffix}`;
    if (!exists.get(candidate)) {
      return candidate;
    }
  }
  return `${base}${Date.now().toString().slice(-4)}`;
}

export function calculateGrade(
  obtained: number,
  fullMarks: number,
  scale: Array<{ min: number; max: number; grade: string; gpa: number }>
): { grade: string; gpa: number; percentage: number } {
  const percentage = fullMarks > 0 ? Number(((obtained / fullMarks) * 100).toFixed(2)) : 0;
  for (const band of scale) {
    if (percentage >= band.min && percentage <= band.max) {
      return { grade: band.grade, gpa: band.gpa, percentage };
    }
  }
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  for (const band of sorted) {
    if (percentage >= band.min) {
      return { grade: band.grade, gpa: band.gpa, percentage };
    }
  }
  return { grade: 'রাসিব (F)', gpa: 0, percentage };
}
