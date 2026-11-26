"""Le compilateur d'opportunité (#2324, chantier CHAT-3).

Mesuré le 18/09/2026 : aucun des soixante outils de `chat_tools.py` ne compile
une opportunité — les ingrédients existent (`PROJECT_STAGES`,
`primary_domain_code`, le formulaire `/projects?create=1`), rien ne les
assemble. Ce test couvre les deux outils ajoutés :

* `compile_opportunity` — propose d'ouvrir le formulaire de création déjà
  existant, prérempli du SEUL fait connu (le compte). N'écrit RIEN : la
  garde `project-creation-is-a-human-gesture.spec.ts` (côté API) exige que
  `createForWorkspace` garde exactement UN appelant, le contrôleur.
* `get_pipeline_health` — le diagnostic NOMMÉ (jamais un score) de #2324.40/
  43/44/46/47/48.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools
from app.services.compilers.opportunity_compiler import (
    COMPILE_OPPORTUNITY_TOOL,
    GET_PIPELINE_HEALTH_TOOL,
    compile_opportunity_route,
    compiled_opportunity_gaps,
)

USER = "22222222-2222-4222-8222-222222222222"
ACCOUNT = "33333333-3333-4333-8333-333333333333"


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


async def _run(name: str, payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(name, payload or {}, user_id=USER, profile_data=None)


# ── Ce que le catalogue promet ───────────────────────────────────────────────


def test_the_two_tools_are_declared_and_appended_at_the_end() -> None:
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    assert {"compile_opportunity", "get_pipeline_health"} <= set(names)
    # Insérer au milieu invaliderait le préfixe d'outils mis en cache : les
    # deux sont AJOUTÉS en fin, consécutifs, dans l'ordre où ils sont déclarés.
    # ⚠️ Ce test lisait `names[-2:]` : il interdisait donc aussi tout outil
    # ajouté APRÈS eux (le compilateur de besoin #2322 l'a fait rougir à la
    # fusion de la vague 15). La règle est l'ajout en fin, pas la fin figée.
    first = names.index("compile_opportunity")
    assert names[first : first + 2] == ["compile_opportunity", "get_pipeline_health"]


def test_web_search_is_declared_after_the_opportunity_pair() -> None:
    # #2721 (22/09/2026) : `web_search` a suivi à son tour, ajouté EN FIN de
    # liste comme tous les précédents — même règle que le test ci-dessus,
    # donc pas de position figée : seulement APRÈS le couple opportunité.
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    assert "web_search" in names
    first = names.index("compile_opportunity")
    assert names.index("web_search") > first + 1


def test_no_probability_is_ever_promised_in_either_description() -> None:
    for tool in (COMPILE_OPPORTUNITY_TOOL, GET_PIPELINE_HEALTH_TOOL):
        description = str(tool["description"]).lower()
        assert "n'existe ici" in description or "n’existe ici" in description or "jamais" in description
        assert "chance de closing" not in description
        assert "prévisionnel pondéré" not in description


def test_pipeline_health_description_names_the_contradictory_action_opportunities() -> None:
    # #2325.36 — le modèle doit savoir lire `contradictory_action_opportunities`
    # et que la portée est bornée (issue connue + tâche ouverte), pas une
    # contradiction sémantique devinée sur du texte libre.
    description = str(GET_PIPELINE_HEALTH_TOOL["description"])
    assert "contradictory_action_opportunities" in description


def test_pipeline_health_description_names_the_multi_owner_opportunities() -> None:
    # #2325.32 — même exigence : le modèle doit savoir lire
    # `multi_owner_opportunities`, et la description doit dire que ce n'est PAS
    # une comparaison entre commerciaux (doctrine "l'analytique mesure le
    # produit, jamais la personne").
    description = str(GET_PIPELINE_HEALTH_TOOL["description"])
    assert "multi_owner_opportunities" in description
    assert "jamais une comparaison entre commerciaux" in description


def test_pipeline_health_description_names_the_duplicate_opportunities() -> None:
    # #2325.33 — même exigence que #2325.34/#2325.35 : le modèle doit savoir
    # que `duplicate_opportunities` existe dans le résultat de l'outil, et que
    # ce n'est jamais une fusion automatique.
    description = str(GET_PIPELINE_HEALTH_TOOL["description"])
    assert "duplicate_opportunities" in description
    assert "PROPOSE" in description


def test_pipeline_health_description_names_the_contact_solicitation_collisions() -> None:
    # #2325.35 — la description doit annoncer `contact_solicitation_collisions`
    # au même titre que `staffing_collisions` (#2325.34), sinon le modèle ne
    # sait pas qu'il peut la lire dans le résultat de l'outil.
    description = str(GET_PIPELINE_HEALTH_TOOL["description"])
    assert "contact_solicitation_collisions" in description


def test_pipeline_health_description_names_the_nine_axes() -> None:
    # #2325.11/.13 — `ageing`/`confidence` (vieillissement/confiance) rejoignent
    # les sept axes déjà décrits (packages/contracts `PIPE_PRIORITY_AXES`) :
    # la description que Laura lit doit dire NEUF, jamais rester bloquée à sept,
    # sinon le modèle continue de narrer un axe qu'il ne voit plus décrit.
    description = str(GET_PIPELINE_HEALTH_TOOL["description"])
    assert "NEUF axes" in description
    assert "SEPT axes" not in description
    assert "vieillissement" in description.lower()
    assert "confiance" in description.lower()


# ── compiled_opportunity_gaps — les quatre axes NOMMÉS, jamais un score ──────


def test_all_four_gaps_when_nothing_is_known() -> None:
    assert compiled_opportunity_gaps({}) == [
        "no_scope",
        "no_perimeter",
        "no_decision_maker",
        "no_next_action",
    ]


def test_no_scope_disappears_once_a_domain_is_named() -> None:
    gaps = compiled_opportunity_gaps({"primary_domain_code": "dev-applicatif"})
    assert "no_scope" not in gaps


def test_no_perimeter_disappears_on_amount_or_on_a_close_date_either_one() -> None:
    assert "no_perimeter" not in compiled_opportunity_gaps({"amount_cents": 500_000})
    assert "no_perimeter" not in compiled_opportunity_gaps({"expected_close_on": "2026-12-01"})


def test_no_gaps_when_all_four_axes_are_known() -> None:
    assert (
        compiled_opportunity_gaps(
            {
                "primary_domain_code": "dev-applicatif",
                "amount_cents": 500_000,
                "contact_id": "c-1",
                "next_action_title": "Envoyer la proposition",
            }
        )
        == []
    )


def test_compile_opportunity_route_only_prefills_the_account() -> None:
    """« Rien n'est pré-rempli qu'on ne sache » (CreateProjectDialog.tsx) —
    le libellé, l'objectif et le montant restent la SAISIE de l'humain."""
    from urllib.parse import parse_qs, urlsplit

    route = compile_opportunity_route(ACCOUNT)
    split = urlsplit(route)
    assert split.path == "/projects"
    query = parse_qs(split.query)
    # ⚠️ `account_id`, PAS `accountId` : `projectsSearchSchema`
    # (apps/web/src/routes/projects/index.tsx) déclare `account_id` — un autre
    # nom serait jeté en silence par `validateSearch` (le défaut « filtre
    # fantôme » déjà payé deux fois dans ce dépôt).
    assert query == {"create": ["1"], "account_id": [ACCOUNT]}


# ── L'exécuteur — refuse plutôt que de deviner ───────────────────────────────


@pytest.mark.asyncio
async def test_an_unknown_source_is_refused() -> None:
    result = await _run("compile_opportunity", {"source": "rumeur", "account_id": ACCOUNT, "reasoning": "x"})
    assert "error" in result


@pytest.mark.asyncio
async def test_a_missing_account_is_refused() -> None:
    result = await _run("compile_opportunity", {"source": "email", "reasoning": "x"})
    assert "error" in result


@pytest.mark.asyncio
async def test_a_missing_reasoning_is_refused() -> None:
    """`reasoning` est ce qui sera montré comme HYPOTHÈSE — sans lui, aucune
    proposition ne peut se justifier devant l'utilisateur."""
    result = await _run("compile_opportunity", {"source": "email", "account_id": ACCOUNT})
    assert "error" in result


