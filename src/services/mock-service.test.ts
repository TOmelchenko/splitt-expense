import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore, createMockService } from "./mock-service";
import { MAX_PARTICIPANTS, ServiceError, type ExpenseSplitterService } from "./types";

let service: ExpenseSplitterService;

beforeEach(() => {
  service = createMockService({ store: createMemoryStore() });
});

const newGroup = (names: string[] = ["Jonas", "Priya"]) =>
  service.createGroup({ creatorName: "Mara", groupName: "The Flat", participantNames: names });

const expense = (payerId: string, amount: string) => ({
  date: "2026-09-12",
  description: "Groceries",
  amount,
  payerId,
});

describe("group creation (US-1.1 / US-1.2)", () => {
  it("adds the creator as the first participant", async () => {
    const { group } = await newGroup();
    expect(group.participants[0]?.name).toBe("Mara");
    expect(group.participants).toHaveLength(3);
  });

  it("allows an optional group name", async () => {
    const { group } = await service.createGroup({ creatorName: "Mara" });
    expect(group.name).toBeNull();
  });

  it("rejects an empty creator name", async () => {
    await expect(service.createGroup({ creatorName: "   " })).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects duplicate names case-insensitively", async () => {
    const { group } = await newGroup();
    await expect(service.addParticipant(group.id, "jonas")).rejects.toBeInstanceOf(ServiceError);
  });

  it("caps the group at 10 participants", async () => {
    const extras = Array.from({ length: MAX_PARTICIPANTS - 1 }, (_, i) => `P${i}`);
    const { group } = await service.createGroup({ creatorName: "Mara", participantNames: extras });
    expect(group.participants).toHaveLength(MAX_PARTICIPANTS);
    await expect(service.addParticipant(group.id, "One too many")).rejects.toBeInstanceOf(
      ServiceError,
    );
  });
});

describe("expenses (US-3.1)", () => {
  it("validates required fields and the amount", async () => {
    const { group } = await newGroup();
    const payerId = group.participants[0]!.id;

    await expect(
      service.addExpense(group.id, { ...expense(payerId, "10"), description: " " }),
    ).rejects.toBeInstanceOf(ServiceError);
    await expect(
      service.addExpense(group.id, { ...expense(payerId, "10"), date: "" }),
    ).rejects.toBeInstanceOf(ServiceError);
    await expect(service.addExpense(group.id, expense(payerId, "0"))).rejects.toBeInstanceOf(
      ServiceError,
    );
    await expect(service.addExpense(group.id, expense("nope", "10"))).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it("keeps a running total and history", async () => {
    const { group } = await newGroup();
    const payerId = group.participants[0]!.id;
    await service.addExpense(group.id, expense(payerId, "60"));
    const view = await service.addExpense(group.id, expense(payerId, "15.25"));
    expect(view.totalCents).toBe(7525);
    expect(view.group.expenses).toHaveLength(2);
  });

  it("exposes no way to edit or delete an expense (US-4.2)", () => {
    expect(Object.keys(service).sort()).toEqual([
      "addExpense",
      "addParticipant",
      "createGroup",
      "getGroup",
    ]);
  });
});

describe("balances and status (US-5.1 / US-6.2)", () => {
  it("credits the payer and debits every member's share", async () => {
    const { group } = await newGroup();
    const [mara, jonas, priya] = group.participants;
    const view = await service.addExpense(group.id, expense(mara!.id, "60"));

    expect(view.balances.find((b) => b.participantId === mara!.id)?.cents).toBe(4000);
    expect(view.balances.find((b) => b.participantId === jonas!.id)?.cents).toBe(-2000);
    expect(view.balances.find((b) => b.participantId === priya!.id)?.cents).toBe(-2000);
  });

  it("always has balances summing to zero, even with uneven splits", async () => {
    const { group } = await newGroup();
    const view = await service.addExpense(group.id, expense(group.participants[1]!.id, "10"));
    expect(view.balances.reduce((a, b) => a + b.cents, 0)).toBe(0);
  });

  it("reports empty, active and settled correctly", async () => {
    const created = await newGroup(["Jonas"]);
    expect(created.status).toBe("empty");

    const [mara, jonas] = created.group.participants;
    const afterFirst = await service.addExpense(created.group.id, expense(mara!.id, "20"));
    expect(afterFirst.status).toBe("active");

    const afterSecond = await service.addExpense(created.group.id, expense(jonas!.id, "20"));
    expect(afterSecond.status).toBe("settled");
    expect(afterSecond.balances.every((b) => b.cents === 0)).toBe(true);

    // Settled is a live label, not a lock: a new expense clears it.
    const afterThird = await service.addExpense(created.group.id, expense(mara!.id, "5"));
    expect(afterThird.status).toBe("active");
  });
});

describe("persistence and lookup", () => {
  it("reads a group back by its invite id", async () => {
    const { group } = await newGroup();
    const again = await service.getGroup(group.id);
    expect(again.group.name).toBe("The Flat");
  });

  it("errors on an unknown group id", async () => {
    await expect(service.getGroup("g_missing")).rejects.toBeInstanceOf(ServiceError);
  });
});
