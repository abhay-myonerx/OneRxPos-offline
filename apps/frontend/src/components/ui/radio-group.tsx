import { cn } from "@/lib/utils/cn";

interface RadioOption {
  value: string;
  label: string;
}

interface RadioGroupProps {
  name: string;
  options: RadioOption[];
  value: string;
  onChange: (val: string) => void;
  className?: string;
}

export function RadioGroup({ name, options, value, onChange, className }: RadioGroupProps) {
  return (
    <div className={cn("flex gap-4", className)}>
      {options.map((opt) => (
        <label
          key={opt.value}
          className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300"
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="h-4 w-4 text-primary-600 border-slate-300 dark:border-slate-600 dark:bg-slate-800 focus:ring-primary-500"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}
