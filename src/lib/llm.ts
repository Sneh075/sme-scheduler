import { Flag, Session, SME } from "@/types";

/**
 * The LLM is used for language and fuzzy semantic judgement only.
 * It never assigns anyone, never opens a hard gate, and every call
 * falls back to a deterministic string so the demo works without a key.
 */

const MODEL = "claude-sonnet-4-6";
const KEY = process.env.ANTHROPIC_API_KEY;

async function callClaude(system: string, user: string, maxTokens = 900): Promise<string | null> {
  if (!KEY) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
  } catch {
    return null;
  }
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    const clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const s = clean.indexOf("{");
    const a = clean.indexOf("[");
    const start = a !== -1 && (a < s || s === -1) ? a : s;
    if (start === -1) return null;
    const end = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
    return JSON.parse(clean.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/**
 * Semantic expertise match. Returns "sessionId|smeId" -> adjustment in [-0.15, 0.15].
 * Bounded again inside the engine, so a hallucination can nudge a ranking but can
 * never bypass certification, availability or the proficiency floor.
 */
export async function semanticAdjustments(
  sessions: Session[],
  smes: SME[]
): Promise<Record<string, number>> {
  if (!KEY) return {};
  const compactSessions = sessions.slice(0, 40).map((s) => ({
    id: s.id, title: s.title, tags: s.topic_tags, level: s.required_level,
  }));
  const compactSmes = smes
    .filter((s) => s.status === "active")
    .map((s) => ({ id: s.id, name: s.name, topics: Object.keys(s.proficiency) }));

  const raw = await callClaude(
    "You judge whether a session title implies expertise beyond its literal topic tags. " +
      "Return ONLY a JSON array. No prose, no markdown.",
    `Sessions:\n${JSON.stringify(compactSessions)}\n\nSMEs:\n${JSON.stringify(compactSmes)}\n\n` +
      `For at most 12 session/SME pairs where the session TITLE reveals a fit or mismatch the tags alone miss, ` +
      `return objects: {"session_id":"...","sme_id":"...","adj":<number between -0.15 and 0.15>,"why":"<10 words>"}. ` +
      `Positive means a better fit than the tags suggest. Return [] if nothing stands out.`,
    1200
  );

  const parsed = parseJson<{ session_id: string; sme_id: string; adj: number }[]>(raw);
  if (!Array.isArray(parsed)) return {};
  const out: Record<string, number> = {};
  for (const p of parsed) {
    if (!p?.session_id || !p?.sme_id || typeof p.adj !== "number") continue;
    out[`${p.session_id}|${p.sme_id}`] = Math.max(-0.15, Math.min(0.15, p.adj));
  }
  return out;
}

/** Rewrites flag reasons in ops-facing language. Falls back to the deterministic reason. */
export async function humaniseFlags(flags: Flag[], sessions: Session[]): Promise<Flag[]> {
  if (!KEY || !flags.length) return flags;
  const sesById = new Map(sessions.map((s) => [s.id, s]));
  const top = flags.slice(0, 12);
  const payload = top.map((f) => ({
    id: f.id, code: f.code, severity: f.severity,
    session: sesById.get(f.session_id)?.title,
    learners: sesById.get(f.session_id)?.learner_count,
    reason: f.reason, fix: f.suggested_fix,
  }));

  const raw = await callClaude(
    "You write scheduling alerts for an operations team. One sentence each, plain English, " +
      "specific and actionable. Never invent facts not present in the input. Return ONLY JSON.",
    `Rewrite each alert. Keep every number and name exactly as given.\n${JSON.stringify(payload)}\n\n` +
      `Return: [{"id":"...","reason":"<one sentence>","suggested_fix":"<one short sentence>"}]`,
    1400
  );

  const parsed = parseJson<{ id: string; reason: string; suggested_fix: string }[]>(raw);
  if (!Array.isArray(parsed)) return flags;
  const map = new Map(parsed.map((p) => [p.id, p]));
  return flags.map((f) => {
    const p = map.get(f.id);
    return p?.reason ? { ...f, reason: p.reason, suggested_fix: p.suggested_fix || f.suggested_fix } : f;
  });
}

export const llmEnabled = () => Boolean(KEY);
