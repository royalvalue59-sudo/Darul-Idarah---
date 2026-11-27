import { Router } from 'express';
import {
  AUDIT_CATEGORIES,
  buildWhatsAppUrl,
  db,
  DEFAULT_ADMISSION_FIELDS,
  DEFAULT_GRADING_SCALE,
  getDhakaDateYMD,
  getDhakaNowISO,
  normalizeWhatsAppNumber,
  sanitizeBrandLogoDataUrl,
  validateFacebookUrl,
} from '../db.ts';
import {
  createSession,
  getClientIp,
  hashPassword,
  recordAuditLog,
  recordPasswordResetLog,
  requireAuth,
  requireSuperAdmin,
  resolveUserRolesAndRouting,
  seedInstitutionDefaults,
  syncUserIdentity,
} from '../auth.ts';
import { broadcastNotice, notifySessionRevoked, notifyUserSessionsRevoked } from '../realtime.ts';

export const superRouter = Router();
superRouter.use(requireAuth, requireSuperAdmin);

// 1. Dashboard Statistics
superRouter.get('/dashboard', (_req, res) => {
  const instStats = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended
       FROM institutions`
    )
    .get() as any;

  const userStats = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
       FROM users`
    )
    .get() as any;

  const ticketStats = db
    .prepare(
      `SELECT
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_tickets,
        SUM(CASE WHEN status IN ('open', 'in_progress', 'waiting_for_user') THEN 1 ELSE 0 END) as unresolved_issues
       FROM support_tickets`
    )
    .get() as any;

  const totalStudents = (db.prepare('SELECT COUNT(*) as c FROM students').get() as { c: number }).c;
  const totalTeachers = (db.prepare('SELECT COUNT(*) as c FROM teachers').get() as { c: number }).c;

  const activeSessions = (
    db.prepare('SELECT COUNT(*) as c FROM sessions WHERE expires_at > ?').get(getDhakaNowISO()) as { c: number }
  ).c;

  const recentInstitutions = db
    .prepare(
      `SELECT i.id, i.name, i.code, i.username, i.status, i.created_at,
        (SELECT COUNT(*) FROM students s WHERE s.institution_id = i.id) as student_count,
        (SELECT COUNT(*) FROM teachers t WHERE t.institution_id = i.id) as teacher_count
       FROM institutions i
       ORDER BY i.created_at DESC
       LIMIT 6`
    )
    .all();

  const recentAudit = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8')
    .all();

  const memUsage = process.memoryUsage();

  res.json({
    stats: {
      totalInstitutions: instStats?.total || 0,
      activeInstitutions: instStats?.active || 0,
      draftInstitutions: instStats?.draft || 0,
      pendingInstitutions: instStats?.pending || 0,
      suspendedInstitutions: instStats?.suspended || 0,
      totalUsers: userStats?.total || 0,
      activeUsers: userStats?.active || 0,
      totalStudents,
      totalTeachers,
      openSupportTickets: ticketStats?.open_tickets || 0,
      unresolvedIssues: ticketStats?.unresolved_issues || 0,
      activeSessions,
      systemHealth: {
        status: 'স্বাভাবিক (Healthy)',
        uptimeSeconds: Math.floor(process.uptime()),
        memoryMb: Math.round(memUsage.rss / (1024 * 1024)),
        dbEngine: 'SQLite WAL',
      },
    },
    recentInstitutions,
    recentAudit,
  });
});

// 2. Institutions CRUD (Strictly ONLY Institution Name, Username, Password/PIN for creation!)
superRouter.get('/institutions', (req, res) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();

  let sql = `
    SELECT i.*,
      (SELECT COUNT(*) FROM students s WHERE s.institution_id = i.id) as student_count,
      (SELECT COUNT(*) FROM teachers t WHERE t.institution_id = i.id) as teacher_count,
      (SELECT COUNT(*) FROM users u WHERE u.institution_id = i.id) as user_count
    FROM institutions i
    WHERE 1=1
  `;
  const params: any[] = [];
  if (search) {
    sql += ' AND (i.name LIKE ? OR i.username LIKE ? OR i.code LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status && status !== 'all') {
    sql += ' AND i.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY i.created_at DESC';

  const rows = db.prepare(sql).all(...params);
  res.json({ institutions: rows });
});

