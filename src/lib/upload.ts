import { getAuthToken } from './api';

// Global File Upload Policy (matches backend server/uploadPolicy.ts)
export const MAX_UPLOAD_SIZE_MB = 20;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024; // 20,971,520 bytes (exact 20 MB)
export const MIN_UPLOAD_SIZE_BYTES = 0; // No minimum file size limit

export const FILE_TOO_LARGE_ERROR =
  'ফাইলের সর্বোচ্চ সাইজ ২০ MB হতে পারবে। অনুগ্রহ করে ছোট ফাইল নির্বাচন করুন।';

export const MAX_FILE_SIZE_HINT = 'Maximum file size: 20 MB';

export type UploadCategory = 'image' | 'logo' | 'document' | 'spreadsheet' | 'attachment';

export interface UploadPreset {
  accept: string;
  extensions: string[];
  mimes: string[];
  labelBn: string;
}

export const UPLOAD_PRESETS: Record<UploadCategory, UploadPreset> = {
  image: {
    accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
    mimes: ['image/jpeg', 'image/png', 'image/webp'],
    labelBn: 'JPG, JPEG, PNG, WEBP',
  },
  logo: {
    accept: '.jpg,.jpeg,.png,.webp,.svg,image/jpeg,image/png,image/webp,image/svg+xml',
    extensions: ['.jpg', '.jpeg', '.png', '.webp', '.svg'],
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    labelBn: 'PNG, JPG, JPEG, WEBP, SVG',
  },
  document: {
    accept: '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['.pdf', '.doc', '.docx'],
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    labelBn: 'PDF, DOC, DOCX',
  },
  spreadsheet: {
    accept: '.xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv',
    extensions: ['.xls', '.xlsx', '.csv'],
    mimes: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ],
    labelBn: 'XLS, XLSX, CSV',
  },
  attachment: {
    accept:
      '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv',
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
    labelBn: 'JPG, PNG, WEBP, PDF, DOC, DOCX, XLS, XLSX, CSV',
  },
};

export interface UploadedFileResult {
  id: string;
  url: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  category: UploadCategory;
  module: string;
  created_at: string;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileExt(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

/**
 * Validates file name, size (<= 20 MB, no minimum), extension, and actual magic bytes
 * on the frontend before uploading. Backend performs independent full verification.
 */
export async function validateFileClient(
  file: File,
  category: UploadCategory
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!file || !file.name || !file.name.trim()) {
    return { ok: false, error: 'অনুগ্রহ করে একটি বৈধ ফাইল নির্বাচন করুন।' };
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return { ok: false, error: FILE_TOO_LARGE_ERROR };
  }

  const preset = UPLOAD_PRESETS[category];
  const ext = getFileExt(file.name);
  if (!ext || !preset.extensions.includes(ext)) {
    return {
      ok: false,
      error: `এই ফিল্ডে শুধুমাত্র ${preset.labelBn} ফরম্যাট অনুমোদিত।`,
    };
  }

  // Inspect magic bytes (first 16 bytes) so fake/renamed files are caught before uploading
  if (file.size > 0 && ext !== '.csv' && ext !== '.svg') {
    try {
      const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const isJpeg = header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
      const isPng =
        header.length >= 8 &&
        header[0] === 0x89 &&
        header[1] === 0x50 &&
        header[2] === 0x4e &&
        header[3] === 0x47 &&
        header[4] === 0x0d &&
        header[5] === 0x0a &&
        header[6] === 0x1a &&
        header[7] === 0x0a;
      const isWebp =
        header.length >= 12 &&
        header[0] === 0x52 &&
        header[1] === 0x49 &&
        header[2] === 0x46 &&
        header[3] === 0x46 &&
        header[8] === 0x57 &&
        header[9] === 0x45 &&
        header[10] === 0x42 &&
        header[11] === 0x50;
      const isPdf =
        header.length >= 5 &&
        header[0] === 0x25 &&
        header[1] === 0x50 &&
        header[2] === 0x44 &&
        header[3] === 0x46 &&
        header[4] === 0x2d;
      const isOle2 =
        header.length >= 8 &&
        header[0] === 0xd0 &&
        header[1] === 0xcf &&
        header[2] === 0x11 &&
        header[3] === 0xe0 &&
        header[4] === 0xa1 &&
        header[5] === 0xb1 &&
        header[6] === 0x1a &&
        header[7] === 0xe1;
      const isZip =
        header.length >= 4 &&
        header[0] === 0x50 &&
        header[1] === 0x4b &&
        (header[2] === 0x03 || header[2] === 0x05 || header[2] === 0x07);

      const matchesExt =
        ((ext === '.jpg' || ext === '.jpeg') && isJpeg) ||
        (ext === '.png' && isPng) ||
        (ext === '.webp' && isWebp) ||
        (ext === '.pdf' && isPdf) ||
        ((ext === '.doc' || ext === '.xls') && isOle2) ||
        ((ext === '.docx' || ext === '.xlsx') && isZip);

      if (!matchesExt) {
        return {
          ok: false,
          error: 'ফাইলের প্রকৃত ফরম্যাট ও এক্সটেনশন মিলছে না। অনুগ্রহ করে বৈধ ফাইল নির্বাচন করুন।',
        };
      }
    } catch {
      // Fall through to backend verification if slice read fails
    }
  }

  return { ok: true };
}

export async function uploadFileWithProgress(
  file: File,
  options: {
    category: UploadCategory;
    module?: string;
    onProgress?: (percent: number) => void;
  }
): Promise<UploadedFileResult> {
  const check = await validateFileClient(file, options.category);
  if (!check.ok) {
    throw new Error(check.error);
  }

  return new Promise<UploadedFileResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('category', options.category);
    formData.append('module', options.module || 'general');
    formData.append('file', file, file.name);

    xhr.open('POST', '/api/uploads', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    const token = getAuthToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && options.onProgress) {
        const pct = Math.min(99, Math.round((ev.loaded / ev.total) * 100));
        options.onProgress(pct);
      }
    };

    xhr.onload = () => {
      let data: any = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.file?.url) {
        options.onProgress?.(100);
        resolve(data.file as UploadedFileResult);
      } else {
        const errMsg =
          xhr.status === 413
            ? FILE_TOO_LARGE_ERROR
            : data?.error || 'ফাইল আপলোড ব্যর্থ হয়েছে।';
        reject(new Error(errMsg));
      }
    };

    xhr.onerror = () => {
      reject(new Error('নেটওয়ার্ক ত্রুটির কারণে ফাইল আপলোড সম্পন্ন করা যায়নি।'));
    };

    xhr.send(formData);
  });
}

export function isImageAssetUrl(url: string | null | undefined, filename?: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:image/')) return true;
  if (url.startsWith('/src/assets/images/')) return true;
  if (filename && /\.(jpg|jpeg|png|webp|svg)$/i.test(filename)) return true;
  return false;
}
