"""#2721 — l'outil de recherche web de Laura : elle EXÉCUTE.

Ce que ce fichier tient :
  - l'outil rend des résultats RÉELS (titre/extrait/adresse), jamais une
    marche à suivre ;
  - une requête vide, une clé absente ou un appel qui échoue rendent une
    erreur CLAIRE — jamais un résultat inventé ;
  - le nom du fournisseur (« Brave ») ne voyage JAMAIS dans ce qui atteint le
    modèle — doctrine « nos fournisseurs ne se nomment jamais », vérifiée
    comme dans `test_run_account_search_tool.py`.
  - #2450.10 (épopée #2882, LOT écrivain 28/09) — une source tombée PENDANT
    l'appel (`brave_search._execute_query_uncached` appelle déjà
    `record_degradation` sur un 402/429/timeout, et rend `[]` pour CETTE
    requête) ne se confond plus avec « rien trouvé » : le résultat garde ce
    qui a pu être obtenu (déjà le cas), et signale la couverture réduite.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.middleware.correlation_id import _correlation_id
from app.services import source_health
from app.services.web_search_tool import WEB_SEARCH_TOOL, execute_web_search


def _hit(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "title": "Sopra Steria nomme un nouveau DSI",
        "description": "Le groupe annonce l'arrivée de...",
        "url": "https://example.com/sopra-dsi",
        "query": "Sopra Steria DSI",
    }
    base.update(overrides)
    return base


def _stub_search_web(monkeypatch: pytest.MonkeyPatch, result: Any) -> list[str]:
    seen: list[str] = []

    async def _fake(query: str, **kwargs: Any) -> Any:
        seen.append(query)
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr("app.services.brave_search.search_web", _fake)
    return seen


def test_l_outil_declare_une_execution_pas_une_marche_a_suivre() -> None:
    assert WEB_SEARCH_TOOL["name"] == "web_search"
    assert "résultats" in WEB_SEARCH_TOOL["description"].lower()
    assert WEB_SEARCH_TOOL["input_schema"]["required"] == ["query"]


async def test_projette_titre_description_url_rien_d_autre(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub_search_web(monkeypatch, [_hit()])
    out = await execute_web_search({"query": "Sopra Steria DSI"})
    assert seen == ["Sopra Steria DSI"]
    assert out["results"] == [
        {
            "title": "Sopra Steria nomme un nouveau DSI",
            "description": "Le groupe annonce l'arrivée de...",
            "url": "https://example.com/sopra-dsi",
        }
    ]


async def test_une_requete_vide_ne_part_jamais_en_recherche(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub_search_web(monkeypatch, [])
    out = await execute_web_search({"query": "   "})
    assert not seen, "aucune recherche ne doit partir sans requête"
    assert "error" in out


async def test_aucun_resultat_est_dit_jamais_invente(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_search_web(monkeypatch, [])
    out = await execute_web_search({"query": "une entreprise introuvable"})
    assert out["results"] == []
    assert "error" not in out


async def test_cle_absente_rend_une_erreur_claire_sans_inventer(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_search_web(monkeypatch, ValueError("BRAVE_API_KEY environment variable is not set."))
    out = await execute_web_search({"query": "Sopra Steria DSI"})
    assert "results" not in out
    assert "error" in out


async def test_echec_reseau_rend_une_erreur_claire_sans_inventer(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_search_web(monkeypatch, RuntimeError("timeout"))
    out = await execute_web_search({"query": "Sopra Steria DSI"})
    assert "results" not in out
    assert "error" in out


async def test_aucun_nom_de_fournisseur_ne_part_vers_le_modele(monkeypatch: pytest.MonkeyPatch) -> None:
    """⚠️ « NOS fournisseurs ne se nomment JAMAIS — ni à l'écran, ni dans un
    prompt. » Même contrôle que `test_run_account_search_tool.py`."""
    _stub_search_web(monkeypatch, [_hit()])
    out = await execute_web_search({"query": "Sopra Steria DSI"})
    rendu = repr(out).lower()
    for fournisseur in ("brave", "pappers", "apollo", "firecrawl", "recherche-entreprises"):
        assert fournisseur not in rendu, f"{fournisseur} ne doit jamais atteindre le modèle"


@pytest.fixture(autouse=True)
def _correlation_id_context():
    """Un identifiant de corrélation réel, comme la middleware en pose un par
    requête — sans lui, `get_correlation_id()` rend `""` et `source_health` ne
    peut rien attribuer à ce tour."""
    token = _correlation_id.set("test-cid-2450-10")
    try:
        yield "test-cid-2450-10"
    finally:
        _correlation_id.reset(token)
        source_health.clear_degradations("test-cid-2450-10")


class TestSourceToleeSignaleeCouvertureReduite:
    """#2450.10 — garder les résultats valides (déjà le cas), signaler la
    couverture réduite (le trou fermé par ce lot)."""

    async def test_sans_degradation_aucune_mention_de_couverture(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_search_web(monkeypatch, [_hit()])
        out = await execute_web_search({"query": "Sopra Steria DSI"})
        assert "coverage" not in out
        assert "note" not in out

    async def test_une_degradation_survenue_PENDANT_cet_appel_est_signalee(
        self, monkeypatch: pytest.MonkeyPatch, _correlation_id_context: str
    ) -> None:
        cid = _correlation_id_context

        async def _fake(query: str, **kwargs: Any) -> Any:
            # Simule EXACTEMENT ce que `_execute_query_uncached` fait déjà sur
            # un 402/429/timeout : la ligne perdue se signale, la fonction
            # rend quand même ce qu'elle a pu obtenir (ici rien, mais ça
            # pourrait être un sous-ensemble des résultats).
            source_health.record_degradation(cid, source="brave", reason="Quota de recherche web épuisé (402)")
            return []

        monkeypatch.setattr("app.services.brave_search.search_web", _fake)
        out = await execute_web_search({"query": "Sopra Steria DSI"})
        assert out["results"] == []
        assert out["coverage"] == "reduced"
        assert "note" in out and out["note"]
        # ⚠️ Toujours la même garde : la RAISON interne (qui nomme le
        # fournisseur) ne traverse jamais vers ce que le modèle reçoit.
        assert "brave" not in repr(out).lower()
        assert "402" not in repr(out)

    async def test_une_degradation_ANTERIEURE_dans_le_meme_tour_nest_pas_reattribuee_a_cet_appel(
        self, monkeypatch: pytest.MonkeyPatch, _correlation_id_context: str
    ) -> None:
        cid = _correlation_id_context
        # Un OUTIL PRÉCÉDENT du même tour a déjà dégradé une source (par
        # exemple une analyse de compte lancée plus tôt) — cet appel-ci
        # n'y est pour rien et ne doit pas hériter d'une mention fausse.
        source_health.record_degradation(cid, source="pappers", reason="Ancien échec, autre outil")

        _stub_search_web(monkeypatch, [_hit()])
        out = await execute_web_search({"query": "Sopra Steria DSI"})
        assert "coverage" not in out

    async def test_une_degradation_sans_correlation_id_ne_fait_pas_tomber_loutil(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Hors requête HTTP (aucun identifiant posé), l'outil continue de
        fonctionner — la mention de couverture est simplement absente."""
        _correlation_id.set("")
        _stub_search_web(monkeypatch, [_hit()])
        out = await execute_web_search({"query": "Sopra Steria DSI"})
        assert out["results"]
        assert "coverage" not in out


async def test_aucun_resultat_ne_relance_jamais_une_recherche_payante(monkeypatch: pytest.MonkeyPatch) -> None:
    """LOT (15/10) DATA-B.6 — un résultat vide ne déclenche PAS une relance automatique : le modèle
    dit ce qui a été cherché, puis propose — la personne décide de relancer."""
    _stub_search_web(monkeypatch, [])
    out = await execute_web_search({"query": "une entreprise introuvable"})
    step = out["next_step"].lower()
    assert "relance" not in step
    assert "reformule" not in step
    assert "propose" in step
