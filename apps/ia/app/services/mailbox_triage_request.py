"""#2770.2 — « traite ma boîte mail, ne rien envoyer » : Laura TRIE, elle ne cadre pas.

Recette prod 12/10 : la demande recevait une question de cadrage alors qu'elle nomme déjà son objet et
sa limite (ne rien envoyer). Même patron que ``explicit_question_first`` : un détecteur sur des formes
EXPLICITES (jamais une devinette), une consigne ajoutée au tour, et l'outil de clarification retiré.

Deux issues, selon la messagerie RÉELLEMENT branchée (``connected_families``) :
- branchée → elle trie directement (non lus / à répondre / à placer ; ce qui ne se place pas sort en
  « Non placé » avec sa raison) ;
- absente → elle le DIT en une phrase, avec le lien pour la connecter.
Dans les deux cas, le copilote prépare, il n'envoie jamais (doctrine).
"""

from __future__ import annotations

import re

_TRIAGE = re.compile(
    r"\b(?:"
    r"(?:traite|trie|triez|traiter|trier)\s+(?:moi\s+)?(?:ma|mes|la|toute\s+ma)\s+(?:bo[iî]te(?:\s+(?:mail|e-?mail|de\s+r[ée]ception))?|messagerie|mails|e-?mails)"
    r"|(?:fais|faire)\s+(?:le|un)\s+tri\s+de\s+(?:ma|mes)\s+(?:bo[iî]te|messagerie|mails)"
    r"|(?:process|triage|sort)\s+(?:through\s+)?my\s+(?:inbox|mailbox|emails?)"
    r")",
    re.IGNORECASE,
)


def asks_to_triage_mailbox(message: str | None) -> bool:
    text = (message or "").strip()
    return bool(text) and bool(_TRIAGE.search(text))


def mailbox_triage_note(*, mailbox_connected: bool) -> str:
    if not mailbox_connected:
        return (
            "\n\nCETTE DEMANDE EST UN TRI DE LA BOÎTE MAIL (#2770.2) mais AUCUNE messagerie n'est "
            "branchée : l'outil de clarification t'est retiré. Tu le dis en UNE phrase, avec le lien pour "
            "la connecter : « Je n'ai pas accès à ta messagerie : [Connecter ta messagerie](/integrations) "
            "et je trie ta boîte. » Tu ne poses aucune question, tu n'inventes aucun message, tu "
            "n'envoies jamais rien."
        )
    return (
        "\n\nCETTE DEMANDE EST UN TRI DE LA BOÎTE MAIL (#2770.2) et la messagerie est branchée : tu TRIES "
        "directement, sans question de cadrage (l'outil de clarification t'est retiré pour ce tour). "
        "Appelle `search_mailbox` (non lus, puis fils sans réponse) et répartis les fils en trois lots : "
        "non lus, à répondre, à placer (à caler dans l'agenda). Ce qui ne peut pas être placé sort sous "
        "« Non placé », avec sa RAISON, une ligne par fil. Tu prépares, tu n'envoies JAMAIS : aucun "
        "message ne part, aucun brouillon n'est déposé sans que la personne le demande."
    )
