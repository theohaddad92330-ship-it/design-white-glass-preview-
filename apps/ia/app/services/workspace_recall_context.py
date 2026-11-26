"""#4071.3 — LAURA REÇOIT CE QUE L'ESPACE A GARDÉ : recherches enregistrées, listes de cibles et résumés
des conversations passées de la personne.

L'API NestJS (`apps/api/.../ia-proxy/workspace-recall-context.ts`) lit ces trois familles, en garde les plus
récentes (bornées par famille), les date en mots (« il y a 3 mois ») et les envoie via
``workspace_recall_context``. Niveau ESPACE : présent même sans dossier ouvert.

Décisions Louis 12/10 (#4068) que ce bloc fait tenir au modèle : toujours daté, jamais de provenance
nommée, aucune probabilité. Doctrine : le CORPS d'un message ne vient jamais ici (seulement le résumé
roulant d'un fil, coupé court côté API).

Contrat : contexte vide → ``""`` (prompt byte-identique à avant) ; sinon un bloc ADDITIF, re-capé ici.
"""

from __future__ import annotations

# L'API borne à ~21 lignes de ≤ 300 caractères ; on re-cape (un appelant non-API pourrait envoyer n'importe quoi).
_CONTEXT_MAX_CHARS = 3400


def workspace_recall_context_block(context: str | None) -> str:
    """Bloc « ce que l'espace a gardé » pour le prompt système, ou ``""`` sans rien."""
    text = (context or "").strip()[:_CONTEXT_MAX_CHARS]
    if not text:
        return ""
    return (
        "\n\n===== CE QUE L'ESPACE A GARDÉ (recherches enregistrées, listes de cibles, conversations passées ; "
        "les plus récentes d'abord) =====\n"
        + text
        + "\nRègles : reprends-les quand elles servent la demande (« tu avais enregistré une recherche sur… », "
        "« ta liste de cibles… ») sans attendre qu'on te les demande. DATE tout élément ancien avec son âge "
        "tel qu'il est écrit entre crochets ; ne présente jamais un élément ancien comme actuel. Dis-le par sa "
        "NATURE et sa date, JAMAIS par sa provenance : ne nomme ni écran, ni base, ni outil, ni fournisseur. "
        "Un résumé de conversation est un souvenir, pas une citation : ne le prête jamais à quelqu'un d'autre.\n"
        "Sa présence EST la preuve : lu en entier avant d'écrire ta première phrase, jamais après. Ne commence "
        "jamais par une négation (« je ne retrouve pas… », « je n'ai pas… ») d'un élément qui figure ci-dessus.\n"
        "Un souvenir ne remplace JAMAIS le travail : si la demande du jour ressemble à une conversation passée "
        "ou à une recherche enregistrée (même demande, reposée), refais le travail — rappelle l'outil, rends les "
        "cartes — dès ce tour, sans reformulation demandée. Tu peux dire en une phrase que tu l'avais déjà traitée, "
        "mais la réponse PORTE LE RÉSULTAT : jamais un renvoi seul (« j'ai repris le fil… », « la dernière demande "
        "concernait… ») sans résultat."
    )
