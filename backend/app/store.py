"""In-memory group store: creation, lookup, mutation, and view computation.

Direct port of frontend/src/services/mock-service.ts (createMockService /
computeGroupView) — same validation messages, same rounding rule (see
app/money.py), same status logic — so the two "mock backends" agree exactly.
There is no persistence: all state lives in the `_groups` dict for the life
of the process, and `reset()` (used by the admin router and by seeding on
startup) is the only way to wipe or repopulate it.
"""

import secrets
import time

from app.errors import NotFoundError, ValidationError
from app.money import parse_amount_to_cents, split_equally
from app.models import Balance, CreateGroupInput, Expense, Group, GroupView, Participant, Payment

MAX_PARTICIPANTS = 10

_groups: dict[str, Group] = {}


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


def _now_millis() -> int:
    return int(time.time() * 1000)


def _assert_name_available(group: Group, raw_name: str) -> None:
    name = raw_name.strip()
    if not name:
        raise ValidationError("A participant name can't be empty.")
    if any(p.name.lower() == name.lower() for p in group.participants):
        raise ValidationError(f'"{name}" is already in this group — names must be unique.')
    if len(group.participants) >= MAX_PARTICIPANTS:
        raise ValidationError(f"A group can hold at most {MAX_PARTICIPANTS} people.")


def require_group(group_id: str) -> Group:
    group = _groups.get(group_id)
    if group is None:
        raise NotFoundError("This group doesn't exist. Check the invite link.")
    return group


def compute_group_view(group: Group) -> GroupView:
    totals = {p.id: 0 for p in group.participants}

    for expense in group.expenses:
        shares = split_equally(expense.amount_cents, len(group.participants))
        for participant, share in zip(group.participants, shares):
            totals[participant.id] = totals.get(participant.id, 0) - share
        totals[expense.payer_id] = totals.get(expense.payer_id, 0) + expense.amount_cents

    # A payment is a direct transfer, not a shared cost: it moves balance
    # from the payer to the receiver but never touches totalCents.
    for payment in group.payments:
        totals[payment.from_id] = totals.get(payment.from_id, 0) + payment.amount_cents
        totals[payment.to_id] = totals.get(payment.to_id, 0) - payment.amount_cents

    balances = [
        Balance(participant_id=p.id, name=p.name, cents=totals.get(p.id, 0))
        for p in group.participants
    ]

    if not group.expenses and not group.payments:
        status = "empty"
    elif all(b.cents == 0 for b in balances):
        status = "settled"
    else:
        status = "active"

    return GroupView(
        group=group,
        total_cents=sum(e.amount_cents for e in group.expenses),
        balances=balances,
        status=status,
    )


def create_group(input: CreateGroupInput) -> GroupView:
    creator_name = input.creator_name.strip()
    if not creator_name:
        raise ValidationError("Please enter your name to create the group.")

    group = Group(
        id=_new_id("g"),
        name=(input.group_name or "").strip() or None,
        creator_name=creator_name,
        participants=[Participant(id=_new_id("p"), name=creator_name)],
        expenses=[],
        payments=[],
    )

    for raw_name in input.participant_names:
        if not raw_name.strip():
            continue
        _assert_name_available(group, raw_name)
        group.participants.append(Participant(id=_new_id("p"), name=raw_name.strip()))

    _groups[group.id] = group
    return compute_group_view(group)


def get_group(group_id: str) -> GroupView:
    return compute_group_view(require_group(group_id))


def add_participant(group_id: str, name: str) -> GroupView:
    group = require_group(group_id)
    _assert_name_available(group, name)
    group.participants.append(Participant(id=_new_id("p"), name=name.strip()))
    return compute_group_view(group)


def add_expense(group_id: str, date: str, description: str, amount: str, payer_id: str) -> GroupView:
    group = require_group(group_id)

    clean_description = description.strip()
    if not clean_description:
        raise ValidationError("Please describe what the expense was for.")
    if not date:
        raise ValidationError("Please pick the date of the expense.")
    if not any(p.id == payer_id for p in group.participants):
        raise ValidationError("Please choose who paid.")
    amount_cents = parse_amount_to_cents(amount)

    group.expenses.append(
        Expense(
            id=_new_id("e"),
            date=date,
            description=clean_description,
            amount_cents=amount_cents,
            payer_id=payer_id,
            created_at=_now_millis(),
        )
    )
    return compute_group_view(group)


def add_payment(group_id: str, from_id: str, to_id: str, amount: str) -> GroupView:
    group = require_group(group_id)

    if not any(p.id == from_id for p in group.participants):
        raise ValidationError("Please choose who is paying.")
    if not any(p.id == to_id for p in group.participants):
        raise ValidationError("Please choose who is receiving the payment.")
    if from_id == to_id:
        raise ValidationError("A payment needs two different people.")
    amount_cents = parse_amount_to_cents(amount)

    group.payments.append(
        Payment(
            id=_new_id("pay"),
            from_id=from_id,
            to_id=to_id,
            amount_cents=amount_cents,
            created_at=_now_millis(),
        )
    )
    return compute_group_view(group)


def seed_demo_data() -> None:
    """Seeds one demo group so the frontend/docs have something to show.

    Reproduces the worked example from docs/spec.md §6 exactly: a €60 expense
    split 3 ways (Alice pays, so +€40 before payments), then Bob pays Alice
    back €10, landing on Alice +€30 / Bob -€10 / Charlie -€20.
    """
    group = Group(
        id="g_demo",
        name="Weekend in Lisbon",
        creator_name="Alice",
        participants=[
            Participant(id="p_alice", name="Alice"),
            Participant(id="p_bob", name="Bob"),
            Participant(id="p_charlie", name="Charlie"),
        ],
        expenses=[
            Expense(
                id="e_seed1",
                date="2026-09-01",
                description="Groceries",
                amount_cents=6000,
                payer_id="p_alice",
                created_at=_now_millis(),
            )
        ],
        payments=[
            Payment(
                id="pay_seed1",
                from_id="p_bob",
                to_id="p_alice",
                amount_cents=1000,
                created_at=_now_millis(),
            )
        ],
    )
    _groups.clear()
    _groups[group.id] = group


def reset() -> None:
    """Wipes all state and reseeds the demo group. Used by POST /admin/reset."""
    seed_demo_data()