superRouter.post('/institutions', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '').trim();
  const mode = req.body?.mode === 'draft' ? 'draft' : 'active';

  if (!name) {
    return res.status(400).json({ error: 'প্রতিষ্ঠানের নাম আবশ্যক।' });
  }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'ইউজারনেম কমপক্ষে ৩ অক্ষরের হতে হবে (ইংরেজি অক্ষর, সংখ্যা, _ বা .)।' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'পাসওয়ার্ড/পিন কমপক্ষে ৪ অঙ্কের হতে হবে।' });
  }

  const dupUser = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
  const dupInst = db.prepare('SELECT id FROM institutions WHERE username = ? COLLATE NOCASE').get(username);
  if (dupUser || dupInst) {
    return res.status(409).json({ error: 'এই ইউজারনেমটি ইতিমধ্যেই ব্যবহৃত হচ্ছে। অন্য ইউজারনেম দিন।' });
  }

  const now = getDhakaNowISO();
  const code = `DI-${String(Date.now()).slice(-6)}`;
  const passHash = hashPassword(password);

  const createTx = db.transaction(() => {
    const instInfo = db
      .prepare(
        `INSERT INTO institutions (name, code, username, status, grading_scale_json, admission_fields_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        code,
        username,
        mode,
        JSON.stringify(DEFAULT_GRADING_SCALE),
        JSON.stringify(DEFAULT_ADMISSION_FIELDS),
        now,
        now
      );

    const institutionId = Number(instInfo.lastInsertRowid);
    const { muhtamimRoleId } = seedInstitutionDefaults(institutionId);

    const adminInfo = db
      .prepare(
        `INSERT INTO users (institution_id, username, password_hash, full_name, account_type, role_id, status, created_at)
         VALUES (?, ?, ?, ?, 'institution_admin', ?, ?, ?)`
      )
      .run(institutionId, username, passHash, name, muhtamimRoleId, mode === 'draft' ? 'draft' : 'active', now);

    syncUserIdentity({
      userId: Number(adminInfo.lastInsertRowid),
      institutionId,
      accountType: 'institution_admin',
      fullName: name,
      status: mode === 'draft' ? 'draft' : 'active',
      roleIds: muhtamimRoleId ? [muhtamimRoleId] : [],
    });

    return institutionId;
  });

  const institutionId = createTx();

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: mode === 'draft' ? 'CREATE_INSTITUTION_DRAFT' : 'CREATE_AND_ACTIVATE_INSTITUTION',
    targetType: 'institution',
    targetId: institutionId,
    targetLabel: name,
    institutionId,
    institutionName: name,
    result: 'success',
  });

  const created = db.prepare('SELECT * FROM institutions WHERE id = ?').get(institutionId);
  res.status(201).json({ institution: created });
});

superRouter.put('/institutions/:id', (req, res) => {
  const id = Number(req.params.id);
  const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(id) as any;
  if (!inst) return res.status(404).json({ error: 'প্রতিষ্ঠান পাওয়া যায়নি।' });

  const name = String(req.body?.name || inst.name).trim();
  const address = String(req.body?.address ?? inst.address).trim();
  const phone = String(req.body?.phone ?? inst.phone).trim();
  const academic_year = String(req.body?.academic_year ?? inst.academic_year).trim();

  db.prepare('UPDATE institutions SET name = ?, address = ?, phone = ?, academic_year = ?, updated_at = ? WHERE id = ?').run(
    name,
    address,
    phone,
    academic_year,
    getDhakaNowISO(),
    id
  );
  db.prepare("UPDATE users SET full_name = ? WHERE institution_id = ? AND account_type = 'institution_admin'").run(name, id);

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'EDIT_INSTITUTION',
    targetType: 'institution',
    targetId: id,
    targetLabel: name,
    institutionId: id,
    institutionName: name,
  });

  res.json({ institution: db.prepare('SELECT * FROM institutions WHERE id = ?').get(id) });
});

superRouter.patch('/institutions/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || '');
  if (!['active', 'draft', 'pending', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'অবৈধ স্ট্যাটাস।' });
  }
  const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(id) as any;
  if (!inst) return res.status(404).json({ error: 'প্রতিষ্ঠান পাওয়া যায়নি।' });

  db.prepare('UPDATE institutions SET status = ?, updated_at = ? WHERE id = ?').run(status, getDhakaNowISO(), id);

  if (status === 'active') {
    db.prepare("UPDATE users SET status = 'active' WHERE institution_id = ? AND account_type = 'institution_admin'").run(id);
    db.prepare("UPDATE institution_members SET status = 'active' WHERE institution_id = ? AND member_type = 'institution_admin'").run(id);
  } else if (status === 'draft') {
    db.prepare("UPDATE users SET status = 'draft' WHERE institution_id = ? AND account_type = 'institution_admin'").run(id);
    db.prepare("UPDATE institution_members SET status = 'draft' WHERE institution_id = ? AND member_type = 'institution_admin'").run(id);
  } else if (status === 'suspended') {
    const tokens = db.prepare('SELECT token FROM sessions WHERE institution_id = ?').all(id) as Array<{ token: string }>;
    db.prepare('DELETE FROM sessions WHERE institution_id = ?').run(id);
    for (const t of tokens) notifySessionRevoked(t.token);
  }

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: `INSTITUTION_STATUS_${status.toUpperCase()}`,
    targetType: 'institution',
    targetId: id,
    targetLabel: inst.name,
    institutionId: id,
    institutionName: inst.name,
  });

  res.json({ institution: db.prepare('SELECT * FROM institutions WHERE id = ?').get(id) });
});

superRouter.post('/institutions/:id/reset-password', (req, res) => {
  const id = Number(req.params.id);
  const newPassword = String(req.body?.password || '').trim();
  const confirmPassword = req.body?.confirm_password !== undefined ? String(req.body.confirm_password).trim() : newPassword;
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'নতুন পাসওয়ার্ড/পিন কমপক্ষে ৪ অক্ষরের হতে হবে।' });
  }
  if (confirmPassword !== newPassword) {
    return res.status(400).json({ error: 'নতুন পাসওয়ার্ড এবং কনফার্ম পাসওয়ার্ড মিলছে না।' });
  }
  const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(id) as any;
  if (!inst) return res.status(404).json({ error: 'প্রতিষ্ঠান পাওয়া যায়নি।' });

  const adminUser = db
    .prepare("SELECT id, username, full_name FROM users WHERE institution_id = ? AND account_type = 'institution_admin' LIMIT 1")
    .get(id) as { id: number; username: string; full_name: string } | undefined;
  if (!adminUser) return res.status(404).json({ error: 'প্রতিষ্ঠান অ্যাডমিন অ্যাকাউন্ট পাওয়া যায়নি।' });

  const passHash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?').run(
    passHash,
    adminUser.id
  );
  // Invalidate active sessions for the institution main account so old sessions cannot persist
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND impersonated_by_user_id IS NULL').run(adminUser.id);
  notifyUserSessionsRevoked(adminUser.id);

  recordPasswordResetLog({
    institutionId: id,
    institutionName: inst.name,
    targetUserId: adminUser.id,
    targetUsername: adminUser.username,
    targetFullName: adminUser.full_name || inst.name,
    targetRole: 'মাদ্রাসা মূল অ্যাকাউন্ট',
    resetByUserId: req.authUser!.id,
    resetByName: req.authUser!.full_name,
    resetByRole: 'সুপার অ্যাডমিন',
    resetScope: 'super_admin_institution',
    ipAddress: getClientIp(req),
  });

  res.json({
    success: true,
    message: `${inst.name} (${adminUser.username})-এর পাসওয়ার্ড সফলভাবে রিসেট করা হয়েছে।`,
  });
});

superRouter.get('/institutions/:id/password-reset-logs', (req, res) => {
  const id = Number(req.params.id);
  const logs = db
    .prepare(
      `SELECT id, institution_id, target_user_id, target_username, target_full_name, target_role,
              reset_by_user_id, reset_by_name, reset_by_role, reset_scope, used_roll_as_pin, ip_address, created_at
       FROM password_reset_logs
       WHERE institution_id = ?
       ORDER BY created_at DESC
       LIMIT 100`
    )
    .all(id);
  res.json({ logs });
});

superRouter.delete('/institutions/:id', (req, res) => {
  const id = Number(req.params.id);
  const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(id) as any;
  if (!inst) return res.status(404).json({ error: 'প্রতিষ্ঠান পাওয়া যায়নি।' });

  const tokens = db.prepare('SELECT token FROM sessions WHERE institution_id = ?').all(id) as Array<{ token: string }>;
  db.prepare('DELETE FROM institutions WHERE id = ?').run(id);
  for (const t of tokens) notifySessionRevoked(t.token);

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'DELETE_INSTITUTION',
    targetType: 'institution',
    targetId: id,
    targetLabel: inst.name,
    institutionId: null,
    institutionName: inst.name,
  });

  res.json({ success: true });
});

superRouter.get('/institutions/:id/login-history', (req, res) => {
  const id = Number(req.params.id);
  const history = db
    .prepare('SELECT * FROM login_history WHERE institution_id = ? ORDER BY created_at DESC LIMIT 100')
    .all(id);
  res.json({ history });
});

superRouter.post('/institutions/:id/login-as', (req, res) => {
  const id = Number(req.params.id);
  const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(id) as any;
  if (!inst) return res.status(404).json({ error: 'প্রতিষ্ঠান পাওয়া যায়নি।' });

  const adminUser = db
    .prepare(
      `SELECT u.*, r.name as role_name, r.permissions_json
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.institution_id = ? AND u.account_type = 'institution_admin'
       LIMIT 1`
    )
    .get(id) as any;

  if (!adminUser) return res.status(404).json({ error: 'প্রতিষ্ঠান অ্যাডমিন অ্যাকাউন্ট পাওয়া যায়নি।' });

  // Ensure admin user can be impersonated even if draft (only by Super Admin)
  if (adminUser.status !== 'active' && inst.status === 'active') {
    db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(adminUser.id);
  }
  if (inst.status !== 'active') {
    return res.status(400).json({ error: 'লগইন করার আগে প্রতিষ্ঠানটি সক্রিয় (Active) করুন।' });
  }

  const token = createSession({
    userId: adminUser.id,
    institutionId: inst.id,
    sessionScope: 'institution',
    impersonatedByUserId: req.authUser!.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'LOGIN_AS_INSTITUTION',
    targetType: 'institution',
    targetId: inst.id,
    targetLabel: inst.name,
    institutionId: inst.id,
    institutionName: inst.name,
    details: { impersonated_username: adminUser.username },
  });

  const resolved = resolveUserRolesAndRouting({
    userId: adminUser.id,
    primaryRoleId: adminUser.role_id,
    accountType: adminUser.account_type,
    impersonatedByUserId: req.authUser!.id,
  });

  res.json({
    token,
    user: {
      id: adminUser.id,
      institution_id: inst.id,
      username: adminUser.username,
      full_name: adminUser.full_name,
      account_type: adminUser.account_type,
      role_id: adminUser.role_id,
      role_slug: resolved.role_slug,
      role_name: resolved.role_name,
      role_ids: resolved.role_ids,
      role_names: resolved.role_names,
      permissions: resolved.permissions,
      dashboard_route: resolved.dashboard_route,
      session_scope: 'institution',
      photo_url: adminUser.photo_url || '',
      phone: adminUser.phone || '',
      must_change_password: 0,
      impersonated_by_user_id: req.authUser!.id,
    },
    institution: {
      id: inst.id,
      name: inst.name,
      code: inst.code,
      logo_url: inst.logo_url,
      address: inst.address,
      phone: inst.phone,
      academic_year: inst.academic_year,
    },
  });
});

// 3. Platform Users
superRouter.get('/users', (req, res) => {
  const search = String(req.query.search || '').trim();
  const type = String(req.query.account_type || '').trim();
  let sql = `
    SELECT u.id, u.institution_id, u.username, u.full_name, u.account_type, u.phone, u.status,
           u.failed_attempts, u.locked_until, u.last_login_at, u.created_at,
           i.name as institution_name, r.name as role_name
    FROM users u
    LEFT JOIN institutions i ON i.id = u.institution_id
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (search) {
    sql += ' AND (u.username LIKE ? OR u.full_name LIKE ? OR i.name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (type && type !== 'all') {
    sql += ' AND u.account_type = ?';
    params.push(type);
  }
  sql += ' ORDER BY u.created_at DESC LIMIT 300';
  res.json({ users: db.prepare(sql).all(...params) });
});

superRouter.patch('/users/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || '');
  if (!['active', 'inactive', 'locked'].includes(status)) {
    return res.status(400).json({ error: 'অবৈধ স্ট্যাটাস।' });
  }
  if (id === req.authUser!.id) {
    return res.status(400).json({ error: 'নিজের অ্যাকাউন্ট পরিবর্তন করা যাবে না।' });
  }
  const user = db.prepare('SELECT id, username, institution_id FROM users WHERE id = ?').get(id) as any;
  if (!user) return res.status(404).json({ error: 'ব্যবহারকারী পাওয়া যায়নি।' });

  db.prepare('UPDATE users SET status = ?, locked_until = NULL, failed_attempts = 0 WHERE id = ?').run(status, id);
  if (user.institution_id) {
    db.prepare('UPDATE institution_members SET status = ? WHERE institution_id = ? AND user_id = ?').run(status, user.institution_id, id);
  }
  if (status !== 'active') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    notifyUserSessionsRevoked(id);
  }

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: `USER_STATUS_${status.toUpperCase()}`,
    targetType: 'user',
    targetId: id,
    targetLabel: user.username,
    institutionId: user.institution_id,
  });

  res.json({ success: true });
});

