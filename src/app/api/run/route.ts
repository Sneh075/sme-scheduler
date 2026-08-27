import { NextResponse } from "next/server";
import { match } from "@/engine";
import { dataSource } from "@/lib/datasource";
import { humaniseFlags, llmEnabled, semanticAdjustments } from "@/lib/llm";
import { saveRun } from "@/lib/store";
import { DraftRun } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/run — trigger a weekly matching run. */
export async function POST(req: Request) {
  let capIsHard = false;
  try {
    const body = await req.json();
    capIsHard = Boolean(body?.capIsHard);
  } catch { /* body optional */ }

  const [sessions, smes] = await Promise.all([dataSource.getSessions(), dataSource.getSMEs()]);

  // Semantic pass is optional and bounded. Failure degrades to pure rules.
  let adjustments: Record<string, number> = {};
  try { adjustments = await semanticAdjustments(sessions, smes); } catch { adjustments = {}; }

  const result = match(sessions, smes, {
    capIsHard,
    semanticAdj: (sid, mid) => adjustments[`${sid}|${mid}`] ?? 0,
  });

  let flags = result.flags;
  try { flags = await humaniseFlags(result.flags, sessions); } catch { /* keep deterministic */ }

  const run: DraftRun = {
    run_id: `run_${Date.now()}`,
    week_start: dataSource.weekStart(),
    sessions, smes,
    assignments: result.assignments,
    flags,
    workload: result.workload,
    stats: { ...result.stats, llm_used: llmEnabled() },
  };
  saveRun(run);
  return NextResponse.json(run);
}
