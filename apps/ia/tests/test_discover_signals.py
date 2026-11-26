"""Découvrir v2 — prospection inversée : « qui BOUGE en ce moment sur mon territoire ».

Trois sources libres listent des entreprises par département + date :
BOAMP (AO IT ouverts), DECP (marchés IT attribués + titulaire = concurrent),
France Travail (recrutements IT). Le routeur `/discover/signals` les agrège en
parallèle, dédoublonne, résout le SIREN et trie par fraîcheur.

Tout le HTTP est mocké. Règles vérifiées : ZÉRO SIREN inventé, ZÉRO échec
silencieux (toute source HS apparaît dans `degraded`).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.company_filters import DegradeReason
from app.services.data_sources import decp as decp_mod
from app.services.data_sources.decp import (
    _dept_from_place_code,
    awarded_it_contracts,
    build_award_where,
    list_award_buyers,
)
from app.services.data_sources.france_travail import list_hiring_companies
from app.services.data_sources.public_tenders import build_tender_where, list_tender_buyers
from app.services.data_sources.signal_errors import SignalSourceUnavailable

# ── helpers ────────────────────────────────────────────────────────────────


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).date().isoformat()


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("GET", "https://x"))


def _client(resp: httpx.Response) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=resp)
    return c


def _capturing_client(resp: httpx.Response) -> tuple[AsyncMock, list[dict]]:
    """Mock client recording the params of every GET (to assert the query built)."""
    calls: list[dict] = []
    c = AsyncMock(spec=httpx.AsyncClient)

    async def _get(_url, *, params=None, **_kw):
        calls.append(dict(params or {}))
        return resp

    c.get = AsyncMock(side_effect=_get)
    return c, calls


# ── BOAMP — list_tender_buyers ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tender_where_filters_on_date_and_department() -> None:
    where = build_tender_where("69", 90)
    assert "dateparution >=" in where
    assert f"date'{_iso(90)}'" in where
    assert "code_departement" in where and "69" in where


@pytest.mark.asyncio
async def test_tender_where_without_department_is_date_only() -> None:
    where = build_tender_where(None, 30)
    assert where == f"dateparution >= date'{_iso(30)}'"


@pytest.mark.asyncio
async def test_list_tender_buyers_returns_buyer_plus_signal() -> None:
    payload = {
        "results": [
            {
                "nomacheteur": "CONSEIL DEPARTEMENTAL DU RHONE",
                "objet": "Refonte du système d'information RH",
                "code_cpv": "72000000",
                "code_departement": "69",
                "dateparution": _iso(10),
                "url_avis": "https://boamp.fr/avis/detail/1",
            }
        ]
    }
    client, calls = _capturing_client(_resp(payload))
    rows = await list_tender_buyers("69", 90, 10, client=client)

    assert len(rows) == 1
    row = rows[0]
    assert row["name"] == "CONSEIL DEPARTEMENTAL DU RHONE"
    assert row["department"] == "69"
    signal = row["signal"]
    assert signal["type"] == "tender"
    assert signal["date"].startswith(_iso(10))
    assert signal["url"] == "https://boamp.fr/avis/detail/1"
    assert "système d'information" in signal["label"]
    # ODSQL where actually sent upstream.
    assert "dateparution >=" in calls[0]["where"]


@pytest.mark.asyncio
async def test_list_tender_buyers_drops_rows_without_a_date() -> None:
    """La date est le « pourquoi maintenant » — un signal sans date n'en est pas un."""
    payload = {
        "results": [
            {"nomacheteur": "MAIRIE X", "objet": "Infogérance", "code_cpv": "72", "dateparution": ""},
            {
                "nomacheteur": "MAIRIE Y",
                "objet": "Infogérance",
                "code_cpv": "72",
                "dateparution": _iso(5),
            },
        ]
    }
    rows = await list_tender_buyers(None, 90, 10, client=_client(_resp(payload)))
    assert [r["name"] for r in rows] == ["MAIRIE Y"]


@pytest.mark.asyncio
async def test_list_tender_buyers_filters_out_other_departments() -> None:
    payload = {
        "results": [
            {"nomacheteur": "A", "objet": "Cloud", "code_cpv": "72", "code_departement": "75", "dateparution": _iso(3)},
            {"nomacheteur": "B", "objet": "Cloud", "code_cpv": "72", "code_departement": "69", "dateparution": _iso(4)},
        ]
    }
    rows = await list_tender_buyers("69", 90, 10, client=_client(_resp(payload)))
    assert [r["name"] for r in rows] == ["B"]


