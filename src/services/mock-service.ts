/**
 * Mock implementation of ExpenseSplitterService.
 *
 * Behaves like the Python backend would: async, validates server-side rules
 * (group cap, unique names, amount format, required fields) and recomputes
 * balances on every write. Data lives in a pluggable key/value store so tests
 * can run it fully in memory.
 */
import { parseAmountToCents, splitEqually } from "./money";
import {
  MAX_PARTICIPANTS,
  ServiceError,
  type AddExpenseInput,
  type CreateGroupInput,
  type ExpenseSplitterService,
  type Group,
  type GroupView,
} from "./types";

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

const STORAGE_KEY = "splitmate:db:v1";

type Db = Record<string, Group>;

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function computeGroupView(group: Group): GroupView {
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

  return {
    group,
    totalCents: group.expenses.reduce((sum, e) => sum + e.amountCents, 0),
    balances,
    status:
      group.expenses.length === 0
        ? "empty"
        : balances.every((b) => b.cents === 0)
          ? "settled"
          : "active",
  };
}

export function createMockService(options: {
  store: KeyValueStore;
  latencyMs?: number;
}): ExpenseSplitterService {
  const { store, latencyMs = 0 } = options;
  const wait = () => (latencyMs ? new Promise((r) => setTimeout(r, latencyMs)) : Promise.resolve());

  const readDb = (): Db => {
    try {
      return JSON.parse(store.getItem(STORAGE_KEY) ?? "{}") as Db;
    } catch {
      return {};
    }
  };
  const writeDb = (db: Db) => store.setItem(STORAGE_KEY, JSON.stringify(db));

  const requireGroup = (db: Db, groupId: string): Group => {
    const group = db[groupId];
    if (!group) throw new ServiceError("This group doesn't exist. Check the invite link.");
    return group;
  };

  const assertNameAvailable = (group: Group, rawName: string) => {
    const name = rawName.trim();
    if (!name) throw new ServiceError("A participant name can't be empty.");
    if (group.participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new ServiceError(`"${name}" is already in this group — names must be unique.`);
    }
    if (group.participants.length >= MAX_PARTICIPANTS) {
      throw new ServiceError(`A group can hold at most ${MAX_PARTICIPANTS} people.`);
    }
  };

  return {
    async createGroup(input: CreateGroupInput) {
      await wait();
      const creatorName = input.creatorName.trim();
      if (!creatorName) throw new ServiceError("Please enter your name to create the group.");

      const group: Group = {
        id: newId("g"),
        name: input.groupName?.trim() || null,
        creatorName,
        participants: [{ id: newId("p"), name: creatorName }],
        expenses: [],
      };

      for (const raw of input.participantNames ?? []) {
        if (!raw.trim()) continue;
        assertNameAvailable(group, raw);
        group.participants.push({ id: newId("p"), name: raw.trim() });
      }

      const db = readDb();
      db[group.id] = group;
      writeDb(db);
      return computeGroupView(group);
    },

    async getGroup(groupId: string) {
      await wait();
      return computeGroupView(requireGroup(readDb(), groupId));
    },

    async addParticipant(groupId: string, name: string) {
      await wait();
      const db = readDb();
      const group = requireGroup(db, groupId);
      assertNameAvailable(group, name);
      group.participants.push({ id: newId("p"), name: name.trim() });
      writeDb(db);
      return computeGroupView(group);
    },

    async addExpense(groupId: string, input: AddExpenseInput) {
      await wait();
      const db = readDb();
      const group = requireGroup(db, groupId);

      const description = input.description.trim();
      if (!description) throw new ServiceError("Please describe what the expense was for.");
      if (!input.date) throw new ServiceError("Please pick the date of the expense.");
      if (!group.participants.some((p) => p.id === input.payerId)) {
        throw new ServiceError("Please choose who paid.");
      }
      const amountCents = parseAmountToCents(input.amount);

      group.expenses.push({
        id: newId("e"),
        date: input.date,
        description,
        amountCents,
        payerId: input.payerId,
        createdAt: Date.now(),
      });
      writeDb(db);
      return computeGroupView(group);
    },
  };
}
