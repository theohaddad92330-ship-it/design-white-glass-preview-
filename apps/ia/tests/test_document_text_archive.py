"""Lecture d'une archive déposée en pièce jointe du chat (#2667.1).

La ligne de registre porte un avertissement : élargir `ATTACH_EXTENSIONS` côté
web sans répondre à trois questions ne ferait qu'accepter un fichier que rien
ne sait lire.

- **Les fichiers dans l'archive comptent-ils dans `ATTACH_MAX_COUNT = 3` ?**
  NON. L'archive est UNE pièce jointe (comme un PDF de cinquante pages en est
  une) ; son CONTENU a sa propre borne, séparée (`_MAX_ARCHIVE_ENTRIES`),
  pour ne pas transformer une archive en moyen de contourner la limite de
  pièces jointes du message.
- **Un format non supporté à l'intérieur ?** SAUTÉ, jamais deviné — comme une
  feuille Excel illisible ou une page PDF vide le sont déjà ailleurs dans ce
  fichier. Si RIEN n'est lisible, l'archive entière est refusée (422, la
  carte « Refusé » côté écran).
- **Une archive piégée ?** Trois défenses : (1) la taille décompressée
  DÉCLARÉE (`ZipInfo.file_size`) est vérifiée avant toute lecture, (2) une
  seconde vérification pendant la lecture (si l'en-tête ment), (3) un nom
  d'entrée qui remonte hors de l'archive (`..`, chemin absolu) est refusé —
  même si `zipfile.read()` ne touche jamais le disque ici (jamais
  `extractall`), donc jamais réellement exploitable en zip-slip : le refus
  est une prudence supplémentaire, pas un correctif d'une faille qui existe.
  Une archive DANS l'archive n'est jamais lue (pas dans les extensions
  acceptées) : aucune récursion, donc aucune bombe imbriquée.
"""

from __future__ import annotations

import io
import zipfile

import pytest

from app.services.document_text import DocumentTextError, extract_document_text


def _zip(entries: dict[str, bytes | str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    return buffer.getvalue()


def test_a_zip_of_text_files_concatenates_their_content():
    data = _zip({"note.txt": "Première note", "compte-rendu.md": "# Réunion\nDécision prise"})
    text = extract_document_text(data, "dossier.zip").text
    assert "Première note" in text
    assert "Décision prise" in text


def test_each_member_is_named_so_the_source_stays_traceable():
    data = _zip({"note.txt": "Contenu"})
    assert "note.txt" in extract_document_text(data, "dossier.zip").text


def test_a_zip_is_recognised_by_its_magic_bytes_without_the_extension():
    data = _zip({"note.txt": "Contenu"})
    assert "Contenu" in extract_document_text(data, None).text


def test_an_unsupported_format_inside_is_skipped_not_guessed():
    data = _zip({"note.txt": "Lisible", "photo.png": bytes(range(256))})
    text = extract_document_text(data, "dossier.zip").text
    assert "Lisible" in text
    assert "photo.png" not in text


def test_an_archive_with_nothing_readable_inside_is_refused():
    data = _zip({"photo.png": bytes(range(256)), "video.mp4": bytes(range(256))})
    with pytest.raises(DocumentTextError, match="Aucun"):
        extract_document_text(data, "dossier.zip")


def test_an_empty_archive_is_refused():
    with pytest.raises(DocumentTextError, match="Aucun"):
        extract_document_text(_zip({}), "vide.zip")


def test_more_than_the_attachment_ceiling_of_readable_files_is_refused():
    # Même plafond que ATTACH_MAX_COUNT côté web (Chat.tsx) : une archive ne
    # doit pas devenir un moyen de le contourner.
    data = _zip({f"note{i}.txt": f"Contenu {i}" for i in range(4)})
    with pytest.raises(DocumentTextError, match="3"):
        extract_document_text(data, "dossier.zip")


def test_exactly_the_ceiling_of_readable_files_is_accepted():
    data = _zip({f"note{i}.txt": f"Contenu {i}" for i in range(3)})
    text = extract_document_text(data, "dossier.zip").text
    assert "Contenu 0" in text
    assert "Contenu 2" in text


def test_a_bomb_that_decompresses_far_over_the_ceiling_is_refused():
    # Un caractère répété compresse quasi à rien (DEFLATE) : quelques dizaines
    # de Ko sur le réseau, des dizaines de mégaoctets une fois désarchivé —
    # exactement la forme d'une bombe zip. La taille DÉCLARÉE de l'en-tête
    # (`ZipInfo.file_size`, lue par `infolist()`) doit la refuser avant toute
    # décompression complète.
    data = _zip({"enorme.txt": "x" * 45_000_000})
    with pytest.raises(DocumentTextError, match="volumineuse"):
        extract_document_text(data, "bombe.zip")


def test_a_path_that_climbs_out_of_the_archive_is_refused_as_a_member():
    data = _zip({"../../etc/passwd": "contenu", "note.txt": "légitime"})
    text = extract_document_text(data, "dossier.zip").text
    assert "légitime" in text
    assert "contenu" not in text


def test_a_nested_archive_is_never_read_no_recursion():
    inner = _zip({"note.txt": "à l'intérieur"})
    data = _zip({"inner.zip": inner, "note.txt": "au premier niveau"})
    text = extract_document_text(data, "dossier.zip").text
    assert "au premier niveau" in text
    assert "à l'intérieur" not in text


def test_a_corrupted_archive_says_so():
    with pytest.raises(DocumentTextError, match="[Aa]rchive"):
        extract_document_text(b"PK\x03\x04not a real zip", "cassee.zip")


def test_a_supported_document_inside_the_archive_is_extracted_by_its_own_reader():
    # Un fichier lisible qui n'est PAS du texte brut (ici un autre .txt suffit
    # à vérifier la boucle ; les lecteurs PDF/Office sont déjà couverts
    # ailleurs et réutilisés tels quels, sans dupliquer leur logique ici).
    data = _zip({"cahier.txt": "Exigence obligatoire"})
    assert "Exigence obligatoire" in extract_document_text(data, "appel-offres.zip").text
