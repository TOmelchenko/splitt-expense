# Expense Splitter — User Stories & Acceptance Criteria

Derived from `docs/spec.md`. This document breaks the MVP spec into user stories with
testable acceptance criteria, and restates non-goals explicitly so implementation
doesn't scope-creep. Write this before any code.

Roles used below:
- **Creator** — the person who created the group.
- **Participant** — any group member (creator included) once they've selected a name.
- **Visitor** — someone who opened the invite link but hasn't selected a name yet.

---

## Epic 1: Group Creation

### US-1.1 — Create a group
As a new user, I want to create a group by entering my name, so that I can start
tracking shared expenses with others.

**Acceptance criteria**
- Creating a group requires a non-empty creator name.
- Group name is optional; if omitted, the group still saves (with no name / a
  default placeholder).
- On creation, the creator is automatically added as the first participant.
- On success, the creator is taken to the group page and an invite link is
  available.
- Group name and creator name accept ordinary text; empty/whitespace-only creator
  name is rejected with a validation message.

### US-1.2 — Add participant names
As the creator, I want to add participant names to my group, so that others can
later join and be selected as payers/splitters.

**Acceptance criteria**
- The creator can add participant names one at a time (or in a batch) before or
  after sharing the invite link.
- A group cannot exceed **10 participants total** (including the creator);
  attempting to add an 11th is rejected with a clear message.
- Duplicate participant names within the same group are rejected (names must be
  unique within a group, case-insensitive comparison recommended).
- Participant names require no email or other identifying info — name only.
- **Resolved:** there is no creator-identity check anywhere in the app (see
  Decisions Log). Practically, this means anyone holding the invite link can
  add participant names, the same way anyone holding it can add expenses. The
  "creator adds participants" flow described in §2 is the *expected* usage
  pattern (the creator sets up names right after creating the group, before
  sharing the link with anyone else) rather than a technically enforced
  restriction. Do not build a permission check for this action.

### US-1.3 — Get an invite link
As the creator, I want an invite link for my group generated automatically, so
that I can share it without any extra setup step.

**Acceptance criteria**
- The invite link is generated automatically at group-creation time — there is
  no separate "generate link" button or action.
- Every group has exactly one invite link (no multiple/expiring links).
- The link requires no authentication to open.
- The link, once generated, does not change for the lifetime of the group.

---

## Epic 2: Joining a Group

### US-2.1 — Join via invite link
As a visitor with an invite link, I want to select my name from the group's
participant list, so that I can view and add expenses as myself.

**Acceptance criteria**
- Opening the invite link shows the list of existing participant names (no
  free-text name entry at join time — names are pre-registered by the creator).
- Selecting a name "enters" the group as that participant; no password or
  approval step is required.
- Multiple people can independently select the same name in different sessions
  (MVP does not enforce "one person per name" — no accounts exist to prevent it).
- There is no archived/closed state that blocks joining or adding expenses —
  the group's "Settled" status (Epic 7) is a live, informational label only.

### US-2.2 — No accounts required
As a participant, I want to use the app without registering, so that joining is
frictionless.

**Acceptance criteria**
- No sign-up, login, password, or email is ever requested of participants.
- Identity persists only via which participant name was selected in the current
  session (e.g., cookie/local session) — no cross-device identity.

---

## Epic 3: Adding Expenses

### US-3.1 — Add an expense
As a participant, I want to record an expense with description, amount, date,
and payer, so that it gets split among the group.

**Acceptance criteria**
- All four fields are required: description, amount, date, payer.
- Amount must be > €0.00; a €0 or negative amount is rejected with a validation
  error.
- Amount accepts at most 2 decimal places (e.g., `25.50` valid, `25.505`
  rejected or rounded — reject for MVP to avoid silent precision loss).
- Date must be explicitly chosen by the user; no default/auto-filled date.
- Payer must be one of the group's existing participants (dropdown/select, not
  free text).
- The person submitting the expense does not need to be the payer (any
  participant can log an expense on behalf of any payer).
