"""``VOCABULARY_MODEL`` — le modèle de l'enrichissement de vocabulaire devient
réglable par env, comme ``STRATEGY_MODEL`` / ``ORGANIGRAMME_MODEL`` / ``PLAN_LIGHT_MODEL``.

Pourquoi : ``bellum_vocabulary_builder`` est de l'étiquetage pur (term / kind
dans une énumération fermée / meaning / commercialWhy) avec un budget de 8000
tokens de sortie, et il tourne sur le modèle par défaut — Sonnet, à 15 $/M en
sortie. C'est le profil que le repo a déjà basculé sur Haiku partout ailleurs
(``bellum_signals`` : « pure structured extraction — Haiku hits the schema as
well as Sonnet at ~12× lower cost »).

Le défaut reste Sonnet : sans variable d'environnement, l'appel est
byte-identique. La bascule est un réglage Railway, pas un changement de code —
c'est une décision qualité, elle appartient à l'opérateur.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.services.account_vocabulary import enrich_vocabulary

_VOCAB = {"terms": [{"term": "POSIT'V", "kind": "program"}]}


async def _spy_call(*args, **kwargs):
    _spy_call.kwargs = kwargs
    return {"terms": []}, None


@pytest.mark.asyncio
async def test_no_model_kwarg_by_default() -> None:
    """Sans override, aucun ``model=`` n'est passé : l'appel garde le modèle par
    défaut de ``call_claude``, exactement comme avant."""
    with patch.dict("os.environ", {}, clear=False):
        import os

        os.environ.pop("VOCABULARY_MODEL", None)
        await enrich_vocabulary(_VOCAB, "sources", "VINCI", call=_spy_call)

    assert "model" not in _spy_call.kwargs


@pytest.mark.asyncio
async def test_env_override_routes_the_call() -> None:
    with patch.dict("os.environ", {"VOCABULARY_MODEL": "claude-haiku-4-5"}):
        await enrich_vocabulary(_VOCAB, "sources", "VINCI", call=_spy_call)

    assert _spy_call.kwargs["model"] == "claude-haiku-4-5"


@pytest.mark.asyncio
async def test_blank_override_is_ignored() -> None:
    """Une variable posée à vide sur Railway ne doit pas router vers un modèle
    "" (400 sur chaque appel) — elle vaut « non réglée »."""
    with patch.dict("os.environ", {"VOCABULARY_MODEL": "  "}):
        await enrich_vocabulary(_VOCAB, "sources", "VINCI", call=_spy_call)

    assert "model" not in _spy_call.kwargs
