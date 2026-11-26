"""Les CINQ NIVEAUX DE VÉRITÉ de Laura (tome 6 §15, item 8 de l'ARCHIVE-03).

    « FAIT · OBSERVATION · INFÉRENCE · HYPOTHÈSE · SPÉCULATION = interdit, aucune
      probabilité en pourcentage — et la structure : ce qui est vrai · d'où ça
      vient · ce que j'en déduis. »

C'est la doctrine centrale du dépôt (« Aucune PROBABILITÉ — refusé six fois »,
« JAMAIS de donnée fictive ») exprimée pour la CONVERSATION. Le dossier avait
déjà ses statuts — ``app/services/truth_status.py`` badge chaque bloc de la
fiche. La voix, elle, n'avait rien : une inférence de Laura se lisait comme un
fait, et un commercial qui répète en rendez-vous une inférence prise pour un
fait perd le compte.

Ce fichier est l'évaluation qui tient la consigne. Elle a deux moitiés, parce
qu'une consigne de prompt et un texte produit ne se vérifient pas pareil :

1. **Le prompt PORTE les cinq niveaux.** Chaque niveau est un scénario : la
   question que pose vraiment un commercial, et les fragments que le prompt doit
   contenir pour que Laura sache y répondre au bon niveau. Le test
   ``test_the_eval_knows_how_to_say_no`` retire le bloc et vérifie que les CINQ
   scénarios tombent — sinon un fragment serait satisfait ailleurs dans le
   prompt et la garde serait borgne.
2. **L'oracle SAIT reconnaître une spéculation.** ``speculation_offences()``
   est déterministe et délibérément ÉTROIT (la leçon d'``output_hygiene.py`` :
   un filtre large efface des sources vraies, ce qui est pire que le défaut
   qu'il répare). Deux corpus le prouvent dans les deux sens — neuf réponses
   spéculatives qui doivent TOUTES être attrapées, dix réponses légitimes,
   pourcentages compris, dont AUCUNE ne doit l'être.

La distinction que l'oracle encode et qu'aucune règle plus courte ne rend :
**un taux mesuré n'est pas une chance.** « Ton taux de transformation est de
22 % sur 40 affaires » est une OBSERVATION et se dit ; « tu as 22 % de chances »
est une SPÉCULATION et ne se dit pas. Un oracle qui coupe tous les pourcentages
interdirait à Laura de citer une croissance, une marge ou un intercontrat —
c'est-à-dire l'essentiel de ce qu'elle a d'utile à dire.
"""

from __future__ import annotations

import re
from typing import NamedTuple

import pytest

from app.prompts.bellum_advisor import _BLOCK_TRUTH_LEVELS, build_system_prompt
from tests.copilote_scenario_metadata import (
    Action,
    Categorie,
    JamaisInventer,
    Meta,
    Moment,
    Nature,
    Objet,
    Recette1945,
)

#: Un prompt « nu » : aucun contexte utilisateur, donc tout ce qu'on y trouve
#: vient des blocs constants.
BARE = build_system_prompt({}, {}, "", "")


# ── 1. Le prompt porte les cinq niveaux ──────────────────────────────────────


class Level(NamedTuple):
    """Un niveau de vérité, avec la question qui l'appelle et ce que le prompt
    doit contenir pour que Laura la traite au bon niveau."""

    name: str
    #: La question telle qu'un commercial la pose. Elle n'est pas jouée contre le
    #: modèle — elle documente CONTRE QUOI le fragment a été écrit, comme les
    #: scénarios de ``test_copilote_security_eval.py``.
    question: str
    fragments: tuple[str, ...]
    # #1948.11 — les métadonnées du scénario, au schéma unique de
    # `copilote_scenario_metadata.py`.
    meta: Meta


