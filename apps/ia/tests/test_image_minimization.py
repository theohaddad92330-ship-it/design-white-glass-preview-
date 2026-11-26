"""#2433.9 — la photo qui part vers un fournisseur externe ne porte que ses pixels.

Position GPS, modèle d'appareil, date de prise de vue : rien de cela n'aide à
LIRE un ticket, tout cela identifie une personne. Une image sans métadonnée
reste IDENTIQUE octet pour octet ; un PDF ou des octets quelconques aussi.
"""

from __future__ import annotations

import io

from PIL import Image

from app.services.image_minimization import minimized


def _jpeg_with_gps(orientation: int = 1) -> bytes:
    image = Image.new("RGB", (40, 20), (10, 120, 200))
    exif = Image.Exif()
    exif[0x0112] = orientation
    exif[0x010F] = "AcmePhone"  # fabricant
    exif[0x0132] = "2026:10:04 08:00:00"  # date de prise de vue
    exif.get_ifd(0x8825)[1] = "N"  # bloc GPS
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif)
    return buffer.getvalue()


def test_exif_gps_is_removed_before_sending() -> None:
    data = _jpeg_with_gps()
    assert Image.open(io.BytesIO(data)).getexif()  # précondition : il y a des métadonnées
    cleaned, stripped = minimized(data)
    assert stripped is True
    reread = Image.open(io.BytesIO(cleaned))
    assert dict(reread.getexif()) == {}
    assert reread.size == (40, 20)


def test_sideways_photo_is_turned_then_stripped() -> None:
    cleaned, stripped = minimized(_jpeg_with_gps(orientation=6))
    assert stripped is True
    reread = Image.open(io.BytesIO(cleaned))
    assert reread.size == (20, 40)
    assert dict(reread.getexif()) == {}


def test_image_without_metadata_is_byte_identical() -> None:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), (1, 2, 3)).save(buffer, format="PNG")
    data = buffer.getvalue()
    assert minimized(data) == (data, False)


def test_png_text_chunk_is_removed() -> None:
    from PIL.PngImagePlugin import PngInfo

    info = PngInfo()
    info.add_text("Author", "Jean Dupont")
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buffer, format="PNG", pnginfo=info)
    cleaned, stripped = minimized(buffer.getvalue())
    assert stripped is True
    assert "Author" not in Image.open(io.BytesIO(cleaned)).info


def test_non_image_bytes_are_untouched() -> None:
    pdf = b"%PDF-1.4 not an image"
    assert minimized(pdf) == (pdf, False)
    assert minimized(b"") == (b"", False)
