import { Router } from 'express';
import {
  db,
  getDhakaNowISO,
} from '../db.ts';
import {
  createSession,
  getClientIp,
  hashPassword,
  loginRateLimiter,
  recordAuditLog,
  requireAuth,
  resolveUserRolesAndRouting,
  syncUserIdentity,
  timingSafeStringEqual,
  verifyPassword,
} from '../auth.ts';

export const authRouter = Router();

function getEnvSuperAdmin() {
  const envPass = (process.env.SUPER_ADMIN_PASSWORD || '').trim();
  const envUser = (process.env.SUPER_ADMIN_USERNAME || 'superadmin').trim();
  return envPass.length >= 4 ? { username: envUser, password: envPass } : null;
}

export function ensureEnvSuperAdminSynced() {
  const envCred = getEnvSuperAdmin();
  if (!envCred) return;
  const existing = db
    .prepare("SELECT id, username FROM users WHERE account_type = 'super_admin' ORDER BY id ASC LIMIT 1")
    .get() as { id: number; username: string } | undefined;
  const hash = hashPassword(envCred.password);
  const now = getDhakaNowISO();
  if (existing) {
    db.prepare('UPDATE users SET username = ?, password_hash = ?, status = ? WHERE id = ?').run(
      envCred.username,
      hash,
      'active',
      existing.id
    );
    syncUserIdentity({
      userId: existing.id,
      institutionId: null,
      accountType: 'super_admin',
      fullName: 'সুপার অ্যাডমিন',
      status: 'active',
    });
  } else {
    const info = db
      .prepare(
        `INSERT INTO users (institution_id, username, password_hash, full_name, account_type, role_id, status, created_at)
         VALUES (NULL, ?, ?, 'সুপার অ্যাডমিন', 'super_admin', NULL, 'active', ?)`
      )
      .run(envCred.username, hash, now);
    syncUserIdentity({
      userId: Number(info.lastInsertRowid),
      institutionId: null,
      accountType: 'super_admin',
      fullName: 'সুপার অ্যাডমিন',
      status: 'active',
    });
  }
}

function recordFailedPasswordAttempt(user: any, username: string, ip: string, ua: string, now: string) {
  const maxFailedRow = db.prepare('SELECT value_json FROM system_settings WHERE key = ?').get('max_failed_logins') as { value_json: string } | undefined;
  const lockoutMinRow = db.prepare('SELECT value_json FROM system_settings WHERE key = ?').get('lockout_minutes') as { value_json: string } | undefined;
  const maxFailed = maxFailedRow ? Number(JSON.parse(maxFailedRow.value_json)) || 5 : 5;
  const lockoutMin = lockoutMinRow ? Number(JSON.parse(lockoutMinRow.value_json)) || 15 : 15;

  const newFailed = (user.failed_attempts || 0) + 1;
  const suspicious = newFailed >= 3 ? 1 : 0;
  const lockedUntil = newFailed >= maxFailed ? new Date(Date.now() + lockoutMin * 60 * 1000).toISOString() : null;

  db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(newFailed, lockedUntil, user.id);
  db.prepare(
    `INSERT INTO login_history (user_id, institution_id, username, success, reason, ip_address, user_agent, is_suspicious, created_at)
     VALUES (?, ?, ?, 0, 'ভুল পাসওয়ার্ড/পিন', ?, ?, ?, ?)`
  ).run(user.id, user.institution_id, username, ip, ua, suspicious, now);

  recordAuditLog({
    actorUserId: user.id,
    actorName: user.full_name || username,
    action: 'LOGIN_FAILED',
    module: 'account',
    categoryCode: 'account',
    targetType: 'user',
    targetId: user.id,
    targetLabel: username,
    description: `${username} অ্যাকাউন্টে ভুল পাসওয়ার্ড/পিন দিয়ে ব্যর্থ লগইন প্রচেষ্টা`,
    institutionId: user.institution_id ?? null,
    ipAddress: ip,
    result: 'failure',
    details: { reason: 'ভুল পাসওয়ার্ড/পিন', failed_attempts: newFailed },
  });
}

