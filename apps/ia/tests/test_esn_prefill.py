"""Préremplissage du profil ESN — le nom seul suffit.

Le fil rouge de tout ce fichier : **jamais de donnée fictive**. Chaque test
vérifie soit qu'une valeur est fondée sur une source réelle, soit qu'elle est
ABSENTE. Aucune valeur par défaut, aucun « National » de remplissage, aucune
valeur hors du catalogue fermé du contrat.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services import esn_prefill
from app.services.esn_candidate_ranking import EsnCandidate
from app.services.esn_prefill import (
    INSEE_HEADCOUNT_TRANCHES,
    consultant_size_bucket,
    department_from_postal_code,
    geo_zone_for_postal_code,
    headcount_from_tranche,
    is_it_naf,
    naf_label_for_code,
    pick_website,
    validate_llm_fields,
    website_provenance,
)
from app.services.pappers.models import CompanyProfile, RelatedCompany

# Le catalogue tel que l'API NestJS l'envoie (extrait de ESN_ANSWER_OPTIONS).
OPTIONS = {
    "consultant_size": ["1-10", "10-30", "30-80", "80-200", "200-500", "500+"],
    "expertise_areas": [
        "Cloud & Infrastructure (AWS, Azure, GCP, Hosting)",
        "Data & Intelligence Artificielle",
        "Cybersécurité & Conformité",
        "DevOps, SRE & Automatisation",
        "Développement applicatif (Web, Mobile, API)",
        "SAP & ERP (S/4HANA, Oracle, Sage)",
        "Réseau & Télécom",
    ],
    "positioning": [
        "Expertise de niche - spécialisé sur 1-2 domaines pointus",
        "Multi-compétences ciblées - 3-5 domaines avec références solides",
        "Généraliste - large spectre selon les besoins client",
        "Régie pure - on place des profils sur demande",
        "Conseil & Delivery - cadrage + exécution",
    ],
    "staffing_model": [
        "Uniquement des CDI internes",
        "Principalement CDI + quelques freelances ponctuels",
        "Mix équilibré CDI / Freelances",
        "Principalement freelances / sous-traitants",
        "Uniquement freelances (pas de CDI)",
    ],
    "target_sectors": [
        "Banque de détail & Banque privée",
        "Assurance & Mutuelles",
        "Fintech & Services financiers",
        "Industrie manufacturière & Automobile",
        "Aéronautique & Défense",
        "Énergie & Utilities (EDF, Engie...)",
        "Secteur public & Collectivités",
        "Tech & Startups / Scale-ups",
    ],
    "target_company_types": [
        "CAC40 / SBF120 (grands comptes)",
        "ETI (500-5 000 salariés)",
        "PME (50-500 salariés)",
        "Startups & Scale-ups",
        "Secteur public & Collectivités",
    ],
    "geo_zones": [
        "Paris & Île-de-France",
        "Lyon & Auvergne-Rhône-Alpes",
        "Lille & Hauts-de-France",
        "Nantes & Pays de la Loire",
        "Bordeaux & Nouvelle-Aquitaine",
        "Toulouse & Occitanie",
        "Marseille & PACA",
        "Strasbourg & Grand Est",
        "Rennes & Bretagne",
        "Full remote (pas de contrainte géo)",
        "National (toute la France)",
        "International",
    ],
}


def _pappers(**overrides) -> CompanyProfile:
    payload = {
        "siren": "810669754",
        "nom_entreprise": "LINNAEUS",
        "nom_commercial": "Kicklox",
        "code_naf": "62.02A",
        "libelle_code_naf": "Conseil en systèmes et logiciels informatiques",
        "objet_social": "Prestations de conseil et d'ingénierie informatique",
        "effectif_min": 50,
        "effectif_max": 99,
        "effectif": "50 à 99 salariés",
        "siege": {"ville": "Paris", "code_postal": "75002"},
    }
    payload.update(overrides)
    return CompanyProfile.model_validate(payload)


# Forme normalisée par ``_fetch_registry`` (issue de ``search_companies``, qui
# porte ville / libellé NAF / département — pas ``fetch_company``).
REGISTRY = {
    "source": "recherche-entreprises",
    "name": "LINNAEUS (KICKLOX)",
    "siren": "810669754",
    "nafCode": "6202A",
    "nafLabel": "Conseil en systèmes et logiciels informatiques",
    "city": "PARIS",
    "department": "75",
    "headcountRange": "21",
}


# ── Tranches d'effectif INSEE → bucket consultant_size ────────────────────────


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        ("00", "1-10"),  # 0 salarié — fondateur seul
        ("01", "1-10"),
        ("02", "1-10"),
        ("03", "1-10"),
        ("11", "10-30"),
        ("12", "30-80"),
        ("21", "30-80"),
        ("22", "80-200"),
        ("31", "200-500"),
        ("32", "200-500"),
        ("41", "500+"),
        ("42", "500+"),
        ("51", "500+"),
        ("52", "500+"),
        ("53", "500+"),
    ],
)
def test_every_insee_tranche_maps_to_a_bucket(code: str, expected: str) -> None:
    assert consultant_size_bucket(headcount_from_tranche(code)) == expected


def test_all_known_tranches_are_covered_by_the_table() -> None:
    """Garde-fou : la table de tranches ne doit pas se désynchroniser du test."""
    assert set(INSEE_HEADCOUNT_TRANCHES) == {
        "00", "01", "02", "03", "11", "12", "21", "22", "31", "32", "41", "42", "51", "52", "53",
    }


@pytest.mark.parametrize("code", ["NN", "", None, "99", "  "])
def test_unknown_tranche_yields_no_headcount(code: str | None) -> None:
    """« NN » = effectif non renseigné : aucune valeur par défaut ne doit sortir."""
    assert headcount_from_tranche(code) is None
    assert consultant_size_bucket(headcount_from_tranche(code)) is None


# ── Code postal → zone géo ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("postal_code", "expected"),
    [
        ("75002", "Paris & Île-de-France"),
        ("92100", "Paris & Île-de-France"),
        ("69003", "Lyon & Auvergne-Rhône-Alpes"),
        ("38000", "Lyon & Auvergne-Rhône-Alpes"),
        ("59000", "Lille & Hauts-de-France"),
        ("44000", "Nantes & Pays de la Loire"),
        ("33000", "Bordeaux & Nouvelle-Aquitaine"),
        ("31000", "Toulouse & Occitanie"),
        ("13001", "Marseille & PACA"),
        ("06000", "Marseille & PACA"),
        ("67000", "Strasbourg & Grand Est"),
        ("35000", "Rennes & Bretagne"),
    ],
)
def test_postal_code_maps_to_each_geo_zone(postal_code: str, expected: str) -> None:
    assert geo_zone_for_postal_code(postal_code) == expected
    assert expected in OPTIONS["geo_zones"]


@pytest.mark.parametrize(
    "postal_code",
    [
        "76000",  # Normandie
        "21000",  # Bourgogne-Franche-Comté
        "45000",  # Centre-Val de Loire
        "20000",  # Corse
        "97400",  # La Réunion (DOM)
        "97110",  # Guadeloupe (DOM)
    ],
)
def test_unmapped_department_yields_no_geo_zone(postal_code: str) -> None:
    """Aucune des 12 valeurs ne couvre ces régions : le champ reste VIDE. On
    n'invente surtout pas « National (toute la France) » pour combler."""
    assert geo_zone_for_postal_code(postal_code) is None


