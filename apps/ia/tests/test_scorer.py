"""Router tests for ``/scorer/recalculate`` — the seller-context source switch.

Proves the endpoint (a) resolves the seller profile from the unified
``resolve_seller_context`` (esn_profiles) when the API forwards nothing, and
(b) uses a forwarded ``profile_data`` verbatim when present — never the legacy
``profiles`` table.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.models.outputs.scorer import MINIMUM_AXES, ScoringOutput

_ACCOUNT = {"company_name": "SNCF", "raw_analysis": {"priority_score": 8.5}}
_RESOLVED = {"companyName": "DataForge", "offers": ["Data & IA"], "size": "12"}


def _patches(resolved: dict | None = None):
    # ⚠️ Les axes ne sont pas décoratifs : depuis le 29/08/2026 un score NU est
    # refusé à la validation. Cette fixture construisait la sortie exacte que le
    # banc a vue arriver vide — la corriger, c'est faire décrire au test ce que
    # la production produit vraiment.
    scoring = ScoringOutput(
        global_score=8.0,
        recommendation="GO",
        one_line="prioritaire",
        criteria={
            "offer_fit": {"score": 9.0, "reason": "Les offres couvrent le besoin cité."},
            "size_compatibility": {"score": 7.0, "reason": "ETI, taille cible de l'ESN."},
            "geographic_fit": {"score": 8.0, "reason": "Même région que les références."},
        },
    )
    return (
        patch("app.routers.scorer.get_supabase", return_value=MagicMock()),
        patch("app.routers.scorer.fetch_owned_account", new_callable=AsyncMock, return_value=_ACCOUNT),
        patch(
            "app.routers.scorer.resolve_seller_context",
            new_callable=AsyncMock,
            return_value=(resolved if resolved is not None else {}),
        ),
        patch("app.routers.scorer.call_claude", new_callable=AsyncMock, return_value=(scoring, None)),
    )


def test_scorer_resolves_seller_context_when_no_profile_forwarded(client: TestClient) -> None:
    p1, p2, p3, p4 = _patches(resolved=_RESOLVED)
    with p1, p2, p3 as m_resolve, p4:
        res = client.post("/scorer/recalculate", json={"account_id": "a1", "user_id": "u1"})
    assert res.status_code == 200
    assert res.json()["data"]["recommendation"] == "GO"
    # The unified source was read, keyed on the user.
    m_resolve.assert_awaited_once()
    assert m_resolve.await_args.args[1] == "u1"


def test_scorer_uses_forwarded_profile_and_skips_resolve(client: TestClient) -> None:
    p1, p2, p3, p4 = _patches()
    with p1, p2, p3 as m_resolve, p4 as m_claude:
        res = client.post(
            "/scorer/recalculate",
            json={
                "account_id": "a1",
                "user_id": "u1",
                "profile_data": {"companyName": "Acme", "offers": ["SRE"]},
            },
        )
    assert res.status_code == 200
    # A forwarded profile is used verbatim — no fallback read.
    m_resolve.assert_not_awaited()
    # …and it flowed into the prompt (companyName surfaces in the system prompt).
    system_prompt = m_claude.await_args.args[0]
    assert "Acme" in system_prompt


def test_scorer_502_on_claude_error(client: TestClient) -> None:
    p1, p2, p3, _ = _patches(resolved=_RESOLVED)
    p4 = patch("app.routers.scorer.call_claude", new_callable=AsyncMock, side_effect=ValueError("boom"))
    with p1, p2, p3, p4:
        res = client.post("/scorer/recalculate", json={"account_id": "a1", "user_id": "u1"})
    assert res.status_code == 502


# ── Un score n'est JAMAIS nu (doctrine) ──────────────────────────────────────
#
# Mesuré le 29/08/2026 sur le banc : trois tirages de `bellum_scorer` sur trois
# ont rendu `{"global_score": 5.0, "criteria": {}, "recommendation": "PRUDENT"}`
# — tous les textes vides. Et `ScoringOutput.model_validate({})` PASSAIT : chaque
# champ porte un défaut, `criteria` compris.
#
# La sortie n'était donc pas rejetée, elle était PERSISTÉE. Un 5/10 « PRUDENT »
# sans un seul axe, c'est exactement le score nu que la doctrine interdit :
# « un score n'est jamais nu : ses axes, et ce qui n'a pas pu être évalué est
# NOMMÉ. Sous 3 axes, il n'y a pas de score. »
#
# Le refus doit être BRUYANT et NOMMER ce qui manque : `instructor` renvoie le
# message de validation au modèle (reask), donc un refus muet ferait relancer le
# même prompt à l'identique. Même forme que
# `research.ResearchStrategy._refuse_a_strategy_that_says_nothing`.

def _axes(n: int) -> dict:
    return {f"axe_{i}": {"score": 7.0, "reason": f"raison {i}"} for i in range(n)}


def test_un_score_SANS_AUCUN_axe_est_refuse():
    with pytest.raises(ValidationError) as exc:
        ScoringOutput.model_validate({"global_score": 5.0, "criteria": {}})
    assert "score_sans_axes" in str(exc.value)


def test_l_objet_VIDE_ne_valide_plus():
    """C'est la forme exacte qu'ont rendue les trois tirages Sonnet du banc."""
    with pytest.raises(ValidationError):
        ScoringOutput.model_validate({})


def test_sous_le_plancher_le_score_est_refuse():
    with pytest.raises(ValidationError) as exc:
        ScoringOutput.model_validate({"global_score": 8.0, "criteria": _axes(MINIMUM_AXES - 1)})
    assert str(MINIMUM_AXES) in str(exc.value)


def test_au_plancher_le_score_passe():
    o = ScoringOutput.model_validate({"global_score": 8.0, "criteria": _axes(MINIMUM_AXES)})
    assert len(o.criteria) == MINIMUM_AXES


def test_un_axe_SANS_RAISON_n_est_pas_un_axe():
    """Un nombre sans sa raison est un chiffre, pas un axe — il ne compte pas."""
    muets = {f"axe_{i}": {"score": 7.0, "reason": "   "} for i in range(MINIMUM_AXES)}
    with pytest.raises(ValidationError):
        ScoringOutput.model_validate({"global_score": 8.0, "criteria": muets})


def test_le_message_NOMME_ce_qui_manque_pour_que_la_relance_soit_CIBLEE():
    with pytest.raises(ValidationError) as exc:
        ScoringOutput.model_validate({"global_score": 5.0, "criteria": _axes(1)})
    message = str(exc.value)
    # ⚠️ Chercher « 1 » et « 3 » quelque part dans le texte ne prouve RIEN : un
    # `ValidationError` en contient déjà (numéros de ligne, index). Première
    # version de ce test, restée VERTE alors que le message avait été vidé.
    # On exige donc la PHRASE, pas ses chiffres épars.
    assert f"1 axe(s) argumenté(s) rendu(s), il en faut au moins {MINIMUM_AXES}" in message, (
        "le message doit dire COMBIEN d'axes ont été rendus et combien il en faut — "
        f"sans ça, instructor relance le même prompt à l'identique. Reçu : {message}"
    )