@pytest.mark.asyncio
async def test_an_account_outside_the_portfolio_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _no_dossier(_ids: list[str], _user_id: str) -> list[dict]:
        return []

    monkeypatch.setattr(chat_tools, "_owned_account_dossiers", _no_dossier)
    result = await _run(
        "compile_opportunity",
        {"source": "email", "account_id": "not-mine", "reasoning": "Le client a demandé un devis."},
    )
    # #3195 — le refus garde son message exact et porte le geste suivant.
    assert result["error"] == "Ce compte est introuvable dans votre portefeuille."
    assert "web_search" in result["next_step"]


@pytest.mark.asyncio
async def test_a_compiled_opportunity_never_writes_and_shows_the_hypothesis(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _dossier(_ids: list[str], _user_id: str) -> list[dict]:
        return [{"account_id": ACCOUNT, "company_name": "ACME"}]

    monkeypatch.setattr(chat_tools, "_owned_account_dossiers", _dossier)

    result = await _run(
        "compile_opportunity",
        {
            "source": "rendez_vous",
            "account_id": ACCOUNT,
            "reasoning": "Le DSI a demandé un accompagnement sur sa migration cloud.",
        },
    )

    assert result["status"] == "pending_confirmation"
    proposal = result["proposal"]
    assert proposal["action"] == "open_screen"
    assert f"account_id={ACCOUNT}" in proposal["route"]
    assert "ACME" in proposal["label"]
    assert "Hypothèse" in proposal["highlight"]
    assert "migration cloud" in proposal["highlight"]
    # Les quatre axes manquent tous : aucun n'a été fourni.
    assert proposal["compiled_gaps"] == ["no_scope", "no_perimeter", "no_decision_maker", "no_next_action"]
    assert proposal["compiled_source"] == "rendez_vous"


@pytest.mark.asyncio
async def test_gaps_shrink_as_facts_are_given(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _dossier(_ids: list[str], _user_id: str) -> list[dict]:
        return [{"account_id": ACCOUNT, "company_name": "ACME"}]

    monkeypatch.setattr(chat_tools, "_owned_account_dossiers", _dossier)

    result = await _run(
        "compile_opportunity",
        {
            "source": "email",
            "account_id": ACCOUNT,
            "reasoning": "Devis chiffré demandé par écrit.",
            "primary_domain_code": "dev-applicatif",
            "amount_cents": 800_000,
            "contact_id": "contact-1",
            "next_action_title": "Envoyer la proposition",
        },
    )
    assert result["proposal"]["compiled_gaps"] == []


# ── get_pipeline_health — un diagnostic nommé, jamais un score ───────────────


@pytest.mark.asyncio
async def test_pipeline_health_refuses_rather_than_returning_empty_when_unconfigured() -> None:
    result = await _run("get_pipeline_health")
    assert "error" in result


@pytest.mark.asyncio
async def test_pipeline_health_relays_the_named_diagnosis(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def health(_user_id: str) -> dict:
        return {
            "needsAttention": [
                {"id": "opp-1", "stage": "qualified", "freshness": "stale", "reasons": ["stale", "without_next_action"]}
            ],
            "recommendedToClose": [
                {"id": "opp-1", "stage": "qualified", "freshness": "stale", "reasons": ["stale", "without_next_action"]}
            ],
            "excludedUnapprovedSignals": 3,
        }

    monkeypatch.setattr(bellum_api, "pipeline_health", health)
    result = await _run("get_pipeline_health")
    assert result["needs_attention"][0]["reasons"] == ["stale", "without_next_action"]
    assert result["recommended_to_close"][0]["id"] == "opp-1"
    assert result["excluded_unapproved_signals"] == 3


@pytest.mark.asyncio
async def test_pipeline_health_relays_staffing_collisions(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2325.34 — le même consultant, ouvert sur deux besoins distincts, doit
    remonter jusqu'au modèle, jamais silencieusement absorbé par `_capped`."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def health(_user_id: str) -> dict:
        return {
            "needsAttention": [],
            "recommendedToClose": [],
            "excludedUnapprovedSignals": 0,
            "priorityDeals": [],
            "dealsToWatch": [],
            "staffingCollisions": [
                {
                    "consultantId": "cons-1",
                    "consultantName": "Dana Diallo",
                    "submissionIds": ["sub-1", "sub-2"],
                    "needIds": ["need-1", "need-2"],
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "pipeline_health", health)
    result = await _run("get_pipeline_health")
    assert result["staffing_collisions"] == [
        {
            "consultantId": "cons-1",
            "consultantName": "Dana Diallo",
            "submissionIds": ["sub-1", "sub-2"],
            "needIds": ["need-1", "need-2"],
        }
    ]


@pytest.mark.asyncio
async def test_pipeline_health_says_it_did_not_respond_rather_than_an_empty_diagnosis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def health(_user_id: str) -> None:
        return None

    monkeypatch.setattr(bellum_api, "pipeline_health", health)
    result = await _run("get_pipeline_health")
    assert "error" in result
