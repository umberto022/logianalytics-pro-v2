import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  page:       number;
  totalPages: number;
  total:      number;
  pageSize:   number;
  onPage:     (p: number) => void;
}

export function Pagination({ page, totalPages, total, pageSize, onPage }: Props) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
      <span className="text-xs text-slate-400">
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition"
          aria-label="Anterior"
        >
          <ChevronLeft size={14} />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce<(number | "…")[]>((acc, p, i, arr) => {
            if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("…");
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} className="px-1 text-slate-400 text-xs">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p as number)}
                className={`w-7 h-7 rounded-lg text-xs font-medium transition ${
                  p === page
                    ? "bg-brand-600 text-white"
                    : "border border-slate-200 text-slate-500 hover:bg-white"
                }`}
              >
                {p}
              </button>
            )
          )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition"
          aria-label="Siguiente"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
