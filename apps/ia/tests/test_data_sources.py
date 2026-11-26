"""Free parallel sources — recherche-entreprises, BODACC, Brave News, BOAMP
marchés publics, GitHub org. Mocked HTTP."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources import _http_pool
from app.services.data_sources import bodacc as bodacc_module
from app.services.data_sources import public_tenders as public_tenders_module
from app.services.data_sources.apec import it_job_signals_apec
from app.services.data_sources.ats_boards import it_job_signals_ats
from app.services.data_sources.bodacc import legal_signals
from app.services.data_sources.brave_news import recent_news
from app.services.data_sources.decp import awarded_it_contracts
from app.services.data_sources.france_travail import is_it_offer, it_job_signals
from app.services.data_sources.geo_communes import search_communes
from app.services.data_sources.github_org import org_tech_signals
from app.services.data_sources.inpi_rne import _walk_beneficiaires, beneficial_owners
from app.services.data_sources.public_tenders import list_tender_buyers, public_tenders
from app.services.data_sources.recherche_entreprises import fetch_company
from app.services.data_sources.serper import serper_search
from app.services.data_sources.tavily import tavily_search
from app.services.data_sources.tech_detect import detect_from, detect_stack


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("GET", "https://x"))


def _client(resp: httpx.Response) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=resp)
    return c


def _dispatch_client(routes: list[tuple[str, httpx.Response]]) -> AsyncMock:
    """Mock client whose .get() returns a different response per URL substring
    (first match wins — order the list most-specific first)."""
    c = AsyncMock(spec=httpx.AsyncClient)

    async def _get(url, *_args, **_kwargs):
        for substr, resp in routes:
            if substr in url:
                return resp
        raise AssertionError(f"unexpected url {url}")

    c.get = AsyncMock(side_effect=_get)
    return c


@pytest.mark.asyncio
async def test_3504_la_tranche_inse_voyage_comme_code_jamais_comme_effectif() -> None:
    """#3504 — SocGen : « effectif 53 salariés » contredisait « Plus de 10 000 ».

    `fetch_company` ne portait le code INSEE que sous `headcountRange` ; la
    barrière d'achat retombait dessus et lisait « 53 » comme 53 SALARIÉS. Le
    code doit voyager sous `headcountTranche`, que la barrière décode (53 → 20 000).
    """
    from app.services.access_scoring import barrier_for_company

    payload = {"results": [{"siren": "552120222", "nom_complet": "SOCIETE GENERALE", "tranche_effectif_salarie": "53"}]}
    out = await fetch_company("Société Générale", client=_client(_resp(payload)))
    assert out["headcountTranche"] == "53"
    barrier = barrier_for_company({"headcountTranche": out["headcountTranche"], "headcountRange": out["headcountRange"]})
    evidence = " ".join(str(p.get("evidence")) for p in barrier["proxies"] if p["key"] == "effectif")
    assert "effectif 53 salariés" not in evidence
    assert "20000" in evidence


@pytest.mark.asyncio
async def test_recherche_entreprises_parses_company() -> None:
    payload = {
        "results": [
            {
                "siren": "775577018",
                "nom_complet": "CREDIT MUTUEL ARKEA",
                "activite_principale": "64.19Z",
                "tranche_effectif_salarie": "52",
                "nombre_etablissements": 480,
                "dirigeants": [{"prenoms": "Hélène", "nom": "Bernard", "qualite": "Directeur général"}],
            }
        ]
    }
    out = await fetch_company("Crédit Mutuel Arkéa", client=_client(_resp(payload)))
    assert out["siren"] == "775577018"
    assert out["nafCode"] == "64.19Z"
    assert out["dirigeants"] == [{"name": "Hélène Bernard", "role": "Directeur général"}]


# #3876 (VU EN PASSANT, lot V09 08/10) — `fetch_company` lisait `siege.commune`
# pour la commune du siège : un champ qui n'existe pas dans la réponse réelle
# de `recherche-entreprises` (elle porte `libelle_commune`, comme les deux
# autres fonctions de ce fichier qui le lisent déjà, `_candidate`/`_list_row`).
# `city` rendait donc toujours `None`, même quand le siège a une commune
# connue — exactement ce que #3876 demande de ne JAMAIS faire : une donnée
# connue doit s'afficher, pas disparaître derrière une mauvaise clé.
@pytest.mark.asyncio
async def test_3876_fetch_company_reads_the_real_commune_label() -> None:
    payload = {
        "results": [
            {
                "siren": "552049447",
                "nom_complet": "SOCIETE GENERALE",
                "siege": {
                    "adresse": "29 BOULEVARD HAUSSMANN",
                    "libelle_commune": "PARIS 9",
                    "code_postal": "75009",
                },
            }
        ]
    }
    out = await fetch_company("Société Générale", client=_client(_resp(payload)))
    assert out["city"] == "PARIS 9"
    assert out["postalCode"] == "75009"
    assert out["address"] == "29 BOULEVARD HAUSSMANN"


@pytest.mark.asyncio
async def test_3876_fetch_company_names_no_city_it_does_not_know() -> None:
    """Un siège sans commune publiée rend `None` — jamais une valeur devinée."""
    payload = {"results": [{"siren": "552049447", "nom_complet": "SOCIETE GENERALE", "siege": {}}]}
    out = await fetch_company("Société Générale", client=_client(_resp(payload)))
    assert out["city"] is None


@pytest.mark.asyncio
async def test_recherche_entreprises_empty_name() -> None:
    assert await fetch_company("") is None


@pytest.mark.asyncio
async def test_recherche_entreprises_degrades_on_error() -> None:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=httpx.ConnectError("boom"))
    assert await fetch_company("X", client=c) is None


@pytest.mark.asyncio
async def test_bodacc_maps_signals() -> None:
    payload = {
        "records": [
            {"fields": {"dateparution": "2026-06-30", "familleavis_lib": "Dépôts des comptes", "commercant": "CM ARKEA"}},
            {"fields": {"dateparution": "2026-06-09", "familleavis_lib": "Modifications diverses", "commercant": "CM ARKEA"}},
        ]
    }
    out = await legal_signals("775577018", client=_client(_resp(payload)))
    assert [s["type"] for s in out] == ["Dépôts des comptes", "Modifications diverses"]
    assert out[0]["date"] == "2026-06-30"


@pytest.mark.asyncio
async def test_bodacc_3916_url_and_siren_attachment() -> None:
    """#3916 — l'annonce porte son lien officiel ; une annonce dont le registre
    nomme un AUTRE SIREN (la recherche est plein-texte) est écartée."""
    payload = {
        "records": [
            {
                "fields": {
                    "dateparution": "2026-06-30",
                    "familleavis_lib": "Dépôts des comptes",
                    "commercant": "ACME",
                    "registre": ["775 577 018", "775577018"],
                    "url_complete": "https://www.bodacc.fr/pages/annonce-visualisation/?q.id=id:B202600001",
                }
            },
            {"fields": {"dateparution": "2026-06-01", "familleavis_lib": "Vente", "commercant": "AUTRE", "registre": ["111 222 333"]}},
        ]
    }
    out = await legal_signals("775577018", client=_client(_resp(payload)))
    assert len(out) == 1
    assert out[0]["url"].startswith("https://www.bodacc.fr/")


# Forme RÉELLE du jeu de données (relevée sur l'API publique le 11/10/2026) :
# `registre` est UNE chaîne « 395030844,395 030 844 », jamais une liste.
_SANOFI_MODIFICATION = {
    "fields": {
        "dateparution": "2026-09-04",
        "familleavis": "modification",
        "familleavis_lib": "Modifications diverses",
        "typeavis_lib": "Avis initial",
        "commercant": "SANOFI",
        "registre": "395030844,395 030 844",
        "tribunal": "Greffe du Tribunal des Activités Economiques de Paris",
        "modificationsgenerales": '{"descriptif": "modification survenue sur le capital (diminution)"}',
        "url_complete": "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:B202601691118",
    }
}


@pytest.mark.asyncio
async def test_bodacc_3916_registre_chaine_reelle_rattache_au_siren() -> None:
    """#3916 (recette prod 11/10) — aucune annonce sur la fiche Sanofi : le filtre SIREN
    concaténait tous les chiffres de la chaîne « 395030844,395 030 844 » en un seul
    nombre, qui ne valait jamais le SIREN → TOUTES les annonces étaient écartées."""
    other = {"fields": {**_SANOFI_MODIFICATION["fields"], "registre": "111222333,111 222 333", "commercant": "AUTRE"}}
    out = await legal_signals("395030844", client=_client(_resp({"records": [_SANOFI_MODIFICATION, other]})))
    assert [r["label"] for r in out] == ["SANOFI"]
    assert out[0]["url"].startswith("https://www.bodacc.fr/")


@pytest.mark.asyncio
async def test_bodacc_3916_precise_type_named_not_just_the_family() -> None:
    """« Modifications diverses » ne dit rien : la précision (descriptif de la
    modification, nature du jugement, type de dépôt) est lue quand l'annonce la porte."""
    judgment = {
        "fields": {
            **_SANOFI_MODIFICATION["fields"],
            "familleavis_lib": "Procédures collectives",
            "jugement": '{"famille": "Jugement prononçant", "nature": "Jugement de conversion en liquidation judiciaire"}',
        }
    }
    deposit = {
        "fields": {
            **{k: v for k, v in _SANOFI_MODIFICATION["fields"].items() if k != "modificationsgenerales"},
            "familleavis_lib": "Dépôts des comptes",
            "depot": '{"dateCloture": "2025-12-31", "typeDepot": "Comptes annuels et rapports"}',
        }
    }
    bare = {"fields": {k: v for k, v in _SANOFI_MODIFICATION["fields"].items() if k != "modificationsgenerales"}}
    out = await legal_signals("395030844", client=_client(_resp({"records": [_SANOFI_MODIFICATION, judgment, deposit, bare]})))
    assert [r["precision"] for r in out] == [
        "modification survenue sur le capital (diminution)",
        "Jugement de conversion en liquidation judiciaire",
        "Comptes annuels et rapports",
        None,
    ]


