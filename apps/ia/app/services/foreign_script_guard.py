"""R40 (Thales, 17/10) — un mot hébreu parasite (« בלבד ») au milieu d'une réponse française de Laura.

Une réponse FR/EN ne contient pas de mot en hébreu, arabe, cyrillique, CJK, thaï ou devanāgarī : quand le modèle en
glisse un, c'est une dérive de génération, jamais le propos. Ce filet DÉTERMINISTE le retire (et nettoie l'espace et
la ponctuation laissés). Il se retient quand :

- la réponse est réellement écrite dans ce script (plus d'un tiers des lettres) — on ne mutile pas une réponse
  rendue dans une autre langue ;
- la personne a elle-même écrit ce mot (elle le cite, Laura le reprend) ;
- #4656 — le mot figure dans les données du compte (`known_text` : un nom propre légitime, un contact, une raison
  sociale) ; ce qui n'y figure pas est une dérive, jamais un nom.

#4656 (recette prod 27/10, EXOTEC) — « כלבד » est sorti tel quel : la garde n'était posée que sur le chemin
orchestrateur. Elle est désormais posée AUSSI sur le point de sortie du routeur (`routers/chat.py`), qui couvre
le repli sans orchestrateur ; et chaque retrait se CONSIGNE (`logger.error`, canal Sentry du dépôt), sans le contenu.

Pur : texte entrant, texte sortant, aucun appel. Greek exclu à dessein (μ, Ω, π sont des unités et des symboles).
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

_FOREIGN_RUN = re.compile(r"[Ѐ-ԯ֐-׿؀-ۿݐ-ݿऀ-ॿ฀-๿぀-ヿ㐀-鿿가-힯]+")
#: Un tiers des lettres dans le script étranger : la réponse EST écrite dans cette langue.
_NATIVE_SHARE = 1 / 3


def find_stray_foreign_script(text: str, *, user_message: str | None, known_text: str | None = None) -> list[str]:
    """Les mots non latins parasites de ``text`` (vide = rien à retirer)."""
    if not text:
        return []
    runs = _FOREIGN_RUN.findall(text)
    if not runs:
        return []
    letters = sum(1 for c in text if c.isalpha())
    if letters and sum(len(r) for r in runs) / letters > _NATIVE_SHARE:
        return []
    asked = f"{user_message or ''}\n{known_text or ''}"
    return [r for r in runs if r not in asked]


def strip_stray_foreign_script(text: str, *, user_message: str | None, known_text: str | None = None) -> str:
    """``text`` sans ses mots non latins parasites ; inchangé (au byte près) quand il n'y en a aucun."""
    stray = find_stray_foreign_script(text, user_message=user_message, known_text=known_text)
    if not stray:
        return text
    # #4656 — le cas se consigne pour qu'on sache s'il se répète : le NOMBRE de mots, jamais leur contenu.
    logger.error("Laura a glissé %d mot(s) d'un autre alphabet dans sa réponse — retiré (#4656)", len(set(stray)))
    out = text
    for word in dict.fromkeys(stray):
        # L'espace qui PRÉCÉDAIT le mot part avec lui : aucune indentation Markdown ailleurs n'est touchée.
        out = re.sub(rf"[ \t]*{re.escape(word)}", "", out)
    out = re.sub(r"\(\s*\)", "", out)
    return out
