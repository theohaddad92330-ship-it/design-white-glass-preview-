"""#4417.1 (FAIL prod 25/10) — « réponds au dernier mail de X » : la réponse était rédigée DANS LE CHAT, sans brouillon.

Le dépôt existe déjà (`prepare_mail_draft` → carte → `PendingActions.tsx` → `mailboxApi.createDraft({threadId})`) ;
la consigne du tour nomme le chemin, retire la clarification, dit OÙ le brouillon part et interdit de recopier la
réponse dans le chat. Doctrine : le copilote n'envoie JAMAIS, il prépare ; le corps du fil ne sort pas du tour.
"""

from __future__ import annotations


def mail_reply_note() -> str:
    return (
        "\n\nCETTE DEMANDE EST UNE RÉPONSE À UN MAIL — RÉPONDRE À UN MAIL (#4417.1). Tu ne poses AUCUNE question "
        "(l'outil de clarification t'est retiré) : `search_mailbox` (`counterpart` = la personne nommée) pour "
        "retrouver le fil, `read_mail_thread` pour le lire, puis `prepare_mail_draft` AVEC le `thread_id` du fil et "
        "`to` = l'ADRESSE `counterpart` rendue par la recherche (jamais un nom). Le brouillon est déposé dans le fil "
        "d'origine, sur le geste du commercial : dis OÙ en une ligne, avec le lien `/mailbox?thread=<thread_id>`. "
        "Tu ne recopies JAMAIS la réponse dans le chat : elle est dans la carte du brouillon, pas dans ton texte. "
        "Tu n'envoies jamais : le commercial envoie. Si le fil est tronqué à la source, dis-le en une phrase."
    )
