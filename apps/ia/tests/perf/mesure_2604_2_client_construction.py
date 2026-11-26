"""#2604.2 — balayage CHIFFRÉ du blocage de la boucle asyncio par la
construction d'un ``httpx.AsyncClient()`` inline, source par source, AVANT de
décider laquelle corriger.

Décision Louis 18/09/2026 (QCM, voir `.claude/notes/registre-2026-09-18-DA-demo-et-discover.md`
ligne 2604.2) : « un BALAYAGE CHIFFRÉ d'abord, puis corriger CELLES QUI
SAIGNENT » — #2604.1 a mesuré et corrigé deux sources (`public_tenders`,
`_legal_signals_uncached`) ; ce script étend la MÊME méthode aux ~15 autres
fichiers `data_sources/*.py` qui partagent le patron
``client or httpx.AsyncClient(...)`` construit à chaque appel.

Méthode (identique à celle de l'issue #2604, mesurée en marge de #2496 bis) :
mode debug asyncio (``loop.set_debug(True)``, ``loop.slow_callback_duration =
0.001``), 20 exécutions PAR SOURCE, réseau intégralement mocké
(``httpx.AsyncClient.get``/``.post`` patchés en ``AsyncMock`` — AUCUNE
résolution DNS, AUCUNE clé réelle ; convention identique à
``tests/test_data_sources.py::test_bodacc_reuses_one_http_client_across_calls``).
Chaque appel reçoit un identifiant UNIQUE pour déjouer le cache
(``provider_cache``) qui court-circuiterait sinon la construction du client.

Ce n'est PAS un test pytest : le nombre de callbacks lents dépend de la
machine qui l'exécute (SSL, allocateur, charge) — un seuil dans la CI serait
flaky (cf. mémoire outillage « trois tests flaky par construction »). Il
produit le tableau chiffré qui justifie (ou pas) un correctif par source.

Lancer : ``.venv/bin/python tests/perf/mesure_2604_2_client_construction.py``
(depuis ``apps/ia``).

─────────────────────────────────────────────────────────────────────────────
RÉSULTAT DE LA MESURE DU 18/09/2026 (Apple Silicon, Python 3.13, cwd `apps/ia`) :

Piège méthodologique trouvé EN MESURANT (documenté pour la prochaine fois) :
le compte de « lents/20 » (asyncio debug, seuil 1 ms) est BRUITÉ — il
attrape aussi du travail synchrone SANS rapport avec la construction du
client (formatage, JSON, throttle…), au point de rendre 20/20 même sur les
DEUX sources déjà corrigées par #2604.1. Le signal qui tranche vraiment,
déterministe et indépendant de la machine, est le compte de
``httpx.AsyncClient.__init__`` réellement exécutés sur 20 appels à
identifiants distincts (colonne « constr./20 » ci-dessous) : 1 = client
réutilisé (corrigé), 20 = un client par appel (saigne). C'est ce chiffre,
pas « lents/20 », qui a tranché le correctif ci-dessous. (Deuxième piège,
propre à ce script — équivalent Python du symlink `node_modules` qui
détourne un worktree, mémoire outillage : lancé comme SCRIPT, Python met le
dossier du script en tête de `sys.path`, pas le cwd, et l'import `app...`
retombait sur l'install éditable du venv qui pointe vers le DÉPÔT PRINCIPAL —
d'où le `sys.path.insert(0, os.getcwd())` en haut de ce fichier.)

  source (fichier:ligne)                                clé Railway              constr./20  lents/20  max ms
  ── générique (coût de construction isolé) ──
  httpx.AsyncClient(timeout=10.0) seul                    —                        20/20       20/20     79
  ── déjà corrigées (#2604.1), sanity check : DOIT rester 1/20 ──
  bodacc.legal_signals (bodacc.py:59)                     —                         1/20        4/20      4
  public_tenders.public_tenders (public_tenders.py:225)   —                         1/20        6/20     18
  ── vivantes en prod (clé posée sur Railway, ou aucune clé requise) → SAIGNENT, CORRIGÉES ci-dessous ──
  recherche_entreprises.fetch_company (:113)              aucune                   20/20       20/20     10
  apec.it_job_signals_apec (:195)                         aucune                   20/20       20/20     42
  ats_boards.it_job_signals_ats (:274)                    aucune                   20/20       20/20     28
  decp.awarded_it_contracts (:343)                        aucune                   20/20       20/20     24
  geo_communes._fetch (:142)                              aucune                   20/20       20/20      7
  github_org.org_tech_signals (:303)                      GITHUB_TOKEN*            20/20       20/20     26
  tech_detect.detect_stack (:93)                          aucune                   20/20       20/20     39
  public_tenders.list_tender_buyers (:349)                aucune                   20/20       20/20     21
  brave_news.recent_news (:43)                            BRAVE_API_KEY            20/20       20/20     45
  france_travail.it_job_signals (:371)                    FRANCE_TRAVAIL_*         20/20       20/20     31   ← HOT PATH : `_candidate_signals` (discover.py:1126-1129) l'appelle dans le MÊME `asyncio.gather` que les deux sources déjà corrigées, multiplié par SIGNALS_CANDIDATE_LIMIT
  inpi_rne.beneficial_owners (:89)                        INPI_USERNAME/PASSWORD   20/20       20/20      7
  serper.serper_search (:47)                              SERPER_API_KEY           20/20       20/20      8
  tavily.tavily_search (:51)                              TAVILY_API_KEY           20/20       20/20     35
  ── clé optionnelle ABSENTE sur Railway (`railway variables --service bellum-ia-service`,
     18/09/2026, noms de clés seulement) → NO-OP STRICT en prod, NE SAIGNE PAS, LAISSÉE TELLE QUELLE ──
  wttj.it_job_signals_wttj (:141)  WTTJ_ALGOLIA_APP_ID/API_KEY absent               0/20        2/20     16   (construction jamais atteinte ; le 2/20 « lents » est du bruit résiduel, 0 construction)

  *GITHUB_TOKEN est posé mais optionnel (60 req/h anonyme sinon) — org_tech_signals
   tourne dans les deux cas, clé ou pas — donc toujours vivante.

Seuil retenu pour « saigne » : constructions/20 == 20 (un client par appel,
AUCUN réemploi) ET la source est vivante en prod (aucune clé requise, ou sa
clé est posée sur Railway). Sur cette base : 13 fichiers / 15 points d'appel
corrigés (liste ci-dessous), 1 laissée intacte (wttj, no-op).
─────────────────────────────────────────────────────────────────────────────

ADDENDUM DU 20/09/2026 — le balayage du 18/09 s'arrêtait à `data_sources/`
(le dossier même) ; ce point (#2604.2, reconduit) demandait aussi « tout
autre endroit qui construit un ``httpx.AsyncClient``… dans un chemin appelé
par requête ». `git grep -n "AsyncClient(" apps/ia` (hors `data_sources/` et
`tests/`) donne ~35 points d'appel dans 20 fichiers (apollo.py, apollo_org.py,
brave_search.py, country_packs/*, data_gateway.py, insee_sirene.py,
pappers/*, salesql.py, backoffice_alerts.py, bellum_api.py,
dataforge_rag_chunks.py, ocr.py, progress.py, rag_service.py,
research/pappers.py, phase2_contacts.py). Triés par APPELANT (pas seulement
la fonction, cf. CLAUDE.md § « Ce qui est déjà livré ») :

- `apollo._enrich_person_uncached` (apollo.py:1271, via `enrich_person`) —
  appelée par `contact_enrich.enrich_top_deciders` SANS `http_client`, dans
  `asyncio.gather` sur jusqu'à `CONTACTS_ENRICH_TOP_N` (15 par défaut)
  deciders EN PARALLÈLE (contact_enrich.py:60-124) : même forme que
  `_candidate_signals`/SIGNALS_CANDIDATE_LIMIT (discover.py), un client
  construit-puis-fermé PAR CONTACT. SAIGNE → CORRIGÉE (voir mesure
  ``[#2604.2 20/09] apollo.enrich_person`` ci-dessus : 1/20 constr. après
  correctif, même ``get_shared_client`` que `data_sources/`, clé
  ``"apollo"``). Preuve rouge→vert :
  `tests/test_apollo_service.py::test_enrich_person_reuses_one_http_client_across_calls`.
- Tout le reste des ~35 points mesuré 1× (ou un petit nombre BORNÉ, non
  multiplié par un candidat/contact) PAR REQUÊTE : `search_people`/
  `search_people_with_status` (apollo.py) — 1 à ~4 passes séquentielles par
  requête `/contacts`, chacune réutilisant déjà SON client sur toute sa
  propre boucle d'ancres ; `enrich_person_with_fallback` — endpoint
  `/enrich`, un contact à la fois, sur demande utilisateur ; `apollo_org`,
  `insee_sirene`, `pappers/*`, `country_packs/*`, `data_gateway` — tous
  appelés depuis `phase1_research.py`, UNE fois par analyse de société (pas
  par candidat) ; `brave_search.py` — un seul appel, `discover.py:1509`, hors
  de `_candidate_signals` ; `salesql.py` — appelé par `apollo.py` seulement
  en dernier recours de la cascade (1×/enrichissement) ; `backoffice_alerts`,
  `bellum_api`, `dataforge_rag_chunks`, `ocr`, `progress`, `rag_service`,
  `research/pappers.py` — infra interne ou legacy, 1×/appel, pas des sources
  d'enrichissement candidat-par-candidat. LAISSÉS TELS QUELS : le coût de
  construction (même plancher générique 2-79ms mesuré ci-dessus, dominé par
  le contexte SSL, pas par l'endpoint) n'est payé qu'UNE fois par requête,
  pas multiplié — ce n'est pas ce que #2604.2 vise.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from unittest.mock import AsyncMock

# ⚠️ Piège worktree (équivalent Python du symlink node_modules) : lancé comme
# SCRIPT (`python tests/perf/....py`), Python met le dossier du SCRIPT en
# tête de `sys.path`, pas le cwd — l'import `app...` retombe alors sur
# l'install éditable du venv, qui pointe vers le DÉPÔT PRINCIPAL, pas ce
# worktree. `pytest` insère le cwd et n'a pas ce problème ; ce script, lancé
# seul, en a besoin explicitement.
sys.path.insert(0, os.getcwd())

import httpx


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("GET", "https://x"))


class _SlowCallbackCapture(logging.Handler):
    """Compte les « Executing … took X s » qu'asyncio journalise en mode debug
    quand un callback dépasse ``slow_callback_duration``."""

    def __init__(self) -> None:
        super().__init__()
        self.count = 0
        self.max_ms = 0.0

    def emit(self, record: logging.LogRecord) -> None:
        msg = record.getMessage()
        if "Executing" in msg and "took" in msg:
            self.count += 1
            try:
                seconds = float(msg.rsplit(" ", 2)[-2])
            except (ValueError, IndexError):
                seconds = 0.0
            self.max_ms = max(self.max_ms, seconds * 1000)


#: Nombre TOTAL de `httpx.AsyncClient` construits depuis le début du script —
#: signal déterministe (indépendant de la machine), contrairement aux
#: callbacks lents ci-dessous. Patché une fois dans `main()`.
_TOTAL_CONSTRUCTIONS = [0]


def run_20(coro_factory, n: int = 20) -> tuple[int, float, int]:
    """Exécute ``coro_factory()`` (fabrique une coroutine fraîche) ``n`` fois,
    une NOUVELLE boucle debug par exécution (comme un process qui traiterait
    ``n`` requêtes Découvrir). Rend :
    - ``hits`` : sur combien d'exécutions AU MOINS un callback lent est
      apparu (bruité — voir note en tête de fichier : un seuil de 1 ms attrape
      aussi du travail synchrone SANS rapport avec la construction du client,
      d'où le 20/20 mesuré même sur les deux sources déjà corrigées) ;
    - ``max_ms`` : la durée bloquante max observée (asyncio debug) ;
    - ``constructions`` : le signal DÉTERMINISTE — combien de
      ``httpx.AsyncClient`` ont été réellement construits pendant ces ``n``
      appels avec des arguments distincts (1 = client réutilisé, ``n`` = un
      client par appel). C'est CE chiffre qui tranche « saigne / ne saigne
      pas », pas le compte de callbacks lents."""
    alogger = logging.getLogger("asyncio")
    cap = _SlowCallbackCapture()
    alogger.addHandler(cap)
    prev_level = alogger.level
    alogger.setLevel(logging.WARNING)
    hits = 0
    prev_count = 0
    before = _TOTAL_CONSTRUCTIONS[0]
    try:
        for _ in range(n):
            loop = asyncio.new_event_loop()
            loop.set_debug(True)
            loop.slow_callback_duration = 0.001
            try:
                loop.run_until_complete(coro_factory())
            finally:
                loop.close()
            if cap.count > prev_count:
                hits += 1
            prev_count = cap.count
    finally:
        alogger.removeHandler(cap)
        alogger.setLevel(prev_level)
    constructions = _TOTAL_CONSTRUCTIONS[0] - before
    return hits, cap.max_ms, constructions


def _patch_network(monkeypatch_stack: list, payload: object = None) -> None:
    resp = _resp(payload if payload is not None else {})
    original_get = httpx.AsyncClient.get
    original_post = httpx.AsyncClient.post
    httpx.AsyncClient.get = AsyncMock(return_value=resp)  # type: ignore[method-assign]
    httpx.AsyncClient.post = AsyncMock(return_value=resp)  # type: ignore[method-assign]
    monkeypatch_stack.append((httpx.AsyncClient, "get", original_get))
    monkeypatch_stack.append((httpx.AsyncClient, "post", original_post))


def _unpatch(monkeypatch_stack: list) -> None:
    for target, attr, original in monkeypatch_stack:
        setattr(target, attr, original)
    monkeypatch_stack.clear()


def main() -> None:
    results: list[tuple[str, int, float, int]] = []

    # Compte DÉTERMINISTE des constructions réelles, pour toute la durée du
    # script (voir `_TOTAL_CONSTRUCTIONS` / `run_20`).
    original_init = httpx.AsyncClient.__init__

    def _counting_init(self: httpx.AsyncClient, *a: object, **kw: object) -> None:
        _TOTAL_CONSTRUCTIONS[0] += 1
        original_init(self, *a, **kw)

    httpx.AsyncClient.__init__ = _counting_init  # type: ignore[method-assign]

    # 1. Générique : le coût de construction lui-même, isolé de toute logique
    #    source-spécifique — la même ligne `httpx.AsyncClient(timeout=10.0)`
    #    que copie chaque source non corrigée.
    async def _construct_only() -> None:
        c = httpx.AsyncClient(timeout=10.0)
        await asyncio.sleep(0)
        await c.aclose()

    hits, max_ms, constructions = run_20(_construct_only)
    results.append(("(générique) httpx.AsyncClient(timeout=10.0)", hits, max_ms, constructions))

    stack: list = []
    try:
        _patch_network(stack, {})

        from app.services.data_sources import apec, ats_boards, geo_communes, tech_detect
        from app.services.data_sources import public_tenders as pt
        from app.services.data_sources import recherche_entreprises as re_mod

        async def _apec(i: int) -> None:
            await apec.it_job_signals_apec(f"Mesure2604 Apec {i}")

        async def _ats(i: int) -> None:
            await ats_boards.it_job_signals_ats(f"Mesure2604 Ats {i}")

        async def _fetch_company(i: int) -> None:
            await re_mod.fetch_company(f"Mesure2604 RE {i}")

        async def _search_communes(i: int) -> None:
            await geo_communes.search_communes(f"Mesure2604 Commune {i}")

        async def _tech_detect(i: int) -> None:
            await tech_detect.detect_stack(f"https://mesure2604-{i}.example.test")

        async def _list_tender_buyers(i: int) -> None:
            await pt.list_tender_buyers(department=f"{10 + (i % 80):02d}")

        for name, fn in (
            ("apec.it_job_signals_apec", _apec),
            ("ats_boards.it_job_signals_ats", _ats),
            ("recherche_entreprises.fetch_company", _fetch_company),
            ("geo_communes.search_communes (._fetch)", _search_communes),
            ("tech_detect.detect_stack", _tech_detect),
            ("public_tenders.list_tender_buyers", _list_tender_buyers),
        ):
            counter = {"i": 0}

            def factory(fn=fn, counter=counter):
                counter["i"] += 1
                return fn(counter["i"])

            hits, max_ms, constructions = run_20(factory)
            results.append((name, hits, max_ms, constructions))

        # decp — awarded_it_contracts (list_award_buyers a la même forme, on
        # n'en mesure qu'une des deux, structure IDENTIQUE dans le même fichier)
        from app.services.data_sources import decp

        async def _decp(i: int) -> None:
            await decp.awarded_it_contracts(f"Mesure2604 Decp {i}")

        counter = {"i": 0}

        def decp_factory(counter=counter):
            counter["i"] += 1
            return _decp(counter["i"])

        hits, max_ms, constructions = run_20(decp_factory)
        results.append(("decp.awarded_it_contracts", hits, max_ms, constructions))

        # github_org — anonyme, pas de clé requise pour que ça marche
        from app.services.data_sources import github_org

        async def _github(i: int) -> None:
            await github_org.org_tech_signals(f"Mesure2604 Github {i}")

        counter = {"i": 0}

        def github_factory(counter=counter):
            counter["i"] += 1
            return _github(counter["i"])

        hits, max_ms, constructions = run_20(github_factory)
        results.append(("github_org.org_tech_signals", hits, max_ms, constructions))

        # sanity check — déjà corrigées (#2604.1) : la MÊME méthode doit
        # montrer 1/20, pas 20/20.
        from app.services.data_sources import bodacc

        bodacc._shared_client = None
        pt._shared_client = None

        async def _bodacc(i: int) -> None:
            siren = f"{100000000 + i:09d}"
            await bodacc.legal_signals(siren)

        counter = {"i": 0}

        def bodacc_factory(counter=counter):
            counter["i"] += 1
            return _bodacc(counter["i"])

        hits, max_ms, constructions = run_20(bodacc_factory)
        results.append(("[sanity #2604.1] bodacc.legal_signals (client partagé)", hits, max_ms, constructions))

        async def _pt(i: int) -> None:
            await pt.public_tenders(f"Mesure2604 PT {i}")

        counter = {"i": 0}

        def pt_factory(counter=counter):
            counter["i"] += 1
            return _pt(counter["i"])

        hits, max_ms, constructions = run_20(pt_factory)
        results.append(("[sanity #2604.1] public_tenders.public_tenders (client partagé)", hits, max_ms, constructions))

        # sanity check — corrigée le 20/09/2026 (extension hors data_sources/,
        # voir addendum en tête de fichier) : `apollo._enrich_person_uncached`
        # doit lui aussi montrer 1/20, pas 20/20.
        from app.services import apollo as apollo_mod
        from app.services.data_sources import _http_pool as hp

        hp._clients["apollo"] = None
        prev_apollo_key = os.environ.get("APOLLO_API_KEY")
        os.environ["APOLLO_API_KEY"] = "mesure-2604-2"

        async def _apollo_enrich(i: int) -> None:
            await apollo_mod.enrich_person(apollo_id=f"Mesure2604 Apollo {i}")

        counter = {"i": 0}

        def apollo_factory(counter=counter):
            counter["i"] += 1
            return _apollo_enrich(counter["i"])

        try:
            hits, max_ms, constructions = run_20(apollo_factory)
            results.append(("[#2604.2 20/09] apollo.enrich_person (client partagé)", hits, max_ms, constructions))
        finally:
            if prev_apollo_key is None:
                os.environ.pop("APOLLO_API_KEY", None)
            else:
                os.environ["APOLLO_API_KEY"] = prev_apollo_key
    finally:
        _unpatch(stack)

    # 2. Sources à clé — testées AVEC la clé posée (comme en prod, cf. Railway)
    #    puis SANS (comme en dev/CI, no-op strict attendu).
    keyed_cases = [
        ("brave_news.recent_news", "app.services.data_sources.brave_news", "recent_news", {"BRAVE_API_KEY": "k"}, lambda i: (f"Mesure2604 Brave {i}",), {}),
        ("france_travail.it_job_signals", "app.services.data_sources.france_travail", "it_job_signals", {"FRANCE_TRAVAIL_CLIENT_ID": "id", "FRANCE_TRAVAIL_CLIENT_SECRET": "sec"}, lambda i: (f"Mesure2604 FT {i}",), {"access_token": "tok", "resultats": []}),
        ("inpi_rne.beneficial_owners", "app.services.data_sources.inpi_rne", "beneficial_owners", {"INPI_USERNAME": "u", "INPI_PASSWORD": "p"}, lambda i: (f"{200000000 + i:09d}",), {"token": "tok"}),
        ("serper.serper_search", "app.services.data_sources.serper", "serper_search", {"SERPER_API_KEY": "k"}, lambda i: (f"Mesure2604 Serper {i}",), {}),
        ("tavily.tavily_search", "app.services.data_sources.tavily", "tavily_search", {"TAVILY_API_KEY": "k"}, lambda i: (f"Mesure2604 Tavily {i}",), {}),
        ("wttj.it_job_signals_wttj [SANS clé, no-op attendu]", "app.services.data_sources.wttj", "it_job_signals_wttj", {}, lambda i: (f"Mesure2604 Wttj {i}",), {}),
    ]
    import importlib

    for label, modpath, fnname, env, args_fn, payload in keyed_cases:
        prev_env = {k: os.environ.get(k) for k in env}
        for k, v in env.items():
            os.environ[k] = v
        stack2: list = []
        try:
            _patch_network(stack2, payload)
            mod = importlib.import_module(modpath)
            fn = getattr(mod, fnname)

            async def _call(i: int, fn=fn, args_fn=args_fn) -> None:
                await fn(*args_fn(i))

            counter = {"i": 0}

            def factory(fn=fn, args_fn=args_fn, counter=counter):
                counter["i"] += 1
                return _call(counter["i"], fn=fn, args_fn=args_fn)

            hits, max_ms, constructions = run_20(factory)
            results.append((label, hits, max_ms, constructions))
        finally:
            _unpatch(stack2)
            for k, v in prev_env.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    httpx.AsyncClient.__init__ = original_init  # type: ignore[method-assign]

    print(f"\n{'source':<70} {'lents/20':>10} {'max ms':>10} {'constr./20':>11}")
    print("-" * 104)
    for name, hits, max_ms, constructions in results:
        print(f"{name:<70} {hits:>7}/20 {max_ms:>9.2f} {constructions:>9}/20")


if __name__ == "__main__":
    main()
