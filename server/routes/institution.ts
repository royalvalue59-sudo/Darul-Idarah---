import { Router } from 'express';
import {
  DAILY_DAY_OPTION,
  dayOrderSql,
  db,
  DEFAULT_ADMISSION_FIELDS,
  DEFAULT_GRADING_SCALE,
  getDhakaBengaliWeekdayFromYMD,
  getDhakaDateYMD,
  getDhakaNowISO,
  isDailyDayValue,
  normalizeScheduleDay,
} from '../db.ts';
import {
  calculateGrade,
  generateUniqueUsername,
  getClientIp,
  getTeacherAssignedScope,
  hashPassword,
  hasPermission,
  isClassScopedTeacher,
  recordAuditLog,
  recordPasswordResetLog,
  requireAnyPermission,
  requireAuth,
  requireInstitution,
  requireInstitutionStaff,
  requirePermission,
  sanitizeImageUrl,
  syncRolePermissions,
  syncUserIdentity,
} from '../auth.ts';
import {
  FILE_TOO_LARGE_ERROR,
  MAX_FILE_SIZE_BYTES,
  sanitizeStoredAttachmentRef,
  UPLOADED_ASSET_URL_RE,
} from '../uploadPolicy.ts';
import { notifyUserSessionsRevoked } from '../realtime.ts';
import {
  ensureTeacherProfile,
  isValidTimeHM,
  recomputeInstitutionLiveStatuses,
  timeToMinutes,
} from '../services/teacherEngine.ts';

export const institutionRouter = Router();
institutionRouter.use(requireAuth, requireInstitution, requireInstitutionStaff);

// ==================== 1. DASHBOARD ====================
institutionRouter.get('/dashboard', (req, res) => {
  const instId = req.institutionId!;
  const today = getDhakaDateYMD();
  const monthPrefix = today.slice(0, 7);

  const studentCounts = db
    .prepare(
      `SELECT COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive
       FROM students WHERE institution_id = ?`
    )
    .get(instId) as any;

  const teacherCount = (
    db.prepare("SELECT COUNT(*) as c FROM teachers WHERE institution_id = ? AND status = 'active'").get(instId) as { c: number }
  ).c;

  const deptCount = (
    db.prepare('SELECT COUNT(*) as c FROM academic_departments WHERE institution_id = ?').get(instId) as { c: number }
  ).c;

  const classCount = (
    db.prepare('SELECT COUNT(*) as c FROM classes WHERE institution_id = ?').get(instId) as { c: number }
  ).c;

  const todayAtt = db
    .prepare(
      `SELECT
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave_count
       FROM student_attendance WHERE institution_id = ? AND attendance_date = ?`
    )
    .get(instId, today) as any;

  const canViewFinance = hasPermission(req.authUser!, 'finance', 'view');
  const canViewHostel = hasPermission(req.authUser!, 'hostel', 'view') || hasPermission(req.authUser!, 'students', 'view');

  const financeTotals = canViewFinance
    ? (db
        .prepare(
          `SELECT
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
            COALESCE(SUM(CASE WHEN type = 'income' AND tx_date = ? THEN amount ELSE 0 END), 0) as today_income,
            COALESCE(SUM(CASE WHEN type = 'expense' AND tx_date = ? THEN amount ELSE 0 END), 0) as today_expense,
            COALESCE(SUM(CASE WHEN type = 'income' AND substr(tx_date,1,7) = ? THEN amount ELSE 0 END), 0) as month_income,
            COALESCE(SUM(CASE WHEN type = 'expense' AND substr(tx_date,1,7) = ? THEN amount ELSE 0 END), 0) as month_expense
           FROM finance_transactions WHERE institution_id = ?`
        )
        .get(today, today, monthPrefix, monthPrefix, instId) as any)
    : null;

  const hostelResidentCount = canViewHostel
    ? (db.prepare("SELECT COUNT(*) as c FROM hostel_allocations WHERE institution_id = ? AND status = 'active'").get(instId) as { c: number }).c
    : 0;

  const issuedBooksCount = hasPermission(req.authUser!, 'library', 'view')
    ? (db.prepare("SELECT COUNT(*) as c FROM library_issues WHERE institution_id = ? AND status != 'returned'").get(instId) as { c: number }).c
    : 0;

  const recentNotices = db
    .prepare(
      `SELECT id, title, publish_date, audience_type, created_by_name
       FROM notices
       WHERE (institution_id = ? OR institution_id IS NULL) AND status = 'published'
       ORDER BY created_at DESC LIMIT 5`
    )
    .all(instId);

  const recentTransactions = canViewFinance
    ? db
        .prepare(
          `SELECT id, tx_date, type, category_name, description, amount, payment_method
           FROM finance_transactions WHERE institution_id = ?
           ORDER BY created_at DESC LIMIT 6`
        )
        .all(instId)
    : [];

  const monthlySeries = canViewFinance
    ? db
        .prepare(
          `SELECT substr(tx_date, 1, 7) as month,
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
           FROM finance_transactions
           WHERE institution_id = ?
           GROUP BY substr(tx_date, 1, 7)
           ORDER BY month ASC LIMIT 6`
        )
        .all(instId)
    : [];

  const deptBreakdown = db
    .prepare(
      `SELECT d.name, COUNT(s.id) as students
       FROM academic_departments d
       LEFT JOIN students s ON s.department_id = d.id AND s.institution_id = d.institution_id AND s.status = 'active'
       WHERE d.institution_id = ?
       GROUP BY d.id`
    )
    .all(instId);

  res.json({
    stats: {
      totalStudents: studentCounts?.total || 0,
      activeStudents: studentCounts?.active || 0,
      inactiveStudents: studentCounts?.inactive || 0,
      activeTeachers: teacherCount,
      departments: deptCount,
      classes: classCount,
      todayPresent: todayAtt?.present || 0,
      todayAbsent: todayAtt?.absent || 0,
      todayLate: todayAtt?.late || 0,
      todayLeave: todayAtt?.leave_count || 0,
      totalIncome: Number((financeTotals?.total_income || 0).toFixed(2)),
      totalExpense: Number((financeTotals?.total_expense || 0).toFixed(2)),
      balance: Number(((financeTotals?.total_income || 0) - (financeTotals?.total_expense || 0)).toFixed(2)),
      todayIncome: Number((financeTotals?.today_income || 0).toFixed(2)),
      todayExpense: Number((financeTotals?.today_expense || 0).toFixed(2)),
      monthIncome: Number((financeTotals?.month_income || 0).toFixed(2)),
      monthExpense: Number((financeTotals?.month_expense || 0).toFixed(2)),
      hostelResidents: hostelResidentCount,
      issuedBooks: issuedBooksCount,
    },
    recentNotices,
    recentTransactions,
    monthlySeries,
    deptBreakdown,
  });
});

// ==================== 2. INSTITUTION PROFILE & SETTINGS ====================
institutionRouter.get('/profile', (req, res) => {
  const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(req.institutionId!) as any;
  if (!inst) return res.status(404).json({ error: 'প্রতিষ্ঠান পাওয়া যায়নি।' });
  res.json({
    institution: {
      ...inst,
      grading_scale: JSON.parse(inst.grading_scale_json || JSON.stringify(DEFAULT_GRADING_SCALE)),
      admission_fields: JSON.parse(inst.admission_fields_json || JSON.stringify(DEFAULT_ADMISSION_FIELDS)),
    },
  });
});

institutionRouter.put('/profile', requirePermission('profile', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(instId) as any;
  if (!inst) return res.status(404).json({ error: 'প্রতিষ্ঠান পাওয়া যায়নি।' });

  const name = String(req.body?.name || inst.name).trim();
  const address = String(req.body?.address ?? inst.address).trim();
  const phone = String(req.body?.phone ?? inst.phone).trim();
  const motto = String(req.body?.motto ?? inst.motto).trim();
  const established_year = String(req.body?.established_year ?? inst.established_year).trim();
  const academic_year = String(req.body?.academic_year ?? inst.academic_year).trim();
  const logo_url = req.body?.logo_url !== undefined ? sanitizeImageUrl(req.body.logo_url, true) : inst.logo_url;

  db.prepare(
    `UPDATE institutions SET name = ?, address = ?, phone = ?, motto = ?, established_year = ?, academic_year = ?, logo_url = ?, updated_at = ?
     WHERE id = ?`
  ).run(name, address, phone, motto, established_year, academic_year, logo_url, getDhakaNowISO(), instId);

  res.json({ success: true });
});

institutionRouter.put('/settings', requirePermission('settings', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(instId) as any;
  if (!inst) return res.status(404).json({ error: 'প্রতিষ্ঠান পাওয়া যায়নি।' });

  const gradingScale = Array.isArray(req.body?.grading_scale) ? req.body.grading_scale : null;
  const admissionFields = req.body?.admission_fields && typeof req.body.admission_fields === 'object' ? req.body.admission_fields : null;

  db.prepare(
    `UPDATE institutions SET grading_scale_json = ?, admission_fields_json = ?, updated_at = ? WHERE id = ?`
  ).run(
    gradingScale ? JSON.stringify(gradingScale) : inst.grading_scale_json,
    admissionFields ? JSON.stringify(admissionFields) : inst.admission_fields_json,
    getDhakaNowISO(),
    instId
  );

  res.json({ success: true });
});

// ==================== 3. ROLES & PERMISSIONS ====================
institutionRouter.get('/roles', (req, res) => {
  const roles = db
    .prepare('SELECT * FROM roles WHERE institution_id = ? ORDER BY id ASC')
    .all(req.institutionId!)
    .map((r: any) => ({ ...r, permissions: JSON.parse(r.permissions_json || '{}') }));
  res.json({ roles });
});

institutionRouter.post('/roles', requirePermission('settings', 'manage'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim();
  const permissions = req.body?.permissions && typeof req.body.permissions === 'object' ? req.body.permissions : {};
  if (!name) return res.status(400).json({ error: 'ভূমিকার নাম আবশ্যক।' });
  const slug = `custom_${Date.now()}`;
  const info = db
    .prepare(
      `INSERT INTO roles (institution_id, name, slug, description, permissions_json, is_system, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    )
    .run(req.institutionId!, name, slug, description, JSON.stringify(permissions), getDhakaNowISO());
  const roleId = Number(info.lastInsertRowid);
  syncRolePermissions(roleId, permissions);
  res.status(201).json({ id: roleId });
});

institutionRouter.put('/roles/:id', requirePermission('settings', 'manage'), (req, res) => {
  const id = Number(req.params.id);
  const role = db.prepare('SELECT * FROM roles WHERE id = ? AND institution_id = ?').get(id, req.institutionId!) as any;
  if (!role) return res.status(404).json({ error: 'রোল পাওয়া যায়নি।' });

  const name = String(req.body?.name || role.name).trim();
  const description = String(req.body?.description ?? role.description).trim();
  const permissions = req.body?.permissions && typeof req.body.permissions === 'object' ? req.body.permissions : JSON.parse(role.permissions_json || '{}');

  db.prepare('UPDATE roles SET name = ?, description = ?, permissions_json = ? WHERE id = ? AND institution_id = ?').run(
    name,
    description,
    JSON.stringify(permissions),
    id,
    req.institutionId!
  );
  syncRolePermissions(id, permissions);
  res.json({ success: true });
});

// ==================== 3B. INSTITUTION USER ACCOUNTS MANAGEMENT ====================
institutionRouter.get('/users', requirePermission('settings', 'manage'), (req, res) => {
  const instId = req.institutionId!;
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.account_type, u.role_id, u.phone, u.status,
              u.must_change_password, u.last_login_at, u.created_at, r.name as primary_role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.institution_id = ?
       ORDER BY u.created_at DESC`
    )
    .all(instId) as any[];

  const roleStmt = db.prepare(
    `SELECT r.id, r.name, r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`
  );
  const enriched = rows.map((u) => {
    const roles = roleStmt.all(u.id) as Array<{ id: number; name: string; slug: string }>;
    return {
      ...u,
      role_ids: roles.map((r) => r.id),
      role_names: roles.map((r) => r.name),
    };
  });
  res.json({ users: enriched });
});

institutionRouter.post('/users', requirePermission('settings', 'manage'), (req, res) => {
  const instId = req.institutionId!;
  const full_name = String(req.body?.full_name || '').trim();
  const username = String(req.body?.username || '').trim();
  const phone = String(req.body?.phone || req.body?.mobile || '').trim();
  const rawPassword = String(req.body?.password || '').trim();
  const requestedType = String(req.body?.account_type || 'staff');
  const account_type: 'institution_admin' | 'staff' | 'teacher' | 'guardian' =
    requestedType === 'institution_admin' && req.authUser!.account_type === 'institution_admin'
      ? 'institution_admin'
      : requestedType === 'teacher'
      ? 'teacher'
      : requestedType === 'guardian'
      ? 'guardian'
      : 'staff';

  const rawRoleIds: number[] = Array.isArray(req.body?.role_ids)
    ? req.body.role_ids.map(Number).filter((n: number) => n > 0)
    : req.body?.role_id
    ? [Number(req.body.role_id)]
    : [];

  if (!full_name || !/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'নাম এবং বৈধ ইউজারনেম (কমপক্ষে ৩ অক্ষর) আবশ্যক।' });
  }

  // Initial password: explicit password or registered mobile for teacher/staff
  const usedMobileAsPassword = !rawPassword && (account_type === 'teacher' || account_type === 'staff') && phone.length >= 4;
  const effectivePassword = rawPassword || (usedMobileAsPassword ? phone : '');
  if (effectivePassword.length < 4) {
    return res.status(400).json({ error: 'কমপক্ষে ৪ অক্ষরের পাসওয়ার্ড অথবা নিবন্ধিত মোবাইল নম্বর প্রদান করুন।' });
  }

  const dup = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (dup) return res.status(409).json({ error: 'এই ইউজারনেমটি ইতিমধ্যেই ব্যবহৃত হচ্ছে।' });

  // Validate all role_ids belong to this institution
  const validRoleIds: number[] = [];
  for (const rid of rawRoleIds) {
    const r = db.prepare('SELECT id FROM roles WHERE id = ? AND institution_id = ?').get(rid, instId) as { id: number } | undefined;
    if (r) validRoleIds.push(r.id);
  }
  if (validRoleIds.length === 0) {
    const defaultSlug = account_type === 'guardian' ? 'guardian' : 'teacher';
    const defRole = db.prepare('SELECT id FROM roles WHERE institution_id = ? AND slug = ? LIMIT 1').get(instId, defaultSlug) as { id: number } | undefined;
    if (defRole) validRoleIds.push(defRole.id);
  }

  const photo_url = sanitizeImageUrl(req.body?.photo_url);
  const now = getDhakaNowISO();
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO users (institution_id, username, password_hash, full_name, account_type, role_id, phone, photo_url, status, must_change_password, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(instId, username, hashPassword(effectivePassword), full_name, account_type, validRoleIds[0] ?? null, phone, photo_url, usedMobileAsPassword ? 1 : 0, now);
    const userId = Number(info.lastInsertRowid);

    syncUserIdentity({
      userId,
      institutionId: instId,
      accountType: account_type,
      fullName: full_name,
      phone,
      photoUrl: photo_url,
      status: 'active',
      roleIds: validRoleIds,
    });

    if (account_type === 'teacher' || account_type === 'staff') {
      db.prepare(
        `INSERT INTO teachers (institution_id, user_id, full_name, mobile, photo_url, joining_date, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`
      ).run(instId, userId, full_name, phone, photo_url, getDhakaDateYMD(), now);
    } else if (account_type === 'guardian') {
      db.prepare(
        `INSERT INTO guardians (institution_id, user_id, full_name, mobile, address, created_at)
         VALUES (?, ?, ?, ?, '', ?)`
      ).run(instId, userId, full_name, phone, now);
    }

    return userId;
  });

  const userId = tx();
  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'CREATE_INSTITUTION_USER',
    targetType: 'user',
    targetId: userId,
    targetLabel: `${full_name} (${username})`,
    institutionId: instId,
  });

  res.status(201).json({ id: userId, username, usedMobileAsPassword });
});

institutionRouter.patch('/users/:id/roles', requirePermission('settings', 'manage'), (req, res) => {
  const instId = req.institutionId!;
  const targetId = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ? AND institution_id = ?').get(targetId, instId) as any;
  if (!target) return res.status(404).json({ error: 'ব্যবহারকারী পাওয়া যায়নি।' });
  if (target.account_type === 'institution_admin' && req.authUser!.account_type !== 'institution_admin') {
    return res.status(403).json({ error: 'মাদ্রাসার মূল অ্যাকাউন্টের রোল পরিবর্তন করা যাবে না।' });
  }

  const rawRoleIds: number[] = Array.isArray(req.body?.role_ids) ? req.body.role_ids.map(Number) : [];
  const validRoleIds: number[] = [];
  for (const rid of rawRoleIds) {
    const r = db.prepare('SELECT id FROM roles WHERE id = ? AND institution_id = ?').get(rid, instId) as { id: number } | undefined;
    if (r) validRoleIds.push(r.id);
  }
  if (validRoleIds.length === 0) {
    return res.status(400).json({ error: 'কমপক্ষে একটি বৈধ রোল নির্বাচন করুন।' });
  }

  syncUserIdentity({
    userId: targetId,
    institutionId: instId,
    accountType: target.account_type,
    fullName: target.full_name,
    phone: target.phone,
    photoUrl: target.photo_url,
    status: target.status,
    roleIds: validRoleIds,
  });

  res.json({ success: true });
});

institutionRouter.patch('/users/:id/status', requirePermission('settings', 'manage'), (req, res) => {
  const instId = req.institutionId!;
  const targetId = Number(req.params.id);
  const status = String(req.body?.status || '');
  if (!['active', 'inactive', 'locked'].includes(status)) {
    return res.status(400).json({ error: 'অবৈধ স্ট্যাটাস।' });
  }
  if (targetId === req.authUser!.id) {
    return res.status(400).json({ error: 'নিজের অ্যাকাউন্টের স্ট্যাটাস পরিবর্তন করা যাবে না।' });
  }
  const target = db.prepare('SELECT id, username, account_type FROM users WHERE id = ? AND institution_id = ?').get(targetId, instId) as any;
  if (!target) return res.status(404).json({ error: 'ব্যবহারকারী পাওয়া যায়নি।' });
  if (target.account_type === 'institution_admin') {
    return res.status(403).json({ error: 'মাদ্রাসার মূল অ্যাকাউন্ট নিষ্ক্রিয় করা যাবে না।' });
  }

  db.prepare('UPDATE users SET status = ?, locked_until = NULL, failed_attempts = 0 WHERE id = ? AND institution_id = ?').run(status, targetId, instId);
  db.prepare('UPDATE institution_members SET status = ? WHERE institution_id = ? AND user_id = ?').run(status, instId, targetId);
  if (status !== 'active') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
    notifyUserSessionsRevoked(targetId);
  }

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: `INST_USER_STATUS_${status.toUpperCase()}`,
    targetType: 'user',
    targetId,
    targetLabel: target.username,
    institutionId: instId,
  });
  res.json({ success: true });
});

institutionRouter.patch('/users/:id/photo', requirePermission('settings', 'manage'), (req, res) => {
  const instId = req.institutionId!;
  const targetId = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ? AND institution_id = ?').get(targetId, instId) as any;
  if (!target) return res.status(404).json({ error: 'ব্যবহারকারী পাওয়া যায়নি।' });

  const photo_url = sanitizeImageUrl(req.body?.photo_url);
  db.prepare('UPDATE users SET photo_url = ? WHERE id = ? AND institution_id = ?').run(photo_url, targetId, instId);
  db.prepare('UPDATE user_profiles SET photo_url = ?, updated_at = ? WHERE user_id = ?').run(photo_url, getDhakaNowISO(), targetId);
  if (target.account_type === 'teacher' || target.account_type === 'staff') {
    db.prepare('UPDATE teachers SET photo_url = ? WHERE user_id = ? AND institution_id = ?').run(photo_url, targetId, instId);
  } else if (target.account_type === 'student') {
    db.prepare('UPDATE students SET photo_url = ? WHERE user_id = ? AND institution_id = ?').run(photo_url, targetId, instId);
  }
  res.json({ success: true, photo_url });
});

