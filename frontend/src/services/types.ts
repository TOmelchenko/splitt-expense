/**
 * Domain types and the single service contract the UI talks to.
 *
 * Every read/write in the UI goes through `ExpenseSplitterService`, fulfilled
 * by `http-service.ts` calling the real FastAPI backend (backend/app/) — see
 * index.ts. `mock-service.ts` also implements this same interface and is
 * still exercised directly by its own tests, but nothing in the app wires to
 * it anymore.
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

/**
 * A direct repayment between two participants (e.g. settling up in cash or
 * by bank transfer, logged so balances reflect it). Unlike an Expense, a
 * Payment is not split across the group and never counts toward
 * `totalCents` — it only moves balance from `fromId` to `toId`.
 */
export type Payment = {
  id: string;
  fromId: string;
  toId: string;
  amountCents: number;
  createdAt: number;
};

export type Group = {
  id: string;
  name: string | null;
  creatorName: string;
  participants: Participant[];
  expenses: Expense[];
  payments: Payment[];
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

export type AddPaymentInput = {
  fromId: string;
  toId: string;
  /** Raw user input, e.g. "25.50". Validated by the service. */
  amount: string;
};

/** Errors safe to show to the user (validation / not found). */
export class ServiceError extends Error {}

export const MAX_PARTICIPANTS = 10;

export interface ExpenseSplitterService {
  createGroup(input: CreateGroupInput): Promise<GroupView>;
  getGroup(groupId: string): Promise<GroupView>;
  addParticipant(groupId: string, name: string): Promise<GroupView>;
  addExpense(groupId: string, input: AddExpenseInput): Promise<GroupView>;
  addPayment(groupId: string, input: AddPaymentInput): Promise<GroupView>;
}
