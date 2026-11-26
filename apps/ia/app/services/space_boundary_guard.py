"""#4183 (EX-14, P0) — Laura ne nomme JAMAIS un contact d'un autre espace ni une provenance.

Le STOCKAGE est déjà gardé (CHECK ``contributing_workspaces >= 3``, ``workspace_id = $1``,
GA-43). Ce module garde ce que le MODÈLE lit et dit :

· CÔTÉ OUTIL (``redact_foreign_identity``) — les outils au corpus PARTAGÉ
  (``SHARED_CORPUS_TOOLS``) promettent de ne porter AUCUNE identité de personne ni aucune
  provenance. Une clé qui nomme une personne, un espace contributeur ou un fournisseur est un
  BUG de projection, jamais une donnée : elle est retirée avant le modèle et la fuite est
  signalée (même chemin ``leak_detected`` que la PII, ``shared_corpus_pii_guard``). Les outils
  de portefeuille ne sont jamais touchés : les contacts de l'appelant sont leur raison d'être.
· CÔTÉ RÉPONSE (``market_memory_boundary_codes``) — sur un tour qui a lu la mémoire marché, la
  réponse ne nomme ni un fournisseur ni l'espace contributeur. Codes OBSERVATIONNELS (mesurer
  avant de bloquer), comme ``market_memory_citation``.

La liste des fournisseurs vient de ``TITLE_FORBIDDEN_VENDORS`` (un réglage, un endroit, GA-26).
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

from app.prompts.bellum_chat_title import TITLE_FORBIDDEN_VENDORS
from app.services.shared_corpus_pii_guard import SHARED_CORPUS_TOOLS

MARKET_MEMORY_FOURNISSEUR_NOMME = "memoire_marche_fournisseur_nomme"
MARKET_MEMORY_ESPACE_NOMME = "memoire_marche_espace_nomme"

_REMOVED = "[retiré — #4183]"

#: Clés (normalisées : minuscules, sans ``_``/``-``) qui NOMMENT une personne, un espace
#: contributeur ou une provenance. Ensemble FERMÉ et exact : ``company_name`` ou
#: ``coverage`` ne sont jamais attrapés.
_FORBIDDEN_KEYS = frozenset(
    {
        "contactname",
        "personname",
        "fullname",
        "firstname",
        "lastname",
        "contacts",
        "contributingworkspaces",
        "contributingworkspace",
        "contributingspaces",
        "contributor",
        "contributors",
        "workspacename",
        "spacename",
        "provider",
        "providers",
        "supplier",
        "vendor",
        "provenance",
        "datasource",
    }
)


#: ``persons`` / ``people`` portent aussi des COMPTES légitimes (``esn_observed[].persons: 5``,
#: « 5 personnes observées ») : seule une valeur qui n'est PAS un nombre nomme quelqu'un.
_COUNT_OR_NAMES_KEYS = frozenset({"persons", "people"})


def _names_someone(key: str, value: Any) -> bool:
    norm = _norm_key(key)
    if norm in _FORBIDDEN_KEYS:
        return True
    return norm in _COUNT_OR_NAMES_KEYS and not isinstance(value, bool | int | float)


def _norm_key(key: str) -> str:
    return key.lower().replace("_", "").replace("-", "")


def _redact(value: Any) -> tuple[Any, bool]:
    if isinstance(value, dict):
        out: dict[Any, Any] = {}
        leaked = False
        for key, val in value.items():
            if isinstance(key, str) and _names_someone(key, val):
                leaked = True
                continue
            new_val, sub = _redact(val)
            out[key] = new_val
            leaked = leaked or sub
        return out, leaked
    if isinstance(value, list):
        items = [_redact(item) for item in value]
        return [item for item, _ in items], any(sub for _, sub in items)
    return value, False


def redact_foreign_identity(tool_name: str, result: Any) -> tuple[Any, bool]:
    """``(résultat nettoyé, fuite détectée)``. Hors ``SHARED_CORPUS_TOOLS`` : rendu tel quel."""
    if tool_name not in SHARED_CORPUS_TOOLS:
        return result, False
    return _redact(result)


_VENDOR_RE = re.compile(
    "|".join(rf"(?<![\w-]){re.escape(v)}(?![\w-])" for v in TITLE_FORBIDDEN_VENDORS),
    re.IGNORECASE,
)
_SPACE_RE = re.compile(
    r"\bespaces?\s+contributeurs?\b|\bautres?\s+espaces?\b|\bcontributing\s+workspaces?\b"
    r"|\bother\s+workspaces?\b",
    re.IGNORECASE,
)


def _turn_read_market_memory(tool_outputs: Iterable[str]) -> bool:
    return any('"methodological_limits"' in raw for raw in tool_outputs)


def market_memory_boundary_codes(text: str, tool_outputs: Iterable[str]) -> tuple[str, ...]:
    """Codes observationnels : la réponse nomme-t-elle un fournisseur ou l'espace contributeur ?

    Sans lecture de la mémoire marché ce tour, rien n'est décidable : ``()``."""
    outputs = list(tool_outputs)
    if not text or not _turn_read_market_memory(outputs):
        return ()
    codes: list[str] = []
    if _VENDOR_RE.search(text):
        codes.append(MARKET_MEMORY_FOURNISSEUR_NOMME)
    if _SPACE_RE.search(text):
        codes.append(MARKET_MEMORY_ESPACE_NOMME)
    return tuple(codes)
