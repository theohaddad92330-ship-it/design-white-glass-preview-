"""Prestataire détecté par mention LÉGALE ou page PARTENAIRE — #3205.1 (épopée
#3239, lot M05 29/09/2026).

Deux sources de plus pour #3205 (LAU-FINAL-211 — PROVIDER FOOTPRINT), extension
DÉLIBÉRÉE de #3095 (`site_credit_partners.py`), même doctrine : zéro nouveau
fournisseur, zéro appel réseau supplémentaire — ces fonctions relisent les
pages QUE LE RUN SCRAPE DÉJÀ (`ResearchBundle`), même source que
`collect_site_credit_partners`, et cherchent une mention suivie d'un nom que le
référentiel ESN CONNAÎT (`known_esn_names`). Sans preuve, une entrée n'apparaît
PAS (doctrine « on n'affiche pas ce qu'on n'a pas ») : un nom cité ailleurs sur
la page sans marqueur à proximité n'est qu'une mention, jamais un prestataire.

Deux formes, DISTINCTES du crédit de pied de page déjà couvert par #3095 :

- MENTIONS LÉGALES (`collect_legal_notice_partners`) : un champ LABELLISÉ de
  page légale (« Réalisation : X », « Conception : Y »…) — le format d'une
  page mentions légales, pas la formule libre de pied de page. `Hébergement`
  est volontairement ABSENT des marqueurs : héberger un site n'est pas un
  prestataire IT commercial au sens de la spec (#3205, EXTRACTION).
- PAGES PARTENAIRES (`collect_partner_page_mentions`) : une mise en avant
  EXPLICITE de partenariat (« partenaire officiel », « en partenariat avec »…),
  jamais une simple co-mention en prose libre — la doctrine du ticket
  l'interdit explicitement (#3205, INTERDICTIONS : « appeler toute agence
  visible un concurrent »), et la même prudence vaut à l'envers pour un
  partenaire supposé.

Les deux autres sources nommées par #3205.1 (sous-domaines, crédits de site
AU-DELÀ de #3095) restent hors de cette tranche : aucune des deux ne se lit
sur une page déjà scrapée, chacune suppose un fetch réseau neuf — raison déjà
posée par l'épopée #3239 et confirmée à nouveau ce soir, pas recopiée.
"""

from __future__ import annotations

import re
from typing import Any

from app.knowledge import known_esn_names
from app.services.text_norm import normalize_name

# Champs labellisés d'une page « mentions légales » — FR uniquement, c'est le
# vocabulaire réglementaire français (LCEN). `Hébergement` exclu à dessein
# (voir docstring du module).
_LEGAL_NOTICE_MARKERS = (
    "realisation :",
    "conception :",
    "developpement :",
    "creation :",
    "credits :",
    "credit :",
)

# Mise en avant EXPLICITE d'un partenariat — FR + EN. Volontairement plus
# étroit qu'une simple co-mention : chaque marqueur porte le mot « partenaire »
# / « partnership » lui-même, jamais une conjonction neutre (« et », « with »).
_PARTNER_PAGE_MARKERS = (
    "partenaire officiel",
    "partenaire privilegie",
    "notre partenaire",
    "en partenariat avec",
    "official partner",
    "in partnership with",
    "our partner",
)

# Même borne que #3095 : une ligne de pied de page ou un intitulé de section
# tient largement dedans, un paragraphe entier séparant marqueur et nom ne le
# devrait pas.
_MAX_GAP = 40


def _collect(
    pages: list[dict[str, Any]] | None, *, markers: tuple[str, ...], detected_at: str | None
) -> list[dict[str, Any]]:
    if not isinstance(pages, list):
        return []
    names = known_esn_names()
    if not names:
        return []

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for page in pages:
        if not isinstance(page, dict):
            continue
        url = str(page.get("url") or "").strip()
        markdown = page.get("markdown")
        if not url or not isinstance(markdown, str) or not markdown.strip():
            continue
        text = normalize_name(markdown)

        for name in names:
            key = normalize_name(name)
            if not key or key in seen:
                continue
            name_re = re.escape(key)
            marker = next(
                (
                    m
                    for m in markers
                    if re.search(rf"{re.escape(m)}.{{0,{_MAX_GAP}}}{name_re}", text)
                    or re.search(rf"{name_re}.{{0,{_MAX_GAP}}}{re.escape(m)}", text)
                ),
                None,
            )
            if marker is None:
                continue
            seen.add(key)
            out.append(
                {
                    "name": name,
                    # Même barème que #3095 : preuve TEXTUELLE + société que le
                    # référentiel connaît, les deux corroborations
                    # indépendantes valent « forte » (esn_presence._certainty).
                    "certainty": "forte",
                    "scope": None,
                    "detectedAt": detected_at,
                    "evidence": f"{evidence_label(marker)} sur {url} (« {marker} »).",
                }
            )
    return out


def evidence_label(marker: str) -> str:
    if marker in _LEGAL_NOTICE_MARKERS:
        return "Mention légale détectée"
    return "Mention de partenariat détectée"


def collect_legal_notice_partners(
    pages: list[dict[str, Any]] | None,
    *,
    detected_at: str | None,
) -> list[dict[str, Any]]:
    """Balaye les pages déjà scrapées pour un champ labellisé de mentions
    légales (« Réalisation : X »). ``pages`` = ``[{"url", "markdown"}]``."""
    return _collect(pages, markers=_LEGAL_NOTICE_MARKERS, detected_at=detected_at)


def collect_partner_page_mentions(
    pages: list[dict[str, Any]] | None,
    *,
    detected_at: str | None,
) -> list[dict[str, Any]]:
    """Balaye les pages déjà scrapées pour une mise en avant explicite de
    partenariat (« partenaire officiel », « in partnership with »).
    ``pages`` = ``[{"url", "markdown"}]``."""
    return _collect(pages, markers=_PARTNER_PAGE_MARKERS, detected_at=detected_at)


__all__ = ["collect_legal_notice_partners", "collect_partner_page_mentions"]
