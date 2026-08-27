import { SME, Session, SessionType, Level, Window } from "@/types";

/** Deterministic PRNG so every run of the demo is reproducible. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260827);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

/** Monday of the target week, 00:00 UTC. Fixed date keeps the demo stable. */
export const WEEK_START = "2026-08-31T00:00:00.000Z";
const MONDAY = new Date(WEEK_START).getTime();
const DAY = 86400000, HOUR = 3600000, MIN = 60000;

const at = (day: number, hourUtc: number, min = 0) =>
  new Date(MONDAY + day * DAY + hourUtc * HOUR + min * MIN).toISOString();

export const TOPICS = [
  "system_design", "distributed_systems", "algorithms", "data_structures",
  "machine_learning", "ml_system_design", "backend", "frontend",
  "behavioral", "sql_data", "devops_cloud", "product_sense",
] as const;

export const TOPIC_LABEL: Record<string, string> = {
  system_design: "System Design", distributed_systems: "Distributed Systems",
  algorithms: "Algorithms", data_structures: "Data Structures",
  machine_learning: "Machine Learning", ml_system_design: "ML System Design",
  backend: "Backend Engineering", frontend: "Frontend Engineering",
  behavioral: "Behavioral", sql_data: "SQL & Data Modelling",
  devops_cloud: "DevOps & Cloud", product_sense: "Product Sense",
};

/** Availability windows are materialised in UTC at ingest. The matcher never converts time zones. */
function win(day: number, startUtcHour: number, hours: number): Window {
  return { start_utc: at(day, startUtcHour), end_utc: at(day, startUtcHour + hours) };
}

type SMESeed = {
  id: string; name: string; tz: string; off: number;
  prof: Record<string, number>;
  cert: SessionType[];
  avail: Window[];
  pref: string[]; max: number; min: number;
  perf: Record<string, number>; rel: number;
  hist: number[];          // trailing 4 weeks, oldest first
  cap: number;             // hours offered over trailing 4 weeks
};

