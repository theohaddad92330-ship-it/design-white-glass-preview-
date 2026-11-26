"""#2899 (#2443.5) / #2898 (#2146.13) — UN DÉTECTEUR, PAS SEULEMENT UN TEXTE
DE PROMPT.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
`tests/test_copilote_prompt_blocks.py` verrouille déjà la RÈGLE côté prompt
(#2146.13 : « JAMAIS D'INSTRUCTION DE NAVIGATION MANUELLE ») — une garde qui
prouve que le TEXTE envoyé au modèle contient l'interdiction. Ce que ces
gardes-là ne peuvent pas prouver : que la RÈGLE, une fois appliquée à une
SORTIE réelle du modèle, saurait dire NON. Une garde qui ne vérifie que sa
propre présence dans un prompt statique n'a jamais été cassée pour de vrai —
elle a seulement été relue.

Ce module porte le détecteur ÉQUIVALENT au texte du prompt (même règle,
lisible sur une réponse plutôt que sur un bloc de prompt), avec le même
témoin négatif que `_VENDOR_NAMED`/le garde-clic dans
`test_copilote_prompt_blocks.py` : un texte FAUTIF fabriqué, pas seulement
l'absence de faute sur un texte déjà correct.

Vit dans ``app/services`` (pas ``app/eval``, qui reste hors du chemin de
production) : câblé dans ``chat_orchestrator._record_turn_outcome`` (le SEUL
point par lequel toute réponse de Laura passe, quel que soit le chemin qui
l'a produite) — une violation JOURNALISE (canal Sentry du dépôt,
``logger.error``), jamais ne bloque, même discipline que le contrôle des
chiffres non ancrés (``chat_turn_plan.unverified_figures``) : mesurer avant
de pouvoir bloquer. Le gate CI dédié (#2899, ``app/eval/chat_gate.py``) le
rejoue, lui, hors production, contre les cas FAUTIFS versionnés.
"""

from __future__ import annotations

import re

from app.prompts.forbidden_phrasings import COPILOT_MANUAL_REDIRECT_PHRASINGS

#: #2146.13 — une instruction de navigation manuelle enchaîne au moins DEUX
#: étapes à traverser soi-même (« Va dans Comptes, puis Découvrir, puis
#: sélectionne… » / « Go to Accounts, then open Discover… »). Nommer UN écran
#: isolé reste permis — c'est le cas voisin que
#: `test_the_click_guard_does_NOT_catch_a_legitimate_screen_name` garde déjà
#: côté prompt, et que `test_the_guard_does_NOT_catch_a_single_named_screen`
#: ci-dessous garde côté détecteur. FR et EN côte à côte : une règle
#: monolingue est aveugle à l'autre langue de l'interface.
_MANUAL_NAVIGATION = re.compile(
    r"\bvas?\s+dans\s+[^,.;:!?\n]+,\s*puis\s+[^,.;:!?\n]+(?:,\s*puis\s+[^,.;:!?\n]+)*"
    r"|\bgo\s+to\s+[^,.;:!?\n]+,\s*then\s+[^,.;:!?\n]+(?:,\s*then\s+[^,.;:!?\n]+)*",
    re.IGNORECASE,
)


def violates_manual_navigation_instruction(text: str) -> bool:
    """#2146.13 — True quand ``text`` fait traverser PLUSIEURS étapes de
    navigation à la personne au lieu de lancer le travail ou d'ouvrir
    directement la bonne surface (#2146.9 / #2146.10). ``False`` sur un texte
    vide : rien n'y a été trouvé, pas « rien ne devait l'être »."""
    return bool(_MANUAL_NAVIGATION.search(text or ""))


#: #3189.4 (LAU-FINAL-195) — le détecteur ÉQUIVALENT, côté réponse, de la
#: règle de prompt « FAIS LE TRAVAIL, NE L'ENSEIGNE PAS »
#: (``bellum_advisor.py``, ``COPILOT_MANUAL_REDIRECT_PHRASINGS``) : le même
#: catalogue, jamais retapé (GA-26). ⚠️ Un nom de fournisseur (LinkedIn,
#: Google) ne peut PAS vivre dans ``forbidden_phrasings`` : ce module est
#: rendu dans le PROMPT, et « nos fournisseurs ne se nomment jamais à
#: l'écran » l'interdit (`test_no_vendor_name_reaches_the_system_prompt`).
#: Ici, en revanche, on lit une SORTIE du modèle, jamais le prompt : une
#: réponse fautive qui nomme le fournisseur EN CLAIR (au lieu de la
#: formulation générique déjà bannie ci-dessus) doit être vue quand même.
_NAMED_VENDOR_REDIRECT = re.compile(
    r"\b(?:vas?|cherche|recherche)\s+(?:sur|dans)\s+linkedin\b"
    r"|\b(?:vas?|cherche|recherche)\s+(?:sur|dans)\s+google\b",
    re.IGNORECASE,
)
_MANUAL_REDIRECT = re.compile(
    "|".join(re.escape(p) for p in COPILOT_MANUAL_REDIRECT_PHRASINGS),
    re.IGNORECASE,
)


def violates_manual_redirect_instruction(text: str) -> bool:
    """#3189.4 — True quand ``text`` renvoie la personne vers une recherche
    MANUELLE (un site externe comme LinkedIn ou Google, ou un simple « tu
    peux rechercher… ») au lieu du résultat qu'un outil de Laura aurait pu
    rendre. ``False`` sur un texte vide : rien n'y a été trouvé, pas « rien
    ne devait l'être »."""
    return bool(_MANUAL_REDIRECT.search(text or "") or _NAMED_VENDOR_REDIRECT.search(text or ""))