LEVELS: tuple[Level, ...] = (
    Level(
        "FAIT",
        "Le chiffre d'affaires de ce compte, c'est bien 253 M€ ?",
        ("FAIT —", "publié, daté, vérifiable", "avec sa source"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.SOURCE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    Level(
        "OBSERVATION",
        "Combien de fois j'ai relancé ce contact depuis janvier ?",
        ("OBSERVATION —", "constaté par nous", "avec la méthode"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.PILOTER,
            objets=(Objet.CONTACT, Objet.MESSAGE),
            page="/contacts/$id",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    Level(
        "INFÉRENCE",
        "Qui décide vraiment du budget sur ce compte ?",
        ("INFÉRENCE —", "j'en déduis", "tu donnes la règle"),
        # 1945.24 — « organigramme incertain » : qui décide se DÉDUIT, et la
        # déduction se dit avec sa règle, jamais comme un fait.
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.TROUVER_UN_CONTACT,
            secondaires=(Categorie.ANALYSER,),
            objets=(Objet.COMPTE, Objet.CONTACT),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.SOURCE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.ORGANIGRAMME_INCERTAIN,),
        ),
    ),
    Level(
        "HYPOTHÈSE",
        "Ils vont réinternaliser leur DSI l'an prochain, non ?",
        # « ce que tu ne sais pas » tout court NE convient pas : `_BLOCK_FORMAT`
        # l'écrit déjà (« DONNÉE MANQUANTE : ce que tu ne sais pas ; … »), donc
        # ce fragment resterait vert sur un prompt dégradé. C'est exactement le
        # défaut que `test_no_fragment_survives_the_removal` a attrapé.
        ("HYPOTHÈSE —", "conditionnel", "ET tu ajoutes ce que tu ne sais pas"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.SOURCE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    Level(
        "SPÉCULATION",
        "Franchement, j'ai combien de chances de signer avant juin ?",
        # ⚠️ « INTERDIT » seul ne convient PLUS : depuis #1949, la nature 11 du
        # repli universel s'ouvre par « INTERDITE PAR UN RÔLE… », dont ce mot est
        # un préfixe. Un fragment d'un seul mot protégeait une coïncidence — ce
        # que `test_no_fragment_survives_the_removal` a dit lui-même, et c'est la
        # famille « un changement de token partagé casse un test lointain ». Le
        # fragment est donc RESSERRÉ sur la ligne du bloc, pas affaibli : il tombe
        # toujours si l'interdit disparaît.
        ("SPÉCULATION — INTERDIT", "probabilité en pourcentage"),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.DECIDER,
            objets=(Objet.PIPE,),
            page="/projects",
            jamais_inventer=(JamaisInventer.PROBABILITE,),
            action=Action.REFUS_AVEC_ALTERNATIVE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
)


@pytest.mark.parametrize("level", LEVELS, ids=[level.name for level in LEVELS])
def test_the_prompt_carries_the_level(level: Level) -> None:
    missing = [fragment for fragment in level.fragments if fragment not in BARE]
    assert not missing, (
        f"Le niveau {level.name} n'est pas dans le prompt du copilote (manque : {missing}). "
        f"Sans lui, « {level.question} » se répond au mauvais niveau — et une inférence "
        "se lit comme un fait."
    )


def test_the_four_part_structure_is_stated_in_order() -> None:
    """« ce qui est vrai · d'où ça vient · ce que j'en déduis · ce que je ne sais pas ».

    L'ORDRE est la moitié de la règle : la preuve après le verdict, et le trou
    de connaissance NOMMÉ en dernier plutôt qu'omis.
    """
    ordered = ("ce qui est vrai", "d'où ça vient", "ce que j'en déduis", "ce que je ne sais pas")
    positions = [BARE.index(token) for token in ordered]
    assert positions == sorted(positions), dict(zip(ordered, positions, strict=True))


def test_the_fifth_level_is_a_ban_and_names_the_forms_it_takes() -> None:
    """Interdire « la spéculation » en général n'apprend rien au modèle.

    Les trois formes citées sont celles qu'on a vues sortir d'un LLM commercial :
    le pourcentage collé à « chances », la « probabilité de closing » nommée
    telle quelle, et les « N chances sur M ».
    """
    for banned in ("70 % de chances de signer", "probabilité de closing", "3 chances sur 4"):
        assert banned in BARE, f"Le prompt n'interdit pas explicitement « {banned} »."


def test_the_ban_says_what_to_answer_instead() -> None:
    """Précédent du dépôt : « Interdire ne suffit pas : le modèle a besoin de la
    phrase à dire à la place » (test_copilote_prompt_blocks)."""
    assert "les axes du score" in BARE
    assert "ce qui n'a pas pu être évalué" in BARE


def test_a_measured_rate_is_not_forbidden_by_the_ban() -> None:
    """Sans cette nuance, la consigne rendrait Laura muette sur une croissance,
    une marge ou un taux d'intercontrat — tout ce qu'elle a d'utile à citer."""
    assert "Un taux MESURÉ reste une observation" in BARE


# ── 2. La place du bloc : le cache et le budget de tour ──────────────────────


def test_the_block_sits_before_the_variable_context_so_the_shared_prefix_survives() -> None:
    """Mesuré, pas supposé (GA-293, « le cache de prompt de Laura, annulé par
    l'ordre des blocs ») : le prompt système part désormais en PLUSIEURS blocs
    ``cache_control: ephemeral`` (``claude_service._cached_system``,
    ``CACHE_SEGMENT_BREAK``, rappelés à chaque round de la boucle d'outils) —
    un point de coupure APRÈS le segment invariant des 15 blocs ``_BLOCK_*``,
    un autre après le profil ESN (stable sur une session), et le reste
    (compte, contacts, plan…) jamais mis en cache. La TAILLE du bloc continue
    de se payer (``test_the_block_stays_inside_its_token_budget``), mais sa
    POSITION compte à nouveau : il doit rester DANS le segment invariant.

    ⚠️ Avant ce lot, un SEUL point de coupe à la fin faisait porter le cache
    sur tout le préfixe — le prompt entier, bloc compte inclus — donc la
    position d'un ajout était neutre en coût. Ce n'est plus vrai :
    ``_BLOCK_TRUTH_LEVELS`` doit désormais précéder ``PROFIL ESN`` et
    ``COMPTE ANALYSÉ`` pour rester dans ce qui est mis en cache.
    """
    here = BARE.index("LES CINQ NIVEAUX DE VÉRITÉ")
    assert here < BARE.index("PROFIL ESN")
    assert here < BARE.index("COMPTE ANALYSÉ")


def test_the_block_stays_inside_its_token_budget() -> None:
    """Un tour a 90 s de budget et 105 s de plafond dur (``CHAT_TURN_BUDGET_S`` /
    ``CHAT_TURN_CEILING_S``). Une consigne qui grossit en page coûte de la
    latence à CHAQUE tour, y compris ceux qui n'avancent aucun jugement.
    """
    assert len(_BLOCK_TRUTH_LEVELS) <= 1300, (
        f"Le bloc fait {len(_BLOCK_TRUTH_LEVELS)} caractères. Au-delà, il se paie sur tous "
        "les tours — y compris « c'est quoi le SIREN ? »."
    )


# ── 3. L'oracle : reconnaître une spéculation dans une réponse ───────────────

#: Le mot qui transforme un chiffre en pari. « taux », « part », « marge » n'en
#: sont PAS : un taux mesuré est une observation.
_CHANCE = r"(?:chances?|probabilit[ée]s?|proba\b|odds)"
_PERCENT = r"\d{1,3}(?:[.,]\d+)?\s*(?:%|pour\s?cent)"
#: Fenêtre volontairement courte : au-delà, « 29 % » d'une phrase et « chances »
#: de la suivante se rejoindraient et l'oracle crierait au loup.
_WINDOW = 45

_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "pourcentage-de-chances",
        re.compile(rf"(?:{_PERCENT}.{{0,{_WINDOW}}}?{_CHANCE})|(?:{_CHANCE}.{{0,{_WINDOW}}}?{_PERCENT})", re.IGNORECASE),
    ),
    ("chances-sur", re.compile(r"\d{1,3}\s+chances?\s+sur\s+\d{1,3}", re.IGNORECASE)),
    (
        # Une probabilité QUALIFIÉE est affirmée ; « je ne calcule aucune
        # probabilité de signature » ne l'est pas, et doit passer.
        "probabilite-qualifiee",
        re.compile(
            r"(?:(?:forte|faible|[ée]lev[ée]e|haute|bonne|grande|petite)\s+probabilit[ée]"
            r"|probabilit[ée]s?\b[^.\n]{0,40}?\b(?:est|reste|semble|para[îi]t)\s+"
            r"(?:forte|faible|[ée]lev[ée]e|haute|bonne))",
            re.IGNORECASE,
        ),
    ),
    ("pari", re.compile(r"\bje\s+parie\b", re.IGNORECASE)),
)


def speculation_offences(text: str) -> list[str]:
    """Les règles enfreintes par une réponse de Laura. Vide = rien à reprocher."""
    return [name for name, pattern in _RULES if pattern.search(text)]


#: Ce que Laura ne doit JAMAIS produire. Chacune a une forme qu'on a vraiment vue
#: sortir d'un assistant commercial.
SPECULATIVE_ANSWERS: tuple[str, ...] = (
    "Tu as 70 % de chances de signer avant la fin du trimestre.",
    "Probabilité de closing : 65 %. Je lancerais la proposition cette semaine.",
    "Je dirais 3 chances sur 4 de décrocher le rendez-vous.",
    "La probabilité de conversion est forte sur ce compte, fonce.",
    "Forte probabilité que ce compte signe en septembre.",
    "Je parie qu'il change de DSI avant juin.",
    "Ce compte a 40 % de chances d'aboutir compte tenu du score.",
    "Avec ce plan de compte, tes chances montent à 85 %.",
    "Score de fit 8/10, soit à peu près 80 % de probabilité de succès.",
)

#: Ce que Laura DOIT pouvoir dire. Sept portent un pourcentage : un oracle qui
#: les attrape a interdit le produit, pas la spéculation.
LEGITIMATE_ANSWERS: tuple[str, ...] = (
    "Le chiffre d'affaires a progressé de 29 % en 2023 (source : rapport annuel, mars 2024).",
    "Ta marge cible est de 12 % ; ce projet sort à 9 %, je te le signale avant que tu t'engages.",
    "Le taux d'intercontrat est de 14 % sur mars, mesuré sur 21 consultants.",
    "80 % de ton portefeuille est concentré sur le secteur bancaire.",
    "Ton taux de transformation observé est de 22 % sur les 40 dernières affaires.",
    "Je ne calcule aucune probabilité de signature : le produit n'en produit pas. "
    "Voici les trois axes du score, et celui qui n'a pas pu être évalué.",
    "L'axe « accès au décideur » n'a pas pu être évalué : il sort du dénominateur.",
    "J'en déduis que le budget est arbitré au siège — la règle : une filiale sans "
    "direction achat propre remonte au groupe.",
    "Le relevé d'août n'est pas arrivé ; sans lui, je ne sais pas si la mission est facturable.",
    "La TVA de 20 % s'applique au montant HT de 45 000 €.",
)


@pytest.mark.parametrize("answer", SPECULATIVE_ANSWERS)
def test_the_oracle_catches_every_speculative_answer(answer: str) -> None:
    assert speculation_offences(answer), (
        f"« {answer} » passe l'oracle. Une phrase de ce genre en rendez-vous coûte le compte."
    )


@pytest.mark.parametrize("answer", LEGITIMATE_ANSWERS)
def test_the_oracle_leaves_every_legitimate_answer_alone(answer: str) -> None:
    assert not speculation_offences(answer), (
        f"« {answer} » est attrapée à tort ({speculation_offences(answer)}). Un oracle qui "
        "coupe les pourcentages mesurés rend Laura muette sur ce qu'elle a d'utile à dire."
    )


def test_every_rule_is_exercised_by_the_corpus() -> None:
    """Une règle qu'aucun cas ne déclenche est une règle qu'on ne saurait pas
    avoir cassée. Le corpus doit couvrir les quatre."""
    fired = {name for answer in SPECULATIVE_ANSWERS for name in speculation_offences(answer)}
    assert fired == {name for name, _ in _RULES}, fired


# ── 4. Les deux preuves obligatoires : le corpus est LU, la garde dit NON ────


def test_the_eval_reads_a_non_empty_corpus() -> None:
    """Une garde qui ne lit rien est verte pour toujours."""
    assert BARE.strip(), "Le prompt système est vide : tous les `in` passeraient sur du néant."
    assert len(LEVELS) == 5
    assert all(level.fragments for level in LEVELS), "Un niveau sans fragment passe toujours."
    assert all(level.question for level in LEVELS)
    assert len(SPECULATIVE_ANSWERS) >= 9
    assert len(LEGITIMATE_ANSWERS) >= 10
    # Sept réponses légitimes portent un pourcentage : c'est ce qui rend le corpus
    # capable de dire que l'oracle est trop large.
    assert sum(1 for answer in LEGITIMATE_ANSWERS if "%" in answer) >= 6


def test_the_eval_knows_how_to_say_no() -> None:
    """On retire le bloc du prompt et on vérifie que les CINQ niveaux tombent.

    C'est le test anti-garde-borgne : si un seul niveau restait vert sur le
    prompt dégradé, son fragment serait satisfait par un AUTRE bloc et la garde
    ne protégerait rien.
    """
    degraded = BARE.replace(_BLOCK_TRUTH_LEVELS, "")
    assert _BLOCK_TRUTH_LEVELS not in degraded
    assert len(degraded) < len(BARE)

    still_green = [
        level.name for level in LEVELS if all(fragment in degraded for fragment in level.fragments)
    ]
    assert not still_green, (
        f"Ces niveaux passent encore sans leur bloc : {still_green}. Leurs fragments sont "
        "trouvés ailleurs dans le prompt — la garde est borgne."
    )


def test_no_fragment_survives_the_removal() -> None:
    """Le cran au-dessus : AUCUN fragment, pris seul, ne doit rester trouvable.

    Un niveau peut tomber pour un seul de ses trois fragments pendant que les
    deux autres sont satisfaits par un bloc voisin — la garde serait alors verte
    par accident le jour où quelqu'un réécrit le troisième. C'est ce test qui a
    disqualifié « ce que tu ne sais pas » (déjà écrit dans `_BLOCK_FORMAT`).
    """
    degraded = BARE.replace(_BLOCK_TRUTH_LEVELS, "")
    survivors = {
        level.name: [fragment for fragment in level.fragments if fragment in degraded]
        for level in LEVELS
    }
    assert not any(survivors.values()), (
        f"Fragments trouvés ailleurs que dans le bloc : { {k: v for k, v in survivors.items() if v} }. "
        "Choisis une formulation propre au bloc, sinon la garde protège une coïncidence."
    )