// Availability is in UTC. IST = UTC+5:30, PST = UTC-7, GMT = UTC+1 (BST).
const seeds: SMESeed[] = [
  { id: "sme_01", name: "Ananya Rao", tz: "Asia/Kolkata", off: 330,
    prof: { system_design: 5, distributed_systems: 5, backend: 4, algorithms: 3 },
    cert: ["cohort_class", "mock_interview", "doubt_clearing"],
    avail: [win(0,12,5), win(1,12,5), win(2,13,4), win(3,12,5), win(4,12,3)],
    pref: ["system_design", "distributed_systems"], max: 6, min: 3,
    perf: { system_design: 4.8, distributed_systems: 4.7, backend: 4.2, algorithms: 4.0 }, rel: 0.98,
    hist: [7, 6, 7, 6], cap: 88 },

  { id: "sme_02", name: "Rahul Menon", tz: "Asia/Kolkata", off: 330,
    prof: { algorithms: 5, data_structures: 5, backend: 3 },
    cert: ["cohort_class", "mock_interview", "doubt_clearing"],
    avail: [win(0,13,4), win(2,13,5), win(3,14,4), win(4,13,4)],
    pref: ["algorithms", "data_structures"], max: 6, min: 3,
    perf: { algorithms: 4.6, data_structures: 4.5, backend: 3.8 }, rel: 0.95,
    hist: [2, 1, 2, 1], cap: 68 },

  { id: "sme_03", name: "Priya Nair", tz: "Asia/Kolkata", off: 330,
    prof: { machine_learning: 5, ml_system_design: 4, sql_data: 4, algorithms: 3 },
    cert: ["cohort_class", "doubt_clearing"],
    avail: [win(1,14,4), win(3,14,4), win(4,15,3)],
    pref: ["machine_learning", "ml_system_design"], max: 4, min: 2,
    perf: { machine_learning: 4.9, ml_system_design: 4.4, sql_data: 4.1, algorithms: 3.6 }, rel: 0.97,
    hist: [3, 4, 3, 3], cap: 44 },

  { id: "sme_04", name: "Daniel Okoro", tz: "Europe/London", off: 60,
    prof: { backend: 5, devops_cloud: 5, distributed_systems: 4, system_design: 3 },
    cert: ["cohort_class", "mock_interview", "doubt_clearing"],
    avail: [win(0,8,6), win(1,8,6), win(2,8,4), win(4,8,5)],
    pref: ["devops_cloud", "backend"], max: 6, min: 3,
    perf: { backend: 4.5, devops_cloud: 4.7, distributed_systems: 4.0, system_design: 3.7 }, rel: 0.93,
    hist: [4, 5, 4, 5], cap: 84 },

  { id: "sme_05", name: "Meera Krishnan", tz: "America/Los_Angeles", off: -420,
    prof: { frontend: 5, system_design: 4, algorithms: 3, product_sense: 3 },
    cert: ["cohort_class", "mock_interview", "doubt_clearing"],
    avail: [win(0,16,4), win(2,15,5), win(3,16,4), win(4,15,4)],
    pref: ["frontend"], max: 5, min: 2,
    perf: { frontend: 4.7, system_design: 4.1, algorithms: 3.9, product_sense: 3.8 }, rel: 0.96,
    hist: [3, 3, 2, 4], cap: 52 },

  { id: "sme_06", name: "Arjun Deshpande", tz: "Asia/Kolkata", off: 330,
    prof: { behavioral: 5, product_sense: 4, system_design: 3 },
    cert: ["mock_interview", "doubt_clearing"],
    avail: [win(1,11,6), win(2,11,5), win(3,11,4), win(4,10,5)],
    pref: ["behavioral"], max: 6, min: 3,
    perf: { behavioral: 4.8, product_sense: 4.3, system_design: 3.5 }, rel: 0.99,
    hist: [5, 4, 5, 4], cap: 72 },

  { id: "sme_07", name: "Sofia Almeida", tz: "Europe/London", off: 60,
    prof: { sql_data: 5, machine_learning: 3, backend: 3 },
    cert: ["cohort_class", "doubt_clearing"],
    avail: [win(1,9,5), win(3,9,5)],
    pref: ["sql_data"], max: 4, min: 2,
    perf: { sql_data: 4.6, machine_learning: 3.7, backend: 3.6 }, rel: 0.91,
    hist: [2, 2, 3, 2], cap: 40 },

  { id: "sme_08", name: "Vikram Sethi", tz: "Asia/Kolkata", off: 330,
    prof: { distributed_systems: 5, system_design: 5, backend: 4, devops_cloud: 3 },
    cert: ["cohort_class", "mock_interview", "doubt_clearing"],
    avail: [win(0,14,4), win(2,14,4), win(3,11,5), win(4,14,4)],
    pref: ["distributed_systems"], max: 5, min: 3,
    perf: { distributed_systems: 4.5, system_design: 4.4, backend: 4.0, devops_cloud: 3.8 }, rel: 0.88,
    hist: [4, 4, 3, 4], cap: 60 },

  { id: "sme_09", name: "Neha Bhatt", tz: "Asia/Kolkata", off: 330,
    prof: { data_structures: 4, algorithms: 4, frontend: 3 },
    cert: ["doubt_clearing"],
    avail: [win(0,12,4), win(1,12,4), win(2,12,4), win(3,12,4), win(4,12,4)],
    pref: ["algorithms"], max: 8, min: 4,
    perf: { data_structures: 4.2, algorithms: 4.0, frontend: 3.5 }, rel: 0.94,
    hist: [1, 0, 1, 1], cap: 80 },

  { id: "sme_10", name: "Kabir Anand", tz: "America/Los_Angeles", off: -420,
    prof: { ml_system_design: 5, machine_learning: 5, distributed_systems: 4 },
    cert: ["cohort_class", "mock_interview"],
    avail: [win(2,17,3), win(4,17,3)],
    pref: ["ml_system_design"], max: 3, min: 1,
    perf: { ml_system_design: 4.9, machine_learning: 4.8, distributed_systems: 4.2 }, rel: 0.9,
    hist: [2, 3, 2, 2], cap: 30 },

  { id: "sme_11", name: "Ishita Verma", tz: "Asia/Kolkata", off: 330,
    prof: { product_sense: 5, behavioral: 4, frontend: 3 },
    cert: ["cohort_class", "mock_interview", "doubt_clearing"],
    avail: [win(0,11,4), win(1,10,4), win(3,10,6), win(4,10,4)],
    pref: ["product_sense", "behavioral"], max: 5, min: 2,
    perf: { product_sense: 4.5, behavioral: 4.2, frontend: 3.4 }, rel: 0.97,
    hist: [3, 2, 3, 3], cap: 48 },

  { id: "sme_12", name: "Tom Whitaker", tz: "Europe/London", off: 60,
    prof: { system_design: 4, backend: 4, algorithms: 4, data_structures: 4 },
    cert: ["cohort_class", "mock_interview", "doubt_clearing"],
    avail: [win(0,9,5), win(2,9,5), win(4,9,5)],
    pref: ["system_design"], max: 6, min: 3,
    perf: { system_design: 4.0, backend: 4.1, algorithms: 4.2, data_structures: 4.0 }, rel: 0.92,
    hist: [4, 3, 4, 4], cap: 60 },

  // Deliberate edge case: paused SME who looks perfect on paper.
  { id: "sme_13", name: "Farah Siddiqui", tz: "Asia/Kolkata", off: 330,
    prof: { ml_system_design: 5, machine_learning: 5 },
    cert: ["cohort_class", "mock_interview", "doubt_clearing"],
    avail: [win(0,12,6), win(1,12,6), win(2,12,6)],
    pref: ["ml_system_design"], max: 6, min: 3,
    perf: { ml_system_design: 4.7, machine_learning: 4.6 }, rel: 0.85,
    hist: [0, 0, 0, 0], cap: 0 },

  // Deliberate tie partner for sme_12 on one session.
  { id: "sme_14", name: "George Mathew", tz: "Europe/London", off: 60,
    prof: { system_design: 4, backend: 4, algorithms: 4, data_structures: 4 },
    cert: ["cohort_class", "mock_interview", "doubt_clearing"],
    avail: [win(0,9,5), win(2,9,5), win(4,9,5)],
    pref: ["system_design"], max: 6, min: 3,
    perf: { system_design: 4.0, backend: 4.1, algorithms: 4.2, data_structures: 4.0 }, rel: 0.92,
    hist: [4, 3, 4, 4], cap: 60 },

  { id: "sme_15", name: "Lakshmi Iyer", tz: "Asia/Kolkata", off: 330,
    prof: { frontend: 4, product_sense: 3, behavioral: 3 },
    cert: ["cohort_class", "doubt_clearing"],
    avail: [win(1,13,4), win(3,13,4), win(4,14,5)],
    pref: ["frontend"], max: 4, min: 2,
    perf: { frontend: 4.3, product_sense: 3.6, behavioral: 3.5 }, rel: 0.95,
    hist: [2, 2, 2, 1], cap: 32 },
];

