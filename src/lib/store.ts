import { DraftRun } from "@/types";

/**
 * Prototype persistence: a module-level singleton. Deliberately not a database —
 * see the write-up. Swapping in Postgres or Vercel KV touches only this file.
 */
declare global {
  // eslint-disable-next-line no-var
  var __draftStore: DraftRun | undefined;
}

export const saveRun = (run: DraftRun) => {
  global.__draftStore = run;
};
export const getRun = (): DraftRun | undefined => global.__draftStore;
