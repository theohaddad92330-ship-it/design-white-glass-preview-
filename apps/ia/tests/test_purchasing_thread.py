"""Thread achats : consolidation déterministe des marchés IT attribués (DECP) en
un fil chronologique + regroupements par titulaire (concurrent) et par acheteur."""

from __future__ import annotations

from app.services.purchasing_thread import (
    build_purchasing_thread,
    render_purchasing_thread_block,
)


def _contract(**kw: object) -> dict:
    base = {
        "title": "Marché",
        "buyer": "Société Générale",
        "winner": "Capgemini",
        "amount": None,
        "location": "Paris",
        "notifiedDate": "2024-03-15",
        "cpv": "72000000",
        "url": None,
    }
    base.update(kw)
    return base


def test_empty_on_nothing() -> None:
    for value in (None, [], "not-a-list", [123, "x"]):
        thread = build_purchasing_thread(value)
        assert thread["items"] == []
        assert thread["bySupplier"] == []
        assert thread["byBuyer"] == []
        assert thread["incumbents"] == []
        assert thread["summary"]["totalContracts"] == 0


def test_thread_carries_titulaire_acheteur_date() -> None:
    thread = build_purchasing_thread(
        [_contract(title="TMA SIRH", winner="Sopra Steria", buyer="Crédit du Nord", notifiedDate="2023-06-01")]
    )
    assert len(thread["items"]) == 1
    item = thread["items"][0]
    assert item["object"] == "TMA SIRH"
    assert item["supplier"] == "Sopra Steria"  # titulaire = concurrent qui a gagné
    assert item["buyer"] == "Crédit du Nord"  # acheteur = entité du groupe
    assert item["date"] == "2023-06-01"


def test_chronological_newest_first() -> None:
    thread = build_purchasing_thread(
        [
            _contract(title="Vieux", notifiedDate="2022-01-01"),
            _contract(title="Récent", notifiedDate="2024-09-30"),
            _contract(title="Milieu", notifiedDate="2023-05-05"),
        ]
    )
    assert [i["object"] for i in thread["items"]] == ["Récent", "Milieu", "Vieux"]


def test_missing_amount_is_none_never_invented() -> None:
    thread = build_purchasing_thread(
        [_contract(title="A", amount=None), _contract(title="B", amount="150000")]
    )
    amounts = {i["object"]: i["amount"] for i in thread["items"]}
    assert amounts["A"] is None  # absent → None, jamais reconstruit
    assert amounts["B"] == "150000"
    assert thread["summary"]["withAmount"] == 1


def test_undated_contract_sinks_to_end_not_dropped() -> None:
    thread = build_purchasing_thread(
        [_contract(title="Sans date", notifiedDate=""), _contract(title="Daté", notifiedDate="2024-01-01")]
    )
    objs = [i["object"] for i in thread["items"]]
    assert objs == ["Daté", "Sans date"]  # non daté conservé, en fin de fil
    assert thread["items"][-1]["date"] is None


def test_group_by_supplier_counts_and_buyers() -> None:
    thread = build_purchasing_thread(
        [
            _contract(winner="Capgemini", buyer="Société Générale", notifiedDate="2024-01-01"),
            _contract(winner="Capgemini", buyer="Crédit du Nord", notifiedDate="2024-06-01"),
            _contract(winner="Atos", buyer="Société Générale", notifiedDate="2023-01-01"),
        ]
    )
    by_supplier = {g["name"]: g for g in thread["bySupplier"]}
    assert by_supplier["Capgemini"]["contractsWon"] == 2
    # ordonné par nombre de marchés décroissant → Capgemini (2) avant Atos (1)
    assert [g["name"] for g in thread["bySupplier"]] == ["Capgemini", "Atos"]
    # entités servies distinctes + dernier marché gagné
    assert set(by_supplier["Capgemini"]["buyers"]) == {"Société Générale", "Crédit du Nord"}
    assert by_supplier["Capgemini"]["lastWonDate"] == "2024-06-01"


def test_group_by_buyer_and_incumbents() -> None:
    thread = build_purchasing_thread(
        [
            _contract(winner="Capgemini", buyer="Société Générale"),
            _contract(winner="Atos", buyer="Société Générale"),
        ]
    )
    by_buyer = {g["name"]: g for g in thread["byBuyer"]}
    assert by_buyer["Société Générale"]["contractsAwarded"] == 2
    assert set(by_buyer["Société Générale"]["suppliers"]) == {"Capgemini", "Atos"}
    # incumbents = titulaires en place (concurrents à déloger)
    assert {i["supplier"] for i in thread["incumbents"]} == {"Capgemini", "Atos"}


def test_supplier_name_normalised_for_grouping() -> None:
    thread = build_purchasing_thread(
        [_contract(winner="Capgemini"), _contract(winner="CAPGEMINI"), _contract(winner="capgemini")]
    )
    assert len(thread["bySupplier"]) == 1
    assert thread["bySupplier"][0]["contractsWon"] == 3


def test_summary_counts() -> None:
    thread = build_purchasing_thread(
        [
            _contract(winner="Capgemini", buyer="SG", amount="1000"),
            _contract(winner="Atos", buyer="Crédit du Nord", amount=None),
        ]
    )
    s = thread["summary"]
    assert s["totalContracts"] == 2
    assert s["supplierCount"] == 2
    assert s["buyerCount"] == 2
    assert s["withAmount"] == 1


def test_deterministic_output() -> None:
    contracts = [
        _contract(title="A", winner="Capgemini", notifiedDate="2024-01-01"),
        _contract(title="B", winner="Atos", notifiedDate="2024-01-01"),
    ]
    assert build_purchasing_thread(contracts) == build_purchasing_thread(list(contracts))


# ── render block ──────────────────────────────────────────────────────────────


def test_render_empty_when_no_data() -> None:
    assert render_purchasing_thread_block(build_purchasing_thread([])) == ""
    assert render_purchasing_thread_block(None) == ""
    assert render_purchasing_thread_block({}) == ""


def test_render_lists_incumbents_and_deloger_directive() -> None:
    thread = build_purchasing_thread(
        [_contract(title="TMA", winner="Capgemini", buyer="Société Générale", amount="500000")]
    )
    block = render_purchasing_thread_block(thread)
    assert "THREAD ACHATS" in block
    assert "Capgemini" in block
    assert "Société Générale" in block
    assert "DÉLOGEMENT" in block  # pousse la reco déloger un titulaire
    assert "500000" in block  # montant affiché quand présent


def test_render_omits_absent_amount() -> None:
    thread = build_purchasing_thread([_contract(title="TMA", winner="Atos", amount=None)])
    block = render_purchasing_thread_block(thread)
    assert "Atos" in block
    # rien d'inventé : pas de « None » ni de montant fabriqué dans le rendu
    assert "None" not in block
