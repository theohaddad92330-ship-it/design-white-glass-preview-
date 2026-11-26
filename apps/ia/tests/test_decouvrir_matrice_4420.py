"""#4420 — matrice de couverture de Découvrir : les brides SANS choix produit.

- France Travail lit une plage de 150 offres mais ne rendait que 100 lignes : les plus anciennes des 150
  disparaissaient sans compteur, alors que la page était déjà payée (``limit`` clampé à 100, ``fetch`` à 150).
- Un zéro dont les sources ont été coupées par le délai, ou sont tombées, se lisait « aucune offre récente
  ne cite X » : un fait de marché affirmé sur une lecture qui n'a pas eu lieu.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.services import discover_skill_offers as skill


class _Response:
    status_code = 200
    content = b"{}"

    def __init__(self, payload: object) -> None:
        self._payload = payload

    def json(self) -> object:
        return self._payload

    def raise_for_status(self) -> None:
        return None


class _Client:
    """Un département qui a PLUS d'une page d'offres : 150 offres récentes, 150 employeurs distincts."""

    def __init__(self, offers: int) -> None:
        self.offers = offers
        self.ranges: list[str] = []

    async def post(self, url, **kwargs):
        return _Response({"access_token": "tok"})

    async def get(self, url, **kwargs):
        self.ranges.append(str(kwargs["params"]["range"]))
        created = (datetime.now(UTC) - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        return _Response(
            {
                "resultats": [
                    {
                        "id": str(i),
                        "intitule": "Développeur Java",
                        "dateCreation": created,
                        "entreprise": {"nom": f"EMPLOYEUR {i:03d}"},
                        "lieuTravail": {"libelle": "59 - LILLE", "codePostal": "59000"},
                        "typeContrat": "CDI",
                    }
                    for i in range(self.offers)
                ]
            }
        )


@pytest.fixture(autouse=True)
def _creds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")
    monkeypatch.setenv("FRANCE_TRAVAIL_RPS", "1000")


@pytest.mark.asyncio
async def test_a_full_france_travail_page_is_not_cut_below_what_was_read() -> None:
    from app.services.data_sources import france_travail as ft

    client = _Client(150)
    rows = await ft.list_hiring_companies("59", ["java"], limit=skill._FT_PAGE_SIZE, client=client)

    assert client.ranges == ["0-149"]
    assert len(rows) == 150, f"{len(rows)} lignes rendues sur 150 lues : la page payée est tronquée"


@pytest.mark.asyncio
async def test_other_callers_keep_their_limit() -> None:
    from app.services.data_sources import france_travail as ft

    rows = await ft.list_hiring_companies("59", ["java"], limit=25, client=_Client(150))

    assert len(rows) == 25


@pytest.mark.parametrize("cut,failed", [(3, 0), (0, 1), (1, 1)])
@pytest.mark.asyncio
async def test_an_empty_search_whose_sources_did_not_all_answer_never_says_no_offers(
    monkeypatch: pytest.MonkeyPatch, cut: int, failed: int
) -> None:
    async def harvest(skills, zone, profile, *, deadline):
        return skill.SkillHarvest(tried=3, cut=cut, failed=failed)

    monkeypatch.setattr(skill, "harvest_skill_offers", harvest)

    found = await skill.find_skill_accounts(["Java"], ["59"], {}, deadline=None)

    assert found.accounts == []
    assert found.info["emptyCause"] == "sources_unavailable"


@pytest.mark.asyncio
async def test_an_empty_search_whose_sources_all_answered_still_says_no_offers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def harvest(skills, zone, profile, *, deadline):
        return skill.SkillHarvest(tried=3)

    monkeypatch.setattr(skill, "harvest_skill_offers", harvest)

    found = await skill.find_skill_accounts(["Java"], ["59"], {}, deadline=None)

    assert found.info["emptyCause"] == "no_offers"
