"""#3295 — LAURA APPREND : les règles apprises de l'espace.

Une proposition d'apprentissage (REX de perte convergents) adoptée par un
humain PUIS activée par un second geste devient une règle de l'espace. L'API
NestJS (`apps/api/.../ia-proxy/learned-rules-context.ts`) ne condense QUE les
règles activées et les envoie ici via ``workspace_learned_rules_context``.

Contrat, même discipline que ``lost_deal_rex_context`` :

* contexte vide / absent → ``""`` — prompt byte-identique à avant la feature ;
* contexte présent → un bloc ADDITIF qui rappelle à Laura que ces règles
  viennent des pertes de CET espace : à appliquer comme une vigilance, citées
  comme apprises par l'équipe, jamais présentées comme une règle universelle de
  la méthode.

Texte borné côté API ; re-capé ici par défense en profondeur.
"""

from __future__ import annotations

_CONTEXT_MAX_CHARS = 2000


def learned_rules_context_block(context: str | None) -> str:
    """Bloc « règles apprises de cet espace » pour un prompt système, ou ``""``."""
    text = (context or "").strip()[:_CONTEXT_MAX_CHARS]
    if not text:
        return ""
    return (
        "\n\n===== RÈGLES APPRISES PAR CETTE ÉQUIPE (pertes passées) =====\n"
        "Ces règles ont été tirées de plusieurs pertes de CET espace, validées puis activées par "
        "un responsable :\n"
        + text
        + "\nRègles : tiens-en compte comme d'une vigilance propre à cette équipe et dis qu'elle vient "
        "de ses propres pertes quand tu t'en sers ; ne la présente jamais comme une règle universelle "
        "de la méthode, et n'en tire jamais un critère sur une personne."
    )