@pytest.mark.asyncio
async def test_bodacc_rejects_bad_siren() -> None:
    assert await legal_signals("123") == []  # not 9 digits → no call


@pytest.mark.asyncio
async def test_bodacc_reuses_one_http_client_across_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2604 — `httpx.AsyncClient()` fait un travail SYNCHRONE (contexte SSL,
    pool de connexions), mesuré à 2-12 ms, qui bloque la boucle d'événements
    AVANT le premier `await`. Sans client fourni, `_legal_signals_uncached`
    en construisait un NEUF puis le refermait À CHAQUE appel — payé une fois
    par candidat ciblé par `_start_signal_tasks` (discover.py), donc
    multiplié. Preuve : deux SIRENs distincts (pour éviter le cache) partagent
    le MÊME client HTTP, construit une seule fois."""
    monkeypatch.setattr(bodacc_module, "_shared_client", None)
    built: list[httpx.AsyncClient] = []
    original_init = httpx.AsyncClient.__init__

    def _tracking_init(self: httpx.AsyncClient, *a: object, **kw: object) -> None:
        built.append(self)
        original_init(self, *a, **kw)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", _tracking_init)
    monkeypatch.setattr(httpx.AsyncClient, "get", AsyncMock(return_value=_resp({"records": []})))

    await legal_signals("111222333")
    await legal_signals("444555666")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"


@pytest.mark.asyncio
async def test_brave_news_empty_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)
    assert await recent_news("Crédit Mutuel") == []


@pytest.mark.asyncio
async def test_brave_news_parses(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    payload = {"results": [{"title": "Arkéa rachète X", "url": "https://x", "age": "2 days", "description": "..."}]}
    out = await recent_news("Crédit Mutuel Arkéa", client=_client(_resp(payload)))
    assert out[0]["title"] == "Arkéa rachète X"
    assert out[0]["url"] == "https://x"


def test_tech_detect_matches_html_and_headers() -> None:
    html = '<html><script src="/_next/static/x.js"></script><div data-reactroot></div></html>'
    headers = {"Server": "cloudflare", "X-Powered-By": "PHP/8.1"}
    found = detect_from(html, headers)
    assert "React" in found and "Next.js" in found
    assert "Cloudflare" in found and "PHP" in found


def test_tech_detect_empty_on_nothing() -> None:
    assert detect_from("", {}) == []


@pytest.mark.asyncio
async def test_tech_detect_empty_url() -> None:
    assert await detect_stack("") == []


@pytest.mark.asyncio
async def test_france_travail_empty_without_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FRANCE_TRAVAIL_CLIENT_ID", raising=False)
    monkeypatch.delenv("FRANCE_TRAVAIL_CLIENT_SECRET", raising=False)
    assert await it_job_signals("Crédit Mutuel") == []


_ARKEA = {"nom": "Crédit Mutuel Arkéa"}  # #3901 : l'employeur doit être nommé et correspondre


@pytest.mark.asyncio
async def test_france_travail_token_then_search(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))
    c.get = AsyncMock(
        return_value=_resp(
            {
                "resultats": [
                    {
                        "intitule": "Développeur Java H/F",
                        "lieuTravail": {"libelle": "Brest"},
                        "dateCreation": "2026-06-01",
                        "competences": [{"libelle": "Java"}, {"libelle": "Spring"}],
                        "entreprise": {"nom": "Crédit Mutuel Arkéa"},
                    }
                ]
            }
        )
    )
    out = await it_job_signals("Crédit Mutuel Arkéa", client=c)
    assert out[0]["title"] == "Développeur Java H/F"
    assert out[0]["skills"] == ["Java", "Spring"]


@pytest.mark.asyncio
async def test_france_travail_enriched_recent_and_geo(monkeypatch: pytest.MonkeyPatch) -> None:
    """ÉLARGI: enriched fields present, old (>12 mo) offers dropped, most-recent
    first, precise geo (department + city) parsed. Old keys stay intact."""
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    now = datetime.now(UTC)
    recent_a = (now - timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%SZ")  # newest → first
    recent_b = (now - timedelta(days=100)).strftime("%Y-%m-%dT%H:%M:%SZ")
    old = (now - timedelta(days=400)).strftime("%Y-%m-%dT%H:%M:%SZ")  # > 12 months → dropped
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))
    c.get = AsyncMock(
        return_value=_resp(
            {
                "resultats": [
                    {
                        "intitule": "Ingénieur DevOps H/F",
                        "lieuTravail": {"libelle": "75 - Paris", "codePostal": "75001", "commune": "75101"},
                        "dateCreation": recent_a,
                        "dateActualisation": recent_a,
                        "typeContratLibelle": "CDI",
                        "experienceLibelle": "Expérience exigée de 3 An(s)",
                        "salaire": {"libelle": "45000 - 55000 EUR par an"},
                        "romeCode": "M1805",
                        "romeLibelle": "Études et développement informatique",
                        "entreprise": {"nom": "Crédit Mutuel Arkéa"},
                        "competences": [{"libelle": "Kubernetes"}, {"libelle": "Terraform"}],
                    },
                    {
                        "intitule": "Développeur Backend",
                        "entreprise": _ARKEA,
                        "lieuTravail": {"libelle": "29 - Brest"},
                        "dateCreation": recent_b,
                        "typeContratLibelle": "CDD",
                        "competences": [{"libelle": "Go"}],
                        "entreprise": {"nom": "Crédit Mutuel Arkéa"},
                    },
                    {
                        "intitule": "Vieux poste périmé",
                        "lieuTravail": {"libelle": "75 - Paris"},
                        "dateCreation": old,
                        "dateActualisation": old,
                    },
                ]
            }
        )
    )
    out = await it_job_signals("Crédit Mutuel Arkéa", client=c)
    # Old offer dropped, 2 recent kept.
    assert len(out) == 2
    # Sorted most-recent first.
    assert out[0]["title"] == "Ingénieur DevOps H/F"
    assert out[1]["title"] == "Développeur Backend"
    # Old keys intact.
    assert out[0]["location"] == "75 - Paris"
    assert out[0]["date"] == recent_a
    assert out[0]["contractType"] == "CDI"
    assert out[0]["skills"] == ["Kubernetes", "Terraform"]
    # Enriched keys present.
    assert out[0]["experience"] == "Expérience exigée de 3 An(s)"
    assert out[0]["salary"] == "45000 - 55000 EUR par an"
    assert out[0]["romeCode"] == "M1805"
    assert out[0]["romeLabel"] == "Études et développement informatique"
    assert out[0]["company"] == "Crédit Mutuel Arkéa"
    # Precise geo: department + city parsed from libelle/codePostal.
    assert out[0]["department"] == "75"
    assert out[0]["city"] == "Paris"
    # Department parsed from the libelle prefix when no codePostal.
    assert out[1]["department"] == "29"
    assert out[1]["city"] == "Brest"


@pytest.mark.asyncio
async def test_france_travail_tension_only_when_the_source_flags_it(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2322.70 — « tension » vient de la SOURCE (`offresManqueCandidats`),
    jamais devinée : vrai → `tension: True` ; faux ou absent → aucune clé."""
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    recent = (datetime.now(UTC) - timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))
    c.get = AsyncMock(
        return_value=_resp(
            {
                "resultats": [
                    {
                        "intitule": "Architecte cloud",
                        "dateCreation": recent,
                        "offresManqueCandidats": True,
                        "entreprise": {"nom": "Crédit Mutuel Arkéa"},
                    },
                    {
                        "intitule": "Développeur Java",
                        "dateCreation": recent,
                        "offresManqueCandidats": False,
                        "entreprise": {"nom": "Crédit Mutuel Arkéa"},
                    },
                    {
                        "intitule": "Chef de projet",
                        "dateCreation": recent,
                        "entreprise": {"nom": "Crédit Mutuel Arkéa"},
                    },
                ]
            }
        )
    )
    out = await it_job_signals("Crédit Mutuel Arkéa", client=c)
    by_title = {o["title"]: o for o in out}
    assert by_title["Architecte cloud"]["tension"] is True
    assert "tension" not in by_title["Développeur Java"]
    assert "tension" not in by_title["Chef de projet"]


