"use client";

/**
 * Post-registration tenant wizard: business details, owner account, confirmation.
 */

import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "@/shell/nav";
import {
  Mail,
  Lock,
  Building2,
  Phone,
  User as UserIcon,
  Eye,
  EyeOff,
  Key,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Check,
  PartyPopper,
  Rocket,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form/form-field";
import { cn } from "@/lib/utils/cn";
import { useAppDispatch } from "@/store/hooks";
import { setCredentials } from "@/store/auth.slice";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";
import { AuthBrandPanel } from "@/components/shared/auth/AuthBrandPanel";
import { AuthMobileBrand } from "@/components/shared/auth/AuthMobileBrand";
import { useCompleteSetupMutation } from "@/features/setup/api/setup.api";
import { setCachedSetupStatus } from "@/components/shared/setup/setup-cache";

const PASSWORD_RULES = [
  { test: (v: string) => v.length >= 8, label: "At least 8 characters" },
  { test: (v: string) => /[A-Z]/.test(v), label: "1 uppercase letter" },
  { test: (v: string) => /[0-9]/.test(v), label: "1 number" },
];

// Static Unsplash hero; applied as CSS `background-image` (no `next/image` remote patterns).
const SETUP_IMAGE_URL =
  "https://images.unsplash.com/photo-1647427017067?auto=format&fit=crop&w=1470&q=80";

const STEPS = [
  { num: 1, label: "Business" },
  { num: 2, label: "Admin" },
  { num: 3, label: "All set" },
];

const StepIndicator = ({ step, done }: { step: number; done: boolean }) => (
  <div className="flex items-center justify-center mb-8">
    {STEPS.map((s, i) => {
      const stepDone = step > s.num || done;
      const current = step === s.num && !done;
      return (
        <div key={s.num} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all"
              style={{
                background: stepDone
                  ? "linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))"
                  : current
                    ? "white"
                    : "var(--color-slate-100)",
                border: current ? "2px solid var(--color-primary-500)" : "2px solid transparent",
                color: stepDone
                  ? "white"
                  : current
                    ? "var(--color-primary-600)"
                    : "var(--color-slate-400)",
                boxShadow: current ? "0 0 0 4px rgba(35,54,153,0.1)" : "none",
              }}
            >
              {stepDone ? <Check className="h-4 w-4" /> : s.num}
            </div>
            <span
              className="text-[10px] font-medium mt-1.5"
              style={{
                color: current || stepDone ? "var(--color-slate-700)" : "var(--color-slate-400)",
              }}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className="h-0.5 w-12 sm:w-16 mx-1 mt-[-18px] rounded-full transition-all"
              style={{
                background: stepDone
                  ? "linear-gradient(90deg, var(--color-primary-500), var(--color-accent-500))"
                  : "var(--color-slate-200)",
              }}
            />
          )}
        </div>
      );
    })}
  </div>
);

/**
 * First-run setup wizard — runs once on a freshly deployed instance.
 * Step 1: business details + server-side `accessCode` (set via SETUP_ACCESS_CODE env var;
 *   prevents unauthorized bootstrapping of an unprotected deployment).
 * Step 2: admin user creation (becomes the tenant super-admin).
 * Step 3: success confirmation + redirect to dashboard.
 * On completion the local setup-status cache is updated so middleware stops
 * redirecting to /setup before the next server response arrives.
 */