authRouter.get('/bootstrap-status', (_req, res) => {
  ensureEnvSuperAdminSynced();
  const count = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE account_type = 'super_admin'").get() as { c: number }
  ).c;
  const envConfigured = Boolean(getEnvSuperAdmin());
  res.json({
    needsSetup: count === 0 && !envConfigured,
    envConfigured,
  });
});

authRouter.post('/bootstrap-superadmin', loginRateLimiter(15, 15 * 60 * 1000), (req, res) => {
  ensureEnvSuperAdminSynced();
  if (getEnvSuperAdmin()) {
    return res.status(403).json({ error: 'সুপার অ্যাডমিন ইতিমধ্যেই এনভায়রনমেন্ট কনফিগারেশনে সেট করা আছে।' });
  }
  const existingCount = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE account_type = 'super_admin'").get() as { c: number }
  ).c;
  if (existingCount > 0) {
    return res.status(409).json({ error: 'সুপার অ্যাডমিন অ্যাকাউন্ট ইতিমধ্যেই তৈরি করা হয়েছে।' });
  }

  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '').trim();
  const fullName = String(req.body?.full_name || 'সুপার অ্যাডমিন').trim() || 'সুপার অ্যাডমিন';

  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'ইউজারনেম কমপক্ষে ৩ অক্ষরের হতে হবে (ইংরেজি অক্ষর, সংখ্যা, _ বা .)।' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'পাসওয়ার্ড/পিন কমপক্ষে ৪ অক্ষরের হতে হবে।' });
  }

  const dup = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (dup) {
    return res.status(409).json({ error: 'এই ইউজারনেমটি ইতিমধ্যেই ব্যবহৃত হচ্ছে।' });
  }

  const now = getDhakaNowISO();
  const hash = hashPassword(password);
  const info = db
    .prepare(
      `INSERT INTO users (institution_id, username, password_hash, full_name, account_type, role_id, status, created_at)
       VALUES (NULL, ?, ?, ?, 'super_admin', NULL, 'active', ?)`
    )
    .run(username, hash, fullName, now);

  const userId = Number(info.lastInsertRowid);
  syncUserIdentity({
    userId,
    institutionId: null,
    accountType: 'super_admin',
    fullName,
    status: 'active',
  });

  recordAuditLog({
    actorUserId: userId,
    actorName: fullName,
    action: 'BOOTSTRAP_SUPER_ADMIN',
    targetType: 'user',
    targetId: userId,
    targetLabel: username,
    result: 'success',
  });

  const token = createSession({
    userId,
    institutionId: null,
    sessionScope: 'super_admin',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({
    token,
    user: {
      id: userId,
      username,
      full_name: fullName,
      account_type: 'super_admin',
      institution_id: null,
      role_id: null,
      role_slug: 'super_admin',
      role_name: 'সুপার অ্যাডমিন',
      role_ids: [],
      role_names: ['সুপার অ্যাডমিন'],
      permissions: {},
      dashboard_route: 'super_admin',
      session_scope: 'super_admin',
      photo_url: '',
      phone: '',
      must_change_password: 0,
      impersonated_by_user_id: null,
    },
  });
});

