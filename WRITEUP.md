# SME-to-Session Scheduling Agent — Write-up

**Sneha Jha** · Associate Product Manager assignment · Interview Kickstart

Live prototype: https://sme-scheduler-eight.vercel.app · Repo: https://github.com/Sneh075/sme-scheduler

---

## 1. Problem framing and success metrics

### What is actually broken

Weekly instructor scheduling is a constrained assignment problem currently solved by
human eyeballing in a spreadsheet. Ops opens a sheet, reads a session list, holds a
dozen SME calendars in their head, and hand-places each row.

That method fails in four predictable ways:

| Failure | Why it happens |
| --- | --- |
| Double-bookings | No system-level check that an SME is free; humans miss overlaps across tabs |
| Expertise mismatch | Availability is easy to see, depth of expertise is not — so free beats qualified |
| Workload complaints | The same reliable SMEs get over-booked; others get nothing |
| Ops toil | Hours per week, every week, that scale linearly with session volume |

The fourth one is the reason this gets funded. The first three are the reason it has to
be trustworthy, not just fast.

### The framing choice that shaped the build

IK's SMEs are working engineers teaching part-time, paid per session. That single fact
changes the problem from "roster staff" to "allocate scarce, self-declared capacity in a
two-sided marketplace." Two consequences run through every design decision below:

- **Fairness is an economic constraint, not a nicety.** Under-assigning an SME cuts their
  income and they churn. Over-assigning burns them out. I model both a maximum *and* a
  minimum weekly load.
- **Ops must stay the decision-maker.** This is a draft generator with a human in the
  loop, not an auto-booker. Every assignment ships with the reasoning that produced it,
  and every override is recorded.

### Success metrics

**Primary — does it reduce toil without introducing errors?**

