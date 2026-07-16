"use client";

import { useState } from "react";

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

import { showApiError } from "@/lib/api/error-handler";

import { AuthBrandPanel } from "@/components/shared/auth/AuthBrandPanel";

import { AuthMobileBrand } from "@/components/shared/auth/AuthMobileBrand";

import { cloudLogin } from "../../../features/cloud-auth/cloud-auth.client";

import {
  isCloudAuthSession,
  isCloudDeviceApprovalPending,
  isCloudMfaRequired,
  isCloudPharmacySelectionRequired,
} from "../../../types/cloud-auth/cloud-auth.types";

import { useNavigate } from "react-router-dom";
import { useAppDispatch } from "@/store/hooks";
import { setCredentials } from "@/store/auth.slice";

// -----------------------------------------------------------------------------
// TEST / DEMO MODE
// -----------------------------------------------------------------------------

const TEST_MODE_ENABLED =
  process.env.NEXT_PUBLIC_TEST_MODE === "true" || process.env.NEXT_PUBLIC_TEST_MODE === "1";

const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const DEMO_PASSWORD = "demo1234";

// -----------------------------------------------------------------------------
// TEST ACCOUNTS
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// DEMO ACCOUNTS
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// LOGIN PAGE
// -----------------------------------------------------------------------------

/**
 * RX POS cloud activation login.
 *
 * The first POS login authenticates against OneRx / RXAdmin.
 *
 * IMPORTANT:
 *
 * A successful cloud session is NOT written to the existing
 * local POS auth slice.
 *
 * RXAdmin access tokens are separate from local POS JWTs.
 *
 * The next step after successful cloud authentication is the
 * local activation/bootstrap bridge.
 */
