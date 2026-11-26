"""#4743.2/.5 — champs d'identité publiés sur une page de mentions légales.

La page est déjà LUE en priorité (``firecrawl.is_legal_notice_url``) ; ce module en EXTRAIT les champs.
Règle d'écriture (#4743.5) : on garde ce qui est publié, TEL QUE publié. Un champ s'extrait seulement
s'il est introduit par son libellé (« Capital social : … ») ; jamais déduit du nom (« SAS » dans une
raison sociale n'est pas une forme juridique publiée), jamais converti (le capital reste « 1 000 000
euros »), jamais complété. Un champ absent est ABSENT : pas de clé, pas de chaîne vide, pas de « 0 ».
Aucun appel réseau : ``pages`` = ``[{"url", "markdown"}]``, les pages que le run a déjà scrapées.
"""

from __future__ import annotations

import re
from typing import Any

from app.services.firecrawl import is_legal_notice_url

_SEP = r"\s*(?::|-|–|—)\s*"
_MAX_VALUE = 200

# champ → libellés publiés qui l'introduisent (le premier trouvé gagne).
_LABELS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("raison_sociale", ("raison sociale", "dénomination sociale", "denomination sociale")),
    ("forme_juridique", ("forme juridique",)),
    ("capital", ("capital social", "au capital de", "capital de")),
    ("siege", ("siège social", "siege social", "adresse du siège", "siège")),
    (
        "dirigeant",
        (
            "directeur de la publication",
            "directrice de la publication",
            "représentant légal",
            "representant legal",
            "responsable de la publication",
        ),
    ),
    ("hebergeur", ("hébergeur", "hebergeur", "hébergé par", "heberge par", "hébergement")),
)
_REGISTRATION = re.compile(
    r"\b((?:RCS|R\.C\.S\.?)\s+[A-Za-zÀ-ÿ'\- ]{0,40}?\s*(?:[AB]\s+)?\d{3}\s?\d{3}\s?\d{3}(?:\s?\d{5})?)\b"
)


def _clean(value: str) -> str:
    return re.sub(r"[*_`]+", "", value).strip(" \t|.;")[:_MAX_VALUE].strip()


def _labelled(text: str, labels: tuple[str, ...]) -> str | None:
    for label in labels:
        # « au capital de » / « capital de » se lisent sans séparateur : la valeur suit directement.
        sep = r"\s+" if label.endswith(" de") else _SEP
        m = re.search(rf"(?im)(?:^|[\s*|>-]){re.escape(label)}{sep}([^\n|]+)", text)
        if m:
            value = _clean(m.group(1))
            if value:
                return value
    return None


def extract_legal_notice_fields(pages: list[dict[str, Any]] | None, *, detected_at: str | None) -> list[dict[str, Any]]:
    """Les champs publiés par les pages de mentions légales. Aucune page légale ou aucun champ = ``[]``."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for page in pages or []:
        url = str(page.get("url") or "")
        text = str(page.get("markdown") or "")
        if not text or not is_legal_notice_url(url):
            continue
        found: list[tuple[str, str]] = []
        for field, labels in _LABELS:
            value = _labelled(text, labels)
            if value:
                found.append((field, value))
        reg = _REGISTRATION.search(text)
        if reg:
            found.append(("immatriculation", _clean(re.sub(r"\s+", " ", reg.group(1)))))
        for field, value in found:
            if field in seen:
                continue  # la première page légale qui publie le champ fait foi
            seen.add(field)
            out.append({"field": field, "value": value, "sourceUrl": url, "detectedAt": detected_at})
    return out


__all__ = ["extract_legal_notice_fields"]
