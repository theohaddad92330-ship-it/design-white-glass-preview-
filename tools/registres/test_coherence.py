"""La garde des registres — et la preuve qu'elle sait dire NON.

Trois choses à prouver, comme toute garde du dépôt :
  1. qu'elle sait dire NON — chaque règle est mise en échec volontairement ;
  2. qu'elle LIT quelque chose — le corpus réel est compté avant d'être jugé,
     sinon un `glob` qui ne rend rien rendrait un vert parfait sur du vide ;
  3. qu'elle n'attrape pas ce qu'elle ne vise pas — un témoin de cas voisins
     LÉGITIMES doit passer, sans quoi la garde finit désactivée.
"""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from coherence import ETATS, NUMERO, anomalies, lire_points, racine_du_depot, registres  # noqa: E402

ENTETE = "| # | demande | sujet | constat | état | preuve |\n| --- | --- | --- | --- | --- | --- |\n"


@pytest.fixture
def registre(tmp_path):
    def ecrire(*lignes: str) -> list[str]:
        chemin = tmp_path / "registre-temoin.md"
        chemin.write_text(ENTETE + "".join(l + "\n" for l in lignes), encoding="utf-8")
        return [str(chemin)]

    return ecrire


# ── 2. elle LIT quelque chose ────────────────────────────────────────────────


def test_le_corpus_reel_n_est_pas_vide():
    """Sans ce test, les suivants seraient verts sur zéro fichier."""
    chemins = registres(racine_du_depot())
    assert len(chemins) >= 5, f"seulement {len(chemins)} registres trouvés"
    points = lire_points(chemins)
    assert len(points) >= 3000, f"seulement {len(points)} points lus"
    # Tout point lu porte un état du vocabulaire : si la colonne d'état était
    # lue au mauvais endroit, ce compte s'effondrerait sans qu'aucune règle
    # ne rougisse.
    assert all(p.etat in ETATS for p in points)


def test_les_registres_du_depot_sont_coherents():
    """La garde elle-même. 34 anomalies au 16/09/2026, toutes réparées."""
    trouvees = anomalies(registres(racine_du_depot()))
    assert trouvees == [], "\n".join(str(a) for a in trouvees)


# ── 1. elle sait dire NON ────────────────────────────────────────────────────


def test_refuse_recette_dont_la_preuve_dit_non_mesure(registre):
    chemins = registre(
        "| 2117.44 | Hauteur de la carte | écran | absent | recetté | NON MESURÉ — demande une mesure en production |"
    )
    trouvees = anomalies(chemins)
    assert [a.code for a in trouvees] == ["RECETTE-NON-MESURE"]
    assert trouvees[0].numero == "2117.44"


def test_refuse_un_etat_suffixe_par_une_date(registre):
    chemins = registre("| 2087.9 | Icône + phrase | écran | absent | livré 16/09 | `ChoiceRow.tsx:12` |")
    trouvees = anomalies(chemins)
    assert [a.code for a in trouvees] == ["ETAT-SUFFIXE"]
    assert "livré 16/09" in trouvees[0].message


def test_refuse_un_etat_suffixe_par_un_qualificatif(registre):
    chemins = registre("| 2088.6 | Chips sélectionnées | écran | absent | déjà là (reconcilié 16/09) | `TagsField.tsx:8` |")
    assert [a.code for a in anomalies(chemins)] == ["ETAT-SUFFIXE"]


def test_refuse_un_etat_invente(registre):
    chemins = registre("| 2151.27 | Retirer Accès | navigation | absent | constat faux | aucune route `/access` |")
    trouvees = anomalies(chemins)
    assert [a.code for a in trouvees] == ["ETAT-INCONNU"]
    # Le message NOMME le vocabulaire : « état inconnu » sans la liste oblige à
    # aller la chercher, et c'est ce qu'on lit dans un log de CI.
    assert "à trancher" in trouvees[0].message


# ── 3. elle n'attrape pas ce qu'elle ne vise pas ─────────────────────────────


