"""Qualité de source — écarter les sources faibles des recommandations (Théo #2)."""

from __future__ import annotations

from app.services.source_quality import is_weak_source


def test_ia_reconstruction_is_weak():
    assert is_weak_source("ia_reconstruction") is True
    assert is_weak_source("IA_Reconstruction") is True  # case-insensitive


def test_real_sources_are_not_weak():
    for s in ("apollo", "pappers", "manual", "brave_search", ""):
        assert is_weak_source(s) is False


def test_none_is_not_weak():
    assert is_weak_source(None) is False
