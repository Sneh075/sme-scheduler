import {
  Assignment, Candidate, DraftRun, Flag, FlagCode, ScoreBreakdown,
  Session, Severity, SME,
} from "@/types";
import { TOPIC_LABEL } from "../../data/synthetic";

const BUFFER_MIN = 15;
const WEIGHTS = { expertise: 0.30, fairness: 0.30, performance: 0.20, preference: 0.10, continuity: 0.10 };
/** Hard bound on how far semantic (LLM) judgement can move a score. It can never open a gate. */
export const LLM_MAX_ADJ = 0.15;

const LEVEL_FLOOR: Record<string, number> = { intro: 2, intermediate: 3, senior: 4 };

const ms = (s: string) => new Date(s).getTime();
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Stable hash — used for reproducible tie-breaks instead of Math.random(). */
function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

interface Interval { start: number; end: number; }
const sessionInterval = (s: Session): Interval => ({
  start: ms(s.start_utc),
  end: ms(s.start_utc) + s.duration_min * 60000,
});

const containedIn = (i: Interval, w: { start_utc: string; end_utc: string }) =>
  ms(w.start_utc) <= i.start - BUFFER_MIN * 60000 + BUFFER_MIN * 60000 &&
  ms(w.end_utc) >= i.end;

const overlaps = (a: Interval, b: Interval) =>
  a.start < b.end + BUFFER_MIN * 60000 && b.start < a.end + BUFFER_MIN * 60000;

// ---------------------------------------------------------------------------
// Stage 1 — hard gates. Failing any one of these removes the SME entirely.
// ---------------------------------------------------------------------------

export interface GateResult { pass: boolean; failed: string[]; }

export function runGates(
  session: Session, sme: SME, assignedIntervals: Interval[],
  currentWeekCount: number, treatCapAsHard: boolean
): GateResult {
  const failed: string[] = [];
  const iv = sessionInterval(session);

  if (sme.status !== "active") failed.push("SME is paused");
  if (!sme.availability.some((w) => containedIn(iv, w))) failed.push("Not available in this slot");
  if (assignedIntervals.some((a) => overlaps(a, iv))) failed.push("Already booked in an overlapping slot");
  if (!sme.certified_for.includes(session.type)) failed.push(`Not certified for ${session.type.replace(/_/g, " ")}`);

  const floor = LEVEL_FLOOR[session.required_level];
  const best = Math.max(0, ...session.topic_tags.map((t) => sme.proficiency[t] ?? 0));
  if (best < floor) failed.push(`Proficiency ${best || 0}/5 below ${session.required_level} floor of ${floor}`);

  if (treatCapAsHard && currentWeekCount >= sme.prefs.max_sessions_per_week)
    failed.push(`At self-declared cap of ${sme.prefs.max_sessions_per_week} sessions`);

  return { pass: failed.length === 0, failed };
}

// ---------------------------------------------------------------------------
// Stage 2 — scoring of eligible candidates
// ---------------------------------------------------------------------------

export interface WorkloadRow { target: number; actual: number; deficit: number; }

/**
 * Capacity-weighted fair share over a rolling 4-week window.
 * An SME who offers 20h/week and one who offers 4h should not carry the same target.
 */
export function computeWorkload(smes: SME[], totalSessions: number, draftCounts: Record<string, number>) {
  const active = smes.filter((s) => s.status === "active");
  const totalCap = active.reduce((a, s) => a + s.capacity_hours_4wk, 0) || 1;
  const historicalTotal = active.reduce(
    (a, s) => a + s.history.reduce((x, h) => x + h.count, 0), 0);
  const pool = historicalTotal + totalSessions;

  const rows: Record<string, WorkloadRow> = {};
  for (const s of smes) {
    const target = (s.capacity_hours_4wk / totalCap) * pool;
    const actual = s.history.reduce((x, h) => x + h.count, 0) + (draftCounts[s.id] ?? 0);
    rows[s.id] = { target, actual, deficit: target - actual };
  }
  return rows;
}

function normaliseDeficit(deficit: number, all: number[]): number {
  const min = Math.min(...all), max = Math.max(...all);
  if (max - min < 1e-9) return 0.5;
  return clamp01((deficit - min) / (max - min));
}

