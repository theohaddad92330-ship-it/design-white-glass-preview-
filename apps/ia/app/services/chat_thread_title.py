"""#1911.1 — ce qu'on garde d'un titre rédigé par le modèle, et ce qu'on refuse.

Le modèle rend du texte libre. Deux étages, et ils ne font pas la même chose :

1. ``clean_title`` NETTOIE la forme — guillemets, retours ligne, préfixe
   « Titre : », point final, 60 caractères. Rien n'y change le sens.
2. ``accept_title`` REFUSE le fond, sans jamais le corriger : un titre qui nomme
   un éditeur de logiciel, ou un nom propre / un chiffre que les messages ne
   contiennent pas, vaut ``None``. Le fil garde alors son premier message — les
   mots du commercial, jamais un titre deviné.

Pourquoi refuser plutôt que réparer : retirer « Airbus » d'un titre inventé
laisserait une phrase bancale ET la trace d'une invention. « Rien qui ne soit
dans les messages » est une règle du prompt ; ici, c'est sa vérification.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence

from app.prompts.bellum_chat_title import TITLE_FORBIDDEN_VENDORS

#: La longueur d'un titre rédigé par Laura. Un titre saisi à la main peut aller
#: jusqu'à 120 (`CHAT_THREAD_TITLE_MAX_LENGTH`, @bellum/contracts) : la colonne
#: fait 240 px, deux lignes tronquées — Laura vise une ligne.
TITLE_MAX_CHARS = 60

_LABEL = re.compile(r"^\s*(?:titre|title)\s*[:：\-–—]\s*", re.IGNORECASE)
_WRAPPERS = "\"'«»“”„‘’`*_#"
_TRAILING = " .;:,!…"
_TOKEN = re.compile(r"[\w’'-]+", re.UNICODE)
_VENDOR_PATTERNS = tuple(
    re.compile(rf"(?<![\w-])(?:{re.escape(vendor)}|{re.escape(vendor.upper())})(?![\w-])")
    for vendor in TITLE_FORBIDDEN_VENDORS
)


def clean_title(raw: str) -> str:
    """La forme seule : première ligne utile, sans habillage, bornée à 60."""
    line = next((candidate.strip() for candidate in (raw or "").splitlines() if candidate.strip()), "")
    line = _LABEL.sub("", line)
    line = " ".join(line.split())
    for _ in range(2):  # « **Titre** » ou « "Titre." » : l'habillage s'imbrique
        line = line.strip(_WRAPPERS).strip().rstrip(_TRAILING).strip()
    if len(line) <= TITLE_MAX_CHARS:
        return line
    head = line[: TITLE_MAX_CHARS + 1]
    space = head.rfind(" ")
    # Couper sur un mot ; un seul mot géant se coupe à la lettre plutôt que de
    # rendre un titre de trois caractères.
    cut = head[:space] if space >= TITLE_MAX_CHARS // 3 else line[:TITLE_MAX_CHARS]
    return cut.rstrip(" -–—,;:").strip()


def _fold(text: str) -> str:
    """Casse et accents pliés — « Lyon », « LYON » et « lyon » sont le même mot."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(char for char in decomposed if not unicodedata.combining(char)).casefold()


def _names_something(token: str, *, first: bool) -> bool:
    """Ce jeton désigne-t-il une chose précise (nom propre, sigle, chiffre) ?

    La majuscule du PREMIER mot est grammaticale (« Prioriser mes comptes »),
    sauf s'il est tout en capitales (« SNCF »). Ailleurs, une capitale nomme.
    """
    if any(char.isdigit() for char in token):
        return True
    letters = [char for char in token if char.isalpha()]
    if len(letters) >= 2 and all(char.isupper() for char in letters):
        return True
    return not first and any(char.isupper() for char in token)


def accept_title(title: str, messages: Sequence[Mapping[str, str]]) -> str | None:
    """Le titre s'il tient, ``None`` sinon — jamais une version réparée."""
    if not title:
        return None
    if any(pattern.search(title) for pattern in _VENDOR_PATTERNS):
        return None
    source = _fold(" ".join(str(message.get("content") or "") for message in messages))
    for index, token in enumerate(_TOKEN.findall(title)):
        if _names_something(token, first=index == 0) and _fold(token.strip("’'-")) not in source:
            return None
    return title


__all__ = ["TITLE_MAX_CHARS", "accept_title", "clean_title"]
