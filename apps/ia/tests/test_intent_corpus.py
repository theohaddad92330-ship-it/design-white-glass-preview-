"""#2257.38-43 — le corpus de RECETTE du compilateur d'intention.

Aucun classificateur déterministe n'extrait aujourd'hui l'intention d'une
demande (mesuré au registre `.claude/notes/registre-2026-09-17-lau-002-2257.md`,
lignes #2257.44-48) : ce corpus FIGE l'intention ATTENDUE sur un échantillon
réaliste pour le jour où une capacité la produira. Ces tests prouvent la
FORME et la DIVERSITÉ du corpus — jamais un jugement sémantique, et surtout
AUCUN APPEL AU MODÈLE (le ticket l'exige explicitement).
"""

from __future__ import annotations

import json
from pathlib import Path

_CORPUS_PATH = Path(__file__).resolve().parent.parent / "app" / "eval" / "chat" / "intent_corpus.json"


def _load_cases() -> list[dict]:
    data = json.loads(_CORPUS_PATH.read_text(encoding="utf-8"))
    return data["cases"]


def test_corpus_porte_au_moins_trente_requetes():
    cases = _load_cases()
    assert len(cases) >= 30


def test_chaque_cas_a_un_identifiant_unique_et_une_intention_attendue():
    cases = _load_cases()
    ids = [case["id"] for case in cases]
    assert len(ids) == len(set(ids)), "des identifiants sont dupliqués"
    for case in cases:
        assert case["message"], f"{case['id']} : message vide"
        assert case["expected_intention_principale"], f"{case['id']} : intention attendue vide"


def test_couvre_au_moins_vingt_secteurs_distincts():
    cases = _load_cases()
    sectors = {case["sector"] for case in cases}
    assert len(sectors) >= 20


def test_porte_au_moins_trois_conversations_reelles_avec_historique():
    cases = _load_cases()
    real_conversations = [case for case in cases if "real_conversation" in case.get("tags", [])]
    assert len(real_conversations) >= 3
    for case in real_conversations:
        assert case.get("history"), f"{case['id']} : conversation réelle sans historique"


def test_porte_des_demandes_au_style_vocal():
    cases = _load_cases()
    voice_cases = [case for case in cases if "voice" in case.get("tags", [])]
    assert len(voice_cases) >= 2


def test_porte_des_formulations_contradictoires():
    cases = _load_cases()
    contradictory_cases = [case for case in cases if "contradictory" in case.get("tags", [])]
    assert len(contradictory_cases) >= 2


def test_melange_utilisateurs_debutants_et_experts():
    cases = _load_cases()
    profiles = {case["profile"] for case in cases}
    assert "novice" in profiles
    assert "expert" in profiles
