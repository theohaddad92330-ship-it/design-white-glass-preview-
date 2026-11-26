"""Les outils du §16 du tome 6 — l'accès d'un compte et le second marché ESN.

Le tome 6 nomme quatorze outils « nouveaux » et le tracker de l'archive 03 les
a déclarés « 14 / 14 PRÉSENTS ». Mesure du 29/08/2026 : **zéro sur quatorze** —
aucun des quatorze identifiants n'existait nulle part dans le dépôt, avec un
grep-témoin positif (`get_workspace_health`, deux fichiers) pour prouver que la
méthode voyait quelque chose.

Ce que le tracker avait vu est réel, mais autre : **dix des quatorze CAPACITÉS
avaient déjà leur route REST**. Aucune n'était appelable par Laura. C'est
exactement le « A EST B dispense de lire » que ce tracker dénonce lui-même.

Ce fichier ne vérifie pas que les outils sont DÉCLARÉS — c'est l'erreur qu'il
répare. Il vérifie qu'ils RÉPONDENT, et ce qu'ils répondent quand la donnée
manque :

1. **Un bloc qu'on n'a pas pu lire ne devient pas une liste vide.** « Il n'y a
   pas d'ESN dans le 15 » et « la source d'offres n'a pas répondu » mènent à
   deux gestes opposés.
2. **Un coût d'accès absent ne vaut pas zéro euro.** D60 : le coût est DÉCLARÉ,
   jamais estimé. `null` reste `null` jusqu'au modèle.
3. **Un score n'est jamais nu.** La barrière d'achat sort avec ses proxies et
   avec ce qui n'a pas pu être mesuré ; le score de débordement avec ses axes.
4. **Aucun chemin d'écriture.** `declare_access_fact` (N1) et
   `create_partner_opportunity` (N2), du même §16, n'ont aucun client ici — et
   le dernier test de ce fichier le prouve en énumérant le module.
"""

from __future__ import annotations

import inspect
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.models.tool_result_envelope import ToolResultStatus
from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"
ACCOUNT = "22222222-2222-4222-8222-222222222222"

#: Les cinq outils que ce chantier livre. Toutes des LECTURES.
NEW_TOOLS = (
    "get_account_access",
    "get_esn_on_account",
    "search_partners",
    "get_territory_overview",
    "search_dormant_network",
)

#: Le 14e outil de territoire, livré par le chantier SUIVANT (30/08/2026) : il
#: n'avait pas de capacité REST — seuls une PORTE dans `opportunities` et un
#: COMPTEUR de briefing sortaient du calcul. `CrmRoutinesService
#: .contactsWhoMayHaveMoved` a désormais sa propre capacité
#: (`POST /internal/copilot/contacts/job-changes`), qui rend la LISTE. Séparé
#: de `NEW_TOOLS` : ce n'est pas le même chantier, et l'un des deux tests du
#: bloc « ce que le catalogue promet » vérifie qu'il est ajouté APRÈS les cinq.
JOB_CHANGES_TOOL = "get_job_changes"

#: Les huit autres noms du §16. Aucun n'est livré, et chacun a sa raison —
#: écrite au tracker, pas devinée ici. Ce tuple sert à une seule chose : si
#: quelqu'un en ajoute un plus tard sans lire pourquoi il n'y était pas, le test
#: du bas le lui dit.
DELIBERATELY_ABSENT = (
    # Écritures — Laura prépare, le clic écrit.
    "declare_access_fact",
    "create_partner_opportunity",
    # Doublons d'une lecture déjà rendue en entier.
    "get_access_path",
    "search_territory_accounts",
    "search_territory_esn",
    "get_partner",
    "get_partner_overflow",
    # Rien dans le dépôt ne modélise « telle personne connaît telle autre ».
    # L'inventer voudrait dire inventer la donnée.
    "find_intro_path",
)


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


async def _owned_account(*_a: object, **_k: object) -> dict:
    return {"id": ACCOUNT}


@pytest.fixture(autouse=True)
def _account_ownership(monkeypatch: pytest.MonkeyPatch) -> None:
    # #2852.6-53 — `get_account_access` / `get_esn_on_account` vérifient
    # désormais l'ownership AVANT le pont (même patron que
    # `get_account_briefing`, `test_chat_account_briefing_versioning.py`).
    # Les autres outils de ce fichier n'appellent jamais ces deux fonctions :
    # ce double reste inerte pour eux.
    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))
    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(side_effect=_owned_account))


