#!/usr/bin/env python3
"""Déduire du DIFF les écrans à recetter — et refuser de le deviner.

Le balayage des 58 routes à chaque lot coûte un tour entier et ne trouve presque
rien ; n'ouvrir que l'écran touché rate exactement le défaut qu'un balayage
existe pour attraper. La largeur se DÉDUIT donc du rayon d'impact du diff.

Deux régimes, et c'est le diff qui tranche, jamais le jugement :

  * il touche une FONDATION (token, feuille globale, composant ou hook partagé,
    contrat, configuration de navigation, i18n commun) → **tout**, sans discuter.
    Ces défauts-là apparaissent dans un fichier que le diff NE touche pas : un
    token partagé qui casse des écrans dans aucun fichier modifié, un hook
    réseau ajouté à un composant largement monté, une famille câblée à moitié.
  * sinon → les écrans que le diff atteint, calculés en REMONTANT le graphe
    d'imports depuis chaque fichier changé jusqu'aux fichiers de route.

« Cette page n'a rien à voir » est un jugement, et c'est le jugement qui rate.
D'où ce script.

Usage :
    python3 tools/recette/portee.py                    # origin/main~1..origin/main
    python3 tools/recette/portee.py <base>..<tete>
    python3 tools/recette/portee.py --branche <nom>    # <nom> contre origin/main
    python3 tools/recette/portee.py --json
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
WEB_SRC = RACINE / "apps/web/src"
ROUTES = WEB_SRC / "routes"

# ── Ce qui RESSEMBLE à une fondation et n'en est pas ────────────────────────
# Testé le 13/09/2026 : sans ces exclusions, 75 fichiers sur 75 déclenchaient le
# balayage complet — donc la règle ne changeait RIEN. Une porte qui s'ouvre
# toujours n'est pas une porte.
PAS_UNE_FONDATION: list[tuple[str, str]] = [
    (r"^packages/contracts/src/changelog/", "le changelog est la DONNÉE d'un écran, pas un contrat de rendu — il conflicte à chaque vague et ne peut casser que sa propre page"),
    (r"\.(test|spec)\.[jt]sx?$", "un fichier de test ne s'exécute pas en production — il ne peut changer aucune forme"),
]


def chemin_exclu_de_fondation(chemin: str) -> bool:
    """`chemin` ressemble-t-il à `PAS_UNE_FONDATION` ? LA MÊME liste sert aux
    DEUX usages qui la lisaient séparément avant #14/09/2026 : le classement
    FONDATION (`evaluer()`, plus bas) ET la construction des graines du graphe
    d'imports (`seeds`, aussi dans `evaluer()`) — un fichier qui ne peut pas
    faire basculer le régime en FONDATION ne doit pas non plus, en seed, TIRER
    un écran en remontant depuis lui par le graphe.

    Mesuré : la donnée du changelog est exclue du classement FONDATION, mais
    restait une graine du graphe — si elle se trouve importée (même
    indirectement) par un composant largement monté, remonter depuis elle
    atteignait quand même toutes les routes que ce composant tire, malgré son
    exclusion. Une exclusion qui ne vaut que pour un des deux usages ne
    protège rien : c'est le second qui portait le risque.
    """
    return any(re.search(motif, chemin) for motif, _ in PAS_UNE_FONDATION)

# ── Les chemins de FONDATION ────────────────────────────────────────────────
# Un diff qui en touche UN déclenche le balayage complet. Chaque entrée a payé
# son incident ; ne pas en retirer sans en écrire la raison.
FONDATIONS: list[tuple[str, str]] = [
    (r"^packages/ui/", "composants partagés — un `gap` de Button qui n'espace rien casse des écrans lointains"),
    (r"^apps/web/src/index\.css$", "feuille globale — `min-width:auto` sur un enfant de flex a débordé toute l'app"),
    (r"^apps/web/src/.*tokens\.css$", "tokens de design — GA-33 était verte pendant que 149 endroits échouaient AA"),
    (r"^apps/web/src/components/(?!navigation/|sidebar/)", "composant partagé — un hook réseau ici a fait tomber 8 tests dans 4 fichiers"),
    (r"^apps/web/src/hooks/", "hook partagé — monté par des écrans qui ne parlent pas du sujet"),
    (r"^apps/web/src/lib/", "socle applicatif (client d'API, clés de cache) — traverse tous les écrans"),
    (r"^apps/web/src/i18n/(?!locales/)", "socle i18n (configuration, détection de langue) — traverse tous les écrans"),
    (r"^apps/web/src/routes/__root\.tsx$", "racine des routes — tout en descend"),
    (r"^apps/web/src/components/(navigation|sidebar)/", "configuration de navigation — elle DÉFINIT la liste à balayer"),
]

# Une FONDATION DE FORME ne l'est que si la SURFACE EXPORTÉE a rétréci —
# `surface_a_disparu()`, plus bas. Mesuré le 13/09/2026 sur le premier vrai
# diff : compter les lignes en `-` (l'ancien `retire_des_lignes`) prenait un
# tableau de DONNÉES réordonné ou de la prose réécrite dans une chaîne pour un
# changement de forme (`tool-naming.ts`, `doctrine-registry.ts` — zéro symbole
# exporté disparu des deux) ; un ajout pur ne peut pas rendre `undefined` un
# champ que quelqu'un lit déjà, un champ RETIRÉ ou RENOMMÉ, si — et ça casse
# durablement les onglets déjà ouverts.
FONDATIONS_DE_FORME: list[tuple[str, str]] = [
    (r"^packages/contracts/", "contrat partagé — un champ qui DISPARAÎT de sa surface exportée rend `undefined` partout, y compris dans les onglets déjà ouverts"),
    (r"^apps/web/src/i18n/locales/[a-z]{2}/common\.json$", "espace de noms COMMUN — ajouter une clé ne peut casser personne ; en RETIRER ou en RENOMMER une rend `undefined` ce qu'un écran lit déjà (mesuré le 13/09/2026 : le premier vrai diff n'y faisait que 20 ajouts / 0 retrait, et balayait quand même 59 routes en régime FONDATION dur)"),
]

# ── Le graphe d'imports ─────────────────────────────────────────────────────
MOTIF_IMPORT = re.compile(
    r"""(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]""", re.M
)
EXTENSIONS = (".ts", ".tsx", ".js", ".jsx")


def git(*args: str) -> str:
    return subprocess.run(
        ["/usr/bin/git", *args], cwd=RACINE, capture_output=True, text=True, check=True
    ).stdout


def fichiers_changes(plage: str) -> list[str]:
    sortie = git("diff", "--name-only", plage).strip()
    return [l for l in sortie.splitlines() if l]


def fichiers_changes_avec_statut(plage: str) -> list[tuple[str, str]]:
    """Sœur de `fichiers_changes()`, en `--name-status` : (statut, chemin).

    Mesuré le 13/09/2026 : un fichier AJOUTÉ (`A`) n'a AUCUN lecteur d'avant —
    il ne peut donc jamais rendre `undefined` ce qu'un écran existant lisait.
    `apps/web/src/lib/data-source-label.ts`, fichier NEUF, faisait pourtant
    basculer tout le diff en FONDATION (59 routes) avant ce filtre. Seuls `M`
    (modifié), `D` (supprimé) et `R` (renommé — on garde le chemin NEUF) peuvent
    déclencher une fondation ; `A` ne le peut jamais, dans TOUTE la liste
    `FONDATIONS`, pas seulement pour `lib/`.
    """
    sortie = git("diff", "--name-status", plage).strip()
    paires: list[tuple[str, str]] = []
    for ligne in sortie.splitlines():
        if not ligne:
            continue
        colonnes = ligne.split("\t")
        paires.append((colonnes[0][0], colonnes[-1]))
    return paires


def resoudre(spec: str, depuis: Path) -> Path | None:
    """Résout un spécificateur d'import en chemin réel, ou None si externe."""
    if spec.startswith("@/"):
        base = WEB_SRC / spec[2:]
    elif spec.startswith("."):
        base = (depuis.parent / spec).resolve()
    else:
        return None  # paquet externe ou alias d'espace de travail
    for cand in (
        base,
        *(base.with_suffix(e) for e in EXTENSIONS),
        *(base / f"index{e}" for e in EXTENSIONS),
    ):
        if cand.is_file():
            return cand
    return None


