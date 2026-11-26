"""#4016 (lot W12) — les documents web sont lus EN LOCAL, jamais par Firecrawl.

Mesure Louis (30 j) : ~1 900 requêtes PDF = 161 700 crédits (97 % de la facture),
Firecrawl facturant le PDF PAR PAGE. Un document passe désormais par ``httpx`` +
le lecteur ``document_text`` ; Firecrawl ne voit plus que le HTML.
"""

from __future__ import annotations

import io
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.services import firecrawl, scrape_cache, web_documents
from app.services.research.sources import SourceCategory


def _pdf_with_text(text: str) -> bytes:
    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=300)
    stream = DecodedStreamObject()
    stream.set_data(f"BT /F1 12 Tf 20 200 Td ({text}) Tj ET".encode())
    page[NameObject("/Contents")] = writer._add_object(stream)
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    page[NameObject("/Resources")] = DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})}
    )
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _blank_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _isolated(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(scrape_cache, "_redis", AsyncMock(return_value=None))
    # Pas de DNS en test : tout nom d'hôte résout vers une IP publique.
    monkeypatch.setattr(web_documents, "_resolve_ips", AsyncMock(return_value=["93.184.216.34"]))
    web_documents.reset_run_metrics()


def _serve(monkeypatch: pytest.MonkeyPatch, handler) -> list[httpx.Request]:
    seen: list[httpx.Request] = []

    def wrapped(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    monkeypatch.setattr(
        web_documents,
        "_new_client",
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(wrapped), follow_redirects=False),
    )
    return seen


def _hit(url: str) -> dict:
    return {"url": url, "title": "T", "category": SourceCategory.OFFICIAL, "description": "d"}


def _fc_client() -> AsyncMock:
    client = AsyncMock()
    client.scrape.return_value = SimpleNamespace(markdown="# page html")
    return client


# ── Détection ───────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "url",
    [
        "https://a.fr/rapport.pdf",
        "https://a.fr/RAPPORT.PDF?download=1",
        "https://a.fr/x/y.docx#p2",
        "https://a.fr/a.xlsx",
        "https://a.fr/a.pptx",
        "https://a.fr/a.rtf",
        "https://a.fr/a.csv",
        "https://a.fr/a.txt",
        "https://a.fr/a.doc",
        "https://a.fr/a.ods",
    ],
)
def test_document_urls_are_detected(url: str) -> None:
    assert web_documents.is_document_url(url)


@pytest.mark.parametrize(
    "url",
    ["https://a.fr/", "https://a.fr/page", "https://a.fr/page.html", "https://a.fr/?file=x.pdf", "https://a.fr/pdf"],
)
def test_html_urls_are_not_documents(url: str) -> None:
    assert not web_documents.is_document_url(url)


# ── Lecture locale ──────────────────────────────────────────────────────────


async def test_text_pdf_becomes_markdown_without_firecrawl(monkeypatch) -> None:
    pdf = _pdf_with_text("Chiffre affaires annuel 2025 en hausse de douze pour cent")
    seen = _serve(monkeypatch, lambda r: httpx.Response(200, content=pdf, headers={"content-type": "application/pdf"}))
    fc = _fc_client()
    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "k"}):
        results = await firecrawl.scrape_hits([_hit("https://a.fr/rapport.pdf")], http_client=fc)
    assert [r["scrape_status"] for r in results] == ["ok"]
    assert "Chiffre affaires annuel 2025" in (results[0]["markdown"] or "")
    assert results[0]["char_count"] == len(results[0]["markdown"] or "")
    assert len(seen) == 1
    fc.scrape.assert_not_called()


async def test_oversized_document_is_too_large(monkeypatch) -> None:
    monkeypatch.setenv("WEB_DOCUMENT_MAX_BYTES", "1000")
    _serve(monkeypatch, lambda r: httpx.Response(200, content=b"x" * 5000))
    fc = _fc_client()
    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "k"}):
        results = await firecrawl.scrape_hits([_hit("https://a.fr/gros.pdf")], http_client=fc)
    assert results[0]["scrape_status"] == "error"
    assert results[0]["error_code"] == "TOO_LARGE"
    fc.scrape.assert_not_called()