async def _run(name: str, payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(name, payload or {}, user_id=USER, profile_data=None)


# ── Ce que le catalogue promet ───────────────────────────────────────────────


def test_the_five_tools_are_declared() -> None:
    # Une garde doit LIRE quelque chose : si le catalogue se vide ou si un nom
    # est renommé, ce test le dit au lieu de rester vert sur un corpus absent.
    names = {tool["name"] for tool in chat_tools.CHAT_TOOLS}
    assert len(names) > 30, "le catalogue d'outils est vide ou tronqué"
    assert set(NEW_TOOLS) <= names
    assert JOB_CHANGES_TOOL in names


# Ce qui a été ajouté APRÈS `get_job_changes`, dans l'ordre. La règle n'est pas
# « ces cinq sont les derniers » — elle est « rien ne s'insère AVANT eux ». Un
# chantier qui ajoute un outil l'écrit ici et la fenêtre suit ; un chantier qui
# en glisse un au milieu casse le test, et c'est le but.
TOOLS_ADDED_AFTER = (
    "plan_account_analysis",
    "start_account_analysis",
    # #1506 — les blocages de parcours, ajoutés APRÈS les deux outils d'analyse.
    "get_chain_blockers",
    # #1596.6-10 / #1628.1 — la mémoire marché interrogée PAR FILTRE, le 46ᵉ
    # outil, ajouté APRÈS les blocages de parcours.
    "search_market_memory",
    # #1822 / #1823 — les routines et l'aperçu de l'import, ajoutés APRÈS la
    # mémoire marché.
    "get_routines",
    "get_import_overview",
    # #1799 — Laura BASCULE une routine (elle ne faisait que les lire), ajouté
    # APRÈS l'aperçu de l'import.
    "toggle_routine",
    # LOT 16 (#1822 / #1793) — Laura ÉCRIT dans les réglages, avec
    # confirmation, ajoutés APRÈS `toggle_routine`.
    "get_settings_overview",
    "propose_settings_update",
    "pin_memory_fact",
    # #1822 — les deux LECTURES de réglages ajoutées APRÈS `pin_memory_fact`.
    # `get_memory` est justement la lecture qui lui manquait : on épinglait dans
    # une mémoire qu'aucun outil ne savait relire.
    "get_memory",
    "get_workspace_vocabulary",
    # #1949.23 — l'outil silencieux des demandes non routées, ajouté APRÈS les
    # deux lectures de réglages (décision Louis 13/09 batch 12).
    "note_unrouted_request",
    # #2124.49-.55 (15/09/2026) — la proposition de preuve de mission, posée EN FIN de liste.
    "propose_mission_proof",
    # #1903.10 / #1935 (16/09/2026) — préparer une campagne, posé EN FIN de liste.
    "prepare_campaign",
    # #2470 (16/09/2026) — le tour d'horizon EXÉCUTÉ dans la conversation, posé
    # EN FIN de liste comme tous les précédents.
    "run_account_search",
    # #2268.1 / #2268.5 / #2268.10 (17/09/2026) — la continuité du fil
    # (objectif actif, critères exclus, décisions prises), posée EN FIN de
    # liste comme tous les précédents.
    "note_thread_context",
    # #2271.19 (18/09/2026) — l'historique d'un compte, pour la carte
    # `timeline` de la conversation, posé EN FIN de liste comme tous les
    # précédents.
    "get_account_timeline",
    # #2327.26 (18/09/2026) — expliquer un rapprochement de talents, posé EN
    # FIN de liste comme tous les précédents.
    "explain_talent_duplicate",
    # #2623.1 (20/09/2026) — QUI approcher sur un compte déjà analysé, posé EN
    # FIN de liste comme tous les précédents.
    "get_account_contacts",
    # #2679 (21/09/2026) — les réponses possibles d'une précision posée en TEXTE,
    # posées EN FIN de liste comme toutes les précédentes.
    "offer_reply_options",
    # #2301 (22/09/2026) — la prélecture de compte, posée EN FIN de liste comme
    # toutes les précédentes.
    "get_account_preflight",
    # #2300 (22/09/2026) — le contrat de travail de compte, posé EN FIN de
    # liste comme tous les précédents.
    "get_account_work_contract",
    # #2302 (22/09/2026) — le résolveur de territoire commercial, posé EN FIN
    # de liste comme tous les précédents.
    "resolve_account_territory",
    # #2308 (22/09/2026) — la carte de couverture d'un compte et ses trous
    # actionnables, posée EN FIN de liste comme toutes les précédentes.
    "get_account_coverage_map",
    # #2324 (22/09/2026) — le compilateur d'opportunité, posé EN FIN de liste
    # comme tous les précédents.
    "compile_opportunity",
    "get_pipeline_health",
    # #2322 (22/09/2026) — le compilateur de besoin, posé EN FIN de liste comme
    # tous les précédents.
    "compile_need",
    # #2721 (22/09/2026) — la recherche web exécutée par Laura, posée EN FIN
    # de liste comme tous les précédents.
    "web_search",
    # #2294 (23/09/2026) — la recherche de contacts dans tout l'espace, EN FIN.
    "search_workspace_contacts",
    # #2337 (23/09/2026) — le terrain de jeu multi-talents, posé EN FIN de
    # liste comme tous les précédents.
    "plan_talent_territory",
    # #2392 (23/09/2026) : la clôture de fin de journée, ajoutée EN FIN.
    "compile_day_closure",
    # #2338.8 / #2409.8 (23/09/2026) — le dernier point ouvert de #2338 : Laura
    # nomme ce qui manque avant l'action suivante (checklist de démarrage),
    # posé EN FIN de liste comme tous les précédents.
    "get_mission_start_readiness",
    # #2423.9 (23/09/2026) — préparer un avenant de mission, posé EN FIN de
    # liste comme tous les précédents.
    "propose_mission_amendment",
    # #1950.4 (24/09/2026, fusion vague 30) — le résumé du plan, posé EN FIN de
    # liste juste avant #2391 (rebased pendant l'intégration).
    "describe_plan",
    # #2391 — le plan de journée (« focus plan »), posé EN FIN de liste.
    "propose_focus_plan",
    "propose_opportunity_update",  # #2324.39 — ajouté EN FIN
    # #2376 (23/09/2026) — le brief d'appel avant une prospection, posé EN FIN
    # de liste comme tous les précédents.
    "prepare_cold_call",
    # #2276 — le job composite de Laura, EN FIN de liste.
    "plan_laura_job",
)


def _five_tools_window() -> list[str]:
    """Les cinq outils du second marché, à leur place attendue dans la liste."""
    # #1950.4 — ancrée sur `get_job_changes`, jamais sur la queue de la liste.
    end = [tool["name"] for tool in chat_tools.CHAT_TOOLS].index(JOB_CHANGES_TOOL)
    return [tool["name"] for tool in chat_tools.CHAT_TOOLS[end - len(NEW_TOOLS) : end]]


def test_the_new_tools_are_appended_never_inserted() -> None:
    # Insérer un outil au milieu invaliderait le préfixe d'outils mis en cache
    # pour tous les tours suivants, et le copilote est le premier poste de la
    # facture. `get_job_changes` (chantier suivant) s'est ajouté APRÈS ces cinq,
    # puis les deux outils d'analyse (#1489) après lui — d'où la fenêtre.
    assert _five_tools_window() == list(NEW_TOOLS)


def test_job_changes_is_appended_after_the_five_not_inserted_among_them() -> None:
    # Même règle, pour l'outil livré par le chantier SUIVANT : APRÈS les cinq,
    # jamais glissé au milieu.
    #
    # ⚠️ Il n'est plus le DERNIER outil de la liste, et ce n'était pas la règle :
    # deux outils d'analyse ont été ajoutés après lui le 05/09 (#1489). Ce qui se
    # garde est sa position RELATIVE aux cinq, pas sa place en queue.
    names = [tool["name"] for tool in chat_tools.CHAT_TOOLS]
    # #1950.4 — la PRÉSENCE et l'ordre relatif, jamais la queue : un outil ajouté
    # EN FIN après eux (`describe_plan`) ne doit pas faire tomber ce test.
    after = names[names.index(JOB_CHANGES_TOOL) + 1 :]
    assert after[: len(TOOLS_ADDED_AFTER)] == list(TOOLS_ADDED_AFTER)
    assert _five_tools_window() == list(NEW_TOOLS)


def test_no_editor_or_provider_name_leaks_into_a_tool_description() -> None:
    # « On nomme la CAPACITÉ, jamais l'éditeur. » Les descriptions partent au
    # modèle : un nom de fournisseur ici ressortirait dans une phrase lue devant
    # un client.
    forbidden = ("apollo", "pappers", "insee", "france travail", "decp", "linkedin", "hubspot", "salesforce")
    for name in (*NEW_TOOLS, JOB_CHANGES_TOOL):
        tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == name)
        description = str(tool["description"]).lower()
        assert not any(word in description for word in forbidden), name