@pytest.mark.parametrize(("postal_code", "expected"), [("75002", "75"), ("97400", "974"), ("", None), (None, None)])
def test_department_extraction(postal_code: str | None, expected: str | None) -> None:
    assert department_from_postal_code(postal_code) == expected


# ── NAF → offer_domain ────────────────────────────────────────────────────────


@pytest.mark.parametrize("naf", ["62.02A", "6202A", "62.01Z", "62.09Z", "63.11Z", "58.29C"])
def test_it_naf_codes_detected(naf: str) -> None:
    assert is_it_naf(naf) is True


@pytest.mark.parametrize("naf", ["70.22Z", "78.10Z", "46.51Z", "", None, "6"])
def test_non_it_naf_codes_rejected(naf: str | None) -> None:
    assert is_it_naf(naf) is False


@pytest.mark.parametrize(
    ("naf", "expected"),
    [
        ("62.01Z", "Programmation informatique"),
        ("6201Z", "Programmation informatique"),
        ("62.02A", "Conseil en systèmes et logiciels informatiques"),
        ("63.11Z", "Traitement de données, hébergement et activités connexes"),
        # Hors nomenclature IT → aucun libellé fabriqué.
        ("70.22Z", None),
        ("", None),
        (None, None),
    ],
)
def test_naf_label_decoding(naf: str | None, expected: str | None) -> None:
    """Décoder la nomenclature publique NAF n'est pas inventer une donnée — même
    principe que les libellés de tranche INSEE."""
    assert naf_label_for_code(naf) == expected


# ── Validation stricte du retour LLM ─────────────────────────────────────────


def test_out_of_catalog_values_are_dropped() -> None:
    raw = {
        "fields": {
            "expertise_areas": {
                "value": ["Data & Intelligence Artificielle", "Blockchain & Web3"],
                "confidence": "high",
                "rationale": "objet social",
            }
        }
    }
    fields = validate_llm_fields(raw, OPTIONS)
    assert fields["expertise_areas"]["value"] == ["Data & Intelligence Artificielle"]


def test_field_disappears_when_everything_was_dropped() -> None:
    raw = {"fields": {"positioning": {"value": "Positionnement inventé par le modèle", "confidence": "high"}}}
    assert validate_llm_fields(raw, OPTIONS) == {}


def test_multi_value_fields_are_capped_at_five() -> None:
    raw = {
        "fields": {
            "expertise_areas": {"value": OPTIONS["expertise_areas"][:7], "confidence": "medium"},
            "target_sectors": {"value": OPTIONS["target_sectors"][:8], "confidence": "medium"},
        }
    }
    fields = validate_llm_fields(raw, OPTIONS)
    assert fields["expertise_areas"]["value"] == OPTIONS["expertise_areas"][:5]
    assert fields["target_sectors"]["value"] == OPTIONS["target_sectors"][:5]


def test_llm_cannot_write_deterministic_or_excluded_fields() -> None:
    """Le modèle n'écrase pas un fait registre, et ne touche jamais aux deux
    champs volontairement exclus du préremplissage."""
    raw = {
        "fields": {
            "esn_name": {"value": "Autre nom", "confidence": "high"},
            "consultant_size": {"value": "500+", "confidence": "high"},
            "geo_zones": {"value": ["International"], "confidence": "high"},
            "sales_team_size": {"value": "2-3 personnes", "confidence": "high"},
            "main_sales_pain": {"value": "Convertir mes RDV en signatures", "confidence": "high"},
        }
    }
    assert validate_llm_fields(raw, OPTIONS) == {}


def test_single_value_field_keeps_first_valid_choice() -> None:
    raw = {
        "fields": {
            "staffing_model": {
                "value": ["Inventé", "Mix équilibré CDI / Freelances"],
                "confidence": "medium",
                "rationale": "offres d'emploi",
            }
        }
    }
    fields = validate_llm_fields(raw, OPTIONS)
    assert fields["staffing_model"] == {
        "value": "Mix équilibré CDI / Freelances",
        "confidence": "medium",
        "source": "inference",
        "rationale": "offres d'emploi",
    }


def test_inference_confidence_is_capped_at_medium() -> None:
    """Claude s'auto-attribue « high » sur une simple lecture de page d'accueil
    (« Régie pure », « Uniquement freelances ») : une déduction n'est pas un fait
    registre. Le plafond est appliqué dans le CODE, pas confié au prompt."""
    raw = {
        "fields": {
            "positioning": {"value": "Régie pure - on place des profils sur demande", "confidence": "high"},
            "staffing_model": {"value": "Uniquement freelances (pas de CDI)", "confidence": "high"},
            "expertise_areas": {"value": ["Cybersécurité & Conformité"], "confidence": "high"},
        }
    }
    fields = validate_llm_fields(raw, OPTIONS)

    assert {key: field["confidence"] for key, field in fields.items()} == {
        "positioning": "medium",
        "staffing_model": "medium",
        "expertise_areas": "medium",
    }
    assert {field["source"] for field in fields.values()} == {"inference"}


def test_lower_inference_confidences_are_left_untouched() -> None:
    raw = {
        "fields": {
            "positioning": {"value": "Régie pure - on place des profils sur demande", "confidence": "medium"},
            "staffing_model": {"value": "Uniquement freelances (pas de CDI)", "confidence": "low"},
        }
    }
    fields = validate_llm_fields(raw, OPTIONS)
    assert fields["positioning"]["confidence"] == "medium"
    assert fields["staffing_model"]["confidence"] == "low"


def test_deterministic_fields_may_still_be_high() -> None:
    """Le plafond ne vise QUE la source `inference` : un fait registre garde
    « high »."""
    assert esn_prefill.cap_inference_confidence("high") == "medium"
    assert esn_prefill.cap_inference_confidence("low") == "low"


def test_invalid_confidence_degrades_to_low() -> None:
    raw = {"fields": {"positioning": {"value": "Régie pure - on place des profils sur demande", "confidence": "sûr"}}}
    assert validate_llm_fields(raw, OPTIONS)["positioning"]["confidence"] == "low"