institutionRouter.post('/users/:id/reset-password', requirePermission('settings', 'manage'), (req, res) => {
  const instId = req.institutionId!;
  const targetId = Number(req.params.id);
  const newPassword = String(req.body?.password || '').trim();
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'নতুন পাসওয়ার্ড/পিন কমপক্ষে ৪ অক্ষরের হতে হবে।' });
  }
  const target = db.prepare('SELECT id, username, full_name, account_type FROM users WHERE id = ? AND institution_id = ?').get(targetId, instId) as any;
  if (!target) return res.status(404).json({ error: 'ব্যবহারকারী পাওয়া যায়নি।' });
  if (target.account_type === 'institution_admin' && req.authUser!.account_type !== 'institution_admin') {
    return res.status(403).json({ error: 'মাদ্রাসার মূল অ্যাকাউন্টের পাসওয়ার্ড রিসেট করার অনুমতি নেই।' });
  }

  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ? AND institution_id = ?').run(
    hashPassword(newPassword),
    targetId,
    instId
  );

  const ip = getClientIp(req);
  recordPasswordResetLog({
    institutionId: instId,
    targetUserId: target.id,
    targetUsername: target.username,
    targetFullName: target.full_name || target.username,
    targetRole: target.account_type,
    resetByUserId: req.authUser!.id,
    resetByName: req.authUser!.full_name,
    resetByRole: req.authUser!.role_name || req.authUser!.account_type,
    resetScope: 'institution_admin_user',
    usedRollAsPin: Boolean(req.body?.use_roll_as_pin),
    ipAddress: ip,
  });

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    actorRole: req.authUser!.role_name,
    action: 'INST_RESET_USER_PASSWORD',
    module: 'account',
    categoryCode: 'account',
    targetType: 'user',
    targetId,
    targetLabel: target.username,
    description: `${req.authUser!.full_name} ব্যবহারকারী ${target.username}-এর পাসওয়ার্ড রিসেট করেছেন`,
    institutionId: instId,
    ipAddress: ip,
  });
  res.json({ success: true });
});

institutionRouter.get(
  '/password-reset-logs',
  requireAnyPermission([
    ['settings', 'view'],
    ['settings', 'manage'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const logs = db
      .prepare(
        `SELECT * FROM password_reset_logs
         WHERE institution_id = ?
         ORDER BY created_at DESC
         LIMIT 200`
      )
      .all(instId);
    res.json({ logs });
  }
);

// ==================== 4. ADMINISTRATIVE DEPARTMENTS (প্রশাসনিক বিভাগ) ====================
institutionRouter.get('/admin-departments', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM admin_departments WHERE institution_id = ? ORDER BY id ASC')
    .all(req.institutionId!);
  res.json({ departments: rows });
});

institutionRouter.post('/admin-departments', requirePermission('admin_departments', 'create'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'বিভাগের নাম আবশ্যক।' });
  const info = db
    .prepare(
      'INSERT INTO admin_departments (institution_id, name, head_name, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      req.institutionId!,
      name,
      String(req.body?.head_name || '').trim(),
      String(req.body?.description || '').trim(),
      'active',
      getDhakaNowISO()
    );
  res.status(201).json({ department: db.prepare('SELECT * FROM admin_departments WHERE id = ?').get(info.lastInsertRowid) });
});

institutionRouter.put('/admin-departments/:id', requirePermission('admin_departments', 'edit'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare(
    'UPDATE admin_departments SET name = ?, head_name = ?, description = ?, status = ? WHERE id = ? AND institution_id = ?'
  ).run(
    String(req.body?.name || '').trim(),
    String(req.body?.head_name || '').trim(),
    String(req.body?.description || '').trim(),
    String(req.body?.status || 'active'),
    id,
    req.institutionId!
  );
  res.json({ success: true });
});

institutionRouter.delete('/admin-departments/:id', requirePermission('admin_departments', 'delete'), (req, res) => {
  db.prepare('DELETE FROM admin_departments WHERE id = ? AND institution_id = ?').run(Number(req.params.id), req.institutionId!);
  res.json({ success: true });
});

// ==================== 5. DESIGNATIONS (পদবি) ====================
institutionRouter.get('/designations', (req, res) => {
  const rows = db
    .prepare(
      `SELECT d.*,
        (SELECT COUNT(*) FROM teacher_designations td WHERE td.designation_id = d.id) as assigned_count
       FROM designations d WHERE d.institution_id = ? ORDER BY d.category ASC, d.id ASC`
    )
    .all(req.institutionId!);
  res.json({ designations: rows });
});

institutionRouter.post('/designations', requirePermission('designations', 'create'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  const category = ['administrative', 'academic', 'other'].includes(req.body?.category) ? req.body.category : 'other';
  if (!name) return res.status(400).json({ error: 'পদবির নাম আবশ্যক।' });
  const info = db
    .prepare('INSERT INTO designations (institution_id, name, category, is_default, created_at) VALUES (?, ?, ?, 0, ?)')
    .run(req.institutionId!, name, category, getDhakaNowISO());
  res.status(201).json({ designation: db.prepare('SELECT * FROM designations WHERE id = ?').get(info.lastInsertRowid) });
});

institutionRouter.put('/designations/:id', requirePermission('designations', 'edit'), (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body?.name || '').trim();
  const category = ['administrative', 'academic', 'other'].includes(req.body?.category) ? req.body.category : 'other';
  if (!name) return res.status(400).json({ error: 'পদবির নাম আবশ্যক।' });
  db.prepare('UPDATE designations SET name = ?, category = ? WHERE id = ? AND institution_id = ?').run(
    name,
    category,
    id,
    req.institutionId!
  );
  res.json({ success: true });
});

institutionRouter.delete('/designations/:id', requirePermission('designations', 'delete'), (req, res) => {
  db.prepare('DELETE FROM designations WHERE id = ? AND institution_id = ?').run(Number(req.params.id), req.institutionId!);
  res.json({ success: true });
});

// ==================== 6. ACADEMIC SETUP: DEPARTMENTS, CLASSES, JAMAAT NAMES, SUBJECTS, ROUTINE ====================
const ACADEMIC_READ_PERMS: Array<[string, string]> = [
  ['academic', 'view'],
  ['students', 'view'],
  ['teachers', 'view'],
  ['attendance', 'view'],
  ['exams', 'view'],
  ['notices', 'create'],
  ['reports', 'view'],
];

const VALID_ACADEMIC_STATUSES = ['active', 'inactive', 'archived'] as const;
type AcademicStatus = (typeof VALID_ACADEMIC_STATUSES)[number];
function parseAcademicStatus(raw: unknown, fallback: AcademicStatus = 'active'): AcademicStatus {
  const s = String(raw || '').trim();
  return (VALID_ACADEMIC_STATUSES as readonly string[]).includes(s) ? (s as AcademicStatus) : fallback;
}

function validateBookCoverUrl(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const val = String(raw ?? '').trim();
  if (!val) return { ok: true, value: '' };
  if (UPLOADED_ASSET_URL_RE.test(val)) {
    return { ok: true, value: val };
  }
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(val)) {
    const b64Part = val.split(',')[1] || '';
    const approxBytes = Math.floor((b64Part.length * 3) / 4);
    if (approxBytes > MAX_FILE_SIZE_BYTES) {
      return { ok: false, error: FILE_TOO_LARGE_ERROR };
    }
    return { ok: true, value: val };
  }
  if (/^\/src\/assets\/images\/[A-Za-z0-9._-]+$/.test(val)) {
    return { ok: true, value: val };
  }
  return { ok: false, error: 'কিতাবের ছবির ফরম্যাট সঠিক নয় (শুধুমাত্র JPG, JPEG, PNG, WEBP অনুমোদিত)।' };
}

function getBooksForClassAndJamaats(instId: number, classId: number | null, jamaatIds: number[]) {
  const seen = new Map<number, any>();
  if (classId) {
    const clsBooks = db
      .prepare(
        `SELECT b.id, b.book_code, b.name, b.arabic_name, b.short_name, b.author_name, b.publisher_name, b.cover_image_url, b.status, 'class' as link_source
         FROM class_books cb
         JOIN academic_books b ON b.id = cb.book_id
         WHERE cb.class_id = ? AND cb.institution_id = ? AND b.institution_id = ?
         ORDER BY cb.id ASC`
      )
      .all(classId, instId, instId) as any[];
    for (const b of clsBooks) seen.set(b.id, b);
  }
  const cleanJids = Array.from(new Set(jamaatIds.filter((n) => Number.isInteger(n) && n > 0)));
  if (cleanJids.length > 0) {
    const placeholders = cleanJids.map(() => '?').join(',');
    const jamBooks = db
      .prepare(
        `SELECT b.id, b.book_code, b.name, b.arabic_name, b.short_name, b.author_name, b.publisher_name, b.cover_image_url, b.status, 'jamaat' as link_source
         FROM jamaat_books jb
         JOIN academic_books b ON b.id = jb.book_id
         WHERE jb.jamaat_id IN (${placeholders}) AND jb.institution_id = ? AND b.institution_id = ?
         ORDER BY jb.id ASC`
      )
      .all(...cleanJids, instId, instId) as any[];
    for (const b of jamBooks) {
      if (!seen.has(b.id)) seen.set(b.id, b);
    }
  }
  return Array.from(seen.values());
}

// --- 6A. Departments (বিভাগ এড) ---
institutionRouter.get('/departments', requireAnyPermission(ACADEMIC_READ_PERMS), (req, res) => {
  const instId = req.institutionId!;
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();

  let sql = `
    SELECT d.*,
      (SELECT COUNT(*) FROM classes c WHERE c.department_id = d.id AND c.institution_id = d.institution_id) as class_count,
      (SELECT COUNT(*) FROM jamaat_names j WHERE j.department_id = d.id AND j.institution_id = d.institution_id) as jamaat_count,
      (SELECT COUNT(*) FROM students s WHERE s.department_id = d.id AND s.institution_id = d.institution_id AND s.status = 'active') as student_count,
      (SELECT COUNT(*) FROM students s WHERE s.department_id = d.id AND s.institution_id = d.institution_id) as total_student_count,
      (SELECT COUNT(*) FROM teachers t WHERE t.department_id = d.id AND t.institution_id = d.institution_id) as teacher_count,
      (SELECT COUNT(*) FROM routines r WHERE r.department_id = d.id AND r.institution_id = d.institution_id) as routine_count,
      (SELECT COUNT(*) FROM examinations e WHERE e.department_id = d.id AND e.institution_id = d.institution_id) as exam_count
    FROM academic_departments d
    WHERE d.institution_id = ?
  `;
  const params: any[] = [instId];
  if (status && status !== 'all') {
    sql += ' AND d.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (d.name LIKE ? OR d.description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY d.id ASC';

  const rows = (db.prepare(sql).all(...params) as any[]).map((r) => ({
    ...r,
    usage_count:
      Number(r.class_count || 0) +
      Number(r.jamaat_count || 0) +
      Number(r.total_student_count || 0) +
      Number(r.teacher_count || 0) +
      Number(r.routine_count || 0) +
      Number(r.exam_count || 0),
  }));
  res.json({ departments: rows });
});

institutionRouter.post('/departments', requirePermission('academic', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim();
  const status = parseAcademicStatus(req.body?.status, 'active');

  if (!name) return res.status(400).json({ error: 'বিভাগের নাম আবশ্যক।' });

  const dup = db
    .prepare('SELECT id FROM academic_departments WHERE institution_id = ? AND name = ? COLLATE NOCASE')
    .get(instId, name);
  if (dup) return res.status(409).json({ error: 'এই নামে ইতিমধ্যেই একটি বিভাগ রয়েছে।' });

  const info = db
    .prepare('INSERT INTO academic_departments (institution_id, name, description, status, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(instId, name, description, status, getDhakaNowISO());
  const createdId = Number(info.lastInsertRowid);

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'CREATE_DEPARTMENT',
    targetType: 'academic_department',
    targetId: createdId,
    targetLabel: name,
    institutionId: instId,
  });

  res.status(201).json({ department: db.prepare('SELECT * FROM academic_departments WHERE id = ?').get(createdId) });
});

institutionRouter.put('/departments/:id', requirePermission('academic', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT * FROM academic_departments WHERE id = ? AND institution_id = ?')
    .get(id, instId) as any;
  if (!existing) return res.status(404).json({ error: 'বিভাগ পাওয়া যায়নি।' });

  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description ?? existing.description).trim();
  const status = parseAcademicStatus(req.body?.status, existing.status as AcademicStatus);

  if (!name) return res.status(400).json({ error: 'বিভাগের নাম আবশ্যক।' });

  const dup = db
    .prepare('SELECT id FROM academic_departments WHERE institution_id = ? AND name = ? COLLATE NOCASE AND id != ?')
    .get(instId, name, id);
  if (dup) return res.status(409).json({ error: 'এই নামে অন্য একটি বিভাগ ইতিমধ্যেই রয়েছে।' });

  db.prepare('UPDATE academic_departments SET name = ?, description = ?, status = ? WHERE id = ? AND institution_id = ?').run(
    name,
    description,
    status,
    id,
    instId
  );

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'UPDATE_DEPARTMENT',
    targetType: 'academic_department',
    targetId: id,
    targetLabel: name,
    institutionId: instId,
  });

  res.json({ department: db.prepare('SELECT * FROM academic_departments WHERE id = ?').get(id), success: true });
});

institutionRouter.patch('/departments/:id/status', requirePermission('academic', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const statusRaw = String(req.body?.status || '').trim();
  if (!(VALID_ACADEMIC_STATUSES as readonly string[]).includes(statusRaw)) {
    return res.status(400).json({ error: 'অবৈধ স্ট্যাটাস।' });
  }
  const existing = db
    .prepare('SELECT id, name FROM academic_departments WHERE id = ? AND institution_id = ?')
    .get(id, instId) as { id: number; name: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'বিভাগ পাওয়া যায়নি।' });

  db.prepare('UPDATE academic_departments SET status = ? WHERE id = ? AND institution_id = ?').run(statusRaw, id, instId);
  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'UPDATE_DEPARTMENT_STATUS',
    targetType: 'academic_department',
    targetId: id,
    targetLabel: `${existing.name} (${statusRaw})`,
    institutionId: instId,
  });

  res.json({ success: true, status: statusRaw });
});

institutionRouter.delete('/departments/:id', requirePermission('academic', 'delete'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT id, name FROM academic_departments WHERE id = ? AND institution_id = ?')
    .get(id, instId) as { id: number; name: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'বিভাগ পাওয়া যায়নি।' });

  const usage = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM classes WHERE department_id = ? AND institution_id = ?) as classes,
        (SELECT COUNT(*) FROM jamaat_names WHERE department_id = ? AND institution_id = ?) as jamaats,
        (SELECT COUNT(*) FROM students WHERE department_id = ? AND institution_id = ?) as students,
        (SELECT COUNT(*) FROM teachers WHERE department_id = ? AND institution_id = ?) as teachers,
        (SELECT COUNT(*) FROM routines WHERE department_id = ? AND institution_id = ?) as routines,
        (SELECT COUNT(*) FROM examinations WHERE department_id = ? AND institution_id = ?) as exams`
    )
    .get(id, instId, id, instId, id, instId, id, instId, id, instId, id, instId) as Record<string, number>;

  const usageCount =
    Number(usage.classes || 0) +
    Number(usage.jamaats || 0) +
    Number(usage.students || 0) +
    Number(usage.teachers || 0) +
    Number(usage.routines || 0) +
    Number(usage.exams || 0);

  if (usageCount > 0) {
    return res.status(409).json({
      error: 'এই বিভাগের সাথে যুক্ত ক্লাস, শিক্ষার্থী বা একাডেমিক তথ্য রয়েছে। সরাসরি মুছে না ফেলে আর্কাইভ বা নিষ্ক্রিয় করুন।',
      inUse: true,
      usageCount,
      usage,
      canArchive: true,
    });
  }

  db.prepare('DELETE FROM academic_departments WHERE id = ? AND institution_id = ?').run(id, instId);
  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'DELETE_DEPARTMENT',
    targetType: 'academic_department',
    targetId: id,
    targetLabel: existing.name,
    institutionId: instId,
  });

  res.json({ success: true });
});

// --- 6A-2. Academic Books (কিতাব / বই এড) ---
institutionRouter.get('/books', requireAnyPermission(ACADEMIC_READ_PERMS), (req, res) => {
  const instId = req.institutionId!;
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const classId = req.query.class_id ? Number(req.query.class_id) : null;
  const jamaatId = req.query.jamaat_id ? Number(req.query.jamaat_id) : null;

  let sql = `
    SELECT b.*,
      (SELECT COUNT(*) FROM class_books cb WHERE cb.book_id = b.id AND cb.institution_id = b.institution_id) as class_count,
      (SELECT COUNT(*) FROM jamaat_books jb WHERE jb.book_id = b.id AND jb.institution_id = b.institution_id) as jamaat_count,
      (SELECT COUNT(*) FROM subjects sub WHERE sub.book_id = b.id AND sub.institution_id = b.institution_id) as subject_count
    FROM academic_books b
    WHERE b.institution_id = ?
  `;
  const params: any[] = [instId];

  if (classId) {
    sql += ` AND (
      b.id IN (SELECT cb.book_id FROM class_books cb WHERE cb.class_id = ? AND cb.institution_id = ?)
      OR b.id IN (
        SELECT jb.book_id FROM jamaat_books jb
        WHERE jb.institution_id = ? AND (
          jb.jamaat_id IN (SELECT cj.jamaat_id FROM class_jamaats cj WHERE cj.class_id = ? AND cj.institution_id = ?)
          OR jb.jamaat_id = (SELECT c.jamaat_id FROM classes c WHERE c.id = ? AND c.institution_id = ?)
        )
      )
    )`;
    params.push(classId, instId, instId, classId, instId, classId, instId);
  }
  if (jamaatId) {
    sql += ` AND b.id IN (SELECT jb.book_id FROM jamaat_books jb WHERE jb.jamaat_id = ? AND jb.institution_id = ?)`;
    params.push(jamaatId, instId);
  }
  if (status && status !== 'all') {
    sql += ' AND b.status = ?';
    params.push(status);
  }
  if (search) {
    sql +=
      ' AND (b.name LIKE ? OR b.arabic_name LIKE ? OR b.short_name LIKE ? OR b.author_name LIKE ? OR b.publisher_name LIKE ? OR b.book_code LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY b.id DESC';

  const linkedClassesStmt = db.prepare(
    `SELECT c.id, c.name, d.name as department_name
     FROM class_books cb
     JOIN classes c ON c.id = cb.class_id
     LEFT JOIN academic_departments d ON d.id = c.department_id
     WHERE cb.book_id = ? AND cb.institution_id = ?
     ORDER BY c.id ASC`
  );
  const linkedJamaatsStmt = db.prepare(
    `SELECT j.id, j.name, j.short_name
     FROM jamaat_books jb
     JOIN jamaat_names j ON j.id = jb.jamaat_id
     WHERE jb.book_id = ? AND jb.institution_id = ?
     ORDER BY j.id ASC`
  );

  const books = (db.prepare(sql).all(...params) as any[]).map((b) => {
    const classes = linkedClassesStmt.all(b.id, instId);
    const jamaats = linkedJamaatsStmt.all(b.id, instId);
    return {
      ...b,
      classes,
      jamaats,
      usage_count: Number(b.class_count || 0) + Number(b.jamaat_count || 0) + Number(b.subject_count || 0),
    };
  });

  res.json({ books });
});

institutionRouter.post('/books', requirePermission('academic', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const name = String(req.body?.name || '').trim();
  const arabic_name = String(req.body?.arabic_name || '').trim();
  const short_name = String(req.body?.short_name || '').trim();
  const author_name = String(req.body?.author_name || '').trim();
  const publisher_name = String(req.body?.publisher_name || '').trim();
  const description = String(req.body?.description || '').trim();
  const status = parseAcademicStatus(req.body?.status, 'active');

  if (!name) return res.status(400).json({ error: 'কিতাব / বইয়ের নাম আবশ্যক।' });

  const imgCheck = validateBookCoverUrl(req.body?.cover_image_url);
  if (!imgCheck.ok) return res.status(400).json({ error: imgCheck.error });

  const now = getDhakaNowISO();
  const tx = db.transaction(() => {
    db.prepare('UPDATE institutions SET book_counter = book_counter + 1 WHERE id = ?').run(instId);
    const { book_counter } = db.prepare('SELECT book_counter FROM institutions WHERE id = ?').get(instId) as {
      book_counter: number;
    };
    const bookCode = `KITAB-${String(book_counter).padStart(6, '0')}`;
    const info = db
      .prepare(
        `INSERT INTO academic_books
         (institution_id, book_code, name, arabic_name, short_name, author_name, publisher_name, description, cover_image_url, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        instId,
        bookCode,
        name,
        arabic_name,
        short_name,
        author_name,
        publisher_name,
        description,
        imgCheck.value,
        status,
        now,
        now
      );
    return Number(info.lastInsertRowid);
  });

  const createdId = tx();
  const book = db.prepare('SELECT * FROM academic_books WHERE id = ?').get(createdId) as any;

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'CREATE_ACADEMIC_BOOK',
    targetType: 'academic_book',
    targetId: createdId,
    targetLabel: `${book.book_code} — ${name}`,
    institutionId: instId,
  });

  res.status(201).json({ book });
});