def test_each_new_tool_says_what_an_absence_means() -> None:
    """La description PORTE la règle, parce que c'est elle que le modèle lit.

    Un outil qui rend `null` sans le dire produit une phrase fausse au tour
    suivant : « l'entrée est gratuite », « ce département est vide ».
    """
    for name in ("get_account_access", "get_esn_on_account", "search_partners", "get_territory_overview"):
        tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == name)
        assert "IMPORTANT" in str(tool["description"]), name


def test_job_changes_description_says_it_is_a_presumption_not_a_fact() -> None:
    """Un contact qui a PEUT-ÊTRE changé de poste n'a pas changé de poste.

    C'est elle que le modèle lit : la réserve doit être dans la description,
    pas seulement dans la donnée qui revient.
    """
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == JOB_CHANGES_TOOL)
    description = str(tool["description"])
    assert "IMPORTANT" in description
    assert "PRÉSOMPTION" in description
    assert "JAMAIS" in description


def test_dormant_network_description_documents_the_reactivation_score() -> None:
    """#2799 / #2374.17 — c'est CETTE description que le modèle lit, pas le
    code du score (`computeDormantReactivationScore`, `@bellum/contracts`).

    Sans elle, Laura reçoit `reactivation_score.axes` sans savoir qu'un axe
    absent (`points: null`) n'est pas un zéro, et rien ne lui interdit de
    justifier une relance par la seule ancienneté du silence — exactement ce
    que #2374.17 interdit : « ne pas réactiver uniquement parce que le contact
    est ancien ».
    """
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "search_dormant_network")
    description = str(tool["description"])
    assert "IMPORTANT" in description
    assert "neuf axes" in description.lower()
    assert "JAMAIS" in description
    # La formulation doit nommer le critère interdit en solo, pas seulement
    # dire « JAMAIS » quelque part sans rapport.
    assert "ancienneté" in description.lower() or "ancien" in description.lower()