def graphe_inverse() -> dict[Path, set[Path]]:
    """importé → { fichiers qui l'importent }."""
    inverse: dict[Path, set[Path]] = {}
    for f in WEB_SRC.rglob("*"):
        if f.suffix not in EXTENSIONS or not f.is_file():
            continue
        try:
            texte = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for spec in MOTIF_IMPORT.findall(texte):
            cible = resoudre(spec, f)
            if cible is not None:
                inverse.setdefault(cible, set()).add(f)
    return inverse


def route_vers_url(f: Path) -> str | None:
    """`routes/accounts/partners.tsx` → `/accounts/partners`."""
    rel = f.relative_to(ROUTES).with_suffix("")
    parties = list(rel.parts)
    if parties[-1] == "index":
        parties.pop()
    if not parties:
        return "/"
    if any(p.startswith("__") for p in parties):
        return None  # __root, fichiers techniques
    segments = []
    for p in parties:
        # `memoire-collective_.$accountId` → `memoire-collective/:accountId`
        for morceau in p.split("_."):
            if not morceau:
                continue
            segments.append(":" + morceau[1:] if morceau.startswith("$") else morceau)
    return "/" + "/".join(s.rstrip("_") for s in segments)


def routes_de_la_nav() -> list[str]:
    """La liste vit dans le CODE — elle ne se recopie pas, elle dériverait."""
    urls: set[str] = set()
    for nom in (
        "components/navigation/sections.ts",
        "components/sidebar/items.settings.ts",
    ):
        chemin = WEB_SRC / nom
        if chemin.is_file():
            urls |= set(re.findall(r"to: '(/[a-z0-9/_-]+)'", chemin.read_text()))
    return sorted(urls)


