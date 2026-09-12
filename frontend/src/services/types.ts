/**
 * Domain types and the single service contract the UI talks to.
 *
 * The app never calls a backend directly: every read/write goes through
 * `ExpenseSplitterService`. Today it is fulfilled by an in-browser mock
 * (`mock-service.ts`); swapping in an HTTP client that calls the Python API
 * means implementing this same interface and changing one line in index.ts.
 */

export type Participant = { id: string; name: string };

export type Expense = {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amountCents: number;
  payerId: string;
  createdAt: number;
};

export type Group = {
  id: string;
  name: string | null;
  creatorName: string;
  participants: Participant[];
  expenses: Expense[];
};

export type Balance = { participantId: string; name: string; cents: number };

/** "empty" = no expenses yet, "settled" = everyone is at exactly €0.00. */
export type GroupStatus = "empty" | "settled" | "active";

export type GroupView = {
  group: Group;
  totalCents: number;
  balances: Balance[];
  status: GroupStatus;
};

export type CreateGroupInput = {
  creatorName: string;
  groupName?: string;
  participantNames?: string[];
};

export type AddExpenseInput = {
  date: string;
  description: string;
  /** Raw user input, e.g. "25.50". Validated by the service. */
  amount: string;
  payerId: string;
};

/** Errors safe to show to the user (validation / not found). */
export class ServiceError extends Error {}

export const MAX_PARTICIPANTS = 10;

export interface ExpenseSplitterService {
  createGroup(input: CreateGroupInput): Promise<GroupView>;
  getGroup(groupId: string): Promise<GroupView>;
  addParticipant(groupId: string, name: string): Promise<GroupView>;
  addExpense(groupId: string, input: AddExpenseInput): Promise<GroupView>;
}
