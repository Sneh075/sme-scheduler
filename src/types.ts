export type SessionType = "cohort_class" | "doubt_clearing" | "mock_interview";
export type Level = "intro" | "intermediate" | "senior";

export interface Window { start_utc: string; end_utc: string; }

export interface Session {
  id: string;
  title: string;
  type: SessionType;
  topic_tags: string[];
  required_level: Level;
  start_utc: string;
  duration_min: number;
  cohort_id?: string;
  learner_count: number;
}

export interface SME {
  id: string;
  name: string;
  home_tz: string;
  tz_offset_min: number;          // used for display only
  status: "active" | "paused";
  proficiency: Record<string, number>;   // topic -> 1..5
  certified_for: SessionType[];
  availability: Window[];
  prefs: {
    preferred_topics: string[];
    max_sessions_per_week: number;
    min_sessions_per_week: number;
  };
  performance: {
    by_topic: Record<string, number>;    // 0..5
    by_type: Partial<Record<SessionType, number>>;
    reliability: number;                 // 0..1
  };
  history: { week_start: string; count: number }[];  // trailing 4 weeks
  capacity_hours_4wk: number;
}

export type FlagCode =
  | "UNFILLED"
  | "EXPERTISE_STRETCH"
  | "OVERLOAD"
  | "FAIRNESS"
  | "SINGLE_CANDIDATE"
  | "PREF_MISS"
  | "UNDERLOAD";

export type Severity = "blocker" | "high" | "medium" | "low";

export interface Flag {
  id: string;
  session_id: string;
  sme_id?: string | null;
  code: FlagCode;
  severity: Severity;
  reason: string;
  suggested_fix?: string;
  rank: number;
}

export interface ScoreBreakdown {
  expertise: number;
  fairness: number;
  performance: number;
  preference: number;
  continuity: number;
  llm_adjustment: number;
  total: number;
}

export interface Candidate {
  sme_id: string;
  sme_name: string;
  score: number;
  breakdown: ScoreBreakdown;
  notes: string[];
}

export interface Assignment {
  session_id: string;
  sme_id: string | null;
  score: number;
  breakdown?: ScoreBreakdown;
  runners_up: Candidate[];
  eligible_count: number;
  status: "draft" | "approved" | "overridden" | "rejected";
  overridden_from?: string | null;
  tie_note?: string;
}

export interface RunStats {
  total_sessions: number;
  filled: number;
  unfilled: number;
  blockers: number;
  flags: number;
  gini: number;
  auto_fill_rate: number;
  generated_at: string;
  llm_used: boolean;
}

export interface DraftRun {
  run_id: string;
  week_start: string;
  assignments: Assignment[];
  flags: Flag[];
  stats: RunStats;
  sessions: Session[];
  smes: SME[];
  workload: Record<string, { target: number; actual: number; deficit: number }>;
}
