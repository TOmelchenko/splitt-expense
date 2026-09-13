/**
 * The one place the app gets its backend from.
 *
 * Every component imports `expenseService` from here. This now talks to the
 * real FastAPI backend (backend/app/) over HTTP — see http-service.ts. The
 * in-browser mock (mock-service.ts) still exists and is exercised directly
 * by its own tests, but nothing in the app wires to it anymore.
 */
import { createHttpService } from "./http-service";
import type { ExpenseSplitterService } from "./types";

export const expenseService: ExpenseSplitterService = createHttpService();

/** Which participant this browser is acting as, per group (no accounts exist). */
export const session = {
  get(groupId: string): string | null {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(`splitmate:me:${groupId}`);
  },
  set(groupId: string, participantId: string) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(`splitmate:me:${groupId}`, participantId);
  },
};

export * from "./types";
export * from "./money";
