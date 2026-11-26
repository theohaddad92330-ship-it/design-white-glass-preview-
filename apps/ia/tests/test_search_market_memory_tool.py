"""`search_market_memory` — le 46ᵉ outil de Laura (#1596.6-10 / #1628.1).

Toutes les méthodes existantes de `MarketMemoryService` répondent à une
IDENTITÉ (« que sait-on de l'entreprise X ? »). Cet outil pose la question
INVERSE — « quelles entreprises du corpus ont observé du Java, en
Île-de-France, à plus de 500 personnes ? » — et n'avait aucun endroit où se
poser avant ce lot (`grep -rln "search_market_memory" apps packages` rendait
`0`).

Ce que ce fichier défend, dans l'ordre :

1. **Une recherche SANS filtre est refusée ICI, avant tout appel réseau** —
   jamais une recherche silencieuse qui balaierait tout le corpus partagé.
   C'est le MÊME refus que `MarketMemoryService.searchByFilters` applique
   côté NestJS ; les deux portes disent la même chose, à deux endroits.
2. **Un outil qui ne peut pas s'exécuter le DIT** — sans pont configuré,
   jamais une liste vide qui se lirait « le corpus ne connaît personne ».
3. **Aucune identité de personne ne sort de la forme rendue au modèle.**
4. **Le vocabulaire de la description évite la LETTRE d'un état présent**,
   pas seulement son affirmation — voir la garde jumelle dans
   `test_copilote_prompt_blocks.py`.
"""

from __future__ import annotations

import re
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.services import bellum_api, chat_tools, market_memory_reuse_cache
from app.services.market_memory_wording import market_memory_forbidden_hits

USER = "11111111-1111-4111-8111-111111111111"


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)
    # #220.5 / épopée #3232 — le cache de réutilisation vit PAR PROCESSUS
    # (`market_memory_reuse_cache.py`) : sans ce nettoyage, une entrée posée
    # par un test ferait un faux « déjà interrogé » dans le suivant.
    market_memory_reuse_cache.clear()


async def _run(payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool("search_market_memory", payload or {}, user_id=USER, profile_data=None)


# ── Ce que le catalogue promet ───────────────────────────────────────────────


def test_the_tool_is_declared_with_its_six_filters() -> None:
    names = {tool["name"] for tool in chat_tools.CHAT_TOOLS}
    assert "search_market_memory" in names
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "search_market_memory")
    properties = tool["input_schema"]["properties"]
    for field in (
        "technology",
        "location",
        "esn",
        "role_family",
        "employee_min",
        "employee_max",
        # #2991 (#2287.15 / #2287.17) — la taille (tranche fermée du corpus,
        # distincte de employee_min/max) et le recours externe GÉNÉRIQUE
        # (distinct d'`esn`, une société de services nommée).
        "size",
        "external_recourse_observed",
        # #2991 (#2287.14) — le type d'entreprise, au sens de la SEULE
        # classification que porte le corpus (société de services).
        "is_service_company",
        "limit",
    ):
        assert field in properties, field
    # Aucun filtre n'est marqué obligatoire au niveau du SCHÉMA JSON — le refus
    # « au moins UN filtre » est une règle CROISÉE entre champs, que le schéma
    # `required: []` ne peut pas exprimer. C'est l'exécuteur qui la tient.
    assert tool["input_schema"]["required"] == []


def test_no_editor_or_provider_name_leaks_into_the_description() -> None:
    # « On nomme la CAPACITÉ, jamais l'éditeur. »
    forbidden = ("apollo", "pappers", "insee", "france travail", "decp", "linkedin", "hubspot", "salesforce")
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "search_market_memory")
    description = str(tool["description"]).lower()
    assert not any(word in description for word in forbidden)


def test_description_says_a_filter_is_mandatory() -> None:
    # C'est cette phrase que le modèle lit AVANT même d'essayer un appel sans
    # filtre — pas seulement une conséquence surprise du serveur.
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "search_market_memory")
    description = str(tool["description"])
    assert "OBLIGATOIRE" in description
    assert "refusée" in description


# ── Sans pont : on le DIT, on ne rend pas du vide ────────────────────────────


@pytest.mark.asyncio
async def test_refuses_rather_than_returning_an_empty_answer_without_the_bridge() -> None:
    result = await _run({"technology": "java"})
    assert "error" in result
    assert "matches" not in result


@pytest.mark.asyncio
async def test_makes_zero_network_calls_without_the_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans le pont configuré")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    result = await _run({"technology": "java"})
    assert "error" in result


# ── Le refus SERVEUR sans filtre — avant tout appel réseau ───────────────────


@pytest.mark.asyncio
async def test_an_empty_search_is_refused_before_any_network_call(monkeypatch: pytest.MonkeyPatch) -> None:
    """TDD #1 / #5 — filtre absent → erreur claire, JAMAIS une recherche silencieuse."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("une recherche sans filtre ne doit JAMAIS atteindre le pont")

    monkeypatch.setattr(bellum_api, "search_market_memory", _explode)

    result = await _run({})

    assert "error" in result
    assert "matches" not in result


@pytest.mark.asyncio
async def test_a_search_with_only_whitespace_is_also_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un filtre texte qui ne dit rien ne doit pas valoir un filtre — même
    règle que `normalizedSearchTerm` côté `MarketMemoryService`."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("un filtre fait uniquement d'espaces ne doit pas atteindre le pont")

    monkeypatch.setattr(bellum_api, "search_market_memory", _explode)

    result = await _run({"technology": "   ", "location": ""})

    assert "error" in result


@pytest.mark.asyncio
async def test_limit_alone_does_not_count_as_a_discriminant_filter(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("`limit` seul ne doit pas atteindre le pont")

    monkeypatch.setattr(bellum_api, "search_market_memory", _explode)

    result = await _run({"limit": 10})

    assert "error" in result


@pytest.mark.asyncio
async def test_employee_min_zero_still_counts_as_a_filter(monkeypatch: pytest.MonkeyPatch) -> None:
    """`0` est une VALEUR, pas une absence — `employee_min: 0` doit être
    transmis, pas confondu avec « rien renseigné » (même principe que
    « non mesuré n'est jamais 0 », appliqué à un paramètre plutôt qu'à une
    mesure)."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    called: dict[str, object] = {}

    async def fake(*_args: object, **kwargs: object) -> dict[str, object]:
        called.update(kwargs)
        return {"status": "ok", "matches": []}

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)

    result = await _run({"employee_min": 0})

    assert "error" not in result
    assert called.get("employee_min") == 0


# ── #1961.28 — une absence de résultat se dit « rien observé », jamais « aucune
#    entreprise » : l'absence ne prouve rien sur le marché. ────────────────────


