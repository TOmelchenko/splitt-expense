/**
 * Mock backend.
 *
 * Stands in for the Python API described in plan.md. Every function is async,
 * adds a little latency, validates like a server would, and persists to
 * localStorage so the prototype survives refreshes. Swapping this file for
 * real `fetch` calls is the only change needed later.
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

export type GroupView = {
  group: Group;
  totalCents: number;
  balances: Balance[];
  status: "empty" | "settled" | "active";
};

export class ApiError extends Error {}

const MAX_PARTICIPANTS = 10;
const STORAGE_KEY = "splitmate:db:v1";
const LATENCY = 320;

type Db = Record<string, Group>;

function readDb(): Db {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Db;
  } catch {
    return {};
  }
}

function writeDb(db: Db) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

const wait = () => new Promise((r) => setTimeout(r, LATENCY));

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function requireGroup(db: Db, groupId: string): Group {
  const group = db[groupId];
  if (!group) throw new ApiError("This group doesn't exist. Check the invite link.");
  return group;
}

/** Largest remainder method, in integer cents, stable by participant list order. */
export function splitEqually(amountCents: number, memberCount: number): number[] {
  const base = Math.floor(amountCents / memberCount);
  let leftover = amountCents - base * memberCount;
  return Array.from({ length: memberCount }, () => {
    const extra = leftover > 0 ? 1 : 0;
    leftover -= extra;
    return base + extra;
  });
}

export function formatEur(cents: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function formatSigned(cents: number): string {
  const sign = cents > 0 ? "+ " : cents < 0 ? "− " : "± ";
  return sign + formatEur(Math.abs(cents));
}

/** "25.50" -> 2550. Throws on anything a server should reject. */
export function parseAmountToCents(raw: string): number {
  const value = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new ApiError("Amount must be a number in euros with at most 2 decimals (e.g. 25.50).");
  }
  const cents = Math.round(parseFloat(value) * 100);
  if (cents <= 0) throw new ApiError("Amount must be greater than €0.00.");
  return cents;
}

function computeView(group: Group): GroupView {
  const totals = new Map(group.participants.map((p) => [p.id, 0]));

  for (const expense of group.expenses) {
    const shares = splitEqually(expense.amountCents, group.participants.length);
    group.participants.forEach((p, i) => {
      totals.set(p.id, (totals.get(p.id) ?? 0) - shares[i]);
    });
    totals.set(expense.payerId, (totals.get(expense.payerId) ?? 0) + expense.amountCents);
  }

  const balances = group.participants.map((p) => ({
    participantId: p.id,
    name: p.name,
    cents: totals.get(p.id) ?? 0,
  }));

  const totalCents = group.expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const status: GroupView["status"] =
    group.expenses.length === 0 ? "empty" : balances.every((b) => b.cents === 0) ? "settled" : "active";

  return { group, totalCents, balances, status };
}

function assertNameAvailable(group: Group, name: string) {
  const clean = name.trim();
  if (!clean) throw new ApiError("A participant name can't be empty.");
  if (group.participants.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
    throw new ApiError(`"${clean}" is already in this group — names must be unique.`);
  }
  if (group.participants.length >= MAX_PARTICIPANTS) {
    throw new ApiError(`A group can hold at most ${MAX_PARTICIPANTS} people.`);
  }
}

export const api = {
  maxParticipants: MAX_PARTICIPANTS,

  async createGroup(input: {
    creatorName: string;
    groupName: string;
    participantNames: string[];
  }): Promise<GroupView> {
    await wait();
    const creatorName = input.creatorName.trim();
    if (!creatorName) throw new ApiError("Please enter your name to create the group.");

    const group: Group = {
      id: id("g"),
      name: input.groupName.trim() || null,
      creatorName,
      participants: [{ id: id("p"), name: creatorName }],
      expenses: [],
    };

    for (const raw of input.participantNames) {
      const name = raw.trim();
      if (!name) continue;
      assertNameAvailable(group, name);
      group.participants.push({ id: id("p"), name });
    }

    const db = readDb();
    db[group.id] = group;
    writeDb(db);
    return computeView(group);
  },

  async getGroup(groupId: string): Promise<GroupView> {
    await wait();
    return computeView(requireGroup(readDb(), groupId));
  },

  async addParticipant(groupId: string, name: string): Promise<GroupView> {
    await wait();
    const db = readDb();
    const group = requireGroup(db, groupId);
    assertNameAvailable(group, name);
    group.participants.push({ id: id("p"), name: name.trim() });
    writeDb(db);
    return computeView(group);
  },

  async addExpense(
    groupId: string,
    input: { date: string; description: string; amount: string; payerId: string },
  ): Promise<GroupView> {
    await wait();
    const db = readDb();
    const group = requireGroup(db, groupId);

    const description = input.description.trim();
    if (!description) throw new ApiError("Please describe what the expense was for.");
    if (!input.date) throw new ApiError("Please pick the date of the expense.");
    if (!group.participants.some((p) => p.id === input.payerId)) {
      throw new ApiError("Please choose who paid.");
    }
    const amountCents = parseAmountToCents(input.amount);

    group.expenses.push({
      id: id("e"),
      date: input.date,
      description,
      amountCents,
      payerId: input.payerId,
      createdAt: Date.now(),
    });
    writeDb(db);
    return computeView(group);
  },
};

/** Which participant this browser is acting as, per group. */
export const session = {
  get(groupId: string): string | null {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(`splitmate:me:${groupId}`);
  },
  set(groupId: string, participantId: string) {
    localStorage.setItem(`splitmate:me:${groupId}`, participantId);
  },
};