institutionRouter.put('/books/:id', requirePermission('academic', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM academic_books WHERE id = ? AND institution_id = ?').get(id, instId) as any;
  if (!existing) return res.status(404).json({ error: 'কিতাব / বই পাওয়া যায়নি।' });

  const name = String(req.body?.name || '').trim();
  const arabic_name = String(req.body?.arabic_name ?? existing.arabic_name ?? '').trim();
  const short_name = String(req.body?.short_name ?? existing.short_name ?? '').trim();
  const author_name = String(req.body?.author_name ?? existing.author_name ?? '').trim();
  const publisher_name = String(req.body?.publisher_name ?? existing.publisher_name ?? '').trim();
  const description = String(req.body?.description ?? existing.description ?? '').trim();
  const status = parseAcademicStatus(req.body?.status, existing.status as AcademicStatus);

  if (!name) return res.status(400).json({ error: 'কিতাব / বইয়ের নাম আবশ্যক।' });

  const imgInput = req.body?.cover_image_url !== undefined ? req.body.cover_image_url : existing.cover_image_url;
  const imgCheck = validateBookCoverUrl(imgInput);
  if (!imgCheck.ok) return res.status(400).json({ error: imgCheck.error });

  db.prepare(
    `UPDATE academic_books
     SET name = ?, arabic_name = ?, short_name = ?, author_name = ?, publisher_name = ?, description = ?, cover_image_url = ?, status = ?, updated_at = ?
     WHERE id = ? AND institution_id = ?`
  ).run(
    name,
    arabic_name,
    short_name,
    author_name,
    publisher_name,
    description,
    imgCheck.value,
    status,
    getDhakaNowISO(),
    id,
    instId
  );

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'UPDATE_ACADEMIC_BOOK',
    targetType: 'academic_book',
    targetId: id,
    targetLabel: `${existing.book_code} — ${name}`,
    institutionId: instId,
  });

  res.json({ book: db.prepare('SELECT * FROM academic_books WHERE id = ?').get(id), success: true });
});

institutionRouter.patch('/books/:id/status', requirePermission('academic', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const statusRaw = String(req.body?.status || '').trim();
  if (!(VALID_ACADEMIC_STATUSES as readonly string[]).includes(statusRaw)) {
    return res.status(400).json({ error: 'অবৈধ স্ট্যাটাস।' });
  }
  const existing = db
    .prepare('SELECT id, name, book_code FROM academic_books WHERE id = ? AND institution_id = ?')
    .get(id, instId) as { id: number; name: string; book_code: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'কিতাব / বই পাওয়া যায়নি।' });

  db.prepare('UPDATE academic_books SET status = ?, updated_at = ? WHERE id = ? AND institution_id = ?').run(
    statusRaw,
    getDhakaNowISO(),
    id,
    instId
  );

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'UPDATE_ACADEMIC_BOOK_STATUS',
    targetType: 'academic_book',
    targetId: id,
    targetLabel: `${existing.book_code} — ${existing.name} (${statusRaw})`,
    institutionId: instId,
  });

  res.json({ success: true, status: statusRaw });
});

institutionRouter.delete('/books/:id', requirePermission('academic', 'delete'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT id, name, book_code FROM academic_books WHERE id = ? AND institution_id = ?')
    .get(id, instId) as { id: number; name: string; book_code: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'কিতাব / বই পাওয়া যায়নি।' });

  const usage = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM class_books WHERE book_id = ? AND institution_id = ?) as classes,
        (SELECT COUNT(*) FROM jamaat_books WHERE book_id = ? AND institution_id = ?) as jamaats,
        (SELECT COUNT(*) FROM subjects WHERE book_id = ? AND institution_id = ?) as subjects`
    )
    .get(id, instId, id, instId, id, instId) as Record<string, number>;

  const usageCount = Number(usage.classes || 0) + Number(usage.jamaats || 0) + Number(usage.subjects || 0);
  if (usageCount > 0) {
    return res.status(409).json({
      error: 'এই কিতাবটি এক বা একাধিক ক্লাস, জামাত বা বিষয়ের সাথে যুক্ত রয়েছে। সরাসরি মুছে না ফেলে আর্কাইভ বা নিষ্ক্রিয় করুন।',
      inUse: true,
      usageCount,
      usage,
      canArchive: true,
    });
  }

  db.prepare('DELETE FROM academic_books WHERE id = ? AND institution_id = ?').run(id, instId);
  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'DELETE_ACADEMIC_BOOK',
    targetType: 'academic_book',
    targetId: id,
    targetLabel: `${existing.book_code} — ${existing.name}`,
    institutionId: instId,
  });

  res.json({ success: true });
});

// --- 6B. Classes (ক্লাস ম্যানেজমেন্ট) ---
institutionRouter.get('/classes', requireAnyPermission(ACADEMIC_READ_PERMS), (req, res) => {
  const instId = req.institutionId!;
  const deptId = req.query.department_id ? Number(req.query.department_id) : null;
  const jamaatId = req.query.jamaat_id ? Number(req.query.jamaat_id) : null;
  const status = String(req.query.status || '').trim();
  const search = String(req.query.search || '').trim();

  let sql = `
    SELECT c.*, d.name as department_name,
      pj.name as jamaat_name, pj.short_name as jamaat_short_name,
      (SELECT COUNT(*) FROM subjects sub WHERE sub.class_id = c.id AND sub.institution_id = c.institution_id) as subject_count,
      (SELECT COUNT(*) FROM class_books cb WHERE cb.class_id = c.id AND cb.institution_id = c.institution_id) as direct_book_count,
      (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.institution_id = c.institution_id AND s.status = 'active') as student_count,
      (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.institution_id = c.institution_id) as total_student_count,
      (SELECT COUNT(*) FROM teacher_assignments ta WHERE ta.class_id = c.id AND ta.institution_id = c.institution_id) as assignment_count,
      (SELECT COUNT(*) FROM routines r WHERE r.class_id = c.id AND r.institution_id = c.institution_id) as routine_count,
      (SELECT COUNT(*) FROM examinations e WHERE e.class_id = c.id AND e.institution_id = c.institution_id) as exam_count
    FROM classes c
    JOIN academic_departments d ON d.id = c.department_id
    LEFT JOIN jamaat_names pj ON pj.id = c.jamaat_id
    WHERE c.institution_id = ?
  `;
  const params: any[] = [instId];
  if (deptId) {
    sql += ' AND c.department_id = ?';
    params.push(deptId);
  }
  if (jamaatId) {
    sql +=
      ' AND (c.jamaat_id = ? OR c.id IN (SELECT cj.class_id FROM class_jamaats cj WHERE cj.jamaat_id = ? AND cj.institution_id = ?))';
    params.push(jamaatId, jamaatId, instId);
  }
  if (status && status !== 'all') {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (c.name LIKE ? OR c.description LIKE ? OR d.name LIKE ? OR COALESCE(pj.name, \'\') LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (isClassScopedTeacher(req.authUser!)) {
    const scope = getTeacherAssignedScope(instId, req.authUser!.id);
    if (scope.classIds.size === 0) return res.json({ classes: [] });
    const ids = Array.from(scope.classIds);
    sql += ` AND c.id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }
  sql += ' ORDER BY c.department_id ASC, c.display_order ASC, c.id ASC';

  const jamaatStmt = db.prepare(
    `SELECT j.id, j.name, j.short_name, j.status
     FROM class_jamaats cj
     JOIN jamaat_names j ON j.id = cj.jamaat_id
     WHERE cj.class_id = ? AND cj.institution_id = ?
     ORDER BY cj.id ASC`
  );
  const directBookStmt = db.prepare(
    `SELECT b.id, b.book_code, b.name, b.arabic_name, b.short_name, b.author_name, b.cover_image_url, b.status
     FROM class_books cb
     JOIN academic_books b ON b.id = cb.book_id
     WHERE cb.class_id = ? AND cb.institution_id = ? AND b.institution_id = ?
     ORDER BY cb.id ASC`
  );

  const classes = (db.prepare(sql).all(...params) as any[]).map((c) => {
    const jamaats = jamaatStmt.all(c.id, instId) as Array<{ id: number; name: string; short_name: string; status: string }>;
    const jamaatIds = jamaats.map((j) => j.id);
    if (c.jamaat_id && !jamaatIds.includes(c.jamaat_id)) jamaatIds.unshift(c.jamaat_id);
    const books = directBookStmt.all(c.id, instId, instId) as any[];
    const effective_books = getBooksForClassAndJamaats(instId, c.id, jamaatIds);
    return {
      ...c,
      jamaat_id: c.jamaat_id || jamaats[0]?.id || null,
      jamaat_name: c.jamaat_name || jamaats[0]?.name || '',
      jamaats,
      jamaat_ids: jamaatIds,
      books,
      book_ids: books.map((b) => b.id),
      effective_books,
      book_count: effective_books.length,
      usage_count:
        Number(c.total_student_count || 0) +
        Number(c.subject_count || 0) +
        Number(c.assignment_count || 0) +
        Number(c.routine_count || 0) +
        Number(c.exam_count || 0),
    };
  });

  res.json({ classes });
});

institutionRouter.post('/classes', requirePermission('academic', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const department_id = Number(req.body?.department_id);
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim();
  const display_order = Number(req.body?.display_order || 0);
  const status = parseAcademicStatus(req.body?.status, 'active');

  const explicitJamaatId = req.body?.jamaat_id ? Number(req.body.jamaat_id) : null;
  const rawJamaatIds: number[] = Array.isArray(req.body?.jamaat_ids)
    ? Array.from(new Set(req.body.jamaat_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)))
    : [];
  if (explicitJamaatId && !rawJamaatIds.includes(explicitJamaatId)) {
    rawJamaatIds.unshift(explicitJamaatId);
  }
  const primaryJamaatId = explicitJamaatId || rawJamaatIds[0] || null;

  const rawBookIds: number[] = Array.isArray(req.body?.book_ids)
    ? Array.from(new Set(req.body.book_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)))
    : [];
  const syncBooksToSubjects = Boolean(req.body?.sync_books_to_subjects);

  if (!department_id || !name) return res.status(400).json({ error: 'বিভাগ ও ক্লাসের নাম আবশ্যক।' });
  const dept = db
    .prepare('SELECT id FROM academic_departments WHERE id = ? AND institution_id = ?')
    .get(department_id, instId);
  if (!dept) return res.status(404).json({ error: 'বিভাগ পাওয়া যায়নি।' });

  const dup = db
    .prepare('SELECT id FROM classes WHERE institution_id = ? AND department_id = ? AND name = ? COLLATE NOCASE')
    .get(instId, department_id, name);
  if (dup) return res.status(409).json({ error: 'এই বিভাগে একই নামে ইতিমধ্যেই একটি ক্লাস রয়েছে।' });

  const checkJamaat = db.prepare('SELECT id FROM jamaat_names WHERE id = ? AND institution_id = ?');
  for (const jid of rawJamaatIds) {
    if (!checkJamaat.get(jid, instId)) {
      return res.status(400).json({ error: 'নির্বাচিত শ্রেণী/জামাতের নাম এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
    }
  }

  const checkBook = db.prepare('SELECT id, name, short_name, book_code FROM academic_books WHERE id = ? AND institution_id = ?');
  const verifiedBooks: Array<{ id: number; name: string; short_name: string; book_code: string }> = [];
  for (const bid of rawBookIds) {
    const b = checkBook.get(bid, instId) as any;
    if (!b) {
      return res.status(400).json({ error: 'নির্বাচিত কিতাব / বই এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
    }
    verifiedBooks.push(b);
  }

  const now = getDhakaNowISO();
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO classes (institution_id, department_id, jamaat_id, name, description, display_order, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(instId, department_id, primaryJamaatId, name, description, display_order, status, now);
    const classId = Number(info.lastInsertRowid);

    const insLink = db.prepare(
      'INSERT OR IGNORE INTO class_jamaats (institution_id, class_id, jamaat_id, created_at) VALUES (?, ?, ?, ?)'
    );
    for (const jid of rawJamaatIds) {
      insLink.run(instId, classId, jid, now);
    }

    const insBook = db.prepare(
      'INSERT OR IGNORE INTO class_books (institution_id, class_id, book_id, created_at) VALUES (?, ?, ?, ?)'
    );
    const insSub = db.prepare(
      'INSERT INTO subjects (institution_id, class_id, book_id, name, code, full_marks, pass_marks, created_at) VALUES (?, ?, ?, ?, ?, 100, 33, ?)'
    );
    for (const b of verifiedBooks) {
      insBook.run(instId, classId, b.id, now);
      if (syncBooksToSubjects) {
        insSub.run(instId, classId, b.id, b.name, b.short_name || b.book_code, now);
      }
    }
    return classId;
  });

  const classId = tx();
  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'CREATE_CLASS',
    targetType: 'class',
    targetId: classId,
    targetLabel: name,
    institutionId: instId,
  });

  const classItem = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId) as any;
  const jamaats = db
    .prepare(
      `SELECT j.id, j.name, j.short_name, j.status
       FROM class_jamaats cj JOIN jamaat_names j ON j.id = cj.jamaat_id
       WHERE cj.class_id = ? AND cj.institution_id = ?`
    )
    .all(classId, instId) as any[];
  const books = db
    .prepare(
      `SELECT b.id, b.book_code, b.name, b.arabic_name, b.short_name, b.author_name, b.cover_image_url, b.status
       FROM class_books cb JOIN academic_books b ON b.id = cb.book_id
       WHERE cb.class_id = ? AND cb.institution_id = ?`
    )
    .all(classId, instId) as any[];
  res.status(201).json({
    classItem: {
      ...classItem,
      jamaats,
      jamaat_ids: jamaats.map((j) => j.id),
      books,
      book_ids: books.map((b) => b.id),
      effective_books: getBooksForClassAndJamaats(instId, classId, jamaats.map((j) => j.id)),
    },
  });
});

institutionRouter.put('/classes/:id', requirePermission('academic', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM classes WHERE id = ? AND institution_id = ?').get(id, instId) as any;
  if (!existing) return res.status(404).json({ error: 'ক্লাস পাওয়া যায়নি।' });

  const name = String(req.body?.name || '').trim();
  const department_id = Number(req.body?.department_id || existing.department_id);
  const description = String(req.body?.description ?? existing.description ?? '').trim();
  const display_order = req.body?.display_order !== undefined ? Number(req.body.display_order) : Number(existing.display_order || 0);
  const status = parseAcademicStatus(req.body?.status, existing.status as AcademicStatus);

  if (!name || !department_id) return res.status(400).json({ error: 'বিভাগ ও ক্লাসের নাম আবশ্যক।' });

  const dept = db
    .prepare('SELECT id FROM academic_departments WHERE id = ? AND institution_id = ?')
    .get(department_id, instId);
  if (!dept) return res.status(404).json({ error: 'বিভাগ পাওয়া যায়নি।' });

  const dup = db
    .prepare('SELECT id FROM classes WHERE institution_id = ? AND department_id = ? AND name = ? COLLATE NOCASE AND id != ?')
    .get(instId, department_id, name, id);
  if (dup) return res.status(409).json({ error: 'এই বিভাগে একই নামে অন্য একটি ক্লাস ইতিমধ্যেই রয়েছে।' });

  const hasJamaatField = req.body?.jamaat_id !== undefined || Array.isArray(req.body?.jamaat_ids);
  const explicitJamaatId = req.body?.jamaat_id ? Number(req.body.jamaat_id) : null;
  let rawJamaatIds: number[] = Array.isArray(req.body?.jamaat_ids)
    ? Array.from(new Set(req.body.jamaat_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)))
    : [];
  if (explicitJamaatId && !rawJamaatIds.includes(explicitJamaatId)) {
    rawJamaatIds.unshift(explicitJamaatId);
  }
  const nextPrimaryJamaatId = hasJamaatField ? explicitJamaatId || rawJamaatIds[0] || null : existing.jamaat_id ?? null;

  if (hasJamaatField) {
    const checkJamaat = db.prepare('SELECT id FROM jamaat_names WHERE id = ? AND institution_id = ?');
    for (const jid of rawJamaatIds) {
      if (!checkJamaat.get(jid, instId)) {
        return res.status(400).json({ error: 'নির্বাচিত শ্রেণী/জামাতের নাম এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
      }
    }
  }

  const hasBooksUpdate = Array.isArray(req.body?.book_ids);
  const rawBookIds: number[] = hasBooksUpdate
    ? Array.from(new Set(req.body.book_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)))
    : [];
  const verifiedBooks: Array<{ id: number; name: string; short_name: string; book_code: string }> = [];
  if (hasBooksUpdate) {
    const checkBook = db.prepare('SELECT id, name, short_name, book_code FROM academic_books WHERE id = ? AND institution_id = ?');
    for (const bid of rawBookIds) {
      const b = checkBook.get(bid, instId) as any;
      if (!b) {
        return res.status(400).json({ error: 'নির্বাচিত কিতাব / বই এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
      }
      verifiedBooks.push(b);
    }
  }
  const syncBooksToSubjects = Boolean(req.body?.sync_books_to_subjects);

  const now = getDhakaNowISO();
  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE classes SET name = ?, department_id = ?, jamaat_id = ?, description = ?, display_order = ?, status = ? WHERE id = ? AND institution_id = ?'
    ).run(name, department_id, nextPrimaryJamaatId, description, display_order, status, id, instId);

    if (hasJamaatField) {
      db.prepare('DELETE FROM class_jamaats WHERE class_id = ? AND institution_id = ?').run(id, instId);
      const insLink = db.prepare(
        'INSERT OR IGNORE INTO class_jamaats (institution_id, class_id, jamaat_id, created_at) VALUES (?, ?, ?, ?)'
      );
      for (const jid of rawJamaatIds) {
        insLink.run(instId, id, jid, now);
      }
    }

    if (hasBooksUpdate) {
      db.prepare('DELETE FROM class_books WHERE class_id = ? AND institution_id = ?').run(id, instId);
      const insBook = db.prepare(
        'INSERT OR IGNORE INTO class_books (institution_id, class_id, book_id, created_at) VALUES (?, ?, ?, ?)'
      );
      const existingSubByBook = db.prepare(
        'SELECT id FROM subjects WHERE institution_id = ? AND class_id = ? AND (book_id = ? OR name = ? COLLATE NOCASE) LIMIT 1'
      );
      const insSub = db.prepare(
        'INSERT INTO subjects (institution_id, class_id, book_id, name, code, full_marks, pass_marks, created_at) VALUES (?, ?, ?, ?, ?, 100, 33, ?)'
      );
      for (const b of verifiedBooks) {
        insBook.run(instId, id, b.id, now);
        if (syncBooksToSubjects && !existingSubByBook.get(instId, id, b.id, b.name)) {
          insSub.run(instId, id, b.id, b.name, b.short_name || b.book_code, now);
        }
      }
    }
  });
  tx();

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'UPDATE_CLASS',
    targetType: 'class',
    targetId: id,
    targetLabel: name,
    institutionId: instId,
  });

  res.json({ success: true });
});

