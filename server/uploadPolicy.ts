import path from 'path';

// Global File Upload Policy — Single Source of Truth across DARUL IDARAH
export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024; // 20,971,520 bytes (exact 20 MB)
export const MIN_FILE_SIZE_BYTES = 0; // No minimum file size limit
export const MAX_BASE64_DATA_URL_LENGTH = Math.ceil((MAX_FILE_SIZE_BYTES * 4) / 3) + 256; // ~27.96 MB base64 string for 20 MB binary

export const FILE_TOO_LARGE_ERROR =
  'ফাইলের সর্বোচ্চ সাইজ ২০ MB হতে পারবে। অনুগ্রহ করে ছোট ফাইল নির্বাচন করুন।';

export type UploadCategory = 'image' | 'logo' | 'document' | 'spreadsheet' | 'attachment';

export interface CategoryPolicy {
  labelBn: string;
  extensions: string[];
  mimes: string[];
}

export const UPLOAD_CATEGORY_POLICIES: Record<UploadCategory, CategoryPolicy> = {
  image: {
    labelBn: 'ছবি (JPG, JPEG, PNG, WEBP)',
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
    mimes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  logo: {
    labelBn: 'লোগো (JPG, JPEG, PNG, WEBP, SVG)',
    extensions: ['.jpg', '.jpeg', '.png', '.webp', '.svg'],
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  },
  document: {
    labelBn: 'ডকুমেন্ট (PDF, DOC, DOCX)',
    extensions: ['.pdf', '.doc', '.docx'],
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  spreadsheet: {
    labelBn: 'স্প্রেডশিট (XLS, XLSX, CSV)',
    extensions: ['.xls', '.xlsx', '.csv'],
    mimes: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ],
  },
  attachment: {
    labelBn: 'ছবি, ডকুমেন্ট ও স্প্রেডশিট (JPG, PNG, WEBP, PDF, DOC, DOCX, XLS, XLSX, CSV)',
    extensions: ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv'],
    mimes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ],
  },
};

export function normalizeUploadCategory(raw: unknown): UploadCategory {
  const s = String(raw || 'attachment').trim().toLowerCase();
  if (s === 'image' || s === 'logo' || s === 'document' || s === 'spreadsheet' || s === 'attachment') {
    return s;
  }
  return 'attachment';
}

export function sanitizeOriginalFilename(rawName: unknown): string {
  const base = path.basename(String(rawName || 'file').replace(/\\/g, '/'));
  const cleaned = base
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'file').slice(0, 180);
}

const MIME_TO_CANONICAL_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/csv': '.csv',
};

const DANGEROUS_SVG_RE =
  /<script\b|<iframe\b|<object\b|<embed\b|<foreignObject\b|\bon[a-z]+\s*=|javascript:|vbscript:|data:text\/html/i;

function isSafeSvgText(text: string): { ok: true } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!/<svg[\s>]/i.test(trimmed) || !/<\/svg>/i.test(trimmed)) {
    return { ok: false, error: 'SVG ফাইলটি সঠিক নয়।' };
  }
  if (DANGEROUS_SVG_RE.test(trimmed)) {
    return {
      ok: false,
      error: 'নিরাপত্তার কারণে এই SVG ফাইলটি গ্রহণযোগ্য নয় (স্ক্রিপ্ট বা অরক্ষিত ট্যাগ সনাক্ত হয়েছে)।',
    };
  }
  return { ok: true };
}

function isPlausibleCsvBuffer(buf: Buffer): boolean {
  // Reject binary control bytes / null bytes and executable/archive/HTML headers
  const sample = buf.subarray(0, Math.min(buf.length, 65536));
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0) return false;
    if (b < 0x09 || (b > 0x0d && b < 0x20)) return false;
  }
  const headText = sample.subarray(0, 512).toString('utf8').trimStart();
  if (/^(<!doctype\s+html|<html|<script|<svg|<\?php|MZ\x90|%PDF-)/i.test(headText)) {
    return false;
  }
  return true;
}

/**
 * Inspects actual file bytes (magic signatures & internal OOXML/text structure)
 * rather than trusting file extension or client-declared MIME type alone.
 */
