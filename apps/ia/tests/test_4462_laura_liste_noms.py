"""#4462 — une liste de comptes NOMMÉS absents de l'espace finissait en « aucun compte » (retour Exteam 22/10).

Décisions Louis 22/10 : chaque nom cherché d'abord dans l'espace (réutilisé, zéro débit) ; chaque nom ABSENT
résolu au registre public puis son analyse PART D'OFFICE, dans le même tour, par le MÊME chemin que
`plan_account_analysis` → `start_account_analysis` ; plafond de 20 noms par message ; solde insuffisant =
lancer dans l'ordre ce que le solde couvre et NOMMER le reste, sans jamais citer un nombre de crédits ;
homonyme ou introuvable = NOMMÉ, jamais lancé au hasard."""

from __future__ import annotations

import re
from typing import Any

import pytest

from app.services import bellum_api, chat_tools
from app.services.chat_tools import execute_chat_tool
from app.services.homonym_disambiguation import HomonymResolution, ScoredCandidate
from app.services.research import homonym

TOOL = "analyze_named_companies"

EXTEAM_15 = [
    "Infovista",
    "Guerbet",
    "Théa",
    "Vetoquinol",
    "Latécoère",
    "LISI",
    "Daher",
    "Voyageurs du Monde",
    "Virbac",
    "Ipsen",
    "Servier",
    "Pierre Fabre",
    "bioMérieux",
    "Pierre & Vacances-Center Parcs",
    "LFB",
]


def _siren(name: str) -> str:
    return str(abs(hash(name)) % 10**9).zfill(9)


class Bridge:
    """Le pont interne simulé : espace, préparation, lancement — et ce que chacun a reçu."""

    def __init__(
        self,
        *,
        workspace: dict[str, list[dict[str, Any]]] | None = None,
        credits_left: int | None = 1000,
        cost: int = 8,
        guardrail_for: set[str] | None = None,
    ) -> None:
        self.workspace = workspace or {}
        self.credits_left = credits_left
        self.cost = cost
        self.guardrail_for = guardrail_for or set()
        self.searched: list[str] = []
        self.planned: list[str] = []
        self.started: list[dict[str, Any]] = []

    async def workspace_accounts(self, user_id, *, query, sector, limit, **_kw):
        self.searched.append(query)
        return {
            "accounts": self.workspace.get(query, []),
            "total": len(self.workspace.get(query, [])),
            "truncated": False,
        }

    async def plan(self, user_id, *, company, locale="fr"):
        self.planned.append(company)
        plan: dict[str, Any] = {
            "account": None,
            "costCredits": self.cost,
            "preset": "free",
            "questions": [],
            "planToken": f"tok-{company}",
        }
        if self.credits_left is not None:
            plan["creditsLeft"] = self.credits_left
        if company in self.guardrail_for:
            plan["scopeGuardrail"] = {"suggestedScopeMode": "business_unit", "reason": "grand groupe"}
        return plan

    async def start(self, user_id, *, company, plan_token, **kw):
        assert plan_token == f"tok-{company}", "le lancement réutilise le jeton de SA préparation"
        self.started.append({"company": company, **kw})
        return {"accountId": f"acc-{company}", "jobId": f"job-{company}", "launched": True}


def _install(monkeypatch, bridge: Bridge, *, registry=None) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "workspace_accounts", bridge.workspace_accounts)
    monkeypatch.setattr(bellum_api, "plan_account_analysis", bridge.plan)
    monkeypatch.setattr(bellum_api, "start_account_analysis", bridge.start)

    async def default_registry(company_name, *, siren=None, limit=8, strict=False):
        return HomonymResolution(status="unique", selectedSiren=_siren(company_name), confidence=0.9, candidateCount=1)

    monkeypatch.setattr(homonym, "resolve_company_identity", registry or default_registry)


async def _run(names: list[str], **extra: Any) -> dict[str, Any]:
    return await execute_chat_tool(TOOL, {"companies": names, **extra}, user_id="u-1", profile_data=None)


