"""#3890 (ADD-SANOFI-04, retour bêta Sanofi 08/10/2026) — « Distinguer les
populations de contacts et sélectionner dans le bon ensemble ».

Constat : Laura a présenté « dix contacts liés au CRM » et « 2 597 personnes
détectées » comme une CONTRADICTION, alors que ce sont deux mesures de deux
populations différentes (contacts synchronisés vs. personnes détectées dans un
fichier importé). Ce fichier tient le bloc qui nomme les six définitions et
refuse l'alerte de contradiction par défaut (`_BLOCK_MARKET_MEMORY`, qui porte
aussi la règle sœur sur une identité ambiguë, #3890.5).
"""

from __future__ import annotations

from app.prompts.bellum_advisor import _BLOCK_MARKET_MEMORY, build_system_prompt


def test_the_rendered_prompt_carries_both_rules() -> None:
    prompt = build_system_prompt({}, {}, "", "")
    assert "DEUX VOLUMES DE PERSONNES NE SE CONTREDISENT PAS" in prompt
    assert "UNE IDENTITÉ AMBIGUË NE S'ENRICHIT PAS" in prompt


def test_ten_crm_contacts_and_a_larger_detected_set_are_not_an_automatic_contradiction() -> None:
    assert "« Dix contacts liés au CRM » et « 2 597 personnes détectées »" in _BLOCK_MARKET_MEMORY
    assert "ne sont pas deux mesures du MÊME ensemble" in _BLOCK_MARKET_MEMORY


def test_the_six_population_definitions_are_each_named() -> None:
    for definition in (
        "contacts synchronisés dans Bellum",
        "personnes détectées dans une source externe",
        "identités VÉRIFIÉES",
        "personnes correspondant aux critères",
        "lignes chargées pour cette conversation",
        "sélection que tu affiches à l'instant",
    ):
        assert definition in _BLOCK_MARKET_MEMORY


def test_a_contradiction_is_only_flagged_for_the_same_population_same_moment_same_definition() -> None:
    assert (
        "Tu ne compares deux volumes comme contradictoires que s'ils portent sur la MÊME "
        "population, au MÊME moment, selon la MÊME définition" in _BLOCK_MARKET_MEMORY
    )


def test_a_first_name_and_a_title_alone_never_guarantee_an_exploitable_identity() -> None:
    assert "Une carte qui ne porte qu'un prénom et une fonction ne suffit JAMAIS" in _BLOCK_MARKET_MEMORY


def test_an_ambiguous_identity_is_never_enriched_or_added_to_a_campaign_by_assumption() -> None:
    assert "avant d'enrichir ce contact ou de l'inscrire à une campagne" in _BLOCK_MARKET_MEMORY
    assert "jamais un enrichissement ou une inscription qui suppose silencieusement" in _BLOCK_MARKET_MEMORY


def test_a_stripped_block_would_be_missing_the_rules() -> None:
    """La garde sait dire NON : un bloc VIDÉ ne porte plus ni la règle de
    population ni la règle d'identité ambiguë."""
    stripped = ""
    assert "DEUX VOLUMES DE PERSONNES NE SE CONTREDISENT PAS" not in stripped
    assert "UNE IDENTITÉ AMBIGUË NE S'ENRICHIT PAS" not in stripped