superRouter.post('/users/:id/reset-password', (req, res) => {
  const id = Number(req.params.id);
  const password = String(req.body?.password || '').trim();
  const confirmPassword = req.body?.confirm_password !== undefined ? String(req.body.confirm_password).trim() : password;
  if (password.length < 4) {
    return res.status(400).json({ error: 'পাসওয়ার্ড/পিন কমপক্ষে ৪ অক্ষরের হতে হবে।' });
  }
  if (confirmPassword !== password) {
    return res.status(400).json({ error: 'নতুন পাসওয়ার্ড এবং কনফার্ম পাসওয়ার্ড মিলছে না।' });
  }
  const user = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.account_type, u.institution_id,
              r.name as role_name, i.name as institution_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN institutions i ON i.id = u.institution_id
       WHERE u.id = ?`
    )
    .get(id) as any;
  if (!user) return res.status(404).json({ error: 'ব্যবহারকারী পাওয়া যায়নি।' });

  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?').run(
    hashPassword(password),
    id
  );
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND impersonated_by_user_id IS NULL').run(id);
  notifyUserSessionsRevoked(id);

  recordPasswordResetLog({
    institutionId: user.institution_id ?? null,
    institutionName: user.institution_name || '',
    targetUserId: user.id,
    targetUsername: user.username,
    targetFullName: user.full_name || user.username,
    targetRole: user.role_name || user.account_type,
    resetByUserId: req.authUser!.id,
    resetByName: req.authUser!.full_name,
    resetByRole: 'সুপার অ্যাডমিন',
    resetScope: user.account_type === 'institution_admin' ? 'super_admin_institution' : 'super_admin_user',
    ipAddress: getClientIp(req),
  });

  res.json({ success: true, message: `${user.full_name} (${user.username})-এর পাসওয়ার্ড রিসেট করা হয়েছে।` });
});

// 4. Roles & Permissions overview across platform
superRouter.get('/roles', (_req, res) => {
  const roles = db
    .prepare(
      `SELECT r.*, i.name as institution_name
       FROM roles r
       LEFT JOIN institutions i ON i.id = r.institution_id
       ORDER BY i.name ASC, r.id ASC`
    )
    .all()
    .map((r: any) => ({ ...r, permissions: JSON.parse(r.permissions_json || '{}') }));
  res.json({ roles });
});

// 5. Support Center
superRouter.get('/support', (req, res) => {
  const status = String(req.query.status || '');
  let sql = `
    SELECT t.*, i.name as institution_name,
      (SELECT COUNT(*) FROM support_replies sr WHERE sr.ticket_id = t.id) as reply_count
    FROM support_tickets t
    LEFT JOIN institutions i ON i.id = t.institution_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (status && status !== 'all') {
    sql += ' AND t.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY t.updated_at DESC';
  res.json({ tickets: db.prepare(sql).all(...params) });
});

superRouter.get('/support/:id', (req, res) => {
  const id = Number(req.params.id);
  const ticket = db
    .prepare(
      `SELECT t.*, i.name as institution_name
       FROM support_tickets t
       LEFT JOIN institutions i ON i.id = t.institution_id
       WHERE t.id = ?`
    )
    .get(id);
  if (!ticket) return res.status(404).json({ error: 'টিকেট পাওয়া যায়নি।' });
  const replies = db.prepare('SELECT * FROM support_replies WHERE ticket_id = ? ORDER BY created_at ASC').all(id);
  res.json({ ticket, replies });
});

superRouter.post('/support/:id/reply', (req, res) => {
  const id = Number(req.params.id);
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'উত্তর লিখুন।' });
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id) as any;
  if (!ticket) return res.status(404).json({ error: 'টিকেট পাওয়া যায়নি।' });

  const now = getDhakaNowISO();
  db.prepare(
    `INSERT INTO support_replies (ticket_id, user_id, author_name, author_role, message, created_at)
     VALUES (?, ?, ?, 'সুপার অ্যাডমিন সাপোর্ট', ?, ?)`
  ).run(id, req.authUser!.id, req.authUser!.full_name, message, now);

  const nextStatus = ticket.status === 'open' ? 'in_progress' : ticket.status;
  db.prepare('UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, now, id);

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'REPLY_SUPPORT_TICKET',
    targetType: 'support_ticket',
    targetId: id,
    targetLabel: ticket.ticket_code,
    institutionId: ticket.institution_id,
  });

  res.status(201).json({ success: true });
});

