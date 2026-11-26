"""Mémoire de corrections du compte (feedback loop A2).

L'API NestJS condense les retours utilisateur d'un compte (« ce play est hors
sujet », « ce contact n'est plus là », « bonne lecture ») en directives
factuelles déterministes, et les envoie ici via le champ ``account_feedback``
des requêtes plan / classification / chat / graph.

Ce module rend le BLOC de prompt correspondant. Contrat :

* directives vides / absentes → ``""`` — le prompt appelant reste **byte-
  identique** à avant la feature (même discipline que ``_strategy_directive``) ;
* directives présentes → un bloc ADDITIF qui CITE les retours tels quels
  (jamais réinterprétés) et impose les consignes correctives.

Le texte est borné côté API (~2.4k chars) ; on re-cape ici par défense en
profondeur (un appelant non-API pourrait envoyer n'importe quoi).
"""

from __future__ import annotations

# Cap dur sur le bloc injecté — le feedback est cité dans un prompt Claude, un
# appelant hostile/buggé ne doit pas pouvoir gonfler le contexte.
_DIRECTIVES_MAX_CHARS = 4000


def feedback_directives_block(directives: str | None) -> str:
    """Bloc « retours utilisateur » pour un prompt système, ou ``""`` sans feedback.

    Les directives sont injectées telles quelles (elles citent déjà chaque
    retour verbatim) ; le chapeau et les règles sont fixes et déterministes.
    """
    text = (directives or "").strip()[:_DIRECTIVES_MAX_CHARS]
    if not text:
        return ""
    return (
        "\n\n===== RETOURS UTILISATEUR SUR CE COMPTE (mémoire de corrections — à respecter) =====\n"
        "L'utilisateur a déjà évalué un dossier précédent de ce compte. Chaque retour ci-dessous "
        "est un FAIT rapporté par l'utilisateur, cité tel quel — en tenir compte, ne pas répéter "
        "l'erreur signalée :\n"
        + text
        + "\nRègles : ne re-propose pas tel quel un élément jugé inutile ou hors sujet ; ne présente "
        "pas comme un fait une information signalée fausse ou obsolète (un contact signalé parti "
        "n'est plus une cible) ; conserve et renforce ce qui a été jugé utile. Ces retours priment "
        "sur les données plus anciennes du dossier."
    )
