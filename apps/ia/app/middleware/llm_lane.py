"""LOT (15/10) DATA-C — la voie « lot » d'une requête, lue sur son en-tête.

Un appelant de FOND (le refresh nocturne de la veille) pose
``x-bellum-llm-lane: batch`` : les appels Claude de CETTE requête partent alors
en Message Batches (moitié prix, repli synchrone garanti — ``llm_batch``).

ASGI pur, et non ``BaseHTTPMiddleware`` : la voie est un ``ContextVar`` posé
autour de l'application, retiré à la sortie — aucune requête voisine ne la voit.
"""

from __future__ import annotations

from starlette.types import ASGIApp, Receive, Scope, Send

from app.services.llm_batch import LANE_HEADER, lane_from_header, llm_lane

_HEADER = LANE_HEADER.encode("latin-1")


class LlmLaneMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        raw = next((value for key, value in scope.get("headers") or [] if key.lower() == _HEADER), None)
        lane = lane_from_header(raw.decode("latin-1") if raw is not None else None)
        if lane is None:
            await self.app(scope, receive, send)
            return
        with llm_lane(lane):
            await self.app(scope, receive, send)