superRouter.patch('/support/:id', (req, res) => {
  const id = Number(req.params.id);
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id) as any;
  if (!ticket) return res.status(404).json({ error: 'টিকেট পাওয়া যায়নি।' });

  const status = req.body?.status ? String(req.body.status) : ticket.status;
  const assigned_to = req.body?.assigned_to !== undefined ? String(req.body.assigned_to).trim() : ticket.assigned_to;
  const priority = req.body?.priority ? String(req.body.priority) : ticket.priority;

  if (!['open', 'in_progress', 'waiting_for_user', 'resolved', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'অবৈধ স্ট্যাটাস।' });
  }

  db.prepare('UPDATE support_tickets SET status = ?, assigned_to = ?, priority = ?, updated_at = ? WHERE id = ?').run(
    status,
    assigned_to,
    priority,
    getDhakaNowISO(),
    id
  );

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: `SUPPORT_TICKET_${status.toUpperCase()}`,
    targetType: 'support_ticket',
    targetId: id,
    targetLabel: ticket.ticket_code,
    institutionId: ticket.institution_id,
  });

  res.json({ ticket: db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id) });
});

// 6. Platform Reports
superRouter.get('/reports', (_req, res) => {
  const institutionBreakdown = db
    .prepare(
      `SELECT i.id, i.name, i.code, i.status, i.created_at,
        (SELECT COUNT(*) FROM students s WHERE s.institution_id = i.id AND s.status = 'active') as active_students,
        (SELECT COUNT(*) FROM teachers t WHERE t.institution_id = i.id AND t.status = 'active') as active_teachers,
        (SELECT COALESCE(SUM(amount), 0) FROM finance_transactions f WHERE f.institution_id = i.id AND f.type = 'income') as total_income,
        (SELECT COALESCE(SUM(amount), 0) FROM finance_transactions f WHERE f.institution_id = i.id AND f.type = 'expense') as total_expense
       FROM institutions i
       ORDER BY i.created_at DESC`
    )
    .all();

  const ticketSummary = db
    .prepare('SELECT status, COUNT(*) as count FROM support_tickets GROUP BY status')
    .all();

  const usersByType = db
    .prepare('SELECT account_type, COUNT(*) as count FROM users GROUP BY account_type')
    .all();

  res.json({ institutionBreakdown, ticketSummary, usersByType });
});

