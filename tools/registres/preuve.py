#!/usr/bin/env python3
"""Balayage de preuve : un point `retenu` dont la TRACE est dans le code de main.

La trace d'un point est le commentaire `// #NNNN.M — …` que l'écrivain pose à
l'endroit du comportement (règle du dépôt). Sa présence sur `origin/main` prouve
que quelqu'un a livré CE point, et pas un homonyme — c'est la seule recherche
qui ne se trompe pas de cible, contrairement au libellé du point.

⚠️ Ce script ne PROPOSE que des passages `retenu → déjà là`. Il n'écarte jamais,
il ne devine jamais un état, et il ignore toute ligne qui porte « RÉFUTÉ ».
"""
import glob, os, re, subprocess, sys, collections

REF = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
APPLIQUER = "--appliquer" in sys.argv
# `--livre` : le balayage d'APRÈS-VAGUE. Un point `livré` désigne du code sur une
# branche NON fusionnée ; quand sa branche atterrit, il est sur `main` — et `main`
# est ce que la production sert. Il devient donc `déjà là`.
# DANS LES DEUX MODES : un point dont la preuve exige un ÉCRAN n'est JAMAIS
# flippé par ce script — aucune lecture de code ne remplace une mise en page,
# une hauteur de carte ou un rendu mobile (doctrine : rien n'est clos sans avoir
# été vu tourner). Ceux-là attendent un recetteur.
DEPUIS = "livré" if "--livre" in sys.argv else "retenu"
EXCLUS = {"2556.1", "2556.2"}  # recette contestée, tranchée à la main

def colonnes(l):
    return [c.strip().replace("\x00", "\\|") for c in l.replace("\\|", "\x00").split("|")]

def remplace_en_place(cellule, valeur):
    """La nouvelle valeur, dans l'habillage d'espaces de l'ancienne."""
    avant = cellule[: len(cellule) - len(cellule.lstrip())]
    apres = cellule[len(cellule.rstrip()) :]
    return f"{avant}{valeur}{apres}" if cellule.strip() else f" {valeur} "


def exige_un_ecran(texte):
    """La preuve de ce point est-elle ce que quelqu'un VOIT ?

    Aucune lecture de code ne remplace une mise en page, une hauteur de carte
    ou un rendu mobile. Ces points-là attendent un recetteur, dans les DEUX
    modes du balayage.
    """
    haut = texte.upper()
    return any(
        mot in haut
        for mot in ("ÉCRAN", "RECETTE", "RECETTE HUMAINE", "E2E", "VISUEL")
    )


def index_etat(c):
    for i, x in enumerate(c):
        if x.strip().strip("*`").lower() in ("état", "etat"):
            return i
    return None

# ⚠️ Une trace ne prouve pas une livraison à elle seule — deux faux positifs
# mesurés le 18/09/2026 sur un premier jet :
#   `need-wizard.ts:206` porte « #2558.1 — RETENU : le projet reste EXIGÉ ici »
#   `request-intent-contract.ts:73` porte « #2257.11 — NON PRODUIT »
# Ce sont des traces qui documentent le CONTRAIRE d'une livraison. Deux filtres :
#   1. la ligne de trace ne doit porter AUCUN mot de refus ;
#   2. la trace doit exister dans au moins un fichier de PRODUCTION — un point
#      qui n'existe que dans des tests n'a pas d'appelant, et c'est justement le
#      motif qui revient dans tout ce dépôt : du code juste que personne n'appelle.
# ⚠️ Un faux positif de plus, trouvé le 18/09/2026 APRÈS les deux premiers :
# `discover-contact-rows.ts:125` porte « La LOCALISATION (#2165.38) N'Y EST PAS :
# aucune donnée de lieu n'existe sur … ». Une trace peut donc documenter une
# ABSENCE de trois façons au moins — « RETENU », « NON PRODUIT », et une phrase
# négative ordinaire. On préfère RATER un passage (il reviendra au balayage
# suivant, quand quelqu'un aura écrit la vraie trace) plutôt que d'en inventer un.
# Trois faux positifs mesurés le 18/09/2026, trois formes différentes :
#   need-wizard.ts:206            « #2558.1 — RETENU : le projet reste EXIGÉ ici »
#   request-intent-contract.ts:73 « #2257.11 — NON PRODUIT comme champ générique »
#   discover-contact-rows.ts:125  « La LOCALISATION (#2165.38) n'y est pas »
# Une trace peut donc documenter le CONTRAIRE d'une livraison. On préfère RATER
# un passage — il reviendra au balayage suivant — plutôt que d'en inventer un.
#
# ⚠️ Et le piège inverse, mesuré en écrivant la garde : le mot « ABSENT » seul
# ne peut PAS servir de marqueur. La doctrine du produit parle sans arrêt de
# valeurs absentes — « #2068.32 — une valeur ABSENTE se nomme, jamais un zéro »
# est une trace de LIVRAISON. Un filtre trop large refuse du vrai travail.
REFUS = (
    "RETENU", "NON PRODUIT", "RÉFUTÉ", "À TRANCHER", "HORS PÉRIMÈTRE", "TODO",
    "NON LIVRÉ", "N'Y EST PAS", "N'EXISTE", "AUCUNE DONNÉE", "PAS ENCORE",
    "NON BRANCHÉ", "NON CÂBLÉ", "BLOQUÉ", "NE SAIT PAS",
)


