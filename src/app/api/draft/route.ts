import { NextResponse } from "next/server";
import { getRun } from "@/lib/store";

export const dynamic = "force-dynamic";

/** GET /api/draft — fetch the current draft schedule. */
export async function GET() {
  const run = getRun();
  if (!run) {
    return NextResponse.json(
      { error: "No draft yet. Trigger a run first." },
      { status: 404 }
    );
  }
  return NextResponse.json(run);
}
