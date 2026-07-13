"use client";

import { useState, useMemo } from "react";
import { Link, useNavigate } from "@/shell/nav";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  Building2,
  Phone,
  User as UserIcon,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form/form-field";
import { useRegisterMutation } from "@/features/auth/api/auth.api";
import { useAppDispatch } from "@/store/hooks";
import { setCredentials } from "@/store/auth.slice";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";
import { getDefaultLandingForRole } from "@/lib/permissions/route-permissions";
import { AuthBrandPanel } from "@/components/shared/auth/AuthBrandPanel";
import { AuthMobileBrand } from "@/components/shared/auth/AuthMobileBrand";

const PASSWORD_RULES = [
  { test: (v: string) => v.length >= 8, label: "At least 8 characters" },
  { test: (v: string) => /[A-Z]/.test(v), label: "1 uppercase letter" },
  { test: (v: string) => /[0-9]/.test(v), label: "1 number" },
];

/**
 * Self-service tenant registration — creates a new tenant + owner account in one
 * request. On success credentials are stored immediately so the user lands in their
 * dashboard without a second login round-trip. The inline password strength meter is
 * UX-only; the backend enforces the same rules independently.
 */
export default function RegisterPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [register, { isLoading }] = useRegisterMutation();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    businessEmail: "",
    businessPhone: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Derived state ──────────────────────────────────────────────────────────
  const passedRules = useMemo(
    () => PASSWORD_RULES.filter((r) => r.test(form.password)).length,
    [form.password],
  );

  const strengthPercent = (passedRules / PASSWORD_RULES.length) * 100;
  const strengthColor =
    passedRules >= 3
      ? "var(--color-success-500)"
      : passedRules >= 2
        ? "var(--color-warning-500)"
        : "var(--color-danger-500)";
  const strengthLabel =
    passedRules >= 3 ? "Strong" : passedRules >= 2 ? "Medium" : passedRules >= 1 ? "Weak" : "";

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.businessName) errs.businessName = "Required";
    if (!form.businessEmail) errs.businessEmail = "Required";
    if (!form.firstName) errs.firstName = "Required";
    if (!form.lastName) errs.lastName = "Required";
    if (!form.email) errs.email = "Required";
    if (form.password.length < 8) errs.password = "Min 8 characters";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      const data = await register(form).unwrap();
      dispatch(setCredentials(data));
      showSuccess("Account created successfully");
      navigate(getDefaultLandingForRole(data.user?.role));
    } catch (err) {
      showApiError(err);
    }
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-900">
      <AuthBrandPanel
        badge="Free 14-day trial"
        brandName="RX POS"
        tagline="Join 2,400+ retailers running their day with RX POS. No credit card required."
        features={[
          "Inventory management across stores",
          "Multi-store support out of the box",
          "Real-time reports & live dashboards",
        ]}
      />

      <div className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-12 bg-white dark:bg-slate-900 overflow-y-auto">
        <div className="w-full max-w-[480px] animate-fade-in">
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
              Create your account
            </h1>
            <p className="text-sm mt-2" style={{ color: "var(--color-slate-500)" }}>
              It only takes a minute. We&apos;ll set everything up for you.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <fieldset className="space-y-4">
              <legend
                className="text-[10px] font-semibold uppercase tracking-widest mb-1"
                style={{ color: "var(--color-slate-400)" }}
              >
                Business Details
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Business Name" error={errors.businessName} required>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none z-10" />
                    <Input
                      placeholder="Acme Corp"
                      value={form.businessName}
                      onChange={set("businessName")}
                      error={!!errors.businessName}
                      className="pl-10 h-12 rounded-xl"
                    />
                  </div>
                </FormField>
                <FormField label="Business Email" error={errors.businessEmail} required>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none z-10" />
                    <Input
                      type="email"
                      placeholder="info@acme.com"
                      value={form.businessEmail}
                      onChange={set("businessEmail")}
                      error={!!errors.businessEmail}
                      className="pl-10 h-12 rounded-xl"
                    />
                  </div>
                </FormField>
              </div>
              <FormField label="Business Phone">
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none z-10" />
                  <Input
                    placeholder="+1 555 000 0000"
                    value={form.businessPhone}
                    onChange={set("businessPhone")}
                    className="pl-10 h-12 rounded-xl"
                  />
                </div>
              </FormField>
            </fieldset>

            <div className="h-px" style={{ background: "var(--color-slate-100)" }} />

            <fieldset className="space-y-4">
              <legend
                className="text-[10px] font-semibold uppercase tracking-widest mb-1"
                style={{ color: "var(--color-slate-400)" }}
              >
                Your Account
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="First Name" error={errors.firstName} required>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none z-10" />
                    <Input
                      placeholder="John"
                      value={form.firstName}
                      onChange={set("firstName")}
                      error={!!errors.firstName}
                      className="pl-10 h-12 rounded-xl"
                      autoComplete="given-name"
                    />
                  </div>
                </FormField>
                <FormField label="Last Name" error={errors.lastName} required>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none z-10" />
                    <Input
                      placeholder="Doe"
                      value={form.lastName}
                      onChange={set("lastName")}
                      error={!!errors.lastName}
                      className="pl-10 h-12 rounded-xl"
                      autoComplete="family-name"
                    />
                  </div>
                </FormField>
              </div>
              <FormField label="Your Email" error={errors.email} required>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none z-10" />
                  <Input
                    type="email"
                    placeholder="you@acme.com"
                    value={form.email}
                    onChange={set("email")}
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
                    placeholder="Create a strong password"
                    value={form.password}
                    onChange={set("password")}
                    error={!!errors.password}
                    className="pl-10 pr-10 h-12 rounded-xl"
                    autoComplete="new-password"
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

                {/* Strength meter */}
                {form.password.length > 0 && (
                  <div className="mt-2.5">
                    <div
                      className="h-1.5 w-full rounded-full overflow-hidden"
                      style={{ background: "var(--color-slate-100)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-300 ease-out"
                        style={{
                          width: `${strengthPercent}%`,
                          background: strengthColor,
                        }}
                      />
                    </div>
                    {strengthLabel && (
                      <p
                        className="text-[11px] font-medium mt-1.5 transition-colors"
                        style={{ color: strengthColor }}
                      >
                        {strengthLabel} password
                      </p>
                    )}
                  </div>
                )}

                <ul className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {PASSWORD_RULES.map((r) => {
                    const ok = r.test(form.password);
                    return (
                      <li
                        key={r.label}
                        className="flex items-center gap-1.5 text-[11px] transition-colors"
                        style={{
                          color: ok ? "var(--color-success-600)" : "var(--color-slate-400)",
                        }}
                      >
                        <CheckCircle2 className={`h-3 w-3 ${ok ? "" : "opacity-40"}`} />
                        {r.label}
                      </li>
                    );
                  })}
                </ul>
              </FormField>
            </fieldset>

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
                  Create Account
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm mt-7" style={{ color: "var(--color-slate-600)" }}>
            Already have an account?{" "}
            <Link
              href={ROUTES.LOGIN}
              className="text-primary-600 dark:text-primary-300 font-semibold hover:text-primary-700 transition-colors inline-flex items-center gap-1"
            >
              Sign in
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </p>

          <p className="mt-8 text-center text-[11px]" style={{ color: "var(--color-slate-400)" }}>
            Trusted by 2,400+ retailers
          </p>
        </div>
      </div>
    </div>
  );
}
