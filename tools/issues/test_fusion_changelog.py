"""Garde de la fusion du changelog — elle doit prouver TROIS choses (CLAUDE.md).

Le défaut qu'elle protège a coûté **treize jobs de CI rouges d'un coup** le
16/09/2026, sur `'}' expected`. La règle d'intégration « on garde LES DEUX côtés »
est juste sur `entries.ts`, dont chaque élément tient sur UNE ligne. Elle casse sur
`labels.*.ts`, où une entrée est un objet de plusieurs lignes : la frontière
`=======` tombe à l'intérieur de la dernière entrée du côté HEAD, dont le `},` de
fermeture vit dans le TRONC COMMUN après `>>>>>>>`. La concaténation lui fait alors
fermer l'entrée du côté distant — une accolade de moins, exactement une.

Les trois preuves :

  1. **Elle sait dire NON.** `test_refuse_une_fusion_desequilibree` et
     `test_refuse_un_identifiant_en_double` exigent un code de sortie 1 : une
     fusion cassée ne doit PAS rendre la main en silence, sinon elle part en CI.
  2. **Elle LIT vraiment.** `test_lit_le_vrai_catalogue_du_depot` ouvre les trois
     catalogues RÉELS et exige qu'ils soient non vides et équilibrés — si le
     chemin change, ou si `main` part cassé, ce test rougit.
  3. **Elle n'attrape pas ce qu'elle ne vise pas.** `test_ne_touche_pas_une_liste_
     dune_ligne` vérifie qu'un conflit sur `entries.ts` (un élément = une ligne)
     est fusionné SANS réparation inventée : la réparation ne doit se déclencher
     que sur une entrée réellement laissée ouverte.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

RACINE = Path(__file__).resolve().parents[2]

_spec = importlib.util.spec_from_file_location(
    "fusion_changelog", Path(__file__).with_name("fusion_changelog.py")
)
assert _spec and _spec.loader
fusion_changelog = importlib.util.module_from_spec(_spec)
sys.modules["fusion_changelog"] = fusion_changelog
_spec.loader.exec_module(fusion_changelog)


ENTETE_LABELS = """import type { ChangelogCatalog } from './entries.js'