@pytest.mark.asyncio
async def test_france_travail_keeps_the_native_contract_code_next_to_its_label(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2291.2 — le CODE natif ``typeContrat`` (vérifié : MIS = Intérim, LIB =
    Profession libérale) voyage à côté du libellé : c'est lui, jamais le
    libellé, que l'observation du modèle de contrat classe. ``contractType``
    reste inchangé (compatibilité)."""
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    recent = (datetime.now(UTC) - timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))
    c.get = AsyncMock(
        return_value=_resp(
            {
                "resultats": [
                    {
                        "id": "1",
                        "intitule": "Développeur Java indépendant",
                        "romeCode": "M1805",
                        "dateCreation": recent,
                        "typeContrat": "LIB",
                        "typeContratLibelle": "Profession libérale",
                        "entreprise": {"nom": "Crédit Mutuel Arkéa contrat"},
                    },
                    {
                        "id": "2",
                        "intitule": "Développeur Go",
                        "romeCode": "M1805",
                        "dateCreation": recent,
                        "entreprise": {"nom": "Crédit Mutuel Arkéa contrat"},
                    },
                ]
            }
        )
    )
    out = await it_job_signals("Crédit Mutuel Arkéa contrat", client=c)
    by_title = {row["title"]: row for row in out}
    assert by_title["Développeur Java indépendant"]["contractCode"] == "LIB"
    assert by_title["Développeur Java indépendant"]["contractType"] == "Profession libérale"
    # Code absent à la source : `None`, jamais deviné depuis le libellé.
    assert by_title["Développeur Go"]["contractCode"] is None


# ── Tri IT : ne plus perdre d'offre IT réelle, sans laisser entrer le bruit ──
#
# `domaine=M18` est un filtre SERVEUR sur le préfixe ROME. Mesuré sur 32
# entreprises réelles : il est juste dans l'immense majorité des cas (sans lui,
# « Michelin » remonte 21 offres de restaurant étoilé), mais il perd les offres
# IT dont l'annonceur a mal saisi le ROME. D'où requête M18 + requête large
# re-filtrée localement.


def test_is_it_offer_trusts_m18_rome() -> None:
    """Le verdict de France Travail elle-même (ROME M18*) suffit."""
    assert is_it_offer({"intitule": "Cooptation interne", "romeCode": "M1805"}) is True


def test_is_it_offer_rejects_non_it_offer() -> None:
    """Une offre de caisse n'est PAS un signal de budget IT — cas réel Carrefour."""
    assert is_it_offer({"intitule": "HOTE/HOTESSE DE CAISSE (H/F) CARREFOUR SECTEUR NORD", "romeCode": "D1505"}) is False
    # Cas réel Michelin : l'entreprise est citée pour ses étoiles, pas pour l'IT.
    assert is_it_offer({"intitule": "Chef de Rang - Restaurant 3 Étoiles Michelin (H/F)", "romeCode": "G1810"}) is False


def test_is_it_offer_keeps_it_offer_without_m18_rome() -> None:
    """Offre IT au ROME MAL SAISI : `domaine=M18` la perdait — cas réels mesurés.

    C'est le cœur du correctif : le ROME est saisi par l'annonceur, il est
    parfois faux. Le contenu de l'offre, lui, ne ment pas.
    """
    # Dataiku — « Data Engineer » classé C1216 (assurance).
    assert is_it_offer({"intitule": "Data Engineer DataIku - Services Financiers", "romeCode": "C1216"}) is True
    # Decathlon — « Senior Analytics Engineer » classé I1613.
    assert is_it_offer({"intitule": "Senior Analytics Engineer - Decathlon H/F", "romeCode": "I1613"}) is True
    # Aucun `domaine`/ROME renseigné du tout : le titre suffit.
    assert is_it_offer({"intitule": "Développeur Full Stack Java (H/F)"}) is True


def test_is_it_offer_handles_typographic_apostrophe() -> None:
    """France Travail publie « Systèmes d’Information » avec U+2019.

    Sans normalisation, cette offre Thales réelle était perdue pour un caractère.
    """
    assert is_it_offer({"intitule": "Ingénieur Systèmes d’Information Industriels - Thales", "romeCode": "H1206"}) is True


def test_is_it_offer_requires_word_boundaries() -> None:
    """« erp » ne doit pas matcher « powERPlant » ni « PERPignan » (bug mesuré)."""
    assert is_it_offer({"intitule": "Airbus protect - ingénieur map powerplant", "romeCode": "I1602"}) is False
    assert is_it_offer({"intitule": "Conseiller de vente Poissonnerie - Auchan Perpignan", "romeCode": "D1106"}) is False
    # …mais un vrai poste ERP passe.
    assert is_it_offer({"intitule": "Consultant ERP SAP (H/F)", "romeCode": "M1403"}) is True


def test_is_it_offer_ignores_generic_office_skills() -> None:
    """« Utilisation de l'outil informatique » est une compétence de réceptionniste.

    Les compétences/formations ont été écartées comme preuve après mesure :
    0 offre IT gagnée, 3 faux positifs.
    """
    offer = {
        "intitule": "RÉCEPTIONNISTE POLYVALENT (H/F)",
        "romeCode": "G1703",
        "competences": [{"libelle": "Utilisation de l'outil informatique"}],
    }
    assert is_it_offer(offer) is False


def test_is_it_offer_rejects_garbage() -> None:
    assert is_it_offer({}) is False
    assert is_it_offer(None) is False  # type: ignore[arg-type]


def _ft_client(strict: list[dict], broad: list[dict]) -> AsyncMock:
    """Mock des DEUX requêtes : `domaine=M18` puis la requête large."""
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))

    async def _get(url, *_args, **kwargs):
        params = kwargs.get("params") or {}
        return _resp({"resultats": strict if params.get("domaine") == "M18" else broad})

    c.get = AsyncMock(side_effect=_get)
    return c


