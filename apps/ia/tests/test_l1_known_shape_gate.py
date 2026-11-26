"""Lot L1 07/10 — #3707 / #3760 / #3762 / #3767 / #3771 / #3764 : LA PORTE DE FORME, tour par tour.

Recette prod du 07/10 : les quatre formes connues sortaient en TEXTE. Chaque test rejoue le tour ENTIER —
routeur ``/chat/message``, modèle simulé qui appelle le VRAI outil puis répond en texte (le comportement
observé en prod), outil simulé au niveau de sa source (registre public / pont portefeuille) — et prouve qu'un
bloc structuré de la bonne forme SORT, que le texte n'est plus qu'un chapeau, et que le contexte ne déclare plus
de repli en texte (le bandeau « Refaire en carte » ne s'affiche donc pas).
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.services import bellum_api, chat_orchestrator
from app.services.reply_blocks import split_reply_blocks

USER = "11111111-1111-4111-8111-111111111111"
ACCOUNT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


class _FakeMessageStream:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def __aiter__(self):
        for block in getattr(self._response, "content", None) or []:
            if getattr(block, "type", None) == "text":
                yield SimpleNamespace(type="text", text=block.text)

    async def get_final_message(self):
        return self._response


class _FakeMessages:
    def __init__(self, responses):
        self._responses = list(responses)

    def stream(self, **_kwargs):
        return _FakeMessageStream(self._responses.pop(0))


class _FakeClient:
    def __init__(self, responses):
        self.messages = _FakeMessages(responses)


def _text(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _tool_use(name: str, tool_input: dict) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id="t1")


def _resp(stop_reason: str, content: list) -> SimpleNamespace:
    usage = SimpleNamespace(input_tokens=100, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0)
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=usage)


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())


def _install(monkeypatch, tool: str, tool_input: dict, model_text: str) -> None:
    """Le modèle simulé SUIT le prompt jusqu'à l'outil, puis répond en TEXTE (la prod du 07/10)."""
    fake = _FakeClient([_resp("tool_use", [_tool_use(tool, tool_input)]), _resp("end_turn", [_text(model_text)])])
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)


class _Registry:
    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows

    async def __call__(self, _request: Any) -> Any:
        return SimpleNamespace(candidates=list(self.rows), degraded=[])


def _bank_rows(n: int) -> list[dict]:
    return [
        {
            "name": f"Banque {i}",
            "siren": f"10000000{i}",
            "nafCode": "64.19Z",
            "nafLabel": "Autres intermédiations monétaires",
            "city": "Montpellier",
            "department": "34",
        }
        for i in range(n)
    ]


@pytest.fixture
def registry(monkeypatch):
    def _install_rows(rows: list[dict]) -> None:
        monkeypatch.setattr("app.routers.discover.discover_registry", _Registry(rows))

    def _no_workspace():
        raise RuntimeError("pas de base dans ce test")

    monkeypatch.setattr("app.services.supabase_client.get_supabase", _no_workspace)
    return _install_rows


def _priorities(now: int, watch: int, *, to_verify: int = 0) -> dict:
    return {
        "now": [
            {"id": ACCOUNT_A if i == 0 else f"n{i}", "companyName": f"Prioritaire {i}", "bucket": "now", "reason": "Signal daté de la semaine."}
            for i in range(now)
        ],
        "toVerify": [
            {"id": f"v{i}", "companyName": f"À qualifier {i}", "bucket": "to_verify", "reason": "Score non mesuré — le dossier est incomplet."}
            for i in range(to_verify)
        ],
        "toWatch": [
            {"id": f"w{i}", "companyName": f"Surveillé {i}", "bucket": "to_watch", "reason": "Sans mouvement récent."}
            for i in range(watch)
        ],
        "notNow": [{"id": "x", "companyName": "Plus tard", "bucket": "not_now", "reason": "Rien à faire."}],
        "capacityCap": 8,
    }


@pytest.fixture
def portfolio(monkeypatch):
    def _install_result(result: dict) -> None:
        async def _portfolio_priorities(*_a, **_k):
            return result

        monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
        monkeypatch.setattr(bellum_api, "portfolio_priorities", _portfolio_priorities)

    return _install_result


@pytest.fixture
def manager_review(monkeypatch):
    def _install_result(result: dict) -> None:
        async def _account_manager_review(*_a, **_k):
            return result

        monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
        monkeypatch.setattr(bellum_api, "account_manager_review", _account_manager_review)

    return _install_result


def _ask(client: TestClient, message: str) -> dict:
    res = client.post("/chat/message", json={"message": message, "user_id": USER})
    assert res.status_code == 200
    events = [
        json.loads(chunk.strip()[len("data:") :].strip())
        for chunk in res.text.strip().split("\n\n")
        if chunk.strip().startswith("data:")
    ]
    done = events[-1]
    assert done["type"] == "done" and done["success"] is True, done
    return done["data"]


def _blocks(reply: str) -> list[dict]:
    return [s.block for s in split_reply_blocks(reply) if s.kind == "block" and s.block]


# ── ENTREPRISES (#3707) ──────────────────────────────────────────────────────────────────────


def test_3707_companies_search_leaves_as_an_account_ranking_card(monkeypatch, client, registry) -> None:
    registry(_bank_rows(8))
    _install(
        monkeypatch,
        "run_account_search",
        {"sectors": ["finance"], "technologies": ["Java"]},
        "J'ai trouvé 8 acteurs financiers.\n- Banque 0 : intermédiation\n- Banque 1 : intermédiation",
    )
    data = _ask(client, "comptes Java dans la banque")
    blocks = _blocks(data["reply"])
    assert [b["type"] for b in blocks] == ["account_ranking"]
    card = blocks[0]
    assert [i["name"] for i in card["items"]] == [f"Banque {i}" for i in range(8)]
    assert card["axes"], "un rang n'est jamais nu"
    # La techno non vérifiée se NOMME sous la carte (jamais un filtre silencieux).
    assert any("Java" in line for line in card.get("not_evaluated", []))
    # Le texte n'est plus qu'un chapeau : les puces qui répètent la carte sont parties.
    head = data["reply"].split("```")[0]
    assert "J'ai trouvé 8 acteurs financiers." in head and "- Banque 0" not in head
    # Aucun score, aucune probabilité recopiés.
    assert "score" not in json.dumps(card) and "%" not in json.dumps(card)


def test_3704_2_already_in_workspace_reaches_the_account_ranking_card() -> None:
    """Recette prod 06/10 (#3704) : `already_in_workspace` existait déjà sur la sortie de l'outil
    (rapprochement SIREN, `chat_tools._run_account_search`) mais la porte de forme ne le recopiait
    pas — rien à l'écran ne distinguait une « nouvelle cible » d'un compte déjà au portefeuille."""
    from app.services.known_shape_gate import _labels, _search_ranking

    output = {
        "axes": ["Signal"],
        "items": [
            {"name": "Maison du Cuir", "why": ["Signal."], "already_in_workspace": True},
            {"name": "Autre Maison", "why": ["Signal."], "already_in_workspace": False},
        ],
    }
    card = _search_ranking(output, _labels("fr"))
    assert card["items"][0]["already_in_workspace"] is True
    assert card["items"][1]["already_in_workspace"] is False


def test_3769_1_city_reaches_why_even_when_real_score_factors_already_fill_it() -> None:
    """Recette prod 09/10 (#3769.1) — « priorise mes comptes de la semaine » : carte OK, mais
    0 « Siège : » sur 53 comptes. Cause : `_search_fact` (ci-dessus) ne porte la ville que
    dans son REPLI (`why` vide côté outil) — un compte avec de VRAIS facteurs de score
    (``scoreFactors``, le cas courant d'un classement réel) ne la voyait jamais. Même libellé
    que `_priorities_ranking` (GA-26), pour permettre le même raffinement géographique sans
    reposer de question."""
    from app.services.known_shape_gate import _labels, _search_ranking

    output = {
        "axes": ["Signal"],
        "items": [
            {"name": "Alpha", "why": ["Signal daté récemment."], "city": "Toulouse"},
            # Déjà à la borne (5) : le siège entre, une raison moins prioritaire cède la place.
            {
                "name": "Beta",
                "why": ["F1.", "F2.", "F3.", "F4.", "F5."],
                "city": "Montpellier",
            },
            # Sans ville connue : rien n'est deviné, `why` ne porte que ses raisons.
            {"name": "Gamma", "why": ["Signal."]},
        ],
    }
    card = _search_ranking(output, _labels("fr"))
    assert card["items"][0]["why"] == ["Signal daté récemment.", "Siège : Toulouse."]
    assert card["items"][1]["why"] == ["F1.", "F2.", "F3.", "F4.", "Siège : Montpellier."]
    assert len(card["items"][1]["why"]) <= 5, "le contrat `why` est borné à 5 (RankedAccount)"
    assert card["items"][2]["why"] == ["Signal."]


# ── CARTOGRAPHIE (#3760 / #3762) ─────────────────────────────────────────────────────────────


def test_3762_cartography_leaves_as_an_account_map_card_and_no_text_fallback(monkeypatch, client, registry) -> None:
    registry(_bank_rows(3))
    _install(monkeypatch, "run_account_search", {"department": "34"}, "Voici la cartographie demandée.")
    data = _ask(client, "donne moi une cartographie complète des comptes à adresser à Montpellier")
    blocks = _blocks(data["reply"])
    assert [b["type"] for b in blocks] == ["account_map"]
    card = blocks[0]
    assert card["coverage"] and card["not_covered"], "une sélection du registre se lit partielle, jamais complète"
    assert [i["name"] for g in card["groups"] for i in g["items"]] == ["Banque 0", "Banque 1", "Banque 2"]
    assert data["context"]["reply_family"] == {"family": "account_map", "outcome": "structured"}


def test_3769_open_my_perimeter_also_leaves_as_an_account_map_card(monkeypatch, client, registry) -> None:
    """Recette prod nuit 08→09/10 (#3769) — « Ouvre mon périmètre à Montpellier et périphérie »
    (l'exemple canonique de `reply_formats.py` pour cette carte) rendait du texte brut, jamais
    `account_map` : AUCUN marqueur de `reply_family` ne couvrait cette phrase. Même tour que
    `test_3762_...` ci-dessus, phrasé exactement comme la recette."""
    registry(_bank_rows(3))
    _install(monkeypatch, "run_account_search", {"department": "34"}, "Voici ton périmètre.")
    data = _ask(client, "Ouvre mon périmètre à Montpellier et périphérie")
    blocks = _blocks(data["reply"])
    assert [b["type"] for b in blocks] == ["account_map"]
    assert data["context"]["reply_family"] == {"family": "account_map", "outcome": "structured"}


# ── PRIORISATION (#3767 + niveaux #3764) ─────────────────────────────────────────────────────


def test_3767_priorities_leave_as_a_ranking_card_with_levels(monkeypatch, client, portfolio) -> None:
    portfolio(_priorities(now=2, watch=3))
    _install(
        monkeypatch,
        "get_portfolio_priorities",
        {},
        "Voici tes priorités.\n- Prioritaire 0 — signal\n- Surveillé 1 — rien",
    )
    data = _ask(client, "Priorise mes comptes de la semaine")
    blocks = _blocks(data["reply"])
    assert [b["type"] for b in blocks] == ["account_ranking"]
    card = blocks[0]
    assert card["title"]
    assert [(i["name"], i["level"]) for i in card["items"]] == [
        ("Prioritaire 0", "priority"),
        ("Prioritaire 1", "priority"),
        ("Surveillé 0", "to_watch"),
        ("Surveillé 1", "to_watch"),
        ("Surveillé 2", "to_watch"),
    ]
    # Un identifiant réel devient un lien de fiche ; un identifiant illisible n'en fait aucun.
    assert card["items"][0]["href"] == f"/accounts/{ACCOUNT_A}"
    assert "href" not in card["items"][1]
    # « Pas maintenant » n'est pas listé : il se compte.
    assert any("1" in line for line in card["not_evaluated"])
    assert data["context"]["reply_family"] == {"family": "account_priorities", "outcome": "structured"}


def test_3769_7_headquarters_city_reads_the_city_never_the_full_address() -> None:
    """Miroir de `headquartersCity` (`accountSynthesis.test.ts`) — mêmes cas, même lecture :
    une adresse complète ou une ville seule, jamais une adresse affichée telle quelle."""
    from app.services.known_shape_gate import _headquarters_city

    assert _headquarters_city("29 boulevard Haussmann, 75009 Paris") == "Paris"
    assert _headquarters_city("Lyon") == "Lyon"
    assert _headquarters_city("4 boulevard de Mons, 59650 Villeneuve-d'Ascq") == "Villeneuve-d'Ascq"
    assert _headquarters_city("7 promenade Germaine Sablon, 75013 Paris, France") == "Paris"
    # SAIT DIRE NON — siège absent ou vide : rien, jamais deviné.
    assert _headquarters_city(None) is None
    assert _headquarters_city("") is None
    assert _headquarters_city("   ") is None


def test_3769_7_headquarters_travels_into_why_for_a_geographic_refinement() -> None:
    """Recette prod nuit 08→09/10 (#3769.7) — « priorise mes comptes » rendait une carte, mais
    « seulement en Occitanie » (raffinement sur CETTE carte) retombait sur une clarification :
    rien ne disait où sont les comptes. `headquarters` est un fait RÉEL (colonne
    `accounts.headquarters`, #3762 l'utilise déjà pour `run_account_search`) — jamais une
    région devinée : la porte le lit comme un `why` de plus, exactement comme elle lit déjà
    `city` pour `run_account_search` (`_search_fact`)."""
    from app.services.known_shape_gate import _labels, _priorities_ranking

    output = {
        "now": [
            {"id": ACCOUNT_A, "companyName": "Alpha", "bucket": "now", "reason": "Signal daté.", "headquarters": "Toulouse"}
        ],
        "toWatch": [{"id": "w1", "companyName": "Beta", "bucket": "to_watch", "reason": "Sans mouvement.", "headquarters": None}],
    }
    card = _priorities_ranking(output, _labels("fr"))
    assert any("Toulouse" in why for why in card["items"][0]["why"])
    # Sans siège renseigné : rien n'est deviné, `why` ne porte que la raison.
    assert card["items"][1]["why"] == ["Sans mouvement."]


# #3764 (R4 07/10, réfuté en recette : « seuls 'À surveiller' sortent ») — `toVerify`
# n'était couvert par AUCUN test de ce fichier : seuls `now`/`toWatch` l'étaient
# ci-dessus. Les TROIS niveaux sortent bien dès que le portefeuille rend les trois
# catégories — la dérivation (`known_shape_gate._priorities_ranking`) n'est pas en
# cause ; ce qui manquait était la preuve que le troisième niveau fonctionne aussi.
def test_3764_the_three_levels_all_derive_when_the_portfolio_rule_rends_them(monkeypatch, client, portfolio) -> None:
    portfolio(_priorities(now=1, watch=1, to_verify=1))
    _install(
        monkeypatch,
        "get_portfolio_priorities",
        {},
        "Voici tes priorités.\n- Prioritaire 0 — signal",
    )
    data = _ask(client, "Priorise mes comptes de la semaine")
    card = _blocks(data["reply"])[0]
    assert [(i["name"], i["level"]) for i in card["items"]] == [
        ("Prioritaire 0", "priority"),
        ("À qualifier 0", "to_qualify"),
        ("Surveillé 0", "to_watch"),
    ]


# ── CLASSEMENT (#3771) ───────────────────────────────────────────────────────────────────────


def test_3771_ranking_request_leaves_as_a_ranking_card(monkeypatch, client, portfolio) -> None:
    portfolio(_priorities(now=3, watch=5))
    _install(monkeypatch, "get_portfolio_priorities", {}, "J'ai classé les 8 premiers comptes.")
    data = _ask(client, "Classe-moi huit comptes")
    blocks = _blocks(data["reply"])
    assert [b["type"] for b in blocks] == ["account_ranking"]
    assert len(blocks[0]["items"]) == 8
    assert data["context"]["reply_family"] == {"family": "account_ranking", "outcome": "structured"}


# ── POINT MANAGER SANS COMPTE NOMMÉ (#2985, recette 07/10) ──────────────────────────────────


def test_2985_manager_point_without_a_named_account_leaves_as_a_multi_account_ranking_card(
    monkeypatch, client, portfolio
) -> None:
    """Recette 07/10 : « Fais-moi un point manager » (aucun compte nommé) rendait un paragraphe
    mono-compte (Société Générale), alors que le contexte servi au modèle porte le PORTEFEUILLE
    entier (le bandeau « N comptes sur 48 ») faute d'un compte actif/nommé à résoudre — aucune
    famille ne reconnaissait « point manager », donc aucune consigne de carte. Elle doit sortir
    en carte multi-comptes, comme « priorise mon portefeuille »."""
    portfolio(_priorities(now=2, watch=3))
    _install(
        monkeypatch,
        "get_portfolio_priorities",
        {},
        "Côté Société Générale, le dossier avance bien ce mois-ci.",
    )
    data = _ask(client, "Fais-moi un point manager")
    blocks = _blocks(data["reply"])
    assert [b["type"] for b in blocks] == ["account_ranking"]
    assert len(blocks[0]["items"]) == 5
    assert data["context"]["reply_family"] == {"family": "account_manager_overview", "outcome": "structured"}


# ── POINT MANAGER SUR UN COMPTE NOMMÉ (#2985, reste du lot R22 07/10) ───────────────────────


def test_2985_manager_point_on_a_named_account_leaves_as_a_manager_review_card(
    monkeypatch, client, manager_review
) -> None:
    """Recette 07/10 (lot R22) : « … sur Société Générale » (compte nommé) appelle
    `get_account_manager_review`, mais rien ne structurait son résultat en carte — le modèle
    l'écrivait encore en texte libre. Cette tranche (lot E07 08/10) la rend en carte
    `manager_review`, jamais le paragraphe du modèle."""
    manager_review(
        {
            "accountId": ACCOUNT_A,
            "accountName": "Société Générale",
            "generatedAt": "2026-10-08T08:00:00.000Z",
            "changeDigest": None,
            "actionsCompleted": [],
            "actionsStalled": [],
            "risks": [],
            "verdict": {
                "status": "attention",
                "reasons": [{"kind": "decisions_pending", "count": 1}],
                "notEvaluated": ["change_digest"],
            },
            "coverage": None,
            "importantFacts": [],
            "decisionsRequested": [
                {"id": "d1", "label": "Valider la relance", "targetLabel": None, "ownerName": None}
            ],
            "arbitrationsRequested": [],
        }
    )
    _install(
        monkeypatch,
        "get_account_manager_review",
        {"account_id": ACCOUNT_A},
        "Côté Société Générale, le dossier avance bien ce mois-ci.",
    )
    data = _ask(client, "Prépare-moi un point manager sur Société Générale")
    blocks = _blocks(data["reply"])
    assert [b["type"] for b in blocks] == ["manager_review"]
    card = blocks[0]
    assert card["account_name"] == "Société Générale"
    assert card["href"] == f"/accounts/{ACCOUNT_A}"
    assert card["verdict"]["status"] == "attention"
    assert card["decisions_requested"][0]["label"] == "Valider la relance"
    assert data["context"]["reply_family"] == {"family": "account_manager_overview", "outcome": "structured"}


# ── SAIT DIRE NON ────────────────────────────────────────────────────────────────────────────


def test_a_card_written_by_the_model_is_never_doubled(monkeypatch, client, portfolio) -> None:
    portfolio(_priorities(now=1, watch=0))
    own = {"type": "account_ranking", "axes": ["Signal"], "items": [{"name": "Prioritaire 0", "why": ["Signal."]}]}
    _install(monkeypatch, "get_portfolio_priorities", {}, f"Voici.\n```bellum-block\n{json.dumps(own)}\n```")
    data = _ask(client, "Priorise mes comptes de la semaine")
    assert [b["type"] for b in _blocks(data["reply"])] == ["account_ranking"]
    assert "level" not in _blocks(data["reply"])[0]["items"][0]


def test_no_item_names_the_absence_never_an_empty_card(monkeypatch, client, registry) -> None:
    registry([])
    _install(monkeypatch, "run_account_search", {"department": "34"}, "Je n'ai rien trouvé.")
    data = _ask(client, "cartographie des comptes du 34")
    blocks = _blocks(data["reply"])
    assert [b["type"] for b in blocks] == ["missing_data"]
    assert data["context"]["reply_family"]["outcome"] == "structured"


def test_a_failed_search_is_not_dressed_as_an_empty_list(monkeypatch, client) -> None:
    async def _down(_request):
        raise RuntimeError("registre injoignable")

    monkeypatch.setattr("app.routers.discover.discover_registry", _down)
    _install(monkeypatch, "run_account_search", {"department": "34"}, "Le registre n'a pas répondu.")
    data = _ask(client, "cartographie des comptes du 34")
    assert _blocks(data["reply"]) == []
    assert data["context"]["reply_family"]["outcome"] == "text_fallback"


def test_an_unrelated_question_is_untouched(monkeypatch, client) -> None:
    fake = _FakeClient([_resp("end_turn", [_text("Bonjour !")])])
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    data = _ask(client, "Bonjour")
    assert _blocks(data["reply"]) == [] and "Bonjour" in data["reply"]


# ── PROCHAINE ACTION ET CE QUI MANQUE (#4287.4, contrat Louis 29/10) ─────────────────────────


def test_4287_4_next_step_and_gaps_leave_as_one_verdict_card_with_ce_qui_manque(monkeypatch, client) -> None:
    """Mesure prod 28/10 : la même question sur Servier rendait le gabarit texte CONSEIL sans « Ce qui
    manque ». Bout en bout, l'endpoint rend la carte `verdict` de la famille, « Ce qui manque » dit en clair."""
    conseil = (
        "**Verdict :** Relancer la DSI de Servier cette semaine.\n\n"
        "**Pourquoi :**\n- Programme de migration annoncé le 12/10\n\n"
        "**Prochaine action :** Préparer un message au DSI adjoint."
    )
    fake = _FakeClient([_resp("end_turn", [_text(conseil)])])
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    data = _ask(client, "Sur Servier, quelle est la prochaine action, et qu'est-ce qui manque ?")
    blocks = _blocks(data["reply"])
    assert [b["type"] for b in blocks] == ["verdict"]
    assert blocks[0]["limits"] and blocks[0]["next_action"]
    assert data["context"]["reply_family"] == {"family": "account_next_step", "outcome": "structured"}