def test_field_absent_from_options_cannot_be_prefilled() -> None:
    """Si l'appelant n'envoie pas le catalogue d'un champ, ce champ n'est pas
    préremplissable — on ne se rabat pas sur une liste codée en dur côté Python."""
    raw = {"fields": {"positioning": {"value": "Généraliste - large spectre selon les besoins client"}}}
    assert validate_llm_fields(raw, {}) == {}


def test_garbage_llm_payload_yields_no_fields() -> None:
    assert validate_llm_fields("pas du json", OPTIONS) == {}
    assert validate_llm_fields({"fields": []}, OPTIONS) == {}
    assert validate_llm_fields({"expertise_areas": "une chaîne"}, OPTIONS) == {}


# ── Choix du site web parmi les hits ─────────────────────────────────────────


def test_website_skips_directories_and_social_networks() -> None:
    hits = [
        {"url": "https://www.societe.com/societe/kicklox-812345678.html"},
        {"url": "https://fr.linkedin.com/company/kicklox"},
        {"url": "https://www.kicklox.com/a-propos"},
    ]
    assert pick_website(hits) == "https://www.kicklox.com"


def test_website_is_none_when_nothing_credible() -> None:
    """Sans hit exploitable, aucun domaine n'est fabriqué à partir du nom."""
    assert pick_website([{"url": "https://www.pappers.fr/entreprise/kicklox"}]) is None
    assert pick_website([]) is None


# #2640.1 — « Prioriser SIREN / domaine e-mail avant recherche nom » : le
# domaine e-mail PRO du commercial, quand il en porte un, départage entre
# plusieurs hits plausibles PLUTÔT que le premier résultat nommé.


def test_website_prefers_the_hit_matching_the_professional_email_domain() -> None:
    hits = [
        {"url": "https://www.kicklox-conseil.fr"},  # nommé en premier, mais pas le bon
        {"url": "https://www.kicklox.com"},
    ]
    assert pick_website(hits, email="dev@kicklox.com") == "https://www.kicklox.com"


def test_website_falls_back_to_the_first_credible_hit_when_no_email_matches() -> None:
    hits = [{"url": "https://www.kicklox-conseil.fr"}, {"url": "https://www.kicklox.com"}]
    assert pick_website(hits, email="dev@autre-domaine.fr") == "https://www.kicklox-conseil.fr"


def test_website_never_trusts_a_generic_email_provider_as_a_confirmed_domain() -> None:
    # gmail.com n'identifie AUCUNE entreprise : le premier hit crédible gagne,
    # exactement comme sans e-mail — jamais un domaine personnel affiché comme
    # celui de la société.
    hits = [{"url": "https://www.kicklox-conseil.fr"}, {"url": "https://www.gmail.com"}]
    assert pick_website(hits, email="dev@gmail.com") == "https://www.kicklox-conseil.fr"


def test_website_without_email_keeps_the_first_credible_hit() -> None:
    """Non-régression : sans e-mail, le comportement historique est inchangé."""
    hits = [{"url": "https://www.kicklox-conseil.fr"}, {"url": "https://www.kicklox.com"}]
    assert pick_website(hits) == "https://www.kicklox-conseil.fr"


# #2640.1 (ordre complété le 21/09/2026) — « SIREN → domaine e-mail → recherche
# par nom », désormais vrai aussi pour le site : l'identité résolue par le
# SIREN (raison sociale ou nom commercial Pappers/registre) départage AVANT le
# domaine e-mail, qui départage lui-même avant le premier résultat nommé.


def test_website_prefers_the_hit_naming_the_siren_resolved_identity_over_email() -> None:
    hits = [
        {"url": "https://www.kicklox-conseil.fr", "title": "Kicklox Conseil — page pro"},
        {"url": "https://www.linnaeus.fr", "title": "LINNAEUS — société de conseil"},
    ]
    # L'e-mail pointerait vers le premier hit (même domaine que rien ici, donc
    # ignoré) : c'est bien l'identité SIREN qui tranche, pas le hasard du rang.
    assert (
        pick_website(hits, email="dev@kicklox-conseil.fr", legal_name="LINNAEUS") == "https://www.linnaeus.fr"
    )


def test_website_falls_back_to_email_when_no_hit_names_the_resolved_identity() -> None:
    hits = [{"url": "https://www.kicklox-conseil.fr"}, {"url": "https://www.kicklox.com"}]
    # Aucun titre ne porte l'identité résolue : l'e-mail reprend la main,
    # exactement comme avant #2640.1 (ordre inchangé quand SIREN ne dit rien).
    assert pick_website(hits, email="dev@kicklox.com", legal_name="LINNAEUS") == "https://www.kicklox.com"


def test_website_ignores_legal_name_when_none_resolved() -> None:
    """Non-régression : sans identité résolue (candidat encore ambigu, aucun
    SIREN), le comportement d'avant #2640.1 reste identique."""
    hits = [{"url": "https://www.kicklox-conseil.fr"}, {"url": "https://www.kicklox.com"}]
    assert pick_website(hits, email="dev@autre-domaine.fr", legal_name=None) == "https://www.kicklox-conseil.fr"


# #2640.2 — LA PROVENANCE du site retenu. `esn_website` (nouvelle clé
# d'`EsnAnswers`) doit dire d'où vient sa valeur — registre/SIREN, domaine
# d'e-mail, ou simple recherche par nom — jamais un `inference` générique qui
# confondrait un domaine CONFIRMÉ et un premier résultat non vérifié.
# `website_provenance` réutilise EXACTEMENT la même résolution que
# `pick_website` (dont c'est maintenant l'implémentation) : les neuf tests
# ci-dessus restent la preuve de non-régression sur l'URL choisie.


def test_website_provenance_is_registry_when_siren_identity_confirms() -> None:
    hits = [{"url": "https://www.linnaeus.fr", "title": "LINNAEUS — société de conseil"}]
    resolved = website_provenance(hits, legal_name="LINNAEUS")
    assert resolved is not None
    url, source, confidence, rationale = resolved
    assert url == "https://www.linnaeus.fr"
    assert source == "registry"
    assert confidence == "high"
    assert "registre" in rationale.lower() or "siren" in rationale.lower()


def test_website_provenance_is_inference_when_only_the_email_domain_confirms() -> None:
    hits = [{"url": "https://www.kicklox-conseil.fr"}, {"url": "https://www.kicklox.com"}]
    resolved = website_provenance(hits, email="dev@kicklox.com")
    assert resolved is not None
    url, source, confidence, rationale = resolved
    assert url == "https://www.kicklox.com"
    assert source == "inference"
    assert confidence == "medium"
    assert "e-mail" in rationale.lower()


def test_website_provenance_is_inference_as_the_bare_name_search_fallback() -> None:
    hits = [{"url": "https://www.kicklox-conseil.fr"}]
    resolved = website_provenance(hits)
    assert resolved is not None
    url, source, confidence, rationale = resolved
    assert url == "https://www.kicklox-conseil.fr"
    assert source == "inference"
    assert confidence == "low"
    # Jamais confondu avec le cas confirmé (registre) ni le cas e-mail : c'est
    # tout le sujet de ce point — un test qui ne distingue pas les rationales
    # laisserait passer un `inference` qui mentirait sur sa vraie origine.
    assert "registre" not in rationale.lower()
    assert "e-mail" not in rationale.lower()


