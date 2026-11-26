"""#3586 (lot W1) — le savoir du Drive interne entre dans les prompts À LA REQUÊTE.

Verrouillé : le bloc dédié (source nommée, hors « documents de l'utilisateur »),
le prompt byte-identique quand le Drive est vide, un seul embedding par requête,
et le bloc reçu par le prompt signals et par le prompt d'angle Découvrir.
"""

from __future__ import annotations

import inspect

import pytest

from app.prompts import bellum_discover, bellum_signals
from app.routers import chat, discover, phase1_research, phase4_plan
from app.services import dataforge_rag_chunks, rag_knowledge


@pytest.fixture(autouse=True)
def _vide_memoisation():
    rag_knowledge.clear_drive_cache()
    yield
    rag_knowledge.clear_drive_cache()


def _chunk(titre: str, texte: str, type_chunk: str = "DRIVE_INTERNE") -> dict:
    return {"type_chunk": type_chunk, "titre": titre, "texte": texte}


def _patch_search(monkeypatch, rows: list[dict]) -> list[tuple]:
    calls: list[tuple] = []

    async def fake(query_text, account_id=None, top_k=8, type_chunk=None):
        calls.append((query_text, account_id, top_k, type_chunk))
        return rows

    monkeypatch.setattr(dataforge_rag_chunks, "search_dataforge_rag_chunks", fake)
    return calls


async def test_bloc_porte_la_source_du_drive(monkeypatch):
    _patch_search(monkeypatch, [_chunk("Playbook banque.docx", "Entrer par la DSI.")])
    block = await rag_knowledge.retrieve_drive_context("banque cloud")
    assert "SAVOIR MÉTIER BELLUM" in block
    assert "[Source : Playbook banque.docx] Entrer par la DSI." in block
    assert "PAS une donnée du compte prospecté" in block


async def test_filtre_de_type_en_sql_top_k_6_sans_surrecuperation(monkeypatch):
    # #3586 W3 — le filtre DRIVE_INTERNE part au RPC ; plus de top_k 40 ni de filtre Python.
    calls = _patch_search(monkeypatch, [_chunk("A.docx", "texte")])
    await rag_knowledge.retrieve_drive_context("banque cloud", account_id="acc1")
    assert calls == [("banque cloud", "acc1", 6, "DRIVE_INTERNE")]


async def test_deux_fichiers_identiques_ninjectent_le_texte_qu_une_fois(monkeypatch):
    # #3586 — MARKET_MEMORY_FINALISE.xlsx existe en deux exemplaires : les deux restent indexés,
    # mais le même texte ne part qu'une fois dans le prompt (titres différents inclus).
    same = "Mémoire marché : " + "x" * 300
    _patch_search(
        monkeypatch,
        [
            _chunk("MARKET_MEMORY_FINALISE.xlsx", same),
            _chunk("Copie de MARKET_MEMORY.xlsx", same),
            _chunk("B.docx", "autre"),
        ],
    )
    block = await rag_knowledge.retrieve_drive_context("marché")
    assert block.count("Mémoire marché") == 1
    assert "[Source : B.docx] autre" in block


async def test_vide_donne_chaine_vide_et_contexte_inchange(monkeypatch):
    _patch_search(monkeypatch, [])
    block = await rag_knowledge.retrieve_drive_context("banque cloud")
    assert block == ""
    assert rag_knowledge.append_drive_block("ctx", block) == "ctx"


async def test_sans_cle_zero_reseau(monkeypatch):
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    assert await rag_knowledge.retrieve_drive_context("banque cloud") == ""


async def test_un_seul_appel_par_requete_memoise(monkeypatch):
    calls = _patch_search(monkeypatch, [_chunk("A.docx", "texte")])
    a = await rag_knowledge.retrieve_drive_context("même requête", account_id="acc1")
    b = await rag_knowledge.retrieve_drive_context("même  requête", account_id="acc1")
    assert a == b != ""
    assert len(calls) == 1


