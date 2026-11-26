"""#2327.26 — le dernier point ouvert de #2327 (LAU-FINAL-068) : Laura sait
EXPLIQUER un rapprochement de talents, mais n'avait pas l'outil pour aller le
chercher (`git grep -n "talent.identity\\|talent_identity" apps/ia` rendait
zéro avant ce lot).

Ce que ce fichier prouve :

1. L'outil rend l'explication déjà calculée pour l'écran (`explainTalentDuplicate`,
   packages/contracts), pas une seconde phrase inventée côté Python.
2. Aucun critère protégé ne traverse (GA-06) — et aucun chiffre de confiance,
   qui se lirait comme une chance (doc de `TalentIdentityPanel.tsx`).
3. LECTURE SEULE : aucune écriture n'est atteignable depuis l'outil — mocker
   `bellum_api` avec la SEULE fonction de lecture prouve qu'aucune autre n'est
   appelée, jamais une fonction de décision ou de fusion.
4. Sans pont configuré, l'outil DIT qu'il n'a pas accès (même famille que
   `search_talents`, `_DELIVERY_TOOLS`), il ne rend pas une liste vide qui se
   lirait « aucun rapprochement ».
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "33333333-3333-4333-8333-333333333333"
TALENT_ID = "44444444-4444-4444-8444-444444444444"
OTHER_ID = "55555555-5555-4555-8555-555555555555"


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


async def _run(tool_input: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(
        "explain_talent_duplicate", tool_input or {}, user_id=USER, profile_data=None
    )


# ── Ce que le catalogue promet ───────────────────────────────────────────────


def test_the_tool_is_declared_and_appended_at_the_end() -> None:
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    # ⚠️ Il n'est plus le DERNIER outil de la liste, et ce n'était pas la
    # règle : #2623.1 (20/09/2026) a posé `get_account_contacts` APRÈS lui, EN
    # FIN de liste comme tous les précédents. Ce qui se garde est sa position
    # RELATIVE — juste avant ce qui l'a suivi — jamais glissé au milieu.
    # #2679 (21/09/2026) : `offer_reply_options` a suivi, EN FIN de liste.
    # #2301 (22/09/2026) : `get_account_preflight` a suivi à son tour, EN FIN.
    # #2300 (22/09/2026) : `get_account_work_contract` a suivi, EN FIN de liste.
    # #2302 (22/09/2026) : `resolve_account_territory` a suivi, EN FIN de liste.
    # #2308 (22/09/2026) : `get_account_coverage_map` a suivi, EN FIN de liste.
    # #2324 (22/09/2026) : le compilateur d'opportunité a suivi, EN FIN de liste.
    # #2322 (22/09/2026) : le compilateur de besoin a suivi, EN FIN de liste.
    # #2721 (22/09/2026) : la recherche web a suivi à son tour, EN FIN de liste.
    # #2337 (23/09/2026) : `plan_talent_territory` a suivi, EN FIN de liste.
    # #2392 (23/09/2026) : la clôture de fin de journée a suivi, EN FIN de liste.
    # #2338.8 / #2409.8 (23/09/2026) : la checklist de démarrage d'une mission a suivi, EN FIN de liste.
    # #2423.9 (23/09/2026) : préparer un avenant de mission a suivi, EN FIN de liste.
    # #1950.4 — la PRÉSENCE et l'ordre relatif, jamais la queue : un outil ajouté
    # EN FIN après eux (`describe_plan`) ne doit pas faire tomber ce test.
    assert names[names.index("explain_talent_duplicate") :][:16] == [
        "explain_talent_duplicate",
        "get_account_contacts",
        "offer_reply_options",
        "get_account_preflight",
        "get_account_work_contract",
        "resolve_account_territory",
        "get_account_coverage_map",
        "compile_opportunity",
        "get_pipeline_health",
        "compile_need",
        "web_search",
        "search_workspace_contacts",
        "plan_talent_territory",
        "compile_day_closure",
        "get_mission_start_readiness",
        "propose_mission_amendment",
    ], "insérer au milieu invaliderait le préfixe d'outils mis en cache pour tous les tours suivants"


def test_the_description_names_no_confidence_number_and_no_protected_criterion() -> None:
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "explain_talent_duplicate")
    description = str(tool["description"]).lower()
    # GA-06 — âge, genre, origine, photo, adresse : aucun n'a de raison
    # d'apparaître dans la description d'un outil de lecture.
    for forbidden in ("age", "âge", "genre", "origine", "photo", "adresse"):
        assert forbidden not in description, forbidden
    assert "confiance" in description  # la RÈGLE (aucun chiffre) doit s'y lire


# ── L'outil rend l'explication déjà calculée, jamais une seconde phrase ─────


@pytest.mark.asyncio
async def test_the_tool_relays_the_explanation_already_computed_for_the_screen(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    captured: dict = {}

    async def _explanation(user_id: str, *, talent_id: str, other_talent_id: str | None = None) -> dict:
        captured["user_id"] = user_id
        captured["talent_id"] = talent_id
        captured["other_talent_id"] = other_talent_id
        return {
            "state": "probable_duplicate",
            "items": [
                {
                    "talentId": OTHER_ID,
                    "fullName": "Jean Dupont",
                    "explanation": (
                        "Ces deux fiches semblent appartenir à la même personne parce qu’elles "
                        "partagent le même e-mail."
                    ),
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "talent_identity_explanation", _explanation)
    result = await _run({"talent_id": TALENT_ID})

    assert captured == {"user_id": USER, "talent_id": TALENT_ID, "other_talent_id": None}
    assert result == {
        "state": "probable_duplicate",
        "items": [
            {
                "talent_id": OTHER_ID,
                "full_name": "Jean Dupont",
                "explanation": (
                    "Ces deux fiches semblent appartenir à la même personne parce qu’elles partagent le même e-mail."
                ),
            }
        ],
    }


@pytest.mark.asyncio
async def test_other_talent_id_is_forwarded_to_target_one_pair(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    captured: dict = {}

    async def _explanation(user_id: str, *, talent_id: str, other_talent_id: str | None = None) -> dict:
        captured["other_talent_id"] = other_talent_id
        return {"state": "ambiguous", "items": []}

    monkeypatch.setattr(bellum_api, "talent_identity_explanation", _explanation)
    await _run({"talent_id": TALENT_ID, "other_talent_id": OTHER_ID})
    assert captured["other_talent_id"] == OTHER_ID


@pytest.mark.asyncio
async def test_no_talent_id_is_a_clear_error_not_a_network_call(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    def _explode(*_a: object, **_k: object) -> None:
        raise AssertionError("aucun appel réseau sans talent_id")

    monkeypatch.setattr(bellum_api, "talent_identity_explanation", _explode)
    result = await _run({})
    assert "error" in result
    assert "identifiant" in result["error"]


# ── Aucun critère protégé, aucun chiffre de confiance ne traverse ───────────


@pytest.mark.asyncio
async def test_no_protected_criterion_and_no_confidence_number_travels_through(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GA-06 : âge, genre, origine, photo, adresse ne pèsent jamais — et ici,
    ils ne DOIVENT même pas être transportables : le contrat `TalentDuplicateMatch`
    (packages/contracts/src/schemas/talent-duplicates.ts) ne les porte pas.
    Preuve mesurée : `git grep -n "protected\\|age\\|gender" packages/contracts/src/schemas/talent-duplicates.ts`
    ne rend rien.
    """
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _explanation(*_a: object, **_k: object) -> dict:
        return {
            "state": "probable_duplicate",
            "items": [{"talentId": OTHER_ID, "fullName": "Jean Dupont", "explanation": "texte"}],
        }

    monkeypatch.setattr(bellum_api, "talent_identity_explanation", _explanation)
    result = await _run({"talent_id": TALENT_ID})
    import json

    serialised = json.dumps(result).lower()
    for forbidden in ("age", "gender", "genre", "origin", "origine", "photo", "address", "adresse", "confidence"):
        assert forbidden not in serialised, forbidden