def test_laisse_passer_une_recette_qui_CITE_un_ecran_disant_non_mesure(registre):
    """Le cas qui a failli rendre la garde fausse, trouvé le 16/09/2026.

    La doctrine EXIGE qu'un écran écrive « non mesuré » plutôt qu'un 0 — donc
    une preuve de recette CITE couramment cette phrase. La garde ne porte pas
    sur le mot, elle porte sur l'ABSENCE de mesure : une preuve qui cite le
    commit servi est une observation, sa citation est de la donnée."""
    chemins = registre(
        "| 2124.49 | Preuve affiche le problème | écran | absent | recetté | RECETTÉ 16/09 en production (SHA 3993b432b), ?tab=proofs : « Le problème traité : Non mesuré » — le champ est rendu avec sa valeur honnête |"
    )
    assert anomalies(chemins) == []


def test_refuse_une_recette_dont_le_SEUL_sha_est_une_branche_de_worktree(registre):
    """Piège mesuré le 16/09/2026 : `worktree-agent-ad02d5d445f3547db` contient
    dix-sept caractères hexadécimaux, et une reconnaissance naïve de SHA y voit
    un commit servi. Une branche de worktree est éphémère — elle ne prouve
    RIEN sur ce que la production exécute."""
    chemins = registre(
        "| 1917.2 | Fiche « Ce que je retiens » | écran | absent | recetté | LIVRÉ 15/09 br. `worktree-agent-ad02d5d445f3547db` : NON MESURÉ à l'écran |"
    )
    assert [a.code for a in anomalies(chemins)] == ["RECETTE-NON-MESURE"]


def test_laisse_passer_livre_dont_la_preuve_dit_non_mesure(registre):
    """C'est l'état HONNÊTE d'un point qui attend sa mesure — la garde vise la
    contradiction entre `recetté` et « NON MESURÉ », pas le mot lui-même."""
    chemins = registre("| 2117.44 | Hauteur de la carte | écran | absent | livré | NON MESURÉ — attend la production |")
    assert anomalies(chemins) == []


def test_laisse_passer_une_recette_dont_la_preuve_est_une_mesure(registre):
    chemins = registre(
        "| 1958.9 | Ne pas changer de langue | C | absent | recetté | prod `de67ae6bc` (13/09) : question en français → réponse en anglais, 201 |"
    )
    assert anomalies(chemins) == []


def test_laisse_passer_une_preuve_qui_CITE_un_etat(registre):
    """Une preuve dit couramment « ← livré, réconcilié 15/09 ». La cellule
    d'état est celle qui se RÉDUIT à un des sept mots, pas celle qui le
    contient — sans cette nuance la garde lirait la preuve comme un état."""
    chemins = registre("| 1954.13 | État Téléversement | F | PARTIEL | recetté | `Chat.tsx:2782` ← livré, réconcilié 15/09 |")
    assert anomalies(chemins) == []


def test_laisse_passer_un_libelle_de_demande_qui_CONTIENT_un_etat(registre):
    chemins = registre("| 2140.1 | Montrer ce qui est retenu par le filtre | écran | absent | livré | `Filters.tsx:44` |")
    assert anomalies(chemins) == []


def test_ignore_ce_qui_n_est_pas_une_ligne_de_point(registre):
    """Un registre porte aussi des tableaux annexes et de la prose : les compter
    inventerait des anomalies sur des lignes qui ne décrivent aucun point."""
    chemins = registre(
        "| Verdict | Nombre | Ce que ça veut dire |",
        "| `SANS-SHA` | 106 | invérifiable mécaniquement |",
        "Une phrase de prose qui parle de `recetté` et de NON MESURÉ.",
    )
    assert anomalies(chemins) == []
    assert lire_points(chemins) == []


