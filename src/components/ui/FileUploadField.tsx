import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import {
  formatFileSize,
  isImageAssetUrl,
  MAX_FILE_SIZE_HINT,
  UPLOAD_PRESETS,
  uploadFileWithProgress,
  type UploadCategory,
  type UploadedFileResult,
} from '../../lib/upload';

interface FileUploadFieldProps {
  category: UploadCategory;
  module: string;
  buttonLabel: string;
  valueUrl?: string;
  valueName?: string;
  previewFallbackUrl?: string;
  showImagePreview?: boolean;
  previewClassName?: string;
  helperText?: string;
  compact?: boolean;
  disabled?: boolean;
  onUploaded: (result: UploadedFileResult) => void;
  onClear?: () => void;
  onError?: (message: string) => void;
}

export function FileUploadField({
  category,
  module,
  buttonLabel,
  valueUrl = '',
  valueName = '',
  previewFallbackUrl,
  showImagePreview = false,
  previewClassName = 'w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700',
  helperText,
  compact = false,
  disabled = false,
  onUploaded,
  onClear,
  onError,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [lastUploadedMeta, setLastUploadedMeta] = useState<{ name: string; size: number } | null>(null);

  const preset = UPLOAD_PRESETS[category];
  const displayPreview = valueUrl || previewFallbackUrl || '';
  const hasFile = Boolean(valueUrl);
  const isImg = showImagePreview || category === 'image' || category === 'logo' || isImageAssetUrl(valueUrl, valueName);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');
    setUploading(true);
    setProgress(5);
    try {
      const result = await uploadFileWithProgress(file, {
        category,
        module,
        onProgress: (pct) => setProgress(pct),
      });
      setLastUploadedMeta({ name: result.original_name, size: result.size_bytes });
      onUploaded(result);
    } catch (err: any) {
      const msg = err?.message || 'ফাইল আপলোড ব্যর্থ হয়েছে।';
      setError(msg);
      onError?.(msg);
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 600);
    }
  };

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className="flex items-center gap-3 flex-wrap">
        {showImagePreview && displayPreview && (
          <img
            src={displayPreview}
            alt={valueName || 'Preview'}
            referrerPolicy="no-referrer"
            className={previewClassName}
          />
        )}

        <div className="flex-1 min-w-[180px] space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <label
              className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors ${
                disabled || uploading ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
              }`}
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6D28D9]" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{uploading ? `আপলোড হচ্ছে... ${progress}%` : buttonLabel}</span>
              <input
                ref={inputRef}
                type="file"
                accept={preset.accept}
                disabled={disabled || uploading}
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {hasFile && onClear && (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => {
                  setError('');
                  setLastUploadedMeta(null);
                  onClear();
                }}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 border border-red-200 dark:border-red-900/50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                সরান
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-600 dark:text-slate-300">{MAX_FILE_SIZE_HINT}</span>
            {' · '}
            <span>{preset.labelBn}</span>
            {helperText ? ` — ${helperText}` : ''}
          </p>
        </div>
      </div>

      {uploading && (
        <div className="space-y-1">
          <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#6D28D9] transition-all duration-150 rounded-full"
              style={{ width: `${Math.max(8, progress)}%` }}
            />
          </div>
          <div className="text-[11px] text-[#6D28D9] dark:text-violet-400 font-medium">
            ফাইল আপলোড ও যাচাই চলছে... ({progress}%)
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!uploading && hasFile && (!showImagePreview || !isImg) && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate font-medium text-slate-700 dark:text-slate-200">
              {valueName || lastUploadedMeta?.name || 'আপলোডকৃত ফাইল'}
            </span>
            {lastUploadedMeta && (
              <span className="text-[11px] text-slate-500 shrink-0 font-mono-num">
                ({formatFileSize(lastUploadedMeta.size)})
              </span>
            )}
          </div>
          <a
            href={valueUrl.startsWith('/api/uploads/') ? `${valueUrl}?download=1` : valueUrl}
            download={valueName || 'attachment'}
            className="inline-flex items-center gap-1 text-[#6D28D9] dark:text-violet-400 hover:underline font-medium shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            ডাউনলোড
          </a>
        </div>
      )}
    </div>
  );
}
