import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { db, getDhakaNowISO } from '../db.ts';
import { getClientIp, recordAuditLog, requireAuth } from '../auth.ts';
import {
  FILE_TOO_LARGE_ERROR,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  MIN_FILE_SIZE_BYTES,
  normalizeUploadCategory,
  UPLOAD_CATEGORY_POLICIES,
  validateUploadedFileBuffer,
} from '../uploadPolicy.ts';

const uploadsRootDir = path.resolve(process.cwd(), 'data', 'uploads');
const uploadsTmpDir = path.join(uploadsRootDir, 'tmp');

if (!fs.existsSync(uploadsRootDir)) {
  fs.mkdirSync(uploadsRootDir, { recursive: true });
}
if (!fs.existsSync(uploadsTmpDir)) {
  fs.mkdirSync(uploadsTmpDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsTmpDir);
  },
  filename: (_req, _file, cb) => {
    cb(null, `tmp-${crypto.randomUUID()}`);
  },
});

const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
    fields: 10,
  },
});

function safeUnlink(filePath?: string) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup errors
  }
}

export const uploadsRouter = Router();

// Public/global upload policy metadata so frontend and tests can inspect active rules
uploadsRouter.get('/policy', (_req, res) => {
  res.json({
    maxFileSizeMB: MAX_FILE_SIZE_MB,
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
    minFileSizeBytes: MIN_FILE_SIZE_BYTES,
    fileTooLargeMessage: FILE_TOO_LARGE_ERROR,
    categories: UPLOAD_CATEGORY_POLICIES,
  });
});

