export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-danger-600 dark:text-danger-400 mt-1">{message}</p>;
}