// 7. Platform Notifications (Broadcasts live via WS!)
superRouter.get('/notifications', (_req, res) => {
  const notices = db
    .prepare('SELECT * FROM notices WHERE institution_id IS NULL ORDER BY created_at DESC LIMIT 100')
    .all();
  res.json({ notifications: notices });
});

superRouter.post('/notifications', (req, res) => {
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const audience_type = String(req.body?.audience_type || 'institutions');
  const audience_target_id = String(req.body?.audience_target_id || '');
  if (!title || !description) {
    return res.status(400).json({ error: 'শিরোনাম ও বিবরণ আবশ্যক।' });
  }
  const now = getDhakaNowISO();
  const publish_date = getDhakaDateYMD();
  const info = db
    .prepare(
      `INSERT INTO notices (institution_id, title, description, publish_date, audience_type, audience_target_id, status, created_by_id, created_by_name, created_at)
       VALUES (NULL, ?, ?, ?, ?, ?, 'published', ?, ?, ?)`
    )
    .run(title, description, publish_date, audience_type, audience_target_id, req.authUser!.id, req.authUser!.full_name, now);

  const id = Number(info.lastInsertRowid);
  broadcastNotice({
    id,
    institution_id: null,
    title,
    description,
    audience_type,
    audience_target_id,
    publish_date,
    created_by_name: req.authUser!.full_name,
  });

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'SEND_PLATFORM_NOTIFICATION',
    targetType: 'notice',
    targetId: id,
    targetLabel: title,
  });

  res.status(201).json({ notification: db.prepare('SELECT * FROM notices WHERE id = ?').get(id) });
});

// 8. System Settings
superRouter.get('/settings', (_req, res) => {
  const rows = db.prepare('SELECT key, value_json, updated_at FROM system_settings').all() as Array<{
    key: string;
    value_json: string;
    updated_at: string;
  }>;
  const settings: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      settings[r.key] = JSON.parse(r.value_json);
    } catch {
      settings[r.key] = r.value_json;
    }
  }
  res.json({ settings });
});

superRouter.put('/settings', (req, res) => {
  const updates = req.body?.settings;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'সেটিংস ডাটা সঠিক নয়।' });
  }
  const allowedKeys = [
    'platform_name',
    'default_timezone',
    'default_currency',
    'max_failed_logins',
    'lockout_minutes',
    'session_ttl_hours',
    'maintenance_mode',
  ];
  const now = getDhakaNowISO();
  const upsert = db.prepare(
    `INSERT INTO system_settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  );
  const upsertApp = db.prepare(
    `INSERT INTO application_settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  );
  for (const k of allowedKeys) {
    if (k in updates) {
      const val = JSON.stringify(updates[k]);
      upsert.run(k, val, now);
      upsertApp.run(k, val, now);
      if (k === 'platform_name' && typeof updates[k] === 'string' && updates[k].trim()) {
        db.prepare('UPDATE application_branding SET app_name = ?, updated_at = ? WHERE id = 1').run(
          updates[k].trim(),
          now
        );
      }
    }
  }
  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    actorRole: 'সুপার অ্যাডমিন',
    action: 'UPDATE_SYSTEM_SETTINGS',
    module: 'administration',
    categoryCode: 'administration',
    targetType: 'system_settings',
    targetLabel: 'প্ল্যাটফর্ম সেটিংস',
    description: 'প্ল্যাটফর্ম সিস্টেম সেটিংস হালনাগাদ করা হয়েছে',
    ipAddress: getClientIp(req),
  });
  res.json({ success: true });
});

// 8b. Application Branding (Main Application Logo Management)
superRouter.get('/branding', (_req, res) => {
  const row = db
    .prepare('SELECT app_name, logo_data_url, logo_mime, logo_filename, logo_version, updated_by_user_id, updated_at FROM application_branding WHERE id = 1')
    .get() as any;
  res.json({
    branding: {
      app_name: row?.app_name || 'DARUL IDARAH',
      logo_url: row?.logo_data_url || '',
      logo_mime: row?.logo_mime || '',
      logo_filename: row?.logo_filename || '',
      logo_version: row?.logo_version || 1,
      updated_at: row?.updated_at || '',
    },
  });
});

