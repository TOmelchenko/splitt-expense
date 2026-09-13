"""The 5 public endpoints from /openapi.yaml's "groups" tag.

None of these require authentication (see docs/spec.md §3 / §10 and the
top-level `security: []` in openapi.yaml) — whoever holds a group's id, as
shared via its invite link, can read and write it. All business logic lives
in app/store.py; this module only wires HTTP paths/status codes to it.
"""

from fastapi import APIRouter

from app.models import (
    AddExpenseInput,
    AddParticipantInput,
    AddPaymentInput,
    CreateGroupInput,
    GroupView,
)
from app import store

router = APIRouter(tags=["groups"])


@router.post("/groups", response_model=GroupView, status_code=201)
def create_group(input: CreateGroupInput) -> GroupView:
    return store.create_group(input)


@router.get("/groups/{group_id}", response_model=GroupView)
def get_group(group_id: str) -> GroupView:
    return store.get_group(group_id)


@router.post("/groups/{group_id}/participants", response_model=GroupView)
def add_participant(group_id: str, input: AddParticipantInput) -> GroupView:
    return store.add_participant(group_id, input.name)


@router.post("/groups/{group_id}/expenses", response_model=GroupView)
def add_expense(group_id: str, input: AddExpenseInput) -> GroupView:
    return store.add_expense(group_id, input.date, input.description, input.amount, input.payer_id)


@router.post("/groups/{group_id}/payments", response_model=GroupView)
def add_payment(group_id: str, input: AddPaymentInput) -> GroupView:
    return store.add_payment(group_id, input.from_id, input.to_id, input.amount)
