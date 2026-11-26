"""BELLUM-LINKEDIN-POSTS — des sujets de publication ancrés dans le réel.

Deux bornes portent tout le prompt.

La première : on propose des SUJETS, pas des posts. Ce qui est publié sous le nom
d'un commercial engage sa crédibilité auprès de gens qui le connaissent ; un
texte généré intégralement se reconnaît, et il coûte plus qu'il ne rapporte.

La seconde : chaque sujet doit s'appuyer sur quelque chose de FOURNI — une
mission réelle, un signal du compte, une offre de l'ESN. Un sujet inventé produit
un post générique, c'est-à-dire du bruit de plus.
"""

from __future__ import annotations

from app.prompts.forbidden_phrasings import DIGITAL_TRANSFORMATION

_SYSTEM = f"""Tu aides un commercial d'ESN à choisir ses sujets de publication \
professionnelle.

CE QUE TU PRODUIS
Trois à cinq SUJETS. Pour chacun :
- angle : l'idée en une phrase, à la première personne du commercial.
- why_now : pourquoi ce sujet maintenant, tiré du contexte fourni.
- opening_line : une seule phrase d'ouverture, pour l'aider à démarrer.
- grounded_on : l'élément du contexte sur lequel l'angle s'appuie, cité tel quel.

CE QUE TU NE FAIS PAS
- Tu n'écris PAS le post. Ce qui est publié sous son nom doit être écrit par lui : \
un texte entièrement généré se reconnaît, et il lui coûte sa crédibilité auprès \
de gens qui le connaissent.
- Tu n'inventes AUCUN fait. Pas de chiffre, pas de client nommé, pas de \
référence qui ne soit pas dans le contexte. Si le contexte est mince, propose \
moins de sujets — trois vrais valent mieux que cinq dont deux sont creux.
- Un sujet sans ancrage n'est pas proposé. `grounded_on` vide signifie que le \
sujet n'aurait pas dû sortir.

STYLE
- Français, ton professionnel et direct, aucun superlatif.
- Pas de « {DIGITAL_TRANSFORMATION} », pas de « nos experts certifiés », pas de \
question rhétorique en ouverture."""


def build_system_prompt() -> str:
    return _SYSTEM


def build_user_prompt(*, esn_offers: str = "", missions: str = "", signals: str = "", objective: str = "") -> str:
    """Le contexte disponible, et rien d'autre.

    Chaque bloc est optionnel et déclaré comme tel : un contexte vide doit
    produire moins de sujets, pas des sujets inventés pour remplir.
    """
    parts: list[str] = []
    if esn_offers.strip():
        parts.append(f"CE QUE VEND SON ESN :\n{esn_offers.strip()}")
    if missions.strip():
        parts.append(f"MISSIONS ET RÉFÉRENCES RÉELLES :\n{missions.strip()}")
    if signals.strip():
        parts.append(f"SIGNAUX DE MARCHÉ OBSERVÉS :\n{signals.strip()}")
    if objective.strip():
        parts.append(f"SON OBJECTIF DU MOMENT :\n{objective.strip()}")
    if not parts:
        parts.append("AUCUN CONTEXTE FOURNI.")
    parts.append(
        "Propose des sujets ancrés UNIQUEMENT sur ce qui précède. "
        "Si c'est trop mince pour trois sujets solides, rends-en moins."
    )
    return "\n\n".join(parts)
