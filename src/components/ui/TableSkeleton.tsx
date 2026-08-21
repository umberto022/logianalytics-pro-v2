export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden animate-pulse">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 border-b border-slate-100 dark:border-slate-700">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-slate-100 dark:bg-slate-700 rounded-xl" />
        ))}
      </div>
      {/* Table header */}
      <div className="flex gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 px-4 py-4 border-b border-slate-50 dark:border-slate-700/50">
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full flex-1"
              style={{ opacity: 1 - j * 0.15 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