def test_website_provenance_is_none_when_nothing_credible() -> None:
    assert website_provenance([]) is None
    assert website_provenance([{"url": "https://www.pappers.fr/entreprise/kicklox"}]) is None


# ── Orchestration : soft-fail source par source ──────────────────────────────


_DEFAULT = object()


def _mock(value):
    """``AsyncMock`` qui lève quand on lui passe une exception (source en panne),
    et qui renvoie la valeur sinon."""
    return AsyncMock(side_effect=value) if isinstance(value, Exception) else AsyncMock(return_value=value)


def _resolution(registry):
    """Résolution registre non ambiguë portant ``registry`` (ou vide si None)."""
    if registry is None:
        return esn_prefill.RegistryResolution()
    return esn_prefill.RegistryResolution(chosen=registry)


def _patch_sources(*, registry=REGISTRY, pappers=_DEFAULT, web=None, stack=None, claude=None):
    """Neutralise le réseau : chaque source est remplaçable indépendamment, et
    passer une exception simule une source en panne."""
    profile = _pappers() if pappers is _DEFAULT else pappers
    claude_mock = (
        AsyncMock(side_effect=claude) if isinstance(claude, Exception) else AsyncMock(return_value=(claude or {}, None))
    )
    resolution = registry if isinstance(registry, (Exception, esn_prefill.RegistryResolution)) else _resolution(registry)
    return (
        patch.object(esn_prefill, "_resolve_registry", new=_mock(resolution)),
        patch.object(esn_prefill, "_fetch_pappers", new=_mock(profile)),
        patch.object(esn_prefill, "_fetch_web", new=_mock(web if web is not None else [])),
        patch.object(esn_prefill.tech_detect, "detect_stack", new=_mock(stack or [])),
        patch.object(esn_prefill, "call_claude", new=claude_mock),
    )


async def _run(**kwargs):
    patches = _patch_sources(**kwargs)
    for p in patches:
        p.start()
    try:
        return await esn_prefill.prefill_esn_profile("Kicklox", options=OPTIONS)
    finally:
        for p in patches:
            p.stop()


async def test_deterministic_fields_from_registry_and_pappers() -> None:
    result = await _run()

    assert result["matched"] is True
    assert result["company"]["siren"] == "810669754"
    assert result["company"]["city"] == "Paris"

    fields = result["fields"]
    # Le nom COMMERCIAL prime sur la raison sociale : le commercial reconnaît
    # « Kicklox », pas « LINNAEUS ».
    assert fields["esn_name"]["value"] == "Kicklox"
    assert fields["esn_name"]["confidence"] == "high"
    # 50-99 salariés → milieu de tranche 74 → bucket 30-80.
    assert fields["consultant_size"]["value"] == "30-80"
    # L'effectif salarié total n'est pas le nombre de consultants : jamais "high".
    assert fields["consultant_size"]["confidence"] == "medium"
    assert "support" in fields["consultant_size"]["rationale"]
    assert fields["geo_zones"]["value"] == ["Paris & Île-de-France"]
    assert fields["geo_zones"]["confidence"] == "medium"
    # Le domaine d'offre n'est JAMAIS prérempli, même sur un NAF franchement
    # informatique : voir ``test_it_naf_no_longer_preselects_a_domain``.
    assert "offer_domain" not in fields


async def test_pappers_last_updated_becomes_as_of_on_pappers_sourced_fields() -> None:
    """#2028.8 — la source doit ÉMETTRE la date pour que #2028.2 (badge
    « prérempli le … ») cesse d'afficher « date inconnue ». Pappers porte déjà
    ``dernier_traitement`` (``CompanyProfile.last_updated``) ; il manquait le
    câble jusqu'à ``as_of``."""
    result = await _run(pappers=_pappers(dernier_traitement="2025-06-01"))

    fields = result["fields"]
    assert fields["esn_name"]["as_of"] == "2025-06-01"
    assert fields["consultant_size"]["as_of"] == "2025-06-01"
    assert fields["geo_zones"]["as_of"] == "2025-06-01"


async def test_no_pappers_date_yields_no_as_of_never_a_guessed_one() -> None:
    """Pappers indisponible ou sans date connue : `as_of` reste `None` — une
    date d'aujourd'hui serait une donnée fictive (« jamais de donnée
    fictive »)."""
    result = await _run(pappers=None)

    fields = result["fields"]
    # Sans Pappers, `esn_name`/`consultant_size` viennent du registre gratuit
    # seul (ou sont absents) — jamais une date inventée.
    for field in fields.values():
        assert field.get("as_of") is None


async def test_pappers_without_a_last_updated_date_still_yields_no_as_of() -> None:
    """La garde sait dire NON : un `CompanyProfile` SANS `dernier_traitement`
    ne doit produire AUCUN `as_of`, même si Pappers a répondu."""
    result = await _run(pappers=_pappers())  # fixture par défaut : pas de dernier_traitement

    assert result["fields"]["esn_name"].get("as_of") is None


async def test_company_carries_legal_name_and_commercial_name_when_distinct() -> None:
    """#2015.3 — la carte de confirmation ne portait qu'un seul nom mélangé.
    Pappers distingue raison sociale (``nom_entreprise``) et nom commercial
    (``nom_commercial``) : les deux doivent rejoindre `company`, séparément."""
    result = await _run()

    assert result["company"]["legal_name"] == "LINNAEUS"
    assert result["company"]["commercial_name"] == "Kicklox"


async def test_company_commercial_name_is_none_when_pappers_has_none() -> None:
    """Sait dire NON : Pappers sans nom commercial ne doit pas en inventer un —
    `commercial_name` reste `None`, `legal_name` porte toujours la raison
    sociale."""
    result = await _run(pappers=_pappers(nom_commercial=None))

    assert result["company"]["commercial_name"] is None
    assert result["company"]["legal_name"] == "LINNAEUS"


async def test_company_country_from_pappers_headquarters() -> None:
    """#2015.5 — le pays du siège, porté par Pappers (jamais deviné)."""
    result = await _run()

    assert result["company"]["country"] == "France"


async def test_company_group_carries_parents_and_subsidiary_count() -> None:
    """#2086.25 — DÉCISION Louis 17/09 : « groupe ou filiale » sur la carte
    entreprise, APRÈS confirmation. Les deux moitiés du fait, nommées."""
    profile = _pappers()
    profile.parent_companies = [RelatedCompany(id="e3", siren="987654321", name="ALPHABET HOLDINGS")]
    profile.subsidiaries = [
        RelatedCompany(id="e2", siren="111111111", name="KICKLOX CONSEIL"),
        RelatedCompany(id="e4", siren="222222222", name="KICKLOX ACADEMY"),
    ]
    result = await _run(pappers=profile)

    assert result["company"]["group"] == {
        "parentCompanies": ["ALPHABET HOLDINGS"],
        "subsidiaryCount": 2,
    }


