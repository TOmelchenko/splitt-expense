/**
 * The one place the app gets its backend from.
 *
 * Every component imports `expenseService` from here. To move to the real
 * Python API, implement `ExpenseSplitterService` with fetch calls and export
 * that instead — no UI code changes.
 */
import { createMemoryStore, createMockService, type KeyValueStore } from "./mock-service";
import type { ExpenseSplitterService } from "./types";

const browserStore: KeyValueStore =
  typeof localStorage !== "undefined"
    ? {
        getItem: (k) => localStorage.getItem(k),
        setItem: (k, v) => localStorage.setItem(k, v),
      }
    : createMemoryStore();

export const expenseService: ExpenseSplitterService = createMockService({
  store: browserStore,
  latencyMs: 280, // pretend network round-trip so loading states are real
});

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