@pytest.mark.asyncio
async def test_an_empty_result_carries_the_rien_observe_wording(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"status": "ok", "matches": []}

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)

    result = await _run({"technology": "cobol-legacy-introuvable"})

    assert result["matches"] == []
    note = str(result["no_results_wording"])
    assert "rien" in note.lower()
    assert "observé" in note.lower()
    assert "aucune entreprise" not in note.lower()
    assert market_memory_forbidden_hits(note) == []


@pytest.mark.asyncio
async def test_a_non_empty_result_carries_no_no_results_wording(monkeypatch: pytest.MonkeyPatch) -> None:
    """La garde ne se contente pas d'être vraie sur le cas vide : elle doit
    aussi savoir se TAIRE quand il y a des résultats — sinon elle ne teste
    rien de spécifique au cas vide."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "status": "ok",
            "matches": [
                {
                    "companyName": "Thales",
                    "coverage": {
                        "covered": True,
                        "marketPaths": 12,
                        "esnObserved": [],
                        "observedStack": [],
                        "roleFamilies": [],
                        "exEsnPresent": None,
                        "observedZone": None,
                    },
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)

    result = await _run({"technology": "java"})

    assert result["matches"] != []
    assert "no_results_wording" not in result


# ── Un filtre fourni : l'appel part, et le résultat est relayé sans identité ─


@pytest.mark.asyncio
async def test_a_provided_filter_reaches_the_bridge_with_the_right_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    captured: dict[str, object] = {}

    async def fake(user_id: str, **kwargs: object) -> dict[str, object]:
        captured["user_id"] = user_id
        captured.update(kwargs)
        return {
            "status": "ok",
            "matches": [
                {
                    "companyName": "Thales",
                    "coverage": {
                        "covered": True,
                        "marketPaths": 41,
                        "esnObserved": [{"esnName": "Capgemini", "persons": 5, "certainty": "moyenne"}],
                        "observedStack": [{"techno": "java", "persons": 12}],
                        "roleFamilies": [{"family": "Data", "persons": 12}],
                        "exEsnPresent": None,
                        "observedZone": {"city": "Paris", "region": "Île-de-France", "country": "France"},
                    },
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)

    result = await _run({"technology": "java", "employee_min": 500, "limit": 5})

    assert captured["user_id"] == USER
    assert captured["technology"] == "java"
    assert captured["employee_min"] == 500
    assert captured["limit"] == 5

    matches = result["matches"]
    assert matches[0]["company_name"] == "Thales"
    assert matches[0]["market_paths"] == 41
    assert matches[0]["esn_observed"] == [{"esn_name": "Capgemini", "persons": 5, "certainty": "moyenne"}]
    assert matches[0]["observed_stack"] == [{"techno": "java", "persons": 12}]


@pytest.mark.asyncio
async def test_size_alone_is_a_valid_discriminant_and_reaches_the_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2991 (#2287.15) — `size` (la tranche, ex. « 51-200 ») est un
    discriminant à lui seul, distinct de employee_min/employee_max."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    captured: dict[str, object] = {}

    async def fake(*_args: object, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"status": "ok", "matches": []}

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)

    result = await _run({"size": "51-200"})

    assert "error" not in result
    assert captured.get("size") == "51-200"


@pytest.mark.asyncio
async def test_external_recourse_observed_true_is_a_valid_discriminant(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2991 (#2287.17) — le recours externe GÉNÉRIQUE (distinct d'`esn`, une
    société de services nommée) suffit seul."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    captured: dict[str, object] = {}

    async def fake(*_args: object, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"status": "ok", "matches": []}

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)

    result = await _run({"external_recourse_observed": True})

    assert "error" not in result
    assert captured.get("external_recourse_observed") is True


@pytest.mark.asyncio
async def test_external_recourse_observed_false_does_not_count_as_a_filter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Doctrine c65/GA-259 — `false` n'affirme jamais « n'externalise pas » :
    ce n'est donc PAS un discriminant, exactement comme un filtre absent."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("`external_recourse_observed: false` ne doit pas atteindre le pont")

    monkeypatch.setattr(bellum_api, "search_market_memory", _explode)

    result = await _run({"external_recourse_observed": False})

    assert "error" in result


@pytest.mark.asyncio
async def test_is_service_company_true_is_a_valid_discriminant(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2991 (#2287.14) — le type d'entreprise (société de services), au sens
    de la SEULE classification que porte le corpus, suffit seul."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    captured: dict[str, object] = {}

    async def fake(*_args: object, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"status": "ok", "matches": []}

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)

    result = await _run({"is_service_company": True})

    assert "error" not in result
    assert captured.get("is_service_company") is True


@pytest.mark.asyncio
async def test_is_service_company_false_does_not_count_as_a_filter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Doctrine c65/GA-259 — `false` mélangerait « mesuré non-ESN » et « non
    mesuré » : ce n'est donc PAS un discriminant, exactement comme un filtre
    absent."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("`is_service_company: false` ne doit pas atteindre le pont")

    monkeypatch.setattr(bellum_api, "search_market_memory", _explode)

    result = await _run({"is_service_company": False})

    assert "error" in result


@pytest.mark.asyncio
async def test_default_limit_is_twenty_when_not_specified(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    captured: dict[str, object] = {}

    async def fake(*_args: object, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"status": "ok", "matches": []}

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)
    await _run({"technology": "java"})
    assert captured["limit"] == 20


@pytest.mark.asyncio
async def test_a_none_bridge_response_is_a_clear_error_not_an_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)
    result = await _run({"technology": "java"})
    assert "error" in result
    assert "matches" not in result


@pytest.mark.asyncio
async def test_an_unavailable_status_is_an_error_never_an_empty_corpus(monkeypatch: pytest.MonkeyPatch) -> None:
    """`unavailable` veut dire « je n'ai pas pu LIRE » — jamais « aucune
    entreprise ne correspond », qui est une affirmation sur le marché."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"status": "unavailable", "reason": "read_failed"}

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)
    result = await _run({"technology": "java"})
    assert "error" in result
    assert "matches" not in result


# ── Aucune identité de personne ne sort de la forme rendue ───────────────────


