"""#3750 — le découpage d'un document de connaissance en MORCEAUX citables.

Pourquoi : un document était ingéré d'un seul tenant — UN embedding calculé sur
le titre et les 2 000 premiers caractères, UN extrait de 400 caractères au
prompt. Un classeur de dix onglets ne laissait donc jamais passer son septième
onglet (« 07 · Objections ») : invisible au vecteur, coupé avant le prompt.

Le découpage suit la STRUCTURE quand le fichier en a une — un onglet, une
diapositive, une section titrée est une unité citable (« Titre — 07 ·
Objections ») — et ne retombe sur une fenêtre glissante qu'à défaut :

* une unité qui tient dans ``RAG_CHUNK_TARGET_CHARS`` est UN morceau ;
* une unité TABULAIRE trop longue (un onglet) est coupée par blocs de lignes,
  la ligne d'en-tête répétée en tête de chaque bloc — sans elle, la rangée
  « Trop cher | TCO sur 3 ans » perd le sens de ses colonnes ;
* le reste est coupé en fenêtres de ``RAG_CHUNK_TARGET_CHARS`` avec
  ``RAG_CHUNK_OVERLAP_CHARS`` de chevauchement, sur une frontière de ligne ou
  de mot quand il y en a une.

Un document COURT (< ``RAG_CHUNK_TARGET_CHARS``) reste UN morceau, sans
étiquette : sa citation et son extrait sont ceux d'avant ce lot.

Module PUR (aucun réseau, aucune base) : l'ingestion, le rattrapage et les
tests l'appellent de la même façon.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# La taille cible d'un morceau. Sous le plafond d'embedding
# (`RAG_EMBED_CONTENT_CHARS`, 2 000) : un morceau est donc embarqué EN ENTIER.
RAG_CHUNK_TARGET_CHARS = 1500
# Le chevauchement de la fenêtre de repli : une phrase coupée à la frontière
# reste lisible en entier dans l'un des deux morceaux.
RAG_CHUNK_OVERLAP_CHARS = 200
# La borne d'embeddings par document (#3750.7) : au-delà, les morceaux suivants
# ne sont ni écrits ni embarqués — et le compte est JOURNALISÉ par l'appelant,
# jamais une troncature muette.
RAG_MAX_CHUNKS_PER_DOCUMENT = 200

_SLIDE_MARKER = re.compile(r"^\[Diapositive (\d+)\]\s*$")
_MD_HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*#*\s*$")


@dataclass(frozen=True)
class Chunk:
    """Un morceau : son unité (« 07 · Objections », « Slide 13 », titre de
    section — ``""`` quand le document n'en a pas) et son texte."""

    unit_label: str
    content: str


def units_from_text(text: str) -> list[tuple[str, str]]:
    """Les unités d'un texte DÉJÀ extrait, quand il en porte la trace.

    Sert au rattrapage (#3750.4 — seule la colonne ``content`` existe) et aux
    formats sans structure lisible en amont (txt, md, pdf) : les repères
    ``[Diapositive N]`` que pose l'extraction pptx, et les titres Markdown.
    Sans aucun repère : une seule unité sans étiquette.
    """
    lines = (text or "").splitlines()
    units: list[tuple[str, list[str]]] = []
    current_label = ""
    current: list[str] = []
    found_marker = False
    for line in lines:
        slide = _SLIDE_MARKER.match(line.strip())
        heading = None if slide else _MD_HEADING.match(line.strip())
        if slide or heading:
            found_marker = True
            if any(part.strip() for part in current):
                units.append((current_label, current))
            if slide:
                current_label = f"Slide {slide.group(1)}"
                current = []
            else:
                current_label = heading.group(1).strip() if heading else ""
                current = [line]
            continue
        current.append(line)
    if any(part.strip() for part in current):
        units.append((current_label, current))
    if not found_marker:
        stripped = (text or "").strip()
        return [("", stripped)] if stripped else []
    return [(label, "\n".join(body).strip()) for label, body in units]


def _is_tabular(text: str) -> bool:
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        return False
    with_tabs = sum(1 for line in lines if "\t" in line)
    return with_tabs / len(lines) >= 0.6


def _window(text: str, target: int, overlap: int) -> list[str]:
    """Fenêtres de ``target`` caractères, ``overlap`` de chevauchement, coupées
    sur un saut de ligne ou une espace dans la seconde moitié de la fenêtre
    quand il y en a un. Rien n'est perdu : le dernier caractère du texte est
    dans le dernier morceau."""
    text = text.strip()
    if len(text) <= target:
        return [text] if text else []
    pieces: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + target, len(text))
        if end < len(text):
            floor = start + target // 2
            cut = text.rfind("\n", floor, end)
            if cut == -1:
                cut = text.rfind(" ", floor, end)
            if cut > start:
                end = cut
        piece = text[start:end].strip()
        if piece:
            pieces.append(piece)
        if end >= len(text):
            break
        # Le chevauchement recule sur une frontière de mot, jamais au milieu.
        next_start = max(end - overlap, start + 1)
        space = text.find(" ", next_start, end)
        start = space + 1 if space != -1 else next_start
    return pieces


