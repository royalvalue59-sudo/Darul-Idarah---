import {
  DAILY_DAY_OPTION,
  db,
  getDhakaBengaliWeekday,
  getDhakaDateYMD,
  getDhakaNowISO,
  getDhakaTimeHM,
} from '../db.ts';
import { broadcastNotification, broadcastTeacherLiveStatus } from '../realtime.ts';
import { sanitizeStoredAttachmentRef } from '../uploadPolicy.ts';

export interface LiveTimeOverride {
  dateYMD?: string;
  weekday?: string;
  timeHM?: string;
}

export function sanitizeAttachment(rawName: unknown, rawData: unknown): { name: string; data: string } {
  return sanitizeStoredAttachmentRef(rawName, rawData);
}

export function countInclusiveDays(startDate: string, endDate: string): number {
  const s = new Date(`${startDate}T00:00:00Z`);
  const e = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

export function isValidTimeHM(val: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(val);
}

export function timeToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function ensureTeacherProfile(
  institutionId: number,
  teacherId: number,
  updates?: {
    email?: string;
    education?: string;
    monthly_salary?: number;
    monthly_meal_cost?: number;
    notes?: string;
  }
) {
  const now = getDhakaNowISO();
  let existing = db
    .prepare('SELECT * FROM teacher_profiles WHERE teacher_id = ? AND institution_id = ?')
    .get(teacherId, institutionId) as any;

  if (!existing) {
    db.prepare('UPDATE institutions SET teacher_code_counter = teacher_code_counter + 1 WHERE id = ?').run(institutionId);
    const { teacher_code_counter } = db
      .prepare('SELECT teacher_code_counter FROM institutions WHERE id = ?')
      .get(institutionId) as { teacher_code_counter: number };
    const code = `TCH-${String(teacher_code_counter).padStart(4, '0')}`;
    db.prepare(
      `INSERT INTO teacher_profiles (institution_id, teacher_id, teacher_code, email, education, monthly_salary, monthly_meal_cost, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      institutionId,
      teacherId,
      code,
      String(updates?.email || '').trim(),
      String(updates?.education || '').trim(),
      Number(Math.max(0, Number(updates?.monthly_salary || 0)).toFixed(2)),
      Number(Math.max(0, Number(updates?.monthly_meal_cost || 0)).toFixed(2)),
      String(updates?.notes || '').trim(),
      now,
      now
    );
    existing = db
      .prepare('SELECT * FROM teacher_profiles WHERE teacher_id = ? AND institution_id = ?')
      .get(teacherId, institutionId) as any;
  } else if (updates) {
    const nextEmail = updates.email !== undefined ? String(updates.email).trim() : existing.email;
    const nextEdu = updates.education !== undefined ? String(updates.education).trim() : existing.education;
    const nextSalary =
      updates.monthly_salary !== undefined
        ? Number(Math.max(0, Number(updates.monthly_salary || 0)).toFixed(2))
        : Number(existing.monthly_salary || 0);
    const nextMealCost =
      updates.monthly_meal_cost !== undefined
        ? Number(Math.max(0, Number(updates.monthly_meal_cost || 0)).toFixed(2))
        : Number(existing.monthly_meal_cost || 0);
    const nextNotes = updates.notes !== undefined ? String(updates.notes).trim() : existing.notes;
    db.prepare(
      `UPDATE teacher_profiles SET email = ?, education = ?, monthly_salary = ?, monthly_meal_cost = ?, notes = ?, updated_at = ?
       WHERE teacher_id = ? AND institution_id = ?`
    ).run(nextEmail, nextEdu, nextSalary, nextMealCost, nextNotes, now, teacherId, institutionId);
    existing = db
      .prepare('SELECT * FROM teacher_profiles WHERE teacher_id = ? AND institution_id = ?')
      .get(teacherId, institutionId) as any;
  }

  db.prepare(
    `INSERT OR IGNORE INTO teacher_live_status (institution_id, teacher_id, status, verification_state, updated_at)
     VALUES (?, ?, 'free', 'scheduled', ?)`
  ).run(institutionId, teacherId, now);

  return existing;
}

export function getTeacherCurrentDue(institutionId: number, teacherId: number): number {
  const row = db
    .prepare(
      `SELECT new_due FROM teacher_due_ledger
       WHERE institution_id = ? AND teacher_id = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(institutionId, teacherId) as { new_due: number } | undefined;
  return Number(Number(row?.new_due || 0).toFixed(2));
}

export function createNotification(params: {
  institutionId: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  referenceType?: string;
  referenceId?: number | null;
  dedupeKey?: string;
}) {
  if (params.dedupeKey) {
    const dup = db
      .prepare('SELECT id FROM notifications WHERE user_id = ? AND dedupe_key = ? LIMIT 1')
      .get(params.userId, params.dedupeKey);
    if (dup) return null;
  }

  const now = getDhakaNowISO();
  const info = db
    .prepare(
      `INSERT INTO notifications (institution_id, user_id, type, title, message, reference_type, reference_id, dedupe_key, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    )
    .run(
      params.institutionId,
      params.userId,
      params.type,
      params.title,
      params.message,
      params.referenceType || '',
      params.referenceId ?? null,
      params.dedupeKey || '',
      now
    );

  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(info.lastInsertRowid) as any;
  if (row) {
    broadcastNotification(params.userId, row);
  }
  return row;
}

export function notifyInstitutionAdmins(params: {
  institutionId: number;
  type: string;
  title: string;
  message: string;
  referenceType?: string;
  referenceId?: number | null;
}) {
  // Notify all active institution_admin users and staff with teachers/attendance manage or edit permission
  const admins = db
    .prepare(
      `SELECT DISTINCT u.id, u.account_type, r.permissions_json
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = COALESCE(ur.role_id, u.role_id)
       WHERE u.institution_id = ? AND u.status = 'active'
         AND u.account_type IN ('institution_admin', 'staff')`
    )
    .all(params.institutionId) as Array<{ id: number; account_type: string; permissions_json: string | null }>;

  const notifiedIds = new Set<number>();
  for (const a of admins) {
    if (notifiedIds.has(a.id)) continue;
    let eligible = a.account_type === 'institution_admin';
    if (!eligible && a.permissions_json) {
      try {
        const p = JSON.parse(a.permissions_json);
        const tPerms: string[] = Array.isArray(p.teachers) ? p.teachers : [];
        const aPerms: string[] = Array.isArray(p.attendance) ? p.attendance : [];
        if (
          tPerms.includes('manage') ||
          tPerms.includes('edit') ||
          aPerms.includes('manage') ||
          aPerms.includes('edit')
        ) {
          eligible = true;
        }
      } catch {
        // ignore invalid JSON
      }
    }
    if (eligible) {
      notifiedIds.add(a.id);
      createNotification({
        institutionId: params.institutionId,
        userId: a.id,
        type: params.type,
        title: params.title,
        message: params.message,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
      });
    }
  }
}

export function syncApprovedLeaveToAttendance(params: {
  institutionId: number;
  applicantType: 'teacher' | 'student';
  applicantId: number;
  startDate: string;
  endDate: string;
  reason: string;
  markedByUserId: number;
  departmentId?: number | null;
  classId?: number | null;
}) {
  const days = countInclusiveDays(params.startDate, params.endDate);
  if (days <= 0) return;
  const capped = Math.min(days, 90);
  const start = new Date(`${params.startDate}T00:00:00Z`);
  const now = getDhakaNowISO();
  const note = `অনুমোদিত ছুটি: ${params.reason}`.slice(0, 200);

  if (params.applicantType === 'teacher') {
    const upsert = db.prepare(
      `INSERT INTO teacher_attendance (institution_id, teacher_id, attendance_date, status, note, marked_by, created_at)
       VALUES (?, ?, ?, 'leave', ?, ?, ?)
       ON CONFLICT(institution_id, teacher_id, attendance_date)
       DO UPDATE SET status = 'leave', note = excluded.note, marked_by = excluded.marked_by`
    );
    for (let i = 0; i < capped; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      upsert.run(params.institutionId, params.applicantId, d, note, params.markedByUserId, now);
    }
  } else {
    const upsert = db.prepare(
      `INSERT INTO student_attendance (institution_id, department_id, class_id, student_id, attendance_date, session_name, status, marked_by, note, created_at)
       VALUES (?, ?, ?, ?, ?, 'সকাল', 'leave', ?, ?, ?)
       ON CONFLICT(institution_id, student_id, attendance_date, session_name)
       DO UPDATE SET status = 'leave', note = excluded.note, marked_by = excluded.marked_by`
    );
    for (let i = 0; i < capped; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      upsert.run(
        params.institutionId,
        params.departmentId ?? null,
        params.classId ?? null,
        params.applicantId,
        d,
        params.markedByUserId,
        note,
        now
      );
    }
  }
}

export function computeTeacherLiveStatus(
  institutionId: number,
  teacherId: number,
  overrideTime?: LiveTimeOverride
) {
  const today = overrideTime?.dateYMD || getDhakaDateYMD();
  const weekday = overrideTime?.weekday || getDhakaBengaliWeekday();
  const timeHM = overrideTime?.timeHM || getDhakaTimeHM();
  const nowMin = timeToMinutes(timeHM);
  const nowISO = getDhakaNowISO();

  const existingLive = db
    .prepare('SELECT confirmed_schedule_id, confirmed_at, confirmed_date FROM teacher_live_status WHERE institution_id = ? AND teacher_id = ?')
    .get(institutionId, teacherId) as
    | { confirmed_schedule_id: number | null; confirmed_at: string | null; confirmed_date: string | null }
    | undefined;

  // 1. Check approved leave covering today
  const approvedLeave = db
    .prepare(
      `SELECT id, leave_type, reason, start_date, end_date
       FROM teacher_leave_applications
       WHERE institution_id = ? AND teacher_id = ? AND status = 'approved'
         AND start_date <= ? AND end_date >= ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(institutionId, teacherId, today, today) as
    | { id: number; leave_type: string; reason: string; start_date: string; end_date: string }
    | undefined;

  // 2. Check today's attendance record
  const todayAtt = db
    .prepare(
      `SELECT status, check_in, check_out
       FROM teacher_attendance
       WHERE institution_id = ? AND teacher_id = ? AND attendance_date = ?
       LIMIT 1`
    )
    .get(institutionId, teacherId, today) as { status: string; check_in: string; check_out: string } | undefined;

  // 3. Load today's active class schedules (both teacher_schedules and academic routines, including Daily) & break schedules
  const teacherSchedules = db
    .prepare(
      `SELECT ts.*, d.name as department_name, c.name as class_name,
              j.name as jamaat_name, s.name as subject_name,
              'teacher_schedule' as _source
       FROM teacher_schedules ts
       LEFT JOIN academic_departments d ON d.id = ts.department_id
       LEFT JOIN classes c ON c.id = ts.class_id
       LEFT JOIN jamaat_names j ON j.id = ts.jamaat_id
       LEFT JOIN subjects s ON s.id = ts.subject_id
       WHERE ts.institution_id = ? AND ts.teacher_id = ? AND ts.status = 'active'
         AND (ts.day_of_week = ? OR ts.is_daily = 1 OR ts.day_of_week = ?)
       ORDER BY ts.start_time ASC`
    )
    .all(institutionId, teacherId, weekday, DAILY_DAY_OPTION) as any[];

  const academicRoutines = db
    .prepare(
      `SELECT r.id, r.institution_id, r.teacher_id, r.department_id, r.class_id, r.jamaat_id, r.subject_id,
              r.day_of_week, r.is_daily, r.start_time, r.end_time, r.room as room_number,
              d.name as department_name, c.name as class_name,
              j.name as jamaat_name, s.name as subject_name,
              'routine' as _source
       FROM routines r
       LEFT JOIN academic_departments d ON d.id = r.department_id
       LEFT JOIN classes c ON c.id = r.class_id
       LEFT JOIN jamaat_names j ON j.id = r.jamaat_id
       LEFT JOIN subjects s ON s.id = r.subject_id
       WHERE r.institution_id = ? AND r.teacher_id = ?
         AND (r.day_of_week = ? OR r.is_daily = 1 OR r.day_of_week = ?)
       ORDER BY r.start_time ASC`
    )
    .all(institutionId, teacherId, weekday, DAILY_DAY_OPTION) as any[];

  const seenSlots = new Set<string>();
  const schedules: any[] = [];
  for (const sc of [...teacherSchedules, ...academicRoutines]) {
    const slotKey = `${sc.start_time}|${sc.end_time}|${sc.class_id || 0}|${sc.subject_id || 0}`;
    if (seenSlots.has(slotKey)) continue;
    seenSlots.add(slotKey);
    schedules.push(sc);
  }
  schedules.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

  const breaks = db
    .prepare(
      `SELECT * FROM teacher_break_schedules
       WHERE institution_id = ? AND teacher_id = ? AND status = 'active'
         AND (day_of_week = ? OR is_daily = 1 OR day_of_week = ?)
       ORDER BY start_time ASC`
    )
    .all(institutionId, teacherId, weekday, DAILY_DAY_OPTION) as any[];

  // Find next upcoming class after nowMin
  const nextSchedule = schedules.find((sc) => timeToMinutes(sc.start_time) > nowMin);
  const nextClassTime = nextSchedule ? `${nextSchedule.start_time}–${nextSchedule.end_time}` : '';
  const nextClassName = nextSchedule
    ? [nextSchedule.class_name, nextSchedule.jamaat_name, nextSchedule.subject_name].filter(Boolean).join(' · ')
    : '';

  let status: 'in_class' | 'break' | 'free' | 'on_leave' | 'absent' = 'free';
  let verificationState: 'confirmed' | 'unconfirmed' | 'scheduled' | 'leave' | 'absent' = 'scheduled';
  let currentScheduleId: number | null = null;
  let currentDepartment = '';
  let currentClass = '';
  let currentJamaat = '';
  let currentSubject = '';
  let roomNumber = '';
  let startTime = '';
  let endTime = '';
  let leaveReason = '';
  let leaveStartDate = '';
  let leaveEndDate = '';

  if (approvedLeave || todayAtt?.status === 'leave') {
    status = 'on_leave';
    verificationState = 'leave';
    leaveReason = approvedLeave ? `${approvedLeave.leave_type}: ${approvedLeave.reason}` : 'অনুমোদিত ছুটি';
    leaveStartDate = approvedLeave?.start_date || today;
    leaveEndDate = approvedLeave?.end_date || today;
  } else if (todayAtt?.status === 'absent') {
    status = 'absent';
    verificationState = 'absent';
  } else {
    const activeBreak = breaks.find(
      (b) => nowMin >= timeToMinutes(b.start_time) && nowMin < timeToMinutes(b.end_time)
    );
    const activeSchedule = schedules.find(
      (sc) => nowMin >= timeToMinutes(sc.start_time) && nowMin < timeToMinutes(sc.end_time)
    );

    if (activeBreak) {
      status = 'break';
      verificationState = todayAtt?.status === 'present' ? 'confirmed' : 'scheduled';
      startTime = activeBreak.start_time;
      endTime = activeBreak.end_time;
    } else if (activeSchedule) {
      status = 'in_class';
      currentScheduleId = activeSchedule._source === 'teacher_schedule' ? activeSchedule.id : null;
      currentDepartment = activeSchedule.department_name || '';
      currentClass = activeSchedule.class_name || '';
      currentJamaat = activeSchedule.jamaat_name || '';
      currentSubject = activeSchedule.subject_name || '';
      roomNumber = activeSchedule.room_number || '';
      startTime = activeSchedule.start_time;
      endTime = activeSchedule.end_time;

      const isClassConfirmed =
        existingLive?.confirmed_date === today &&
        currentScheduleId !== null &&
        existingLive?.confirmed_schedule_id === currentScheduleId;
      const isAttendancePresent = todayAtt?.status === 'present' || todayAtt?.status === 'late';
      verificationState = isClassConfirmed || isAttendancePresent ? 'confirmed' : 'unconfirmed';
    } else {
      status = 'free';
      verificationState = todayAtt?.status === 'present' ? 'confirmed' : 'scheduled';
    }
  }

  db.prepare(
    `INSERT INTO teacher_live_status (
      institution_id, teacher_id, status, verification_state, current_schedule_id,
      current_department, current_class, current_jamaat, current_subject, room_number,
      start_time, end_time, next_class_time, next_class_name,
      leave_reason, leave_start_date, leave_end_date, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(teacher_id) DO UPDATE SET
      status = excluded.status,
      verification_state = excluded.verification_state,
      current_schedule_id = excluded.current_schedule_id,
      current_department = excluded.current_department,
      current_class = excluded.current_class,
      current_jamaat = excluded.current_jamaat,
      current_subject = excluded.current_subject,
      room_number = excluded.room_number,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      next_class_time = excluded.next_class_time,
      next_class_name = excluded.next_class_name,
      leave_reason = excluded.leave_reason,
      leave_start_date = excluded.leave_start_date,
      leave_end_date = excluded.leave_end_date,
      updated_at = excluded.updated_at`
  ).run(
    institutionId,
    teacherId,
    status,
    verificationState,
    currentScheduleId,
    currentDepartment,
    currentClass,
    currentJamaat,
    currentSubject,
    roomNumber,
    startTime,
    endTime,
    nextClassTime,
    nextClassName,
    leaveReason,
    leaveStartDate,
    leaveEndDate,
    nowISO
  );

  // Check if next class starts within 10 minutes (and teacher is NOT on leave or absent) -> trigger upcoming_class notification!
  if (nextSchedule && status !== 'on_leave' && status !== 'absent') {
    const minsUntil = timeToMinutes(nextSchedule.start_time) - nowMin;
    if (minsUntil > 0 && minsUntil <= 10) {
      const tRow = db
        .prepare('SELECT user_id FROM teachers WHERE id = ? AND institution_id = ?')
        .get(teacherId, institutionId) as { user_id: number } | undefined;
      if (tRow?.user_id) {
        createNotification({
          institutionId,
          userId: tRow.user_id,
          type: 'upcoming_class',
          title: 'পরবর্তী ক্লাসের সময় আসন্ন',
          message: `${nextSchedule.start_time} মিনিটে আপনার পরবর্তী ক্লাস: ${nextClassName}${nextSchedule.room_number ? ` (কক্ষ ${nextSchedule.room_number})` : ''}।`,
          referenceType: nextSchedule._source === 'routine' ? 'routine' : 'teacher_schedule',
          referenceId: nextSchedule.id,
          dedupeKey: `upcoming_${nextSchedule._source}_${today}_${nextSchedule.id}`,
        });
      }
    }
  }

  return db
    .prepare(
      `SELECT tls.*, t.full_name, t.photo_url, t.mobile, t.department_id,
              d.name as teacher_department_name, tp.teacher_code,
              (SELECT des.name FROM teacher_designations td JOIN designations des ON des.id = td.designation_id WHERE td.teacher_id = t.id ORDER BY td.is_primary DESC LIMIT 1) as primary_designation
       FROM teacher_live_status tls
       JOIN teachers t ON t.id = tls.teacher_id
       LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
       LEFT JOIN academic_departments d ON d.id = t.department_id
       WHERE tls.institution_id = ? AND tls.teacher_id = ?`
    )
    .get(institutionId, teacherId) as any;
}

const lastBroadcastSignature = new Map<number, string>();

export function recomputeInstitutionLiveStatuses(
  institutionId: number,
  options: { broadcast?: boolean; forceBroadcast?: boolean; overrideTime?: LiveTimeOverride } = {}
) {
  const teachers = db
    .prepare("SELECT id FROM teachers WHERE institution_id = ? AND status = 'active' ORDER BY id ASC")
    .all(institutionId) as Array<{ id: number }>;

  const statuses = teachers.map((t) => computeTeacherLiveStatus(institutionId, t.id, options.overrideTime));

  if (options.broadcast) {
    const sig = JSON.stringify(
      statuses.map((s) => [
        s.teacher_id,
        s.status,
        s.verification_state,
        s.current_schedule_id,
        s.current_class,
        s.current_subject,
        s.start_time,
        s.next_class_time,
      ])
    );
    if (options.forceBroadcast || lastBroadcastSignature.get(institutionId) !== sig) {
      lastBroadcastSignature.set(institutionId, sig);
      broadcastTeacherLiveStatus(institutionId, statuses);
    }
  }

  return statuses;
}
