"""Le jeu de calibration de la barrière d'achat, et ce qu'il prouve aujourd'hui.

Ces tests tiennent quatre choses :

1. Le jeu EXISTE et il est exploitable — sans quoi la garde serait verte sur du
   vide, qui est la leçon n°2 des gardes borgnes du socle.
2. La fonction de concordance sait dire NON — on lui soumet un modèle
   volontairement faux, et elle doit le refuser.
3. **Le garde-fou des trois proxies tient sur des comptes RÉELS** : privé de
   firmographie, `access_barrier` doit REFUSER de produire une classe. C'est le
   seul des quatre garde-fous d'honnêteté du 21/08 qu'on puisse vérifier sans
   résoudre 28 sociétés, et c'est le plus coûteux s'il lâche — un modèle qui
   tranche sur deux proxies envoie un commercial sur un compte verrouillé.
4. **GA-201** (`test_GA_201_...` ci-dessous) : la garde explicite que T-081
   réclamait. Elle prouve, en un seul endroit nommé, que ce harnais LIT un
   corpus non vide ET SAIT DIRE NON — les deux preuves qu'une garde
   d'architecture doit apporter avant d'être crue.

Ce que ces tests NE prouvent pas, et le disent : la justesse du modèle. Elle
exige la firmographie, qui n'est pas résolue. La concordance vaut donc `None`,
et le test l'affirme comme un fait plutôt que de laisser croire à un accord.
"""

from __future__ import annotations

import math

from app.services.access_calibration import (
    CONCORDANCE_TARGET,
    MIN_COMPARABLE,
    calibration_metadata,
    calibration_set,
    concordance,
)
from app.services.access_scoring import CLASS_BOUNDS, access_barrier


def test_le_jeu_existe_et_porte_des_jugements_humains() -> None:
    entries = calibration_set()
    # Le tome en demandait treize. Le jeu en porte davantage, et c'est tant
    # mieux — mais il ne doit jamais repasser sous le seuil d'origine.
    assert len(entries) >= 13
    for entry in entries:
        assert entry.company.strip()
        assert entry.human_class in {"A", "B", "C", "D"}
        # Un verdict SANS sa phrase d'origine serait un chiffre orphelin :
        # personne ne pourrait plus vérifier ce que l'humain a réellement dit.
        assert len(entry.human_verdict) > 10


def test_les_classes_du_jeu_sont_celles_du_modele() -> None:
    """Le jeu et le modèle parlent de la même échelle.

    Sans cette assertion, on pourrait comparer des lettres qui ne désignent pas
    la même chose et obtenir une concordance parfaitement fausse.
    """
    model_classes = {klass for _, klass, _ in CLASS_BOUNDS}
    assert {entry.human_class for entry in calibration_set()} <= model_classes


def test_la_provenance_est_ecrite_et_les_limites_aussi() -> None:
    meta = calibration_metadata()
    assert meta["captured_on"]
    assert "humain" in meta["judged_by"]
    # Un jeu de calibration qui ne dit pas ce qu'il ne couvre pas se lit comme
    # s'il couvrait tout. Celui-ci est déséquilibré vers les grands groupes, et
    # c'est écrit.
    assert len(meta["known_limits"]) >= 3


def test_la_concordance_est_NON_MESURABLE_tant_que_rien_n_est_soumis() -> None:
    result = concordance({})
    assert result["measurable"] is False
    # `None`, jamais 0 : « on n'a pas comparé » n'est pas « le modèle a tout faux ».
    assert result["rate"] is None
    assert result["meets_target"] is None
    assert result["missing"], "l'absence de mesure doit être NOMMÉE"
    assert len(result["not_submitted"]) == len(calibration_set())


def test_un_refus_du_modele_n_est_pas_un_desaccord() -> None:
    """Refuser de classer un compte sous-informé est le comportement ATTENDU.

    Le compter comme une erreur punirait l'honnêteté, et pousserait à faire
    trancher le modèle sur deux proxies — exactement ce qu'on interdit.
    """
    result = concordance({entry.company: None for entry in calibration_set()})
    assert len(result["declined"]) == len(calibration_set())
    assert result["rate"] is None
    assert result["opposed"] == []


def test_la_concordance_sait_dire_NON() -> None:
    """Preuve qu'elle mesure : un modèle volontairement faux doit être refusé.

    Sans ce test, une fonction de concordance en panne rendrait « tout va
    bien » pour toujours — la leçon n°3 des gardes borgnes.
    """
    entries = calibration_set()
    inverted = {"A": "D", "B": "C", "C": "B", "D": "A"}
    wrong = {entry.company: inverted[entry.human_class] for entry in entries}
    result = concordance(wrong)

    assert result["measurable"] is True
    assert result["rate"] == 0.0
    assert result["meets_target"] is False
    assert result["opposed"], "un écart de deux classes ou plus doit être compté à part"

    # Et le cas symétrique : un modèle parfait doit atteindre la cible.
    perfect = {entry.company: entry.human_class for entry in entries}
    good = concordance(perfect)
    assert good["rate"] == 1.0
    assert good["meets_target"] is True
    assert good["target"] == CONCORDANCE_TARGET


