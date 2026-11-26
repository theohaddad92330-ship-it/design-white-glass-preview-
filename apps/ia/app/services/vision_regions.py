"""#2433.4 — LA PREUVE VISUELLE : où, dans l'image, un champ a été lu.

`source_excerpt` est une citation TEXTE ; pour une image (photo de ticket,
scan), l'utilisateur veut voir la ZONE. Un second appel de vision, borné aux
champs DÉJÀ lus et validés, rend pour chaque citation un rectangle normalisé
(0..1, origine en haut à gauche).

Règles :
- une zone invalide (hors image, vide, non numérique, image entière) est
  ÉCARTÉE, jamais corrigée en une zone plausible ;
- une panne de localisation ne fait jamais échouer la lecture : le champ
  reste lu, sans zone — la citation texte demeure sa preuve ;
- aucune zone pour un champ absent (on n'affiche pas ce qu'on n'a pas).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.services.claude_service import call_claude_image_text
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)

PROMPT_NAME = "vision_region_locate"

_EPS = 1e-6

_SYSTEM_PROMPT = """Tu LOCALISES du texte dans une image, tu ne l'interprètes pas.

On te donne des citations (clé → texte exact). Pour chacune, rends le plus \
petit rectangle de l'image qui contient ce texte, en coordonnées normalisées \
entre 0 et 1, origine en haut à gauche : x, y (coin haut-gauche), w, h \
(largeur, hauteur).

Si une citation n'est pas visible avec certitude, OMETS sa clé — ne devine \
jamais une zone. Ne décris jamais une personne. Rends UNIQUEMENT un objet JSON \
{"<clé>": {"x": …, "y": …, "w": …, "h": …}}, sans commentaire."""


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def parse_region(raw: Any) -> dict[str, float] | None:
    """Rectangle normalisé valide, ou `None`. L'image entière ne prouve rien."""
    if not isinstance(raw, dict):
        return None
    values = [raw.get(k) for k in ("x", "y", "w", "h")]
    if not all(_is_number(v) for v in values):
        return None
    x, y, w, h = (float(v) for v in values)
    if x < 0 or y < 0 or w <= 0 or h <= 0:
        return None
    if x + w > 1 + _EPS or y + h > 1 + _EPS:
        return None
    if w >= 1 - _EPS and h >= 1 - _EPS:
        return None
    return {"x": x, "y": y, "w": w, "h": h}


def _parse_json_object(text: str) -> dict[str, Any]:
    """Du premier `{` au dernier `}` — comme le reste du dépôt."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return {}
    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


async def locate(
    image_bytes: bytes, media_type: str, excerpts: dict[str, str]
) -> tuple[dict[str, dict[str, float]], float | None]:
    """`(zones par clé, coût)` — ne lève jamais. Coût `None` = pas d'appel ou tarif inconnu."""
    asked = {key: text for key, text in excerpts.items() if text}
    if not asked:
        return {}, None
    try:
        reply, usage = await call_claude_image_text(
            image_bytes,
            media_type,
            model=model_for(PROMPT_NAME),
            max_tokens=400,
            prompt_name=PROMPT_NAME,
            system_prompt=_SYSTEM_PROMPT,
            instruction="Citations à localiser :\n" + json.dumps(asked, ensure_ascii=False),
        )
    except Exception as exc:  # noqa: BLE001 — la localisation est un bonus, jamais une panne
        logger.warning("Localisation visuelle indisponible : %s", exc)
        return {}, None
    cost = usage.cost_usd if usage is not None and usage.cost_known else None
    payload = _parse_json_object(reply)
    regions: dict[str, dict[str, float]] = {}
    for key in asked:
        region = parse_region(payload.get(key))
        if region is not None:
            regions[key] = region
    return regions, cost


#: #2433.4 (épopée #2876, lot M10 09/10) — les lignes d'une image du CHAT que
#: l'on localise. Borné : la réponse tient dans `max_tokens=400` de `locate`
#: (~40 jetons par zone), et un second appel de vision coûte — il ne porte que
#: les premières lignes lues, celles qu'une citation reprend le plus souvent.
CHAT_IMAGE_MAX_LINES = 8
_CHAT_IMAGE_LINE_MAX_CHARS = 160


async def locate_lines(image_bytes: bytes, media_type: str, text: str) -> list[dict[str, Any]]:
    """#2433.4 — la citation visuelle d'une image jointe au chat : pour chaque
    ligne LUE (jamais une ligne vide), la zone où elle se trouve —
    ``[{"quote": …, "bounding_box": {x, y, w, h}}]``, dans l'ordre de lecture.

    Même primitif que le justificatif (`locate`) : une zone invalide est
    écartée, une panne rend ``[]`` — la lecture, elle, reste entière."""
    lines: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if line and line not in lines and len(line) <= _CHAT_IMAGE_LINE_MAX_CHARS:
            lines.append(line)
        if len(lines) >= CHAT_IMAGE_MAX_LINES:
            break
    if not lines:
        return []
    excerpts = {f"L{index}": line for index, line in enumerate(lines, start=1)}
    regions, _cost = await locate(image_bytes, media_type, excerpts)
    return [
        {"quote": excerpts[key], "bounding_box": regions[key]}
        for key in excerpts
        if key in regions
    ]
