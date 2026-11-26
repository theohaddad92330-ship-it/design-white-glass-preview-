"""Tests for `POST /discover/registry` — la découverte ANCRÉE SUR LE REGISTRE.

Contrat : ``agent_docs/discover-v2-contract.md``.

    « Le registre produit la liste. Le LLM ne produit que l'angle commercial. »

Ce qui est verrouillé ici, dans l'ordre d'importance :

1. **Aucun candidat sans SIREN réel** — une ligne registre sans identité résolue
   est écartée, jamais rendue.
2. **Le LLM n'invente ni entreprise ni score** — il ne peut qu'ajouter un angle
   sur un SIREN déjà résolu ; un SIREN qu'il inventerait est ignoré, un score
   qu'il produirait est jeté.
3. **`degraded[]` non négociable** — toute source sans clé, HS ou hors quota y
   apparaît. Jamais de repli silencieux sur du LLM (règle CLAUDE.md : « JAMAIS
   de données fictives. Échec API → erreur claire, pas de fallback inventé »).
4. **Registre vide = zéro candidat**, et surtout AUCUN appel au modèle : on ne
   laisse pas la machine à texte remplir le vide.

Les deux fournisseurs registre (`search_companies_filtered` côté paquet pappers,
`list_companies` côté recherche-entreprises) sont livrés par un AUTRE lot et
peuvent ne pas être encore sur le disque : le routeur les importe donc
paresseusement derrière deux indirections de module, que ces tests
monkeypatchent. Le lot est ainsi testable seul.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

# ── Fixtures registre ───────────────────────────────────────────────────────

ROW_LYON = {
    "name": "ACME INDUSTRIE",
    "siren": "552081317",
    "nafCode": "62.02A",
    "sector": "Conseil en systèmes et logiciels informatiques",
    "city": "Lyon",
    "department": "69",
    "headcountRange": "100 à 199 salariés",
    "creationDate": "2005-03-14",
}

ROW_PARIS = {
    "name": "BETA SERVICES",
    "siren": "444556677",
    "nafCode": "70.22Z",
    "sector": "Conseil pour les affaires",
    "city": "Paris",
    "department": "75",
    "headcountRange": "20 à 49 salariés",
    "creationDate": "2019-01-10",
}

ROW_NO_SIREN = {**ROW_PARIS, "name": "FANTOME SARL", "siren": ""}

FILTERS = {"nafCode": "62.02A", "department": "69", "headcountMin": 50, "headcountMax": 500}


def _post(client: TestClient, **body: Any):
    return client.post("/discover/registry", json={"filters": FILTERS, **body})


@pytest.fixture
def registry(monkeypatch):
    """Stub du fournisseur registre principal (lot voisin, potentiellement pas
    encore sur le disque). Renvoie un objet dont on règle les lignes par test."""

    class _Stub:
        rows: list[dict] = []
        calls: list[tuple] = []

        async def __call__(self, filters, limit, degraded=None):
            type(self).calls.append((filters, limit))
            return list(type(self).rows)

    stub = _Stub()
    _Stub.rows, _Stub.calls = [], []
    monkeypatch.setattr("app.routers.discover._registry_search", stub)
    # Hermétique : une panne RÉSEAU de TED/BOAMP se range désormais en `degraded` (DISCOVER-PARTIEL-2) —
    # ces tests parlent du registre, pas de la joignabilité des marchés publics depuis la machine de test.
    monkeypatch.setattr("app.routers.discover.public_tenders", AsyncMock(return_value=[]))
    # Idem pour les signaux par carte (offres France Travail, BODACC, levées) : leur collecte réelle dépasse le budget
    # `discover-signals` quand le réseau est lent ou coupé, et `degraded` n'est alors plus vide — un rouge qui ne dit rien du registre.
    monkeypatch.setattr("app.routers.discover.it_job_signals", AsyncMock(return_value=[]))
    monkeypatch.setattr("app.routers.discover.legal_signals", AsyncMock(return_value=[]))
    monkeypatch.setattr("app.routers.discover.funding_signals", AsyncMock(return_value=[]))
    return _Stub


@pytest.fixture
def fallback(monkeypatch):
    """Stub du fournisseur de repli SANS CLÉ (recherche-entreprises)."""

    class _Stub:
        rows: list[dict] = []
        calls: list[tuple] = []

        async def __call__(self, filters, limit, degraded=None):
            type(self).calls.append((filters, limit))
            return list(type(self).rows)

    stub = _Stub()
    _Stub.rows, _Stub.calls = [], []
    monkeypatch.setattr("app.routers.discover._fallback_search", stub)
    return _Stub


def _claude(angles: list[dict]) -> Any:
    return patch(
        "app.routers.discover.call_claude",
        new_callable=AsyncMock,
        return_value=({"angles": angles}, None),
    )


# ── Le registre produit la liste ────────────────────────────────────────────


def test_returns_registry_candidates_with_deterministic_score(client, registry, fallback) -> None:
    registry.rows = [ROW_PARIS, ROW_LYON]
    with _claude([]):
        res = _post(client)

    assert res.status_code == 200
    body = res.json()
    assert [c["siren"] for c in body["candidates"]] == ["552081317", "444556677"], "tri par score décroissant"
    lyon = body["candidates"][0]
    # Les champs registre sont rendus tels quels — factuels, jamais inventés.
    assert lyon["name"] == "ACME INDUSTRIE"
    assert lyon["nafCode"] == "62.02A"
    assert lyon["city"] == "Lyon"
    # Le score est calculé ET justifié facteur par facteur.
    assert 0 < lyon["score"] <= 100
    assert lyon["score"] == sum(f["points"] for f in lyon["scoreFactors"])
    assert all(f["evidence"] for f in lyon["scoreFactors"])
    assert body["degraded"] == []


def test_candidate_without_a_real_siren_is_never_emitted(client, registry, fallback) -> None:
    """Règle n°1 du contrat : « Un candidat sans SIREN résolu n'est jamais
    rendu. » C'est ce qui produisait « Fabricant Fenêtres / Industrie » en v1."""
    registry.rows = [ROW_NO_SIREN, ROW_LYON, {**ROW_PARIS, "siren": "not-a-siren"}]
    with _claude([]):
        body = _post(client).json()

    assert [c["siren"] for c in body["candidates"]] == ["552081317"]
    assert all(c["name"] != "FANTOME SARL" for c in body["candidates"])


