"use client";

import { useEffect, useMemo, useState } from "react";
import { Assignment, DraftRun, Flag, Session, SME } from "@/types";
import { Chip, ScoreBar, SEV_COLOR, Tile, fmtDay, fmtTime } from "@/components/ui";

const TYPE_LABEL: Record<string, string> = {
  cohort_class: "Cohort class",
  doubt_clearing: "Doubt clearing",
  mock_interview: "Mock interview",
};

export default function Page() {
  const [run, setRun] = useState<DraftRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [capIsHard, setCapIsHard] = useState(false);
  const [tab, setTab] = useState<"schedule" | "flags" | "workload">("schedule");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/draft").then((r) => (r.ok ? r.json() : null)).then((d) => d && setRun(d)).catch(() => {});
  }, []);

  async function trigger() {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capIsHard }),
      });
      if (!r.ok) throw new Error("Run failed");
      setRun(await r.json());
      setOpen(null);
    } catch {
      setError("The run did not complete. Check the deployment logs and try again.");
    } finally { setLoading(false); }
  }

  async function act(payload: any) {
    const r = await fetch("/api/approve", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) setRun(await r.json());
  }

  const sesById = useMemo(
    () => new Map((run?.sessions ?? []).map((s) => [s.id, s])), [run]);
  const smeById = useMemo(
    () => new Map((run?.smes ?? []).map((s) => [s.id, s])), [run]);
  const flagsBySession = useMemo(() => {
    const m = new Map<string, Flag[]>();
    (run?.flags ?? []).forEach((f) => {
      m.set(f.session_id, [...(m.get(f.session_id) ?? []), f]);
    });
    return m;
  }, [run]);

  const overrides = (run?.assignments ?? []).filter((a) => a.status === "overridden").length;
  const approved = (run?.assignments ?? []).filter(
    (a) => a.status === "approved" || a.status === "overridden").length;

  return (
    <main className="mx-auto max-w-[1180px] px-5 pb-24 pt-8">
      <Header
        source={run ? "Synthetic week · Sheets adapter stubbed" : "Not yet run"}
        llm={run?.stats.llm_used}
      />

      <section className="mt-6 flex flex-wrap items-center gap-3 border border-rule bg-panel px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Week of</div>
          <div className="mt-0.5 text-[15px] font-semibold">
            {run ? fmtDay(run.week_start) : "31 Aug 2026"}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-slate1">
          <input
            type="checkbox" checked={capIsHard}
            onChange={(e) => setCapIsHard(e.target.checked)}
            className="h-3.5 w-3.5 accent-accent"
          />
          Treat SME weekly cap as a hard rule
        </label>

        <button
          onClick={trigger} disabled={loading}
          className="bg-ink px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Matching…" : run ? "Re-run weekly match" : "Run weekly match"}
        </button>
      </section>

      {error && (
        <div className="mt-4 border-l-2 px-4 py-3 text-[13px]"
          style={{ borderColor: SEV_COLOR.blocker, background: "#B03A320D" }}>
          {error}
        </div>
      )}

      {!run && !loading && <EmptyState />}

      {run && (
        <>
          <section className="mt-4 flex flex-wrap gap-3">
            <Tile label="Sessions" value={String(run.stats.total_sessions)}
              sub={`${run.stats.filled} matched to an SME`} />
            <Tile label="Auto-fill rate" value={`${Math.round(run.stats.auto_fill_rate * 100)}%`}
              sub="Filled without ops input"
              tone={run.stats.auto_fill_rate > 0.9 ? "#1F6B4E" : "#A9691B"} />
            <Tile label="Blockers" value={String(run.stats.blockers)}
              sub="Need a decision before approval"
              tone={run.stats.blockers ? SEV_COLOR.blocker : "#1F6B4E"} />
            <Tile label="Workload Gini" value={run.stats.gini.toFixed(2)}
              sub="0 = even, 1 = concentrated" />
            <Tile label="Ops overrides" value={String(overrides)}
              sub={`${approved} of ${run.stats.total_sessions} reviewed`} />
          </section>

          <nav className="mt-7 flex gap-6 border-b border-rule">
            {([
              ["schedule", `Draft schedule (${run.stats.total_sessions})`],
              ["flags", `Conflicts & gaps (${run.stats.flags})`],
              ["workload", "SME workload"],
            ] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`-mb-px border-b-2 pb-2.5 text-[13px] font-semibold transition-colors ${
                  tab === k ? "border-ink text-ink" : "border-transparent text-slate2 hover:text-slate1"
                }`}>
                {label}
              </button>
            ))}
            <button
              onClick={() => act({ action: "approve_all" })}
              className="ml-auto pb-2.5 text-[12px] font-semibold text-accent hover:underline">
              Approve all matched
            </button>
          </nav>

          {tab === "schedule" && (
            <ScheduleTable
              run={run} sesById={sesById} smeById={smeById} flagsBySession={flagsBySession}
              open={open} setOpen={setOpen} act={act}
            />
          )}
          {tab === "flags" && <FlagQueue run={run} sesById={sesById} setOpen={setOpen} setTab={setTab} />}
          {tab === "workload" && <WorkloadPanel run={run} />}
        </>
      )}
    </main>
  );
}

