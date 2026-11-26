"""#3444 (recette prod 02/10) — une objection de prospect se répond avec le texte APPROUVÉ.

L'outil ``search_content_library`` rend déjà le texte verbatim, mais le modèle ne
l'appelle pas (réponse libre, ou ``ask_clarification`` sur « mauvaise expérience
ESN ») : un outil disponible ne garantit rien. Même geste que ``explicit_question_first`` :
sur une phrase de prospect qui retrouve une objection de la bibliothèque, la
consigne porte le texte verbatim, la clarification est retirée, et la réponse
finale est GARANTIE de porter le texte et la règle d'or. Hors corpus : rien
n'est ajouté, rien n'est deviné.
"""

from __future__ import annotations

import re
from typing import Any

from app.knowledge.content_library import retrieve_content_library

_MAX_WORDS = 25
#: Une phrase de PROSPECT (objection), pas une demande de Laura : sans cette forme,
#: un mot comme « budget » dans une question d'analyse ramènerait une réponse d'appel.
_PROSPECT_CUE = re.compile(
    r"\b(?:je\s+ne\s+suis\s+pas|je\s+n['’]ai\s+pas|j['’]ai\s+pas|on\s+n['’]a|on\s+ne\s+|on\s+a\s+(?:d[ée]j[àa]|eu)|"
    r"nous\s+(?:n['’]avons|ne\s+|g[ée]rons|avons)|il\s+y\s+a\s+des|envoyez|rappelez|"
    r"votre\s+tjm|c['’]est\s+une\s+question|o[ùu]\s+avez[\s-]+vous|[êe]tes[\s-]+vous\s+r[ée]f[ée]renc|"
    r"mauvaises?\s+exp[ée]riences?|trop\s+(?:cher|[ée]lev[ée]))",
    re.IGNORECASE,
)
_RULE = "valider l'objection, rebondir avec une question, identifier la vraie raison sous-jacente"


def approved_objection_for(message: str | None) -> dict[str, Any] | None:
    text = (message or "").strip()
    if not text or len(text.split()) > _MAX_WORDS or not _PROSPECT_CUE.search(text):
        return None
    entries = retrieve_content_library(kind="objection_response", query=text)
    return entries[0] if entries else None


def approved_objection_note(message: str | None) -> str:
    entry = approved_objection_for(message)
    if not entry:
        return ""
    return (
        "\n\nCETTE PHRASE EST UNE OBJECTION DE PROSPECT DÉJÀ TRAITÉE DANS LA BIBLIOTHÈQUE APPROUVÉE (#3444) : "
        "tu ne poses AUCUNE question de clarification (l'outil t'est retiré pour ce tour) et tu ne réécris pas. "
        f"Objection : « {entry['title']} » — réponse approuvée, à citer MOT POUR MOT : « {entry['body']} » "
        f"(compléter seulement les {{{{placeholders}}}} par un fait réel, sinon les nommer). "
        f"Cite la règle d'or : {_RULE}. Conditions d'usage : {' ; '.join(entry.get('conditions') or [])}."
    )


_CLOSING_QUOTE = re.compile(r"[\s\u00a0\u202f]*»")


def _body_pattern(body: str) -> re.Pattern[str]:
    """Le texte approuvé ENTIER, à l'apostrophe et à l'espacement près — jamais ses 40 premiers signes :
    une paraphrase qui reprend l'attaque de la phrase n'est pas le verbatim (#3444, Y14 02/10)."""
    tokens = [re.escape(token).replace("’", "['’]").replace("'", "['’]") for token in body.split()]
    return re.compile(r"\s+".join(tokens), re.IGNORECASE)


def _normalise_apostrophes(text: str) -> str:
    return text.replace("’", "'").lower()


def ensure_approved_objection(reply: str, message: str | None) -> str:
    """La réponse porte TOUJOURS le format « Réponse approuvée : « … » » + « Règle d'or : … » — jamais
    doublé. Texte approuvé déjà cité tel quel mais sans libellé : on le range sous « Réponse approuvée » ;
    paraphrase ou absent : le texte entier est ajouté ; règle d'or déjà en phrase : on n'en ajoute pas une
    seconde (Y14 02/10 : le garde-fou sur 40 signes laissait passer la paraphrase et le texte sans libellé)."""
    entry = approved_objection_for(message)
    if not entry or not (reply or "").strip():
        return reply
    body = entry["body"]
    out = reply.rstrip()
    match = _body_pattern(body).search(out)
    labelled = "réponse approuvée" in out.lower()
    if match and not labelled:
        start = out.rfind("«", 0, match.start())
        quoted = start != -1 and not out[start + 1 : match.start()].strip()
        before = out[: start if quoted else match.start()]
        after = out[match.end() :]
        # « ? » : l'espace (insécable ou fine) avant le guillemet fermant ne le rend pas absent (#3444, Y18).
        closing = _CLOSING_QUOTE.match(after) if quoted else None
        after = after[closing.end() :] if closing else after
        out = f"{before}Réponse approuvée : « {body} »{after}"
    elif not match:
        out = f"{out}\n\nRéponse approuvée : « {body} »"
    if not re.search(r"règle d'or\s*:", _normalise_apostrophes(out)):
        out = f"{out}\nRègle d’or : {_RULE}."
    return out
