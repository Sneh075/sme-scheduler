import { NextResponse } from "next/server";
import { getRun, saveRun } from "@/lib/store";
import { Assignment } from "@/types";

export const dynamic = "force-dynamic";

type Action =
  | { action: "approve"; session_id: string }
  | { action: "approve_all" }
  | { action: "reject"; session_id: string }
  | { action: "override"; session_id: string; sme_id: string };

/** POST /api/approve — human-in-the-loop decisions on the draft. */
export async function POST(req: Request) {
  const run = getRun();
  if (!run) return NextResponse.json({ error: "No draft to act on." }, { status: 404 });

  const body = (await req.json()) as Action;
  const find = (id: string) => run.assignments.find((a) => a.session_id === id);

  if (body.action === "approve_all") {
    run.assignments.forEach((a) => {
      if (a.sme_id && a.status === "draft") a.status = "approved";
    });
  } else {
    const a: Assignment | undefined = find((body as any).session_id);
    if (!a) return NextResponse.json({ error: "Unknown session." }, { status: 404 });

    if (body.action === "approve") a.status = "approved";
    if (body.action === "reject") { a.status = "rejected"; a.sme_id = null; }
    if (body.action === "override") {
      const sme = run.smes.find((s) => s.id === body.sme_id);
      if (!sme) return NextResponse.json({ error: "Unknown SME." }, { status: 404 });
      const runnerUp = a.runners_up.find((r) => r.sme_id === body.sme_id);
      a.overridden_from = a.sme_id;
      a.sme_id = body.sme_id;
      a.status = "overridden";
      if (runnerUp) { a.score = runnerUp.score; a.breakdown = runnerUp.breakdown; }
      // Keep the displaced SME available as a one-click swap back.
      if (a.overridden_from) {
        const prev = run.assignments.find((x) => x.session_id === a.session_id);
        if (prev && !prev.runners_up.some((r) => r.sme_id === a.overridden_from)) {
          const prevSme = run.smes.find((s) => s.id === a.overridden_from);
          if (prevSme) prev.runners_up.unshift({
            sme_id: prevSme.id, sme_name: prevSme.name,
            score: 0, breakdown: {
              expertise: 0, fairness: 0, performance: 0, preference: 0,
              continuity: 0, llm_adjustment: 0, total: 0,
            },
            notes: ["Displaced by an ops override"],
          });
        }
      }
    }
  }

  saveRun(run);
  return NextResponse.json(run);
}
