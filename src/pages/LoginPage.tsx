import React, { useState } from 'react';
import { Eye, EyeOff, Lock, User, Moon, Sun } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useApp } from '../context/AppContext';

export function LoginPage() {
  const { setSession, theme, toggleTheme, toast, effectiveAppLogo } = useApp();

  // Unified Institution User Login (Username + Password/PIN only)
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!username.trim() || !password) {
      setErrorMsg('ইউজারনেম এবং পাসওয়ার্ড/পিন প্রদান করুন।');
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { username: username.trim(), password },
        skipAuth: true,
      });
      setSession(data.token, data.user, data.institution || null);
      toast('success', `স্বাগতম, ${data.user.full_name}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'লগইন ব্যর্থ হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-[#F8FAFC] dark:bg-[#0B1120]">
      {/* Left Architectural Panel */}
      <div className="relative hidden lg:flex lg:col-span-6 xl:col-span-7 bg-[#0F172A] overflow-hidden flex-col justify-between p-12 text-white">
        <img
          src="/src/assets/images/login_madrasa_arch_1795577864616.jpg"
          alt="দারুল ইদারা মাদ্রাসা প্রাঙ্গণ"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A]/95 via-[#0F172A]/50 to-[#0F172A]/40" />

        <div className="relative z-10 flex items-center gap-3.5">
          <img
            src={effectiveAppLogo}
            alt="DARUL IDARAH Seal"
            referrerPolicy="no-referrer"
            className="w-12 h-12 rounded-xl object-cover border border-amber-400/40"
          />
          <div>
            <div className="font-display text-lg font-bold tracking-tight text-white">
              DARUL IDARAH
            </div>
            <div className="text-xs text-amber-300">দারুল ইদারা — মাদ্রাসা ব্যবস্থাপনা প্ল্যাটফর্ম</div>
          </div>
        </div>

        <div className="relative z-10 max-w-xl space-y-4">
          <h1 className="text-3xl xl:text-4xl font-bold leading-snug text-balance">
            দ্বীনি শিক্ষাপ্রতিষ্ঠানের পূর্ণাঙ্গ প্রাতিষ্ঠানিক ও একাডেমিক ব্যবস্থাপনা
          </h1>
          <p className="text-sm text-slate-200/90 leading-relaxed">
            একাধিক মাদ্রাসা, বিভাগ ও শ্রেণী রুটিন, অটোমেটিক রোল ও শিক্ষার্থী ভর্তি, উপস্থিতি, পরীক্ষা ও ফলাফল, হিসাব ও রসিদ, দারুল ইকামা এবং লাইব্রেরি — সবকিছু এক নিরাপদ প্ল্যাটফর্মে।
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
            <span>মাল্টি-ইনস্টিটিউশন</span>
            <span aria-hidden="true">·</span>
            <span>রোল-ভিত্তিক নিরাপত্তা</span>
            <span aria-hidden="true">·</span>
            <span>তাৎক্ষণিক নোটিশ</span>
            <span aria-hidden="true">·</span>
            <span>বাংলাদেশী টাকা (৳)</span>
          </div>
        </div>
      </div>

      {/* Right Unified Institution Login Panel */}
      <div className="lg:col-span-6 xl:col-span-5 flex flex-col justify-between p-6 sm:p-10 lg:p-14">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:hidden">
            <img
              src={effectiveAppLogo}
              alt="DARUL IDARAH"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-lg object-cover border border-amber-400/30"
            />
            <span className="font-display font-bold text-base text-[#0F172A] dark:text-white">
              দারুল ইদারা
            </span>
          </div>
          <div className="ml-auto">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 transition-colors cursor-pointer"
              aria-label="থিম পরিবর্তন করুন"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="w-full max-w-md mx-auto my-auto py-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-[#0F172A] dark:text-white">
                লগইন করুন
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                আপনার ইউজারনেম এবং পাসওয়ার্ড/পিন দিন। সিস্টেম স্বয়ংক্রিয়ভাবে আপনার ড্যাশবোর্ডে নিয়ে যাবে।
              </p>
            </div>

            {errorMsg && (
              <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {errorMsg}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  ইউজারনেম (Username)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="আপনার ইউজারনেম লিখুন"
                    autoComplete="username"
                    required
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/30 focus:border-[#6D28D9]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  পাসওয়ার্ড / পিন (Password / PIN)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="আপনার পাসওয়ার্ড অথবা পিন লিখুন"
                    autoComplete="current-password"
                    required
                    className="w-full pl-10 pr-11 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/30 focus:border-[#6D28D9]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
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
              className="w-full py-3 px-4 rounded-lg bg-[#0F172A] dark:bg-[#6D28D9] hover:opacity-95 text-white text-sm font-semibold transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'যাচাই হচ্ছে...' : 'লগইন করুন'}
            </button>

            <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 leading-relaxed">
              পাসওয়ার্ড ভুলে গেলে বা অ্যাকাউন্ট সংক্রান্ত সহায়তার জন্য আপনার প্রতিষ্ঠানের প্রশাসকের সাথে যোগাযোগ করুন।
            </p>
          </form>
        </div>

        <div className="text-center text-xs text-slate-500 dark:text-slate-500">
          © {new Date().getFullYear()} DARUL IDARAH (দারুল ইদারা) · সর্বস্বত্ব সংরক্ষিত
        </div>
      </div>
    </div>
  );
}

