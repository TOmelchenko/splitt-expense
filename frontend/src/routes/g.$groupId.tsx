import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import {
  expenseService,
  formatDate,
  formatEur,
  formatSigned,
  session,
  MAX_PARTICIPANTS,
  type GroupView,
} from "@/services";

export const Route = createFileRoute("/g/$groupId")({
  head: () => ({
    meta: [
      { title: "Group ledger — Splitmate" },
      {
        name: "description",
        content:
          "See the group total, every member's net balance in euros and the full expense history. Add an expense and balances update instantly.",
      },
      { property: "og:title", content: "Group ledger — Splitmate" },
      {
        property: "og:description",
        content: "Group total, net balances in euros and the full expense history in one page.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GroupPage,
});

function GroupPage() {
  const { groupId } = Route.useParams();
  const queryClient = useQueryClient();
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => setMe(session.get(groupId)), [groupId]);

  const groupQuery = useQuery({
    queryKey: ["group", groupId],
    queryFn: () => expenseService.getGroup(groupId),
    retry: false,
  });

  const setView = (view: GroupView) => queryClient.setQueryData(["group", groupId], view);

  if (groupQuery.isPending) {
    return <Centered>Loading the ledger…</Centered>;
  }
  if (groupQuery.isError) {
    return <Centered>{(groupQuery.error as Error).message}</Centered>;
  }

  const view = groupQuery.data;
  const { group, balances, totalCents, status } = view;

  if (!me) {
    return (
      <WhoAreYou
        view={view}
        onPick={(participantId) => {
          session.set(groupId, participantId);
          setMe(participantId);
        }}
        onAdded={setView}
      />
    );
  }

  const myName = group.participants.find((p) => p.id === me)?.name ?? group.creatorName;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            Splitmate · you are {myName}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {group.name ?? `${group.creatorName}'s group`}
          </h1>
        </div>
        <StatusBadge status={status} />
      </header>

      <div className="mt-8 grid gap-5 lg:grid-cols-12">
        <section className="panel lg:col-span-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label-xs">Total spent</p>
              <p className="font-mono text-4xl font-semibold tabular-nums tracking-tight">
                {formatEur(totalCents)}
              </p>
            </div>
            <p className="text-right text-xs text-muted-foreground">
              {group.expenses.length} {group.expenses.length === 1 ? "expense" : "expenses"}
              <br />
              {group.participants.length} people · split equally
            </p>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <p className="label-xs">Net balances</p>
            <ul className="divide-y divide-border">
              {balances.map((b) => (
                <li key={b.participantId} className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-medium">
                    {b.name}
                    {b.participantId === me && (
                      <span className="ml-2 text-xs text-muted-foreground">you</span>
                    )}
                  </span>
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      b.cents > 0
                        ? "text-positive"
                        : b.cents < 0
                          ? "text-negative"
                          : "text-muted-foreground"
                    }`}
                  >
                    {formatSigned(b.cents)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Plus means they should receive money, minus means they paid less than their share.
            </p>
          </div>

          <ParticipantsBlock view={view} onAdded={setView} />
          <InviteLink groupId={groupId} />
        </section>

        <div className="space-y-5 lg:col-span-5">
          <AddExpenseForm view={view} defaultPayerId={me} onAdded={setView} />
          <PaymentForm view={view} defaultFromId={me} onAdded={setView} />
          <History view={view} />
          <PaymentsList view={view} />
        </div>
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <p className="text-sm text-muted-foreground">{children}</p>
    </main>
  );
}

function StatusBadge({ status }: { status: GroupView["status"] }) {
  const label =
    status === "empty" ? "No expenses yet" : status === "settled" ? "Settled" : "In progress";
  const tone =
    status === "settled"
      ? "border-positive/40 text-positive"
      : status === "empty"
        ? "border-border text-muted-foreground"
        : "border-primary/40 text-primary";
  return (
    <span
      className={`rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] ${tone}`}
    >
      {label}
    </span>
  );
}

function WhoAreYou({
  view,
  onPick,
  onAdded,
}: {
  view: GroupView;
  onPick: (participantId: string) => void;
  onAdded: (view: GroupView) => void;
}) {
  return (
    <main className="mx-auto max-w-xl px-5 py-20">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
        {view.group.name ?? `${view.group.creatorName}'s group`}
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Who are you?</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Pick your name to enter the group. No password, no approval.
      </p>
      <ul className="panel mt-8 grid gap-2">
        {view.group.participants.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => onPick(p.id)}
              className="w-full rounded-lg border border-border px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-secondary"
            >
              {p.name}
            </button>
          </li>
        ))}
      </ul>
      <div className="panel mt-4">
        <ParticipantsBlock view={view} onAdded={onAdded} compact />
      </div>
    </main>
  );
}