- On save, the expense is split equally among **all current group members**
  (not just participants who've "joined" a session).
- After saving, the new expense appears in the expense history immediately and
  balances recalculate immediately (no page reload required, or a full reload
  is acceptable if fast).

### US-3.2 — Equal splitting example validation
As a participant, I want the split math to be correct and transparent, so that
I trust the balances.

**Acceptance criteria**
- Given 3 members and a €60 expense, each member's share is €20.00 exactly.
- **Resolved:** uneven splits (e.g., €10 among 3 people = €3.333...) use the
  **largest remainder method**, in cents, so shares always sum exactly to the
  expense total:
  1. Work in integer cents (e.g., €10.00 → 1000 cents).
  2. Divide by the member count, truncating to whole cents, to get each
     member's base share.
  3. Compute the leftover cents = total cents − (base share × member count).
  4. Distribute one extra cent each to the first *N* members (in a stable
     order, e.g., participant list order) where *N* = leftover cents, until
     the leftover is exhausted.
  - Example: €10.00 / 3 members → base share = 333 cents each (999 total),
    leftover = 1 cent → the first participant (by list order) gets 334 cents,
    the other two get 333 cents each.

---

## Epic 4: Expense History

### US-4.1 — View expense history
As a participant, I want to see a list of all expenses in the group, so that I
understand what's been spent and by whom.

**Acceptance criteria**
- The list shows, per expense: date, description, payer, amount.
- All expenses ever added are shown (no pagination requirement, but MVP should
  handle a reasonably small list — up to a few hundred rows — without failing).
- No sorting/filtering controls are required, but a stable default order
  (e.g., newest first, or chronological) must be chosen and applied
  consistently.
- No edit or delete controls appear anywhere in the UI for any expense.

### US-4.2 — Immutable expenses
As a group member, I want expenses to be permanent once added, so that the
expense history and balances stay simple and tamper-proof.

**Acceptance criteria**
- There is no API endpoint, button, or code path that updates or deletes an
  existing expense record.
- Attempting to hit an edit/delete endpoint directly (if one existed) is out of
  scope to build at all — not just hidden in the UI.

---

## Epic 5: Balances & Totals

### US-5.1 — See net balances
As a participant, I want to see each member's net balance, so that I know who
is owed money and who owes money.

**Acceptance criteria**
- Each participant's balance = (total they've paid as payer) − (total of their
  equal shares across all expenses).
- Positive balance displayed with a `+` and described as "should receive."
- Negative balance displayed with a `-` and described as "owes" / "paid less
  than their share."
- Balances update immediately after every new expense or payment — no manual
  refresh needed to trigger recalculation (recalculation happens server-side
  on write; client should reflect it right after save).