export function buildSMEs(): SME[] {
  const weeks = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"];
  return seeds.map((s) => ({
    id: s.id, name: s.name, home_tz: s.tz, tz_offset_min: s.off,
    status: s.id === "sme_13" ? "paused" : "active",
    proficiency: s.prof,
    certified_for: s.cert,
    availability: s.avail,
    prefs: { preferred_topics: s.pref, max_sessions_per_week: s.max, min_sessions_per_week: s.min },
    performance: { by_topic: s.perf, by_type: {}, reliability: s.rel },
    history: weeks.map((w, i) => ({ week_start: w, count: s.hist[i] })),
    capacity_hours_4wk: s.cap,
  }));
}

type SSeed = [string, SessionType, string[], Level, number, number, number, number, string?];
// [title, type, tags, level, day, utcHour, durationMin, learners, cohort]
const sessionSeeds: SSeed[] = [
  ["System Design Foundations — Week 3", "cohort_class", ["system_design"], "intermediate", 0, 13, 90, 62, "CH-A"],
  ["Consistent Hashing & Sharding", "cohort_class", ["distributed_systems","system_design"], "senior", 0, 15, 90, 41, "CH-B"],
  ["DS Doubt Clearing — Trees & Graphs", "doubt_clearing", ["data_structures"], "intro", 0, 12, 60, 18],
  ["Mock Interview — Backend (L5)", "mock_interview", ["backend","system_design"], "senior", 0, 10, 60, 1],
  ["React Rendering Internals", "cohort_class", ["frontend"], "intermediate", 0, 17, 90, 35, "CH-C"],
  ["Behavioral Prep — STAR Method", "doubt_clearing", ["behavioral"], "intro", 0, 11, 60, 24],

  ["ML System Design — Recommenders", "cohort_class", ["ml_system_design","machine_learning"], "senior", 1, 14, 90, 48, "CH-D"],
  ["SQL Window Functions Workshop", "cohort_class", ["sql_data"], "intermediate", 1, 9, 90, 29, "CH-E"],
  ["Algorithms Doubt Clearing — DP", "doubt_clearing", ["algorithms"], "intermediate", 1, 13, 60, 22],
  ["Mock Interview — Product Sense", "mock_interview", ["product_sense"], "intermediate", 1, 11, 60, 1],
  ["Cloud Deployment Patterns", "cohort_class", ["devops_cloud","backend"], "intermediate", 1, 9, 90, 31, "CH-F"],
  ["Mock Interview — Behavioral (L6)", "mock_interview", ["behavioral"], "senior", 1, 12, 60, 1],

  ["System Design Foundations — Week 3b", "cohort_class", ["system_design"], "intermediate", 2, 9, 90, 58, "CH-A"],
  ["Distributed Consensus — Raft", "cohort_class", ["distributed_systems"], "senior", 2, 14, 90, 37, "CH-B"],
  ["Frontend Doubt Clearing", "doubt_clearing", ["frontend"], "intro", 2, 16, 60, 19],
  ["Mock Interview — ML Engineer", "mock_interview", ["ml_system_design","machine_learning"], "senior", 2, 17, 60, 1],
  ["Algorithms Doubt Clearing — Greedy", "doubt_clearing", ["algorithms"], "intro", 2, 12, 60, 21],
  ["Backend Deep Dive — Caching Layers", "cohort_class", ["backend","distributed_systems"], "intermediate", 2, 8, 90, 44, "CH-F"],
  ["Mock Interview — Frontend (L4)", "mock_interview", ["frontend"], "intermediate", 2, 16, 60, 1],

  ["Kafka & Event-Driven Architecture", "cohort_class", ["distributed_systems","backend"], "senior", 3, 12, 90, 39, "CH-B"],
  ["ML Foundations — Feature Engineering", "cohort_class", ["machine_learning"], "intermediate", 3, 14, 90, 46, "CH-D"],
  ["SQL Doubt Clearing", "doubt_clearing", ["sql_data"], "intro", 3, 9, 60, 17],
  ["Mock Interview — System Design (L5)", "mock_interview", ["system_design"], "senior", 3, 12, 60, 1],
  ["Product Sense Workshop", "cohort_class", ["product_sense"], "intermediate", 3, 11, 90, 33, "CH-G"],
  ["Frontend Doubt Clearing — State", "doubt_clearing", ["frontend"], "intro", 3, 13, 60, 20],
  ["Mock Interview — Backend (L4)", "mock_interview", ["backend"], "intermediate", 3, 16, 60, 1],

  ["System Design — Rate Limiting Patterns", "cohort_class", ["system_design","distributed_systems"], "senior", 4, 9, 90, 51, "CH-A"],
  ["Algorithms — Graph Traversal Lab", "cohort_class", ["algorithms","data_structures"], "intermediate", 4, 13, 90, 43, "CH-H"],
  ["ML System Design — Ranking at Scale", "cohort_class", ["ml_system_design"], "senior", 4, 17, 90, 40, "CH-D"],
  ["Behavioral Doubt Clearing", "doubt_clearing", ["behavioral"], "intro", 4, 11, 60, 26],
  ["Mock Interview — DevOps (L5)", "mock_interview", ["devops_cloud"], "senior", 4, 8, 60, 1],
  ["Data Structures Doubt Clearing", "doubt_clearing", ["data_structures"], "intro", 4, 12, 60, 23],
  ["Mock Interview — Distributed Systems", "mock_interview", ["distributed_systems"], "senior", 4, 14, 60, 1],
  ["Frontend Capstone Review", "cohort_class", ["frontend"], "intermediate", 4, 15, 90, 30, "CH-C"],

  // Deliberate gap: no active SME certified + available + senior-proficient for this slot.
  ["Advanced ML Infrastructure — GPU Scheduling", "cohort_class", ["ml_system_design","devops_cloud"], "senior", 3, 20, 90, 27, "CH-D"],
  // Deliberate gap: topic nobody is proficient in at senior level at that hour.
  ["Mock Interview — ML System Design (L6)", "mock_interview", ["ml_system_design"], "senior", 1, 20, 60, 1],
];

export function buildSessions(): Session[] {
  return sessionSeeds.map((s, i) => ({
    id: `ses_${String(i + 1).padStart(2, "0")}`,
    title: s[0], type: s[1], topic_tags: s[2], required_level: s[3],
    start_utc: at(s[4], s[5]), duration_min: s[6],
    learner_count: s[7], cohort_id: s[8],
  }));
}