export function detectTrueMimeFromBuffer(
  buf: Buffer,
  ext: string,
  allowSvg: boolean
): { ok: true; mime: string; canonicalExt: string } | { ok: false; error: string } {
  const lowerExt = ext.toLowerCase();

  // 1. JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    if (lowerExt !== '.jpg' && lowerExt !== '.jpeg') {
      return { ok: false, error: 'ফাইলের এক্সটেনশন ও প্রকৃত ফরম্যাট (JPEG) মিলছে না।' };
    }
    return { ok: true, mime: 'image/jpeg', canonicalExt: '.jpg' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    if (lowerExt !== '.png') {
      return { ok: false, error: 'ফাইলের এক্সটেনশন ও প্রকৃত ফরম্যাট (PNG) মিলছে না।' };
    }
    return { ok: true, mime: 'image/png', canonicalExt: '.png' };
  }

  // 3. WEBP: RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    if (lowerExt !== '.webp') {
      return { ok: false, error: 'ফাইলের এক্সটেনশন ও প্রকৃত ফরম্যাট (WEBP) মিলছে না।' };
    }
    return { ok: true, mime: 'image/webp', canonicalExt: '.webp' };
  }

  // 4. PDF: %PDF-
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    if (lowerExt !== '.pdf') {
      return { ok: false, error: 'ফাইলের এক্সটেনশন ও প্রকৃত ফরম্যাট (PDF) মিলছে না।' };
    }
    return { ok: true, mime: 'application/pdf', canonicalExt: '.pdf' };
  }

  // 5. Legacy Microsoft Office OLE2 Compound Binary (.doc, .xls): D0 CF 11 E0 A1 B1 1A E1
  if (
    buf.length >= 8 &&
    buf[0] === 0xd0 &&
    buf[1] === 0xcf &&
    buf[2] === 0x11 &&
    buf[3] === 0xe0 &&
    buf[4] === 0xa1 &&
    buf[5] === 0xb1 &&
    buf[6] === 0x1a &&
    buf[7] === 0xe1
  ) {
    if (lowerExt === '.doc') {
      return { ok: true, mime: 'application/msword', canonicalExt: '.doc' };
    }
    if (lowerExt === '.xls') {
      return { ok: true, mime: 'application/vnd.ms-excel', canonicalExt: '.xls' };
    }
    return { ok: false, error: 'ফাইলের এক্সটেনশন ও প্রকৃত Office ডকুমেন্ট ফরম্যাট মিলছে না।' };
  }

  // 6. OOXML ZIP-based Office formats (.docx, .xlsx): PK 03 04
  if (
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07) &&
    (buf[3] === 0x04 || buf[3] === 0x06 || buf[3] === 0x08)
  ) {
    // Inspect ZIP local headers & central directory entries for word/ or xl/ markers
    const hasWordMarker = buf.includes(Buffer.from('word/')) || buf.includes(Buffer.from('[Content_Types].xml')) && lowerExt === '.docx';
    const hasExcelMarker = buf.includes(Buffer.from('xl/')) || buf.includes(Buffer.from('[Content_Types].xml')) && lowerExt === '.xlsx';

    if (lowerExt === '.docx' && hasWordMarker) {
      return {
        ok: true,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        canonicalExt: '.docx',
      };
    }
    if (lowerExt === '.xlsx' && hasExcelMarker) {
      return {
        ok: true,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        canonicalExt: '.xlsx',
      };
    }
    return { ok: false, error: 'শুধুমাত্র বৈধ DOCX বা XLSX ফাইল অনুমোদিত (সাধারণ ZIP ফাইল গ্রহণযোগ্য নয়)।' };
  }

  // 7. SVG (explicitly allowed only for logo uploads)
  if (allowSvg && lowerExt === '.svg') {
    const text = buf.toString('utf8');
    const svgCheck = isSafeSvgText(text);
    if (!svgCheck.ok) return svgCheck;
    return { ok: true, mime: 'image/svg+xml', canonicalExt: '.svg' };
  }

  // 8. CSV (plain UTF-8 text without binary signatures)
  if (lowerExt === '.csv') {
    if (!isPlausibleCsvBuffer(buf)) {
      return { ok: false, error: 'CSV ফাইলটি বৈধ টেক্সট ফরম্যাটে নয়।' };
    }
    return { ok: true, mime: 'text/csv', canonicalExt: '.csv' };
  }

  return {
    ok: false,
    error: 'অবৈধ বা অসমর্থিত ফাইল ফরম্যাট। ফাইলের প্রকৃত MIME ধরন অনুমোদিত তালিকার সাথে মিলছে না।',
  };
}