- No *automatically suggested* settlement plan (e.g., "Bob pays Alice €10,
  that's the minimal number of transactions") is computed or shown anywhere.
  Manually recording that a repayment actually happened is a separate,
  in-scope feature — see Epic 6, Payments.

### US-5.2 — See group total
As a participant, I want to see the total amount spent by the group, so that I
have an overview of shared spending.

**Acceptance criteria**
- Group page shows: total expenses (sum of all expense amounts — payments are
  excluded from this figure, see Epic 6), each participant's current net
  balance, and the expense history — all on one page/view.

---

## Epic 6: Payments (Settling Up)

### US-6.1 — Record a payment between two participants
As a participant, I want to record that one person paid another back
directly, so that real-world repayments are reflected in balances without
being mistaken for a new shared expense.

**Acceptance criteria**
- A payment has exactly three inputs: `from` (participant), `to`
  (participant), and `amount`.
- `from` and `to` must both be existing participants in the group, and must
  be different from each other — paying yourself is rejected.
- `amount` follows the same validation as an expense amount: EUR, > €0.00, at
  most 2 decimal places (reuses the same parser/validator as expenses).
- On save: `from`'s balance increases by the amount, `to`'s balance decreases
  by the amount. This is the reverse of what an expense does to a payer, by
  design — a payment is a transfer, not a shared cost.
- A payment does **not** contribute to `totalCents` ("Total spent"). This is
  the specific bug this feature fixes: previously the only way to log a
  repayment was as an expense, which incorrectly split it across the whole
  group and inflated the total.
- A payment is immutable once recorded — no edit or delete endpoint, mirroring
  expenses (US-4.2).
- Payments are displayed in their own list, separate from the expense history
  list (which keeps its existing Date/Description/Payer/Amount shape
  unchanged — a payment has no "description" and isn't a shared cost, so it
  doesn't belong in that list).
- Payments count as "activity" for the `empty` / `settled` / `active` status
  in US-7.2 (below): a group with only payments recorded (no expenses yet) is
  not shown as "empty."

**Worked example:** 3 people split a €30 dinner (each owes €10; whoever paid
is +€20, the other two are −€10 each). One of the two who owe €10 pays the
payer back €10 in cash and it's recorded as a payment: their balance moves
from −€10 to €0.00, the payer's moves from +€20 to +€10. Total spent stays
at €30.

---

## Epic 7: Group Lifecycle

### US-7.1 — Active group usage
As a participant, I want to view and add expenses and payments while the group
is active, so that ongoing shared costs and repayments are tracked.

**Acceptance criteria**
- While active, any participant can view expenses/payments/balances and add
  new expenses or payments.
- No feature limits a participant from adding an expense or payment based on
  being the creator or not.

### US-7.2 — Group shows as settled automatically
As a group member, I want the group to show when everyone is fully settled up,
so that I know nothing is owed without anyone needing to take a manual "close"
action.

**Decision:** manual archiving is **dropped for MVP**. There is no archive
button, no creator-only permission, and no verification of who the creator is
anywhere in the app. Instead, "closed" becomes a computed, automatic status.

**Acceptance criteria**
- After every balance recalculation, if **every participant's net balance
  equals exactly €0.00**, the group is displayed with a "Settled" status.
- This status is purely a live computed label, not a one-way action: if a new
  expense or payment later unbalances the group, the "Settled" label is
  automatically cleared on the next recalculation.
- Adding expenses or payments is **never blocked** — there is no state that
  prevents submitting a new one, since there's no manual close step.
- Edge case: a brand-new group with zero expenses and zero payments has all
  balances at €0.00 by definition. Recommend showing a neutral "No expenses
  yet" state instead of "Settled" in that specific case, to avoid a
  misleading "settled" label before any activity — otherwise every group would
  start "Settled."
- No group-level "settled" flag needs to be persisted; it can be computed
  on-the-fly from current balances each time the group page is rendered.

---

## Cross-Cutting Acceptance Criteria

- **Currency:** All amounts are EUR; no currency selector anywhere in the UI.
- **Group size cap:** Enforced server-side at 10 participants — not just a UI
  hint, since the invite link is the only gate.
- **No accounts:** No password fields, email fields, or OAuth anywhere in the
  app for participants or the creator.
- **Data permanence:** No delete operations exist for groups, participants,
  expenses, or payments in the MVP ("Settled" is a computed status, not a
  delete or an archive record).
- **Total spent is expenses-only:** `totalCents` sums expenses; payments never
  contribute to it. This is the specific distinction the Payments feature
  (Epic 6) exists to make explicit — see US-6.1.

---

## Non-Goals (Explicitly Out of Scope for MVP)

Restated from `docs/spec.md` §10 — do not build, even partially or "for later":

- User accounts / login / registration of any kind.
- Email invitations or any email collection.
- Multiple currencies or currency conversion.
- Unequal or custom expense splitting (% splits, shares, exact amounts per
  person).
- Editing an existing expense.
- Deleting an existing expense.
- Editing or deleting an existing payment (payments are immutable, same as
  expenses).
- Leaving a group (removing yourself as a participant).
- Expense categories/tags.
- Automatically suggested settlement plans (e.g. computing the minimal number
  of transactions to settle up). Manually recording that a repayment actually
  happened is in scope — see Epic 6, Payments.
- Notifications or reminders (email, push, in-app).
- Advanced filtering of expense history (by date range, payer, etc.).
- Advanced sorting controls (user-selectable sort order).
- Creator approval step when someone joins via invite link.
- Multiple invite/management links per group (e.g., separate admin link).
- Support for more than 10 participants per group.
- Removing/editing participant names after creation.
- Manual archive/close action by the creator (replaced by the automatic
  "Settled" status in US-7.2).
- Creator-identity verification of any kind.

---

## Decisions Log

Resolved by product owner on 2026-09-12:

1. **Participant management:** the invite link is auto-generated at group
   creation. Adding participant names is not gated by a creator-identity
   check — no such check exists anywhere in the app. The creator is simply
   expected, by usage convention, to add names before sharing the link.

2. **Rounding for uneven splits:** use the **largest remainder method**,
   computed in integer cents, with ties broken by stable participant-list
   order. See US-3.2 for the worked algorithm and example.

3. **Group closing:** no manual archive action. Creator identity is never
   verified anywhere. Instead, the group automatically displays a "Settled"
   status whenever every participant's net balance is exactly €0.00,
   recomputed live on every balance recalculation (see US-7.2).

`docs/spec.md` has been updated to match all three decisions, so it and this
document are consistent.

Resolved by product owner on 2026-09-12 (later same day, after testing the
running app):

4. **Recording repayments:** adding a Payments feature (Epic 6) after
   discovering that logging a real-world repayment as an expense incorrectly
   split it across the whole group and inflated `totalCents`. A payment is a
   direct transfer between two participants — `from`/`to`/`amount` — that
   moves balance but is excluded from the total. See US-6.1 for the full
   contract. `docs/spec.md` §7 and `openapi.yaml` (repo root) were updated to
   match.
