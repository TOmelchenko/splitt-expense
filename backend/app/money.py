"""EUR amount parsing and equal-split math, in integer cents.

Direct port of frontend/src/services/money.ts (parseAmountToCents /
splitEqually) so the two implementations can't silently drift apart. See
docs/spec.md §4 and §7 for the business rules this encodes.
"""

import re

from app.errors import ValidationError

_AMOUNT_RE = re.compile(r"^\d+(\.\d{1,2})?$")


def parse_amount_to_cents(raw: str) -> int:
    """"25.50" -> 2550. Rejects €0, negatives and more than 2 decimals."""
    value = str(raw).strip().replace(",", ".")
    if not _AMOUNT_RE.match(value):
        raise ValidationError("Enter an amount in euros with at most 2 decimals, e.g. 25.50.")
    cents = round(float(value) * 100)
    if cents <= 0:
        raise ValidationError("The amount must be greater than €0.00.")
    return cents


def split_equally(amount_cents: int, member_count: int) -> list[int]:
    """Largest remainder method in integer cents, stable by list order, so
    the shares always sum back to the exact total."""
    if member_count <= 0:
        raise ValidationError("A group needs at least one participant.")
    base = amount_cents // member_count
    leftover = amount_cents - base * member_count
    shares = []
    for _ in range(member_count):
        extra = 1 if leftover > 0 else 0
        leftover -= extra
        shares.append(base + extra)
    return shares