@pytest.mark.asyncio
async def test_france_travail_recovers_mis_romed_it_offer(monkeypatch: pytest.MonkeyPatch) -> None:
    """La requête large rattrape l'offre IT que `domaine=M18` perdait, et le
    bruit non-IT de cette même requête est écarté."""
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    recent = (datetime.now(UTC) - timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    ent = {"nom": "X"}
    strict = [{"id": "A", "intitule": "Ingénieur DevOps", "entreprise": ent, "romeCode": "M1805", "dateCreation": recent}]
    broad = [
        {"id": "A", "intitule": "Ingénieur DevOps", "entreprise": ent, "romeCode": "M1805", "dateCreation": recent},  # doublon
        {"id": "B", "intitule": "Data Engineer DataIku", "entreprise": ent, "romeCode": "C1216", "dateCreation": recent},  # rattrapé
        {"id": "C", "intitule": "HOTE DE CAISSE (H/F)", "entreprise": ent, "romeCode": "D1505", "dateCreation": recent},  # écarté
        # #3901 — même mot-clé, autre employeur (homonyme) ou employeur absent : écartées.
        {"id": "D", "intitule": "Ingénieur DevOps", "entreprise": {"nom": "Mairie de X"}, "romeCode": "M1805", "dateCreation": recent},
        {"id": "E", "intitule": "Ingénieur DevOps", "romeCode": "M1805", "dateCreation": recent},
    ]
    out = await it_job_signals("X", client=_ft_client(strict, broad))
    assert [o["title"] for o in out] == ["Ingénieur DevOps", "Data Engineer DataIku"]


@pytest.mark.asyncio
async def test_france_travail_empty_when_company_really_has_no_offer(monkeypatch: pytest.MonkeyPatch) -> None:
    """Zéro offre réelle ⇒ zéro résultat. On ne comble JAMAIS un vide."""
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    assert await it_job_signals("X", client=_ft_client([], [])) == []


@pytest.mark.asyncio
async def test_3817_retries_without_country_suffix_when_the_full_name_finds_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#3817.1 — JCDecaux France : ``motsCles`` plein texte ne répond pas mot à
    mot (aucune offre ne nomme « JCDecaux France »), la marque seule, si. Le
    nom complet est tenté EN PREMIER, jamais directement la forme réduite."""
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    recent = (datetime.now(UTC) - timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))
    seen_keywords: list[str] = []

    async def _get(url, *_args, **kwargs):
        keyword = (kwargs.get("params") or {}).get("motsCles")
        seen_keywords.append(keyword)
        if keyword == "JCDecaux":
            return _resp(
                {
                    "resultats": [
                        {
                            "id": "A",
                            "entreprise": {"nom": "JCDecaux"},
                            "intitule": "Technicien de maintenance informatique",
                            "romeCode": "M1810",
                            "dateCreation": recent,
                            "entreprise": {"nom": "JCDecaux"},
                        }
                    ]
                }
            )
        return _resp({"resultats": []})

    c.get = AsyncMock(side_effect=_get)
    out = await it_job_signals("JCDecaux France", client=c)
    assert [o["title"] for o in out] == ["Technicien de maintenance informatique"]
    assert seen_keywords[0] == "JCDecaux France"
    assert "JCDecaux" in seen_keywords


@pytest.mark.asyncio
async def test_france_travail_survives_partial_search_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    """Une requête HS ne doit pas emporter l'autre."""
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    recent = (datetime.now(UTC) - timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))

    async def _get(url, *_args, **kwargs):
        if (kwargs.get("params") or {}).get("domaine") == "M18":
            return _resp(
                {
                    "resultats": [
                        {
                            "id": "A",
                            "intitule": "Ingénieur DevOps",
                            "romeCode": "M1805",
                            "dateCreation": recent,
                            "entreprise": {"nom": "X"},
                        }
                    ]
                }
            )
        raise httpx.ConnectError("boom")

    c.get = AsyncMock(side_effect=_get)
    out = await it_job_signals("X", client=c)
    assert [o["title"] for o in out] == ["Ingénieur DevOps"]


