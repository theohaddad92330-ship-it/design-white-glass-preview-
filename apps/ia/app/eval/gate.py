"""Eval CI gate — golden set en gate AVANT merge (Théo p.15 / roadmap §17, C8).

Blocks a PR when the PROMPT SURFACE changed vs the base branch AND the hermetic
eval bench regresses vs the committed ``baseline.json``. Prompts unchanged →
fast skip (exit 0, no bench).

DETERMINISTIC and OFFLINE by construction: the bench (``app.eval.run``) replays
the committed golden fixtures through the eight deterministic metrics — it
never calls Claude or the network (``--live`` is a separate, manual-only path).

Decision table::

    prompt surface changed?   bench result          exit
    ────────────────────────  ────────────────────  ────
    no                        (not run — SKIP)      0
    yes                       pass + no regression  0
    yes                       fail OR regression    1
    unknown (git broken)      bench runs fail-safe  bench's

Usage (from ``apps/ia``)::

    python -m app.eval.gate                     # diff vs origin/main, skip or gate
    python -m app.eval.gate --base origin/main  # explicit base ref
    python -m app.eval.gate --force             # run the bench regardless of the diff

Or from the repo root: ``pnpm eval:gate`` (wraps this module).
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path
from typing import Any

# apps/ia/app/eval/gate.py → repo root (…/apps/ia/app/eval → 4 levels up).
REPO_ROOT = Path(__file__).resolve().parents[4]

DEFAULT_BASE_REF = "origin/main"

# The prompt surface — repo-root-relative paths whose change can drift model
# behaviour or the bench's verdict. Directories end with "/" (prefix match),
# files match exactly. Kept deliberately narrow so unrelated IA changes skip:
#   - app/prompts/            all system+user prompt builders, registry,
#                             fencing, context budget/transparency
#   - services/domain_focus.py rewrites the prompt strings per ESN domain
#                             (dé-silo) — a prompt change that lives outside
#                             app/prompts/
#   - app/eval/               the bench itself: metrics, goldens, fixtures and
#                             baseline.json must stay mutually consistent, so
#                             any edit re-runs the gate (incl. an intentional
#                             baseline update in the same PR)
#   - les modules DÉTERMINISTES dont la sortie entre dans le bench : ils
#     décident du rôle, du palier, du rang et du score d'un contact. Ils ne sont
#     pas des prompts, et c'est précisément pourquoi la garde les manquait — le
#     25/08, tout le lot « taxonomie de titres » a changé `decision_role`,
#     `hierarchy_level`, `contact_ranking` et `contact_priority_score`, et le
#     gate a SAUTÉ. Un bench qui ne se rejoue pas quand on change ce qu'il
#     mesure ne mesure plus rien.
#   - app/knowledge/          objections, comité d'achat, playbooks sectoriels :
#                             de la donnée qui atteint les prompts
PROMPT_SURFACE: tuple[str, ...] = (
    "apps/ia/app/prompts/",
    "apps/ia/app/services/domain_focus.py",
    "apps/ia/app/eval/",
    "apps/ia/app/knowledge/",
    "apps/ia/app/services/decision_role.py",
    "apps/ia/app/services/hierarchy_level.py",
    "apps/ia/app/services/contact_ranking.py",
    "apps/ia/app/services/contact_priority_score.py",
    "apps/ia/app/services/prioritization.py",
)


def is_prompt_path(path: str) -> bool:
    """True when ``path`` (repo-root-relative, git style) is on the prompt surface."""
    p = path.replace("\\", "/")
    for entry in PROMPT_SURFACE:
        if entry.endswith("/"):
            if p.startswith(entry):
                return True
        elif p == entry:
            return True
    return False


def prompt_changes(files: list[str]) -> list[str]:
    """The subset of ``files`` on the prompt surface, sorted."""
    return sorted({f for f in files if is_prompt_path(f)})


# ── git plumbing ──────────────────────────────────────────────────────────────


def _git(args: list[str], cwd: Path) -> str:
    out = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, check=True, timeout=60
    )
    return out.stdout


def changed_files_vs(base_ref: str = DEFAULT_BASE_REF, repo_root: Path | None = None) -> list[str] | None:
    """Files changed vs ``base_ref`` — committed (merge-base…HEAD), working tree
    and untracked. ``None`` when git is unavailable/broken (caller must treat
    that as "cannot prove prompts unchanged" and run the bench fail-safe)."""
    root = repo_root or REPO_ROOT
    try:
        merge_base = _git(["merge-base", base_ref, "HEAD"], root).strip()
        committed = _git(["diff", "--name-only", merge_base, "HEAD"], root)
        working = _git(["diff", "--name-only", "HEAD"], root)
        untracked = _git(["ls-files", "--others", "--exclude-standard"], root)
    except (subprocess.SubprocessError, OSError, FileNotFoundError):
        return None
    files = {f for chunk in (committed, working, untracked) for f in chunk.splitlines() if f}
    return sorted(files)


# ── gate ──────────────────────────────────────────────────────────────────────


def _run_bench(*, baseline_path: Path | None = None) -> int:
    """The hermetic bench + baseline enforcement. Lazy import: the skip path
    stays free of the metric modules (and of anything engine-adjacent)."""
    from .run import run as bench

    return bench(check_baseline=True, baseline_path=baseline_path)


def run_gate(
    base_ref: str = DEFAULT_BASE_REF,
    *,
    force: bool = False,
    changed: list[str] | None = None,
    baseline_path: Path | None = None,
) -> int:
    """Exit code of the gate: 0 = skip or bench green, 1 = regression/failure.

    ``changed`` injects the diff (tests); default = ``changed_files_vs(base_ref)``.
    """
    if force:
        print("eval gate: --force → bench sans détection de diff")
        return _run_bench(baseline_path=baseline_path)

    if changed is None:
        changed = changed_files_vs(base_ref)

    if changed is None:
        print(
            "eval gate: git indisponible — impossible de prouver que les prompts "
            "sont inchangés → bench fail-safe (hermétique, quelques secondes)"
        )
        return _run_bench(baseline_path=baseline_path)

    hits = prompt_changes(changed)
    if not hits:
        print(f"eval gate: SKIP — aucun fichier de la surface prompts modifié vs {base_ref}")
        return 0

    print(f"eval gate: surface prompts modifiée vs {base_ref} ({len(hits)} fichier(s)):")
    for f in hits:
        print(f"  - {f}")
    print("eval gate: replay du banc golden set (offline, fixtures committées)…")
    return _run_bench(baseline_path=baseline_path)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=(
            "Eval gate — replays the hermetic golden-set bench vs the committed "
            "baseline when the prompt surface changed vs the base branch."
        )
    )
    p.add_argument(
        "--base",
        default=DEFAULT_BASE_REF,
        help=f"Base git ref to diff against (default: {DEFAULT_BASE_REF}).",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="Run the bench regardless of the diff (no skip).",
    )
    args: Any = p.parse_args(argv)
    return run_gate(args.base, force=args.force)


if __name__ == "__main__":
    raise SystemExit(main())