@pytest.mark.asyncio
async def test_list_tender_buyers_raises_when_source_is_down() -> None:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=httpx.ConnectError("boom"))
    with pytest.raises(SignalSourceUnavailable) as err:
        await list_tender_buyers("69", 90, 10, client=c)
    assert err.value.source == "BOAMP"


# ── DECP — list_award_buyers ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_award_where_filters_on_notification_date_and_it_cpv() -> None:
    where = build_award_where(None, 180)
    assert f"datenotification >= date'{_iso(180)}'" in where
    # CPV 72 = services informatiques, 48 = progiciels — les deux divisions IT.
    assert "startswith(codecpv,'72')" in where
    assert "startswith(codecpv,'48')" in where


@pytest.mark.asyncio
async def test_award_where_uses_the_real_lowercase_schema() -> None:
    """FINDING 2 — le schéma DECP live est tout en minuscules. `dateNotification`
    fait répondre HTTP 400 « Unknown field » : la source entière tombe."""
    where = build_award_where("69", 180)
    assert "datenotification" in where
    assert "dateNotification" not in where
    assert "lieuexecution_code" in where
    assert "lieuExecution_code" not in where


@pytest.mark.parametrize("build", [lambda: build_award_where("69", 90), lambda: build_tender_where("69", 90)])
def test_odsql_filters_never_use_the_percent_wildcard(build) -> None:
    """FINDING 3 — le piège du vide silencieux.

    En ODSQL le joker est `*`, pas `%`. Un motif en `%` ne lève AUCUNE erreur :
    il renvoie 0 ligne (`codecpv like '72%'` → 0 vs `startswith(codecpv,'72')` →
    13 653). Une source vivante passerait donc pour « aucun résultat » sans
    jamais apparaître dans `degraded` — exactement ce que le contrat interdit.
    """
    assert "%" not in build()


def test_award_where_uses_startswith_rather_than_like() -> None:
    where = build_award_where("69", 90)
    assert "startswith(" in where
    assert "like" not in where


@pytest.mark.parametrize(
    ("code", "expected"),
    [("69123", "69"), ("2A004", "2A"), ("97411", "974"), ("75056", "75"), ("", None)],
)
def test_department_is_derived_exactly_from_the_place_code(code, expected) -> None:
    """Code commune/postal → département : 2 caractères en métropole, 3 en DOM.
    Prendre 3 caractères partout donnerait '691' pour Lyon."""
    assert _dept_from_place_code(code) == expected


@pytest.mark.asyncio
async def test_list_award_buyers_carries_the_awarded_vendor() -> None:
    """Le titulaire = le concurrent en place. C'est l'angle rang-2."""
    payload = {
        "results": [
            {
                "acheteur_nom": "VILLE DE LYON",
                "acheteur_id": "21690123400015",
                "objet": "TMA applications métier",
                "codeCPV": "72267000",
                "titulaire_denominationSociale": "SOPRA STERIA",
                "codeDepartement": "69",
                "dateNotification": _iso(40),
                "montant": "1200000",
            }
        ]
    }
    rows = await list_award_buyers("69", 365, 10, client=_client(_resp(payload)))

    assert len(rows) == 1
    row = rows[0]
    assert row["name"] == "VILLE DE LYON"
    assert row["siren"] == "216901234"  # SIRET acheteur → SIREN (9 premiers chiffres)
    assert row["vendor"] == "SOPRA STERIA"
    assert row["signal"]["type"] == "award"
    assert "SOPRA STERIA" in row["signal"]["detail"]


