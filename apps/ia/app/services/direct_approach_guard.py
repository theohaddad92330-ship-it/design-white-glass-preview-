"""#4060 — jamais de question de REDIRECTION dans un message d'approche DIRECTE.

Quand la demande dit « approche directe » ou que le destinataire est le décideur, on écrit à la
personne elle-même : lui demander « à qui m'adresser chez <entreprise> ? » contredit l'offre
annoncée juste avant (recette prod R13, 15/10 — Cindy Tsai, Head of Finance, décideur
économique). La question d'aiguillage ne sert que pour un contact NON décideur en approche
indirecte (objectif `recommandation`, `message_brief.py`).

La consigne est dans le prompt (`prepare_mail_draft`) ; ce filet est DÉTERMINISTE, pour le cas où
le modèle l'écrit quand même. Pur : texte entrant, texte sortant, aucun appel.
"""

from __future__ import annotations

import re

_DIRECT_REQUEST = re.compile(
    r"\bapproche\s+directe\b|\b(?:mail|e-?mail|message|courriel)\s+direct\b|\bd[ée]cideurs?\b",
    re.IGNORECASE,
)

# Une phrase qui demande vers QUI se tourner : « À qui me conseillez-vous de m'adresser chez X ? »,
# « vers qui dois-je me tourner ? », « pourriez-vous m'orienter vers la bonne personne ? ».
_REDIRECT_PHRASE = (
    r"(?:\bà\s+qui\s+(?:me\s+(?:conseill|recommand|sugg[èe]r)\w+|dois-je|devrais-je|puis-je|faut-il)[^.!?\n]{0,40}\b(?:adresser|tourner|écrire|ecrire|parler)\b"
    r"|\bvers\s+qui\s+(?:me\s+tourner|dois-je|devrais-je|puis-je|m['’]orienter)\b"
    r"|\bqui\s+(?:serait|est)\s+(?:la\s+bonne\s+personne|le\s+bon\s+interlocuteur|l['’]interlocuteur\s+(?:id[ée]al|appropri[ée]))\b"
    r"|\b(?:pourriez|pouvez|auriez)[-\s]vous\b[^.!?\n]{0,40}\bm['’](?:orienter|aiguiller|rediriger|indiquer)\b[^.!?\n]{0,40}\b(?:vers|la\s+bonne|le\s+bon|qui)\b"
    r"|\bsi\s+ce\s+n['’]est\s+pas\s+vous,?\s+(?:qui|vers\s+qui))"
)
_REDIRECT_SENTENCE = re.compile(rf"[ \t]*[^.!?\n]*{_REDIRECT_PHRASE}[^.!?\n]*[?.!…]?", re.IGNORECASE)


def wants_direct_approach(*texts: str | None) -> bool:
    """Vrai si l'un des textes (la demande de la personne) réclame une approche directe ou nomme un décideur."""
    return any(bool(t) and _DIRECT_REQUEST.search(t) for t in texts)


def strip_redirect_question(text: str) -> str:
    """Le texte sans ses phrases de redirection. Gardé tel quel si le retrait ne laisserait rien."""
    if not text or not text.strip():
        return text
    out = _REDIRECT_SENTENCE.sub("", text)
    if out == text:
        return text
    # Pas de ligne vide en trop là où la phrase a été retirée.
    out = re.sub(r"[ \t]+\n", "\n", out)
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    return out if out else text


def strip_redirect_question_when_direct(reply: str, *, user_message: str | None, direct: bool = False) -> str:
    """Applique le retrait seulement si la demande est directe (ou si l'appelant a déclaré `direct`)."""
    if not (direct or wants_direct_approach(user_message)):
        return reply
    return strip_redirect_question(reply)