@pytest.mark.asyncio
async def test_no_personal_identity_leaks_through_the_rendered_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "status": "ok",
            "matches": [
                {
                    "companyName": "Thales",
                    "coverage": {
                        "covered": True,
                        "marketPaths": 41,
                        "esnObserved": [{"esnName": "Capgemini", "persons": 5, "certainty": "moyenne"}],
                        "observedStack": [{"techno": "java", "persons": 12}],
                        "roleFamilies": [{"family": "Data", "persons": 12}],
                        "exEsnPresent": None,
                        "observedZone": None,
                    },
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)
    result = await _run({"technology": "java"})

    match = result["matches"][0]
    # La forme EXACTE — un champ ajouté sans y être inscrit ici fait tomber ce
    # test, et c'est le but : c'est comme ça qu'une identité se glisserait.
    # `count_contract` (#213.2, épopée #3228) y figure : un COMPTE de parcours,
    # jamais une personne (voir count_contract.py — aucune clé de personne).
    assert set(match.keys()) == {
        "company_name",
        "market_paths",
        "esn_observed",
        "observed_stack",
        "role_families",
        "observed_zone",
        "count_contract",
    }
    serialised = str(match).lower()
    for forbidden in ("@", "linkedin", "phone", "téléphone", "full_name", "fullname"):
        assert forbidden not in serialised


# ── #1961.20 — les limites méthodologiques sont un CHAMP, pas seulement de la
# description de l'outil ────────────────────────────────────────────────────
#
# La description de l'outil dit déjà « c'est une trace du PASSÉ, jamais une
# photographie du présent » — mais une description n'est lue qu'UNE FOIS, à
# l'ouverture du tour, jamais rappelée au moment où le modèle rédige sa
# réponse à partir du résultat. Un champ structuré voyage AVEC le résultat.


@pytest.mark.asyncio
async def test_a_successful_search_carries_structured_methodological_limits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"status": "ok", "matches": [], "truncated": False}

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)
    result = await _run({"technology": "java"})

    assert "error" not in result
    limits = result["methodological_limits"]
    assert isinstance(limits, str) and limits.strip()
    # Le CHAMP répète le fond de la description (trace du passé, jamais un
    # état présent) — pas un texte qui dirait autre chose que la description.
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "search_market_memory")
    assert "passé" in limits.lower()
    assert "passé" in str(tool["description"]).lower()
    # Distinct de la description de l'outil : un champ, pas une recopie verbatim.
    assert limits != tool["description"]


# ── #213.2/#213.6 (#3207, épopée #3228) — le contrat de comptage VOYAGE avec
# chaque entreprise : un compte de PARCOURS, jamais de personnes, et le seuil
# de suppression déjà appliqué (jusqu'ici seulement une phrase) devient un
# CHAMP que Laura peut citer précisément.