@pytest.mark.asyncio
async def test_list_award_buyers_retries_without_department_on_error() -> None:
    """Les noms de champs DECP varient par millésime : un `where` refusé ne doit
    pas tuer la source — on retente en dégradé (date seule) avant d'abandonner."""
    ok = _resp(
        {
            "results": [
                {
                    "acheteur_nom": "VILLE DE LYON",
                    "objet": "Cloud",
                    "codeCPV": "72",
                    "codeDepartement": "69",
                    "dateNotification": _iso(20),
                }
            ]
        }
    )
    calls: list[dict] = []
    c = AsyncMock(spec=httpx.AsyncClient)

    async def _get(_url, *, params=None, **_kw):
        calls.append(dict(params or {}))
        if len(calls) == 1:
            raise httpx.HTTPStatusError("400", request=httpx.Request("GET", "https://x"), response=_resp({}, 400))
        return ok

    c.get = AsyncMock(side_effect=_get)
    rows = await list_award_buyers("69", 365, 10, client=c)

    assert len(calls) == 2
    assert "lieuexecution_code" in calls[0]["where"]
    assert "lieuexecution_code" not in calls[1].get("where", "")
    assert rows and rows[0]["name"] == "VILLE DE LYON"


# ── FINDING 1 : le millésime interrogé ─────────────────────────────────────


@pytest.mark.asyncio
async def test_award_listing_targets_the_live_2022_dataset() -> None:
    """`decp_augmente` est mort (51 lignes depuis 2025-02, dates aberrantes) et
    `decp-v3-marches-valides` est figé à 2024-02. Seul `decp-2022-marches-valides`
    est alimenté (312 324 lignes). La LISTE doit taper là."""
    urls: list[str] = []
    c = AsyncMock(spec=httpx.AsyncClient)

    async def _get(url, **_kw):
        urls.append(url)
        return _resp({"results": []})

    c.get = AsyncMock(side_effect=_get)
    await list_award_buyers("69", 365, 10, client=c)

    assert urls and urls[0].endswith("/datasets/decp-2022-marches-valides/records")


@pytest.mark.asyncio
async def test_single_company_path_still_targets_decp_augmente() -> None:
    """Le chemin mono-entreprise dépend des champs ENRICHIS (acheteur_nom,
    titulaire_denominationSociale) absents du millésime 2022 — il ne bouge pas."""
    urls: list[str] = []
    c = AsyncMock(spec=httpx.AsyncClient)

    async def _get(url, **_kw):
        urls.append(url)
        return _resp({"results": []})

    c.get = AsyncMock(side_effect=_get)
    await awarded_it_contracts("ACME", client=c)

    assert urls and urls[0].endswith("/datasets/decp_augmente/records")


# ── FINDING 2 : le schéma réel (SIRET seuls, aucun nom) ────────────────────


@pytest.mark.asyncio
async def test_award_row_parses_the_real_lowercase_schema(monkeypatch) -> None:
    """Ligne telle que l'API la renvoie vraiment : que des minuscules, aucune
    raison sociale, des SIRET pour l'acheteur ET le titulaire."""

    async def _names(sirens):
        assert set(sirens) == {"348006446"}
        return {"348006446": "SOPRA STERIA GROUP"}

    monkeypatch.setattr(decp_mod, "names_by_siren", _names)
    payload = {
        "results": [
            {
                "objet": "AMOA et chefferie de projet",
                "codecpv": "72224000",
                "acheteur_id": "18003506500036",
                "titulaire_id_1": "34800644600234",
                "lieuexecution_code": "69123",
                "datenotification": _iso(30),
                "montant": "76824",
            }
        ]
    }
    rows = await list_award_buyers("69", 365, 10, client=_client(_resp(payload)))

    assert len(rows) == 1
    row = rows[0]
    assert row["siren"] == "180035065"  # SIRET acheteur → SIREN
    assert row["vendorSiren"] == "348006446"
    assert row["department"] == "69"
    assert row["signal"]["date"].startswith(_iso(30))
    # Le nom de l'acheteur est absent de la source — il sera résolu par le routeur.
    assert row["name"] == ""


@pytest.mark.asyncio
async def test_vendor_name_is_resolved_never_left_as_a_raw_siret(monkeypatch) -> None:
    """« À QUI » est la valeur produit du signal DECP. Un SIRET brut ne dit rien
    à un commercial — le titulaire doit porter une raison sociale."""

    async def _names(_sirens):
        return {"348006446": "SOPRA STERIA GROUP"}

    monkeypatch.setattr(decp_mod, "names_by_siren", _names)
    payload = {
        "results": [
            {
                "objet": "TMA",
                "codecpv": "72",
                "acheteur_id": "18003506500036",
                "titulaire_id_1": "34800644600234",
                "lieuexecution_code": "69123",
                "datenotification": _iso(10),
            }
        ]
    }
    rows = await list_award_buyers(None, 365, 10, client=_client(_resp(payload)))

    assert rows[0]["vendor"] == "SOPRA STERIA GROUP"
    detail = rows[0]["signal"]["detail"]
    assert "SOPRA STERIA GROUP" in detail
    assert "34800644600234" not in detail  # jamais le SIRET nu


