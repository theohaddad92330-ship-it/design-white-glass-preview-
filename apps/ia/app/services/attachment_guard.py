"""#2438.7 — la garde D'ENTRÉE sur une pièce jointe de chat, avant tout traitement.

## Le défaut qu'elle ferme

`extract_document_text` / `extract_images_text` (`document_text.py`) font
confiance aux octets reçus dès `handle_ingest` (`routers/rag.py`) : aucune
limite de TAILLE côté serveur (seul `ATTACH_MAX_BYTES` du navigateur,
`Chat.tsx`, contournable par un appel direct à l'API), et un `.docx`/`.xlsm`
porteur de MACROS VBA était lu comme n'importe quel autre document Office — la
bibliothèque standard (ZIP + XML) n'exécute rien, mais le document restait
ensuite indexé et re-servi tel quel, macro comprise, à qui le rouvre.

Une pièce jointe traverse `/rag/ingest` (dépôt unitaire) OU `ingest/zip`
(dépaqueté côté NestJS, `RagZipIngestService`, puis renvoyé vers CETTE MÊME
route pour chaque entrée) : une garde posée ici couvre les deux chemins sans
code dupliqué.

## Ce qu'elle vérifie, dans l'ordre

1. TAILLE — au-delà de `MAX_ATTACHMENT_BYTES`, refus AVANT tout décodage plus
   poussé (même geste que `extract_images_text`, qui refuse un LOT trop gros
   avant le premier appel réseau) : jamais un zip géant décompressé en mémoire
   pour y chercher une entrée VBA.
2. MACROS — un fichier Office (une archive ZIP) qui porte une entrée
   `vbaProject.bin`, où qu'elle vive dans l'archive (`word/`, `xl/`, `ppt/`),
   quel que soit le nom DÉCLARÉ par l'appelant. C'est la forme EXACTE d'un
   document macro-activé (`.docm`/`.xlsm`/`.pptm`) — qu'il se déclare `.docx`
   ou pas ; renommer l'extension ne retire jamais cette entrée.

## Ce qu'elle NE vérifie PAS ici

Le MENSONGE d'extension pour un PDF ou une image est déjà démasqué en aval,
par signature (`_looks_like_pdf`, `_detect_image_media_type` dans
`document_text.py`) — pas dupliqué ici.

## Le hash

`sha256_of` sert l'AUDIT (journalisé par l'appelant, jamais stocké dans le
texte extrait) : la même pièce déposée deux fois porte la même empreinte.
"""

from __future__ import annotations

import hashlib
import zipfile
from dataclasses import dataclass
from io import BytesIO

#: Même plafond que `ATTACH_MAX_BYTES` côté navigateur (`Chat.tsx`) — la
#: vérification CLIENT n'est qu'un confort d'affichage, celle-ci est la SEULE
#: qui compte : un appel direct à l'API la contourne sans passer ici.
MAX_ATTACHMENT_BYTES = 8_000_000

#: #3586 — la synchro du Drive interne (back-office, appelant authentifié par le
#: secret interne) lit des documents d'entreprise, pas des pièces jointes
#: d'utilisateur : plafond propre, aligné sur `MAX_ZIP_ENTRY_BYTES` côté API.
INTERNAL_DRIVE_SOURCE = "internal_drive"
MAX_INTERNAL_DRIVE_BYTES = 25_000_000

#: Le nom exact d'une entrée VBA dans une archive OOXML, où qu'elle vive
#: (`word/vbaProject.bin`, `xl/vbaProject.bin`, `ppt/vbaProject.bin`).
_VBA_ENTRY_SUFFIX = "vbaproject.bin"

#: Les deux seuls refus possibles. Un troisième code inventé d'un côté
#: produirait un refus que l'autre porte ne saurait pas nommer (même discipline
#: que `ingestion_guard.REFUSAL_CODES`).
ATTACHMENT_REFUSAL_CODES: tuple[str, ...] = ("too_large", "macro_enabled")


@dataclass(frozen=True)
class AttachmentRefusal:
    """Une pièce jointe refusée avant traitement : son code, et la phrase que
    la personne lit. Jamais un silence, jamais « refusé » sans raison."""

    code: str
    message: str


def sha256_of(data: bytes) -> str:
    """L'empreinte de l'entrée, pour l'audit — jamais pour décider quoi que
    ce soit ici (pure, aucune comparaison à une liste noire de hash)."""
    return hashlib.sha256(data).hexdigest()


def _looks_like_zip(data: bytes) -> bool:
    """Signature ZIP locale (`PK\\x03\\x04`) — les formats Office modernes
    (`.docx`/`.xlsx`/`.pptx`/leurs variantes macro) en sont TOUS."""
    return data[:2] == b"PK"


def _has_macro_entry(data: bytes) -> bool:
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            names = archive.namelist()
    except zipfile.BadZipFile:
        # Un ZIP corrompu n'est pas un macro-doc valide : l'extraction en aval
        # le refusera pour sa propre raison, ce n'est pas le rôle de CETTE garde.
        return False
    return any(name.lower().endswith(_VBA_ENTRY_SUFFIX) for name in names)


def attachment_refusal(
    data: bytes, filename: str | None, source: str | None = None
) -> AttachmentRefusal | None:
    """Cette pièce jointe peut-elle être traitée ? ``None`` = oui.

    Pure : aucune lecture, aucun réseau, aucun modèle — mêmes garanties que
    `ingestion_guard.rag_ingestion_refusal`, dont ce module reprend le style.
    """
    # #3586 — le plafond élargi ne vaut QUE pour la source nommée ; toute autre
    # valeur (ou absence) retombe sur le plafond des pièces jointes.
    max_bytes = MAX_INTERNAL_DRIVE_BYTES if source == INTERNAL_DRIVE_SOURCE else MAX_ATTACHMENT_BYTES
    if len(data) > max_bytes:
        mb = max_bytes / 1_000_000
        return AttachmentRefusal(
            code="too_large",
            message=(
                f"Fichier trop volumineux ({len(data) / 1_000_000:.1f} Mo, {mb:.0f} Mo au plus)."
            ),
        )

    if _looks_like_zip(data) and _has_macro_entry(data):
        return AttachmentRefusal(
            code="macro_enabled",
            message=(
                f"« {filename or 'ce fichier'} » contient des macros (VBA) : mis en quarantaine, "
                "jamais traité. Dépose une version sans macro."
            ),
        )

    return None