def test_un_pipe_echappe_ne_coupe_pas_la_cellule(registre):
    """`stage: 'preparee'\\|...` — un `|` échappé reste DANS sa cellule. Le
    premier compteur écrit ce jour-là découpait dessus et décalait la ligne
    d'un cran, si bien que l'état était lu au mauvais endroit."""
    chemins = registre(
        "| 1946.5 | Instrumenter | G | `trackStage(s: 'a'\\|'b')` existe | retenu | décision produit |"
    )
    assert anomalies(chemins) == []
    points = lire_points(chemins)
    assert len(points) == 1 and points[0].etat == "retenu"


def test_un_corpus_absent_ne_rend_pas_un_vert(tmp_path):
    """Le défaut le plus courant d'une garde : un chemin qui ne matche rien."""
    assert registres(str(tmp_path)) == []


def test_une_ligne_qui_ouvre_sur_deux_barres_est_dite(registre):
    """⚠️ Mesuré le 16/09/2026 : sept lignes de la vague 17 ouvraient sur `||`,
    artefact de fusion. La première cellule valait la chaîne vide, donc le
    numéro ne matchait pas, donc les sept points étaient SAUTÉS EN SILENCE — le
    compteur rendait 8 222 au lieu de 8 229, et la garde était verte.

    Une ligne de point qu'on saute sans rien dire est pire qu'une ligne fausse :
    elle sort du compte, et le compte est ce sur quoi on ferme une issue."""
    chemins = registre(
        "|| 1909.6 | Huit familles nommées | A | rien | recetté | vu en prod |"
    )
    trouvees = anomalies(chemins)
    assert [a.code for a in trouvees] == ["LIGNE-MAL-FORMEE"]
    assert trouvees[0].numero == "1909.6"
    # Et elle ne compte toujours pas le point : c'est bien ce qu'on signale.
    assert lire_points(chemins) == []


def test_le_temoin_une_ligne_bien_formee_reste_muette(registre):
    """La garde voisine ne doit pas attraper ce qu'elle ne vise pas : la MÊME
    ligne, avec une seule barre, est juste et ne dit rien."""
    chemins = registre(
        "| 1909.6 | Huit familles nommées | A | rien | recetté | vu en prod |"
    )
    assert anomalies(chemins) == []
    points = lire_points(chemins)
    assert len(points) == 1 and points[0].numero == "1909.6"


def test_un_numero_suffixe_compte_et_la_prose_non(registre):
    """Un point qui se subdivise garde un numéro : `2543.3b` pour une lettre,
    `#2502.1 (partiel)` pour un morceau traité à part. Le motif strict les
    sautait EN SILENCE — 18 points hors du compte, dont un `livré` qui rendait
    #2502 faussement close-able.

    La garde doit savoir dire NON : la prose d'un tableau annexe de recette
    commence elle aussi par un numéro (« #1901.12 — les fils rangés… ») et ne
    doit toujours PAS compter, sinon un verdict de recette deviendrait un
    point de registre."""
    chemins = registre(
        "| 2543.3b | Le bandeau dit pourquoi | A | rien | recetté | vu en prod |\n"
        "| #2502.1 (partiel) | Le 3e endroit du meme bug | A | rien | livré | br. X |\n"
        "| #1901.12 — les fils ranges par activite AVANT la coupe | **PASS** | 8/8 en prod |"
    )
    assert anomalies(chemins) == []
    numeros = [p.numero for p in lire_points(chemins)]
    assert numeros == ["2543.3b", "#2502.1 (partiel)"]


def test_le_numero_refuse_ce_qui_nen_est_pas_un():
    """Le témoin du motif lui-même : ce qu'il accepte, et ce qu'il refuse."""
    for accepte in ("1909.6", "#1909.6", "2543.3b", "#2502.1 (partiel)", "2552.2 (direction)"):
        assert NUMERO.match(accepte), accepte
    for refuse in ("1909", "---", "", "numéro", "#1901.12 — les fils", "1909.6 recetté",
                   "2543.3bb", "#2502.1 (un qualificatif beaucoup trop long pour tenir ici)"):
        assert not NUMERO.match(refuse), refuse