@pytest.mark.asyncio
async def test_each_match_carries_its_count_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "status": "ok",
            "matches": [
                {
                    "companyName": "Thales",
                    "coverage": {
                        "covered": True,
                        "marketPaths": 41,
                        "esnObserved": [],
                        "observedStack": [],
                        "roleFamilies": [],
                        "exEsnPresent": None,
                        "observedZone": None,
                    },
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)
    result = await _run({"technology": "java"})

    contract = result["matches"][0]["count_contract"]
    assert contract["object_type"] == "parcours"
    assert contract["raw_count"] == 41
    assert contract["current_or_historical"] == "historical"
    assert contract["source_layers"] == ["market_memory"]
    # #213.6 — le plancher transverse déjà appliqué (3), enfin structuré :
    # jusqu'ici seulement une phrase de description/`methodological_limits`.
    assert contract["suppression_threshold"] == chat_tools._MARKET_MEMORY_MIN_PATHS
    # « Non mesuré » n'est jamais 0 : aucune identité de personne ne descend
    # jusqu'ici (voir count_contract.py) — ces deux champs restent absents,
    # jamais recopiés depuis `raw_count`.
    assert contract["deduplicated_count"] is None
    assert contract["resolved_count"] is None


@pytest.mark.asyncio
async def test_the_count_contract_threshold_follows_a_raised_min_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    """#1961.9 — un `min_paths` demandé plus haut que le plancher transverse
    doit se lire dans le contrat de comptage, pas seulement filtrer la liste."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake(*_args: object, **_kwargs: object) -> dict[str, object]:
        return _fake_result_with_paths(41)

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)
    raised_floor = chat_tools._MARKET_MEMORY_MIN_PATHS + 5

    result = await _run({"technology": "java", "min_paths": raised_floor})

    assert result["matches"][0]["count_contract"]["suppression_threshold"] == raised_floor


# ── #1961.9 — le seuil minimal d'observations se RELÈVE, jamais ne se BAISSE ─
#
# `_MARKET_MEMORY_MIN_PATHS` (3) est le plancher TRANSVERSE de toute la
# mémoire marché (`discover_scoring.py`, miroir de `market-memory.ts`). Il
# reste verrouillé côté service : `min_paths` ne peut que le RELEVER — une
# valeur plus basse (ou absente) laisse le plancher tel quel.


def _fake_result_with_paths(*counts: int) -> dict[str, object]:
    return {
        "status": "ok",
        "matches": [
            {
                "companyName": f"Entreprise {count}",
                "coverage": {
                    "covered": True,
                    "marketPaths": count,
                    "esnObserved": [],
                    "observedStack": [],
                    "roleFamilies": [],
                    "exEsnPresent": None,
                    "observedZone": None,
                },
            }
            for count in counts
        ],
    }


@pytest.mark.asyncio
async def test_min_paths_raises_the_floor_and_excludes_thinner_companies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake(*_args: object, **_kwargs: object) -> dict[str, object]:
        return _fake_result_with_paths(3, 9, 12)

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)
    result = await _run({"technology": "java", "min_paths": 10})

    names = {match["company_name"] for match in result["matches"]}
    assert names == {"Entreprise 12"}


@pytest.mark.asyncio
async def test_min_paths_below_the_transverse_floor_is_ignored_not_lowered(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake(*_args: object, **_kwargs: object) -> dict[str, object]:
        return _fake_result_with_paths(3, 5)

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)
    # 1 est SOUS le plancher transverse (3) : demander plus bas ne baisse rien.
    result = await _run({"technology": "java", "min_paths": 1})

    names = {match["company_name"] for match in result["matches"]}
    assert names == {"Entreprise 3", "Entreprise 5"}


# ── #1961.10 — une borne dépassée se BORNE ici, jamais une fausse panne ──────
#
# Vérification 13/09 : le DTO du pont (`CopilotMarketMemorySearchDto`) refuse
# en 400 une limite > 50, un filtre texte > 120 caractères et un effectif hors
# [0, 5 000 000]. `bellum_api._post` réduit tout non-2xx à `None`, et l'outil
# répondait alors « La mémoire marché n'a pas répondu » — une panne qui
# n'existait pas, que Laura présentait comme telle.


@pytest.mark.asyncio
async def test_a_limit_above_the_bridge_cap_is_bounded_and_laura_is_told(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    captured: dict[str, object] = {}

    async def fake(*_args: object, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"status": "ok", "matches": [], "truncated": True}

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)

    result = await _run({"technology": "java", "limit": 200})

    assert captured["limit"] == 50
    assert "error" not in result
    assert result["limit_capped"] == {"requested": 200, "applied": 50}
    assert "200" in result["limit_note"] and "50" in result["limit_note"]


@pytest.mark.asyncio
async def test_a_limit_within_the_cap_carries_no_capping_note(monkeypatch: pytest.MonkeyPatch) -> None:
    """Témoin : à la borne exacte, rien n'est coupé, donc rien n'est annoncé."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    captured: dict[str, object] = {}

    async def fake(*_args: object, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"status": "ok", "matches": []}

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)

    result = await _run({"technology": "java", "limit": 50})

    assert captured["limit"] == 50
    assert "limit_capped" not in result
    assert "limit_note" not in result


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"technology": "j" * 121},
        {"location": "Île-de-France " * 10},
        {"esn": "e" * 121},
        {"role_family": "r" * 121},
        {"size": "s" * 121},
        {"technology": "java", "employee_min": -1},
        {"technology": "java", "employee_max": 5_000_001},
    ],
)
async def test_a_filter_the_bridge_would_reject_is_refused_clearly_before_the_call(
    monkeypatch: pytest.MonkeyPatch, payload: dict[str, object]
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("un filtre que le pont refuserait ne doit pas partir")

    monkeypatch.setattr(bellum_api, "search_market_memory", _explode)

    result = await _run(payload)

    assert "error" in result
    # Le refus nomme la BORNE — jamais une panne du service.
    assert "pas répondu" not in result["error"]
    assert "pas pu être lue" not in result["error"]


@pytest.mark.asyncio
async def test_a_filter_exactly_at_the_bound_still_reaches_the_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    """Témoin : 120 caractères et un effectif de 5 000 000 sont ACCEPTÉS par le DTO."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    captured: dict[str, object] = {}

    async def fake(*_args: object, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"status": "ok", "matches": []}

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)

    result = await _run({"technology": "j" * 120, "employee_max": 5_000_000})

    assert "error" not in result
    assert captured["technology"] == "j" * 120


def _bridge_dto_block() -> str | None:
    rel = Path("apps/api/src/modules/copilot-bridge/dto/copilot-bridge.dto.ts")
    for parent in Path(__file__).resolve().parents:
        candidate = parent / rel
        if candidate.is_file():
            source = candidate.read_text(encoding="utf-8")
            match = re.search(r"class CopilotMarketMemorySearchDto.*?\.strict\(\)", source, flags=re.DOTALL)
            return match.group(0) if match else ""
    return None


def test_the_tool_bounds_mirror_the_bridge_dto() -> None:
    """Les bornes de l'outil sont une COPIE de celles du DTO (le service IA n'a
    pas le paquet TS à l'exécution). Cette garde lit le DTO et compare : une
    borne changée d'un seul côté fait tomber le test, au lieu de refaire une
    fausse panne. Se saute dans une image de déploiement sans `apps/api`."""
    block = _bridge_dto_block()
    if block is None:
        pytest.skip("monorepo absent (image de déploiement du service IA)")
    # Elle LIT quelque chose : le bloc du DTO existe et porte ses bornes.
    assert block, "CopilotMarketMemorySearchDto introuvable dans le DTO du pont"

    limit = re.search(r"limit:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\((\d+)\)", block)
    texts = re.findall(
        r"(technology|location|esn|roleFamily|size):\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\((\d+)\)", block
    )
    employees = re.findall(r"(employeeMin|employeeMax):\s*z\.number\(\)\.int\(\)\.min\((\d+)\)\.max\(([\d_]+)\)", block)

    assert limit is not None
    assert int(limit.group(1)) == chat_tools.MARKET_SEARCH_MAX_LIMIT
    # #2991 (#2287.15) — `size` a rejoint les quatre champs texte bornés.
    assert len(texts) == 5
    assert {int(bound) for _, bound in texts} == {chat_tools.MARKET_SEARCH_FILTER_MAX_CHARS}
    assert len(employees) == 2
    assert {int(low) for _, low, _ in employees} == {0}
    assert {int(high.replace("_", "")) for _, _, high in employees} == {chat_tools.MARKET_SEARCH_EMPLOYEES_MAX}

    # La description que lit le modèle annonce la MÊME borne.
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "search_market_memory")
    assert f"maximum {chat_tools.MARKET_SEARCH_MAX_LIMIT}" in tool["input_schema"]["properties"]["limit"]["description"]


# ── #1961.21 — le lien vers la fiche d'un compte du portefeuille ─────────────

_ACCOUNT_ID = "3f1f4a6e-1f8b-4a2e-9d4c-2b7c9e0a1d55"


def _bridge_row(**extra: object) -> dict[str, object]:
    return {
        "companyName": "Thales",
        "coverage": {
            "covered": True,
            "marketPaths": 41,
            "esnObserved": [],
            "observedStack": [],
            "roleFamilies": [],
            "exEsnPresent": None,
            "observedZone": None,
        },
        **extra,
    }


async def _run_with_rows(monkeypatch: pytest.MonkeyPatch, rows: list[dict[str, object]]) -> dict:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"status": "ok", "truncated": False, "matches": rows}

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)
    return await _run({"technology": "java"})


@pytest.mark.asyncio
async def test_the_account_route_is_relayed_when_the_company_is_a_portfolio_account(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#1961.21 — le pont rend `accountRoute` quand l'entreprise est AUSSI un
    compte de l'espace appelant (rapproché par domaine ou par décision humaine,
    jamais par nom seul — tenu côté NestJS). Relayé sous `account_route`."""
    result = await _run_with_rows(monkeypatch, [_bridge_row(accountRoute=f"/accounts/{_ACCOUNT_ID}")])

    match = result["matches"][0]
    assert match["account_route"] == f"/accounts/{_ACCOUNT_ID}"
    assert set(match.keys()) == {
        "company_name",
        "market_paths",
        "esn_observed",
        "observed_stack",
        "role_families",
        "observed_zone",
        "account_route",
        "account_id",
        "count_contract",
    }


@pytest.mark.asyncio
async def test_no_account_route_key_when_the_company_is_not_in_the_portfolio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Absent, pas `None` : cinquante lignes sans lien ne coûtent pas cinquante
    clés vides au modèle, et « pas de lien » ne se lit pas « lien vide »."""
    result = await _run_with_rows(monkeypatch, [_bridge_row()])

    assert "account_route" not in result["matches"][0]
    assert "account_id" not in result["matches"][0]


@pytest.mark.asyncio
async def test_a_route_that_is_not_an_account_page_is_never_relayed(monkeypatch: pytest.MonkeyPatch) -> None:
    """SAIT DIRE NON — le modèle rend ce champ cliquable tel quel : une URL
    absolue, un sous-écran ou un schéma `javascript:` ne passent pas, même si
    le pont venait à en rendre un (défense en profondeur du contrat zod)."""
    for route in (
        f"https://exemple.test/accounts/{_ACCOUNT_ID}",
        f"/accounts/{_ACCOUNT_ID}/brief",
        "/settings",
        "javascript:alert(1)",
        42,
    ):
        result = await _run_with_rows(monkeypatch, [_bridge_row(accountRoute=route)])
        assert "account_route" not in result["matches"][0], route
        assert "account_id" not in result["matches"][0], route


def test_the_description_tells_laura_the_link_exists_and_how_it_is_made() -> None:
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "search_market_memory")
    description = str(tool["description"])
    assert "account_route" in description
    # La règle du rapprochement voyage avec la promesse : jamais par le nom seul.
    assert "jamais par son seul nom" in description


# ── #3177.2 / épopée #3225 — L'AXE IDENTITÉ DE GROUPE (`company_id`) ─────────
#
# `search_market_memory` par CRITÈRES (tout ce qui précède dans ce fichier) et
# `search_market_memory` par IDENTITÉ (ici) sont deux axes du MÊME outil : pas
# un second outil redondant. `company_id` route vers
# `market_memory_context_for_group`, jamais vers `search_market_memory`
# (`bellum_api`) — les deux fonctions ne doivent jamais être appelées ensemble.

_ROOT_ACCOUNT = "5f2c1e0a-1234-4abc-9def-000000000001"


def _own_account(monkeypatch: pytest.MonkeyPatch, account: dict[str, object] | None, *, raises: bool = False) -> None:
    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))
    if raises:
        monkeypatch.setattr(
            "app.services.ownership.fetch_owned_account", AsyncMock(side_effect=HTTPException(status_code=404))
        )
        return

    async def _fetch(*_a: object, **_k: object) -> dict[str, object]:
        return account or {}

    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(side_effect=_fetch))


def test_the_tool_is_declared_with_the_group_identity_params() -> None:
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "search_market_memory")
    properties = tool["input_schema"]["properties"]
    assert "company_id" in properties
    assert "include_subsidiaries" in properties


@pytest.mark.asyncio
async def test_company_id_bypasses_the_at_least_one_filter_refusal(monkeypatch: pytest.MonkeyPatch) -> None:
    """`company_id` seul, SANS aucun critère, ne doit PAS être refusé — c'est
    un AUTRE axe de recherche, pas un filtre parmi d'autres."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(monkeypatch, {"id": _ROOT_ACCOUNT, "company_name": "Société Générale"})

    async def fake_group(*_a: object, **_k: object) -> dict[str, object]:
        return {"status": "ok", "matches": [], "truncated": False}

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    result = await _run({"company_id": _ROOT_ACCOUNT})

    assert "error" not in result


@pytest.mark.asyncio
async def test_company_id_routes_to_the_group_bridge_never_the_filter_search(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(
        monkeypatch,
        {"id": _ROOT_ACCOUNT, "company_name": "Société Générale", "website": "sg.fr", "registry_country": "FR"},
    )

    captured: dict[str, object] = {}

    async def fake_group(user_id: str, **kwargs: object) -> dict[str, object]:
        captured["user_id"] = user_id
        captured.update(kwargs)
        return {"status": "ok", "matches": [], "truncated": False}

    def _explode(*_a: object, **_k: object) -> None:
        raise AssertionError("company_id ne doit JAMAIS atteindre la recherche PAR CRITÈRES")

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)
    monkeypatch.setattr(bellum_api, "search_market_memory", _explode)

    await _run({"company_id": _ROOT_ACCOUNT, "technology": "java", "include_subsidiaries": False})

    assert captured["user_id"] == USER
    assert captured["root_account_id"] == _ROOT_ACCOUNT
    assert captured["entities"][0] == {
        "ref": _ROOT_ACCOUNT,
        "companyName": "Société Générale",
        "website": "sg.fr",
        "country": "FR",
    }
    # `include_subsidiaries: false` : aucune filiale ajoutée, même si le compte en porte.
    assert len(captured["entities"]) == 1


@pytest.mark.asyncio
async def test_include_subsidiaries_adds_the_real_account_subsidiaries_never_the_ledger(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#3225 — la dépendance assumée porte sur `persistent_scope` (#3178, pas
    stabilisé) ; `accounts.subsidiaries` est une donnée RÉELLE déjà en
    production, et c'est elle que ce lot branche."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(
        monkeypatch,
        {
            "id": _ROOT_ACCOUNT,
            "company_name": "Société Générale",
            "subsidiaries": ["Boursorama / BoursoBank", "Treezor", "", "  "],
        },
    )

    captured: dict[str, object] = {}

    async def fake_group(user_id: str, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"status": "ok", "matches": [], "truncated": False}

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    await _run({"company_id": _ROOT_ACCOUNT, "include_subsidiaries": True})

    entities = captured["entities"]
    # Racine + deux filiales nommées — les entrées vides/blanches n'entrent pas.
    assert [e["companyName"] for e in entities] == ["Société Générale", "Boursorama / BoursoBank", "Treezor"]
    assert entities[1]["ref"] == f"{_ROOT_ACCOUNT}-sub-0"


