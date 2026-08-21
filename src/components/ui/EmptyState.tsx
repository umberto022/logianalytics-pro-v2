import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action, secondaryAction }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mb-4">
        <Icon size={28} className="text-slate-400 dark:text-slate-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 max-w-xs leading-relaxed mb-5">{description}</p>
      <div className="flex flex-col sm:flex-row gap-2">
        {action && (
          <button
            onClick={action.onClick}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition"
          >
            {action.label}
          </button>
        )}
        {secondaryAction && (
          <button
            onClick={secondaryAction.onClick}
            className="px-5 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
