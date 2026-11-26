"""#4438.3 (recette prod 22/10) — « Trouve-moi 10 comptes aéronautique à Toulouse » : la carte listait 10 comptes,
l'intro disait « ne permet pas de confirmer 10 comptes ». La prose ne contredit JAMAIS la carte.

Le décompte qui fait foi est celui de la carte (``account_ranking``) : c'est ce que la personne voit. Une phrase de
la PROSE qui nie ou réduit ce nombre (« ne permet pas de confirmer 10 comptes », « seulement 6 comptes », « seules 8
entreprises sur 10 ») est retirée ; tout le reste revient à l'octet. Les cartes ne sont jamais touchées, et une
phrase qui ne parle pas d'un nombre de comptes non plus (la garde sait dire NON)."""

from __future__ import annotations

import re

from app.services.reply_blocks import split_reply_blocks

_NOUN = r"(?:comptes?|entreprises?|soci[ée]t[ée]s?|r[ée]sultats?)"
# « ne permet pas de confirmer 10 comptes », « je n'ai pas pu confirmer 10 entreprises », « impossible de garantir 10 comptes ».
_CANNOT_CONFIRM = re.compile(
    r"(?:ne\s+(?:me\s+|vous\s+|te\s+)?permet(?:tent)?\s+pas|n['’]ai\s+pas\s+pu|n['’]est\s+pas\s+possible|impossible)"
    r"\s+(?:d['’]|de\s+)?(?:confirmer|garantir|atteindre|trouver|fournir|rendre|livrer|valider)\s+(?:les\s+|ces\s+)?"
    rf"(?P<n>\d+)\s+{_NOUN}",
    re.IGNORECASE,
)
# « seulement 6 comptes », « uniquement 4 entreprises », « seules 8 entreprises sur 10 », « je n'ai trouvé que 3 comptes ».
_ONLY = re.compile(
    rf"(?:\bseulement\b|\buniquement\b|\bseule?s?\b|\bque\b)\s+(?P<n>\d+)\s+{_NOUN}",
    re.IGNORECASE,
)
_SENTENCE_END = re.compile(r"(?<=[.!?…])\s+")


def _card_count(reply: str) -> int:
    return sum(
        len(segment.block.get("items") or [])
        for segment in split_reply_blocks(reply)
        if segment.kind == "block" and segment.block and segment.block.get("type") == "account_ranking"
    )


def _contradicts(sentence: str, shown: int) -> bool:
    cannot = _CANNOT_CONFIRM.search(sentence)
    if cannot and int(cannot.group("n")) <= shown:
        return True
    only = _ONLY.search(sentence)
    return bool(only and int(only.group("n")) < shown)


def drop_prose_contradicting_cards(reply: str) -> str:
    """Retire de la prose les phrases qui nient ou réduisent le nombre de comptes que la carte liste."""
    if not reply or "```" not in reply:
        return reply
    shown = _card_count(reply)
    if shown == 0:
        return reply
    out: list[str] = []
    in_fence = False
    changed = False
    for line in reply.split("\n"):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            out.append(line)
            continue
        if in_fence or not line.strip():
            out.append(line)
            continue
        kept = [s for s in _SENTENCE_END.split(line) if not _contradicts(s, shown)]
        if len(kept) == len(_SENTENCE_END.split(line)):
            out.append(line)
            continue
        changed = True
        if kept:
            out.append(" ".join(kept))
    if not changed:
        return reply
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip("\n")