# ── LECTURE SEULE : aucune écriture n'est atteignable depuis l'outil ────────


def test_no_write_path_is_reachable_from_this_tool() -> None:
    """`bellum_api` (le SEUL pont que ce tool emprunte) ne porte AUCUNE
    fonction de décision ou de fusion pour l'identité des talents — ni
    `decide`, ni `merge`, ni `fuse` : seule `talent_identity_explanation`
    existe. L'exécuteur ne peut donc atteindre aucune écriture depuis ce nom
    d'outil, quel que soit l'argument qu'on lui passe — l'absence est dans le
    CODE du pont, pas une convention de description.

    Preuve mesurée : `git grep -n "^async def" apps/ia/app/services/bellum_api.py`
    ne rend qu'UNE fonction dont le nom contient « identity », et c'est celle-ci.
    """
    for forbidden in ("decide", "merge_talents", "fuse_talents", "merge_identity", "resolve_identity"):
        assert not hasattr(bellum_api, forbidden), forbidden
    assert hasattr(bellum_api, "talent_identity_explanation")


@pytest.mark.asyncio
async def test_the_executor_calls_only_the_read_bridge_function(monkeypatch: pytest.MonkeyPatch) -> None:
    """Complément du test précédent, côté EXÉCUTEUR plutôt que côté pont :
    aucune autre fonction de `bellum_api` n'est sollicitée par ce nom d'outil."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    called: list[str] = []

    async def _explanation(*_a: object, **_k: object) -> dict:
        called.append("talent_identity_explanation")
        return {"state": "new", "items": []}

    monkeypatch.setattr(bellum_api, "talent_identity_explanation", _explanation)
    await _run({"talent_id": TALENT_ID})
    assert called == ["talent_identity_explanation"]


# ── Sans pont configuré : on le DIT, on ne rend pas du vide ─────────────────


@pytest.mark.asyncio
async def test_without_bridge_configured_the_tool_says_so() -> None:
    result = await _run({"talent_id": TALENT_ID})
    assert "error" in result
    assert not any(isinstance(value, list) and value for value in result.values())
