"""Sources emploi complémentaires (roadmap §8) — APEC (active par défaut,
politique zéro-flag) + WTTJ (no-op documenté sans identifiants Algolia) + fusion
additive dédupliquée par URL. Mocked HTTP — aucune source ne doit jamais casser
la recherche ni inventer une offre."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources.apec import it_job_signals_apec
from app.services.data_sources.wttj import it_job_signals_wttj
from app.services.dated_signals import merge_job_signals, render_dated_signals


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("POST", "https://x"))


def _post_client(resp: httpx.Response) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=resp)
    return c


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).isoformat()


# ── APEC ──────────────────────────────────────────────────────────────────────


def _apec_payload() -> dict:
    """Forme RÉELLE vérifiée le 2026-07-16 contre le webservice public
    ``rechercheOffre`` (clés observées dans la réponse live)."""
    return {
        "totalCount": 3,
        "resultats": [
            {
                "id": 178968882,
                "numeroOffre": "178968882W",
                "intitule": "Ingénieur DevOps F/H",
                "nomCommercial": "SNCF",  # #3901 : employeur == compte (une filiale serait écartée)
                "lieuTexte": "Lille - 59",
                "salaireTexte": "45 - 55 k€ brut annuel",
                "texteOffre": "Kubernetes, Terraform, CI/CD sur le cloud AWS…",
                "datePublication": _iso(3),
                "typeContrat": 101888,
            },
            {
                "numeroOffre": "178968883W",
                "intitule": "Chef de projet SI F/H",
                "nomCommercial": "SNCF",
                "lieuTexte": "Paris - 75",
                "texteOffre": "Pilotage du système d'information voyageurs.",
                "datePublication": _iso(10),
            },
            {
                # NON-IT — doit être filtrée (l'APEC couvre toutes les fonctions cadres).
                "numeroOffre": "178968884W",
                "intitule": "Responsable comptable F/H",
                "nomCommercial": "SNCF",
                "lieuTexte": "Lyon - 69",
                "texteOffre": "Comptabilité générale, clôtures mensuelles, fiscalité.",
                "datePublication": _iso(1),
            },
        ],
    }


async def test_apec_active_by_default_no_env_needed() -> None:
    """Politique zéro-flag : APEC tourne sans aucune variable d'environnement."""
    out = await it_job_signals_apec("SNCF", client=_post_client(_resp(_apec_payload())))
    assert [j["source"] for j in out] == ["apec", "apec"]


async def test_apec_empty_company_makes_no_call() -> None:
    client = _post_client(_resp(_apec_payload()))
    assert await it_job_signals_apec("  ", client=client) == []
    client.post.assert_not_called()


async def test_apec_parses_typed_signals_and_filters_non_it() -> None:
    out = await it_job_signals_apec("SNCF", client=_post_client(_resp(_apec_payload())))
    # L'offre comptable (non-IT) est filtrée ; les 2 offres IT restent, récent-first.
    assert [j["title"] for j in out] == ["Ingénieur DevOps F/H", "Chef de projet SI F/H"]
    devops = out[0]
    assert devops["company"] == "SNCF"
    assert devops["location"] == "Lille - 59"
    assert devops["city"] == "Lille" and devops["department"] == "59"
    assert devops["salary"] == "45 - 55 k€ brut annuel"
    assert devops["url"] == "https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/178968882W"
    assert devops["source"] == "apec"
    assert devops["skills"] == [] and devops["contractType"] is None  # rien d'inventé


