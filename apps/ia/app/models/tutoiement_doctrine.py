"""Doctrine partagée — le vouvoiement COMMANDÉ, jamais l'interdit CITÉ (R16-1).

Mesuré en production le 16/09/2026 sur `2e13d009a`, dans l'espace de Louis
(`.claude/notes/defaut-R16-1-tutoiement-de-la-sortie.md`) : le texte produit
par le Profiler vouvoie 8 fois alors que le schéma envoyé au modèle
(`ProfileContext.model_json_schema()`) commande le tutoiement. Cause : une
consigne de prompt n'est pas un contrat — Instructor ne rejoue le tour du
modèle que sur une erreur de VALIDATION, jamais sur une consigne non suivie.

Ce module porte la SEULE détection de « vouvoiement employé comme modèle de
phrase » du dépôt (par opposition à « vouvoiement cité pour le refuser », ex.
« Jamais vous, votre ou vos » — un mot de refus dans le MÊME segment change le
verdict). Deux lecteurs, un seul endroit :

- `profile_context.py` la câble en `field_validator(mode="after")` sur les
  champs de texte rendus verbatim (REFUSE la valeur PRODUITE) ;
- `tests/test_welcome_summary_tutoiement.py` relit le MÊME motif pour vérifier
  que la CONSIGNE ne l'emploie pas non plus (le piège mesuré le 15/09 : le
  worked example de `profile_recap` vouvoyait lui-même).

Reprise à l'identique de la garde d'origine (R15N-11) — ni le découpage en
segments, ni les mots de refus, ni le motif de vouvoiement n'ont changé.
"""

from __future__ import annotations

import re

# Un segment = une phrase.
SEGMENT = re.compile(r"[.;\n]")

# Un mot de refus dans le MÊME segment : la phrase NOMME l'interdit au lieu de
# le COMMANDER. Sans cette nuance, la garde (et le validateur) rougiraient sur
# le texte qui les protège eux-mêmes (« Jamais vous, votre ou vos »).
REFUSAL = re.compile(r"\bjamais\b|\baucune?\b|\bni\b|\bpas\b|\binterdit\w*\b|\bsans\b", re.IGNORECASE)

VOUVOIEMENT = re.compile(r"\bvous\b|\bvotre\b|\bvos\b", re.IGNORECASE)

# ⚠️ Portée CONNUE et volontairement non couverte : cette détection porte sur
# les PRONOMS (vous/votre/vos), pas sur la conjugaison — un verbe à la 2e
# personne du pluriel sans pronom (« commencez par une ETI... ») n'est pas
# attrapé. C'est la même portée que la garde d'origine (R15N-11) ; l'étendre à
# la conjugaison est hors du périmètre de ce correctif (voir le rapport R16-1).


def commanding_segments(text: str, pattern: re.Pattern[str] = VOUVOIEMENT) -> list[str]:
    """Segments où `pattern` est COMMANDÉ (employé comme modèle de phrase),
    pas refusé — `re.Pattern.search` est sans état, l'appel en boucle est sûr.
    """

    return [
        segment.strip()
        for segment in SEGMENT.split(text)
        if pattern.search(segment) and not REFUSAL.search(segment)
    ]


def employs_vouvoiement(text: str) -> list[str]:
    """Les segments de `text` où vous/votre/vos est EMPLOYÉ (pas cité pour le
    refuser). Liste vide = rien à reprocher. C'est ce que le `field_validator`
    de `profile_context.py` appelle pour REFUSER une valeur PRODUITE.
    """

    return commanding_segments(text, VOUVOIEMENT)