// ==================== A. SUPER ADMIN DEDICATED LOGIN ====================
authRouter.post('/super-admin/login', loginRateLimiter(30, 15 * 60 * 1000), (req, res) => {
  ensureEnvSuperAdminSynced();

  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const ip = req.ip || '';
  const ua = String(req.headers['user-agent'] || '').slice(0, 250);
  const now = getDhakaNowISO();

  if (!username || !password) {
    return res.status(400).json({ error: 'ইউজারনেম এবং পাসওয়ার্ড উভয়ই প্রদান করুন।' });
  }

  const user = db
    .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
    .get(username) as any;

  if (!user) {
    db.prepare(
      `INSERT INTO login_history (user_id, institution_id, username, success, reason, ip_address, user_agent, is_suspicious, created_at)
       VALUES (NULL, NULL, ?, 0, 'সুপার অ্যাডমিন পোর্টালে অজানা অ্যাকাউন্ট', ?, ?, 1, ?)`
    ).run(username, ip, ua, now);
    return res.status(401).json({ error: 'ভুল সুপার অ্যাডমিন ইউজারনেম অথবা পাসওয়ার্ড।' });
  }

  // Strictly block any Institution User from logging in via Super Admin portal
  if (user.account_type !== 'super_admin') {
    db.prepare(
      `INSERT INTO login_history (user_id, institution_id, username, success, reason, ip_address, user_agent, is_suspicious, created_at)
       VALUES (?, ?, ?, 0, 'প্রতিষ্ঠান ব্যবহারকারীর সুপার অ্যাডমিন পোর্টালে অননুমোদিত চেষ্টা', ?, ?, 1, ?)`
    ).run(user.id, user.institution_id, username, ip, ua, now);
    return res.status(403).json({
      error: 'এই লগইন পোর্টাল শুধুমাত্র দারুল ইদারা সুপার অ্যাডমিনের জন্য সংরক্ষিত। প্রতিষ্ঠান ব্যবহারকারীরা মূল লগইন পোর্টাল ব্যবহার করুন।',
    });
  }

  if (user.status === 'locked' || (user.locked_until && new Date(user.locked_until).getTime() > Date.now())) {
    db.prepare(
      `INSERT INTO login_history (user_id, institution_id, username, success, reason, ip_address, user_agent, is_suspicious, created_at)
       VALUES (?, NULL, ?, 0, 'সুপার অ্যাডমিন অ্যাকাউন্ট লক করা আছে', ?, ?, 1, ?)`
    ).run(user.id, username, ip, ua, now);
    return res.status(403).json({ error: 'নিরাপত্তার কারণে এই অ্যাকাউন্টটি সাময়িকভাবে লক করা আছে।' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ error: 'অ্যাকাউন্টটি নিষ্ক্রিয় করা আছে।' });
  }

  const envCred = getEnvSuperAdmin();
  let passwordValid = false;
  if (envCred && user.username.toLowerCase() === envCred.username.toLowerCase()) {
    passwordValid = timingSafeStringEqual(password, envCred.password);
  } else {
    passwordValid = verifyPassword(password, user.password_hash);
  }

  if (!passwordValid) {
    recordFailedPasswordAttempt(user, username, ip, ua, now);
    return res.status(401).json({ error: 'ভুল সুপার অ্যাডমিন ইউজারনেম অথবা পাসওয়ার্ড।' });
  }

  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').run(now, user.id);
  db.prepare(
    `INSERT INTO login_history (user_id, institution_id, username, success, reason, ip_address, user_agent, is_suspicious, created_at)
     VALUES (?, NULL, ?, 1, 'সুপার অ্যাডমিন সফল লগইন', ?, ?, 0, ?)`
  ).run(user.id, username, ip, ua, now);

  const token = createSession({
    userId: user.id,
    institutionId: null,
    sessionScope: 'super_admin',
    ipAddress: ip,
    userAgent: ua,
  });

  recordAuditLog({
    actorUserId: user.id,
    actorName: user.full_name,
    actorRole: 'সুপার অ্যাডমিন',
    action: 'SUPER_ADMIN_LOGIN',
    module: 'account',
    categoryCode: 'account',
    targetType: 'session',
    targetId: user.id,
    targetLabel: user.username,
    description: 'সুপার অ্যাডমিন প্যানেলে সফল লগইন',
    institutionId: null,
    ipAddress: getClientIp(req),
    result: 'success',
  });

  res.json({
    token,
    user: {
      id: user.id,
      institution_id: null,
      username: user.username,
      full_name: user.full_name,
      account_type: 'super_admin',
      role_id: null,
      role_slug: 'super_admin',
      role_name: 'সুপার অ্যাডমিন',
      role_ids: [],
      role_names: ['সুপার অ্যাডমিন'],
      permissions: {},
      dashboard_route: 'super_admin',
      session_scope: 'super_admin',
      photo_url: user.photo_url || '',
      phone: user.phone || '',
      must_change_password: user.must_change_password || 0,
      impersonated_by_user_id: null,
    },
    institution: null,
  });
});

