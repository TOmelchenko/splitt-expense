"""Mirrors the payment scenarios in frontend/src/services/mock-service.test.ts."""

from tests.test_groups import expense_payload, new_group


def payment_payload(from_id: str, to_id: str, amount: str) -> dict:
    return {"fromId": from_id, "toId": to_id, "amount": amount}


def test_moves_balance_from_payer_to_receiver_without_touching_total_cents(client):
    view = new_group(client)
    group_id = view["group"]["id"]
    mara, jonas, priya = view["group"]["participants"]

    client.post(f"/api/groups/{group_id}/expenses", json=expense_payload(mara["id"], "60"))
    result = client.post(
        f"/api/groups/{group_id}/payments", json=payment_payload(jonas["id"], mara["id"], "20")
    ).json()

    balances = {b["participantId"]: b["cents"] for b in result["balances"]}
    assert result["totalCents"] == 6000  # unchanged by the payment
    assert balances[jonas["id"]] == 0
    assert balances[mara["id"]] == 2000
    assert balances[priya["id"]] == -2000


def test_can_bring_balances_to_exactly_settled(client):
    view = new_group(client, names=["Jonas"])
    group_id = view["group"]["id"]
    mara, jonas = view["group"]["participants"]

    client.post(f"/api/groups/{group_id}/expenses", json=expense_payload(mara["id"], "20"))
    result = client.post(
        f"/api/groups/{group_id}/payments", json=payment_payload(jonas["id"], mara["id"], "10")
    ).json()

    assert result["status"] == "settled"
    assert all(b["cents"] == 0 for b in result["balances"])


def test_rejects_an_unknown_participant_on_either_side(client):
    view = new_group(client)
    group_id = view["group"]["id"]
    mara = view["group"]["participants"][0]

    assert client.post(
        f"/api/groups/{group_id}/payments", json=payment_payload("nope", mara["id"], "10")
    ).status_code == 400
    assert client.post(
        f"/api/groups/{group_id}/payments", json=payment_payload(mara["id"], "nope", "10")
    ).status_code == 400


def test_rejects_paying_yourself(client):
    view = new_group(client)
    group_id = view["group"]["id"]
    mara = view["group"]["participants"][0]

    resp = client.post(
        f"/api/groups/{group_id}/payments", json=payment_payload(mara["id"], mara["id"], "10")
    )
    assert resp.status_code == 400


def test_rejects_an_invalid_amount_the_same_way_expenses_do(client):
    view = new_group(client)
    group_id = view["group"]["id"]
    mara, jonas = view["group"]["participants"][0], view["group"]["participants"][1]

    resp = client.post(
        f"/api/groups/{group_id}/payments", json=payment_payload(jonas["id"], mara["id"], "0")
    )
    assert resp.status_code == 400


def test_counts_as_activity_for_the_empty_active_settled_status(client):
    view = new_group(client)
    group_id = view["group"]["id"]
    mara, jonas = view["group"]["participants"][0], view["group"]["participants"][1]

    created = client.get(f"/api/groups/{group_id}").json()
    assert created["status"] == "empty"

    result = client.post(
        f"/api/groups/{group_id}/payments", json=payment_payload(jonas["id"], mara["id"], "5")
    ).json()
    assert result["status"] == "active"
