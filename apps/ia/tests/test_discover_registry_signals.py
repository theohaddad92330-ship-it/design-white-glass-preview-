"""`POST /discover/registry` — les signaux DATÉS des premières lignes rendues
(décision Louis, 18/09/2026, lot « Découvrir dit ce que les entreprises FONT »).

Mesuré : `discover.py` posait ``signals: list[dict] = []`` pour CHAQUE candidat
du chemin registre — « ESN à Toulouse » rendait 24 entreprises et ZÉRO signal,
précisément le moment où le commercial veut savoir laquelle recrute ou a gagné
un marché (les signaux datés vivaient uniquement sur l'autre porte d'entrée,
``/discover/signals``).

Le correctif borne le coût AVANT tout : les ``SIGNALS_CANDIDATE_LIMIT``
premiers candidats du classement DÉTERMINISTE (DECOUVRIR-COLLECTE, 13/10 : toute
la page affichée, deux pages au plus), une recherche par
source (BOAMP, France Travail, BODACC — aucune n'accepte plusieurs entreprises
en un appel), et JAMAIS bloquant pour la liste elle-même : les tâches
démarrent avant l'appel modèle (angle) et tournent EN PARALLÈLE de lui, bornées
par ``SIGNALS_TIME_BUDGET_S``.

Un candidat non ciblé (hors des N premiers, ou dont la recherche n'a pas eu le
temps de finir) porte ``signalsSearched: False`` — « non mesuré », jamais
« aucun signal », et jamais un tableau vide muet.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.routers import discover as discover_router
from app.services.company_filters import DegradeReason

# #3901.p — Découvrir ne retient une offre que si elle recoupe un métier de l'ESN (déclaré ou déduit).
SCOPE_PROFILE = {"placedRoles": ["développeur", "ingénieur", "architecte", "data", "devops", "offre", "chef de projet"]}



def _row(index: int, **over: Any) -> dict:
    return {
        "name": f"SOCIETE {index:03d} SAS",
        "siren": f"{100000000 + index}",
        "nafCode": "62.01Z",
        "sector": "Programmation informatique",
        "city": "TOULOUSE",
        "department": "31",
        "headcountRange": "50 à 99 salariés",
        "headcountTranche": "21",
        "legalCategory": "5710",
        **over,
    }


@pytest.fixture
def five_candidates(monkeypatch):
    rows = [_row(i) for i in range(5)]

    async def gouv(filters, limit, degraded=None):
        return rows

    async def pappers_unreached(filters, limit, degraded=None):
        raise AssertionError("Pappers ne passe pas devant le chemin gouv.fr")

    monkeypatch.setattr(discover_router, "_registry_search", pappers_unreached)
    monkeypatch.setattr(discover_router, "_fallback_search", gouv)
    # Pas d'angle dans ces tests : un modèle instantané qui ne bloque rien.
    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(return_value=({"angles": []}, None)))
    # DECOUVRIR-COLLECTE — le second registre d'offres, muet par défaut ici.
    return rows


@pytest.fixture
def eight_candidates(monkeypatch):
    """#2615.1 — ``SIGNALS_CANDIDATE_LIMIT`` est monté à ``PRIORITY_ACCOUNTS_
    COUNT`` (5, `apps/web/src/features/discover/lib/discover-priority.ts`) :
    « Comptes prioritaires » promet une raison datée pour ses CINQ comptes,
    pas trois. Huit lignes pour que la coupe reste PROUVÉE (candidats 6 à 8
    non mesurés) même à cette limite relevée."""
    rows = [_row(i) for i in range(8)]

    async def gouv(filters, limit, degraded=None):
        return rows

    async def pappers_unreached(filters, limit, degraded=None):
        raise AssertionError("Pappers ne passe pas devant le chemin gouv.fr")

    monkeypatch.setattr(discover_router, "_registry_search", pappers_unreached)
    monkeypatch.setattr(discover_router, "_fallback_search", gouv)
    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(return_value=({"angles": []}, None)))
    return rows


def test_only_the_first_n_candidates_are_searched_for_signals(client: TestClient, eight_candidates, monkeypatch):
    """#2615.1 → DECOUVRIR-COLLECTE (Louis 13/10) — la borne des cinq premiers
    est levée : les 8 lignes rendues sont TOUTES interrogées. Au-delà de
    ``SIGNALS_CANDIDATE_LIMIT`` (deux pages web), une ligne reste NON MESURÉE —
    jamais « aucun signal » (prouvé en abaissant la borne)."""
    called_with: list[str] = []

    async def tenders(name, **kw):
        called_with.append(name)
        return []

    monkeypatch.setattr(discover_router, "public_tenders", tenders)
    monkeypatch.setattr(discover_router, "it_job_signals", AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "legal_signals", AsyncMock(return_value=[]))

    candidates = _call(client).json()["candidates"]
    assert len(candidates) == 8
    assert len(called_with) == 8
    assert all(c["signalsSearched"] for c in candidates)

    called_with.clear()
    monkeypatch.setattr(discover_router, "SIGNALS_CANDIDATE_LIMIT", 5)
    candidates = _call(client).json()["candidates"]
    assert len(called_with) == 5
    unmeasured = [c for c in candidates if not c["signalsSearched"]]
    assert len(unmeasured) == 3
    for c in unmeasured:
        assert c["signals"] == []


def test_signals_shaped_and_nature_named(client: TestClient, five_candidates, monkeypatch):
    """Chaque source réelle est mappée sur le contrat `DiscoverSignal`
    (type/label/date/detail) — la NATURE se nomme, jamais le fournisseur."""
    monkeypatch.setattr(
        discover_router,
        "public_tenders",
        AsyncMock(
            return_value=[
                {
                    "title": "Développement plateforme SI",
                    "buyer": "SOCIETE 000 SAS",
                    "publishedDate": "2026-09-10",
                    "deadline": "2026-10-01",
                }
            ]
        ),
    )
    monkeypatch.setattr(
        discover_router,
        "it_job_signals",
        AsyncMock(
            return_value=[
                {"title": "Développeur Python", "location": "Toulouse", "date": "2026-09-05", "contractType": "CDI"}
            ]
        ),
    )
    monkeypatch.setattr(
        discover_router,
        "legal_signals",
        # #4068 (Louis 13/10) — un changement de dirigeant SANS décideur nommé est hors carte ;
        # celui qui nomme le décideur reste un signal (fort).
        AsyncMock(
            return_value=[
                {
                    "date": "2026-08-01",
                    "type": "Changement de dirigeant",
                    "precision": "nomination de M. Jean Martin en qualité de président",
                    "tribunal": "Toulouse",
                    "label": "X",
                }
            ]
        ),
    )

    resp = _call(client)
    top = resp.json()["candidates"][0]
    assert top["signalsSearched"] is True
    types = {s["type"] for s in top["signals"]}
    assert types == {"tender", "hiring", "legal"}
    for signal in top["signals"]:
        assert signal["date"]  # #2489 -- un signal sans date n'en est pas un


def test_3408_hiring_signal_names_its_technologies_so_the_card_can_advise_a_scope(
    client: TestClient, five_candidates, monkeypatch
):
    """#3408 — prod 01/10 : « Périmètre conseillé » 0/25 sur /discover. Le
    périmètre lit `signal.technologies`, que seule la route /discover/signals
    posait ; les signaux de la liste (`_hiring_signal`) n'en portaient jamais.
    Une offre qui NOMME une techno la rend ; un intitulé générique n'en rend
    aucune (jamais une pile devinée)."""
    monkeypatch.setattr(discover_router, "public_tenders", AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "legal_signals", AsyncMock(return_value=[]))
    monkeypatch.setattr(
        discover_router,
        "it_job_signals",
        AsyncMock(
            return_value=[
                {"title": "Développeur Python", "location": "Toulouse", "date": "2026-09-05", "contractType": "CDI"},
                {"title": "Chef de projet", "location": "Toulouse", "date": "2026-09-04", "contractType": "CDI"},
            ]
        ),
    )

    top = _call(client).json()["candidates"][0]
    by_label = {s["label"]: s for s in top["signals"]}
    assert by_label["Développeur Python"]["technologies"] == ["Python"]
    assert "technologies" not in by_label["Chef de projet"]


def test_3408_hiring_signal_reads_the_skills_the_offer_lists(client: TestClient, five_candidates, monkeypatch):
    """#3408 — recette prod 02/10 : « Périmètre conseillé » 0 occurrence. La source
    existait mais n'était pas lue : France Travail LISTE les compétences de chaque
    offre (`skills[]`), et seuls l'intitulé et le détail (type de contrat · lieu)
    passaient par `derive_technologies`. Une offre « Ingénieur data » dont les
    compétences listées nomment Python et AWS rend maintenant ces deux technos ;
    sans compétence listée, rien (jamais une pile devinée)."""
    monkeypatch.setattr(discover_router, "public_tenders", AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "legal_signals", AsyncMock(return_value=[]))
    monkeypatch.setattr(
        discover_router,
        "it_job_signals",
        AsyncMock(
            return_value=[
                {
                    "title": "Ingénieur data",
                    "location": "Toulouse",
                    "date": "2026-09-05",
                    "contractType": "CDI",
                    "skills": ["Python", "Amazon Web Services (AWS)"],
                },
                {"title": "Chef de projet", "location": "Toulouse", "date": "2026-09-04", "contractType": "CDI", "skills": []},
            ]
        ),
    )

    top = _call(client).json()["candidates"][0]
    by_label = {s["label"]: s for s in top["signals"]}
    assert "Python" in by_label["Ingénieur data"]["technologies"]
    assert "technologies" not in by_label["Chef de projet"]


def test_score_is_recomputed_once_signals_are_known(client: TestClient, five_candidates, monkeypatch):
    """#3089 — mesuré en bêta (Apricot Labs, 24/09/2026) : un candidat affichait
    ses signaux datés (recrutement, marché public...) ET, dans le même objet,
    un score qui les ignorait — ``score_candidate`` est appelé UNE fois, avant
    que ``_finish_signal_tasks`` ne pose ``candidate["signals"]``, jamais rejoué
    ensuite. Le bloc « signaux » restait donc éternellement dans
    ``scoreUnmeasured``, même quand ``signals`` n'était plus vide juste à côté —
    exactement la lecture qu'interdisent GA-18/GA-19 : une donnée disponible
    qui se lit « non mesurée »."""
    monkeypatch.setattr(discover_router, "public_tenders", AsyncMock(return_value=[]))
    monkeypatch.setattr(
        discover_router,
        "it_job_signals",
        AsyncMock(
            return_value=[
                {"title": "Développeur Python", "location": "Toulouse", "date": "2026-09-05", "contractType": "CDI"}
            ]
        ),
    )
    monkeypatch.setattr(discover_router, "legal_signals", AsyncMock(return_value=[]))

    resp = _call(client)
    top = resp.json()["candidates"][0]
    assert top["signalsSearched"] is True
    assert top["signals"] != []
    assert "signals" not in top["scoreUnmeasured"]
    assert any(factor.get("label_key") == "factors.signalsDated" for factor in top["scoreFactors"])


def test_a_failing_source_degrades_without_dropping_the_others(client: TestClient, five_candidates, monkeypatch):
    """BOAMP en panne : le candidat garde ses signaux France Travail/BODACC, et
    la panne est DITE dans `degraded[]` — jamais un silence, jamais 0 signal."""

    async def boom(*_a: Any, **_kw: Any) -> list[dict]:
        raise RuntimeError("boamp down")

    monkeypatch.setattr(discover_router, "public_tenders", boom)
    monkeypatch.setattr(
        discover_router,
        "it_job_signals",
        AsyncMock(return_value=[{"title": "Développeur", "location": "Toulouse", "date": "2026-09-05"}]),
    )
    monkeypatch.setattr(discover_router, "legal_signals", AsyncMock(return_value=[]))

    resp = _call(client)
    body = resp.json()
    top = body["candidates"][0]
    assert top["signalsSearched"] is True
    assert [s["type"] for s in top["signals"]] == ["hiring"]
    assert any(d.get("source") == "boamp" for d in body["degraded"])


def test_never_blocks_the_list_past_its_own_time_budget(client: TestClient, five_candidates, monkeypatch):
    """Une source qui ne répond JAMAIS dans le budget dédié ne fait pas
    échouer la recherche : la liste revient, les candidats visés restent NON
    MESURÉS, et le dépassement est DIT."""

    async def hangs(*_a: Any, **_kw: Any) -> list[dict]:
        await asyncio.sleep(10_000)
        return []

    monkeypatch.setattr(discover_router, "public_tenders", hangs)
    monkeypatch.setattr(discover_router, "it_job_signals", AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "legal_signals", AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "SIGNALS_TIME_BUDGET_S", 0.05)

    resp = _call(client)
    body = resp.json()
    assert len(body["candidates"]) == 5
    top = body["candidates"][0]
    assert top["signalsSearched"] is False
    assert top["signals"] == []
    assert any(d.get("source") == "discover-signals" and d.get("reason") == DegradeReason.TIME_BUDGET for d in body["degraded"])


def test_signals_respect_the_global_deadline_not_just_their_own_budget(
    client: TestClient, five_candidates, monkeypatch
):
    """#2496 bis — les tâches de signaux sont bornées au PLUS COURT de
    ``SIGNALS_TIME_BUDGET_S`` ET de ce qu'il reste du budget GLOBAL
    (``deadline``) : un budget global déjà épuisé par la chaîne registre
    n'accorde pas ``SIGNALS_TIME_BUDGET_S`` de délai EN PLUS. Sinon les
    signaux vivent hors du budget que ``/discover/registry`` est censée
    respecter comme n'importe quelle autre étape de la chaîne séquentielle
    (mesuré : médiane 0,449 s contre 0,058 s attendus)."""

    async def hangs(*_a: Any, **_kw: Any) -> list[dict]:
        await asyncio.sleep(10_000)
        return []

    monkeypatch.setattr(discover_router, "public_tenders", hangs)
    monkeypatch.setattr(discover_router, "it_job_signals", AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "legal_signals", AsyncMock(return_value=[]))
    # Budget global quasi nul : à l'heure où `_finish_signal_tasks` s'exécute,
    # `deadline` est déjà dépassé. `SIGNALS_TIME_BUDGET_S` reste à son défaut
    # (3.0s) pour prouver que c'est bien `deadline`, pas ce budget dédié, qui
    # borne l'attente.
    monkeypatch.setattr(discover_router, "DISCOVER_TIME_BUDGET_S", 0.05)

    started = time.monotonic()
    resp = _call(client)
    elapsed = time.monotonic() - started

    body = resp.json()
    assert elapsed < 1.0, f"{elapsed:.3f}s -- les signaux ont attendu SIGNALS_TIME_BUDGET_S au lieu de `deadline`"
    top = body["candidates"][0]
    assert top["signalsSearched"] is False
    assert top["signals"] == []
    assert any(
        d.get("source") == "discover-signals" and d.get("reason") == DegradeReason.TIME_BUDGET
        for d in body["degraded"]
    )


def test_2291_2_contract_model_is_observed_on_the_rows_already_fetched(
    client: TestClient, five_candidates, monkeypatch
):
    """#2291.2 — le modèle de contrat de la cible s'OBSERVE sur les lignes que
    la recherche de signaux a déjà en main : ZÉRO appel de plus (toujours un
    appel par source et par candidat ciblé). Cherché et attribuable → une
    observation ; cherché sans rien d'attribuable → ``None`` (« non
    observé ») ; jamais cherché → clé ABSENTE."""
    job_calls: list[str] = []
    tender_calls: list[str] = []

    async def jobs(name, **_kw):
        job_calls.append(name)
        return [
            {"title": "Dev", "date": "2026-09-05", "company": name, "contractCode": "LIB", "contractType": "x"},
            {"title": "Dev", "date": "2026-08-05", "company": name, "contractCode": "CDI", "contractType": "y"},
        ]

    async def tenders(name, **_kw):
        tender_calls.append(name)
        return [{"title": "Assistance technique du SI", "buyer": name, "publishedDate": "2026-09-10"}]

    monkeypatch.setattr(discover_router, "it_job_signals", jobs)
    monkeypatch.setattr(discover_router, "public_tenders", tenders)
    monkeypatch.setattr(discover_router, "legal_signals", AsyncMock(return_value=[]))

    candidates = _call(client).json()["candidates"]
    assert len(job_calls) == len(candidates)
    assert len(tender_calls) == len(candidates)
    searched = [c for c in candidates if c["signalsSearched"]]
    assert len(searched) == len(candidates)
    for candidate in searched:
        model = candidate["contractModel"]
        # #4074 revient sur #2291.3 (18/09), délibérément — décision Louis 12/10 : aucune source ne se nomme.
        assert model["jobOffers"]["source"] == "Offres d'emploi publiques"
        assert model["jobOffers"]["total"] == 2
        assert model["jobOffers"]["counts"]["freelance"] == 1
        assert model["publicContracts"]["regie"] == 1
    for candidate in candidates:
        if not candidate["signalsSearched"]:
            assert "contractModel" not in candidate


def test_2291_2_nothing_attributable_is_not_observed(client: TestClient, five_candidates, monkeypatch):
    """Un cabinet qui publie pour la cible ne dit rien d'elle : la clé est
    posée à ``None`` — cherché, non observé — jamais une préférence déduite."""
    monkeypatch.setattr(
        discover_router,
        "it_job_signals",
        AsyncMock(return_value=[{"title": "Dev", "date": "2026-09-05", "company": "RANDSTAD", "contractCode": "MIS"}]),
    )
    monkeypatch.setattr(discover_router, "public_tenders", AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "legal_signals", AsyncMock(return_value=[]))

    candidates = _call(client).json()["candidates"]
    searched = [c for c in candidates if c["signalsSearched"]]
    assert searched
    for candidate in searched:
        assert candidate["contractModel"] is None


def _call(client: TestClient) -> Any:
    return client.post("/discover/registry", json={"profile_data": SCOPE_PROFILE, "filters": {}, "limit": 30})