def _table_blocks(text: str, target: int) -> list[str]:
    """Blocs de lignes d'un tableau, la ligne d'en-tête répétée en tête de
    chacun. Une rangée seule plus longue que la cible est fenêtrée, chaque
    fenêtre préfixée de l'en-tête — jamais une rangée perdue."""
    lines = [line for line in text.splitlines() if line.strip()]
    header, rows = lines[0], lines[1:]
    blocks: list[str] = []
    current: list[str] = []

    def flush() -> None:
        if current:
            blocks.append("\n".join([header, *current]))
            current.clear()

    for row in rows:
        room = target - len(header) - 1
        if len(row) > room:
            flush()
            for piece in _window(row, max(room, 200), RAG_CHUNK_OVERLAP_CHARS):
                blocks.append(f"{header}\n{piece}")
            continue
        size = len(header) + sum(len(r) + 1 for r in current) + len(row) + 1
        if current and size > target:
            flush()
        current.append(row)
    flush()
    return blocks or [header]


def _split_unit(text: str) -> list[str]:
    text = text.strip()
    if len(text) <= RAG_CHUNK_TARGET_CHARS:
        return [text] if text else []
    if _is_tabular(text):
        return _table_blocks(text, RAG_CHUNK_TARGET_CHARS)
    return _window(text, RAG_CHUNK_TARGET_CHARS, RAG_CHUNK_OVERLAP_CHARS)


def build_chunks(text: str, units: list[tuple[str, str]] | None = None) -> list[Chunk]:
    """Les morceaux d'un document.

    ``units`` vient de l'extraction du FICHIER (``extract_document_units`` —
    onglets nommés, diapositives, sections Word) ; absent (rattrapage, texte
    collé), les unités sont relues dans le texte (``units_from_text``).

    Un document plus court que ``RAG_CHUNK_TARGET_CHARS`` est UN morceau, son
    texte tel quel : #3750.5, comportement inchangé.
    """
    content = (text or "").strip()
    if not content:
        return []
    if len(content) <= RAG_CHUNK_TARGET_CHARS:
        label = units[0][0] if units and len(units) == 1 else ""
        return [Chunk(unit_label=label, content=content)]
    resolved = units if units else units_from_text(content)
    chunks: list[Chunk] = []
    for label, body in resolved:
        for piece in _split_unit(body or ""):
            chunks.append(Chunk(unit_label=(label or "").strip(), content=piece))
    return chunks


def bound_chunks(chunks: list[Chunk]) -> tuple[list[Chunk], int]:
    """Les morceaux GARDÉS (au plus ``RAG_MAX_CHUNKS_PER_DOCUMENT``) et le
    compte TOTAL — l'appelant journalise l'écart (#3750.7)."""
    return chunks[:RAG_MAX_CHUNKS_PER_DOCUMENT], len(chunks)
