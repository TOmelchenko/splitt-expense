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
      "addPayment",
      "createGroup",
      "getGroup",
    ]);
  });
});

describe("payments (settling up)", () => {
  it("moves balance from payer to receiver without touching totalCents", async () => {
    const { group } = await newGroup();
    const [mara, jonas, priya] = group.participants;
    await service.addExpense(group.id, expense(mara!.id, "60"));

    const view = await service.addPayment(group.id, {
      fromId: jonas!.id,
      toId: mara!.id,
      amount: "20",
    });

    expect(view.totalCents).toBe(6000); // unchanged by the payment
    expect(view.balances.find((b) => b.participantId === jonas!.id)?.cents).toBe(0);
    expect(view.balances.find((b) => b.participantId === mara!.id)?.cents).toBe(2000);
    expect(view.balances.find((b) => b.participantId === priya!.id)?.cents).toBe(-2000);
  });

  it("can bring balances to exactly settled", async () => {
    const { group } = await newGroup(["Jonas"]);
    const [mara, jonas] = group.participants;
    await service.addExpense(group.id, expense(mara!.id, "20"));

    const view = await service.addPayment(group.id, {
      fromId: jonas!.id,
      toId: mara!.id,
      amount: "10",
    });

    expect(view.status).toBe("settled");
    expect(view.balances.every((b) => b.cents === 0)).toBe(true);
  });

  it("rejects an unknown participant on either side", async () => {
    const { group } = await newGroup();
    const mara = group.participants[0]!;
    await expect(
      service.addPayment(group.id, { fromId: "nope", toId: mara.id, amount: "10" }),
    ).rejects.toBeInstanceOf(ServiceError);
    await expect(
      service.addPayment(group.id, { fromId: mara.id, toId: "nope", amount: "10" }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects paying yourself", async () => {
    const { group } = await newGroup();
    const mara = group.participants[0]!;
    await expect(
      service.addPayment(group.id, { fromId: mara.id, toId: mara.id, amount: "10" }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects an invalid amount the same way expenses do", async () => {
    const { group } = await newGroup();
    const [mara, jonas] = group.participants;
    await expect(
      service.addPayment(group.id, { fromId: jonas!.id, toId: mara!.id, amount: "0" }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("counts as activity for the empty/active/settled status", async () => {
    const { group } = await newGroup();
    const [mara, jonas] = group.participants;
    const created = await service.getGroup(group.id);
    expect(created.status).toBe("empty");

    const view = await service.addPayment(group.id, {
      fromId: jonas!.id,
      toId: mara!.id,
      amount: "5",
    });
    expect(view.status).toBe("active");
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