def test_query_echoes_the_normalised_filters_actually_applied(client, registry, fallback) -> None:
    registry.rows = [ROW_LYON]
    with _claude([]):
        body = _post(client).json()

    assert body["query"]["nafCode"] == "62.02A"
    assert body["query"]["department"] == "69"
    assert body["query"]["headcountMin"] == 50


def test_candidates_carry_a_dated_source_and_a_default_portfolio_state(client, registry, fallback) -> None:
    """`portfolioState` est résolu côté API (qui seul connaît le portefeuille) ;
    l'IA rend la valeur neutre `new` plutôt que d'inventer un état."""
    registry.rows = [ROW_LYON]
    with _claude([]):
        candidate = _post(client).json()["candidates"][0]

    assert candidate["portfolioState"] == "new"
    assert candidate["accountId"] is None
    assert candidate["sources"] and candidate["sources"][0]["fetchedAt"]
    assert candidate["signals"] == []
    # #2546.2 — VERROU : quand un candidat n'a AUCUN signal daté et typé (le
    # cas normal ici, waterfall registre), `sources[0].name` reste
    # l'identifiant RÉEL de la source interrogée (`pappers` — voir la
    # priorité posée par `_collect_registry`, `discover.py`), jamais un nom
    # de fournisseur QU'ON NE PAIE PAS ni une valeur inventée du genre
    # « registre officiel ». Côté écran, `DATA_SOURCE_LABEL_KEYS`
    # (`apps/web/src/lib/data-source-label.ts`) reconnaît déjà cet
    # identifiant et le rend en CAPACITÉ (« la source de données
    # d'entreprises », jamais le nom du fournisseur, GA-44) — ce test
    # verrouille la valeur EXACTE que l'écran reçoit, pour que ce mapping ne
    # se rompe pas en silence si le waterfall change d'ordre.
    assert candidate["sources"][0]["name"] == "pappers"


# ── Le LLM ne produit QUE l'angle ───────────────────────────────────────────


def test_llm_angle_is_attached_by_siren(client, registry, fallback) -> None:
    registry.rows = [ROW_LYON]
    angles = [
        {
            "siren": "552081317",
            "angle": "Éditeur logiciel en croissance : besoin de renfort data.",
            "suggestedRoles": [{"title": "DSI", "department": "Informatique"}],
        }
    ]
    with _claude(angles):
        candidate = _post(client).json()["candidates"][0]

    assert candidate["angle"].startswith("Éditeur logiciel")
    assert candidate["suggestedRoles"] == [{"title": "DSI", "department": "Informatique"}]


