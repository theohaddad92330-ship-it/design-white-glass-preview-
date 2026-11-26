"""#2450.1/.2/.9 (épopée #2882) — la POLITIQUE de chaque mode est un objet réel :
c'est lui, et non une condition en dur, qui décide du palier, de la recherche
publique et de la proposition de passage au mode supérieur.

Ces tests savent dire NON : ``auto`` n'a pas d'entrée (rien n'est forcé) et un
mode qui ne propose pas de passage ne produit jamais d'avis.
"""

from __future__ import annotations

from dataclasses import fields, replace

import pytest

from app.services import chat_model_routing as routing
from app.services.chat_model_routing import (
    CHAT_MODE_POLICIES,
    ChatModePolicy,
    ChatTierContext,
    mode_excluded_tool_names,
    mode_insufficiency_notice,
)

ACTUALITE = "Quoi de neuf chez Thales ?"


def test_la_politique_porte_trois_faits_reels() -> None:
    assert tuple(f.name for f in fields(ChatModePolicy)) == ("tier", "excludes_web_search", "proposes_upgrade")


def test_chaque_mode_force_decrit_son_palier_sa_recherche_et_son_upgrade() -> None:
    assert CHAT_MODE_POLICIES == {
        "rapide": ChatModePolicy(tier="fast", excludes_web_search=True, proposes_upgrade=True),
        "verifie": ChatModePolicy(tier="deep", excludes_web_search=False, proposes_upgrade=False),
        "approfondi": ChatModePolicy(tier="deep", excludes_web_search=False, proposes_upgrade=False),
    }
    assert "auto" not in CHAT_MODE_POLICIES


def test_l_avis_de_passage_suit_la_politique_pas_le_nom_du_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    ctx = ChatTierContext(requested_mode="verifie")
    assert mode_insufficiency_notice(ACTUALITE, ctx) is None
    # Une politique qui PROPOSE le passage produit l'avis — même sous un autre nom de mode.
    patched = {**CHAT_MODE_POLICIES, "verifie": replace(CHAT_MODE_POLICIES["verifie"], proposes_upgrade=True)}
    monkeypatch.setattr(routing, "CHAT_MODE_POLICIES", patched)
    assert mode_insufficiency_notice(ACTUALITE, ctx) is not None


def test_la_recherche_publique_suit_la_politique(monkeypatch: pytest.MonkeyPatch) -> None:
    assert mode_excluded_tool_names("rapide") == frozenset({"web_search"})
    assert mode_excluded_tool_names("verifie") == frozenset()
    assert mode_excluded_tool_names("auto") == frozenset()
    assert mode_excluded_tool_names(None) == frozenset()