export default function LoginPage() {
  const navigate = useNavigate();

  const dispatch = useAppDispatch();

  const [isLoading, setIsLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const [copiedPassword, setCopiedPassword] = useState(false);

  // ---------------------------------------------------------------------------
  // VALIDATION
  // ---------------------------------------------------------------------------

  const validate = () => {
    const errs: Record<string, string> = {};

    if (!form.email.trim()) {
      errs.email = "Email is required";
    }

    if (!form.password) {
      errs.password = "Password is required";
    }

    setErrors(errs);

    return Object.keys(errs).length === 0;
  };

  // ---------------------------------------------------------------------------
  // CLOUD LOGIN
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsLoading(true);

    try {
      const result = await cloudLogin({
        email: form.email.trim().toLowerCase(),
        password: form.password.trim(),
      });

      // -----------------------------------------------------------------------
      // DEVICE APPROVAL
      // -----------------------------------------------------------------------

      if (isCloudDeviceApprovalPending(result)) {
        throw new Error(result.message || "This device is waiting for administrator approval.");
      }

      // -----------------------------------------------------------------------
      // MFA
      // -----------------------------------------------------------------------

      if (isCloudMfaRequired(result)) {
        throw new Error(
          result.method
            ? `Multi-factor authentication is required (${result.method}).`
            : "Multi-factor authentication is required.",
        );
      }

      // -----------------------------------------------------------------------
      // PHARMACY SELECTION
      // -----------------------------------------------------------------------

      if (isCloudPharmacySelectionRequired(result)) {
        throw new Error("A pharmacy must be selected before RX POS can continue.");
      }

      // -----------------------------------------------------------------------
      // AUTHENTICATED SESSION
      // -----------------------------------------------------------------------

      if (!isCloudAuthSession(result)) {
        throw new Error("Invalid RXAdmin session.");
      }

      const apiOrigin = window.rxpos?.apiOrigin;

      if (!apiOrigin) {
        throw new Error("Local POS service is unavailable.");
      }

      const response = await fetch(`${apiOrigin}/api/v1/auth/cloud-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: result.user.email,
          password: form.password.trim(),
          firstName: result.user.licenseeFirstName,
          lastName: result.user.licenseeLastName,
          pharmacyId: result.user.pharmacyId,
          pharmacyName: result.user.pharmacyName,
          role: result.user.role,
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? "Local login failed.");
      }

      dispatch(
        setCredentials({
          accessToken: json.data.accessToken,
          user: json.data.user,
          tenant: json.data.tenant,
          isDemoMode: json.data.isDemoMode,
        }),
      );

      navigate("/", {
        replace: true,
      });

      return;
    } catch (err) {
      showApiError(err instanceof Error ? err : new Error("Login failed."));
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // TEST LOGIN
  // ---------------------------------------------------------------------------

  const handleTestLogin = (role: TestRole) => {
    const account = TEST_ACCOUNTS.find((item) => item.role === role);

    if (!account?.email) {
      showApiError(
        new Error(
          `Missing test email for ${role}. Set NEXT_PUBLIC_TEST_${role.toUpperCase()}_EMAIL.`,
        ),
      );

      return;
    }

    setForm({
      email: account.email,

      password: "",
    });

    setErrors({});
  };

  // ---------------------------------------------------------------------------
  // COPY DEMO PASSWORD
  // ---------------------------------------------------------------------------

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(DEMO_PASSWORD);

      setCopiedPassword(true);

      setTimeout(() => setCopiedPassword(false), 2000);
    } catch {
      showApiError(new Error("Failed to copy demo password"));
    }
  };

  // ---------------------------------------------------------------------------
  // DEMO LOGIN
  // ---------------------------------------------------------------------------

  const handleDemoLogin = (email: string) => {
    setForm({
      email,

      password: "",
    });

    setErrors({});
  };

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

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

          {/* --------------------------------------------------------------- */}
          {/* HEADER */}
          {/* --------------------------------------------------------------- */}

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

            <p
              className="text-sm mt-2"
              style={{
                color: "var(--color-slate-500)",
              }}
            >
              Sign in to continue to your workspace
            </p>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* LOGIN FORM */}
          {/* --------------------------------------------------------------- */}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* EMAIL */}

            <FormField label="Email Address" error={errors.email} required>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none z-10" />

                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={(e) => {
                    setForm({
                      ...form,

                      email: e.target.value,
                    });

                    if (errors.email) {
                      setErrors({
                        ...errors,

                        email: "",
                      });
                    }
                  }}
                  error={!!errors.email}
                  className="pl-10 h-12 rounded-xl"
                  autoComplete="email"
                  disabled={isLoading}
                />
              </div>
            </FormField>

            {/* PASSWORD */}

            <FormField label="Password" error={errors.password} required>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none z-10" />

                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(e) => {
                    setForm({
                      ...form,

                      password: e.target.value,
                    });

                    if (errors.password) {
                      setErrors({
                        ...errors,

                        password: "",
                      });
                    }
                  }}
                  error={!!errors.password}
                  className="pl-10 pr-10 h-12 rounded-xl"
                  autoComplete="current-password"
                  disabled={isLoading}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 rounded-md z-10 disabled:opacity-50"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </FormField>

            {/* OPTIONS */}

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  disabled={isLoading}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-primary-600 dark:text-primary-300 focus:ring-primary-500"
                />
                Remember me
              </label>

              <button
                type="button"
                disabled={isLoading}
                className="font-medium text-primary-600 dark:text-primary-300 hover:text-primary-700 disabled:opacity-50"
              >
                Forgot password?
              </button>
            </div>

            {/* SUBMIT */}

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
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* --------------------------------------------------------------- */}
          {/* DEMO MODE */}
          {/* --------------------------------------------------------------- */}

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

              {/* DEMO PASSWORD */}

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
                  disabled={isLoading}
                  title="Copy demo password"
                  aria-label="Copy demo password"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 shrink-0 transition-colors hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-50"
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

              {/* DEMO ACCOUNT CARDS */}

              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => handleDemoLogin(account.email)}
                    disabled={isLoading}
                    title={`Fill email for ${account.role} (${account.email}) — then sign in with the demo password`}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span
                      className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${account.color}`}
                    >
                      {account.icon}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {account.role}
                      </p>

                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {account.hint}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* TEST MODE */}
          {/* --------------------------------------------------------------- */}

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
                {TEST_ACCOUNTS.map((account) => {
                  const configured = !!account.email;

                  return (
                    <button
                      key={account.role}
                      type="button"
                      onClick={() => handleTestLogin(account.role)}
                      disabled={!configured || isLoading}
                      title={
                        configured
                          ? `Fill email for ${account.label} (${account.email}) — enter password manually`
                          : `Set NEXT_PUBLIC_TEST_${account.role.toUpperCase()}_EMAIL`
                      }
                      className="group relative flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
                    >
                      <span
                        className={`h-9 w-9 rounded-xl bg-gradient-to-br ${account.accent} text-white flex items-center justify-center shadow-sm`}
                      >
                        {account.icon}
                      </span>

                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {account.label}
                      </span>

                      <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-none">
                        {configured ? account.hint : "Not set"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* ACCESS MESSAGE */}
          {/* --------------------------------------------------------------- */}

          <p
            className="text-center text-sm mt-7"
            style={{
              color: "var(--color-slate-600)",
            }}
          >
            Need access?{" "}
            <span
              className="font-medium"
              style={{
                color: "var(--color-slate-700)",
              }}
            >
              Contact your administrator to be invited.
            </span>
          </p>

          {/* --------------------------------------------------------------- */}
          {/* FOOTER */}
          {/* --------------------------------------------------------------- */}

          <p
            className="mt-8 text-center text-[11px]"
            style={{
              color: "var(--color-slate-400)",
            }}
          >
            Trusted by 2,400+ retailers
          </p>
        </div>
      </div>
    </div>
  );
}