| Metric | Baseline (assumed) | Target |
| --- | --- | --- |
| Ops hours/week on scheduling | ~6 h | < 1.5 h within one quarter |
| Auto-fill rate (matched, no ops edit) | n/a | > 90% |
| Override rate (ops changes the agent's pick) | n/a | < 15% and falling week over week |
| Scheduling errors per 100 sessions | to be measured in shadow mode | → 0 for double-bookings |

**Secondary — is the marketplace healthier?**

- Workload Gini across active SMEs (0 = even, 1 = concentrated). The prototype reports
  this live; the seeded week scores **0.15**.
- SMEs falling below their declared weekly minimum — a leading indicator of churn.
- Learner session rating, segmented by whether the SME was auto-matched or overridden.

Baselines are stated as assumptions, not findings. The first job after handover is to
instrument the current spreadsheet process for two weeks and replace them with real ones.

**Override rate is the metric I would watch most closely.** It is the cheapest available
signal of model quality, and unlike ratings it arrives immediately. A rising override
rate on one flag type tells you exactly which rule is miscalibrated.

---

## 2. MVP scope — what shipped, what did not

### In scope (built and working)

- Ingest of a full synthetic week: 36 sessions, 15 SMEs, four weeks of assignment history.
- Hard-rule gating: availability, overlap, certification, proficiency floor, active status.
- Soft scoring: expertise fit, capacity-weighted rolling fairness, topic performance,
  SME preference, cohort continuity.
- Scarcity-first greedy assignment with a deterministic tie-break chain.
- Seven flag types with severity, plain-English reason and a suggested fix, ranked by
  severity → learners affected → time proximity.
- Human-in-the-loop UI: expandable review row, score contribution breakdown, ranked
  alternatives with one-click reassign, approve / reject / override, override audit trail.
- Three API endpoints: trigger run, fetch draft, submit approvals.
- Bounded LLM layer for semantic expertise matching and flag language, with a full
  deterministic fallback.

### Deferred, and why

| Deferred | Reason |
| --- | --- |
| Live Google Sheets / Calendar OAuth | Highest time cost, lowest proof value. All reads go through a `DataSource` interface; the Sheets adapter implements three methods and nothing else changes. |
| Database persistence | The prototype proves matching quality, not durability. Swapping the in-memory store for Postgres or Vercel KV touches one file. |
| SME-facing accept/decline loop | Doubles the state machine. The right v2 feature, wrong v1 feature — it can't be evaluated until the matching is trusted. |
| Notifications and calendar write-back | Downstream of approval; adds no evidence that matching works. |
| Multi-week planning horizon | Rolling fairness already looks back four weeks. Looking forward needs demand forecasting, which is a separate problem. |
| Optimal solver (Hungarian / OR-Tools) | See §3. Greedy is within a few percent at this volume and is explainable, which matters more right now. |
| Auth and roles | Single-user prototype. |

**Why the deferred list is longer than the in-scope list.** The assignment asks for a
credible slice, not a product. I optimised for depth on the matching-and-explaining loop —
the part that determines whether ops would ever trust this — over breadth of integrations,
which are well-understood engineering with no product risk attached.

---

## 3. Data model and matching logic

### Data model

Five entities: `Session`, `SME`, `Assignment`, `Flag`, `ScoreBreakdown`. Two decisions
worth defending:

**Proficiency is graded 1–5, not boolean.** A boolean tag collapses "can teach this" and
"is the best person for this" into one bit, leaving the scorer nothing to work with.
Grading gives a clean gate (`intro` ≥ 2, `intermediate` ≥ 3, `senior` ≥ 4) *and* a
continuous input to expertise fit.

**Availability is materialised as UTC intervals at ingest**, not stored as recurrence
rules. Recurrence, DST and time-zone conversion are resolved once, at the edge. From that
point matching is pure interval arithmetic on UTC milliseconds. Time zones are then
purely a rendering concern — the UI shows IST alongside each SME's local time, and the
matcher never converts anything. This is the single change that removes the most common
class of silent scheduling bug.

### Matching pipeline

```
Ingest → [1] Hard gates → [2] Score → [3] Assign scarcity-first → [4] Flag & rank → Review
```

**Stage 1 — hard gates.** Fail any one and the SME is removed entirely; no score is
computed. Active status · availability window fully contains the session + 15 min buffer ·
no overlap with an existing draft assignment · certified for the session type ·
proficiency ≥ the level floor.

**Stage 2 — weighted soft score.**

```
score = 0.30 · expertise_fit
      + 0.30 · rolling_fairness
      + 0.20 · topic_performance
      + 0.10 · sme_preference
      + 0.10 · cohort_continuity
      ± semantic_adjustment   (hard-bounded to ±0.15)
```

Fairness is **capacity-weighted**, not equal-split:

```
target_i   = (capacity_hours_i / Σ capacity_hours) × sessions_in_rolling_window
actual_i   = assignments in trailing 4 weeks + current draft
deficit_i  = target_i − actual_i        → min-max normalised across the eligible pool
```

An SME offering 4 h/week and one offering 20 h/week should not carry the same target;
treating unequal contributors equally *is* the unfairness. The deficit includes the
in-progress draft, which is what stops the highest-scoring SME sweeping the week. An SME
still below their declared weekly minimum receives a floor boost, because that minimum is
an income floor and the strongest churn driver in the pool.

**Stage 3 — scarcity-first assignment.** Sessions are sorted ascending by eligible-candidate
count, so the hardest-to-fill slots claim the pool before the easy ones do. Pure
score-greedy would spend the only senior ML SME on a generic doubt-clearing call and
leave the ML system design class unfilled.

This is a greedy heuristic, not an optimum. At 36–200 sessions/week the gap to optimal is
small and greedy is explainable to ops, which is worth more than the last few percent of
quality. The upgrade path is a min-cost bipartite matching (Hungarian, or OR-Tools) once
volume or the cost of a suboptimal assignment justifies losing per-session explainability.

**Tie-breaks are deterministic and ordered**: higher fairness deficit → higher topic
performance → preference match → lower current draft load → stable hash of
`session_id + sme_id`. Never `Math.random()` — ops re-running the week and getting a
different schedule would destroy trust in the tool faster than any bad match.

### How rules and the LLM interact

This is the load-bearing technical decision. LLMs are poor at combinatorial optimisation
and unauditable when they get it wrong, so **the LLM never assigns anyone.**

| Layer | Owner | Rationale |
| --- | --- | --- |
| Availability, overlap, certification, level floor | Deterministic | A wrong answer is a bug, not an opinion |
| Fairness maths, workload counters, scoring, assignment | Deterministic | Must be reproducible and auditable |
| Semantic expertise match beyond literal tags | LLM, bounded ±0.15 | "Consistent Hashing & Sharding" implies distributed-systems depth that tags alone miss |
| Flag reasons and suggested fixes | LLM | Language, not judgement |

The **±0.15 bound is enforced twice** — once in the LLM adapter, once in the scorer. A
hallucinated adjustment can nudge a ranking between two already-eligible SMEs. It can
never book someone uncertified, unavailable, or under-qualified, because gates run before
the LLM is consulted and are unreachable from it.

Every LLM call is wrapped in try/catch with a timeout and degrades to the deterministic
path. **The prototype runs correctly with no API key at all** — the semantic layer is an
enhancement, never a dependency.

### How conflicts are ranked

`severity → learners affected → time proximity`. A blocker on Monday's 62-learner cohort
class outranks a blocker on Friday's 1:1 mock. Ops has finite attention on approval day;
the queue should spend it on blast radius.

Seven flag types: `UNFILLED` (blocker), `EXPERTISE_STRETCH`, `SINGLE_CANDIDATE`,
`OVERLOAD` (high), `FAIRNESS`, `UNDERLOAD` (medium), `PREF_MISS` (low).

`SINGLE_CANDIDATE` is the one I would defend hardest. It flags sessions that *are* filled
but have zero bench — the schedule looks fine until someone drops out on Tuesday. Surfacing
fragility before it becomes a fire is most of the value of doing this systematically.

---

## 4. Edge cases

| Case | Handling |
| --- | --- |
| **Last-minute drop-out** | `SINGLE_CANDIDATE` flags zero-bench sessions at draft time. Runners-up are precomputed and stored per assignment, so reassignment is one click. A full re-run is deterministic, so re-running after a drop-out only changes what it must. |
| **No qualified SME** | The session is left explicitly unfilled and flagged as a blocker — never silently filled with someone unqualified. The flag names the closest near-miss and the single rule they failed, which converts "no one is available" into "ask Kabir to move 30 minutes." |
| **Ties** | A five-step deterministic chain, fairness first. Ties are surfaced in the UI with the reason they were broken, so ops sees the coin-flip rather than a false certainty. |
| **Time zones** | UTC everywhere internally; local rendering only. The seeded pool spans IST, GMT and PST. Materialising availability at ingest means DST is resolved once by the tz library, not repeatedly by the matcher. |
| **Rolling fairness** | Four-week trailing window on both target and actual. Current-week-only fairness is actively wrong: an SME with 8 sessions last week and 2 this week reads as underloaded and gets piled on. |
| **Over-cap assignment** | Configurable. Default treats the SME's declared cap as *soft* — the SME appears with an `OVERLOAD` flag rather than the session becoming unfillable, because that trade-off belongs to ops, not the algorithm. A toggle makes it hard. |

---

## 5. Measuring real-world impact

**Phase 1 — Shadow mode (2 weeks, no risk).** The agent runs every week against real data;
ops schedules manually as usual. Measure agreement rate, where they diverge, and who was
right. This calibrates weights before a single learner is affected, and produces the real
baselines that §1 currently assumes.

**Phase 2 — Limited rollout (3–4 weeks).** One session type only — doubt-clearing, the
lowest-stakes and highest-volume category. Ops reviews and approves every draft. Track
override rate by flag type; a cluster of overrides on one flag is a miscalibrated rule,
not user resistance.

**Phase 3 — Full rollout with monitored auto-approve.** Sessions with no flags and a score
above a threshold auto-approve; everything flagged still routes to a human. This is where
the ops-hours metric actually moves.

**Instrumentation to build in from day one:** log every override with the reason and the
delta between the agent's pick and the human's, log time-to-approve per schedule, and
snapshot the workload distribution weekly. The override log is the training signal for
every future weight adjustment — without it, tuning is guesswork.

**What would tell me this failed:** override rate flat above 25% after four weeks. That
would mean ops is re-deciding rather than reviewing, and the agent is adding a step
instead of removing one. The response would be to narrow scope to the session types where
agreement is already high, rather than to keep tuning weights on the hard ones.

---

## 6. Trade-offs made under time constraint

Built in a single day. The explicit calls:

1. **Next.js API routes instead of a separate FastAPI service.** The spec named FastAPI;
   the deliverable named Vercel, and those pull apart. One deployment and a data model
   shared between engine and UI was worth more than framework fidelity. The matching
   engine is a pure module with no framework coupling — porting it to FastAPI is mechanical.
2. **Depth on matching over breadth on integrations.** Real OAuth would have consumed the
   build window and proven nothing about match quality.
3. **Seeded, deterministic synthetic data.** Every run is reproducible, and the edge cases
   are deliberately planted — three genuinely unfillable sessions, one true tie, one paused
   SME who looks perfect on paper, one starved SME, one over-loaded SME.
4. **Greedy over optimal.** Explainability beat the last few percent of assignment quality,
   and at this volume the gap is small.

The seeded week produces **33 of 36 sessions filled (92%), 3 blockers, 30 flags, workload
Gini 0.15** — the three unfilled sessions are genuine capacity gaps, correctly identified
rather than papered over.