def _no_credit_figure(result: dict[str, Any]) -> None:
    """Crédits implicites (décision 22/10, épopée #4468) : ni nombre de crédits ni solde, nulle part."""
    flat = repr(result)
    assert "creditsLeft" not in flat and "costCredits" not in flat and "credits_left" not in flat
    assert not re.search(r"\d+\s*crédit", flat), flat
    assert "solde restant" not in flat


# ── #4462.1 — les absents partent d'office, au même tour, par le chemin existant ──────────────────


@pytest.mark.asyncio
async def test_4462_1_fifteen_names_outside_the_workspace_all_launch_in_the_same_call(monkeypatch):
    bridge = Bridge()
    _install(monkeypatch, bridge)
    result = await _run(EXTEAM_15)

    assert bridge.searched == EXTEAM_15, "chaque nom est d'abord cherché dans l'espace"
    assert [s["company"] for s in bridge.started] == EXTEAM_15, "les 15 partent, dans l'ordre de la liste"
    assert all(s.get("siren") == _siren(s["company"]) for s in bridge.started), "ancré sur l'entité du registre"
    assert [row["company"] for row in result["launched"]] == EXTEAM_15
    assert result["known"] == []
    directive = result["model_directive"]
    assert "15 analyses" in directive and "Je poursuis sur le reste" in directive  # interdite, nommée
    assert "jamais" in directive.lower()
    _no_credit_figure(result)


@pytest.mark.asyncio
async def test_4462_1_the_tool_is_registered_spending_and_never_parallelised():
    from app.access.rights_matrix import SPENDING_TOOLS
    from app.services import chat_orchestrator

    names = [t["name"] for t in chat_tools.CHAT_TOOLS]
    assert TOOL in names
    assert names[-1] == "push_profile", "ajouté AVANT push_profile : le préfixe d'outils mis en cache tient"
    assert TOOL in SPENDING_TOOLS
    assert not chat_orchestrator._is_read_only_tool(TOOL)


def test_4462_1_the_one_company_lock_is_lifted_in_the_start_description():
    start = next(t for t in chat_tools.CHAT_TOOLS if t["name"] == "start_account_analysis")
    assert "UNE entreprise à la fois" not in start["description"]
    assert TOOL in start["description"]


def test_4462_1_an_empty_workspace_search_by_name_points_to_the_batch():
    # La consigne portée par la liste vide de search_workspace_accounts nomme le lot pour une LISTE de noms.
    import inspect

    source = inspect.getsource(chat_tools)
    assert f"plusieurs noms cités, `{TOOL}`" in source


@pytest.mark.asyncio
async def test_4462_1_launch_outcomes_are_counted_by_the_orchestrator():
    from types import SimpleNamespace

    from app.services.chat_orchestrator import _analysis_outcomes

    call = SimpleNamespace(name=TOOL, input={"companies": ["A", "B", "C"]})
    output = {"launched": [{"company": "A"}, {"company": "B"}], "not_launched": [{"company": "C", "why": "x"}]}
    assert _analysis_outcomes([(call, output, False)]) == (["A", "B"], ["C"])


# ── #4462.2 — plafond de 20 noms par message ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_4462_2_beyond_twenty_names_the_rest_is_named_not_launched(monkeypatch):
    bridge = Bridge()
    _install(monkeypatch, bridge)
    names = [f"Société {i:02d}" for i in range(1, 24)]
    result = await _run(names)

    assert [s["company"] for s in bridge.started] == names[:20]
    assert result["beyond_cap"] == names[20:]
    assert "renvoie-les ensuite" in result["model_directive"]
    assert "Société 21" in result["model_directive"]


@pytest.mark.asyncio
async def test_4462_2_duplicates_count_once(monkeypatch):
    bridge = Bridge()
    _install(monkeypatch, bridge)
    result = await _run(["Guerbet", "guerbet ", "Ipsen", ""])
    assert [s["company"] for s in bridge.started] == ["Guerbet", "Ipsen"]
    assert "beyond_cap" not in result


