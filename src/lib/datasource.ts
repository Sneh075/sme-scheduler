import { Session, SME } from "@/types";
import { buildSessions, buildSMEs, WEEK_START } from "../../data/synthetic";

/**
 * Everything the agent reads goes through this interface.
 * MockDataSource reads seeded synthetic data. A GoogleSheetsDataSource
 * implementing the same three methods is a drop-in replacement — nothing
 * in the engine or the API layer changes.
 */
export interface DataSource {
  name: string;
  getSessions(): Promise<Session[]>;
  getSMEs(): Promise<SME[]>;
  weekStart(): string;
}

export class MockDataSource implements DataSource {
  name = "Synthetic dataset (Sheets/Calendar adapter stubbed)";
  async getSessions() { return buildSessions(); }
  async getSMEs() { return buildSMEs(); }
  weekStart() { return WEEK_START; }
}

export const dataSource: DataSource = new MockDataSource();
