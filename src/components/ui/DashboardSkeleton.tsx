function Bone({ className }: { className?: string }) {
  return (
    <div
      className={`bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse ${className ?? ""}`}
    />
  );
}

function KPISkeleton() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 shadow-sm flex items-center gap-3">
      <Bone className="w-10 h-10 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Bone className="h-3 w-20" />
        <Bone className="h-5 w-28" />
      </div>
    </div>
  );
}

function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
      <Bone className="h-4 w-48 mb-4" />
      <Bone style={{ height }} className="w-full rounded-xl" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-2">
          <Bone className="h-6 w-32" />
          <Bone className="h-3.5 w-52" />
        </div>
        <Bone className="h-9 w-36 rounded-xl" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {Array.from({ length: 5 }).map((_, i) => <KPISkeleton key={i} />)}
      </div>

      {/* Charts */}
      <ChartSkeleton height={220} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 mb-6">
        <ChartSkeleton height={220} />
        <ChartSkeleton height={220} />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
        <Bone className="h-4 w-36 mb-5" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Bone className="h-4 w-20" />
              <Bone className="h-4 flex-1" />
              <Bone className="h-4 w-16" />
              <Bone className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
