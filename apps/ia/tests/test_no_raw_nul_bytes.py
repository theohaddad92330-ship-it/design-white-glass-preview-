"""GA-309 — aucun octet NUL brut dans le code source ou les goldens du service IA.

Trouvé le 12/09/2026 : ``tests/golden/system/advisor.txt`` portait 4 octets
NUL bruts (le premier à l'offset 26 535 sur 26 802) — hérités de l'ancien
marqueur de segmentation du cache (``CACHE_SEGMENT_BREAK`` posé en GA-293),
qui utilisait ``\\x00`` comme délimiteur et avait fui tel quel dans le golden
capturé par ``UPDATE_PROMPT_GOLDEN=1``.

Ce dépôt a déjà payé cette leçon (elle est dans sa mémoire) : un octet NUL
rend un fichier « binaire » pour git — son diff DISPARAÎT d'une pull request
(``Binary files a/... and b/... differ``), pendant que le typecheck, ESLint
et toute la suite restent verts. Personne ne relit un diff qui ne s'affiche
pas. Et ça passait ici PAR CHANCE D'OFFSET : git ne cherche un NUL que dans
les ~8 000 premiers octets d'un fichier ; le nôtre était à 26 535, hors de
cette fenêtre. Le jour où le fichier raccourcit, ou où le marqueur remonte
plus tôt dans le prompt, le golden du prompt le plus important du produit
devient invisible en revue — sans qu'aucun outil ne le signale.

Corrigé à la racine, pas seulement au symptôme : ``CACHE_SEGMENT_BREAK``
(``claude_service.py``) est maintenant un jeton IMPRIMABLE. Aucun octet NUL
ne peut plus être injecté dans un texte assemblé par ``build_system_prompt``,
donc plus aucun ne peut atteindre un golden, un journal ou un export
Langfuse. Cette garde tient l'invariant pour la suite du dépôt.

Périmètre : le SOURCE PYTHON suivi par git sous ``apps/ia/app`` et les
GOLDENS sous ``apps/ia/tests/golden`` — jamais un balayage disque brut, qui
remonterait ``__pycache__`` (non suivi par git, légitimement binaire, hors
sujet) ou tout autre artefact de build.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

_TESTS_DIR = Path(__file__).resolve().parent
_IA_ROOT = _TESTS_DIR.parent  # apps/ia
_REPO_ROOT = _IA_ROOT.parent.parent  # racine du monorepo


def _tracked_files_under(*relative_dirs: str) -> list[Path]:
    """Fichiers SUIVIS par git sous les répertoires donnés (chemins relatifs à
    la racine du dépôt). Un ``git ls-files`` par répertoire, jamais un
    ``Path.rglob`` — sinon ``__pycache__`` (gitignored, binaire par nature)
    entrerait dans le corpus et ferait rougir la garde pour rien."""
    paths: list[str] = [f"apps/ia/{d}" for d in relative_dirs]
    out = subprocess.run(
        ["git", "ls-files", *paths],
        cwd=_REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return [_REPO_ROOT / line for line in out.stdout.splitlines() if line]


def _corpus() -> list[Path]:
    app_py = [p for p in _tracked_files_under("app") if p.suffix == ".py"]
    golden = _tracked_files_under("tests/golden")
    return app_py + golden


def _files_with_a_raw_nul(paths: list[Path]) -> list[Path]:
    return [p for p in paths if b"\x00" in p.read_bytes()]


# ── 1. La garde LIT quelque chose (pas une garde borgne) ────────────────────


def test_the_guard_reads_a_real_non_empty_corpus() -> None:
    corpus = _corpus()
    assert len(corpus) > 300, (
        f"le corpus ne compte que {len(corpus)} fichier(s) — sous ce plancher, "
        "la garde ci-dessous serait verte pour de mauvaises raisons"
    )
    # Le fichier qui a déclenché cette garde doit être dedans, sans quoi le
    # corpus ne couvre même pas l'incident qui l'a fait naître.
    names = {p.name for p in corpus}
    assert "advisor.txt" in names
    assert "claude_service.py" in names


def test_pycache_artifacts_are_out_of_scope() -> None:
    """``__pycache__`` est gitignored : le corpus ne balaie que des fichiers
    SUIVIS, jamais le disque brut — sinon un bytecode compilé (légitimement
    binaire) ferait rougir la garde sans rapport avec ce qu'elle vise."""
    assert not any("__pycache__" in str(p) for p in _corpus())


# ── 2. Le test réel : plus aucun NUL dans le corpus actuel ──────────────────


def test_no_source_or_golden_file_carries_a_raw_nul_byte() -> None:
    offenders = _files_with_a_raw_nul(_corpus())
    assert not offenders, (
        "octet(s) NUL brut(s) trouvé(s) dans : "
        f"{[str(p.relative_to(_REPO_ROOT)) for p in offenders]} — un fichier avec un "
        "NUL est BINAIRE pour git, son diff disparaît d'une pull request sans que rien "
        "ne le signale (typecheck, ESLint et la suite restent verts)"
    )


# ── 3. La garde sait dire NON ────────────────────────────────────────────────


def test_GA_309_the_guard_detects_a_deliberately_injected_nul_byte(tmp_path: Path) -> None:
    poisoned = tmp_path / "poisoned_golden.txt"
    poisoned.write_bytes(b"contenu normal\x00puis la suite, comme dans advisor.txt")
    assert _files_with_a_raw_nul([poisoned]) == [poisoned], (
        "la garde doit détecter un NUL injecté volontairement, sinon elle ne protège rien"
    )


# ── 4. La garde n'attrape pas ce qu'elle ne vise pas ────────────────────────


def test_GA_309_legitimate_non_ascii_text_does_not_trip_the_guard(tmp_path: Path) -> None:
    """Du français accentué, de l'UTF-8 multioctet, un emoji : rien de tout ça
    n'est un octet NUL. La garde cible UN octet précis (0x00), pas « tout ce
    qui n'est pas ASCII » ni « tout ce qui sort de la table basse »."""
    clean = tmp_path / "clean_utf8.txt"
    clean.write_text(
        "Café, ESN, prospection ciblée — été 2026 🚀, déjà 100 % conforme.",
        encoding="utf-8",
    )
    assert _files_with_a_raw_nul([clean]) == []


def test_GA_309_a_legitimately_binary_file_with_no_nul_byte_does_not_trip_the_guard(
    tmp_path: Path,
) -> None:
    """Un contenu binaire (ici : des octets hauts non nuls, comme le début
    d'un PNG) n'est pas ce que cette garde vise — seul l'octet 0x00 compte,
    parce que c'est lui, et lui seul, que git regarde pour décider « binaire »."""
    binary_but_no_nul = tmp_path / "not_actually_flagged.bin"
    binary_but_no_nul.write_bytes(bytes(range(1, 256)))  # 1..255, jamais 0
    assert _files_with_a_raw_nul([binary_but_no_nul]) == []