def test_llm_cannot_smuggle_in_a_company_it_invented(client, registry, fallback) -> None:
    """Un SIREN que le modèle sort de son chapeau n'entre pas dans la réponse —
    la liste reste STRICTEMENT celle du registre."""
    registry.rows = [ROW_LYON]
    angles = [
        {"siren": "999999999", "angle": "Entreprise hallucinée", "suggestedRoles": []},
        {"siren": "552081317", "angle": "Angle légitime", "suggestedRoles": []},
    ]
    with _claude(angles):
        body = _post(client).json()

    assert [c["siren"] for c in body["candidates"]] == ["552081317"]
    assert body["candidates"][0]["angle"] == "Angle légitime"


def test_llm_score_is_discarded_the_score_stays_deterministic(client, registry, fallback) -> None:
    """Le badge doit rester calculé. Si le modèle renvoie quand même un score,
    il est jeté — sinon on réintroduit exactement le bug de la v1."""
    registry.rows = [ROW_LYON]
    with _claude([{"siren": "552081317", "angle": "x", "suggestedRoles": [], "score": 99, "priorityScore": 10}]):
        candidate = _post(client).json()["candidates"][0]

    assert candidate["score"] != 99
    assert candidate["score"] == sum(f["points"] for f in candidate["scoreFactors"])


def test_candidate_without_an_angle_gets_null_not_a_filler_sentence(client, registry, fallback) -> None:
    registry.rows = [ROW_LYON]
    with _claude([]):
        candidate = _post(client).json()["candidates"][0]

    assert candidate["angle"] is None
    assert candidate["suggestedRoles"] == []


# ── Garde-fous : degraded[], jamais de repli silencieux ─────────────────────


def test_primary_registry_failure_falls_back_and_is_reported(client, registry, fallback, monkeypatch) -> None:
    """Pappers HS / sans jeton → on bascule sur la source SANS CLÉ, et on le DIT."""

    async def _boom(filters, limit):
        raise RuntimeError("PAPPERS_API_KEY environment variable is not set")

    monkeypatch.setattr("app.routers.discover._registry_search", _boom)
    fallback.rows = [ROW_LYON]
    with _claude([]):
        body = _post(client).json()

    assert [c["siren"] for c in body["candidates"]] == ["552081317"]
    assert any(item["source"] == "pappers" for item in body["degraded"])
    assert body["degraded"][0]["reason"]


def test_all_registries_down_returns_zero_candidates_and_never_calls_the_model(
    client, registry, fallback, monkeypatch
) -> None:
    """Le pire cas de la v1 : Brave HS → run 100 % halluciné, sans signal. Ici,
    zéro source = zéro candidat, deux entrées `degraded`, et le modèle n'est
    même pas sollicité."""

    async def _boom(filters, limit):
        raise RuntimeError("http_502")

    monkeypatch.setattr("app.routers.discover._registry_search", _boom)
    monkeypatch.setattr("app.routers.discover._fallback_search", _boom)

    with patch("app.routers.discover.call_claude", new_callable=AsyncMock) as claude:
        body = _post(client).json()

    assert body["candidates"] == []
    assert {item["source"] for item in body["degraded"]} == {"pappers", "recherche-entreprises"}
    claude.assert_not_awaited()


def test_empty_registry_result_returns_zero_candidates_with_a_reason(client, registry, fallback) -> None:
    """Registre joignable mais sans réponse : ce n'est PAS une panne, c'est un
    résultat. On rend zéro candidat avec la raison — on ne laisse pas le modèle
    remplir le vide."""
    registry.rows, fallback.rows = [], []
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock) as claude:
        body = _post(client).json()

    assert body["candidates"] == []
    assert any(item["reason"] == "no_match" for item in body["degraded"])
    claude.assert_not_awaited()


def test_llm_failure_still_returns_the_registry_candidates(client, registry, fallback) -> None:
    """L'angle est un BONUS. Si Claude tombe, les faits registre — eux — sont
    déjà vrais : on rend les candidats scorés, sans angle, et on le signale."""
    registry.rows = [ROW_LYON]
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, side_effect=RuntimeError("529")):
        body = _post(client).json()

    assert [c["siren"] for c in body["candidates"]] == ["552081317"]
    assert body["candidates"][0]["angle"] is None
    assert body["candidates"][0]["score"] > 0, "le score reste calculé sans le LLM"
    assert any(item["source"] == "claude" for item in body["degraded"])


