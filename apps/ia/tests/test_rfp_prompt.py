"""BELLUM-RFP — extraction dossier (#2957, #2180.9-.26).

Douze catégories de champs DOCUMENT (entité juridique, calendrier, Q/R,
critères de notation, pièces demandées, profils demandés, volumes, tarifs,
conditions contractuelles, sécurité/conformité, interlocuteurs, format de
remise), distinctes de `requirements[]` (une ligne de conformité par
exigence). Chacune porte sa provenance (page, confiance, statut) — jamais
un `contradiction` produit ici : un seul document est lu à la fois.
"""

from __future__ import annotations

from app.prompts.bellum_rfp import (
    build_analysis_system_prompt,
    build_analysis_user_prompt,
    build_drafting_system_prompt,
)

_CATEGORIES = [
    "legal_entity",
    "calendar",
    "qa",
    "scoring_criteria",
    "requested_documents",
    "requested_profiles",
    "volumes",
    "pricing",
    "contractual_terms",
    "security_compliance",
    "contacts",
    "submission_format",
]


def test_system_prompt_names_the_twelve_categories():
    prompt = build_analysis_system_prompt()
    for category in _CATEGORIES:
        assert category in prompt, f"missing category: {category}"


def test_system_prompt_never_asks_for_contradiction():
    # Un seul document est lu à la fois : une contradiction se détecte
    # ailleurs (comparaison entre documents), jamais devinée ici.
    prompt = build_analysis_system_prompt()
    assert "JAMAIS" in prompt and "contradiction" in prompt.lower()


def test_user_prompt_json_schema_requests_document_extraction_with_provenance():
    prompt = build_analysis_user_prompt("Appel d'offres pour la refonte du SI", profile_data={})
    assert '"documentExtraction"' in prompt
    for category in _CATEGORIES:
        assert f'"{category}"' in prompt
    assert '"page"' in prompt
    assert '"confidence"' in prompt
    assert '"status"' in prompt


def test_user_prompt_requests_the_consultation_reference_as_written():
    # #2957 (#2180.39) — le doublon par RÉFÉRENCE a besoin du numéro de
    # consultation, tel qu'écrit ; null quand le document n'en porte aucun.
    prompt = build_analysis_user_prompt("Consultation n° 2026-INFRA-042", profile_data={})
    assert '"reference": "<numéro ou référence de la consultation, tel qu\'écrit, ou null>"' in prompt


def test_drafting_prompt_forbids_generic_marketing_copy_even_with_a_source():
    """#2957 (#2181.38) — le registre INTERDIT de #2181 nomme explicitement
    « remplir une preuve avec un texte marketing générique », distinct
    d'« inventer un fait » (déjà couvert par « CE QUE TU NE FAIS JAMAIS »).
    Une phrase comme « nous sommes reconnus pour notre excellence » n'est
    factuellement fausse pour personne — c'est justement ce qui la rend
    indétectable par la seule règle anti-invention, et ce que ce test vérifie
    séparément.
    """
    prompt = build_drafting_system_prompt()
    assert "générique" in prompt.lower()
    assert "marketing" in prompt.lower()