@pytest.mark.asyncio
async def test_a_match_on_a_declared_subsidiary_is_named_filiale_never_an_external_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#219.6 (épopée #3231, reste du 30/09) — CLIENT INTERNE : une entité
    retrouvée dont le nom correspond à une filiale DÉCLARÉE du compte est
    nommée `entity_relation_to_account: "filiale"`, pour que Laura ne la
    présente jamais comme un client externe distinct."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(
        monkeypatch,
        {
            "id": _ROOT_ACCOUNT,
            "company_name": "Société Générale",
            "subsidiaries": ["Boursorama / BoursoBank"],
        },
    )

    async def fake_group(user_id: str, **kwargs: object) -> dict[str, object]:
        return {
            "status": "ok",
            "truncated": False,
            "matches": [
                {
                    "companyName": "Boursorama / BoursoBank",
                    "coverage": {"marketPaths": 12, "esnObserved": [], "observedStack": [], "roleFamilies": []},
                },
                {
                    "companyName": "Un tiers non déclaré",
                    "coverage": {"marketPaths": 12, "esnObserved": [], "observedStack": [], "roleFamilies": []},
                },
            ],
        }

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    result = await _run({"company_id": _ROOT_ACCOUNT, "include_subsidiaries": True})

    by_name = {m["company_name"]: m for m in result["matches"]}
    assert by_name["Boursorama / BoursoBank"]["entity_relation_to_account"] == "filiale"
    assert "entity_relation_to_account" not in by_name["Un tiers non déclaré"]


