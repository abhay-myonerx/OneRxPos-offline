"use client";

import { useState } from "react";
import { Lock, ShieldCheck, KeyRound, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form/form-field";
import { useChangePasswordMutation } from "@/features/auth/api/auth.api";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { SectionTitle, SettingsCard, Divider, InfoBanner } from "./shared";
import { cn } from "@/lib/utils/cn";

export function SecurityTab() {
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

  // Password strength indicator
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
    <div className="max-w-xl space-y-6">
      <SettingsCard>
        <SectionTitle
          icon={<KeyRound className="h-[18px] w-[18px]" />}
          title="Change Password"
          description="Update your account password to keep your data secure"
        />
        <Divider className="mb-6" />

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

            {/* Strength meter */}
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

          <Divider className="!mt-6" />

          <div className="flex justify-end pt-1">
            <Button type="submit" loading={changingPw} icon={<Lock className="h-4 w-4" />}>
              Update Password
            </Button>
          </div>
        </form>
      </SettingsCard>

      <InfoBanner
        variant="success"
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Keep your account secure"
        description="Use a mix of uppercase, lowercase, numbers, and symbols. Never reuse passwords across multiple services. Consider using a password manager."
      />
    </div>
  );
}