superRouter.put('/branding', (req, res) => {
  const rawLogo = req.body?.logo_url;
  const filename = String(req.body?.logo_filename || '').trim().slice(0, 120);
  const appName = req.body?.app_name !== undefined ? String(req.body.app_name).trim().slice(0, 80) : undefined;
  const now = getDhakaNowISO();

  let validatedLogo: { dataUrl: string; mime: string } | null = null;
  if (rawLogo !== undefined && rawLogo !== null && String(rawLogo).trim() !== '') {
    const check = sanitizeBrandLogoDataUrl(rawLogo);
    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }
    validatedLogo = { dataUrl: check.dataUrl, mime: check.mime };
  }

  // Transactional save & verification before replacing previous logo
  const saveTx = db.transaction(() => {
    const current = db.prepare('SELECT * FROM application_branding WHERE id = 1').get() as any;
    const nextAppName = appName && appName.length > 0 ? appName : (current?.app_name || 'DARUL IDARAH');
    const nextLogo = validatedLogo ? validatedLogo.dataUrl : (rawLogo === '' ? '' : (current?.logo_data_url || ''));
    const nextMime = validatedLogo ? validatedLogo.mime : (rawLogo === '' ? '' : (current?.logo_mime || ''));
    const nextFilename = validatedLogo ? filename : (rawLogo === '' ? '' : (current?.logo_filename || ''));
    const nextVersion = Number(current?.logo_version || 1) + 1;

    db.prepare(
      `UPDATE application_branding
       SET app_name = ?, logo_data_url = ?, logo_mime = ?, logo_filename = ?, logo_version = ?, updated_by_user_id = ?, updated_at = ?
       WHERE id = 1`
    ).run(nextAppName, nextLogo, nextMime, nextFilename, nextVersion, req.authUser!.id, now);

    const verified = db.prepare('SELECT app_name, logo_data_url, logo_mime, logo_filename, logo_version, updated_at FROM application_branding WHERE id = 1').get() as any;
    if (!verified || verified.logo_version !== nextVersion || verified.logo_data_url !== nextLogo) {
      throw new Error('লোগো সংরক্ষণ যাচাই ব্যর্থ হয়েছে।');
    }
    return verified;
  });

  const saved = saveTx();

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    actorRole: 'সুপার অ্যাডমিন',
    action: rawLogo === '' ? 'REMOVE_APP_LOGO' : 'UPDATE_APP_LOGO',
    module: 'administration',
    categoryCode: 'administration',
    targetType: 'application_branding',
    targetId: 1,
    targetLabel: saved.logo_filename || saved.app_name,
    description:
      rawLogo === ''
        ? 'অ্যাপ্লিকেশনের কাস্টম লোগো অপসারণ করে ডিফল্ট লোগো পুনর্বহাল করা হয়েছে'
        : `অ্যাপ্লিকেশনের মূল লোগো হালনাগাদ করা হয়েছে (${saved.logo_mime || 'default'})`,
    ipAddress: getClientIp(req),
    details: { logo_mime: saved.logo_mime, logo_version: saved.logo_version, filename: saved.logo_filename },
  });

  res.json({
    branding: {
      app_name: saved.app_name,
      logo_url: saved.logo_data_url || '',
      logo_mime: saved.logo_mime || '',
      logo_filename: saved.logo_filename || '',
      logo_version: saved.logo_version,
      updated_at: saved.updated_at,
    },
    message: 'অ্যাপ্লিকেশন লোগো সফলভাবে সংরক্ষণ করা হয়েছে।',
  });
});

superRouter.delete('/branding', (req, res) => {
  const now = getDhakaNowISO();
  db.prepare(
    `UPDATE application_branding
     SET logo_data_url = '', logo_mime = '', logo_filename = '', logo_version = logo_version + 1, updated_by_user_id = ?, updated_at = ?
     WHERE id = 1`
  ).run(req.authUser!.id, now);

  const saved = db.prepare('SELECT app_name, logo_data_url, logo_mime, logo_filename, logo_version, updated_at FROM application_branding WHERE id = 1').get() as any;

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    actorRole: 'সুপার অ্যাডমিন',
    action: 'REMOVE_APP_LOGO',
    module: 'administration',
    categoryCode: 'administration',
    targetType: 'application_branding',
    targetId: 1,
    targetLabel: 'ডিফল্ট লোগো',
    description: 'অ্যাপ্লিকেশনের কাস্টম লোগো মুছে ডিফল্ট লোগো চালু করা হয়েছে',
    ipAddress: getClientIp(req),
  });

  res.json({
    branding: {
      app_name: saved?.app_name || 'DARUL IDARAH',
      logo_url: '',
      logo_mime: '',
      logo_filename: '',
      logo_version: saved?.logo_version || 1,
      updated_at: saved?.updated_at || now,
    },
    message: 'কাস্টম লোগো অপসারণ করা হয়েছে।',
  });
});

// 8c. Global Support & Contact Settings
superRouter.get('/support-settings', (_req, res) => {
  const row = db
    .prepare('SELECT whatsapp_number, whatsapp_enabled, facebook_url, facebook_enabled, support_email, support_description, updated_at FROM support_settings WHERE id = 1')
    .get() as any;
  const whatsappNumber = row?.whatsapp_number || '';
  res.json({
    settings: {
      whatsapp_number: whatsappNumber,
      whatsapp_url: buildWhatsAppUrl(whatsappNumber),
      whatsapp_enabled: Boolean(row?.whatsapp_enabled),
      facebook_url: row?.facebook_url || '',
      facebook_enabled: Boolean(row?.facebook_enabled),
      support_email: row?.support_email || '',
      support_description: row?.support_description || '',
      updated_at: row?.updated_at || '',
    },
  });
});

