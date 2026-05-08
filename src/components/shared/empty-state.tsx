import { cn } from '@/lib/utils';

type EmptyStateProps = {
  icon: React.ReactNode;
  text: string;
  description?: string;
  className?: string;
};

export function EmptyState({ icon, text, description, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 text-center text-gray-400',
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
        {icon}
      </div>
      <p className="text-sm">{text}</p>
      {description && <p className="-mt-1 max-w-xs text-xs text-gray-400">{description}</p>}
    </div>
  );
}
