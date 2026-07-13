"use client";

import { useState } from "react";
import { useNavigate } from "@/shell/nav";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ShieldCheck,
  UserCog,
  User,
  UserRound,
  Briefcase,
  FlaskConical,
  ArrowRight,
  Zap,
  Copy,
  Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form/form-field";
import { useLoginMutation } from "@/features/auth/api/auth.api";
import { useAppDispatch } from "@/store/hooks";
import { setCredentials } from "@/store/auth.slice";
import { baseApi } from "@/store/base-api";
import { showApiError } from "@/lib/api/error-handler";
import { getDefaultLandingForRole } from "@/lib/permissions/route-permissions";
import { AuthBrandPanel } from "@/components/shared/auth/AuthBrandPanel";
import { AuthMobileBrand } from "@/components/shared/auth/AuthMobileBrand";

const TEST_MODE_ENABLED =
  process.env.NEXT_PUBLIC_TEST_MODE === "true" || process.env.NEXT_PUBLIC_TEST_MODE === "1";

const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const DEMO_PASSWORD = "demo1234";

type TestRole = "admin" | "manager" | "cashier" | "hr" | "employee";

const TEST_ACCOUNTS: Array<{
  role: TestRole;
  label: string;
  hint: string;
  email?: string;
  icon: React.ReactNode;
  accent: string;
}> = [
  {
    role: "admin",
    label: "Admin",
    hint: "Full access",
    email: process.env.NEXT_PUBLIC_TEST_ADMIN_EMAIL,
    icon: <ShieldCheck className="h-4 w-4" />,
    accent: "from-primary-500 to-accent-500",
  },
  {
    role: "manager",
    label: "Manager",
    hint: "Store level",
    email: process.env.NEXT_PUBLIC_TEST_MANAGER_EMAIL,
    icon: <UserCog className="h-4 w-4" />,
    accent: "from-amber-500 to-orange-500",
  },
  {
    role: "cashier",
    label: "Cashier",
    hint: "POS only",
    email: process.env.NEXT_PUBLIC_TEST_CASHIER_EMAIL,
    icon: <User className="h-4 w-4" />,
    accent: "from-emerald-500 to-teal-500",
  },
  {
    role: "hr",
    label: "HR Manager",
    hint: "Human Resources",
    email: process.env.NEXT_PUBLIC_TEST_HR_EMAIL,
    icon: <Briefcase className="h-4 w-4" />,
    accent: "from-violet-500 to-purple-500",
  },
  {
    role: "employee",
    label: "Employee",
    hint: "Self-service",
    email: process.env.NEXT_PUBLIC_TEST_EMPLOYEE_EMAIL,
    icon: <UserRound className="h-4 w-4" />,
    accent: "from-sky-500 to-cyan-500",
  },
];

const DEMO_ACCOUNTS = [
  {
    role: "Admin",
    email: "admin@rxpos.com",
    hint: "All Stores",
    icon: <ShieldCheck className="h-4 w-4" />,
    color: "text-primary-600 dark:text-primary-300 bg-primary-50 dark:bg-primary-500/15",
  },
  {
    role: "Manager",
    email: "manager.main@rxpos.com",
    hint: "Main Store",
    icon: <UserCog className="h-4 w-4" />,
    color: "text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15",
  },
  {
    role: "Cashier",
    email: "cashier1@rxpos.com",
    hint: "Main Store",
    icon: <User className="h-4 w-4" />,
    color: "text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15",
  },
  {
    role: "HR Manager",
    email: "hr@rxpos.com",
    hint: "Human Resources",
    icon: <Briefcase className="h-4 w-4" />,
    color: "text-violet-600 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/15",
  },
  {
    role: "Employee",
    email: "employee1@rxpos.com",
    hint: "Self-service",
    icon: <UserRound className="h-4 w-4" />,
    color: "text-sky-600 dark:text-sky-300 bg-sky-50 dark:bg-sky-500/15",
  },
];