// Unified Global File Upload Endpoint (max 20 MB per file, no minimum limit, true MIME validation)
uploadsRouter.post(
  '/',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    uploadMiddleware.single('file')(req, res, (err: any) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: FILE_TOO_LARGE_ERROR,
            code: 'FILE_TOO_LARGE',
            maxBytes: MAX_FILE_SIZE_BYTES,
          });
        }
        return res.status(400).json({ error: `ফাইল আপলোড ত্রুটি: ${err.message}` });
      }
      return res.status(400).json({ error: err?.message || 'ফাইল আপলোড করা যায়নি।' });
    });
  },
  (req: Request, res: Response) => {
    const uploaded = req.file;
    if (!uploaded) {
      return res.status(400).json({ error: 'অনুগ্রহ করে একটি ফাইল নির্বাচন করুন।' });
    }

    const tmpPath = uploaded.path;
    try {
      const stat = fs.statSync(tmpPath);
      if (stat.size > MAX_FILE_SIZE_BYTES) {
        safeUnlink(tmpPath);
        return res.status(413).json({
          error: FILE_TOO_LARGE_ERROR,
          code: 'FILE_TOO_LARGE',
          maxBytes: MAX_FILE_SIZE_BYTES,
        });
      }

      const category = normalizeUploadCategory(req.body?.category ?? req.query?.category);
      const moduleName = String(req.body?.module ?? req.query?.module ?? 'general')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 48) || 'general';

      // Enforce logo upload strictly for authorized roles (super_admin or institution staff)
      if (category === 'logo' && req.authUser!.account_type !== 'super_admin' && req.authUser!.account_type !== 'institution_admin') {
        const isStaff = req.authUser!.account_type === 'staff' || req.authUser!.account_type === 'teacher';
        if (!isStaff) {
          safeUnlink(tmpPath);
          return res.status(403).json({ error: 'লোগো আপলোড করার অনুমতি আপনার নেই।' });
        }
      }

      const buffer = fs.readFileSync(tmpPath);
      const check = validateUploadedFileBuffer({
        buffer,
        originalName: uploaded.originalname,
        declaredMime: uploaded.mimetype,
        category,
      });

      if (!check.ok) {
        safeUnlink(tmpPath);
        return res.status(check.status).json({
          error: check.error,
          code: check.status === 413 ? 'FILE_TOO_LARGE' : 'INVALID_FILE_TYPE',
        });
      }

      const fileId = crypto.randomUUID();
      const storedFilename = `${fileId}${check.canonicalExt}`;
      const finalPath = path.join(uploadsRootDir, storedFilename);
      fs.renameSync(tmpPath, finalPath);

      const now = getDhakaNowISO();
      db.prepare(
        `INSERT INTO uploaded_files (
           id, institution_id, uploaded_by_user_id, module, category,
           original_name, stored_filename, mime_type, size_bytes, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        fileId,
        req.authUser!.institution_id ?? null,
        req.authUser!.id,
        moduleName,
        category,
        check.cleanName,
        storedFilename,
        check.mimeType,
        check.sizeBytes,
        now
      );

      recordAuditLog({
        actorUserId: req.authUser!.id,
        actorName: req.authUser!.full_name,
        actorRole: req.authUser!.role_name,
        action: 'UPLOAD_FILE',
        module: moduleName === 'branding' ? 'administration' : 'administration',
        targetType: 'uploaded_file',
        targetId: fileId,
        targetLabel: check.cleanName,
        description: `${check.cleanName} (${(check.sizeBytes / (1024 * 1024)).toFixed(2)} MB) ফাইল আপলোড করা হয়েছে`,
        institutionId: req.authUser!.institution_id ?? null,
        ipAddress: getClientIp(req),
        details: {
          category,
          module: moduleName,
          mime_type: check.mimeType,
          size_bytes: check.sizeBytes,
        },
      });

      return res.status(201).json({
        file: {
          id: fileId,
          url: `/api/uploads/${fileId}`,
          original_name: check.cleanName,
          mime_type: check.mimeType,
          size_bytes: check.sizeBytes,
          category,
          module: moduleName,
          created_at: now,
        },
      });
    } catch (err: any) {
      safeUnlink(tmpPath);
      console.error('[Upload Error]', err);
      return res.status(500).json({ error: 'ফাইল সংরক্ষণ করতে সমস্যা হয়েছে।' });
    }
  }
);

// Serve stored uploaded files safely by UUID (no directory traversal, strict headers)
uploadsRouter.get('/:id', (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'অবৈধ ফাইল আইডি।' });
  }

  const row = db
    .prepare('SELECT id, original_name, stored_filename, mime_type, size_bytes FROM uploaded_files WHERE id = ?')
    .get(id) as
    | { id: string; original_name: string; stored_filename: string; mime_type: string; size_bytes: number }
    | undefined;

  if (!row) {
    return res.status(404).json({ error: 'ফাইল পাওয়া যায়নি।' });
  }

  const safeBase = path.basename(row.stored_filename);
  const fullPath = path.join(uploadsRootDir, safeBase);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'স্টোরেজে ফাইলটি পাওয়া যায়নি।' });
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Content-Length', String(row.size_bytes));
  res.setHeader('Cache-Control', 'private, max-age=86400');

  const isRasterImage =
    row.mime_type === 'image/jpeg' || row.mime_type === 'image/png' || row.mime_type === 'image/webp';
  const isSvg = row.mime_type === 'image/svg+xml';
  const forceDownload = req.query.download === '1' || req.query.download === 'true';

  if (isSvg) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  }

  if (forceDownload || (!isRasterImage && !isSvg)) {
    const encodedName = encodeURIComponent(row.original_name || safeBase);
    res.setHeader('Content-Disposition', `attachment; filename="${safeBase}"; filename*=UTF-8''${encodedName}`);
  } else {
    res.setHeader('Content-Disposition', 'inline');
  }

  return res.sendFile(fullPath);
});

// Delete a user-uploaded temporary/test file (restricted to uploader or super_admin)
uploadsRouter.delete('/:id', requireAuth, (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'অবৈধ ফাইল আইডি।' });
  }
  const row = db
    .prepare('SELECT id, institution_id, uploaded_by_user_id, stored_filename FROM uploaded_files WHERE id = ?')
    .get(id) as
    | { id: string; institution_id: number | null; uploaded_by_user_id: number | null; stored_filename: string }
    | undefined;
  if (!row) return res.status(404).json({ error: 'ফাইল পাওয়া যায়নি।' });

  const isSuper = req.authUser!.account_type === 'super_admin';
  const isSameInstAdmin =
    req.authUser!.account_type === 'institution_admin' &&
    row.institution_id !== null &&
    row.institution_id === req.authUser!.institution_id;
  const isOwner = row.uploaded_by_user_id === req.authUser!.id;

  if (!isSuper && !isSameInstAdmin && !isOwner) {
    return res.status(403).json({ error: 'এই ফাইল মুছে ফেলার অনুমতি আপনার নেই।' });
  }

  db.prepare('DELETE FROM uploaded_files WHERE id = ?').run(id);
  safeUnlink(path.join(uploadsRootDir, path.basename(row.stored_filename)));
  return res.json({ success: true });
});
