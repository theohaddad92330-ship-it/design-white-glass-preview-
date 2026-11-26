"""Tests de `app/prompts/registry_history.py` — diff et rollback (#2445.1, #2766).

Hermétique : aucune commande git n'est EXÉCUTÉE dans ces tests (sauf le test
d'intégration dédié, qui interroge l'historique RÉEL du dépôt en lecture
seule — `git diff`, jamais une écriture). `diff_command`/`rollback_command`
sont de purs assembleurs de commande.
"""

from __future__ import annotations

import pytest

from app.prompts.registry import EXTRA_PROMPTS, SYSTEM_PROMPTS
from app.prompts.registry_history import (
    REPO_ROOT,
    diff_command,
    golden_file_for,
    registered_prompt_names,
    rollback_command,
    run_diff,
    source_file_for,
)


def test_registered_prompt_names_matches_the_registry():
    expected = {spec.name for spec in SYSTEM_PROMPTS} | {spec.name for spec in EXTRA_PROMPTS}
    assert set(registered_prompt_names()) == expected


def test_golden_file_for_points_at_the_committed_golden_set():
    path = golden_file_for("advisor")
    assert path == REPO_ROOT / "apps" / "ia" / "tests" / "golden" / "system" / "advisor.txt"
    assert path.exists(), "le golden de `advisor` doit être committé (test_prompt_golden.py)"


def test_diff_command_targets_the_golden_file_relative_to_repo_root():
    command = diff_command("advisor", "origin/main")
    assert command == ("git", "diff", "origin/main", "HEAD", "--", "apps/ia/tests/golden/system/advisor.txt")


def test_diff_command_accepts_an_explicit_second_ref():
    command = diff_command("advisor", "abc123", "def456")
    assert command == ("git", "diff", "abc123", "def456", "--", "apps/ia/tests/golden/system/advisor.txt")


def test_rollback_command_is_none_for_an_unregistered_prompt():
    assert rollback_command("ce-prompt-n-existe-pas", "origin/main") is None


@pytest.mark.parametrize("name", registered_prompt_names())
def test_source_file_for_resolves_to_a_real_file_under_the_repo(name):
    """Chaque prompt enregistré résout vers un fichier RÉEL — jamais
    `registry.py` lui-même (le défaut qu'un wrapper local non résolu produirait)."""
    path = source_file_for(name)
    assert path is not None
    assert path.exists()
    assert path.name != "registry.py", (
        f"« {name} » résout vers registry.py — son builder est un wrapper local "
        "dont le module cible (`bellum_<x>`) n'a pas été résolu."
    )
    assert path.name.startswith("bellum_")


def test_rollback_command_targets_the_resolved_source_file():
    source = source_file_for("advisor")
    command = rollback_command("advisor", "origin/main")
    assert command == ("git", "checkout", "origin/main", "--", str(source.relative_to(REPO_ROOT)))


# ── Intégration : le vrai dépôt, en lecture seule ────────────────────────────


def test_run_diff_against_head_itself_is_empty():
    """`git diff HEAD HEAD` est toujours vide — preuve que la commande
    s'exécute réellement (hermétique : aucun réseau, un `git diff` local,
    même outillage que `app/eval/gate.py`)."""
    assert run_diff("advisor", "HEAD", "HEAD") == ""


def test_repo_root_ne_plante_pas_dans_le_conteneur_de_production():
    """Hotfix 28/09 : dans l'image Railway le module vit à
    `/app/app/prompts/registry_history.py` — quatre parents seulement.
    `parents[4]` levait `IndexError` À L'IMPORT et l'IA ne démarrait plus
    (trois déploiements échoués). Le calcul doit tenir sur un chemin court."""
    from pathlib import PurePosixPath

    from app.prompts.registry_history import _repo_root_from

    assert _repo_root_from(PurePosixPath("/app/app/prompts/registry_history.py")) == PurePosixPath("/")
    assert _repo_root_from(
        PurePosixPath("/w/repo/apps/ia/app/prompts/registry_history.py")
    ) == PurePosixPath("/w/repo")
