"""Les trois capacités de lecture de CV débloquées le 21/08 (décision D47).

Le chantier du PDF 3 les avait classées « bloquées » avec des raisons justes —
OCR : choix de fournisseur ; `.doc` : bibliothèque de conversion ; multilingue :
chantier de prompt. Louis a tranché : on ajoute les trois, en env-gated strict
pour ce qui appelle l'extérieur.

Ce que ces tests verrouillent est moins la capacité que ses REFUS : ce qu'on ne
sait pas lire doit être dit, jamais approximé. Un caractère inventé au milieu
d'un nom de personne finit dans un dossier envoyé à un client.
"""

from __future__ import annotations

import asyncio
import base64

import httpx
import pytest

from app.services import ocr
from app.services.cv_language import detect_cv_language, translation_directive
from app.services.document_text import DocumentTextError, extract_document_text

RTF = (
    rb"{\rtf1\ansi\deff0 {\fonttbl{\f0\froman Arial;}{\f1 Times;}}"
    rb"{\colortbl;\red0\green0\blue0;}"
    rb"Jean Dupont\par Ing\'e9nieur DevOps\par Kubernetes, Terraform\par}"
)
OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 128


class TestLegacyWord:
    def test_reads_an_rtf_hiding_behind_a_doc_extension(self) -> None:
        # C'est le cas le plus fréquent des viviers anciens : les exports
        # « Word » de nombreux outils RH sont du RTF.
        text = extract_document_text(RTF, "cv.doc").text
        assert "Jean Dupont" in text
        assert "Ingénieur DevOps" in text

    def test_drops_the_font_table_instead_of_leaking_it_into_the_cv(self) -> None:
        # Une regex laisse passer « Arial; » au milieu du texte : la table de
        # polices contient des accolades imbriquées. D'où le parcours à la pile.
        text = extract_document_text(RTF, "cv.doc").text
        assert "Arial" not in text
        assert "red0" not in text

    def test_refuses_a_real_word_97_file_WITH_a_reason(self) -> None:
        """Le refus nomme le geste de réparation.

        Extraire un flux OLE demande de reconstruire la table de pièces ; une
        lecture approximative rendrait un texte partiellement corrompu, qu'on
        enverrait ensuite à un client.
        """
        with pytest.raises(DocumentTextError) as excinfo:
            extract_document_text(OLE, "vieux.doc")
        assert ".docx" in str(excinfo.value)


class TestOcr:
    def test_is_a_strict_no_op_without_a_key(self, monkeypatch) -> None:
        # La clé est le SEUL interrupteur : sans elle, aucune requête ne part.
        monkeypatch.delenv("OCR_API_KEY", raising=False)
        assert ocr.is_configured() is False
        assert asyncio.run(ocr.extract_text(b"%PDF-1.4 scan", "cv.pdf")) is None

    def test_refuses_an_oversized_document_before_calling(self, monkeypatch) -> None:
        monkeypatch.setenv("OCR_API_KEY", "test-key")
        assert asyncio.run(ocr.extract_text(b"x" * (21 * 1024 * 1024), "gros.pdf")) is None

    # #2433.2 — garde NOMMÉE : le prétraitement n'invente jamais un texte
    # inexistant. Ce module ne peut inventer un texte qu'à deux endroits : en
    # RETOUCHANT l'octet envoyé (ce test), ou en DEVINANT un champ de la
    # réponse (`test_reads_only_the_two_documented_response_shapes`, déjà là).
    def test_sends_the_original_bytes_unmodified_no_local_retouching(self, monkeypatch) -> None:
        """Aucune amélioration locale (débruitage, recadrage, réécriture) avant
        l'envoi : l'octet qui part est l'octet reçu, au bit près."""
        monkeypatch.setenv("OCR_API_KEY", "test-key")
        captured: dict[str, object] = {}

        async def _post(self, url, *, json=None, headers=None):  # noqa: ANN001 — signature httpx
            captured["json"] = json

            class _Resp:
                status_code = 200

                def json(self) -> dict:
                    return {"text": "peu importe — ce test ne porte pas sur la réponse"}

            return _Resp()

        monkeypatch.setattr(httpx.AsyncClient, "post", _post)

        original = b"%PDF-1.4 octets bruts, non retouches, pas de debruitage ni de reecriture"
        asyncio.run(ocr.extract_text(original, "cv.pdf"))

        sent_url = captured["json"]["document"]["document_url"]  # type: ignore[index]
        _prefix, _, b64 = sent_url.partition(",")
        assert base64.b64decode(b64) == original

    def test_reads_only_the_two_documented_response_shapes(self) -> None:
        """Fouiller la réponse rendrait un jour un identifiant de requête.

        On accepte les pages (markdown/text) et le texte à plat ; tout le reste
        rend `None`, et l'appelant retombe sur son message honnête.
        """
        assert ocr._text_of({"pages": [{"markdown": "Jean Dupont"}, {"text": "DevOps"}]}) == "Jean Dupont\n\nDevOps"
        assert ocr._text_of({"text": "  Jean Dupont  "}) == "Jean Dupont"
        assert ocr._text_of({"request_id": "abc-123"}) is None
        assert ocr._text_of({"pages": []}) is None
        assert ocr._text_of("Jean Dupont") is None


class TestCvLanguage:
    FR = (
        "Jean Dupont est un ingénieur avec dix ans dans le développement de plateformes "
        "chez des clients du secteur bancaire et de la distribution pour des projets au long cours"
    )
    EN = (
        "John Doe is a senior engineer with ten years of experience in the development of "
        "platforms for clients in the banking and retail industry working with teams from around the world"
    )

    def test_detects_the_obvious_cases(self) -> None:
        assert detect_cv_language(self.FR) == "fr"
        assert detect_cv_language(self.EN) == "en"

    def test_says_it_does_not_know_rather_than_guessing(self) -> None:
        # Un CV qui n'est qu'une liste de technologies ne porte aucun mot-outil.
        # Lui prêter une langue ferait ajouter une consigne de traduction sur un
        # document qui n'en a pas besoin.
        assert detect_cv_language("Kubernetes Terraform Docker Ansible Jenkins Python Go Rust") is None
        assert detect_cv_language("") is None
        assert detect_cv_language("Java Spring") is None

    def test_a_french_cv_leaves_the_prompt_byte_identical(self) -> None:
        # La garantie qui rend le changement sûr : rien ne bouge sur les CV
        # français, qui sont l'immense majorité.
        assert translation_directive(self.FR) == ""
        assert translation_directive("Kubernetes Terraform Docker") == ""

    def test_a_foreign_cv_keeps_its_quotes_in_the_original_language(self) -> None:
        """La règle la plus importante de la consigne.

        La garde anti-invention cherche chaque citation dans le CV source : une
        citation traduite ne s'y trouverait plus, et le champ entier serait
        écarté — un CV étranger reviendrait donc entièrement vide.
        """
        directive = translation_directive(self.EN)
        assert "CITATION" in directive
        assert "langue d'origine" in directive
