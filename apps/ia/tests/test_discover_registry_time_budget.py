"""`POST /discover/registry` — le budget de temps GLOBAL du moteur (#2496 bis).

Mesuré en production le 17/09/2026 (commit 835aaf058, recette ÉCRAN) : sur
`/discover`, secteur large ("aéronautique") + une ville tapée en toutes lettres
("Toulouse"), la requête échoue après ~25 s avec « La recherche a échoué — le
service n'a pas pu être joint ». Ce délai ne correspond à AUCUN couperet connu
(45 s côté proxy `IaClient.discoverRegistry`, timeouts par fournisseur de 6 à
15 s) : c'est la SOMME, sans budget global, de la chaîne SÉQUENTIELLE que cette
recherche déclenche —

    résolution de la ville (`geo-communes`) → page 1 du registre
    → rappel de page 2 (#2490.9, déclenché ici : zone + activité posées)
    → angle commercial (Claude, `_angles_by_siren`)

— chacune bornée par SON propre délai, aucune par un budget d'ensemble. Sous
charge réelle (fournisseurs proches de leur propre plafond), la somme grimpe
bien au-delà de ce qu'un utilisateur attend, jusqu'à ce qu'une couche en amont
(proxy, passerelle) coupe la connexion — d'où un `DiscoverError` plein écran
alors que le registre avait déjà une page 1 valide en main.

Le correctif : un budget de temps qui arrête le travail le MOINS utile en
premier (le rappel de page 2, puis l'angle) — jamais la liste elle-même — et le
dit dans `degraded[]` (`network_error`, déjà mappé côté écran sur « injoignable
— délai dépassé », `discover.json`).
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.routers import discover
from app.services.data_sources.recherche_entreprises import LIST_PAGE_MAX

# Secteur qui résout vers une SECTION NAF large (comme "aéronautique" en
# production) : Pappers ne sait pas l'honorer (`_unhonoured_by`), donc
# recherche-entreprises passe EN PREMIER dans le waterfall — exactement le
# chemin mesuré en production.
# Horloge SIMULÉE (`virtual_clock`, conftest) : les budgets se mesurent en secondes
# virtuelles, jamais au mur d'horloge — la charge d'un runner CI ne peut plus les faire
# échouer (CI annulée #4253 / #4254).
pytestmark = pytest.mark.usefixtures("no_gc_pause", "virtual_clock")

_FILTERS = {"sector": "industry", "city": "Toulouse"}


def _row(index: int, **over: Any) -> dict:
    return {
        "name": f"SOCIETE {index:03d} SAS",
        "siren": f"{100000000 + index}",
        "nafCode": "30.30Z",
        "sector": "Construction aéronautique et spatiale",
        "city": "TOULOUSE",
        "department": "31",
        "headcountRange": "50 à 99 salariés",
        "headcountTranche": "21",
        "legalCategory": "5710",
        **over,
    }


def _full_page() -> list[dict]:
    return [_row(i) for i in range(LIST_PAGE_MAX)]


_TOULOUSE_COMMUNE = [{"code": "31555", "name": "Toulouse", "postalCodes": ["31000"], "population": 486828}]


# Chaque coroutine de source appelée par `_candidate_signals` (hors `public_tenders`,
# `it_job_signals`, `legal_signals`, stubbées nommément ci-dessous) : le garde
# `test_slow_chain_stubs_every_signal_source` échoue si l'une d'elles n'y figure pas.
STUBBED_COROUTINES = ("funding_signals", "capital_increase_signals", "_press_for", "_ats_for_card", "_peek_shared_jobs", "_adzuna_for_card")
_STUBBED_ELSEWHERE = {
    "public_tenders", "it_job_signals", "legal_signals", "_page_volumes", "load_press_feeds",
    "domain_of_card", "offer_volumes", "company_domains.lookup", "_adzuna_enabled", "adzuna_budget.discover_allowed", "provider_cache.cache_available",
    # #4430 — n'est atteinte qu'avec un espace (`space_key`) : les tests de budget n'en posent pas ;
    # bornée et testée dans `test_discover_fresh_jobs_4430.py`.
    "_fresh_rows",
}  # fmt: skip
# Enveloppes / fonctions pures : aucune E/S propre (elles bornent ou combinent les sources).
_NOT_A_SOURCE = {
    "_as_queued", "_bounded_source", "_quiet_rows", "_watched_jobs_fetch", "_dedup_by_url", "_domain_rows",
    "_merge_degraded", "_merged_offers", "cached_fact", "company_fact_key", "jobs_fact_variant",
    "drop_off_card_facts", "observe_contract_model", "mapper", "_no_rows",
    # #4285.1 — enveloppe de `capital_increase_signals` (déjà stubbée nommément ci-dessus).
    "_capital_rows",
}  # fmt: skip


async def _no_feeds() -> dict:
    return {}


async def _no_cache() -> bool:
    return False


def test_slow_chain_stubs_every_signal_source() -> None:
    """Une source ajoutée plus tard à `_candidate_signals` / `_page_volumes` ne doit
    plus casser les tests de budget EN SILENCE : tout appel vers une coroutine (ou
    un service d'E/S) du module doit être stubbé par `slow_chain`, ou classé ici."""
    import ast
    import inspect

    called: set[str] = set()
    for fn in (discover._candidate_signals, discover._page_volumes, discover.domain_of_card):
        for node in ast.walk(ast.parse(inspect.getsource(fn))):
            if isinstance(node, ast.Call):
                called.add(ast.unparse(node.func))
    services = {"adzuna_budget", "provider_cache", "company_domains"}
    unknown = set()
    for name in called:
        root = name.split(".")[0]
        target = getattr(discover, root, None)
        io_like = inspect.iscoroutinefunction(target) or (root in services and "." in name)
        io_like = io_like or name == "offer_volumes"
        if io_like and name not in set(STUBBED_COROUTINES) | _STUBBED_ELSEWHERE | _NOT_A_SOURCE:
            unknown.add(name)
    assert not unknown, f"source(s) non stubbée(s) par `slow_chain` : {sorted(unknown)}"


@pytest.fixture
def slow_chain(monkeypatch):
    """Câble la chaîne séquentielle complète, chaque étape avec son délai
    PROPRE (jamais nul) — comme des appels réseau réels, jamais des mocks
    instantanés qui masqueraient l'absence de budget."""

    calls: dict[str, list[float]] = {"page2": [], "claude": []}

    async def slow_communes(query: str, *, limit: int = 10, client=None):
        await asyncio.sleep(0.05)
        return _TOULOUSE_COMMUNE

    async def gouv_page1(filters, limit, degraded=None):
        await asyncio.sleep(0.01)
        return _full_page()

    async def gouv_page2(filters, limit, degraded=None, *, page: int = 1):
        calls["page2"].append(page)
        await asyncio.sleep(0.05)
        # Tranche la plus haute : comme AIRBUS OPERATIONS en production, la
        # ligne de page 2 doit ressortir EN TÊTE du classement pour prouver
        # qu'elle a bien été lue, pas juste coupée par `limit`.
        return [_row(999, headcountTranche="53", headcountRange="10 000 salariés et plus")]

    async def pappers_unreached(filters, limit, degraded=None):
        raise AssertionError("Pappers ne doit pas être appelé : il ne sait pas honorer 'sector' ici")

    async def slow_claude(*args, **kwargs):
        calls["claude"].append(1)
        await asyncio.sleep(0.05)
        return {"angles": []}, None

    async def no_signals(*args: Any, **kwargs: Any) -> list[dict]:
        """#2496 bis (résidu, 18/09/2026) — chaque candidat RENDU déclenche
        AUSSI une recherche de signaux (Décision 1, `_start_signal_tasks` /
        `_finish_signal_tasks`), tôt, PENDANT l'angle. Sans stub ici, les
        trois sources (BOAMP, France Travail, BODACC) retombaient sur leurs
        VRAIES implémentations : bloquées par le garde-réseau du harnais
        (`tests/env_hermeticity.py` — « unit test attempted to resolve
        b'boamp-datadila.opendatasoft.com' » en boucle dans les journaux de
        CI), mais SEULEMENT après avoir construit un client HTTP — travail
        synchrone, mesuré (mode debug asyncio, `loop.slow_callback_duration`)
        à 2-12 ms PAR APPEL, qui bloque la boucle d'événements AVANT le
        premier ``await`` réel. `_finish_signal_tasks` ne peut rien y faire :
        son ``timeout`` borne l'ATTENTE, pas ce que la boucle a déjà dépensé
        pour démarrer la tâche. Sous charge CI (moins de cache, plus de
        contention), ce coût constant par candidat grandit et s'ajoute au mur
        de temps — exactement ce que le message du garde-réseau demande lui
        même : « Stub the provider »."""
        return []

    monkeypatch.setattr("app.routers.discover.search_communes", slow_communes)
    monkeypatch.setattr("app.routers.discover._registry_search", pappers_unreached)
    monkeypatch.setattr("app.routers.discover._fallback_search", gouv_page1)
    monkeypatch.setattr("app.routers.discover._fallback_search_page", gouv_page2)
    monkeypatch.setattr("app.routers.discover.call_claude", AsyncMock(side_effect=slow_claude))
    monkeypatch.setattr("app.routers.discover.public_tenders", no_signals)
    monkeypatch.setattr("app.routers.discover.it_job_signals", no_signals)
    monkeypatch.setattr("app.routers.discover.legal_signals", no_signals)
    # DISCOVER-OFFRES / #4045 (15/10) — les sources de `_candidate_signals` et
    # `_page_volumes` ajoutées depuis : toutes INSTANTANÉES. Sans elles, chacune
    # retombait sur sa vraie implémentation (cache, lecture partagée, ATS, presse,
    # réserve Adzuna, domaines) et, sous charge CI, dépassait les 20 ms de grâce
    # de `_finish_signal_tasks` : toutes les cartes « non cherchées ». Ce test
    # mesure le BUDGET, pas le réseau ni la charge de la machine.
    for name in STUBBED_COROUTINES:
        monkeypatch.setattr(f"app.routers.discover.{name}", no_signals)
    monkeypatch.setattr("app.routers.discover._page_volumes", no_signals)
    monkeypatch.setattr("app.routers.discover.load_press_feeds", _no_feeds)
    monkeypatch.setattr("app.routers.discover._adzuna_enabled", lambda: False)
    monkeypatch.setattr("app.routers.discover.provider_cache.cache_available", _no_cache)
    return calls


def _post(client: TestClient, filters: dict, limit: int = 20):
    return client.post("/discover/registry", json={"filters": filters, "limit": limit})


async def _apost(http, filters: dict, limit: int = 20):
    """Même appel, dans la boucle du test : le temps écoulé se lit en temps VIRTUEL exact."""
    return await http.post("/discover/registry", json={"filters": filters, "limit": limit})


def test_a_tight_budget_skips_the_page_two_recall_and_says_so(client: TestClient, slow_chain, monkeypatch) -> None:
    """Budget déjà ÉPUISÉ par la résolution de ville (0.05 s) + la page 1
    (0.01 s) : il ne reste pas de quoi tenter le rappel de page 2 (0.05 s de
    plus). Le rappel n'est PAS tenté, la page 1 (vraie) est quand même rendue,
    et la coupe est DITE dans `degraded[]` — jamais silencieuse."""
    monkeypatch.setattr("app.routers.discover.DISCOVER_TIME_BUDGET_S", 0.03)

    response = _post(client, _FILTERS)

    assert response.status_code == 200, response.text
    body = response.json()
    assert slow_chain["page2"] == []  # jamais tenté : le budget était déjà épuisé
    assert len(body["candidates"]) == 20  # la page 1 — vraie — reste rendue, coupée à `limit`
    assert {"source": "recherche-entreprises", "reason": "network_error"} in [
        {"source": e.get("source"), "reason": e.get("reason")} for e in body["degraded"]
    ]


def test_a_generous_budget_still_reads_the_second_page(client: TestClient, slow_chain, monkeypatch) -> None:
    """Témoin : un budget large laisse le mécanisme #2490.9 inchangé — la
    garde ne doit pas couper ce qui rentre largement dans le budget."""
    monkeypatch.setattr("app.routers.discover.DISCOVER_TIME_BUDGET_S", 30.0)

    response = _post(client, _FILTERS)

    assert response.status_code == 200, response.text
    body = response.json()
    assert slow_chain["page2"] == [2]
    assert any(c["name"] == "SOCIETE 999 SAS" for c in body["candidates"])


async def test_the_whole_request_never_serialises_past_the_budget(async_client, slow_chain, monkeypatch) -> None:
    """Preuve du symptôme production : SANS budget, la chaîne séquentielle
    (ville 0.05 s + page 1 0.01 s + page 2 0.05 s + angle 0.05 s) prend ~0.16 s
    dans ce test réduit — à l'échelle de la production (6 à 15 s par étape),
    c'est exactement ce qui pousse une recherche légitime au-delà de ce qu'un
    utilisateur attend. Avec un budget serré, le mur de temps réel reste sous
    le budget augmenté d'UNE seule étape encore en vol (jamais la somme des
    quatre)."""
    monkeypatch.setattr("app.routers.discover.DISCOVER_TIME_BUDGET_S", 0.08)

    import time as _time

    started = _time.monotonic()
    response = await _apost(async_client, _FILTERS)
    elapsed = _time.monotonic() - started

    assert response.status_code == 200, response.text
    # Temps VIRTUEL : budget (0.08 s) + au plus UNE étape encore en vol (l'angle,
    # non préemptible une fois lancé, 0.05 s) — jamais 0.05+0.01+0.05+0.05=0.16 s.
    assert elapsed < 0.08 + 0.05 + 1e-6, (
        f"la requête a pris {elapsed:.3f}s — la chaîne séquentielle n'est pas bornée par un budget global"
    )
    # Les signaux (stubbés ci-dessus, `no_signals`) doivent avoir eu le temps de
    # finir MÊME sur un budget déjà épuisé par la chaîne registre : ils sont
    # instantanés, donc jamais annulés par `_finish_signal_tasks` — GA-18/GA-19,
    # `signalsSearched` distingue « pas cherché » de « cherché, vide », jamais un
    # 0 déguisé. Seuls les `SIGNALS_CANDIDATE_LIMIT` premiers candidats sont
    # ciblés ; un retour à `False` sur EUX dirait qu'une source redevenue
    # bloquante (réseau réel non stubbé) consomme à nouveau le budget.
    body = response.json()
    targeted = body["candidates"][: discover.SIGNALS_CANDIDATE_LIMIT]
    assert all(c["signalsSearched"] is True for c in targeted), targeted
    assert all(c["signals"] == [] for c in targeted)


async def test_without_the_budget_the_same_chain_serialises_past_it(async_client, slow_chain, monkeypatch) -> None:
    """Une garde qui sait dire NON : budget large, la MÊME chaîne prend la SOMME de ses
    étapes (0.05+0.01+0.05+0.05 s virtuelles). Sans le budget, la borne du test voisin
    (`< 0.18 s`) serait donc franchie — elle lit bien quelque chose."""
    monkeypatch.setattr("app.routers.discover.DISCOVER_TIME_BUDGET_S", 30.0)

    import time as _time

    started = _time.monotonic()
    response = await _apost(async_client, _FILTERS)
    elapsed = _time.monotonic() - started

    assert response.status_code == 200, response.text
    assert elapsed >= 0.16 - 1e-6, f"{elapsed:.3f}s — la chaîne n'a pas été sérialisée, la mesure ne lit rien"
    assert elapsed > 0.08 + 0.05, "sans budget, la borne du test voisin serait dépassée"


async def test_a_slow_offer_volume_never_holds_the_signals_past_the_budget(
    async_client, slow_chain, monkeypatch
) -> None:
    """DISCOVER-OFFRES (15/10) — le volume d'offres de la page est attendu un court
    instant par carte, mais JAMAIS au-delà du budget global : un volume lent (domaines
    non résolus) ne doit ni retarder la réponse ni rendre une carte « non cherchée »."""

    async def slow_volumes(targets) -> None:
        await asyncio.sleep(2.0)

    monkeypatch.setattr("app.routers.discover.DISCOVER_TIME_BUDGET_S", 0.08)
    monkeypatch.setattr("app.routers.discover._page_volumes", slow_volumes)

    import time as _time

    started = _time.monotonic()
    response = await _apost(async_client, _FILTERS)
    elapsed = _time.monotonic() - started

    assert response.status_code == 200, response.text
    assert elapsed < 1.0, f"la requête a attendu le volume d'offres : {elapsed:.3f}s"
    targeted = response.json()["candidates"][: discover.SIGNALS_CANDIDATE_LIMIT]
    assert all(c["signalsSearched"] is True for c in targeted), response.json().get("degraded")