def dit_un_refus(texte):
    """La ligne de trace documente-t-elle une ABSENCE plutôt qu'une livraison ?"""
    haut = texte.upper()
    return any(mot in haut for mot in REFUS)

def est_un_test(chemin):
    return (".test." in chemin or ".spec." in chemin
            or "/architecture/" in chemin or "/tests/" in chemin or "/__tests__/" in chemin)

brut = subprocess.run(
    ["git", "grep", "-nE", r"#[0-9]{4}\.[0-9]+", REF, "--", "apps", "packages"],
    capture_output=True, text=True).stdout

prod, refuses = set(), set()
for ligne in brut.splitlines():
    part = ligne.split(":", 3)
    if len(part) < 4:
        continue
    chemin, texte = part[1], part[3]
    for point in re.findall(r"#([0-9]{4}\.[0-9]+)", texte):
        if dit_un_refus(texte):
            refuses.add(point)
        elif not est_un_test(chemin):
            prod.add(point)
presents = prod - refuses

trouves = collections.defaultdict(list)
for f in sorted(glob.glob(".claude/notes/registre-*.md")):
    col, lignes, change = None, open(f, encoding="utf-8").readlines(), False
    for i, l in enumerate(lignes):
        c = colonnes(l)
        if len(c) < 4:
            continue
        j = index_etat(c)
        if j is not None:
            col = j
            continue
        if col is None or col >= len(c):
            continue
        m = re.fullmatch(r"#?(\d{4}\.\d+)", c[1])
        if not m or m.group(1) in EXCLUS:
            continue
        etat = re.sub(r"\s*\(.*$", "", c[col].strip().strip("*`").lower()).strip()
        if etat != DEPUIS or "RÉFUTÉ" in l or m.group(1) not in presents:
            continue
        # ⚠️ Vaut pour LES DEUX modes, et pas seulement pour `--livre`.
        # Mesuré le 18/09/2026 : le balayage `retenu` proposait de passer à
        # `déjà là` des points dont la preuve dit « ÉCRAN : ouvrir la modale de
        # refresh » — et dont la mesure datée disait « 8/11 catégories, pas
        # encore les 6 sous-types ». Les flipper aurait EFFACÉ une mesure
        # partielle honnête au profit d'un grep. Une trace prouve qu'un point a
        # été ÉCRIT, jamais qu'il est ARRIVÉ À L'ÉCRAN (#2261, rouverte pour ça).
        # On lit la LIGNE ENTIÈRE, pas la seule colonne preuve : `2118.48` porte
        # « nécessite une recette humaine live » dans sa colonne MESURE, et sa
        # preuve ne contient aucun mot-clé. Rater un point ne coûte rien — il
        # revient au balayage suivant ; en inventer un coûte une issue fermée à
        # tort devant un client.
        if exige_un_ecran(l):
            continue
        trouves[f].append(m.group(1))
        if APPLIQUER:
            # ⚠️ L'état s'écrit NU — `coherence.py` refuse « déjà là (…) », et il a
            # raison : un état qui porte son commentaire ne se compte plus. La
            # justification va dans la colonne PREUVE, à côté de celle qui s'y
            # trouvait déjà.
            # ⚠️ On ne RECONSTRUIT pas la ligne : on remplace deux cellules dans
            # le texte d'origine, espaces compris. Mesuré le 18/09/2026 : un
            # premier jet réécrivait `| 2165.38 | … |` en `|2165.38|…|`, ce qui
            # faisait entrer en conflit CHAQUE ligne balayée avec le travail des
            # écrivains — deux conflits sur une seule vague. Un balayage qui
            # reformate n'est plus un balayage, c'est une réécriture.
            brut = lignes[i].rstrip("\n").replace("\\|", "\x00").split("|")
            preuve = f"trace `#{m.group(1)}` en code de production sur {REF} — balayage du 18/09/2026"
            brut[col] = remplace_en_place(brut[col], "déjà là")
            if len(brut) > col + 1:
                ancienne = brut[col + 1].strip()
                brut[col + 1] = remplace_en_place(
                    brut[col + 1], f"{ancienne} ‖ {preuve}" if ancienne else preuve
                )
            lignes[i] = "|".join(brut).replace("\x00", "\\|") + "\n"
            change = True
    if change:
        open(f, "w", encoding="utf-8").writelines(lignes)

total = sum(len(v) for v in trouves.values())
for f, pts in sorted(trouves.items()):
    print(f"{os.path.basename(f)} : {len(pts)} — {', '.join(sorted(pts))}")
print(f"\n{total} point(s) `{DEPUIS}` dont la trace est sur {REF}" + (" — APPLIQUÉ" if APPLIQUER else ""))