export function scoreCandidate(
  session: Session, sme: SME, workload: Record<string, WorkloadRow>,
  deficits: number[], cohortHistory: Record<string, string[]>, llmAdj: number,
  draftCount = 0
): { breakdown: ScoreBreakdown; notes: string[] } {
  const notes: string[] = [];

  const bestProf = Math.max(0, ...session.topic_tags.map((t) => sme.proficiency[t] ?? 0));
  const coverage = session.topic_tags.filter((t) => (sme.proficiency[t] ?? 0) >= 3).length /
    session.topic_tags.length;
  const expertise = clamp01((bestProf / 5) * 0.7 + coverage * 0.3);

  // Rolling deficit, floored upward for anyone still below their declared minimum.
  // The minimum is an income floor for part-time SMEs and the main driver of churn,
  // so it outranks marginal expertise gains.
  const rawFairness = normaliseDeficit(workload[sme.id]?.deficit ?? 0, deficits);
  const belowFloor = draftCount < sme.prefs.min_sessions_per_week;
  const fairness = clamp01(belowFloor ? 0.45 + rawFairness * 0.55 : rawFairness * 0.8);
  if (belowFloor) notes.push(`Below weekly minimum (${draftCount}/${sme.prefs.min_sessions_per_week})`);

  const perfVals = session.topic_tags
    .map((t) => sme.performance.by_topic[t]).filter((v): v is number => typeof v === "number");
  const perfAvg = perfVals.length ? perfVals.reduce((a, b) => a + b, 0) / perfVals.length : 3.5;
  const performance = clamp01((perfAvg / 5) * 0.8 + sme.performance.reliability * 0.2);

  const prefHit = session.topic_tags.some((t) => sme.prefs.preferred_topics.includes(t));
  const preference = prefHit ? 1 : 0.35;
  if (!prefHit) notes.push("Outside stated topic preferences");

  const taught = session.cohort_id ? (cohortHistory[session.cohort_id] ?? []) : [];
  const continuity = session.cohort_id ? (taught.includes(sme.id) ? 1 : taught.length ? 0.2 : 0.5) : 0.5;
  if (continuity === 1) notes.push(`Already teaching cohort ${session.cohort_id}`);

  const base =
    WEIGHTS.expertise * expertise + WEIGHTS.fairness * fairness +
    WEIGHTS.performance * performance + WEIGHTS.preference * preference +
    WEIGHTS.continuity * continuity;

  const adj = Math.max(-LLM_MAX_ADJ, Math.min(LLM_MAX_ADJ, llmAdj));
  if (Math.abs(adj) > 0.001) notes.push(`Semantic topic match adjustment ${adj > 0 ? "+" : ""}${adj.toFixed(2)}`);

  const breakdown: ScoreBreakdown = {
    expertise, fairness, performance, preference, continuity,
    llm_adjustment: adj, total: clamp01(base + adj),
  };
  return { breakdown, notes };
}

// ---------------------------------------------------------------------------
// Stage 3 + 4 — assignment and flagging
// ---------------------------------------------------------------------------

export interface MatchOptions {
  capIsHard: boolean;
  semanticAdj?: (sessionId: string, smeId: string) => number;
}

