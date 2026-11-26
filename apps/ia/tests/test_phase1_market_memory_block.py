"""#1590 — le 4ᵉ bloc du prompt d'analyse : MÉMOIRE MARCHÉ.

Le diagnostic du 09/09 mesurait « 0 occurrence, les 3 blocs existants
(connaissance / périmètre / pays) n'ont pas de 4ᵉ voisin » dans
`phase1_research.py`. Ce fichier verrouille le bloc, pas sa formulation exacte :
le seuil transverse, le vocabulaire, l'absence de bloc sous le seuil ou sans
résolution, et le best-effort strict (jamais une erreur, jamais un bloc vide).
"""

from __future__ import annotations

import pytest

from app.routers.phase1_research import (
    MARKET_MEMORY_WHAT_IT_DOES_NOT_SAY,
    _fetch_market_memory_context,
    _market_memory_block,
)
from app.services.discover_scoring import _MARKET_MEMORY_MIN_PATHS
from app.services.market_memory_wording import market_memory_forbidden_hits

# ── Le bloc, pur ─────────────────────────────────────────────────────────────


def test_no_block_below_the_transverse_threshold() -> None:
    """Sous le seuil, la mémoire marché elle-même ne rend aucun compte : un
    appelant honnête ne peut jamais transmettre 1 ou 2 ici (même discipline que
    `discover_scoring._path_axis`, GA-272)."""
    for paths in (0, 1, 2, _MARKET_MEMORY_MIN_PATHS - 1):
        assert _market_memory_block(paths, "ALTEN") is None


def test_no_block_when_the_entity_is_not_resolved() -> None:
    """``None`` couvre non-résolu, ambigu et sous le seuil : dans les trois cas,
    aucun bloc n'entre dans le prompt."""
    assert _market_memory_block(None, None) is None
    assert _market_memory_block(None, "ALTEN") is None


def test_block_appears_at_and_above_the_threshold() -> None:
    for paths in (_MARKET_MEMORY_MIN_PATHS, _MARKET_MEMORY_MIN_PATHS + 1, 9, 41):
        block = _market_memory_block(paths, "ALTEN")
        assert block is not None
        assert str(paths) in block
        assert "ALTEN" in block


def test_block_names_no_esn_it_was_not_given() -> None:
    block = _market_memory_block(_MARKET_MEMORY_MIN_PATHS, None)
    assert block is not None
    assert "sociétés de services partenaires" in block


def test_block_header_names_market_memory_explicitly() -> None:
    block = _market_memory_block(9, "ALTEN")
    assert block is not None
    assert "Observation du marché" in block


def test_block_uses_the_word_observe() -> None:
    block = _market_memory_block(9, "ALTEN")
    assert block is not None
    assert "observé" in block.lower()


def test_block_carries_the_hardcoded_what_it_does_not_say_section() -> None:
    """Non négociable : le second bloc est TOUJOURS le même texte, jamais un
    paramètre — le retour le pose EN DUR."""
    block = _market_memory_block(9, "ALTEN")
    assert block is not None
    assert MARKET_MEMORY_WHAT_IT_DOES_NOT_SAY in block
    assert "CE QUE ÇA NE DIT PAS" in MARKET_MEMORY_WHAT_IT_DOES_NOT_SAY


def test_block_and_disclaimer_never_use_forbidden_wording() -> None:
    """#1629.2 — la garde transverse aurait pu suffire ; ce test-ci prouve que
    LA SOURCE du 4ᵉ bloc, spécifiquement, ne fuit pas — indépendamment de la
    garde qui balaie le reste du registre."""
    for paths in (_MARKET_MEMORY_MIN_PATHS, 9, 41):
        block = _market_memory_block(paths, "ALTEN")
        assert block is not None
        assert market_memory_forbidden_hits(block) == []
    assert market_memory_forbidden_hits(MARKET_MEMORY_WHAT_IT_DOES_NOT_SAY) == []


# ── Le best-effort, réseau ───────────────────────────────────────────────────


class _Req:
    """Un `ResearchRequest` minimal — seuls les champs lus par le fetcher."""

    def __init__(self, company_name="Société Générale", user_id="u-1", website=None, country="FR"):
        self.company_name = company_name
        self.user_id = user_id
        self.website = website
        self.country = country