@pytest.mark.asyncio
async def test_include_subsidiaries_never_shows_the_same_legal_entity_twice(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#3225 (audit 28/09 soir) — `accounts.subsidiaries` est une saisie
    libre : un doublon (casse/espaces différents) ou une filiale qui répète
    le nom de la RACINE ne doit jamais produire deux lignes pour LA MÊME
    personne morale — « deux entités distinctes restent deux lignes »
    implique aussi qu'une même entité ne fait jamais deux lignes."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(
        monkeypatch,
        {
            "id": _ROOT_ACCOUNT,
            "company_name": "Société Générale",
            "subsidiaries": [
                "Boursorama / BoursoBank",
                "boursorama / boursobank",  # doublon, casse différente
                "  Boursorama / BoursoBank  ",  # doublon, espaces différents
                "Société Générale",  # répète la racine elle-même
                "Treezor",
            ],
        },
    )

    captured: dict[str, object] = {}

    async def fake_group(user_id: str, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"status": "ok", "matches": [], "truncated": False}

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    await _run({"company_id": _ROOT_ACCOUNT, "include_subsidiaries": True})

    entities = captured["entities"]
    assert [e["companyName"] for e in entities] == ["Société Générale", "Boursorama / BoursoBank", "Treezor"]


@pytest.mark.asyncio
async def test_deduplication_frees_room_for_real_subsidiaries_the_cap_would_otherwise_have_dropped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#3225 (audit 28/09 soir) — sans dédoublonnage, des doublons de saisie
    en tête de liste consommeraient des places sous
    `MARKET_SEARCH_GROUP_MAX_ENTITIES` et feraient tomber de VRAIES filiales
    distinctes hors du scope, avant même la troncature légitime. Ici 4
    doublons + 4 filiales distinctes tiennent toutes sous le plafond (5) une
    fois dédoublonnées, alors qu'une simple troncature brute n'en aurait
    gardé que 4 (3 doublons + 1 distincte)."""
    assert chat_tools.MARKET_SEARCH_GROUP_MAX_ENTITIES == 6  # le test suppose ce plafond
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(
        monkeypatch,
        {
            "id": _ROOT_ACCOUNT,
            "company_name": "Société Générale",
            "subsidiaries": [
                "Boursorama / BoursoBank",
                "Boursorama / BoursoBank",
                "Boursorama / BoursoBank",
                "Boursorama / BoursoBank",
                "Treezor",
                "Forge",
                "Société Générale Holding de Participations",
                "Shine",
            ],
        },
    )

    captured: dict[str, object] = {}

    async def fake_group(user_id: str, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"status": "ok", "matches": [], "truncated": False}

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    await _run({"company_id": _ROOT_ACCOUNT, "include_subsidiaries": True})

    entities = captured["entities"]
    assert [e["companyName"] for e in entities] == [
        "Société Générale",
        "Boursorama / BoursoBank",
        "Treezor",
        "Forge",
        "Société Générale Holding de Participations",
        "Shine",
    ]


@pytest.mark.asyncio
async def test_a_foreign_or_missing_company_id_never_leaks_another_tenants_account(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(monkeypatch, None, raises=True)

    result = await _run({"company_id": "not-mine"})

    # #3195.1-.4 (main, 29/09) — le refus « introuvable » porte désormais le
    # geste suivant (`next_step`) ; rien d'autre ne fuit.
    assert result["error"] == "Compte introuvable dans votre portefeuille."
    assert set(result) == {"error", "next_step"}


@pytest.mark.asyncio
async def test_a_group_read_relays_matches_through_the_same_shared_relay_as_filter_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Même forme, même clés que la recherche PAR CRITÈRES — une seule
    fonction de relais (`_relay_market_memory_matches`), jamais deux."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(monkeypatch, {"id": _ROOT_ACCOUNT, "company_name": "Société Générale"})

    async def fake_group(*_a: object, **_k: object) -> dict[str, object]:
        return {
            "status": "ok",
            "truncated": False,
            "matches": [_bridge_row(companyName="Société Générale", accountRoute=f"/accounts/{_ROOT_ACCOUNT}")],
        }

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    result = await _run({"company_id": _ROOT_ACCOUNT})

    assert result["matches"][0]["company_name"] == "Société Générale"
    assert result["matches"][0]["account_route"] == f"/accounts/{_ROOT_ACCOUNT}"
    assert "truncated" not in result  # LE CHAMP `truncated` n'existe QUE côté filtre — voir `group_note` ci-dessous.


@pytest.mark.asyncio
async def test_a_truncated_group_names_the_bound_it_hit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(monkeypatch, {"id": _ROOT_ACCOUNT, "company_name": "Société Générale"})

    async def fake_group(*_a: object, **_k: object) -> dict[str, object]:
        return {"status": "ok", "truncated": True, "matches": []}

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    result = await _run({"company_id": _ROOT_ACCOUNT})

    assert str(chat_tools.MARKET_SEARCH_GROUP_MAX_ENTITIES) in result["group_note"]


@pytest.mark.asyncio
async def test_an_unavailable_group_read_is_a_clean_error_never_an_empty_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(monkeypatch, {"id": _ROOT_ACCOUNT, "company_name": "Société Générale"})

    async def fake_group(*_a: object, **_k: object) -> dict[str, object]:
        return {"status": "unavailable", "reason": "read_failed"}

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    result = await _run({"company_id": _ROOT_ACCOUNT})

    assert "error" in result
    assert "matches" not in result


@pytest.mark.asyncio
async def test_the_bridge_reason_travels_with_a_failed_group_read(monkeypatch: pytest.MonkeyPatch) -> None:
    """#3225 (recette prod 01/10) — « la lecture a échoué » ne disait pas POURQUOI :
    `contract_mismatch` (le pont a refusé sa propre sortie) et `read_failed` (la
    base) n'ont pas la même suite. La raison du pont voyage donc avec l'erreur."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(monkeypatch, {"id": _ROOT_ACCOUNT, "company_name": "La Poste"})

    async def fake_group(*_a: object, **_k: object) -> dict[str, object]:
        return {"status": "unavailable", "reason": "contract_mismatch"}

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    result = await _run({"company_id": _ROOT_ACCOUNT})

    assert result["read_failure_reason"] == "contract_mismatch"
    assert "matches" not in result


def test_the_group_max_entities_mirror_matches_the_bridge_dto() -> None:
    """Même garde que `test_the_tool_bounds_mirror_the_bridge_dto` : la COPIE
    Python de `MARKET_MEMORY_GROUP_MAX_ENTITIES` (`@bellum/contracts`) ne doit
    jamais diverger en silence du DTO qui la porte réellement."""
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "apps/api/src/modules/copilot-bridge/dto/copilot-bridge.dto.ts"
        if candidate.is_file():
            source = candidate.read_text(encoding="utf-8")
            assert "MARKET_MEMORY_GROUP_MAX_ENTITIES" in source
            return
    pytest.skip("monorepo absent (image de déploiement du service IA)")


