import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, User, Moon, Sun, ShieldCheck, ExternalLink } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useApp } from '../context/AppContext';

export function SuperAdminLoginPage() {
  const { setSession, theme, toggleTheme, toast, effectiveAppLogo } = useApp();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checking, setChecking] = useState(true);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // First-run Super Admin Setup State
  const [setupName, setSetupName] = useState('সুপার অ্যাডমিন');
  const [setupUser, setSetupUser] = useState('superadmin');
  const [setupPass, setSetupPass] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');

  useEffect(() => {
    apiFetch<{ needsSetup: boolean }>('/api/auth/bootstrap-status', { skipAuth: true })
      .then((res) => setNeedsSetup(res.needsSetup))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const handleSuperLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!username.trim() || !password) {
      setErrorMsg('সুপার অ্যাডমিন ইউজারনেম এবং পাসওয়ার্ড প্রদান করুন।');
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFetch('/api/auth/super-admin/login', {
        method: 'POST',
        body: { username: username.trim(), password },
        skipAuth: true,
      });
      setSession(data.token, data.user, null);
      toast('success', `স্বাগতম, ${data.user.full_name}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'সুপার অ্যাডমিন লগইন ব্যর্থ হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (setupPass.length < 4) {
      setErrorMsg('পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।');
      return;
    }
    if (setupPass !== setupConfirm) {
      setErrorMsg('পাসওয়ার্ড এবং নিশ্চিতকরণ পাসওয়ার্ড মিলছে না।');
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFetch('/api/auth/bootstrap-superadmin', {
        method: 'POST',
        body: {
          full_name: setupName.trim() || 'সুপার অ্যাডমিন',
          username: setupUser.trim(),
          password: setupPass,
        },
        skipAuth: true,
      });
      setSession(data.token, data.user, null);
      toast('success', 'সুপার অ্যাডমিন অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে');
    } catch (err: any) {
      setErrorMsg(err.message || 'অ্যাকাউন্ট তৈরি করা যায়নি।');
    } finally {
      setSubmitting(false);
    }
  };

  const openInstitutionLogin = () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#0B1120] text-slate-100 p-6 sm:p-10">
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={effectiveAppLogo}
            alt="DARUL IDARAH"
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-xl object-cover border border-amber-400/40"
          />
          <div>
            <div className="font-display text-base font-bold tracking-tight text-white">
              DARUL IDARAH
            </div>
            <div className="text-[11px] text-amber-300">প্ল্যাটফর্ম সুপার অ্যাডমিন পোর্টাল</div>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-lg border border-slate-800 text-slate-300 hover:bg-slate-900 transition-colors cursor-pointer"
          aria-label="থিম পরিবর্তন করুন"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="w-full max-w-md mx-auto my-10">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-7 sm:p-8 shadow-2xl">
          {checking ? (
            <div className="space-y-4">
              <div className="h-7 w-48 bg-slate-800 rounded animate-pulse" />
              <div className="h-4 w-64 bg-slate-800 rounded animate-pulse" />
              <div className="h-11 w-full bg-slate-800 rounded-lg animate-pulse mt-6" />
              <div className="h-11 w-full bg-slate-800 rounded-lg animate-pulse" />
            </div>
          ) : needsSetup ? (
            <form onSubmit={handleBootstrap} className="space-y-5">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                  প্রথমবার প্ল্যাটফর্ম সেটআপ
                </div>
                <h1 className="text-xl font-bold text-white">সুপার অ্যাডমিন অ্যাকাউন্ট তৈরি করুন</h1>
                <p className="text-xs text-slate-400">
                  দারুল ইদারা প্ল্যাটফর্ম পরিচালনা শুরু করতে আপনার সুপার অ্যাডমিন ইউজারনেম এবং পাসওয়ার্ড নির্ধারণ করুন।
                </p>
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-lg bg-red-950/60 border border-red-900 text-xs text-red-300">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">সুপার অ্যাডমিনের নাম</label>
                <input
                  type="text"
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/40 focus:border-[#6D28D9]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">ইউজারনেম</label>
                <input
                  type="text"
                  value={setupUser}
                  onChange={(e) => setSetupUser(e.target.value)}
                  placeholder="superadmin"
                  required
                  autoComplete="username"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/40 focus:border-[#6D28D9]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">পাসওয়ার্ড (কমপক্ষে ৪ অক্ষর)</label>
                <input
                  type="password"
                  value={setupPass}
                  onChange={(e) => setSetupPass(e.target.value)}
                  required
                  minLength={4}
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/40 focus:border-[#6D28D9]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">পাসওয়ার্ড নিশ্চিত করুন</label>
                <input
                  type="password"
                  value={setupConfirm}
                  onChange={(e) => setSetupConfirm(e.target.value)}
                  required
                  minLength={4}
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/40 focus:border-[#6D28D9]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-lg bg-[#047857] hover:bg-[#065F46] text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'সংরক্ষণ হচ্ছে...' : 'সুপার অ্যাডমিন তৈরি ও প্রবেশ করুন'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSuperLogin} className="space-y-5">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                  <ShieldCheck className="w-4 h-4" />
                  সংরক্ষিত সুপার অ্যাডমিন অ্যাক্সেস
                </div>
                <h1 className="text-xl font-bold text-white">সুপার অ্যাডমিন লগইন</h1>
                <p className="text-xs text-slate-400">
                  শুধুমাত্র দারুল ইদারা প্ল্যাটফর্ম সুপার অ্যাডমিনের জন্য। সাধারণ প্রতিষ্ঠান ব্যবহারকারী এখানে প্রবেশ করতে পারবেন না।
                </p>
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-lg bg-red-950/60 border border-red-900 text-xs text-red-300">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label htmlFor="sa-username" className="block text-xs font-medium text-slate-300 mb-1.5">
                    সুপার অ্যাডমিন ইউজারনেম
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="sa-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="সুপার অ্যাডমিন ইউজারনেম"
                      autoComplete="username"
                      required
                      className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-700 bg-slate-950 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/40 focus:border-[#6D28D9]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="sa-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                    পাসওয়ার্ড
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="sa-password"
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="পাসওয়ার্ড লিখুন"
                      autoComplete="current-password"
                      required
                      className="w-full pl-10 pr-11 py-2.5 text-sm rounded-lg border border-slate-700 bg-slate-950 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/40 focus:border-[#6D28D9]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                      aria-label={showPass ? 'লুকান' : 'দেখান'}
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'যাচাই হচ্ছে...' : 'সুপার অ্যাডমিন প্যানেলে প্রবেশ করুন'}
              </button>

              <div className="pt-3 border-t border-slate-800 text-center">
                <button
                  type="button"
                  onClick={openInstitutionLogin}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  প্রতিষ্ঠান ব্যবহারকারী লগইন পোর্টালে যান
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="text-center text-xs text-slate-500">
        © {new Date().getFullYear()} DARUL IDARAH Platform · Secured Super Admin Gateway
      </div>
    </div>
  );
}
