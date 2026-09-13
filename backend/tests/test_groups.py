"""HTTP-level tests for the public /api/groups* endpoints.

Mirrors frontend/src/services/mock-service.test.ts scenario-for-scenario so
both "mock backends" are held to the same behavior. MAX_PARTICIPANTS is
imported from app.store rather than hardcoded, same reasoning as the
frontend test importing it from services/types.
"""

from app.store import MAX_PARTICIPANTS


def new_group(client, names=None):
    if names is None:
        names = ["Jonas", "Priya"]
    resp = client.post(
        "/api/groups",
        json={"creatorName": "Mara", "groupName": "The Flat", "participantNames": names},
    )
    assert resp.status_code == 201
    return resp.json()


def expense_payload(payer_id: str, amount: str) -> dict:
    return {
        "date": "2026-09-12",
        "description": "Groceries",
        "amount": amount,
        "payerId": payer_id,
    }


class TestGroupCreation:
    def test_adds_the_creator_as_the_first_participant(self, client):
        view = new_group(client)
        participants = view["group"]["participants"]
        assert participants[0]["name"] == "Mara"
        assert len(participants) == 3

    def test_allows_an_optional_group_name(self, client):
        resp = client.post("/api/groups", json={"creatorName": "Mara"})
        assert resp.status_code == 201
        assert resp.json()["group"]["name"] is None

    def test_rejects_an_empty_creator_name(self, client):
        resp = client.post("/api/groups", json={"creatorName": "   "})
        assert resp.status_code == 400
        assert "message" in resp.json()

    def test_rejects_duplicate_names_case_insensitively(self, client):
        view = new_group(client)
        resp = client.post(f"/api/groups/{view['group']['id']}/participants", json={"name": "jonas"})
        assert resp.status_code == 400

    def test_caps_the_group_at_10_participants(self, client):
        extras = [f"P{i}" for i in range(MAX_PARTICIPANTS - 1)]
        resp = client.post("/api/groups", json={"creatorName": "Mara", "participantNames": extras})
        view = resp.json()
        assert len(view["group"]["participants"]) == MAX_PARTICIPANTS

        overflow = client.post(
            f"/api/groups/{view['group']['id']}/participants", json={"name": "One too many"}
        )
        assert overflow.status_code == 400


class TestExpenses:
    def test_validates_required_fields_and_the_amount(self, client):
        view = new_group(client)
        group_id = view["group"]["id"]
        payer_id = view["group"]["participants"][0]["id"]

        bad_description = client.post(
            f"/api/groups/{group_id}/expenses",
            json={**expense_payload(payer_id, "10"), "description": " "},
        )
        assert bad_description.status_code == 400

        missing_date = client.post(
            f"/api/groups/{group_id}/expenses",
            json={**expense_payload(payer_id, "10"), "date": ""},
        )
        assert missing_date.status_code == 400

        zero_amount = client.post(f"/api/groups/{group_id}/expenses", json=expense_payload(payer_id, "0"))
        assert zero_amount.status_code == 400

        unknown_payer = client.post(f"/api/groups/{group_id}/expenses", json=expense_payload("nope", "10"))
        assert unknown_payer.status_code == 400

    def test_keeps_a_running_total_and_history(self, client):
        view = new_group(client)
        group_id = view["group"]["id"]
        payer_id = view["group"]["participants"][0]["id"]

        client.post(f"/api/groups/{group_id}/expenses", json=expense_payload(payer_id, "60"))
        resp = client.post(f"/api/groups/{group_id}/expenses", json=expense_payload(payer_id, "15.25"))
        result = resp.json()

        assert result["totalCents"] == 7525
        assert len(result["group"]["expenses"]) == 2


class TestBalancesAndStatus:
    def test_credits_the_payer_and_debits_every_members_share(self, client):
        view = new_group(client)
        group_id = view["group"]["id"]
        mara, jonas, priya = view["group"]["participants"]

        result = client.post(f"/api/groups/{group_id}/expenses", json=expense_payload(mara["id"], "60")).json()
        balances = {b["participantId"]: b["cents"] for b in result["balances"]}

        assert balances[mara["id"]] == 4000
        assert balances[jonas["id"]] == -2000
        assert balances[priya["id"]] == -2000

    def test_always_has_balances_summing_to_zero_even_with_uneven_splits(self, client):
        view = new_group(client)
        group_id = view["group"]["id"]
        payer_id = view["group"]["participants"][1]["id"]

        result = client.post(f"/api/groups/{group_id}/expenses", json=expense_payload(payer_id, "10")).json()
        assert sum(b["cents"] for b in result["balances"]) == 0

    def test_reports_empty_active_and_settled_correctly(self, client):
        created = new_group(client, names=["Jonas"])
        group_id = created["group"]["id"]
        assert created["status"] == "empty"

        mara, jonas = created["group"]["participants"]

        after_first = client.post(
            f"/api/groups/{group_id}/expenses", json=expense_payload(mara["id"], "20")
        ).json()
        assert after_first["status"] == "active"

        after_second = client.post(
            f"/api/groups/{group_id}/expenses", json=expense_payload(jonas["id"], "20")
        ).json()
        assert after_second["status"] == "settled"
        assert all(b["cents"] == 0 for b in after_second["balances"])

        # Settled is a live label, not a lock: a new expense clears it.
        after_third = client.post(
            f"/api/groups/{group_id}/expenses", json=expense_payload(mara["id"], "5")
        ).json()
        assert after_third["status"] == "active"


class TestPersistenceAndLookup:
    def test_reads_a_group_back_by_its_invite_id(self, client):
        view = new_group(client)
        again = client.get(f"/api/groups/{view['group']['id']}")
        assert again.status_code == 200
        assert again.json()["group"]["name"] == "The Flat"

    def test_errors_on_an_unknown_group_id(self, client):
        resp = client.get("/api/groups/g_missing")
        assert resp.status_code == 404
        assert "message" in resp.json()
