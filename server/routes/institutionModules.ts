import { Router } from 'express';
import { sanitizeStoredAttachmentRef } from '../uploadPolicy.ts';
import {
  db,
  FIN_CAT_STUDENT_FEE,
  FIN_CAT_STUDENT_MEAL,
  FIN_CAT_TEACHER_MEAL,
  FIN_CAT_TEACHER_SALARY,
  generateUniqueTxCode,
  getDhakaDateYMD,
  getDhakaNowISO,
} from '../db.ts';
import {
  getClientIp,
  hasPermission,
  recordAuditLog,
  requireAnyPermission,
  requireAuth,
  requireInstitution,
  requireInstitutionStaff,
  requirePermission,
} from '../auth.ts';
import { broadcastNotice } from '../realtime.ts';

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

function normalizeWhatsApp(val: unknown): string {
  const raw = String(val || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d+]/g, '').slice(0, 24);
}

function normalizeHttpUrl(val: unknown): string {
  const raw = String(val || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.slice(0, 400);
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(raw)) return `https://${raw}`.slice(0, 400);
  return '';
}

export const instModulesRouter = Router();
instModulesRouter.use(requireAuth, requireInstitution);

// Allow any authenticated institution member (including students/guardians) to mark a notice as read
instModulesRouter.post('/notices/:id/read', (req, res) => {
  db.prepare('INSERT OR IGNORE INTO notice_reads (notice_id, user_id, read_at) VALUES (?, ?, ?)').run(
    Number(req.params.id),
    req.authUser!.id,
    getDhakaNowISO()
  );
  res.json({ success: true });
});

// Effective Support Settings (Institution WhatsApp/Facebook with automatic fallback to Global Support Settings)
instModulesRouter.get('/support-settings', (req, res) => {
  const instId = req.institutionId!;
  const instRow = db
    .prepare('SELECT * FROM institution_settings WHERE institution_id = ?')
    .get(instId) as any;
  const globalRow = db.prepare('SELECT * FROM support_settings WHERE id = 1').get() as any;

  const instWa = String(instRow?.whatsapp_number || '').trim();
  const instWaEnabled = instRow ? Boolean(instRow.whatsapp_enabled) : true;
  const globalWa = String(globalRow?.whatsapp_number || '').trim();
  const globalWaEnabled = globalRow ? Boolean(globalRow.whatsapp_enabled) : true;

  const instFb = String(instRow?.facebook_url || '').trim();
  const instFbEnabled = instRow ? Boolean(instRow.facebook_enabled) : true;
  const globalFb = String(globalRow?.facebook_url || '').trim();
  const globalFbEnabled = globalRow ? Boolean(globalRow.facebook_enabled) : true;

  const effectiveWhatsapp = instWa && instWaEnabled ? instWa : globalWaEnabled ? globalWa : '';
  const whatsappSource = instWa && instWaEnabled ? 'institution' : effectiveWhatsapp ? 'global' : 'none';
  const effectiveFacebook = instFb && instFbEnabled ? instFb : globalFbEnabled ? globalFb : '';
  const facebookSource = instFb && instFbEnabled ? 'institution' : effectiveFacebook ? 'global' : 'none';

  res.json({
    institution: {
      whatsapp_number: instWa,
      whatsapp_enabled: instWaEnabled,
      facebook_url: instFb,
      facebook_enabled: instFbEnabled,
      support_email: String(instRow?.support_email || '').trim(),
      support_description: String(instRow?.support_description || '').trim(),
      updated_at: instRow?.updated_at || '',
    },
    effective: {
      whatsapp_number: effectiveWhatsapp,
      whatsapp_enabled: Boolean(effectiveWhatsapp),
      whatsapp_source: whatsappSource,
      facebook_url: effectiveFacebook,
      facebook_enabled: Boolean(effectiveFacebook),
      facebook_source: facebookSource,
      support_email: String(instRow?.support_email || globalRow?.support_email || '').trim(),
      support_description: String(instRow?.support_description || globalRow?.support_description || '').trim(),
    },
  });
});

// ==================== INSTITUTION INTERNAL MESSAGING (ISOLATED PER INSTITUTION) ====================
instModulesRouter.get('/messages/recipients', (req, res) => {
  const instId = req.institutionId!;
  const userId = req.authUser!.id;
  const recipients = db
    .prepare(
      `SELECT u.id, u.full_name, u.username, u.account_type, COALESCE(r.name, u.account_type) as role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.institution_id = ? AND u.status = 'active' AND u.id != ?
       ORDER BY
         CASE u.account_type
           WHEN 'institution_admin' THEN 1
           WHEN 'staff' THEN 2
           WHEN 'teacher' THEN 3
           WHEN 'guardian' THEN 4
           ELSE 5
         END, u.full_name ASC
       LIMIT 300`
    )
    .all(instId, userId);
  res.json({ recipients });
});

instModulesRouter.get('/messages', (req, res) => {
  const instId = req.institutionId!;
  const userId = req.authUser!.id;
  const box = String(req.query.box || 'inbox');

  let sql = `
    SELECT * FROM institution_messages
    WHERE institution_id = ?
  `;
  const params: any[] = [instId];
  if (box === 'sent') {
    sql += ' AND sender_user_id = ?';
    params.push(userId);
  } else if (box === 'all' && req.authUser!.account_type === 'institution_admin') {
    // Institution Admin can audit all messages if requested
  } else {
    sql += ' AND recipient_user_id = ?';
    params.push(userId);
  }
  sql += ' ORDER BY created_at DESC LIMIT 200';

  const messages = db.prepare(sql).all(...params);
  const unreadCount = (
    db
      .prepare('SELECT COUNT(*) as c FROM institution_messages WHERE institution_id = ? AND recipient_user_id = ? AND is_read = 0')
      .get(instId, userId) as { c: number }
  ).c;

  res.json({ messages, unreadCount });
});

instModulesRouter.post('/messages', (req, res) => {
  const instId = req.institutionId!;
  const sender = req.authUser!;
  const recipientUserId = Number(req.body?.recipient_user_id);
  const subject = String(req.body?.subject || '').trim().slice(0, 160);
  const body = String(req.body?.body || '').trim().slice(0, 4000);

  if (!recipientUserId || !body) {
    return res.status(400).json({ error: 'প্রাপক এবং বার্তার বিষয়বস্তু আবশ্যক।' });
  }
  if (recipientUserId === sender.id) {
    return res.status(400).json({ error: 'নিজেকে বার্তা পাঠানো যাবে না।' });
  }

  // Strictly verify recipient belongs to the SAME institution
  const recipient = db
    .prepare(
      `SELECT u.id, u.full_name, u.account_type, COALESCE(r.name, u.account_type) as role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND u.institution_id = ? AND u.status = 'active'`
    )
    .get(recipientUserId, instId) as any;

  if (!recipient) {
    return res.status(404).json({ error: 'নির্বাচিত প্রাপক আপনার প্রতিষ্ঠানে পাওয়া যায়নি।' });
  }

  const now = getDhakaNowISO();
  const info = db
    .prepare(
      `INSERT INTO institution_messages (
        institution_id, sender_user_id, sender_name, sender_role,
        recipient_user_id, recipient_name, recipient_role, subject, body, is_read, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    )
    .run(
      instId,
      sender.id,
      sender.full_name,
      sender.role_name || sender.account_type,
      recipient.id,
      recipient.full_name,
      recipient.role_name || recipient.account_type,
      subject || 'নতুন বার্তা',
      body,
      now
    );

  const msgId = Number(info.lastInsertRowid);
  db.prepare(
    `INSERT INTO notifications (institution_id, user_id, type, title, message, reference_type, reference_id, created_at)
     VALUES (?, ?, 'message', ?, ?, 'message', ?, ?)`
  ).run(
    instId,
    recipient.id,
    `নতুন বার্তা: ${subject || 'বার্তা'}`,
    `${sender.full_name} আপনাকে একটি বার্তা পাঠিয়েছেন।`,
    msgId,
    now
  );

  res.status(201).json({
    id: msgId,
    message: db.prepare('SELECT * FROM institution_messages WHERE id = ?').get(msgId),
  });
});

instModulesRouter.patch('/messages/:id/read', (req, res) => {
  const instId = req.institutionId!;
  const msgId = Number(req.params.id);
  const info = db
    .prepare(
      'UPDATE institution_messages SET is_read = 1, read_at = ? WHERE id = ? AND institution_id = ? AND recipient_user_id = ?'
    )
    .run(getDhakaNowISO(), msgId, instId, req.authUser!.id);
  if (info.changes === 0) return res.status(404).json({ error: 'বার্তা পাওয়া যায়নি।' });
  res.json({ success: true });
});

// All remaining institution module endpoints are restricted to institution admin, teachers, and staff
instModulesRouter.use(requireInstitutionStaff);

// ==================== 1. STUDENT FEES, RECEIPTS & FINANCE ACCOUNTING ====================
instModulesRouter.get('/finance/dashboard', requirePermission('finance', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const today = getDhakaDateYMD();
  const monthPrefix = today.slice(0, 7);

  const summary = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
        COALESCE(SUM(CASE WHEN type = 'income' AND tx_date = ? THEN amount ELSE 0 END), 0) as today_income,
        COALESCE(SUM(CASE WHEN type = 'expense' AND tx_date = ? THEN amount ELSE 0 END), 0) as today_expense,
        COALESCE(SUM(CASE WHEN type = 'income' AND substr(tx_date,1,7) = ? THEN amount ELSE 0 END), 0) as monthly_income,
        COALESCE(SUM(CASE WHEN type = 'expense' AND substr(tx_date,1,7) = ? THEN amount ELSE 0 END), 0) as monthly_expense,
        COALESCE(SUM(CASE WHEN type = 'income' AND (source_type = 'student_fee' OR category_name = ?) THEN amount ELSE 0 END), 0) as student_fee_income,
        COALESCE(SUM(CASE WHEN type = 'income' AND (source_type = 'student_meal_cost' OR category_name = ?) THEN amount ELSE 0 END), 0) as student_meal_income,
        COALESCE(SUM(CASE WHEN type = 'expense' AND (source_type = 'teacher_salary' OR category_name = ?) THEN amount ELSE 0 END), 0) as teacher_salary_expense,
        COALESCE(SUM(CASE WHEN type = 'expense' AND (source_type = 'teacher_meal_cost' OR category_name = ?) THEN amount ELSE 0 END), 0) as teacher_meal_expense
       FROM finance_transactions WHERE institution_id = ?`
    )
    .get(
      today,
      today,
      monthPrefix,
      monthPrefix,
      FIN_CAT_STUDENT_FEE,
      FIN_CAT_STUDENT_MEAL,
      FIN_CAT_TEACHER_SALARY,
      FIN_CAT_TEACHER_MEAL,
      instId
    ) as any;

  const recentTransactions = db
    .prepare(
      `SELECT ft.*, fa.name as account_name
       FROM finance_transactions ft
       LEFT JOIN finance_accounts fa ON fa.id = ft.account_id
       WHERE ft.institution_id = ?
       ORDER BY ft.created_at DESC LIMIT 20`
    )
    .all(instId);

  const categories = db
    .prepare('SELECT * FROM finance_categories WHERE institution_id = ? ORDER BY type ASC, id ASC')
    .all(instId);

  const accounts = db
    .prepare(
      `SELECT fa.*,
        fa.opening_balance
        + COALESCE((SELECT SUM(amount) FROM finance_transactions t WHERE t.account_id = fa.id AND t.type = 'income'), 0)
        - COALESCE((SELECT SUM(amount) FROM finance_transactions t WHERE t.account_id = fa.id AND t.type = 'expense'), 0) as current_balance
       FROM finance_accounts fa WHERE fa.institution_id = ? ORDER BY fa.id ASC`
    )
    .all(instId);

  const totalIncome = Number((summary?.total_income || 0).toFixed(2));
  const totalExpense = Number((summary?.total_expense || 0).toFixed(2));

  res.json({
    summary: {
      totalIncome,
      totalExpense,
      currentBalance: Number((totalIncome - totalExpense).toFixed(2)),
      todayIncome: Number((summary?.today_income || 0).toFixed(2)),
      todayExpense: Number((summary?.today_expense || 0).toFixed(2)),
      monthlyIncome: Number((summary?.monthly_income || 0).toFixed(2)),
      monthlyExpense: Number((summary?.monthly_expense || 0).toFixed(2)),
      studentFeeIncome: Number((summary?.student_fee_income || 0).toFixed(2)),
      studentMealIncome: Number((summary?.student_meal_income || 0).toFixed(2)),
      teacherSalaryExpense: Number((summary?.teacher_salary_expense || 0).toFixed(2)),
      teacherMealExpense: Number((summary?.teacher_meal_expense || 0).toFixed(2)),
    },
    recentTransactions,
    categories,
    accounts,
  });
});