export function match(
  sessions: Session[], smes: SME[], opts: MatchOptions
): Omit<DraftRun, "run_id" | "week_start" | "sessions" | "smes"> {
  const byId = new Map(smes.map((s) => [s.id, s]));
  const assignedIntervals: Record<string, Interval[]> = {};
  const draftCounts: Record<string, number> = {};
  const cohortHistory: Record<string, string[]> = {};
  smes.forEach((s) => { assignedIntervals[s.id] = []; draftCounts[s.id] = 0; });

  // Pass A: eligibility census, so we can assign scarce sessions first.
  const eligibility = new Map<string, string[]>();
  for (const ses of sessions) {
    const ok = smes.filter((s) => runGates(ses, s, [], 0, opts.capIsHard).pass).map((s) => s.id);
    eligibility.set(ses.id, ok);
  }

  // Scarcity-first: hardest-to-fill sessions get the pool before easy ones do.
  const order = [...sessions].sort((a, b) => {
    const d = (eligibility.get(a.id)!.length) - (eligibility.get(b.id)!.length);
    if (d !== 0) return d;
    return b.learner_count - a.learner_count;
  });

  const assignments: Assignment[] = [];
  const flags: Flag[] = [];
  let flagSeq = 0;
  const addFlag = (f: Omit<Flag, "id" | "rank">) => {
    flags.push({ ...f, id: `flag_${++flagSeq}`, rank: 0 });
  };

  for (const ses of order) {
    const workload = computeWorkload(smes, sessions.length, draftCounts);
    const deficits = smes.filter((s) => s.status === "active").map((s) => workload[s.id].deficit);

    const eligible: Candidate[] = [];
    for (const sme of smes) {
      const g = runGates(ses, sme, assignedIntervals[sme.id], draftCounts[sme.id], opts.capIsHard);
      if (!g.pass) continue;
      const adj = opts.semanticAdj ? opts.semanticAdj(ses.id, sme.id) : 0;
      const { breakdown, notes } = scoreCandidate(
        ses, sme, workload, deficits, cohortHistory, adj, draftCounts[sme.id]);
      if (!opts.capIsHard && draftCounts[sme.id] >= sme.prefs.max_sessions_per_week)
        notes.push(`Over self-declared cap of ${sme.prefs.max_sessions_per_week}`);
      eligible.push({ sme_id: sme.id, sme_name: sme.name, score: breakdown.total, breakdown, notes });
    }

    // Deterministic tie-break chain — never Math.random().
    eligible.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
      const wa = workload[a.sme_id].deficit, wb = workload[b.sme_id].deficit;
      if (Math.abs(wb - wa) > 0.001) return wb - wa;
      if (Math.abs(b.breakdown.performance - a.breakdown.performance) > 0.001)
        return b.breakdown.performance - a.breakdown.performance;
      if (Math.abs(b.breakdown.preference - a.breakdown.preference) > 0.001)
        return b.breakdown.preference - a.breakdown.preference;
      const da = draftCounts[a.sme_id], db = draftCounts[b.sme_id];
      if (da !== db) return da - db;
      return stableHash(ses.id + a.sme_id) - stableHash(ses.id + b.sme_id);
    });

    const winner = eligible[0] ?? null;
    const runners = eligible.slice(1, 4);

    let tie_note: string | undefined;
    if (winner && runners[0] && Math.abs(winner.score - runners[0].score) <= 0.001) {
      tie_note = `Tied with ${runners[0].sme_name}. Broken on rolling fairness deficit ` +
        `(${workload[winner.sme_id].deficit.toFixed(1)} vs ${workload[runners[0].sme_id].deficit.toFixed(1)}).`;
    }

    if (winner) {
      assignedIntervals[winner.sme_id].push(sessionInterval(ses));
      draftCounts[winner.sme_id] += 1;
      if (ses.cohort_id) {
        cohortHistory[ses.cohort_id] = cohortHistory[ses.cohort_id] ?? [];
        if (!cohortHistory[ses.cohort_id].includes(winner.sme_id))
          cohortHistory[ses.cohort_id].push(winner.sme_id);
      }
    }

    assignments.push({
      session_id: ses.id,
      sme_id: winner?.sme_id ?? null,
      score: winner?.score ?? 0,
      breakdown: winner?.breakdown,
      runners_up: runners,
      eligible_count: eligible.length,
      status: "draft",
      tie_note,
    });

    // ---- Flags -----------------------------------------------------------
    if (!winner) {
      const nearMiss = smes
        .map((s) => ({ s, g: runGates(ses, s, assignedIntervals[s.id], draftCounts[s.id], opts.capIsHard) }))
        .filter((x) => x.g.failed.length === 1)
        .slice(0, 2);
      addFlag({
        session_id: ses.id, sme_id: null, code: "UNFILLED", severity: "blocker",
        reason: `No SME clears all hard rules for ${ses.title}.`,
        suggested_fix: nearMiss.length
          ? `Closest: ${nearMiss.map((n) => `${n.s.name} (${n.g.failed[0]})`).join("; ")}.`
          : "Reschedule the slot or onboard capacity for this topic.",
      });
    } else {
      const sme = byId.get(winner.sme_id)!;
      const bestProf = Math.max(0, ...ses.topic_tags.map((t) => sme.proficiency[t] ?? 0));
      const floor = LEVEL_FLOOR[ses.required_level];

      if (bestProf === floor && ses.required_level !== "intro")
        addFlag({
          session_id: ses.id, sme_id: sme.id, code: "EXPERTISE_STRETCH", severity: "high",
          reason: `${sme.name} meets the ${ses.required_level} floor exactly (${bestProf}/5) with no headroom.`,
          suggested_fix: "Confirm with curriculum, or pair with a senior SME for the first run.",
        });

      if (eligible.length === 1)
        addFlag({
          session_id: ses.id, sme_id: sme.id, code: "SINGLE_CANDIDATE", severity: "high",
          reason: `${sme.name} is the only eligible SME — a drop-out leaves this session unfillable.`,
          suggested_fix: "Identify a backup or widen the availability window.",
        });

      if (draftCounts[sme.id] > sme.prefs.max_sessions_per_week)
        addFlag({
          session_id: ses.id, sme_id: sme.id, code: "OVERLOAD", severity: "high",
          reason: `${sme.name} is now at ${draftCounts[sme.id]} sessions against a declared cap of ${sme.prefs.max_sessions_per_week}.`,
          suggested_fix: "Reassign to a runner-up or get explicit SME consent.",
        });

      if (winner.breakdown.preference < 0.5 && ses.type === "cohort_class")
        addFlag({
          session_id: ses.id, sme_id: sme.id, code: "PREF_MISS", severity: "low",
          reason: `Topic sits outside ${sme.name}'s stated preferences.`,
          suggested_fix: "Acceptable if load is otherwise balanced; watch for repeat weeks.",
        });
    }
  }

  // Post-pass fairness flags across the whole week.
  const finalWorkload = computeWorkload(smes, sessions.length, draftCounts);
  for (const sme of smes.filter((s) => s.status === "active")) {
    const c = draftCounts[sme.id] ?? 0;
    if (c < sme.prefs.min_sessions_per_week) {
      const anchor = assignments.find((a) => a.runners_up.some((r) => r.sme_id === sme.id));
      addFlag({
        session_id: anchor?.session_id ?? assignments[0].session_id,
        sme_id: sme.id, code: "UNDERLOAD", severity: "medium",
        reason: `${sme.name} drafted for ${c} sessions against a minimum of ${sme.prefs.min_sessions_per_week} — an income floor, and the main driver of SME churn.`,
        suggested_fix: "Swap in on a session where they are runner-up before approving.",
      });
    }
    if (finalWorkload[sme.id].deficit < -2.5) {
      addFlag({
        session_id: assignments.find((a) => a.sme_id === sme.id)?.session_id ?? assignments[0].session_id,
        sme_id: sme.id, code: "FAIRNESS", severity: "medium",
        reason: `${sme.name} is ${Math.abs(finalWorkload[sme.id].deficit).toFixed(1)} sessions above capacity-weighted fair share over the rolling 4 weeks.`,
        suggested_fix: "Move one session to an underloaded runner-up.",
      });
    }
  }

  // Rank flags: severity, then blast radius (learners), then how soon it lands.
  const sevRank: Record<Severity, number> = { blocker: 0, high: 1, medium: 2, low: 3 };
  const sesById = new Map(sessions.map((s) => [s.id, s]));
  flags.sort((a, b) => {
    const d = sevRank[a.severity] - sevRank[b.severity];
    if (d !== 0) return d;
    const sa = sesById.get(a.session_id)!, sb = sesById.get(b.session_id)!;
    if (sb.learner_count !== sa.learner_count) return sb.learner_count - sa.learner_count;
    return ms(sa.start_utc) - ms(sb.start_utc);
  });
  flags.forEach((f, i) => (f.rank = i + 1));

  const filled = assignments.filter((a) => a.sme_id).length;
  const counts = smes.filter((s) => s.status === "active").map((s) => draftCounts[s.id] ?? 0);

  return {
    assignments: assignments.sort((a, b) =>
      ms(sesById.get(a.session_id)!.start_utc) - ms(sesById.get(b.session_id)!.start_utc)),
    flags,
    workload: finalWorkload,
    stats: {
      total_sessions: sessions.length,
      filled,
      unfilled: sessions.length - filled,
      blockers: flags.filter((f) => f.severity === "blocker").length,
      flags: flags.length,
      gini: gini(counts),
      auto_fill_rate: filled / sessions.length,
      generated_at: new Date().toISOString(),
      llm_used: false,
    },
  };
}

/** Gini across drafted session counts — 0 is perfectly even, 1 is maximally skewed. */
export function gini(values: number[]): number {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  const n = v.length, sum = v.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (2 * (i + 1) - n - 1) * v[i];
  return cum / (n * sum);
}

export const topicLabel = (t: string) => TOPIC_LABEL[t] ?? t;