def test_degraded_is_never_silently_swallowed_on_a_partial_run(client, registry, fallback, monkeypatch) -> None:
    """Une source qui tombe ET un modèle qui tombe : les deux sont listés."""

    async def _boom(filters, limit):
        raise RuntimeError("quota")

    monkeypatch.setattr("app.routers.discover._registry_search", _boom)
    fallback.rows = [ROW_LYON]
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, side_effect=RuntimeError("boom")):
        body = _post(client).json()

    assert {item["source"] for item in body["degraded"]} == {"pappers", "claude"}
    assert body["candidates"][0]["score"] > 0


# ── Bornes d'entrée ─────────────────────────────────────────────────────────


def test_limit_is_clamped_and_forwarded_to_the_registry(client, registry, fallback) -> None:
    registry.rows = [ROW_LYON]
    with _claude([]):
        client.post("/discover/registry", json={"filters": FILTERS, "limit": 5000})

    # #4016 L7 — Découvrir sans palier : la borne dure passe de 50 à 200
    # (`MAX_REGISTRY_LIMIT`, borne technique) ; elle protège toujours le quota.
    assert registry.calls[0][1] <= 200, "une borne dure protège le quota registre"


def test_filters_may_be_omitted_entirely(client, registry, fallback) -> None:
    """Sans critère, la découverte reste légale : le registre décide, pas le LLM."""
    registry.rows = [ROW_LYON]
    with _claude([]):
        res = client.post("/discover/registry", json={})

    assert res.status_code == 200
    assert res.json()["candidates"][0]["siren"] == "552081317"


# ── Mesurabilité : « non évalué » n'est pas « 0/100 » ──────────────────────


def test_unmeasured_criteria_travel_with_the_candidate(client, registry, fallback) -> None:
    """Le chemin registre ne collecte pas de signaux (il le dit lui-même) : le
    bloc doit sortir en `scoreUnmeasured` et son plafond quitter `scoreMax`,
    plutôt que se faire compter comme un « 0 sur 25 »."""
    registry.rows = [ROW_LYON]
    with _claude([]):
        candidate = _post(client).json()["candidates"][0]

    assert "signals" in candidate["scoreUnmeasured"]
    # Deux blocs quittent le dénominateur sur ce chemin : les signaux (le
    # registre n'en collecte pas) et l'accessibilité (aucun interlocuteur n'est
    # connu à ce stade — cf. barème p41).
    assert candidate["scoreMax"] == 100 - 20 - 20
    assert candidate["score"] <= candidate["scoreMax"]


def test_the_least_informed_candidate_ranks_last(client, registry, fallback) -> None:
    """Un candidat dont on ne sait presque rien se range EN FIN de liste.

    Le chemin registre impose un SIREN (« pas de SIREN = candidat écarté »), donc
    une ligne y arrive toujours avec au moins une identité résolue — assez pour
    que la qualité des preuves soit mesurable, jamais assez pour la porter en
    tête. Ce qu'on vérifie ici, c'est que le tri ne le remonte pas et ne plante
    pas sur un dénominateur différent d'un candidat à l'autre.
    """
    naked = {"name": "SANS FAITS", "siren": "111222333"}
    registry.rows = [naked, ROW_LYON]
    with _claude([]):
        body = _post(client).json()

    candidates = body["candidates"]
    assert candidates[0]["score"] is not None and candidates[0]["score"] > 0
    assert candidates[-1]["name"] == "SANS FAITS"
    assert candidates[-1]["score"] < candidates[0]["score"]


# ── Le conseil de qualification (#2614.1) ───────────────────────────────────