@pytest.mark.asyncio
async def test_france_travail_empty_when_both_searches_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    """Les deux requêtes HS ⇒ liste vide (dégradation préservée, jamais d'invention)."""
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))
    c.get = AsyncMock(side_effect=httpx.ConnectError("boom"))
    assert await it_job_signals("X", client=c) == []


@pytest.mark.asyncio
async def test_france_travail_empty_on_oauth_refusal(monkeypatch: pytest.MonkeyPatch) -> None:
    """OAuth refusé ⇒ aucune recherche lancée (dégradation existante préservée)."""
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({}, status=401))
    c.get = AsyncMock()
    assert await it_job_signals("X", client=c) == []
    c.get.assert_not_awaited()


@pytest.mark.asyncio
async def test_inpi_empty_without_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INPI_USERNAME", raising=False)
    monkeypatch.delenv("INPI_PASSWORD", raising=False)
    assert await beneficial_owners("775577018") == []


def test_inpi_walk_extracts_beneficiaires() -> None:
    tree = {
        "formality": {
            "content": {
                "personneMorale": {
                    "beneficiairesEffectifs": [
                        {
                            "beneficiaire": {"descriptionPersonne": {"prenoms": ["Jean"], "nom": "Dupont"}},
                            "modaliteControle": {"detentionPartTotale": "75"},
                        }
                    ]
                }
            }
        }
    }
    out: list[dict] = []
    _walk_beneficiaires(tree, out)
    assert out == [{"name": "Jean Dupont", "detentionPart": "75", "detentionVote": None}]


# ── BOAMP marchés publics IT ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_public_tenders_empty_name() -> None:
    assert await public_tenders("") == []


@pytest.mark.asyncio
async def test_public_tenders_keeps_recent_it_only_sorted() -> None:
    now = datetime.now(UTC)
    recent1 = (now - timedelta(days=20)).date().isoformat()  # newest → first
    recent2 = (now - timedelta(days=90)).date().isoformat()
    old = (now - timedelta(days=700)).date().isoformat()  # > 18 months → dropped
    payload = {
        "results": [
            {
                "objet": "Infogérance du système d'information",
                "nomacheteur": "Une Collectivité",
                "dateparution": recent2,
                "datelimitereponse": "2099-01-30",
                "code_departement": "69",
                "libelle_departement": "Rhône",
                "code_cpv": "72000000",
            },
            {
                "objet": "Développement d'une application métier",
                "nomacheteur": "Une Collectivité",
                "dateparution": recent1,
                "code_departement": "13",
                "code_cpv": "48000000",
            },
            {
                "objet": "Migration ERP historique",
                "nomacheteur": "Vieux marché",
                "dateparution": old,
                "code_cpv": "72000000",
            },
            {
                "objet": "Réfection de la voirie communale",
                "nomacheteur": "Ville de X",
                "dateparution": recent1,
                "code_cpv": "45000000",
            },
        ]
    }
    out = await public_tenders("Une Collectivité", client=_client(_resp(payload)))
    # Only the 2 recent IT tenders survive (old dropped, non-IT voirie dropped).
    assert len(out) == 2
    # Sorted recent-first: recent1 (Développement) before recent2 (Infogérance).
    assert out[0]["title"].startswith("Développement")
    assert out[1]["title"].startswith("Infogérance")
    # Location captured for both (label when available, code as fallback).
    assert out[0]["location"] == "13"
    assert out[1]["location"] == "Rhône"
    assert all(t["location"] for t in out)


@pytest.mark.asyncio
async def test_public_tenders_drops_tenders_of_another_buyer_3901() -> None:
    """#3901 (recette prod 11/10) — le compte BWT France affichait 2 appels d'offres
    d'Ajaccio : la recherche plein texte ramasse tout avis dont l'objet CITE le nom.
    Un appel d'offres n'est rattaché que si son ACHETEUR est le compte (nom via
    `same_employer`, ou SIREN quand les deux le portent) — jamais par homonymie."""
    recent = (datetime.now(UTC) - timedelta(days=10)).date().isoformat()
    payload = {
        "results": [
            {
                "objet": "Fourniture de fontaines BWT et maintenance du système d'information",
                "nomacheteur": "Commune d'Ajaccio",
                "dateparution": recent,
                "code_departement": "2A",
                "code_cpv": "72000000",
            },
            {
                "objet": "Hébergement cloud, marché BWT France",
                "nomacheteur": "Communauté d'agglomération du pays ajaccien",
                "dateparution": recent,
                "code_departement": "2A",
                "code_cpv": "72000000",
            },
            {
                "objet": "Infogérance du parc informatique",
                "nomacheteur": "BWT France SAS",
                "dateparution": recent,
                "code_departement": "78",
                "code_cpv": "72000000",
            },
        ]
    }
    out = await public_tenders("BWT France", client=_client(_resp(payload)))
    assert [t["buyer"] for t in out] == ["BWT France SAS"]


@pytest.mark.asyncio
async def test_public_tenders_siren_prime_sur_le_nom_3901() -> None:
    recent = (datetime.now(UTC) - timedelta(days=10)).date().isoformat()
    payload = {
        "results": [
            {
                "objet": "Infogérance",
                "nomacheteur": "Autre Nom Commercial",
                "acheteur_id": "552 081 317 00012",
                "dateparution": recent,
                "code_cpv": "72000000",
            },
            {
                "objet": "Infogérance",
                "nomacheteur": "BWT France",
                "acheteur_id": "999999999",
                "dateparution": recent,
                "code_cpv": "72000000",
            },
        ]
    }
    out = await public_tenders("BWT France", siren="552081317", client=_client(_resp(payload)))
    assert [t["buyer"] for t in out] == ["Autre Nom Commercial"]


@pytest.mark.asyncio
async def test_public_tenders_matches_it_by_keyword_without_cpv() -> None:
    now = datetime.now(UTC)
    recent = (now - timedelta(days=10)).date().isoformat()
    payload = {
        "results": [
            {
                "objet": "Prestation de cybersécurité et cloud",
                "nomacheteur": "Région Y",
                "dateparution": recent,
                "code_departement": "75",
            }
        ]
    }
    out = await public_tenders("Région Y", client=_client(_resp(payload)))
    assert len(out) == 1
    assert out[0]["buyer"] == "Région Y"


@pytest.mark.asyncio
async def test_public_tenders_degrades_on_http_error() -> None:
    assert await public_tenders("X", client=_client(_resp({}, status=500))) == []


@pytest.mark.asyncio
async def test_public_tenders_reuses_one_http_client_across_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2604 — même défaut que BODACC (`_legal_signals_uncached`), même
    correctif : un client HTTP construit UNE fois plutôt qu'à chaque appel."""
    monkeypatch.setattr(public_tenders_module, "_shared_client", None)
    built: list[httpx.AsyncClient] = []
    original_init = httpx.AsyncClient.__init__

    def _tracking_init(self: httpx.AsyncClient, *a: object, **kw: object) -> None:
        built.append(self)
        original_init(self, *a, **kw)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", _tracking_init)
    monkeypatch.setattr(httpx.AsyncClient, "get", AsyncMock(return_value=_resp({"results": []})))

    await public_tenders("Première Société")
    await public_tenders("Seconde Société")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"