superRouter.put('/support-settings', (req, res) => {
  const rawWhatsapp = req.body?.whatsapp_number ?? '';
  const cleanWhatsapp = normalizeWhatsAppNumber(rawWhatsapp);
  if (String(rawWhatsapp).trim() && cleanWhatsapp.length < 7) {
    return res.status(400).json({ error: 'সঠিক কান্ট্রি কোডসহ হোয়াটসঅ্যাপ নম্বর প্রদান করুন (যেমন: 8801XXXXXXXXX)।' });
  }

  const fbCheck = validateFacebookUrl(req.body?.facebook_url ?? '');
  if (!fbCheck.ok) {
    return res.status(400).json({ error: fbCheck.error });
  }

  const whatsappEnabled = req.body?.whatsapp_enabled === false || req.body?.whatsapp_enabled === 0 ? 0 : 1;
  const facebookEnabled = req.body?.facebook_enabled === false || req.body?.facebook_enabled === 0 ? 0 : 1;
  const supportEmail = String(req.body?.support_email ?? '').trim().slice(0, 120);
  if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
    return res.status(400).json({ error: 'সাপোর্ট ইমেইল ঠিকানা সঠিক নয়।' });
  }
  const supportDescription = String(req.body?.support_description ?? '').trim().slice(0, 500);
  const now = getDhakaNowISO();

  db.prepare(
    `UPDATE support_settings
     SET whatsapp_number = ?, whatsapp_enabled = ?, facebook_url = ?, facebook_enabled = ?,
         support_email = ?, support_description = ?, updated_by_user_id = ?, updated_at = ?
     WHERE id = 1`
  ).run(cleanWhatsapp, whatsappEnabled, fbCheck.url, facebookEnabled, supportEmail, supportDescription, req.authUser!.id, now);

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    actorRole: 'সুপার অ্যাডমিন',
    action: 'UPDATE_SUPPORT_SETTINGS',
    module: 'administration',
    categoryCode: 'administration',
    targetType: 'support_settings',
    targetId: 1,
    targetLabel: 'সাপোর্ট ও যোগাযোগ সেটিংস',
    description: 'হোয়াটসঅ্যাপ ও ফেসবুক সাপোর্ট সেটিংস হালনাগাদ করা হয়েছে',
    ipAddress: getClientIp(req),
    details: {
      whatsapp_configured: Boolean(cleanWhatsapp),
      whatsapp_enabled: Boolean(whatsappEnabled),
      facebook_configured: Boolean(fbCheck.url),
      facebook_enabled: Boolean(facebookEnabled),
    },
  });

  res.json({
    settings: {
      whatsapp_number: cleanWhatsapp,
      whatsapp_url: buildWhatsAppUrl(cleanWhatsapp),
      whatsapp_enabled: Boolean(whatsappEnabled),
      facebook_url: fbCheck.url,
      facebook_enabled: Boolean(facebookEnabled),
      support_email: supportEmail,
      support_description: supportDescription,
      updated_at: now,
    },
    message: 'সাপোর্ট ও যোগাযোগ সেটিংস সফলভাবে সংরক্ষণ করা হয়েছে।',
  });
});

// 9. Audit Logs — Institution Folder Tree & Read-Only Immutable Query (NO PUT/PATCH/DELETE endpoints!)
superRouter.get('/audit-logs/folders', (_req, res) => {
  const institutionFolders = db
    .prepare(
      `SELECT i.id, i.name, i.code, i.username, i.status,
              COUNT(a.id) as log_count,
              MAX(a.created_at) as last_activity_at
       FROM institutions i
       LEFT JOIN audit_logs a ON a.institution_id = i.id
       GROUP BY i.id
       ORDER BY i.name ASC`
    )
    .all();

  const globalRow = db
    .prepare(
      `SELECT COUNT(*) as log_count, MAX(created_at) as last_activity_at
       FROM audit_logs
       WHERE institution_id IS NULL`
    )
    .get() as { log_count: number; last_activity_at: string | null };

  const totalRow = db
    .prepare('SELECT COUNT(*) as total_count FROM audit_logs')
    .get() as { total_count: number };

  res.json({
    folders: institutionFolders,
    globalCount: globalRow?.log_count || 0,
    globalLastActivity: globalRow?.last_activity_at || null,
    totalCount: totalRow?.total_count || 0,
    categories: AUDIT_CATEGORIES,
  });
});

superRouter.get('/audit-logs', (req, res) => {
  const institutionIdParam = String(req.query.institution_id || 'all').trim();
  const moduleFilter = String(req.query.module || 'all').trim();
  const action = String(req.query.action || '').trim();
  const userFilter = String(req.query.user || '').trim();
  const statusFilter = String(req.query.status || 'all').trim();
  const fromDate = String(req.query.from || '').trim();
  const toDate = String(req.query.to || '').trim();
  const search = String(req.query.search || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 1000);

  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: any[] = [];

  if (institutionIdParam === 'global') {
    sql += ' AND institution_id IS NULL';
  } else if (institutionIdParam && institutionIdParam !== 'all' && /^\d+$/.test(institutionIdParam)) {
    sql += ' AND institution_id = ?';
    params.push(Number(institutionIdParam));
  }

  if (moduleFilter && moduleFilter !== 'all') {
    sql += ' AND (module = ? OR category_code = ?)';
    params.push(moduleFilter, moduleFilter);
  }
  if (action && action !== 'all') {
    sql += ' AND action = ?';
    params.push(action);
  }
  if (userFilter && userFilter !== 'all') {
    if (/^\d+$/.test(userFilter)) {
      sql += ' AND actor_user_id = ?';
      params.push(Number(userFilter));
    } else {
      sql += ' AND actor_name LIKE ?';
      params.push(`%${userFilter}%`);
    }
  }
  if (statusFilter === 'success' || statusFilter === 'failure') {
    sql += ' AND result = ?';
    params.push(statusFilter);
  }
  if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    sql += ' AND substr(created_at, 1, 10) >= ?';
    params.push(fromDate);
  }
  if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    sql += ' AND substr(created_at, 1, 10) <= ?';
    params.push(toDate);
  }
  if (search) {
    sql +=
      ' AND (actor_name LIKE ? OR actor_role LIKE ? OR action LIKE ? OR module LIKE ? OR target_label LIKE ? OR description LIKE ? OR institution_name LIKE ? OR ip_address LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like, like, like);
  }

  sql += ' ORDER BY created_at DESC, id DESC LIMIT ?';
  params.push(limit);

  const logs = db.prepare(sql).all(...params);

  // Distinct actors for filter dropdown scoped to current institution selection
  let usersSql = 'SELECT DISTINCT actor_user_id, actor_name, actor_role FROM audit_logs WHERE actor_name != ""';
  const usersParams: any[] = [];
  if (institutionIdParam === 'global') {
    usersSql += ' AND institution_id IS NULL';
  } else if (institutionIdParam && institutionIdParam !== 'all' && /^\d+$/.test(institutionIdParam)) {
    usersSql += ' AND institution_id = ?';
    usersParams.push(Number(institutionIdParam));
  }
  usersSql += ' ORDER BY actor_name ASC LIMIT 200';
  const actors = db.prepare(usersSql).all(...usersParams);

  res.json({ logs, actors, categories: AUDIT_CATEGORIES });
});

