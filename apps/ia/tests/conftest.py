import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import source_cache, tool_idempotency
from app.services.data_sources import apec
from app.services.tool_circuit_breaker import get_tool_circuit_breaker


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(autouse=True)
def _hermetic_source_cache(monkeypatch):
    """Tests must never open a real Postgres connection: strip the cache URLs a
    dev shell may export and drop any store built by a previous test. Tests that
    exercise the store monkeypatch ``source_cache._store`` themselves."""
    monkeypatch.delenv("SOURCE_CACHE_PG_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(source_cache, "_store_obj", None)


@pytest.fixture(autouse=True)
def _hermetic_apec_antibot():
    """La pause anti-robot d'APEC (6 h) est un état de MODULE : un test qui la déclenche
    (réponse 403/429 simulée) faisait sauter en silence les tests APEC suivants (aucun
    appel, liste vide) selon l'ordre de la suite — vu à l'intégration vague 2 (16/10)."""
    apec._reset_antibot_for_tests()
    yield
    apec._reset_antibot_for_tests()


@pytest.fixture(autouse=True)
def _hermetic_subdomain_footprint(monkeypatch):
    """#3205.1 — la lecture crt.sh des sous-domaines (`provider_footprint_subdomains`)
    ne demande aucune clé : sans cette coupure, tout test d'une route de
    recherche tenterait de joindre le réseau. Le test de la source la rallume
    lui-même."""
    # Coupée par la FONCTION, pas par la variable : `PROVIDER_FOOTPRINT_SUBDOMAINS`
    # est un réglage, et la garde d'herméticité exige qu'aucun réglage ne soit
    # posé pendant la suite.
    from app.services import provider_footprint_subdomains

    monkeypatch.setattr(provider_footprint_subdomains, "_enabled", lambda: False)


@pytest.fixture(autouse=True)
def _hermetic_press_rss(monkeypatch):
    """#3917 — la presse RSS ne demande aucune clé : sans cette coupure, tout test
    d'une route de recherche tenterait de joindre 7 flux (et noterait une
    dégradation). Coupée par la FONCTION (garde d'herméticité : aucun réglage
    posé) ; `test_press_rss.py` la rallume lui-même."""
    from app.services.data_sources import press_rss

    monkeypatch.setattr(press_rss, "_enabled", lambda: False)


@pytest.fixture(autouse=True)
def _hermetic_discover_ats_boards(monkeypatch):
    """#4045 — Découvrir interroge désormais les boards ATS publics sur CHAQUE carte (sans
    clé) : sans cette coupure, tout test d'une route de recherche tenterait de joindre
    Greenhouse. Coupée par la FONCTION de la route ; les tests de la source la rallument."""
    from app.routers import discover

    async def _no_ats_board(*_args: object, **_kwargs: object) -> list[dict]:
        return []

    monkeypatch.setattr(discover, "it_job_signals_ats", _no_ats_board)


@pytest.fixture
def virtual_clock(monkeypatch):
    """Horloge SIMULÉE pour les tests de budget de temps (CI annulée #4253 / #4254).

    Un budget mesuré au mur d'horloge (`time.monotonic()` + `asyncio.sleep`) échoue sous la
    charge d'un runner : la machine, pas le code, dépense la marge. Ici le temps n'avance
    QUE lorsque la boucle d'événements n'a plus rien à faire sauf attendre un minuteur : le
    sélecteur saute alors directement à l'échéance au lieu de dormir. Un `sleep(0.05)` coûte
    exactement 0,05 s virtuelles et 0 s réelles ; le calcul entre deux `await` en coûte 0.
    Le résultat est identique à vide ou sous `stress` sur tous les cœurs.

    Patche `time.monotonic` (lu par la boucle, par le limiteur et par les budgets) et le
    sélecteur par défaut (une attente RÉELLE sans minuteur, `timeout=None`, reste réelle).
    Retourne la fonction qui lit l'horloge virtuelle."""
    import asyncio
    import selectors
    import time

    state = {"now": 1_000.0, "threads": 0}
    real_executor = asyncio.BaseEventLoop.run_in_executor
    real_select = selectors.DefaultSelector.select

    def fake_monotonic() -> float:
        return state["now"]

    def counted_executor(self, executor, func, *args):
        # Un travail confié à un fil (résolution DNS bloquée par le garde-réseau, etc.)
        # prend du temps RÉEL que l'horloge virtuelle ne peut pas deviner : tant qu'il est
        # en vol, on n'avance pas le temps (sinon un délai de 7 s expirerait pendant que
        # le fil travaille).
        state["threads"] += 1
        fut = real_executor(self, executor, func, *args)
        fut.add_done_callback(lambda _f: state.__setitem__("threads", state["threads"] - 1))
        return fut

    def fake_select(self, timeout=None):
        if timeout is None:
            return real_select(self, None)
        if state["threads"] > 0:
            return real_select(self, min(timeout, 0.002))
        ready = real_select(self, 0)
        if not ready and timeout > 0:
            state["now"] += timeout
        return ready

    monkeypatch.setattr(time, "monotonic", fake_monotonic)
    monkeypatch.setattr(asyncio.BaseEventLoop, "run_in_executor", counted_executor)
    monkeypatch.setattr(selectors.DefaultSelector, "select", fake_select)
    return fake_monotonic


@pytest.fixture
async def async_client():
    """Client ASGI qui tourne dans la boucle MÊME du test (sans fil de portail) : avec
    `virtual_clock`, aucun autre fil ne peut faire avancer l'horloge entre la fin de la
    requête et la lecture du temps écoulé par le test. `TestClient` fait tourner l'appli
    dans un fil à part : l'horloge y saute pendant que le fil du test lit encore."""
    import httpx

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


@pytest.fixture
def no_gc_pause():
    """#4045 — un test qui MESURE du temps de mur (budget d'une requête, débit d'un
    limiteur mis à l'échelle) ne doit pas payer une collecte de génération 2 : sur le tas
    d'une suite de 17 000 tests elle coûte 150 ms et plus, tombe là où l'allocation la
    déclenche (donc au gré de tout changement du code mesuré) et fait échouer un budget de
    20 ms. Mesuré le 14/10 : `gc` seul (callback `gc.callbacks`), 151 ms dans la fenêtre."""
    import gc

    was_enabled = gc.isenabled()
    gc.collect()  # tas propre AVANT la fenêtre mesurée
    gc.disable()
    yield
    if was_enabled:
        gc.enable()


@pytest.fixture(autouse=True)
def _hermetic_france_travail_token():
    """#4045 — le jeton OAuth France Travail est gardé en cache de PROCESSUS ; un
    jeton laissé par un test ne doit jamais éviter l'appel `_token` du suivant."""
    from app.services.data_sources import france_travail

    france_travail._reset_token_cache_for_tests()
    yield
    france_travail._reset_token_cache_for_tests()


@pytest.fixture(autouse=True)
def _hermetic_provider_quota_breaker():
    """#3495 — le disjoncteur « fournisseur à court de crédit » de `llm_gateway`
    est un état de PROCESSUS. Un test qui simule un `insufficient_quota` le laisse
    ouvert : sans ce nettoyage, tous les tests suivants basculent sur Anthropic
    (et exigent sa clé). Même chose pour la série d'échecs d'exécution d'une
    route : trois 429 simulés d'affilée et la route est écartée par `provider_fit`
    (« 3 échecs d'exécution consécutifs ») — vu en CI le 01/10, 8 tests rouges
    selon l'ordre."""
    from app.services import llm_gateway

    llm_gateway.reset_provider_exhausted()
    llm_gateway.reset_runtime_failure_streak()
    yield
    llm_gateway.reset_provider_exhausted()
    llm_gateway.reset_runtime_failure_streak()


@pytest.fixture(autouse=True)
def _hermetic_tool_resilience_state():
    """#2283 (épopée #2983) — le disjoncteur et le cache de déduplication des
    outils de chat (`tool_resilience.py`) sont un état de PROCESSUS partagé.
    Sans ce nettoyage, un test qui rejoue le même (outil, entrée) qu'un test
    précédent hériterait de son disjoncteur ouvert ou de son résultat mis en
    cache — exactement le défaut que `_hermetic_source_cache` referme déjà
    pour le cache de sources, un cran plus haut."""
    tool_idempotency.forget_all()
    get_tool_circuit_breaker().reset()
    yield
    tool_idempotency.forget_all()
    get_tool_circuit_breaker().reset()


@pytest.fixture(autouse=True)
def _hermetic_registry_circuit():
    """#4617 — le coupe-circuit du registre public est un état de PROCESSUS : cinq refus simulés par un test
    l'ouvrent, et le test suivant ne verrait plus partir aucun appel. Même nettoyage que les disjoncteurs ci-dessus."""
    from app.services.data_sources import recherche_entreprises

    recherche_entreprises.REGISTRY_BREAKER.reset()
    yield
    recherche_entreprises.REGISTRY_BREAKER.reset()