// ==================== B. INSTITUTION USER UNIFIED LOGIN ====================
authRouter.post('/login', loginRateLimiter(40, 15 * 60 * 1000), (req, res) => {
  ensureEnvSuperAdminSynced();

  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const ip = req.ip || '';
  const ua = String(req.headers['user-agent'] || '').slice(0, 250);
  const now = getDhakaNowISO();

  if (!username || !password) {
    return res.status(400).json({ error: 'ইউজারনেম এবং পাসওয়ার্ড/পিন উভয়ই প্রদান করুন।' });
  }

  const user = db
    .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
    .get(username) as any;

  if (!user) {
    db.prepare(
      `INSERT INTO login_history (user_id, institution_id, username, success, reason, ip_address, user_agent, is_suspicious, created_at)
       VALUES (NULL, NULL, ?, 0, 'অ্যাকাউন্ট পাওয়া যায়নি', ?, ?, 0, ?)`
    ).run(username, ip, ua, now);
    return res.status(401).json({ error: 'ভুল ইউজারনেম অথবা পাসওয়ার্ড/পিন।' });
  }

  // Strictly block Super Admin from signing in through the Institution User Login page
  if (user.account_type === 'super_admin' || !user.institution_id) {
    db.prepare(
      `INSERT INTO login_history (user_id, institution_id, username, success, reason, ip_address, user_agent, is_suspicious, created_at)
       VALUES (?, NULL, ?, 0, 'প্রতিষ্ঠান লগইন পোর্টালে সুপার অ্যাডমিন চেষ্টা প্রত্যাখ্যাত', ?, ?, 0, ?)`
    ).run(user.id, username, ip, ua, now);
    return res.status(403).json({
      error: 'এই পোর্টালটি শুধুমাত্র মাদ্রাসার নিবন্ধিত ব্যবহারকারীদের জন্য। অনুগ্রহ করে সঠিক প্রতিষ্ঠান অ্যাকাউন্ট দিয়ে লগইন করুন।',
    });
  }

  // Check lockout
  if (user.status === 'locked' || (user.locked_until && new Date(user.locked_until).getTime() > Date.now())) {
    db.prepare(
      `INSERT INTO login_history (user_id, institution_id, username, success, reason, ip_address, user_agent, is_suspicious, created_at)
       VALUES (?, ?, ?, 0, 'অ্যাকাউন্ট লক করা আছে', ?, ?, 1, ?)`
    ).run(user.id, user.institution_id, username, ip, ua, now);
    return res.status(403).json({ error: 'নিরাপত্তার কারণে এই অ্যাকাউন্টটি সাময়িকভাবে লক করা আছে। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।' });
  }

  if (user.status === 'draft') {
    db.prepare(
      `INSERT INTO login_history (user_id, institution_id, username, success, reason, ip_address, user_agent, is_suspicious, created_at)
       VALUES (?, ?, ?, 0, 'ড্রাফট অ্যাকাউন্ট সক্রিয় নয়', ?, ?, 0, ?)`
    ).run(user.id, user.institution_id, username, ip, ua, now);
    return res.status(403).json({ error: 'এই অ্যাকাউন্টটি এখনও ড্রাফট অবস্থায় আছে এবং সক্রিয় করা হয়নি।' });
  }

  if (user.status !== 'active') {
    db.prepare(
      `INSERT INTO login_history (user_id, institution_id, username, success, reason, ip_address, user_agent, is_suspicious, created_at)
       VALUES (?, ?, ?, 0, 'অ্যাকাউন্ট নিষ্ক্রিয়', ?, ?, 0, ?)`
    ).run(user.id, user.institution_id, username, ip, ua, now);
    return res.status(403).json({ error: 'আপনার অ্যাকাউন্টটি নিষ্ক্রিয় করা আছে।' });
  }

  // Check institution status & institution_members active status
  const institution = db.prepare('SELECT * FROM institutions WHERE id = ?').get(user.institution_id) as any;
  if (!institution || institution.status !== 'active') {
    const msg =
      institution?.status === 'draft'
        ? 'প্রতিষ্ঠানটি এখনও ড্রাফট অবস্থায় আছে। সুপার অ্যাডমিন সক্রিয় না করা পর্যন্ত লগইন করা যাবে না।'
        : institution?.status === 'suspended'
        ? 'প্রতিষ্ঠানটি সাময়িকভাবে স্থগিত করা হয়েছে।'
        : 'প্রতিষ্ঠানটি বর্তমানে সক্রিয় নয়।';
    db.prepare(
      `INSERT INTO login_history (user_id, institution_id, username, success, reason, ip_address, user_agent, is_suspicious, created_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, 0, ?)`
    ).run(user.id, user.institution_id, username, msg, ip, ua, now);
    return res.status(403).json({ error: msg });
  }

  const member = db
    .prepare('SELECT status FROM institution_members WHERE institution_id = ? AND user_id = ?')
    .get(user.institution_id, user.id) as { status: string } | undefined;
  if (member && member.status !== 'active') {
    return res.status(403).json({ error: 'প্রতিষ্ঠানে আপনার সদস্যপদ বর্তমানে নিষ্ক্রিয়।' });
  }

  // Verify scrypt password hash
  if (!verifyPassword(password, user.password_hash)) {
    recordFailedPasswordAttempt(user, username, ip, ua, now);
    return res.status(401).json({ error: 'ভুল ইউজারনেম অথবা পাসওয়ার্ড/পিন।' });
  }

  // Successful unified institution login — backend determines roles & dashboard_route
  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').run(now, user.id);
  db.prepare(
    `INSERT INTO login_history (user_id, institution_id, username, success, reason, ip_address, user_agent, is_suspicious, created_at)
     VALUES (?, ?, ?, 1, 'সফল লগইন', ?, ?, 0, ?)`
  ).run(user.id, user.institution_id, username, ip, ua, now);

  const token = createSession({
    userId: user.id,
    institutionId: user.institution_id,
    sessionScope: 'institution',
    ipAddress: ip,
    userAgent: ua,
  });

  const resolved = resolveUserRolesAndRouting({
    userId: user.id,
    primaryRoleId: user.role_id,
    accountType: user.account_type,
    impersonatedByUserId: null,
  });

  recordAuditLog({
    actorUserId: user.id,
    actorName: user.full_name,
    actorRole: resolved.role_name,
    action: 'LOGIN_SUCCESS',
    module: 'account',
    categoryCode: 'account',
    targetType: 'session',
    targetId: user.id,
    targetLabel: user.username,
    description: `${user.full_name} (${resolved.role_name}) সফলভাবে লগইন করেছেন`,
    institutionId: user.institution_id,
    institutionName: institution.name,
    ipAddress: getClientIp(req),
    result: 'success',
  });

  res.json({
    token,
    user: {
      id: user.id,
      institution_id: user.institution_id,
      username: user.username,
      full_name: user.full_name,
      account_type: user.account_type,
      role_id: user.role_id,
      role_slug: resolved.role_slug,
      role_name: resolved.role_name,
      role_ids: resolved.role_ids,
      role_names: resolved.role_names,
      permissions: resolved.permissions,
      dashboard_route: resolved.dashboard_route,
      session_scope: 'institution',
      photo_url: user.photo_url || '',
      phone: user.phone || '',
      must_change_password: user.must_change_password,
      impersonated_by_user_id: null,
    },
    institution: {
      id: institution.id,
      name: institution.name,
      code: institution.code,
      logo_url: institution.logo_url,
      address: institution.address,
      phone: institution.phone,
      academic_year: institution.academic_year,
    },
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = req.authUser!;
  let institution: any = null;
  if (user.institution_id) {
    institution = db
      .prepare('SELECT id, name, code, logo_url, address, phone, motto, established_year, academic_year, status FROM institutions WHERE id = ?')
      .get(user.institution_id);
  }
  // Unread notices count
  const unreadRow = db
    .prepare(
      `SELECT COUNT(*) as c FROM notices n
       WHERE n.status = 'published'
         AND (n.institution_id IS NULL OR n.institution_id = ?)
         AND NOT EXISTS (SELECT 1 FROM notice_reads nr WHERE nr.notice_id = n.id AND nr.user_id = ?)`
    )
    .get(user.institution_id ?? -1, user.id) as { c: number };

  res.json({
    user,
    institution,
    unreadNotices: unreadRow?.c || 0,
  });
});

authRouter.post('/logout', requireAuth, (req, res) => {
  const user = req.authUser!;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(user.session_token);
  recordAuditLog({
    actorUserId: user.id,
    actorName: user.full_name,
    actorRole: user.role_name,
    action: 'LOGOUT',
    module: 'account',
    categoryCode: 'account',
    targetType: 'session',
    targetId: user.id,
    targetLabel: user.username,
    description: `${user.full_name} লগআউট করেছেন`,
    institutionId: user.institution_id,
    ipAddress: getClientIp(req),
    result: 'success',
  });
  res.json({ success: true });
});

authRouter.post('/change-password', requireAuth, (req, res) => {
  const user = req.authUser!;
  const currentPassword = String(req.body?.current_password || '');
  const newPassword = String(req.body?.new_password || '');

  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'নতুন পাসওয়ার্ড/পিন কমপক্ষে ৪ অক্ষরের হতে হবে।' });
  }

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    return res.status(400).json({ error: 'বর্তমান পাসওয়ার্ড/পিন সঠিক নয়।' });
  }

  // Note: Changing password updates ONLY password_hash & must_change_password; Roll Number / Mobile Number are never modified!
  const newHash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(newHash, user.id);

  recordAuditLog({
    actorUserId: user.id,
    actorName: user.full_name,
    actorRole: user.role_name,
    action: 'CHANGE_PASSWORD',
    module: 'account',
    categoryCode: 'account',
    targetType: 'user',
    targetId: user.id,
    targetLabel: user.username,
    description: `${user.full_name} নিজের পাসওয়ার্ড পরিবর্তন করেছেন`,
    institutionId: user.institution_id,
    ipAddress: getClientIp(req),
    result: 'success',
  });

  res.json({ success: true, message: 'পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে।' });
});