# ── Sans pont : on le DIT, on ne rend pas du vide ────────────────────────────


@pytest.mark.asyncio
async def test_the_new_tools_refuse_rather_than_returning_an_empty_answer() -> None:
    """Un territoire vide et un territoire qu'on n'a pas pu lire ne se disent pas pareil."""
    for name in (*NEW_TOOLS, JOB_CHANGES_TOOL):
        result = await _run(name, {"account_id": ACCOUNT, "department": "31"})
        assert "error" in result, name
        # Aucune liste peuplée, aucun chiffre : un zéro ici serait une réponse,
        # et une fausse.
        assert not any(isinstance(value, (list, int, float)) and value for value in result.values()), name


@pytest.mark.asyncio
async def test_the_refusal_names_what_is_missing_and_not_something_else() -> None:
    """Une phrase fausse dans un refus est pire qu'un refus.

    Ces cinq outils ont leur PROPRE porte : réutiliser celle du vivier ferait
    répondre « je n'ai pas accès à ton vivier » à quelqu'un qui demande par où
    entrer chez un compte.
    """
    result = await _run("get_account_access", {"account_id": ACCOUNT})
    assert "vivier" not in result["error"]
    assert "messagerie" not in result["error"]


@pytest.mark.asyncio
async def test_bridge_makes_zero_network_calls_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans configuration")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    assert await bellum_api.account_access(USER, account_id=ACCOUNT) is None
    assert await bellum_api.account_partners(USER, account_id=ACCOUNT) is None
    assert await bellum_api.partner_pipeline(USER) is None
    assert await bellum_api.territory_overview(USER, department="31") is None
    assert await bellum_api.dormant_contacts(USER) is None
    # `get_job_changes` n'a pas de wrapper nommé dans `bellum_api.py` (fichier
    # hors périmètre) : il appelle `_post` directement, et `_post` porte lui
    # aussi la garde « sans configuration, zéro trafic » — vérifiée ici sur la
    # primitive qu'il utilise réellement.
    assert await bellum_api._post("/internal/copilot/contacts/job-changes", {"userId": USER}) is None


# ── Les arguments manquants sont refusés AVANT le réseau ─────────────────────


@pytest.mark.asyncio
async def test_account_access_asks_for_the_account_before_reading(monkeypatch: pytest.MonkeyPatch) -> None:
    # Sans identifiant, la lecture porterait sur un compte choisi au hasard.
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    result = await _run("get_account_access")
    assert "error" in result
    assert "compte" in result["error"].lower()