async def test_company_group_is_none_without_any_capital_link() -> None:
    """Sait dire NON : Pappers répond mais le graphe ne porte ni parent ni
    filiale — `group` reste `None`, jamais un objet vide affiché comme un fait."""
    result = await _run(pappers=_pappers())

    assert result["company"]["group"] is None


async def test_company_group_is_none_without_pappers() -> None:
    """Sans Pappers, aucun graphe capitalistique : `group` reste `None`,
    jamais un groupe deviné depuis le registre gratuit seul."""
    result = await _run(pappers=None)

    assert result["company"]["group"] is None


async def test_company_is_active_true_when_pappers_does_not_say_ceased() -> None:
    """#2015.8 — tri-état : Pappers ne portant pas ``entreprise_cessee``
    signifie une entreprise active."""
    result = await _run()

    assert result["company"]["is_active"] is True


async def test_company_is_active_false_when_pappers_says_ceased() -> None:
    """#2015.8 — le registre dit l'entreprise cessée : `False` explicite, pas
    un silence qui laisserait croire à une activité normale."""
    result = await _run(pappers=_pappers(entreprise_cessee=True))

    assert result["company"]["is_active"] is False


async def test_company_country_and_is_active_are_none_without_pappers() -> None:
    """Sait dire NON : sans Pappers (registre gratuit seul), on ne connaît ni
    le pays ni le statut d'activité — `None`, jamais une valeur devinée."""
    result = await _run(pappers=None)

    assert result["company"]["country"] is None
    assert result["company"]["is_active"] is None


async def test_no_registry_match_returns_empty_but_no_error() -> None:
    """Un nom que ni le registre ni Pappers ne connaissent : réponse vide, pas
    d'erreur — taper un nom hors registre est un cas normal."""
    result = await _run(registry=None, pappers=None)
    assert result == {"matched": False, "company": None, "fields": {}, "candidates": [], "ambiguous": False}


async def test_registry_alone_is_enough_when_pappers_is_down() -> None:
    """Pappers en panne (ou sans clé) : le préremplissage continue sur le seul
    registre gratuit. Ville et secteur — les deux infos qui permettent de dire
    « oui c'est bien ma boîte » — doivent quand même remonter."""
    result = await _run(pappers=RuntimeError("pappers 401"))

    assert result["matched"] is True
    assert result["company"]["city"] == "PARIS"
    assert result["company"]["naf_label"] == "Conseil en systèmes et logiciels informatiques"

    # Et même quand le registre ne renvoie PAS de libellé (cas réel constaté sur
    # Kicklox), le code NAF est décodé pour que la carte affiche un secteur.
    without_label = await _run(
        registry={**REGISTRY, "nafLabel": None, "nafCode": "62.01Z"},
        pappers=RuntimeError("pappers 401"),
    )
    assert without_label["company"]["naf_label"] == "Programmation informatique"

    fields = result["fields"]
    assert fields["esn_name"]["value"] == "LINNAEUS (KICKLOX)"
    # Tranche INSEE "21" = 50-99 salariés → 30-80.
    assert fields["consultant_size"]["value"] == "30-80"
    assert "offer_domain" not in fields
    # Sans code postal Pappers, la zone géo se dérive du DÉPARTEMENT du registre.
    assert fields["geo_zones"]["value"] == ["Paris & Île-de-France"]
    assert fields["geo_zones"]["source"] == "registry"


async def test_no_geo_zone_when_pappers_down_and_department_unmapped() -> None:
    """Le fallback département n'invente rien non plus : un département hors des
    12 zones (Normandie) laisse le champ VIDE."""
    result = await _run(
        registry={**REGISTRY, "city": "ROUEN", "department": "76"},
        pappers=RuntimeError("pappers 401"),
    )
    assert "geo_zones" not in result["fields"]


async def test_no_geo_zone_when_department_missing_entirely() -> None:
    result = await _run(
        registry={**REGISTRY, "city": None, "department": None},
        pappers=RuntimeError("pappers 401"),
    )
    assert "geo_zones" not in result["fields"]
    assert result["company"]["city"] is None


async def test_missing_headcount_leaves_consultant_size_absent() -> None:
    result = await _run(
        registry={**REGISTRY, "headcountRange": "NN"},
        pappers=_pappers(effectif_min=None, effectif_max=None, effectif=None),
    )
    assert "consultant_size" not in result["fields"]


async def test_non_it_naf_leaves_offer_domain_absent() -> None:
    result = await _run(
        registry={**REGISTRY, "nafCode": "7022Z"},
        pappers=_pappers(code_naf="70.22Z", libelle_code_naf="Conseil pour les affaires"),
    )
    assert "offer_domain" not in result["fields"]


@pytest.mark.parametrize("naf", ["62.02A", "62.01Z", "63.11Z"])
async def test_it_naf_no_longer_preselects_a_domain(naf: str) -> None:
    """Un NAF informatique ne PRÉREMPLIT plus le domaine d'offre (D-DF2).

    Le préremplissage écrivait ``offer_domain = esn_it`` sur tout NAF 62.0x.
    Tant que l'onboarding posait la question, c'était une proposition VISIBLE,
    avec sa source et sa raison. Depuis que le portefeuille de domaines a
    remplacé la question, plus aucun écran ne montre cette valeur : elle est
    redevenue exactement la présélection silencieuse que D-DF2 a retirée — et
    elle repilote le prisme d'analyse quand le portefeuille est vide.

    Le NAF reste utilisé pour ce qu'il PROUVE : la cohérence d'activité
    (``is_esn_naf``, tri-état) et le départage des homonymes.
    """
    result = await _run(
        registry={**REGISTRY, "nafCode": naf},
        pappers=_pappers(code_naf=naf, libelle_code_naf="Conseil en systèmes et logiciels informatiques"),
    )

    assert "offer_domain" not in result["fields"]
    assert "offer_domains" not in result["fields"]
    # Ce que le NAF prouve, lui, est intact.
    assert result["company"]["is_esn_naf"] is True


async def test_unmapped_headquarters_leaves_geo_zone_absent() -> None:
    """Le code postal Pappers fait autorité : un siège en Normandie ne mappe sur
    aucune des 12 zones → champ VIDE. On ne se rabat surtout pas sur le
    département du registre, qui ne ferait que le contredire."""
    result = await _run(pappers=_pappers(siege={"ville": "Rouen", "code_postal": "76000"}))
    assert "geo_zones" not in result["fields"]
    assert result["company"]["city"] == "Rouen"


