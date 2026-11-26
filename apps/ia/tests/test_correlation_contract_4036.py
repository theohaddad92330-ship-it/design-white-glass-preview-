"""#3717.7 / #3777 (DEC-4036 Q10) — contrat api ↔ ia de l'identifiant de corrélation.

UN identifiant traverse l'analyse de compte et Laura : l'API le pose
(`correlationIdMiddleware`, ou le job BullMQ qui le porte) et l'envoie dans
`x-correlation-id` ; ce service le LIT au lieu d'en générer un second, le met
dans ses journaux (`[%(correlation_id)s]`), dans son scope Sentry et le
renvoie. L'API l'écrit ensuite sur la ligne de coût (`provider_costs.correlation_id`).
Le pendant côté API : `apps/api/src/correlation-id/correlation-contract.spec.ts`.
"""

from __future__ import annotations

import re
from pathlib import Path

from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.middleware.correlation_id import CORRELATION_ID_HEADER, CorrelationIdMiddleware, get_correlation_id

API_STORE = Path(__file__).resolve().parents[2] / "api" / "src" / "correlation-id" / "correlation-id.store.ts"


def _api_header_name(source: str) -> str | None:
    match = re.search(r"export const CORRELATION_ID_HEADER = '([^']+)'", source)
    return match.group(1) if match else None


def _app() -> Starlette:
    async def handler(_request):
        return JSONResponse({"seen": get_correlation_id()})

    app = Starlette(
        routes=[Route("/phase/1/research", handler, methods=["POST"]), Route("/chat", handler, methods=["POST"])]
    )
    app.add_middleware(CorrelationIdMiddleware)
    return app


def test_le_service_ia_lit_l_en_tete_que_l_api_envoie():
    assert _api_header_name(API_STORE.read_text(encoding="utf-8")) == CORRELATION_ID_HEADER


def test_le_contrat_sait_dire_non_sur_un_nom_divergent():
    assert _api_header_name("export const CORRELATION_ID_HEADER = 'x-trace-id'") != CORRELATION_ID_HEADER
    assert _api_header_name("// rien") is None


def test_l_analyse_et_laura_gardent_l_identifiant_de_l_api():
    client = TestClient(_app())
    for path in ("/phase/1/research", "/chat"):
        response = client.post(path, headers={CORRELATION_ID_HEADER: "cid-4036"})
        assert response.json() == {"seen": "cid-4036"}
        assert response.headers[CORRELATION_ID_HEADER] == "cid-4036"


def test_sans_en_tete_un_identifiant_est_pose_et_renvoye_jamais_vide():
    response = TestClient(_app()).post("/chat")
    seen = response.json()["seen"]
    assert seen and response.headers[CORRELATION_ID_HEADER] == seen