// Scoped student picker for Finance module so Finance roles don't need full Students/Academic module permission
instModulesRouter.get('/finance/students', requirePermission('finance', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const rows = (
    db
      .prepare(
        `SELECT s.id, s.full_name, s.roll_number, s.student_code, s.fee_type,
                COALESCE(s.monthly_fee, 0) as monthly_fee,
                COALESCE(s.monthly_meal_cost, 0) as monthly_meal_cost,
                s.status,
                d.name as department_name, c.name as class_name, j.name as jamaat_name,
                (SELECT COALESCE(fp.remaining_due, 0) FROM fee_payments fp WHERE fp.student_id = s.id ORDER BY fp.id DESC LIMIT 1) as last_due,
                (SELECT COALESCE(SUM(fp.amount_paid), 0) FROM fee_payments fp WHERE fp.student_id = s.id) as total_paid
         FROM students s
         LEFT JOIN academic_departments d ON d.id = s.department_id
         LEFT JOIN classes c ON c.id = s.class_id
         LEFT JOIN jamaat_names j ON j.id = s.jamaat_id
         WHERE s.institution_id = ? AND s.status = 'active'
         ORDER BY s.roll_number ASC`
      )
      .all(instId) as any[]
  ).map((st) => ({
    ...st,
    monthly_fee: Number(st.monthly_fee || 0),
    monthly_meal_cost: Number(st.monthly_meal_cost || 0),
    total_monthly_payable: Number((Number(st.monthly_fee || 0) + Number(st.monthly_meal_cost || 0)).toFixed(2)),
    last_due: Number(st.last_due || 0),
    total_paid: Number(st.total_paid || 0),
  }));
  res.json({ students: rows });
});