def base_et_tete(plage: str) -> tuple[str, str]:
    """`A..B` ou `A...B` → (base, tête).

    Le triple point compare contre l'ANCÊTRE COMMUN — c'est aussi ce que `git
    diff` calcule pour la plage affichée, donc `git show` doit lire la même
    base, pas `A` littéral.
    """
    m = re.match(r"^(.+?)(\.\.\.|\.\.)(.+)$", plage)
    if not m:
        raise ValueError(f"plage non reconnue : {plage!r}")
    gauche, points, droite = m.groups()
    base = git("merge-base", gauche, droite).strip() if points == "..." else gauche
    return base, droite


def contenu_a_ref(ref: str, fichier: str) -> str | None:
    """`git show <ref>:<fichier>`, ou `None` si le fichier n'existe pas à cette
    référence — un AJOUT n'a rien côté base, une SUPPRESSION rien côté tête ;
    l'appelant traite les deux séparément."""
    resultat = subprocess.run(
        ["/usr/bin/git", "show", f"{ref}:{fichier}"],
        cwd=RACINE, capture_output=True, text=True,
    )
    return resultat.stdout if resultat.returncode == 0 else None


MOTIF_EXPORT_SYMBOLE = re.compile(r"^export (?:const|type|function|interface|enum|class)\s+(\w+)")
MOTIF_DEBUT_BLOC = re.compile(r"^export (?:type|interface)\s+(\w+)\b")
MOTIF_CHAMP = re.compile(r"^\s*(?:readonly\s+)?(\w+)\??:\s")


