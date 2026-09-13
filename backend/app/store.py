"""Group creation, lookup, mutation, and view computation — backed by the
database configured via app/db.py (DATABASE_URL).

Business rules (validation messages, rounding, status logic) are unchanged
from the original in-memory version and from
frontend/src/services/mock-service.ts — only where the data lives changed.
Every function here takes a `Session` explicitly (injected by routers via
`Depends(get_db)`) rather than reaching for a global connection, so nothing
in this module assumes a particular database is configured.
"""

import secrets
import time

from sqlalchemy.orm import Session

from app.db_models import ExpenseORM, GroupORM, ParticipantORM, PaymentORM
from app.errors import NotFoundError, ValidationError
from app.money import parse_amount_to_cents, split_equally
from app.models import Balance, CreateGroupInput, Expense, Group, GroupView, Participant, Payment

MAX_PARTICIPANTS = 10


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


def _now_millis() -> int:
    return int(time.time() * 1000)


def _assert_name_available(participants: list[ParticipantORM], raw_name: str) -> None:
    name = raw_name.strip()
    if not name:
        raise ValidationError("A participant name can't be empty.")
    if any(p.name.lower() == name.lower() for p in participants):
        raise ValidationError(f'"{name}" is already in this group — names must be unique.')
    if len(participants) >= MAX_PARTICIPANTS:
        raise ValidationError(f"A group can hold at most {MAX_PARTICIPANTS} people.")


def require_group(db: Session, group_id: str) -> GroupORM:
    group = db.get(GroupORM, group_id)
    if group is None:
        raise NotFoundError("This group doesn't exist. Check the invite link.")
    return group


def compute_group_view(group: GroupORM) -> GroupView:
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
        group=Group(
            id=group.id,
            name=group.name,
            creator_name=group.creator_name,
            participants=[Participant(id=p.id, name=p.name) for p in group.participants],
            expenses=[
                Expense(
                    id=e.id,
                    date=e.date,
                    description=e.description,
                    amount_cents=e.amount_cents,
                    payer_id=e.payer_id,
                    created_at=e.created_at,
                )
                for e in group.expenses
            ],
            payments=[
                Payment(
                    id=p.id,
                    from_id=p.from_id,
                    to_id=p.to_id,
                    amount_cents=p.amount_cents,
                    created_at=p.created_at,
                )
                for p in group.payments
            ],
        ),
        total_cents=sum(e.amount_cents for e in group.expenses),
        balances=balances,
        status=status,
    )


def create_group(db: Session, input: CreateGroupInput) -> GroupView:
    creator_name = input.creator_name.strip()
    if not creator_name:
        raise ValidationError("Please enter your name to create the group.")

    group = GroupORM(
        id=_new_id("g"),
        name=(input.group_name or "").strip() or None,
        creator_name=creator_name,
    )
    group.participants.append(ParticipantORM(id=_new_id("p"), name=creator_name, position=0))

    for raw_name in input.participant_names:
        if not raw_name.strip():
            continue
        _assert_name_available(group.participants, raw_name)
        group.participants.append(
            ParticipantORM(id=_new_id("p"), name=raw_name.strip(), position=len(group.participants))
        )

    db.add(group)
    db.commit()
    return compute_group_view(group)


def get_group(db: Session, group_id: str) -> GroupView:
    return compute_group_view(require_group(db, group_id))


def add_participant(db: Session, group_id: str, name: str) -> GroupView:
    group = require_group(db, group_id)
    _assert_name_available(group.participants, name)
    group.participants.append(
        ParticipantORM(id=_new_id("p"), name=name.strip(), position=len(group.participants))
    )
    db.commit()
    return compute_group_view(group)


def add_expense(db: Session, group_id: str, date: str, description: str, amount: str, payer_id: str) -> GroupView:
    group = require_group(db, group_id)

    clean_description = description.strip()
    if not clean_description:
        raise ValidationError("Please describe what the expense was for.")
    if not date:
        raise ValidationError("Please pick the date of the expense.")
    if not any(p.id == payer_id for p in group.participants):
        raise ValidationError("Please choose who paid.")
    amount_cents = parse_amount_to_cents(amount)

    group.expenses.append(
        ExpenseORM(
            id=_new_id("e"),
            date=date,
            description=clean_description,
            amount_cents=amount_cents,
            payer_id=payer_id,
            created_at=_now_millis(),
        )
    )
    db.commit()
    return compute_group_view(group)


def add_payment(db: Session, group_id: str, from_id: str, to_id: str, amount: str) -> GroupView:
    group = require_group(db, group_id)

    if not any(p.id == from_id for p in group.participants):
        raise ValidationError("Please choose who is paying.")
    if not any(p.id == to_id for p in group.participants):
        raise ValidationError("Please choose who is receiving the payment.")
    if from_id == to_id:
        raise ValidationError("A payment needs two different people.")
    amount_cents = parse_amount_to_cents(amount)

    group.payments.append(
        PaymentORM(
            id=_new_id("pay"),
            from_id=from_id,
            to_id=to_id,
            amount_cents=amount_cents,
            created_at=_now_millis(),
        )
    )
    db.commit()
    return compute_group_view(group)


def seed_demo_data(db: Session) -> None:
    """Seeds one demo group, but only if it doesn't already exist.

    Unlike the old in-memory store, this database persists across restarts,
    so startup must not wipe real data every time — it only guarantees
    something to look at on a brand-new, empty database. Reproduces the
    worked example from docs/spec.md §6 exactly: a €60 expense split 3 ways
    (Alice pays, so +€40 before payments), then Bob pays Alice back €10,
    landing on Alice +€30 / Bob -€10 / Charlie -€20.
    """
    if db.get(GroupORM, "g_demo") is not None:
        return

    now = _now_millis()
    group = GroupORM(id="g_demo", name="Weekend in Lisbon", creator_name="Alice")
    group.participants = [
        ParticipantORM(id="p_alice", name="Alice", position=0),
        ParticipantORM(id="p_bob", name="Bob", position=1),
        ParticipantORM(id="p_charlie", name="Charlie", position=2),
    ]
    db.add(group)
    # Flush so the participant rows exist before the expense/payment rows
    # that reference them by id — nothing here declares a relationship()
    # between ExpenseORM/PaymentORM and ParticipantORM (only their group_id
    # FKs matter for lookups), so the unit-of-work can't infer that ordering
    # on its own within a single flush.
    db.flush()
    group.expenses = [
        ExpenseORM(
            id="e_seed1",
            date="2026-09-01",
            description="Groceries",
            amount_cents=6000,
            payer_id="p_alice",
            created_at=now,
        )
    ]
    group.payments = [
        PaymentORM(id="pay_seed1", from_id="p_bob", to_id="p_alice", amount_cents=1000, created_at=now)
    ]
    db.commit()


def reset(db: Session) -> None:
    """Wipes every group (and its participants/expenses/payments) and
    reseeds just the demo group. Used only by POST /admin/reset — a
    deliberate, authenticated, destructive action, distinct from
    seed_demo_data's "only if missing" behavior on ordinary startup.
    """
    db.query(PaymentORM).delete()
    db.query(ExpenseORM).delete()
    db.query(ParticipantORM).delete()
    db.query(GroupORM).delete()
    db.commit()
    seed_demo_data(db)