export default function SetupPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [completeSetup, { isLoading }] = useCompleteSetupMutation();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [showPassword, setShowPassword] = useState(false);
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    businessEmail: "",
    businessPhone: "",
    accessCode: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // SN-5 OPS-1: on a store-node (desktop shell), the backend's
  // SETUP_ACCESS_CODE is generated locally and has no "server administrator"
  // to hand it to the operator separately — the desktop preload surfaces it
  // via window.rxpos.setup.accessCode (undefined/null on plain web/PWA,
  // where the manual field below behaves exactly as before). Read in an
  // effect (not inline) so server-rendered/first-client-render markup always
  // starts empty and there's no SSR/CSR hydration mismatch.
  const [desktopAccessCode, setDesktopAccessCode] = useState<string | null>(null);

  useEffect(() => {
    const code = window.rxpos?.setup?.accessCode;
    if (code) {
      setDesktopAccessCode(code);
      setForm((f) => (f.accessCode ? f : { ...f, accessCode: code }));
    }
  }, []);

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

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  // ── Derived state ──────────────────────────────────────────────────────────
  // Strength is also blocked in validateStep — allRules must pass before
  // step 2 can proceed, giving consistent frontend + backend enforcement.

  // ── Handlers ───────────────────────────────────────────────────────────────

  const validateStep = (s: number) => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!form.businessName) errs.businessName = "Required";
      if (!form.businessEmail) errs.businessEmail = "Required";
      if (!form.accessCode) errs.accessCode = "Required";
    } else if (s === 2) {
      if (!form.firstName) errs.firstName = "Required";
      if (!form.lastName) errs.lastName = "Required";
      if (!form.email) errs.email = "Required";
      if (form.password.length < 8) errs.password = "Min 8 characters";
      else if (passedRules < 3) errs.password = "Password is too weak";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setDirection("forward");
    setStep((s) => s + 1);
  };

  const goBack = () => {
    setDirection("back");
    setErrors({});
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(2)) return;
    try {
      const data = await completeSetup(form).unwrap();
      dispatch(setCredentials(data));
      // Mark setup done in local cache so the setup-guard middleware stops
      // redirecting before the server responds on the next page load.
      setCachedSetupStatus({ setupRequired: false });
      showSuccess("Setup complete!");
      setDone(true);
      setDirection("forward");
      setStep(3);
    } catch (err) {
      showApiError(err);
    }
  };

  const wizardChecklist = (
    <ul className="space-y-3 max-w-md">
      {STEPS.map((s) => {
        const stepDone = step > s.num || done;
        const current = step === s.num && !done;
        return (
          <li key={s.num} className="flex items-center gap-3">
            <span
              className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-all"
              style={{
                background: stepDone
                  ? "linear-gradient(135deg, var(--color-accent-400), var(--color-primary-500))"
                  : current
                    ? "rgba(255,255,255,0.18)"
                    : "rgba(255,255,255,0.08)",
                border: current
                  ? "1px solid rgba(255,255,255,0.55)"
                  : "1px solid rgba(255,255,255,0.18)",
                boxShadow: stepDone ? "0 4px 14px rgba(2,188,245,0.35)" : "none",
              }}
            >
              {stepDone ? (
                <Check className="h-3.5 w-3.5 text-white" />
              ) : (
                <span className="text-xs font-semibold text-white/80">{s.num}</span>
              )}
            </span>
            <span
              className={cn(
                "text-sm font-medium",
                current ? "text-white" : stepDone ? "text-white/85" : "text-white/55",
              )}
            >
              {s.num === 1 && "Tell us about your business"}
              {s.num === 2 && "Create the admin account"}
              {s.num === 3 && "You're ready to sell"}
            </span>
          </li>
        );
      })}
    </ul>
  );

  const animationClass =
    direction === "forward" ? "animate-slide-in-right" : "animate-slide-in-left";

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-900">
      <AuthBrandPanel
        badge="First-run setup"
        brandName="RX POS"
        tagline="Welcome to RX POS. Let's get your store set up in three quick steps."
        imageSrc={SETUP_IMAGE_URL}
        bottomContent={wizardChecklist}
      />

      <div className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-12 bg-white dark:bg-slate-900 overflow-y-auto">
        <div className="w-full max-w-[480px] animate-fade-in">
          <AuthMobileBrand />

          <StepIndicator step={step} done={done} />

          {/* Step 1: business */}
          {step === 1 && (
            <div key="step-1" className={animationClass}>
              <div className="text-center sm:text-left mb-7">
                <h1
                  className="font-bold tracking-tight"
                  style={{
                    fontSize: "28px",
                    color: "var(--color-slate-900)",
                    lineHeight: 1.2,
                  }}
                >
                  Tell us about your business
                </h1>
                <p className="text-sm mt-2" style={{ color: "var(--color-slate-500)" }}>
                  This information appears on receipts and reports.
                </p>
              </div>

              <div className="space-y-4">
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

                {/* Setup access code — shown ONLY on a web/PWA deployment,
                    where the operator must paste the server's SETUP_ACCESS_CODE.
                    On the desktop store-node the code is generated locally and
                    auto-applied to `form.accessCode` in an effect, so the field
                    is hidden entirely: nothing to type, and no confusing locked
                    row that looks like a broken input. */}
                {!desktopAccessCode && (
                  <FormField
                    label="Setup Access Code"
                    error={errors.accessCode}
                    required
                    hint="Configured by the server administrator (SETUP_ACCESS_CODE)."
                  >
                    <div className="relative">
                      <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none z-10" />
                      <Input
                        type={showAccessCode ? "text" : "password"}
                        placeholder="Paste your access code"
                        value={form.accessCode}
                        onChange={set("accessCode")}
                        error={!!errors.accessCode}
                        className="pl-10 pr-10 h-12 rounded-xl font-mono"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAccessCode((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 rounded-md z-10"
                        aria-label={showAccessCode ? "Hide access code" : "Show access code"}
                      >
                        {showAccessCode ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </FormField>
                )}
              </div>

              <button
                type="button"
                onClick={goNext}
                className="w-full h-12 rounded-xl text-white font-semibold text-sm tracking-wide transition-all duration-150 hover:opacity-95 active:scale-[0.99] flex items-center justify-center gap-2 mt-7"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-accent-500) 100%)",
                  boxShadow:
                    "0 8px 24px -8px rgba(35,54,153,0.45), 0 4px 12px -4px rgba(2,188,245,0.35)",
                }}
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Step 2: admin user */}
          {step === 2 && (
            <div key="step-2" className={animationClass}>
              <div className="text-center sm:text-left mb-7">
                <h1
                  className="font-bold tracking-tight"
                  style={{
                    fontSize: "28px",
                    color: "var(--color-slate-900)",
                    lineHeight: 1.2,
                  }}
                >
                  Create the admin account
                </h1>
                <p className="text-sm mt-2" style={{ color: "var(--color-slate-500)" }}>
                  This will be the super-admin user for your workspace.
                </p>
              </div>

              <div className="space-y-4">
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

                <FormField label="Email" error={errors.email} required>
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
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 rounded-md z-10"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

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
                          className="text-[11px] font-medium mt-1.5"
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
              </div>

              <div className="flex items-center gap-3 mt-7">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={isLoading}
                  className="h-12 px-5 rounded-xl font-semibold text-sm transition-all hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ color: "var(--color-slate-700)" }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className="flex-1 h-12 rounded-xl text-white font-semibold text-sm tracking-wide transition-all duration-150 hover:opacity-95 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                      <Rocket className="h-4 w-4" />
                      Complete Setup
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: confirmation */}
          {step === 3 && (
            <div key="step-3" className={cn(animationClass, "text-center")}>
              <div
                className="mx-auto h-16 w-16 rounded-2xl flex items-center justify-center mb-5"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-success-500), var(--color-accent-500))",
                  boxShadow: "0 12px 32px -8px rgba(2,188,245,0.45)",
                }}
              >
                <PartyPopper className="h-8 w-8 text-white" />
              </div>
              <h1
                className="font-bold tracking-tight"
                style={{
                  fontSize: "28px",
                  color: "var(--color-slate-900)",
                  lineHeight: 1.2,
                }}
              >
                Setup complete!
              </h1>
              <p
                className="text-sm mt-2 max-w-sm mx-auto"
                style={{ color: "var(--color-slate-500)" }}
              >
                Your workspace is ready. We&apos;ve signed you in as the super admin so you can
                start configuring stores and adding products right away.
              </p>

              <button
                type="button"
                onClick={() => navigate(ROUTES.DASHBOARD)}
                className="w-full h-12 rounded-xl text-white font-semibold text-sm tracking-wide transition-all duration-150 hover:opacity-95 active:scale-[0.99] flex items-center justify-center gap-2 mt-7"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-accent-500) 100%)",
                  boxShadow:
                    "0 8px 24px -8px rgba(35,54,153,0.45), 0 4px 12px -4px rgba(2,188,245,0.35)",
                }}
              >
                Go to dashboard
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
