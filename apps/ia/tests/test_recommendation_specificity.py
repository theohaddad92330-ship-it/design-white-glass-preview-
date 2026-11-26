"""#1925 — une recommandation qui pourrait être envoyée à n'importe qui est un ÉCHEC.

Le validateur compte, parmi les 11 éléments nommés par l'issue, ceux qu'une
recommandation RÉFÉRENCE — une valeur venue d'un champ structuré du dossier
(nom de contact, entité, date de signal, référence déclarée…), jamais un mot
deviné. Sous 2 éléments distincts : « générique », même bien écrite.

Scénarios golden (#1925.14) : l'issue demande Decathlon, KNDS, Thales, SNCF et
Société Générale. Seules les entreprises DÉJÀ présentes dans les fixtures du
dépôt sont utilisées — aucune donnée inventée pour les autres :

* Société Générale — ``app/eval/fixtures/societe-generale.analysis.json``
  (dossier synthétique du harnais d'éval : contacts de TEST, signaux, entités) ;
* SNCF — ``tests/test_prompts_new.py::SAMPLE_RAW_ANALYSIS`` (+ ``SAMPLE_PROFILE``) ;
* Decathlon — n'existe qu'en RÉFÉRENCE CLIENT déclarée par une ESN
  (``tests/test_angle_proof_gate.py::PROFILE_WITH_REFS``) : c'est ce rôle qu'il
  tient ici, pas celui de compte ;
* Thales — ``app/eval/strategy/companies/thales.json`` ne porte AUCUNE donnée
  métier (``_capture_status: not_captured``) : le scénario prouve qu'un dossier
  vide rend « non évaluable », jamais « générique » ;
* KNDS — absent de toutes les fixtures : aucun scénario.

Preuves de garde : elle dit NON (l'exemple « insuffisant » de l'issue), elle LIT
quelque chose (le registre des fixtures n'est pas vide), et elle n'attrape pas
le voisin légitime (le nom du compte seul, « France », « 12 mois »,
« Camille Martinez » ne comptent pas).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.prompts import bellum_messages, bellum_outreach, bellum_plan
from app.services.recommendation_specificity import (
    MIN_SPECIFIC_ELEMENTS,
    SPECIFICITY_ELEMENTS,
    SPECIFICITY_LABELS,
    assess_specificity,
    registry_from_inputs,
    specificity_directive_block,
)
from tests.test_angle_proof_gate import PROFILE_WITH_REFS
from tests.test_prompts_new import SAMPLE_PROFILE, SAMPLE_RAW_ANALYSIS

_APP = Path(__file__).resolve().parents[1] / "app"
_SG_FIXTURE = _APP / "eval" / "fixtures" / "societe-generale.analysis.json"
_THALES_FIXTURE = _APP / "eval" / "strategy" / "companies" / "thales.json"

# L'exemple « insuffisant » de l'issue, verbatim.
_ISSUE_GENERIC_EXAMPLE = "Contacte les décideurs IT avec un message personnalisé."


_SG = json.loads(_SG_FIXTURE.read_text(encoding="utf-8"))


def _sg_registry(profile: dict | None = None):
    return registry_from_inputs(profile=profile or {}, research=_SG["research"], contacts=_SG["classified_contacts"])


def _kinds(result: dict) -> set[str]:
    return {element["kind"] for element in result["elements"]}


# ── Le corpus : les 11 éléments de l'issue, et le seuil ────────────────────


def test_the_eleven_elements_of_the_issue_are_all_named_once():
    kinds = [kind for kind, _label in SPECIFICITY_ELEMENTS]
    assert len(kinds) == 11
    assert len(set(kinds)) == 11
    assert MIN_SPECIFIC_ELEMENTS == 2


def test_the_fixture_registry_is_not_empty():
    # La garde LIT quelque chose : sans registre, tout serait « non évaluable ».
    result = assess_specificity(["rien"], _sg_registry())
    available = {kind for kind, _label in SPECIFICITY_ELEMENTS} - set(result["unavailable"])
    assert {"precise_contact", "precise_entity", "dated_signal"} <= available


# ── Société Générale (fixture d'éval) ───────────────────────────────────────


def test_sg_the_issue_generic_example_fails():
    result = assess_specificity([_ISSUE_GENERIC_EXAMPLE], _sg_registry())
    assert result["status"] == "generique"
    assert result["count"] == 0
    assert result["minimum"] == 2


def test_sg_a_recommendation_citing_contact_entity_and_signal_is_specific():
    text = "Commence par Sophie Leroy côté ITIM : le programme Open Banking API crée un motif de contact concret."
    result = assess_specificity([text], _sg_registry())
    assert result["status"] == "specifique"
    assert _kinds(result) == {"precise_contact", "precise_entity", "dated_signal"}
    assert result["count"] == 3


def test_sg_the_account_name_alone_is_not_a_precise_entity():
    # Le nom du compte est dans TOUTE recommandation sur ce compte : il ne
    # distingue rien. Une filiale ou une BU, si.
    text = "Travaille Société Générale en priorité avec un message personnalisé."
    result = assess_specificity([text], _sg_registry())
    assert "precise_entity" not in _kinds(result)
    assert result["status"] == "generique"


def test_sg_a_near_homonym_does_not_count_as_the_contact():
    result = assess_specificity(["Écris à Camille Martinez."], _sg_registry())
    assert "precise_contact" not in _kinds(result)


def test_sg_one_kind_cited_twice_counts_once():
    text = "Appelle Camille Martin puis Olivier Bernard."
    result = assess_specificity([text], _sg_registry())
    assert _kinds(result) == {"precise_contact"}
    assert result["count"] == 1
    assert result["status"] == "generique"


def test_sg_decathlon_as_a_declared_reference_plus_a_contact_is_specific():
    text = "Ta mission Decathlon parle à Olivier Bernard, qui cartographie les référencements."
    result = assess_specificity([text], _sg_registry(PROFILE_WITH_REFS))
    assert _kinds(result) == {"client_reference", "precise_contact"}
    assert result["status"] == "specifique"


def test_an_undeclared_reference_is_not_counted():
    # Decathlon non déclaré par l'ESN : le citer ne prouve rien — une référence
    # absente ne se fabrique pas (doctrine « aucune donnée inventée »).
    text = "Ta mission Decathlon parle à Olivier Bernard."
    result = assess_specificity([text], _sg_registry({}))
    assert "client_reference" not in _kinds(result)


# ── SNCF (échantillon du golden des prompts) ────────────────────────────────


def _sncf_registry():
    return registry_from_inputs(profile=SAMPLE_PROFILE, research=SAMPLE_RAW_ANALYSIS, contacts=[])


def test_sncf_expertise_and_dated_signal_make_it_specific():
    text = "Appuie-toi sur ton offre Data & IA : le recrutement annoncé en mars 2026 ouvre la porte."
    result = assess_specificity([text], _sncf_registry())
    assert _kinds(result) == {"esn_expertise", "dated_signal"}
    assert result["status"] == "specifique"


def test_sncf_a_vague_offer_word_is_not_the_declared_expertise():
    result = assess_specificity(["Propose vos services cloud à la DSI."], _sncf_registry())
    assert result["status"] == "generique"
    assert result["count"] == 0


def test_sncf_the_declared_territory_counts():
    result = assess_specificity(["Cible les équipes d'Île-de-France."], _sncf_registry())
    assert "territory" in _kinds(result)


# ── Thales (fixture sans donnée métier) ─────────────────────────────────────


def test_thales_without_captured_data_is_not_evaluable_never_generic():
    fixture = json.loads(_THALES_FIXTURE.read_text(encoding="utf-8"))
    assert fixture["_capture_status"] == "not_captured"
    registry = registry_from_inputs(profile={}, research={"companyName": fixture["company"]}, contacts=[])
    result = assess_specificity(["Contacte la DSI de Thales."], registry)
    # « Non mesuré » n'est pas « générique » : on ne condamne pas une reco sur
    # des données que le dossier n'a jamais eues.
    assert result["status"] == "non_evaluable"
    assert set(result["unavailable"]) == {kind for kind, _label in SPECIFICITY_ELEMENTS}


# ── Les autres éléments et leurs voisins légitimes ──────────────────────────


def test_a_broad_country_zone_is_not_a_territory():
    registry = registry_from_inputs(profile={"geoZone": "France"}, research={}, contacts=[])
    result = assess_specificity(["Vise la filiale France."], registry)
    assert "territory" not in _kinds(result)
    assert "territory" in result["unavailable"]


def test_a_numeric_capacity_needs_the_consultant_unit():
    registry = registry_from_inputs(profile={"size": "12"}, research={}, contacts=[])
    assert "capacity" in _kinds(assess_specificity(["Tes 12 consultants suffisent."], registry))
    assert "capacity" not in _kinds(assess_specificity(["Un cycle de 12 mois."], registry))


def test_access_path_objective_and_constraint_come_from_declared_fields():
    registry = registry_from_inputs(
        profile={"sellerGoal": "ouvrir trois grands comptes", "salesBlockers": ["référencement achats"]},
        research={},
        contacts=[],
        reverse_prospects=[{"fullName": "Jean Dupont"}],
    )
    text = "Passe par Jean Dupont pour ouvrir trois grands comptes, et anticipe le référencement achats."
    result = assess_specificity([text], registry)
    assert _kinds(result) == {"access_path", "user_objective", "known_constraint"}


def test_available_consultant_is_named_unavailable_when_no_bench_is_carried():
    # Ni la requête du plan ni celle du message ne portent de vivier : l'élément
    # est NOMMÉ indisponible plutôt que compté absent.
    result = assess_specificity(["x"], _sg_registry())
    assert "available_consultant" in result["unavailable"]


def test_blank_and_missing_texts_are_tolerated():
    result = assess_specificity([None, "", "   "], _sg_registry())
    assert result["status"] == "generique"
    assert result["elements"] == []


# ── La consigne atteint les prompts qui recommandent ────────────────────────


def test_the_directive_lists_the_eleven_elements_and_the_threshold():
    block = specificity_directive_block()
    for _kind, label in SPECIFICITY_ELEMENTS:
        assert label in block
    assert "au moins 2" in block


def test_the_plan_carries_the_directive():
    assert specificity_directive_block() in bellum_plan.build_system_prompt({})


@pytest.mark.parametrize(
    "system",
    [
        bellum_messages.build_system_prompt({}),
        bellum_outreach.build_system_prompt({}, "email"),
        bellum_outreach.build_system_prompt({}, "linkedin"),
    ],
    ids=["messages", "outreach-email", "outreach-linkedin"],
)
def test_message_prompts_carry_the_rule_through_the_shared_golden_rules(system: str):
    # Une seule écriture pour les deux prompts messages — la règle d'or
    # `real_verified_element` — où « UN élément réel » contredisait « au moins 2 ».
    assert SPECIFICITY_LABELS in system
    assert f"au moins {MIN_SPECIFIC_ELEMENTS} éléments RÉELS" in system
    assert "UN élément RÉEL" not in system


def test_a_declared_zone_list_is_split_into_territories():
    # `geoZone` s'écrit « France, Lyon; Toulouse » : chaque zone compte, la zone
    # trop large (« France ») est écartée.
    registry = registry_from_inputs(profile={"geoZone": "France, Lyon; Toulouse"}, research={}, contacts=[])
    result = assess_specificity(["Commence par tes comptes de Toulouse."], registry)
    assert result["elements"] == [{"kind": "territory", "value": "Toulouse"}]
    assert "territory" not in _kinds(assess_specificity(["Vise la France entière."], registry))


def test_snake_case_research_lists_are_read_too():
    registry = registry_from_inputs(
        profile={},
        research={
            "entities_exhaustive": [{"name": "SNCF Réseau"}],
            "budget_signals": [{"signal": "Programme cybersécurité OT", "timeframe": "2026"}],
        },
        contacts=[],
    )
    text = "Chez SNCF Réseau, le programme cybersécurité OT ouvre la porte."
    assert _kinds(assess_specificity([text], registry)) == {"precise_entity", "dated_signal"}


# ── #1925.15 — « GÉNÉRIQUE = ÉCHEC, MÊME GRAMMATICALEMENT PARFAIT » ──────────
#
# La demande dit une chose précise, et c'est la seule qui compte ici : la QUALITÉ
# D'ÉCRITURE n'est pas un critère. Une phrase impeccable qui ne cite aucun
# élément du dossier reste un échec ; une phrase bancale qui en cite deux reste
# un succès. Le validateur est structurellement indépendant de la grammaire (il
# cherche des VALEURS du dossier dans un texte normalisé), et ces deux tests le
# PROUVENT dans les deux sens — sans le second, la garde ne dirait que « le vide
# échoue », ce qui était déjà tenu.


def test_1925_15_a_grammatically_perfect_recommendation_without_any_element_is_still_generic():
    polished = (
        "Je vous recommande d'engager sans tarder une démarche de prise de contact structurée auprès "
        "des décideurs concernés, en veillant à personnaliser soigneusement votre approche afin de "
        "maximiser vos chances d'obtenir un rendez-vous qualifié dans les meilleurs délais."
    )
    result = assess_specificity([polished], _sg_registry())
    assert result["status"] == "generique"
    assert result["count"] == 0
    # Le dossier PORTAIT de quoi être spécifique : ce n'est pas « non évaluable ».
    available = {kind for kind, _label in SPECIFICITY_ELEMENTS} - set(result["unavailable"])
    assert len(available) >= MIN_SPECIFIC_ELEMENTS


def test_1925_15_a_clumsy_recommendation_that_cites_the_file_still_passes():
    """Le témoin du NON : la garde ne récompense pas le style. Même texte utile,
    écrit sans soin — pas de ponctuation, pas de verbe conjugué —, il cite deux
    éléments du dossier, donc il est spécifique."""
    clumsy = "sophie leroy itim open banking api appeler"
    result = assess_specificity([clumsy], _sg_registry())
    assert result["status"] == "specifique"
    assert result["count"] >= MIN_SPECIFIC_ELEMENTS
