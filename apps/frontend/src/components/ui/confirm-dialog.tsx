"use client";

import { Trash2, ShieldOff, AlertTriangle } from "lucide-react";
import { Modal } from "./modal";
import { Button } from "./button";

type ConfirmVariant = "danger" | "warning";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
}

const variantConfig: Record<
  ConfirmVariant,
  {
    icon: React.ReactNode;
    accent: string;
    iconRing: string;
    iconBg: string;
  }
> = {
  danger: {
    icon: <Trash2 className="h-6 w-6" />,
    accent: "text-red-600 dark:text-red-400",
    iconRing: "ring-red-100 dark:ring-red-500/10",
    iconBg: "bg-red-50 dark:bg-red-500/15",
  },
  warning: {
    icon: <ShieldOff className="h-6 w-6" />,
    accent: "text-amber-600 dark:text-amber-400",
    iconRing: "ring-amber-100 dark:ring-amber-500/10",
    iconBg: "bg-amber-50 dark:bg-amber-500/15",
  },
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading,
}: ConfirmDialogProps) {
  const config = variantConfig[variant];
  return (
    <Modal open={open} onClose={onClose} title="" size="sm">
      <div className="flex flex-col items-center text-center gap-5 py-3">
        <div
          className={`h-16 w-16 rounded-2xl ${config.iconBg} ${config.accent} flex items-center justify-center ring-8 ${config.iconRing}`}
        >
          {config.icon}
        </div>
        <div className="space-y-1.5 px-2">
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 tracking-tight">
            {title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {description}
          </p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 w-full pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            className="flex-1"
            onClick={onConfirm}
            loading={loading}
            icon={variant === "warning" ? <AlertTriangle className="h-4 w-4" /> : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
