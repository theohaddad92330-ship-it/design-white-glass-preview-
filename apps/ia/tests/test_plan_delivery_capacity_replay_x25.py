"""#3226 (#3202.6, X25) — REJEU observable du bloc « CAPACITÉ DE DELIVERY ».

Recette prod 02/10 : « NON PROUVABLE ICI — bloc prompt invisible à l'écran ».
Le tour est rejoué : POST /phase/4/plan → pont `delivery_capacity` (simulé) →
prompt système REÇU par le modèle, capturé à chaque appel. Ce que ça prouve :
ce que le modèle reçoit (fait mesuré + consigne de non-promesse) ; ce que ça
ne prouve pas : que le modèle vivant obéit (question de recette dans l'issue).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tests.test_phase4_plan import _plan_dispatch

BODY = {
    "account_id": "abc-123",
    "user_id": "11111111-1111-4111-8111-111111111111",
    "account_data": {
        "sector": "Transport",
        "sources": {"tags": {"sector": "PUBLIC"}},
        "angles": [{"angle": "Modernisation SI"}],
    },
    "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
    "profile_data": {"companyName": "MonESN", "size": "50"},
}


def _captured_prompts(client: TestClient, capacity) -> list[str]:
    with (
        patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, side_effect=_plan_dispatch()) as claude,
        patch("app.routers.phase4_plan.bellum_api.delivery_capacity", new_callable=AsyncMock, return_value=capacity),
    ):
        res = client.post("/phase/4/plan", json=BODY)
    assert res.status_code == 200
    return [str(c[0][0]) for c in claude.call_args_list]


def test_le_modele_recoit_la_capacite_mesuree_et_la_consigne_de_non_promesse(client: TestClient) -> None:
    prompts = _captured_prompts(client, {"intercontractCount": 3})
    assert any("CAPACITÉ DE DELIVERY — POUR MonESN" in p for p in prompts)
    block = next(p for p in prompts if "CAPACITÉ DE DELIVERY" in p)
    assert "3 consultants sans affectation en cours" in block
    assert "ne promets aucun démarrage" in block
    assert "vérifier la disponibilité exacte" in block


def test_zero_mesure_est_dit_zero_et_non_mesure_ne_dit_rien(client: TestClient) -> None:
    zero = _captured_prompts(client, {"intercontractCount": 0})
    assert any("aucun consultant en intercontrat mesuré" in p for p in zero)
    absent = _captured_prompts(client, None)
    assert not any("CAPACITÉ DE DELIVERY" in p for p in absent)


def test_cible_esn_la_capacite_nourrit_une_co_traitance_x50(client: TestClient) -> None:
    """#3226 (X50) — le croisement par archétype, rejoué : un compte ESN (partenaire
    possible) reçoit la ligne co-traitance ; un client final, jamais."""
    esn = {**BODY, "account_data": {**BODY["account_data"], "actorType": "ESN"}}
    with (
        patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, side_effect=_plan_dispatch()) as claude,
        patch(
            "app.routers.phase4_plan.bellum_api.delivery_capacity",
            new_callable=AsyncMock,
            return_value={"intercontractCount": 2},
        ),
    ):
        assert client.post("/phase/4/plan", json=esn).status_code == 200
    assert any("co-traitance" in str(c[0][0]) for c in claude.call_args_list)
    assert not any("co-traitance" in p for p in _captured_prompts(client, {"intercontractCount": 2}))
