"""#3817.1 — variantes de nom pour l'appariement OFFRES d'un compte.

Un grand groupe s'enregistre sous une raison sociale (« JCDecaux France SAS »)
alors que ses offres d'emploi, publiées par ses propres systèmes RH ou lues
par les agrégateurs, portent la marque commerciale seule (« JCDecaux »).
Chercher ou comparer UNIQUEMENT le nom complet remonte zéro — pas parce que le
marché est vide, parce que l'appariement l'est. Mesuré (#3817) : JCDecaux
France, zéro offre alors que le groupe recrute en continu.

``company_name_variants`` rend le nom complet, puis — quand ils existent —
le nom sans son suffixe PAYS puis sans sa FORME JURIDIQUE (les deux retirés
ensemble quand ils coexistent, jamais un seul caractère de plus), puis le
SIREN quand il est connu. Dédupliqué, ordre préservé (le plus précis
d'abord), jamais de variante vide.
"""

from __future__ import annotations

import unicodedata

# Fermé et écrit à la main, comme les vocabulaires voisins (`esn_name_match`,
# `territory_overview`) — une règle « intelligente » sur des raisons sociales
# françaises rapprocherait n'importe quoi de n'importe quoi.
_COUNTRY_SUFFIXES = frozenset({"france"})
_LEGAL_FORM_SUFFIXES = frozenset(
    {"sasu", "sas", "sarl", "eurl", "sa", "se", "snc", "scop", "gie", "sci"}
)


def _fold(value: str) -> str:
    text = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()


def company_name_variants(company: str | None, *, siren: str | None = None) -> list[str]:
    """Le nom complet, puis ses formes réduites, puis le SIREN — dédupliqués."""
    cleaned = " ".join((company or "").split())
    variants: list[str] = []
    seen: set[str] = set()

    def add(value: str | None) -> None:
        v = " ".join((value or "").split())
        key = _fold(v)
        if v and key not in seen:
            seen.add(key)
            variants.append(v)

    add(cleaned)

    tokens = cleaned.split()
    trimmed = list(tokens)
    if trimmed and _fold(trimmed[-1]) in _COUNTRY_SUFFIXES:
        trimmed = trimmed[:-1]
        add(" ".join(trimmed))
    if trimmed and _fold(trimmed[-1]).rstrip(".") in _LEGAL_FORM_SUFFIXES:
        trimmed = trimmed[:-1]
        add(" ".join(trimmed))

    add(siren)

    return variants
