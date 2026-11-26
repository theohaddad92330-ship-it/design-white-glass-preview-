#!/usr/bin/env python3
"""Porte avant push : lance ce que la CI lancera sur CE que la branche change, et rien d'autre.

Pourquoi ce script existe (mesuré le 29/09/2026 sur BellumAI) : sur 16 vrais échecs de CI,
~10 étaient un test d'UN AUTRE fichier resté en retard sur le code (un compte d'appels,
un mock sans la nouvelle méthode, un e2e qui ne neutralise pas le worker neuf), 6 une
garde d'architecture qui lit tout le dépôt, 2 un fichier « golden » périmé. Le même jour,
une seule PR d'intégration a rougi SEPT fois de suite pour ces raisons. Aucun écrivain
n'avait enfreint une consigne : chacun lançait « les tests des fichiers touchés », et
aucun de ces tests-là n'était touché. Une liste d'interdits n'y peut rien ; un script qui
calcule QUOI lancer, si.

Ce qu'il fait, dans l'ordre, sur les fichiers changés depuis la base (défaut origin/main) :
  1. contrôles statiques : marqueurs de conflit, titre de commit trop long ;
  2. par paquet : les tests LIÉS aux fichiers changés (jest --findRelatedTests,
     vitest related, pytest sur les tests qui importent le module) ;
  3. par paquet : les GARDES (specs d'architecture) qui CITENT ce qu'on a touché —
     nom de fichier, suffixe (`.controller.ts`, `.worker.ts`…), dossier du module ;
  4. les RÈGLES du dépôt (`.claude/portes.json` → "regles") : « si ce chemin change,
     lance ça » — c'est là que va chaque leçon d'une CI rouge, pour qu'elle ne
     revienne jamais : on l'écrit une fois, la machine la relance toujours.

Ciblé par construction (≤ quelques specs par paquet, un lancement à la fois) : il ne
remplace pas la CI, il attrape ce qui la fait rougir le plus souvent.

  porte-avant-push.py                 fichiers changés depuis origin/main
  porte-avant-push.py --base origin/x
  porte-avant-push.py --fichiers a.ts b.py   (un intégrateur : les fichiers résolus à la main)
  porte-avant-push.py --plan          dit ce qu'il lancerait, ne lance rien

Code retour : 0 vert, 1 rouge, 2 configuration absente ou invalide.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

MAX_GARDES_PAR_PAQUET = 12
MAX_TESTS_PY = 8
MAX_FICHIERS_LIES = 60
GENERIQUES = {
    "src", "app", "apps", "packages", "modules", "lib", "libs", "tests", "__tests__", "utils", "hooks",
    "components", "services", "routes", "pages", "schemas", "common", "shared", "types", "views", "features",
}


def sh(cmd: list[str] | str, cwd: Path, shell: bool = False) -> tuple[int, str]:
    p = subprocess.run(cmd, cwd=cwd, shell=shell, capture_output=True, text=True)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def racine_depot() -> Path:
    rc, out = sh(["git", "rev-parse", "--show-toplevel"], Path.cwd())
    if rc != 0:
        sys.exit("porte : pas dans un dépôt git")
    return Path(out.strip())


def charger_config(depot: Path) -> dict:
    # Un worktree d'agent ne porte que les fichiers COMMITÉS : si `portes.json`
    # n'est pas versionné, on le lit dans le dépôt principal (git-common-dir/..).
    _, commun = sh(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], depot)
    principal = Path(commun.strip()).parent if commun.strip() else depot
    for f in (depot / ".claude/portes.json", principal / ".claude/portes.json"):
        if f.exists():
            try:
                return json.loads(f.read_text())
            except json.JSONDecodeError as e:
                print(f"porte : {f} illisible ({e})")
                sys.exit(2)
    print("porte : .claude/portes.json absent — seuls les contrôles statiques tournent.")
    print("        Modèle : ~/Desktop/SKILLS_TEMPLATES/socle/portes.modele.json")
    return {}


def fichiers_changes(depot: Path, base: str) -> list[str]:
    _, out = sh(["git", "diff", "--name-only", "--diff-filter=ACMR", f"{base}...HEAD"], depot)
    _, loc = sh(["git", "diff", "--name-only", "--diff-filter=ACMR", "HEAD"], depot)
    vus = dict.fromkeys([l for l in (out + "\n" + loc).splitlines() if l.strip()])
    return [f for f in vus if (depot / f).exists()]


# ── 1. contrôles statiques ────────────────────────────────────────────────────
def controles_statiques(depot: Path, base: str, cfg: dict, fichiers: list[str]) -> list[str]:
    rouges = []
    rc, out = sh(["git", "grep", "-nE", r"^(<<<<<<<|>>>>>>>)( |$)", "--", ".", ":!*.md"], depot)
    if rc == 0 and out.strip():
        rouges.append("marqueurs de conflit :\n" + "\n".join(out.splitlines()[:5]))
    limite = int(cfg.get("titre_commit_max", 100))
    # Seulement les commits pas encore poussés nulle part : un titre trop long déjà
    # sur le serveur n'est plus rattrapable, et l'accuser bloquerait un intégrateur.
    _, log = sh(["git", "log", "--format=%s", f"{base}..HEAD", "--not", "--remotes"], depot)
    longs = [s for s in log.splitlines() if len(s) > limite and not s.startswith("Merge ")]
    if longs:
        rouges.append(f"titre de commit > {limite} caractères (commitlint refuse, en silence si la sortie est masquée) :\n  " + "\n  ".join(longs[:3]))
    return rouges


# ── 2-3. tests liés et gardes par paquet ─────────────────────────────────────
def cles_de(fichier: str) -> set[str]:
    """Ce qu'une garde écrirait pour parler de ce fichier."""
    p = Path(fichier)
    cles = {p.name}
    m = re.search(r"(\.[a-z-]+\.(ts|tsx|py))$", p.name)
    if m and m.group(1).count(".") >= 2:
        cles.add(m.group(1))  # .controller.ts, .worker.ts, .entity.ts…
    # Le dossier PARENT seulement, et jamais un nom de dossier générique : « lib/ »
    # ou « components/ » est cité par cent gardes qui ne parlent pas de ce fichier.
    parent = p.parent.name
    if len(parent) > 3 and parent not in GENERIQUES:
        cles.add(f"{parent}/")
    return cles