export const changelogFr: ChangelogCatalog = {
  menu: { title: 'Nouveautés' },
  entries: {
"""

PIED_LABELS = """  },
}
"""


def _ecrire(racine: Path, relatif: str, contenu: str) -> Path:
    chemin = racine / relatif
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(contenu, encoding="utf-8")
    return chemin


def _faux_depot(tmp_path: Path, entries: str, labels_fr: str, labels_en: str) -> Path:
    _ecrire(tmp_path, fusion_changelog.CATALOGUES[0], entries)
    _ecrire(tmp_path, fusion_changelog.CATALOGUES[1], labels_fr)
    _ecrire(tmp_path, fusion_changelog.CATALOGUES[2], labels_en)
    return tmp_path


# ─────────────────────────────────────────────────────────────────────────────
# 1. Elle sait dire NON
# ─────────────────────────────────────────────────────────────────────────────


def test_repare_une_entree_laissee_ouverte_par_la_frontiere(tmp_path: Path):
    """LE cas mesuré : le `},` de la dernière entrée HEAD vit après `>>>>>>>`."""
    labels = (
        ENTETE_LABELS
        + "<<<<<<< HEAD\n"
        "    '2026-09-16-du-cote-local': {\n"
        "      date: '16 septembre 2026',\n"
        "      title: 'Côté local',\n"
        "=======\n"
        "    '2026-09-16-du-cote-distant': {\n"
        "      date: '16 septembre 2026',\n"
        "      title: 'Côté distant',\n"
        ">>>>>>> origin/main\n"
        "    },\n" + PIED_LABELS
    )
    racine = _faux_depot(tmp_path, "export const CHANGELOG_IDS = []\n", labels, labels)

    assert fusion_changelog.fusionner(racine) == 0

    rendu = (racine / fusion_changelog.CATALOGUES[1]).read_text(encoding="utf-8")
    assert fusion_changelog.desequilibre(rendu) == 0
    # les DEUX entrées survivent — c'est le but de la règle
    assert "'2026-09-16-du-cote-local'" in rendu
    assert "'2026-09-16-du-cote-distant'" in rendu
    assert "<<<<<<<" not in rendu and ">>>>>>>" not in rendu


def test_refuse_une_fusion_desequilibree(tmp_path: Path):
    """Un déséquilibre que la réparation ne sait pas expliquer ne passe PAS."""
    labels = ENTETE_LABELS + "    'pas-une-entree-datee': { oubli: 'accolade'\n" + PIED_LABELS
    racine = _faux_depot(tmp_path, "export const CHANGELOG_IDS = []\n", labels, labels)

    assert fusion_changelog.fusionner(racine) == 1


def test_refuse_un_identifiant_en_double(tmp_path: Path):
    """Deux fois le même `id` fausse tous les comptes — et ne passe pas."""
    entries = (
        "export const CHANGELOG_IDS = [\n"
        "  { id: '2026-09-16-le-meme', itemCount: 1 },\n"
        "  { id: '2026-09-16-le-meme', itemCount: 1 },\n"
        "]\n"
    )
    labels = ENTETE_LABELS + PIED_LABELS
    racine = _faux_depot(tmp_path, entries, labels, labels)

    assert fusion_changelog.fusionner(racine) == 1


def test_refuse_un_marqueur_de_conflit_restant(tmp_path: Path):
    """Un marqueur non reconnu (conflit à trois côtés) ne se glisse pas en CI."""
    labels = ENTETE_LABELS + "<<<<<<< HEAD\n    'orphelin': {},\n" + PIED_LABELS
    racine = _faux_depot(tmp_path, "export const CHANGELOG_IDS = []\n", labels, labels)

    assert fusion_changelog.fusionner(racine) == 1


# ─────────────────────────────────────────────────────────────────────────────
# 2. Elle LIT vraiment
# ─────────────────────────────────────────────────────────────────────────────


def test_lit_le_vrai_catalogue_du_depot():
    """Les trois chemins existent, portent des entrées, et sont équilibrés.

    Sans ce test, la garde pourrait viser trois fichiers qui n'existent plus et
    rendre un vert qui ne prouve rien.
    """
    for relatif in fusion_changelog.CATALOGUES:
        chemin = RACINE / relatif
        assert chemin.exists(), f"{relatif} : chemin périmé, la garde ne lit rien"
        texte = chemin.read_text(encoding="utf-8")
        assert fusion_changelog.desequilibre(texte) == 0, f"{relatif} déséquilibré"

    entries = (RACINE / fusion_changelog.CATALOGUES[0]).read_text(encoding="utf-8")
    identifiants = fusion_changelog.IDENTIFIANT.findall(entries)
    assert len(identifiants) > 100, "corpus vide ou motif d'identifiant périmé"
    assert not fusion_changelog.doublons(entries)


# ─────────────────────────────────────────────────────────────────────────────
# 3. Elle n'attrape pas ce qu'elle ne vise pas
# ─────────────────────────────────────────────────────────────────────────────


def test_ne_touche_pas_une_liste_dune_ligne(tmp_path: Path):
    """Sur `entries.ts`, « garder les deux côtés » suffit — aucune réparation."""
    entries = (
        "export const CHANGELOG_IDS = [\n"
        "<<<<<<< HEAD\n"
        "  { id: '2026-09-16-local', itemCount: 1 },\n"
        "=======\n"
        "  { id: '2026-09-16-distant', itemCount: 2 },\n"
        ">>>>>>> origin/main\n"
        "  { id: '2026-09-15-commun', itemCount: 1 },\n"
        "]\n"
    )
    labels = ENTETE_LABELS + PIED_LABELS
    racine = _faux_depot(tmp_path, entries, labels, labels)

    assert fusion_changelog.fusionner(racine) == 0

    rendu = (racine / fusion_changelog.CATALOGUES[0]).read_text(encoding="utf-8")
    assert fusion_changelog.IDENTIFIANT.findall(rendu) == [
        "2026-09-16-local",
        "2026-09-16-distant",
        "2026-09-15-commun",
    ]
    assert "    }," not in rendu, "réparation déclenchée à tort sur une liste d'une ligne"


def test_ne_repare_pas_une_entree_correctement_fermee(tmp_path: Path):
    """Deux entrées complètes des deux côtés : rien à réinsérer."""
    labels = (
        ENTETE_LABELS
        + "<<<<<<< HEAD\n"
        "    '2026-09-16-local': {\n"
        "      title: 'Local',\n"
        "    },\n"
        "=======\n"
        "    '2026-09-16-distant': {\n"
        "      title: 'Distant',\n"
        "    },\n"
        ">>>>>>> origin/main\n" + PIED_LABELS
    )
    racine = _faux_depot(tmp_path, "export const CHANGELOG_IDS = []\n", labels, labels)

    assert fusion_changelog.fusionner(racine) == 0
    rendu = (racine / fusion_changelog.CATALOGUES[1]).read_text(encoding="utf-8")
    assert rendu.count("    },") == 2, "une accolade a été inventée"


def test_un_catalogue_absent_est_dit_pas_devine(tmp_path: Path):
    """Un chemin manquant est un problème NOMMÉ, pas un silence."""
    _ecrire(tmp_path, fusion_changelog.CATALOGUES[0], "export const CHANGELOG_IDS = []\n")
    assert fusion_changelog.fusionner(tmp_path) == 1


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