# ── #4462.3 — solde insuffisant : dans l'ordre, le reste NOMMÉ, aucun chiffre ────────────────────


@pytest.mark.asyncio
async def test_4462_3_insufficient_balance_launches_in_list_order_and_names_the_rest(monkeypatch):
    bridge = Bridge(credits_left=24, cost=8)  # couvre 3 analyses
    _install(monkeypatch, bridge)
    result = await _run(EXTEAM_15[:6])

    assert [s["company"] for s in bridge.started] == EXTEAM_15[:3]
    assert result["held_back"] == EXTEAM_15[3:6]
    directive = result["model_directive"]
    assert "3 analyses" in directive
    assert "Latécoère" in directive
    # #4462.3 / #4464 — frein doux nommé : ni « solde » ni « recharger » (aucun compteur, aucune recharge).
    assert "beaucoup utilisé Bellum" in directive
    brake = directive[directive.index("beaucoup utilisé Bellum") : directive.index("rien à acheter.")].lower()
    assert "recharg" not in brake and "solde" not in brake
    _no_credit_figure(result)


@pytest.mark.asyncio
async def test_4462_3_a_quota_refusal_at_start_holds_back_without_its_figures(monkeypatch):
    bridge = Bridge(credits_left=None)

    async def start(user_id, *, company, plan_token, **kw):
        if company == "Daher":
            return {"error": "quota_exceeded", "message": "Crédits épuisés — 40 sur 40 consommés ce cycle."}
        return await Bridge.start(bridge, user_id, company=company, plan_token=plan_token, **kw)

    _install(monkeypatch, bridge)
    monkeypatch.setattr(bellum_api, "start_account_analysis", start)
    result = await _run(["Guerbet", "Daher"])

    assert [row["company"] for row in result["launched"]] == ["Guerbet"]
    assert result["held_back"] == ["Daher"]
    _no_credit_figure(result)
    assert "40" not in repr(result)


# ── #4462.4 — homonyme, introuvable, registre muet : NOMMÉS, jamais lancés ───────────────────────


@pytest.mark.asyncio
async def test_4462_4_homonyms_and_unknown_names_are_named_never_launched(monkeypatch):
    bridge = Bridge()

    async def registry(company_name, *, siren=None, limit=8, strict=False):
        assert strict is True, "un registre en panne ne doit jamais se lire « introuvable »"
        if company_name == "Théa":
            return HomonymResolution(
                status="ambiguous",
                candidateCount=2,
                candidates=[
                    ScoredCandidate(siren="111111111", name="LABORATOIRES THEA", city="CLERMONT-FERRAND"),
                    ScoredCandidate(siren="222222222", name="THEA SAS", city="LYON"),
                ],
            )
        if company_name == "Zzyzx Industries":
            return HomonymResolution(status="none")
        if company_name == "LFB":
            raise RuntimeError("registre injoignable")
        return HomonymResolution(status="selected", selectedSiren=_siren(company_name), candidateCount=3)

    _install(monkeypatch, bridge, registry=registry)
    result = await _run(["Théa", "Zzyzx Industries", "LFB", "Ipsen"])

    assert [s["company"] for s in bridge.started] == ["Ipsen"]
    assert bridge.planned == ["Ipsen"], "rien n'est préparé pour un nom non résolu"
    assert result["ambiguous"][0]["company"] == "Théa"
    assert "LABORATOIRES THEA (CLERMONT-FERRAND)" in result["ambiguous"][0]["candidates"]
    assert result["not_found"] == ["Zzyzx Industries"]
    assert result["registry_unavailable"] == ["LFB"]
    directive = result["model_directive"]
    for name in ("Théa", "Zzyzx Industries", "LFB"):
        assert name in directive


# ── #4462.5 — liste mixte : connus réutilisés, absents analysés, séparés ─────────────────────────


