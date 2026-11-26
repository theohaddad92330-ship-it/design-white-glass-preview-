"""#4054.1 (BEL-AM-1210-003) — « Voici mon CRM, que travailler lundi ? » : chaque carte de priorité dit
ses contacts DÉJÀ connus, sa provenance d'import et ce qui MANQUE — lus tels que l'API les rend, jamais déduits."""

from __future__ import annotations

from app.services.known_shape_gate import shape_read_from_tool


def _why(**extra: object) -> list[str]:
    row = {"id": "a", "companyName": "ACME", "bucket": "to_verify", "reason": "r", "headquarters": None, **extra}
    out = {"now": [], "toVerify": [row], "toWatch": [], "notNow": []}
    card = shape_read_from_tool("get_portfolio_priorities", out)["blocks"]["account_ranking"]
    return card["items"][0]["why"]


def test_import_contacts_and_missing_are_named() -> None:
    why = _why(
        fromImport=True,
        knownContacts=[{"name": "Awa Diop", "role": "DSI"}, {"name": "Léo Petit", "role": None}],
        missing=["analysis", "headquarters"],
    )
    assert "Compte importé de votre base." in why
    assert "Contacts connus : Awa Diop (DSI), Léo Petit." in why
    assert "Manque : analyse du compte, siège non renseigné." in why


def test_absent_keys_say_nothing_and_unknown_codes_are_ignored() -> None:
    why = _why(missing=["bogus"])
    assert not any(w.startswith(("Manque", "Contacts connus", "Compte importé")) for w in why)


def test_no_known_contact_is_named_only_when_the_api_said_so() -> None:
    assert "Manque : aucun contact connu." in _why(missing=["contact"])
    assert not any(w.startswith("Contacts connus") for w in _why(knownContacts=[]))