# ── #220.5 / épopée #3232 — RÉUTILISER, jamais relancer toute la collecte ────
#
# `compare_scenarios` (#3214), le point d'ancrage que #3232 nomme, n'existe
# QUE sur `feat/lau-219-220-28-09` (absent de `main`, voir
# `market_memory_reuse_cache.py`). Ce que ces tests prouvent : le MÊME appel
# (mêmes critères, ou la même identité) posé deux fois par le même
# utilisateur ne fait qu'UN appel réseau — la brique que #3232 peut
# consommer une fois `compare_scenarios` fusionné.


@pytest.mark.asyncio
async def test_an_identical_filter_search_reuses_the_previous_read_without_a_second_network_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    calls = 0

    async def fake(*_a: object, **_k: object) -> dict[str, object]:
        nonlocal calls
        calls += 1
        return {"status": "ok", "matches": [], "truncated": False}

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)

    first = await _run({"technology": "java"})
    second = await _run({"technology": "java"})

    assert calls == 1
    assert "reused_from_memory" not in first
    assert second["reused_from_memory"] is True


@pytest.mark.asyncio
async def test_a_different_filter_is_never_served_from_the_previous_readss_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    calls = 0

    async def fake(*_a: object, **_k: object) -> dict[str, object]:
        nonlocal calls
        calls += 1
        return {"status": "ok", "matches": [], "truncated": False}

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)

    await _run({"technology": "java"})
    result = await _run({"technology": "python"})

    assert calls == 2
    assert "reused_from_memory" not in result


@pytest.mark.asyncio
async def test_an_identical_company_id_search_reuses_the_previous_read(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(monkeypatch, {"id": _ROOT_ACCOUNT, "company_name": "Société Générale"})
    calls = 0

    async def fake_group(*_a: object, **_k: object) -> dict[str, object]:
        nonlocal calls
        calls += 1
        return {"status": "ok", "matches": [], "truncated": False}

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    first = await _run({"company_id": _ROOT_ACCOUNT})
    second = await _run({"company_id": _ROOT_ACCOUNT})

    assert calls == 1
    assert "reused_from_memory" not in first
    assert second["reused_from_memory"] is True


@pytest.mark.asyncio
async def test_include_subsidiaries_changes_the_group_scope_and_is_never_served_from_the_narrower_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le scope racine SEULE et le scope racine + filiales sont deux lectures
    différentes — jamais confondues par le cache, même compte, même appelant."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(
        monkeypatch,
        {"id": _ROOT_ACCOUNT, "company_name": "Société Générale", "subsidiaries": ["Boursorama / BoursoBank"]},
    )
    calls = 0

    async def fake_group(*_a: object, **_k: object) -> dict[str, object]:
        nonlocal calls
        calls += 1
        return {"status": "ok", "matches": [], "truncated": False}

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    await _run({"company_id": _ROOT_ACCOUNT, "include_subsidiaries": False})
    result = await _run({"company_id": _ROOT_ACCOUNT, "include_subsidiaries": True})

    assert calls == 2
    assert "reused_from_memory" not in result


