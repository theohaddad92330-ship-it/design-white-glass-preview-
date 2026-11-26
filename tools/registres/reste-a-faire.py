#!/usr/bin/env python3
"""Ce qu'il reste VRAIMENT à faire, issue par issue.

Compte les points de registre par issue et retranche deux choses que le
simple comptage ignore :

1. les états TERMINAUX — `déjà là`, `écarté`, `recetté`, `reformulé` ;
   `reformulé` PORTE la réponse écrite (la demande a été reformulée, la ligne
   cite la décision datée), c'est un point RÉPONDU, pas un point en attente ;
2. rien d'autre — et c'est justement sa limite : il ne voit PAS ce que les
   branches en vol livrent déjà. Lancer `en-vol.py` avant de dispatcher,
   sinon on redispatche du travail en cours (mesuré le 18/09/2026 : sept
   points d'un coup).

Sortie : les issues prêtes à fermer, celles à un à trois points, le reste.
"""
import collections
import sys
import json
import os
import re
import subprocess
import glob
import pathlib

REPO = str(pathlib.Path(__file__).resolve().parents[2])
TERMINAUX = {"déjà là", "écarté", "recetté", "reformulé"}


def colonnes(ligne):
    """Les cellules d'une ligne de registre, pipes échappés respectés."""
    return [c.strip().replace("\x00", "\\|") for c in ligne.replace("\\|", "\x00").split("|")]


def index_de_l_etat(cellules):
    """Où vit l'état dans CE tableau — lu à l'en-tête, jamais supposé.

    ⚠️ Mesuré le 18/09/2026 : six registres (#2554, #2558, #2561, #2562,
    #2575, #2582) portent six colonnes au lieu de sept. Un index FIXE y lisait
    la colonne « Fichiers clés » comme un état, ce qui rendait chacun de leurs
    points « ni terminal ni retenu » — donc chaque issue affichée « reste N/N »
    alors qu'elle était entièrement livrée. Un tableau dit lui-même où est son
    état ; le lire évite de le deviner.
    """
    for i, cellule in enumerate(cellules):
        mot = cellule.strip().strip("*`").lower()
        if mot in ("état", "etat"):
            return i
    return None


# Fort → faible. Quand un MÊME numéro de point vit dans deux registres (mesuré le
# 18/09/2026 : 54 cas sur 10 852), on ne le compte QU'UNE FOIS, avec son état le
# plus fort. Sans ça, un point `livré` dans un fichier et `retenu` dans l'autre
# faisait qu'une issue ne se fermait JAMAIS — et le blocage était invisible.
DEMANDE_DIVERGENTE = set()


def _sens(texte):
    """La demande, réduite à ses lettres et ses chiffres."""
    return re.sub(r"[^0-9a-zà-öø-ÿ]+", "", texte.lower())[:48]


RANG_ETAT = {
    "recetté": 5,
    "déjà là": 4,
    "écarté": 4,
    "reformulé": 4,
    "livré": 3,
    "retenu": 2,
    "à trancher": 1,
}