async def test_claude_failure_keeps_deterministic_fields() -> None:
    """Sans clé Anthropic (ou sur échec Claude), on renvoie quand même les
    champs déterministes — l'onboarding n'est jamais cassé."""
    result = await _run(claude=RuntimeError("ANTHROPIC_API_KEY environment variable is not set"))

    assert result["matched"] is True
    assert result["fields"]["esn_name"]["value"] == "Kicklox"
    assert "expertise_areas" not in result["fields"]
    assert "positioning" not in result["fields"]


async def test_llm_fields_are_merged_and_validated() -> None:
    claude_payload = {
        "fields": {
            "expertise_areas": {
                "value": ["Data & Intelligence Artificielle", "Valeur hors catalogue"],
                "confidence": "medium",
                "rationale": "objet social : ingénierie informatique",
            },
            "positioning": {"value": "Régie pure - on place des profils sur demande", "confidence": "low"},
        }
    }
    result = await _run(claude=claude_payload)

    fields = result["fields"]
    assert fields["expertise_areas"]["value"] == ["Data & Intelligence Artificielle"]
    assert fields["expertise_areas"]["source"] == "inference"
    assert fields["positioning"]["value"] == "Régie pure - on place des profils sur demande"
    # Les champs déterministes survivent au merge.
    assert fields["consultant_size"]["value"] == "30-80"


async def test_web_and_tech_stack_soft_fail_without_breaking() -> None:
    """Brave sans clé (liste vide) et tech_detect muet : le run aboutit quand
    même, simplement sans site web dans l'en-tête."""
    result = await _run(web=[], stack=[])
    assert result["matched"] is True
    assert result["company"]["website"] is None


async def test_website_and_stack_feed_the_llm_context() -> None:
    web = [{"url": "https://www.kicklox.com", "title": "Kicklox", "description": "Plateforme d'ingénierie"}]
    patches = _patch_sources(web=web, stack=["React", "AWS"])
    for p in patches:
        p.start()
    try:
        result = await esn_prefill.prefill_esn_profile("Kicklox", options=OPTIONS)
        user_prompt = esn_prefill.call_claude.await_args.args[1]
    finally:
        for p in patches:
            p.stop()

    assert result["company"]["website"] == "https://www.kicklox.com"
    assert "React" in user_prompt and "AWS" in user_prompt
    # Le catalogue fermé est bien transmis au modèle.
    assert "Data & Intelligence Artificielle" in user_prompt


async def test_prefill_forwards_the_caller_email_to_website_resolution() -> None:
    # #2640.1 — le préremplissage complet, e-mail inclus : le site retenu est
    # celui qui porte le domaine confirmé, pas le premier résultat nommé.
    web = [{"url": "https://www.kicklox-conseil.fr"}, {"url": "https://www.kicklox.com"}]
    patches = _patch_sources(web=web)
    for p in patches:
        p.start()
    try:
        result = await esn_prefill.prefill_esn_profile("Kicklox", email="dev@kicklox.com", options=OPTIONS)
    finally:
        for p in patches:
            p.stop()

    assert result["company"]["website"] == "https://www.kicklox.com"


async def test_blank_name_short_circuits_without_any_call() -> None:
    with patch.object(esn_prefill, "_resolve_registry", new=AsyncMock()) as registry:
        assert await esn_prefill.prefill_esn_profile("  ", options=OPTIONS) == {
            "matched": False,
            "company": None,
            "fields": {},
            "candidates": [],
            "ambiguous": False,
        }
    registry.assert_not_awaited()


async def test_registry_siren_anchors_pappers_when_brand_differs_from_legal_name() -> None:
    """Le cas le PLUS courant : la marque n'est pas la raison sociale (« Kicklox »
    → LINNAEUS). Le SIREN remonté par le registre gratuit doit ancrer Pappers —
    sinon la recherche par nom tombe sous le seuil de similarité et on perd
    ville, libellé NAF et code postal."""
    with (
        patch.object(esn_prefill, "_resolve_registry", new=AsyncMock(return_value=_resolution(REGISTRY))),
        patch.object(esn_prefill, "_fetch_pappers", new=AsyncMock(return_value=_pappers())) as pappers,
        patch.object(esn_prefill, "_fetch_web", new=AsyncMock(return_value=[])),
        patch.object(esn_prefill, "call_claude", new=AsyncMock(return_value=({}, None))),
    ):
        result = await esn_prefill.prefill_esn_profile("Kicklox", options=OPTIONS)

    assert pappers.await_args.args[1] == "810669754"
    assert result["company"]["city"] == "Paris"
    assert result["fields"]["geo_zones"]["value"] == ["Paris & Île-de-France"]


async def test_known_siren_goes_straight_to_get_company_without_name_search() -> None:
    """Un SIREN connu part DIRECTEMENT en ``get_company`` : la recherche par nom
    (et son ``PappersAmbiguousMatchError``) n'est jamais sollicitée."""
    profile = _pappers()
    with (
        patch("app.services.pappers.get_company", new=AsyncMock(return_value=profile)) as get_company,
        patch("app.services.pappers.search_company", new=AsyncMock()) as search,
    ):
        assert await esn_prefill._fetch_pappers("Kicklox", "810669754") is profile

    search.assert_not_awaited()
    assert get_company.await_args.args[0] == "810669754"
    # #2086.25 — DÉCISION Louis 17/09 : la cartographie part avec le MÊME appel
    # (parallélisé, `get_company`), pour que « groupe ou filiale » s'affiche
    # après confirmation sans multiplier les appels Pappers — un seul, sur le
    # SIREN déjà résolu, jamais un par candidat homonyme (`_resolve_registry_and_pappers`
    # n'appelle Pappers qu'une fois l'ambiguïté levée).
    assert get_company.await_args.kwargs["include_graph"] is True


async def test_name_search_is_only_a_last_resort_without_siren() -> None:
    profile = _pappers()
    with (
        patch("app.services.pappers.get_company", new=AsyncMock(return_value=profile)),
        patch("app.services.pappers.search_company", new=AsyncMock(return_value=profile)) as search,
    ):
        assert await esn_prefill._fetch_pappers("Kicklox", None) is profile
    search.assert_awaited_once()


async def test_failed_get_company_falls_back_to_name_search() -> None:
    """Un SIREN qui ne répond pas ne doit pas condamner le préremplissage."""
    profile = _pappers()
    with (
        patch(
            "app.services.pappers.get_company",
            new=AsyncMock(side_effect=[RuntimeError("pappers 404"), profile]),
        ),
        patch("app.services.pappers.search_company", new=AsyncMock(return_value=profile)) as search,
    ):
        assert await esn_prefill._fetch_pappers("Kicklox", "810669754") is profile
    search.assert_awaited_once()


# ── Résolution registre : ne jamais choisir en silence ───────────────────────