async def test_apec_keeps_old_offers_stamped_historical(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APEC_JOBS_ENABLED", "true")
    payload = {
        "resultats": [
            {
                "numeroOffre": "1W",
                # L'employeur est nommé : sans lui, l'offre serait écartée par le
                # filtre de RATTACHEMENT et ce test ne dirait plus rien de la
                # récence, qui est son seul sujet.
                "nomCommercial": "SNCF",
                "intitule": "Développeur Java F/H",
                "texteOffre": "Java, Spring.",
                "datePublication": _iso(400),  # > ~12 mois → gardée, estampillée (#4754)
            },
            {
                "numeroOffre": "2W",
                "nomCommercial": "SNCF",
                "intitule": "Développeur Python F/H",
                "texteOffre": "Python, FastAPI.",
                "datePublication": _iso(30),
            },
        ]
    }
    out = await it_job_signals_apec("SNCF", client=_post_client(_resp(payload)))
    assert [j["title"] for j in out] == ["Développeur Python F/H", "Développeur Java F/H"]
    assert out[1]["historical"] is True and "historical" not in out[0]


async def test_apec_graceful_on_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APEC_JOBS_ENABLED", "true")
    assert await it_job_signals_apec("SNCF", client=_post_client(_resp({}, status=500))) == []


async def test_apec_graceful_on_network_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APEC_JOBS_ENABLED", "true")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(side_effect=httpx.ConnectError("boom"))
    assert await it_job_signals_apec("SNCF", client=c) == []


async def test_apec_graceful_on_malformed_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APEC_JOBS_ENABLED", "true")
    assert await it_job_signals_apec("SNCF", client=_post_client(_resp({"weird": 1}))) == []
    assert await it_job_signals_apec("SNCF2", client=_post_client(_resp({"resultats": ["x", 42]}))) == []


async def test_3817_retries_without_country_suffix_when_the_full_name_finds_nothing() -> None:
    """#3817.1 — JCDecaux France : la requête plein texte complète ne répond rien,
    la marque seule, si. Le nom complet est tenté EN PREMIER."""
    seen_keywords: list[str] = []

    async def _post(_url, *, json, **_kwargs):
        seen_keywords.append(json["motsCles"])
        if json["motsCles"] == "JCDecaux":
            return _resp(
                {
                    "resultats": [
                        {
                            "numeroOffre": "1W",
                            "nomCommercial": "JCDecaux",
                            "intitule": "Chef de projet informatique F/H",
                            "texteOffre": "Pilotage SI.",
                            "datePublication": _iso(3),
                        }
                    ]
                }
            )
        return _resp({"resultats": []})

    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(side_effect=_post)
    out = await it_job_signals_apec("JCDecaux France", client=client)
    assert [j["title"] for j in out] == ["Chef de projet informatique F/H"]
    assert seen_keywords[0] == "JCDecaux France"
    assert "JCDecaux" in seen_keywords


# ── WTTJ ──────────────────────────────────────────────────────────────────────


def _wttj_payload() -> dict:
    """Réponse au format Algolia DOCUMENTÉ (``{hits: [...]}``) — le mapping des
    hits est défensif (champ absent → None, jamais inventé)."""
    return {
        "hits": [
            {
                "name": "Data Engineer",
                "slug": "data-engineer",
                "published_at": _iso(5),
                "contract_type": {"fr": "CDI"},
                "organization": {"name": "Doctolib", "slug": "doctolib"},
                "offices": [{"city": "Paris", "country": "France"}],
                "skills": [{"name": "Python"}, {"name": "Airflow"}, "dbt"],
            },
            {
                "name": "DevOps Engineer",
                "slug": "devops-engineer",
                "published_at": _iso(700),  # lot 762 : très vieille → GARDÉE, estampillée historical
                "organization": {"name": "Doctolib", "slug": "doctolib"},
            },
            {"published_at": _iso(1)},  # sans titre → ignorée
        ]
    }


async def test_wttj_noop_without_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in ("WTTJ_ALGOLIA_APP_ID", "WTTJ_ALGOLIA_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    client = _post_client(_resp(_wttj_payload()))
    assert await it_job_signals_wttj("Doctolib", client=client) == []
    client.post.assert_not_called()  # no-op DOCUMENTÉ: pas d'API publique gratuite


async def test_wttj_noop_with_partial_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WTTJ_ALGOLIA_APP_ID", "OPID")
    monkeypatch.delenv("WTTJ_ALGOLIA_API_KEY", raising=False)
    client = _post_client(_resp(_wttj_payload()))
    assert await it_job_signals_wttj("Doctolib", client=client) == []
    client.post.assert_not_called()


async def test_wttj_parses_typed_signals(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WTTJ_ALGOLIA_APP_ID", "OPID")
    monkeypatch.setenv("WTTJ_ALGOLIA_API_KEY", "opkey")
    out = await it_job_signals_wttj("Doctolib", client=_post_client(_resp(_wttj_payload())))
    # Lot 762 : l'offre très vieille est GARDÉE estampillée ``historical`` ; le hit sans titre est écarté.
    assert [j["title"] for j in out] == ["Data Engineer", "DevOps Engineer"]
    assert out[1].get("historical") is True and not out[0].get("historical")
    job = out[0]
    assert job["company"] == "Doctolib"
    assert job["city"] == "Paris" and job["location"] == "Paris"
    assert job["contractType"] == "CDI"  # dict localisé {"fr": ...} géré
    assert job["skills"] == ["Python", "Airflow", "dbt"]
    assert job["url"] == "https://www.welcometothejungle.com/fr/companies/doctolib/jobs/data-engineer"
    assert job["source"] == "wttj"


async def test_wttj_queries_operator_index(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WTTJ_ALGOLIA_APP_ID", "OPID")
    monkeypatch.setenv("WTTJ_ALGOLIA_API_KEY", "opkey")
    monkeypatch.setenv("WTTJ_ALGOLIA_INDEX", "my_index")
    client = _post_client(_resp({"hits": []}))
    await it_job_signals_wttj("Doctolib", client=client)
    url = client.post.call_args.args[0]
    assert "opid-dsn.algolia.net" in url.lower() and "my_index" in url


async def test_wttj_graceful_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WTTJ_ALGOLIA_APP_ID", "OPID")
    monkeypatch.setenv("WTTJ_ALGOLIA_API_KEY", "opkey")
    assert await it_job_signals_wttj("Doctolib", client=_post_client(_resp({}, status=403))) == []
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(side_effect=httpx.ConnectError("boom"))
    assert await it_job_signals_wttj("Doctolib2", client=c) == []


# ── Fusion additive + dédup URL ───────────────────────────────────────────────


def test_merge_dedups_by_url_first_source_wins() -> None:
    ft = [{"title": "Dev Java", "url": "https://jobs/1"}]
    apec = [{"title": "Dev Java (APEC)", "url": "HTTPS://JOBS/1"}, {"title": "Chef de projet SI", "url": "https://jobs/2"}]
    out = merge_job_signals(ft, apec)
    assert [j["title"] for j in out] == ["Dev Java", "Chef de projet SI"]


def test_merge_never_dedups_urlless_jobs() -> None:
    # France Travail ne porte pas d'URL : deux postes au même intitulé dans deux
    # villes sont deux signaux réels — jamais dédupliqués.
    ft = [
        {"title": "Ingénieur DevOps", "location": "75 - PARIS"},
        {"title": "Ingénieur DevOps", "location": "59 - LILLE"},
    ]
    assert len(merge_job_signals(ft, [])) == 2


def test_merge_single_source_keeps_order_byte_identical() -> None:
    ft = [{"title": f"job {i}"} for i in range(5)]
    assert merge_job_signals(ft, [], []) == ft


def test_merge_interleaves_sources_round_robin() -> None:
    ft = [{"title": "ft1", "url": "u1"}, {"title": "ft2", "url": "u2"}]
    apec = [{"title": "apec1", "url": "u3"}]
    wttj = [{"title": "wttj1", "url": "u4"}]
    out = merge_job_signals(ft, apec, wttj)
    # Chaque source reste visible dans le cap du bloc prompt.
    assert [j["title"] for j in out] == ["ft1", "apec1", "wttj1", "ft2"]


def test_merge_ignores_non_list_sources_gracefully() -> None:
    assert merge_job_signals(None, "boom", [{"title": "ok"}, 42]) == [{"title": "ok"}]
    assert merge_job_signals() == []


def test_merged_jobs_render_in_prompt_block() -> None:
    ft = [{"title": "Ingénieur DevOps", "location": "75 - PARIS", "date": "2026-06-30", "skills": ["Kubernetes"]}]
    apec = [
        {
            "title": "Chef de projet SI F/H",
            "location": "Lille - 59",
            "date": "2026-07-01",
            "contractType": None,
            "skills": [],
            "url": "https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/1W",
            "source": "apec",
        }
    ]
    out = render_dated_signals([], merge_job_signals(ft, apec), [])
    assert "OFFRES D'EMPLOI IT" in out
    assert "Ingénieur DevOps" in out and "Chef de projet SI F/H" in out
    assert "2026-07-01" in out and "Lille - 59" in out
