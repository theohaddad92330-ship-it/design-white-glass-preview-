"""#2433.12 (épopée #2876, lot P02 09/10) — LE LOCALISEUR D'OBJETS d'une image du chat.

Décision Louis 09/10 : `vision_regions` localise des CITATIONS de texte ; recadrer
suppose les BORDS du document, détecter un tableau sa GRILLE. L'union des zones
de texte n'est pas un bord (elle rognerait marges, tampons, signatures) — ce
serait deviner. D'où ce second appel de vision, dédié et BORNÉ : un par image
jointe (appelé une fois par `/rag/extract`, jamais en boucle), `max_tokens` fixe,
grille plafonnée.

Règles :
- jamais de recadrage deviné : des bords invalides (hors image, vides, non
  numériques, image entière) sont ÉCARTÉS — l'image reste entière ;
- une cellule vide reste VIDE (`None`, #2433.5), jamais « 0 », jamais inventée ;
- une panne rend `None` (rien mesuré), distinct de `{"document_bounds": None,
  "table": None}` (mesuré, rien trouvé) : seul le second autorise l'écran à dire
  « bords non détectés ».
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.claude_service import call_claude_image_text
from app.services.model_policy import model_for
from app.services.vision_regions import _parse_json_object, parse_region

logger = logging.getLogger(__name__)

PROMPT_NAME = "vision_object_locate"

#: Lot M10 — l'étiquette `provider_costs.tool` du localiseur (`cost_ledger.bind_tool`),
#: posée par son seul appelant (`/rag/extract`).
COST_TOOL = "chat_image_objects"

#: Une grille de 30 × 10 cellules courtes tient dans ce budget ; au-delà, la
#: réponse serait tronquée et illisible — on borne la grille AVANT, dans le prompt.
MAX_TOKENS = 1600
TABLE_MAX_ROWS = 30
TABLE_MAX_COLS = 10
_CELL_MAX_CHARS = 120

_SYSTEM_PROMPT = f"""Tu LOCALISES des objets dans une image, tu ne l'interprètes pas.

Rends deux choses, en coordonnées normalisées entre 0 et 1, origine en haut à \
gauche (x, y = coin haut-gauche ; w, h = largeur, hauteur) :

1. "document" : le plus petit rectangle qui contient le DOCUMENT photographié \
ou scanné (feuille, ticket, écran), marges, tampons et signatures compris. Si \
le document occupe déjà toute l'image ou si ses bords ne sont pas visibles avec \
certitude, mets null — ne devine jamais un bord.

2. "table" : s'il y a un TABLEAU visible, sa zone ("bounding_box") et sa grille \
("rows") : une liste de lignes, chaque ligne une liste de cellules, texte \
recopié tel quel. Une cellule vide vaut null — jamais 0, jamais une valeur \
supposée. Au plus {TABLE_MAX_ROWS} lignes et {TABLE_MAX_COLS} colonnes. Sans \
tableau, mets null.

Ne décris jamais une personne. Rends UNIQUEMENT un objet JSON \
{{"document": {{"x": …, "y": …, "w": …, "h": …}} | null, "table": \
{{"bounding_box": {{…}} | null, "rows": [[…]]}} | null}}, sans commentaire."""


def _parse_cell(raw: Any) -> str | None:
    """Une cellule LUE en texte, ou `None` (vide). Un booléen n'est pas une lecture."""
    if isinstance(raw, bool) or raw is None:
        return None
    if isinstance(raw, (int, float)):
        return str(raw)
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    return text[:_CELL_MAX_CHARS] if text else None


def parse_table(raw: Any) -> dict[str, Any] | None:
    """Une grille d'au moins 2 lignes × 2 colonnes, ou `None`."""
    if not isinstance(raw, dict) or not isinstance(raw.get("rows"), list):
        return None
    rows: list[list[str | None]] = []
    for raw_row in raw["rows"][:TABLE_MAX_ROWS]:
        if isinstance(raw_row, list):
            rows.append([_parse_cell(cell) for cell in raw_row[:TABLE_MAX_COLS]])
    rows = [row for row in rows if any(cell is not None for cell in row)]
    width = max((len(row) for row in rows), default=0)
    if len(rows) < 2 or width < 2:
        return None
    # Une ligne courte se complète par des cellules VIDES, jamais par des valeurs.
    grid = [row + [None] * (width - len(row)) for row in rows]
    return {"bounding_box": parse_region(raw.get("bounding_box")), "rows": grid}


async def locate_objects(image_bytes: bytes, media_type: str) -> dict[str, Any] | None:
    """`{"document_bounds", "table"}` mesurés, ou `None` sur panne. Ne lève jamais."""
    try:
        reply, _usage = await call_claude_image_text(
            image_bytes,
            media_type,
            model=model_for(PROMPT_NAME),
            max_tokens=MAX_TOKENS,
            prompt_name=PROMPT_NAME,
            system_prompt=_SYSTEM_PROMPT,
            instruction="Localise le document et le tableau de cette image.",
        )
    except Exception as exc:  # noqa: BLE001 — la localisation est un bonus, jamais une panne
        logger.warning("Localisation d'objets indisponible : %s", type(exc).__name__)
        return None
    payload = _parse_json_object(reply)
    if not payload:
        return None
    return {"document_bounds": parse_region(payload.get("document")), "table": parse_table(payload.get("table"))}
