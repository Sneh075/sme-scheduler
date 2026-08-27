"use client";
import { ScoreBreakdown, Severity } from "@/types";

export const SEV_COLOR: Record<Severity, string> = {
  blocker: "#B03A32",
  high: "#A9691B",
  medium: "#3F6394",
  low: "#8A93A6",
};

export function Chip({ severity, label }: { severity: Severity; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-semibold"
      style={{ color: SEV_COLOR[severity], background: `${SEV_COLOR[severity]}14` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEV_COLOR[severity] }} />
      {label}
    </span>
  );
}

export function Tile({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="flex-1 border border-rule bg-panel px-4 py-3.5">
      <div className="eyebrow">{label}</div>
      <div className="tabular mt-1.5 text-[26px] font-semibold leading-none" style={{ color: tone ?? "#0F1729" }}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[11px] text-slate2">{sub}</div>}
    </div>
  );
}

const PARTS: { key: keyof ScoreBreakdown; label: string; color: string; weight: number }[] = [
  { key: "expertise", label: "Expertise fit", color: "#33407A", weight: 0.30 },
  { key: "fairness", label: "Rolling fairness", color: "#1F6B4E", weight: 0.30 },
  { key: "performance", label: "Past performance", color: "#3F6394", weight: 0.20 },
  { key: "preference", label: "SME preference", color: "#A9691B", weight: 0.10 },
  { key: "continuity", label: "Cohort continuity", color: "#7A5C9E", weight: 0.10 },
];

/**
 * The signature element: every score is shown as the weighted contributions that
 * produced it, so ops can see exactly why an SME won the slot.
 */
export function ScoreBar({ b }: { b: ScoreBreakdown }) {
  const contribs = PARTS.map((p) => ({ ...p, value: (b[p.key] as number) * p.weight }));
  const total = Math.max(b.total, 0.0001);

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-sm bg-rule">
        {contribs.map((c) => (
          <div
            key={c.key}
            title={`${c.label}: ${(c.value * 100).toFixed(0)} pts`}
            style={{ width: `${(c.value / total) * 100}%`, background: c.color }}
          />
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3">
        {contribs.map((c) => (
          <div key={c.key} className="flex items-center gap-1.5 text-[11px]">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: c.color }} />
            <span className="text-slate1">{c.label}</span>
            <span className="tabular ml-auto font-semibold">{((b[c.key] as number) * 100).toFixed(0)}</span>
          </div>
        ))}
        {Math.abs(b.llm_adjustment) > 0.001 && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="h-2 w-2 shrink-0 rounded-[2px] border border-dashed border-slate2" />
            <span className="text-slate1">Semantic adj.</span>
            <span className="tabular ml-auto font-semibold">
              {b.llm_adjustment > 0 ? "+" : ""}{(b.llm_adjustment * 100).toFixed(0)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function fmtTime(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz,
  }).format(new Date(iso));
}

export function fmtDay(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
