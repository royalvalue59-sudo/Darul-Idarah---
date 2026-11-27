import { Router } from 'express';
import {
  BENGALI_WEEKDAYS,
  dayOrderSql,
  db,
  DEFAULT_GRADING_SCALE,
  getDhakaDateYMD,
  getDhakaNowISO,
  getDhakaTimeHM,
  isDailyDayValue,
} from '../db.ts';
import { calculateGrade, getTeacherAssignedScope, requireAuth, requireInstitution } from '../auth.ts';
import {
  computeTeacherLiveStatus,
  countInclusiveDays,
  ensureTeacherProfile,
  getTeacherCurrentDue,
  notifyInstitutionAdmins,
  recomputeInstitutionLiveStatuses,
  sanitizeAttachment,
} from '../services/teacherEngine.ts';

export const portalsRouter = Router();
portalsRouter.use(requireAuth, requireInstitution);

function buildStudentPortalPayload(instId: number, studentId: number) {
  const today = getDhakaDateYMD();
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

  if (!student) return null;

  const todayAttendance = db
    .prepare(
      `SELECT status, session_name, note FROM student_attendance
       WHERE student_id = ? AND institution_id = ? AND attendance_date = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(studentId, instId, today) as { status: string; session_name: string; note: string } | undefined;

  const attSummary = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave_count
       FROM student_attendance WHERE student_id = ? AND institution_id = ?`
    )
    .get(studentId, instId) as any;

  const monthlyAttendance = db
    .prepare(
      `SELECT attendance_date, session_name, status, note
       FROM student_attendance
       WHERE student_id = ? AND institution_id = ?
       ORDER BY attendance_date DESC LIMIT 31`
    )
    .all(studentId, instId);

  const routineRaw = db
    .prepare(
      `SELECT r.*, j.name as jamaat_name, s.name as subject_name, t.full_name as teacher_name,
              'routine' as source
       FROM routines r
       LEFT JOIN jamaat_names j ON j.id = r.jamaat_id
       JOIN subjects s ON s.id = r.subject_id
       JOIN teachers t ON t.id = r.teacher_id
       WHERE r.institution_id = ? AND r.class_id = ?
       ORDER BY ${dayOrderSql('r.day_of_week')}, r.start_time ASC, r.period_number ASC`
    )
    .all(instId, student.class_id) as any[];

  const classTeacherSchedules = db
    .prepare(
      `SELECT ts.id, ts.institution_id, ts.department_id, ts.class_id, ts.jamaat_id, ts.subject_id, ts.teacher_id,
              ts.day_of_week, ts.is_daily, 0 as period_number, ts.start_time, ts.end_time, ts.room_number as room,
              j.name as jamaat_name, COALESCE(s.name, 'সাধারণ ক্লাস') as subject_name, t.full_name as teacher_name,
              'teacher_schedule' as source
       FROM teacher_schedules ts
       LEFT JOIN jamaat_names j ON j.id = ts.jamaat_id
       LEFT JOIN subjects s ON s.id = ts.subject_id
       JOIN teachers t ON t.id = ts.teacher_id
       WHERE ts.institution_id = ? AND ts.class_id = ? AND ts.status = 'active'
       ORDER BY ${dayOrderSql('ts.day_of_week')}, ts.start_time ASC`
    )
    .all(instId, student.class_id) as any[];

  const seenStudentSlots = new Set<string>();
  const routine: any[] = [];
  for (const r of [...routineRaw, ...classTeacherSchedules]) {
    const key = `${r.day_of_week}|${r.start_time}|${r.end_time}|${r.subject_id || 0}`;
    if (seenStudentSlots.has(key)) continue;
    seenStudentSlots.add(key);
    routine.push(r);
  }
  const dayRank = (d: string) => {
    if (isDailyDayValue(d)) return 0;
    const idx = (BENGALI_WEEKDAYS as readonly string[]).indexOf(d);
    return idx >= 0 ? idx + 1 : 99;
  };
  routine.sort((a, b) => {
    const dr = dayRank(a.day_of_week) - dayRank(b.day_of_week);
    if (dr !== 0) return dr;
    const tCmp = String(a.start_time || '').localeCompare(String(b.start_time || ''));
    if (tCmp !== 0) return tCmp;
    return Number(a.period_number || 0) - Number(b.period_number || 0);
  });

  const teachers = db
    .prepare(
      `SELECT DISTINCT t.id, t.full_name, t.mobile, t.photo_url,
         (SELECT des.name FROM teacher_designations td JOIN designations des ON des.id = td.designation_id WHERE td.teacher_id = t.id ORDER BY td.is_primary DESC LIMIT 1) as primary_designation
       FROM teachers t
       LEFT JOIN teacher_assignments ta ON ta.teacher_id = t.id
       LEFT JOIN routines r ON r.teacher_id = t.id
       WHERE t.institution_id = ? AND t.status = 'active'
         AND (ta.class_id = ? OR r.class_id = ?)`
    )
    .all(instId, student.class_id, student.class_id);

  // ONLY published results appear on Student & Guardian dashboards (Section 14)
  const instRow = db.prepare('SELECT grading_scale_json FROM institutions WHERE id = ?').get(instId) as { grading_scale_json: string };
  const scale = JSON.parse(instRow.grading_scale_json || JSON.stringify(DEFAULT_GRADING_SCALE));

  const publishedExams = db
    .prepare("SELECT * FROM examinations WHERE institution_id = ? AND class_id = ? AND status = 'published' ORDER BY published_at DESC")
    .all(instId, student.class_id) as any[];

  const results = publishedExams.map((exam) => {
    const subjects = db
      .prepare(
        `SELECT es.subject_id, s.name as subject_name, es.full_marks, es.pass_marks, em.obtained_marks, em.grade, em.gpa
         FROM exam_subjects es
         JOIN subjects s ON s.id = es.subject_id
         LEFT JOIN exam_marks em ON em.exam_id = es.exam_id AND em.subject_id = es.subject_id AND em.student_id = ?
         WHERE es.exam_id = ? AND es.included = 1`
      )
      .all(studentId, exam.id) as any[];

    const entered = subjects.filter((s) => s.obtained_marks !== null && s.obtained_marks !== undefined);
    const totalFull = subjects.reduce((a, b) => a + Number(b.full_marks || 0), 0);
    const totalObtained = entered.reduce((a, b) => a + Number(b.obtained_marks || 0), 0);
    const anyFailed = entered.some((s) => Number(s.obtained_marks) < Number(s.pass_marks));
    const avgGpa = entered.length ? Number((entered.reduce((a, b) => a + Number(b.gpa || 0), 0) / entered.length).toFixed(2)) : 0;
    const overall = calculateGrade(totalObtained, totalFull || 100, scale);

    return {
      exam,
      subjects,
      summary: {
        totalSubjects: subjects.length,
        totalFullMarks: totalFull,
        totalObtainedMarks: totalObtained,
        averageMarks: entered.length ? Number((totalObtained / entered.length).toFixed(2)) : 0,
        gpa: anyFailed ? 0 : avgGpa,
        grade: anyFailed ? 'রাসিব (F)' : overall.grade,
        passFail: anyFailed ? 'অকৃতকার্য' : 'কৃতকার্য',
      },
    };
  });

  const payments = db
    .prepare(
      `SELECT fp.*, s.full_name as student_name, s.roll_number, s.student_code, s.photo_url as student_photo,
              d.name as department_name, c.name as class_name, j.name as jamaat_name
       FROM fee_payments fp
       JOIN students s ON s.id = fp.student_id
       LEFT JOIN academic_departments d ON d.id = s.department_id
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN jamaat_names j ON j.id = s.jamaat_id
       WHERE fp.student_id = ? AND fp.institution_id = ?
       ORDER BY fp.created_at DESC`
    )
    .all(studentId, instId) as any[];

  const totalPaid = payments.reduce((a, b) => a + Number(b.amount_paid || 0), 0);
  const totalDue = payments.length > 0 ? Number(payments[0].remaining_due || 0) : 0;

  const notices = db
    .prepare(
      `SELECT id, title, description, publish_date, expiry_date, audience_type, created_by_name, created_at
       FROM notices
       WHERE status = 'published'
         AND (institution_id IS NULL OR institution_id = ?)
         AND (
           audience_type IN ('all', 'students', 'guardians')
           OR (audience_type = 'department' AND audience_target_id = ?)
           OR (audience_type = 'class' AND audience_target_id = ?)
         )
       ORDER BY created_at DESC LIMIT 30`
    )
    .all(instId, String(student.department_id || ''), String(student.class_id || ''));

  const myLeaves = db
    .prepare(
      `SELECT sla.*, d.name as department_name, c.name as class_name, j.name as jamaat_name
       FROM student_leave_applications sla
       LEFT JOIN academic_departments d ON d.id = sla.department_id
       LEFT JOIN classes c ON c.id = sla.class_id
       LEFT JOIN jamaat_names j ON j.id = sla.jamaat_id
       WHERE sla.student_id = ? AND sla.institution_id = ?
       ORDER BY sla.created_at DESC LIMIT 40`
    )
    .all(studentId, instId) as any[];

  const activeLeave =
    myLeaves.find((l) => l.status === 'approved' && l.start_date <= today && l.end_date >= today) || null;

  const notifications = db
    .prepare(
      `SELECT * FROM notifications
       WHERE institution_id = ? AND user_id = ?
       ORDER BY created_at DESC LIMIT 30`
    )
    .all(instId, student.user_id);

  const totalAtt = attSummary?.total || 0;
  const presentAtt = attSummary?.present || 0;

  const bookMap = new Map<number, any>();
  if (student.class_id) {
    const clsBooks = db
      .prepare(
        `SELECT b.id, b.book_code, b.name, b.arabic_name, b.short_name, b.author_name, b.publisher_name, b.cover_image_url
         FROM class_books cb
         JOIN academic_books b ON b.id = cb.book_id
         WHERE cb.class_id = ? AND cb.institution_id = ? AND b.institution_id = ? AND b.status = 'active'
         ORDER BY cb.id ASC`
      )
      .all(student.class_id, instId, instId) as any[];
    clsBooks.forEach((b) => bookMap.set(b.id, b));
  }
  const stJamaatIds = new Set<number>();
  if (student.jamaat_id) stJamaatIds.add(Number(student.jamaat_id));
  if (student.class_id) {
    const cRow = db
      .prepare('SELECT jamaat_id FROM classes WHERE id = ? AND institution_id = ?')
      .get(student.class_id, instId) as { jamaat_id: number | null } | undefined;
    if (cRow?.jamaat_id) stJamaatIds.add(cRow.jamaat_id);
    const cjRows = db
      .prepare('SELECT jamaat_id FROM class_jamaats WHERE class_id = ? AND institution_id = ?')
      .all(student.class_id, instId) as Array<{ jamaat_id: number }>;
    cjRows.forEach((r) => stJamaatIds.add(r.jamaat_id));
  }
  if (stJamaatIds.size > 0) {
    const jIds = Array.from(stJamaatIds);
    const jamBooks = db
      .prepare(
        `SELECT b.id, b.book_code, b.name, b.arabic_name, b.short_name, b.author_name, b.publisher_name, b.cover_image_url
         FROM jamaat_books jb
         JOIN academic_books b ON b.id = jb.book_id
         WHERE jb.jamaat_id IN (${jIds.map(() => '?').join(',')}) AND jb.institution_id = ? AND b.institution_id = ? AND b.status = 'active'
         ORDER BY jb.id ASC`
      )
      .all(...jIds, instId, instId) as any[];
    jamBooks.forEach((b) => {
      if (!bookMap.has(b.id)) bookMap.set(b.id, b);
    });
  }

  return {
    student,
    books: Array.from(bookMap.values()),
    attendance: {
      today: todayAttendance?.status || 'not_marked',
      totalPresent: presentAtt,
      totalAbsent: attSummary?.absent || 0,
      totalLate: attSummary?.late || 0,
      totalLeave: attSummary?.leave_count || 0,
      percentage: totalAtt > 0 ? Number(((presentAtt / totalAtt) * 100).toFixed(1)) : 0,
      history: monthlyAttendance,
    },
    routine,
    teachers,
    results,
    payments,
    feeSummary: {
      feeType: student.fee_type,
      monthlyFee: Number(student.monthly_fee || 0),
      monthlyMealCost: Number(student.monthly_meal_cost || 0),
      totalMonthlyPayable: Number((Number(student.monthly_fee || 0) + Number(student.monthly_meal_cost || 0)).toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      totalDue: Number(totalDue.toFixed(2)),
    },
    notices,
    myLeaves,
    activeLeave,
    notifications,
  };
}

// ==================== STUDENT PORTAL ====================
portalsRouter.get('/student/dashboard', (req, res) => {
  const user = req.authUser!;
  if (user.account_type !== 'student') {
    return res.status(403).json({ error: 'শুধুমাত্র শিক্ষার্থীর জন্য প্রযোজ্য।' });
  }
  const st = db
    .prepare('SELECT id FROM students WHERE user_id = ? AND institution_id = ?')
    .get(user.id, req.institutionId!) as { id: number } | undefined;
  if (!st) return res.status(404).json({ error: 'শিক্ষার্থীর প্রোফাইল পাওয়া যায়নি।' });

  const data = buildStudentPortalPayload(req.institutionId!, st.id);
  res.json(data);
});

portalsRouter.post('/student/leaves', (req, res) => {
  const user = req.authUser!;
  if (user.account_type !== 'student') {
    return res.status(403).json({ error: 'শুধুমাত্র শিক্ষার্থী ছুটির আবেদন জমা দিতে পারবেন।' });
  }
  const instId = req.institutionId!;
  const student = db
    .prepare(
      `SELECT s.id, s.full_name, s.student_code, s.department_id, s.class_id, s.jamaat_id
       FROM students s WHERE s.user_id = ? AND s.institution_id = ?`
    )
    .get(user.id, instId) as any;
  if (!student) return res.status(404).json({ error: 'শিক্ষার্থীর প্রোফাইল পাওয়া যায়নি।' });

  const leave_type = String(req.body?.leave_type || '').trim();
  const start_date = String(req.body?.start_date || '').trim();
  const end_date = String(req.body?.end_date || '').trim();
  const reason = String(req.body?.reason || '').trim();
  const application_body = String(req.body?.application_body || '').trim();
  const attachment = sanitizeAttachment(
    req.body?.attachment_name,
    req.body?.attachment_data ?? req.body?.attachment_url
  );

  if (!leave_type || !start_date || !end_date || !reason || !application_body) {
    return res.status(400).json({ error: 'ছুটির ধরন, তারিখ, কারণ এবং আবেদনপত্রের বিবরণ পূরণ করা আবশ্যক।' });
  }
  const total_days = countInclusiveDays(start_date, end_date);
  if (total_days <= 0) {
    return res.status(400).json({ error: 'শুরুর তারিখ শেষের তারিখের আগে বা সমান হতে হবে।' });
  }

  const now = getDhakaNowISO();
  const info = db
    .prepare(
      `INSERT INTO student_leave_applications
       (institution_id, student_id, department_id, class_id, jamaat_id, leave_type, start_date, end_date, total_days, reason, application_body, attachment_name, attachment_data, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(
      instId,
      student.id,
      student.department_id || null,
      student.class_id || null,
      student.jamaat_id || null,
      leave_type,
      start_date,
      end_date,
      total_days,
      reason,
      application_body,
      attachment.name,
      attachment.data,
      now
    );
  const id = Number(info.lastInsertRowid);

  notifyInstitutionAdmins({
    institutionId: instId,
    type: 'student_leave_submitted',
    title: 'নতুন শিক্ষার্থী ছুটির আবেদন',
    message: `${student.full_name} (${student.student_code}) ${start_date} থেকে ${end_date} (${total_days} দিন) — ${leave_type} ছুটির আবেদন করেছেন।`,
    referenceType: 'student_leave',
    referenceId: id,
  });

  res.status(201).json({ id, total_days, status: 'pending' });
});

// ==================== GUARDIAN PORTAL ====================
portalsRouter.get('/guardian/dashboard', (req, res) => {
  const user = req.authUser!;
  if (user.account_type !== 'guardian') {
    return res.status(403).json({ error: 'শুধুমাত্র অভিভাবকের জন্য প্রযোজ্য।' });
  }
  const guardian = db
    .prepare('SELECT * FROM guardians WHERE user_id = ? AND institution_id = ?')
    .get(user.id, req.institutionId!) as any;
  if (!guardian) return res.status(404).json({ error: 'অভিভাবকের প্রোফাইল পাওয়া যায়নি।' });

  const children = db
    .prepare(
      `SELECT s.id, s.full_name, s.roll_number, s.student_code, s.photo_url, d.name as department_name, c.name as class_name, j.name as jamaat_name
       FROM students s
       LEFT JOIN academic_departments d ON d.id = s.department_id
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN jamaat_names j ON j.id = s.jamaat_id
       WHERE s.guardian_id = ? AND s.institution_id = ?
       ORDER BY s.roll_number ASC`
    )
    .all(guardian.id, req.institutionId!) as any[];

  const hasRequestedId = req.query.student_id !== undefined && String(req.query.student_id).trim() !== '';
  const requestedChildId = hasRequestedId ? Number(req.query.student_id) : children[0]?.id;
  // Strictly verify requested child belongs to this guardian — return explicit 403 if not linked
  const validChild = children.find((c) => c.id === requestedChildId);
  if (hasRequestedId && !validChild) {
    return res.status(403).json({ error: 'আপনি অন্য পরিবারের শিক্ষার্থীর তথ্য দেখতে পারবেন না।' });
  }
  const selectedChild = validChild ? buildStudentPortalPayload(req.institutionId!, validChild.id) : null;

  res.json({ guardian, children, selectedChild });
});

// ==================== TEACHER PORTAL ====================
portalsRouter.get('/teacher/dashboard', (req, res) => {
  const user = req.authUser!;
  if (user.account_type !== 'teacher' && user.account_type !== 'staff') {
    return res.status(403).json({ error: 'শুধুমাত্র শিক্ষক/কর্মচারীর জন্য প্রযোজ্য।' });
  }
  const instId = req.institutionId!;
  const teacher = db
    .prepare(
      `SELECT t.*, u.username, u.status as user_status, d.name as department_name
       FROM teachers t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN academic_departments d ON d.id = t.department_id
       WHERE t.user_id = ? AND t.institution_id = ?`
    )
    .get(user.id, instId) as any;

  if (!teacher) return res.status(404).json({ error: 'শিক্ষক প্রোফাইল পাওয়া যায়নি।' });

  const profile = ensureTeacherProfile(instId, teacher.id);
  const liveStatus = computeTeacherLiveStatus(instId, teacher.id);

  const designations = db
    .prepare(
      `SELECT des.name, des.category, td.is_primary
       FROM teacher_designations td
       JOIN designations des ON des.id = td.designation_id
       WHERE td.teacher_id = ?`
    )
    .all(teacher.id);

  const assignments = db
    .prepare(
      `SELECT ta.*, c.name as class_name, c.department_id, d.name as department_name,
              s.name as subject_name, j.name as jamaat_name
       FROM teacher_assignments ta
       JOIN classes c ON c.id = ta.class_id
       JOIN academic_departments d ON d.id = c.department_id
       LEFT JOIN subjects s ON s.id = ta.subject_id
       LEFT JOIN jamaat_names j ON j.id = ta.jamaat_id
       WHERE ta.teacher_id = ?`
    )
    .all(teacher.id);

  const routine = db
    .prepare(
      `SELECT r.*, d.name as department_name, c.name as class_name, j.name as jamaat_name, s.name as subject_name
       FROM routines r
       JOIN academic_departments d ON d.id = r.department_id
       JOIN classes c ON c.id = r.class_id
       LEFT JOIN jamaat_names j ON j.id = r.jamaat_id
       JOIN subjects s ON s.id = r.subject_id
       WHERE r.institution_id = ? AND r.teacher_id = ?
       ORDER BY ${dayOrderSql('r.day_of_week')}, r.start_time ASC, r.period_number ASC`
    )
    .all(instId, teacher.id);

  const schedules = db
    .prepare(
      `SELECT ts.*, d.name as department_name, c.name as class_name, j.name as jamaat_name, s.name as subject_name
       FROM teacher_schedules ts
       LEFT JOIN academic_departments d ON d.id = ts.department_id
       LEFT JOIN classes c ON c.id = ts.class_id
       LEFT JOIN jamaat_names j ON j.id = ts.jamaat_id
       LEFT JOIN subjects s ON s.id = ts.subject_id
       WHERE ts.institution_id = ? AND ts.teacher_id = ?
       ORDER BY ${dayOrderSql('ts.day_of_week')}, ts.start_time ASC`
    )
    .all(instId, teacher.id);

  const breaks = db
    .prepare(
      `SELECT * FROM teacher_break_schedules
       WHERE institution_id = ? AND teacher_id = ?
       ORDER BY ${dayOrderSql('day_of_week')}, start_time ASC`
    )
    .all(instId, teacher.id);

  const notices = db
    .prepare(
      `SELECT id, title, description, publish_date, audience_type, created_by_name, created_at
       FROM notices
       WHERE status = 'published'
         AND (institution_id IS NULL OR institution_id = ?)
         AND audience_type IN ('all', 'teachers', 'role')
       ORDER BY created_at DESC LIMIT 20`
    )
    .all(instId);

  const myAttendance = db
    .prepare(
      `SELECT attendance_date, status, check_in, check_out, note
       FROM teacher_attendance
       WHERE teacher_id = ? AND institution_id = ?
       ORDER BY attendance_date DESC LIMIT 30`
    )
    .all(teacher.id, instId);

  const myLeaves = db
    .prepare(
      `SELECT * FROM teacher_leave_applications
       WHERE teacher_id = ? AND institution_id = ?
       ORDER BY created_at DESC LIMIT 40`
    )
    .all(teacher.id, instId);

  // Own financial records (always visible to the teacher themselves)
  const salaryTotals = db
    .prepare(
      `SELECT COALESCE(SUM(paid_amount), 0) as total_paid, MAX(payment_date) as last_salary_date
       FROM teacher_salary_records WHERE institution_id = ? AND teacher_id = ?`
    )
    .get(instId, teacher.id) as { total_paid: number; last_salary_date: string | null };

  const advanceTotals = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as total_advance
       FROM teacher_advance_records WHERE institution_id = ? AND teacher_id = ?`
    )
    .get(instId, teacher.id) as { total_advance: number };

  const currentDue = getTeacherCurrentDue(instId, teacher.id);

  const salaryRecords = db
    .prepare(
      `SELECT * FROM teacher_salary_records
       WHERE institution_id = ? AND teacher_id = ?
       ORDER BY salary_month DESC, created_at DESC LIMIT 24`
    )
    .all(instId, teacher.id);

  const receipts = db
    .prepare(
      `SELECT r.*, t.full_name as teacher_name, tp.teacher_code,
              i.name as institution_name, i.logo_url as institution_logo, i.address as institution_address, i.phone as institution_phone
       FROM teacher_salary_receipts r
       JOIN teachers t ON t.id = r.teacher_id
       LEFT JOIN teacher_profiles tp ON tp.teacher_id = r.teacher_id AND tp.institution_id = r.institution_id
       JOIN institutions i ON i.id = r.institution_id
       WHERE r.institution_id = ? AND r.teacher_id = ?
       ORDER BY r.created_at DESC LIMIT 36`
    )
    .all(instId, teacher.id);

  const advances = db
    .prepare(
      `SELECT * FROM teacher_advance_records
       WHERE institution_id = ? AND teacher_id = ?
       ORDER BY withdraw_date DESC, created_at DESC LIMIT 24`
    )
    .all(instId, teacher.id);

  const dueLedger = db
    .prepare(
      `SELECT * FROM teacher_due_ledger
       WHERE institution_id = ? AND teacher_id = ?
       ORDER BY id DESC LIMIT 40`
    )
    .all(instId, teacher.id);

  const notifications = db
    .prepare(
      `SELECT * FROM notifications
       WHERE institution_id = ? AND user_id = ?
       ORDER BY created_at DESC LIMIT 30`
    )
    .all(instId, user.id);

  const scope = getTeacherAssignedScope(instId, user.id);
  let assignedStudents: any[] = [];
  if (scope.classIds.size > 0) {
    const clsIds = Array.from(scope.classIds);
    const placeholders = clsIds.map(() => '?').join(',');
    assignedStudents = db
      .prepare(
        `SELECT s.id, s.full_name, s.roll_number, s.student_code, s.photo_url, s.guardian_name, s.guardian_mobile,
                d.name as department_name, c.name as class_name, j.name as jamaat_name, s.class_id
         FROM students s
         LEFT JOIN academic_departments d ON d.id = s.department_id
         LEFT JOIN classes c ON c.id = s.class_id
         LEFT JOIN jamaat_names j ON j.id = s.jamaat_id
         WHERE s.institution_id = ? AND s.status = 'active' AND s.class_id IN (${placeholders})
         ORDER BY c.display_order ASC, s.roll_number ASC`
      )
      .all(instId, ...clsIds);
  }

  const teacherBooksMap = new Map<number, any>();
  if (scope.classIds.size > 0) {
    const clsIds = Array.from(scope.classIds);
    const tBooks = db
      .prepare(
        `SELECT DISTINCT b.id, b.book_code, b.name, b.arabic_name, b.short_name, b.author_name, b.cover_image_url
         FROM class_books cb
         JOIN academic_books b ON b.id = cb.book_id
         WHERE cb.institution_id = ? AND b.institution_id = ? AND b.status = 'active'
           AND cb.class_id IN (${clsIds.map(() => '?').join(',')})`
      )
      .all(instId, instId, ...clsIds) as any[];
    tBooks.forEach((b) => teacherBooksMap.set(b.id, b));
  }

  res.json({
    teacher: {
      ...teacher,
      teacher_code: profile.teacher_code,
      email: profile.email,
      education: profile.education,
      monthly_salary: Number(profile.monthly_salary || 0),
      monthly_meal_cost: Number(profile.monthly_meal_cost || 0),
      total_monthly_payable: Number((Number(profile.monthly_salary || 0) + Number(profile.monthly_meal_cost || 0)).toFixed(2)),
    },
    profile,
    liveStatus,
    designations,
    assignments,
    routine,
    schedules,
    breaks,
    books: Array.from(teacherBooksMap.values()),
    notices,
    myAttendance,
    myLeaves,
    assignedStudents,
    financial: {
      monthly_salary: Number(profile.monthly_salary || 0),
      monthly_meal_cost: Number(profile.monthly_meal_cost || 0),
      total_monthly_payable: Number((Number(profile.monthly_salary || 0) + Number(profile.monthly_meal_cost || 0)).toFixed(2)),
      total_salary_paid: Number(salaryTotals.total_paid || 0),
      total_advance_withdrawn: Number(advanceTotals.total_advance || 0),
      current_due: currentDue,
      total_financial_obligation: Number((Number(profile.monthly_salary || 0) + Number(profile.monthly_meal_cost || 0) + currentDue).toFixed(2)),
      last_salary_date: salaryTotals.last_salary_date,
      salary_records: salaryRecords,
      receipts,
      advances,
      due_ledger: dueLedger,
    },
    notifications,
  });
});

// Teacher confirms real presence in current scheduled class
portalsRouter.post('/teacher/confirm-class', (req, res) => {
  const user = req.authUser!;
  if (user.account_type !== 'teacher' && user.account_type !== 'staff') {
    return res.status(403).json({ error: 'শুধুমাত্র শিক্ষক/কর্মচারীর জন্য প্রযোজ্য।' });
  }
  const instId = req.institutionId!;
  const teacher = db
    .prepare('SELECT id, full_name FROM teachers WHERE user_id = ? AND institution_id = ?')
    .get(user.id, instId) as { id: number; full_name: string } | undefined;
  if (!teacher) return res.status(404).json({ error: 'শিক্ষক প্রোফাইল পাওয়া যায়নি।' });

  const today = getDhakaDateYMD();
  const now = getDhakaNowISO();
  const nowHM = getDhakaTimeHM();
  const current = computeTeacherLiveStatus(instId, teacher.id);

  if (current.status === 'on_leave') {
    return res.status(400).json({ error: 'আপনি আজ অনুমোদিত ছুটিতে আছেন।' });
  }

  const scheduleId = req.body?.schedule_id ? Number(req.body.schedule_id) : current.current_schedule_id || null;

  db.prepare(
    `INSERT INTO teacher_attendance (institution_id, teacher_id, attendance_date, status, check_in, check_out, marked_by, note, created_at)
     VALUES (?, ?, ?, 'present', ?, '', ?, 'ক্লাস উপস্থিতি নিশ্চিতকরণ', ?)
     ON CONFLICT(institution_id, teacher_id, attendance_date)
     DO UPDATE SET status = 'present', check_in = CASE WHEN check_in = '' THEN excluded.check_in ELSE check_in END`
  ).run(instId, teacher.id, today, nowHM, user.id, now);

  db.prepare(
    `UPDATE teacher_live_status
     SET confirmed_schedule_id = ?, confirmed_at = ?, confirmed_date = ?, verification_state = 'confirmed', updated_at = ?
     WHERE institution_id = ? AND teacher_id = ?`
  ).run(scheduleId, now, today, now, instId, teacher.id);

  const statuses = recomputeInstitutionLiveStatuses(instId, { broadcast: true, forceBroadcast: true });
  const updated = statuses.find((s) => s.teacher_id === teacher.id) || computeTeacherLiveStatus(instId, teacher.id);

  res.json({ success: true, liveStatus: updated });
});

// Teacher submits own leave application (always status = 'pending'; teachers cannot self-approve)
portalsRouter.post('/teacher/leaves', (req, res) => {
  const user = req.authUser!;
  if (user.account_type !== 'teacher' && user.account_type !== 'staff') {
    return res.status(403).json({ error: 'শুধুমাত্র শিক্ষক/কর্মচারী ছুটির আবেদন করতে পারবেন।' });
  }
  const instId = req.institutionId!;
  const teacher = db
    .prepare('SELECT id, full_name FROM teachers WHERE user_id = ? AND institution_id = ?')
    .get(user.id, instId) as { id: number; full_name: string } | undefined;
  if (!teacher) return res.status(404).json({ error: 'শিক্ষক প্রোফাইল পাওয়া যায়নি।' });

  const profile = ensureTeacherProfile(instId, teacher.id);
  const leave_type = String(req.body?.leave_type || '').trim();
  const start_date = String(req.body?.start_date || '').trim();
  const end_date = String(req.body?.end_date || '').trim();
  const reason = String(req.body?.reason || '').trim();
  const application_body = String(req.body?.application_body || '').trim();
  const attachment = sanitizeAttachment(
    req.body?.attachment_name,
    req.body?.attachment_data ?? req.body?.attachment_url
  );

  if (!leave_type || !start_date || !end_date || !reason || !application_body) {
    return res.status(400).json({ error: 'ছুটির ধরন, তারিখ, কারণ এবং আবেদনপত্রের বিবরণ পূরণ করা আবশ্যক।' });
  }
  const total_days = countInclusiveDays(start_date, end_date);
  if (total_days <= 0) {
    return res.status(400).json({ error: 'শুরুর তারিখ শেষের তারিখের আগে বা সমান হতে হবে।' });
  }

  const now = getDhakaNowISO();
  const info = db
    .prepare(
      `INSERT INTO teacher_leave_applications
       (institution_id, teacher_id, leave_type, start_date, end_date, total_days, reason, application_body, attachment_name, attachment_data, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(
      instId,
      teacher.id,
      leave_type,
      start_date,
      end_date,
      total_days,
      reason,
      application_body,
      attachment.name,
      attachment.data,
      now
    );
  const id = Number(info.lastInsertRowid);

  notifyInstitutionAdmins({
    institutionId: instId,
    type: 'teacher_leave_submitted',
    title: 'নতুন শিক্ষক ছুটির আবেদন',
    message: `${teacher.full_name} (${profile.teacher_code}) ${start_date} থেকে ${end_date} (${total_days} দিন) — ${leave_type} ছুটির আবেদন করেছেন।`,
    referenceType: 'teacher_leave',
    referenceId: id,
  });

  res.status(201).json({ id, total_days, status: 'pending' });
});
