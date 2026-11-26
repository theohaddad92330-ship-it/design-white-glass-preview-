"""#4437 (Louis 21/10/2026) — rattacher le texte libre LU (intitulés d'offres) à un type de fait, une
compétence et une famille métier. Étiquetage contre des listes FERMÉES, sur un extrait cité tel quel ;
la validation (extrait réellement lu, compétence dans l'extrait) vit dans ``free_text_facts``."""

from __future__ import annotations

import json
from collections.abc import Sequence

FACT_TYPES: tuple[str, ...] = ("hiring", "project", "other")


def build_system_prompt(families: Sequence[str]) -> str:
    return f"""Tu rattaches des INTITULÉS D'OFFRES D'EMPLOI publiés par une entreprise à un référentiel.
Pour chaque intitulé qui nomme une compétence ou un métier, rends un objet :
- "index"    : le numéro de l'intitulé
- "factType" : {" | ".join(FACT_TYPES)} (hiring = un poste ouvert ; project = l'intitulé nomme un projet)
- "skill"    : la compétence (technologie, outil, méthode) telle qu'ÉCRITE dans l'intitulé, ou null
- "family"   : {" | ".join(families)} ou null
- "extract"  : le passage EXACT de l'intitulé qui justifie le rattachement, recopié mot pour mot

RÈGLES :
1. N'invente RIEN : un intitulé qui ne nomme ni compétence ni métier n'a pas d'objet.
2. "extract" est recopié de l'intitulé, sans reformuler ; "skill" figure dans "extract".
3. Aucune déduction : « Développeur React » ne prouve ni TypeScript ni Node.

Réponds en JSON : {{"items": [...]}}"""


def build_user_prompt(titles: Sequence[str]) -> str:
    return "Intitulés :\n" + json.dumps(
        [{"index": i, "title": title} for i, title in enumerate(titles)], ensure_ascii=False
    )