async def test_bloc_borne_et_tronque_proprement(monkeypatch):
    long = "mot " * 400
    _patch_search(monkeypatch, [_chunk(f"F{i}.docx", long) for i in range(6)])
    block = await rag_knowledge.retrieve_drive_context("q")
    assert len(block) < 6500
    assert block.count("[Source :") < 6  # le budget coupe entre deux lignes
    assert all(line.startswith(("- [Source", "=====", "<", "</")) or not line for line in block.splitlines())


def test_append_drive_block_sans_contexte_rend_le_bloc():
    assert rag_knowledge.append_drive_block("", "BLOC") == "BLOC"
    assert rag_knowledge.append_drive_block("ctx", "BLOC") == "ctx\n\nBLOC"


def _signals(**kw) -> str:
    return bellum_signals.build_user_prompt("ACME", "brave", "scrape", "pappers", **kw)


def test_prompt_signals_recoit_le_bloc_et_reste_identique_sans():
    assert _signals() == _signals(internal_knowledge="")
    with_block = _signals(internal_knowledge="SAVOIR-DRIVE")
    assert "SAVOIR-DRIVE" in with_block
    assert with_block.replace("\n\nSAVOIR-DRIVE", "") == _signals()


def test_prompt_angle_decouvrir_recoit_le_bloc_et_reste_identique_sans():
    base = bellum_discover.build_angle_user_prompt([{"siren": "1"}], {"sector": "banque"})
    assert base == bellum_discover.build_angle_user_prompt([{"siren": "1"}], {"sector": "banque"}, internal_knowledge="")
    with_block = bellum_discover.build_angle_user_prompt(
        [{"siren": "1"}], {"sector": "banque"}, internal_knowledge="SAVOIR-DRIVE"
    )
    assert "SAVOIR-DRIVE" in with_block


async def test_decouvrir_un_appel_drive_par_requete_pas_par_siren(monkeypatch):
    calls = _patch_search(monkeypatch, [_chunk("Angles.docx", "Entrer par la DSI.")])
    seen: dict = {}

    async def fake_call_claude(system, user, **kwargs):
        seen["user"] = user
        return {"angles": []}, None

    monkeypatch.setattr(discover, "call_claude", fake_call_claude)
    companies = [{"siren": str(i)} for i in range(5)]
    await discover._angles_by_siren(companies, {"offers": ["cloud"]}, {"sector": "banque", "limit": 10}, [])
    assert len(calls) == 1
    assert "[Source : Angles.docx]" in seen["user"]


def test_les_chemins_phase1_phase4_chat_appellent_le_bloc_drive():
    # Garde de câblage : le bloc est calculé UNE fois par passage puis transmis.
    p1 = inspect.getsource(phase1_research)
    assert "retrieve_drive_context" in p1 and "internal_knowledge=_drive_ctx" in p1
    p4 = inspect.getsource(phase4_plan)
    assert p4.count("retrieve_drive_context") == 1
    assert "append_drive_block(messages_user, _drive_ctx)" in p4
    assert "append_drive_block(plan_knowledge, _drive_ctx)" in p4
    ch = inspect.getsource(chat)
    assert ch.count("retrieve_drive_context") == 1
    assert 'append_before_language_reminder(system, f"\\n\\n{drive_context}"' in ch


def test_chat_drive_hors_garde_base_documentaire_tous_modes():
    # #3586 W3 — le savoir Bellum interne n'est PAS la base documentaire de l'utilisateur :
    # il s'injecte aussi en Neutre / Mission ponctuelle. L'appel ne vit pas sous la garde.
    ch = inspect.getsource(chat)
    garde = ch.index("if knowledge_base_allowed(req.context_mode or \"\"):")
    sinon = ch.index("else:", garde)
    appel = ch.index("rag_knowledge.retrieve_drive_context(")
    assert not (garde < appel < sinon)
