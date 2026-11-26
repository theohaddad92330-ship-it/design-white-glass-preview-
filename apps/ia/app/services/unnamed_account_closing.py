"""#3443.1 — retire la clôture « donne-moi son nom / contact rattaché au portefeuille »
d'une réponse écrite SANS aucun compte nommé.

`_COLD_CALL_FLOW` (prompts/laura_role_and_voice.py) demande de finir sur l'email ou
la synthèse ; ce filet DÉTERMINISTE couvre le cas où le modèle clôt quand même sur une
demande de compte. Pure : texte entrant, texte sortant, aucun appel.
"""

from __future__ import annotations

import re

# Une phrase qui RÉCLAME le compte : « dès que tu me donnes son nom », « donne-moi le nom
# du compte », ou qui parle d'un contact « rattaché au portefeuille ».
_ASKS_FOR_ACCOUNT = re.compile(
    r"(?:\b(?:d[èe]s\s+que|une\s+fois\s+que|si)\b[^.!?\n]{0,40}\b(?:donn\w+|indiqu\w+|pr[ée]cis\w+|communiqu\w+)\b[^.!?\n]{0,30}\b(?:nom|compte|entreprise|soci[ée]t[ée])\b"
    r"|\b(?:donne|donnez|indique|indiquez|pr[ée]cise|pr[ée]cisez|dis|dites)[-\s]*moi\b[^.!?\n]{0,30}\b(?:nom|compte)\b[^.!?\n]{0,30}\b(?:compte|entreprise|soci[ée]t[ée]|contact|cible)\b"
    r"|\bcontacts?\s+rattach[ée]s?\s+(?:au|à\s+ton|à\s+votre)\s+portefeuille\b"
    r"|\brattach\w+\s+(?:le|ce|au)\s+contact\b[^.!?\n]{0,30}\bportefeuille\b)",
    re.IGNORECASE,
)
_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?…])\s+")


def strip_unnamed_account_closing(reply: str, *, account_named: bool) -> str:
    """La réponse sans sa phrase de clôture qui réclame un compte, quand aucun n'est nommé.

    Ne regarde que le DERNIER paragraphe (la clôture). Gardée telle quelle si un compte
    est nommé ou si le retrait ne laisserait rien.
    """
    if account_named or not reply.strip():
        return reply
    head, sep, last = reply.rstrip().rpartition("\n\n")
    kept = [s for s in _SENTENCE_BOUNDARY.split(last) if not _ASKS_FOR_ACCOUNT.search(s)]
    if len(kept) == len(_SENTENCE_BOUNDARY.split(last)):
        return reply
    rewritten = " ".join(kept).strip()
    out = f"{head}{sep}{rewritten}" if rewritten else head
    return out.rstrip() if out.strip() else reply
