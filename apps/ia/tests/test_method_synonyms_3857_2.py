"""#3857.2 — synonymes et abréviations métier (BI, BA, DSI, RSSI…) dans la
recherche de méthode / connaissances de Laura.

Décision de Louis (10/10/2026) : une TABLE de synonymes versionnée dans le code
(un seul endroit), utilisée à la recherche — pas de ré-index vectoriel.
"""

from __future__ import annotations

from app.services import method_knowledge as mk
from app.services.method_synonyms import SYNONYM_GROUPS, synonym_tags


def _hits(query: str, title: str, content: str = "") -> int:
    chunk = mk._chunk(title, content)
    return mk._score(chunk, mk._tokens(query))


def test_business_intelligence_trouve_un_document_qui_dit_bi():
    assert _hits("business intelligence", "Cadrer un projet BI") >= mk._MIN_SCORE


def test_bi_trouve_un_document_qui_dit_business_intelligence():
    assert _hits("BI", "Cadrer un projet de business intelligence") >= mk._MIN_SCORE


def test_autres_abreviations_metier():
    assert _hits("le RSSI", "Parler au responsable sécurité des systèmes d'information") >= mk._MIN_SCORE
    assert _hits("directeur des systèmes d'information", "Approcher la DSI") >= mk._MIN_SCORE
    assert _hits("business analyst", "Rôle du BA en cadrage") >= mk._MIN_SCORE


def test_pas_de_faux_positif_sur_une_sous_chaine():
    # « bi » dans « bibliothèque » / « BIM » n'est pas la BI.
    assert synonym_tags("la bibliotheque municipale") == set()
    assert synonym_tags("maquette bim") == set()
    assert _hits("bibliothèque", "Cadrer un projet BI") < mk._MIN_SCORE


def test_table_a_un_seul_endroit_et_sans_doublon():
    seen: set[str] = set()
    for group in SYNONYM_GROUPS:
        for term in group:
            assert term not in seen, f"{term!r} figure dans deux groupes"
            seen.add(term)
