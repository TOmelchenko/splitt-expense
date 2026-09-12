# Expense Splitter — MVP Specification

## 1. Project Goal

A simple web application for splitting shared expenses within a group.

**Technology stack:**

* Frontend: Node.js
* Backend: Python
* Database: relational database
* Currency: EUR only

The MVP should focus on the basic expense-splitting workflow and avoid unnecessary features.

---

## 2. Groups

### Group creation

* A user creates a group.
* The creator enters their name.
* Group name is optional.
* The creator is identified by the name entered during group creation.
* Maximum group size: **10 people**.

### Participants

* Participants have names only.
* No email addresses are required.
* Participant names are added via the invite link; there is no creator-identity
  check anywhere in the app, so in practice anyone holding the link can add
  names, up to the group cap. The expected usage pattern is that the creator
  adds names first, before sharing the link further.
* A group can have up to 10 participants.

### Joining a group

* The invite link is generated automatically at group creation — no separate
  step is needed to create it.
* Anyone with the invite link can access the group.
* No user accounts or registration are required.
* When joining, a person selects an existing participant name.
* Approval by the creator is not required.

### Leaving

* Leaving a group is **not supported in the MVP**.

---

## 3. Authentication & Access

* No login/registration.
* No user accounts.
* The group is accessible through its invite link.
* No separate creator login or management link.
* The creator is identified by their creator name.

---

## 4. Expenses

Each expense contains:

* **Description** — required
* **Amount** — required
* **Date** — required
* **Payer** — required

### Amount rules

* Currency: EUR
* Amount must be greater than €0
* €0 expenses are rejected
* Maximum 2 decimal places
* Example: `€25.50`

### Expense date

* User must explicitly enter the date.
* No automatic default date.

### Payer

* Any group member can be selected as the payer.
* The person entering the expense does not have to be the payer.

### Splitting

* Every expense is split equally among **all group members**.
* There is no custom/unequal splitting in the MVP.

Example:

> 3 people
> Expense: €60
> Each person's share: €20

### Rounding

When an amount doesn't divide evenly among members (e.g., €10 among 3 people),
use the **largest remainder method** in integer cents so shares always sum
exactly to the expense total:

1. Convert the amount to integer cents.
2. Divide by the member count, truncating to whole cents, for each member's
   base share.
3. Distribute the leftover cents one at a time to members in a stable order
   (e.g., participant list order) until none remain.

> Example: €10.00 / 3 members → €3.33, €3.33, €3.34 (the extra cent goes to
> the first participant in list order).

---

## 5. Expense History

The group has a simple expense list showing:

* Date
* Description
* Payer
* Amount

No filtering or advanced sorting is required.

### Editing/deleting

Expenses cannot be:

* edited
* deleted

Once created, an expense remains in the group.

---

## 6. Balances

The application calculates balances automatically after every expense.

Only the **net balance** is displayed.

Examples:

```text
Alice   +€30
Bob     -€10
Charlie -€20
```

Where:

* `+` means the person should receive money
* `-` means the person has paid less than their share

The MVP does **not** show detailed settlement instructions such as:

> Bob pays Alice €10.

It also does not *automatically compute* an optimal settlement plan. What it
does support is participants manually recording that a repayment actually
happened — see §7, Payments.

---

## 7. Payments (Settling Up)

Besides expenses, a participant can record that they paid another
participant back directly (e.g. after a bank transfer or handing over cash).

* A payment has a **from** participant, a **to** participant, and an
  **amount** in EUR.
* The amount follows the same rules as expense amounts: EUR, greater than
  €0.00, at most 2 decimal places.
* `from` and `to` must be two different, existing participants in the group.
* A payment is **not split** among the group and does **not** count toward
  the group's total spent — it only moves balance from `from` to `to`.
* Payments are immutable, like expenses: they cannot be edited or deleted
  once recorded.
* Payments are shown in their own list, separate from the expense history,
  and are included in the balance and "Settled" status calculation exactly
  like expenses are.

Example: after a €30 dinner split 3 ways, Bob owes Alice €10. Bob transfers
Alice €10 outside the app, then records a payment: from Bob, to Alice, €10.
Bob's balance moves from −€10 to €0.00; Alice's moves from +€20 to +€10.
Total spent stays at €30 — the payment is a settlement, not a shared cost.

---

## 8. Group Total

The group page displays:

* Total expenses (payments are excluded from this total — see §7)
* Current balance of each participant
* Expense history
* Payments, in their own separate list

Balances are recalculated **immediately** whenever a new expense or payment
is added.

---

## 9. Group Lifecycle

### Active group

Members can:

* view expenses and payments
* add expenses and payments
* view balances

### Settled status (automatic)

* There is no manual archive/close action, and no creator-identity check
  anywhere in the app.
* After every balance recalculation, if every participant's net balance is
  exactly €0.00, the group is displayed with a "Settled" status.
* This is a live computed label, not a one-way action: if a later expense or
  payment unbalances the group again, the "Settled" label clears
  automatically.
* Adding expenses or payments is never blocked — a "Settled" group can still
  receive new ones at any time.
* A brand-new group with zero expenses and zero payments is shown as "No
  expenses yet" rather than "Settled," to avoid a misleading label before any
  activity.

---

## 10. Explicitly Out of Scope for MVP

To keep the project small, the MVP does **not** include:

* User accounts
* Login/registration
* Email invitations
* Multiple currencies
* Unequal/custom splitting
* Expense editing
* Expense deletion
* Payment editing or deletion (payments are immutable, same as expenses)
* Leaving a group
* Expense categories
* Automatically suggested settlement plans (e.g. computing the minimal
  number of transactions to settle up) — manually recording an actual
  repayment between two participants is in scope, see §7
* Notifications/reminders
* Advanced filtering
* Advanced sorting
* Manual archive/close action by the creator (replaced by automatic "Settled"
  status — see §9)
* Creator approval for joining
* Multiple access/management links
* More than 10 participants
* Creator-identity verification of any kind (no accounts exist to support it)

---

## 11. Core User Flow

### Creator

```text
Create group
    ↓
Enter name
    ↓
Optional group name
    ↓
Add participant names
    ↓
Get invite link
    ↓
Share link
```

### Participant

```text
Open invite link
    ↓
Select participant name
    ↓
Enter group
    ↓
View expenses + balances
    ↓
Add expense
```

### Adding an expense

```text
Enter date
    ↓
Enter description
    ↓
Enter amount
    ↓
Select payer
    ↓
Save expense
    ↓
Split equally among all members
    ↓
Recalculate balances immediately
```

### Recording a payment

```text
Select who paid (from)
    ↓
Select who received it (to)
    ↓
Enter amount
    ↓
Save payment
    ↓
Move balance from "from" to "to" (total spent unchanged)
    ↓
Recalculate balances immediately
```

## 12. MVP Success Criteria

The MVP is complete when a user can:

1. Create a group.
2. Add participants.
3. Share an invite link.
4. Join the group without an account.
5. Add an expense.
6. Split the expense equally between all members.
7. See the expense history.
8. See the total expenses.
9. See each participant's net balance.
10. Record that one participant paid another back, without it inflating the
    total expenses.
11. See the group automatically show a "Settled" status once every
    participant's balance reaches €0.00.