def gardes_concernees(dossier: Path, fichiers: list[str]) -> list[Path]:
    if not dossier.is_dir():
        return []
    cles = set()
    for f in fichiers:
        cles |= cles_de(f)
    scores = []
    for spec in sorted(dossier.rglob("*")):
        if not re.search(r"\.(spec|test)\.(ts|tsx|py)$", spec.name):
            continue
        texte = spec.read_text(errors="ignore")
        # un nom de fichier exact pèse plus qu'un suffixe ou un dossier
        s = sum(3 if "." in c and "/" not in c and not c.startswith(".") else 1 for c in cles if c in texte)
        if s:
            scores.append((s, spec))
    scores.sort(key=lambda x: -x[0])
    return [p for _, p in scores[:MAX_GARDES_PAR_PAQUET]]


def tests_py_lies(racine: Path, rel: list[str]) -> list[str]:
    """`rel` : chemins relatifs à la racine du paquet. Les tests touchés d'abord, puis ceux qui importent un module touché."""
    tests_dir = racine / "tests"
    if not tests_dir.is_dir():
        return []
    directs = [f for f in rel if Path(f).name.startswith("test_") and f.endswith(".py")]
    modules = {Path(f).stem for f in rel if f.endswith(".py") and not Path(f).name.startswith("test_") and Path(f).stem != "__init__"}
    lies = []
    for t in sorted(tests_dir.rglob("test_*.py")):
        texte = t.read_text(errors="ignore")
        if any(re.search(rf"\b{re.escape(m)}\b", texte) for m in modules):
            lies.append(str(t.relative_to(racine)))
    return list(dict.fromkeys(directs + lies))[:MAX_TESTS_PY]