def _surface_ts(texte: str) -> set[str]:
    """Symboles `export …`, et champs déclarés À L'INTÉRIEUR d'un `type`/
    `interface` EXPORTÉ — jamais dans un tableau de données littérales : une
    entrée comme `{ name: 'Railway', brand: 'Railway', … }` n'ouvre aucun bloc
    `type`/`interface`, c'est précisément le faux positif de `tool-naming.ts`
    mesuré le 13/09/2026 (deux entrées de `OUR_SUPPLIERS` gagnent juste un champ
    `ordinaryWord: true` — zéro symbole exporté disparu)."""
    surface: set[str] = set()
    lignes = texte.splitlines()
    n = len(lignes)
    i = 0
    while i < n:
        ligne = lignes[i]
        symbole = MOTIF_EXPORT_SYMBOLE.match(ligne)
        if symbole:
            surface.add(f"export:{symbole.group(1)}")
        bloc = MOTIF_DEBUT_BLOC.match(ligne)
        if bloc:
            nom_bloc = bloc.group(1)
            profondeur = ligne.count("{") - ligne.count("}")
            j = i
            while profondeur > 0 and j + 1 < n:
                j += 1
                suite = lignes[j]
                champ = MOTIF_CHAMP.match(suite)
                if champ:
                    surface.add(f"champ:{nom_bloc}.{champ.group(1)}")
                profondeur += suite.count("{") - suite.count("}")
            i = j
        i += 1
    return surface


def _surface_json(texte: str) -> set[str]:
    """Les clés d'un JSON (`common.json`), à plat, chemin pointé compris.
    Ajouter une clé n'y retire rien de la surface ; renommer ou supprimer, si."""
    try:
        donnees = json.loads(texte)
    except (json.JSONDecodeError, TypeError):
        return set()
    surface: set[str] = set()

    def parcourir(valeur: object, prefixe: str) -> None:
        if isinstance(valeur, dict):
            for cle, sous in valeur.items():
                chemin = f"{prefixe}.{cle}" if prefixe else str(cle)
                surface.add(chemin)
                parcourir(sous, chemin)

    parcourir(donnees, "")
    return surface


def extraire_surface(texte: str, fichier: str) -> set[str]:
    """La surface EXPORTÉE d'un fichier — ce qu'un AUTRE fichier peut en lire."""
    if fichier.endswith(".json"):
        return _surface_json(texte)
    return _surface_ts(texte)


def surface_a_disparu(plage: str, fichier: str) -> bool:
    """Remplace `retire_des_lignes()` : quelque chose a-t-il DISPARU de la
    surface exportée entre la base et la tête de `plage` ?

    Fondation de forme SEULEMENT si l'ensemble AVANT n'est pas inclus dans
    l'ensemble APRÈS. Un ajout pur (avant ⊆ après) ne déclenche rien. Un
    fichier AJOUTÉ n'a pas de base → surface avant vide → jamais de
    disparition. Un fichier SUPPRIMÉ n'a pas de tête → surface après vide → le
    symbole entier a disparu (sauf s'il était déjà vide).
    """
    base, tete = base_et_tete(plage)
    avant_texte = contenu_a_ref(base, fichier)
    apres_texte = contenu_a_ref(tete, fichier)
    avant = extraire_surface(avant_texte, fichier) if avant_texte is not None else set()
    apres = extraire_surface(apres_texte, fichier) if apres_texte is not None else set()
    return not avant.issubset(apres)


MOTIF_NAMESPACE_PRINCIPAL = re.compile(
    r"""useTranslation\(\s*\[?\s*['"]([a-z][a-z0-9_-]*)['"]"""
)


