"""#3262.22 / #3262.29 (épopée #3284, lot X47 02/10) — les deux règles de compte
de BEL-SC-233 (cadence de revue configurable, logo prestigieux) étaient dans
`METHOD_CORPUS_V1` sans aucun chunk Python : Laura ne pouvait pas les citer.
Ces tests rejouent la question d'un commercial et exigent le chunk cité."""

from __future__ import annotations

import pytest

from app.knowledge import method_corpus_governance
from app.services import method_knowledge

CADENCE = "cadence_de_revue_configurable"
LOGO = "logo_prestigieux_ne_justifie_jamais_la_priorite"


@pytest.fixture(autouse=True)
def _cleared_corpus_cache():
    method_knowledge._corpus.cache_clear()
    yield
    method_knowledge._corpus.cache_clear()


def test_les_deux_regles_sont_gouvernees_cote_python() -> None:
    wired = set(method_corpus_governance.wired_rule_ids())
    assert {CADENCE, LOGO} <= wired


def test_logo_prestigieux_est_retrouve_et_non_ecartable() -> None:
    chunks = method_knowledge.retrieve_method_chunks(
        "je garde ce compte en priorité parce que c'est un logo prestigieux, ça marche ?"
    )
    body = next(str(c) for c in chunks if "logo" in str(c).lower() and "prioritaire" in str(c).lower())
    assert "signal d’affaires réel" in body
    # Un invariant : aucune phrase « une correction peut l'écarter ».
    assert "peut l'écarter" not in body


def test_cadence_est_retrouvee_et_reglable() -> None:
    chunks = method_knowledge.retrieve_method_chunks("quelle cadence de revue pour un compte écarté ?")
    body = next(str(c) for c in chunks if "cadence de revue" in str(c).lower())
    assert "catégorie" in body and "capacité" in body
    assert "Une correction du commercial peut l'écarter." in body


def test_desactiver_la_regle_la_retire_du_retrieval(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(method_corpus_governance._ENABLED_BY_RULE_ID, LOGO, False)
    method_knowledge._corpus.cache_clear()
    chunks = method_knowledge.retrieve_method_chunks("logo prestigieux priorité maintien")
    assert not any("logo est prestigieux" in str(c) for c in chunks)