// 10. Security Center
superRouter.get('/security', (_req, res) => {
  const loginHistory = db
    .prepare(
      `SELECT lh.*, i.name as institution_name
       FROM login_history lh
       LEFT JOIN institutions i ON i.id = lh.institution_id
       ORDER BY lh.created_at DESC LIMIT 150`
    )
    .all();

  const failedAttempts = db
    .prepare(
      `SELECT lh.*, i.name as institution_name
       FROM login_history lh
       LEFT JOIN institutions i ON i.id = lh.institution_id
       WHERE lh.success = 0
       ORDER BY lh.created_at DESC LIMIT 100`
    )
    .all();

  const suspiciousActivity = db
    .prepare(
      `SELECT lh.*, i.name as institution_name
       FROM login_history lh
       LEFT JOIN institutions i ON i.id = lh.institution_id
       WHERE lh.is_suspicious = 1
       ORDER BY lh.created_at DESC LIMIT 100`
    )
    .all();

  const activeSessions = db
    .prepare(
      `SELECT s.token, s.user_id, s.institution_id, s.impersonated_by_user_id, s.ip_address, s.user_agent, s.created_at, s.last_active_at,
              u.username, u.full_name, u.account_type, i.name as institution_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN institutions i ON i.id = s.institution_id
       WHERE s.expires_at > ?
       ORDER BY s.last_active_at DESC`
    )
    .all(getDhakaNowISO());

  res.json({ loginHistory, failedAttempts, suspiciousActivity, activeSessions });
});

superRouter.post('/security/force-logout', (req, res) => {
  const sessionToken = String(req.body?.token || '').trim();
  const userId = req.body?.user_id ? Number(req.body.user_id) : null;

  if (sessionToken) {
    if (sessionToken === req.authUser!.session_token) {
      return res.status(400).json({ error: 'বর্তমান নিজস্ব সেশন ফোর্স লগআউট করা যাবে না।' });
    }
    db.prepare('DELETE FROM sessions WHERE token = ?').run(sessionToken);
    notifySessionRevoked(sessionToken);
  } else if (userId) {
    if (userId === req.authUser!.id) {
      return res.status(400).json({ error: 'নিজেকে ফোর্স লগআউট করা যাবে না।' });
    }
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    notifyUserSessionsRevoked(userId);
  } else {
    return res.status(400).json({ error: 'সেশন টোকেন অথবা ইউজার আইডি আবশ্যক।' });
  }

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'FORCE_LOGOUT',
    targetType: 'session',
    targetId: userId || sessionToken.slice(0, 12),
    targetLabel: userId ? `User #${userId}` : 'Active Session',
  });

  res.json({ success: true });
});

// 11. App Updates
superRouter.get('/updates', (_req, res) => {
  res.json({ updates: db.prepare('SELECT * FROM app_updates ORDER BY released_at DESC').all() });
});

superRouter.post('/updates', (req, res) => {
  const version = String(req.body?.version || '').trim();
  const title = String(req.body?.title || '').trim();
  const notes = String(req.body?.notes || '').trim();
  if (!version || !title) {
    return res.status(400).json({ error: 'ভার্সন ও শিরোনাম আবশ্যক।' });
  }
  const now = getDhakaNowISO();
  const info = db
    .prepare('INSERT INTO app_updates (version, title, notes, status, released_at) VALUES (?, ?, ?, ?, ?)')
    .run(version, title, notes, 'released', now);

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'PUBLISH_APP_UPDATE',
    targetType: 'app_update',
    targetId: Number(info.lastInsertRowid),
    targetLabel: `${version} - ${title}`,
  });

  res.status(201).json({ update: db.prepare('SELECT * FROM app_updates WHERE id = ?').get(info.lastInsertRowid) });
});

// 12. Backup & Recovery
superRouter.get('/backup/export', (req, res) => {
  const tables = [
    'institutions',
    'roles',
    'admin_departments',
    'designations',
    'academic_departments',
    'classes',
    'subjects',
    'teachers',
    'students',
    'routines',
    'examinations',
    'finance_categories',
    'finance_accounts',
    'finance_transactions',
    'fee_payments',
    'hostel_units',
    'hostel_rooms',
    'hostel_allocations',
    'library_books',
    'library_issues',
    'notices',
    'support_tickets',
    'system_settings',
  ];
  const snapshot: Record<string, unknown> = {
    exportedAt: getDhakaNowISO(),
    platform: 'DARUL IDARAH',
    counts: {} as Record<string, number>,
    data: {} as Record<string, unknown[]>,
  };
  for (const t of tables) {
    const rows = db.prepare(`SELECT * FROM ${t}`).all();
    (snapshot.counts as Record<string, number>)[t] = rows.length;
    (snapshot.data as Record<string, unknown[]>)[t] = rows;
  }

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'EXPORT_PLATFORM_BACKUP',
    targetType: 'backup',
    targetLabel: 'সম্পূর্ণ ডাটাবেস ব্যাকআপ',
  });

  res.json(snapshot);
});