/**
 * Login page — entry point for all roles.
 * On success: stores credentials in Redux, resets stale RTK-Query cache,
 * then redirects to each role's default landing via `getDefaultLandingForRole`.
 * In demo mode shows clickable role cards; in test mode shows env-backed accounts.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [login, { isLoading }] = useLoginMutation();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copiedPassword, setCopiedPassword] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.email) errs.email = "Email is required";
    if (!form.password) errs.password = "Password is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      const data = await login(form).unwrap();
      dispatch(setCredentials(data));
      // Reset stale cache from the previous session before entering the dashboard.
      // This is done here (after login, before navigation) rather than on logout
      // so that no dashboard subscriptions are active when the reset fires,
      // preventing a spurious /auth/me refetch that would poison the cache.
      dispatch(baseApi.util.resetApiState());
      navigate(getDefaultLandingForRole(data.user?.role));
    } catch (err) {
      showApiError(err);
    }
  };

  const handleTestLogin = (role: TestRole) => {
    const account = TEST_ACCOUNTS.find((a) => a.role === role);
    if (!account?.email) {
      showApiError(
        new Error(
          `Missing test email for ${role}. Set NEXT_PUBLIC_TEST_${role.toUpperCase()}_EMAIL.`,
        ),
      );
      return;
    }
    // Pre-fill the email only — the password is intentionally not bundled in
    // the frontend, so the tester enters it manually before signing in.
    setForm({ email: account.email, password: "" });
    setErrors({});
  };

  const handleCopyPassword = async () => {
    // Copies the public demo password to the clipboard for convenience. It is
    // never written into the form or submitted automatically — the user pastes
    // it and clicks Sign In themselves.
    try {
      await navigator.clipboard.writeText(DEMO_PASSWORD);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    } catch {
      showApiError(new Error("Failed to copy demo password"));
    }
  };

  const handleDemoLogin = (email: string) => {
    // Pre-fill the email only — the demo password is intentionally not bundled
    // in the frontend, so the user enters it manually from the documentation.
    setForm({ email, password: "" });
    setErrors({});
  };

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-900">
      <AuthBrandPanel
        badge="Premium POS"
        tagline="One workspace for sales, inventory, customers and reporting — designed to feel effortless on every device."
        features={[
          "Lightning fast checkout in under 3 seconds",
          "Real-time analytics for every store",
          "Bank-grade security & role-based access",
        ]}
      />

      <div className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-12 bg-white dark:bg-slate-900">
        <div className="w-full max-w-[420px] animate-fade-in">
          <AuthMobileBrand />

          <div className="text-center sm:text-left mb-8">
            <h1
              className="font-bold tracking-tight"
              style={{
                fontSize: "28px",
                color: "var(--color-slate-900)",
                lineHeight: 1.2,
              }}
            >
              Welcome back
            </h1>
            <p className="text-sm mt-2" style={{ color: "var(--color-slate-500)" }}>
              Sign in to continue to your workspace
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <FormField label="Email Address" error={errors.email} required>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none z-10" />
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  error={!!errors.email}
                  className="pl-10 h-12 rounded-xl"
                  autoComplete="email"
                />
              </div>
            </FormField>

            <FormField label="Password" error={errors.password} required>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none z-10" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  error={!!errors.password}
                  className="pl-10 pr-10 h-12 rounded-xl"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 rounded-md z-10"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </FormField>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-primary-600 dark:text-primary-300 focus:ring-primary-500"
                />
                Remember me
              </label>
              <button
                type="button"
                className="font-medium text-primary-600 dark:text-primary-300 hover:text-primary-700"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-xl text-white font-semibold text-sm tracking-wide transition-all duration-150 hover:opacity-95 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-accent-500) 100%)",
                boxShadow:
                  "0 8px 24px -8px rgba(35,54,153,0.45), 0 4px 12px -4px rgba(2,188,245,0.35)",
              }}
            >
              {isLoading ? (
                <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {IS_DEMO_MODE && (
            <div className="mt-5 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-slate-50/40 p-4 sm:p-5">
              <div className="flex items-center gap-2.5 mb-3.5">
                <div
                  className="h-8 w-8 rounded-xl text-white flex items-center justify-center shadow-sm shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #233699 0%, #02bcf5 100%)",
                  }}
                >
                  <Zap className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-none">
                    Demo Credentials
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Click any role to fill the email, then sign in with the password above.
                  </p>
                </div>
              </div>
              {/* Public demo password hint — shown only, never auto-filled */}
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    All demo account passwords
                  </p>
                  <p className="font-mono text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100">
                    {DEMO_PASSWORD}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  title="Copy demo password"
                  aria-label="Copy demo password"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 shrink-0 transition-colors hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-800 dark:hover:text-slate-100"
                >
                  {copiedPassword ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-success-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((acc) => {
                  return (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => handleDemoLogin(acc.email)}
                      disabled={isLoading}
                      title={`Fill email for ${acc.role} (${acc.email}) — then sign in with the demo password`}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span
                        className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${acc.color}`}
                      >
                        {acc.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {acc.role}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                          {acc.hint}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {TEST_MODE_ENABLED && (
            <div className="mt-5 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-amber-50/40 p-4 sm:p-5">
              <div className="flex items-center gap-2.5 mb-3.5">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-sm">
                  <FlaskConical className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-none">
                    Test Mode
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Enter the password (demo1234) manually
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {TEST_ACCOUNTS.map((acc) => {
                  const configured = !!acc.email;
                  return (
                    <button
                      key={acc.role}
                      type="button"
                      onClick={() => handleTestLogin(acc.role)}
                      disabled={!configured || isLoading}
                      title={
                        configured
                          ? `Fill email for ${acc.label} (${acc.email}) — enter password manually`
                          : `Set NEXT_PUBLIC_TEST_${acc.role.toUpperCase()}_EMAIL`
                      }
                      className="group relative flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
                    >
                      <span
                        className={`h-9 w-9 rounded-xl bg-gradient-to-br ${acc.accent} text-white flex items-center justify-center shadow-sm`}
                      >
                        {acc.icon}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {acc.label}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-none">
                        {configured ? acc.hint : "Not set"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Registration is invite-only post-setup. No public signup link. */}
          <p className="text-center text-sm mt-7" style={{ color: "var(--color-slate-600)" }}>
            Need access?{" "}
            <span className="font-medium" style={{ color: "var(--color-slate-700)" }}>
              Contact your administrator to be invited.
            </span>
          </p>

          <p className="mt-8 text-center text-[11px]" style={{ color: "var(--color-slate-400)" }}>
            Trusted by 2,400+ retailers
          </p>
        </div>
      </div>
    </div>
  );
}
