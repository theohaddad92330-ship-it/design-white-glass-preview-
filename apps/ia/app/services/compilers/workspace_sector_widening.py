"""#4288.1 (#3905.5, décision Louis 29/10) — l'étape ESPACE de la cascade élargit par PALIERS NOMMÉS.

« Propose-moi 3 comptes dans l'industrie » : l'espace ne rend rien sur ``industrie`` → le CODE passe au palier
voisin du référentiel partagé (``sector_widening_tiers`` : 1 = voisins directs, 2 = le reste du groupe), le NOMME,
et ne rend que des comptes dont LE SECTEUR (celui qu'ils portent, jamais la requête qui les a ramenés) appartient
à un secteur du palier. Le modèle n'improvise plus de voisin : « l'énergie » n'est pas un voisin de l'industrie.

Ordre de la cascade inchangé (espace → API → web en dernier) ; ce module ne touche que la marche « espace ».
Un secteur que le référentiel ne sait pas lire n'est jamais élargi : on n'invente pas de voisin.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Awaitable, Callable, Mapping
from typing import Any

from app.services.application_sectors import APPLICATION_SECTOR_LABELS_FR
from app.services.criteria_referential import sector_widening_tiers

#: Une requête du pont d'espace par mot de libellé (bornée) : un palier ne coûte jamais plus que ça.
MAX_WORDS_PER_SECTOR = 2

#: Mots de liaison ou trop génériques pour discriminer un secteur dans un texte libre.
_NEUTRAL = frozenset({"pour", "avec", "services", "service", "tech", "autres", "autre", "production", "secteur"})


def sector_words_of_label(label: str) -> list[str]:
    """Les mots significatifs d'un libellé (accents conservés, ≥ 5 lettres), le plus long d'abord."""
    words = [w for w in re.findall(r"[^\W_]+", label) if len(w) >= 5 and w.casefold() not in _NEUTRAL]
    return sorted(dict.fromkeys(words), key=lambda w: -len(w))


SectorFetch = Callable[[str], Awaitable[list[Mapping[str, Any]]]]


def _fold(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def asked_sectors(sector_text: str) -> list[str]:
    """Les secteurs partagés que le texte demandé nomme ; ``[]`` quand le référentiel ne sait pas le lire."""
    from app.services.discover_request_reading import read_request

    return [code for code in read_request(sector_text).activities if code in APPLICATION_SECTOR_LABELS_FR]


def row_belongs_to(row_sector: object, code: str) -> bool:
    """Vrai quand le secteur PORTÉ par un compte se lit comme ``code`` — un mot de ce secteur, jamais la requête."""
    from app.services.discover_request_reading import read_request

    return any(code in read_request(token).activities for token in re.findall(r"[^\W_]+", _fold(row_sector)))


async def widen_workspace_sector(sector_text: str, fetch: SectorFetch, *, limit: int) -> dict[str, Any] | None:
    """Le premier palier voisin qui rend des comptes de l'espace, ou ``{"tried": [...]}`` quand aucun n'en rend.

    ``None`` : rien à élargir (secteur illisible, ou pas de palier). Sinon ``{"tier", "sectors", "accounts"}``
    (chaque compte porte ``widened`` et ``palier``) ou ``{"tried": [libellés]}``."""
    asked = asked_sectors(sector_text)
    if not asked:
        return None
    tiers = sector_widening_tiers(asked)
    if not tiers:
        return None
    tried: list[str] = []
    for tier, codes in tiers:
        found: dict[str, dict[str, Any]] = {}
        hit: list[str] = []
        for code in codes:
            label = APPLICATION_SECTOR_LABELS_FR[code]
            tried.append(label)
            for word in sector_words_of_label(label)[:MAX_WORDS_PER_SECTOR]:
                for row in await fetch(word):
                    key = str(row.get("account_id") or row.get("name") or "")
                    if not key or key in found or not row_belongs_to(row.get("sector"), code):
                        continue
                    found[key] = {**row, "widened": f"secteur voisin : {label.lower()}", "palier": tier}
                    if label not in hit:
                        hit.append(label)
        if found:
            return {"tier": tier, "sectors": hit, "accounts": list(found.values())[:limit]}
    return {"tried": list(dict.fromkeys(tried))}


def palier_line(sector_text: str, widening: Mapping[str, Any]) -> str:
    """La phrase du palier, posée AVANT la liste : ce qui a été cherché, le palier atteint, les secteurs nommés."""
    sectors = ", ".join(str(s) for s in widening.get("sectors") or [])
    count = len(widening.get("accounts") or [])
    return (
        f"Rien dans ton espace sur « {sector_text} » : j'ai élargi au palier {widening.get('tier')} "
        f"(secteurs voisins : {sectors}) — {count} compte{'' if count == 1 else 's'}."
    )
