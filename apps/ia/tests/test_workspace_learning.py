"""Boucle d'apprentissage de l'ESN (restitution V2 §6).

Ce qui est vérifié : le silence par défaut (une équipe qui n'a rien déplacé lance
un run byte-identique à avant la feature) et les garde-fous ÉCRITS dans le bloc —
c'est le seul endroit où le modèle les lira.
"""

from app.models.plan import PlanRequest
from app.services.workspace_learning import workspace_learning_block


def test_absent_learning_is_silent():
    assert workspace_learning_block(None) == ""
    assert workspace_learning_block("") == ""
    assert workspace_learning_block("   \n  ") == ""


def test_block_cites_the_counts_verbatim():
    block = workspace_learning_block("- Banque · Cloud : 3 convertis, 1 déclaré obsolète")
    assert "- Banque · Cloud : 3 convertis, 1 déclaré obsolète" in block


def test_block_states_it_says_nothing_about_the_target():
    block = workspace_learning_block("- Retail · Data : 2 convertis")
    # Le garde-fou le plus important : ne PAS transférer une statistique interne
    # en affirmation sur l'entreprise analysée.
    assert "PAS l'entreprise analysée" in block
    assert "PRIORISER" in block
    assert "priment toujours" in block


def test_block_is_capped():
    block = workspace_learning_block("x" * 10_000)
    assert len(block) < 3_000


def test_plan_request_defaults_to_no_learning():
    # Un appelant qui ne thread pas le champ obtient exactement l'ancien prompt.
    assert PlanRequest(account_id="a").workspace_learning == ""