export function validateUploadedFileBuffer(params: {
  buffer: Buffer;
  originalName: string;
  declaredMime?: string;
  category: UploadCategory;
}):
  | {
      ok: true;
      cleanName: string;
      mimeType: string;
      canonicalExt: string;
      sizeBytes: number;
    }
  | { ok: false; error: string; status: number } {
  const { buffer, originalName, category } = params;
  const cleanName = sanitizeOriginalFilename(originalName);
  const sizeBytes = buffer.length;

  // Enforce strict 20 MB upper bound, ZERO minimum limit
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: FILE_TOO_LARGE_ERROR, status: 413 };
  }

  const policy = UPLOAD_CATEGORY_POLICIES[category];
  const ext = path.extname(cleanName).toLowerCase();
  if (!ext || !policy.extensions.includes(ext)) {
    return {
      ok: false,
      error: `এই ফিল্ডে শুধুমাত্র ${policy.labelBn} অনুমোদিত।`,
      status: 400,
    };
  }

  // Allow 0-byte CSV files since user requested NO minimum file size limit,
  // while still verifying magic bytes for binary/image/PDF/Office formats.
  if (sizeBytes === 0 && ext === '.csv' && policy.mimes.includes('text/csv')) {
    return {
      ok: true,
      cleanName,
      mimeType: 'text/csv',
      canonicalExt: '.csv',
      sizeBytes: 0,
    };
  }

  const detected = detectTrueMimeFromBuffer(buffer, ext, category === 'logo');
  if (!detected.ok) {
    return { ok: false, error: detected.error, status: 400 };
  }

  if (!policy.mimes.includes(detected.mime)) {
    return {
      ok: false,
      error: `এই ফিল্ডে শুধুমাত্র ${policy.labelBn} অনুমোদিত।`,
      status: 400,
    };
  }

  return {
    ok: true,
    cleanName,
    mimeType: detected.mime,
    canonicalExt: MIME_TO_CANONICAL_EXT[detected.mime] || detected.canonicalExt,
    sizeBytes,
  };
}

export const UPLOADED_ASSET_URL_RE = /^\/api\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUploadedAssetUrl(val: unknown): boolean {
  return typeof val === 'string' && UPLOADED_ASSET_URL_RE.test(val.trim());
}

export function sanitizeStoredImageRef(url: unknown, allowSvg = false): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/src/assets/images/')) return trimmed;
  if (UPLOADED_ASSET_URL_RE.test(trimmed)) return trimmed;
  if (trimmed.length > MAX_BASE64_DATA_URL_LENGTH) return '';

  const raster = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(trimmed);
  if (raster) {
    const rawBuf = Buffer.from(raster[2], 'base64');
    if (rawBuf.length > MAX_FILE_SIZE_BYTES) return '';
    return trimmed;
  }

  if (allowSvg) {
    const svg = /^data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)$/.exec(trimmed);
    if (svg) {
      const rawBuf = Buffer.from(svg[1], 'base64');
      if (rawBuf.length > MAX_FILE_SIZE_BYTES) return '';
      const check = isSafeSvgText(rawBuf.toString('utf8'));
      if (check.ok) return trimmed;
    }
  }

  return '';
}

export function sanitizeStoredAttachmentRef(
  rawName: unknown,
  rawData: unknown
): { name: string; data: string } {
  const name = sanitizeOriginalFilename(rawName || 'attachment');
  const data = String(rawData || '').trim();
  if (!data) return { name: '', data: '' };

  if (UPLOADED_ASSET_URL_RE.test(data)) {
    return { name: rawName ? name : 'attachment', data };
  }

  if (data.length > MAX_BASE64_DATA_URL_LENGTH) {
    return { name: '', data: '' };
  }

  const allowedDataUrl =
    /^data:(image\/(png|jpeg|jpg|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/csv);base64,([A-Za-z0-9+/=]+)$/.exec(
      data
    );
  if (allowedDataUrl) {
    const decodedLen = Buffer.byteLength(allowedDataUrl[3], 'base64');
    if (decodedLen <= MAX_FILE_SIZE_BYTES) {
      return { name: rawName ? name : 'attachment', data };
    }
  }
  return { name: '', data: '' };
}
