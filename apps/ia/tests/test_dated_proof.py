"""Quick wins / risques datés + reliés à une preuve (Théo, restitution TF1 p28).

Le point p28 est : « Quick wins et risques doivent être recalculés après chaque
enrichissement, avec preuve et date ». Ces tests pinnent les trois propriétés qui
rendent la promesse tenable :

1. chaque item porte la DATE de son (re)calcul ;
2. la preuve est rattachée à une donnée RÉELLE du dossier, dans la taxonomie
   partagée avec les facteurs de score (``score_axes.PROOF_TYPES``) ;
3. sans donnée à citer, l'item reste SANS preuve — jamais de citation inventée.

Et, parce que le travail se fait en post-traitement et non dans le prompt : la
signature du prompt BELLUM-PLAN doit rester byte-identique.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.services.dated_proof import PROOF_TYPES, stamp_dated_proof

_ACCOUNT_DATA = {
    "recentSignals": [
        {
            "signal": "Recrutement massif d'ingénieurs plateforme streaming",
            "source": "France Travail",
            "date": "2026-05-12",
        }
    ],
    "budgetSignals": [
        {"signal": "Enveloppe cybersécurité votée au budget 2026", "source": "BOAMP", "timeframe": "2026"}
    ],
    "esnRules": {"offers": ["Infogérance applicative", "Cybersécurité offensive"]},
}

_CONTACTS = [{"fullName": "Bertrand Guerne", "title": "CTO"}]


def test_every_item_carries_the_date_of_its_recomputation() -> None:
    items = [{"action": "Appeler la DSI"}, {"risk": "Cycle d'achat long"}]
    stamp_dated_proof(items, computed_at="2026-07-22T09:00:00+00:00")
    assert [i["computed_at"] for i in items] == ["2026-07-22T09:00:00+00:00"] * 2


def test_contact_named_at_the_dossier_is_the_strongest_proof() -> None:
    items = [{"action": "Envoyer un message LinkedIn", "contact": "Bertrand Guerne"}]
    stamp_dated_proof(items, account_data=_ACCOUNT_DATA, contacts=_CONTACTS, computed_at="X")
    assert items[0]["proof_type"] == "contact"
    assert items[0]["proof"] == "Bertrand Guerne — CTO"


def test_a_contact_the_dossier_does_not_know_is_never_a_proof() -> None:
    # Le cas où le rep doit se méfier : le modèle nomme quelqu'un qui n'est pas au
    # dossier. Aucune preuve « contact » ne doit être fabriquée à partir de ça.
    items = [{"action": "Rencontrer Jeanne Inconnue", "contact": "Jeanne Inconnue"}]
    stamp_dated_proof(items, account_data={}, contacts=_CONTACTS, computed_at="X")
    assert "proof_type" not in items[0]


def test_risk_is_tied_to_the_sourced_signal_it_overlaps_with_its_own_date() -> None:
    items = [{"risk": "L'enveloppe cybersécurité peut partir chez le titulaire sortant"}]
    stamp_dated_proof(items, account_data=_ACCOUNT_DATA, contacts=[], computed_at="X")
    assert items[0]["proof_type"] == "signal"
    assert items[0]["proof"].endswith("— BOAMP")
    # La date de la PREUVE est celle du signal, pas celle du recalcul.
    assert items[0]["proof_date"] == "2026"


def test_signal_without_a_source_is_not_citable() -> None:
    items = [{"action": "Capitaliser sur le recrutement d'ingénieurs plateforme"}]
    stamp_dated_proof(
        items,
        account_data={"recentSignals": [{"signal": "Recrutement ingénieurs plateforme", "source": ""}]},
        computed_at="X",
    )
    assert "proof_type" not in items[0]


def test_falls_back_to_the_esn_own_offer() -> None:
    items = [{"action": "Positionner une offre d'infogérance applicative"}]
    stamp_dated_proof(items, account_data=_ACCOUNT_DATA, contacts=[], computed_at="X")
    assert items[0]["proof_type"] == "profile"
    assert items[0]["proof"] == "Infogérance applicative"


def test_unprovable_item_keeps_its_date_and_stays_without_proof() -> None:
    items = [{"action": "Relancer dans deux semaines"}]
    stamp_dated_proof(items, account_data=_ACCOUNT_DATA, contacts=_CONTACTS, computed_at="X")
    assert items[0]["computed_at"] == "X"
    assert "proof_type" not in items[0] and "proof" not in items[0]


def test_legacy_string_items_are_left_strictly_untouched() -> None:
    # Rétro-compatibilité : un ancien payload peut porter des chaînes libres. On ne
    # les transforme pas en objets — le dossier reste lisible tel quel.
    items = ["Appeler la DSI", {"action": "Envoyer un mail"}]
    stamp_dated_proof(items, computed_at="X")
    assert items[0] == "Appeler la DSI"
    assert items[1]["computed_at"] == "X"


def test_proof_types_come_from_the_score_factor_taxonomy() -> None:
    # p28 demande « un proof_type » : on réutilise la taxonomie des facteurs de
    # score (scoreFactorSchema) au lieu d'en inventer une seconde.
    emitted = set()
    for item in ({"action": "…", "contact": "Bertrand Guerne"},):
        stamp_dated_proof([item], account_data=_ACCOUNT_DATA, contacts=_CONTACTS)
        emitted.add(item["proof_type"])
    for item in ({"risk": "enveloppe cybersécurité titulaire sortant"},):
        stamp_dated_proof([item], account_data=_ACCOUNT_DATA)
        emitted.add(item["proof_type"])
    for item in ({"action": "offre d'infogérance applicative"},):
        stamp_dated_proof([item], account_data=_ACCOUNT_DATA)
        emitted.add(item["proof_type"])
    assert emitted <= set(PROOF_TYPES)


def test_default_computed_at_is_a_real_timestamp() -> None:
    items = [{"action": "x"}]
    stamp_dated_proof(items)
    # ISO-8601 UTC — jamais une date inventée ni une chaîne vide.
    assert items[0]["computed_at"].endswith("+00:00")


def test_plan_prompt_stays_byte_identical() -> None:
    # La date et la preuve sont calculées APRÈS le modèle : aucun prompt ne bouge.
    # Preuve directe — l'empreinte du prompt BELLUM-PLAN est celle du golden.
    from app.prompts.registry import prompt_version_for

    baseline = json.loads((Path(__file__).parent / "golden" / "prompt_fingerprint.json").read_text("utf-8"))
    assert prompt_version_for("plan") == baseline["plan"]
