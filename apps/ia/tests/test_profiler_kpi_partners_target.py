"""#2067.2 — la cible partenaires suit l'archétype.

LE POINT, ET L'ARBITRAGE
-------------------------
Le moteur produisait déjà deux cibles mensuelles (`accounts_per_month`,
`rdv_per_month`) ; pour les partenaires, rien. `KpiTargets` en gagne une
TROISIÈME, `partners_per_month` — le nombre de partenaires à TRAVAILLER dans
le mois (solliciter, relancer, co-construire une offre), jamais un nombre de
partenaires à SIGNER : le moteur ne promet pas la signature d'un tiers.

Arbitrage (décision Louis du 20/09/2026, QCM) : la cible est CALCULÉE par le
moteur, pas déclarée par l'utilisateur — comme ses deux sœurs, qui sortent de
la même sortie structurée. Une cible déclarée ferait vivre le même réglage à
deux endroits (GA-26). Le questionnaire fournit la BASE actuelle
(`partners_regular_count`, `partners_occasional_count`) : c'est l'ANCRAGE du
calcul, jamais la cible.

CE QUE CE FICHIER GARDE
------------------------
1. Les plages par archétype vivent à UN seul endroit
   (`PARTNERS_PER_MONTH_BY_ARCHETYPE`) et sont RENDUES dans la description
   envoyée au modèle — une plage écrite deux fois diverge en trois semaines.
2. « On ne sait pas » produit une ABSENCE, jamais un zéro : le champ défaut à
   `None`, et un `0` est REFUSÉ par le modèle (gardes GA-18 / GA-19, doctrine
   « non mesuré n'est jamais 0 »).
3. La base déclarée atteint le prompt : sans elle, le modèle ne peut ancrer la
   cible que sur l'archétype, et #2067.2 demandait qu'elle compte.

Trois preuves, comme ses voisines : la garde LIT quelque chose, elle SAIT
DIRE NON, elle n'attrape pas ce qu'elle ne vise pas.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.profile_context import (
    PARTNERS_PER_MONTH_BY_ARCHETYPE,
    EsnArchetype,
    KpiTargets,
)
from app.prompts.bellum_profiler import build_profiler_user_prompt

_TEMPS_1 = {
    "esn_name": "DataCraft",
    "consultant_size": "1-10",
    "sales_team_size": "Je suis seul",
    "expertise_areas": ["Data", "Cloud"],
    "positioning": "Expertise de niche",
    "staffing_model": "Régie",
    "target_sectors": ["Banque"],
    "target_company_types": ["PME"],
    "geo_zones": ["National"],
    "main_sales_pain": "Gérer mon temps",
}

#: La BASE partenaires déclarée — les deux bandes du catalogue
#: `PARTNER_COUNT_BANDS` (`profile-questionnaire.ts`), valeurs reconnaissables.
_BASE_PARTENAIRES: dict[str, str] = {
    "partners_regular_count": "4-5",
    "partners_occasional_count": "6-10",
}


def _cibles(**extra: object) -> dict[str, object]:
    return {"accounts_per_month": 12, "rdv_per_month": 4, "conversion_rate_target": "15-25%", **extra}


# ─────────────────────────────────────────────────────────────────────────
# PREUVE 2 — la garde LIT quelque chose.
# ─────────────────────────────────────────────────────────────────────────


def test_chaque_archetype_a_sa_plage_aucun_oubli() -> None:
    assert set(PARTNERS_PER_MONTH_BY_ARCHETYPE) == {a.value for a in EsnArchetype}


def test_aucune_plage_ne_commence_a_zero() -> None:
    """Une cible de 0 partenaire n'est pas une cible, c'est une absence."""

    fautives = [
        (archetype, plage)
        for archetype, plage in PARTNERS_PER_MONTH_BY_ARCHETYPE.items()
        if plage[0] < 1 or plage[1] < plage[0]
    ]
    assert fautives == [], f"plages incohérentes ou à plancher 0 : {fautives}"


def test_les_plages_atteignent_la_description_envoyee_au_modele() -> None:
    """GA-26 — les plages vivent à UN endroit : la description que le modèle
    lit est RENDUE depuis la table, elle ne la recopie pas."""

    description = KpiTargets.model_fields["partners_per_month"].description or ""
    absentes = [
        f"{archetype} {basse}-{haute}"
        for archetype, (basse, haute) in PARTNERS_PER_MONTH_BY_ARCHETYPE.items()
        if f"{archetype}: {basse}-{haute}" not in description
    ]
    assert absentes == [], f"plages absentes de la description : {absentes}"


# ─────────────────────────────────────────────────────────────────────────
# « ON NE SAIT PAS » — une ABSENCE, jamais un zéro (GA-18 / GA-19).
# ─────────────────────────────────────────────────────────────────────────


def test_la_cible_partenaires_est_absente_par_defaut() -> None:
    assert KpiTargets(**_cibles()).partners_per_month is None


def test_la_cible_partenaires_accepte_un_nombre() -> None:
    assert KpiTargets(**_cibles(partners_per_month=3)).partners_per_month == 3


def test_la_cible_partenaires_refuse_zero() -> None:
    with pytest.raises(ValidationError) as leve:
        KpiTargets(**_cibles(partners_per_month=0))
    assert "jamais 0" in str(leve.value)


def test_la_cible_partenaires_refuse_un_nombre_negatif() -> None:
    with pytest.raises(ValidationError):
        KpiTargets(**_cibles(partners_per_month=-2))


def test_la_description_dit_quand_omettre_le_champ() -> None:
    """La règle « pas de porte partenaire → champ absent » doit être ÉCRITE
    là où le modèle la lit, pas seulement dans un commentaire voisin."""

    description = (KpiTargets.model_fields["partners_per_month"].description or "").lower()
    assert "go_to_market_channels" in description
    assert "partners_regular_count" in description
    assert "je ne sais pas" in description


def test_la_description_ne_commande_aucune_probabilite() -> None:
    """Doctrine « aucune probabilité » — une cible est un nombre, pas un pari."""

    description = (KpiTargets.model_fields["partners_per_month"].description or "").lower()
    for mot in ("probabilité", "chance", "prévisionnel", "pondéré"):
        assert mot not in description, f"la description commande un pari : {mot!r}"


# ─────────────────────────────────────────────────────────────────────────
# LA BASE DÉCLARÉE ATTEINT LE PROMPT.
# ─────────────────────────────────────────────────────────────────────────


def test_la_base_partenaires_declaree_atteint_le_prompt() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, **_BASE_PARTENAIRES})

    absents = [cle for cle in _BASE_PARTENAIRES if cle not in prompt]
    assert absents == [], f"clés qui n'atteignent pas le prompt : {absents}"
    manquantes = [valeur for valeur in _BASE_PARTENAIRES.values() if valeur not in prompt]
    assert manquantes == [], f"valeurs perdues avant le modèle : {manquantes}"


# ─────────────────────────────────────────────────────────────────────────
# PREUVE 3 — la garde n'attrape pas ce qu'elle ne vise pas.
# ─────────────────────────────────────────────────────────────────────────


def test_la_base_partenaires_survit_au_modele_dentree() -> None:
    """Le piège de #2007, rejoué : `OnboardingAnswers` ignore EN SILENCE toute
    clé inconnue (`extra="ignore"`). Une clé que l'API envoie mais que ce
    modèle ne déclare pas n'atteint jamais le prompt — code juste que personne
    n'appelle. Ce test lit la sortie du modèle d'entrée, pas le fichier."""

    from app.routers.profiler import OnboardingAnswers

    recu = OnboardingAnswers(**{**_TEMPS_1, "user_id": "u-1", **_BASE_PARTENAIRES})
    assert recu.partners_regular_count == "4-5"
    assert recu.partners_occasional_count == "6-10"

    prompt = build_profiler_user_prompt(recu.model_dump())
    assert "4-5" in prompt and "6-10" in prompt


def test_un_payload_sans_partenaires_ne_mentionne_aucune_base() -> None:
    prompt = build_profiler_user_prompt(_TEMPS_1)

    fuites = [cle for cle in _BASE_PARTENAIRES if cle in prompt]
    assert fuites == [], f"clés annoncées alors qu'absentes du payload : {fuites}"


def test_les_deux_soeurs_restent_requises() -> None:
    """Le champ est ADDITIF : il ne relâche pas le contrat des voisines."""

    with pytest.raises(ValidationError):
        KpiTargets(rdv_per_month=4, conversion_rate_target="15-25%")  # type: ignore[call-arg]


# ─────────────────────────────────────────────────────────────────────────
# PREUVE 1 — la garde SAIT DIRE NON.
# ─────────────────────────────────────────────────────────────────────────


def test_la_garde_sait_dire_non_sur_une_plage_perdue() -> None:
    """Une description amputée d'un archétype DOIT rougir le test du dessus."""

    description = KpiTargets.model_fields["partners_per_month"].description or ""
    ampute = description.replace("scaleUp:", "scaleUpX:")
    basse, haute = PARTNERS_PER_MONTH_BY_ARCHETYPE["scaleUp"]
    assert f"scaleUp: {basse}-{haute}" not in ampute


def test_la_garde_sait_dire_non_sur_une_base_non_rendue() -> None:
    sans_reguliers = {**_TEMPS_1, **_BASE_PARTENAIRES}
    sans_reguliers.pop("partners_regular_count")
    prompt = build_profiler_user_prompt(sans_reguliers)

    assert "partners_regular_count" not in prompt
    assert "4-5" not in prompt