institutionRouter.patch('/classes/:id/status', requirePermission('academic', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const statusRaw = String(req.body?.status || '').trim();
  if (!(VALID_ACADEMIC_STATUSES as readonly string[]).includes(statusRaw)) {
    return res.status(400).json({ error: 'অবৈধ স্ট্যাটাস।' });
  }
  const existing = db.prepare('SELECT id, name FROM classes WHERE id = ? AND institution_id = ?').get(id, instId) as
    | { id: number; name: string }
    | undefined;
  if (!existing) return res.status(404).json({ error: 'ক্লাস পাওয়া যায়নি।' });

  db.prepare('UPDATE classes SET status = ? WHERE id = ? AND institution_id = ?').run(statusRaw, id, instId);
  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'UPDATE_CLASS_STATUS',
    targetType: 'class',
    targetId: id,
    targetLabel: `${existing.name} (${statusRaw})`,
    institutionId: instId,
  });
  res.json({ success: true, status: statusRaw });
});

institutionRouter.delete('/classes/:id', requirePermission('academic', 'delete'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id, name FROM classes WHERE id = ? AND institution_id = ?').get(id, instId) as
    | { id: number; name: string }
    | undefined;
  if (!existing) return res.status(404).json({ error: 'ক্লাস পাওয়া যায়নি।' });

  const usage = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM students WHERE class_id = ? AND institution_id = ?) as students,
        (SELECT COUNT(*) FROM subjects WHERE class_id = ? AND institution_id = ?) as subjects,
        (SELECT COUNT(*) FROM teacher_assignments WHERE class_id = ? AND institution_id = ?) as assignments,
        (SELECT COUNT(*) FROM routines WHERE class_id = ? AND institution_id = ?) as routines,
        (SELECT COUNT(*) FROM examinations WHERE class_id = ? AND institution_id = ?) as exams`
    )
    .get(id, instId, id, instId, id, instId, id, instId, id, instId) as Record<string, number>;

  const usageCount =
    Number(usage.students || 0) +
    Number(usage.subjects || 0) +
    Number(usage.assignments || 0) +
    Number(usage.routines || 0) +
    Number(usage.exams || 0);

  if (usageCount > 0) {
    return res.status(409).json({
      error: 'এই ক্লাসের সাথে শিক্ষার্থী, বিষয়, রুটিন বা পরীক্ষা যুক্ত রয়েছে। সরাসরি মুছে না ফেলে আর্কাইভ বা নিষ্ক্রিয় করুন।',
      inUse: true,
      usageCount,
      usage,
      canArchive: true,
    });
  }

  db.prepare('DELETE FROM classes WHERE id = ? AND institution_id = ?').run(id, instId);
  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'DELETE_CLASS',
    targetType: 'class',
    targetId: id,
    targetLabel: existing.name,
    institutionId: instId,
  });
  res.json({ success: true });
});

// --- 6C. Jamaat / Class Names (শ্রেণী / জামাতের নাম) ---
institutionRouter.get('/jamaats', requireAnyPermission(ACADEMIC_READ_PERMS), (req, res) => {
  const instId = req.institutionId!;
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const classId = req.query.class_id ? Number(req.query.class_id) : null;
  const deptId = req.query.department_id ? Number(req.query.department_id) : null;

  let sql = `
    SELECT j.*, d.name as department_name,
      (SELECT COUNT(DISTINCT cid) FROM (
         SELECT cj.class_id as cid FROM class_jamaats cj WHERE cj.jamaat_id = j.id AND cj.institution_id = j.institution_id
         UNION
         SELECT c.id as cid FROM classes c WHERE c.jamaat_id = j.id AND c.institution_id = j.institution_id
       )) as class_count,
      (SELECT COUNT(*) FROM jamaat_books jb WHERE jb.jamaat_id = j.id AND jb.institution_id = j.institution_id) as book_count,
      (SELECT COUNT(*) FROM students s WHERE s.jamaat_id = j.id AND s.institution_id = j.institution_id AND s.status = 'active') as student_count,
      (SELECT COUNT(*) FROM students s WHERE s.jamaat_id = j.id AND s.institution_id = j.institution_id) as total_student_count,
      (SELECT COUNT(*) FROM teacher_assignments ta WHERE ta.jamaat_id = j.id AND ta.institution_id = j.institution_id) as assignment_count,
      (SELECT COUNT(*) FROM routines r WHERE r.jamaat_id = j.id AND r.institution_id = j.institution_id) as routine_count,
      (SELECT COUNT(*) FROM examinations e WHERE e.jamaat_id = j.id AND e.institution_id = j.institution_id) as exam_count
    FROM jamaat_names j
    LEFT JOIN academic_departments d ON d.id = j.department_id
    WHERE j.institution_id = ?
  `;
  const params: any[] = [instId];

  if (deptId) {
    sql += ' AND j.department_id = ?';
    params.push(deptId);
  }
  if (classId) {
    sql +=
      ' AND (j.id IN (SELECT cj.jamaat_id FROM class_jamaats cj WHERE cj.class_id = ? AND cj.institution_id = ?) OR j.id = (SELECT c.jamaat_id FROM classes c WHERE c.id = ? AND c.institution_id = ?))';
    params.push(classId, instId, classId, instId);
  }
  if (status && status !== 'all') {
    sql += ' AND j.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (j.name LIKE ? OR j.short_name LIKE ? OR j.description LIKE ? OR COALESCE(d.name, \'\') LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY j.id ASC';

  const booksStmt = db.prepare(
    `SELECT b.id, b.book_code, b.name, b.arabic_name, b.short_name, b.author_name, b.cover_image_url, b.status
     FROM jamaat_books jb
     JOIN academic_books b ON b.id = jb.book_id
     WHERE jb.jamaat_id = ? AND jb.institution_id = ? AND b.institution_id = ?
     ORDER BY jb.id ASC`
  );

  const jamaats = (db.prepare(sql).all(...params) as any[]).map((j) => {
    const books = booksStmt.all(j.id, instId, instId) as any[];
    return {
      ...j,
      books,
      book_ids: books.map((b) => b.id),
      usage_count:
        Number(j.class_count || 0) +
        Number(j.total_student_count || 0) +
        Number(j.assignment_count || 0) +
        Number(j.routine_count || 0) +
        Number(j.exam_count || 0),
    };
  });

  res.json({ jamaats });
});

institutionRouter.post('/jamaats', requirePermission('academic', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const name = String(req.body?.name || '').trim();
  const short_name = String(req.body?.short_name || '').trim();
  const description = String(req.body?.description || '').trim();
  const status = parseAcademicStatus(req.body?.status, 'active');
  const department_id = req.body?.department_id ? Number(req.body.department_id) : null;
  const rawBookIds: number[] = Array.isArray(req.body?.book_ids)
    ? Array.from(new Set(req.body.book_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)))
    : [];

  if (!name) return res.status(400).json({ error: 'শ্রেণী / জামাতের নাম আবশ্যক।' });

  if (department_id) {
    const dept = db
      .prepare('SELECT id FROM academic_departments WHERE id = ? AND institution_id = ?')
      .get(department_id, instId);
    if (!dept) return res.status(400).json({ error: 'নির্বাচিত বিভাগ এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
  }

  const checkBook = db.prepare('SELECT id FROM academic_books WHERE id = ? AND institution_id = ?');
  for (const bid of rawBookIds) {
    if (!checkBook.get(bid, instId)) {
      return res.status(400).json({ error: 'নির্বাচিত কিতাব / বই এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
    }
  }

  const dup = db
    .prepare('SELECT id FROM jamaat_names WHERE institution_id = ? AND name = ? COLLATE NOCASE')
    .get(instId, name);
  if (dup) return res.status(409).json({ error: 'এই নামে ইতিমধ্যেই একটি শ্রেণী/জামাত রয়েছে।' });

  const now = getDhakaNowISO();
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO jamaat_names (institution_id, department_id, name, short_name, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(instId, department_id, name, short_name, description, status, now);
    const createdId = Number(info.lastInsertRowid);
    const insBook = db.prepare(
      'INSERT OR IGNORE INTO jamaat_books (institution_id, jamaat_id, book_id, created_at) VALUES (?, ?, ?, ?)'
    );
    for (const bid of rawBookIds) {
      insBook.run(instId, createdId, bid, now);
    }
    return createdId;
  });

  const createdId = tx();
  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'CREATE_JAMAAT_NAME',
    targetType: 'jamaat_name',
    targetId: createdId,
    targetLabel: name,
    institutionId: instId,
  });

  const jamaat = db.prepare('SELECT * FROM jamaat_names WHERE id = ?').get(createdId) as any;
  const books = db
    .prepare(
      `SELECT b.id, b.book_code, b.name, b.arabic_name, b.short_name, b.status
       FROM jamaat_books jb JOIN academic_books b ON b.id = jb.book_id
       WHERE jb.jamaat_id = ? AND jb.institution_id = ?`
    )
    .all(createdId, instId) as any[];
  res.status(201).json({ jamaat: { ...jamaat, books, book_ids: books.map((b) => b.id) } });
});

institutionRouter.put('/jamaats/:id', requirePermission('academic', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM jamaat_names WHERE id = ? AND institution_id = ?').get(id, instId) as any;
  if (!existing) return res.status(404).json({ error: 'শ্রেণী / জামাতের নাম পাওয়া যায়নি।' });

  const name = String(req.body?.name || '').trim();
  const short_name = String(req.body?.short_name ?? existing.short_name ?? '').trim();
  const description = String(req.body?.description ?? existing.description ?? '').trim();
  const status = parseAcademicStatus(req.body?.status, existing.status as AcademicStatus);
  const hasDept = req.body?.department_id !== undefined;
  const department_id = hasDept
    ? req.body.department_id
      ? Number(req.body.department_id)
      : null
    : existing.department_id ?? null;

  if (!name) return res.status(400).json({ error: 'শ্রেণী / জামাতের নাম আবশ্যক।' });

  if (department_id) {
    const dept = db
      .prepare('SELECT id FROM academic_departments WHERE id = ? AND institution_id = ?')
      .get(department_id, instId);
    if (!dept) return res.status(400).json({ error: 'নির্বাচিত বিভাগ এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
  }

  const hasBooksUpdate = Array.isArray(req.body?.book_ids);
  const rawBookIds: number[] = hasBooksUpdate
    ? Array.from(new Set(req.body.book_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)))
    : [];
  if (hasBooksUpdate) {
    const checkBook = db.prepare('SELECT id FROM academic_books WHERE id = ? AND institution_id = ?');
    for (const bid of rawBookIds) {
      if (!checkBook.get(bid, instId)) {
        return res.status(400).json({ error: 'নির্বাচিত কিতাব / বই এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
      }
    }
  }

  const dup = db
    .prepare('SELECT id FROM jamaat_names WHERE institution_id = ? AND name = ? COLLATE NOCASE AND id != ?')
    .get(instId, name, id);
  if (dup) return res.status(409).json({ error: 'এই নামে অন্য একটি শ্রেণী/জামাত ইতিমধ্যেই রয়েছে।' });

  const now = getDhakaNowISO();
  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE jamaat_names SET department_id = ?, name = ?, short_name = ?, description = ?, status = ? WHERE id = ? AND institution_id = ?'
    ).run(department_id, name, short_name, description, status, id, instId);

    if (hasBooksUpdate) {
      db.prepare('DELETE FROM jamaat_books WHERE jamaat_id = ? AND institution_id = ?').run(id, instId);
      const insBook = db.prepare(
        'INSERT OR IGNORE INTO jamaat_books (institution_id, jamaat_id, book_id, created_at) VALUES (?, ?, ?, ?)'
      );
      for (const bid of rawBookIds) {
        insBook.run(instId, id, bid, now);
      }
    }
  });
  tx();

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'UPDATE_JAMAAT_NAME',
    targetType: 'jamaat_name',
    targetId: id,
    targetLabel: name,
    institutionId: instId,
  });

  res.json({ jamaat: db.prepare('SELECT * FROM jamaat_names WHERE id = ?').get(id), success: true });
});

institutionRouter.patch('/jamaats/:id/status', requirePermission('academic', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const statusRaw = String(req.body?.status || '').trim();
  if (!(VALID_ACADEMIC_STATUSES as readonly string[]).includes(statusRaw)) {
    return res.status(400).json({ error: 'অবৈধ স্ট্যাটাস।' });
  }
  const existing = db.prepare('SELECT id, name FROM jamaat_names WHERE id = ? AND institution_id = ?').get(id, instId) as
    | { id: number; name: string }
    | undefined;
  if (!existing) return res.status(404).json({ error: 'শ্রেণী / জামাতের নাম পাওয়া যায়নি।' });

  db.prepare('UPDATE jamaat_names SET status = ? WHERE id = ? AND institution_id = ?').run(statusRaw, id, instId);
  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'UPDATE_JAMAAT_STATUS',
    targetType: 'jamaat_name',
    targetId: id,
    targetLabel: `${existing.name} (${statusRaw})`,
    institutionId: instId,
  });
  res.json({ success: true, status: statusRaw });
});

institutionRouter.delete('/jamaats/:id', requirePermission('academic', 'delete'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id, name FROM jamaat_names WHERE id = ? AND institution_id = ?').get(id, instId) as
    | { id: number; name: string }
    | undefined;
  if (!existing) return res.status(404).json({ error: 'শ্রেণী / জামাতের নাম পাওয়া যায়নি।' });

  const usage = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM class_jamaats WHERE jamaat_id = ? AND institution_id = ?) +
        (SELECT COUNT(*) FROM classes WHERE jamaat_id = ? AND institution_id = ?) as classes,
        (SELECT COUNT(*) FROM students WHERE jamaat_id = ? AND institution_id = ?) as students,
        (SELECT COUNT(*) FROM teacher_assignments WHERE jamaat_id = ? AND institution_id = ?) as assignments,
        (SELECT COUNT(*) FROM routines WHERE jamaat_id = ? AND institution_id = ?) as routines,
        (SELECT COUNT(*) FROM examinations WHERE jamaat_id = ? AND institution_id = ?) as exams`
    )
    .get(id, instId, id, instId, id, instId, id, instId, id, instId, id, instId) as Record<string, number>;

  const usageCount =
    Number(usage.classes || 0) +
    Number(usage.students || 0) +
    Number(usage.assignments || 0) +
    Number(usage.routines || 0) +
    Number(usage.exams || 0);

  if (usageCount > 0) {
    return res.status(409).json({
      error: 'এই শ্রেণী/জামাতের নামটি ক্লাস, শিক্ষার্থী বা একাডেমিক রেকর্ডে ব্যবহৃত হচ্ছে। সরাসরি মুছে না ফেলে আর্কাইভ বা নিষ্ক্রিয় করুন।',
      inUse: true,
      usageCount,
      usage,
      canArchive: true,
    });
  }

  db.prepare('DELETE FROM jamaat_names WHERE id = ? AND institution_id = ?').run(id, instId);
  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'DELETE_JAMAAT_NAME',
    targetType: 'jamaat_name',
    targetId: id,
    targetLabel: existing.name,
    institutionId: instId,
  });
  res.json({ success: true });
});

