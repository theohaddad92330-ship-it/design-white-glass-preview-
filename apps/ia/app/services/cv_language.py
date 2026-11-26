"""La langue d'un CV, déterminée sans appel de modèle.

─────────────────────────────────────────────────────────────────────────────
POURQUOI DÉTERMINISTE
─────────────────────────────────────────────────────────────────────────────
Le chantier du PDF 3 avait classé « CV parsé dans sa langue, restitué en
français » comme un chantier de prompt, mesurable seulement sur des CV réels.
C'est vrai de la QUALITÉ de la restitution — pas de la détection.

Un modèle à qui l'on demande la langue rend parfois « anglais » sur un CV
français truffé d'anglicismes techniques ; l'erreur est invisible et déplace
tout le parsing. La détection est donc un comptage de mots-outils : ils sont
fréquents, courts, et ne sont jamais du jargon métier. « Kubernetes » n'aide pas
à trancher, « the » et « avec » si.

─────────────────────────────────────────────────────────────────────────────
CE QUE `None` VEUT DIRE
─────────────────────────────────────────────────────────────────────────────
« Je ne sais pas », et l'appelant n'ajoute alors AUCUNE consigne de langue. Un
CV de deux lignes, ou un CV qui n'est qu'une liste de technologies, ne porte pas
assez de mots-outils pour trancher — et deviner ferait ajouter une consigne de
traduction sur un CV déjà français.
"""

from __future__ import annotations

import re

#: Mots-outils par langue. Courts, très fréquents, et jamais du jargon métier —
#: c'est ce qui les rend fiables sur un CV, où le vocabulaire technique est
#: anglais quelle que soit la langue du document.
_MARKERS: dict[str, tuple[str, ...]] = {
    "fr": ("le", "la", "les", "des", "une", "avec", "pour", "dans", "chez", "et", "au", "du", "sur", "ans"),
    "en": ("the", "and", "with", "for", "from", "years", "team", "of", "in", "at", "on", "to"),
    "es": ("el", "la", "los", "las", "con", "para", "años", "en", "de", "del", "y"),
    "de": ("und", "mit", "für", "der", "die", "das", "von", "bei", "im", "jahre"),
    "it": ("il", "lo", "gli", "con", "per", "anni", "di", "del", "nella", "e"),
    "nl": ("de", "het", "een", "met", "voor", "van", "bij", "jaar"),
}

#: En dessous, on ne tranche pas. Un CV qui n'est qu'une liste de technologies
#: ne porte aucun mot-outil, et lui prêter une langue ferait ajouter une
#: consigne de traduction sur un document qui n'en a pas besoin.
_MIN_MARKERS = 6
#: L'écart minimal avec la deuxième langue. Le néerlandais et le français
#: partagent « de » : sans marge, un CV français basculerait sur un seul mot.
_MIN_LEAD = 1.5


def detect_cv_language(text: str) -> str | None:
    """Le code langue du CV (`fr`, `en`, …), ou ``None`` quand on ne sait pas."""
    words = re.findall(r"[a-zà-öø-ÿ]+", (text or "").lower())
    if len(words) < 20:
        return None
    counts = {lang: sum(1 for word in words if word in markers) for lang, markers in _MARKERS.items()}
    ranked = sorted(counts.items(), key=lambda entry: entry[1], reverse=True)
    best, best_count = ranked[0]
    if best_count < _MIN_MARKERS:
        return None
    runner_up = ranked[1][1] if len(ranked) > 1 else 0
    if runner_up > 0 and best_count < runner_up * _MIN_LEAD:
        return None
    return best


#: Ce qu'on ajoute au prompt quand le CV n'est PAS en français.
#:
#: La consigne tient en deux règles, et la seconde est la plus importante : la
#: CITATION reste dans la langue d'origine. Sans elle, la garde anti-invention
#: du serveur — qui cherche chaque citation dans le CV source — ne trouverait
#: plus rien, et retirerait tous les champs d'un CV étranger.
_TRANSLATION_DIRECTIVE = """
LANGUE DU CV : ce CV n'est pas en français ({language}).

Deux règles, dans cet ordre :
1. Restitue les LIBELLÉS en français (intitulé de poste, secteurs, mobilité…).
2. Laisse chaque CITATION dans la langue d'origine, mot pour mot. Une citation
   traduite ne serait plus retrouvable dans le CV source, et le champ entier
   serait alors écarté par la vérification.

Les noms propres, technologies et intitulés de certification ne se traduisent
jamais.
"""


def translation_directive(text: str) -> str:
    """La consigne à ajouter, ou une chaîne VIDE.

    Vide sur un CV français ou de langue indéterminée : le prompt reste alors
    byte-identique à ce qu'il était, ce qui garantit qu'aucun CV français ne
    change de comportement.
    """
    language = detect_cv_language(text)
    if language is None or language == "fr":
        return ""
    return _TRANSLATION_DIRECTIVE.format(language=language)
