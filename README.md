# SME-to-Session Scheduling Agent

Weekly instructor scheduling for live cohort classes, doubt-clearing calls and mock
interviews. Ingests a week of sessions and an SME pool, matches on availability,
expertise, rolling workload fairness and past performance, then hands ops a draft with
every conflict and gap flagged and explained.

Nothing is booked until a human approves it.

**Write-up:** [WRITEUP.md](./WRITEUP.md)

---

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Then click **Run weekly match**.

Optional — enable the semantic layer:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
```

The app runs correctly without a key. The LLM enhances expertise matching and flag
language; it is never a dependency.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. On vercel.com → **Add New → Project** → import the repo.
3. Framework preset auto-detects as Next.js. Leave all build settings default.
4. Optional: add `ANTHROPIC_API_KEY` under Environment Variables.
5. Deploy.

## Inspect the engine from the CLI

```bash
npx tsx scripts/inspect.ts
```

Prints the full match result — stats, per-SME load, ranked flags, unfilled sessions
and tie resolutions — without starting the server.

---

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/run` | Trigger a matching run. Body: `{ "capIsHard": boolean }` |
| `GET` | `/api/draft` | Fetch the current draft schedule |
| `POST` | `/api/approve` | `approve` · `approve_all` · `reject` · `override` |

```bash
curl -X POST localhost:3000/api/run -H 'content-type: application/json' -d '{}'
curl localhost:3000/api/draft
curl -X POST localhost:3000/api/approve -H 'content-type: application/json' \
  -d '{"action":"override","session_id":"ses_04","sme_id":"sme_12"}'
```

---

## Architecture

```
data/synthetic.ts      Seeded synthetic week — 36 sessions, 15 SMEs, 4 weeks of history
src/types.ts           Data model
src/engine/index.ts    Hard gates → scoring → scarcity-first assignment → flagging
src/lib/datasource.ts  DataSource interface; Sheets/Calendar adapter drops in here
src/lib/llm.ts         Bounded semantic layer, deterministic fallback
src/lib/store.ts       Prototype persistence (in-memory)
src/app/api/*          Three endpoints
src/app/page.tsx       Ops review console
```

### Rules vs LLM

| Layer | Owner |
| --- | --- |
| Availability, overlap, certification, proficiency floor | Deterministic |
| Fairness maths, scoring, assignment, tie-breaks | Deterministic |
| Semantic expertise match beyond literal tags | LLM, bounded to ±0.15 |
| Flag reasons and suggested fixes | LLM, with fallback |

The bound is enforced in both the adapter and the scorer. A hallucination can reorder two
already-eligible SMEs; it can never book someone uncertified, unavailable or
under-qualified.

### Seeded output

33 of 36 sessions filled (92%) · 3 blockers · 30 flags · workload Gini 0.15

The three unfilled sessions are genuine capacity gaps, deliberately planted and correctly
identified. The dataset also contains one true scoring tie, one paused SME who looks
ideal on paper, one starved SME and one at their cap.
