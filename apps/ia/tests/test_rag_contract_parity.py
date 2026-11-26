"""Les repères du RAG sont les MÊMES des deux côtés du fil.

Le contrat partagé (`packages/contracts/src/schemas/rag.ts`) et le service IA
portent chacun leur copie — la racine Railway du service IA est `apps/ia`, donc
`packages/` n'est pas dans son contexte de build et rien ne peut être importé.
Deux copies qui divergent produiraient un classement différent selon le service
qui l'a calculé, et personne ne saurait lequel croire.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services import rag_knowledge, rag_service

CONTRACT = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "src" / "schemas" / "rag.ts"


def _const(name: str) -> str:
    source = CONTRACT.read_text(encoding="utf-8")
    match = re.search(rf"export const {name} = ([0-9.]+)", source)
    assert match, f"{name} introuvable dans le contrat partagé"
    return match.group(1)


@pytest.mark.skipif(not CONTRACT.exists(), reason="contrat partagé hors du contexte de build")
def test_the_decay_horizon_is_the_same_on_both_sides():
    assert float(_const("RAG_DECAY_HORIZON_DAYS")) == float(rag_service.RAG_DECAY_HORIZON_DAYS)


@pytest.mark.skipif(not CONTRACT.exists(), reason="contrat partagé hors du contexte de build")
def test_the_decay_floor_is_the_same_on_both_sides():
    assert float(_const("RAG_MAX_DECAY")) == float(rag_service.RAG_MAX_DECAY)


@pytest.mark.skipif(not CONTRACT.exists(), reason="contrat partagé hors du contexte de build")
def test_the_purge_window_is_the_same_on_both_sides():
    assert float(_const("RAG_PURGE_AFTER_MONTHS")) == float(rag_service.RAG_PURGE_AFTER_MONTHS)


@pytest.mark.skipif(not CONTRACT.exists(), reason="contrat partagé hors du contexte de build")
def test_the_categories_are_the_same_and_in_the_same_ORDER():
    source = CONTRACT.read_text(encoding="utf-8")
    block = re.search(r"export const RAG_CATEGORIES = \[(.*?)\] as const", source, re.S)
    assert block
    declared = re.findall(r"'([a-z_]+)'", block.group(1))
    # L'ordre compte : les trois historiques restent en tête (M4).
    assert declared == list(rag_knowledge.RAG_CATEGORIES)


@pytest.mark.skipif(not CONTRACT.exists(), reason="contrat partagé hors du contexte de build")
def test_the_document_scopes_are_the_same_on_both_sides():
    """#2779 — les cinq portées, dans le même ordre : une portée ajoutée d'un
    seul côté serait écrite par l'un et ignorée (ou refusée) par l'autre."""
    source = CONTRACT.read_text(encoding="utf-8")
    match = re.search(r"export const RAG_DOCUMENT_SCOPES = \[([^\]]+)\]", source)
    assert match, "RAG_DOCUMENT_SCOPES introuvable dans le contrat partagé"
    ts_scopes = tuple(re.findall(r"'([a-z_]+)'", match.group(1)))
    assert ts_scopes == rag_service.RAG_DOCUMENT_SCOPES


@pytest.mark.skipif(not CONTRACT.exists(), reason="contrat partagé hors du contexte de build")
def test_the_processing_statuses_are_the_same_on_both_sides():
    """#3669.2 — les cinq statuts de traitement, même ordre des deux côtés."""
    source = CONTRACT.read_text(encoding="utf-8")
    match = re.search(r"export const RAG_PROCESSING_STATUSES = \[([^\]]+)\]", source)
    assert match, "RAG_PROCESSING_STATUSES introuvable dans le contrat partagé"
    assert tuple(re.findall(r"'([a-z_]+)'", match.group(1))) == rag_service.RAG_PROCESSING_STATUSES