@pytest.mark.asyncio
async def test_vendor_stays_unnamed_when_the_registry_cannot_resolve_it(monkeypatch) -> None:
    """Registre muet → pas de nom. On tait le titulaire plutôt que d'exposer un
    SIRET déguisé en raison sociale."""

    async def _names(_sirens):
        return {}

    monkeypatch.setattr(decp_mod, "names_by_siren", _names)
    payload = {
        "results": [
            {
                "objet": "TMA",
                "codecpv": "72",
                "acheteur_id": "18003506500036",
                "titulaire_id_1": "34800644600234",
                "datenotification": _iso(10),
            }
        ]
    }
    rows = await list_award_buyers(None, 365, 10, client=_client(_resp(payload)))

    assert rows[0]["vendor"] is None
    assert "Titulaire" not in (rows[0]["signal"]["detail"] or "")


@pytest.mark.asyncio
async def test_award_department_filter_is_exact_not_a_prefix(monkeypatch) -> None:
    """`startswith` côté serveur est volontairement large : le filtre exact se
    fait ici. Un code DOM 97411 (dept 974) ne doit pas passer pour un « 97 »."""

    async def _names(_sirens):
        return {}

    monkeypatch.setattr(decp_mod, "names_by_siren", _names)
    payload = {
        "results": [
            {"objet": "Cloud", "codecpv": "72", "acheteur_id": "18003506500036",
             "lieuexecution_code": "97411", "datenotification": _iso(5)},
            {"objet": "Cloud", "codecpv": "72", "acheteur_id": "21690123400015",
             "lieuexecution_code": "97123", "datenotification": _iso(6)},
        ]
    }
    rows = await list_award_buyers("974", 365, 10, client=_client(_resp(payload)))
    assert [r["siren"] for r in rows] == ["180035065"]


@pytest.mark.asyncio
async def test_award_row_without_a_buyer_name_is_kept_when_the_siret_is_there(monkeypatch) -> None:
    """Le millésime 2022 n'a PAS de champ nom d'acheteur. Exiger un nom viderait
    la source entière."""

    async def _names(_sirens):
        return {}

    monkeypatch.setattr(decp_mod, "names_by_siren", _names)
    payload = {
        "results": [
            {"objet": "Cloud", "codecpv": "72", "acheteur_id": "18003506500036", "datenotification": _iso(5)},
            {"objet": "Cloud", "codecpv": "72", "datenotification": _iso(6)},  # ni nom ni SIRET → écartée
        ]
    }
    rows = await list_award_buyers(None, 365, 10, client=_client(_resp(payload)))
    assert [r["siren"] for r in rows] == ["180035065"]


@pytest.mark.asyncio
async def test_list_award_buyers_raises_when_every_attempt_fails() -> None:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=httpx.ConnectError("boom"))
    with pytest.raises(SignalSourceUnavailable) as err:
        await list_award_buyers("69", 365, 10, client=c)
    assert err.value.source == "DECP"


# ── France Travail — list_hiring_companies ─────────────────────────────────


@pytest.mark.asyncio
async def test_list_hiring_companies_without_credentials_degrades_cleanly(monkeypatch) -> None:
    monkeypatch.delenv("FRANCE_TRAVAIL_CLIENT_ID", raising=False)
    monkeypatch.delenv("FRANCE_TRAVAIL_CLIENT_SECRET", raising=False)
    c = AsyncMock(spec=httpx.AsyncClient)
    with pytest.raises(SignalSourceUnavailable) as err:
        await list_hiring_companies("69", ["data"], 90, 10, client=c)
    assert err.value.source == "France Travail"
    # #2469 — une clé machine, pas « identifiants absents (FRANCE_TRAVAIL_…) » :
    # le nom de la variable d'environnement n'a rien à faire à l'écran.
    assert err.value.reason == DegradeReason.MISSING_API_KEY
    c.get.assert_not_called()  # aucun appel réseau sans clé


