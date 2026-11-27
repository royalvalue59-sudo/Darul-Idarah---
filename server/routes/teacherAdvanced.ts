import { Router } from 'express';
import {
  BENGALI_WEEKDAYS,
  DAILY_DAY_OPTION,
  dayOrderSql,
  db,
  FIN_CAT_TEACHER_MEAL,
  FIN_CAT_TEACHER_SALARY,
  generateUniqueTxCode,
  getDhakaBengaliWeekday,
  getDhakaDateYMD,
  getDhakaNowISO,
  getDhakaTimeHM,
  isDailyDayValue,
  normalizeScheduleDay,
} from '../db.ts';
import {
  hasPermission,
  recordAuditLog,
  requireAnyPermission,
  requireAuth,
  requireInstitution,
  requireInstitutionStaff,
  requirePermission,
} from '../auth.ts';
import { sanitizeStoredAttachmentRef, sanitizeStoredImageRef } from '../uploadPolicy.ts';
import {
  computeTeacherLiveStatus,
  createNotification,
  ensureTeacherProfile,
  getTeacherCurrentDue,
  isValidTimeHM,
  recomputeInstitutionLiveStatuses,
  syncApprovedLeaveToAttendance,
  timeToMinutes,
} from '../services/teacherEngine.ts';

export const teacherAdvancedRouter = Router();
teacherAdvancedRouter.use(requireAuth, requireInstitution);

const VALID_PAY_METHODS = ['Cash', 'bKash', 'Nagad', 'Bank'] as const;

function nextSalaryReceiptNumber(instId: number, prefix: 'SAL' | 'ADV' | 'DUE'): string {
  db.prepare('UPDATE institutions SET salary_receipt_counter = salary_receipt_counter + 1 WHERE id = ?').run(instId);
  const { salary_receipt_counter } = db
    .prepare('SELECT salary_receipt_counter FROM institutions WHERE id = ?')
    .get(instId) as { salary_receipt_counter: number };
  return `${prefix}-${String(salary_receipt_counter).padStart(6, '0')}`;
}

function generateTxnId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TXN-${prefix}-${Date.now().toString().slice(-6)}-${rand}`;
}

function sanitizeImageUrl(url: unknown): string {
  return sanitizeStoredImageRef(url, false);
}

function findOrCreateFinanceCategory(instId: number, name: string, type: 'income' | 'expense'): number {
  const existing = db
    .prepare('SELECT id FROM finance_categories WHERE institution_id = ? AND name = ? AND type = ? LIMIT 1')
    .get(instId, name, type) as { id: number } | undefined;
  if (existing) return existing.id;
  const info = db
    .prepare('INSERT INTO finance_categories (institution_id, name, type, is_system, created_at) VALUES (?, ?, ?, 1, ?)')
    .run(instId, name, type, getDhakaNowISO());
  return Number(info.lastInsertRowid);
}

function getDefaultFinanceAccountId(instId: number, paymentMethod: string): number | null {
  const mapName =
    paymentMethod === 'Bank' ? 'ব্যাংক' : paymentMethod === 'bKash' || paymentMethod === 'Nagad' ? 'মোবাইল' : 'নগদ';
  const matched = db
    .prepare('SELECT id FROM finance_accounts WHERE institution_id = ? AND (name LIKE ? OR account_type LIKE ?) LIMIT 1')
    .get(instId, `%${mapName}%`, `%${mapName}%`) as { id: number } | undefined;
  if (matched) return matched.id;
  const first = db
    .prepare('SELECT id FROM finance_accounts WHERE institution_id = ? ORDER BY id ASC LIMIT 1')
    .get(instId) as { id: number } | undefined;
  return first?.id ?? null;
}

// ==================== 1. REAL-TIME NOTIFICATIONS (ALL INSTITUTION MEMBERS) ====================
teacherAdvancedRouter.get('/notifications', (req, res) => {
  const instId = req.institutionId!;
  const userId = req.authUser!.id;
  const rows = db
    .prepare(
      `SELECT * FROM notifications
       WHERE institution_id = ? AND user_id = ?
       ORDER BY created_at DESC LIMIT 60`
    )
    .all(instId, userId);
  const unread = (
    db
      .prepare('SELECT COUNT(*) as c FROM notifications WHERE institution_id = ? AND user_id = ? AND is_read = 0')
      .get(instId, userId) as { c: number }
  ).c;
  res.json({ notifications: rows, unreadCount: unread });
});

teacherAdvancedRouter.post('/notifications/:id/read', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND institution_id = ? AND user_id = ?').run(
    id,
    req.institutionId!,
    req.authUser!.id
  );
  res.json({ success: true });
});

teacherAdvancedRouter.post('/notifications/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE institution_id = ? AND user_id = ? AND is_read = 0').run(
    req.institutionId!,
    req.authUser!.id
  );
  res.json({ success: true });
});

// ==================== STAFF-ONLY BOUNDARY FOR MANAGEMENT ROUTES ====================
teacherAdvancedRouter.use('/teachers', requireInstitutionStaff);
teacherAdvancedRouter.use('/leaves', requireInstitutionStaff);

// ==================== 2. TEACHER LIVE STATUS ====================
teacherAdvancedRouter.get(
  '/teachers/live-status',
  requireAnyPermission([
    ['teachers', 'view'],
    ['attendance', 'view'],
    ['academic', 'view'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const teacherId = req.query.teacher_id ? Number(req.query.teacher_id) : null;
    const allStatuses = recomputeInstitutionLiveStatuses(instId, { broadcast: false });
    const statuses = teacherId ? allStatuses.filter((s) => s.teacher_id === teacherId) : allStatuses;

    const summary = {
      total: allStatuses.length,
      in_class: allStatuses.filter((s) => s.status === 'in_class').length,
      verified_in_class: allStatuses.filter((s) => s.status === 'in_class' && s.verification_state === 'confirmed').length,
      break: allStatuses.filter((s) => s.status === 'break').length,
      free: allStatuses.filter((s) => s.status === 'free').length,
      on_leave: allStatuses.filter((s) => s.status === 'on_leave').length,
      absent: allStatuses.filter((s) => s.status === 'absent').length,
    };

    res.json({
      statuses,
      summary,
      serverDateYMD: getDhakaDateYMD(),
      serverWeekday: getDhakaBengaliWeekday(),
      serverTimeHM: getDhakaTimeHM(),
    });
  }
);

// Confirm physical class presence (Attendance + Class Confirmation verification)
teacherAdvancedRouter.post(
  '/teachers/live-status/confirm',
  requireAnyPermission([
    ['teachers', 'edit'],
    ['attendance', 'create'],
    ['attendance', 'edit'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const teacherId = Number(req.body?.teacher_id);
    const teacher = db
      .prepare('SELECT id, full_name FROM teachers WHERE id = ? AND institution_id = ?')
      .get(teacherId, instId) as { id: number; full_name: string } | undefined;
    if (!teacher) return res.status(404).json({ error: 'শিক্ষক পাওয়া যায়নি।' });

    const today = getDhakaDateYMD();
    const nowHM = getDhakaTimeHM();
    const nowISO = getDhakaNowISO();

    // First compute current status to find active schedule if any
    const current = computeTeacherLiveStatus(instId, teacherId);
    const scheduleId = req.body?.schedule_id ? Number(req.body.schedule_id) : current?.current_schedule_id ?? null;

    // Mark today's attendance as present (with check-in time)
    db.prepare(
      `INSERT INTO teacher_attendance (institution_id, teacher_id, attendance_date, status, check_in, note, marked_by, created_at)
       VALUES (?, ?, ?, 'present', ?, 'ক্লাস উপস্থিতি নিশ্চিত', ?, ?)
       ON CONFLICT(institution_id, teacher_id, attendance_date)
       DO UPDATE SET status = 'present', check_in = CASE WHEN check_in = '' THEN excluded.check_in ELSE check_in END, note = excluded.note, marked_by = excluded.marked_by`
    ).run(instId, teacherId, today, nowHM, req.authUser!.id, nowISO);

    db.prepare(
      `UPDATE teacher_live_status
       SET confirmed_schedule_id = ?, confirmed_at = ?, confirmed_date = ?, verification_state = 'confirmed', updated_at = ?
       WHERE institution_id = ? AND teacher_id = ?`
    ).run(scheduleId, nowISO, today, nowISO, instId, teacherId);

    const statuses = recomputeInstitutionLiveStatuses(instId, { broadcast: true, forceBroadcast: true });
    const updated = statuses.find((s) => s.teacher_id === teacherId);

    recordAuditLog({
      actorUserId: req.authUser!.id,
      actorName: req.authUser!.full_name,
      action: 'CONFIRM_TEACHER_CLASS_PRESENCE',
      targetType: 'teacher',
      targetId: teacherId,
      targetLabel: teacher.full_name,
      institutionId: instId,
    });

    res.json({ success: true, liveStatus: updated });
  }
);

// ==================== 3. TEACHER CLASS SCHEDULE & BREAK SCHEDULE MANAGEMENT ====================
teacherAdvancedRouter.get(
  '/teachers/schedules',
  requireAnyPermission([
    ['teachers', 'view'],
    ['academic', 'view'],
    ['attendance', 'view'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const teacherId = req.query.teacher_id ? Number(req.query.teacher_id) : null;
    const dayOfWeek = String(req.query.day_of_week || '').trim();

    let sSql = `
      SELECT ts.*, t.full_name as teacher_name, tp.teacher_code,
             d.name as department_name, c.name as class_name,
             j.name as jamaat_name, s.name as subject_name
      FROM teacher_schedules ts
      JOIN teachers t ON t.id = ts.teacher_id
      LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
      LEFT JOIN academic_departments d ON d.id = ts.department_id
      LEFT JOIN classes c ON c.id = ts.class_id
      LEFT JOIN jamaat_names j ON j.id = ts.jamaat_id
      LEFT JOIN subjects s ON s.id = ts.subject_id
      WHERE ts.institution_id = ?
    `;
    const sParams: any[] = [instId];
    if (teacherId) {
      sSql += ' AND ts.teacher_id = ?';
      sParams.push(teacherId);
    }
    if (dayOfWeek && dayOfWeek !== 'all') {
      if (isDailyDayValue(dayOfWeek)) {
        sSql += ' AND (ts.is_daily = 1 OR ts.day_of_week = ?)';
        sParams.push(DAILY_DAY_OPTION);
      } else {
        sSql += ' AND (ts.day_of_week = ? OR ts.is_daily = 1 OR ts.day_of_week = ?)';
        sParams.push(dayOfWeek, DAILY_DAY_OPTION);
      }
    }
    sSql += ` ORDER BY ${dayOrderSql('ts.day_of_week')}, ts.start_time ASC`;

    let bSql = `
      SELECT tb.*, t.full_name as teacher_name, tp.teacher_code
      FROM teacher_break_schedules tb
      JOIN teachers t ON t.id = tb.teacher_id
      LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
      WHERE tb.institution_id = ?
    `;
    const bParams: any[] = [instId];
    if (teacherId) {
      bSql += ' AND tb.teacher_id = ?';
      bParams.push(teacherId);
    }
    if (dayOfWeek && dayOfWeek !== 'all') {
      if (isDailyDayValue(dayOfWeek)) {
        bSql += ' AND (tb.is_daily = 1 OR tb.day_of_week = ?)';
        bParams.push(DAILY_DAY_OPTION);
      } else {
        bSql += ' AND (tb.day_of_week = ? OR tb.is_daily = 1 OR tb.day_of_week = ?)';
        bParams.push(dayOfWeek, DAILY_DAY_OPTION);
      }
    }
    bSql += ` ORDER BY ${dayOrderSql('tb.day_of_week')}, tb.start_time ASC`;

    res.json({
      schedules: db.prepare(sSql).all(...sParams),
      breaks: db.prepare(bSql).all(...bParams),
    });
  }
);

function checkScheduleOverlap(params: {
  instId: number;
  teacherId: number;
  dayOfWeek: string;
  isDaily?: 0 | 1;
  startTime: string;
  endTime: string;
  excludeScheduleId?: number;
  excludeBreakId?: number;
}): { conflict: boolean; message?: string } {
  const isDaily = params.isDaily === 1 || isDailyDayValue(params.dayOfWeek);
  const schedDayClause = isDaily ? '1=1' : '(ts.day_of_week = ? OR ts.is_daily = 1 OR ts.day_of_week = ?)';
  const schedDayParams = isDaily ? [] : [params.dayOfWeek, DAILY_DAY_OPTION];

  const existingSchedules = db
    .prepare(
      `SELECT ts.id, ts.day_of_week, ts.start_time, ts.end_time, c.name as class_name, s.name as subject_name
       FROM teacher_schedules ts
       LEFT JOIN classes c ON c.id = ts.class_id
       LEFT JOIN subjects s ON s.id = ts.subject_id
       WHERE ts.institution_id = ? AND ts.teacher_id = ? AND ${schedDayClause} AND ts.status = 'active'`
    )
    .all(params.instId, params.teacherId, ...schedDayParams) as any[];

  const newStart = timeToMinutes(params.startTime);
  const newEnd = timeToMinutes(params.endTime);

  for (const sc of existingSchedules) {
    if (params.excludeScheduleId && sc.id === params.excludeScheduleId) continue;
    const sStart = timeToMinutes(sc.start_time);
    const sEnd = timeToMinutes(sc.end_time);
    if (newStart < sEnd && newEnd > sStart) {
      return {
        conflict: true,
        message: `সময় সংঘর্ষ! ${sc.day_of_week} ${sc.start_time}–${sc.end_time} সময়ে উক্ত শিক্ষকের ইতিমধ্যেই একটি ক্লাস (${sc.class_name || ''}${sc.subject_name ? ` - ${sc.subject_name}` : ''}) নির্ধারিত আছে।`,
      };
    }
  }

  const breakDayClause = isDaily ? '1=1' : '(day_of_week = ? OR is_daily = 1 OR day_of_week = ?)';
  const breakDayParams = isDaily ? [] : [params.dayOfWeek, DAILY_DAY_OPTION];

  const existingBreaks = db
    .prepare(
      `SELECT id, day_of_week, start_time, end_time, label
       FROM teacher_break_schedules
       WHERE institution_id = ? AND teacher_id = ? AND ${breakDayClause} AND status = 'active'`
    )
    .all(params.instId, params.teacherId, ...breakDayParams) as any[];

  for (const b of existingBreaks) {
    if (params.excludeBreakId && b.id === params.excludeBreakId) continue;
    const bStart = timeToMinutes(b.start_time);
    const bEnd = timeToMinutes(b.end_time);
    if (newStart < bEnd && newEnd > bStart) {
      return {
        conflict: true,
        message: `সময় সংঘর্ষ! ${b.day_of_week} ${b.start_time}–${b.end_time} সময়ে উক্ত শিক্ষকের "${b.label}" নির্ধারিত আছে।`,
      };
    }
  }

  return { conflict: false };
}

teacherAdvancedRouter.post(
  '/teachers/schedules',
  requireAnyPermission([
    ['teachers', 'create'],
    ['teachers', 'edit'],
    ['academic', 'create'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const teacher_id = Number(req.body?.teacher_id);
    const department_id = req.body?.department_id ? Number(req.body.department_id) : null;
    const class_id = req.body?.class_id ? Number(req.body.class_id) : null;
    const jamaat_id = req.body?.jamaat_id ? Number(req.body.jamaat_id) : null;
    const subject_id = req.body?.subject_id ? Number(req.body.subject_id) : null;
    const dayCheck = normalizeScheduleDay(req.body?.day_of_week);
    const start_time = String(req.body?.start_time || '').trim();
    const end_time = String(req.body?.end_time || '').trim();
    const room_number = String(req.body?.room_number || '').trim();
    const status = req.body?.status === 'inactive' ? 'inactive' : 'active';

    if (!teacher_id || !dayCheck.ok) {
      return res.status(400).json({ error: 'শিক্ষক এবং বৈধ বার নির্বাচন করুন।' });
    }
    if (!isValidTimeHM(start_time) || !isValidTimeHM(end_time) || timeToMinutes(start_time) >= timeToMinutes(end_time)) {
      return res.status(400).json({ error: 'শুরুর সময় শেষের সময়ের চেয়ে আগে হতে হবে (HH:MM ফরম্যাট)।' });
    }

    // Strict institution ownership checks
    const validTeacher = db.prepare('SELECT id FROM teachers WHERE id = ? AND institution_id = ?').get(teacher_id, instId);
    if (!validTeacher) return res.status(404).json({ error: 'শিক্ষক পাওয়া যায়নি।' });
    if (department_id && !db.prepare('SELECT id FROM academic_departments WHERE id = ? AND institution_id = ?').get(department_id, instId)) {
      return res.status(400).json({ error: 'নির্বাচিত বিভাগ সঠিক নয়।' });
    }
    if (class_id && !db.prepare('SELECT id FROM classes WHERE id = ? AND institution_id = ?').get(class_id, instId)) {
      return res.status(400).json({ error: 'নির্বাচিত ক্লাস সঠিক নয়।' });
    }
    if (jamaat_id && !db.prepare('SELECT id FROM jamaat_names WHERE id = ? AND institution_id = ?').get(jamaat_id, instId)) {
      return res.status(400).json({ error: 'নির্বাচিত জামাত সঠিক নয়।' });
    }
    if (subject_id && !db.prepare('SELECT id FROM subjects WHERE id = ? AND institution_id = ?').get(subject_id, instId)) {
      return res.status(400).json({ error: 'নির্বাচিত বিষয় সঠিক নয়।' });
    }

    if (status === 'active') {
      const overlap = checkScheduleOverlap({
        instId,
        teacherId: teacher_id,
        dayOfWeek: dayCheck.day_of_week,
        isDaily: dayCheck.is_daily,
        startTime: start_time,
        endTime: end_time,
      });
      if (overlap.conflict) {
        return res.status(409).json({ error: overlap.message, conflict: true });
      }
    }

    // Single record stored even for Daily (never 7 duplicate rows)
    const info = db
      .prepare(
        `INSERT INTO teacher_schedules (institution_id, teacher_id, department_id, class_id, jamaat_id, subject_id, day_of_week, is_daily, start_time, end_time, room_number, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        instId,
        teacher_id,
        department_id,
        class_id,
        jamaat_id,
        subject_id,
        dayCheck.day_of_week,
        dayCheck.is_daily,
        start_time,
        end_time,
        room_number,
        status,
        getDhakaNowISO()
      );

    recomputeInstitutionLiveStatuses(instId, { broadcast: true });
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  }
);

