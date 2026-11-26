"""#2810 — ce qu'on garde d'une extraction d'entité, et ce qu'on refuse.

Même patron que ``chat_thread_title.py`` (#1911.1), deux étages qui ne font
pas la même chose :

1. ``clean_entity`` NETTOIE la forme — guillemets, retours ligne, préfixe
   « Entreprise : », point final. Rien n'y change le sens.
2. ``accept_entity`` REFUSE le fond, sans jamais le corriger : un nom qui
   n'est pas recopié MOT POUR MOT de la phrase tapée vaut ``None``. La phrase
   garde alors son texte intégral côté appelant — jamais un nom deviné.

Pourquoi refuser plutôt que réparer : un nom d'entreprise mal extrait qui
atterrit dans `/search?company=` lance une recherche sur une cible que
personne n'a demandée. « Rien qui ne soit dans la phrase » est une règle du
prompt (bellum_search_entity_extract) ; ici, c'est sa vérification.
"""

from __future__ import annotations

import re
import unicodedata

_LABEL = re.compile(r"^\s*(?:entreprise|company|cible|target)\s*[:：\-–—]\s*", re.IGNORECASE)
_WRAPPERS = "\"'«»“”„‘’`*_#"
_TRAILING = " .;:,!…"

#: Une réponse plus longue que ça n'est plus « un nom », c'est une phrase que
#: le modèle a recopiée en entier — on la refuse plutôt que de la tronquer.
ENTITY_MAX_CHARS = 120


def clean_entity(raw: str) -> str:
    """La forme seule : première ligne utile, sans habillage."""
    line = next((candidate.strip() for candidate in (raw or "").splitlines() if candidate.strip()), "")
    line = _LABEL.sub("", line)
    line = " ".join(line.split())
    for _ in range(2):  # « **BPCE** » ou « "BPCE." » : l'habillage s'imbrique
        line = line.strip(_WRAPPERS).strip().rstrip(_TRAILING).strip()
    return line


def _fold(text: str) -> str:
    """Casse et accents pliés — « Société », « SOCIETE » et « societe » sont le même mot."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(char for char in decomposed if not unicodedata.combining(char)).casefold()


def accept_entity(entity: str, source_text: str) -> str | None:
    """Le nom s'il est ANCRÉ dans la phrase tapée, ``None`` sinon.

    Ancré = recopié tel quel (casse et accents pliés) : le modèle a le droit
    de couper la phrase autour du nom, jamais d'en changer une lettre ni d'en
    inventer un absent du texte. Une chaîne vide (rien à extraire, refus
    explicite du prompt) rend ``None`` — pas une chaîne vide propagée plus
    loin, qui se lirait comme une entreprise nommée « ».
    """
    if not entity or len(entity) > ENTITY_MAX_CHARS:
        return None
    if _fold(entity) not in _fold(source_text or ""):
        return None
    return entity


__all__ = ["ENTITY_MAX_CHARS", "accept_entity", "clean_entity"]
