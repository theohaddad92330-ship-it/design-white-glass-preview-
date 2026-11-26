"""#3865.2 (BEL-LAU-1008-014, retour bêta 08/10) — « Voici un consultant, où le
positionner ? » dans Laura.

`InverseMatchingService.matchTalent` (§5.2, BEL-MTC-304) existait déjà pour
l'écran (`POST consultants/:id/match-inverse`), sans appelant côté
conversation : le motif qui revient dans ce dépôt, « du code juste, calculé,
testé, que personne n'appelle ». Ce fichier tient la couture côté service IA :

* #3865.2 — la phrase est ROUTÉE vers l'outil `find_needs_for_talent`, distinct
  de `find_accounts_for_talent` (le marché inversé PAR COMPTE, #3816.1), qui
  reste la réponse quand AUCUN besoin n'est encore ouvert ;
* introuvable / ambigu se DIT, avec les homonymes — jamais un classement
  inventé ;
* les besoins sont rangés dans les QUATRE mêmes compartiments que
  `run_matching` (recommandé / limite / écarté / non évaluable) — jamais une
  probabilité ;
* aucun besoin ouvert dans l'espace est un FAIT, pas une panne, et ne bascule
  jamais seul sur `find_accounts_for_talent`.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.access.rights_matrix import READ_ONLY_TOOLS
from app.services import chat_tools
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool
from app.services.compilers.intent_router import route_chat_intent

TOOL = "find_needs_for_talent"
MARIE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
MARIE_BIS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


def _axis(axis: str, points: int | None = 4, measured: bool = True) -> dict[str, Any]:
    return {"axis": axis, "points": points, "measured": measured, "label": axis}


def _entry(need_id: str, role: str, account: str, bucket: str, correspondence: int = 70) -> dict[str, Any]:
    return {
        "need": {"needId": need_id, "role": role, "accountName": account},
        "result": {
            "consultantId": MARIE,
            "bucket": bucket,
            "correspondenceScore": correspondence,
            "pushableScore": correspondence,
            "axes": [_axis("competences")],
            "exclusions": [],
            "skills": [],
            "gaps": [],
            "adjacency": [],
            "questionsToValidate": [],
            "flags": [],
        },
    }


def _patch(monkeypatch: pytest.MonkeyPatch, *, talents: list[dict[str, Any]], run: Any) -> dict[str, list]:
    calls: dict[str, list] = {"search": [], "match": []}

    async def _search(user_id: str, **kwargs: Any) -> dict[str, Any]:
        calls["search"].append(kwargs)
        return {"items": talents, "total": len(talents)}

    async def _match(user_id: str, *, consultant_id: str, mine_only: bool = False) -> Any:
        calls["match"].append({"consultant_id": consultant_id, "mine_only": mine_only})
        return run

    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: True)
    monkeypatch.setattr("app.services.bellum_api.search_talents", _search)
    monkeypatch.setattr("app.services.bellum_api.talent_needs_match", _match)
    return calls


def _talent(tid: str, name: str, title: str = "Développeuse Java") -> dict[str, Any]:
    return {"id": tid, "fullName": name, "title": title, "zones": ["69"], "topSkills": [{"label": "Java"}]}


# ── #3865.2 — le routeur ENVOIE la phrase vers l'outil, distinct du marché inversé ────────


@pytest.mark.parametrize(
    "message",
    [
        "Quels besoins compatibles avec ce consultant ?",
        "Des besoins pour ce consultant ?",
        "Où le positionner sur un besoin ouvert ?",
        "Which needs for this consultant?",
        "Compatible needs for this profile?",
    ],
)
def test_3865_2_la_phrase_est_routee_vers_l_outil(message: str) -> None:
    route = route_chat_intent(message=message)
    assert route.tools == (TOOL,)
    assert route.awaits_human is False


def test_3865_2_le_marche_inverse_par_compte_reste_distinct() -> None:
    # « des comptes pour ce consultant » (#3816.1) ne doit JAMAIS se confondre
    # avec « des besoins pour ce consultant » (#3865.2) : ce sont deux parcours.
    route = route_chat_intent(message="Des comptes pour ce consultant ?")
    assert route.tools == ("find_accounts_for_talent",)


# ── L'outil est déclaré, en lecture ───────────────────────────────────────────────────────


def test_l_outil_est_au_catalogue_en_lecture() -> None:
    assert TOOL in [t["name"] for t in CHAT_TOOLS]
    assert TOOL not in chat_tools.WRITE_TOOL_NAMES
    assert TOOL in READ_ONLY_TOOLS


async def test_sans_consultant_aucun_appel(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch(monkeypatch, talents=[], run=None)
    out = await execute_chat_tool(TOOL, {}, user_id="u-1", profile_data=None)
    assert "consultant" in out["error"]
    assert calls == {"search": [], "match": []}


async def test_pont_eteint_dit_non(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: False)
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    assert out == {"error": "Je n'ai pas accès au vivier depuis ici."}


# ── Introuvable / ambigu : Laura le DIT, avec les homonymes ───────────────────────────────


async def test_consultant_introuvable_se_dit_sans_classer(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch(monkeypatch, talents=[], run={"runId": "r-1", "needs": []})
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    assert out["status"] == "not_found"
    assert "Marie Dupont" in out["message"]
    assert calls["match"] == []


async def test_homonymes_proposes_sans_choisir_a_la_place(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch(
        monkeypatch,
        talents=[_talent(MARIE, "Marie Dupont"), _talent(MARIE_BIS, "Marie Dupont", "Cheffe de projet")],
        run={"runId": "r-1", "needs": []},
    )
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    assert out["status"] == "ambiguous"
    assert [h["id"] for h in out["homonyms"]] == [MARIE, MARIE_BIS]
    assert calls["match"] == []


async def test_un_identifiant_introuvable_dans_cet_espace_se_dit(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch(monkeypatch, talents=[], run={"error": "consultant_not_found"})
    out = await execute_chat_tool(TOOL, {"consultant": MARIE}, user_id="u-1", profile_data=None)
    assert out["status"] == "not_found"
    assert calls["search"] == []


async def test_matching_en_panne_est_une_erreur_pas_un_classement_vide(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, talents=[_talent(MARIE, "Marie Dupont")], run=None)
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    assert "n'a pas répondu" in out["error"]


# ── Les besoins, rangés dans les QUATRE compartiments de `run_matching` ───────────────────


async def test_3865_2_les_besoins_sont_ranges_par_compartiment(monkeypatch: pytest.MonkeyPatch) -> None:
    run = {
        "runId": "r-1",
        "evaluatedCount": 3,
        "needs": [
            _entry("n-1", "Data engineer", "ACME", "recommended", 85),
            _entry("n-2", "DevOps", "BETA", "borderline", 55),
            _entry("n-3", "COBOL", "GAMMA", "excluded", 10),
        ],
    }
    _patch(monkeypatch, talents=[_talent(MARIE, "Marie Dupont")], run=run)
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    assert out["status"] == "ok"
    assert out["consultant"] == {"id": MARIE, "name": "Marie Dupont"}
    assert [n["need_id"] for n in out["buckets"]["recommended"]] == ["n-1"]
    assert [n["need_id"] for n in out["buckets"]["borderline"]] == ["n-2"]
    assert [n["need_id"] for n in out["buckets"]["excluded"]] == ["n-3"]
    assert out["buckets"]["notEvaluable"] == []
    assert out["buckets"]["recommended"][0]["account_name"] == "ACME"
    # Jamais une probabilité : un score 0-100, pas un pourcentage de chance de gagner.
    assert "chance" not in str(out).lower()


async def test_3865_2_aucun_besoin_ouvert_est_un_fait_pas_une_panne(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(
        monkeypatch,
        talents=[_talent(MARIE, "Marie Dupont")],
        run={"runId": "r-1", "consultantId": MARIE, "evaluatedCount": 0, "needs": []},
    )
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    assert out["status"] == "ok"
    assert out["buckets"] == {"recommended": [], "borderline": [], "excluded": [], "notEvaluable": []}
    assert "Aucun besoin ouvert" in out["message"]
    assert "0" not in out["message"]


async def test_3865_2_mine_only_voyage_jusqu_au_pont(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch(monkeypatch, talents=[_talent(MARIE, "Marie Dupont")], run={"runId": "r-1", "needs": []})
    await execute_chat_tool(TOOL, {"consultant": "Marie Dupont", "mine_only": True}, user_id="u-1", profile_data=None)
    assert calls["match"] == [{"consultant_id": MARIE, "mine_only": True}]


async def test_3865_2_un_siege_sans_droit_decrit_est_nomme(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(
        monkeypatch,
        talents=[_talent(MARIE, "Marie Dupont")],
        run={"error": "records_write_forbidden", "message": "non"},
    )
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    assert "droit" in out["error"]