def i18n_vers_seeds(changes: list[str]) -> set[Path]:
    """`locales/fr/actions.json` → les fichiers qui lisent l'espace `actions`
    POUR LEUR PROPRE CONTENU.

    Un espace de noms n'est pas commun : le toucher ne peut casser que les
    écrans qui le LISENT. `common.json` est traité comme une fondation ailleurs.

    #14/09/2026 — mesuré : `ChangelogMenu.tsx` déclare
    `useTranslation(['changelog', 'onboarding'])` pour EMPRUNTER un seul
    bouton (« Revoir la visite guidée ») à la feature onboarding ; `onboarding`
    n'y est que la namespace SECONDAIRE. Il est monté dans la coque
    authentifiée (donc atteignable depuis toutes les routes), et toucher
    `onboarding.json` le faisait remonter jusqu'à 59 routes — le même défaut
    que la donnée du changelog, un cran plus haut : un fichier qui EMPRUNTE un
    mot à un namespace n'est pas un lecteur de ce namespace au sens où ce
    script doit compter.

    Le PREMIER namespace passé à `useTranslation(...)` est celui dont les
    appels SANS préfixe (`t('clé')`) se résolvent par défaut — c'est LUI, et
    lui seul, que le fichier lit « pour son propre contenu ». Un namespace
    listé ensuite (`useTranslation(['ns1', 'ns2'])`, `ns2`) ou lu seulement via
    un préfixe explicite (`t('ns2:clé')`) est un emprunt : il ne fait pas de ce
    fichier une graine pour `ns2`. Tout le corpus `onboarding` du dépôt
    (mesuré le 14/09/2026) le déclare en PREMIER argument — `useTranslation('onboarding')`
    ou `useTranslation(['onboarding', ...])` — jamais en second : la distinction
    ne perd donc aucun lecteur réel.

    Le repli `i18nKey` de l'ancienne version disparaît : vérifié le 14/09/2026,
    les 7 fichiers du dépôt qui l'utilisent déclarent TOUS leur espace réel via
    un `useTranslation('ns')` juste à côté — capturé ici sans lui.
    """
    espaces = {
        m.group(1)
        for c in changes
        if (m := re.match(r"^apps/web/src/i18n/locales/[a-z]{2}/([a-z0-9-]+)\.json$", c))
        and m.group(1) != "common"
    }
    if not espaces:
        return set()
    seeds: set[Path] = set()
    for f in WEB_SRC.rglob("*"):
        if f.suffix in EXTENSIONS and f.is_file():
            try:
                texte = f.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            principaux = set(MOTIF_NAMESPACE_PRINCIPAL.findall(texte))
            if principaux & espaces:
                seeds.add(f)
    return seeds


def api_vers_seeds(changes: list[str]) -> set[Path]:
    """Un module d'API changé → les fichiers web qui appellent ses routes.

    Grossier à dessein : on cherche le PRÉFIXE de route du module dans le client
    web. Mieux vaut un écran de trop qu'un écran manqué.
    """
    seeds: set[Path] = set()
    modules = {
        m.group(1)
        for c in changes
        if (m := re.match(r"^apps/api/src/modules/([a-z0-9-]+)/", c))
    }
    if not modules:
        return seeds
    motif = re.compile("|".join(rf"['\"`]/{re.escape(m)}\b" for m in modules))
    for f in WEB_SRC.rglob("*"):
        if f.suffix in EXTENSIONS and f.is_file():
            try:
                if motif.search(f.read_text(encoding="utf-8", errors="ignore")):
                    seeds.add(f)
            except OSError:
                pass
    return seeds


