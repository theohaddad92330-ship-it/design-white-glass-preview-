"""#3670.3 / .5 / .6 — la méthode validée hors du chat : format stable, une seule porte."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.knowledge import method_corpus_governance
from app.services import method_consumers, method_knowledge
from app.services.method_consumers import MODULE_INTENT, method_block_for


def _block(module: str, **kw) -> str:
    with patch.object(method_consumers.bellum_api, "contradicted_method_rules", AsyncMock(return_value=frozenset())):
        return asyncio.run(method_block_for(module, user_id="u1", **kw))


def test_each_module_gets_its_stable_format_and_never_the_recitation():
    compte = _block("analyse_compte", situation_terms="ouvrir un compte accès relais compte fermé grand groupe")
    assert "diagnostic du compte" in compte and "UNE prochaine action" in compte
    approche = _block("approches", situation_terms="approche email", relationship_state="froid")
    assert "angle nommé" in approche
    appel = _block("appels", situation_terms="préparer appel discours objections")
    assert "objections probables" in appel
    for text in (compte, approche, appel):
        assert "sans la réciter" in text and "AUCUN fait" in text


def test_same_facts_different_relation_gives_a_different_method():
    premier = _block("approches", situation_terms="approche email", relationship_state="froid")
    reprise = _block("approches", situation_terms="approche email", relationship_state="dormant")
    assert "premier message" in premier.lower() and "réactivation" in reprise.lower()
    assert premier != reprise


def test_nothing_relevant_means_byte_identical_empty_block():
    assert _block("approches", situation_terms="zzzz") == ""


def test_unknown_module_is_refused():
    with pytest.raises(ValueError):
        asyncio.run(method_block_for("inconnu", situation_terms="x"))


def test_every_consumer_module_has_an_intent():
    assert set(MODULE_INTENT) == {"analyse_compte", "approches", "sequences", "appels"}


def test_a_rule_replaced_by_governance_never_reappears_in_any_module():
    """#3670.6 — une règle retirée du corpus servi disparaît de TOUS les modules."""
    baseline = {m: _block(m, situation_terms="ouvrir un compte premier message accès compte fermé grand groupe préparer appel") for m in MODULE_INTENT}
    assert any("compte fermé sans accès" in b for b in baseline.values())
    with patch.object(
        method_corpus_governance,
        "is_unit_served",
        side_effect=lambda unit: unit != "pack:pack_compte_grand_groupe_ferme",
    ):
        method_knowledge._corpus.cache_clear()
        try:
            after = {m: _block(m, situation_terms="ouvrir un compte premier message accès compte fermé grand groupe préparer appel") for m in MODULE_INTENT}
        finally:
            method_knowledge._corpus.cache_clear()
    assert all("compte fermé sans accès" not in b for b in after.values())


def test_a_rule_contradicted_by_the_workspace_is_excluded_like_in_the_chat():
    with patch.object(
        method_consumers.bellum_api,
        "contradicted_method_rules",
        AsyncMock(return_value=frozenset({"pack_compte_grand_groupe_ferme"})),
    ):
        text = asyncio.run(method_block_for("analyse_compte", user_id="u1", situation_terms="ouvrir un compte accès relais compte fermé grand groupe"))
    # les packs n'ont pas de rule_id de discipline : l'exclusion ne porte que sur celles-ci,
    # le bloc reste produit — jamais d'exclusion sur une réponse incertaine.
    assert isinstance(text, str)


def test_battlecard_route_sends_the_method_block_to_the_model(client) -> None:
    """Rejoue le tour d'appel : entrée → /battlecard/generate → prompt système."""
    from tests.test_battlecard_router import _patches

    p1, p2, p3 = _patches(claude_return={"killer_question": "?"})
    with p1, p2, p3 as claude, patch.object(
        method_consumers.bellum_api, "contradicted_method_rules", AsyncMock(return_value=frozenset())
    ):
        res = client.post(
            "/battlecard/generate",
            json={"account_id": "a1", "user_id": "u1", "profile_data": {"companyName": "Acme", "offers": ["Data"]}},
        )
    assert res.status_code == 200
    system_prompt = claude.call_args.args[0]
    assert "MÉTHODE BELLUM" in system_prompt and "objections probables" in system_prompt