def test_un_ecart_d_une_classe_n_est_pas_un_ecart_de_trois() -> None:
    entries = calibration_set()
    neighbour = {"A": "B", "B": "A", "C": "D", "D": "C"}
    result = concordance({entry.company: neighbour[entry.human_class] for entry in entries})
    assert result["near_miss"] and not result["opposed"]
    assert all(record["gap"] == 1 for record in result["near_miss"])


def test_le_modele_REFUSE_de_classer_28_comptes_reels_sans_firmographie() -> None:
    """Le garde-fou des trois proxies, vérifié sur des comptes réels.

    C'est la seule des quatre bornes d'honnêteté du 21/08 qu'on puisse prouver
    sans résoudre 28 sociétés — et c'est celle dont la panne coûte le plus cher.
    """
    refused = 0
    for entry in calibration_set():
        assert not entry.has_firmography, f"{entry.company} porte une firmographie : le test doit être revu"
        barrier = access_barrier(
            statut=entry.statut,
            headcount=entry.headcount,
            listed=entry.listed,
            public_procurement=entry.public_procurement,
            etablissements=entry.open_establishments,
        )
        assert barrier["access_class"] is None, f"{entry.company} a reçu une classe sans proxy mesurable"
        assert barrier["measurable"] is False
        # L'absence est NOMMÉE, jamais silencieuse.
        assert barrier["missing"], f"{entry.company} : aucun proxy manquant nommé"
        refused += 1
    assert refused >= 13


def test_le_seuil_de_publication_est_celui_qu_on_annonce() -> None:
    # 12/13 — la cible du 21/08, exprimée en proportion pour rester vraie quel
    # que soit le nombre de comptes du jeu.
    assert CONCORDANCE_TARGET == 12 / 13
    assert MIN_COMPARABLE >= 10


def test_GA_201_le_harnais_lit_un_corpus_et_sait_dire_non() -> None:
    """GA-201 — la garde que T-081 réclamait, nommée et en un seul endroit.

    Le tracker de l'itération 3 décrivait un harnais « qui existe et n'est
    branché sur rien » : `CONCORDANCE_TARGET` et `concordance()` étaient réels,
    verts — mais rien ne prouvait que leur corpus n'était pas vide, ni que la
    fonction réagissait vraiment à une mauvaise classification. Une mesure de
    qualité qui ne mesure rien est pire qu'absente : elle rassure.

    Cette garde tient les deux preuves qu'on exige de toute garde d'architecture
    du dépôt (CLAUDE.md « une garde protège une règle, elle ne l'invente pas ») :

    1. **Elle LIT** : le corpus existe, n'est pas vide, et tient au moins les
       treize comptes que la spécification d'origine demandait.
    2. **Elle SAIT DIRE NON** : on casse volontairement quelques classifications
       réelles (pas toutes — un modèle qui se trompe parfois, pas un modèle
       inversé) et la concordance mesurée doit repasser SOUS `CONCORDANCE_TARGET`
       — sinon la garde ne détecterait pas une vraie régression du modèle.
    """
    entries = calibration_set()

    # (1) LIT : un corpus vide rendrait ce test rouge, pas la fonction verte
    # sur du vide.
    assert len(entries) > 0, "GA-201 : le corpus de calibration est vide — la garde ne lit rien"
    assert len(entries) >= 13, "GA-201 : sous le seuil des 13 comptes d'origine"

    perfect = {entry.company: entry.human_class for entry in entries}
    baseline = concordance(perfect)
    assert baseline["measurable"] is True
    assert baseline["rate"] == 1.0

    # (2) SAIT DIRE NON : on casse juste assez de comptes pour repasser sous la
    # cible — le nombre est dérivé de CONCORDANCE_TARGET et de la taille du
    # jeu, pas codé en dur, pour rester vrai si le jeu grandit encore.
    swap = {"A": "D", "B": "C", "C": "B", "D": "A"}
    to_break = math.ceil(len(entries) * (1 - CONCORDANCE_TARGET)) + 1
    broken = dict(perfect)
    for entry in entries[:to_break]:
        broken[entry.company] = swap[entry.human_class]

    result = concordance(broken)
    assert result["measurable"] is True
    assert result["rate"] is not None and result["rate"] < CONCORDANCE_TARGET
    assert result["meets_target"] is False, (
        "GA-201 : casser des classifications réelles n'a pas fait chuter la "
        "concordance sous la cible — la garde ne sait pas dire NON"
    )
