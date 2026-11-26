"""Une panne ne doit jamais se lire comme une absence.

C'est la moitié la plus coûteuse de #631. Le limiteur manquant était la CAUSE ;
ce qui l'a rendu invisible pendant des mois, c'est que son symptôme — un ``[]``
— était **indiscernable d'un vrai résultat vide**. L'écran a donc traduit une
panne d'infrastructure en une affirmation sur le marché de l'utilisateur :
« homonymie non tranchée ». Le commercial agit sur cette phrase.

La règle appliquée ici, celle de #628 :

    Une source dégradée ne contribue RIEN et le DIT.
    Elle ne reçoit jamais de valeur par défaut plausible.

Et sa réciproque, tout aussi importante : une source qui ne trouve
légitimement rien doit rester distinguable d'une panne **dans l'autre sens**.
Enregistrer une dégradation sur un vrai vide serait le symétrique du bug —
inventer une panne pour excuser une absence réelle.

Les deux directions sont testées pour chaque source ci-dessous.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.middleware.correlation_id import _correlation_id as correlation_id_var
from app.services import source_health as registry

CID = "cid-soft-failure-distinction"


@pytest.fixture(autouse=True)
def _run_scope():
    registry.clear_degradations(CID)
    token = correlation_id_var.set(CID)
    yield
    correlation_id_var.reset(token)
    registry.clear_degradations(CID)


def _entries(source: str) -> list[dict[str, str]]:
    return [e for e in registry.get_degradations(CID) if e["source"] == source]


def _status_client(status: int, *, payload: object = None, method: str = "get") -> AsyncMock:
    resp = httpx.Response(
        status,
        json=payload if payload is not None else {},
        request=httpx.Request(method.upper(), "https://example.test"),
    )
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=resp)
    c.post = AsyncMock(return_value=resp)
    return c


# ── INSEE Sirene : deux trous non couverts par #628 ──────────────────────────


@pytest.mark.asyncio
async def test_insee_sites_failure_is_not_reported_as_a_company_without_sites() -> None:
    """``etablissements_by_siren`` alimente ``sitesFrance`` — une liste AFFICHÉE.

    Un 429 (le plafond Sirene est bas : 30/min) rendait ``[]``, exactement comme
    « cette société n'a qu'un seul site ». Le dossier affirmait alors une
    implantation géographique fausse, à partir d'une panne.
    """
    from app.services import insee_sirene

    with patch.object(insee_sirene, "insee_api_key", lambda: "k"):
        out = await insee_sirene.etablissements_by_siren(
            "123456789", client=_status_client(429)
        )

    assert out == [], "une source dégradée ne fabrique JAMAIS de site plausible"
    assert _entries("insee"), "…mais elle doit dire qu'elle a été coupée"
    assert any("429" in e["reason"] for e in _entries("insee"))


@pytest.mark.asyncio
async def test_insee_sites_genuinely_empty_records_nothing() -> None:
    """Réciproque : une société sans établissement listé est un VRAI vide.

    Inventer une dégradation ici serait le bug symétrique — excuser une absence
    réelle par une panne imaginaire.
    """
    from app.services import insee_sirene

    with patch.object(insee_sirene, "insee_api_key", lambda: "k"):
        out = await insee_sirene.etablissements_by_siren(
            "123456789", client=_status_client(200, payload={"etablissements": []})
        )

    assert out == []
    assert not _entries("insee"), "un vide légitime n'est pas une dégradation"


@pytest.mark.asyncio
async def test_insee_naf_batch_failure_is_recorded() -> None:
    """``naf_by_sirens`` faisait ``continue`` sur un lot en échec, sans un mot.

    Le NAF est ce qui pose ``isItEntity`` — le drapeau qui décide, en aval, si
    une filiale est la cible n°1 de l'ESN ou du bruit. Un lot perdu en silence
    dégrade la cartographie entière sans laisser de trace.
    """
    from app.services import insee_sirene

    with patch.object(insee_sirene, "insee_api_key", lambda: "k"):
        out = await insee_sirene.naf_by_sirens(["123456789"], client=_status_client(500))

    assert out == {}
    assert _entries("insee"), "un lot NAF perdu doit être dit, pas juste sauté"


@pytest.mark.asyncio
async def test_insee_404_stays_a_legitimate_empty() -> None:
    """Sirene répond 404 pour « aucun résultat ». C'est une VRAIE absence : elle
    ne doit pas être comptée comme une panne."""
    from app.services import insee_sirene

    with patch.object(insee_sirene, "insee_api_key", lambda: "k"):
        out = await insee_sirene.search_unites_legales("INEXISTANTE", client=_status_client(404))

    assert out == []
    assert not _entries("insee"), "404 Sirene = aucun résultat, pas une panne"


# ── Country packs : la famille que #628 avait explicitement listée ───────────


@pytest.mark.asyncio
async def test_zefix_auth_failure_is_not_reported_as_no_swiss_company() -> None:
    """Le cas nommé par #628 (``ch.py:263``).

    Zefix s'authentifie en HTTP Basic. Un 401 sur NOS identifiants — clé
    expirée, mot de passe tourné, compte suspendu — rendait le même ``None``
    que « aucune société suisse de ce nom ». L'utilisateur lisait une conclusion
    sur le registre suisse alors que le registre ne nous avait jamais répondu.
    """
    from app.services.country_packs import ch

    pack = ch.SwissPack()
    with patch.object(ch, "_creds", lambda: ("user", "pass")):
        out = await pack._search(_status_client(401, method="post"), "ACME", ("u", "p"))

    assert out == [], "aucune société inventée"
    entries = _entries("zefix")
    assert entries, "un 401 sur nos identifiants doit être signalé"
    assert any("401" in e["reason"] for e in entries)


@pytest.mark.asyncio
async def test_zefix_empty_result_is_not_a_degradation() -> None:
    """Réciproque : Zefix qui répond 200 avec zéro ligne est un vrai vide."""
    from app.services.country_packs import ch

    pack = ch.SwissPack()
    out = await pack._search(_status_client(200, payload=[], method="post"), "ACME", ("u", "p"))

    assert out == []
    assert not _entries("zefix"), "200 + liste vide = absence réelle"


@pytest.mark.asyncio
async def test_zefix_uid_lookup_failure_is_recorded() -> None:
    from app.services.country_packs import ch

    pack = ch.SwissPack()
    out = await pack._get_by_uid(_status_client(503), "CHE-123.456.789", ("u", "p"))

    assert out is None
    assert _entries("zefix")


@pytest.mark.asyncio
async def test_kbo_failure_is_recorded() -> None:
    """BE — KBO est public et sans clé : le budget est par IP, donc un 429 est
    le mode d'échec le plus probable, et il ressemblait à « aucune entreprise
    belge de ce nom »."""
    from app.services.country_packs import be

    pack = be.BelgianPack()
    out = await pack._resolve_name(_status_client(429), "ACME")

    assert not out
    assert _entries("kbo")


@pytest.mark.asyncio
async def test_sec_edgar_failure_is_recorded() -> None:
    """US — la SEC bloque sur User-Agent absent ou débit excessif (403). Un 403
    devenait « cette société n'a pas de dépôt SEC », ce qui est une affirmation
    forte et fausse sur une société cotée."""
    from app.services.country_packs import us

    pack = us.UsPack()
    out = await pack._find_cik(_status_client(403), "ACME CORP")

    assert not out
    assert _entries("sec_edgar")


@pytest.mark.asyncio
async def test_cbr_failure_is_recorded() -> None:
    """CA — même forme sur le registre canadien."""
    from app.services.country_packs import ca

    pack = ca.CanadaPack()
    out = await pack._search(_status_client(500), "ACME")

    assert not out
    assert _entries("cbr")