@pytest.mark.asyncio
async def test_territory_asks_for_the_department_before_reading(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    result = await _run("get_territory_overview")
    assert "error" in result
    assert "département" in result["error"].lower()


# ── Ce qui remonte quand la donnée est là ────────────────────────────────────


@pytest.mark.asyncio
async def test_account_access_keeps_an_undeclared_cost_null(monkeypatch: pytest.MonkeyPatch) -> None:
    """D60 : le coût d'accès est DÉCLARÉ, jamais estimé.

    « Aucun coût déclaré » et « l'entrée est gratuite » mènent à deux
    négociations différentes. Rendre `0` ici ferait annoncer la seconde.
    """
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def landscape(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "lock": {"state": "verrouille", "fact": {"value": "panel fermé", "freshness": "fresh"}},
            "modes": [{"mode": "rang2_soustraitance", "feasibility": "available"}],
            "cost": None,
            "entry_points": [{"name": "Filiale Sud", "score": 7, "reason": "titulaire connu"}],
            "barrier": None,
            "avoid_group_entry": True,
            "warning": None,
            "community": None,
        }

    monkeypatch.setattr(bellum_api, "account_access", landscape)
    result = await _run("get_account_access", {"account_id": ACCOUNT})
    assert result["cost"] is None
    assert result["lock"]["state"] == "verrouille"
    # Le chemin, c'est-à-dire ce que `get_access_path` du §16 demanderait : les
    # modes gradés ET les portes classées, chacune avec sa raison.
    assert result["modes"][0]["feasibility"] == "available"
    assert result["entry_points"][0]["reason"] == "titulaire connu"


@pytest.mark.asyncio
async def test_account_access_relays_the_barrier_with_its_proxies(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un score sans ses axes est exactement la forme que la doctrine refuse.

    La règle est tenue à UN endroit — le pont, qui sert la barrière entière ou
    rien. L'outil la relaie sans la résumer : ce test vérifie qu'il ne la
    rabote pas en chemin.
    """
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def landscape(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "lock": {"state": "inconnu", "fact": None},
            "modes": [],
            "cost": None,
            "entry_points": [],
            "barrier": {
                "score": 6,
                "proxies": [{"key": "statut", "contribution": 2, "evidence": "société cotée", "measurable": True}],
                "measurable": True,
                "missing": ["ancienneté"],
            },
            "avoid_group_entry": False,
            "warning": None,
            "community": None,
        }

    monkeypatch.setattr(bellum_api, "account_access", landscape)
    result = await _run("get_account_access", {"account_id": ACCOUNT})
    assert result["barrier"]["proxies"], "la barrière doit garder ses proxies"
    assert result["barrier"]["missing"] == ["ancienneté"]


@pytest.mark.asyncio
async def test_esn_on_account_keeps_the_provenance_of_a_detection(monkeypatch: pytest.MonkeyPatch) -> None:
    """« Détecté » n'est pas « connu ».

    Une présence déduite d'une analyse et une présence déclarée par un humain
    ne se défendent pas pareil en rendez-vous.
    """
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def landscape(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "partners": [{"name": "Vertex Systèmes", "source": "analysis", "certainty": "probable", "score": 4}],
            "recommendations": [
                {"entity_name": "Filiale Sud", "play": "through_partner", "partner": "Vertex Systèmes"}
            ],
        }

    monkeypatch.setattr(bellum_api, "account_partners", landscape)
    result = await _run("get_esn_on_account", {"account_id": ACCOUNT})
    assert result["partners"][0]["source"] == "analysis"
    assert result["partners"][0]["certainty"] == "probable"
    assert result["recommendations"][0]["play"] == "through_partner"


# ── Enveloppe canonique (#2852.6-53) ─────────────────────────────────────────
#
# `get_account_access` / `get_esn_on_account` posaient le même défaut que
# tout `_SECOND_MARKET_TOOLS` avant ce lot : une porte PARTAGÉE
# (`is_configured()`) qui collapse « pont éteint » et « compte étranger ou
# introuvable » (`_post` rend `None` sur TOUT 4xx/5xx, y compris le 404
# d'`AccountAccessService.landscape`) dans le même texte. Restructurés ici sur
# le même patron qu'`get_account_briefing` : l'ownership se vérifie côté
# Supabase AVANT le pont, ce qui rend les deux causes de nouveau distinctes.


@pytest.mark.asyncio
async def test_account_access_missing_id_is_invalid_input_envelope() -> None:
    result = await _run("get_account_access")
    assert result["status"] == ToolResultStatus.INVALID_INPUT.value
    assert result["result_type"] == "account_access"
    assert result["error_code"] == "missing_account_id"


@pytest.mark.asyncio
async def test_account_access_foreign_account_is_empty_envelope_not_provider_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un compte hors portefeuille n'est ni « pont éteint » ni « panne » : les
    trois se lisaient pareil avant ce lot (`None` en sortie de `_post`)."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _not_owned(*_a: object, **_k: object) -> dict:
        raise HTTPException(status_code=404, detail="Account not found")

    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(side_effect=_not_owned))
    result = await _run("get_account_access", {"account_id": ACCOUNT})
    assert result["status"] == ToolResultStatus.EMPTY.value
    assert result["sources_consulted"] == ["bellum_workspace"]


@pytest.mark.asyncio
async def test_account_access_bridge_unconfigured_is_not_covered_envelope() -> None:
    # `_clear_bridge_env` (autouse) a déjà retiré la config : pas de mock à poser.
    result = await _run("get_account_access", {"account_id": ACCOUNT})
    assert result["status"] == ToolResultStatus.NOT_COVERED.value
    assert result["error_code"] == "bridge_not_configured"


@pytest.mark.asyncio
async def test_account_access_no_bridge_response_is_provider_error_envelope(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _no_response(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "account_access", _no_response)
    result = await _run("get_account_access", {"account_id": ACCOUNT})
    assert result["status"] == ToolResultStatus.PROVIDER_ERROR.value
    assert result["error_code"] == "provider_error"


@pytest.mark.asyncio
async def test_account_access_success_carries_the_envelope_alongside_the_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def landscape(*_a: object, **_k: object) -> dict[str, object]:
        return {"lock": {"state": "ouvert", "fact": None}, "modes": [], "cost": None, "entry_points": []}

    monkeypatch.setattr(bellum_api, "account_access", landscape)
    result = await _run("get_account_access", {"account_id": ACCOUNT})
    assert result["status"] == ToolResultStatus.SUCCESS.value
    assert result["result_type"] == "account_access"
    assert result["lock"]["state"] == "ouvert", "l'enveloppe doit s'ajouter à la donnée, jamais la remplacer"


@pytest.mark.asyncio
async def test_esn_on_account_missing_id_is_invalid_input_envelope() -> None:
    result = await _run("get_esn_on_account")
    assert result["status"] == ToolResultStatus.INVALID_INPUT.value
    assert result["result_type"] == "esn_on_account"


@pytest.mark.asyncio
async def test_esn_on_account_foreign_account_is_empty_envelope(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _not_owned(*_a: object, **_k: object) -> dict:
        raise HTTPException(status_code=404, detail="Account not found")

    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(side_effect=_not_owned))
    result = await _run("get_esn_on_account", {"account_id": ACCOUNT})
    assert result["status"] == ToolResultStatus.EMPTY.value


@pytest.mark.asyncio
async def test_esn_on_account_success_carries_the_envelope(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def landscape(*_a: object, **_k: object) -> dict[str, object]:
        return {"partners": [], "recommendations": []}

    monkeypatch.setattr(bellum_api, "account_partners", landscape)
    result = await _run("get_esn_on_account", {"account_id": ACCOUNT})
    assert result["status"] == ToolResultStatus.SUCCESS.value
    assert result["result_type"] == "esn_on_account"


@pytest.mark.asyncio
async def test_search_partners_keeps_an_unearned_score_null(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sous trois placements il n'y a pas de score — et ce n'est pas un zéro."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def pipeline(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "partners": [
                {
                    "name": "Novéris Digital",
                    "stage": "identifie",
                    "placementsTotal": 0,
                    "score": {"score": None, "axes": [], "reason": "moins de trois placements"},
                }
            ]
        }

    monkeypatch.setattr(bellum_api, "partner_pipeline", pipeline)
    result = await _run("search_partners")
    assert result["partners"][0]["score"]["score"] is None
    assert result["partners"][0]["score"]["reason"]


@pytest.mark.asyncio
async def test_territory_relays_an_unavailable_block_instead_of_an_empty_list(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un bloc muet garde son état et sa raison — il ne devient pas « rien »."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def overview(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "department": "31",
            "sinceDays": 90,
            "market": {"state": "ready", "offers": 120, "hiringAccounts": [{"name": "Latécoère", "offers": 9}]},
            "competition": {"state": "ready", "esnPresent": 40, "density": None, "densityReason": "emploi IT"},
            "overflow": {"state": "unavailable", "reason": "la source d’offres n’a pas répondu"},
            "accessible": {"state": "ready", "openTenders": 3},
            "unknowns": ["Les panels fournisseurs privés de ce territoire."],
        }

    monkeypatch.setattr(bellum_api, "territory_overview", overview)
    result = await _run("get_territory_overview", {"department": "31"})
    assert result["overflow"]["state"] == "unavailable"
    assert result["overflow"].get("esn") in (None, [])
    assert result["overflow"]["reason"]
    # La densité non calculable reste `null` : un ratio approché serait un
    # chiffre inventé sur lequel on déciderait d'ouvrir une agence.
    assert result["competition"]["density"] is None
    # « Ce que je ne sais pas » n'est JAMAIS vide — c'est ce bloc qui empêche de
    # lire une liste courte comme un territoire pauvre.
    assert result["unknowns"]
    # `search_territory_accounts` du §16, dans la même réponse : les entreprises
    # qui recrutent et qui ne sont pas des ESN sont des clients à prospecter.
    assert result["market"]["hiringAccounts"][0]["name"] == "Latécoère"


@pytest.mark.asyncio
async def test_territory_keeps_the_overflow_score_with_its_axes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def overview(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "department": "31",
            "sinceDays": 90,
            "market": {"state": "ready", "offers": 120},
            "competition": {"state": "ready", "esnPresent": 40},
            "overflow": {
                "state": "ready",
                "esn": [
                    {
                        "name": "Astréa Conseil",
                        "offers": 34,
                        "score": {
                            "score": None,
                            "scoreMax": 0,
                            "axes": [{"axis": "volume", "points": None, "availability": "unmeasured"}],
                            "notCollected": ["tension"],
                            "reason": "aucun axe mesurable",
                        },
                    }
                ],
            },
            "accessible": {"state": "ready"},
            "unknowns": ["Les panels privés."],
        }

    monkeypatch.setattr(bellum_api, "territory_overview", overview)
    result = await _run("get_territory_overview", {"department": "31"})
    score = result["overflow"]["esn"][0]["score"]
    # Non mesuré n'est pas mesuré à zéro : le score reste `null` et ses axes
    # nomment ce qui n'a pas pu être évalué. C'est `get_partner_overflow` du
    # §16, servi ici plutôt que par un second appel.
    assert score["score"] is None
    assert score["axes"]
    assert score["notCollected"]


@pytest.mark.asyncio
async def test_dormant_network_defaults_to_six_months_and_carries_no_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: dict[str, object] = {}

    async def dormant(_user: str, **kwargs: object) -> dict[str, object]:
        seen.update(kwargs)
        return {
            "months": 6,
            "total": 1,
            "contacts": [
                {
                    "contact_id": "c-1",
                    "full_name": "Claire Meunier",
                    "title": "DSI",
                    "company_name": "ACME",
                    "has_email": True,
                    # La capacité, pas l'éditeur — le pont a renommé le champ
                    # le 29/08 après « LinkedIn disponible » dans la bouche de
                    # Laura (GA-65 côté API).
                    "has_network_profile": False,
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "dormant_contacts", dormant)
    result = await _run("search_dormant_network")
    # Absent = le pont décide, et il décide six mois. Passer `0` d'ici ferait
    # remonter TOUS les contacts sous couvert de « dormants ».
    assert seen["months"] is None
    assert "@" not in str(result)
    assert result["contacts"][0]["contact_id"] == "c-1"


@pytest.mark.asyncio
async def test_dormant_network_relays_the_reactivation_axes_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2799 / #2374.16-17 — le score n'est JAMAIS nu, jusqu'au modèle.

    Un axe non évaluable (`points: None`, `computeDormantReactivationScore`,
    `@bellum/contracts`) doit traverser CE pont tel quel — jamais coercé à
    zéro, jamais retiré de la liste des neuf.
    """
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def dormant(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "months": 6,
            "total": 1,
            "contacts": [
                {
                    "contact_id": "c-1",
                    "full_name": "Solveig Rambert",
                    "has_email": True,
                    "has_network_profile": False,
                    "reactivation_score": {
                        "score": 11,
                        "max_possible": 35,
                        "axes": [
                            {
                                "key": "recency",
                                "label": "Ancienneté du silence",
                                "evaluated": False,
                                "points": None,
                                "max": 10,
                                "proof": None,
                            },
                            {
                                "key": "reachability",
                                "label": "Joignabilité",
                                "evaluated": True,
                                "points": 6,
                                "max": 10,
                                "proof": "un seul canal disponible",
                            },
                        ],
                    },
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "dormant_contacts", dormant)
    result = await _run("search_dormant_network")
    axes = result["contacts"][0]["reactivation_score"]["axes"]
    recency = next(axis for axis in axes if axis["key"] == "recency")
    assert recency["evaluated"] is False
    assert recency["points"] is None
    reachability = next(axis for axis in axes if axis["key"] == "reachability")
    assert reachability["points"] == 6


# ── `get_job_changes` : le 14e outil de territoire (30/08/2026) ─────────────
#
# Il n'avait pas de capacité REST — seuls une PORTE dans `opportunities` et un
# COMPTEUR de briefing sortaient du calcul (`CrmRoutinesService
# .contactsWhoMayHaveMoved`). La capacité (`POST /internal/copilot/contacts/
# job-changes`) rend maintenant la LISTE, fusionnée (comptes + ESN) et
# dédoublonnée par le pont NestJS. Trois choses à garder ici, qui ne sont PAS
# déjà couvertes par les tests génériques ci-dessus :
#
# 1. La capacité RÉPOND avec la liste — la donnée traverse.
# 2. Le signal reste une PRÉSOMPTION jusqu'au bout : `basis` traverse TEL
#    QUEL, jamais résumé ni retiré.
# 3. Une erreur de la capacité (le pont rend `None` — panne, 5xx, non
#    configuré) devient une erreur claire, JAMAIS une liste vide qui se
#    lirait « personne n'a bougé ».


@pytest.mark.asyncio
async def test_job_changes_relays_the_list_and_its_basis_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: dict[str, object] = {}

    async def post(path: str, payload: dict[str, object], **_kwargs: object) -> dict[str, object]:
        seen["path"] = path
        seen["payload"] = payload
        return {
            "presumed_moves": [
                {
                    "contact_name": "Camille Roux",
                    "tracked_account_name": "Client Ordinaire SA",
                    "presumed_new_employer": "Nouvel Employeur SAS",
                    "known_since": "2024-03-01T00:00:00.000Z",
                    "new_employer_account_id": None,
                }
            ],
            "basis": (
                "Détecté en comparant le nom d'employeur lu au dernier enrichissement au nom du "
                "compte suivi — une correspondance de LIBELLÉS, jamais une confirmation."
            ),
        }

    monkeypatch.setattr(bellum_api, "_post", post)
    result = await _run("get_job_changes")
    assert seen["path"] == "/internal/copilot/contacts/job-changes"
    assert seen["payload"] == {"userId": USER}
    assert result["presumed_moves"][0]["contact_name"] == "Camille Roux"
    # La réserve traverse TELLE QUELLE — ni résumée, ni retirée en chemin.
    assert "jamais une confirmation" in result["basis"]


@pytest.mark.asyncio
async def test_job_changes_capacity_failure_is_a_clear_error_not_an_empty_list(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Une panne du pont ne doit JAMAIS se lire « personne n'a changé de poste »."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def post(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "_post", post)
    result = await _run("get_job_changes")
    assert "error" in result
    assert "presumed_moves" not in result
    assert result["error"]


# ── Ce qui n'est PAS livré, et qui doit le rester ────────────────────────────


def test_none_of_the_write_tools_of_the_same_chapter_exist() -> None:
    """`declare_access_fact` (N1) et `create_partner_opportunity` (N2) écrivent.

    Laura prépare, le commercial écrit. La garantie n'est pas une convention :
    aucun outil ne porte ces noms, et aucun client de pont ne les sert.
    """
    names = {str(tool.get("name", "")) for tool in chat_tools.CHAT_TOOLS}
    for absent in DELIBERATELY_ABSENT:
        assert absent not in names, (
            f"« {absent} » a été ajouté sans que la raison de son absence soit reprise. "
            "Voir le §16 du tome 6 et le commentaire au-dessus du catalogue."
        )


def test_the_five_executors_contain_no_write_verb() -> None:
    """La moitié du garde-fou que le prompt ne peut pas porter.

    Le modèle peut être convaincu ; un dispatcher qui n'écrit pas ne peut pas
    l'être. Ce test lit la SOURCE de l'exécuteur, pas sa documentation.

    Lit `_execute_chat_tool_dispatch` (#2438.3) : `execute_chat_tool` n'est
    plus que le point d'entrée public qui AUDITE chaque appel avant de rendre
    la main au dispatch — la garantie « aucun verbe d'écriture » porte sur le
    dispatch lui-même, pas sur son enveloppe d'audit.
    """
    source = inspect.getsource(chat_tools._execute_chat_tool_dispatch)
    assert "bellum_api.account_access" in source, "le corpus lu est vide — le test ne garde rien"
    for forbidden in (".insert(", ".update(", ".delete(", ".upsert(", "declare_access_fact"):
        assert forbidden not in source, forbidden


def test_the_bridge_client_exposes_no_write_verb_for_these_capabilities() -> None:
    """Retirer le MOYEN, pas seulement la permission.

    Le pont Python est le SEUL chemin du copilote vers l'API. S'il n'a pas de
    fonction qui écrit un fait d'accès ou qui ouvre une relation partenaire,
    aucun prompt ne peut en produire une.
    """
    exported = {name for name in dir(bellum_api) if not name.startswith("_")}
    assert "account_access" in exported, "le corpus lu est vide — le test ne garde rien"
    for forbidden in ("declare_access_fact", "create_partner_opportunity", "declare_access", "create_partner"):
        assert forbidden not in exported, forbidden


@pytest.mark.asyncio
async def test_territory_silent_bridge_says_timeout_not_absence(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def overview(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "territory_overview", overview)
    result = await _run("get_territory_overview", {"department": "67"})
    assert "pas répondu à temps" in result["error"]
    assert "PAS une absence de données" in result["error"]
    assert "réessayer" in result["error"]


@pytest.mark.asyncio
async def test_territory_missing_department_guides_the_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    result = await _run("get_territory_overview", {"department": ""})
    assert "département" in result["error"].lower()
    assert "fil" in result["error"].lower()


def test_territory_timeouts_nest() -> None:
    from app.services.chat_orchestrator import _DEFAULT_TURN_BUDGET_S

    assert 45 < bellum_api._TERRITORY_TIMEOUT_S < _DEFAULT_TURN_BUDGET_S
