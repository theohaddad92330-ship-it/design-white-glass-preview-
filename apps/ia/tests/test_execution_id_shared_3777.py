"""#3777 / #3717.7 (lot W9, décision Louis 11/10/2026) — UN identifiant d'exécution partagé.

Le plan multi-semaines et « Prochaines actions » sortent du MÊME passage de la phase 4 : ils portent
désormais le même `executionId` (l'identifiant de corrélation de l'analyse), et Laura le RESTITUE quand
elle lit le dossier — de l'analyse à sa réponse, une seule piste. Un identifiant absent reste absent
(jamais inventé).
"""

from __future__ import annotations

from app.services.chat_tools import build_account_briefing, execution_id_hint
from app.services.execution_trace import stamp_execution_id


def test_stamp_pose_l_identifiant_sur_le_plan():
    plan: dict = {"nextActions": [{"id": "a"}]}
    assert stamp_execution_id(plan, "cid-123") is plan
    assert plan["executionId"] == "cid-123"


def test_stamp_n_invente_jamais_un_identifiant_absent():
    for missing in ("", None, "   "):
        plan: dict = {}
        stamp_execution_id(plan, missing)
        assert "executionId" not in plan


def test_stamp_ne_remplace_pas_un_identifiant_deja_pose():
    plan = {"executionId": "premier"}
    stamp_execution_id(plan, "second")
    assert plan["executionId"] == "premier"


def test_laura_restitue_l_identifiant_d_execution_du_dossier():
    account = {
        "id": "acc-1",
        "company_name": "TF1",
        "priority_score": 18,
        "raw_analysis": {"plan": {"executionId": "cid-123", "nextActions": [{"id": "a", "label": "x"}]}},
    }
    assert build_account_briefing(account)["execution_id"] == "cid-123"


def test_dossier_sans_identifiant_pas_de_champ():
    account = {"id": "acc-1", "company_name": "TF1", "raw_analysis": {"plan": {"nextActions": []}}}
    assert "execution_id" not in build_account_briefing(account)


# ── reste du lot W9 (11/10) — exposer l'identifiant dans le replay du tour ──
# (back-office) : `execution_id_hint` relaie `briefing["execution_id"]` vers
# `ReasoningTrace`, même patron que `profile_version_hint` (#3198).


def test_execution_id_hint_relays_the_briefing_s_execution_id():
    out = {"account_id": "acc-1", "company_name": "TF1", "execution_id": "cid-123"}
    assert execution_id_hint("get_account_briefing", out) == "cid-123"


def test_execution_id_hint_is_none_without_an_execution_id():
    out = {"account_id": "acc-1", "company_name": "TF1"}
    assert execution_id_hint("get_account_briefing", out) is None


def test_execution_id_hint_ignores_other_tools_and_failed_calls():
    assert execution_id_hint("compare_accounts", {"execution_id": "cid-123"}) is None
    assert execution_id_hint("get_account_briefing", {"error": "Compte introuvable"}) is None
