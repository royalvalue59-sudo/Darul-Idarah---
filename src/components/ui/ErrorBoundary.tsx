import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from '../../lib/firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  isQuotaError: boolean;
  isDailyReadQuota: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      isQuotaError: false,
      isDailyReadQuota: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const raw = error?.message || 'অপ্রত্যাশিত ত্রুটি ঘটেছে।';
    let parsedMessage = raw;
    try {
      const json = JSON.parse(raw);
      if (json && typeof json.error === 'string') {
        parsedMessage = `${json.error} (${json.operationType || 'operation'} · ${json.path || 'firestore'})`;
      }
    } catch {
      // Plain error string
    }
    const isQuotaError = parsedMessage.includes('Quota exceeded');
    const isDailyReadQuota = parsedMessage.includes(
      "Free daily read units per project (free tier database)"
    );
    return {
      hasError: true,
      message: parsedMessage,
      isQuotaError,
      isDailyReadQuota,
    };
  }

  componentDidCatch(error: Error) {
    console.error('Application ErrorBoundary caught:', error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const upgradeUrl = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`;

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#0B1120] p-6">
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              সিস্টেমে একটি ত্রুটি ঘটেছে
            </h2>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 break-words">
            {this.state.isQuotaError
              ? 'ফায়ারস্টোরের দৈনিক ফ্রি কোটা পূর্ণ হয়েছে। আগামীকাল কোটা পুনরায় রিসেট হবে অথবা আপনি Firebase কনসোল থেকে প্ল্যান আপগ্রেড করতে পারেন।'
              : this.state.message}
          </p>

          {this.state.isDailyReadQuota && (
            <a
              href={upgradeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs font-semibold text-[#6D28D9] dark:text-violet-400 underline"
            >
              Firebase কনসোলে ডাটাবেস আপগ্রেড দেখুন
            </a>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                this.setState({
                  hasError: false,
                  message: '',
                  isQuotaError: false,
                  isDailyReadQuota: false,
                });
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] text-white transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              পুনরায় চেষ্টা করুন
            </button>
          </div>
        </div>
      </div>
    );
  }
}
