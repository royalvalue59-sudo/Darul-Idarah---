// Auth token is kept strictly in module memory (never localStorage or sessionStorage)
let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

export class ApiError extends Error {
  status: number;
  data?: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T = any>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    skipAuth?: boolean;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (!options.skipAuth && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || 'অপ্রত্যাশিত সার্ভার উত্তর।' };
  }

  if (!res.ok) {
    if (res.status === 401 && !options.skipAuth && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(data?.error || 'অনুরোধ সম্পন্ন করা যায়নি।', res.status, data);
  }

  return data as T;
}

export function formatBDT(amount: number | string | null | undefined): string {
  const num = Number(amount || 0);
  return `৳${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDateDMY(input: string | null | undefined): string {
  if (!input) return '—';
  // If YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split('-');
    return `${d}-${m}-${y}`;
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const year = parts.find((p) => p.type === 'year')?.value || '2026';
  return `${day}-${month}-${year}`;
}

export function formatDateTimeDMY(input: string | null | undefined): string {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  const datePart = formatDateDMY(input);
  const timePart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return `${datePart}, ${timePart}`;
}

export function getTodayDhakaYMD(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 20 * 1024 * 1024) {
      reject(new Error('ফাইলের সর্বোচ্চ সাইজ ২০ MB হতে পারবে। অনুগ্রহ করে ছোট ফাইল নির্বাচন করুন।'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('ফাইল পড়া যায়নি।'));
    reader.readAsDataURL(file);
  });
}

export function exportRowsToCsv(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = r[h] === null || r[h] === undefined ? '' : String(r[h]);
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(',')
    ),
  ];
  const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