def test_qualification_exclusions_beyond_the_limit_are_still_counted(client, registry, fallback) -> None:
    """#2614.1 — réfuté en recette écran le 21/09/2026 : le tri place les
    verdicts EXCLU en dernier (`_VERDICT_RANK`), et `candidates[:limit]` les
    retire donc TOUS dès que la recherche en trouve plus que `limit` —
    `hiddenCandidatesBreakdown` (écran), qui ne voit que ce qui a survécu à
    la coupe, retombait alors à zéro alors que des comptes avaient bien été
    écartés. Le total RÉEL, compté avant la coupe, doit voyager dans `query`
    (même canal que `query.reading`) pour ne jamais dépendre de ce qui
    survit à la limite d'affichage."""
    good = [{**ROW_LYON, "siren": str(552081317 + i), "name": f"BONNE {i}"} for i in range(3)]
    excluded = [{**ROW_LYON, "siren": str(600000000 + i), "name": f"CESSEE {i}", "ceased": True} for i in range(2)]
    registry.rows = good + excluded
    with _claude([]):
        body = _post(client, limit=3).json()

    assert len(body["candidates"]) == 3
    assert all(c["qualification"]["verdict"] != "excluded" for c in body["candidates"]), (
        "les 2 exclus sont bien coupés par la limite — c'est la coupe elle-même qui est testée"
    )
    assert body["query"]["qualificationExcludedTotal"] == 2


def test_qualification_excluded_total_is_zero_when_none_were_excluded(client, registry, fallback) -> None:
    """Pas de fabrication : zéro exclusion réelle doit rendre 0, jamais une
    valeur absente ni devinée. Deux lignes DANS la cible demandée (`FILTERS`)
    — `ROW_PARIS`, hors zone ET hors secteur par rapport à `FILTERS`, aurait
    lui-même un verdict EXCLU et fausserait ce zéro."""
    registry.rows = [ROW_LYON, {**ROW_LYON, "siren": "552081318", "name": "ACME BIS"}]
    with _claude([]):
        body = _post(client).json()

    assert body["query"]["qualificationExcludedTotal"] == 0


# ── La coupe à `limit` se DIT (#4706.1) ─────────────────────────────────────


def test_a_list_cut_at_the_limit_says_shown_of_at_least_found(client, registry, fallback) -> None:
    """#4706.1 — « Siège dans la zone » rendait 24 comptes contre 17 pour « Implanté dans la zone » : la liste est
    coupée à `limit` après tri, et l'écran ne le disait pas. Le moteur écrit dans `query.listCut` ce qu'il a affiché
    et ce qu'il avait trouvé avant la coupe ; le total est une borne BASSE (le registre n'est lu que par pages)."""
    registry.rows = [{**ROW_LYON, "siren": str(552081317 + i), "name": f"BONNE {i}"} for i in range(5)]
    with _claude([]):
        body = _post(client, limit=3).json()

    assert len(body["candidates"]) == 3
    assert body["query"]["listCut"] == {"shown": 3, "found": 5, "isLowerBound": True}


def test_a_list_not_cut_says_nothing_about_a_cut(client, registry, fallback) -> None:
    """Rien n'a été coupé : pas de `listCut` (jamais « 3 sur au moins 3 »)."""
    registry.rows = [{**ROW_LYON, "siren": str(552081317 + i), "name": f"BONNE {i}"} for i in range(3)]
    with _claude([]):
        body = _post(client, limit=3).json()

    assert len(body["candidates"]) == 3
    assert "listCut" not in body["query"]


# ── L'entonnoir de rejet du chemin registre (#4419) ─────────────────────────


def test_funnel_counts_what_the_qualification_set_aside_by_criterion(client, registry, fallback) -> None:
    """#4419 — entrés / retenus / écartés PAR CRITÈRE sur le chemin registre : une personne physique
    (catégorie juridique 1…) et un hors-zone sont comptés sous leur critère ; un critère qui n'a
    rien écarté (ici le secteur) est ABSENT, jamais « 0 »."""
    good = {**ROW_LYON, "siren": "552081317"}
    person = {**ROW_LYON, "siren": "600000001", "name": "BEN HRIZ AYA", "legalCategory": "1000"}
    elsewhere = {**ROW_LYON, "siren": "600000002", "name": "HORS ZONE", "city": "Paris", "department": "75"}
    registry.rows = [good, person, elsewhere]
    with _claude([]):
        body = client.post("/discover/registry", json={"filters": {**FILTERS, "departments": ["69"]}}).json()

    funnel = body["query"]["funnel"]
    assert funnel["entered"] == 3
    assert funnel["kept"] == 1
    assert funnel["rejected"]["individual"] == 1
    assert funnel["rejected"]["zone"] == 1
    assert "sector" not in funnel["rejected"]
    assert funnel["entered"] == funnel["kept"] + sum(funnel["rejected"].values())


def test_funnel_is_absent_when_nothing_was_evaluated(client, registry, fallback) -> None:
    registry.rows = []
    with _claude([]):
        body = _post(client).json()
    assert "funnel" not in body["query"]