# ---------------------------------------------------------------------------------------------------------------------
# #4631 (recette prod 26/10) — la prose promet une liste que l'écran ne rend pas.
# « 10 employeurs avec une offre de Business Developer datée » : 0 table, 0 carte. « Les autres comptes ci-dessous » :
# rien dessous. Le décompte qui fait foi est celui de ce qui est RENDU (cartes, tableaux, puces) ; quand rien n'est
# rendu, la phrase qui annonce le volume est remplacée par une ligne qui DIT qu'aucune liste n'est affichée.
# ---------------------------------------------------------------------------------------------------------------------
_PLURAL_NOUN = (
    r"(?:comptes|entreprises|soci[ée]t[ée]s|employeurs|clients|prospects|cibles|accounts|companies|employers|prospects)"
)
# « J'ai trouvé 10 employeurs », « Voici 5 comptes », « 10 employeurs avec une offre… », « I found 10 employers ».
_ANNOUNCE_COUNT = re.compile(
    rf"(?:(?:j['’]ai|je\s+(?:te\s+)?(?:propose|liste|pr[ée]sente)|voici|il\s+y\s+a|i\s+(?:found|have)|here\s+are|there\s+are)"
    rf"[^.!?\n]{{0,40}}?)?(?<![\d.,])\b(?P<n>\d{{1,3}})\s+{_PLURAL_NOUN}\b",
    re.IGNORECASE,
)
_ANNOUNCE_VERB = re.compile(
    r"(?:j['’]ai\s+(?:trouv|retenu|identifi|relev|rep[ée]r)|je\s+(?:te\s+)?(?:propose|liste|pr[ée]sente)|\bvoici\b"
    r"|il\s+y\s+a\b|i\s+(?:found|have|identified)|here\s+are|there\s+are)",
    re.IGNORECASE,
)
# « les autres comptes ci-dessous », « the accounts below ».
_POINTS_BELOW = re.compile(
    rf"{_PLURAL_NOUN}[^.!?\n]{{0,40}}?(?:ci-dessous|ci-apr[èe]s|suivants?|\bbelow\b|\bfollowing\b)", re.IGNORECASE
)
_BULLET = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+\S")
_TABLE_ROW = re.compile(r"^\s*\|.+\|\s*$")
_TABLE_SEPARATOR = re.compile(r"^\s*\|?\s*:?-{3,}")
_NO_LIST = {
    "fr": "Aucune liste de comptes n'est affichée dans cette réponse : le volume annoncé n'est pas établi.",
    "en": "No list of accounts is displayed in this answer: the volume announced is not established.",
}


def _rendered_rows(reply: str) -> int:
    """Lignes de liste réellement RENDUES : éléments de cartes, lignes de tableau, puces (hors blocs de code)."""
    rows = _card_count(reply)
    in_fence = False
    for line in reply.split("\n"):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if _BULLET.match(line) or (_TABLE_ROW.match(line) and not _TABLE_SEPARATOR.match(line)):
            rows += 1
    return rows


def _promises_list(sentence: str) -> bool:
    count = _ANNOUNCE_COUNT.search(sentence)
    if count and int(count.group("n")) >= 2 and _ANNOUNCE_VERB.search(sentence) is None:
        # « 10 employeurs avec une offre… » : un nombre de comptes en tête de phrase annonce sa liste.
        return sentence.lstrip().lower().startswith(count.group(0).lower().lstrip())
    if count and int(count.group("n")) >= 2:
        return True
    return _POINTS_BELOW.search(sentence) is not None


def drop_prose_promising_missing_list(reply: str, *, language: str = "fr") -> str:
    """Remplace la phrase qui annonce N comptes (ou « ci-dessous ») quand RIEN n'est rendu : la prose ne promet rien."""
    if not reply or _rendered_rows(reply) > 0:
        return reply
    said = _NO_LIST["en" if language.lower().startswith("en") else "fr"]
    out: list[str] = []
    in_fence = False
    replaced = False
    for line in reply.split("\n"):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            out.append(line)
            continue
        if in_fence or not line.strip():
            out.append(line)
            continue
        parts = _SENTENCE_END.split(line)
        if not any(_promises_list(p) for p in parts):
            out.append(line)
            continue
        kept: list[str] = []
        for part in parts:
            if not _promises_list(part):
                kept.append(part)
            elif not replaced:
                kept.append(said)
                replaced = True
        out.append(" ".join(kept))
    return "\n".join(out) if replaced else reply