def lancer(etiquette: str, cmd: str, cwd: Path, journal: list[str], plan: bool) -> bool:
    if plan:
        print(f"  [plan] {etiquette} : (cd {cwd} && {cmd})")
        return True
    t0 = time.time()
    rc, out = sh(cmd, cwd, shell=True)
    duree = time.time() - t0
    etat = "vert" if rc == 0 else "ROUGE"
    print(f"  {etat:5} {etiquette} ({duree:.0f} s)")
    if rc != 0:
        utiles = [
            l for l in out.splitlines()
            if re.search(r"FAIL|●|✕|×|FAILED|Error|error TS|assert|Expected|Received", l)
            and not re.search(r"Not implemented: window\.|DeprecationWarning", l)
        ]
        journal.append(f"### {etiquette}\n$ (cd {cwd} && {cmd})\n" + "\n".join(utiles[:40]))
    return rc == 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=None)
    ap.add_argument("--fichiers", nargs="*")
    ap.add_argument("--plan", action="store_true")
    a = ap.parse_args()

    depot = racine_depot()
    cfg = charger_config(depot)
    base = a.base or cfg.get("base", "origin/main")
    fichiers = a.fichiers if a.fichiers else fichiers_changes(depot, base)
    print(f"porte : {len(fichiers)} fichier(s) changé(s) depuis {base}")
    journal: list[str] = []
    ok = True

    for r in controles_statiques(depot, base, cfg, fichiers):
        ok = False
        journal.append("### contrôle statique\n" + r)
        print("  ROUGE contrôle statique — " + r.splitlines()[0])

    for paquet in cfg.get("paquets", []):
        racine = depot / paquet["racine"]
        prefixe = paquet["racine"].rstrip("/") + "/"
        siens = [f for f in fichiers if f.startswith(prefixe) and re.search(paquet.get("motif", "."), f)]
        if not siens:
            continue
        rel = [f[len(prefixe):] for f in siens][:MAX_FICHIERS_LIES]
        if paquet.get("lie"):
            if paquet.get("python"):
                tests = tests_py_lies(racine, rel)
                if tests:
                    ok &= lancer(f"{paquet['racine']} tests liés ({len(tests)})",
                                 paquet["lie"].format(fichiers=" ".join(tests)), racine, journal, a.plan)
            else:
                ok &= lancer(f"{paquet['racine']} tests liés à {len(rel)} fichier(s)",
                             paquet["lie"].format(fichiers=" ".join(rel)), racine, journal, a.plan)
        if paquet.get("gardes") and paquet.get("lance_gardes"):
            gardes = gardes_concernees(racine / paquet["gardes"], siens)
            if gardes:
                rels = " ".join(str(g.relative_to(racine)) for g in gardes)
                ok &= lancer(f"{paquet['racine']} gardes qui citent ce qui change ({len(gardes)})",
                             paquet["lance_gardes"].format(specs=rels), racine, journal, a.plan)

    for regle in cfg.get("regles", []):
        if any(re.search(regle["si"], f) for f in fichiers):
            ok &= lancer(f"règle : {regle.get('pourquoi', regle['si'])[:70]}",
                         regle["lancer"], depot / regle.get("dans", "."), journal, a.plan)

    if journal:
        _, br = sh(["git", "branch", "--show-current"], depot)
        dest = Path(os.environ.get("TMPDIR", "/tmp")) / f"{(br.strip() or 'detache').replace('/', '-')}-porte.log"
        dest.write_text("\n\n".join(journal))
        print(f"porte : ROUGE — détail condensé dans {dest}")
    elif not a.plan:
        print("porte : vert")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