async def test_declared_content_length_over_cap_is_refused_before_reading(monkeypatch) -> None:
    monkeypatch.setenv("WEB_DOCUMENT_MAX_BYTES", "1000")
    _serve(monkeypatch, lambda r: httpx.Response(200, content=b"x", headers={"content-length": "999999"}))
    with pytest.raises(web_documents.WebDocumentError) as err:
        await web_documents.read_document("https://a.fr/gros.pdf")
    assert err.value.error_code == "TOO_LARGE"


@pytest.mark.parametrize("ext", ["doc", "xls", "ppt", "odt", "ods", "odp"])
async def test_legacy_formats_are_skipped_without_any_call(monkeypatch, ext) -> None:
    seen = _serve(monkeypatch, lambda r: httpx.Response(200, content=b"x"))
    fc = _fc_client()
    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "k"}):
        results = await firecrawl.scrape_hits([_hit(f"https://a.fr/f.{ext}")], http_client=fc)
    assert results[0]["scrape_status"] == "skipped"
    assert results[0]["error_code"] == "UNSUPPORTED_FORMAT"
    assert seen == []
    fc.scrape.assert_not_called()


async def test_scanned_pdf_is_empty_unreadable(monkeypatch) -> None:
    _serve(monkeypatch, lambda r: httpx.Response(200, content=_blank_pdf()))
    fc = _fc_client()
    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "k"}):
        results = await firecrawl.scrape_hits([_hit("https://a.fr/scan.pdf")], http_client=fc)
    assert results[0]["scrape_status"] == "empty"
    assert results[0]["error_code"] == "UNREADABLE"
    assert results[0]["markdown"] is None
    fc.scrape.assert_not_called()


async def test_garbled_text_is_unreadable(monkeypatch) -> None:
    _serve(monkeypatch, lambda r: httpx.Response(200, content=("(cid:12)" * 40).encode()))
    with pytest.raises(web_documents.WebDocumentError) as err:
        await web_documents.read_document("https://a.fr/x.txt")
    assert err.value.status == "empty"
    assert err.value.error_code == "UNREADABLE"


async def test_html_answer_on_document_url_is_unreadable(monkeypatch) -> None:
    _serve(monkeypatch, lambda r: httpx.Response(200, content=b"<html>login</html>", headers={"content-type": "text/html"}))
    with pytest.raises(web_documents.WebDocumentError) as err:
        await web_documents.read_document("https://a.fr/x.pdf")
    assert err.value.error_code == "UNREADABLE"


async def test_text_is_truncated_to_the_category_budget(monkeypatch) -> None:
    monkeypatch.setenv("FIRECRAWL_CHARS_PER_CATEGORY", "500")
    _serve(monkeypatch, lambda r: httpx.Response(200, content=("mot utile " * 400).encode()))
    text = await web_documents.read_document("https://a.fr/long.txt")
    assert len(text) <= 500


async def test_http_error_status_is_an_error(monkeypatch) -> None:
    _serve(monkeypatch, lambda r: httpx.Response(404))
    fc = _fc_client()
    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "k"}):
        results = await firecrawl.scrape_hits([_hit("https://a.fr/x.pdf")], http_client=fc)
    assert results[0]["scrape_status"] == "error"
    assert results[0]["error_code"] == "HTTP_404"
    fc.scrape.assert_not_called()


async def test_redirects_are_followed(monkeypatch) -> None:
    def handler(r: httpx.Request) -> httpx.Response:
        if r.url.path == "/old.txt":
            return httpx.Response(302, headers={"location": "https://a.fr/new.txt"})
        return httpx.Response(200, content=b"contenu final du document de test pour le lecteur")

    _serve(monkeypatch, handler)
    assert "contenu final" in await web_documents.read_document("https://a.fr/old.txt")


# ── Sécurité (SSRF) ─────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "url",
    ["ftp://a.fr/x.pdf", "file:///etc/passwd.txt", "http://127.0.0.1/x.pdf", "http://10.0.0.5/x.pdf",
     "http://169.254.169.254/x.txt", "http://[::1]/x.pdf", "http://192.168.1.2/x.pdf"],
)
async def test_unsafe_targets_are_refused_without_a_request(monkeypatch, url) -> None:
    seen = _serve(monkeypatch, lambda r: httpx.Response(200, content=b"x"))
    with pytest.raises(web_documents.WebDocumentError) as err:
        await web_documents.read_document(url)
    assert err.value.error_code == "UNSAFE_URL"
    assert seen == []