// Monthly & Yearly Financial Breakdown Report (Strictly separated Monthly Fee/Salary vs Meal Cost)
instModulesRouter.get('/finance/reports', requirePermission('finance', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const period = req.query.period === 'yearly' ? 'yearly' : 'monthly';
  const today = getDhakaDateYMD();
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month) : today.slice(0, 7);
  const year = /^\d{4}$/.test(String(req.query.year || '')) ? String(req.query.year) : today.slice(0, 4);

  const dateFilterPrefix = period === 'yearly' ? `${year}-` : `${month}`;
  const fpPeriodClause =
    period === 'yearly'
      ? `(substr(fp.payment_date, 1, 4) = ? OR substr(fp.payment_month, 1, 4) = ?)`
      : `(substr(fp.payment_date, 1, 7) = ? OR fp.payment_month = ?)`;
  const fpParams = period === 'yearly' ? [instId, year, year] : [instId, month, month];

  const stuAgg = db
    .prepare(
      `SELECT COUNT(*) as payment_count,
              COALESCE(SUM(fp.monthly_payable), 0) as monthly_fee_billed,
              COALESCE(SUM(fp.meal_cost), 0) as meal_cost_billed,
              COALESCE(SUM(fp.other_fee), 0) as other_fee,
              COALESCE(SUM(fp.discount), 0) as discount,
              COALESCE(SUM(fp.total_payable), 0) as total_payable,
              COALESCE(SUM(fp.amount_paid), 0) as total_collected,
              COALESCE(SUM(fp.fee_paid_part), 0) as fee_collected,
              COALESCE(SUM(fp.meal_paid_part), 0) as meal_collected
       FROM fee_payments fp
       WHERE fp.institution_id = ? AND ${fpPeriodClause}`
    )
    .get(...fpParams) as any;

  // Compute current student due accurately (sum of latest remaining_due per student for payments in period)
  const stuDueRow = db
    .prepare(
      `SELECT COALESCE(SUM(latest_due), 0) as total_due
       FROM (
         SELECT fp.student_id,
                (SELECT fp2.remaining_due FROM fee_payments fp2
                 WHERE fp2.institution_id = ? AND fp2.student_id = fp.student_id
                   AND ${period === 'yearly' ? '(substr(fp2.payment_date, 1, 4) = ? OR substr(fp2.payment_month, 1, 4) = ?)' : '(substr(fp2.payment_date, 1, 7) = ? OR fp2.payment_month = ?)'}
                 ORDER BY fp2.id DESC LIMIT 1) as latest_due
         FROM fee_payments fp
         WHERE fp.institution_id = ? AND ${fpPeriodClause}
         GROUP BY fp.student_id
       )`
    )
    .get(...fpParams, ...fpParams) as { total_due: number };

  const salPeriodClause =
    period === 'yearly'
      ? `(substr(sr.salary_month, 1, 4) = ? OR substr(sr.payment_date, 1, 4) = ?)`
      : `(sr.salary_month = ? OR substr(sr.payment_date, 1, 7) = ?)`;
  const salParams = period === 'yearly' ? [instId, year, year] : [instId, month, month];

  const tchAgg = db
    .prepare(
      `SELECT COUNT(*) as payment_count,
              COALESCE(SUM(sr.base_salary), 0) as base_salary_billed,
              COALESCE(SUM(sr.meal_cost), 0) as meal_cost_billed,
              COALESCE(SUM(sr.bonus), 0) as total_bonus,
              COALESCE(SUM(sr.deduction), 0) as total_deduction,
              COALESCE(SUM(sr.due_adjusted), 0) as total_due_adjusted,
              COALESCE(SUM(sr.paid_amount), 0) as total_paid,
              COALESCE(SUM(sr.salary_paid_part), 0) as salary_paid,
              COALESCE(SUM(sr.meal_paid_part), 0) as meal_paid
       FROM teacher_salary_records sr
       WHERE sr.institution_id = ? AND ${salPeriodClause}`
    )
    .get(...salParams) as any;

  const tchSalaryDueRow = db
    .prepare(
      `SELECT COALESCE(SUM(latest_rem), 0) as total_salary_due
       FROM (
         SELECT sr.teacher_id, sr.salary_month,
                (SELECT sr2.remaining_due FROM teacher_salary_records sr2
                 WHERE sr2.institution_id = ? AND sr2.teacher_id = sr.teacher_id AND sr2.salary_month = sr.salary_month
                 ORDER BY sr2.id DESC LIMIT 1) as latest_rem
         FROM teacher_salary_records sr
         WHERE sr.institution_id = ? AND ${salPeriodClause}
         GROUP BY sr.teacher_id, sr.salary_month
       )`
    )
    .get(instId, ...salParams) as { total_salary_due: number };

  const txPeriodClause = period === 'yearly' ? 'substr(tx_date, 1, 4) = ?' : 'substr(tx_date, 1, 7) = ?';
  const txParam = period === 'yearly' ? year : month;
  const txAgg = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
              COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
       FROM finance_transactions
       WHERE institution_id = ? AND ${txPeriodClause}`
    )
    .get(instId, txParam) as { total_income: number; total_expense: number };

  // Monthly trend breakdown (12 months for yearly, or single month detail)
  const monthlyBreakdown: Array<any> = [];
  if (period === 'yearly') {
    for (let m = 1; m <= 12; m++) {
      const ym = `${year}-${String(m).padStart(2, '0')}`;
      const sRow = db
        .prepare(
          `SELECT COALESCE(SUM(fee_paid_part), 0) as fee_collected,
                  COALESCE(SUM(meal_paid_part), 0) as meal_collected,
                  COALESCE(SUM(amount_paid), 0) as total_collected
           FROM fee_payments
           WHERE institution_id = ? AND (payment_month = ? OR (payment_month = '' AND substr(payment_date, 1, 7) = ?))`
        )
        .get(instId, ym, ym) as any;
      const tRow = db
        .prepare(
          `SELECT COALESCE(SUM(salary_paid_part), 0) as salary_paid,
                  COALESCE(SUM(meal_paid_part), 0) as meal_paid,
                  COALESCE(SUM(paid_amount), 0) as total_paid
           FROM teacher_salary_records
           WHERE institution_id = ? AND salary_month = ?`
        )
        .get(instId, ym) as any;
      monthlyBreakdown.push({
        month: ym,
        student_fee_collected: Number((sRow?.fee_collected || 0).toFixed(2)),
        student_meal_collected: Number((sRow?.meal_collected || 0).toFixed(2)),
        student_total_collected: Number((sRow?.total_collected || 0).toFixed(2)),
        teacher_salary_paid: Number((tRow?.salary_paid || 0).toFixed(2)),
        teacher_meal_paid: Number((tRow?.meal_paid || 0).toFixed(2)),
        teacher_total_paid: Number((tRow?.total_paid || 0).toFixed(2)),
      });
    }
  }

  const studentFeeCollected = Number((stuAgg?.fee_collected || 0).toFixed(2));
  const studentMealCollected = Number((stuAgg?.meal_collected || 0).toFixed(2));
  const studentTotalCollected = Number((stuAgg?.total_collected || 0).toFixed(2));
  const studentTotalDue = Number((stuDueRow?.total_due || 0).toFixed(2));

  const teacherSalaryPaid = Number((tchAgg?.salary_paid || 0).toFixed(2));
  const teacherMealPaid = Number((tchAgg?.meal_paid || 0).toFixed(2));
  const teacherTotalPaid = Number((tchAgg?.total_paid || 0).toFixed(2));
  const teacherSalaryDue = Number((tchSalaryDueRow?.total_salary_due || 0).toFixed(2));

  res.json({
    period,
    month,
    year,
    label: period === 'yearly' ? `${year} (বার্ষিক)` : `${month} (মাসিক)`,
    dateFilterPrefix,
    summary: {
      total_fee_collected: studentFeeCollected,
      total_student_meal_collected: studentMealCollected,
      total_collected: studentTotalCollected,
      total_teacher_salary_paid: teacherSalaryPaid,
      total_teacher_meal_paid: teacherMealPaid,
      total_paid_out: teacherTotalPaid,
      total_meal_cost_combined: Number((studentMealCollected + teacherMealPaid).toFixed(2)),
      total_student_due: studentTotalDue,
      total_teacher_due: teacherSalaryDue,
      total_due: Number((studentTotalDue + teacherSalaryDue).toFixed(2)),
      all_income: Number((txAgg?.total_income || 0).toFixed(2)),
      all_expense: Number((txAgg?.total_expense || 0).toFixed(2)),
      net_balance: Number(((txAgg?.total_income || 0) - (txAgg?.total_expense || 0)).toFixed(2)),
    },
    students: {
      payment_count: Number(stuAgg?.payment_count || 0),
      monthly_fee_billed: Number((stuAgg?.monthly_fee_billed || 0).toFixed(2)),
      meal_cost_billed: Number((stuAgg?.meal_cost_billed || 0).toFixed(2)),
      other_fee: Number((stuAgg?.other_fee || 0).toFixed(2)),
      discount: Number((stuAgg?.discount || 0).toFixed(2)),
      total_payable: Number((stuAgg?.total_payable || 0).toFixed(2)),
      fee_collected: studentFeeCollected,
      meal_collected: studentMealCollected,
      total_collected: studentTotalCollected,
      total_due: studentTotalDue,
    },
    teachers: {
      payment_count: Number(tchAgg?.payment_count || 0),
      base_salary_billed: Number((tchAgg?.base_salary_billed || 0).toFixed(2)),
      meal_cost_billed: Number((tchAgg?.meal_cost_billed || 0).toFixed(2)),
      total_bonus: Number((tchAgg?.total_bonus || 0).toFixed(2)),
      total_deduction: Number((tchAgg?.total_deduction || 0).toFixed(2)),
      total_due_adjusted: Number((tchAgg?.total_due_adjusted || 0).toFixed(2)),
      salary_paid: teacherSalaryPaid,
      meal_paid: teacherMealPaid,
      total_paid: teacherTotalPaid,
      total_salary_due: teacherSalaryDue,
    },
    monthlyBreakdown,
  });
});

instModulesRouter.get('/finance/transactions', requirePermission('finance', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const type = String(req.query.type || '');
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');

  let sql = `
    SELECT ft.*, fa.name as account_name
    FROM finance_transactions ft
    LEFT JOIN finance_accounts fa ON fa.id = ft.account_id
    WHERE ft.institution_id = ?
  `;
  const params: any[] = [instId];
  if (type === 'income' || type === 'expense') {
    sql += ' AND ft.type = ?';
    params.push(type);
  }
  if (from) {
    sql += ' AND ft.tx_date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND ft.tx_date <= ?';
    params.push(to);
  }
  sql += ' ORDER BY ft.tx_date DESC, ft.id DESC LIMIT 300';
  res.json({ transactions: db.prepare(sql).all(...params) });
});

instModulesRouter.post('/finance/transactions', requirePermission('finance', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const type = req.body?.type === 'expense' ? 'expense' : 'income';
  const tx_date = String(req.body?.tx_date || getDhakaDateYMD()).trim();
  const category_id = req.body?.category_id ? Number(req.body.category_id) : null;
  let category_name = String(req.body?.category_name || '').trim();
  const account_id = req.body?.account_id ? Number(req.body.account_id) : null;
  const description = String(req.body?.description || '').trim();
  const amount = Number(Number(req.body?.amount || 0).toFixed(2));
  const payment_method = String(req.body?.payment_method || 'নগদ').trim();
  const handled_by = String(req.body?.handled_by || req.authUser!.full_name).trim();
  const reference = String(req.body?.reference || '').trim();
  const note = String(req.body?.note || '').trim();

  if (!description || amount <= 0) {
    return res.status(400).json({ error: 'বিবরণ এবং শূন্যের চেয়ে বড় টাকার পরিমাণ আবশ্যক।' });
  }
  if (category_id && !category_name) {
    const cat = db.prepare('SELECT name FROM finance_categories WHERE id = ? AND institution_id = ?').get(category_id, instId) as { name: string } | undefined;
    category_name = cat?.name || (type === 'income' ? 'অন্যান্য আয়' : 'অন্যান্য ব্যয়');
  }
  if (!category_name) category_name = type === 'income' ? 'অন্যান্য আয়' : 'অন্যান্য ব্যয়';

  const txCode = generateUniqueTxCode(instId, 'TXN');
  const now = getDhakaNowISO();
  const info = db
    .prepare(
      `INSERT INTO finance_transactions (institution_id, tx_code, tx_date, type, category_id, category_name, account_id, description, amount, payment_method, handled_by, reference, note, source_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`
    )
    .run(instId, txCode, tx_date, type, category_id, category_name, account_id, description, amount, payment_method, handled_by, reference, note, now);

  const txId = Number(info.lastInsertRowid);
  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    actorRole: req.authUser!.role_name,
    action: type === 'income' ? 'RECORD_INCOME' : 'RECORD_EXPENSE',
    module: 'finance',
    categoryCode: 'finance',
    targetType: 'finance_transaction',
    targetId: txId,
    targetLabel: `${txCode} · ${description} (৳${amount})`,
    description: `${type === 'income' ? 'আয়' : 'ব্যয়'} এন্ট্রি (${txCode}): ${description} — ৳${amount}`,
    institutionId: instId,
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ transaction: db.prepare('SELECT * FROM finance_transactions WHERE id = ?').get(txId) });
});

// Authorized Reversal / Adjustment (preserves immutable financial history — never silently deletes!)
instModulesRouter.post(
  '/finance/transactions/:id/reverse',
  requireAnyPermission([
    ['finance', 'edit'],
    ['finance', 'manage'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const txId = Number(req.params.id);
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    if (!reason) {
      return res.status(400).json({ error: 'সংশোধন বা রিভার্সালের সুস্পষ্ট কারণ উল্লেখ করা আবশ্যক।' });
    }

    const original = db
      .prepare('SELECT * FROM finance_transactions WHERE id = ? AND institution_id = ?')
      .get(txId, instId) as any;
    if (!original) {
      return res.status(404).json({ error: 'লেনদেন পাওয়া যায়নি।' });
    }
    if (original.is_reversed) {
      return res.status(409).json({ error: 'এই লেনদেনটি ইতিমধ্যেই রিভার্স/সমন্বয় করা হয়েছে।' });
    }
    if (original.source_type === 'reversal' || original.reversal_of_id) {
      return res.status(400).json({ error: 'একটি রিভার্সাল এন্ট্রি পুনরায় রিভার্স করা যাবে না।' });
    }

    const counterType = original.type === 'income' ? 'expense' : 'income';
    const counterCatName =
      counterType === 'expense' ? 'আয় সংশোধন / রিভার্সাল' : 'ব্যয় সংশোধন / রিভার্সাল';
    const now = getDhakaNowISO();
    const today = getDhakaDateYMD();

    const runReverse = db.transaction(() => {
      const catId = findOrCreateFinanceCategory(instId, counterCatName, counterType);
      const revTxCode = generateUniqueTxCode(instId, 'REV');
      const revInfo = db
        .prepare(
          `INSERT INTO finance_transactions (
            institution_id, tx_code, tx_date, type, category_id, category_name, account_id,
            description, amount, payment_method, handled_by, reference, note, source_type, source_id, reversal_of_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reversal', ?, ?, ?)`
        )
        .run(
          instId,
          revTxCode,
          today,
          counterType,
          catId,
          counterCatName,
          original.account_id || null,
          `রিভার্সাল (${original.tx_code || `#${original.id}`}): ${original.description}`,
          Number(original.amount),
          original.payment_method,
          req.authUser!.full_name,
          original.tx_code || original.reference || `TX-${original.id}`,
          `কারণ: ${reason}`,
          original.id,
          original.id,
          now
        );

      db.prepare(
        `UPDATE finance_transactions
         SET is_reversed = 1, reversed_by_name = ?, reversed_at = ?, reversal_reason = ?
         WHERE id = ? AND institution_id = ?`
      ).run(req.authUser!.full_name, now, reason, original.id, instId);

      return db.prepare('SELECT * FROM finance_transactions WHERE id = ?').get(Number(revInfo.lastInsertRowid)) as any;
    });

    const reversalTx = runReverse();
    recordAuditLog({
      actorUserId: req.authUser!.id,
      actorName: req.authUser!.full_name,
      actorRole: req.authUser!.role_name,
      action: 'REVERSE_FINANCE_TRANSACTION',
      module: 'finance',
      categoryCode: 'finance',
      targetType: 'finance_transaction',
      targetId: original.id,
      targetLabel: `${original.tx_code || `#${original.id}`} -> ${reversalTx.tx_code}`,
      description: `লেনদেন ${original.tx_code || `#${original.id}`} (৳${original.amount}) রিভার্স/সমন্বয় করা হয়েছে। কারণ: ${reason}`,
      institutionId: instId,
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      success: true,
      original_id: original.id,
      reversal_transaction: reversalTx,
    });
  }
);