# Une ESN sans ambiguïté : nom exact, NAF informatique, effectif renseigné.
KICKLOX_ROW = {
    "source": "recherche-entreprises",
    "siren": "810669754",
    "name": "KICKLOX",
    "legalName": "LINNAEUS",
    "nafCode": "6202A",
    "nafLabel": "Conseil en systèmes et logiciels informatiques",
    "city": "PARIS",
    "department": "75",
    "headcountTranche": "21",
    "establishmentCount": 3,
    "creationDate": "2015-03-01",
    "isActive": True,
}


def _patch_registry_rows(rows: list[dict]):
    return patch.object(esn_prefill.recherche_entreprises, "search_companies", new=AsyncMock(return_value=rows))


async def test_registry_lookup_prefers_an_active_candidate_and_maps_city_and_naf() -> None:
    """``_resolve_registry`` passe par ``search_companies`` (ville / libellé NAF /
    département), pas ``fetch_company`` qui ne les mappe pas — et écarte les
    entités radiées."""
    rows = [
        {"source": "recherche-entreprises", "siren": "111111111", "name": "KICKLOX", "isActive": False},
        KICKLOX_ROW,
    ]
    with _patch_registry_rows(rows):
        resolution = await esn_prefill._resolve_registry("Kicklox")

    assert resolution.ambiguous is False
    registry = resolution.chosen
    assert registry["siren"] == "810669754"
    assert registry["city"] == "PARIS"
    assert registry["nafLabel"] == "Conseil en systèmes et logiciels informatiques"
    assert registry["department"] == "75"
    # La tranche INSEE est renommée depuis `headcountTranche`.
    assert registry["headcountRange"] == "21"


async def test_registry_lookup_returns_nothing_without_candidates() -> None:
    with _patch_registry_rows([]):
        resolution = await esn_prefill._resolve_registry("Société qui n'existe pas")

    assert resolution.chosen is None
    assert resolution.candidates == []
    assert resolution.ambiguous is False


async def test_an_obvious_single_candidate_is_resolved_without_a_list() -> None:
    with _patch_registry_rows([KICKLOX_ROW]):
        resolution = await esn_prefill._resolve_registry("Kicklox")

    assert resolution.ambiguous is False
    assert resolution.chosen["siren"] == "810669754"


async def test_several_plausible_namesakes_are_exposed_instead_of_being_picked() -> None:
    """Le cœur du correctif : deux entités actives au nom quasi identique, aucune
    ne se détache → on ne choisit PAS, on renvoie la liste."""
    rows = [
        {**KICKLOX_ROW, "siren": "810669754", "name": "NOVATEK", "legalName": "NOVATEK", "nafCode": "6202A"},
        {**KICKLOX_ROW, "siren": "810669755", "name": "NOVATEK", "legalName": "NOVATEK", "nafCode": "6201Z"},
    ]
    with _patch_registry_rows(rows):
        resolution = await esn_prefill._resolve_registry("Novatek")

    assert resolution.ambiguous is True
    assert resolution.chosen is None
    assert {c.siren for c in resolution.candidates} == {"810669754", "810669755"}


async def test_a_pinned_siren_short_circuits_the_disambiguation() -> None:
    """Une suggestion d'autocomplétion épingle le SIREN : l'utilisateur a DÉJÀ
    choisi, on ne le fait pas rechoisir — même quand des homonymes existent."""
    rows = [
        {**KICKLOX_ROW, "siren": "810669754", "name": "NOVATEK", "legalName": "NOVATEK"},
        {**KICKLOX_ROW, "siren": "810669755", "name": "NOVATEK", "legalName": "NOVATEK"},
    ]
    with _patch_registry_rows(rows) as search:
        resolution = await esn_prefill._resolve_registry("Novatek", "810669755")

    assert resolution.ambiguous is False
    assert resolution.chosen["siren"] == "810669755"
    # La recherche est ancrée sur le SIREN, pas sur le nom.
    assert search.await_args.args[0] == "810669755"


async def test_a_pinned_siren_absent_from_the_registry_never_falls_back_on_a_namesake() -> None:
    """Si le registre ne retrouve pas le SIREN épinglé, on ne se rabat surtout
    pas sur une autre entité — mieux vaut rien que la mauvaise."""
    with _patch_registry_rows([KICKLOX_ROW]):
        resolution = await esn_prefill._resolve_registry("Kicklox", "999999999")

    assert resolution.chosen is None
    assert resolution.ambiguous is False


async def test_the_parasite_entity_never_wins_end_to_end() -> None:
    """Cas mesuré « Alan » → un garage à Mougins en top-1 du registre. Le
    classement doit soit l'écarter, soit exposer la liste — jamais le choisir."""
    rows = [
        {
            "source": "recherche-entreprises",
            "siren": "400000002",
            "name": "GARAGE ALAN",
            "legalName": "GARAGE ALAN",
            "nafCode": "45.20A",
            "city": "MOUGINS",
            "department": "06",
            "headcountTranche": "01",
            "establishmentCount": 1,
            "isActive": True,
        },
        {
            "source": "recherche-entreprises",
            "siren": "815056807",
            "name": "ALAN",
            "legalName": "ALAN",
            "nafCode": "65.12Z",
            "city": "PARIS",
            "department": "75",
            "headcountTranche": "32",
            "establishmentCount": 3,
            "isActive": True,
        },
    ]
    with _patch_registry_rows(rows):
        resolution = await esn_prefill._resolve_registry("Alan")

    assert resolution.ambiguous is True
    assert resolution.chosen is None
    assert resolution.candidates[0].siren == "815056807"


async def test_an_ambiguous_resolution_prefills_nothing_at_all() -> None:
    """Ni Pappers, ni Claude, ni champ dérivé : tant que l'utilisateur n'a pas
    reconnu l'entité, on ne préremplit RIEN."""
    ambiguous = esn_prefill.RegistryResolution(
        ambiguous=True,
        candidates=[
            EsnCandidate(siren="810669754", name="NOVATEK", is_esn_naf=True, score=0.9),
            EsnCandidate(siren="810669755", name="NOVATEK", is_esn_naf=True, score=0.9),
        ],
    )
    patches = _patch_sources(registry=ambiguous)
    for p in patches:
        p.start()
    try:
        result = await esn_prefill.prefill_esn_profile("Novatek", options=OPTIONS)
        # Capturés AVANT l'arrêt des patches — sinon on interroge les vraies fonctions.
        claude, pappers = esn_prefill.call_claude, esn_prefill._fetch_pappers
    finally:
        for p in patches:
            p.stop()

    assert result["ambiguous"] is True
    assert result["matched"] is False
    assert result["company"] is None
    assert result["fields"] == {}
    assert [c["siren"] for c in result["candidates"]] == ["810669754", "810669755"]
    claude.assert_not_awaited()
    pappers.assert_not_awaited()