@pytest.mark.asyncio
async def test_4462_5_mixed_list_reuses_known_accounts_and_analyses_only_the_absent(monkeypatch):
    bridge = Bridge(
        workspace={
            "Guerbet": [{"account_id": "acc-g", "company_name": "GUERBET", "last_analyzed_at": "2026-10-01"}],
            "LISI": [{"account_id": "acc-l", "company_name": "LISI AEROSPACE"}],
            # Un compte voisin au nom différent n'est PAS le compte cité.
            "Daher": [{"account_id": "acc-x", "company_name": "Dahlia Conseil"}],
        }
    )
    _install(monkeypatch, bridge)
    result = await _run(["Guerbet", "LISI", "Daher", "Ipsen"])

    assert [row["company"] for row in result["known"]] == ["Guerbet", "LISI"]
    assert result["known"][0]["account_id"] == "acc-g"
    assert [s["company"] for s in bridge.started] == ["Daher", "Ipsen"]
    directive = result["model_directive"]
    assert "Déjà dans ton espace" in directive and "Guerbet" in directive
    assert "2 analyses" in directive


@pytest.mark.asyncio
async def test_4462_5_a_fresh_dossier_reused_by_the_server_is_not_announced_as_running(monkeypatch):
    bridge = Bridge()

    async def start(user_id, *, company, plan_token, **kw):
        return {"accountId": "acc-v", "launched": False, "reason": "cache_hit"}

    _install(monkeypatch, bridge)
    monkeypatch.setattr(bellum_api, "start_account_analysis", start)
    result = await _run(["Virbac"])
    assert result["launched"] == []
    assert [row["company"] for row in result["known"]] == ["Virbac"]


# ── Grand groupe sans périmètre (#3434 tenu) et demande DSI ──────────────────────────────────────


@pytest.mark.asyncio
async def test_4462_large_group_launches_on_the_it_scope_when_the_request_targets_the_dsi(monkeypatch):
    bridge = Bridge(guardrail_for={"Servier"})
    _install(monkeypatch, bridge)
    result = await _run(["Servier"], function="DSI")
    assert bridge.started[0]["scope_mode"] == "it_digital"
    assert [row["company"] for row in result["launched"]] == ["Servier"]


@pytest.mark.asyncio
async def test_4462_large_group_without_any_scope_is_named_not_launched_on_the_whole_group(monkeypatch):
    bridge = Bridge(guardrail_for={"Servier"})
    _install(monkeypatch, bridge)
    result = await _run(["Servier", "Guerbet"])
    assert [s["company"] for s in bridge.started] == ["Guerbet"]
    assert result["scope_required"] == ["Servier"]


# ── #4462.7 — compte nommé + contacts d'une fonction ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_4462_7_contacts_of_a_function_are_promised_on_return_with_the_people_search_fallback(monkeypatch):
    bridge = Bridge()
    _install(monkeypatch, bridge)
    result = await _run(["JC Decaux"], function="DSI")
    directive = result["model_directive"]
    assert "DSI" in directive
    assert "propose_people_search" in directive
    assert "disponible" in directive  # « outil indisponible » interdit, nommé dans la consigne


@pytest.mark.asyncio
async def test_4462_bridge_off_says_so_and_launches_nothing(monkeypatch):
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run(["Guerbet"])
    assert "error" in result


@pytest.mark.asyncio
async def test_4462_no_name_is_an_input_error():
    result = await _run([])
    assert "error" in result


# ── #4462.6 — plus de « Relance la même demande » ni de « Je poursuis sur le reste. » à vide ─────

_REFUSED_MAP = {
    "type": "account_map",
    "title": "Comptes cités",
    "context": [{"kind": "filter", "label": "DSI"}],
    "summary": {"retained_count": 0, "qualification": "aucun"},
}
_LIST_MESSAGE = "Ouvre mon périmètre sur ces comptes : Infovista, Guerbet, Théa"


def _refused_reply() -> str:
    import json

    from app.services.reply_blocks import REPLY_BLOCK_FENCE

    return f"Voici.\n\n```{REPLY_BLOCK_FENCE}\n{json.dumps(_REFUSED_MAP, ensure_ascii=False)}\n```"