institutionRouter.get(
  '/subjects',
  requireAnyPermission([
    ['academic', 'view'],
    ['teachers', 'view'],
    ['exams', 'view'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const classId = req.query.class_id ? Number(req.query.class_id) : null;
    const search = String(req.query.search || '').trim();
    let sql = `
      SELECT s.*, c.name as class_name, c.jamaat_id, d.id as department_id, d.name as department_name,
             j.name as jamaat_name,
             b.book_code, b.name as book_name, b.arabic_name as book_arabic_name, b.author_name as book_author
      FROM subjects s
      JOIN classes c ON c.id = s.class_id
      JOIN academic_departments d ON d.id = c.department_id
      LEFT JOIN jamaat_names j ON j.id = c.jamaat_id
      LEFT JOIN academic_books b ON b.id = s.book_id
      WHERE s.institution_id = ?
    `;
    const params: any[] = [instId];
    if (classId) {
      sql += ' AND s.class_id = ?';
      params.push(classId);
    }
    if (search) {
      sql += ' AND (s.name LIKE ? OR s.code LIKE ? OR COALESCE(b.arabic_name, \'\') LIKE ? OR COALESCE(b.book_code, \'\') LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY s.class_id ASC, s.id ASC';
    let rows = db.prepare(sql).all(...params) as any[];
    if (isClassScopedTeacher(req.authUser!)) {
      const scope = getTeacherAssignedScope(instId, req.authUser!.id);
      rows = rows.filter((r) => {
        if (!scope.classIds.has(r.class_id)) return false;
        const allowedSubs = scope.subjectIdsByClass.get(r.class_id);
        return allowedSubs === null || (allowedSubs ? allowedSubs.has(r.id) : false);
      });
    }
    res.json({ subjects: rows });
  }
);

institutionRouter.post('/subjects', requirePermission('academic', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const class_id = Number(req.body?.class_id);
  const book_id = req.body?.book_id ? Number(req.body.book_id) : null;
  let name = String(req.body?.name || '').trim();
  let code = String(req.body?.code || '').trim();

  if (!class_id) return res.status(400).json({ error: 'শ্রেণী / ক্লাস নির্বাচন আবশ্যক।' });
  const cls = db.prepare('SELECT id FROM classes WHERE id = ? AND institution_id = ?').get(class_id, instId);
  if (!cls) return res.status(404).json({ error: 'শ্রেণী পাওয়া যায়নি।' });

  if (book_id) {
    const book = db
      .prepare('SELECT id, name, short_name, book_code FROM academic_books WHERE id = ? AND institution_id = ?')
      .get(book_id, instId) as any;
    if (!book) return res.status(400).json({ error: 'নির্বাচিত কিতাব / বই এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
    if (!name) name = book.name;
    if (!code) code = book.short_name || book.book_code;
  }

  if (!name) return res.status(400).json({ error: 'বিষয়ের নাম আবশ্যক।' });

  const info = db
    .prepare(
      'INSERT INTO subjects (institution_id, class_id, book_id, name, code, full_marks, pass_marks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      instId,
      class_id,
      book_id,
      name,
      code,
      Number(req.body?.full_marks || 100),
      Number(req.body?.pass_marks || 33),
      getDhakaNowISO()
    );
  res.status(201).json({ subject: db.prepare('SELECT * FROM subjects WHERE id = ?').get(info.lastInsertRowid) });
});

institutionRouter.post('/subjects/from-books', requirePermission('academic', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const class_id = Number(req.body?.class_id);
  const full_marks = Number(req.body?.full_marks || 100);
  const pass_marks = Number(req.body?.pass_marks || 33);

  if (!class_id) return res.status(400).json({ error: 'ক্লাস নির্বাচন আবশ্যক।' });
  const cls = db
    .prepare('SELECT id, jamaat_id FROM classes WHERE id = ? AND institution_id = ?')
    .get(class_id, instId) as { id: number; jamaat_id: number | null } | undefined;
  if (!cls) return res.status(404).json({ error: 'ক্লাস পাওয়া যায়নি।' });

  let booksToImport: any[] = [];
  if (Array.isArray(req.body?.book_ids) && req.body.book_ids.length > 0) {
    const ids = Array.from(new Set(req.body.book_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)));
    const checkBook = db.prepare('SELECT id, name, short_name, book_code FROM academic_books WHERE id = ? AND institution_id = ?');
    for (const bid of ids) {
      const b = checkBook.get(bid, instId);
      if (!b) return res.status(400).json({ error: 'নির্বাচিত কিতাব এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
      booksToImport.push(b);
    }
  } else {
    const cjRows = db
      .prepare('SELECT jamaat_id FROM class_jamaats WHERE class_id = ? AND institution_id = ?')
      .all(class_id, instId) as Array<{ jamaat_id: number }>;
    const jids = cjRows.map((r) => r.jamaat_id);
    if (cls.jamaat_id && !jids.includes(cls.jamaat_id)) jids.push(cls.jamaat_id);
    booksToImport = getBooksForClassAndJamaats(instId, class_id, jids).filter((b) => b.status !== 'archived');
  }

  if (booksToImport.length === 0) {
    return res.status(400).json({ error: 'এই ক্লাসের সাথে কোনো সক্রিয় কিতাব সংযুক্ত নেই।' });
  }

  const now = getDhakaNowISO();
  const findDup = db.prepare(
    'SELECT id FROM subjects WHERE institution_id = ? AND class_id = ? AND (book_id = ? OR name = ? COLLATE NOCASE) LIMIT 1'
  );
  const insSub = db.prepare(
    'INSERT INTO subjects (institution_id, class_id, book_id, name, code, full_marks, pass_marks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  let createdCount = 0;
  let skippedCount = 0;
  const tx = db.transaction(() => {
    for (const b of booksToImport) {
      if (findDup.get(instId, class_id, b.id, b.name)) {
        skippedCount += 1;
        continue;
      }
      insSub.run(instId, class_id, b.id, b.name, b.short_name || b.book_code || '', full_marks, pass_marks, now);
      createdCount += 1;
    }
  });
  tx();

  res.status(201).json({ success: true, createdCount, skippedCount });
});

institutionRouter.put('/subjects/:id', requirePermission('academic', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM subjects WHERE id = ? AND institution_id = ?').get(id, instId) as any;
  if (!existing) return res.status(404).json({ error: 'বিষয় পাওয়া যায়নি।' });

  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'বিষয়ের নাম আবশ্যক।' });

  const hasBook = req.body?.book_id !== undefined;
  const book_id = hasBook ? (req.body.book_id ? Number(req.body.book_id) : null) : existing.book_id ?? null;
  if (book_id) {
    const validBook = db.prepare('SELECT id FROM academic_books WHERE id = ? AND institution_id = ?').get(book_id, instId);
    if (!validBook) return res.status(400).json({ error: 'নির্বাচিত কিতাব / বই এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
  }

  db.prepare(
    'UPDATE subjects SET book_id = ?, name = ?, code = ?, full_marks = ?, pass_marks = ? WHERE id = ? AND institution_id = ?'
  ).run(
    book_id,
    name,
    String(req.body?.code || '').trim(),
    Number(req.body?.full_marks || 100),
    Number(req.body?.pass_marks || 33),
    id,
    instId
  );
  res.json({ success: true });
});

institutionRouter.delete('/subjects/:id', requirePermission('academic', 'delete'), (req, res) => {
  db.prepare('DELETE FROM subjects WHERE id = ? AND institution_id = ?').run(Number(req.params.id), req.institutionId!);
  res.json({ success: true });
});

// Class Routine
function findRoutineConflicts(params: {
  instId: number;
  teacherId: number;
  classId: number;
  dayOfWeek: string;
  isDaily: 0 | 1;
  periodNumber: number;
  startTime: string;
  endTime: string;
  excludeId?: number;
}): { conflict: boolean; error?: string } {
  const dayClause = params.isDaily === 1 ? '1=1' : '(day_of_week = ? OR is_daily = 1 OR day_of_week = ?)';
  const dayParams = params.isDaily === 1 ? [] : [params.dayOfWeek, DAILY_DAY_OPTION];
  const exclClause = params.excludeId ? ' AND id != ?' : '';
  const exclParams = params.excludeId ? [params.excludeId] : [];

  const teacherConflict = db
    .prepare(
      `SELECT id, day_of_week, start_time, end_time, period_number FROM routines
       WHERE institution_id = ? AND teacher_id = ? AND ${dayClause}${exclClause}
         AND ((start_time < ? AND end_time > ?) OR period_number = ?)
       LIMIT 1`
    )
    .get(
      params.instId,
      params.teacherId,
      ...dayParams,
      ...exclParams,
      params.endTime,
      params.startTime,
      params.periodNumber
    ) as any;

  if (teacherConflict) {
    return {
      conflict: true,
      error: `এই সময়ে বা পিরিয়ডে (${teacherConflict.day_of_week} ${teacherConflict.start_time}–${teacherConflict.end_time}) উক্ত শিক্ষকের অন্য একটি ক্লাস নির্ধারিত আছে।`,
    };
  }

  const classConflict = db
    .prepare(
      `SELECT id, day_of_week, start_time, end_time, period_number FROM routines
       WHERE institution_id = ? AND class_id = ? AND ${dayClause}${exclClause}
         AND ((start_time < ? AND end_time > ?) OR period_number = ?)
       LIMIT 1`
    )
    .get(
      params.instId,
      params.classId,
      ...dayParams,
      ...exclParams,
      params.endTime,
      params.startTime,
      params.periodNumber
    ) as any;

  if (classConflict) {
    return {
      conflict: true,
      error: `এই শ্রেণীতে একই সময়ে/পিরিয়ডে (${classConflict.day_of_week} ${classConflict.start_time}–${classConflict.end_time}) ইতিমধ্যেই একটি ক্লাস আছে।`,
    };
  }

  return { conflict: false };
}

institutionRouter.get('/routines', requirePermission('academic', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const classId = req.query.class_id ? Number(req.query.class_id) : null;
  const deptId = req.query.department_id ? Number(req.query.department_id) : null;
  const teacherId = req.query.teacher_id ? Number(req.query.teacher_id) : null;
  const jamaatId = req.query.jamaat_id ? Number(req.query.jamaat_id) : null;
  const dayFilter = String(req.query.day_of_week || '').trim();

  let sql = `
    SELECT r.*, d.name as department_name, c.name as class_name,
           j.name as jamaat_name, j.short_name as jamaat_short_name,
           s.name as subject_name, s.book_id, b.book_code, b.arabic_name as book_arabic_name,
           t.full_name as teacher_name
    FROM routines r
    JOIN academic_departments d ON d.id = r.department_id
    JOIN classes c ON c.id = r.class_id
    LEFT JOIN jamaat_names j ON j.id = r.jamaat_id
    JOIN subjects s ON s.id = r.subject_id
    LEFT JOIN academic_books b ON b.id = s.book_id
    JOIN teachers t ON t.id = r.teacher_id
    WHERE r.institution_id = ?
  `;
  const params: any[] = [instId];
  if (isClassScopedTeacher(req.authUser!)) {
    const scope = getTeacherAssignedScope(instId, req.authUser!.id);
    if (!scope.teacherId) return res.json({ routines: [] });
    sql += ' AND r.teacher_id = ?';
    params.push(scope.teacherId);
  }
  if (deptId) {
    sql += ' AND r.department_id = ?';
    params.push(deptId);
  }
  if (classId) {
    sql += ' AND r.class_id = ?';
    params.push(classId);
  }
  if (jamaatId) {
    sql += ' AND r.jamaat_id = ?';
    params.push(jamaatId);
  }
  if (teacherId) {
    sql += ' AND r.teacher_id = ?';
    params.push(teacherId);
  }
  if (dayFilter && dayFilter !== 'all') {
    if (isDailyDayValue(dayFilter)) {
      sql += ' AND (r.is_daily = 1 OR r.day_of_week = ?)';
      params.push(DAILY_DAY_OPTION);
    } else {
      sql += ' AND (r.day_of_week = ? OR r.is_daily = 1 OR r.day_of_week = ?)';
      params.push(dayFilter, DAILY_DAY_OPTION);
    }
  }
  sql += ` ORDER BY ${dayOrderSql('r.day_of_week')}, r.start_time ASC, r.period_number ASC`;
  res.json({ routines: db.prepare(sql).all(...params) });
});

institutionRouter.post('/routines', requirePermission('academic', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const department_id = Number(req.body?.department_id);
  const class_id = Number(req.body?.class_id);
  const jamaat_id = req.body?.jamaat_id ? Number(req.body.jamaat_id) : null;
  const subject_id = Number(req.body?.subject_id);
  const teacher_id = Number(req.body?.teacher_id);
  const dayCheck = normalizeScheduleDay(req.body?.day_of_week);
  const period_number = Number(req.body?.period_number || 1);
  const start_time = String(req.body?.start_time || '').trim();
  const end_time = String(req.body?.end_time || '').trim();
  const room = String(req.body?.room || '').trim();

  if (!department_id || !class_id || !subject_id || !teacher_id || !dayCheck.ok || !start_time || !end_time) {
    return res.status(400).json({ error: 'রুটিনের সকল প্রয়োজনীয় তথ্য এবং বৈধ বার নির্বাচন করুন।' });
  }
  if (!isValidTimeHM(start_time) || !isValidTimeHM(end_time) || timeToMinutes(start_time) >= timeToMinutes(end_time)) {
    return res.status(400).json({ error: 'শুরুর সময় শেষের সময়ের চেয়ে আগে হতে হবে (HH:MM ফরম্যাট)।' });
  }
  if (!Number.isInteger(period_number) || period_number < 1) {
    return res.status(400).json({ error: 'সঠিক পিরিয়ড নম্বর প্রদান করুন।' });
  }

  // Strict institution isolation checks
  const validClass = db.prepare('SELECT id FROM classes WHERE id = ? AND department_id = ? AND institution_id = ?').get(class_id, department_id, instId);
  const validSubj = db.prepare('SELECT id FROM subjects WHERE id = ? AND institution_id = ?').get(subject_id, instId);
  const validTeacher = db.prepare('SELECT id FROM teachers WHERE id = ? AND institution_id = ?').get(teacher_id, instId);
  if (!validClass || !validSubj || !validTeacher) {
    return res.status(400).json({ error: 'নির্বাচিত বিভাগ, ক্লাস, বিষয় বা শিক্ষক সঠিক নয়।' });
  }
  if (jamaat_id) {
    const validJamaat = db.prepare('SELECT id FROM jamaat_names WHERE id = ? AND institution_id = ?').get(jamaat_id, instId);
    if (!validJamaat) return res.status(400).json({ error: 'নির্বাচিত শ্রেণী/জামাত এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
  }

  const conflict = findRoutineConflicts({
    instId,
    teacherId: teacher_id,
    classId: class_id,
    dayOfWeek: dayCheck.day_of_week,
    isDaily: dayCheck.is_daily,
    periodNumber: period_number,
    startTime: start_time,
    endTime: end_time,
  });
  if (conflict.conflict) {
    return res.status(409).json({ error: conflict.error });
  }

  // Always insert a SINGLE record (even for Daily — never 7 duplicate rows)
  const info = db
    .prepare(
      `INSERT INTO routines (institution_id, department_id, class_id, jamaat_id, subject_id, teacher_id, day_of_week, is_daily, period_number, start_time, end_time, room, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      instId,
      department_id,
      class_id,
      jamaat_id,
      subject_id,
      teacher_id,
      dayCheck.day_of_week,
      dayCheck.is_daily,
      period_number,
      start_time,
      end_time,
      room,
      getDhakaNowISO()
    );

  const createdId = Number(info.lastInsertRowid);
  const routine = db.prepare('SELECT * FROM routines WHERE id = ?').get(createdId);
  recomputeInstitutionLiveStatuses(instId, { broadcast: true });
  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'CREATE_ROUTINE',
    targetType: 'routine',
    targetId: createdId,
    targetLabel: `${dayCheck.day_of_week} ${start_time}-${end_time}`,
    institutionId: instId,
  });

  res.status(201).json({ id: createdId, routine });
});

institutionRouter.put('/routines/:id', requirePermission('academic', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM routines WHERE id = ? AND institution_id = ?').get(id, instId) as any;
  if (!existing) return res.status(404).json({ error: 'রুটিন রেকর্ড পাওয়া যায়নি।' });

  const department_id = req.body?.department_id !== undefined ? Number(req.body.department_id) : existing.department_id;
  const class_id = req.body?.class_id !== undefined ? Number(req.body.class_id) : existing.class_id;
  const jamaat_id = req.body?.jamaat_id !== undefined ? (req.body.jamaat_id ? Number(req.body.jamaat_id) : null) : existing.jamaat_id;
  const subject_id = req.body?.subject_id !== undefined ? Number(req.body.subject_id) : existing.subject_id;
  const teacher_id = req.body?.teacher_id !== undefined ? Number(req.body.teacher_id) : existing.teacher_id;
  const dayCheck = normalizeScheduleDay(req.body?.day_of_week !== undefined ? req.body.day_of_week : existing.day_of_week);
  const period_number = req.body?.period_number !== undefined ? Number(req.body.period_number) : existing.period_number;
  const start_time = String(req.body?.start_time !== undefined ? req.body.start_time : existing.start_time).trim();
  const end_time = String(req.body?.end_time !== undefined ? req.body.end_time : existing.end_time).trim();
  const room = String(req.body?.room !== undefined ? req.body.room : existing.room || '').trim();

  if (!department_id || !class_id || !subject_id || !teacher_id || !dayCheck.ok || !start_time || !end_time) {
    return res.status(400).json({ error: 'রুটিনের সকল প্রয়োজনীয় তথ্য এবং বৈধ বার নির্বাচন করুন।' });
  }
  if (!isValidTimeHM(start_time) || !isValidTimeHM(end_time) || timeToMinutes(start_time) >= timeToMinutes(end_time)) {
    return res.status(400).json({ error: 'শুরুর সময় শেষের সময়ের চেয়ে আগে হতে হবে (HH:MM ফরম্যাট)।' });
  }
  if (!Number.isInteger(period_number) || period_number < 1) {
    return res.status(400).json({ error: 'সঠিক পিরিয়ড নম্বর প্রদান করুন।' });
  }

  const validClass = db.prepare('SELECT id FROM classes WHERE id = ? AND department_id = ? AND institution_id = ?').get(class_id, department_id, instId);
  const validSubj = db.prepare('SELECT id FROM subjects WHERE id = ? AND institution_id = ?').get(subject_id, instId);
  const validTeacher = db.prepare('SELECT id FROM teachers WHERE id = ? AND institution_id = ?').get(teacher_id, instId);
  if (!validClass || !validSubj || !validTeacher) {
    return res.status(400).json({ error: 'নির্বাচিত বিভাগ, ক্লাস, বিষয় বা শিক্ষক সঠিক নয়।' });
  }
  if (jamaat_id) {
    const validJamaat = db.prepare('SELECT id FROM jamaat_names WHERE id = ? AND institution_id = ?').get(jamaat_id, instId);
    if (!validJamaat) return res.status(400).json({ error: 'নির্বাচিত শ্রেণী/জামাত এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
  }

  const conflict = findRoutineConflicts({
    instId,
    teacherId: teacher_id,
    classId: class_id,
    dayOfWeek: dayCheck.day_of_week,
    isDaily: dayCheck.is_daily,
    periodNumber: period_number,
    startTime: start_time,
    endTime: end_time,
    excludeId: id,
  });
  if (conflict.conflict) {
    return res.status(409).json({ error: conflict.error });
  }

  db.prepare(
    `UPDATE routines
     SET department_id = ?, class_id = ?, jamaat_id = ?, subject_id = ?, teacher_id = ?,
         day_of_week = ?, is_daily = ?, period_number = ?, start_time = ?, end_time = ?, room = ?
     WHERE id = ? AND institution_id = ?`
  ).run(
    department_id,
    class_id,
    jamaat_id,
    subject_id,
    teacher_id,
    dayCheck.day_of_week,
    dayCheck.is_daily,
    period_number,
    start_time,
    end_time,
    room,
    id,
    instId
  );

  const routine = db.prepare('SELECT * FROM routines WHERE id = ?').get(id);
  recomputeInstitutionLiveStatuses(instId, { broadcast: true });
  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'UPDATE_ROUTINE',
    targetType: 'routine',
    targetId: id,
    targetLabel: `${dayCheck.day_of_week} ${start_time}-${end_time}`,
    institutionId: instId,
  });

  res.json({ success: true, routine });
});

institutionRouter.delete('/routines/:id', requirePermission('academic', 'delete'), (req, res) => {
  const instId = req.institutionId!;
  const info = db.prepare('DELETE FROM routines WHERE id = ? AND institution_id = ?').run(Number(req.params.id), instId);
  if (info.changes === 0) return res.status(404).json({ error: 'রুটিন রেকর্ড পাওয়া যায়নি।' });
  recomputeInstitutionLiveStatuses(instId, { broadcast: true });
  res.json({ success: true });
});

// ==================== 7. TEACHERS & STAFF ====================
institutionRouter.get('/teachers', requirePermission('teachers', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const canViewFinance =
    req.authUser!.account_type === 'institution_admin' || hasPermission(req.authUser!, 'finance', 'view');

  const teachers = db
    .prepare(
      `SELECT t.*, u.username, u.account_type, u.role_id, u.status as user_status, r.name as role_name, d.name as department_name,
              tp.teacher_code, tp.email, tp.education, tp.monthly_salary, COALESCE(tp.monthly_meal_cost, 0) as monthly_meal_cost,
              tls.status as live_status, tls.verification_state as live_verification_state,
              tls.current_class as live_class_name, tls.current_subject as live_subject_name, tls.room_number as live_room
       FROM teachers t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN academic_departments d ON d.id = t.department_id
       LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id AND tp.institution_id = t.institution_id
       LEFT JOIN teacher_live_status tls ON tls.teacher_id = t.id AND tls.institution_id = t.institution_id
       WHERE t.institution_id = ?
       ORDER BY t.created_at DESC`
    )
    .all(instId) as any[];

  const desigStmt = db.prepare(
    `SELECT td.designation_id, td.is_primary, des.name, des.category
     FROM teacher_designations td
     JOIN designations des ON des.id = td.designation_id
     WHERE td.teacher_id = ?`
  );
  const assignStmt = db.prepare(
    `SELECT ta.id, ta.class_id, ta.subject_id, ta.jamaat_id,
            c.name as class_name, s.name as subject_name, j.name as jamaat_name
     FROM teacher_assignments ta
     JOIN classes c ON c.id = ta.class_id
     LEFT JOIN subjects s ON s.id = ta.subject_id
     LEFT JOIN jamaat_names j ON j.id = ta.jamaat_id
     WHERE ta.teacher_id = ?`
  );
  const rolesStmt = db.prepare(
    `SELECT r.id, r.name, r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`
  );

  const enriched = teachers.map((t) => {
    const userRoles = rolesStmt.all(t.user_id) as Array<{ id: number; name: string; slug: string }>;
    const isSelf = t.user_id === req.authUser!.id;
    const baseSal = Number(t.monthly_salary || 0);
    const mealCost = Number(t.monthly_meal_cost || 0);
    return {
      ...t,
      monthly_salary: canViewFinance || isSelf ? baseSal : null,
      monthly_meal_cost: canViewFinance || isSelf ? mealCost : null,
      total_monthly_payable: canViewFinance || isSelf ? Number((baseSal + mealCost).toFixed(2)) : null,
      role_ids: userRoles.map((r) => r.id),
      role_names: userRoles.map((r) => r.name),
      role_name: userRoles.length > 0 ? userRoles.map((r) => r.name).join(' · ') : t.role_name,
      designations: desigStmt.all(t.id),
      assignments: assignStmt.all(t.id),
    };
  });

  res.json({ teachers: enriched });
});

institutionRouter.post('/teachers', requirePermission('teachers', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const full_name = String(req.body?.full_name || '').trim();
  const username = String(req.body?.username || '').trim();
  const rawPassword = String(req.body?.password || '').trim();
  const mobile = String(req.body?.mobile || '').trim();
  const department_id = req.body?.department_id ? Number(req.body.department_id) : null;
  const joining_date = String(req.body?.joining_date || getDhakaDateYMD()).trim();
  const address = String(req.body?.address || '').trim();
  const photo_url = sanitizeImageUrl(req.body?.photo_url);
  const rawRoleIds: number[] = Array.isArray(req.body?.role_ids)
    ? req.body.role_ids.map(Number).filter((n: number) => n > 0)
    : req.body?.role_id
    ? [Number(req.body.role_id)]
    : [];
  const account_type = req.body?.account_type === 'staff' ? 'staff' : 'teacher';
  const designation_ids: number[] = Array.isArray(req.body?.designation_ids) ? req.body.designation_ids.map(Number) : [];
  const primary_designation_id = req.body?.primary_designation_id ? Number(req.body.primary_designation_id) : designation_ids[0] || null;
  const assignments: Array<{ class_id: number; subject_id?: number | null }> = Array.isArray(req.body?.assignments) ? req.body.assignments : [];

  // Default initial password for Teacher/Staff = Registered Mobile Number (when custom password not entered)
  const usedMobileAsPassword = !rawPassword && mobile.length >= 4;
  const effectivePassword = rawPassword || (usedMobileAsPassword ? mobile : '');

  if (!full_name || !username || effectivePassword.length < 4) {
    return res.status(400).json({ error: 'নাম, ইউজারনেম এবং নিবন্ধিত মোবাইল নম্বর (অথবা কমপক্ষে ৪ অক্ষরের পাসওয়ার্ড) আবশ্যক।' });
  }

  const dup = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (dup) return res.status(409).json({ error: 'এই ইউজারনেমটি ইতিমধ্যেই ব্যবহৃত হচ্ছে।' });

  // Validate role_ids belong to this institution; default to teacher role if none selected
  const validRoleIds: number[] = [];
  for (const rid of rawRoleIds) {
    const r = db.prepare('SELECT id FROM roles WHERE id = ? AND institution_id = ?').get(rid, instId) as { id: number } | undefined;
    if (r) validRoleIds.push(r.id);
  }
  if (validRoleIds.length === 0) {
    const teacherRole = db
      .prepare("SELECT id FROM roles WHERE institution_id = ? AND slug = 'teacher' LIMIT 1")
      .get(instId) as { id: number } | undefined;
    if (teacherRole) validRoleIds.push(teacherRole.id);
  }
  const resolvedRoleId = validRoleIds[0] ?? null;

  const now = getDhakaNowISO();
  const tx = db.transaction(() => {
    const userInfo = db
      .prepare(
        `INSERT INTO users (institution_id, username, password_hash, full_name, account_type, role_id, photo_url, phone, status, must_change_password, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(
        instId,
        username,
        hashPassword(effectivePassword),
        full_name,
        account_type,
        resolvedRoleId,
        photo_url,
        mobile,
        usedMobileAsPassword ? 1 : 0,
        now
      );
    const userId = Number(userInfo.lastInsertRowid);

    syncUserIdentity({
      userId,
      institutionId: instId,
      accountType: account_type,
      fullName: full_name,
      phone: mobile,
      photoUrl: photo_url,
      address,
      status: 'active',
      roleIds: validRoleIds,
    });

    const teacherInfo = db
      .prepare(
        `INSERT INTO teachers (institution_id, user_id, full_name, photo_url, mobile, department_id, joining_date, address, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
      )
      .run(instId, userId, full_name, photo_url, mobile, department_id, joining_date, address, now);
    const teacherId = Number(teacherInfo.lastInsertRowid);

    const insertDesig = db.prepare('INSERT OR IGNORE INTO teacher_designations (teacher_id, designation_id, is_primary) VALUES (?, ?, ?)');
    for (const did of designation_ids) {
      insertDesig.run(teacherId, did, did === primary_designation_id ? 1 : 0);
    }

    const insertAssign = db.prepare(
      'INSERT OR IGNORE INTO teacher_assignments (institution_id, teacher_id, class_id, subject_id, jamaat_id) VALUES (?, ?, ?, ?, ?)'
    );
    const checkCls = db.prepare('SELECT id FROM classes WHERE id = ? AND institution_id = ?');
    const checkJam = db.prepare('SELECT id FROM jamaat_names WHERE id = ? AND institution_id = ?');
    for (const a of assignments as Array<{ class_id: number; subject_id?: number | null; jamaat_id?: number | null }>) {
      if (a.class_id && checkCls.get(Number(a.class_id), instId)) {
        const jid = a.jamaat_id && checkJam.get(Number(a.jamaat_id), instId) ? Number(a.jamaat_id) : null;
        insertAssign.run(instId, teacherId, Number(a.class_id), a.subject_id ? Number(a.subject_id) : null, jid);
      }
    }

    return teacherId;
  });

  const teacherId = tx();
  const canSetSalary =
    req.authUser!.account_type === 'institution_admin' || hasPermission(req.authUser!, 'finance', 'create');
  const profile = ensureTeacherProfile(instId, teacherId, {
    email: String(req.body?.email || '').trim(),
    education: String(req.body?.education || '').trim(),
    monthly_salary: canSetSalary ? Math.max(0, Number(req.body?.monthly_salary || 0)) : 0,
    monthly_meal_cost: canSetSalary ? Math.max(0, Number(req.body?.monthly_meal_cost || 0)) : 0,
  });
  recomputeInstitutionLiveStatuses(instId, { broadcast: true });

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'CREATE_TEACHER_STAFF',
    targetType: 'teacher',
    targetId: teacherId,
    targetLabel: full_name,
    institutionId: instId,
  });

  res.status(201).json({
    id: teacherId,
    teacher_code: profile.teacher_code,
    credentials: {
      username,
      usedMobileAsPassword,
    },
  });
});

institutionRouter.put('/teachers/:id', requirePermission('teachers', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const teacher = db.prepare('SELECT * FROM teachers WHERE id = ? AND institution_id = ?').get(id, instId) as any;
  if (!teacher) return res.status(404).json({ error: 'শিক্ষক/কর্মচারী পাওয়া যায়নি।' });

  const full_name = String(req.body?.full_name || teacher.full_name).trim();
  const mobile = String(req.body?.mobile ?? teacher.mobile).trim();
  const department_id = req.body?.department_id !== undefined ? (req.body.department_id ? Number(req.body.department_id) : null) : teacher.department_id;
  const joining_date = String(req.body?.joining_date ?? teacher.joining_date).trim();
  const address = String(req.body?.address ?? teacher.address).trim();
  const status = req.body?.status === 'inactive' ? 'inactive' : 'active';
  const photo_url = req.body?.photo_url !== undefined ? sanitizeImageUrl(req.body.photo_url) : teacher.photo_url;
  const newPassword = String(req.body?.password || '').trim();

  const existingUser = db.prepare('SELECT account_type FROM users WHERE id = ?').get(teacher.user_id) as { account_type: 'teacher' | 'staff' } | undefined;
  const account_type: 'teacher' | 'staff' =
    req.body?.account_type === 'staff'
      ? 'staff'
      : req.body?.account_type === 'teacher'
      ? 'teacher'
      : existingUser?.account_type === 'staff'
      ? 'staff'
      : 'teacher';

  const hasRoleUpdate = Array.isArray(req.body?.role_ids) || Boolean(req.body?.role_id);
  const rawRoleIds: number[] = Array.isArray(req.body?.role_ids)
    ? req.body.role_ids.map(Number).filter((n: number) => n > 0)
    : req.body?.role_id
    ? [Number(req.body.role_id)]
    : [];
  const validRoleIds: number[] = [];
  if (hasRoleUpdate) {
    for (const rid of rawRoleIds) {
      const r = db.prepare('SELECT id FROM roles WHERE id = ? AND institution_id = ?').get(rid, instId) as { id: number } | undefined;
      if (r) validRoleIds.push(r.id);
    }
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE teachers SET full_name = ?, photo_url = ?, mobile = ?, department_id = ?, joining_date = ?, address = ?, status = ?
       WHERE id = ? AND institution_id = ?`
    ).run(full_name, photo_url, mobile, department_id, joining_date, address, status, id, instId);

    db.prepare('UPDATE users SET full_name = ?, account_type = ?, photo_url = ?, phone = ?, status = ? WHERE id = ?').run(
      full_name,
      account_type,
      photo_url,
      mobile,
      status,
      teacher.user_id
    );

    syncUserIdentity({
      userId: teacher.user_id,
      institutionId: instId,
      accountType: account_type,
      fullName: full_name,
      phone: mobile,
      photoUrl: photo_url,
      address,
      status,
      roleIds: hasRoleUpdate && validRoleIds.length > 0 ? validRoleIds : undefined,
    });

    if (newPassword.length >= 4) {
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hashPassword(newPassword), teacher.user_id);
    }

    if (Array.isArray(req.body?.designation_ids)) {
      db.prepare('DELETE FROM teacher_designations WHERE teacher_id = ?').run(id);
      const desigIds = req.body.designation_ids.map(Number);
      const primaryId = req.body.primary_designation_id ? Number(req.body.primary_designation_id) : desigIds[0] || null;
      const ins = db.prepare('INSERT OR IGNORE INTO teacher_designations (teacher_id, designation_id, is_primary) VALUES (?, ?, ?)');
      for (const did of desigIds) {
        ins.run(id, did, did === primaryId ? 1 : 0);
      }
    }

    if (Array.isArray(req.body?.assignments)) {
      db.prepare('DELETE FROM teacher_assignments WHERE teacher_id = ?').run(id);
      const insA = db.prepare(
        'INSERT OR IGNORE INTO teacher_assignments (institution_id, teacher_id, class_id, subject_id, jamaat_id) VALUES (?, ?, ?, ?, ?)'
      );
      const checkCls = db.prepare('SELECT id FROM classes WHERE id = ? AND institution_id = ?');
      const checkJam = db.prepare('SELECT id FROM jamaat_names WHERE id = ? AND institution_id = ?');
      for (const a of req.body.assignments) {
        if (a.class_id && checkCls.get(Number(a.class_id), instId)) {
          const jid = a.jamaat_id && checkJam.get(Number(a.jamaat_id), instId) ? Number(a.jamaat_id) : null;
          insA.run(instId, id, Number(a.class_id), a.subject_id ? Number(a.subject_id) : null, jid);
        }
      }
    }
  });

  tx();
  const existingProfile = ensureTeacherProfile(instId, id);
  const canEditSalary =
    req.authUser!.account_type === 'institution_admin' || hasPermission(req.authUser!, 'finance', 'edit');
  const nextEmail = req.body?.email !== undefined ? String(req.body.email || '').trim() : existingProfile.email;
  const nextEducation = req.body?.education !== undefined ? String(req.body.education || '').trim() : existingProfile.education;
  const nextSalary =
    canEditSalary && req.body?.monthly_salary !== undefined
      ? Number(Math.max(0, Number(req.body.monthly_salary || 0)).toFixed(2))
      : Number(existingProfile.monthly_salary || 0);
  const nextMealCost =
    canEditSalary && req.body?.monthly_meal_cost !== undefined
      ? Number(Math.max(0, Number(req.body.monthly_meal_cost || 0)).toFixed(2))
      : Number(existingProfile.monthly_meal_cost || 0);
  db.prepare(
    'UPDATE teacher_profiles SET email = ?, education = ?, monthly_salary = ?, monthly_meal_cost = ?, updated_at = ? WHERE teacher_id = ? AND institution_id = ?'
  ).run(nextEmail, nextEducation, nextSalary, nextMealCost, getDhakaNowISO(), id, instId);
  recomputeInstitutionLiveStatuses(instId, { broadcast: true });
  res.json({ success: true });
});

institutionRouter.delete('/teachers/:id', requirePermission('teachers', 'delete'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const teacher = db.prepare('SELECT user_id FROM teachers WHERE id = ? AND institution_id = ?').get(id, instId) as { user_id: number } | undefined;
  if (!teacher) return res.status(404).json({ error: 'শিক্ষক পাওয়া যায়নি।' });
  db.prepare('DELETE FROM users WHERE id = ? AND institution_id = ?').run(teacher.user_id, instId);
  res.json({ success: true });
});

// ==================== 8. STUDENTS & ATOMIC ADMISSION ====================
institutionRouter.get('/students', requirePermission('students', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const status = String(req.query.status || '').trim();
  const deptId = req.query.department_id ? Number(req.query.department_id) : null;
  const classId = req.query.class_id ? Number(req.query.class_id) : null;
  const jamaatId = req.query.jamaat_id ? Number(req.query.jamaat_id) : null;
  const search = String(req.query.search || '').trim();

  let sql = `
    SELECT s.*, u.username, d.name as department_name, c.name as class_name,
      j.name as jamaat_name, j.short_name as jamaat_short_name,
      g.full_name as linked_guardian_name, gu.username as guardian_username,
      (SELECT COALESCE(SUM(fp.amount_paid), 0) FROM fee_payments fp WHERE fp.student_id = s.id) as total_paid,
      (SELECT COALESCE(fp.remaining_due, 0) FROM fee_payments fp WHERE fp.student_id = s.id ORDER BY fp.id DESC LIMIT 1) as last_due
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN academic_departments d ON d.id = s.department_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN jamaat_names j ON j.id = s.jamaat_id
    LEFT JOIN guardians g ON g.id = s.guardian_id
    LEFT JOIN users gu ON gu.id = g.user_id
    WHERE s.institution_id = ?
  `;
  const params: any[] = [instId];
  if (isClassScopedTeacher(req.authUser!)) {
    const scope = getTeacherAssignedScope(instId, req.authUser!.id);
    if (classId && !scope.classIds.has(classId)) {
      return res.status(403).json({ error: 'আপনি শুধুমাত্র আপনার নির্ধারিত শ্রেণীর শিক্ষার্থীদের তথ্য দেখতে পারবেন।' });
    }
    if (scope.classIds.size === 0) return res.json({ students: [] });
    const ids = Array.from(scope.classIds);
    sql += ` AND s.class_id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }
  if (status && status !== 'all') {
    sql += ' AND s.status = ?';
    params.push(status);
  }
  if (deptId) {
    sql += ' AND s.department_id = ?';
    params.push(deptId);
  }
  if (classId) {
    sql += ' AND s.class_id = ?';
    params.push(classId);
  }
  if (jamaatId) {
    sql += ' AND s.jamaat_id = ?';
    params.push(jamaatId);
  }
  if (search) {
    sql +=
      ' AND (s.full_name LIKE ? OR s.roll_number LIKE ? OR s.student_code LIKE ? OR u.username LIKE ? OR s.guardian_mobile LIKE ? OR j.name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY s.roll_number ASC';
  const rows = (db.prepare(sql).all(...params) as any[]).map((st) => ({
    ...st,
    monthly_fee: Number(st.monthly_fee || 0),
    monthly_meal_cost: Number(st.monthly_meal_cost || 0),
    total_monthly_payable: Number((Number(st.monthly_fee || 0) + Number(st.monthly_meal_cost || 0)).toFixed(2)),
  }));
  res.json({ students: rows });
});

institutionRouter.get('/students/:id', requirePermission('students', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const student = db
    .prepare(
      `SELECT s.*, u.username, d.name as department_name, c.name as class_name,
              j.name as jamaat_name, j.short_name as jamaat_short_name,
              gu.username as guardian_username
       FROM students s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN academic_departments d ON d.id = s.department_id
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN jamaat_names j ON j.id = s.jamaat_id
       LEFT JOIN guardians g ON g.id = s.guardian_id
       LEFT JOIN users gu ON gu.id = g.user_id
       WHERE s.id = ? AND s.institution_id = ?`
    )
    .get(id, instId) as any;
  if (!student) return res.status(404).json({ error: 'শিক্ষার্থী পাওয়া যায়নি।' });

  if (isClassScopedTeacher(req.authUser!)) {
    const scope = getTeacherAssignedScope(instId, req.authUser!.id);
    if (!scope.classIds.has(student.class_id)) {
      return res.status(403).json({ error: 'অনির্ধারিত শ্রেণীর শিক্ষার্থীর প্রোফাইল দেখার অনুমতি নেই।' });
    }
  }

  const attendanceSummary = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave_count
       FROM student_attendance WHERE student_id = ? AND institution_id = ?`
    )
    .get(id, instId);

  const payments = db
    .prepare('SELECT * FROM fee_payments WHERE student_id = ? AND institution_id = ? ORDER BY created_at DESC')
    .all(id, instId);

  const hostel = db
    .prepare(
      `SELECT ha.*, hu.name as unit_name, hr.room_number
       FROM hostel_allocations ha
       JOIN hostel_units hu ON hu.id = ha.unit_id
       JOIN hostel_rooms hr ON hr.id = ha.room_id
       WHERE ha.student_id = ? AND ha.institution_id = ? AND ha.status = 'active' LIMIT 1`
    )
    .get(id, instId);

  const jamaatIdsForStudent: number[] = [];
  if (student.jamaat_id) jamaatIdsForStudent.push(Number(student.jamaat_id));
  if (student.class_id) {
    const cRow = db
      .prepare('SELECT jamaat_id FROM classes WHERE id = ? AND institution_id = ?')
      .get(student.class_id, instId) as { jamaat_id: number | null } | undefined;
    if (cRow?.jamaat_id && !jamaatIdsForStudent.includes(cRow.jamaat_id)) {
      jamaatIdsForStudent.push(cRow.jamaat_id);
    }
    const cjRows = db
      .prepare('SELECT jamaat_id FROM class_jamaats WHERE class_id = ? AND institution_id = ?')
      .all(student.class_id, instId) as Array<{ jamaat_id: number }>;
    for (const r of cjRows) {
      if (!jamaatIdsForStudent.includes(r.jamaat_id)) jamaatIdsForStudent.push(r.jamaat_id);
    }
  }
  const books = getBooksForClassAndJamaats(instId, student.class_id ? Number(student.class_id) : null, jamaatIdsForStudent).filter(
    (b) => b.status !== 'archived'
  );

  const enrichedStudent = {
    ...student,
    monthly_fee: Number(student.monthly_fee || 0),
    monthly_meal_cost: Number(student.monthly_meal_cost || 0),
    total_monthly_payable: Number((Number(student.monthly_fee || 0) + Number(student.monthly_meal_cost || 0)).toFixed(2)),
  };

  res.json({ student: enrichedStudent, attendanceSummary, payments, hostel, books });
});

// Atomic Student Admission — Section 9
institutionRouter.post('/students', requirePermission('students', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const full_name = String(req.body?.full_name || '').trim();
  const department_id = Number(req.body?.department_id);
  const class_id = Number(req.body?.class_id);

  if (!full_name || !department_id || !class_id) {
    return res.status(400).json({ error: 'শিক্ষার্থীর নাম, বিভাগ এবং শ্রেণী/জামাত আবশ্যক।' });
  }

  const cls = db
    .prepare('SELECT id, department_id FROM classes WHERE id = ? AND institution_id = ?')
    .get(class_id, instId) as { id: number; department_id: number } | undefined;
  if (!cls || cls.department_id !== department_id) {
    return res.status(400).json({ error: 'নির্বাচিত বিভাগ ও শ্রেণী সঠিক নয়।' });
  }

  let jamaat_id: number | null = req.body?.jamaat_id ? Number(req.body.jamaat_id) : null;
  if (jamaat_id) {
    const validJamaat = db
      .prepare('SELECT id FROM jamaat_names WHERE id = ? AND institution_id = ?')
      .get(jamaat_id, instId);
    if (!validJamaat) {
      return res.status(400).json({ error: 'নির্বাচিত শ্রেণী/জামাতের নাম এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
    }
  } else {
    const primaryLink = db
      .prepare(
        `SELECT cj.jamaat_id FROM class_jamaats cj
         JOIN jamaat_names j ON j.id = cj.jamaat_id
         WHERE cj.class_id = ? AND cj.institution_id = ? AND j.status = 'active'
         ORDER BY cj.id ASC LIMIT 1`
      )
      .get(class_id, instId) as { jamaat_id: number } | undefined;
    jamaat_id = primaryLink?.jamaat_id ?? null;
  }

  const now = getDhakaNowISO();
  const admission_date = String(req.body?.admission_date || getDhakaDateYMD()).trim();
  const photo_url = sanitizeImageUrl(req.body?.photo_url);
  const father_name = String(req.body?.father_name || '').trim();
  const mother_name = String(req.body?.mother_name || '').trim();
  const guardian_name = String(req.body?.guardian_name || father_name).trim();
  const guardian_mobile = String(req.body?.guardian_mobile || '').trim();
  const student_mobile = String(req.body?.student_mobile || '').trim();
  const dob = String(req.body?.dob || '').trim();
  const blood_group = String(req.body?.blood_group || '').trim();
  const address = String(req.body?.address || '').trim();
  const previous_institution = String(req.body?.previous_institution || '').trim();
  const additional_info = String(req.body?.additional_info || '').trim();
  const fee_type = ['regular', 'one_time', 'free'].includes(req.body?.fee_type) ? req.body.fee_type : 'regular';
  const monthly_fee =
    fee_type === 'free' && req.body?.monthly_fee === undefined
      ? 0
      : Number(Math.max(0, Number(req.body?.monthly_fee || 0)).toFixed(2));
  const monthly_meal_cost =
    fee_type === 'free' && req.body?.monthly_meal_cost === undefined
      ? 0
      : Number(Math.max(0, Number(req.body?.monthly_meal_cost || 0)).toFixed(2));
  const createGuardianAccount = req.body?.create_guardian_account !== false && Boolean(guardian_name);

  // Atomic transaction (BEGIN IMMEDIATE) guarantees zero duplicate roll numbers even under simultaneous admissions!
  const admitStudentTx = db.transaction(() => {
    db.prepare('UPDATE institutions SET roll_counter = roll_counter + 1 WHERE id = ?').run(instId);
    const counterRow = db.prepare('SELECT roll_counter, code FROM institutions WHERE id = ?').get(instId) as {
      roll_counter: number;
      code: string;
    };
    const rollNumber = String(counterRow.roll_counter).padStart(6, '0');
    const studentCode = `STU-${instId}-${rollNumber}`;
    const studentUsername = generateUniqueUsername(full_name);
    const initialPasswordHash = hashPassword(rollNumber); // Initial Password/PIN = Roll Number!

    const studentRole = db
      .prepare("SELECT id FROM roles WHERE institution_id = ? AND slug = 'student' LIMIT 1")
      .get(instId) as { id: number } | undefined;

    const userInfo = db
      .prepare(
        `INSERT INTO users (institution_id, username, password_hash, full_name, account_type, role_id, photo_url, phone, status, must_change_password, created_at)
         VALUES (?, ?, ?, ?, 'student', ?, ?, ?, 'active', 1, ?)`
      )
      .run(instId, studentUsername, initialPasswordHash, full_name, studentRole?.id ?? null, photo_url, student_mobile, now);
    const studentUserId = Number(userInfo.lastInsertRowid);
    syncUserIdentity({
      userId: studentUserId,
      institutionId: instId,
      accountType: 'student',
      fullName: full_name,
      phone: student_mobile,
      photoUrl: photo_url,
      address,
      status: 'active',
      roleIds: studentRole ? [studentRole.id] : [],
    });

    // Link existing guardian by mobile or create new guardian account
    let guardianId: number | null = null;
    let guardianCredentials: { username: string; initialPin: string; reused: boolean } | null = null;

    if (createGuardianAccount) {
      const existingGuardian = guardian_mobile
        ? (db
            .prepare(
              `SELECT g.id, u.username FROM guardians g JOIN users u ON u.id = g.user_id
               WHERE g.institution_id = ? AND g.mobile = ? LIMIT 1`
            )
            .get(instId, guardian_mobile) as { id: number; username: string } | undefined)
        : undefined;

      if (existingGuardian) {
        guardianId = existingGuardian.id;
        guardianCredentials = { username: existingGuardian.username, initialPin: '(বিদ্যমান পাসওয়ার্ড)', reused: true };
      } else {
        const gRole = db
          .prepare("SELECT id FROM roles WHERE institution_id = ? AND slug = 'guardian' LIMIT 1")
          .get(instId) as { id: number } | undefined;
        const gUsername = generateUniqueUsername(`g_${guardian_name}`);
        const gPin = rollNumber;
        const gUserInfo = db
          .prepare(
            `INSERT INTO users (institution_id, username, password_hash, full_name, account_type, role_id, phone, status, must_change_password, created_at)
             VALUES (?, ?, ?, ?, 'guardian', ?, ?, 'active', 1, ?)`
          )
          .run(instId, gUsername, hashPassword(gPin), guardian_name, gRole?.id ?? null, guardian_mobile, now);
        const gUserId = Number(gUserInfo.lastInsertRowid);
        syncUserIdentity({
          userId: gUserId,
          institutionId: instId,
          accountType: 'guardian',
          fullName: guardian_name,
          phone: guardian_mobile,
          address,
          status: 'active',
          roleIds: gRole ? [gRole.id] : [],
        });
        const gInfo = db
          .prepare(
            `INSERT INTO guardians (institution_id, user_id, full_name, mobile, address, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(instId, gUserId, guardian_name, guardian_mobile, address, now);
        guardianId = Number(gInfo.lastInsertRowid);
        guardianCredentials = { username: gUsername, initialPin: gPin, reused: false };
      }
    }

    const stuDoc = sanitizeStoredAttachmentRef(req.body?.document_name, req.body?.document_url);
    const stuInfo = db
      .prepare(
        `INSERT INTO students (
          institution_id, user_id, student_code, roll_number, full_name, photo_url,
          father_name, mother_name, guardian_id, guardian_name, guardian_mobile, student_mobile,
          dob, blood_group, address, department_id, class_id, jamaat_id, admission_date,
          previous_institution, additional_info, fee_type, monthly_fee, monthly_meal_cost,
          document_name, document_url, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
      )
      .run(
        instId,
        studentUserId,
        studentCode,
        rollNumber,
        full_name,
        photo_url,
        father_name,
        mother_name,
        guardianId,
        guardian_name,
        guardian_mobile,
        student_mobile,
        dob,
        blood_group,
        address,
        department_id,
        class_id,
        jamaat_id,
        admission_date,
        previous_institution,
        additional_info,
        fee_type,
        monthly_fee,
        monthly_meal_cost,
        stuDoc.name,
        stuDoc.data,
        now
      );

    return {
      studentId: Number(stuInfo.lastInsertRowid),
      studentCode,
      rollNumber,
      username: studentUsername,
      initialPin: rollNumber,
      guardianCredentials,
    };
  });

  const result = admitStudentTx.immediate();

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'ADMIT_STUDENT',
    targetType: 'student',
    targetId: result.studentId,
    targetLabel: `${full_name} (${result.rollNumber})`,
    institutionId: instId,
  });

  res.status(201).json({
    student: db.prepare('SELECT * FROM students WHERE id = ?').get(result.studentId),
    credentials: {
      studentCode: result.studentCode,
      rollNumber: result.rollNumber,
      username: result.username,
      initialPin: result.initialPin,
      guardian: result.guardianCredentials,
    },
  });
});

institutionRouter.put('/students/:id', requirePermission('students', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const s = db.prepare('SELECT * FROM students WHERE id = ? AND institution_id = ?').get(id, instId) as any;
  if (!s) return res.status(404).json({ error: 'শিক্ষার্থী পাওয়া যায়নি।' });

  const full_name = String(req.body?.full_name || s.full_name).trim();
  const status = req.body?.status === 'inactive' ? 'inactive' : 'active';
  const photo_url = req.body?.photo_url !== undefined ? sanitizeImageUrl(req.body.photo_url) : s.photo_url;
  const fee_type = ['regular', 'one_time', 'free'].includes(req.body?.fee_type) ? req.body.fee_type : s.fee_type;
  const monthly_fee =
    req.body?.monthly_fee !== undefined
      ? Number(Math.max(0, Number(req.body.monthly_fee || 0)).toFixed(2))
      : Number(s.monthly_fee || 0);
  const monthly_meal_cost =
    req.body?.monthly_meal_cost !== undefined
      ? Number(Math.max(0, Number(req.body.monthly_meal_cost || 0)).toFixed(2))
      : Number(s.monthly_meal_cost || 0);

  const nextDepartmentId = req.body?.department_id ? Number(req.body.department_id) : s.department_id;
  const nextClassId = req.body?.class_id ? Number(req.body.class_id) : s.class_id;
  let nextJamaatId: number | null =
    req.body?.jamaat_id !== undefined
      ? req.body.jamaat_id
        ? Number(req.body.jamaat_id)
        : null
      : s.jamaat_id;

  if (nextClassId) {
    const validCls = db
      .prepare('SELECT id, department_id FROM classes WHERE id = ? AND institution_id = ?')
      .get(nextClassId, instId) as { id: number; department_id: number } | undefined;
    if (!validCls || (nextDepartmentId && validCls.department_id !== nextDepartmentId)) {
      return res.status(400).json({ error: 'নির্বাচিত বিভাগ ও ক্লাস সঠিক নয়।' });
    }
  }
  if (nextJamaatId) {
    const validJamaat = db.prepare('SELECT id FROM jamaat_names WHERE id = ? AND institution_id = ?').get(nextJamaatId, instId);
    if (!validJamaat) {
      return res.status(400).json({ error: 'নির্বাচিত শ্রেণী/জামাতের নাম সঠিক নয়।' });
    }
  }

  const stuDoc =
    req.body?.document_url !== undefined
      ? sanitizeStoredAttachmentRef(req.body?.document_name, req.body?.document_url)
      : { name: s.document_name || '', data: s.document_url || '' };

  db.prepare(
    `UPDATE students SET
      full_name = ?, photo_url = ?, father_name = ?, mother_name = ?, guardian_name = ?, guardian_mobile = ?,
      student_mobile = ?, dob = ?, blood_group = ?, address = ?, department_id = ?, class_id = ?, jamaat_id = ?,
      previous_institution = ?, additional_info = ?, fee_type = ?, monthly_fee = ?, monthly_meal_cost = ?,
      document_name = ?, document_url = ?, status = ?
     WHERE id = ? AND institution_id = ?`
  ).run(
    full_name,
    photo_url,
    String(req.body?.father_name ?? s.father_name).trim(),
    String(req.body?.mother_name ?? s.mother_name).trim(),
    String(req.body?.guardian_name ?? s.guardian_name).trim(),
    String(req.body?.guardian_mobile ?? s.guardian_mobile).trim(),
    String(req.body?.student_mobile ?? s.student_mobile).trim(),
    String(req.body?.dob ?? s.dob).trim(),
    String(req.body?.blood_group ?? s.blood_group).trim(),
    String(req.body?.address ?? s.address).trim(),
    nextDepartmentId,
    nextClassId,
    nextJamaatId,
    String(req.body?.previous_institution ?? s.previous_institution).trim(),
    String(req.body?.additional_info ?? s.additional_info).trim(),
    fee_type,
    monthly_fee,
    monthly_meal_cost,
    stuDoc.name,
    stuDoc.data,
    status,
    id,
    instId
  );

  db.prepare('UPDATE users SET full_name = ?, photo_url = ?, status = ? WHERE id = ?').run(full_name, photo_url, status, s.user_id);
  syncUserIdentity({
    userId: s.user_id,
    institutionId: instId,
    accountType: 'student',
    fullName: full_name,
    phone: String(req.body?.student_mobile ?? s.student_mobile).trim(),
    photoUrl: photo_url,
    address: String(req.body?.address ?? s.address).trim(),
    status,
  });

  res.json({ success: true });
});

institutionRouter.delete('/students/:id', requirePermission('students', 'delete'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const s = db.prepare('SELECT user_id FROM students WHERE id = ? AND institution_id = ?').get(id, instId) as { user_id: number } | undefined;
  if (!s) return res.status(404).json({ error: 'শিক্ষার্থী পাওয়া যায়নি।' });
  db.prepare('DELETE FROM users WHERE id = ? AND institution_id = ?').run(s.user_id, instId);
  res.json({ success: true });
});

// ==================== 9. ATTENDANCE (STUDENT & TEACHER) ====================
institutionRouter.get('/attendance/students', requirePermission('attendance', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const date = String(req.query.date || getDhakaDateYMD());
  const session = String(req.query.session || 'সকাল');
  const department_id = req.query.department_id ? Number(req.query.department_id) : null;
  const class_id = req.query.class_id ? Number(req.query.class_id) : null;
  const jamaat_id = req.query.jamaat_id ? Number(req.query.jamaat_id) : null;

  let sql = `
    SELECT s.id as student_id, s.full_name, s.roll_number, s.student_code, s.photo_url,
           d.name as department_name, c.name as class_name,
           s.jamaat_id, j.name as jamaat_name,
           sa.status, sa.note
    FROM students s
    LEFT JOIN academic_departments d ON d.id = s.department_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN jamaat_names j ON j.id = s.jamaat_id
    LEFT JOIN student_attendance sa
      ON sa.student_id = s.id AND sa.institution_id = s.institution_id
      AND sa.attendance_date = ? AND sa.session_name = ?
    WHERE s.institution_id = ? AND s.status = 'active'
  `;
  const params: any[] = [date, session, instId];
  if (isClassScopedTeacher(req.authUser!)) {
    const scope = getTeacherAssignedScope(instId, req.authUser!.id);
    if (class_id && !scope.classIds.has(class_id)) {
      return res.status(403).json({ error: 'আপনি শুধুমাত্র আপনার নির্ধারিত শ্রেণীর উপস্থিতি দেখতে পারবেন।' });
    }
    if (scope.classIds.size === 0) return res.json({ records: [], date, session });
    const ids = Array.from(scope.classIds);
    sql += ` AND s.class_id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }
  if (department_id) {
    sql += ' AND s.department_id = ?';
    params.push(department_id);
  }
  if (class_id) {
    sql += ' AND s.class_id = ?';
    params.push(class_id);
  }
  if (jamaat_id) {
    sql += ' AND s.jamaat_id = ?';
    params.push(jamaat_id);
  }
  sql += ' ORDER BY s.roll_number ASC';

  const weekday = getDhakaBengaliWeekdayFromYMD(date);
  let schedSql = `
    SELECT r.id, r.department_id, r.class_id, r.jamaat_id, r.subject_id, r.teacher_id,
           r.day_of_week, r.is_daily, r.period_number, r.start_time, r.end_time, r.room,
           c.name as class_name, j.name as jamaat_name, s.name as subject_name, t.full_name as teacher_name,
           'routine' as source
    FROM routines r
    JOIN classes c ON c.id = r.class_id
    LEFT JOIN jamaat_names j ON j.id = r.jamaat_id
    JOIN subjects s ON s.id = r.subject_id
    JOIN teachers t ON t.id = r.teacher_id
    WHERE r.institution_id = ?
      AND (r.day_of_week = ? OR r.is_daily = 1 OR r.day_of_week = ?)
  `;
  const schedParams: any[] = [instId, weekday, DAILY_DAY_OPTION];
  if (department_id) {
    schedSql += ' AND r.department_id = ?';
    schedParams.push(department_id);
  }
  if (class_id) {
    schedSql += ' AND r.class_id = ?';
    schedParams.push(class_id);
  }
  if (jamaat_id) {
    schedSql += ' AND r.jamaat_id = ?';
    schedParams.push(jamaat_id);
  }
  schedSql += ' ORDER BY r.start_time ASC, r.period_number ASC';
  const routineClasses = db.prepare(schedSql).all(...schedParams) as any[];

  let tsSql = `
    SELECT ts.id, ts.department_id, ts.class_id, ts.jamaat_id, ts.subject_id, ts.teacher_id,
           ts.day_of_week, ts.is_daily, 0 as period_number, ts.start_time, ts.end_time, ts.room_number as room,
           c.name as class_name, j.name as jamaat_name, COALESCE(s.name, 'সাধারণ ক্লাস') as subject_name, t.full_name as teacher_name,
           'teacher_schedule' as source
    FROM teacher_schedules ts
    LEFT JOIN classes c ON c.id = ts.class_id
    LEFT JOIN jamaat_names j ON j.id = ts.jamaat_id
    LEFT JOIN subjects s ON s.id = ts.subject_id
    JOIN teachers t ON t.id = ts.teacher_id
    WHERE ts.institution_id = ? AND ts.status = 'active'
      AND (ts.day_of_week = ? OR ts.is_daily = 1 OR ts.day_of_week = ?)
  `;
  const tsParams: any[] = [instId, weekday, DAILY_DAY_OPTION];
  if (department_id) {
    tsSql += ' AND ts.department_id = ?';
    tsParams.push(department_id);
  }
  if (class_id) {
    tsSql += ' AND ts.class_id = ?';
    tsParams.push(class_id);
  }
  if (jamaat_id) {
    tsSql += ' AND ts.jamaat_id = ?';
    tsParams.push(jamaat_id);
  }
  tsSql += ' ORDER BY ts.start_time ASC';
  const tsClasses = db.prepare(tsSql).all(...tsParams) as any[];

  const seenAttSlots = new Set<string>();
  const scheduled_classes: any[] = [];
  for (const item of [...routineClasses, ...tsClasses]) {
    const key = `${item.class_id || 0}|${item.start_time}|${item.end_time}|${item.subject_id || 0}`;
    if (seenAttSlots.has(key)) continue;
    seenAttSlots.add(key);
    scheduled_classes.push(item);
  }
  scheduled_classes.sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));

  res.json({ records: db.prepare(sql).all(...params), date, session, weekday, scheduled_classes });
});

institutionRouter.post('/attendance/students/bulk', requirePermission('attendance', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const date = String(req.body?.date || getDhakaDateYMD()).trim();
  const session = String(req.body?.session || 'সকাল').trim();
  const department_id = req.body?.department_id ? Number(req.body.department_id) : null;
  const class_id = req.body?.class_id ? Number(req.body.class_id) : null;
  const entries: Array<{ student_id: number; status: string; note?: string }> = Array.isArray(req.body?.entries) ? req.body.entries : [];

  if (entries.length === 0) return res.status(400).json({ error: 'উপস্থিতির তথ্য পাওয়া যায়নি।' });

  const classScoped = isClassScopedTeacher(req.authUser!);
  const scope = classScoped ? getTeacherAssignedScope(instId, req.authUser!.id) : null;
  if (classScoped && class_id && !scope!.classIds.has(class_id)) {
    return res.status(403).json({ error: 'অনির্ধারিত শ্রেণীতে উপস্থিতি নেওয়ার অনুমতি নেই।' });
  }

  // Verify all submitted students belong to this institution (and to teacher's assigned classes if class-scoped)
  const stuCheck = db.prepare('SELECT id, class_id, department_id FROM students WHERE id = ? AND institution_id = ?');
  const verifiedEntries: Array<{ student_id: number; class_id: number | null; department_id: number | null; status: string; note: string }> = [];
  for (const e of entries) {
    if (!['present', 'absent', 'late', 'leave'].includes(e.status)) continue;
    const stu = stuCheck.get(Number(e.student_id), instId) as { id: number; class_id: number; department_id: number } | undefined;
    if (!stu) return res.status(404).json({ error: 'অবৈধ শিক্ষার্থী আইডি পাওয়া গেছে।' });
    if (classScoped && !scope!.classIds.has(stu.class_id)) {
      return res.status(403).json({ error: 'অনির্ধারিত শ্রেণীর শিক্ষার্থীর উপস্থিতি সংরক্ষণ করা যাবে না।' });
    }
    verifiedEntries.push({
      student_id: stu.id,
      class_id: class_id || stu.class_id,
      department_id: department_id || stu.department_id,
      status: e.status,
      note: String(e.note || ''),
    });
  }

  const now = getDhakaNowISO();
  const upsert = db.prepare(
    `INSERT INTO student_attendance (institution_id, department_id, class_id, student_id, attendance_date, session_name, status, marked_by, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(institution_id, student_id, attendance_date, session_name)
     DO UPDATE SET status = excluded.status, note = excluded.note, marked_by = excluded.marked_by`
  );

  const tx = db.transaction(() => {
    for (const e of verifiedEntries) {
      upsert.run(instId, e.department_id, e.class_id, e.student_id, date, session, e.status, req.authUser!.id, e.note, now);
    }
  });
  tx();

  res.json({ success: true, saved: verifiedEntries.length });
});

institutionRouter.get('/attendance/teachers', requirePermission('attendance', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const date = String(req.query.date || getDhakaDateYMD());
  const weekday = getDhakaBengaliWeekdayFromYMD(date);
  const rows = db
    .prepare(
      `SELECT t.id as teacher_id, t.full_name, t.mobile, t.photo_url, d.name as department_name,
              ta.status, ta.check_in, ta.check_out, ta.note
       FROM teachers t
       LEFT JOIN academic_departments d ON d.id = t.department_id
       LEFT JOIN teacher_attendance ta ON ta.teacher_id = t.id AND ta.institution_id = t.institution_id AND ta.attendance_date = ?
       WHERE t.institution_id = ? AND t.status = 'active'
       ORDER BY t.full_name ASC`
    )
    .all(date, instId) as any[];

  const schedRows = db
    .prepare(
      `SELECT ts.teacher_id, ts.start_time, ts.end_time, ts.day_of_week, ts.is_daily,
              c.name as class_name, s.name as subject_name
       FROM teacher_schedules ts
       LEFT JOIN classes c ON c.id = ts.class_id
       LEFT JOIN subjects s ON s.id = ts.subject_id
       WHERE ts.institution_id = ? AND ts.status = 'active'
         AND (ts.day_of_week = ? OR ts.is_daily = 1 OR ts.day_of_week = ?)`
    )
    .all(instId, weekday, DAILY_DAY_OPTION) as any[];

  const routineRows = db
    .prepare(
      `SELECT r.teacher_id, r.start_time, r.end_time, r.day_of_week, r.is_daily,
              c.name as class_name, s.name as subject_name
       FROM routines r
       LEFT JOIN classes c ON c.id = r.class_id
       LEFT JOIN subjects s ON s.id = r.subject_id
       WHERE r.institution_id = ?
         AND (r.day_of_week = ? OR r.is_daily = 1 OR r.day_of_week = ?)`
    )
    .all(instId, weekday, DAILY_DAY_OPTION) as any[];

  const byTeacher = new Map<number, any[]>();
  const seenPerTeacher = new Map<number, Set<string>>();
  for (const item of [...schedRows, ...routineRows]) {
    const tid = Number(item.teacher_id);
    if (!byTeacher.has(tid)) byTeacher.set(tid, []);
    if (!seenPerTeacher.has(tid)) seenPerTeacher.set(tid, new Set());
    const key = `${item.start_time}|${item.end_time}|${item.class_name || ''}`;
    if (seenPerTeacher.get(tid)!.has(key)) continue;
    seenPerTeacher.get(tid)!.add(key);
    byTeacher.get(tid)!.push(item);
  }

  const enriched = rows.map((row) => {
    const list = (byTeacher.get(Number(row.teacher_id)) || []).sort((a, b) =>
      String(a.start_time).localeCompare(String(b.start_time))
    );
    return {
      ...row,
      today_class_count: list.length,
      today_classes: list,
    };
  });

  res.json({ records: enriched, date, weekday });
});

institutionRouter.post('/attendance/teachers/bulk', requirePermission('attendance', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const date = String(req.body?.date || getDhakaDateYMD()).trim();
  const entries: Array<{ teacher_id: number; status: string; check_in?: string; check_out?: string; note?: string }> = Array.isArray(req.body?.entries)
    ? req.body.entries
    : [];

  const now = getDhakaNowISO();
  const upsert = db.prepare(
    `INSERT INTO teacher_attendance (institution_id, teacher_id, attendance_date, status, check_in, check_out, marked_by, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(institution_id, teacher_id, attendance_date)
     DO UPDATE SET status = excluded.status, check_in = excluded.check_in, check_out = excluded.check_out, note = excluded.note, marked_by = excluded.marked_by`
  );

  const tx = db.transaction(() => {
    for (const e of entries) {
      if (!['present', 'absent', 'late', 'leave'].includes(e.status)) continue;
      upsert.run(
        instId,
        Number(e.teacher_id),
        date,
        e.status,
        String(e.check_in || ''),
        String(e.check_out || ''),
        req.authUser!.id,
        String(e.note || ''),
        now
      );
    }
  });
  tx();
  recomputeInstitutionLiveStatuses(instId, { broadcast: true, forceBroadcast: true });
  res.json({ success: true });
});

// ==================== 10. EXAMINATIONS & RESULTS ====================
institutionRouter.get('/exams', requirePermission('exams', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const deptId = req.query.department_id ? Number(req.query.department_id) : null;
  const classId = req.query.class_id ? Number(req.query.class_id) : null;
  const jamaatId = req.query.jamaat_id ? Number(req.query.jamaat_id) : null;

  let sql = `
    SELECT e.*, d.name as department_name, c.name as class_name,
           j.name as jamaat_name, j.short_name as jamaat_short_name
    FROM examinations e
    JOIN academic_departments d ON d.id = e.department_id
    JOIN classes c ON c.id = e.class_id
    LEFT JOIN jamaat_names j ON j.id = e.jamaat_id
    WHERE e.institution_id = ?
  `;
  const params: any[] = [instId];
  const classScoped = isClassScopedTeacher(req.authUser!);
  const scope = classScoped ? getTeacherAssignedScope(instId, req.authUser!.id) : null;
  if (classScoped) {
    if (classId && !scope!.classIds.has(classId)) {
      return res.status(403).json({ error: 'অনির্ধারিত শ্রেণীর পরীক্ষা দেখার অনুমতি নেই।' });
    }
    if (scope!.classIds.size === 0) return res.json({ exams: [] });
    const ids = Array.from(scope!.classIds);
    sql += ` AND e.class_id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }
  if (deptId) {
    sql += ' AND e.department_id = ?';
    params.push(deptId);
  }
  if (classId) {
    sql += ' AND e.class_id = ?';
    params.push(classId);
  }
  if (jamaatId) {
    sql += ' AND e.jamaat_id = ?';
    params.push(jamaatId);
  }
  sql += ' ORDER BY e.created_at DESC';

  const exams = db.prepare(sql).all(...params) as any[];
  const subStmt = db.prepare(
    `SELECT es.*, s.name as subject_name, s.code as subject_code
     FROM exam_subjects es
     JOIN subjects s ON s.id = es.subject_id
     WHERE es.exam_id = ?`
  );
  res.json({
    exams: exams.map((e) => {
      let subs = subStmt.all(e.id) as any[];
      if (classScoped) {
        const allowedSubs = scope!.subjectIdsByClass.get(e.class_id);
        if (allowedSubs !== null) {
          subs = subs.filter((s) => (allowedSubs ? allowedSubs.has(s.subject_id) : false));
        }
      }
      return { ...e, subjects: subs };
    }),
  });
});

institutionRouter.post('/exams', requirePermission('exams', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const name = String(req.body?.name || '').trim();
  const academic_year = String(req.body?.academic_year || '').trim();
  const department_id = Number(req.body?.department_id);
  const class_id = Number(req.body?.class_id);
  const jamaat_id = req.body?.jamaat_id ? Number(req.body.jamaat_id) : null;
  const start_date = String(req.body?.start_date || '').trim();
  const end_date = String(req.body?.end_date || '').trim();
  const status = ['draft', 'ongoing', 'completed'].includes(req.body?.status) ? req.body.status : 'draft';
  const excludedSubjectIds: number[] = Array.isArray(req.body?.excluded_subject_ids)
    ? req.body.excluded_subject_ids.map(Number)
    : [];

  if (!name || !academic_year || !department_id || !class_id) {
    return res.status(400).json({ error: 'পরীক্ষার নাম, শিক্ষাবর্ষ, বিভাগ ও শ্রেণী আবশ্যক।' });
  }

  const validCls = db
    .prepare('SELECT id FROM classes WHERE id = ? AND department_id = ? AND institution_id = ?')
    .get(class_id, department_id, instId);
  if (!validCls) {
    return res.status(400).json({ error: 'নির্বাচিত বিভাগ ও ক্লাস সঠিক নয়।' });
  }
  if (jamaat_id) {
    const validJam = db.prepare('SELECT id FROM jamaat_names WHERE id = ? AND institution_id = ?').get(jamaat_id, instId);
    if (!validJam) {
      return res.status(400).json({ error: 'নির্বাচিত শ্রেণী/জামাতের নাম এই প্রতিষ্ঠানের অন্তর্ভুক্ত নয়।' });
    }
  }

  const classSubjects = db
    .prepare('SELECT id, full_marks, pass_marks FROM subjects WHERE class_id = ? AND institution_id = ?')
    .all(class_id, instId) as Array<{ id: number; full_marks: number; pass_marks: number }>;

  const now = getDhakaNowISO();
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO examinations (institution_id, name, academic_year, department_id, class_id, jamaat_id, start_date, end_date, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(instId, name, academic_year, department_id, class_id, jamaat_id, start_date, end_date, status, now);
    const examId = Number(info.lastInsertRowid);

    const insSub = db.prepare(
      'INSERT INTO exam_subjects (exam_id, subject_id, full_marks, pass_marks, included) VALUES (?, ?, ?, ?, ?)'
    );
    for (const s of classSubjects) {
      insSub.run(examId, s.id, s.full_marks, s.pass_marks, excludedSubjectIds.includes(s.id) ? 0 : 1);
    }
    return examId;
  });

  const examId = tx();
  res.status(201).json({ id: examId });
});

institutionRouter.patch('/exams/:examId/subjects/:subjectId', requirePermission('exams', 'edit'), (req, res) => {
  const examId = Number(req.params.examId);
  const subjectId = Number(req.params.subjectId);
  const exam = db.prepare('SELECT id FROM examinations WHERE id = ? AND institution_id = ?').get(examId, req.institutionId!);
  if (!exam) return res.status(404).json({ error: 'পরীক্ষা পাওয়া যায়নি।' });

  const included = req.body?.included ? 1 : 0;
  db.prepare('UPDATE exam_subjects SET included = ? WHERE exam_id = ? AND subject_id = ?').run(included, examId, subjectId);
  res.json({ success: true });
});

institutionRouter.patch('/exams/:examId/status', requirePermission('exams', 'publish'), (req, res) => {
  const examId = Number(req.params.examId);
  const status = String(req.body?.status || '');
  if (!['draft', 'ongoing', 'completed', 'published'].includes(status)) {
    return res.status(400).json({ error: 'অবৈধ স্ট্যাটাস।' });
  }
  const exam = db.prepare('SELECT * FROM examinations WHERE id = ? AND institution_id = ?').get(examId, req.institutionId!) as any;
  if (!exam) return res.status(404).json({ error: 'পরীক্ষা পাওয়া যায়নি।' });

  const now = getDhakaNowISO();
  db.prepare(
    `UPDATE examinations SET status = ?, published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END,
      published_by = CASE WHEN ? = 'published' THEN ? ELSE published_by END
     WHERE id = ? AND institution_id = ?`
  ).run(status, status, now, status, req.authUser!.id, examId, req.institutionId!);

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: status === 'published' ? 'PUBLISH_EXAM_RESULTS' : 'UPDATE_EXAM_STATUS',
    targetType: 'examination',
    targetId: examId,
    targetLabel: exam.name,
    institutionId: req.institutionId!,
  });

  res.json({ success: true });
});

institutionRouter.delete('/exams/:examId', requirePermission('exams', 'delete'), (req, res) => {
  db.prepare('DELETE FROM examinations WHERE id = ? AND institution_id = ?').run(Number(req.params.examId), req.institutionId!);
  res.json({ success: true });
});

// Marks Entry
institutionRouter.get('/exams/:examId/marks', requirePermission('exams', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const examId = Number(req.params.examId);
  const subjectId = Number(req.query.subject_id);
  const exam = db
    .prepare(
      `SELECT e.*, d.name as department_name, c.name as class_name, j.name as jamaat_name
       FROM examinations e
       LEFT JOIN academic_departments d ON d.id = e.department_id
       LEFT JOIN classes c ON c.id = e.class_id
       LEFT JOIN jamaat_names j ON j.id = e.jamaat_id
       WHERE e.id = ? AND e.institution_id = ?`
    )
    .get(examId, instId) as any;
  if (!exam) return res.status(404).json({ error: 'পরীক্ষা পাওয়া যায়নি।' });

  if (isClassScopedTeacher(req.authUser!)) {
    const scope = getTeacherAssignedScope(instId, req.authUser!.id);
    if (!scope.classIds.has(exam.class_id)) {
      return res.status(403).json({ error: 'অনির্ধারিত শ্রেণীর পরীক্ষার নম্বর দেখার অনুমতি নেই।' });
    }
    const allowedSubs = scope.subjectIdsByClass.get(exam.class_id);
    if (subjectId && allowedSubs !== null && (!allowedSubs || !allowedSubs.has(subjectId))) {
      return res.status(403).json({ error: 'অনির্ধারিত বিষয়ের নম্বর দেখার অনুমতি নেই।' });
    }
  }

  const subjectInfo = db
    .prepare(
      `SELECT es.full_marks, es.pass_marks, s.name as subject_name
       FROM exam_subjects es JOIN subjects s ON s.id = es.subject_id
       WHERE es.exam_id = ? AND es.subject_id = ?`
    )
    .get(examId, subjectId) as any;

  const rows = db
    .prepare(
      `SELECT st.id as student_id, st.full_name, st.roll_number, st.student_code, st.photo_url,
              j.name as jamaat_name,
              em.obtained_marks, em.grade, em.gpa
       FROM students st
       LEFT JOIN jamaat_names j ON j.id = st.jamaat_id
       LEFT JOIN exam_marks em ON em.student_id = st.id AND em.exam_id = ? AND em.subject_id = ?
       WHERE st.institution_id = ? AND st.class_id = ? AND st.status = 'active'
       ORDER BY st.roll_number ASC`
    )
    .all(examId, subjectId, instId, exam.class_id);

  res.json({ exam, subjectInfo, rows });
});

institutionRouter.post('/exams/:examId/marks', requirePermission('exams', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const examId = Number(req.params.examId);
  const subjectId = Number(req.body?.subject_id);
  const entries: Array<{ student_id: number; obtained_marks: number }> = Array.isArray(req.body?.entries) ? req.body.entries : [];

  const exam = db.prepare('SELECT * FROM examinations WHERE id = ? AND institution_id = ?').get(examId, instId) as any;
  if (!exam) return res.status(404).json({ error: 'পরীক্ষা পাওয়া যায়নি।' });

  if (isClassScopedTeacher(req.authUser!)) {
    const scope = getTeacherAssignedScope(instId, req.authUser!.id);
    if (!scope.classIds.has(exam.class_id)) {
      return res.status(403).json({ error: 'অনির্ধারিত শ্রেণীর পরীক্ষার নম্বর এন্ট্রি করার অনুমতি নেই।' });
    }
    const allowedSubs = scope.subjectIdsByClass.get(exam.class_id);
    if (allowedSubs !== null && (!allowedSubs || !allowedSubs.has(subjectId))) {
      return res.status(403).json({ error: 'অনির্ধারিত বিষয়ের নম্বর এন্ট্রি করার অনুমতি নেই।' });
    }
  }

  const subRow = db
    .prepare('SELECT full_marks, pass_marks FROM exam_subjects WHERE exam_id = ? AND subject_id = ?')
    .get(examId, subjectId) as { full_marks: number; pass_marks: number } | undefined;
  const fullMarks = subRow?.full_marks || 100;

  const instRow = db.prepare('SELECT grading_scale_json FROM institutions WHERE id = ?').get(instId) as { grading_scale_json: string };
  const scale = JSON.parse(instRow.grading_scale_json || JSON.stringify(DEFAULT_GRADING_SCALE));
  const now = getDhakaNowISO();

  // Verify every student belongs to this institution and exam class
  const stuCheck = db.prepare('SELECT id FROM students WHERE id = ? AND institution_id = ? AND class_id = ?');
  for (const e of entries) {
    const ok = stuCheck.get(Number(e.student_id), instId, exam.class_id);
    if (!ok) return res.status(403).json({ error: 'নির্বাচিত শিক্ষার্থী এই পরীক্ষার শ্রেণীর অন্তর্ভুক্ত নয়।' });
  }

  const getOld = db.prepare('SELECT obtained_marks FROM exam_marks WHERE exam_id = ? AND student_id = ? AND subject_id = ?');
  const upsert = db.prepare(
    `INSERT INTO exam_marks (institution_id, exam_id, student_id, subject_id, full_marks, obtained_marks, grade, gpa, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(exam_id, student_id, subject_id)
     DO UPDATE SET full_marks = excluded.full_marks, obtained_marks = excluded.obtained_marks, grade = excluded.grade, gpa = excluded.gpa, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  );
  const logAudit = db.prepare(
    `INSERT INTO exam_marks_audit (institution_id, exam_id, student_id, subject_id, old_marks, new_marks, changed_by, changed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    for (const e of entries) {
      const obtained = Math.min(fullMarks, Math.max(0, Number(e.obtained_marks || 0)));
      const { grade, gpa } = calculateGrade(obtained, fullMarks, scale);
      const prev = getOld.get(examId, Number(e.student_id), subjectId) as { obtained_marks: number } | undefined;
      upsert.run(instId, examId, Number(e.student_id), subjectId, fullMarks, obtained, grade, gpa, req.authUser!.id, now);
      if (!prev || prev.obtained_marks !== obtained) {
        logAudit.run(instId, examId, Number(e.student_id), subjectId, prev?.obtained_marks ?? null, obtained, req.authUser!.full_name, now);
      }
    }
  });
  tx();
  res.json({ success: true });
});

// Exact Result Navigation: Student Complete Result Profile (all subjects across exams)
institutionRouter.get('/results/student/:studentId', requirePermission('exams', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const studentId = Number(req.params.studentId);
  const student = db
    .prepare(
      `SELECT s.*, u.username, d.name as department_name, c.name as class_name,
              j.name as jamaat_name, j.short_name as jamaat_short_name
       FROM students s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN academic_departments d ON d.id = s.department_id
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN jamaat_names j ON j.id = s.jamaat_id
       WHERE s.id = ? AND s.institution_id = ?`
    )
    .get(studentId, instId) as any;
  if (!student) return res.status(404).json({ error: 'শিক্ষার্থী পাওয়া যায়নি।' });

  if (isClassScopedTeacher(req.authUser!)) {
    const scope = getTeacherAssignedScope(instId, req.authUser!.id);
    if (!scope.classIds.has(student.class_id)) {
      return res.status(403).json({ error: 'অনির্ধারিত শ্রেণীর শিক্ষার্থীর ফলাফল দেখার অনুমতি নেই।' });
    }
  }

  const instRow = db.prepare('SELECT grading_scale_json FROM institutions WHERE id = ?').get(instId) as { grading_scale_json: string };
  const scale = JSON.parse(instRow.grading_scale_json || JSON.stringify(DEFAULT_GRADING_SCALE));

  const exams = db
    .prepare(
      `SELECT e.*, j.name as jamaat_name
       FROM examinations e
       LEFT JOIN jamaat_names j ON j.id = e.jamaat_id
       WHERE e.institution_id = ? AND e.class_id = ?
       ORDER BY e.created_at DESC`
    )
    .all(instId, student.class_id) as any[];

  const examResults = exams.map((exam) => {
    const subjects = db
      .prepare(
        `SELECT es.subject_id, s.name as subject_name, s.code as subject_code,
                es.full_marks, es.pass_marks,
                em.obtained_marks, em.grade, em.gpa
         FROM exam_subjects es
         JOIN subjects s ON s.id = es.subject_id
         LEFT JOIN exam_marks em ON em.exam_id = es.exam_id AND em.subject_id = es.subject_id AND em.student_id = ?
         WHERE es.exam_id = ? AND es.included = 1
         ORDER BY s.id ASC`
      )
      .all(studentId, exam.id) as any[];

    const entered = subjects.filter((s) => s.obtained_marks !== null && s.obtained_marks !== undefined);
    const totalFull = subjects.reduce((acc, s) => acc + Number(s.full_marks || 0), 0);
    const totalObtained = entered.reduce((acc, s) => acc + Number(s.obtained_marks || 0), 0);
    const average = entered.length > 0 ? Number((totalObtained / entered.length).toFixed(2)) : 0;
    const anyFailed = entered.some((s) => Number(s.obtained_marks) < Number(s.pass_marks));
    const avgGpa = entered.length > 0 ? Number((entered.reduce((a, b) => a + Number(b.gpa || 0), 0) / entered.length).toFixed(2)) : 0;
    const overall = calculateGrade(totalObtained, totalFull || 100, scale);

    // Calculate class rank for this exam
    const rankings = db
      .prepare(
        `SELECT student_id, SUM(obtained_marks) as total_marks
         FROM exam_marks
         WHERE exam_id = ? AND institution_id = ?
         GROUP BY student_id
         ORDER BY total_marks DESC`
      )
      .all(exam.id, instId) as Array<{ student_id: number; total_marks: number }>;
    const posIdx = rankings.findIndex((r) => r.student_id === studentId);

    return {
      exam,
      subjects,
      summary: {
        totalSubjects: subjects.length,
        enteredSubjects: entered.length,
        totalFullMarks: totalFull,
        totalObtainedMarks: totalObtained,
        averageMarks: average,
        gpa: anyFailed ? 0 : avgGpa,
        grade: entered.length === 0 ? 'অপ্রকাশিত' : anyFailed ? 'রাসিব (F)' : overall.grade,
        passFail: entered.length === 0 ? 'পেন্ডিং' : anyFailed ? 'অকৃতকার্য' : 'কৃতকার্য',
        position: posIdx >= 0 ? posIdx + 1 : null,
      },
    };
  });

  res.json({ student, examResults });
});
