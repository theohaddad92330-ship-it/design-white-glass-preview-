"""#3272.6 — LAURA CITE LE REX DE PERTE DU COMPTE.

L'API NestJS condense les REX de perte déjà persistés d'un compte (route
utilisée, sponsor, motif déclaré, dernière action) en quelques lignes courtes
— jamais le REX mot pour mot (`apps/api/.../ia-proxy/lost-deal-rex-context.ts`,
même discipline que ``app/services/account_feedback.py``) — et les envoie ici
via le champ ``lost_deal_rex_context`` de la requête ``/chat/message``.

Ce module rend le BLOC de prompt correspondant. Contrat :

* contexte vide / absent → ``""`` — le prompt appelant reste byte-identique à
  avant la feature ;
* contexte présent → un bloc ADDITIF qui rappelle à Laura de s'appuyer sur ce
  passé SANS jamais réciter le REX mot pour mot ni présenter une hypothèse
  comme un fait acquis (la distinction fait/hypothèse voyage déjà dans le
  texte condensé, ce bloc ne fait que la RAPPELER).

Le texte est borné côté API (~1.2k chars) ; on re-cape ici par défense en
profondeur (un appelant non-API pourrait envoyer n'importe quoi).
"""

from __future__ import annotations

# Cap dur sur le bloc injecté — cité dans un prompt Claude, un appelant
# hostile/buggé ne doit pas pouvoir gonfler le contexte.
_CONTEXT_MAX_CHARS = 2000


def lost_deal_rex_context_block(context: str | None) -> str:
    """Bloc « REX de perte du compte » pour un prompt système, ou ``""`` sans REX."""
    text = (context or "").strip()[:_CONTEXT_MAX_CHARS]
    if not text:
        return ""
    return (
        "\n\n===== REX DE PERTE DÉJÀ CONNU(S) SUR CE COMPTE =====\n"
        "Ce compte a déjà été perdu, bloqué ou classé no-go au moins une fois. Voici un "
        "résumé condensé de ce qui s'est passé :\n"
        + text
        + "\nRègles : appuie-toi dessus pour éviter de répéter la même route ou le même angle "
        "sans le dire — mais NE RÉCITE JAMAIS ce résumé mot pour mot, reformule avec tes propres "
        "mots ; une ligne marquée « hypothèse » ou « interprétation » reste une hypothèse, ne la "
        "présente jamais comme un fait acquis."
    )
