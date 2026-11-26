"""Historique d'un prompt versionné — diff et rollback (#2445.1, #2766).

─────────────────────────────────────────────────────────────────────────────
CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT
─────────────────────────────────────────────────────────────────────────────
`app/prompts/registry.py` est DÉJÀ un registre de prompts versionné : un
catalogue nommé (`SYSTEM_PROMPTS` / `EXTRA_PROMPTS`), une empreinte de contenu
par prompt (`prompt_registry_fingerprint`, `prompt_version_for`), une version
combinée (`prompt_registry_version`), et un golden set committé qui PIN chaque
prompt (`tests/golden/system/<name>.txt`, `tests/test_prompt_golden.py`) — tout
changement de contenu y échoue comme un diff à revoir. #2445.1 en demandait
trois pièces : lister les VERSIONS, en voir le DIFF, et pouvoir un ROLLBACK.
Les deux premières étaient déjà là sous un autre nom (« registre » +
« golden ») ; ce module rend le DIFF et le ROLLBACK **exploitables sans
deviner un chemin de fichier**, en les DÉRIVANT du registre — jamais recopiés :

* Le DIFF entre deux versions d'un prompt EST le diff git de son fichier
  golden committé (la même chaîne que l'empreinte hash) : `diff_command`
  construit la commande, `run_diff` l'exécute (offline, aucun réseau — le
  même `git diff` que `app/eval/gate.py` utilise déjà pour la surface prompts).
* Le ROLLBACK n'est PAS un buffer applicatif : un prompt est du CODE, versionné
  par git, jamais une ligne dans une table qu'on pourrait réécrire en silence.
  `source_file_for` DÉRIVE le fichier qui porte un prompt via
  `inspect.getfile()` sur son builder enregistré (jamais un chemin recopié à
  la main, qui diverge au premier renommage) ; `rollback_command` rend la
  commande git exacte pour y revenir — elle ne l'EXÉCUTE jamais : revenir à
  une version antérieure d'un prompt change le comportement du modèle pour
  tout le monde, un geste qui reste entre les mains d'un humain qui commite
  (même discipline que « on ne supprime pas, une correction humaine gagne
  toujours »).
"""

from __future__ import annotations

import argparse
import inspect
import re
import subprocess
from importlib import import_module
from pathlib import Path, PurePath
from types import ModuleType

from app.prompts.registry import EXTRA_PROMPTS, SYSTEM_PROMPTS, get_prompt_spec

#: Certains renderers canoniques (`_render_advisor`, `_render_outreach`…) sont
#: des wrappers LOCAUX, définis dans `registry.py` lui-même, qui appellent un
#: module `bellum_<x>` — `inspect.getfile` sur le wrapper rendrait alors
#: `registry.py`, jamais le module qui porte réellement le PROMPT. Ce motif de
#: nommage (`bellum_<x>.`) est la même convention que tout le fichier
#: `registry.py` utilise déjà pour importer ces modules — LU dans la source du
#: wrapper, jamais deviné.
_BELLUM_MODULE_REF = re.compile(r"\bbellum_(\w+)\.")


def _wrapped_module(builder) -> ModuleType | None:
    """Le module `app.prompts.bellum_<x>` qu'un wrapper LOCAL appelle, s'il en
    est un — ``None`` si `builder` EST déjà le bon module (rien à résoudre)."""
    try:
        source = inspect.getsource(builder)
    except (OSError, TypeError):
        return None
    match = _BELLUM_MODULE_REF.search(source)
    if match is None:
        return None
    try:
        return import_module(f"app.prompts.bellum_{match.group(1)}")
    except ImportError:
        return None

def _repo_root_from(path: PurePath) -> PurePath:
    """apps/ia/app/prompts/<ce fichier> → parents[4] = racine du dépôt (même
    calcul que `app/eval/gate.py::REPO_ROOT`). Dans l'image de production le
    module vit à `/app/app/prompts/` : quatre parents seulement — on s'arrête
    à la racine plutôt que de lever `IndexError` à l'import (hotfix 28/09 :
    l'IA ne démarrait plus). Les golden y sont absents : les lectures qui en
    dépendent échouent alors au moment de l'appel, pas au démarrage."""
    parents = path.parents
    return parents[min(4, len(parents) - 1)]


REPO_ROOT = _repo_root_from(Path(__file__).resolve())

#: Le fichier `registry.py`, à côté de celui-ci — sert à détecter si un
#: builder enregistré y est DÉFINI (un wrapper local) plutôt que d'y être
#: seulement IMPORTÉ ou référencé depuis son propre module.
_REGISTRY_FILE = Path(__file__).resolve().parent / "registry.py"

