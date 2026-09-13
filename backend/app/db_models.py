"""SQLAlchemy ORM models — the persistence layer.

Deliberately separate from app/models.py (the Pydantic API schemas): these
describe rows/relationships, those describe the wire format. app/store.py is
the only place that converts between the two. Column types stick to
SQLAlchemy's generic types (String, Integer, ForeignKey, ...) rather than
anything dialect-specific, so this schema works unchanged against SQLite or
Postgres — only app/db.py's DATABASE_URL decides which.
"""

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class GroupORM(Base):
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    creator_name: Mapped[str] = mapped_column(String, nullable=False)

    participants: Mapped[list["ParticipantORM"]] = relationship(
        back_populates="group", cascade="all, delete-orphan", order_by="ParticipantORM.position"
    )
    expenses: Mapped[list["ExpenseORM"]] = relationship(
        back_populates="group", cascade="all, delete-orphan", order_by="ExpenseORM.created_at"
    )
    payments: Mapped[list["PaymentORM"]] = relationship(
        back_populates="group", cascade="all, delete-orphan", order_by="PaymentORM.created_at"
    )


class ParticipantORM(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # Insertion order within a group is load-bearing (the largest-remainder
    # split gives leftover cents to earlier participants first — see
    # app/money.py), so it's tracked as an explicit sequence rather than
    # relying on timestamp precision or row order, neither of which SQL
    # guarantees.
    position: Mapped[int] = mapped_column(nullable=False)

    group: Mapped["GroupORM"] = relationship(back_populates="participants")


class ExpenseORM(Base):
    __tablename__ = "expenses"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), nullable=False)
    # Stored as the validated "YYYY-MM-DD" string as-is (not a Date column):
    # it's never computed on, only displayed, and this avoids timezone/
    # parsing round-trip concerns for no benefit.
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    amount_cents: Mapped[int] = mapped_column(nullable=False)
    payer_id: Mapped[str] = mapped_column(ForeignKey("participants.id"), nullable=False)
    created_at: Mapped[int] = mapped_column(nullable=False)

    group: Mapped["GroupORM"] = relationship(back_populates="expenses")


class PaymentORM(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), nullable=False)
    from_id: Mapped[str] = mapped_column(ForeignKey("participants.id"), nullable=False)
    to_id: Mapped[str] = mapped_column(ForeignKey("participants.id"), nullable=False)
    amount_cents: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[int] = mapped_column(nullable=False)

    group: Mapped["GroupORM"] = relationship(back_populates="payments")
