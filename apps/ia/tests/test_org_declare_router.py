"""`POST /org/declare-from-text` (#1103 ; #3740 reste) — la porte HTTP qui met
en lignes un organigramme décrit en toutes lettres OU déposé en fichier.

Ces tests couvrent le TRANSPORT : texte tapé, fichier PDF/xlsx (réutilise
`document_text.py`, déjà testé à fond ailleurs), image d'organigramme lue (OCR #3935), et le fait que `resolvedText` voyage dans la réponse — c'est CE texte
que l'appelant (l'API, `guardDeclaredPeople`) doit garder pour sa propre garde
anti-invention, jamais le `text` de la requête qui est vide pour un fichier.
"""

from __future__ import annotations

import base64
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.models.outputs.org_declare import DeclaredPerson, OrgDeclareOutput
from app.services.document_text import DocumentTextError, ExtractedDocument

client = TestClient(app)


def _make_pdf(text: str) -> bytes:
    """Même assembleur que `test_document_text.py` — un PDF minimal mais réel,
    avec un vrai calque texte, pour que `extract_document_text` y trouve
    quelque chose plutôt qu'un fichier vide."""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        None,
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    stream_body = f"BT /F1 24 Tf 20 100 Td ({text}) Tj ET".encode()
    objects[3] = b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream_body), stream_body)

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (i, body)
    xref_pos = len(out)
    out += b"xref\n0 %d\n" % (len(objects) + 1)
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (len(objects) + 1, xref_pos)
    return bytes(out)


def _claude_returns(people: list[DeclaredPerson]):
    return patch(
        "app.routers.org_declare.call_claude",
        new_callable=AsyncMock,
        return_value=(OrgDeclareOutput(people=people), None),
    )


def test_text_request_still_works_unchanged() -> None:
    """Régression — le chemin texte d'avant ce point n'a pas bougé."""
    with _claude_returns([DeclaredPerson(full_name="Caroline Jaouen", title="DSI")]) as mocked:
        response = client.post("/org/declare-from-text", json={"text": "Caroline Jaouen est DSI.", "account_name": "TF1"})
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["people"][0]["full_name"] == "Caroline Jaouen"
    assert body["data"]["resolvedText"] == "Caroline Jaouen est DSI."
    assert mocked.await_count == 1


def test_pdf_file_is_read_and_its_text_reaches_the_prompt_and_the_response() -> None:
    """#3740 (reste) — PDF, réutilise `document_text.py` comme le reste du dépôt."""
    pdf = _make_pdf("Caroline Jaouen - DSI")
    payload = base64.b64encode(pdf).decode()
    with _claude_returns([DeclaredPerson(full_name="Caroline Jaouen", title="DSI")]) as mocked:
        response = client.post(
            "/org/declare-from-text",
            json={"file_base64": payload, "file_name": "organigramme.pdf", "account_name": "TF1"},
        )
    assert response.status_code == 200
    body = response.json()
    assert "Caroline Jaouen" in body["data"]["resolvedText"]
    # Le prompt utilisateur envoyé au modèle porte bien le texte EXTRAIT du
    # PDF, pas un texte vide ou la valeur brute du champ `text` (absent ici).
    _system, user_prompt = mocked.await_args.args[:2]
    assert "Caroline Jaouen" in user_prompt


def test_a_plain_text_file_is_read_too() -> None:
    """Un `.txt`/`.md` déposé en fichier suit le même chemin qu'un PDF —
    `extract_document_text` le décode en UTF-8, pas de cas particulier ici."""
    payload = base64.b64encode("Jean Dupont, DAF".encode("utf-8")).decode()
    with _claude_returns([DeclaredPerson(full_name="Jean Dupont", title="DAF")]):
        response = client.post(
            "/org/declare-from-text",
            json={"file_base64": payload, "file_name": "notes.txt"},
        )
    assert response.status_code == 200
    assert response.json()["data"]["resolvedText"] == "Jean Dupont, DAF"


def test_image_file_is_now_read_and_its_text_reaches_the_model() -> None:
    """#3935 (12/10) — « l'OCR PARTOUT » : une image d'organigramme est LUE
    (OCR, sinon Claude) au lieu d'être refusée ; son texte devient `resolvedText`."""
    png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64).decode()
    with patch(
        "app.routers.org_declare.read_document",
        new_callable=AsyncMock,
        return_value=ExtractedDocument(text="Caroline Jaouen — DSI"),
    ) as reader, _claude_returns([DeclaredPerson(full_name="Caroline Jaouen", title="DSI")]) as mocked:
        response = client.post(
            "/org/declare-from-text",
            json={"file_base64": png, "file_name": "organigramme.png"},
        )
    assert response.status_code == 200
    assert response.json()["data"]["resolvedText"] == "Caroline Jaouen — DSI"
    assert reader.await_count == 1
    assert mocked.await_count == 1


def test_an_unreadable_image_is_a_named_422_and_never_reaches_the_model() -> None:
    """Une image sans texte lisible : refus nommé, zéro appel de mise en forme."""
    jpeg = base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x00" * 64).decode()
    with patch(
        "app.routers.org_declare.read_document",
        new_callable=AsyncMock,
        side_effect=DocumentTextError("Aucun texte lisible dans cette image."),
    ), _claude_returns([]) as mocked:
        response = client.post(
            "/org/declare-from-text",
            json={"file_base64": jpeg, "file_name": "Organigramme.JPEG"},
        )
    assert response.status_code == 422
    assert "Aucun texte lisible" in response.json()["detail"]
    mocked.assert_not_awaited()


def test_requires_either_text_or_a_file() -> None:
    response = client.post("/org/declare-from-text", json={"account_name": "TF1"})
    assert response.status_code == 422


def test_an_unreadable_file_names_its_own_cause_instead_of_a_generic_failure() -> None:
    """Un .doc Word 97-2003 (archive OLE) — `document_text.py` le refuse déjà
    nommément ; ce routeur ne doit pas l'avaler derrière un 502 générique."""
    ole = base64.b64encode(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 64).decode()
    with _claude_returns([]) as mocked:
        response = client.post(
            "/org/declare-from-text",
            json={"file_base64": ole, "file_name": "organigramme.doc"},
        )
    assert response.status_code == 422
    assert ".docx" in response.json()["detail"]
    mocked.assert_not_awaited()