teacherAdvancedRouter.put(
  '/teachers/schedules/:id',
  requireAnyPermission([
    ['teachers', 'edit'],
    ['academic', 'edit'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM teacher_schedules WHERE id = ? AND institution_id = ?').get(id, instId) as any;
    if (!existing) return res.status(404).json({ error: 'শিডিউল পাওয়া যায়নি।' });

    const teacher_id = req.body?.teacher_id ? Number(req.body.teacher_id) : existing.teacher_id;
    const department_id = req.body?.department_id !== undefined ? (req.body.department_id ? Number(req.body.department_id) : null) : existing.department_id;
    const class_id = req.body?.class_id !== undefined ? (req.body.class_id ? Number(req.body.class_id) : null) : existing.class_id;
    const jamaat_id = req.body?.jamaat_id !== undefined ? (req.body.jamaat_id ? Number(req.body.jamaat_id) : null) : existing.jamaat_id;
    const subject_id = req.body?.subject_id !== undefined ? (req.body.subject_id ? Number(req.body.subject_id) : null) : existing.subject_id;
    const dayCheck = normalizeScheduleDay(req.body?.day_of_week !== undefined ? req.body.day_of_week : existing.day_of_week);
    const start_time = String(req.body?.start_time || existing.start_time).trim();
    const end_time = String(req.body?.end_time || existing.end_time).trim();
    const room_number = String(req.body?.room_number ?? existing.room_number).trim();
    const status = req.body?.status === 'inactive' ? 'inactive' : 'active';

    if (!dayCheck.ok) {
      return res.status(400).json({ error: 'বৈধ বার নির্বাচন করুন।' });
    }
    if (!isValidTimeHM(start_time) || !isValidTimeHM(end_time) || timeToMinutes(start_time) >= timeToMinutes(end_time)) {
      return res.status(400).json({ error: 'শুরুর সময় শেষের সময়ের চেয়ে আগে হতে হবে।' });
    }
    if (!db.prepare('SELECT id FROM teachers WHERE id = ? AND institution_id = ?').get(teacher_id, instId)) {
      return res.status(400).json({ error: 'শিক্ষক সঠিক নয়।' });
    }

    if (status === 'active') {
      const overlap = checkScheduleOverlap({
        instId,
        teacherId: teacher_id,
        dayOfWeek: dayCheck.day_of_week,
        isDaily: dayCheck.is_daily,
        startTime: start_time,
        endTime: end_time,
        excludeScheduleId: id,
      });
      if (overlap.conflict) {
        return res.status(409).json({ error: overlap.message, conflict: true });
      }
    }

    db.prepare(
      `UPDATE teacher_schedules
       SET teacher_id = ?, department_id = ?, class_id = ?, jamaat_id = ?, subject_id = ?,
           day_of_week = ?, is_daily = ?, start_time = ?, end_time = ?, room_number = ?, status = ?
       WHERE id = ? AND institution_id = ?`
    ).run(
      teacher_id,
      department_id,
      class_id,
      jamaat_id,
      subject_id,
      dayCheck.day_of_week,
      dayCheck.is_daily,
      start_time,
      end_time,
      room_number,
      status,
      id,
      instId
    );

    recomputeInstitutionLiveStatuses(instId, { broadcast: true });
    res.json({ success: true });
  }
);

teacherAdvancedRouter.delete(
  '/teachers/schedules/:id',
  requireAnyPermission([
    ['teachers', 'delete'],
    ['academic', 'delete'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const info = db.prepare('DELETE FROM teacher_schedules WHERE id = ? AND institution_id = ?').run(Number(req.params.id), instId);
    if (info.changes === 0) return res.status(404).json({ error: 'শিডিউল পাওয়া যায়নি।' });
    recomputeInstitutionLiveStatuses(instId, { broadcast: true });
    res.json({ success: true });
  }
);

teacherAdvancedRouter.post(
  '/teachers/breaks',
  requireAnyPermission([
    ['teachers', 'create'],
    ['teachers', 'edit'],
    ['academic', 'create'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const teacher_id = Number(req.body?.teacher_id);
    const dayCheck = normalizeScheduleDay(req.body?.day_of_week);
    const start_time = String(req.body?.start_time || '').trim();
    const end_time = String(req.body?.end_time || '').trim();
    const label = String(req.body?.label || 'বিরতি').trim() || 'বিরতি';
    const status = req.body?.status === 'inactive' ? 'inactive' : 'active';

    if (!teacher_id || !dayCheck.ok) {
      return res.status(400).json({ error: 'শিক্ষক এবং বৈধ বার নির্বাচন করুন।' });
    }
    if (!isValidTimeHM(start_time) || !isValidTimeHM(end_time) || timeToMinutes(start_time) >= timeToMinutes(end_time)) {
      return res.status(400).json({ error: 'বিরতির শুরুর সময় শেষের সময়ের চেয়ে আগে হতে হবে।' });
    }
    if (!db.prepare('SELECT id FROM teachers WHERE id = ? AND institution_id = ?').get(teacher_id, instId)) {
      return res.status(404).json({ error: 'শিক্ষক পাওয়া যায়নি।' });
    }

    if (status === 'active') {
      const overlap = checkScheduleOverlap({
        instId,
        teacherId: teacher_id,
        dayOfWeek: dayCheck.day_of_week,
        isDaily: dayCheck.is_daily,
        startTime: start_time,
        endTime: end_time,
      });
      if (overlap.conflict) {
        return res.status(409).json({ error: overlap.message, conflict: true });
      }
    }

    const info = db
      .prepare(
        `INSERT INTO teacher_break_schedules (institution_id, teacher_id, day_of_week, is_daily, start_time, end_time, label, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(instId, teacher_id, dayCheck.day_of_week, dayCheck.is_daily, start_time, end_time, label, status, getDhakaNowISO());

    recomputeInstitutionLiveStatuses(instId, { broadcast: true });
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  }
);

teacherAdvancedRouter.delete(
  '/teachers/breaks/:id',
  requireAnyPermission([
    ['teachers', 'delete'],
    ['academic', 'delete'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const info = db.prepare('DELETE FROM teacher_break_schedules WHERE id = ? AND institution_id = ?').run(Number(req.params.id), instId);
    if (info.changes === 0) return res.status(404).json({ error: 'বিরতি শিডিউল পাওয়া যায়নি।' });
    recomputeInstitutionLiveStatuses(instId, { broadcast: true });
    res.json({ success: true });
  }
);

// ==================== 4. TEACHER SALARY MANAGEMENT (STRICTLY FINANCE PERMISSION) ====================
teacherAdvancedRouter.get('/teachers/salary/overview', requirePermission('finance', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const month = String(req.query.month || getDhakaDateYMD().slice(0, 7)).trim();

  const teachers = db
    .prepare(
      `SELECT t.id, t.full_name, t.photo_url, t.mobile, t.status, u.username, d.name as department_name,
              tp.teacher_code, tp.email, tp.education,
              COALESCE(tp.monthly_salary, 0) as monthly_salary,
              COALESCE(tp.monthly_meal_cost, 0) as monthly_meal_cost,
              (SELECT des.name FROM teacher_designations td JOIN designations des ON des.id = td.designation_id WHERE td.teacher_id = t.id ORDER BY td.is_primary DESC LIMIT 1) as primary_designation
       FROM teachers t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
       LEFT JOIN academic_departments d ON d.id = t.department_id
       WHERE t.institution_id = ?
       ORDER BY t.full_name ASC`
    )
    .all(instId) as any[];

  const enriched = teachers.map((t) => {
    const profile = t.teacher_code ? null : ensureTeacherProfile(instId, t.id);
    const totalSalaryPaid = Number(
      (
        db
          .prepare('SELECT COALESCE(SUM(paid_amount), 0) as total FROM teacher_salary_records WHERE institution_id = ? AND teacher_id = ?')
          .get(instId, t.id) as { total: number }
      ).total.toFixed(2)
    );
    const totalAdvance = Number(
      (
        db
          .prepare('SELECT COALESCE(SUM(amount), 0) as total FROM teacher_advance_records WHERE institution_id = ? AND teacher_id = ?')
          .get(instId, t.id) as { total: number }
      ).total.toFixed(2)
    );
    const monthPaidRow = db
      .prepare(
        `SELECT COALESCE(SUM(paid_amount), 0) as paid,
                COALESCE(SUM(salary_paid_part), 0) as salary_paid,
                COALESCE(SUM(meal_paid_part), 0) as meal_paid,
                COALESCE(SUM(due_adjusted), 0) as due_adj,
                COALESCE(SUM(bonus), 0) as bonus,
                COALESCE(SUM(deduction), 0) as deduction,
                MAX(payment_date) as last_date
         FROM teacher_salary_records
         WHERE institution_id = ? AND teacher_id = ? AND salary_month = ?`
      )
      .get(instId, t.id, month) as any;

    const lastPayment = db
      .prepare(
        'SELECT payment_date, salary_month, paid_amount FROM teacher_salary_records WHERE institution_id = ? AND teacher_id = ? ORDER BY id DESC LIMIT 1'
      )
      .get(instId, t.id) as { payment_date: string; salary_month: string; paid_amount: number } | undefined;

    const currentDue = getTeacherCurrentDue(instId, t.id);
    const monthlySalary = Number(t.monthly_salary || 0);
    const monthlyMealCost = Number(t.monthly_meal_cost || 0);
    const totalMonthlyPayable = Number((monthlySalary + monthlyMealCost).toFixed(2));
    const monthPaid = Number((monthPaidRow?.paid || 0).toFixed(2));
    const monthDueAdj = Number((monthPaidRow?.due_adj || 0).toFixed(2));
    const monthEntitlement = Number(
      Math.max(0, totalMonthlyPayable + Number(monthPaidRow?.bonus || 0) - Number(monthPaidRow?.deduction || 0)).toFixed(2)
    );
    const monthRemainingDue = Number(Math.max(0, monthEntitlement - monthPaid - monthDueAdj).toFixed(2));

    return {
      ...t,
      teacher_code: t.teacher_code || profile?.teacher_code || '',
      monthly_salary: monthlySalary,
      monthly_meal_cost: monthlyMealCost,
      total_monthly_payable: totalMonthlyPayable,
      total_salary_paid: totalSalaryPaid,
      total_advance_withdrawn: totalAdvance,
      current_due: currentDue,
      month_paid: monthPaid,
      month_salary_paid: Number((monthPaidRow?.salary_paid || 0).toFixed(2)),
      month_meal_paid: Number((monthPaidRow?.meal_paid || 0).toFixed(2)),
      month_due_adjusted: monthDueAdj,
      month_remaining_due: monthRemainingDue,
      last_payment_date: lastPayment?.payment_date || null,
    };
  });

  res.json({ month, teachers: enriched });
});

teacherAdvancedRouter.get('/teachers/salary/month-status', requirePermission('finance', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const teacherId = Number(req.query.teacher_id);
  const month = String(req.query.month || getDhakaDateYMD().slice(0, 7)).trim();

  const teacher = db.prepare('SELECT id, full_name FROM teachers WHERE id = ? AND institution_id = ?').get(teacherId, instId) as any;
  if (!teacher) return res.status(404).json({ error: 'শিক্ষক পাওয়া যায়নি।' });

  const profile = ensureTeacherProfile(instId, teacherId);
  const prior = db
    .prepare(
      `SELECT COUNT(*) as count,
              COALESCE(SUM(paid_amount), 0) as total_paid,
              COALESCE(SUM(salary_paid_part), 0) as total_salary_paid,
              COALESCE(SUM(meal_paid_part), 0) as total_meal_paid,
              COALESCE(SUM(bonus), 0) as total_bonus,
              COALESCE(SUM(deduction), 0) as total_deduction,
              COALESCE(SUM(due_adjusted), 0) as total_due_adjusted,
              MAX(base_salary) as last_base_salary,
              MAX(meal_cost) as last_meal_cost
       FROM teacher_salary_records
       WHERE institution_id = ? AND teacher_id = ? AND salary_month = ?`
    )
    .get(instId, teacherId, month) as any;

  const baseSalary = Number(prior?.count > 0 && prior?.last_base_salary > 0 ? prior.last_base_salary : profile.monthly_salary || 0);
  const mealCost = Number(prior?.count > 0 && prior?.last_meal_cost > 0 ? prior.last_meal_cost : profile.monthly_meal_cost || 0);
  const totalMonthlyPayable = Number((baseSalary + mealCost).toFixed(2));
  const alreadyPaid = Number(Number(prior?.total_paid || 0).toFixed(2));
  const alreadyDueAdjusted = Number(Number(prior?.total_due_adjusted || 0).toFixed(2));
  const totalEntitlement = Number(
    Math.max(0, baseSalary + mealCost + Number(prior?.total_bonus || 0) - Number(prior?.total_deduction || 0)).toFixed(2)
  );
  const estimatedRemaining = Number(Math.max(0, totalEntitlement - alreadyPaid - alreadyDueAdjusted).toFixed(2));
  const currentDue = getTeacherCurrentDue(instId, teacherId);

  res.json({
    teacher_id: teacherId,
    teacher_name: teacher.full_name,
    teacher_code: profile.teacher_code,
    salary_month: month,
    base_salary: baseSalary,
    meal_cost: mealCost,
    total_monthly_payable: totalMonthlyPayable,
    prior_payments_count: Number(prior?.count || 0),
    already_paid: alreadyPaid,
    already_salary_paid: Number(Number(prior?.total_salary_paid || 0).toFixed(2)),
    already_meal_paid: Number(Number(prior?.total_meal_paid || 0).toFixed(2)),
    already_due_adjusted: alreadyDueAdjusted,
    current_due: currentDue,
    estimated_remaining: estimatedRemaining,
    is_fully_paid: Number(prior?.count || 0) > 0 && estimatedRemaining <= 0,
  });
});

teacherAdvancedRouter.get('/teachers/salary/records', requirePermission('finance', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const teacherId = req.query.teacher_id ? Number(req.query.teacher_id) : null;
  const month = String(req.query.month || '').trim();

  let sql = `
    SELECT sr.*, t.full_name as teacher_name, tp.teacher_code, r.receipt_number, r.id as receipt_id
    FROM teacher_salary_records sr
    JOIN teachers t ON t.id = sr.teacher_id
    LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
    LEFT JOIN teacher_salary_receipts r ON r.salary_record_id = sr.id
    WHERE sr.institution_id = ?
  `;
  const params: any[] = [instId];
  if (teacherId) {
    sql += ' AND sr.teacher_id = ?';
    params.push(teacherId);
  }
  if (month && month !== 'all') {
    sql += ' AND sr.salary_month = ?';
    params.push(month);
  }
  sql += ' ORDER BY sr.created_at DESC LIMIT 300';
  res.json({ records: db.prepare(sql).all(...params) });
});

teacherAdvancedRouter.get('/teachers/salary/receipts', requirePermission('finance', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const teacherId = req.query.teacher_id ? Number(req.query.teacher_id) : null;
  const receiptType = String(req.query.receipt_type || '').trim();

  let sql = `
    SELECT r.*, t.full_name as teacher_name, tp.teacher_code
    FROM teacher_salary_receipts r
    JOIN teachers t ON t.id = r.teacher_id
    LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
    WHERE r.institution_id = ?
  `;
  const params: any[] = [instId];
  if (teacherId) {
    sql += ' AND r.teacher_id = ?';
    params.push(teacherId);
  }
  if (receiptType && receiptType !== 'all') {
    sql += ' AND r.receipt_type = ?';
    params.push(receiptType);
  }
  sql += ' ORDER BY r.created_at DESC LIMIT 300';
  res.json({ receipts: db.prepare(sql).all(...params) });
});

teacherAdvancedRouter.post('/teachers/salary/pay', requirePermission('finance', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const teacher_id = Number(req.body?.teacher_id);
  const salary_month = String(req.body?.salary_month || '').trim();
  const hasBaseInput = req.body?.base_salary !== undefined && req.body?.base_salary !== '';
  const hasMealInput = req.body?.meal_cost !== undefined && req.body?.meal_cost !== '';
  const bonus = Number(Math.max(0, Number(req.body?.bonus || 0)).toFixed(2));
  const deduction = Number(Math.max(0, Number(req.body?.deduction || 0)).toFixed(2));
  const due_adjusted = Number(Math.max(0, Number(req.body?.due_adjusted || 0)).toFixed(2));
  const paid_amount = Number(Math.max(0, Number(req.body?.paid_amount || 0)).toFixed(2));
  const payment_method = (VALID_PAY_METHODS as readonly string[]).includes(String(req.body?.payment_method || ''))
    ? String(req.body.payment_method)
    : 'Cash';
  const payment_date = String(req.body?.payment_date || getDhakaDateYMD()).trim();
  const remarks = String(req.body?.remarks || '').trim();

  if (!teacher_id || !/^\d{4}-\d{2}$/.test(salary_month)) {
    return res.status(400).json({ error: 'শিক্ষক এবং বৈধ বেতনের মাস (YYYY-MM) নির্বাচন করুন।' });
  }

  const teacher = db
    .prepare('SELECT id, user_id, full_name FROM teachers WHERE id = ? AND institution_id = ?')
    .get(teacher_id, instId) as { id: number; user_id: number; full_name: string } | undefined;
  if (!teacher) return res.status(404).json({ error: 'শিক্ষক পাওয়া যায়নি।' });

  const profile = ensureTeacherProfile(instId, teacher_id);
  const effectiveBase = hasBaseInput
    ? Number(Math.max(0, Number(req.body.base_salary || 0)).toFixed(2))
    : Number(profile.monthly_salary || 0);
  const effectiveMeal = hasMealInput
    ? Number(Math.max(0, Number(req.body.meal_cost || 0)).toFixed(2))
    : Number(profile.monthly_meal_cost || 0);

  if (effectiveBase <= 0 && effectiveMeal <= 0 && bonus <= 0) {
    return res.status(400).json({ error: 'মাসিক প্রদেয় অথবা খাবার খরচ শূন্যের চেয়ে বেশি হতে হবে।' });
  }

  const currentDue = getTeacherCurrentDue(instId, teacher_id);
  if (due_adjusted > currentDue + 0.001) {
    return res.status(400).json({
      error: `সমন্বয়কৃত বকেয়া (৳${due_adjusted}) শিক্ষকের বর্তমান বকেয়ার (৳${currentDue}) চেয়ে বেশি হতে পারে না।`,
    });
  }

  // Duplicate Salary Payment Prevention & Prior Partial Payment Reconciliation
  const prior = db
    .prepare(
      `SELECT COALESCE(SUM(paid_amount), 0) as total_paid,
              COALESCE(SUM(salary_paid_part), 0) as total_salary_paid,
              COALESCE(SUM(meal_paid_part), 0) as total_meal_paid,
              COALESCE(SUM(due_adjusted), 0) as total_due_adj,
              COALESCE(SUM(bonus), 0) as total_bonus,
              COALESCE(SUM(deduction), 0) as total_deduction,
              COUNT(*) as count
       FROM teacher_salary_records
       WHERE institution_id = ? AND teacher_id = ? AND salary_month = ?`
    )
    .get(instId, teacher_id, salary_month) as {
    total_paid: number;
    total_salary_paid: number;
    total_meal_paid: number;
    total_due_adj: number;
    total_bonus: number;
    total_deduction: number;
    count: number;
  };

  const previouslySettled = Number((prior.total_paid + prior.total_due_adj).toFixed(2));
  const totalEntitlement = Number(
    Math.max(0, effectiveBase + effectiveMeal + prior.total_bonus + bonus - prior.total_deduction - deduction).toFixed(2)
  );
  const remainingBeforeThis = Number(Math.max(0, totalEntitlement - previouslySettled).toFixed(2));

  if (prior.count > 0 && remainingBeforeThis <= 0) {
    return res.status(409).json({
      error: `${teacher.full_name}-এর ${salary_month} মাসের সম্পূর্ণ বেতন ও খাবার খরচ ইতিমধ্যেই পরিশোধ করা হয়েছে। ডুপ্লিকেট পেমেন্ট অনুমোদিত নয়।`,
      duplicate: true,
    });
  }

  const thisTotalSettlement = Number((paid_amount + due_adjusted).toFixed(2));
  if (thisTotalSettlement <= 0) {
    return res.status(400).json({ error: 'পরিশোধিত টাকা অথবা বকেয়া সমন্বয়ের পরিমাণ শূন্যের চেয়ে বেশি হতে হবে।' });
  }
  if (thisTotalSettlement > remainingBeforeThis + 0.01) {
    return res.status(409).json({
      error: `এই মাসের অবশিষ্ট প্রদেয় ৳${remainingBeforeThis} (ইতিমধ্যে পরিশোধিত/সমন্বিত: ৳${previouslySettled})। অতিরিক্ত টাকা প্রদান করা যাবে না।`,
      remaining_payable: remainingBeforeThis,
      already_paid: previouslySettled,
    });
  }

  const netPayableThisSlip = Number(Math.max(0, remainingBeforeThis - due_adjusted).toFixed(2));
  const cumulativePaid = Number((prior.total_paid + paid_amount).toFixed(2));
  const remainingAfter = Number(Math.max(0, remainingBeforeThis - thisTotalSettlement).toFixed(2));

  // Separate allocation of actual cash paid out between Monthly Salary and Meal Cost
  let salaryPaidPart = 0;
  let mealPaidPart = 0;
  if (paid_amount > 0) {
    const remainingMealShare = Number(Math.max(0, effectiveMeal - prior.total_meal_paid).toFixed(2));
    const remainingSalaryShare = Number(Math.max(0, totalEntitlement - effectiveMeal - prior.total_salary_paid).toFixed(2));
    if (remainingMealShare <= 0) {
      mealPaidPart = 0;
      salaryPaidPart = paid_amount;
    } else if (remainingSalaryShare <= 0) {
      mealPaidPart = paid_amount;
      salaryPaidPart = 0;
    } else {
      const ratio = remainingMealShare / (remainingSalaryShare + remainingMealShare);
      mealPaidPart = Number(Math.min(remainingMealShare, Number((paid_amount * ratio).toFixed(2))).toFixed(2));
      salaryPaidPart = Number((paid_amount - mealPaidPart).toFixed(2));
    }
  }

  const txnId = generateTxnId('SAL');
  const now = getDhakaNowISO();

  const tx = db.transaction(() => {
    const receiptNumber = nextSalaryReceiptNumber(instId, 'SAL');

    // Sync profile monthly_salary / monthly_meal_cost if they were 0 and user entered amounts
    const nextProfSal = Number(profile.monthly_salary || 0) === 0 && effectiveBase > 0 ? effectiveBase : Number(profile.monthly_salary || 0);
    const nextProfMeal = Number(profile.monthly_meal_cost || 0) === 0 && effectiveMeal > 0 ? effectiveMeal : Number(profile.monthly_meal_cost || 0);
    if (nextProfSal !== Number(profile.monthly_salary || 0) || nextProfMeal !== Number(profile.monthly_meal_cost || 0)) {
      db.prepare(
        'UPDATE teacher_profiles SET monthly_salary = ?, monthly_meal_cost = ?, updated_at = ? WHERE teacher_id = ? AND institution_id = ?'
      ).run(nextProfSal, nextProfMeal, now, teacher_id, instId);
    }

    // Record Finance Expenses SEPARATELY for Monthly Salary and Meal Cost (ONLY for actual cash paid out)
    // `due_adjusted` is NOT recorded again as expense because the advance was already expensed when withdrawn!
    const accId = getDefaultFinanceAccountId(instId, payment_method);
    let financeTxId: number | null = null;
    let mealFinanceTxId: number | null = null;

    if (salaryPaidPart > 0) {
      const salCatId = findOrCreateFinanceCategory(instId, FIN_CAT_TEACHER_SALARY, 'expense');
      const salTxCode = generateUniqueTxCode(instId, 'TXN');
      const fInfo = db
        .prepare(
          `INSERT INTO finance_transactions (institution_id, tx_code, tx_date, type, category_id, category_name, account_id, description, amount, payment_method, handled_by, reference, note, source_type, created_at)
           VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'teacher_salary', ?)`
        )
        .run(
          instId,
          salTxCode,
          payment_date,
          salCatId,
          FIN_CAT_TEACHER_SALARY,
          accId,
          `শিক্ষক মাসিক বেতন (${salary_month}) — ${teacher.full_name} (${profile.teacher_code})`,
          salaryPaidPart,
          payment_method,
          req.authUser!.full_name,
          receiptNumber,
          remarks,
          now
        );
      financeTxId = Number(fInfo.lastInsertRowid);
    }

    if (mealPaidPart > 0) {
      const mealCatId = findOrCreateFinanceCategory(instId, FIN_CAT_TEACHER_MEAL, 'expense');
      const mealTxCode = generateUniqueTxCode(instId, 'TXN');
      const mInfo = db
        .prepare(
          `INSERT INTO finance_transactions (institution_id, tx_code, tx_date, type, category_id, category_name, account_id, description, amount, payment_method, handled_by, reference, note, source_type, created_at)
           VALUES (?, ?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'teacher_meal_cost', ?)`
        )
        .run(
          instId,
          mealTxCode,
          payment_date,
          mealCatId,
          FIN_CAT_TEACHER_MEAL,
          accId,
          `শিক্ষক খাবার খরচ (${salary_month}) — ${teacher.full_name} (${profile.teacher_code})`,
          mealPaidPart,
          payment_method,
          req.authUser!.full_name,
          receiptNumber,
          remarks,
          now
        );
      mealFinanceTxId = Number(mInfo.lastInsertRowid);
    }

    const salInfo = db
      .prepare(
        `INSERT INTO teacher_salary_records (
          institution_id, teacher_id, salary_month, base_salary, meal_cost, bonus, deduction,
          previous_due, due_adjusted, total_payable, net_payable, paid_amount,
          salary_paid_part, meal_paid_part, cumulative_paid, remaining_payable, remaining_due,
          payment_method, payment_date, transaction_id, remarks,
          approved_by_user_id, approved_by_name, finance_tx_id, meal_finance_tx_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        instId,
        teacher_id,
        salary_month,
        effectiveBase,
        effectiveMeal,
        bonus,
        deduction,
        currentDue,
        due_adjusted,
        netPayableThisSlip,
        netPayableThisSlip,
        paid_amount,
        salaryPaidPart,
        mealPaidPart,
        cumulativePaid,
        remainingAfter,
        remainingAfter,
        payment_method,
        payment_date,
        txnId,
        remarks,
        req.authUser!.id,
        req.authUser!.full_name,
        financeTxId,
        mealFinanceTxId,
        now
      );
    const salaryRecordId = Number(salInfo.lastInsertRowid);

    if (financeTxId) {
      db.prepare('UPDATE finance_transactions SET source_id = ? WHERE id = ?').run(salaryRecordId, financeTxId);
    }
    if (mealFinanceTxId) {
      db.prepare('UPDATE finance_transactions SET source_id = ? WHERE id = ?').run(salaryRecordId, mealFinanceTxId);
    }

    // If Due was adjusted from salary, record in teacher_due_ledger (no duplicate expense!)
    if (due_adjusted > 0) {
      const newDue = Number(Math.max(0, currentDue - due_adjusted).toFixed(2));
      db.prepare(
        `INSERT INTO teacher_due_ledger (institution_id, teacher_id, entry_date, entry_type, previous_due, amount, new_due, reference_id, transaction_id, note, created_by_name, created_at)
         VALUES (?, ?, ?, 'salary_deduction', ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        instId,
        teacher_id,
        payment_date,
        currentDue,
        due_adjusted,
        newDue,
        salaryRecordId,
        txnId,
        `${salary_month} মাসের বেতন থেকে অগ্রিম/বকেয়া সমন্বয় (${receiptNumber})`,
        req.authUser!.full_name,
        now
      );
    }

    const recInfo = db
      .prepare(
        `INSERT INTO teacher_salary_receipts (
          institution_id, teacher_id, receipt_type, salary_record_id, advance_record_id,
          receipt_number, salary_month, base_salary, meal_cost, bonus, deduction,
          previous_due, due_adjusted, total_payable, paid_amount, remaining_due,
          payment_method, payment_date, transaction_id, approved_by_name, remarks, created_at
        ) VALUES (?, ?, 'salary', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        instId,
        teacher_id,
        salaryRecordId,
        receiptNumber,
        salary_month,
        effectiveBase,
        effectiveMeal,
        bonus,
        deduction,
        currentDue,
        due_adjusted,
        netPayableThisSlip,
        paid_amount,
        remainingAfter,
        payment_method,
        payment_date,
        txnId,
        req.authUser!.full_name,
        remarks,
        now
      );
    const receiptId = Number(recInfo.lastInsertRowid);

    return {
      salaryRecordId,
      receipt: db
        .prepare(
          `SELECT r.*, t.full_name as teacher_name, tp.teacher_code,
                  i.name as institution_name, i.logo_url as institution_logo, i.address as institution_address, i.phone as institution_phone
           FROM teacher_salary_receipts r
           JOIN teachers t ON t.id = r.teacher_id
           LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
           JOIN institutions i ON i.id = r.institution_id
           WHERE r.id = ?`
        )
        .get(receiptId),
    };
  });

  const result = tx();

  // Notify teacher in real-time
  createNotification({
    institutionId: instId,
    userId: teacher.user_id,
    type: 'salary_paid',
    title: 'বেতন ও খাবার খরচ পরিশোধ সম্পন্ন হয়েছে',
    message: `${salary_month} মাসের বেতন ও খাবার খরচ বাবদ ৳${paid_amount.toLocaleString('en-IN')}${due_adjusted > 0 ? ` (বকেয়া সমন্বয় ৳${due_adjusted.toLocaleString('en-IN')})` : ''} পরিশোধ করা হয়েছে। রশিদ নং: ${(result.receipt as any).receipt_number}।`,
    referenceType: 'salary_receipt',
    referenceId: (result.receipt as any).id,
  });

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'PAY_TEACHER_SALARY',
    targetType: 'teacher_salary',
    targetId: result.salaryRecordId,
    targetLabel: `${teacher.full_name} (${salary_month}) বেতন ৳${salaryPaidPart} + খাবার ৳${mealPaidPart}`,
    institutionId: instId,
  });

  res.status(201).json({
    id: result.salaryRecordId,
    receipt: result.receipt,
    salary_paid_part: salaryPaidPart,
    meal_paid_part: mealPaidPart,
    remaining_payable: remainingAfter,
    remaining_due: remainingAfter,
  });
});

// ==================== 5. EXTRA MONEY WITHDRAWAL & TEACHER DUE LEDGER ====================
teacherAdvancedRouter.get('/teachers/advances', requirePermission('finance', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const teacherId = req.query.teacher_id ? Number(req.query.teacher_id) : null;
  let sql = `
    SELECT ar.*, t.full_name as teacher_name, tp.teacher_code, r.id as receipt_id
    FROM teacher_advance_records ar
    JOIN teachers t ON t.id = ar.teacher_id
    LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
    LEFT JOIN teacher_salary_receipts r ON r.advance_record_id = ar.id
    WHERE ar.institution_id = ?
  `;
  const params: any[] = [instId];
  if (teacherId) {
    sql += ' AND ar.teacher_id = ?';
    params.push(teacherId);
  }
  sql += ' ORDER BY ar.created_at DESC LIMIT 300';
  res.json({ advances: db.prepare(sql).all(...params) });
});

teacherAdvancedRouter.post('/teachers/advances', requirePermission('finance', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const teacher_id = Number(req.body?.teacher_id);
  const withdraw_date = String(req.body?.withdraw_date || getDhakaDateYMD()).trim();
  const amount = Number(Number(req.body?.amount || 0).toFixed(2));
  const reason = String(req.body?.reason || '').trim();
  const payment_method = (VALID_PAY_METHODS as readonly string[]).includes(String(req.body?.payment_method || ''))
    ? String(req.body.payment_method)
    : 'Cash';
  const approved_by_name = String(req.body?.approved_by_name || req.authUser!.full_name).trim();
  const remarks = String(req.body?.remarks || '').trim();

  if (!teacher_id || amount <= 0 || !reason) {
    return res.status(400).json({ error: 'শিক্ষক, শূন্যের চেয়ে বড় টাকার পরিমাণ এবং কারণ আবশ্যক।' });
  }

  const teacher = db
    .prepare('SELECT id, user_id, full_name FROM teachers WHERE id = ? AND institution_id = ?')
    .get(teacher_id, instId) as { id: number; user_id: number; full_name: string } | undefined;
  if (!teacher) return res.status(404).json({ error: 'শিক্ষক পাওয়া যায়নি।' });

  const profile = ensureTeacherProfile(instId, teacher_id);
  const previousDue = getTeacherCurrentDue(instId, teacher_id);
  const newDue = Number((previousDue + amount).toFixed(2));
  const txnId = generateTxnId('ADV');
  const now = getDhakaNowISO();

  const tx = db.transaction(() => {
    const receiptNumber = nextSalaryReceiptNumber(instId, 'ADV');
    const catId = findOrCreateFinanceCategory(instId, 'শিক্ষক অগ্রিম / অতিরিক্ত উত্তোলন', 'expense');
    const accId = getDefaultFinanceAccountId(instId, payment_method);

    // Recorded ONCE as institution expense (when cash leaves institution)
    const advTxCode = generateUniqueTxCode(instId, 'TXN');
    const fInfo = db
      .prepare(
        `INSERT INTO finance_transactions (institution_id, tx_code, tx_date, type, category_id, category_name, account_id, description, amount, payment_method, handled_by, reference, note, source_type, created_at)
         VALUES (?, ?, ?, 'expense', ?, 'শিক্ষক অগ্রিম / অতিরিক্ত উত্তোলন', ?, ?, ?, ?, ?, ?, ?, 'teacher_advance', ?)`
      )
      .run(
        instId,
        advTxCode,
        withdraw_date,
        catId,
        accId,
        `শিক্ষক অতিরিক্ত উত্তোলন (অগ্রিম) — ${teacher.full_name} (${profile.teacher_code}): ${reason}`,
        amount,
        payment_method,
        approved_by_name,
        receiptNumber,
        remarks,
        now
      );
    const financeTxId = Number(fInfo.lastInsertRowid);

    const advInfo = db
      .prepare(
        `INSERT INTO teacher_advance_records (
          institution_id, teacher_id, withdraw_date, amount, reason, payment_method,
          approved_by_user_id, approved_by_name, remarks, receipt_number, transaction_id, finance_tx_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        instId,
        teacher_id,
        withdraw_date,
        amount,
        reason,
        payment_method,
        req.authUser!.id,
        approved_by_name,
        remarks,
        receiptNumber,
        txnId,
        financeTxId,
        now
      );
    const advanceId = Number(advInfo.lastInsertRowid);

    // Record Advance in Teacher Due Ledger
    db.prepare(
      `INSERT INTO teacher_due_ledger (institution_id, teacher_id, entry_date, entry_type, previous_due, amount, new_due, reference_id, transaction_id, note, created_by_name, created_at)
       VALUES (?, ?, ?, 'advance', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      instId,
      teacher_id,
      withdraw_date,
      previousDue,
      amount,
      newDue,
      advanceId,
      txnId,
      `${reason}${remarks ? ` — ${remarks}` : ''}`,
      approved_by_name,
      now
    );

    // Create Advance Receipt in teacher_salary_receipts so it stays archived in Teacher Profile
    const recInfo = db
      .prepare(
        `INSERT INTO teacher_salary_receipts (
          institution_id, teacher_id, receipt_type, salary_record_id, advance_record_id,
          receipt_number, salary_month, base_salary, bonus, deduction, due_adjusted,
          paid_amount, payment_method, payment_date, transaction_id, approved_by_name, remarks, created_at
        ) VALUES (?, ?, 'advance', NULL, ?, ?, '', 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        instId,
        teacher_id,
        advanceId,
        receiptNumber,
        amount,
        payment_method,
        withdraw_date,
        txnId,
        approved_by_name,
        `${reason}${remarks ? ` (${remarks})` : ''}`,
        now
      );

    return {
      advanceId,
      receipt: db
        .prepare(
          `SELECT r.*, t.full_name as teacher_name, tp.teacher_code
           FROM teacher_salary_receipts r
           JOIN teachers t ON t.id = r.teacher_id
           LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
           WHERE r.id = ?`
        )
        .get(recInfo.lastInsertRowid),
    };
  });

  const result = tx();

  createNotification({
    institutionId: instId,
    userId: teacher.user_id,
    type: 'advance_withdrawn',
    title: 'অতিরিক্ত টাকা (অগ্রিম) উত্তোলন নথিভুক্ত হয়েছে',
    message: `আপনার নামে ৳${amount.toLocaleString('en-IN')} অতিরিক্ত উত্তোলন (${reason}) নথিভুক্ত হয়েছে। বর্তমান মোট বকেয়া: ৳${newDue.toLocaleString('en-IN')}।`,
    referenceType: 'advance_receipt',
    referenceId: (result.receipt as any).id,
  });

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'TEACHER_EXTRA_WITHDRAWAL',
    targetType: 'teacher_advance',
    targetId: result.advanceId,
    targetLabel: `${teacher.full_name} ৳${amount}`,
    institutionId: instId,
  });

  res.status(201).json({
    id: result.advanceId,
    previous_due: previousDue,
    new_due: newDue,
    receipt: result.receipt,
  });
});

teacherAdvancedRouter.get('/teachers/dues', requirePermission('finance', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const teacherId = req.query.teacher_id ? Number(req.query.teacher_id) : null;

  const teachers = db
    .prepare(
      `SELECT t.id, t.full_name, t.mobile, t.photo_url, tp.teacher_code,
              COALESCE(tp.monthly_salary, 0) as monthly_salary,
              COALESCE(tp.monthly_meal_cost, 0) as monthly_meal_cost,
              d.name as department_name
       FROM teachers t
       LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
       LEFT JOIN academic_departments d ON d.id = t.department_id
       WHERE t.institution_id = ?
       ORDER BY t.full_name ASC`
    )
    .all(instId) as any[];

  const summaries = teachers.map((t) => {
    const totals = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN entry_type = 'advance' THEN amount ELSE 0 END), 0) as total_advance,
          COALESCE(SUM(CASE WHEN entry_type = 'salary_deduction' THEN amount ELSE 0 END), 0) as total_salary_adjusted,
          COALESCE(SUM(CASE WHEN entry_type IN ('cash_return', 'adjustment') THEN amount ELSE 0 END), 0) as total_returned
         FROM teacher_due_ledger
         WHERE institution_id = ? AND teacher_id = ?`
      )
      .get(instId, t.id) as any;

    const currentDue = getTeacherCurrentDue(instId, t.id);
    const totalAdvance = Number((totals?.total_advance || 0).toFixed(2));
    const totalSettled = Number(((totals?.total_salary_adjusted || 0) + (totals?.total_returned || 0)).toFixed(2));
    const totalMonthlyPayable = Number((Number(t.monthly_salary || 0) + Number(t.monthly_meal_cost || 0)).toFixed(2));

    return {
      ...t,
      total_monthly_payable: totalMonthlyPayable,
      total_advance: totalAdvance,
      total_salary_adjusted: Number((totals?.total_salary_adjusted || 0).toFixed(2)),
      total_returned: Number((totals?.total_returned || 0).toFixed(2)),
      total_settled: totalSettled,
      current_due: currentDue,
      total_financial_obligation: Number((totalMonthlyPayable + currentDue).toFixed(2)),
    };
  });

  let ledgerSql = `
    SELECT l.*, t.full_name as teacher_name, tp.teacher_code
    FROM teacher_due_ledger l
    JOIN teachers t ON t.id = l.teacher_id
    LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
    WHERE l.institution_id = ?
  `;
  const ledgerParams: any[] = [instId];
  if (teacherId) {
    ledgerSql += ' AND l.teacher_id = ?';
    ledgerParams.push(teacherId);
  }
  ledgerSql += ' ORDER BY l.id DESC LIMIT 300';

  res.json({
    summaries: teacherId ? summaries.filter((s) => s.id === teacherId) : summaries,
    ledger: db.prepare(ledgerSql).all(...ledgerParams),
  });
});

teacherAdvancedRouter.post('/teachers/dues/settle', requirePermission('finance', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const teacher_id = Number(req.body?.teacher_id);
  const entry_type = req.body?.entry_type === 'adjustment' ? 'adjustment' : 'cash_return';
  const amount = Number(Number(req.body?.amount || 0).toFixed(2));
  const entry_date = String(req.body?.entry_date || getDhakaDateYMD()).trim();
  const payment_method = (VALID_PAY_METHODS as readonly string[]).includes(String(req.body?.payment_method || ''))
    ? String(req.body.payment_method)
    : 'Cash';
  const note = String(req.body?.note || '').trim();

  if (!teacher_id || amount <= 0) {
    return res.status(400).json({ error: 'শিক্ষক এবং শূন্যের চেয়ে বড় সমন্বয়ের পরিমাণ আবশ্যক।' });
  }

  const teacher = db
    .prepare('SELECT id, user_id, full_name FROM teachers WHERE id = ? AND institution_id = ?')
    .get(teacher_id, instId) as { id: number; user_id: number; full_name: string } | undefined;
  if (!teacher) return res.status(404).json({ error: 'শিক্ষক পাওয়া যায়নি।' });

  const profile = ensureTeacherProfile(instId, teacher_id);
  const previousDue = getTeacherCurrentDue(instId, teacher_id);
  if (previousDue <= 0) {
    return res.status(400).json({ error: 'এই শিক্ষকের কোনো বকেয়া নেই।' });
  }
  if (amount > previousDue + 0.001) {
    return res.status(400).json({ error: `সমন্বয়ের পরিমাণ বর্তমান বকেয়া (৳${previousDue}) এর বেশি হতে পারবে না।` });
  }

  const newDue = Number(Math.max(0, previousDue - amount).toFixed(2));
  const txnId = generateTxnId('DUE');
  const now = getDhakaNowISO();

  const tx = db.transaction(() => {
    const receiptNumber = nextSalaryReceiptNumber(instId, 'DUE');

    // If teacher returns cash directly, log cash inflow as institution income so cash balance stays accurate!
    if (entry_type === 'cash_return') {
      const catId = findOrCreateFinanceCategory(instId, 'শিক্ষক অগ্রিম ফেরত', 'income');
      const accId = getDefaultFinanceAccountId(instId, payment_method);
      const dueTxCode = generateUniqueTxCode(instId, 'TXN');
      db.prepare(
        `INSERT INTO finance_transactions (institution_id, tx_code, tx_date, type, category_id, category_name, account_id, description, amount, payment_method, handled_by, reference, note, source_type, created_at)
         VALUES (?, ?, ?, 'income', ?, 'শিক্ষক অগ্রিম ফেরত', ?, ?, ?, ?, ?, ?, ?, 'teacher_due_return', ?)`
      ).run(
        instId,
        dueTxCode,
        entry_date,
        catId,
        accId,
        `শিক্ষক অগ্রিম বকেয়া নগদ ফেরত — ${teacher.full_name} (${profile.teacher_code})`,
        amount,
        payment_method,
        req.authUser!.full_name,
        receiptNumber,
        note,
        now
      );
    }

    const lInfo = db
      .prepare(
        `INSERT INTO teacher_due_ledger (institution_id, teacher_id, entry_date, entry_type, previous_due, amount, new_due, reference_id, transaction_id, note, created_by_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`
      )
      .run(
        instId,
        teacher_id,
        entry_date,
        entry_type,
        previousDue,
        amount,
        newDue,
        txnId,
        note || (entry_type === 'cash_return' ? 'নগদ ফেরত সমন্বয়' : 'প্রশাসনিক বকেয়া সমন্বয়'),
        req.authUser!.full_name,
        now
      );

    const recInfo = db
      .prepare(
        `INSERT INTO teacher_salary_receipts (
          institution_id, teacher_id, receipt_type, salary_record_id, advance_record_id,
          receipt_number, salary_month, base_salary, bonus, deduction, due_adjusted,
          paid_amount, payment_method, payment_date, transaction_id, approved_by_name, remarks, created_at
        ) VALUES (?, ?, 'due_settlement', NULL, NULL, ?, '', 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        instId,
        teacher_id,
        receiptNumber,
        amount,
        amount,
        payment_method,
        entry_date,
        txnId,
        req.authUser!.full_name,
        note || (entry_type === 'cash_return' ? 'অগ্রিম বকেয়া ফেরত' : 'বকেয়া সমন্বয়'),
        now
      );

    return {
      ledgerId: Number(lInfo.lastInsertRowid),
      receipt: db
        .prepare(
          `SELECT r.*, t.full_name as teacher_name, tp.teacher_code
           FROM teacher_salary_receipts r
           JOIN teachers t ON t.id = r.teacher_id
           LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
           WHERE r.id = ?`
        )
        .get(recInfo.lastInsertRowid),
    };
  });

  const result = tx();

  createNotification({
    institutionId: instId,
    userId: teacher.user_id,
    type: 'due_adjusted',
    title: 'বকেয়া সমন্বয় সম্পন্ন হয়েছে',
    message: `আপনার বকেয়া থেকে ৳${amount.toLocaleString('en-IN')} সমন্বয় করা হয়েছে। অবশিষ্ট বকেয়া: ৳${newDue.toLocaleString('en-IN')}।`,
    referenceType: 'due_settlement',
    referenceId: result.ledgerId,
  });

  res.status(201).json({
    id: result.ledgerId,
    previous_due: previousDue,
    new_due: newDue,
    receipt: result.receipt,
  });
});

// ==================== 6. CENTRAL LEAVE MANAGEMENT DASHBOARD ====================
teacherAdvancedRouter.get(
  '/leaves',
  requireAnyPermission([
    ['teachers', 'view'],
    ['students', 'view'],
    ['attendance', 'view'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const statusFilter = String(req.query.status || '').trim();

    let tSql = `
      SELECT tl.*, t.full_name as applicant_name, t.photo_url, t.mobile, tp.teacher_code as applicant_code,
             d.name as department_name
      FROM teacher_leave_applications tl
      JOIN teachers t ON t.id = tl.teacher_id
      LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
      LEFT JOIN academic_departments d ON d.id = t.department_id
      WHERE tl.institution_id = ?
    `;
    const tParams: any[] = [instId];
    if (statusFilter && statusFilter !== 'all') {
      tSql += ' AND tl.status = ?';
      tParams.push(statusFilter);
    }
    tSql += ' ORDER BY tl.created_at DESC LIMIT 200';

    let sSql = `
      SELECT sl.*, s.full_name as applicant_name, s.photo_url, s.roll_number, s.student_code as applicant_code,
             d.name as department_name, c.name as class_name, j.name as jamaat_name
      FROM student_leave_applications sl
      JOIN students s ON s.id = sl.student_id
      LEFT JOIN academic_departments d ON d.id = COALESCE(sl.department_id, s.department_id)
      LEFT JOIN classes c ON c.id = COALESCE(sl.class_id, s.class_id)
      LEFT JOIN jamaat_names j ON j.id = COALESCE(sl.jamaat_id, s.jamaat_id)
      WHERE sl.institution_id = ?
    `;
    const sParams: any[] = [instId];
    if (statusFilter && statusFilter !== 'all') {
      sSql += ' AND sl.status = ?';
      sParams.push(statusFilter);
    }
    sSql += ' ORDER BY sl.created_at DESC LIMIT 200';

    const approvalHistory = db
      .prepare(
        `SELECT * FROM leave_approval_records
         WHERE institution_id = ?
         ORDER BY created_at DESC LIMIT 100`
      )
      .all(instId);

    const teacherLeaves = db.prepare(tSql).all(...tParams) as any[];
    const studentLeaves = db.prepare(sSql).all(...sParams) as any[];

    const counts = {
      teacherPending: (
        db.prepare("SELECT COUNT(*) as c FROM teacher_leave_applications WHERE institution_id = ? AND status = 'pending'").get(instId) as { c: number }
      ).c,
      studentPending: (
        db.prepare("SELECT COUNT(*) as c FROM student_leave_applications WHERE institution_id = ? AND status = 'pending'").get(instId) as { c: number }
      ).c,
    };

    res.json({ teacherLeaves, studentLeaves, approvalHistory, counts });
  }
);

teacherAdvancedRouter.post(
  '/leaves/teacher/:id/review',
  requireAnyPermission([
    ['teachers', 'edit'],
    ['teachers', 'manage'],
    ['attendance', 'manage'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const id = Number(req.params.id);
    const action = req.body?.action === 'approved' ? 'approved' : req.body?.action === 'rejected' ? 'rejected' : null;
    const comment = String(req.body?.comment || '').trim();

    if (!action) return res.status(400).json({ error: 'অনুমোদন (approved) অথবা প্রত্যাখ্যান (rejected) নির্বাচন করুন।' });

    const leave = db
      .prepare(
        `SELECT tl.*, t.user_id as applicant_user_id, t.full_name as teacher_name
         FROM teacher_leave_applications tl
         JOIN teachers t ON t.id = tl.teacher_id
         WHERE tl.id = ? AND tl.institution_id = ?`
      )
      .get(id, instId) as any;
    if (!leave) return res.status(404).json({ error: 'ছুটির আবেদন পাওয়া যায়নি।' });

    // Strict self-approval protection: teachers cannot approve/reject their own leave!
    if (leave.applicant_user_id === req.authUser!.id && req.authUser!.account_type !== 'institution_admin') {
      return res.status(403).json({ error: 'নিজের ছুটির আবেদনের স্ট্যাটাস পরিবর্তন করার অনুমতি নেই।' });
    }

    const now = getDhakaNowISO();
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE teacher_leave_applications
         SET status = ?, admin_comment = ?, reviewed_by_user_id = ?, reviewed_by_name = ?, reviewed_at = ?
         WHERE id = ? AND institution_id = ?`
      ).run(action, comment, req.authUser!.id, req.authUser!.full_name, now, id, instId);

      db.prepare(
        `INSERT INTO leave_approval_records (institution_id, applicant_type, leave_application_id, action, comment, actor_user_id, actor_name, created_at)
         VALUES (?, 'teacher', ?, ?, ?, ?, ?, ?)`
      ).run(instId, id, action, comment, req.authUser!.id, req.authUser!.full_name, now);

      if (action === 'approved') {
        syncApprovedLeaveToAttendance({
          institutionId: instId,
          applicantType: 'teacher',
          applicantId: leave.teacher_id,
          startDate: leave.start_date,
          endDate: leave.end_date,
          reason: leave.reason,
          markedByUserId: req.authUser!.id,
        });
      }
    });
    tx();

    // Immediately recompute & broadcast live status so teacher becomes "ছুটিতে (On Leave)" right away
    recomputeInstitutionLiveStatuses(instId, { broadcast: true, forceBroadcast: true });

    // Notify applicant teacher
    createNotification({
      institutionId: instId,
      userId: leave.applicant_user_id,
      type: action === 'approved' ? 'leave_approved' : 'leave_rejected',
      title: action === 'approved' ? 'আপনার ছুটির আবেদন অনুমোদিত হয়েছে' : 'আপনার ছুটির আবেদন প্রত্যাখ্যান করা হয়েছে',
      message: `${leave.start_date} থেকে ${leave.end_date} পর্যন্ত (${leave.leave_type}) ছুটির আবেদন ${action === 'approved' ? 'অনুমোদন' : 'প্রত্যাখ্যান'} করা হয়েছে।${comment ? ` মন্তব্য: ${comment}` : ''}`,
      referenceType: 'teacher_leave',
      referenceId: id,
    });

    recordAuditLog({
      actorUserId: req.authUser!.id,
      actorName: req.authUser!.full_name,
      action: action === 'approved' ? 'APPROVE_TEACHER_LEAVE' : 'REJECT_TEACHER_LEAVE',
      targetType: 'teacher_leave',
      targetId: id,
      targetLabel: `${leave.teacher_name} (${leave.start_date} - ${leave.end_date})`,
      institutionId: instId,
    });

    res.json({ success: true, status: action });
  }
);

teacherAdvancedRouter.post(
  '/leaves/student/:id/review',
  requireAnyPermission([
    ['students', 'edit'],
    ['students', 'manage'],
    ['attendance', 'edit'],
    ['attendance', 'manage'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const id = Number(req.params.id);
    const action = req.body?.action === 'approved' ? 'approved' : req.body?.action === 'rejected' ? 'rejected' : null;
    const comment = String(req.body?.comment || '').trim();

    if (!action) return res.status(400).json({ error: 'অনুমোদন (approved) অথবা প্রত্যাখ্যান (rejected) নির্বাচন করুন।' });

    const leave = db
      .prepare(
        `SELECT sl.*, s.user_id as applicant_user_id, s.full_name as student_name, s.department_id as stu_dept_id, s.class_id as stu_class_id
         FROM student_leave_applications sl
         JOIN students s ON s.id = sl.student_id
         WHERE sl.id = ? AND sl.institution_id = ?`
      )
      .get(id, instId) as any;
    if (!leave) return res.status(404).json({ error: 'শিক্ষার্থীর ছুটির আবেদন পাওয়া যায়নি।' });

    const now = getDhakaNowISO();
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE student_leave_applications
         SET status = ?, admin_comment = ?, reviewed_by_user_id = ?, reviewed_by_name = ?, reviewed_at = ?
         WHERE id = ? AND institution_id = ?`
      ).run(action, comment, req.authUser!.id, req.authUser!.full_name, now, id, instId);

      db.prepare(
        `INSERT INTO leave_approval_records (institution_id, applicant_type, leave_application_id, action, comment, actor_user_id, actor_name, created_at)
         VALUES (?, 'student', ?, ?, ?, ?, ?, ?)`
      ).run(instId, id, action, comment, req.authUser!.id, req.authUser!.full_name, now);

      if (action === 'approved') {
        syncApprovedLeaveToAttendance({
          institutionId: instId,
          applicantType: 'student',
          applicantId: leave.student_id,
          startDate: leave.start_date,
          endDate: leave.end_date,
          reason: leave.reason,
          markedByUserId: req.authUser!.id,
          departmentId: leave.department_id || leave.stu_dept_id,
          classId: leave.class_id || leave.stu_class_id,
        });
      }
    });
    tx();

    // Notify applicant student
    createNotification({
      institutionId: instId,
      userId: leave.applicant_user_id,
      type: action === 'approved' ? 'leave_approved' : 'leave_rejected',
      title: action === 'approved' ? 'আপনার ছুটির আবেদন অনুমোদিত হয়েছে' : 'আপনার ছুটির আবেদন প্রত্যাখ্যান করা হয়েছে',
      message: `${leave.start_date} থেকে ${leave.end_date} পর্যন্ত (${leave.leave_type}) ছুটির আবেদন ${action === 'approved' ? 'অনুমোদন করা হয়েছে এবং উপস্থিতিতে ছুটি হিসেবে যুক্ত হয়েছে' : 'প্রত্যাখ্যান করা হয়েছে'}।${comment ? ` মন্তব্য: ${comment}` : ''}`,
      referenceType: 'student_leave',
      referenceId: id,
    });

    recordAuditLog({
      actorUserId: req.authUser!.id,
      actorName: req.authUser!.full_name,
      action: action === 'approved' ? 'APPROVE_STUDENT_LEAVE' : 'REJECT_STUDENT_LEAVE',
      targetType: 'student_leave',
      targetId: id,
      targetLabel: `${leave.student_name} (${leave.start_date} - ${leave.end_date})`,
      institutionId: instId,
    });

    res.json({ success: true, status: action });
  }
);

// ==================== 7. DETAILED TEACHER PROFILE (PERSONAL + WORK + FINANCE) ====================
teacherAdvancedRouter.get('/teachers/:id/profile', requirePermission('teachers', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const teacherId = Number(req.params.id);

  const teacher = db
    .prepare(
      `SELECT t.*, u.username, u.account_type, u.status as account_status, u.last_login_at,
              d.name as department_name
       FROM teachers t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN academic_departments d ON d.id = t.department_id
       WHERE t.id = ? AND t.institution_id = ?`
    )
    .get(teacherId, instId) as any;
  if (!teacher) return res.status(404).json({ error: 'শিক্ষক পাওয়া যায়নি।' });

  const profile = ensureTeacherProfile(instId, teacherId);

  const designations = db
    .prepare(
      `SELECT td.designation_id, td.is_primary, des.name, des.category
       FROM teacher_designations td
       JOIN designations des ON des.id = td.designation_id
       WHERE td.teacher_id = ?
       ORDER BY td.is_primary DESC, des.id ASC`
    )
    .all(teacherId);

  const assignments = db
    .prepare(
      `SELECT ta.id, ta.class_id, ta.subject_id, ta.jamaat_id,
              c.name as class_name, c.department_id, d.name as department_name,
              s.name as subject_name, j.name as jamaat_name
       FROM teacher_assignments ta
       JOIN classes c ON c.id = ta.class_id
       LEFT JOIN academic_departments d ON d.id = c.department_id
       LEFT JOIN subjects s ON s.id = ta.subject_id
       LEFT JOIN jamaat_names j ON j.id = ta.jamaat_id
       WHERE ta.teacher_id = ? AND ta.institution_id = ?`
    )
    .all(teacherId, instId) as any[];

  const teacherSchedulesRaw = db
    .prepare(
      `SELECT ts.*, d.name as department_name, c.name as class_name,
              j.name as jamaat_name, s.name as subject_name,
              'teacher_schedule' as source
       FROM teacher_schedules ts
       LEFT JOIN academic_departments d ON d.id = ts.department_id
       LEFT JOIN classes c ON c.id = ts.class_id
       LEFT JOIN jamaat_names j ON j.id = ts.jamaat_id
       LEFT JOIN subjects s ON s.id = ts.subject_id
       WHERE ts.institution_id = ? AND ts.teacher_id = ?
       ORDER BY ${dayOrderSql('ts.day_of_week')}, ts.start_time ASC`
    )
    .all(instId, teacherId) as any[];

  const routineSchedulesRaw = db
    .prepare(
      `SELECT r.id, r.institution_id, r.teacher_id, r.department_id, r.class_id, r.jamaat_id, r.subject_id,
              r.day_of_week, r.is_daily, r.period_number, r.start_time, r.end_time, r.room as room_number,
              'active' as status, r.created_at,
              d.name as department_name, c.name as class_name,
              j.name as jamaat_name, s.name as subject_name,
              'routine' as source
       FROM routines r
       LEFT JOIN academic_departments d ON d.id = r.department_id
       LEFT JOIN classes c ON c.id = r.class_id
       LEFT JOIN jamaat_names j ON j.id = r.jamaat_id
       LEFT JOIN subjects s ON s.id = r.subject_id
       WHERE r.institution_id = ? AND r.teacher_id = ?
       ORDER BY ${dayOrderSql('r.day_of_week')}, r.start_time ASC, r.period_number ASC`
    )
    .all(instId, teacherId) as any[];

  const seenProfileSlots = new Set<string>();
  const schedules: any[] = [];
  for (const sc of [...teacherSchedulesRaw, ...routineSchedulesRaw]) {
    const key = `${sc.day_of_week}|${sc.start_time}|${sc.end_time}|${sc.class_id || 0}|${sc.subject_id || 0}`;
    if (seenProfileSlots.has(key)) continue;
    seenProfileSlots.add(key);
    schedules.push(sc);
  }
  const dayRank = (d: string) => {
    if (isDailyDayValue(d)) return 0;
    const idx = (BENGALI_WEEKDAYS as readonly string[]).indexOf(d);
    return idx >= 0 ? idx + 1 : 99;
  };
  schedules.sort((a, b) => {
    const dr = dayRank(a.day_of_week) - dayRank(b.day_of_week);
    if (dr !== 0) return dr;
    return String(a.start_time || '').localeCompare(String(b.start_time || ''));
  });

  const breaks = db
    .prepare(
      `SELECT * FROM teacher_break_schedules
       WHERE institution_id = ? AND teacher_id = ?
       ORDER BY ${dayOrderSql('day_of_week')}, start_time ASC`
    )
    .all(instId, teacherId);

  const attendanceHistory = db
    .prepare(
      `SELECT attendance_date, status, check_in, check_out, note
       FROM teacher_attendance
       WHERE institution_id = ? AND teacher_id = ?
       ORDER BY attendance_date DESC LIMIT 60`
    )
    .all(instId, teacherId);

  const attSummary = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave_days
       FROM teacher_attendance
       WHERE institution_id = ? AND teacher_id = ?`
    )
    .get(instId, teacherId) as any;

  const leaves = db
    .prepare(
      `SELECT * FROM teacher_leave_applications
       WHERE institution_id = ? AND teacher_id = ?
       ORDER BY created_at DESC LIMIT 30`
    )
    .all(instId, teacherId);

  const liveStatus = computeTeacherLiveStatus(instId, teacherId);

  // Strict Finance Permission Gate: only include financial details if caller has finance:view OR is viewing own profile
  const canViewFinance =
    hasPermission(req.authUser!, 'finance', 'view') || req.authUser!.id === teacher.user_id;

  let financial: any = null;
  if (canViewFinance) {
    const salaryRecords = db
      .prepare(
        `SELECT sr.*, r.receipt_number, r.id as receipt_id
         FROM teacher_salary_records sr
         LEFT JOIN teacher_salary_receipts r ON r.salary_record_id = sr.id
         WHERE sr.institution_id = ? AND sr.teacher_id = ?
         ORDER BY sr.created_at DESC LIMIT 100`
      )
      .all(instId, teacherId) as any[];

    const receipts = db
      .prepare(
        `SELECT r.*, t.full_name as teacher_name, tp.teacher_code
         FROM teacher_salary_receipts r
         JOIN teachers t ON t.id = r.teacher_id
         LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
         WHERE r.institution_id = ? AND r.teacher_id = ?
         ORDER BY r.created_at DESC LIMIT 100`
      )
      .all(instId, teacherId);

    const advances = db
      .prepare(
        `SELECT * FROM teacher_advance_records
         WHERE institution_id = ? AND teacher_id = ?
         ORDER BY created_at DESC LIMIT 100`
      )
      .all(instId, teacherId) as any[];

    const dueLedger = db
      .prepare(
        `SELECT * FROM teacher_due_ledger
         WHERE institution_id = ? AND teacher_id = ?
         ORDER BY id DESC LIMIT 100`
      )
      .all(instId, teacherId);

    const totalSalaryPaid = Number(salaryRecords.reduce((a, b) => a + Number(b.paid_amount || 0), 0).toFixed(2));
    const totalAdvanceWithdrawn = Number(advances.reduce((a, b) => a + Number(b.amount || 0), 0).toFixed(2));
    const currentDue = getTeacherCurrentDue(instId, teacherId);

    financial = {
      monthly_salary: Number(profile.monthly_salary || 0),
      monthly_meal_cost: Number(profile.monthly_meal_cost || 0),
      total_monthly_payable: Number((Number(profile.monthly_salary || 0) + Number(profile.monthly_meal_cost || 0)).toFixed(2)),
      total_salary_paid: totalSalaryPaid,
      total_advance_withdrawn: totalAdvanceWithdrawn,
      current_due: currentDue,
      last_salary_date: salaryRecords[0]?.payment_date || null,
      salary_records: salaryRecords,
      receipts,
      advances,
      due_ledger: dueLedger,
    };
  }

  // Unique departments served (primary + assigned + scheduled)
  const deptNames = new Set<string>();
  if (teacher.department_name) deptNames.add(teacher.department_name);
  assignments.forEach((a) => {
    if (a.department_name) deptNames.add(a.department_name);
  });
  (schedules as any[]).forEach((sc) => {
    if (sc.department_name) deptNames.add(sc.department_name);
  });

  // Distinct active books linked to teacher's assigned/scheduled classes, jamaats, or subjects
  const teacherClassIds = new Set<number>();
  const teacherJamaatIds = new Set<number>();
  const teacherSubjectIds = new Set<number>();
  assignments.forEach((a) => {
    if (a.class_id) teacherClassIds.add(Number(a.class_id));
    if (a.jamaat_id) teacherJamaatIds.add(Number(a.jamaat_id));
    if (a.subject_id) teacherSubjectIds.add(Number(a.subject_id));
  });
  (schedules as any[]).forEach((sc) => {
    if (sc.class_id) teacherClassIds.add(Number(sc.class_id));
    if (sc.jamaat_id) teacherJamaatIds.add(Number(sc.jamaat_id));
    if (sc.subject_id) teacherSubjectIds.add(Number(sc.subject_id));
  });
  const bookMap = new Map<number, any>();
  if (teacherSubjectIds.size > 0) {
    const sIds = Array.from(teacherSubjectIds);
    const rows = db
      .prepare(
        `SELECT DISTINCT b.id, b.book_code, b.name, b.arabic_name, b.short_name, b.author_name, b.cover_image_url, b.status
         FROM subjects sub
         JOIN academic_books b ON b.id = sub.book_id
         WHERE sub.institution_id = ? AND b.institution_id = ? AND b.status != 'archived'
           AND sub.id IN (${sIds.map(() => '?').join(',')})`
      )
      .all(instId, instId, ...sIds) as any[];
    rows.forEach((b) => bookMap.set(b.id, b));
  }
  if (teacherClassIds.size > 0) {
    const cIds = Array.from(teacherClassIds);
    const rows = db
      .prepare(
        `SELECT DISTINCT b.id, b.book_code, b.name, b.arabic_name, b.short_name, b.author_name, b.cover_image_url, b.status
         FROM class_books cb
         JOIN academic_books b ON b.id = cb.book_id
         WHERE cb.institution_id = ? AND b.institution_id = ? AND b.status != 'archived'
           AND cb.class_id IN (${cIds.map(() => '?').join(',')})`
      )
      .all(instId, instId, ...cIds) as any[];
    rows.forEach((b) => {
      if (!bookMap.has(b.id)) bookMap.set(b.id, b);
    });
  }
  if (teacherJamaatIds.size > 0) {
    const jIds = Array.from(teacherJamaatIds);
    const rows = db
      .prepare(
        `SELECT DISTINCT b.id, b.book_code, b.name, b.arabic_name, b.short_name, b.author_name, b.cover_image_url, b.status
         FROM jamaat_books jb
         JOIN academic_books b ON b.id = jb.book_id
         WHERE jb.institution_id = ? AND b.institution_id = ? AND b.status != 'archived'
           AND jb.jamaat_id IN (${jIds.map(() => '?').join(',')})`
      )
      .all(instId, instId, ...jIds) as any[];
    rows.forEach((b) => {
      if (!bookMap.has(b.id)) bookMap.set(b.id, b);
    });
  }

  res.json({
    personal: {
      id: teacher.id,
      user_id: teacher.user_id,
      teacher_code: profile.teacher_code,
      full_name: teacher.full_name,
      username: teacher.username,
      photo_url: teacher.photo_url,
      mobile: teacher.mobile,
      email: profile.email,
      address: teacher.address,
      joining_date: teacher.joining_date,
      department_id: teacher.department_id,
      department_name: teacher.department_name || '',
      education: profile.education,
      account_type: teacher.account_type,
      account_status: teacher.account_status,
      status: teacher.status,
      notes: profile.notes,
      designations,
    },
    work: {
      departments: Array.from(deptNames),
      assignments,
      schedules,
      breaks,
      books: Array.from(bookMap.values()),
      liveStatus,
      attendanceSummary: {
        total: Number(attSummary?.total || 0),
        present: Number(attSummary?.present || 0),
        absent: Number(attSummary?.absent || 0),
        late: Number(attSummary?.late || 0),
        leave_days: Number(attSummary?.leave_days || 0),
      },
      attendanceHistory,
      leaves,
    },
    canViewFinance,
    financial,
  });
});

teacherAdvancedRouter.put('/teachers/:id/profile', requirePermission('teachers', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const teacherId = Number(req.params.id);
  const teacher = db.prepare('SELECT * FROM teachers WHERE id = ? AND institution_id = ?').get(teacherId, instId) as any;
  if (!teacher) return res.status(404).json({ error: 'শিক্ষক পাওয়া যায়নি।' });

  const full_name = String(req.body?.full_name || teacher.full_name).trim();
  const mobile = String(req.body?.mobile ?? teacher.mobile).trim();
  const address = String(req.body?.address ?? teacher.address).trim();
  const joining_date = String(req.body?.joining_date ?? teacher.joining_date).trim();
  const department_id =
    req.body?.department_id !== undefined
      ? req.body.department_id
        ? Number(req.body.department_id)
        : null
      : teacher.department_id;
  const photo_url = req.body?.photo_url !== undefined ? sanitizeImageUrl(req.body.photo_url) : teacher.photo_url;
  const status = req.body?.status === 'inactive' ? 'inactive' : 'active';
  const email = req.body?.email !== undefined ? String(req.body.email).trim() : undefined;
  const education = req.body?.education !== undefined ? String(req.body.education).trim() : undefined;
  const notes = req.body?.notes !== undefined ? String(req.body.notes).trim() : undefined;

  // Only allow updating monthly_salary / monthly_meal_cost if user has finance edit/create permission OR is institution_admin
  const canEditSalary =
    req.authUser!.account_type === 'institution_admin' ||
    hasPermission(req.authUser!, 'finance', 'edit') ||
    hasPermission(req.authUser!, 'finance', 'create');
  const monthly_salary =
    canEditSalary && req.body?.monthly_salary !== undefined
      ? Number(Math.max(0, Number(req.body.monthly_salary || 0)).toFixed(2))
      : undefined;
  const monthly_meal_cost =
    canEditSalary && req.body?.monthly_meal_cost !== undefined
      ? Number(Math.max(0, Number(req.body.monthly_meal_cost || 0)).toFixed(2))
      : undefined;

  db.prepare(
    `UPDATE teachers SET full_name = ?, mobile = ?, address = ?, joining_date = ?, department_id = ?, photo_url = ?, status = ?
     WHERE id = ? AND institution_id = ?`
  ).run(full_name, mobile, address, joining_date, department_id, photo_url, status, teacherId, instId);

  db.prepare('UPDATE users SET full_name = ?, phone = ?, photo_url = ?, status = ? WHERE id = ? AND institution_id = ?').run(
    full_name,
    mobile,
    photo_url,
    status,
    teacher.user_id,
    instId
  );

  const profile = ensureTeacherProfile(instId, teacherId, {
    email,
    education,
    monthly_salary,
    monthly_meal_cost,
    notes,
  });

  if (req.body?.document_url !== undefined) {
    const doc = sanitizeStoredAttachmentRef(req.body?.document_name, req.body?.document_url);
    db.prepare(
      'UPDATE teacher_profiles SET document_name = ?, document_url = ?, updated_at = ? WHERE teacher_id = ? AND institution_id = ?'
    ).run(doc.name, doc.data, getDhakaNowISO(), teacherId, instId);
  }

  res.json({ success: true, profile });
});
