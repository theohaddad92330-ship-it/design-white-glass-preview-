"""#3192 (LAU-FINAL-198, « RESPONSE DENSITY CONTROLLER ») — la preuve
DÉTERMINISTE que la recette du 30/09 a jugée absente.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
Les lots du 28-29/09 (#3192.1 à .7) ont posé la RÈGLE dans le prompt
(``bellum_advisor._BLOCK_FORMAT``) : quatre niveaux nommés, huit critères de
choix. Ce que la recette du 30/09 a noté « non prouvé », c'est que rien ne
VÉRIFIE, sans appel de modèle, que la densité réellement rendue correspond à
la demande — la seule preuve disponible jusqu'ici était la lecture du texte
du prompt, jamais un contrôle sur une paire (question, réponse).

Ce module livre exactement la RECETTE de l'issue : les trois questions
successives (« SG prend des consultants ? » / « Explique-moi en détail le
modèle d'achat de SG » / « Fais-moi une stratégie complète sur 30 jours »)
doivent classer à trois niveaux distincts — c'est un test, pas une opinion.
La classification est un TITRE (mots-clés explicites + longueur du message),
jamais un jugement sémantique : composer un vrai classifieur sémantique
demanderait un appel de modèle, exactement ce que cet environnement de lot ne
peut pas exercer. ``density_mismatch`` referme la boucle : une fois le niveau
ATTENDU connu, une réponse dont la longueur le contredit franchement (un
rapport DEEP tenu en une phrase, une question MICRO qui reçoit un
mini-rapport — le symptôme exact du corps de l'issue) est un signal, câblé
dans ``commercial_verifier.verify_response`` (même discipline : un VERDICT
observé, jamais une réécriture).
"""

from __future__ import annotations

import unicodedata
from typing import Literal

ResponseDensityLevel = Literal["micro", "short", "decision", "deep"]


def _fold(text: str) -> str:
    folded = unicodedata.normalize("NFKC", text or "").replace("’", "'").lower()
    return " ".join(folded.split())


#: Catalogue FERMÉ — une demande explicite de rapport structuré ou de plan
#: étalé dans le temps (§ RECETTE, question 3 : « stratégie complète sur 30
#: jours »). Jamais un mot-clé isolé comme « stratégie » seul : #3342 montre
#: qu'une stratégie peut se demander en une phrase courte et rester hors de
#: ce niveau (son propre gabarit de réponse ne dépend pas de ce contrôleur).
_DEEP_TRIGGERS: tuple[str, ...] = (
    "stratégie complète",
    "plan complet",
    "plan d'action complet",
    "rapport détaillé",
    "rapport structuré",
    "analyse complète",
    "analyse approfondie",
    "dossier complet",
    "stratégie sur",
    "plan sur",
    "sur 30 jours",
    "sur trente jours",
)

#: Catalogue FERMÉ — une demande d'explication approfondie d'un sujet unique
#: (§ RECETTE, question 2 : « explique-moi en détail »), sans pour autant
#: réclamer un rapport à sections multiples.
_DECISION_TRIGGERS: tuple[str, ...] = (
    "en détail",
    "détaille",
    "quel est le meilleur",
    "dois-je",
    "que dois-je faire",
    "priorise",
    "ta recommandation",
    "quelle décision",
)

#: Une question fermée, courte (§ RECETTE, question 1 : « SG prend des
#: consultants ? », 27 caractères) — jamais un jugement sur le FOND, une
#: mesure de longueur du message, la même discipline que
#: ``commercial_verifier._is_too_long`` sur la réponse.
_MICRO_MAX_MESSAGE_CHARS = 40

#: #3192 (recette prod 01/10) — une RELANCE d'un fil en cours (« Et Armelle,
#: elle est dans quel état de relation ? », 50 caractères) est une question
#: fermée même au-delà de 40 : l'ouvreur « Et … » dit qu'elle prolonge le fil.
#: Borne plus large, ouvreur MOT ENTIER ; les déclencheurs DEEP/DECISION restent
#: prioritaires (testés avant).
_MICRO_FOLLOW_UP_MAX_MESSAGE_CHARS = 80


def classify_expected_density(message: str) -> ResponseDensityLevel:
    """Le niveau attendu pour ``message`` — MICRO/SHORT/DECISION/DEEP, jamais
    une probabilité ni un score : un classement fermé, comme le reste de la
    doctrine (aucun classement chiffré)."""
    folded = _fold(message)
    if any(trigger in folded for trigger in _DEEP_TRIGGERS):
        return "deep"
    if any(trigger in folded for trigger in _DECISION_TRIGGERS):
        return "decision"
    length = len((message or "").strip())
    if length <= _MICRO_MAX_MESSAGE_CHARS:
        return "micro"
    if length <= _MICRO_FOLLOW_UP_MAX_MESSAGE_CHARS and folded.startswith("et "):
        return "micro"
    return "short"


#: Plafonds/planchers par niveau — un multiple round, pensé pour rester lisible
#: dans le commit et le test (même discipline que
#: ``commercial_verifier._TOO_LONG_THRESHOLD_CHARS``), pas mesuré au caractère
#: près. MICRO/SHORT/DECISION sont des PLAFONDS (le symptôme du corps de
#: l'issue : « un mini-rapport pour une question de deux lignes ») ; DEEP est
#: un PLANCHER (le symptôme inverse : un rapport structuré rendu en une
#: phrase — vu aussi côté #3342, gabarit voisin).
_MICRO_MAX_REPLY_CHARS = 320
_SHORT_MAX_REPLY_CHARS = 700
_DECISION_MAX_REPLY_CHARS = 900
_DEEP_MIN_REPLY_CHARS = 500


def density_mismatch(level: ResponseDensityLevel, reply_text: str) -> bool:
    """``True`` si ``reply_text`` contredit franchement le niveau ``level``
    attendu pour la question. Une mesure, jamais un jugement sur le fond —
    exactement la discipline déjà choisie pour ``RESPONSE_TOO_LONG``."""
    length = len(reply_text or "")
    if level == "micro":
        return length > _MICRO_MAX_REPLY_CHARS
    if level == "short":
        return length > _SHORT_MAX_REPLY_CHARS
    if level == "decision":
        return length > _DECISION_MAX_REPLY_CHARS
    return length < _DEEP_MIN_REPLY_CHARS


__all__ = [
    "ResponseDensityLevel",
    "classify_expected_density",
    "density_mismatch",
]
