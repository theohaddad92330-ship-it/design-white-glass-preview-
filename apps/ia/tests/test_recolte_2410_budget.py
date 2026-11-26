"""#4517.13 / #4519.21 / #4419.24 / #4419.25 (lot récolte 24/10) — le budget et les plafonds à la mesure du marché.

Mesure prod 24/10 : POST /discover/registry à 21,6-22,8 s pour un budget de 20 s ; « 5 employeurs restent à vérifier »
(la résolution registre n'avait que la moitié de 20 s, au débit public de 2 req/s). Le proxy coupe à 45 s
(``DISCOVER_CALL_OPTS``) : le budget monte à 32 s (13 s de marge pour l'API et le transport), et la part du registre
passe aux deux tiers — la liste passe avant l'angle (un angle absent ne s'excuse pas, #4519.22).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.routers import discover as router
from app.services import discover_skill_offers as skill

# #4517.2 (Louis 31/10) — revient sur les 45 s / 32 s de #4517.13 : couperet ~60 s, budget ~55 s, UN seul chargement.
PROXY_TIMEOUT_S = 60.0


def test_le_budget_tient_sous_le_proxy_avec_une_marge_mesuree() -> None:
    assert router.DISCOVER_TIME_BUDGET_S + 5.0 <= PROXY_TIMEOUT_S
    # Plus large que les 20 s d'avant : la récolte la plus large possible dans le temps permis.
    assert router.DISCOVER_TIME_BUDGET_S >= 30.0


def test_la_resolution_des_employeurs_a_au_moins_vingt_secondes() -> None:
    registry_share = router.DISCOVER_TIME_BUDGET_S * (1 - router.DISCOVER_MODEL_SHARE)
    # Au débit public (2 req/s), 20 s = ~40 résolutions : de quoi rendre « au moins une vingtaine » de comptes.
    assert registry_share >= 20.0


def test_les_plafonds_de_recolte_sont_releves() -> None:
    assert skill.SKILL_ADZUNA_MAX_PAGES >= 3
    assert skill.SKILL_FT_NATIONAL_PAGES >= 5
    assert skill._CACHE_SEARCH_LIMIT >= 500
    assert skill.SKILL_MAX_TERMS >= 3
    assert skill._RESOLVE_CONCURRENCY >= 8


def _offer(days_ago: int, source: str) -> dict:
    return {
        "employer": "DECATHLON",
        "title": "Développeur Vue.js",
        "date": (datetime.now(UTC) - timedelta(days=days_ago)).date().isoformat(),
        "source": source,
        "department": "59",
    }


def _reason(offer: dict) -> str | None:
    cutoff = (datetime.now(UTC) - timedelta(days=skill.SKILL_OFFER_MAX_AGE_DAYS)).date()
    return skill._reject_reason(offer, "Vue", frozenset({"59"}), cutoff, None, False)


def test_un_besoin_ancien_du_cache_entre_comme_preuve_datee() -> None:
    # #4419.25 — la donnée déjà accumulée (cache commun, au-delà de 90 j) entre, avec SA date.
    assert _reason(_offer(200, "cache")) is None


def test_une_offre_fraiche_d_une_source_reste_bornee_a_90_jours() -> None:
    # La garde dit NON : une offre de plus de 90 j lue en direct reste « tooOld » ; le cache au-delà d'un an aussi.
    assert _reason(_offer(120, "adzuna")) == "tooOld"
    assert _reason(_offer(400, "cache")) == "tooOld"


def test_la_preuve_porte_sa_date() -> None:
    evidence = skill._evidence([{**_offer(200, "cache"), "skill": "Vue"}])
    assert evidence["latestOffer"]["date"] == _offer(200, "cache")["date"]
    assert evidence["offers"][0]["date"] == _offer(200, "cache")["date"]
