import { NextResponse } from "next/server";
import { getRun, saveRun } from "@/lib/store";
import { Assignment, DraftRun } from "@/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/approve — human-in-the-loop decisions on the draft.
 *
 * Stateless by design: the client sends the current draft with the request.
 * Serverless instances do not share memory, so a server-held draft is not
 * reliably available to a later request. The in-memory store is kept only as
 * a best-effort cache for GET /api/draft.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const run: DraftRun | undefined = body.run ?? getRun();
  if (!run) return NextResponse.json({ error: "No draft to act on." }, { status: 404 });

  const find = (id: string) => run.assignments.find((a) => a.session_id === id);

  if (body.action === "approve_all") {
    run.assignments.forEach((a) => {
      if (a.sme_id && a.status === "draft") a.status = "approved";
    });
  } else {
    const a: Assignment | undefined = find(body.session_id);
    if (!a) return NextResponse.json({ error: "Unknown session." }, { status: 404 });

    if (body.action === "approve") a.status = "approved";

    if (body.action === "reject") { a.status = "rejected"; a.sme_id = null; }

    if (body.action === "override") {
      const sme = run.smes.find((s) => s.id === body.sme_id);
      if (!sme) return NextResponse.json({ error: "Unknown SME." }, { status: 404 });

      const runnerUp = a.runners_up.find((r) => r.sme_id === body.sme_id);
      const displaced = a.sme_id;

      a.overridden_from = displaced;
      a.sme_id = body.sme_id;
      a.status = "overridden";
      if (runnerUp) { a.score = runnerUp.score; a.breakdown = runnerUp.breakdown; }

      a.runners_up = a.runners_up.filter((r) => r.sme_id !== body.sme_id);

      if (displaced && !a.runners_up.some((r) => r.sme_id === displaced)) {
        const prev = run.smes.find((s) => s.id === displaced);
        if (prev) {
          a.runners_up.unshift({
            sme_id: prev.id,
            sme_name: prev.name,
            score: 0,
            breakdown: {
              expertise: 0, fairness: 0, performance: 0,
              preference: 0, continuity: 0, llm_adjustment: 0, total: 0,
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