function Header({ source, llm }: { source: string; llm?: boolean }) {
  return (
    <header className="rule-t border-b border-rule pb-5 pt-5" style={{ borderTopWidth: 2, borderTopColor: "#0F1729" }}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-[19px] font-semibold tracking-tight">SME-to-Session Scheduling Agent</h1>
        <span className="eyebrow">Ops review console</span>
      </div>
      <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-slate1">
        Drafts next week&apos;s instructor assignments from availability, expertise, rolling workload and
        past performance. Nothing is booked until ops approves it.
      </p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate2">
        <span>Source · {source}</span>
        <span>Semantic layer · {llm === undefined ? "—" : llm ? "Claude enabled" : "Rules only (no API key)"}</span>
      </div>
    </header>
  );
}

function EmptyState() {
  return (
    <div className="mt-4 border border-dashed border-rule bg-panel px-6 py-14 text-center">
      <div className="text-[14px] font-semibold">No draft schedule yet</div>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] text-slate1">
        Run the weekly match to ingest the session list and SME pool, generate assignments,
        and surface anything that needs a human decision.
      </p>
    </div>
  );
}

function ScheduleTable({
  run, sesById, smeById, flagsBySession, open, setOpen, act,
}: {
  run: DraftRun;
  sesById: Map<string, Session>;
  smeById: Map<string, SME>;
  flagsBySession: Map<string, Flag[]>;
  open: string | null;
  setOpen: (v: string | null) => void;
  act: (p: any) => void;
}) {
  let lastDay = "";
  return (
    <div className="mt-4 border border-rule bg-panel">
      <div className="grid grid-cols-[1fr_120px_150px_86px_120px] gap-3 border-b border-rule px-4 py-2.5">
        {["Session", "Time (IST)", "Assigned SME", "Score", "Status"].map((h) => (
          <div key={h} className="eyebrow">{h}</div>
        ))}
      </div>

      {run.assignments.map((a) => {
        const s = sesById.get(a.session_id)!;
        const sme = a.sme_id ? smeById.get(a.sme_id) : null;
        const fl = flagsBySession.get(a.session_id) ?? [];
        const top = fl[0];
        const isOpen = open === a.session_id;
        const day = fmtDay(s.start_utc);
        const showDay = day !== lastDay;
        lastDay = day;

        return (
          <div key={a.session_id}>
            {showDay && (
              <div className="border-b border-rule bg-paper px-4 py-1.5 text-[11px] font-semibold text-slate1">
                {day}
              </div>
            )}
            <button
              onClick={() => setOpen(isOpen ? null : a.session_id)}
              className="grid w-full grid-cols-[1fr_120px_150px_86px_120px] items-center gap-3 border-b border-rule px-4 py-3 text-left transition-colors hover:bg-paper"
              style={top ? { boxShadow: `inset 3px 0 0 ${SEV_COLOR[top.severity]}` } : undefined}
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{s.title}</div>
                <div className="mt-0.5 text-[11px] text-slate2">
                  {TYPE_LABEL[s.type]} · {s.required_level} · {s.learner_count} learner{s.learner_count > 1 ? "s" : ""}
                </div>
              </div>
              <div className="tabular text-[12px] text-slate1">
                {fmtTime(s.start_utc, "Asia/Kolkata")}
                <div className="text-[10px] text-slate2">{s.duration_min}m</div>
              </div>
              <div className="text-[12px]">
                {sme ? (
                  <>
                    <div className="truncate font-medium">{sme.name}</div>
                    <div className="tabular text-[10px] text-slate2">
                      {fmtTime(s.start_utc, sme.home_tz)} local
                    </div>
                  </>
                ) : (
                  <span className="font-semibold" style={{ color: SEV_COLOR.blocker }}>Unfilled</span>
                )}
              </div>
              <div className="tabular text-[13px] font-semibold">
                {a.sme_id ? a.score.toFixed(2) : "—"}
              </div>
              <div>
                {top ? <Chip severity={top.severity} label={top.code.replace(/_/g, " ").toLowerCase()} />
                     : <StatusPill status={a.status} />}
              </div>
            </button>

            {isOpen && (
              <ReviewPanel
                a={a} s={s} sme={sme ?? null} flags={fl} run={run} smeById={smeById} act={act}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: Assignment["status"] }) {
  const map: Record<string, [string, string]> = {
    draft: ["Draft", "#8A93A6"],
    approved: ["Approved", "#1F6B4E"],
    overridden: ["Overridden by ops", "#33407A"],
    rejected: ["Rejected", "#B03A32"],
  };
  const [label, color] = map[status];
  return <span className="text-[11px] font-semibold" style={{ color }}>{label}</span>;
}

function ReviewPanel({
  a, s, sme, flags, run, smeById, act,
}: {
  a: Assignment; s: Session; sme: SME | null; flags: Flag[];
  run: DraftRun; smeById: Map<string, SME>; act: (p: any) => void;
}) {
  return (
    <div className="border-b border-rule bg-paper px-4 py-5">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="eyebrow">Why this match</div>
          {a.breakdown ? (
            <div className="mt-2.5">
              <ScoreBar b={a.breakdown} />
              <div className="mt-3 text-[12px] text-slate1">
                {a.eligible_count} SME{a.eligible_count === 1 ? "" : "s"} cleared every hard rule for this slot.
              </div>
              {a.tie_note && (
                <div className="mt-2 border-l-2 border-medium bg-panel px-3 py-2 text-[12px] text-slate1">
                  {a.tie_note}
                </div>
              )}
              {a.overridden_from && (
                <div className="mt-2 text-[12px] font-medium text-accent">
                  Ops replaced {smeById.get(a.overridden_from)?.name ?? a.overridden_from}.
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[13px]" style={{ color: SEV_COLOR.blocker }}>
              No SME cleared availability, certification and the proficiency floor for this slot.
            </p>
          )}

          {flags.length > 0 && (
            <div className="mt-5">
              <div className="eyebrow">Flagged</div>
              <ul className="mt-2 space-y-2.5">
                {flags.map((f) => (
                  <li key={f.id} className="border-l-2 bg-panel px-3 py-2.5"
                    style={{ borderColor: SEV_COLOR[f.severity] }}>
                    <Chip severity={f.severity} label={f.code.replace(/_/g, " ").toLowerCase()} />
                    <p className="mt-1.5 text-[12px] leading-relaxed">{f.reason}</p>
                    {f.suggested_fix && (
                      <p className="mt-1 text-[12px] text-slate1">Suggested — {f.suggested_fix}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div>
          <div className="eyebrow">Alternatives</div>
          {a.runners_up.length ? (
            <ul className="mt-2.5 space-y-2">
              {a.runners_up.map((r) => (
                <li key={r.sme_id}
                  className="flex items-center gap-3 border border-rule bg-panel px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">{r.sme_name}</div>
                    <div className="tabular text-[11px] text-slate2">
                      {fmtTime(s.start_utc, smeById.get(r.sme_id)?.home_tz ?? "UTC")} local
                      {r.notes[0] ? ` · ${r.notes[0]}` : ""}
                    </div>
                  </div>
                  <span className="tabular text-[12px] font-semibold">{r.score.toFixed(2)}</span>
                  <button
                    onClick={() => act({ action: "override", session_id: a.session_id, sme_id: r.sme_id })}
                    className="border border-ink px-2.5 py-1 text-[11px] font-semibold hover:bg-ink hover:text-white"
                  >
                    Assign
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-slate1">
              No eligible alternative. Reschedule the slot, relax the level requirement, or onboard capacity.
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              disabled={!a.sme_id}
              onClick={() => act({ action: "approve", session_id: a.session_id })}
              className="bg-ink px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              Approve
            </button>
            <button
              disabled={!a.sme_id}
              onClick={() => act({ action: "reject", session_id: a.session_id })}
              className="border border-rule px-4 py-2 text-[12px] font-semibold text-slate1 hover:border-ink hover:text-ink disabled:opacity-40"
            >
              Reject match
            </button>
            <div className="ml-auto self-center"><StatusPill status={a.status} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlagQueue({
  run, sesById, setOpen, setTab,
}: {
  run: DraftRun; sesById: Map<string, Session>;
  setOpen: (v: string) => void; setTab: (v: "schedule") => void;
}) {
  if (!run.flags.length) {
    return <div className="mt-4 border border-rule bg-panel px-6 py-12 text-center text-[13px] text-slate1">
      Nothing flagged. Every session cleared the hard rules and the fairness checks.
    </div>;
  }
  return (
    <div className="mt-4 space-y-2">
      <p className="text-[12px] text-slate2">
        Ranked by severity, then by how many learners are affected, then by how soon the session runs.
      </p>
      {run.flags.map((f) => {
        const s = sesById.get(f.session_id)!;
        return (
          <button key={f.id}
            onClick={() => { setTab("schedule"); setOpen(f.session_id); }}
            className="flex w-full gap-4 border border-rule bg-panel px-4 py-3.5 text-left hover:bg-paper"
            style={{ boxShadow: `inset 3px 0 0 ${SEV_COLOR[f.severity]}` }}>
            <span className="tabular pt-0.5 text-[12px] font-semibold text-slate2">
              {String(f.rank).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <Chip severity={f.severity} label={f.code.replace(/_/g, " ").toLowerCase()} />
                <span className="truncate text-[12.5px] font-medium">{s.title}</span>
                <span className="text-[11px] text-slate2">
                  {fmtTime(s.start_utc, "Asia/Kolkata")} IST · {s.learner_count} learner{s.learner_count > 1 ? "s" : ""}
                </span>
              </span>
              <span className="mt-1.5 block text-[12px] leading-relaxed">{f.reason}</span>
              {f.suggested_fix && (
                <span className="mt-1 block text-[12px] text-slate1">Suggested — {f.suggested_fix}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WorkloadPanel({ run }: { run: DraftRun }) {
  const counts: Record<string, number> = {};
  run.assignments.forEach((a) => { if (a.sme_id) counts[a.sme_id] = (counts[a.sme_id] ?? 0) + 1; });
  const rows = run.smes
    .map((s) => ({ sme: s, drafted: counts[s.id] ?? 0, w: run.workload[s.id] }))
    .sort((a, b) => b.drafted - a.drafted);
  const max = Math.max(1, ...rows.map((r) => r.drafted), ...rows.map((r) => r.sme.prefs.max_sessions_per_week));

  return (
    <div className="mt-4 border border-rule bg-panel">
      <div className="border-b border-rule px-4 py-3">
        <div className="eyebrow">Drafted load against capacity-weighted fair share</div>
        <p className="mt-1.5 text-[12px] text-slate1">
          Fair share is weighted by the hours each SME actually offers over the rolling four weeks —
          an SME offering four hours a week and one offering twenty should not carry the same target.
        </p>
      </div>
      {rows.map(({ sme, drafted, w }) => {
        const over = drafted > sme.prefs.max_sessions_per_week;
        const under = sme.status === "active" && drafted < sme.prefs.min_sessions_per_week;
        return (
          <div key={sme.id} className="grid grid-cols-[150px_1fr_140px] items-center gap-4 border-b border-rule px-4 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-medium">{sme.name}</div>
              <div className="text-[10.5px] text-slate2">
                {sme.status === "paused" ? "Paused" : sme.home_tz.split("/")[1].replace("_", " ")}
              </div>
            </div>
            <div className="flex h-5 items-center gap-2">
              <div className="relative h-2.5 flex-1 rounded-sm bg-rule">
                <div className="h-full rounded-sm"
                  style={{
                    width: `${(drafted / max) * 100}%`,
                    background: over ? SEV_COLOR.high : under ? SEV_COLOR.medium : "#1F6B4E",
                  }} />
                <div className="absolute top-[-3px] h-[16px] w-px bg-ink"
                  title={`Declared cap ${sme.prefs.max_sessions_per_week}`}
                  style={{ left: `${(sme.prefs.max_sessions_per_week / max) * 100}%` }} />
              </div>
              <span className="tabular w-6 text-right text-[12px] font-semibold">{drafted}</span>
            </div>
            <div className="tabular text-right text-[11px] text-slate1">
              {w ? `${w.deficit >= 0 ? "+" : ""}${w.deficit.toFixed(1)} vs fair share` : "—"}
            </div>
          </div>
        );
      })}
      <div className="px-4 py-3 text-[11px] text-slate2">
        Vertical marker shows each SME&apos;s self-declared weekly cap.
      </div>
    </div>
  );
}
