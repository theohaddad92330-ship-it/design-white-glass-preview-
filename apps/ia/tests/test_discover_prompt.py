"""Tests du prompt BELLUM-DISCOVER v2 — l'angle commercial, et rien d'autre.

Deux choses sont verrouillées ici :

1. **Le périmètre du modèle** — il reçoit des entreprises déjà résolues, il
   n'invente ni entreprise, ni score, ni personne. Les interdits doivent être
   écrits noir sur blanc dans le prompt, sinon le garde-fou ne tient qu'au code.
2. **L'injection du profil** — les champs FANTÔMES de la v1 (`personas`,
   `avgTJM`, `references`), que `esnAnswersToProfileData` ne renseigne jamais
   (cf. `packages/contracts/src/schemas/analysis.ts`), sont partis ; les champs
   d'ICP réellement stockés et jusqu'ici IGNORÉS sont utilisés.
"""

from __future__ import annotations

import json

from app.prompts.bellum_discover import build_angle_user_prompt, build_system_prompt

FULL_PROFILE = {
    "companyName": "Skaizen",
    "positioning": "ESN de proximité, expertise data",
    "size": "80",
    "offers": ["Data & IA", "Cloud"],
    "offerDomain": "esn_it",
    "sectors": ["Banque & Assurance"],
    "targetCompanyTypes": ["PME (50-500 salariés)"],
    "geoZone": "Lyon & Auvergne-Rhône-Alpes",
    "staffingModel": "Régie + forfait",
    "mainChallenge": "Trouver des comptes ouverts hors appels d'offres",
}


# ── Périmètre du modèle ─────────────────────────────────────────────────────


def test_prompt_forbids_inventing_companies_scores_and_people() -> None:
    """Les trois inventions de la v1 (entreprises, score /10, « contacts clés »)
    sont explicitement interdites dans le prompt lui-même."""
    prompt = build_system_prompt(FULL_PROFILE)
    assert "n'en ajoutes pas" in prompt
    assert "AUCUN SCORE" in prompt
    assert "N'INVENTE AUCUNE PERSONNE" in prompt
    assert "N'INVENTE AUCUN FAIT" in prompt


def test_prompt_states_companies_are_already_resolved_from_the_registry() -> None:
    prompt = build_system_prompt(FULL_PROFILE)
    assert "SIREN est vérifié" in prompt
    assert "FOURNIES" in prompt


def test_prompt_allows_a_null_angle_rather_than_a_filler_one() -> None:
    """« Un angle vide vaut mieux qu'un angle inventé » — sans cette porte de
    sortie, le modèle comble toujours le vide."""
    assert '"angle": null' in build_system_prompt(FULL_PROFILE)


def test_output_contract_asks_only_for_angle_and_roles() -> None:
    prompt = build_system_prompt(FULL_PROFILE)
    assert "`angle`" in prompt and "`suggestedRoles`" in prompt
    for invented in ("priorityScore", "potentialContacts"):
        assert invented not in prompt, f"{invented} appartient au contrat v1 halluciné"


# ── Injection du profil ─────────────────────────────────────────────────────


def test_dangling_v1_fields_are_gone() -> None:
    """`personas` / `avgTJM` / `references` n'ont AUCUNE source dans EsnAnswers :
    ils ne produisaient qu'un mur de « N/A » vendu comme de la personnalisation."""
    prompt = build_system_prompt(FULL_PROFILE)
    for ghost in ("Personas", "TJM", "Références"):
        assert ghost not in prompt


def test_stored_icp_fields_are_actually_used() -> None:
    """Les champs que la v1 ignorait alors qu'ils SONT stockés."""
    prompt = build_system_prompt(FULL_PROFILE)
    assert "ESN de proximité, expertise data" in prompt  # positioning
    assert "PME (50-500 salariés)" in prompt  # targetCompanyTypes
    assert "Trouver des comptes ouverts" in prompt  # mainChallenge
    assert "Data & IA, Cloud" in prompt  # offers, aplaties


def test_offer_domain_renders_only_for_a_registered_non_default_pack() -> None:
    """Le domaine d'offre passe par le REGISTRE de packs, jamais par la valeur
    brute : `esn_it` (le défaut) et une valeur inconnue doivent rendre le prompt
    HISTORIQUE au byte près — c'est la garantie que la sélection d'un domaine
    est le seul interrupteur (cf. tests/test_offer_domains.py)."""
    default = build_system_prompt({**FULL_PROFILE, "offerDomain": "esn_it"})
    unknown = build_system_prompt({**FULL_PROFILE, "offerDomain": "domaine_bidon"})
    absent = build_system_prompt({key: value for key, value in FULL_PROFILE.items() if key != "offerDomain"})
    assert default == absent == unknown
    assert "Domaine d'offre" not in default

    finance = build_system_prompt({**FULL_PROFILE, "offerDomain": "finance"})
    assert "Domaine d'offre : Finance" in finance


def test_missing_fields_are_omitted_never_rendered_as_na_or_none() -> None:
    """Un champ absent disparaît. Le littéral « None » dans un prompt serait lu
    par le modèle comme une VALEUR (le positionnement de l'ESN serait « None »)."""
    prompt = build_system_prompt({"companyName": "Skaizen"})
    assert "Skaizen" in prompt
    assert "None" not in prompt
    assert "N/A" not in prompt
    assert "Positionnement" not in prompt


def test_empty_profile_is_declared_not_simulated() -> None:
    prompt = build_system_prompt({})
    assert "non renseigné" in prompt
    assert "n'invente aucun positionnement" in prompt


# ── User prompt ─────────────────────────────────────────────────────────────


def test_user_prompt_carries_the_resolved_companies_and_the_criteria() -> None:
    companies = [{"name": "ACME", "siren": "552081317", "sector": "Conseil informatique"}]
    prompt = build_angle_user_prompt(companies, {"department": "69"})
    assert "552081317" in prompt
    assert "ACME" in prompt
    assert '"department": "69"' in prompt
    assert "(1)" in prompt, "le nombre d'entreprises borne explicitement la réponse"


def test_user_prompt_never_leaks_the_computed_score_to_the_model() -> None:
    """Si le score voyageait dans le prompt, le modèle le recopierait ou le
    commenterait — et le badge redeviendrait une sortie de LLM."""
    prompt = build_angle_user_prompt([{"name": "ACME", "siren": "552081317"}], {})
    assert "score" not in prompt.lower()


def test_user_prompt_is_valid_json_payload() -> None:
    """Les accents FR ne doivent pas être échappés (ensure_ascii=False) sans quoi
    le modèle relit du \\u00e9 au lieu du texte."""
    prompt = build_angle_user_prompt([{"name": "SOCIÉTÉ GÉNÉRALE", "siren": "552120222"}], {})
    assert "SOCIÉTÉ GÉNÉRALE" in prompt
    assert "\\u00c9" not in prompt


def test_user_prompt_handles_zero_companies() -> None:
    assert "(0)" in build_angle_user_prompt([], {})


def test_user_prompt_query_is_serialisable() -> None:
    payload = build_angle_user_prompt([], {"nafCode": "62.02A", "headcountMin": 50})
    start = payload.index("{")
    assert json.loads(payload[start : payload.index("}", start) + 1])["nafCode"] == "62.02A"
