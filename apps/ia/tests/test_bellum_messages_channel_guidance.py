"""#3259 (BEL-SC-230) NO-GO : « Laura génère immédiatement un email alors que
la meilleure route est une introduction ou un partenaire. »

Avant ce lot, `build_user_prompt` demandait TOUJOURS les trois canaux
(LinkedIn M1-M3, email, script téléphone) sans jamais dire au modèle LEQUEL
la méthode recommande de mener en premier pour CE compte — le NO-GO exact du
retour bêta. `channel_block` est additif, même contrat que `sector_block` /
`market_memory_block` : "" par défaut → prompt byte-identique.
"""

from __future__ import annotations

from app.prompts import bellum_messages
from app.services.opening_movement import channel_prompt_block

CONTACTS = [{"fullName": "Claire Dubois", "title": "DSI", "hierarchyLevel": "c_level"}]


def _prompt(channel_block: str = "") -> str:
    return bellum_messages.build_user_prompt("ACME", "contexte compte", CONTACTS, channel_block=channel_block)


def test_sans_bloc_canal_le_prompt_reste_byte_identique() -> None:
    baseline = bellum_messages.build_user_prompt("ACME", "contexte compte", CONTACTS)
    assert _prompt("") == baseline


def test_sans_sales_context_le_bloc_canal_est_vide() -> None:
    assert channel_prompt_block(None) == ""
    assert channel_prompt_block({}) == ""


def test_le_bloc_canal_nomme_le_no_go_et_le_canal_recommande() -> None:
    ctx = {
        "esnProfile": {"stage": "petite"},
        "account": {"archetype": "startup"},
        "relationship": {"state": "refere"},
    }
    block = channel_prompt_block(ctx)
    assert "CANAL RECOMMANDÉ" in block
    assert "introduction" in block
    assert "NO-GO" in block
    prompt = _prompt(block)
    assert "NO-GO" in prompt
    assert "introduction" in prompt


def test_le_canal_recommande_differe_dune_route_mediee_a_une_route_froide() -> None:
    mediated = channel_prompt_block(
        {"esnProfile": {"stage": "petite"}, "account": {"archetype": "startup"}, "relationship": {"state": "refere"}}
    )
    cold = channel_prompt_block(
        {"esnProfile": {"stage": "petite"}, "account": {"archetype": "pme_eti"}, "relationship": {"state": "froid"}}
    )
    assert mediated != cold
    assert "LinkedIn" in cold