async def test_an_incoherent_naf_is_flagged_rather_than_hidden() -> None:
    """Le NAF du candidat retenu contredit l'activité d'une ESN : on préremplit
    ce qui est fondé, mais on le DIT (``is_esn_naf`` faux → alerte côté UI)."""
    result = await _run(
        registry={**REGISTRY, "nafCode": "68.20A", "nafLabel": "Location de terrains"},
        pappers=RuntimeError("pappers 401"),
    )

    assert result["company"]["is_esn_naf"] is False
    assert result["company"]["naf_code"] == "68.20A"
    # Et le domaine d'offre n'est PAS déduit d'un NAF non informatique.
    assert "offer_domain" not in result["fields"]


async def test_a_missing_naf_stays_silent_rather_than_alarming() -> None:
    """« On ne sait pas » n'est pas « ce n'est pas une ESN » : sans code NAF,
    ``is_esn_naf`` reste ``None`` et l'UI ne doit rien alerter."""
    result = await _run(
        registry={**REGISTRY, "nafCode": None, "nafLabel": None},
        pappers=RuntimeError("pappers 401"),
    )
    assert result["company"]["is_esn_naf"] is None


async def test_a_coherent_it_naf_is_confirmed() -> None:
    result = await _run(pappers=RuntimeError("pappers 401"))
    assert result["company"]["is_esn_naf"] is True


async def test_siren_is_forwarded_to_pappers_when_pinned() -> None:
    """Une suggestion d'autocomplétion épingle le SIREN : la résolution par nom
    (et son risque d'homonyme) doit être court-circuitée."""
    with (
        patch.object(esn_prefill, "_resolve_registry", new=AsyncMock(return_value=_resolution(REGISTRY))),
        patch.object(esn_prefill, "_fetch_pappers", new=AsyncMock(return_value=_pappers())) as pappers,
        patch.object(esn_prefill, "_fetch_web", new=AsyncMock(return_value=[])),
        patch.object(esn_prefill, "call_claude", new=AsyncMock(return_value=({}, None))),
    ):
        await esn_prefill.prefill_esn_profile("Kicklox", siren="812345678", options=OPTIONS)

    assert pappers.await_args.args[1] == "812345678"


# ── Endpoint ─────────────────────────────────────────────────────────────────


def test_prefill_endpoint_returns_contract_shape(client: TestClient) -> None:
    payload = {
        "matched": True,
        "company": {
            "name": "Kicklox",
            "siren": "812345678",
            "city": "Paris",
            "naf_label": "Conseil en systèmes et logiciels informatiques",
            "website": "https://www.kicklox.com",
            "headcount_label": "50 à 99 salariés",
        },
        "fields": {
            "esn_name": {"value": "Kicklox", "confidence": "high", "source": "registry"},
            "expertise_areas": {
                "value": ["Data & Intelligence Artificielle"],
                "confidence": "medium",
                "source": "inference",
                "rationale": "objet social",
            },
        },
    }
    with patch("app.routers.companies.prefill_esn_profile", new_callable=AsyncMock, return_value=payload):
        res = client.post("/companies/prefill", json={"name": "Kicklox", "options": OPTIONS})

    assert res.status_code == 200
    body = res.json()
    assert body["matched"] is True
    assert body["company"]["siren"] == "812345678"
    # `rationale` est optionnel côté contrat TS (`.optional()` refuse `null`) :
    # la clé est OMISE quand il n'y en a pas, jamais émise à null. `as_of`
    # (#2028.8) est `.nullable().default(null)` : la clé est TOUJOURS émise.
    assert body["fields"]["esn_name"] == {
        "value": "Kicklox",
        "confidence": "high",
        "source": "registry",
        "as_of": None,
    }
    assert body["fields"]["expertise_areas"]["value"] == ["Data & Intelligence Artificielle"]
    assert body["fields"]["expertise_areas"]["rationale"] == "objet social"


def test_prefill_endpoint_soft_fails_instead_of_5xx(client: TestClient) -> None:
    """Une erreur inattendue rend une réponse vide, pas un 502 : l'onboarding
    doit toujours pouvoir continuer à la main."""
    with patch(
        "app.routers.companies.prefill_esn_profile", new_callable=AsyncMock, side_effect=RuntimeError("boom")
    ):
        res = client.post("/companies/prefill", json={"name": "Kicklox", "options": OPTIONS})

    assert res.status_code == 200
    assert res.json() == {"matched": False, "company": None, "fields": {}, "candidates": [], "ambiguous": False}


def test_prefill_endpoint_exposes_the_candidate_list_when_ambiguous(client: TestClient) -> None:
    """La liste de désambiguïsation doit traverser l'endpoint telle quelle — avec
    les faits discriminants, et sans aucun champ prérempli."""
    payload = {
        "matched": False,
        "company": None,
        "fields": {},
        "ambiguous": True,
        "candidates": [
            {
                "siren": "815056807",
                "name": "ALAN",
                "city": "PARIS",
                "department": "75",
                "naf_code": "65.12Z",
                "naf_label": "Autres assurances",
                "is_esn_naf": False,
                "headcount_label": "250 à 499 salariés",
                "establishment_count": 3,
                "creation_date": "2016-01-04",
                "score": 0.76,
            },
            {"siren": "400000002", "name": "GARAGE ALAN", "city": "MOUGINS", "score": 0.54},
        ],
    }
    with patch("app.routers.companies.prefill_esn_profile", new_callable=AsyncMock, return_value=payload):
        res = client.post("/companies/prefill", json={"name": "Alan", "options": OPTIONS})

    assert res.status_code == 200
    body = res.json()
    assert body["ambiguous"] is True
    assert body["matched"] is False
    assert body["fields"] == {}
    assert [c["siren"] for c in body["candidates"]] == ["815056807", "400000002"]
    assert body["candidates"][0]["is_esn_naf"] is False
    assert body["candidates"][0]["headcount_label"] == "250 à 499 salariés"
    # Les faits qu'aucune source ne donne restent nuls — jamais comblés.
    assert body["candidates"][1]["naf_code"] is None
    assert body["candidates"][1]["is_esn_naf"] is None


def test_prefill_endpoint_rejects_too_short_a_name(client: TestClient) -> None:
    res = client.post("/companies/prefill", json={"name": "K"})
    assert res.status_code == 422


def test_prefill_endpoint_forwards_name_siren_and_options(client: TestClient) -> None:
    with patch(
        "app.routers.companies.prefill_esn_profile",
        new_callable=AsyncMock,
        return_value={"matched": False, "company": None, "fields": {}},
    ) as prefill:
        client.post("/companies/prefill", json={"name": "Kicklox", "siren": "812345678", "options": OPTIONS})

    assert prefill.await_args.args[0] == "Kicklox"
    assert prefill.await_args.kwargs["siren"] == "812345678"
    assert prefill.await_args.kwargs["options"]["geo_zones"] == OPTIONS["geo_zones"]
