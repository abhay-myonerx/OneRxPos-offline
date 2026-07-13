import { BrandSpinner } from "@/components/shared/feedback/BrandSpinner";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center gap-4 animate-fade-in">
      <BrandSpinner size={40} />
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading…</p>
    </div>
  );
}
