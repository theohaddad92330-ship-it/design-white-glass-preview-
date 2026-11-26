"""GA-322 — lot 16, câble 2 : ``list_hiring_companies`` avait un troisième
appelant du même hôte que ``_token``/``_search`` (déjà gardés par
``test_upstream_throttle_coverage.py::test_france_travail_token_and_search_are_throttled``),
mais SANS ``throttle("france_travail")`` : la fermeture ``_call`` (interne à
``list_hiring_companies``) fait le VRAI appel réseau ``/offres/search`` de
cette fonction, et ne passait par aucun limiteur.

C'est la famille « le voisin non limité » (PR #631 : ``search_companies``
seule non limitée à côté de ``list_companies``, 79,5 % des entreprises
jetées pour une panne d'infrastructure présentée comme un fait de marché) —
ici sur une clé qui a DÉJÀ déclenché #631 une fois. Un appel non limité peut
provoquer un 429 en rafale, qui déclenche depuis peu un refroidissement du
compartiment ``france_travail`` — refroidissement que cet appel ne respecte
pas non plus puisqu'il ne passe jamais par le compartiment.

Trois preuves exigées par CLAUDE.md pour toute garde d'architecture :

1. **LIT un corpus réel** : le test espionne le VRAI ``throttle`` (comme
   ``test_upstream_throttle_coverage.py``), pas un mock qui ne prouverait que
   la forme de l'appel.
2. **SAIT DIRE NON** : ``test_GA_322_without_the_fix_call_bypasses_throttle``
   rejoue le patron D'AVANT (l'appel HTTP direct, sans ``throttle``) et prouve
   que le compteur ne voit RIEN passer pour cet appel précis — la preuve que
   la garde détecte réellement l'absence du câblage.
3. **N'attrape pas ce qu'elle ne vise pas** : ``_token`` et ``_search``,
   déjà câblés, continuent de compter normalement (pas de double-comptage ni
   de régression sur les deux appelants existants).
"""

from __future__ import annotations

from unittest.mock import patch

import pytest


class _FTResponse:
    """Réponse minimale — seul compte le fait que la requête soit passée par
    le limiteur AVANT de partir."""

    def __init__(self, payload: object, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code
        self.content = b"{}"

    def json(self) -> object:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class _FTClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    async def post(self, url, **kwargs):
        self.calls.append(("POST", url))
        return _FTResponse({"access_token": "tok"})

    async def get(self, url, **kwargs):
        self.calls.append(("GET", url))
        return _FTResponse({"resultats": []})


def _throttle_spy(module):
    """Remplace ``module.throttle`` par un espion qui délègue au VRAI
    limiteur — le test prouve le passage, pas un mock isolé."""
    seen: list[str] = []
    real = module.throttle

    def _spy(provider: str):
        seen.append(provider)
        return real(provider)

    return seen, patch.object(module, "throttle", _spy)


@pytest.fixture(autouse=True)
def _creds(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")


# ── Preuve n°1 : LIT le vrai chemin de production ────────────────────────────


@pytest.mark.asyncio
async def test_GA_322_list_hiring_companies_call_is_throttled() -> None:
    """``list_hiring_companies`` doit consommer le quota ``france_travail``
    pour CHAQUE appel réseau qu'elle fait — le token (``_token``) ET la
    recherche d'offres (``_call``), exactement comme ``_search`` à côté."""
    from app.services.data_sources import france_travail as ft

    seen, spy = _throttle_spy(ft)
    client = _FTClient()

    with spy:
        await ft.list_hiring_companies(department="75", client=client)

    assert seen.count("france_travail") == 2, (
        f"GA-322 : {seen.count('france_travail')} passage(s) par le limiteur "
        "france_travail pour 1 token + 1 recherche — attendu 2. "
        "`_call` (fermeture interne de list_hiring_companies) doit passer par "
        "throttle('france_travail'), comme _token et _search."
    )
    assert len(client.calls) == 2  # le token ET la recherche sont vraiment parties


@pytest.mark.asyncio
async def test_GA_322_coarse_fallback_also_throttles_the_retry() -> None:
    """La maille fine refusée puis le repli département (2 appels ``_call``) :
    CHAQUE tentative doit consommer le quota, pas seulement la première."""
    from app.services.data_sources import france_travail as ft

    calls: list[str] = []

    class _FallbackClient(_FTClient):
        async def get(self, url, **kwargs):
            calls.append("get")
            if len(calls) == 1:
                return _FTResponse({}, status_code=400)  # maille fine refusée
            return _FTResponse({"resultats": []})

    seen, spy = _throttle_spy(ft)
    client = _FallbackClient()

    with spy:
        await ft.list_hiring_companies(
            department="75", commune_code="75056", distance_km=10, client=client
        )

    # 1 token + 2 tentatives _call (fine refusée puis repli département).
    assert seen.count("france_travail") == 3, (
        f"GA-322 : {seen.count('france_travail')} passages — attendu 3 "
        "(1 token + 2 tentatives _call, fine puis repli département)"
    )


# ── Preuve n°2 : SAIT DIRE NON — l'ancien patron contournait le limiteur ─────


@pytest.mark.asyncio
async def test_GA_322_without_the_fix_call_bypasses_throttle() -> None:
    """Rejoue le patron D'AVANT ce lot : un appel HTTP direct, sans
    ``throttle``. Prouve que le test « le compte passe par le limiteur »
    détecte bien l'absence du câblage — sans lui, AUCUN passage n'est compté
    pour cet appel, alors que la requête part quand même."""
    from app.services.data_sources import france_travail as ft

    seen, spy = _throttle_spy(ft)
    client = _FTClient()

    async def naive_call(query: dict[str, str]) -> dict:
        # Le patron d'AVANT ce lot : ``_call`` faisait l'appel HTTP direct,
        # sans jamais passer par ``throttle("france_travail")``.
        resp = await client.get(ft._SEARCH_URL, params=query, headers={})
        return resp.json()

    with spy:
        await naive_call({"domaine": "M18"})

    assert seen.count("france_travail") == 0, (
        "le patron naïf ne doit compter AUCUN passage par le limiteur — "
        "la preuve que la garde détecte réellement l'absence de throttle"
    )
    assert len(client.calls) == 1  # la requête part quand même, c'est le problème


# ── Preuve n°3 : ne casse pas les appelants déjà câblés ──────────────────────


@pytest.mark.asyncio
async def test_GA_322_token_and_search_are_unaffected() -> None:
    """Témoin de non-régression : ``_token``/``_search`` (déjà câblés, gardés
    par ailleurs) continuent de compter exactement 1 passage chacun."""
    from app.services.data_sources import france_travail as ft

    seen, spy = _throttle_spy(ft)
    client = _FTClient()

    with spy:
        token = await ft._token(client, "id", "secret")
        await ft._search(client, token, {})

    assert seen.count("france_travail") == 2
