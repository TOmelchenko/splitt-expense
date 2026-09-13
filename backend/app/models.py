"""Pydantic schemas mirroring the components/schemas in /openapi.yaml.

Field names use to_camel aliasing so the wire format is camelCase (amountCents,
payerId, ...) exactly like the frontend's ExpenseSplitterService expects
(frontend/src/services/types.ts) — Python code still reads/writes the
snake_case attribute names.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Participant(ApiModel):
    id: str
    name: str


class Expense(ApiModel):
    id: str
    date: str
    description: str
    amount_cents: int
    payer_id: str
    created_at: int


class Payment(ApiModel):
    id: str
    from_id: str
    to_id: str
    amount_cents: int
    created_at: int


class Group(ApiModel):
    id: str
    name: str | None
    creator_name: str
    participants: list[Participant]
    expenses: list[Expense]
    payments: list[Payment]


class Balance(ApiModel):
    participant_id: str
    name: str
    cents: int


GroupStatus = Literal["empty", "settled", "active"]


class GroupView(ApiModel):
    group: Group
    total_cents: int
    balances: list[Balance]
    status: GroupStatus


class CreateGroupInput(ApiModel):
    creator_name: str
    group_name: str | None = None
    participant_names: list[str] = []


class AddParticipantInput(ApiModel):
    name: str


class AddExpenseInput(ApiModel):
    date: str
    description: str
    amount: str
    payer_id: str


class AddPaymentInput(ApiModel):
    from_id: str
    to_id: str
    amount: str


class Error(ApiModel):
    message: str


# --- Admin-only models (not part of openapi.yaml's public contract) ---


class AdminLoginInput(ApiModel):
    username: str
    password: str


class AdminToken(ApiModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
