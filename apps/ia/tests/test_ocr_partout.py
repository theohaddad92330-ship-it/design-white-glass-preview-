"""#3935 (12/10) — l'OCR PARTOUT : un lecteur commun, le bon type envoyé,
des paquets pour les gros fichiers, `.doc` / `.rtf` lus, chaque appelant câblé.

Fichiers FICTIFS générés ici (voir `ocr_partout_helpers`). Aucun réseau réel :
la frontière `httpx.AsyncClient.post` est simulée.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import re
from pathlib import Path

import httpx
import pytest

from app.routers import org_declare, rag, rfp
from app.services import document_reader, mission_extraction, ocr
from app.services.document_reader import read_document
from app.services.document_text import DocumentTextError, ExtractedDocument, extract_document_text
from tests.ocr_partout_helpers import CLEAN, JPEG, PNG, WEBP, blank_pdf, text_pdf, word97_doc

ROOT = Path(__file__).resolve().parent.parent
OCR_TEXT = "Texte lu par l'OCR : Jean DUPONT, ingénieur."


class _Response:
    def __init__(self, status_code: int = 200, text: str = OCR_TEXT) -> None:
        self.status_code = status_code
        self._text = text

    def json(self) -> dict:
        return {"pages": [{"markdown": self._text}]}


class Provider:
    """Le fournisseur OCR simulé : garde chaque requête reçue."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch, *, status: int = 200, texts: list[str] | None = None) -> None:
        self.requests: list[dict] = []
        self._status = status
        self._texts = texts

        async def _post(client, url, *, json=None, headers=None):  # noqa: ANN001, A002
            self.requests.append(json)
            text = self._texts[len(self.requests) - 1] if self._texts else OCR_TEXT
            return _Response(self._status, text)

        monkeypatch.setattr(httpx.AsyncClient, "post", _post)


@pytest.fixture
def key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OCR_API_KEY", "test-key")