#: Le golden set que `tests/test_prompt_golden.py` committe et compare déjà —
#: LU ici, jamais un second chemin recopié.
_GOLDEN_DIR = REPO_ROOT / "apps" / "ia" / "tests" / "golden" / "system"


def golden_file_for(name: str) -> Path:
    """Le fichier golden committé d'un prompt, relatif à la racine du dépôt."""
    return _GOLDEN_DIR / f"{name}.txt"


def source_file_for(name: str) -> Path | None:
    """Le module Python qui PORTE le prompt `name`, DÉRIVÉ du registre —
    jamais un chemin recopié : `inspect.getfile` lit où le builder enregistré
    est réellement défini. Exception scopée : si ce builder est lui-même un
    wrapper LOCAL défini DANS `registry.py` (ex. `_render_advisor`), on
    résout plutôt le module `bellum_<x>` que sa source appelle
    (`_wrapped_module`) — sinon un builder qui vit dans son propre module et
    qui référence, en passant, un AUTRE module `bellum_` (texte partagé)
    pointerait à tort vers ce voisin. ``None`` si `name` n'est pas enregistré."""
    spec = get_prompt_spec(name)
    if spec is None:
        return None
    builder = getattr(spec, "build", None) or getattr(spec, "render", None)
    own_file = Path(inspect.getfile(builder)).resolve()
    if own_file != _REGISTRY_FILE:
        return own_file
    module = _wrapped_module(builder)
    return Path(inspect.getfile(module)).resolve() if module is not None else own_file


def _relative_to_repo(path: Path) -> str:
    return str(path.relative_to(REPO_ROOT))


def diff_command(name: str, ref_a: str, ref_b: str = "HEAD") -> tuple[str, ...]:
    """La commande git qui montre le diff d'un prompt entre deux refs — le
    diff de son fichier golden committé, jamais une seconde façon de comparer
    un contenu déjà pinné ailleurs."""
    return ("git", "diff", ref_a, ref_b, "--", _relative_to_repo(golden_file_for(name)))


def rollback_command(name: str, ref: str) -> tuple[str, ...] | None:
    """La commande git qui reviendrait le MODULE d'un prompt à `ref` — rendue,
    jamais exécutée : un rollback de prompt reste un commit qu'un humain fait.
    ``None`` si `name` n'est pas enregistré (rien à rendre sans deviner)."""
    source = source_file_for(name)
    if source is None:
        return None
    return ("git", "checkout", ref, "--", _relative_to_repo(source))


def run_diff(name: str, ref_a: str, ref_b: str = "HEAD", *, repo_root: Path | None = None) -> str:
    """Exécute `diff_command` (hermétique, local — aucun réseau, le même
    `git diff` que `app/eval/gate.py` utilise déjà pour la surface prompts)."""
    root = repo_root or REPO_ROOT
    out = subprocess.run(
        diff_command(name, ref_a, ref_b), cwd=root, capture_output=True, text=True, timeout=60
    )
    return out.stdout


def registered_prompt_names() -> list[str]:
    """Les noms enregistrés, pour lister ce qui PEUT être diffé/rollback —
    DÉRIVÉ du registre, jamais recopié."""
    return [spec.name for spec in SYSTEM_PROMPTS] + [spec.name for spec in EXTRA_PROMPTS]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Diff et rollback d'un prompt versionné (registre #2445.1). "
        "Le rollback n'est JAMAIS exécuté : la commande est affichée, un humain la lance."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    diff_p = sub.add_parser("diff", help="Diff d'un prompt entre deux refs git.")
    diff_p.add_argument("name", help="Nom du prompt (registre `app.prompts.registry`).")
    diff_p.add_argument("--from", dest="ref_a", required=True, help="Ref de départ (ex: origin/main).")
    diff_p.add_argument("--to", dest="ref_b", default="HEAD", help="Ref d'arrivée (défaut: HEAD).")

    rollback_p = sub.add_parser("rollback", help="Affiche la commande de rollback (ne l'exécute jamais).")
    rollback_p.add_argument("name", help="Nom du prompt (registre `app.prompts.registry`).")
    rollback_p.add_argument("ref", help="Ref vers laquelle revenir.")

    args = parser.parse_args(argv)

    if args.command == "diff":
        print(run_diff(args.name, args.ref_a, args.ref_b), end="")
        return 0

    command = rollback_command(args.name, args.ref)
    if command is None:
        print(f"« {args.name} » n'est pas un prompt enregistré (voir `registered_prompt_names()`).")
        return 1
    print("Rollback NON exécuté — commande à lancer soi-même :")
    print(" ".join(command))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
