"""#1928.2/.3/.5/.6 — LA FAÇON DONT LAURA RÉPOND, RÉGLÉE PAR LA PERSONNE.

Source : ``packages/contracts/src/schemas/reply-preferences.ts``. Le service IA
n'a pas le paquet contracts à l'exécution : ``REPLY_PREFERENCES`` en est une
COPIE, et ``tests/test_reply_preferences.py`` relit le fichier TS pour prouver
qu'elles ne divergent pas.

D'où vient la valeur
--------------------
Du sac ``user_preferences`` de la personne (une rangée par utilisateur, sans
espace — la préférence est PERSONNELLE, #1928.8), réglé dans Réglages ›
Mémoire de Laura. L'API le relit à chaque tour (``ChatContextService.
loadMemory``) et l'envoie tel quel sous ``user_preferences`` — un ``dict``
côté pydantic, donc aucune clé avalée en route. Le navigateur n'envoie rien :
la valeur n'est jamais celle qu'un client affirme au moment du tour.

Où le bloc entre dans le prompt, et pourquoi là
-----------------------------------------------
Dans le segment VOLATIL de ``build_system_prompt``, juste avant la MÉMOIRE —
jamais dans les deux segments mis en cache (GA-293) :

* le segment INVARIANT est partagé par TOUS les utilisateurs : une préférence
  personnelle y ferait rater le cache de tout le monde ;
* le segment STABLE-PAR-SESSION est relu d'un tour à l'autre : une préférence
  changée dans les réglages en plein fil l'invaliderait — profil ESN compris —
  pour quelques lignes.

Ce que ça coûte de ne pas le cacher : le texte du bloc (quelques centaines de
caractères), à chaque tour, et seulement pour qui a réglé quelque chose.

Ce que ça ne change pas (#1928.10)
----------------------------------
La FORME, jamais le fond. Le bloc le redit là où il est lu : aucune règle de
vérité n'est suspendue, un format imposé pour une demande précise garde sa
structure, et une demande explicite du message du moment l'emporte.

Absent = byte-identique
-----------------------
Sans aucune clé reconnue portant une valeur connue, ``reply_preferences_block``
rend ``""`` et ``without_reply_preferences`` rend le sac INCHANGÉ (le même
objet) : le prompt d'avant ce lot, au caractère près.
"""

from __future__ import annotations

#: Copie du contrat — mêmes clés, mêmes valeurs, même ordre.
REPLY_PREFERENCES: dict[str, tuple[str, ...]] = {
    "replyLength": ("short", "detailed"),
    "replyTone": ("direct", "teaching"),
    "replyFormat": ("text", "lists"),
    "replySources": ("minimal", "detailed"),
}

_DIRECTIVES: dict[str, dict[str, str]] = {
    # #1928.2 — réponses courtes / détaillées.
    "replyLength": {
        "short": (
            "Longueur : courte. Va à l'essentiel en quelques phrases, sans développement "
            "qu'on ne t'a pas demandé. Une recommandation garde quand même son verdict, "
            "ce qui manque et la prochaine action — une ligne chacun."
        ),
        "detailed": (
            "Longueur : détaillée. Développe le raisonnement, les nuances et les options "
            "dès que la question engage une décision. Une question simple reste une "
            "réponse simple."
        ),
    },
    # #1928.3 — ton direct / pédagogique.
    "replyTone": {
        "direct": "Ton : direct. Le verdict d'abord, sans préambule ni formule d'adoucissement ; une idée par phrase.",
        "teaching": (
            "Ton : pédagogique. Explique le pourquoi de chaque recommandation, et définis "
            "au passage une notion métier qui ne va pas de soi — sans condescendance."
        ),
    },
    # #1928.5 — format préféré. Pas de « tableaux » : le rendu des réponses ne
    # sait pas les afficher (voir le contrat TS).
    "replyFormat": {
        "text": (
            "Format : texte. Des paragraphes courts plutôt que des puces ; une liste "
            "seulement quand l'énumération l'exige (des étapes, plusieurs comptes)."
        ),
        "lists": "Format : listes. Des puces dès qu'il y a plus de deux éléments à présenter.",
    },
    # #1928.6 — niveau d'explication des sources.
    "replySources": {
        "minimal": (
            "Explication des sources : minimale. Cite une source seulement quand elle "
            "fonde la décision, en quelques mots ; pas de détail de provenance pour le reste."
        ),
        "detailed": (
            "Explication des sources : détaillée. Pour chaque fait sur lequel tu "
            "t'appuies, dis d'où il vient (document, dossier, CRM, observation de marché) "
            "et de quand il date quand tu le sais ; sépare ce que tu as lu de ce que tu en déduis."
        ),
    },
}

_HEADER = (
    "PRÉFÉRENCES DE RÉPONSE (réglées par la personne elle-même — elles règlent la "
    "FORME de ta réponse, jamais son fond) :"
)

# #1928.10 — dit LÀ OÙ le bloc est lu : les règles de vérité sont trente
# lignes plus haut, et une préférence lue en dernier ne doit pas se lire comme
# une permission de les alléger.
_FOOTER = (
    "Ces préférences ne suspendent AUCUNE règle écrite plus haut : ce qui est inconnu "
    "reste nommé, une source non consultée n'est jamais présentée comme lue, la "
    "hiérarchie de vérité et les interdits restent entiers. Un format imposé plus "
    "haut pour une demande précise (question marché, priorisation, découverte du "
    "produit) garde sa structure : la préférence n'en règle que la longueur et la "
    "densité. Une demande explicite dans le message du moment (« détaille », « en "
    "une phrase ») l'emporte sur la préférence."
)


def _known(user_preferences: dict | None) -> list[tuple[str, str]]:
    """Les réglages reconnus, dans l'ordre du contrat. Une valeur inconnue est
    ABSENTE — jamais ramenée à une valeur devinée."""
    if not isinstance(user_preferences, dict):
        return []
    return [
        (key, user_preferences[key])
        for key, values in REPLY_PREFERENCES.items()
        if isinstance(user_preferences.get(key), str) and user_preferences[key] in values
    ]


def reply_preferences_block(user_preferences: dict | None) -> str:
    """Le bloc de consignes, ou ``""`` quand rien de connu n'est réglé."""
    known = _known(user_preferences)
    if not known:
        return ""
    lines = "\n".join(f"- {_DIRECTIVES[key][value]}" for key, value in known)
    return f"\n\n{_HEADER}\n{lines}\n{_FOOTER}"


def without_reply_preferences(user_preferences: dict | None) -> dict | None:
    """Le sac SANS les quatre clés de réponse, pour la mémoire libre.

    Sans cela, ``_format_memory`` les rendrait aussi en brut (« - replyLength :
    short ») : une clé technique lue par le modèle comme une préférence libre,
    en double du bloc ci-dessus. Une clé de réponse à valeur INCONNUE sort
    aussi — elle n'a aucun sens hors de ce module. Rien à retirer : le MÊME
    objet est rendu, pour que le prompt reste byte-identique.
    """
    if not isinstance(user_preferences, dict) or not any(key in user_preferences for key in REPLY_PREFERENCES):
        return user_preferences
    return {key: value for key, value in user_preferences.items() if key not in REPLY_PREFERENCES}
