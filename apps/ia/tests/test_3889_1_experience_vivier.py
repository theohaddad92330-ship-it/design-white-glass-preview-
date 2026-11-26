"""#3889.1 (lot I02) — « quels consultants ont une expérience chez <compte> ? ».

Une expérience déclarée dans un CV AUTORISÉ est retrouvée même SANS affectation de
mission Bellum. Avant ce lot, `search_talents` ne cherchait que par nom, intitulé ou
compétence, et `find_accounts_for_talent` fait l'inverse (marché, pour UN consultant
déjà nommé).
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import SEARCH_TALENTS_TOOL, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


def test_3889_1_le_schema_expose_experience_client() -> None:
    assert "experience_client" in SEARCH_TALENTS_TOOL["input_schema"]["properties"]


@pytest.mark.asyncio
async def test_3889_1_experience_client_interroge_les_experiences_pas_la_recherche_texte(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    async def _by_experience(user_id: str, client: str) -> dict[str, object]:
        calls.append(client)
        return {
            "total": 1,
            "items": [
                {
                    "consultantId": "c1",
                    "fullName": "Nom Un",
                    "title": "Data engineer",
                    "experiences": [{"client": "Sanofi", "role": "Data engineer", "from": "2023-01-01", "to": None}],
                }
            ],
        }

    async def _search(*_a: object, **_k: object) -> dict[str, object]:
        raise AssertionError("la recherche texte ne doit pas être appelée")

    monkeypatch.setattr(bellum_api, "search_talents_by_experience", _by_experience)
    monkeypatch.setattr(bellum_api, "search_talents", _search)
    out = await execute_chat_tool("search_talents", {"experience_client": " Sanofi "}, user_id=USER, profile_data=None)
    assert calls == ["Sanofi"]
    assert out["experience_client"] == "Sanofi"
    assert out["talents"][0]["full_name"] == "Nom Un"
    assert out["talents"][0]["experiences"][0]["client"] == "Sanofi"
    assert out["total"] == 1


@pytest.mark.asyncio
async def test_3889_1_aucun_resultat_se_nomme_sans_generaliser(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _by_experience(user_id: str, client: str) -> dict[str, object]:
        return {"total": 0, "items": []}

    monkeypatch.setattr(bellum_api, "search_talents_by_experience", _by_experience)
    out = await execute_chat_tool("search_talents", {"experience_client": "Sanofi"}, user_id=USER, profile_data=None)
    assert out["talents"] == []
    assert out["total"] == 0
    # Une absence parmi les CV AUTORISÉS ne dit rien des CV non autorisés (#3889.5).
    assert "autoris" in out["scope_note"]


@pytest.mark.asyncio
async def test_3889_1_pont_muet_est_une_erreur_claire(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _by_experience(user_id: str, client: str) -> None:
        return None

    monkeypatch.setattr(bellum_api, "search_talents_by_experience", _by_experience)
    out = await execute_chat_tool("search_talents", {"experience_client": "Sanofi"}, user_id=USER, profile_data=None)
    assert "error" in out


# #4287.8 (recette prod 19/10) — « aucun consultant avec une expérience déclarée chez Sanofi » sans dire POURQUOI :
# des fiches existent mais leur CV n'est pas autorisé. L'écart se DIT, chiffré, et propose l'action.
@pytest.mark.asyncio
async def test_4287_8_cv_non_autorises_sont_comptes_et_l_action_est_proposee(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _by_experience(user_id: str, client: str) -> dict[str, object]:
        return {"total": 0, "items": [], "withheldForConsent": 3}

    monkeypatch.setattr(bellum_api, "search_talents_by_experience", _by_experience)
    out = await execute_chat_tool("search_talents", {"experience_client": "Sanofi"}, user_id=USER, profile_data=None)
    assert out["withheld_for_consent"] == 3
    directive = out["withheld_directive"]
    assert "3" in directive and "consentement" in directive.lower()
    assert "Sanofi" in directive


@pytest.mark.asyncio
async def test_4287_8_rien_a_dire_quand_aucune_fiche_n_est_ecartee(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _by_experience(user_id: str, client: str) -> dict[str, object]:
        return {"total": 0, "items": [], "withheldForConsent": 0}

    monkeypatch.setattr(bellum_api, "search_talents_by_experience", _by_experience)
    out = await execute_chat_tool("search_talents", {"experience_client": "Sanofi"}, user_id=USER, profile_data=None)
    assert "withheld_directive" not in out
    assert "withheld_for_consent" not in out
