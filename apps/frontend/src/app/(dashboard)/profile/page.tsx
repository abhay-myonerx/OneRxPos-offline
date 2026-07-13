/* eslint-disable @typescript-eslint/no-explicit-any */
/* User payload from API includes optional fields not fully typed yet. */
/* eslint-disable react-hooks/set-state-in-effect */
/* Hydrate form state once when `user` arrives from Redux after load. */

/**
 * Signed-in user's profile editor and password change flow.
 */

"use client";

import { useState, useEffect } from "react";
import {
  Save,
  Lock,
  User,
  Mail,
  Phone,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form/form-field";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/container";
import { useAppSelector } from "@/store/hooks";
import { useChangePasswordMutation } from "@/features/auth/api/auth.api";
import { useUpdateMyProfileMutation } from "@/features/users/api/users.api";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { Role } from "@/types/enums/role.enums";

export default function ProfilePage() {
  const user = useAppSelector((s) => s.auth.user);
  const tenant = useAppSelector((s) => s.auth.tenant);

  const [activeSection, setActiveSection] = useState<"profile" | "password">("profile");

  const roleBadge = (role?: string) => {
    switch (role) {
      case Role.SUPER_ADMIN:
        return "danger" as const;
      case Role.ADMIN:
        return "info" as const;
      case Role.MANAGER:
        return "warning" as const;
      default:
        return "default" as const;
    }
  };

  return (
    <>
      <PageHeader
        title="My Profile"
        description="Manage your personal information and account security"
      />

      <div className="max-w-3xl">
        {/* Avatar, name, and role summary */}
        {user && (
          <div className="rounded-xl border border-slate-200/80 bg-white dark:bg-slate-900 p-6 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Avatar */}
              <div
                className={cn(
                  "h-14 w-14 rounded-xl flex items-center justify-center shrink-0",
                  user.role === Role.SUPER_ADMIN
                    ? "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300",
                )}
              >
                <span className="text-lg font-medium select-none">
                  {user.firstName?.[0]}
                  {user.lastName?.[0]}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[17px] font-medium text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
                    {user.firstName} {user.lastName}
                  </h2>
                  <Badge variant={roleBadge(user.role)}>{user.role?.replace("_", " ")}</Badge>
                </div>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">{user.email}</p>
                {tenant && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400 dark:text-slate-500">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span>{tenant.name}</span>
                    <span>·</span>
                    <span>{tenant.plan} Plan</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Profile vs. password sections */}
        <div className="flex gap-1 mb-6 border-b border-slate-200/80">
          {(
            [
              {
                id: "profile",
                label: "Personal Info",
                icon: <User className="h-4 w-4" />,
              },
              {
                id: "password",
                label: "Change Password",
                icon: <Lock className="h-4 w-4" />,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-3 text-[13px] font-medium transition-colors",
                activeSection === tab.id
                  ? "text-slate-900 dark:text-slate-100"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100",
              )}
            >
              {tab.icon}
              {tab.label}
              {activeSection === tab.id && (
                <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-primary-600 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {activeSection === "profile" && <ProfileSection />}
        {activeSection === "password" && <PasswordSection />}
      </div>
    </>
  );
}

/** Name, phone, read-only email and role. */
function ProfileSection() {
  const user = useAppSelector((s) => s.auth.user);
  const [updateProfile, { isLoading: saving }] = useUpdateMyProfileMutation();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
  });

  // Hydrate form once when user data arrives from Redux (typically on first
  // render after a page refresh). Subsequent saves update the store via
  // RTK-Query cache invalidation, which re-triggers this effect.
  useEffect(() => {
    if (!user) return;
    setForm({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phone: (user as any).phone || "",
    });
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile(form).unwrap();
      showSuccess("Profile updated successfully");
    } catch (err) {
      showApiError(err);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white dark:bg-slate-900 p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="h-9 w-9 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300">
          <User className="h-[18px] w-[18px]" />
        </div>
        <div>
          <h3 className="text-[15px] font-medium text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
            Personal Information
          </h3>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
            Update your name and contact details
          </p>
        </div>
      </div>

      <div className="h-px bg-slate-200/70 mb-6" />

      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="First Name" required>
            <Input
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              placeholder="First name"
            />
          </FormField>
          <FormField label="Last Name" required>
            <Input
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              placeholder="Last name"
            />
          </FormField>
        </div>

        <FormField label="Email Address">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <Input
              type="email"
              value={user?.email || ""}
              disabled
              className="pl-10 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 cursor-not-allowed"
            />
          </div>
          <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-1">
            Email address cannot be changed. Contact your admin for assistance.
          </p>
        </FormField>

        <FormField label="Phone Number">
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+880-1711-000001"
              className="pl-10"
            />
          </div>
        </FormField>

        <FormField label="Role">
          <Input
            value={user?.role?.replace("_", " ") || ""}
            disabled
            className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 cursor-not-allowed capitalize"
          />
        </FormField>

        <div className="h-px bg-slate-200/70 !mt-6" />

        <div className="flex justify-end pt-1">
          <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Current password verification and new password submission. */
function PasswordSection() {
  const [changePw, { isLoading: changingPw }] = useChangePasswordMutation();

  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [pwError, setPwError] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwError("Password must be at least 8 characters");
      return;
    }
    try {
      await changePw({
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      }).unwrap();
      showSuccess("Password changed successfully");
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      showApiError(err);
    }
  };

  const getStrength = (pw: string) => {
    if (!pw) return { level: 0, label: "", color: "" };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    if (score <= 2) return { level: score, label: "Weak", color: "bg-danger-500" };
    if (score <= 3) return { level: score, label: "Fair", color: "bg-warning-500" };
    return { level: score, label: "Strong", color: "bg-success-500" };
  };

  const strength = getStrength(pwForm.newPassword);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200/80 bg-white dark:bg-slate-900 p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="h-9 w-9 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300">
            <KeyRound className="h-[18px] w-[18px]" />
          </div>
          <div>
            <h3 className="text-[15px] font-medium text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
              Change Password
            </h3>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
              Update your account password to keep your data secure
            </p>
          </div>
        </div>

        <div className="h-px bg-slate-200/70 mb-6" />

        <form onSubmit={handlePassword} className="space-y-5">
          <FormField label="Current Password" required>
            <div className="relative">
              <Input
                type={showCurrent ? "text" : "password"}
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                placeholder="Enter current password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FormField>

          <FormField label="New Password" required>
            <div className="relative">
              <Input
                type={showNew ? "text" : "password"}
                value={pwForm.newPassword}
                onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                placeholder="Min 8 characters"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {pwForm.newPassword && (
              <div className="mt-2.5 space-y-1.5">
                <div className="flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1 flex-1 rounded-full transition-colors duration-200",
                        i < strength.level ? strength.color : "bg-slate-200/70",
                      )}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  Strength:{" "}
                  <span
                    className={cn(
                      "font-medium",
                      strength.level <= 2
                        ? "text-danger-600 dark:text-danger-300"
                        : strength.level <= 3
                          ? "text-warning-600 dark:text-warning-300"
                          : "text-success-600 dark:text-success-300",
                    )}
                  >
                    {strength.label}
                  </span>
                </p>
              </div>
            )}
          </FormField>

          <FormField label="Confirm New Password" required>
            <Input
              type="password"
              value={pwForm.confirmPassword}
              onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
              placeholder="Repeat new password"
              error={!!pwError}
            />
            {pwError && (
              <p className="text-[12px] text-danger-600 dark:text-danger-300 mt-1.5 font-medium">
                {pwError}
              </p>
            )}
          </FormField>

          <div className="h-px bg-slate-200/70 !mt-6" />

          <div className="flex justify-end pt-1">
            <Button type="submit" loading={changingPw} icon={<Lock className="h-4 w-4" />}>
              Update Password
            </Button>
          </div>
        </form>
      </div>

      <div className="p-4 rounded-xl border bg-success-50/60 border-success-500/20 text-success-800 dark:text-success-300">
        <div className="flex items-start gap-3">
          <span className="shrink-0 mt-0.5 text-success-600 dark:text-success-300">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium">Keep your account secure</p>
            <p className="text-[12px] mt-0.5 opacity-85 leading-relaxed">
              Use a mix of uppercase, lowercase, numbers, and symbols. Never reuse passwords across
              multiple services.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
