"""#2433.12 — remettre une photo À L'ENDROIT avant qu'on la lise.

Un téléphone tenu de côté enregistre les pixels tels quels et pose seulement
une ÉTIQUETTE d'orientation (EXIF). Le navigateur la respecte — l'utilisateur
voit le ticket droit — mais le modèle, lui, lisait les pixels bruts : un ticket
couché, des zones de lecture qui ne tombent pas sur l'image affichée.

Seule cette étiquette est lue : on ne devine RIEN sur les pixels (pas de
détection d'inclinaison, pas de recadrage inventé). Image déjà droite, sans
étiquette, ou qui n'en est pas une : renvoyée IDENTIQUE, jamais une exception.
"""

from __future__ import annotations

import io
import logging

from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger(__name__)

_EXIF_ORIENTATION = 0x0112
_UPRIGHT = 1


def upright(data: bytes) -> tuple[bytes, bool]:
    """`(octets, tourné)` — les octets remis droits si l'appareil le demandait."""
    if not data:
        return data, False
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.getexif().get(_EXIF_ORIENTATION, _UPRIGHT) == _UPRIGHT:
                return data, False
            image_format = image.format or "JPEG"
            turned = ImageOps.exif_transpose(image)
            if turned is None:
                return data, False
            buffer = io.BytesIO()
            turned.save(buffer, format=image_format)
            return buffer.getvalue(), True
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        # Pas une image, ou une image que Pillow ne sait pas réécrire : on la
        # lit telle quelle, comme avant ce correctif.
        logger.info("Orientation d'image non corrigée : octets laissés intacts")
        return data, False
