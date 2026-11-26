"""Ce que le comptage doit savoir lire — et ce qu'il doit refuser de compter.

Deux pièges réels de ce dépôt :
- un registre écrit ses pipes échappés (`\\|`) dans le texte d'une demande ;
  découper naïvement sur `|` casse la ligne et décale toutes les colonnes ;
- un état s'écrit NU. Un `**livré**`, un `` `livré` `` ou un
  « livré (voir plus bas) » doivent se lire comme `livré`, sinon un point
  répondu se compte comme ouvert et l'issue ne se ferme jamais.
"""
import importlib.util
import pathlib
import re

_spec = importlib.util.spec_from_file_location(
    "reste_a_faire", pathlib.Path(__file__).with_name("reste-a-faire.py")
)
reste = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(reste)


def etat_nu(cellule):
    """La normalisation que `points_par_issue` applique à la colonne d'état."""
    return re.sub(r"\s*\(.*$", "", cellule.strip().strip("*`").lower()).strip()


def test_les_colonnes_survivent_a_un_pipe_echappe():
    ligne = r"| 2566.4 | un choix A \| B | api | la mesure | livré | la preuve |"
    c = reste.colonnes(ligne)
    assert c[1] == "2566.4"
    assert c[2] == r"un choix A \| B"
    assert c[5] == "livré"


def test_un_etat_habille_se_lit_nu():
    assert etat_nu("**livré**") == "livré"
    assert etat_nu("`recetté`") == "recetté"
    assert etat_nu("déjà là (voir la ligne du dessus)") == "déjà là"


def test_les_etats_terminaux_sont_les_quatre_attendus():
    # `reformulé` en fait partie : la ligne PORTE la réponse écrite, c'est un
    # point répondu. L'oublier ferait traîner des issues déjà tranchées.
    assert reste.TERMINAUX == {"déjà là", "écarté", "recetté", "reformulé"}
    assert "retenu" not in reste.TERMINAUX
    assert "à trancher" not in reste.TERMINAUX
    assert "livré" not in reste.TERMINAUX  # livré = du code, pas encore vu tourner


def test_une_ligne_trop_courte_n_est_pas_un_point():
    assert len(reste.colonnes("| pas | un | point |")) < 7


def test_l_etat_se_trouve_par_l_EN_TETE_pas_par_un_index_fixe():
    """Le piège qui rendait six issues livrées « reste N/N ».

    Les registres de ce dépôt n'ont pas tous le même nombre de colonnes : sept
    pour la forme longue (numéro · demande · sujet · mesure · état · preuve),
    six pour la forme courte (Point · Demande · État · Preuve · Fichiers clés).
    Un index fixe lisait « Fichiers clés » comme un état sur la seconde forme.
    """
    longue = "| numéro | demande | sujet | mesure | état | preuve |"
    courte = "| Point | Demande | État | Preuve | Fichiers clés |"
    assert reste.index_de_l_etat(reste.colonnes(longue)) == 5
    assert reste.index_de_l_etat(reste.colonnes(courte)) == 3


def test_une_ligne_sans_EN_TETE_lu_n_est_jamais_comptee():
    """Ce que la garde doit savoir dire NON.

    Sans en-tête, on ne sait PAS où est l'état — et deviner, c'est exactement
    le défaut qu'on corrige. Aucune colonne ne se nomme « état » ici.
    """
    assert reste.index_de_l_etat(reste.colonnes("| Point | Demande | Preuve |")) is None
    assert reste.index_de_l_etat(reste.colonnes("| 2562.1 | une demande | livré | la preuve |")) is None