@pytest.mark.asyncio
async def test_an_unavailable_read_is_never_cached_and_the_next_call_retries_the_network(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    calls = 0

    async def flaky_then_ok(*_a: object, **_k: object) -> dict[str, object]:
        nonlocal calls
        calls += 1
        if calls == 1:
            return {"status": "unavailable", "reason": "read_failed"}
        return {"status": "ok", "matches": [], "truncated": False}

    monkeypatch.setattr(bellum_api, "search_market_memory", flaky_then_ok)

    first = await _run({"technology": "java"})
    second = await _run({"technology": "java"})

    assert "error" in first
    assert calls == 2
    assert "reused_from_memory" not in second


# ── #3225 (recette prod 30/09) — le mode dégradé porte une synthèse ET les filiales ──


@pytest.mark.asyncio
@pytest.mark.parametrize("bridge_result", [None, {"status": "unavailable"}])
async def test_a_silent_bridge_still_hands_laura_the_declared_group_to_synthesise(
    monkeypatch: pytest.MonkeyPatch, bridge_result: dict[str, object] | None
) -> None:
    """Recette prod : « la source n'a pas répondu » et RIEN d'autre — ni synthèse
    ni filiales. Le pont muet ne vide plus la réponse : l'erreur reste (la
    mémoire n'a PAS été lue), mais le périmètre DÉCLARÉ du compte (racine +
    filiales saisies) voyage avec, pour que Laura réponde en mode dégradé."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(
        monkeypatch,
        {
            "id": _ROOT_ACCOUNT,
            "company_name": "La Poste",
            "subsidiaries": ["Colissimo", "la poste", "Docaposte", "  "],
        },
    )

    async def fake_group(*_a: object, **_k: object) -> dict[str, object] | None:
        return bridge_result

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    result = await _run({"company_id": _ROOT_ACCOUNT, "include_subsidiaries": True})

    assert "error" in result  # la lecture n'a PAS eu lieu : jamais présentée comme faite
    degraded = result["degraded"]
    assert degraded["root_company"] == "La Poste"
    # dédoublonné (casse) et sans ligne vide ; jamais une filiale inventée
    assert degraded["declared_subsidiaries"] == ["Colissimo", "Docaposte"]
    assert degraded["market_memory_read"] is False
    assert "n'a rien observé" not in str(degraded).lower()  # l'absence de lecture n'est pas « rien vu »


@pytest.mark.asyncio
async def test_a_silent_bridge_with_no_declared_subsidiary_names_that_absence(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(monkeypatch, {"id": _ROOT_ACCOUNT, "company_name": "La Poste"})

    async def fake_group(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)
    result = await _run({"company_id": _ROOT_ACCOUNT})

    assert result["degraded"]["declared_subsidiaries"] == []
    assert "aucune filiale déclarée" in result["degraded"]["note"].lower()


# #3225 (recette prod 01/10) — « les filiales ne sont pas encore distinguées une
# par une » : la réponse par identité ne disait pas, entité par entité, ce que la
# mémoire avait lu. `per_entity` : la racine et CHAQUE filiale demandée, chacune
# avec son propre verdict (lue / rien observé), jamais fondues en un seul agrégat.
@pytest.mark.asyncio
async def test_group_read_names_each_requested_entity_one_by_one(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(
        monkeypatch,
        {"id": _ROOT_ACCOUNT, "company_name": "La Poste", "subsidiaries": ["Colissimo", "Docaposte"]},
    )

    async def fake_group(user_id: str, **kwargs: object) -> dict[str, object]:
        return {
            "status": "ok",
            "truncated": False,
            "matches": [
                {"companyName": "La Poste", "coverage": {"marketPaths": 30, "esnObserved": []}},
                {"companyName": "Docaposte", "coverage": {"marketPaths": 12, "esnObserved": []}},
            ],
        }

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    result = await _run({"company_id": _ROOT_ACCOUNT, "include_subsidiaries": True})

    rows = result["per_entity"]
    assert [(r["company_name"], r["relation"], r["observed"], r["market_paths"]) for r in rows] == [
        ("La Poste", "root", True, 30),
        ("Colissimo", "filiale", False, None),
        ("Docaposte", "filiale", True, 12),
    ]
    # L'absence d'une filiale est NOMMÉE comme celle du corpus, jamais « 0 » ni « rien n'existe ».
    assert "n'a rien observé" in result["per_entity_note"]


@pytest.mark.asyncio
async def test_without_include_subsidiaries_there_is_no_per_entity_breakdown(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(monkeypatch, {"id": _ROOT_ACCOUNT, "company_name": "La Poste", "subsidiaries": ["Colissimo"]})

    async def fake_group(user_id: str, **kwargs: object) -> dict[str, object]:
        return {
            "status": "ok",
            "truncated": False,
            "matches": [{"companyName": "La Poste", "coverage": {"marketPaths": 30, "esnObserved": []}}],
        }

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    result = await _run({"company_id": _ROOT_ACCOUNT, "include_subsidiaries": False})

    assert "per_entity" not in result


@pytest.mark.asyncio
async def test_x32_3225_a_model_that_omits_include_subsidiaries_still_gets_the_per_entity_lines(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Recette Y11 02/10 : le modèle passe `company_id` seul — la réponse porte quand même la ligne
    « lue (N chemins) » / « rien observé » par entité, et nomme l'absence de filiale déclarée."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(monkeypatch, {"id": _ROOT_ACCOUNT, "company_name": "La Poste", "subsidiaries": ["Docaposte"]})
    seen: dict[str, object] = {}

    async def fake_group(user_id: str, **kwargs: object) -> dict[str, object]:
        seen.update(kwargs)
        return {
            "status": "ok",
            "truncated": False,
            "matches": [{"companyName": "La Poste", "coverage": {"marketPaths": 30, "esnObserved": []}}],
        }

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)
    result = await _run({"company_id": _ROOT_ACCOUNT})

    assert [e["companyName"] for e in seen["entities"]] == ["La Poste", "Docaposte"]
    rows = {r["company_name"]: r for r in result["per_entity"]}
    assert rows["La Poste"]["observed"] is True and rows["Docaposte"]["observed"] is False
    assert all(r["line"] for r in rows.values())


@pytest.mark.asyncio
async def test_x32_3225_without_declared_subsidiaries_the_answer_says_so_by_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(monkeypatch, {"id": _ROOT_ACCOUNT, "company_name": "La Poste"})

    async def fake_group(user_id: str, **kwargs: object) -> dict[str, object]:
        return {"status": "ok", "truncated": False, "matches": []}

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)
    result = await _run({"company_id": _ROOT_ACCOUNT})

    assert "aucune filiale déclarée" in result["per_entity_note"].lower()
    assert result["per_entity"][0]["observed"] is False


@pytest.mark.asyncio
async def test_3225_entities_sent_to_the_bridge_always_fit_its_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """Recette prod 01/10 : « La mémoire marché n'a pas répondu » sur La Poste + filiales.
    `accounts.subsidiaries` est une saisie libre (`unknown[]` au contrat) : un objet
    `{name}` devenait « {'name': …} » et un nom de 300 signes faisait refuser TOUT le corps
    (HTTP 400 → `None` → « n'a pas répondu »). Une entité hors contrat est écartée, jamais envoyée."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(
        monkeypatch,
        {
            "id": _ROOT_ACCOUNT,
            "company_name": "LA POSTE",
            "website": "https://" + "x" * 400,
            "registry_country": "FR",
            "subsidiaries": [{"name": "Docaposte"}, {"legal_name": "Geopost SA"}, "N" * 300, 42, "Colissimo"],
        },
    )
    captured: dict[str, object] = {}

    async def fake_group(user_id: str, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"status": "ok", "matches": [], "truncated": False}

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)
    await _run({"company_id": _ROOT_ACCOUNT, "include_subsidiaries": True})

    entities = captured["entities"]
    assert [e["companyName"] for e in entities] == ["LA POSTE", "Docaposte", "Geopost SA", "Colissimo"]
    for entity in entities:
        assert len(entity["ref"]) <= 200 and len(entity["companyName"]) <= 200
        assert len(entity.get("website", "")) <= 300 and len(entity.get("country", "")) <= 120
    assert "website" not in entities[0]


# #3225 (Y3 02/10) — « aucune ligne lue / rien observé par entité » : La Poste sans
# filiale DÉCLARÉE ne produisait aucun `per_entity` (garde `declared_subsidiary_names`),
# donc Laura disait « je n'ai pas mesuré les filiales séparément ». La racine a TOUJOURS
# sa ligne, avec le verdict en mots (`line`), et l'absence de filiale déclarée est nommée.
@pytest.mark.asyncio
async def test_3225_group_read_without_declared_subsidiary_still_gives_one_line_per_entity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(monkeypatch, {"id": _ROOT_ACCOUNT, "company_name": "La Poste", "subsidiaries": []})

    async def fake_group(user_id: str, **kwargs: object) -> dict[str, object]:
        return {
            "status": "ok",
            "truncated": False,
            "matches": [{"companyName": "La Poste", "coverage": {"marketPaths": 30, "esnObserved": []}}],
        }

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    result = await _run({"company_id": _ROOT_ACCOUNT, "include_subsidiaries": True})

    assert [(r["company_name"], r["line"]) for r in result["per_entity"]] == [("La Poste", "lue (30 chemins)")]
    assert "aucune filiale déclarée" in result["per_entity_note"].lower()


@pytest.mark.asyncio
async def test_3225_an_entity_without_reading_says_nothing_observed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    _own_account(monkeypatch, {"id": _ROOT_ACCOUNT, "company_name": "La Poste", "subsidiaries": ["Colissimo"]})

    async def fake_group(user_id: str, **kwargs: object) -> dict[str, object]:
        return {"status": "ok", "truncated": False, "matches": []}

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", fake_group)

    result = await _run({"company_id": _ROOT_ACCOUNT, "include_subsidiaries": True})

    assert [r["line"] for r in result["per_entity"]] == ["rien observé", "rien observé"]