authRouter.post('/exit-impersonation', requireAuth, (req, res) => {
  const user = req.authUser!;
  if (!user.impersonated_by_user_id) {
    return res.status(400).json({ error: 'কোনো ইম্পারসোনেশন সেশন সক্রিয় নেই।' });
  }

  const superAdmin = db
    .prepare("SELECT * FROM users WHERE id = ? AND account_type = 'super_admin' AND status = 'active'")
    .get(user.impersonated_by_user_id) as any;
  if (!superAdmin) {
    return res.status(403).json({ error: 'সুপার অ্যাডমিন অ্যাকাউন্ট পাওয়া যায়নি।' });
  }

  db.prepare('DELETE FROM sessions WHERE token = ?').run(user.session_token);

  recordAuditLog({
    actorUserId: superAdmin.id,
    actorName: superAdmin.full_name,
    action: 'EXIT_LOGIN_AS_INSTITUTION',
    targetType: 'institution',
    targetId: user.institution_id ?? '',
    targetLabel: user.full_name,
    institutionId: user.institution_id,
    result: 'success',
  });

  const token = createSession({
    userId: superAdmin.id,
    institutionId: null,
    sessionScope: 'super_admin',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({
    token,
    user: {
      id: superAdmin.id,
      institution_id: null,
      username: superAdmin.username,
      full_name: superAdmin.full_name,
      account_type: 'super_admin',
      role_id: null,
      role_slug: 'super_admin',
      role_name: 'সুপার অ্যাডমিন',
      role_ids: [],
      role_names: ['সুপার অ্যাডমিন'],
      permissions: {},
      dashboard_route: 'super_admin',
      session_scope: 'super_admin',
      photo_url: superAdmin.photo_url || '',
      phone: superAdmin.phone || '',
      must_change_password: 0,
      impersonated_by_user_id: null,
    },
    institution: null,
  });
});