def test_4462_6_absent_from_the_workspace_never_advises_to_ask_again():
    from app.services.known_shape_gate import route_known_shapes

    # #4705 — « absent » se PROUVE : la recherche par nom a rendu zéro compte (`workspace_found: 0`).
    actions = [
        {"tool": "search_workspace_accounts", "input": {"query": "Infovista"}, "status": "done", "workspace_found": 0}
    ]
    routed = route_known_shapes(_refused_reply(), actions, user_message=_LIST_MESSAGE)
    assert "Carte non construite" in routed
    assert "Relance la même demande" not in routed
    assert "pas encore dans ton espace" in routed


def test_4705_accounts_found_in_the_workspace_are_never_said_absent():
    from app.services.known_shape_gate import route_known_shapes

    # Servier, Sanofi, Thales viennent d'être trouvés : la carte refusée ne nie JAMAIS leur présence.
    actions = [
        {"tool": "search_workspace_accounts", "input": {"query": q}, "status": "done", "workspace_found": 1}
        for q in ("Servier", "Sanofi", "Thales")
    ]
    routed = route_known_shapes(_refused_reply(), actions, user_message=_LIST_MESSAGE)
    assert "pas encore dans ton espace" not in routed
    assert "sont bien dans ton espace" in routed


def test_4705_a_search_without_a_proved_result_does_not_claim_absence():
    from app.services.known_shape_gate import route_known_shapes

    actions = [{"tool": "search_workspace_accounts", "input": {"query": "Servier"}, "status": "done"}]
    routed = route_known_shapes(_refused_reply(), actions, user_message=_LIST_MESSAGE)
    assert "pas encore dans ton espace" not in routed


def test_4462_6_launched_analyses_say_when_the_card_comes_back():
    from app.services.known_shape_gate import route_known_shapes

    actions = [{"tool": TOOL, "input": {"companies": ["Infovista"]}, "status": "done"}]
    routed = route_known_shapes(_refused_reply(), actions, user_message=_LIST_MESSAGE)
    assert "Relance la même demande" not in routed
    assert "au retour des analyses" in routed


def test_4462_6_without_any_read_the_historical_advice_stays():
    from app.services.known_shape_gate import route_known_shapes

    routed = route_known_shapes(_refused_reply(), [], user_message=_LIST_MESSAGE)
    assert "Relance la même demande" in routed  # elle sait ne pas attraper ce qu'elle ne vise pas


def test_4462_6_the_partial_tranche_promises_a_follow_up_only_when_work_continues():
    from app.services.chat_orchestrator import _partial_tranche_note

    assert "Je poursuis sur le reste." in _partial_tranche_note(continues=True)
    alone = _partial_tranche_note(continues=False)
    assert "ce qui continue (« Je poursuis sur le reste. »)" not in alone
    assert "n'écris jamais « je poursuis »" in alone
    assert "sera disponible" in alone


def test_4462_6_the_laura_acts_rule_ties_the_follow_up_line_to_real_work():
    from app.prompts.laura_acts import BLOCK_LAURA_ACTS

    assert "SEULEMENT si un travail est réellement en cours" in BLOCK_LAURA_ACTS
    assert "« dès que l'outil sera disponible »" in BLOCK_LAURA_ACTS


@pytest.mark.asyncio
async def test_4462_7_a_single_launch_says_contacts_come_back_and_never_waits_for_a_tool(monkeypatch):
    # « 15 contacts clés dans la DSI de JC Decaux », compte absent : l'analyse part, et la consigne dit où
    # les contacts reviendront et quel outil prend le relais — jamais « dès que l'outil sera disponible ».
    async def fake_start(user_id, *, company, plan_token, **_scope):
        return {"accountId": "acc-jcd", "launched": True}

    monkeypatch.setattr(bellum_api, "start_account_analysis", fake_start)
    result = await execute_chat_tool(
        "start_account_analysis", {"company": "JC Decaux", "plan_token": "tok"}, user_id="u-1", profile_data=None
    )
    directive = result["model_directive"]
    assert "get_account_contacts" in directive and "propose_people_search" in directive
    assert "« dès que l'outil sera disponible »" in directive