async def test_hostname_resolving_to_private_ip_is_refused(monkeypatch) -> None:
    monkeypatch.setattr(web_documents, "_resolve_ips", AsyncMock(return_value=["10.1.2.3"]))
    seen = _serve(monkeypatch, lambda r: httpx.Response(200, content=b"x"))
    with pytest.raises(web_documents.WebDocumentError) as err:
        await web_documents.read_document("https://interne.example/x.pdf")
    assert err.value.error_code == "UNSAFE_URL"
    assert seen == []


async def test_redirect_to_private_target_is_refused(monkeypatch) -> None:
    def handler(r: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest.txt"})

    _serve(monkeypatch, handler)
    with pytest.raises(web_documents.WebDocumentError) as err:
        await web_documents.read_document("https://a.fr/x.txt")
    assert err.value.error_code == "UNSAFE_URL"


# ── Cache ───────────────────────────────────────────────────────────────────


async def test_cache_hit_does_no_get(monkeypatch) -> None:
    pdf = _pdf_with_text("Rapport annuel lu une seule fois pour tous les espaces")
    seen = _serve(monkeypatch, lambda r: httpx.Response(200, content=pdf))
    store: dict[str, str] = {}

    async def fake_get(url: str):
        return store.get(url)

    async def fake_set(url: str, md: str) -> None:
        store[url] = md

    monkeypatch.setattr(scrape_cache, "get_markdown", fake_get)
    monkeypatch.setattr(scrape_cache, "set_markdown", fake_set)
    fc = _fc_client()
    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "k"}):
        first = await firecrawl.scrape_hits([_hit("https://a.fr/ra.pdf")], http_client=fc)
        second = await firecrawl.scrape_hits([_hit("https://a.fr/ra.pdf")], http_client=fc)
    assert first[0]["markdown"] == second[0]["markdown"]
    assert len(seen) == 1


# ── Firecrawl ne voit que le HTML, sans parseur ─────────────────────────────


async def test_html_goes_to_firecrawl_with_no_parsers(monkeypatch) -> None:
    seen = _serve(monkeypatch, lambda r: httpx.Response(200, content=b"x"))
    fc = _fc_client()
    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "k"}):
        results = await firecrawl.scrape_hits([_hit("https://a.fr/page")], http_client=fc)
    assert results[0]["scrape_status"] == "ok"
    assert fc.scrape.call_args.kwargs["parsers"] == []
    assert seen == []


# ── Métriques ───────────────────────────────────────────────────────────────


async def test_run_metrics_count_reads_and_failures(monkeypatch, caplog) -> None:
    pdf = _pdf_with_text("Document lisible pour la mesure du run entier")

    def handler(r: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=pdf) if r.url.path == "/ok.pdf" else httpx.Response(500)

    _serve(monkeypatch, handler)
    fc = _fc_client()
    with caplog.at_level("INFO"), patch.dict(os.environ, {"FIRECRAWL_API_KEY": "k"}):
        await firecrawl.scrape_hits([_hit("https://a.fr/ok.pdf"), _hit("https://a.fr/ko.pdf")], http_client=fc)
    assert web_documents.run_metrics() == {"web_documents_read": 1, "web_documents_failed": 1}
    assert any("web_documents_read=1" in r.getMessage() and "web_documents_failed=1" in r.getMessage() for r in caplog.records)


# ── Repli SIREN Pappers : même voie ─────────────────────────────────────────


async def test_pappers_siren_fallback_reads_documents_locally(monkeypatch) -> None:
    from app.services.research import pappers

    pdf = _pdf_with_text("SIREN 424 761 419 societe anonyme mentions legales")
    seen = _serve(monkeypatch, lambda r: httpx.Response(200, content=pdf))
    fc = _fc_client()
    res = await firecrawl._scrape_one(_hit("https://a.fr/mentions.pdf"), fc)
    assert res["scrape_status"] == "ok" and "424 761 419" in (res["markdown"] or "")
    assert len(seen) == 1
    fc.scrape.assert_not_called()
    # le repli appelle bien ``_scrape_one`` (donc la même voie)
    import inspect

    assert "firecrawl._scrape_one" in inspect.getsource(pappers._resolve_siren_via_web)
