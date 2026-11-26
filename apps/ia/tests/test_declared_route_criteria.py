"""#3278.2 (lot M11 09/10) — les six critères de la route commerciale sans
source structurée (périmètre, objectifs, rôles disponibles, partenaires,
historique, timing) deviennent évaluables quand le commercial les a DÉCLARÉS
sur la fiche du compte (une colonne par critère, relue par le pont d'accès,
`declared_route_criteria`). Laura les cite tels quels ; un critère vide reste
NOMMÉ non évalué, jamais un zéro ni une valeur devinée."""

from __future__ import annotations

from app.services.compilers.account_preflight import compile_account_preflight
from app.services.opening_movement import DECLARABLE_STRATEGY_CRITERIA, strategy_selection_criteria

_SIX = ("scope", "objectives", "available_roles", "partners", "history", "timing")


def test_the_declarable_criteria_are_exactly_the_unsourced_ones():
    # #3278.2b (Louis 15/10) — budget, disponibilité, réseau existant s'ajoutent aux six.
    assert DECLARABLE_STRATEGY_CRITERIA == (*_SIX, "budget", "availability", "network")


def test_budget_availability_network_are_declarative_and_empty_means_not_evaluated():
    base = strategy_selection_criteria("etablie", "pme_eti", "froid")
    by_key = {c["key"]: c for c in base}
    for key in ("budget", "availability", "network"):
        assert by_key[key] == {"key": key, "label": by_key[key]["label"], "evaluable": False, "reason": "no_source"}
    filled = strategy_selection_criteria(
        "etablie",
        "pme_eti",
        "froid",
        declared_criteria={"budget": " 300 k€ ", "availability": "2 consultants dès novembre", "network": "  "},
    )
    f = {c["key"]: c for c in filled}
    assert f["budget"]["value"] == "300 k€" and f["budget"]["source"] == "declared"
    assert f["availability"]["evaluable"] is True
    assert f["network"]["evaluable"] is False  # saisie vide = « non renseigné », jamais deviné


def test_a_declared_criterion_is_evaluated_with_its_declared_text_and_an_equal_weight():
    criteria = strategy_selection_criteria(
        "etablie", "pme_eti", "froid", declared_criteria={"scope": "  TMA du SI RH  ", "timing": "appel d'offres T1"}
    )
    by_key = {c["key"]: c for c in criteria}
    assert by_key["scope"] == {
        "key": "scope",
        "label": "périmètre de la mission",
        "evaluable": True,
        "value": "TMA du SI RH",
        "weight": 1 / 5,
        "source": "declared",
    }
    assert by_key["timing"]["evaluable"] is True
    assert by_key["esn_stage"]["weight"] == 1 / 5
    for key in ("objectives", "available_roles", "partners", "history"):
        assert by_key[key] == {"key": key, "label": by_key[key]["label"], "evaluable": False, "reason": "no_source"}


def test_says_no_blank_unknown_or_non_text_declarations_change_nothing():
    base = strategy_selection_criteria("etablie", "pme_eti", "froid")
    for noise in (None, {}, {"scope": "   "}, {"scope": None}, {"inconnu": "1 M€"}, {"scope": 42}, {"esn_stage": "x"}):
        assert strategy_selection_criteria("etablie", "pme_eti", "froid", declared_criteria=noise) == base


def _account():
    return {
        "id": "a-1",
        "company_name": "Acme",
        "raw_analysis": {
            "salesContext": {
                "esnProfile": {"stage": "etablie"},
                "account": {"archetype": "pme_eti"},
                "relationship": {"state": "froid"},
            }
        },
    }


def test_laura_cites_the_declared_criteria_and_still_names_the_empty_ones():
    section = compile_account_preflight(
        _account(),
        contacts=None,
        contacts_available=False,
        account_access={"declared_route_criteria": {"objectives": "réduire le run de 20 %", "history": ""}},
    )["known_sections"]["commercial_route"]
    assert section["declared_criteria"] == [{"label": "objectifs du compte", "value": "réduire le run de 20 %"}]
    not_evaluable = {c["label"] for c in section["not_evaluable_criteria"]}
    assert "objectifs du compte" not in not_evaluable
    assert {"historique de la relation", "fenêtre de temps", "périmètre de la mission"} <= not_evaluable


def test_without_declaration_no_declared_criteria_key():
    section = compile_account_preflight(_account(), contacts=None, contacts_available=False)["known_sections"][
        "commercial_route"
    ]
    assert "declared_criteria" not in section