# ── DECP marchés publics ATTRIBUÉS ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_decp_empty_name() -> None:
    assert await awarded_it_contracts("") == []


@pytest.mark.asyncio
async def test_decp_keeps_recent_it_awards_with_winner_sorted() -> None:
    now = datetime.now(UTC)
    recent1 = (now - timedelta(days=20)).date().isoformat()  # newest → first
    recent2 = (now - timedelta(days=200)).date().isoformat()
    old = (now - timedelta(days=800)).date().isoformat()  # ancien : GARDÉ et estampillé historical (lot 762)
    payload = {
        "results": [
            {
                # Recent IT award won by a RIVAL ESN (competitive intel).
                "objet": "Développement d'une application métier",
                "acheteur_nom": "Mairie de Lyon",
                "titulaire_denominationSociale": "Capgemini",
                "montant": 250000,
                "dateNotification": recent1,
                "lieuExecution_nom": "Rhône",
                "codeDepartement": "69",
                "codeCPV": "72000000",
            },
            {
                # Recent IT award won by another ESN.
                "objet": "Infogérance du système d'information",
                "acheteur_nom": "Département des Bouches-du-Rhône",
                "titulaire_denominationSociale": "Sopra Steria",
                "montant": 800000,
                "dateNotification": recent2,
                "lieuExecution_nom": "Bouches-du-Rhône",
                "codeDepartement": "13",
                "codeCPV": "72500000",
            },
            {
                # Old IT award → dropped by recency.
                "objet": "Migration ERP historique",
                "acheteur_nom": "Vieux marché",
                "titulaire_denominationSociale": "Atos",
                "dateNotification": old,
                "codeCPV": "48000000",
            },
            {
                # Recent but NON-IT (voirie) → dropped by IT filter.
                "objet": "Réfection de la voirie communale",
                "acheteur_nom": "Ville de X",
                "titulaire_denominationSociale": "Eiffage",
                "dateNotification": recent1,
                "codeCPV": "45000000",
            },
        ]
    }
    out = await awarded_it_contracts("Une Collectivité", client=_client(_resp(payload)))
    # Lot 762 (décision Louis 31/10) : aucune borne d'âge au stockage — le marché ancien est GARDÉ, estampillé,
    # en dernier ; seul le non-IT (voirie) est écarté.
    assert len(out) == 3
    assert [a["title"] for a in out][-1] == "Migration ERP historique"
    assert out[-1]["historical"] is True
    assert not any(a.get("historical") for a in out[:2])
    # Sorted recent-first: recent1 (Développement) before recent2 (Infogérance).
    assert out[0]["title"].startswith("Développement")
    assert out[1]["title"].startswith("Infogérance")
    # Winner (titulaire) captured — the competitive gold.
    assert out[0]["winner"] == "Capgemini"
    assert out[1]["winner"] == "Sopra Steria"
    # Buyer + geo present.
    assert out[0]["buyer"] == "Mairie de Lyon"
    assert out[0]["location"] == "Rhône"
    assert out[0]["department"] == "69"
    assert all(a["location"] for a in out[:2])  # le marché ancien du jeu n'en porte pas
    assert out[0]["amount"] == "250000"


@pytest.mark.asyncio
async def test_decp_winner_from_nested_titulaires_list() -> None:
    now = datetime.now(UTC)
    recent = (now - timedelta(days=15)).date().isoformat()
    payload = {
        "results": [
            {
                "objet": "Prestation cloud et cybersécurité",
                "acheteur": {"nom": "Région Y"},
                "titulaires": [{"titulaire": {"denominationSociale": "Orange Business"}}],
                "dateNotification": recent,
                "lieuExecution": {"nom": "Occitanie", "code": "31"},
            }
        ]
    }
    out = await awarded_it_contracts("Région Y", client=_client(_resp(payload)))
    assert len(out) == 1
    assert out[0]["winner"] == "Orange Business"
    assert out[0]["buyer"] == "Région Y"
    assert out[0]["location"] == "Occitanie"


@pytest.mark.asyncio
async def test_decp_degrades_on_http_error() -> None:
    assert await awarded_it_contracts("X", client=_client(_resp({}, status=500))) == []


# ── GitHub org tech signals ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_github_org_empty_name() -> None:
    assert await org_tech_signals("") is None