function ParticipantsBlock({
  view,
  onAdded,
  compact = false,
}: {
  view: GroupView;
  onAdded: (view: GroupView) => void;
  compact?: boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = view.group.participants.length >= MAX_PARTICIPANTS;

  const add = useMutation({
    mutationFn: () => expenseService.addParticipant(view.group.id, name),
    onSuccess: (next) => {
      onAdded(next);
      setName("");
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className={compact ? "" : "mt-6 border-t border-border pt-5"}>
      <p className="label-xs">
        {compact ? "Missing a name?" : "Participants"} ({view.group.participants.length}/
        {MAX_PARTICIPANTS})
      </p>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (name.trim()) add.mutate();
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={full ? "Group is full" : "Add a participant"}
          disabled={full}
          className="field focus:field-focus disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={full || add.isPending}
          className="shrink-0 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
        >
          Add
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function InviteLink({ groupId }: { groupId: string }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState(`/g/${groupId}`);

  useEffect(() => setUrl(`${window.location.origin}/g/${groupId}`), [groupId]);

  return (
    <div className="mt-6 flex items-center gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5">
      <span className="truncate font-mono text-xs text-muted-foreground">{url}</span>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        className="ml-auto shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-primary"
      >
        {copied ? "Copied" : "Copy invite"}
      </button>
    </div>
  );
}

function AddExpenseForm({
  view,
  defaultPayerId,
  onAdded,
}: {
  view: GroupView;
  defaultPayerId: string;
  onAdded: (view: GroupView) => void;
}) {
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState(defaultPayerId);
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      expenseService.addExpense(view.group.id, { date, description, amount, payerId }),
    onSuccess: (next) => {
      onAdded(next);
      setDate("");
      setDescription("");
      setAmount("");
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <section className="panel">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Add expense</h2>
        <span className="font-mono text-[11px] text-muted-foreground">EUR</span>
      </div>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setError(null);
          add.mutate();
        }}
        className="mt-4 space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-xs" htmlFor="date">
              Date
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="field focus:field-focus"
            />
          </div>
          <div>
            <label className="label-xs" htmlFor="amount">
              Amount
            </label>
            <input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25.50"
              className="field focus:field-focus font-mono tabular-nums"
            />
          </div>
        </div>
        <div>
          <label className="label-xs" htmlFor="description">
            Description
          </label>
          <input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was it for?"
            className="field focus:field-focus"
          />
        </div>
        <div>
          <label className="label-xs" htmlFor="payer">
            Paid by
          </label>
          <select
            id="payer"
            value={payerId}
            onChange={(e) => setPayerId(e.target.value)}
            className="field focus:field-focus"
          >
            {view.group.participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={add.isPending}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {add.isPending ? "Saving…" : "Add to ledger"}
        </button>
        <p className="text-xs text-muted-foreground">
          Split equally across {view.group.participants.length} people. Entries are final — nothing
          can be edited or removed.
        </p>
      </form>
    </section>
  );
}

function PaymentForm({
  view,
  defaultFromId,
  onAdded,
}: {
  view: GroupView;
  defaultFromId: string;
  onAdded: (view: GroupView) => void;
}) {
  const others = view.group.participants.filter((p) => p.id !== defaultFromId);
  const [fromId, setFromId] = useState(defaultFromId);
  const [toId, setToId] = useState(others[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canPay = view.group.participants.length >= 2;

  const add = useMutation({
    mutationFn: () => expenseService.addPayment(view.group.id, { fromId, toId, amount }),
    onSuccess: (next) => {
      onAdded(next);
      setAmount("");
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <section className="panel">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Record a payment</h2>
        <span className="font-mono text-[11px] text-muted-foreground">EUR</span>
      </div>
      {!canPay ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Add another participant first to record a payment between two people.
        </p>
      ) : (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setError(null);
            if (fromId === toId) {
              setError("A payment needs two different people.");
              return;
            }
            add.mutate();
          }}
          className="mt-4 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-xs" htmlFor="payment-from">
                From
              </label>
              <select
                id="payment-from"
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="field focus:field-focus"
              >
                {view.group.participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-xs" htmlFor="payment-to">
                To
              </label>
              <select
                id="payment-to"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="field focus:field-focus"
              >
                {view.group.participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label-xs" htmlFor="payment-amount">
              Amount
            </label>
            <input
              id="payment-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25.50"
              className="field focus:field-focus font-mono tabular-nums"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={add.isPending}
            className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
          >
            {add.isPending ? "Saving…" : "Record payment"}
          </button>
          <p className="text-xs text-muted-foreground">
            Moves balance from the payer to the receiver. Doesn't count toward total spent.
          </p>
        </form>
      )}
    </section>
  );
}

function PaymentsList({ view }: { view: GroupView }) {
  const rows = [...view.group.payments].sort((a, b) => b.createdAt - a.createdAt);
  if (rows.length === 0) return null;

  const nameOf = (id: string) =>
    view.group.participants.find((p) => p.id === id)?.name ?? "Unknown";

  return (
    <section className="panel">
      <h2 className="text-sm font-semibold">Payments</h2>
      <ul className="mt-3 divide-y divide-border">
        {rows.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">
              {formatDate(new Date(p.createdAt).toISOString().slice(0, 10))}
            </span>
            <span className="flex-1 truncate text-sm">
              {nameOf(p.fromId)} → {nameOf(p.toId)}
            </span>
            <span className="font-mono text-sm tabular-nums">{formatEur(p.amountCents)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function History({ view }: { view: GroupView }) {
  const rows = [...view.group.expenses].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
  );
  const nameOf = (id: string) =>
    view.group.participants.find((p) => p.id === id)?.name ?? "Unknown";

  return (
    <section className="panel">
      <h2 className="text-sm font-semibold">Expense history</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing recorded yet. The first expense will show up here.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {rows.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2.5">
              <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">
                {formatDate(e.date)}
              </span>
              <span className="flex-1 truncate text-sm">{e.description}</span>
              <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
                {nameOf(e.payerId)}
              </span>
              <span className="font-mono text-sm tabular-nums">{formatEur(e.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
