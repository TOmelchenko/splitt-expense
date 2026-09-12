import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { expenseService, session, MAX_PARTICIPANTS } from "@/services";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Splitmate — Split shared expenses, equally and in euros" },
      {
        name: "description",
        content:
          "Create a group, share one link, add expenses in euros. Splitmate splits everything equally and shows who owes what — no accounts needed.",
      },
      { property: "og:title", content: "Splitmate — Split shared expenses equally" },
      {
        property: "og:description",
        content:
          "Create a group, share one link, add expenses in euros. Equal splits and live balances, no sign-up.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreateGroupPage,
});

function CreateGroupPage() {
  const navigate = useNavigate();
  const [creatorName, setCreatorName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const remaining = MAX_PARTICIPANTS - 1 - names.length;

  const createGroup = useMutation({
    mutationFn: () =>
      expenseService.createGroup({ creatorName, groupName, participantNames: names }),
    onSuccess: (view) => {
      const me = view.group.participants[0];
      if (me) session.set(view.group.id, me.id);
      navigate({ to: "/g/$groupId", params: { groupId: view.group.id } });
    },
    onError: (e: Error) => setError(e.message),
  });

  function addName() {
    const name = draft.trim();
    if (!name) return;
    if (remaining <= 0) {
      setError(`A group can hold at most ${MAX_PARTICIPANTS} people.`);
      return;
    }
    const taken = [creatorName, ...names].some((n) => n.trim().toLowerCase() === name.toLowerCase());
    if (taken) {
      setError(`"${name}" is already on the list.`);
      return;
    }
    setNames([...names, name]);
    setDraft("");
    setError(null);
  }

  function onDraftKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addName();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createGroup.mutate();
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
        Splitmate · shared expenses
      </p>
      <h1 className="mt-3 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
        One group, one link,
        <br />
        an even split.
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
        Everything is in euros and split equally between everyone in the group. No accounts, no
        sign-up — just share the link that appears next.
      </p>

      <form onSubmit={onSubmit} className="panel mt-10 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label-xs" htmlFor="creator">
              Your name
            </label>
            <input
              id="creator"
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              placeholder="e.g. Mara"
              className="field focus:field-focus"
            />
          </div>
          <div>
            <label className="label-xs" htmlFor="groupname">
              Group name (optional)
            </label>
            <input
              id="groupname"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. The Flat"
              className="field focus:field-focus"
            />
          </div>
        </div>

        <div>
          <label className="label-xs" htmlFor="participant">
            Other participants ({remaining} slots left)
          </label>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/60 p-2.5">
            {names.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm"
              >
                {name}
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  onClick={() => setNames(names.filter((n) => n !== name))}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              id="participant"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onDraftKey}
              placeholder="Add a name and press Enter"
              className="min-w-[180px] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            You can add more people later from the group page.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={createGroup.isPending}
          className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {createGroup.isPending ? "Creating group…" : "Create group"}
        </button>
      </form>
    </main>
  );
}