@pytest.mark.asyncio
async def test_github_org_parses_signals() -> None:
    now = datetime.now(UTC)
    recent = (now - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    old = (now - timedelta(days=900)).strftime("%Y-%m-%dT%H:%M:%SZ")
    routes = [
        ("/search/users", _resp({"items": [{"login": "doctolib"}]})),
        (
            "/orgs/doctolib/repos",
            _resp(
                [
                    {"language": "Ruby", "pushed_at": recent},
                    {"language": "TypeScript", "pushed_at": recent},
                    {"language": "Ruby", "pushed_at": old},
                ]
            ),
        ),
        ("/orgs/doctolib", _resp({"login": "doctolib", "html_url": "https://github.com/doctolib", "public_repos": 42})),
    ]
    out = await org_tech_signals("Doctolib", "https://www.doctolib.fr", client=_dispatch_client(routes))
    assert out is not None
    assert out["org"] == "doctolib"
    assert out["publicRepos"] == 42
    assert out["topLanguages"][0] == "Ruby"  # 2 Ruby repos > 1 TypeScript
    assert out["activeRecentRepos"] == 2  # only the 2 repos pushed < 24 months
    assert out["lastActivity"]


@pytest.mark.asyncio
async def test_github_org_none_on_no_match() -> None:
    routes = [("/search/users", _resp({"items": [{"login": "unrelated-corp"}]}))]
    assert await org_tech_signals("Doctolib", client=_dispatch_client(routes)) is None


@pytest.mark.asyncio
async def test_github_org_none_on_rate_limit() -> None:
    routes = [("/search/users", _resp({}, status=403))]
    assert await org_tech_signals("Doctolib", client=_dispatch_client(routes)) is None


# ── DECP : la durée du marché, donc son échéance (tome 2 §14) ────────────────
#
# Le tome 1 refusait l'échéance sur un fait FAUX — « DECP ne publie pas
# dureeMois ». Vérifié en direct le 22/08 sur les deux jeux réellement appelés
# (`decp_augmente`, `decp-2022-marches-valides`) : le champ existe, et 100
# marchés IT récents sur 100 le portent. Sans lui, un compte verrouillé jusqu'en
# 2029 est indiscernable d'un compte dont la porte se rouvre dans deux mois.


@pytest.mark.asyncio
async def test_decp_carries_duration_and_computes_end_date() -> None:
    now = datetime.now(UTC)
    recent = (now - timedelta(days=30)).date()
    payload = {
        "results": [
            {
                "objet": "TMA du SI de gestion",
                "acheteur_nom": "Ville de Nantes",
                "titulaire_denominationSociale": "Sopra Steria",
                "dateNotification": recent.isoformat(),
                "dureemois": "48",
                "codeCPV": "72000000",
            }
        ]
    }
    out = await awarded_it_contracts("Ville de Nantes", client=_client(_resp(payload)))
    assert out[0]["durationMonths"] == 48
    # 48 mois plus tard, jour pour jour.
    assert out[0]["endsOn"].startswith(str(recent.year + 4))


@pytest.mark.asyncio
async def test_decp_leaves_the_end_date_unknown_rather_than_guessing() -> None:
    """Durée absente, nulle ou illisible ⇒ pas d'échéance. Une échéance inventée
    ferait rappeler un client au mauvais moment, en affirmant une date."""
    now = datetime.now(UTC)
    recent = (now - timedelta(days=10)).date().isoformat()
    payload = {
        "results": [
            {"objet": "Infogérance", "titulaire_denominationSociale": "Atos",
             "dateNotification": recent, "codeCPV": "72000000"},
            {"objet": "Hébergement", "titulaire_denominationSociale": "OVH",
             "dateNotification": recent, "dureemois": "CDL", "codeCPV": "72000000"},
            {"objet": "Support", "titulaire_denominationSociale": "Econocom",
             "dateNotification": recent, "dureemois": "0", "codeCPV": "72000000"},
        ]
    }
    out = await awarded_it_contracts("Un acheteur", client=_client(_resp(payload)))
    assert len(out) == 3
    assert all(a["durationMonths"] is None for a in out)
    assert all(a["endsOn"] is None for a in out)


@pytest.mark.asyncio
async def test_decp_refuses_to_date_an_award_notified_in_the_future() -> None:
    """`decp_augmente` porte des dates aberrantes (le dépôt notait déjà « max
    datenotification 2048-12-06 »). Une échéance calculée sur une date
    invraisemblable serait une invention DATÉE — la pire espèce."""
    payload = {
        "results": [
            {
                "objet": "Développement",
                "titulaire_denominationSociale": "Capgemini",
                "dateNotification": "2048-12-06",
                "dureemois": "36",
                "codeCPV": "72000000",
            }
        ]
    }
    out = await awarded_it_contracts("Un acheteur", client=_client(_resp(payload)))
    assert len(out) == 1
    assert out[0]["durationMonths"] == 36
    assert out[0]["endsOn"] is None


# ── DECP : le marché de CE compte, retrouvé par son SIREN ───────────────────
#
# Trouvé en recette live du tome 2 : une analyse de FRANCE TELEVISIONS n'a
# ramené AUCUN marché attribué, alors que la commande publique en porte un de
# 36 mois notifié six jours plus tôt. La recherche mono-entreprise interroge
# `decp_augmente` PAR LE NOM, et ce millésime n'a presque plus de données
# récentes (le module le notait déjà). Le millésime vivant, lui, ne publie
# aucune raison sociale — seulement des SIRET. Aucun des deux ne suffit seul.


@pytest.mark.asyncio
async def test_decp_finds_the_recent_award_by_siren_when_the_name_finds_nothing() -> None:
    now = datetime.now(UTC)
    recent = (now - timedelta(days=6)).date().isoformat()
    name_payload = {"results": []}  # decp_augmente ne connaît rien de récent
    siren_payload = {
        "results": [
            {
                "objet": "Ingénierie de vidéo broadcast",
                "acheteur_id": "43276694700019",
                "titulaire_id_1": "55208131766522",
                "datenotification": recent,
                "dureemois": "36",
                "codecpv": "72000000",
                "montant": "450000",
            }
        ]
    }
    client = _dispatch_client(
        [
            ("decp-2022-marches-valides", _resp(siren_payload)),
            ("decp_augmente", _resp(name_payload)),
        ]
    )
    out = await awarded_it_contracts("FRANCE TELEVISIONS", siren="432766947", client=client)
    assert len(out) == 1
    assert out[0]["durationMonths"] == 36
    assert out[0]["endsOn"].startswith(str((now.year + 3)))


@pytest.mark.asyncio
async def test_decp_without_a_siren_behaves_exactly_as_before() -> None:
    """Sans SIREN — un compte que la désambiguïsation n'a pas tranché — on ne
    devine pas : seule la recherche par nom tourne, et le millésime vivant n'est
    pas appelé du tout."""
    client = _dispatch_client([("decp_augmente", _resp({"results": []}))])
    assert await awarded_it_contracts("UNE PME", client=client) == []
    called = [str(c.args[0]) for c in client.get.call_args_list]
    assert all("decp-2022-marches-valides" not in url for url in called)


@pytest.mark.asyncio
async def test_decp_keeps_its_own_client_open_until_both_passes_are_done(monkeypatch: pytest.MonkeyPatch) -> None:
    """⚠️ Trouvé en RECETTE LIVE, pas par un test : la passe par SIREN héritait
    d'un client déjà FERMÉ par le `finally` de la passe par nom, et rendait `[]`
    en silence. Invisible ici parce que TOUS les tests injectent un client —
    donc la branche « la fonction possède son client » n'était jamais jouée.
    Ce test la joue.

    #2604.2 — decp ne construit plus son propre client (`owns`/`aclose`) : il
    va chercher le client partagé de PROCESS via `get_shared_client("decp")`.
    On sème donc directement `_http_pool._clients["decp"]` avec le faux
    client, plutôt que de monkeypatcher `httpx.AsyncClient` (qui ne serait
    plus lu par `decp.py`)."""
    now = datetime.now(UTC)
    recent = (now - timedelta(days=3)).date().isoformat()
    calls: list[str] = []
    closed = {"at": None}

    class _FakeClient:
        async def get(self, url, params=None, **_kw):
            if closed["at"] is not None:
                raise RuntimeError("client déjà fermé")
            calls.append(str(url))
            if "decp-2022-marches-valides" in str(url):
                return _resp(
                    {
                        "results": [
                            {
                                "objet": "Infogérance",
                                "acheteur_id": "43276694700019",
                                "datenotification": recent,
                                "dureemois": "36",
                                "codecpv": "72000000",
                            }
                        ]
                    }
                )
            return _resp({"results": []})

        async def aclose(self):
            closed["at"] = len(calls)

    monkeypatch.setitem(_http_pool._clients, "decp", _FakeClient())

    out = await awarded_it_contracts("FRANCE TELEVISIONS", siren="432766947")

    assert len(out) == 1, "la passe par SIREN doit tourner avant la fermeture du client"
    assert any("decp-2022-marches-valides" in url for url in calls)
    assert closed["at"] is None, (
        "#2604.2 — decp partage désormais un client de PROCESS (get_shared_client) : "
        "il ne se ferme plus jamais entre deux appels, y compris entre les deux passes."
    )


# ─────────────────────────────────────────────────────────────────────────
# #2604.2 — balayage chiffré (voir tests/perf/mesure_2604_2_client_construction.py) :
# les sources ci-dessous construisaient un `httpx.AsyncClient` À CHAQUE appel
# (20/20 constructions mesurées, vivantes en prod — clé Railway posée ou
# aucune requise) ; même correctif que #2604.1 (`get_shared_client`, factorisé
# GA-26 dans `app/services/data_sources/_http_pool.py`). `wttj` (0/20 mesuré,
# WTTJ_ALGOLIA_APP_ID/API_KEY absents de Railway) reste un no-op — non touché.
# ─────────────────────────────────────────────────────────────────────────


def _track_client_constructions(monkeypatch: pytest.MonkeyPatch) -> list[httpx.AsyncClient]:
    """Patron #2604.1 : trace chaque `httpx.AsyncClient()` réellement construit."""
    built: list[httpx.AsyncClient] = []
    original_init = httpx.AsyncClient.__init__

    def _tracking_init(self: httpx.AsyncClient, *a: object, **kw: object) -> None:
        built.append(self)
        original_init(self, *a, **kw)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", _tracking_init)
    return built


def _mock_network(monkeypatch: pytest.MonkeyPatch, payload: object) -> None:
    resp = _resp(payload)
    monkeypatch.setattr(httpx.AsyncClient, "get", AsyncMock(return_value=resp))
    monkeypatch.setattr(httpx.AsyncClient, "post", AsyncMock(return_value=resp))


@pytest.mark.asyncio
async def test_apec_reuses_one_http_client_across_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(_http_pool._clients, "apec", None)
    built = _track_client_constructions(monkeypatch)
    _mock_network(monkeypatch, {"resultats": []})

    await it_job_signals_apec("Mesure2604 Un")
    await it_job_signals_apec("Mesure2604 Deux")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"


@pytest.mark.asyncio
async def test_ats_boards_reuses_one_http_client_across_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(_http_pool._clients, "ats_boards", None)
    built = _track_client_constructions(monkeypatch)
    _mock_network(monkeypatch, {})

    await it_job_signals_ats("Mesure2604 Un")
    await it_job_signals_ats("Mesure2604 Deux")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"


@pytest.mark.asyncio
async def test_brave_news_reuses_one_http_client_across_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    monkeypatch.setitem(_http_pool._clients, "brave_news", None)
    built = _track_client_constructions(monkeypatch)
    _mock_network(monkeypatch, {"results": []})

    await recent_news("Mesure2604 Un")
    await recent_news("Mesure2604 Deux")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"


@pytest.mark.asyncio
async def test_decp_reuses_one_http_client_across_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    """Une seule clé partagée `"decp"` pour `awarded_it_contracts` ET
    `list_award_buyers` (même fichier, même forme) — ce test couvre les deux."""
    monkeypatch.setitem(_http_pool._clients, "decp", None)
    built = _track_client_constructions(monkeypatch)
    _mock_network(monkeypatch, {"results": []})

    await awarded_it_contracts("Mesure2604 Un")
    await awarded_it_contracts("Mesure2604 Deux")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"


@pytest.mark.asyncio
async def test_geo_communes_reuses_one_http_client_across_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(_http_pool._clients, "geo_communes", None)
    built = _track_client_constructions(monkeypatch)
    _mock_network(monkeypatch, {})

    await search_communes("Mesure2604 Un")
    await search_communes("Mesure2604 Deux")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"


@pytest.mark.asyncio
async def test_github_org_reuses_one_http_client_across_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(_http_pool._clients, "github_org", None)
    built = _track_client_constructions(monkeypatch)
    _mock_network(monkeypatch, {"items": []})

    await org_tech_signals("Mesure2604 Un")
    await org_tech_signals("Mesure2604 Deux")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"


@pytest.mark.asyncio
async def test_inpi_rne_reuses_one_http_client_across_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INPI_USERNAME", "u")
    monkeypatch.setenv("INPI_PASSWORD", "p")
    monkeypatch.setitem(_http_pool._clients, "inpi_rne", None)
    built = _track_client_constructions(monkeypatch)
    _mock_network(monkeypatch, {"token": "tok"})

    await beneficial_owners("111222333")
    await beneficial_owners("444555666")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"


@pytest.mark.asyncio
async def test_public_tenders_list_tender_buyers_reuses_one_http_client_across_calls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`list_tender_buyers` réutilise le client `_shared_client` DÉJÀ défini
    dans `public_tenders.py` par #2604.1 pour `public_tenders()` — même
    fichier, même helper local (pas besoin d'un import `_http_pool` ici)."""
    monkeypatch.setattr(public_tenders_module, "_shared_client", None)
    built = _track_client_constructions(monkeypatch)
    _mock_network(monkeypatch, {"results": []})

    await list_tender_buyers(department="69")
    await list_tender_buyers(department="75")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"


@pytest.mark.asyncio
async def test_recherche_entreprises_reuses_one_http_client_across_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    """Une seule clé partagée `"recherche_entreprises"` pour `fetch_company`,
    `search_companies`, `count_companies` ET `list_companies` — ce test
    couvre les quatre (même fichier, même forme)."""
    monkeypatch.setitem(_http_pool._clients, "recherche_entreprises", None)
    built = _track_client_constructions(monkeypatch)
    _mock_network(monkeypatch, {"results": []})

    await fetch_company("Mesure2604 Un")
    await fetch_company("Mesure2604 Deux")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"


@pytest.mark.asyncio
async def test_serper_reuses_one_http_client_across_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SERPER_API_KEY", "k")
    monkeypatch.setitem(_http_pool._clients, "serper", None)
    built = _track_client_constructions(monkeypatch)
    _mock_network(monkeypatch, {"organic": []})

    await serper_search("Mesure2604 Un")
    await serper_search("Mesure2604 Deux")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"


@pytest.mark.asyncio
async def test_tavily_reuses_one_http_client_across_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TAVILY_API_KEY", "k")
    monkeypatch.setitem(_http_pool._clients, "tavily", None)
    built = _track_client_constructions(monkeypatch)
    _mock_network(monkeypatch, {"results": []})

    await tavily_search("Mesure2604 Un")
    await tavily_search("Mesure2604 Deux")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"


@pytest.mark.asyncio
async def test_tech_detect_reuses_one_http_client_across_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(_http_pool._clients, "tech_detect", None)
    built = _track_client_constructions(monkeypatch)
    monkeypatch.setattr(httpx.AsyncClient, "get", AsyncMock(return_value=httpx.Response(200, text="<html></html>", request=httpx.Request("GET", "https://x"))))

    await detect_stack("https://mesure2604-un.example.test")
    await detect_stack("https://mesure2604-deux.example.test")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"


@pytest.mark.asyncio
async def test_france_travail_it_job_signals_reuses_one_http_client_across_calls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """HOT PATH : `_candidate_signals` (discover.py) appelle `it_job_signals`
    dans le MÊME `asyncio.gather` que `public_tenders`/`legal_signals`
    (déjà corrigées #2604.1), multiplié par SIGNALS_CANDIDATE_LIMIT — c'est la
    source la plus prioritaire du balayage #2604.2. Une seule clé partagée
    `"france_travail"` couvre aussi `list_hiring_companies` (même fichier)."""
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    monkeypatch.setitem(_http_pool._clients, "france_travail", None)
    built = _track_client_constructions(monkeypatch)
    _mock_network(monkeypatch, {"access_token": "tok", "resultats": []})

    await it_job_signals("Mesure2604 Un")
    await it_job_signals("Mesure2604 Deux")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"
