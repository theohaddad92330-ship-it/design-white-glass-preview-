"""Le thread du checkpointer décide de ce qu'un run RE-CALCULE.

Le checkpointer est durable en prod et sa liste ``completed`` ne fait que
grandir. Tant que le thread était le COMPTE, toute ré-analyse rouvrait un thread
où les quatre phases étaient déjà marquées faites : le graphe sautait tout, la
phase 4 n'écrivait rien, et le compte restait bloqué en ``analyzing`` pendant que
le run s'annonçait en succès.

La bonne granularité est le RUN : les tentatives d'un même run se reprennent
(auto-guérison après un flux coupé), une nouvelle analyse repart à neuf.
"""

from __future__ import annotations

from app.routers.graph_analyze import _thread_id


def test_same_run_keeps_one_thread_so_a_retry_resumes() -> None:
    # Une reprise BullMQ garde le même run : elle doit retomber sur le thread
    # qui porte déjà les phases payées.
    first = _thread_id("acc-1", "job-42")
    second = _thread_id("acc-1", "job-42")

    assert first == second


def test_a_new_run_on_the_same_account_gets_a_new_thread() -> None:
    # Le cœur du bug : deux analyses successives du MÊME compte ne doivent pas
    # partager un checkpoint, sinon la seconde ne calcule rien.
    assert _thread_id("acc-1", "job-42") != _thread_id("acc-1", "job-43")


def test_the_account_still_scopes_the_thread() -> None:
    # Deux comptes ne se marchent jamais dessus, même sous le même run.
    assert _thread_id("acc-1", "job-42") != _thread_id("acc-2", "job-42")


def test_without_a_run_the_account_thread_is_kept_unchanged() -> None:
    # Rétrocompat : un appelant qui ne fournit pas de run garde le comportement
    # historique (thread = compte), donc les reprises déjà en vol continuent.
    assert _thread_id("acc-1", "") == "acc-1"


def test_without_an_account_each_call_gets_its_own_thread() -> None:
    # Aucun ancrage : deux runs anonymes ne doivent jamais se recouvrir.
    assert _thread_id("", "") != _thread_id("", "")