@pytest.fixture
def no_claude(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Aucun appel Claude réel : le repli PDF et l'image sont comptés."""
    calls: list[str] = []

    async def pdf(data, filename=None):  # noqa: ANN001
        calls.append("claude_pdf")
        return None

    async def image(data, filename=None):  # noqa: ANN001
        calls.append("claude_image")
        return ExtractedDocument(text="Texte lu par Claude")

    monkeypatch.setattr(ocr, "_claude_document_text", pdf)
    monkeypatch.setattr(document_reader, "extract_image_text", image)
    return calls


def run(coro):  # noqa: ANN001
    return asyncio.run(coro)


# ── Point 2 : le BON type part chez le fournisseur ───────────────────────────


class TestPayloadPerFormat:
    def test_pdf_goes_as_document_url(self, key, monkeypatch) -> None:
        provider = Provider(monkeypatch)
        assert run(ocr.extract_text(blank_pdf(), "scan.pdf")) == OCR_TEXT
        document = provider.requests[0]["document"]
        assert document["type"] == "document_url"
        assert document["document_url"].startswith("data:application/pdf;base64,")

    @pytest.mark.parametrize(
        ("data", "mime"), [(PNG, "image/png"), (JPEG, "image/jpeg"), (WEBP, "image/webp")]
    )
    def test_image_goes_as_image_url_with_its_own_mime(self, key, monkeypatch, data, mime) -> None:
        provider = Provider(monkeypatch)
        assert run(ocr.extract_text(data, "photo.bin")) == OCR_TEXT
        document = provider.requests[0]["document"]
        assert document["type"] == "image_url"
        assert document["image_url"].startswith(f"data:{mime};base64,")

    def test_signature_wins_over_a_lying_extension(self, key, monkeypatch) -> None:
        provider = Provider(monkeypatch)
        run(ocr.extract_text(JPEG, "organigramme.png"))
        assert provider.requests[0]["document"]["image_url"].startswith("data:image/jpeg;")

    def test_an_office_file_is_never_sent(self, key, monkeypatch) -> None:
        # Que le fournisseur reçoive un docx ne se vérifie pas d'ici : XML seulement.
        provider = Provider(monkeypatch)
        assert run(ocr.extract_text(b"PK\x03\x04" + b"\x00" * 64, "cv.docx")) is None
        assert provider.requests == []


# ── Sans clé : zéro requête ──────────────────────────────────────────────────


class TestNoKey:
    def test_no_request_leaves_for_any_format(self, monkeypatch) -> None:
        monkeypatch.delenv("OCR_API_KEY", raising=False)
        provider = Provider(monkeypatch)
        for data in (blank_pdf(), PNG, JPEG, WEBP):
            assert run(ocr.extract_text(data, "x")) is None
        assert provider.requests == []

    def test_a_scanned_pdf_keeps_its_original_named_refusal(self, monkeypatch, no_claude) -> None:
        monkeypatch.delenv("OCR_API_KEY", raising=False)
        provider = Provider(monkeypatch)
        with pytest.raises(DocumentTextError, match="Aucun texte extractible"):
            run(read_document(blank_pdf(), "scan.pdf"))
        assert provider.requests == []
        assert no_claude == []  # sans clé : aucun appel, Claude compris

    def test_an_image_without_key_takes_the_claude_path_as_before(self, monkeypatch, no_claude) -> None:
        monkeypatch.delenv("OCR_API_KEY", raising=False)
        provider = Provider(monkeypatch)
        assert run(read_document(PNG, "organigramme.png")).text == "Texte lu par Claude"
        assert provider.requests == []
        assert no_claude == ["claude_image"]


# ── Point 1 : le lecteur commun ──────────────────────────────────────────────


class TestReadDocument:
    def test_a_clean_text_pdf_triggers_no_ocr(self, key, monkeypatch, no_claude, caplog) -> None:
        provider = Provider(monkeypatch)
        with caplog.at_level(logging.INFO):
            document = run(read_document(text_pdf(CLEAN), "cv.pdf"))
        assert "Jean DUPONT" in document.text
        assert provider.requests == []
        assert no_claude == []
        assert "voie=direct" in caplog.text

    def test_a_scanned_pdf_goes_to_the_ocr(self, key, monkeypatch, no_claude, caplog) -> None:
        provider = Provider(monkeypatch)
        with caplog.at_level(logging.INFO):
            document = run(read_document(blank_pdf(), "scan.pdf"))
        assert document.text == OCR_TEXT
        assert len(provider.requests) == 1
        assert "voie=ocr" in caplog.text
        assert OCR_TEXT not in caplog.text  # le journal ne porte jamais le contenu

    def test_letter_spaced_text_is_glued_without_ocr_when_the_score_rises(self, key, monkeypatch, no_claude) -> None:
        provider = Provider(monkeypatch)
        spaced = "   ".join(" ".join(word) for word in CLEAN.split())
        document = run(read_document(text_pdf(spaced), "cv.pdf"))
        assert "Jean DUPONT" in document.text
        assert provider.requests == []

    def test_a_provider_failure_falls_back_to_claude_then_to_the_refusal(self, key, monkeypatch) -> None:
        Provider(monkeypatch, status=500)

        async def claude(data, filename=None):  # noqa: ANN001
            return "Texte de repli Claude"

        monkeypatch.setattr(ocr, "_claude_document_text", claude)
        assert run(read_document(blank_pdf(), "scan.pdf")).text == "Texte de repli Claude"

        async def nothing(data, filename=None):  # noqa: ANN001
            return None

        monkeypatch.setattr(ocr, "_claude_document_text", nothing)
        with pytest.raises(DocumentTextError, match="Aucun texte extractible"):
            run(read_document(blank_pdf(), "scan.pdf"))

    def test_an_image_is_read_by_the_ocr_as_an_image(self, key, monkeypatch, no_claude) -> None:
        provider = Provider(monkeypatch)
        assert run(read_document(PNG, "organigramme.png")).text == OCR_TEXT
        assert provider.requests[0]["document"]["type"] == "image_url"
        assert no_claude == []

    def test_an_image_the_ocr_cannot_read_falls_back_to_claude(self, key, monkeypatch, no_claude) -> None:
        Provider(monkeypatch, status=429)
        assert run(read_document(PNG, "organigramme.png")).text == "Texte lu par Claude"
        assert no_claude == ["claude_image"]

    def test_an_empty_file_is_refused_by_name(self) -> None:
        with pytest.raises(DocumentTextError, match="vide"):
            run(read_document(b"", "x.pdf"))


# ── Point 6 : les gros fichiers ──────────────────────────────────────────────


class TestBigFiles:
    def test_a_long_pdf_goes_by_packets_in_order(self, key, monkeypatch, no_claude) -> None:
        monkeypatch.setattr(ocr, "_PACKET_PAGES", 2)
        provider = Provider(monkeypatch, texts=["PAQUET UN", "PAQUET DEUX", "PAQUET TROIS"])
        text = run(ocr.extract_text(blank_pdf(5), "gros.pdf"))
        assert len(provider.requests) == 3
        assert text == "PAQUET UN\n\nPAQUET DEUX\n\nPAQUET TROIS"

    def test_a_silent_packet_gives_none_not_a_half_text(self, key, monkeypatch) -> None:
        monkeypatch.setattr(ocr, "_PACKET_PAGES", 2)
        provider = Provider(monkeypatch)
        calls = {"n": 0}

        async def post(client, url, *, json=None, headers=None):  # noqa: ANN001, A002
            calls["n"] += 1
            return _Response(500 if calls["n"] == 2 else 200)

        monkeypatch.setattr(httpx.AsyncClient, "post", post)
        assert run(ocr.extract_text(blank_pdf(5), "gros.pdf")) is None
        assert provider.requests == []

    def test_an_oversize_pdf_is_cut_by_bytes_too(self, key, monkeypatch) -> None:
        provider = Provider(monkeypatch)
        one_page = len(blank_pdf(1))
        monkeypatch.setattr(ocr, "_MAX_BYTES", one_page + 100)
        run(ocr.extract_text(blank_pdf(4), "gros.pdf"))
        assert len(provider.requests) >= 2

    def test_an_unsplittable_oversize_file_is_a_NAMED_error_not_a_blank(self, key, monkeypatch, no_claude) -> None:
        provider = Provider(monkeypatch)
        monkeypatch.setattr(ocr, "_MAX_BYTES", 100)  # une seule page dépasse déjà
        with pytest.raises(DocumentTextError, match="au-delà de la limite"):
            run(read_document(blank_pdf(1), "scan.pdf"))
        assert provider.requests == []


# ── Point 4 : .rtf et .doc ───────────────────────────────────────────────────

B = chr(92)


class TestLegacyFormats:
    def test_rtf_is_read_without_destinations_or_font_tables(self) -> None:
        rtf = (
            "{" + B + "rtf1" + B + "ansi{" + B + "fonttbl{" + B + "f0 Arial;}}"
            "{" + B + "*" + B + "generator Riched20 10.0;}"
            "Jean" + B + "tab Dupont " + B + "u8211?" + B + "u233? Ing" + B + "'e9nieur" + B + "par DevOps}"
        ).encode()
        text = extract_document_text(rtf, "cv.rtf").text
        assert "Jean\tDupont" in text
        assert "Ingénieur" in text
        assert "–é" in text  # 舑 et \u233 décodés, le repli « ? » jeté
        assert "Riched20" not in text and "Arial" not in text and "?" not in text

    def test_word97_synthetic_compressed_and_utf16(self) -> None:
        compressed = extract_document_text(word97_doc("Jean Dupont\rIngénieur – Été"), "cv.doc").text
        assert compressed == "Jean Dupont\nIngénieur – Été"
        wide = extract_document_text(word97_doc("Jean Dupont\rŒuvre → 2024", compressed=False), "cv.doc").text
        assert wide == "Jean Dupont\nŒuvre → 2024"

    def test_a_real_word97_file_written_by_a_word_processor(self) -> None:
        data = (ROOT / "tests/fixtures/cv_fictif_word97.doc").read_bytes()
        text = extract_document_text(data, "cv.doc").text
        assert text.splitlines()[0] == "Jean Dupont"
        assert "Ingénieur DevOps – Kubernetes" in text
        assert "Été 2020 → 2024 œuvre" in text

    def test_a_corrupt_ole_is_a_named_refusal(self) -> None:
        with pytest.raises(DocumentTextError, match=r"\.docx"):
            extract_document_text(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 128, "vieux.doc")

    def test_read_document_reads_doc_and_rtf_without_any_ocr(self, key, monkeypatch) -> None:
        provider = Provider(monkeypatch)
        assert "Jean Dupont" in run(read_document(word97_doc("Jean Dupont"), "cv.doc")).text
        assert provider.requests == []


# ── Point 3 : chaque appelant passe par la fonction ──────────────────────────


class TestWiring:
    def test_rag_ingest_goes_through_read_document(self, monkeypatch) -> None:
        seen: list[str | None] = []

        async def fake(data, filename=None):  # noqa: ANN001
            seen.append(filename)
            return ExtractedDocument(text="lu")

        monkeypatch.setattr(rag, "read_document", fake)
        text, partial = run(rag._extract_uploaded_text(base64.b64encode(blank_pdf()).decode(), "scan.pdf"))  # noqa: SLF001
        assert (text, partial, seen) == ("lu", False, ["scan.pdf"])

    def test_rfp_goes_through_read_document(self, monkeypatch) -> None:
        seen: list[str | None] = []

        async def fake(data, filename=None, *, response_cache=False):  # noqa: ANN001
            # CACHE-LLM (15/10) — un appel d'offres est un document PUBLIC : il
            # demande le cache de lecture par empreinte de contenu.
            assert response_cache is True
            seen.append(filename)
            return ExtractedDocument(text="ao")

        monkeypatch.setattr(rfp, "read_document", fake)
        req = rfp.RfpAnalyseRequest(file_base64=base64.b64encode(blank_pdf()).decode(), file_name="ao.pdf")
        assert run(rfp._resolve_text(req)) == "ao"  # noqa: SLF001
        assert seen == ["ao.pdf"]

    def test_org_declare_goes_through_read_document(self, monkeypatch) -> None:
        seen: list[str | None] = []

        async def fake(data, filename=None):  # noqa: ANN001
            seen.append(filename)
            return ExtractedDocument(text="organigramme")

        monkeypatch.setattr(org_declare, "read_document", fake)
        req = org_declare.OrgDeclareRequest(file_base64=base64.b64encode(PNG).decode(), file_name="o.png")
        assert run(org_declare._resolve_text(req)) == "organigramme"  # noqa: SLF001
        assert seen == ["o.png"]

    def test_mission_extraction_goes_through_read_document(self, monkeypatch) -> None:
        seen: list[str | None] = []

        async def fake(data, filename=None):  # noqa: ANN001
            seen.append(filename)
            raise DocumentTextError("illisible")

        monkeypatch.setattr(mission_extraction, "read_document", fake)
        result = run(mission_extraction.extract(None, blank_pdf(), "mission.pdf"))
        assert seen == ["mission.pdf"]
        assert result.status == mission_extraction.STATUS_UNREADABLE

    def test_no_wired_caller_reads_files_around_the_common_reader_anymore(self) -> None:
        """Le test qui sait dire NON : si quelqu'un remet `extract_document_text`
        direct dans un appelant, le lot OCR-PARTOUT est contourné en silence."""
        for rel in (
            "app/routers/rag.py",
            "app/routers/rfp.py",
            "app/routers/org_declare.py",
            "app/services/mission_extraction.py",
        ):
            source = (ROOT / rel).read_text(encoding="utf-8")
            assert "read_document" in source, rel
            code = re.sub(r"#.*|\"\"\".*?\"\"\"", "", source, flags=re.S)
            assert "extract_document_text(" not in code, rel