def points_par_issue(signaler_doublons=False):
    # (issue, sous-numéro) -> (rang, état, demande, fichier) — le plus fort gagne.
    meilleur = {}
    demandes = collections.defaultdict(set)
    for f in sorted(glob.glob(os.path.join(REPO, ".claude/notes/registre-*.md"))):
        colonne = None
        for ligne in open(f, encoding="utf-8"):
            c = colonnes(ligne)
            if len(c) < 4:
                continue
            trouve = index_de_l_etat(c)
            if trouve is not None:
                colonne = trouve
                continue
            if colonne is None or colonne >= len(c):
                continue
            m = re.fullmatch(r"#?(\d{3,5})\.(\d+)", c[1])
            if not m:
                continue
            # L'état se lit NU : ni gras, ni code, ni parenthèse de commentaire.
            etat = re.sub(r"\s*\(.*$", "", c[colonne].strip().strip("*`").lower()).strip()
            cle = (m.group(1), m.group(2))
            # On compare le SENS, pas la ponctuation : « colonne compte » et
            # « colonne : compte » sont le même point écrit deux fois.
            demandes[cle].add((_sens(c[2]), os.path.basename(f)))
            rang = RANG_ETAT.get(etat, 0)
            if cle not in meilleur or rang > meilleur[cle][0]:
                meilleur[cle] = (rang, etat, os.path.basename(f))

    etats = collections.defaultdict(collections.Counter)
    for (issue, _), (_, etat, _) in meilleur.items():
        etats[issue][etat] += 1

    # ⚠️ Garder « l'état le plus fort » n'est juste que si les deux lignes sont
    # LE MÊME point. Quand la demande diverge (#2118.48 : « score /10 nu » d'un
    # côté, « verdict compris en moins de dix secondes » de l'autre), la fusion
    # ferait passer pour fait un point que personne n'a traité. Ces issues-là ne
    # sont JAMAIS annoncées prêtes à fermer — elles se tranchent à la main.
    global DEMANDE_DIVERGENTE
    DEMANDE_DIVERGENTE = {
        issue
        for (issue, _), v in demandes.items()
        if len({d for d, _ in v}) > 1
    }

    if signaler_doublons:
        # ⚠️ Deux points DIFFÉRENTS sous le même numéro, c'est un vrai défaut :
        # la demande diverge, donc l'un des deux est mal numéroté.
        divergents = {
            k: v for k, v in demandes.items()
            if len({d for d, _ in v}) > 1
        }
        if divergents:
            print(f"⚠️ {len(divergents)} numéro(s) portant DEUX demandes différentes :")
            for (issue, sous), v in sorted(divergents.items())[:10]:
                print(f"  #{issue}.{sous}")
                for d, fich in sorted(v):
                    print(f"      [{fich[:40]:40s}] {d[:56]}")
            print()
    return etats


def main():
    etats = points_par_issue(signaler_doublons="--doublons" in sys.argv)
    brut = subprocess.run(
        ["gh", "issue", "list", "--state", "open", "--limit", "400", "--json", "number,title,labels"],
        cwd=REPO, capture_output=True, text=True).stdout
    ouvertes = {str(i["number"]): i for i in json.loads(brut or "[]")}

    pretes, proches, suspectes = [], [], []
    for numero, compte in etats.items():
        if numero not in ouvertes:
            continue
        reste = {k: v for k, v in compte.items() if k not in TERMINAUX}
        total, ouvert = sum(compte.values()), sum(reste.values())
        libelles = ",".join(x["name"] for x in ouvertes[numero]["labels"])
        ligne = (ouvert, numero, total, reste, ouvertes[numero]["title"][:58], libelles)
        # Une issue qui porte un numéro à DEUX demandes ne se ferme jamais sur
        # un compte : la fusion des états y est peut-être un mensonge.
        if ouvert == 0 and numero in DEMANDE_DIVERGENTE:
            suspectes.append(ligne)
        else:
            (pretes if ouvert == 0 else proches).append(ligne)

    pretes.sort(key=lambda x: int(x[1]))
    proches.sort()
    print(f"=== PRÊTES À FERMER : {len(pretes)} ===")
    for _, n, tot, _, titre, lbl in pretes:
        print(f"  #{n} ({tot} pts) [{lbl}] {titre}")
    if suspectes:
        print(f"\n=== À TRANCHER À LA MAIN : {len(suspectes)} ===")
        print("  (plus aucun point ouvert, MAIS un numéro y porte deux demandes")
        print("   différentes — lance `--doublons` avant de fermer)")
        for _, n, tot, _, titre, lbl in sorted(suspectes, key=lambda x: int(x[1])):
            print(f"  #{n} ({tot} pts) [{lbl}] {titre}")

    for seuil, entete in ((3, "À 1-3 POINTS"), (None, "plus loin")):
        lot = [p for p in proches if (p[0] <= 3) == (seuil is not None)]
        print(f"\n=== {entete} : {len(lot)} ===")
        for r, n, tot, reste, titre, lbl in lot:
            suffixe = f" [{lbl}] {titre}" if seuil else ""
            print(f"  #{n} reste {r}/{tot} {reste}{suffixe}")
    print("\n⚠️ Ce compte ignore les branches EN VOL : lance `en-vol.py` avant de dispatcher.")


if __name__ == "__main__":
    main()