@pytest.mark.asyncio
async def test_list_hiring_companies_builds_department_and_date_filters(monkeypatch) -> None:
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")
    payload = {
        "resultats": [
            {
                "intitule": "Développeur Python",
                "dateCreation": f"{_iso(7)}T09:00:00.000Z",
                "entreprise": {"nom": "ACME INDUSTRIE"},
                "lieuTravail": {"libelle": "69 - LYON", "codePostal": "69001"},
                "typeContratLibelle": "CDI",
                "origineOffre": {"urlOrigine": "https://candidat.francetravail.fr/offres/1"},
            }
        ]
    }
    calls: list[dict] = []
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))

    async def _get(_url, *, params=None, **_kw):
        calls.append(dict(params or {}))
        return _resp(payload)

    c.get = AsyncMock(side_effect=_get)

    rows = await list_hiring_companies("69", ["python"], 90, 10, client=c, profile={"offerDomain": "esn_it"})

    assert calls[0]["departement"] == "69"
    assert calls[0]["domaine"] == "M18"
    assert calls[0]["minCreationDate"].startswith(_iso(90))
    # L'API refuse `minCreationDate` seul par un 400 : les deux bornes sont
    # dépendantes. Cette assertion est la seule qui aurait attrapé le bug —
    # l'ancienne vérifiait qu'un paramètre partait, pas que la requête soit valide.
    assert calls[0]["maxCreationDate"].startswith(_iso(0))
    assert "python" in calls[0]["motsCles"]

    assert len(rows) == 1
    row = rows[0]
    assert row["name"] == "ACME INDUSTRIE"
    assert row["department"] == "69"
    assert row["city"] == "LYON"
    assert row["signal"]["type"] == "hiring"
    assert row["signal"]["url"] == "https://candidat.francetravail.fr/offres/1"


@pytest.mark.asyncio
async def test_list_hiring_companies_never_sends_one_creation_bound_alone(monkeypatch) -> None:
    """Régression : `minCreationDate` sans `maxCreationDate` = HTTP 400.

    L'API l'écrit noir sur blanc (« Les paramètres « minCreationDate » et
    « maxCreationDate » sont dépendants et doivent être renseignés ensemble »),
    donc le signal Recrutement de Découvrir échouait à CHAQUE appel. Le défaut
    est resté invisible tant que les identifiants manquaient en production :
    sans clé la source s'arrête avant l'appel réseau, et l'écran affichait
    « source injoignable » — indiscernable d'une panne côté France Travail.
    """
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")
    calls: list[dict] = []
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))

    async def _get(_url, *, params=None, **_kw):
        calls.append(dict(params or {}))
        return _resp({"resultats": []})

    c.get = AsyncMock(side_effect=_get)

    for since_days in (1, 30, 90, 365):
        calls.clear()
        await list_hiring_companies(None, None, since_days, 10, client=c)
        sent = calls[0]
        assert ("minCreationDate" in sent) == ("maxCreationDate" in sent), (
            f"bornes de création dépareillées (since_days={since_days}) : {sorted(sent)}"
        )
        assert sent["minCreationDate"] < sent["maxCreationDate"]


@pytest.mark.asyncio
async def test_list_hiring_companies_skips_offers_without_an_employer(monkeypatch) -> None:
    """Une offre anonymisée ne nomme aucune entreprise — on n'en invente pas une."""
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")
    payload = {
        "resultats": [
            {"intitule": "Dev", "dateCreation": f"{_iso(2)}T09:00:00Z", "entreprise": {}},
            {
                "intitule": "Dev",
                "dateCreation": f"{_iso(3)}T09:00:00Z",
                "entreprise": {"nom": "REAL CORP"},
            },
        ]
    }
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))
    c.get = AsyncMock(return_value=_resp(payload))
    rows = await list_hiring_companies(None, [], 90, 10, client=c)
    assert [r["name"] for r in rows] == ["REAL CORP"]


@pytest.mark.asyncio
async def test_list_hiring_companies_raises_when_token_fails(monkeypatch) -> None:
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(side_effect=httpx.ConnectError("boom"))
    with pytest.raises(SignalSourceUnavailable):
        await list_hiring_companies(None, [], 90, 10, client=c)
