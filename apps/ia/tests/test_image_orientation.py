"""#2433.12 — une photo prise de côté est REMISE À L'ENDROIT avant d'être lue.

Seule l'orientation déclarée par l'appareil (EXIF) est lue : rien n'est deviné
sur les pixels. Une image déjà droite reste IDENTIQUE octet pour octet.
"""

from __future__ import annotations

import io

from PIL import Image

from app.services.image_orientation import upright


def _jpeg(width: int, height: int, orientation: int | None) -> bytes:
    image = Image.new("RGB", (width, height), (200, 30, 30))
    exif = Image.Exif()
    if orientation is not None:
        exif[0x0112] = orientation
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif)
    return buffer.getvalue()


def _size(data: bytes) -> tuple[int, int]:
    return Image.open(io.BytesIO(data)).size


def test_sideways_photo_is_turned_upright() -> None:
    data = _jpeg(40, 20, orientation=6)  # appareil tenu de côté : 90° à appliquer
    fixed, turned = upright(data)
    assert turned is True
    assert _size(fixed) == (20, 40)
    exif = Image.open(io.BytesIO(fixed)).getexif()
    assert exif.get(0x0112, 1) == 1  # plus de double rotation à la lecture


def test_upright_photo_is_returned_byte_identical() -> None:
    data = _jpeg(40, 20, orientation=1)
    fixed, turned = upright(data)
    assert turned is False
    assert fixed is data


def test_photo_without_orientation_is_untouched() -> None:
    data = _jpeg(40, 20, orientation=None)
    assert upright(data) == (data, False)


def test_non_image_bytes_are_untouched_never_raise() -> None:
    pdf = b"%PDF-1.4 not an image"
    assert upright(pdf) == (pdf, False)
    assert upright(b"") == (b"", False)