def evaluer(plage: str) -> dict | None:
    """Le cœur de la décision — FONDATION ou CIBLÉ — factorisé hors de `main()`
    pour que les tests l'appellent sans passer par stdout/JSON. `None` si la
    plage n'a rien changé.
    """
    changes = fichiers_changes(plage)
    if not changes:
        return None

    # #13/09/2026 — un fichier AJOUTÉ n'a aucun lecteur d'avant : il sort de
    # TOUTE la liste FONDATIONS, avant même le motif. Voir
    # `fichiers_changes_avec_statut()`.
    ajoutes = {c for statut, c in fichiers_changes_avec_statut(plage) if statut == "A"}

    def exclu(c: str) -> bool:
        if c in ajoutes:
            return True
        return chemin_exclu_de_fondation(c)

    fondations = [
        (c, raison)
        for c in changes
        if not exclu(c)
        for motif, raison in FONDATIONS
        if re.search(motif, c)
    ]
    # Les fondations DE FORME ne comptent que si la surface EXPORTÉE a rétréci.
    fondations += [
        (c, raison)
        for c in changes
        if not exclu(c)
        for motif, raison in FONDATIONS_DE_FORME
        if re.search(motif, c) and surface_a_disparu(plage, c)
    ]

    nav = routes_de_la_nav()
    if fondations:
        return {
            "plage": plage,
            "regime": "FONDATION",
            "pourquoi": [{"fichier": f, "raison": r} for f, r in fondations[:6]],
            "routes": nav,
        }

    inverse = graphe_inverse()
    # #14/09/2026 — même exclusion que le classement FONDATION (une porte qui
    # protège d'un côté et laisse passer de l'autre ne protège rien) : un
    # fichier exclu (`PAS_UNE_FONDATION`) ne devient pas une graine, donc ne
    # peut pas TIRER un écran en remontant depuis lui.
    seeds = {
        RACINE / c
        for c in changes
        if (RACINE / c).suffix in EXTENSIONS and not chemin_exclu_de_fondation(c)
    }
    seeds = {s for s in seeds if s.is_file()}
    seeds |= api_vers_seeds(changes)
    seeds |= i18n_vers_seeds(changes)

    atteints: dict[str, set[str]] = {}
    vus: set[Path] = set()
    file_attente = list(seeds)
    origine = {s: s for s in seeds}
    while file_attente:
        f = file_attente.pop()
        if f in vus:
            continue
        vus.add(f)
        if ROUTES in f.parents or f.parent == ROUTES:
            url = route_vers_url(f)
            if url:
                src = origine.get(f, f)
                atteints.setdefault(url, set()).add(
                    str(src.relative_to(RACINE)) if RACINE in src.parents else str(src)
                )
        for parent in inverse.get(f, ()):
            if parent not in vus:
                origine.setdefault(parent, origine.get(f, f))
                file_attente.append(parent)

    # On ne propose que ce qui est ATTEIGNABLE depuis la nav : une route
    # dynamique (`/accounts/:id`) se recette par un exemplaire réel, pas par
    # son motif.
    dans_nav = sorted(u for u in atteints if u in nav)
    hors_nav = sorted(u for u in atteints if u not in nav)
    return {
        "plage": plage,
        "regime": "CIBLÉ",
        "routes": dans_nav,
        "routes_hors_nav": hors_nav,
        "pourquoi": {u: sorted(atteints[u])[:3] for u in dans_nav},
    }


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--json"]
    en_json = "--json" in sys.argv[1:]
    if args and args[0] == "--branche":
        plage = f"origin/main...{args[1]}"
    elif args:
        plage = args[0]
    else:
        plage = "origin/main~1..origin/main"

    resultat = evaluer(plage)
    if resultat is None:
        print(f"Aucun fichier changé sur `{plage}` — rien à recetter.", file=sys.stderr)
        return 1

    changes = fichiers_changes(plage)

    if en_json:
        print(json.dumps(resultat, ensure_ascii=False, indent=1))
        return 0

    print(f"Plage      : {resultat['plage']}")
    print(f"Fichiers   : {len(changes)}")
    print(f"Régime     : {resultat['regime']}")
    if resultat["regime"] == "FONDATION":
        print("\n⚠️  Le diff touche une FONDATION — balayage COMPLET, sans discuter :")
        for p in resultat["pourquoi"]:
            print(f"    {p['fichier']}\n      → {p['raison']}")
        print(f"\n{len(resultat['routes'])} routes à balayer :")
        for u in resultat["routes"]:
            print(f"    {u}")
    else:
        print(f"\n{len(resultat['routes'])} écrans de navigation atteints par ce diff :")
        for u in resultat["routes"]:
            print(f"    {u}")
            for src in resultat["pourquoi"][u]:
                print(f"        ← {src}")
        if resultat["routes_hors_nav"]:
            print(
                f"\n{len(resultat['routes_hors_nav'])} route(s) hors navigation "
                "(à atteindre par un exemplaire réel, pas par l'URL du motif) :"
            )
            for u in resultat["routes_hors_nav"]:
                print(f"    {u}")
        if not resultat["routes"] and not resultat["routes_hors_nav"]:
            print(
                "\nAucun écran atteint — ce diff ne touche pas le web.\n"
                "⚠️  Vérifier à la main qu'aucun écran ne LIT ce que ce diff écrit :\n"
                "    un chemin d'écriture branché sans lecteur est le défaut n°1 du dépôt."
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
