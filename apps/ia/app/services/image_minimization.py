"""#2433.9 — minimiser une image avant qu'elle parte vers un fournisseur externe.

Lire un ticket ou une capture n'exige que les PIXELS. Les métadonnées embarquées
(position GPS, modèle d'appareil, date de prise de vue, auteur, commentaires)
identifient une personne sans aider la lecture : elles ne sortent pas.

Tranche minimale, déterministe : on retire les métadonnées, on ne masque rien
dans les pixels (aucune détection de visage ou de texte n'est devinée). Une
image sans métadonnée, un PDF ou des octets quelconques : renvoyés IDENTIQUES,
jamais une exception.
"""

from __future__ import annotations

import io
import logging

from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger(__name__)

_META_KEYS = ("exif", "xmp", "XML:com.adobe.xmp", "comment", "photoshop", "text")


def _carries_metadata(image: Image.Image) -> bool:
    if image.getexif():
        return True
    info = image.info or {}
    # PNG : les blocs texte arrivent sous leur propre clé (Author, Comment…).
    textual = getattr(image, "text", None)
    return bool(textual) or any(key in info for key in _META_KEYS)


def minimized(data: bytes) -> tuple[bytes, bool]:
    """`(octets, nettoyé)` — l'image remise droite et SANS métadonnée si elle en portait."""
    if not data:
        return data, False
    try:
        with Image.open(io.BytesIO(data)) as image:
            if not _carries_metadata(image):
                return data, False
            image_format = image.format or "JPEG"
            straight = ImageOps.exif_transpose(image) or image
            clean = straight.copy()
            clean.info = {}
            buffer = io.BytesIO()
            clean.save(buffer, format=image_format)
            return buffer.getvalue(), True
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        logger.info("Minimisation d'image non appliquée : octets laissés intacts")
        return data, False