@pytest.mark.asyncio
async def test_fetch_reads_paths_and_top_esn_from_a_covered_response(monkeypatch) -> None:
    from app.services import bellum_api

    async def fake_context(user_id, *, ref, company_name, website=None, country=None):
        assert company_name == "Société Générale"
        # #1590 — `ref` est libre et ressort tel quel : Phase 1 n'a pas
        # d'`accountId`, elle passe le nom.
        assert ref == "Société Générale"
        return {
            "status": "ok",
            "coverage": {
                "covered": True,
                "marketPaths": 9,
                "esnObserved": [{"esnName": "ALTEN", "persons": 5, "certainty": "forte"}],
            },
        }

    monkeypatch.setattr(bellum_api, "market_memory_context_for", fake_context)
    paths, top_esn = await _fetch_market_memory_context(_Req())
    assert paths == 9
    assert top_esn == "ALTEN"


@pytest.mark.asyncio
async def test_fetch_is_none_when_not_covered(monkeypatch) -> None:
    from app.services import bellum_api

    async def fake_context(user_id, *, ref, company_name, website=None, country=None):
        return {"status": "ok", "coverage": {"covered": False}}

    monkeypatch.setattr(bellum_api, "market_memory_context_for", fake_context)
    assert await _fetch_market_memory_context(_Req()) == (None, None)


@pytest.mark.asyncio
async def test_fetch_is_none_when_the_bridge_is_unavailable(monkeypatch) -> None:
    """Statut `unavailable` (panne de lecture) — jamais confondu avec « pas
    d'observation », mais le prompt fait la MÊME chose dans les deux cas :
    aucun bloc, jamais une erreur (best-effort strict)."""
    from app.services import bellum_api

    async def fake_context(user_id, *, ref, company_name, website=None, country=None):
        return {"status": "unavailable", "reason": "read_failed"}

    monkeypatch.setattr(bellum_api, "market_memory_context_for", fake_context)
    assert await _fetch_market_memory_context(_Req()) == (None, None)


@pytest.mark.asyncio
async def test_fetch_is_none_when_the_bridge_is_not_configured(monkeypatch) -> None:
    """Sans `API_INTERNAL_URL`/`INTERNAL_API_SECRET`, `bellum_api` rend `None`
    sans trafic réseau (contrat établi) — le fetcher doit s'en accommoder."""
    from app.services import bellum_api

    async def fake_context(user_id, *, ref, company_name, website=None, country=None):
        return None

    monkeypatch.setattr(bellum_api, "market_memory_context_for", fake_context)
    assert await _fetch_market_memory_context(_Req()) == (None, None)


@pytest.mark.asyncio
async def test_fetch_is_none_without_raising_when_the_bridge_raises(monkeypatch) -> None:
    """Best-effort STRICT : même une exception imprévue du pont ne doit jamais
    remonter jusqu'à `_research()` et faire tomber l'analyse."""
    from app.services import bellum_api

    async def raising_context(user_id, *, ref, company_name, website=None, country=None):
        raise RuntimeError("boom")

    monkeypatch.setattr(bellum_api, "market_memory_context_for", raising_context)
    assert await _fetch_market_memory_context(_Req()) == (None, None)


@pytest.mark.asyncio
async def test_fetch_short_circuits_on_an_empty_company_name() -> None:
    """Pas de nom, pas de mémoire marché à interroger — zéro appel réseau."""
    assert await _fetch_market_memory_context(_Req(company_name="  ")) == (None, None)


# ── Le transport lui-même ───────────────────────────────────────────────────
#
# #1590 — Phase 1 ne porte PAS sa propre route : elle emprunte
# `market_memory_context_for` (`market/context`), la porte ouverte par
# #1611.4/.5 pour le plan et les messages. Une seconde route pour la même
# lecture aurait été un second point de résolution, ce que GA-258 interdit —
# et deux chemins qui refont la même dérivation divergent.
#
# Le transport est donc couvert par `test_bellum_plan_market_memory.py` et
# `test_bellum_messages_market_memory.py`, pas ici : ce fichier ne teste que
# ce qui lui appartient — le bloc de prompt et son fetcher best-effort.
