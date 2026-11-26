"""Couche config knowledge (niveau 1, Théo) — defaults versionnés + overrides
runtime (sans redeploy)."""

from __future__ import annotations

import pytest

from app.config.knowledge_config import clear_overrides, get_config, set_overrides
from app.services.entities import derive_no_go_keywords
from app.services.group_relationship import detect_insider
from app.services.source_quality import is_weak_source


@pytest.fixture(autouse=True)
def _reset_overrides():
    clear_overrides()
    yield
    clear_overrides()


def test_defaults_are_versioned():
    cfg = get_config()
    assert cfg.version == "v1"
    assert "ia_reconstruction" in cfg.sources.weak_sources


def test_override_changes_weak_source_without_redeploy():
    assert is_weak_source("brave_search") is False
    set_overrides({"sources": {"weak_sources": ["ia_reconstruction", "brave_search"]}})
    assert is_weak_source("brave_search") is True
    clear_overrides()
    assert is_weak_source("brave_search") is False  # reset


def test_override_no_go_threshold():
    assert derive_no_go_keywords(["IT"]) == frozenset()  # default min 3 drops "IT"
    set_overrides({"no_go": {"min_keyword_len": 2}})
    assert "it" in derive_no_go_keywords(["IT"])


def test_override_generic_esn_words():
    target = {"company_name": "VINCI", "subsidiaries": [{"name": "VINCI Foo"}]}
    assert detect_insider({"companyName": "Foo"}, target) is not None  # "Foo" not generic → match
    set_overrides({"group_relationship": {"generic_esn_words": ["foo"]}})
    assert detect_insider({"companyName": "Foo"}, target) is None  # now generic → needs exact match


def test_deep_merge_only_patches_named_domain():
    set_overrides({"sources": {"weak_sources": ["x"]}})
    cfg = get_config()
    assert cfg.sources.weak_sources == ["x"]
    assert cfg.no_go.min_keyword_len == 3  # other domains untouched


def test_config_is_frozen():
    import pydantic

    with pytest.raises((pydantic.ValidationError, TypeError, AttributeError)):
        get_config().version = "hacked"