instModulesRouter.post('/finance/categories', requirePermission('finance', 'manage'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  const type = req.body?.type === 'expense' ? 'expense' : 'income';
  if (!name) return res.status(400).json({ error: 'ক্যাটাগরির নাম আবশ্যক।' });
  const info = db
    .prepare('INSERT INTO finance_categories (institution_id, name, type, is_system, created_at) VALUES (?, ?, ?, 0, ?)')
    .run(req.institutionId!, name, type, getDhakaNowISO());
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

instModulesRouter.post('/finance/accounts', requirePermission('finance', 'manage'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  const account_type = String(req.body?.account_type || 'নগদ').trim();
  const opening_balance = Number(Number(req.body?.opening_balance || 0).toFixed(2));
  if (!name) return res.status(400).json({ error: 'হিসাবের নাম আবশ্যক।' });
  const info = db
    .prepare('INSERT INTO finance_accounts (institution_id, name, account_type, opening_balance, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(req.institutionId!, name, account_type, opening_balance, getDhakaNowISO());
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

// Student Month Status (auto-fills Monthly Payable, Meal Cost, Previous Due, Partial Payment, Duplicate Check)
instModulesRouter.get('/fees/month-status', requirePermission('finance', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const studentId = Number(req.query.student_id);
  const month = String(req.query.month || getDhakaDateYMD().slice(0, 7)).trim();

  const student = db
    .prepare(
      `SELECT s.id, s.full_name, s.roll_number, s.student_code, s.fee_type,
              COALESCE(s.monthly_fee, 0) as monthly_fee,
              COALESCE(s.monthly_meal_cost, 0) as monthly_meal_cost,
              d.name as department_name, c.name as class_name, j.name as jamaat_name
       FROM students s
       LEFT JOIN academic_departments d ON d.id = s.department_id
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN jamaat_names j ON j.id = s.jamaat_id
       WHERE s.id = ? AND s.institution_id = ?`
    )
    .get(studentId, instId) as any;

  if (!student) return res.status(404).json({ error: 'শিক্ষার্থী পাওয়া যায়নি।' });

  const priorMonthRows = db
    .prepare(
      `SELECT id, monthly_payable, meal_cost, other_fee, discount, total_payable, amount_paid, remaining_due, fee_paid_part, meal_paid_part
       FROM fee_payments
       WHERE institution_id = ? AND student_id = ? AND payment_month = ? AND payment_type = 'regular'
       ORDER BY id ASC`
    )
    .all(instId, studentId, month) as any[];

  const latestAny = db
    .prepare(
      `SELECT remaining_due, payment_month FROM fee_payments
       WHERE institution_id = ? AND student_id = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(instId, studentId) as { remaining_due: number; payment_month: string } | undefined;

  const priorCount = priorMonthRows.length;
  const alreadyPaidForMonth = Number(
    priorMonthRows.reduce((s, r) => s + Number(r.amount_paid || 0), 0).toFixed(2)
  );
  const alreadyFeePaid = Number(
    priorMonthRows.reduce((s, r) => s + Number(r.fee_paid_part || 0), 0).toFixed(2)
  );
  const alreadyMealPaid = Number(
    priorMonthRows.reduce((s, r) => s + Number(r.meal_paid_part || 0), 0).toFixed(2)
  );
  const latestMonthRemaining = priorCount > 0 ? Number(priorMonthRows[priorCount - 1].remaining_due || 0) : 0;
  const isFullyPaid = priorCount > 0 && latestMonthRemaining <= 0;

  const previousDue =
    priorCount > 0
      ? latestMonthRemaining
      : Number(Number(latestAny?.remaining_due || 0).toFixed(2));

  const monthlyFee = Number(student.monthly_fee || 0);
  const monthlyMealCost = Number(student.monthly_meal_cost || 0);

  const isPartialInstallment = priorCount > 0 && !isFullyPaid;

  res.json({
    student_id: student.id,
    student_name: student.full_name,
    student_code: student.student_code,
    roll_number: student.roll_number,
    department_name: student.department_name || '',
    class_name: student.class_name || '',
    jamaat_name: student.jamaat_name || '',
    fee_type: student.fee_type,
    student: {
      id: student.id,
      full_name: student.full_name,
      fee_type: student.fee_type,
      monthly_fee: monthlyFee,
      monthly_meal_cost: monthlyMealCost,
    },
    payment_month: month,
    monthly_fee: monthlyFee,
    monthly_payable: monthlyFee,
    monthly_meal_cost: monthlyMealCost,
    meal_cost: monthlyMealCost,
    total_monthly_payable: Number((monthlyFee + monthlyMealCost).toFixed(2)),
    previous_due: previousDue,
    prior_count: priorCount,
    already_paid_for_month: alreadyPaidForMonth,
    already_paid_this_month: alreadyPaidForMonth,
    already_fee_paid: alreadyFeePaid,
    already_meal_paid: alreadyMealPaid,
    remaining_for_month: priorCount > 0 ? latestMonthRemaining : Number((monthlyFee + monthlyMealCost + previousDue).toFixed(2)),
    is_partial_installment: isPartialInstallment,
    is_fully_paid: isFullyPaid,
  });
});

// Student Fees & Atomic Payment -> Receipt -> Split Finance Income Transactions (Section 16 + Separate Meal Cost)
instModulesRouter.get('/fees/payments', requirePermission('finance', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const studentId = req.query.student_id ? Number(req.query.student_id) : null;
  const paymentType = String(req.query.payment_type || '');
  const paymentMonth = String(req.query.month || '').trim();
  let sql = `
    SELECT fp.*, s.full_name as student_name, s.roll_number, s.student_code, s.photo_url as student_photo,
           d.name as department_name, c.name as class_name, j.name as jamaat_name
    FROM fee_payments fp
    JOIN students s ON s.id = fp.student_id
    LEFT JOIN academic_departments d ON d.id = s.department_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN jamaat_names j ON j.id = s.jamaat_id
    WHERE fp.institution_id = ?
  `;
  const params: any[] = [instId];
  if (studentId) {
    sql += ' AND fp.student_id = ?';
    params.push(studentId);
  }
  if (paymentType && paymentType !== 'all') {
    sql += ' AND fp.payment_type = ?';
    params.push(paymentType);
  }
  if (paymentMonth && paymentMonth !== 'all') {
    sql += ' AND fp.payment_month = ?';
    params.push(paymentMonth);
  }
  sql += ' ORDER BY fp.created_at DESC LIMIT 300';
  res.json({ payments: db.prepare(sql).all(...params) });
});

instModulesRouter.post('/fees/payments', requirePermission('finance', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const student_id = Number(req.body?.student_id);
  const payment_type = ['one_time', 'regular', 'free'].includes(req.body?.payment_type) ? req.body.payment_type : 'regular';
  const fee_category = String(req.body?.fee_category || 'মাসিক বেতন ও খাবার').trim();
  const rawMonth = String(req.body?.payment_month || '').trim();
  const payment_month = /^\d{4}-\d{2}$/.test(rawMonth)
    ? rawMonth
    : payment_type === 'regular'
    ? getDhakaDateYMD().slice(0, 7)
    : '';
  const payment_period = String(req.body?.payment_period || payment_month || '').trim();
  const payment_date = String(req.body?.payment_date || getDhakaDateYMD()).trim();
  const payment_method = String(req.body?.payment_method || 'নগদ').trim();
  const account_id = req.body?.account_id ? Number(req.body.account_id) : null;
  const note = String(req.body?.note || '').trim();

  const student = db
    .prepare(
      `SELECT s.*, d.name as department_name, c.name as class_name, j.name as jamaat_name
       FROM students s
       LEFT JOIN academic_departments d ON d.id = s.department_id
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN jamaat_names j ON j.id = s.jamaat_id
       WHERE s.id = ? AND s.institution_id = ?`
    )
    .get(student_id, instId) as any;

  if (!student) return res.status(404).json({ error: 'শিক্ষার্থী পাওয়া যায়নি।' });

  const other_fee = Number(Math.max(0, Number(req.body?.other_fee || 0)).toFixed(2));
  const discount = Number(Math.max(0, Number(req.body?.discount || 0)).toFixed(2));
  const rawPaid = Number(Math.max(0, Number(req.body?.amount_paid || 0)).toFixed(2));

  // Check prior regular payments for this exact month (duplicate prevention + partial payment reconciliation)
  const priorMonthRows =
    payment_type === 'regular' && payment_month
      ? (db
          .prepare(
            `SELECT id, monthly_payable, meal_cost, other_fee, discount, total_payable, amount_paid, remaining_due, fee_paid_part, meal_paid_part
             FROM fee_payments
             WHERE institution_id = ? AND student_id = ? AND payment_month = ? AND payment_type = 'regular'
             ORDER BY id ASC`
          )
          .all(instId, student_id, payment_month) as any[])
      : [];

  const isPartialInstallmentForSameMonth = priorMonthRows.length > 0;
  let monthly_payable = 0;
  let meal_cost = 0;
  let previous_due = 0;
  let total_payable = 0;
  let amount_paid = rawPaid;
  let remaining_due = 0;
  let mealShareRemaining = 0;

  if (isPartialInstallmentForSameMonth) {
    const latestForMonth = priorMonthRows[priorMonthRows.length - 1];
    const latestRem = Number(latestForMonth.remaining_due || 0);
    if (latestRem <= 0) {
      return res.status(409).json({
        error: `${student.full_name}-এর ${payment_month} মাসের সম্পূর্ণ পেমেন্ট ইতিমধ্যেই পরিশোধ করা হয়েছে। একই মাসে ডুপ্লিকেট পেমেন্ট অনুমোদিত নয়।`,
        duplicate: true,
      });
    }
    if (amount_paid <= 0) {
      return res.status(400).json({ error: 'আংশিক বকেয়া পরিশোধের পরিমাণ শূন্যের চেয়ে বেশি হতে হবে।' });
    }
    // Partial installment settles the remaining due for this month without double-charging monthly_payable/meal_cost
    previous_due = latestRem;
    monthly_payable = 0;
    meal_cost = 0;
    total_payable = Number(Math.max(0, previous_due + other_fee - discount).toFixed(2));
    if (amount_paid > total_payable + 0.01) {
      return res.status(409).json({
        error: `এই মাসের অবশিষ্ট বকেয়া ৳${total_payable}। এর বেশি টাকা গ্রহণ করা যাবে না।`,
        remaining_due: total_payable,
      });
    }
    remaining_due = Number(Math.max(0, total_payable - amount_paid).toFixed(2));
    const origMealBilled = Number(priorMonthRows.reduce((s, r) => s + Number(r.meal_cost || 0), 0).toFixed(2));
    const priorMealPaid = Number(priorMonthRows.reduce((s, r) => s + Number(r.meal_paid_part || 0), 0).toFixed(2));
    mealShareRemaining = Number(Math.max(0, origMealBilled - priorMealPaid).toFixed(2));
  } else {
    // First payment for this month (or one_time / free)
    const hasMonthlyInput = req.body?.monthly_payable !== undefined && req.body?.monthly_payable !== '';
    const hasMealInput = req.body?.meal_cost !== undefined && req.body?.meal_cost !== '';
    monthly_payable = hasMonthlyInput
      ? Number(Math.max(0, Number(req.body.monthly_payable || 0)).toFixed(2))
      : payment_type === 'one_time'
      ? 0
      : Number(student.monthly_fee || 0);
    meal_cost = hasMealInput
      ? Number(Math.max(0, Number(req.body.meal_cost || 0)).toFixed(2))
      : payment_type === 'one_time'
      ? 0
      : Number(student.monthly_meal_cost || 0);

    const latestPrior = db
      .prepare('SELECT remaining_due FROM fee_payments WHERE institution_id = ? AND student_id = ? ORDER BY id DESC LIMIT 1')
      .get(instId, student_id) as { remaining_due: number } | undefined;

    previous_due =
      req.body?.previous_due !== undefined && req.body?.previous_due !== ''
        ? Number(Math.max(0, Number(req.body.previous_due || 0)).toFixed(2))
        : Number(Number(latestPrior?.remaining_due || 0).toFixed(2));

    // Legacy backwards-compatibility if caller only submitted amount_paid without monthly_payable/meal_cost
    if (payment_type !== 'free' && monthly_payable === 0 && meal_cost === 0 && other_fee === 0 && previous_due === 0 && amount_paid > 0) {
      monthly_payable = amount_paid;
    }

    if (payment_type === 'free') {
      // Free students can have ৳0 or approved subsidized fee/meal; if paid === 0, zero fake income & zero due
      total_payable = Number(Math.max(0, monthly_payable + meal_cost + other_fee + previous_due - discount).toFixed(2));
      if (amount_paid === 0) {
        remaining_due = 0;
      } else {
        remaining_due = Number(Math.max(0, total_payable - amount_paid).toFixed(2));
      }
    } else {
      if (amount_paid <= 0) {
        return res.status(400).json({ error: 'পরিশোধিত টাকার পরিমাণ শূন্যের চেয়ে বেশি হতে হবে (অথবা ফ্রী নির্বাচন করুন)।' });
      }
      total_payable = Number(Math.max(0, monthly_payable + meal_cost + other_fee + previous_due - discount).toFixed(2));
      if (total_payable > 0 && amount_paid > total_payable + 0.01) {
        return res.status(400).json({
          error: `পরিশোধিত টাকা (৳${amount_paid}) মোট প্রদেয় (৳${total_payable}) এর চেয়ে বেশি হতে পারে না।`,
        });
      }
      remaining_due = Number(Math.max(0, total_payable - amount_paid).toFixed(2));
    }
    mealShareRemaining = meal_cost;
  }

  // Strictly separate actual collected amount into Monthly Fee/Tuition vs Meal Cost
  let feePaidPart = 0;
  let mealPaidPart = 0;
  if (amount_paid > 0) {
    const feeShare = Number(Math.max(0, total_payable - mealShareRemaining).toFixed(2));
    if (mealShareRemaining <= 0) {
      mealPaidPart = 0;
      feePaidPart = amount_paid;
    } else if (feeShare <= 0) {
      mealPaidPart = amount_paid;
      feePaidPart = 0;
    } else {
      const ratio = mealShareRemaining / (feeShare + mealShareRemaining);
      mealPaidPart = Number(Math.min(mealShareRemaining, Number((amount_paid * ratio).toFixed(2))).toFixed(2));
      feePaidPart = Number((amount_paid - mealPaidPart).toFixed(2));
    }
  }

  const now = getDhakaNowISO();

  // Atomic Transaction: Payment Record -> Unique Receipt -> Split Finance Income (only when amount_paid > 0!)
  const recordPaymentTx = db.transaction(() => {
    db.prepare('UPDATE institutions SET receipt_counter = receipt_counter + 1 WHERE id = ?').run(instId);
    const { receipt_counter } = db.prepare('SELECT receipt_counter FROM institutions WHERE id = ?').get(instId) as {
      receipt_counter: number;
    };
    const receipt_number = `REC-${String(receipt_counter).padStart(6, '0')}`;

    const defaultAccount =
      account_id ||
      ((db.prepare('SELECT id FROM finance_accounts WHERE institution_id = ? ORDER BY id ASC LIMIT 1').get(instId) as { id: number } | undefined)?.id ?? null);

    let financeTxId: number | null = null;
    let mealFinanceTxId: number | null = null;

    // CRITICAL RULE: Free status with amount_paid === 0 must NOT create fake income records!
    if (feePaidPart > 0) {
      const feeCatId = findOrCreateFinanceCategory(instId, FIN_CAT_STUDENT_FEE, 'income');
      const feeTxCode = generateUniqueTxCode(instId, 'TXN');
      const txInfo = db
        .prepare(
          `INSERT INTO finance_transactions (
            institution_id, tx_code, tx_date, type, category_id, category_name, account_id,
            description, amount, payment_method, handled_by, reference, note, source_type, created_at
          ) VALUES (?, ?, ?, 'income', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'student_fee', ?)`
        )
        .run(
          instId,
          feeTxCode,
          payment_date,
          feeCatId,
          FIN_CAT_STUDENT_FEE,
          defaultAccount,
          `${fee_category}${payment_period ? ` (${payment_period})` : ''} — ${student.full_name} (ID: ${student.student_code})`,
          feePaidPart,
          payment_method,
          req.authUser!.full_name,
          receipt_number,
          note,
          now
        );
      financeTxId = Number(txInfo.lastInsertRowid);
    }

    if (mealPaidPart > 0) {
      const mealCatId = findOrCreateFinanceCategory(instId, FIN_CAT_STUDENT_MEAL, 'income');
      const mealTxCode = generateUniqueTxCode(instId, 'TXN');
      const mInfo = db
        .prepare(
          `INSERT INTO finance_transactions (
            institution_id, tx_code, tx_date, type, category_id, category_name, account_id,
            description, amount, payment_method, handled_by, reference, note, source_type, created_at
          ) VALUES (?, ?, ?, 'income', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'student_meal_cost', ?)`
        )
        .run(
          instId,
          mealTxCode,
          payment_date,
          mealCatId,
          FIN_CAT_STUDENT_MEAL,
          defaultAccount,
          `শিক্ষার্থী খাবার খরচ${payment_period ? ` (${payment_period})` : ''} — ${student.full_name} (ID: ${student.student_code})`,
          mealPaidPart,
          payment_method,
          req.authUser!.full_name,
          receipt_number,
          note,
          now
        );
      mealFinanceTxId = Number(mInfo.lastInsertRowid);
    }

    const payInfo = db
      .prepare(
        `INSERT INTO fee_payments (
          institution_id, receipt_number, student_id, payment_type, fee_category, payment_month, payment_period,
          monthly_payable, meal_cost, other_fee, discount, previous_due, total_payable,
          amount_paid, fee_paid_part, meal_paid_part, remaining_due,
          payment_date, payment_method, account_id,
          received_by_id, received_by_name, note, finance_tx_id, meal_finance_tx_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        instId,
        receipt_number,
        student_id,
        payment_type,
        fee_category,
        payment_month,
        payment_period,
        monthly_payable,
        meal_cost,
        other_fee,
        discount,
        previous_due,
        total_payable,
        amount_paid,
        feePaidPart,
        mealPaidPart,
        remaining_due,
        payment_date,
        payment_method,
        defaultAccount,
        req.authUser!.id,
        req.authUser!.full_name,
        note,
        financeTxId,
        mealFinanceTxId,
        now
      );

    const payId = Number(payInfo.lastInsertRowid);
    if (financeTxId) {
      db.prepare('UPDATE finance_transactions SET source_id = ? WHERE id = ?').run(payId, financeTxId);
    }
    if (mealFinanceTxId) {
      db.prepare('UPDATE finance_transactions SET source_id = ? WHERE id = ?').run(payId, mealFinanceTxId);
    }

    return payId;
  });

  const paymentId = recordPaymentTx.immediate();
  const payment = db
    .prepare(
      `SELECT fp.*, s.full_name as student_name, s.roll_number, s.student_code, s.photo_url as student_photo,
              d.name as department_name, c.name as class_name, j.name as jamaat_name
       FROM fee_payments fp
       JOIN students s ON s.id = fp.student_id
       LEFT JOIN academic_departments d ON d.id = s.department_id
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN jamaat_names j ON j.id = s.jamaat_id
       WHERE fp.id = ?`
    )
    .get(paymentId);

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    action: 'RECORD_STUDENT_PAYMENT',
    targetType: 'fee_payment',
    targetId: paymentId,
    targetLabel: `${student.full_name} — ফি ৳${feePaidPart} + খাবার ৳${mealPaidPart}`,
    institutionId: instId,
  });

  res.status(201).json({ payment });
});

// ==================== 2. DARUL IQAMA / HOSTEL MANAGEMENT (Section 18) ====================
instModulesRouter.get('/hostel/overview', requirePermission('hostel', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const units = db
    .prepare(
      `SELECT hu.*,
        (SELECT COUNT(*) FROM hostel_rooms hr WHERE hr.unit_id = hu.id) as room_count,
        (SELECT COUNT(*) FROM hostel_allocations ha WHERE ha.unit_id = hu.id AND ha.status = 'active') as resident_count
       FROM hostel_units hu WHERE hu.institution_id = ? ORDER BY hu.id ASC`
    )
    .all(instId);

  const rooms = db
    .prepare(
      `SELECT hr.*, hu.name as unit_name,
        (SELECT COUNT(*) FROM hostel_allocations ha WHERE ha.room_id = hr.id AND ha.status = 'active') as occupied_beds
       FROM hostel_rooms hr
       JOIN hostel_units hu ON hu.id = hr.unit_id
       WHERE hr.institution_id = ? ORDER BY hu.name ASC, hr.room_number ASC`
    )
    .all(instId);

  const allocations = db
    .prepare(
      `SELECT ha.*, s.full_name as student_name, s.roll_number, s.student_code, s.photo_url,
              d.name as department_name, c.name as class_name,
              hu.name as unit_name, hr.room_number, hr.monthly_fee
       FROM hostel_allocations ha
       JOIN students s ON s.id = ha.student_id
       LEFT JOIN academic_departments d ON d.id = s.department_id
       LEFT JOIN classes c ON c.id = s.class_id
       JOIN hostel_units hu ON hu.id = ha.unit_id
       JOIN hostel_rooms hr ON hr.id = ha.room_id
       WHERE ha.institution_id = ?
       ORDER BY ha.status ASC, ha.created_at DESC`
    )
    .all(instId);

  const meals = db
    .prepare('SELECT * FROM hostel_meals WHERE institution_id = ? ORDER BY meal_date DESC LIMIT 30')
    .all(instId);

  const today = getDhakaDateYMD();
  const attendance = db
    .prepare(
      `SELECT ha.student_id, s.full_name, s.roll_number, hu.name as unit_name, hr.room_number,
              hatt.status, hatt.note
       FROM hostel_allocations ha
       JOIN students s ON s.id = ha.student_id
       JOIN hostel_units hu ON hu.id = ha.unit_id
       JOIN hostel_rooms hr ON hr.id = ha.room_id
       LEFT JOIN hostel_attendance hatt ON hatt.student_id = ha.student_id AND hatt.institution_id = ha.institution_id AND hatt.attendance_date = ?
       WHERE ha.institution_id = ? AND ha.status = 'active'
       ORDER BY hr.room_number ASC, s.roll_number ASC`
    )
    .all(today, instId);

  res.json({ units, rooms, allocations, meals, attendance, today });
});

// Scoped student picker for Darul Iqama / Hostel module so Hostel roles don't need Academic/Students CRUD permission
instModulesRouter.get('/hostel/students', requirePermission('hostel', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const rows = db
    .prepare(
      `SELECT s.id, s.full_name, s.roll_number, s.student_code, s.status,
              d.name as department_name, c.name as class_name
       FROM students s
       LEFT JOIN academic_departments d ON d.id = s.department_id
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE s.institution_id = ? AND s.status = 'active'
       ORDER BY s.roll_number ASC`
    )
    .all(instId);
  res.json({ students: rows });
});

instModulesRouter.post('/hostel/units', requirePermission('hostel', 'create'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'ভবন/ইউনিটের নাম আবশ্যক।' });
  const info = db
    .prepare('INSERT INTO hostel_units (institution_id, name, supervisor_name, capacity, description, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(
      req.institutionId!,
      name,
      String(req.body?.supervisor_name || '').trim(),
      Number(req.body?.capacity || 0),
      String(req.body?.description || '').trim(),
      getDhakaNowISO()
    );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

instModulesRouter.post('/hostel/rooms', requirePermission('hostel', 'create'), (req, res) => {
  const unit_id = Number(req.body?.unit_id);
  const room_number = String(req.body?.room_number || '').trim();
  if (!unit_id || !room_number) return res.status(400).json({ error: 'ইউনিট ও কক্ষ নম্বর আবশ্যক।' });
  const info = db
    .prepare('INSERT INTO hostel_rooms (institution_id, unit_id, room_number, total_beds, monthly_fee, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(
      req.institutionId!,
      unit_id,
      room_number,
      Number(req.body?.total_beds || 4),
      Number(req.body?.monthly_fee || 0),
      getDhakaNowISO()
    );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

instModulesRouter.post('/hostel/allocations', requirePermission('hostel', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const student_id = Number(req.body?.student_id);
  const room_id = Number(req.body?.room_id);
  const bed_number = String(req.body?.bed_number || '').trim();
  const start_date = String(req.body?.start_date || getDhakaDateYMD()).trim();
  const note = String(req.body?.note || '').trim();

  const room = db.prepare('SELECT * FROM hostel_rooms WHERE id = ? AND institution_id = ?').get(room_id, instId) as any;
  if (!room) return res.status(404).json({ error: 'কক্ষ পাওয়া যায়নি।' });

  const occupied = (
    db.prepare("SELECT COUNT(*) as c FROM hostel_allocations WHERE room_id = ? AND status = 'active'").get(room_id) as { c: number }
  ).c;
  if (occupied >= room.total_beds) {
    return res.status(409).json({ error: 'এই কক্ষে কোনো খালি সিট নেই।' });
  }

  // If student already has an active allocation, mark it transferred automatically
  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE hostel_allocations SET status = 'transferred', end_date = ? WHERE student_id = ? AND institution_id = ? AND status = 'active'"
    ).run(start_date, student_id, instId);

    const info = db
      .prepare(
        `INSERT INTO hostel_allocations (institution_id, student_id, unit_id, room_id, bed_number, start_date, status, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(instId, student_id, room.unit_id, room_id, bed_number || `সিট-${occupied + 1}`, start_date, note, getDhakaNowISO());
    return Number(info.lastInsertRowid);
  });

  res.status(201).json({ id: tx() });
});

instModulesRouter.patch('/hostel/allocations/:id/vacate', requirePermission('hostel', 'edit'), (req, res) => {
  db.prepare(
    "UPDATE hostel_allocations SET status = 'vacated', end_date = ? WHERE id = ? AND institution_id = ?"
  ).run(getDhakaDateYMD(), Number(req.params.id), req.institutionId!);
  res.json({ success: true });
});

instModulesRouter.post('/hostel/attendance', requirePermission('hostel', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const date = String(req.body?.date || getDhakaDateYMD());
  const entries: Array<{ student_id: number; status: string; note?: string }> = Array.isArray(req.body?.entries) ? req.body.entries : [];
  const now = getDhakaNowISO();
  const upsert = db.prepare(
    `INSERT INTO hostel_attendance (institution_id, student_id, attendance_date, status, note, marked_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(institution_id, student_id, attendance_date)
     DO UPDATE SET status = excluded.status, note = excluded.note, marked_by = excluded.marked_by`
  );
  const tx = db.transaction(() => {
    for (const e of entries) {
      if (!['present', 'absent', 'leave'].includes(e.status)) continue;
      upsert.run(instId, Number(e.student_id), date, e.status, String(e.note || ''), req.authUser!.id, now);
    }
  });
  tx();
  res.json({ success: true });
});

instModulesRouter.post('/hostel/meals', requirePermission('hostel', 'create'), (req, res) => {
  const info = db
    .prepare(
      `INSERT INTO hostel_meals (institution_id, meal_date, breakfast, lunch, dinner, total_students, cost, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.institutionId!,
      String(req.body?.meal_date || getDhakaDateYMD()),
      String(req.body?.breakfast || '').trim(),
      String(req.body?.lunch || '').trim(),
      String(req.body?.dinner || '').trim(),
      Number(req.body?.total_students || 0),
      Number(Number(req.body?.cost || 0).toFixed(2)),
      String(req.body?.note || '').trim(),
      getDhakaNowISO()
    );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

// ==================== 3. LIBRARY MANAGEMENT (Section 19) ====================
instModulesRouter.get('/library/overview', requirePermission('library', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const today = getDhakaDateYMD();
  // Automatically flag overdue issues
  db.prepare(
    "UPDATE library_issues SET status = 'overdue' WHERE institution_id = ? AND status = 'issued' AND due_date < ?"
  ).run(instId, today);

  const books = db
    .prepare('SELECT * FROM library_books WHERE institution_id = ? ORDER BY title ASC')
    .all(instId);

  const issues = db
    .prepare(
      `SELECT li.*, lb.title as book_title, lb.book_code, lb.author
       FROM library_issues li
       JOIN library_books lb ON lb.id = li.book_id
       WHERE li.institution_id = ?
       ORDER BY li.created_at DESC LIMIT 200`
    )
    .all(instId);

  const students = db
    .prepare(
      `SELECT id, full_name, roll_number, student_code
       FROM students
       WHERE institution_id = ? AND status = 'active'
       ORDER BY roll_number ASC`
    )
    .all(instId);

  const teachers = db
    .prepare(
      `SELECT id, full_name, mobile
       FROM teachers
       WHERE institution_id = ? AND status = 'active'
       ORDER BY full_name ASC`
    )
    .all(instId);

  res.json({ books, issues, students, teachers });
});

instModulesRouter.post('/library/books', requirePermission('library', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const title = String(req.body?.title || '').trim();
  const book_code = String(req.body?.book_code || `BK-${String(Date.now()).slice(-5)}`).trim();
  const quantity = Math.max(1, Number(req.body?.quantity || 1));
  if (!title) return res.status(400).json({ error: 'কিতাব/বইয়ের নাম আবশ্যক।' });

  const info = db
    .prepare(
      `INSERT INTO library_books (institution_id, book_code, title, category, author, publisher, quantity, available_copies, shelf_location, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      instId,
      book_code,
      title,
      String(req.body?.category || 'কিতাব').trim(),
      String(req.body?.author || '').trim(),
      String(req.body?.publisher || '').trim(),
      quantity,
      quantity,
      String(req.body?.shelf_location || '').trim(),
      getDhakaNowISO()
    );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

instModulesRouter.delete('/library/books/:id', requirePermission('library', 'delete'), (req, res) => {
  db.prepare('DELETE FROM library_books WHERE id = ? AND institution_id = ?').run(Number(req.params.id), req.institutionId!);
  res.json({ success: true });
});

instModulesRouter.post('/library/issues', requirePermission('library', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const book_id = Number(req.body?.book_id);
  const borrower_type = req.body?.borrower_type === 'teacher' ? 'teacher' : 'student';
  const borrower_id = Number(req.body?.borrower_id);
  const issue_date = String(req.body?.issue_date || getDhakaDateYMD());
  const due_date = String(req.body?.due_date || getDhakaDateYMD(new Date(Date.now() + 7 * 86400 * 1000)));
  const note = String(req.body?.note || '').trim();

  const book = db.prepare('SELECT * FROM library_books WHERE id = ? AND institution_id = ?').get(book_id, instId) as any;
  if (!book) return res.status(404).json({ error: 'বই পাওয়া যায়নি।' });
  if (book.available_copies <= 0) return res.status(409).json({ error: 'এই বইয়ের কোনো কপি বর্তমানে স্টকে নেই।' });

  let borrowerName = '';
  if (borrower_type === 'student') {
    const s = db.prepare('SELECT full_name, roll_number FROM students WHERE id = ? AND institution_id = ?').get(borrower_id, instId) as any;
    if (!s) return res.status(404).json({ error: 'শিক্ষার্থী পাওয়া যায়নি।' });
    borrowerName = `${s.full_name} (রোল: ${s.roll_number})`;
  } else {
    const t = db.prepare('SELECT full_name FROM teachers WHERE id = ? AND institution_id = ?').get(borrower_id, instId) as any;
    if (!t) return res.status(404).json({ error: 'শিক্ষক পাওয়া যায়নি।' });
    borrowerName = t.full_name;
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE library_books SET available_copies = available_copies - 1 WHERE id = ?').run(book_id);
    const info = db
      .prepare(
        `INSERT INTO library_issues (institution_id, book_id, borrower_type, borrower_id, borrower_name, issue_date, due_date, status, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?)`
      )
      .run(instId, book_id, borrower_type, borrower_id, borrowerName, issue_date, due_date, note, getDhakaNowISO());
    return Number(info.lastInsertRowid);
  });

  res.status(201).json({ id: tx() });
});

instModulesRouter.patch('/library/issues/:id/return', requirePermission('library', 'edit'), (req, res) => {
  const instId = req.institutionId!;
  const id = Number(req.params.id);
  const issue = db.prepare('SELECT * FROM library_issues WHERE id = ? AND institution_id = ?').get(id, instId) as any;
  if (!issue) return res.status(404).json({ error: 'ইস্যু রেকর্ড পাওয়া যায়নি।' });
  if (issue.status === 'returned') return res.status(400).json({ error: 'বইটি ইতিমধ্যেই ফেরত নেওয়া হয়েছে।' });

  const tx = db.transaction(() => {
    db.prepare("UPDATE library_issues SET status = 'returned', return_date = ?, late_fee = ? WHERE id = ?").run(
      getDhakaDateYMD(),
      Number(req.body?.late_fee || 0),
      id
    );
    db.prepare('UPDATE library_books SET available_copies = MIN(quantity, available_copies + 1) WHERE id = ?').run(issue.book_id);
  });
  tx();
  res.json({ success: true });
});

// ==================== 4. NOTICE BOARD & REAL-TIME PUSH (Section 15) ====================
instModulesRouter.get('/notices', (req, res) => {
  const instId = req.institutionId!;
  const userId = req.authUser!.id;
  const rows = db
    .prepare(
      `SELECT n.*,
        EXISTS(SELECT 1 FROM notice_reads nr WHERE nr.notice_id = n.id AND nr.user_id = ?) as is_read
       FROM notices n
       WHERE n.institution_id = ? OR n.institution_id IS NULL
       ORDER BY n.created_at DESC LIMIT 100`
    )
    .all(userId, instId);
  res.json({ notices: rows });
});

instModulesRouter.post('/notices', requirePermission('notices', 'create'), (req, res) => {
  const instId = req.institutionId!;
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const audience_type = String(req.body?.audience_type || 'all').trim();
  const audience_target_id = String(req.body?.audience_target_id || '').trim();
  const publish_date = String(req.body?.publish_date || getDhakaDateYMD()).trim();
  const expiry_date = String(req.body?.expiry_date || '').trim();
  const status = ['published', 'draft', 'archived'].includes(req.body?.status) ? req.body.status : 'published';
  const attachment = sanitizeStoredAttachmentRef(
    req.body?.attachment_name,
    req.body?.attachment_data ?? req.body?.attachment_url
  );

  if (!title || !description) {
    return res.status(400).json({ error: 'নোটিশের শিরোনাম ও বিবরণ আবশ্যক।' });
  }

  const now = getDhakaNowISO();
  const info = db
    .prepare(
      `INSERT INTO notices (institution_id, title, description, attachment_name, attachment_data, publish_date, expiry_date, audience_type, audience_target_id, status, created_by_id, created_by_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      instId,
      title,
      description,
      attachment.name,
      attachment.data,
      publish_date,
      expiry_date,
      audience_type,
      audience_target_id,
      status,
      req.authUser!.id,
      req.authUser!.full_name,
      now
    );

  const id = Number(info.lastInsertRowid);
  if (status === 'published') {
    broadcastNotice({
      id,
      institution_id: instId,
      title,
      description,
      audience_type,
      audience_target_id,
      publish_date,
      created_by_name: req.authUser!.full_name,
    });
  }

  res.status(201).json({ notice: db.prepare('SELECT * FROM notices WHERE id = ?').get(id) });
});

// (POST /notices/:id/read is registered above requireInstitutionStaff for all institution users)

instModulesRouter.delete('/notices/:id', requirePermission('notices', 'delete'), (req, res) => {
  db.prepare('DELETE FROM notices WHERE id = ? AND institution_id = ?').run(Number(req.params.id), req.institutionId!);
  res.json({ success: true });
});

// ==================== 5. INSTITUTION SUPPORT TICKETS ====================
instModulesRouter.get('/support', (req, res) => {
  const tickets = db
    .prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM support_replies sr WHERE sr.ticket_id = t.id) as reply_count
       FROM support_tickets t
       WHERE t.institution_id = ?
       ORDER BY t.updated_at DESC`
    )
    .all(req.institutionId!);
  res.json({ tickets });
});

instModulesRouter.get('/support/:id', (req, res) => {
  const id = Number(req.params.id);
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ? AND institution_id = ?').get(id, req.institutionId!);
  if (!ticket) return res.status(404).json({ error: 'টিকেট পাওয়া যায়নি।' });
  const replies = db.prepare('SELECT * FROM support_replies WHERE ticket_id = ? ORDER BY created_at ASC').all(id);
  res.json({ ticket, replies });
});

instModulesRouter.post('/support', (req, res) => {
  const subject = String(req.body?.subject || '').trim();
  const category = String(req.body?.category || 'টেকনিক্যাল').trim();
  const description = String(req.body?.description || '').trim();
  const priority = ['low', 'medium', 'high', 'urgent'].includes(req.body?.priority) ? req.body.priority : 'medium';
  const attachment = sanitizeStoredAttachmentRef(
    req.body?.attachment_name,
    req.body?.attachment_data ?? req.body?.attachment_url
  );

  if (!subject || !description) {
    return res.status(400).json({ error: 'বিষয় ও বিস্তারিত বিবরণ আবশ্যক।' });
  }

  const now = getDhakaNowISO();
  const ticket_code = `TKT-${String(Date.now()).slice(-6)}`;
  const info = db
    .prepare(
      `INSERT INTO support_tickets (ticket_code, institution_id, user_id, created_by_name, subject, category, description, attachment_name, attachment_data, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
    )
    .run(
      ticket_code,
      req.institutionId!,
      req.authUser!.id,
      req.authUser!.full_name,
      subject,
      category,
      description,
      attachment.name,
      attachment.data,
      priority,
      now,
      now
    );

  res.status(201).json({ ticket: db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(info.lastInsertRowid) });
});

instModulesRouter.post('/support/:id/reply', (req, res) => {
  const id = Number(req.params.id);
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'বার্তা লিখুন।' });
  const ticket = db.prepare('SELECT id FROM support_tickets WHERE id = ? AND institution_id = ?').get(id, req.institutionId!);
  if (!ticket) return res.status(404).json({ error: 'টিকেট পাওয়া যায়নি।' });

  const now = getDhakaNowISO();
  db.prepare(
    `INSERT INTO support_replies (ticket_id, user_id, author_name, author_role, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, req.authUser!.id, req.authUser!.full_name, req.authUser!.role_name, message, now);
  db.prepare('UPDATE support_tickets SET updated_at = ? WHERE id = ?').run(now, id);
  res.status(201).json({ success: true });
});

// ==================== 6. INSTITUTIONAL REPORTS (Section 22) ====================
instModulesRouter.get('/reports', requirePermission('reports', 'view'), (req, res) => {
  const instId = req.institutionId!;
  const user = req.authUser!;
  const reportType = String(req.query.type || 'students');
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const deptId = req.query.department_id ? Number(req.query.department_id) : null;
  const classId = req.query.class_id ? Number(req.query.class_id) : null;
  const status = String(req.query.status || '');
  const paymentType = String(req.query.payment_type || '');

  // Enforce strict module-level isolation per report type
  const reportPermMap: Record<string, string> = {
    students: 'students',
    teachers: 'teachers',
    attendance: 'attendance',
    fees: 'finance',
    dues: 'finance',
    income: 'finance',
    expense: 'finance',
    teacher_salary: 'finance',
    hostel: 'hostel',
    library: 'library',
    departments: 'academic',
    classes: 'academic',
    exams: 'exams',
  };
  const requiredMod = reportPermMap[reportType];
  if (requiredMod && !hasPermission(user, requiredMod, 'view')) {
    return res.status(403).json({ error: 'এই বিভাগের রিপোর্ট দেখার অনুমতি আপনার নেই।' });
  }

  if (reportType === 'students') {
    let sql = `SELECT s.roll_number, s.student_code, s.full_name, s.father_name, s.guardian_mobile, s.admission_date,
                      s.fee_type, s.monthly_fee, COALESCE(s.monthly_meal_cost, 0) as monthly_meal_cost,
                      (COALESCE(s.monthly_fee, 0) + COALESCE(s.monthly_meal_cost, 0)) as total_monthly_payable,
                      s.status, d.name as department_name, c.name as class_name, j.name as jamaat_name
               FROM students s
               LEFT JOIN academic_departments d ON d.id = s.department_id
               LEFT JOIN classes c ON c.id = s.class_id
               LEFT JOIN jamaat_names j ON j.id = s.jamaat_id
               WHERE s.institution_id = ?`;
    const p: any[] = [instId];
    if (deptId) { sql += ' AND s.department_id = ?'; p.push(deptId); }
    if (classId) { sql += ' AND s.class_id = ?'; p.push(classId); }
    if (status && status !== 'all') { sql += ' AND s.status = ?'; p.push(status); }
    if (from) { sql += ' AND s.admission_date >= ?'; p.push(from); }
    if (to) { sql += ' AND s.admission_date <= ?'; p.push(to); }
    sql += ' ORDER BY s.roll_number ASC';
    return res.json({ rows: db.prepare(sql).all(...p) });
  }

  if (reportType === 'teachers') {
    const rows = db
      .prepare(
        `SELECT t.full_name, t.mobile, t.joining_date, t.status, d.name as department_name, u.username, r.name as role_name,
                tp.teacher_code, COALESCE(tp.monthly_salary, 0) as monthly_salary,
                COALESCE(tp.monthly_meal_cost, 0) as monthly_meal_cost,
                (COALESCE(tp.monthly_salary, 0) + COALESCE(tp.monthly_meal_cost, 0)) as total_monthly_payable
         FROM teachers t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
         LEFT JOIN academic_departments d ON d.id = t.department_id
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE t.institution_id = ?
         ORDER BY t.full_name ASC`
      )
      .all(instId);
    return res.json({ rows });
  }

  if (reportType === 'attendance') {
    let sql = `SELECT sa.attendance_date, sa.session_name, sa.status, s.full_name, s.roll_number, d.name as department_name, c.name as class_name
               FROM student_attendance sa
               JOIN students s ON s.id = sa.student_id
               LEFT JOIN academic_departments d ON d.id = s.department_id
               LEFT JOIN classes c ON c.id = s.class_id
               WHERE sa.institution_id = ?`;
    const p: any[] = [instId];
    if (deptId) { sql += ' AND s.department_id = ?'; p.push(deptId); }
    if (classId) { sql += ' AND s.class_id = ?'; p.push(classId); }
    if (from) { sql += ' AND sa.attendance_date >= ?'; p.push(from); }
    if (to) { sql += ' AND sa.attendance_date <= ?'; p.push(to); }
    sql += ' ORDER BY sa.attendance_date DESC, s.roll_number ASC LIMIT 500';
    return res.json({ rows: db.prepare(sql).all(...p) });
  }

  if (reportType === 'fees' || reportType === 'dues') {
    let sql = `SELECT fp.receipt_number, fp.payment_date, fp.payment_month, fp.payment_type, fp.fee_category, fp.payment_period,
                      fp.monthly_payable, fp.meal_cost, fp.other_fee, fp.discount, fp.previous_due,
                      fp.total_payable, fp.amount_paid, fp.fee_paid_part, fp.meal_paid_part, fp.remaining_due, fp.payment_method,
                      s.full_name as student_name, s.student_code, s.roll_number,
                      d.name as department_name, c.name as class_name, j.name as jamaat_name
               FROM fee_payments fp
               JOIN students s ON s.id = fp.student_id
               LEFT JOIN academic_departments d ON d.id = s.department_id
               LEFT JOIN classes c ON c.id = s.class_id
               LEFT JOIN jamaat_names j ON j.id = s.jamaat_id
               WHERE fp.institution_id = ?`;
    const p: any[] = [instId];
    if (reportType === 'dues') sql += ' AND fp.remaining_due > 0';
    if (paymentType && paymentType !== 'all') { sql += ' AND fp.payment_type = ?'; p.push(paymentType); }
    if (deptId) { sql += ' AND s.department_id = ?'; p.push(deptId); }
    if (classId) { sql += ' AND s.class_id = ?'; p.push(classId); }
    if (from) { sql += ' AND fp.payment_date >= ?'; p.push(from); }
    if (to) { sql += ' AND fp.payment_date <= ?'; p.push(to); }
    sql += ' ORDER BY fp.payment_date DESC, fp.id DESC LIMIT 500';
    return res.json({ rows: db.prepare(sql).all(...p) });
  }

  if (reportType === 'teacher_salary') {
    let sql = `SELECT sr.payment_date, sr.salary_month, t.full_name as teacher_name, tp.teacher_code,
                      sr.base_salary, sr.meal_cost, sr.bonus, sr.deduction, sr.previous_due, sr.due_adjusted,
                      sr.total_payable, sr.paid_amount, sr.salary_paid_part, sr.meal_paid_part, sr.remaining_due,
                      sr.payment_method, sr.approved_by_name
               FROM teacher_salary_records sr
               JOIN teachers t ON t.id = sr.teacher_id
               LEFT JOIN teacher_profiles tp ON tp.teacher_id = t.id
               WHERE sr.institution_id = ?`;
    const p: any[] = [instId];
    if (from) { sql += ' AND sr.payment_date >= ?'; p.push(from); }
    if (to) { sql += ' AND sr.payment_date <= ?'; p.push(to); }
    sql += ' ORDER BY sr.payment_date DESC, sr.id DESC LIMIT 500';
    return res.json({ rows: db.prepare(sql).all(...p) });
  }

  if (reportType === 'income' || reportType === 'expense') {
    let sql = `SELECT tx_date, type, category_name, description, amount, payment_method, handled_by, reference
               FROM finance_transactions WHERE institution_id = ? AND type = ?`;
    const p: any[] = [instId, reportType];
    if (from) { sql += ' AND tx_date >= ?'; p.push(from); }
    if (to) { sql += ' AND tx_date <= ?'; p.push(to); }
    sql += ' ORDER BY tx_date DESC LIMIT 500';
    return res.json({ rows: db.prepare(sql).all(...p) });
  }

  if (reportType === 'hostel') {
    const rows = db
      .prepare(
        `SELECT ha.start_date, ha.status, ha.bed_number, s.full_name as student_name, s.roll_number,
                hu.name as unit_name, hr.room_number, hr.monthly_fee
         FROM hostel_allocations ha
         JOIN students s ON s.id = ha.student_id
         JOIN hostel_units hu ON hu.id = ha.unit_id
         JOIN hostel_rooms hr ON hr.id = ha.room_id
         WHERE ha.institution_id = ?
         ORDER BY hu.name ASC, hr.room_number ASC`
      )
      .all(instId);
    return res.json({ rows });
  }

  if (reportType === 'library') {
    const rows = db
      .prepare(
        `SELECT li.issue_date, li.due_date, li.return_date, li.status, li.borrower_name,
                lb.book_code, lb.title as book_title, lb.author
         FROM library_issues li
         JOIN library_books lb ON lb.id = li.book_id
         WHERE li.institution_id = ?
         ORDER BY li.issue_date DESC LIMIT 300`
      )
      .all(instId);
    return res.json({ rows });
  }

  if (reportType === 'departments') {
    const rows = db
      .prepare(
        `SELECT d.name as department_name, d.status,
          (SELECT COUNT(*) FROM classes c WHERE c.department_id = d.id) as total_classes,
          (SELECT COUNT(*) FROM students s WHERE s.department_id = d.id AND s.status = 'active') as active_students
         FROM academic_departments d WHERE d.institution_id = ?`
      )
      .all(instId);
    return res.json({ rows });
  }

  if (reportType === 'classes') {
    const rows = db
      .prepare(
        `SELECT c.name as class_name, d.name as department_name,
          (SELECT COUNT(*) FROM subjects sub WHERE sub.class_id = c.id) as total_subjects,
          (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'active') as active_students
         FROM classes c JOIN academic_departments d ON d.id = c.department_id
         WHERE c.institution_id = ? ORDER BY d.id ASC, c.display_order ASC`
      )
      .all(instId);
    return res.json({ rows });
  }

  if (reportType === 'exams') {
    const rows = db
      .prepare(
        `SELECT e.name as exam_name, e.academic_year, d.name as department_name, c.name as class_name,
                e.start_date, e.end_date, e.status,
                (SELECT COUNT(DISTINCT student_id) FROM exam_marks em WHERE em.exam_id = e.id) as evaluated_students
         FROM examinations e
         JOIN academic_departments d ON d.id = e.department_id
         JOIN classes c ON c.id = e.class_id
         WHERE e.institution_id = ? ORDER BY e.created_at DESC`
      )
      .all(instId);
    return res.json({ rows });
  }

  res.json({ rows: [] });
});

// ==================== INSTITUTION SUPPORT SETTINGS (WHATSAPP & FACEBOOK) ====================
instModulesRouter.put('/support-settings', requirePermission('settings', 'manage'), (req, res) => {
  const instId = req.institutionId!;
  const whatsapp_number = normalizeWhatsApp(req.body?.whatsapp_number);
  const whatsapp_enabled = req.body?.whatsapp_enabled === false || req.body?.whatsapp_enabled === 0 ? 0 : 1;
  const facebook_url = normalizeHttpUrl(req.body?.facebook_url);
  const facebook_enabled = req.body?.facebook_enabled === false || req.body?.facebook_enabled === 0 ? 0 : 1;
  const support_email = String(req.body?.support_email || '').trim().slice(0, 120);
  const support_description = String(req.body?.support_description || '').trim().slice(0, 500);
  const now = getDhakaNowISO();

  db.prepare(
    `INSERT INTO institution_settings (
      institution_id, whatsapp_number, whatsapp_enabled, facebook_url, facebook_enabled, support_email, support_description, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(institution_id) DO UPDATE SET
      whatsapp_number = excluded.whatsapp_number,
      whatsapp_enabled = excluded.whatsapp_enabled,
      facebook_url = excluded.facebook_url,
      facebook_enabled = excluded.facebook_enabled,
      support_email = excluded.support_email,
      support_description = excluded.support_description,
      updated_at = excluded.updated_at`
  ).run(instId, whatsapp_number, whatsapp_enabled, facebook_url, facebook_enabled, support_email, support_description, now);

  recordAuditLog({
    actorUserId: req.authUser!.id,
    actorName: req.authUser!.full_name,
    actorRole: req.authUser!.role_name,
    action: 'UPDATE_INSTITUTION_SUPPORT_SETTINGS',
    module: 'administration',
    categoryCode: 'administration',
    targetType: 'institution_settings',
    targetId: instId,
    targetLabel: whatsapp_number || 'ডিফল্ট গ্লোবাল সাপোর্ট',
    description: 'প্রতিষ্ঠানের হোয়াটসঅ্যাপ ও ফেসবুক সাপোর্ট সেটিংস হালনাগাদ করা হয়েছে',
    institutionId: instId,
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

// ==================== INSTITUTION AUDIT LOGS (APPEND-ONLY, STRICT TENANT ISOLATION) ====================
instModulesRouter.get(
  '/audit-logs',
  requireAnyPermission([
    ['settings', 'view'],
    ['settings', 'manage'],
    ['reports', 'view'],
  ]),
  (req, res) => {
    const instId = req.institutionId!;
    const moduleFilter = String(req.query.module || '').trim();
    const userFilter = String(req.query.user || '').trim();
    const statusFilter = String(req.query.status || '').trim();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const search = String(req.query.search || '').trim();
    const limit = Math.min(500, Math.max(20, Number(req.query.limit || 250)));

    let sql = 'SELECT * FROM audit_logs WHERE institution_id = ?';
    const params: any[] = [instId];

    if (moduleFilter && moduleFilter !== 'all') {
      sql += ' AND (module = ? OR category_code = ?)';
      params.push(moduleFilter, moduleFilter);
    }
    if (userFilter) {
      sql += ' AND (actor_name LIKE ? OR actor_role LIKE ?)';
      params.push(`%${userFilter}%`, `%${userFilter}%`);
    }
    if (statusFilter && statusFilter !== 'all') {
      sql += ' AND result = ?';
      params.push(statusFilter);
    }
    if (from) {
      sql += ' AND substr(created_at, 1, 10) >= ?';
      params.push(from);
    }
    if (to) {
      sql += ' AND substr(created_at, 1, 10) <= ?';
      params.push(to);
    }
    if (search) {
      sql += ' AND (action LIKE ? OR actor_name LIKE ? OR target_label LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const logs = db.prepare(sql).all(...params);
    const categories = db.prepare('SELECT * FROM audit_log_categories ORDER BY code ASC').all();
    res.json({ logs, categories });
  }
);

