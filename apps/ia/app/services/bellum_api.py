"""Pont du copilote vers la messagerie et l'agenda de l'utilisateur.

Le service IA lit Supabase en direct ; les jetons OAuth Gmail / Outlook, eux,
vivent chez NestJS, chiffrés au repos. Sans ce client, le copilote ne peut
répondre à aucune des soixante requêtes exécutables des méta-analyses — « prépare
une relance pour tous les prospects sans réponse depuis 7 jours » suppose de
lire une boîte.

Trois propriétés, dans cet ordre d'importance :

1. **No-op strict sans configuration.** Sans ``API_INTERNAL_URL`` ou sans
   ``INTERNAL_API_SECRET``, chaque appel renvoie ``None`` sans AUCUN trafic
   réseau. Les outils du copilote annoncent alors « messagerie non branchée »
   plutôt que d'échouer — c'est le même contrat que toutes les intégrations
   optionnelles du dépôt.
2. **Lecture seule.** Le pont NestJS n'expose aucun verbe d'écriture. Le
   copilote PROPOSE ; l'écriture passe par le clic de l'utilisateur sur un
   endpoint authentifié par JWT.
3. **Échec gracieux.** Un timeout ou un 5xx rend ``None``. Un copilote qui
   tombe parce qu'une boîte Gmail était lente est pire qu'un copilote qui dit
   « je n'ai pas pu lire ta messagerie ».
"""

from __future__ import annotations

import logging
import os
from collections.abc import Sequence
from typing import Any

import httpx

from app.services import langfuse_client
from app.services.chat_requested_mode import current_excluded_tool_providers

logger = logging.getLogger(__name__)

_HEADER = "X-Internal-Secret"
# Une boîte Gmail lente ne doit pas bloquer une conversation. Au-delà, l'outil
# rend « je n'ai pas pu lire » et le modèle enchaîne.
_TIMEOUT_S = 12.0


def _base_url() -> str:
    """URL interne de l'API NestJS. Vide = fonctionnalité éteinte."""
    return (os.environ.get("API_INTERNAL_URL") or "").strip().rstrip("/")


def _secret() -> str:
    return (os.environ.get("INTERNAL_API_SECRET") or "").strip()


def is_configured() -> bool:
    """Le pont peut-il être emprunté ? Les outils s'en servent pour DIRE non."""
    return bool(_base_url() and _secret())


async def _post(path: str, payload: dict[str, Any], *, timeout_s: float = _TIMEOUT_S) -> Any | None:
    """POST interne. ``None`` couvre les trois cas « on ne sait pas » :
    non configuré, réseau en échec, réponse non-2xx.

    ``timeout_s`` s'écarte du défaut pour UNE lecture, et une seule : la
    dynamique d'un territoire moissonne quatre sources publiques derrière le
    pont. Douze secondes suffisent à lire une boîte mail ; elles couperaient
    systématiquement une moisson, et l'outil dirait « je n'ai pas pu » sur une
    lecture qui aurait abouti. Le plafond (55 s, `_TERRITORY_TIMEOUT_S`) reste
    sous le budget d'un tour de copilote (90 s, `CHAT_TURN_BUDGET_S`) et
    au-dessus des 45 s × 1 essai que l'API accorde à l'IA : l'appelant attend
    plus que l'appelé × ses essais.
    """
    data, _failure = await _post_detailed(path, payload, timeout_s=timeout_s)
    return data


#: #3859.4 — pourquoi un appel du pont n'a rien rendu : `not_configured`,
#: `http_<code>` (réponse non-2xx) ou `unreachable` (réseau / délai).
async def _post_detailed(
    path: str, payload: dict[str, Any], *, timeout_s: float = _TIMEOUT_S
) -> tuple[Any | None, str | None]:
    """Comme `_post`, mais l'échec dit POURQUOI : `(données, None)` ou `(None, raison)`."""
    data, failure, _message = await _post_explained(path, payload, timeout_s=timeout_s)
    return data, failure


async def _post_explained(
    path: str, payload: dict[str, Any], *, timeout_s: float = _TIMEOUT_S, distinguish_timeout: bool = False
) -> tuple[Any | None, str | None, str | None]:
    """#4064 — comme `_post_detailed`, plus la PHRASE que l'API a écrite sur un
    refus (`message` du corps d'erreur NestJS : « Aucun agenda connecté. »,
    « L'accès à ton agenda est éteint côté fournisseur… »). Sans elle, l'outil
    ne savait dire que « n'a pas répondu » devant un agenda branché.

    ``distinguish_timeout`` (#4611.7) : un DÉLAI dépassé rend ``timeout`` et non ``unreachable``. Un timeout
    n'est pas un échec — on ne sait pas — ; l'appelant qui en tire une règle (``unknown``, pas de reprise) le
    demande. Absent (le défaut) : chemin byte-identique, tout reste ``unreachable``."""
    base = _base_url()
    if not base or not _secret():
        return None, "not_configured", None

    url = f"{base}{path}"
    try:
        # #2442.4 (épopée #2879) — le span « connecteur » : TOUT ce qu'un outil
        # lit d'un connecteur de la personne (messagerie, agenda, CRM…) passe
        # par ce pont ou par `_get` ; même famille que `db` (`TableQuery.execute`).
        # Hors tour : no-op. Le chemin n'entre jamais dans le span.
        with langfuse_client.span("connector"):
            async with httpx.AsyncClient(timeout=timeout_s) as client:
                response = await client.post(url, json=payload, headers={_HEADER: _secret()})
        if response.status_code >= 400:
            # 400 = capacité absente (pas de messagerie connectée, portée
            # manquante). C'est une information, pas une panne : on la journalise
            # sans bruit et l'outil rend une erreur métier lisible.
            logger.info("Copilot bridge %s → HTTP %s", path, response.status_code)
            return None, f"http_{response.status_code}", _error_message_of(response)
        return response.json(), None, None
    except Exception as exc:  # noqa: BLE001 — jamais faire tomber une conversation
        # `type(exc).__name__` : un timeout httpx a un `str()` VIDE — le log prod
        # du 07/10/2026 était « failed: » sans rien après.
        logger.warning("Copilot bridge %s failed: %s: %s", path, type(exc).__name__, exc)
        if distinguish_timeout and isinstance(exc, httpx.TimeoutException):
            return None, "timeout", None
        return None, "unreachable", None


def _error_message_of(response: httpx.Response) -> str | None:
    """Le `message` d'un corps d'erreur NestJS, s'il est une phrase — sinon `None`
    (un tableau de validation zod n'est pas une phrase à montrer)."""
    try:
        body = response.json()
    except Exception:  # noqa: BLE001 — un corps illisible ne dit rien
        return None
    message = body.get("message") if isinstance(body, dict) else None
    return message.strip()[:300] if isinstance(message, str) and message.strip() else None


def analysis_failure(reason: str | None) -> dict[str, Any]:
    """#3859.4 — la VRAIE raison d'un échec de préparation / lancement d'analyse,
    en phrase (`error`) et en code (`error_code`). Jamais un faux succès."""
    if reason == "http_402":
        # #4464 — frein doux : ni chiffre, ni « crédit » ; on propose d'en parler à l'équipe.
        message = "Tu as beaucoup utilisé Bellum ce mois-ci — on en parle ? Écris à l'équipe Bellum, on te répond vite."
    elif reason == "http_403":
        message = "Ton rôle ne permet pas de lancer une analyse."
    elif reason in ("http_404", "http_410"):
        message = "Compte ou entreprise introuvable côté serveur : l'analyse n'est pas lancée."
    elif reason == "not_configured":
        message = "Le lancement d'analyse n'est pas branché sur ce service : rien n'est lancé."
    else:
        message = "Le service d'analyse est indisponible pour le moment : rien n'est lancé."
    return {"error": message, "error_code": f"analysis_{reason or 'unavailable'}"}


async def _get(path: str, params: dict[str, Any], *, timeout_s: float = _TIMEOUT_S) -> Any | None:
    """GET interne — même contrat que `_post` juste au-dessus : ``None``
    couvre les trois cas « on ne sait pas » (non configuré, réseau en échec,
    réponse non-2xx). Séparé de `_post` parce que `internal/dataforge/
    candidates` (voir `dataforge_candidates` plus bas) est un `@Get` — pas un
    verbe d'écriture de plus, la règle 2 du docstring de tête tient encore."""
    base = _base_url()
    if not base or not _secret():
        return None

    url = f"{base}{path}"
    try:
        # #2442.4 — même span « connecteur » que `_post` juste au-dessus.
        with langfuse_client.span("connector"):
            async with httpx.AsyncClient(timeout=timeout_s) as client:
                response = await client.get(url, params=params, headers={_HEADER: _secret()})
        if response.status_code >= 400:
            logger.info("Internal bridge %s → HTTP %s", path, response.status_code)
            return None
        return response.json()
    except Exception as exc:  # noqa: BLE001 — jamais faire tomber Découvrir
        logger.warning("Internal bridge %s failed: %s", path, exc)
        return None


def _with_excluded_tool_providers(payload: dict[str, Any]) -> dict[str, Any]:
    """#3973 — les outils décochés pour ce fil (`set_turn_excluded_providers`),
    relayés aux SEULES lectures du pont qui choisissent un backend (messagerie,
    agenda) : avec deux boîtes branchées, celle qui est décochée n'est jamais
    lue. Aucune exclusion = payload inchangé, byte-identique à avant."""
    excluded = current_excluded_tool_providers()
    if excluded:
        payload["excludedProviders"] = list(excluded)
    return payload


async def search_mailbox(
    user_id: str,
    *,
    intent: str,
    query: str | None = None,
    counterpart: str | None = None,
    window_days: int = 30,
    silence_days: int = 7,
    limit: int = 20,
) -> dict[str, Any] | None:
    """Recherche par intention métier. L'intention est CHOISIE par le modèle ;
    la requête fournisseur, elle, est composée côté NestJS de façon
    déterministe — aucun modèle n'écrit une requête Gmail."""
    payload: dict[str, Any] = {
        "userId": user_id,
        "intent": intent,
        "windowDays": window_days,
        "silenceDays": silence_days,
        "limit": limit,
    }
    if query:
        payload["query"] = query
    if counterpart:
        payload["counterpart"] = counterpart
    result = await _post("/internal/copilot/mailbox/search", _with_excluded_tool_providers(payload))
    return result if isinstance(result, dict) else None


async def read_mail_thread(
    user_id: str,
    *,
    thread_id: str,
    counterpart: str | None = None,
    window_days: int = 90,
) -> dict[str, Any] | None:
    """#4016 L3 — le CORPS d'un fil de la boîte de CET utilisateur, lu par le
    pont avec SON jeton (jamais celui d'un collègue). ``user_id`` est celui du
    tour authentifié, jamais un argument du modèle. Le corps ne va nulle part
    ailleurs que dans la réponse de ce tour (voir ``chat_tools``)."""
    payload: dict[str, Any] = {"userId": user_id, "threadId": thread_id, "windowDays": window_days}
    if counterpart:
        payload["counterpart"] = counterpart
    result = await _post("/internal/copilot/mailbox/thread", _with_excluded_tool_providers(payload))
    return result if isinstance(result, dict) else None


async def list_beeper_conversations(user_id: str) -> dict[str, Any] | None:
    """#4406.5 — les conversations Beeper de CET utilisateur, lues en direct par le pont avec SON
    branchement. Sans corps. ``None`` = pont non configuré ou injoignable."""
    result = await _post("/internal/copilot/beeper/conversations", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def read_beeper_chat(user_id: str, *, chat_id: str) -> dict[str, Any] | None:
    """#4406.5 (c96) — le CORPS d'UNE conversation Beeper de CET utilisateur, pour préparer une
    réponse. Lecture seule : le pont n'a aucun chemin d'envoi ; rien n'est conservé."""
    result = await _post("/internal/copilot/beeper/chat", {"userId": user_id, "chatId": chat_id})
    return result if isinstance(result, dict) else None


async def list_agenda(
    user_id: str,
    *,
    from_iso: str | None = None,
    to_iso: str | None = None,
    query: str | None = None,
    limit: int = 25,
) -> list[dict[str, Any]] | None:
    payload: dict[str, Any] = {"userId": user_id, "limit": limit}
    if from_iso:
        payload["from"] = from_iso
    if to_iso:
        payload["to"] = to_iso
    if query:
        payload["query"] = query
    result = await _post("/internal/copilot/agenda/events", _with_excluded_tool_providers(payload))
    return result if isinstance(result, list) else None


async def agenda_window(
    user_id: str,
    *,
    from_iso: str,
    to_iso: str,
    query: str | None = None,
    limit: int = 250,
) -> tuple[dict[str, Any] | None, str | None, str | None]:
    """#4064 — une fenêtre d'agenda AVEC les agendas qui n'ont pas répondu
    (`POST /internal/copilot/agenda/window` → `AgendaService.listEventsDetailed`).
    `(fenêtre, None, None)` ou `(None, raison, phrase de l'API)` : l'appelant
    NOMME la raison, jamais « n'a pas répondu » générique."""
    payload: dict[str, Any] = {"userId": user_id, "from": from_iso, "to": to_iso, "limit": limit}
    if query:
        payload["query"] = query
    data, failure, message = await _post_explained(
        "/internal/copilot/agenda/window", _with_excluded_tool_providers(payload)
    )
    if failure is None and not isinstance(data, dict):
        return None, "malformed", None
    return data, failure, message


async def find_free_slots(
    user_id: str,
    *,
    from_iso: str | None = None,
    to_iso: str | None = None,
    duration_minutes: int = 60,
    limit: int = 5,
    merge_holes: bool = False,
) -> list[dict[str, Any]] | None:
    payload: dict[str, Any] = {
        "userId": user_id,
        "durationMinutes": duration_minutes,
        "limit": limit,
    }
    # #5 (recette 13/10) — les trous ENTIERS plutôt que des tranches de `duration_minutes` (plan de journée).
    if merge_holes:
        payload["mergeHoles"] = True
    if from_iso:
        payload["from"] = from_iso
    if to_iso:
        payload["to"] = to_iso
    result = await _post("/internal/copilot/agenda/free-slots", _with_excluded_tool_providers(payload))
    return result if isinstance(result, list) else None


async def agenda_preferences(user_id: str) -> dict[str, Any] | None:
    """#2770.28 — les préférences d'agenda RÉGLÉES par la personne
    (`agenda-preferences.ts` : `dossierDurationMinutes`, `reserveSlots`). `{}` =
    rien réglé ; `None` = pont éteint ou en échec — l'appelant traite les deux
    pareil : aucune réserve personnelle, jamais une devinée."""
    result = await _post("/internal/copilot/agenda/preferences", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def team_policy(user_id: str) -> dict[str, Any] | None:
    """#2770.37 — la POLITIQUE D'ÉQUIPE de l'espace actif (Réglages › Équipe, saisie par
    un gestionnaire, `team-policy.ts`) : `{"policy": {...}}`, ou `{"policy": None}` quand
    rien n'est saisi. `None` = pont éteint ou en échec — l'appelant NOMME alors la source
    comme non lue, jamais une politique devinée."""
    result = await _post("/internal/copilot/workspace/team-policy", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def daily_briefing(
    user_id: str, *, business_role: str | None = None, excluded_families: list[str] | None = None
) -> dict[str, Any] | None:
    """#3386 — `business_role` : l'intitulé de poste déclaré, qui RÉORDONNE le
    brief (c76) ; absent ⇒ corps byte-identique à avant.

    #3973 — le brief lit AUSSI la messagerie et l'agenda : les outils décochés
    pour ce fil (variable de tour) et les familles décochées (`excluded_families`)
    voyagent avec lui ; le pont ne lit jamais la boîte ou l'agenda décoché, et ne
    lit pas du tout un bloc dont la famille est décochée."""
    body: dict[str, Any] = {"userId": user_id}
    if business_role:
        body["businessRole"] = business_role
    if excluded_families:
        body["excludedFamilies"] = list(excluded_families)
    result = await _post("/internal/copilot/briefing", _with_excluded_tool_providers(body))
    return result if isinstance(result, dict) else None


async def account_timeline(user_id: str, account_id: str) -> dict[str, Any] | None:
    """#2271.19 — la MÊME fusion que l'écran de fiche (`AccountTimelineService`),
    lue une seule fois côté NestJS. `None` = pont éteint ou réseau en échec ; un
    dict avec `error` (compte introuvable/étranger) reste distinct — c'est
    l'appelant (l'outil) qui décide du message, pas ce pont."""
    result = await _post("/internal/copilot/account/timeline", {"userId": user_id, "accountId": account_id})
    return result if isinstance(result, dict) else None


async def account_needs_history(
    user_id: str,
    account_id: str,
    *,
    tech: str | None = None,
    zone: str | None = None,
    since: str | None = None,
    until: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> dict[str, Any] | None:
    """#4759 (épopée #4762) — l'HISTORIQUE des besoins d'un compte, en lignes DATÉES, une tranche à la fois
    (`NeedsHistoryService.query`). Le plafond de lignes est clampé côté NestJS (`needs-history.limits.ts`) et
    l'âge de chaque ligne est DIT par l'API (`ageLabel`) : rien n'est recopié ni déduit ici (GA-26). L'espace
    est celui de la personne (`resolve_workspace_id`). `None` = pont éteint, espace introuvable ou réseau en
    échec ; un dict avec `error` (compte introuvable/étranger) reste distinct — l'appelant décide du message."""
    from app.services.workspace_scope import resolve_workspace_id

    workspace_id = await resolve_workspace_id(user_id)
    if not workspace_id:
        return None
    body: dict[str, Any] = {"userId": user_id, "workspaceId": workspace_id, "accountId": account_id}
    for key, value in (("tech", tech), ("zone", zone), ("since", since), ("until", until)):
        if value:
            body[key] = value
    if limit is not None:
        body["limit"] = limit
    if offset is not None:
        body["offset"] = offset
    result = await _post("/internal/copilot/account/needs-history", body)
    return result if isinstance(result, dict) else None


async def account_contacts(
    user_id: str, account_id: str, *, title_query: str | None = None, limit: int | None = None
) -> dict[str, Any] | None:
    """#2623.1 — QUI approcher sur un compte déjà analysé : le MÊME classement
    et la MÊME identité que l'onglet Contacts d'un compte
    (`ContactsService.rankForAccount` + `findByAccountForHttp`), plafonnés à
    cinq — une bulle de conversation se lit, elle ne se dépouille pas. `None` =
    pont éteint ou réseau en échec ; c'est l'appelant qui décide du message.

    #2533 / #2547 — `title_query` cherche une FONCTION dans tous les contacts
    du compte ; `limit` (≤ 10) sert « N personnes par entreprise ». Absents :
    corps identique à avant."""
    body: dict[str, Any] = {"userId": user_id, "accountId": account_id}
    if title_query:
        body["titleQuery"] = title_query
    if limit:
        body["limit"] = limit
    result = await _post("/internal/copilot/account/contacts", body)
    return result if isinstance(result, dict) else None


async def account_coverage_map(user_id: str, account_id: str) -> dict[str, Any] | None:
    """#2308 (LAU-FINAL-049) — la carte de couverture d'UN compte : périmètre
    (groupe/filiale/BU/direction/programme/site), famille de rôle d'achat et
    étape commerciale, chacun NOMMÉ même quand son état est "inconnu" — jamais
    une case vide qui se lirait "manquant" (GA-259 : ce qu'on SAIT, jamais ce
    que le marché FAIT). Même fusion que l'onglet Zones blanches
    (`CoverageService.computeChatCoverageMapForAccount`), un calcul, pas deux.
    `None` = pont éteint ou réseau en échec ; c'est l'appelant qui décide du
    message."""
    result = await _post("/internal/copilot/account/coverage-map", {"userId": user_id, "accountId": account_id})
    return result if isinstance(result, dict) else None


async def account_versioning(user_id: str, account_id: str) -> dict[str, Any] | None:
    """#3212.3(b)/.4/.6 (épopée #3235) — les neuf identifiants de version et la
    révision de verdict du dernier dossier, jusqu'au chat.
    `analysisVersioningSchema` (#2318.5) et `explainVerdictChange` (#3212.4)
    vivent sur `analysis_runs` côté NestJS, une table SANS RLS (mirror
    `credit_ledger`) — jamais lue directement par l'IA via Supabase, d'où ce
    pont (`CopilotAccountVersioningController`, ownership revérifiée côté
    NestJS). Rend `{"versioning": ..., "verdictRevision": ...}`, chacun
    `None` si rien n'est timbré. `None` (le tout) = pont éteint ou réseau en
    échec — c'est l'appelant qui décide de ne rien ajouter plutôt que
    d'inventer une version."""
    result = await _post("/internal/copilot/accounts/versioning", {"userId": user_id, "accountId": account_id})
    return result if isinstance(result, dict) else None


async def account_manager_review(user_id: str, account_id: str) -> dict[str, Any] | None:
    """#2985 (revue manager, section G de #2319) — « transformer le même
    dossier en revue de dix minutes », PAS un deuxième dossier : le tiroir
    « ce qui a changé », le plan (actions réalisées / non avancées) et les
    risques déjà saisis sur les affaires, composés côté NestJS
    (`CopilotBridgeController.accountManagerReview`) — un calcul, pas
    plusieurs. `None` = pont éteint ou réseau en échec ; c'est l'appelant qui
    décide du message."""
    result = await _post("/internal/copilot/account/manager-review", {"userId": user_id, "accountId": account_id})
    return result if isinstance(result, dict) else None


async def account_intelligence_context(user_id: str, account_id: str) -> dict[str, Any] | None:
    """#2285.2 (épopée #2786) — LA MÊME façade canonique que la fiche compte
    (`AccountIntelligenceContextService.contextFor`, `GET
    /accounts/:id/intelligence-context`) : `company_name`/`sector`/`headquarters`
    avec leur hiérarchie de confiance (correction humaine > donnée courante >
    DataForge), pour que `compile_account_preflight` arrête de relire la ligne
    `accounts` brute comme seule vérité. `None` couvre les trois cas « on ne
    sait pas » : pont éteint, réseau en échec, ou façade indisponible/compte
    introuvable côté API (`{"status": "unavailable", …}` / `{"error": …}`) —
    l'appelant retombe alors sur la lecture brute du compte, jamais une
    vérité inventée."""
    result = await _post("/internal/copilot/account/intelligence-context", {"userId": user_id, "accountId": account_id})
    if not isinstance(result, dict) or "companyName" not in result:
        return None
    return result


async def account_org_chart(user_id: str, account_id: str) -> dict[str, Any] | None:
    """LOT (15/10) DATA-B.4 — LA LECTURE de l'onglet Organigramme (`raw_analysis.org.orgGraph`, sans les
    personnes écartées), bornée côté NestJS (`CopilotAccountOrgChartController`), même motif que
    `account_contacts`. Rend ``{"status": "ok", ...}`` ou ``{"status": "no_graph"}`` (aucun graphe stocké) ;
    un compte étranger ou introuvable revient ``{"error": ...}`` (transmis tel quel). ``None`` = pont éteint
    ou réseau en échec — l'appelant le DIT, jamais un organigramme deviné."""
    result = await _post("/internal/copilot/account/org-chart", {"userId": user_id, "accountId": account_id})
    if not isinstance(result, dict):
        return None
    if result.get("error") or result.get("status") in ("ok", "no_graph"):
        return result
    return None


async def account_strategy_5p(user_id: str, account_id: str) -> dict[str, Any] | None:
    """#3277.1 (épopée #3277, BEL-SC-225 suite) — LA MÊME projection canonique
    que la fiche compte (`AccountStrategy5PService.strategyFor`, `GET
    /accounts/:id/strategy-5p`), pour que Laura devienne le deuxième appelant
    nommé par le ticket (« Laura/Analyser/Contacts/Plans d'action/Pilotage
    liront CE service, jamais une lecture locale »). Un compte étranger ou
    introuvable revient `{"error": ...}` (transmis tel quel, l'appelant décide
    du message) ; `None` couvre les deux autres cas « on ne sait pas » : pont
    éteint/réseau en échec, ou façade indisponible côté API (le module
    optionnel n'est pas monté, `{"status": "unavailable", ...}`) — jamais une
    projection inventée."""
    result = await _post("/internal/copilot/account/strategy-5p", {"userId": user_id, "accountId": account_id})
    if not isinstance(result, dict):
        return None
    if result.get("error"):
        return result
    if "readiness" not in result:
        return None
    return result


async def account_interest_penetrability(user_id: str, account_id: str) -> dict[str, Any] | None:
    """#3258.14 (épopée #3362, lot E25 30/09) — LA MÊME matrice canonique que
    la fiche compte et le panneau Pilotage (`AccountInterestPenetrabilityService.matrixFor`,
    `GET /accounts/:id/interest-penetrability`), pour que Laura devienne un
    appelant NOMMÉ par l'épopée #3362 (#3258.14), au lieu de rester sans outil
    sur ce sujet (`git grep -i penetrability apps/ia` rendait zéro résultat
    avant ce lot). Même contrat que `account_strategy_5p` juste au-dessus :
    un compte étranger ou introuvable revient `{"error": ...}` (transmis tel
    quel) ; `None` couvre les deux autres cas « on ne sait pas » : pont
    éteint/réseau en échec, ou façade indisponible côté API (`{"status":
    "unavailable", ...}`) — jamais un quadrant inventé."""
    result = await _post(
        "/internal/copilot/account/interest-penetrability", {"userId": user_id, "accountId": account_id}
    )
    if not isinstance(result, dict):
        return None
    if result.get("error"):
        return result
    if "interest" not in result:
        return None
    return result


# ── Vivier, missions, facturation, preuves (PDF 6 §9, décision D44) ──────────
#
# Six lectures, ajoutées parce que le copilote ne savait rien du domaine que les
# chantiers des PDF 3, 4 et 5 venaient de livrer. Toutes suivent la règle du
# fichier : sans configuration, ``None`` — et l'outil DIT qu'il n'a pas accès,
# au lieu de rendre une liste vide qui se lirait « il n'y a rien ».


async def search_talents_by_experience(user_id: str, client: str) -> dict[str, Any] | None:
    """#3889.1 (lot I02) — les consultants dont un CV AUTORISÉ déclare une
    expérience chez ``client``, sans exiger une affectation de mission Bellum.
    ``None`` = pont éteint ou en échec (l'appelant le NOMME, jamais « personne »)."""
    result = await _post("/internal/copilot/talents/experience-search", {"userId": user_id, "client": client})
    return result if isinstance(result, dict) else None


async def search_talents(
    user_id: str,
    *,
    query: str | None = None,
    available_within_days: int | None = None,
    zone: str | None = None,
    radius_km: int | None = None,
) -> dict[str, Any] | None:
    """Le vivier de l'ESN. Le coût chargé n'en sort JAMAIS : le pont passe
    ``finance: false`` en dur, parce qu'un appel interne n'a aucun rôle à faire
    valoir.

    #3222 — ``zone``/``radius_km`` (« un consultant Java à Lyon ») : le tiroir
    « Ville et rayon » existait déjà côté API/écran (`talentSearchQuerySchema`,
    PDF-22 §01), jamais exposé à Laura. Sans ``zone``, ``radius_km`` n'a pas de
    centre — l'appelant NestJS l'ignore déjà (voir `copilot-bridge.controller.ts`),
    mais on ne le relaie même pas ici pour ne jamais le faire lire comme un
    critère pris en compte quand il ne l'est pas."""
    payload: dict[str, Any] = {"userId": user_id}
    if query:
        payload["query"] = query
    if available_within_days is not None:
        payload["availableWithinDays"] = available_within_days
    if zone:
        payload["zone"] = zone
        if radius_km is not None:
            payload["radiusKm"] = radius_km
    result = await _post("/internal/copilot/talents/search", payload)
    return result if isinstance(result, dict) else None


async def talent_identity_explanation(
    user_id: str,
    *,
    talent_id: str,
    other_talent_id: str | None = None,
) -> dict[str, Any] | None:
    """#2327.26 — pourquoi deux fiches du vivier se ressemblent, dans la MÊME
    phrase que l'écran (`explainTalentDuplicate`, calculée côté NestJS).

    Une LECTURE, et rien d'autre : le pont ne porte aucune fonction de
    décision ou de fusion pour l'identité des talents — ``decide`` n'existe
    nulle part dans ce module. Aucun chiffre de confiance ne traverse : la
    route rend déjà la phrase, jamais le nombre qui l'a produite."""
    payload: dict[str, Any] = {"userId": user_id, "talentId": talent_id}
    if other_talent_id:
        payload["otherTalentId"] = other_talent_id
    result = await _post("/internal/copilot/talents/identity/explain", payload)
    return result if isinstance(result, dict) else None


async def consultant_feedback(user_id: str, *, consultant_id: str) -> dict[str, Any] | None:
    """#2367.11 — le REX d'un push consultant (« pourquoi ce profil a été
    refusé »). L'APPARTENANCE (workspace ET utilisateur) est vérifiée côté
    NestJS (``ConsultantsService.listFeedback``) : un identifiant inventé par
    le modèle ne peut donc jamais faire fuiter le REX d'un autre espace — le
    pont ne fait que relayer ce que la route rend."""
    result = await _post(
        "/internal/copilot/consultants/feedback",
        {"userId": user_id, "consultantId": consultant_id},
    )
    return result if isinstance(result, dict) else None


async def approval_explain(user_id: str, *, approval_request_id: str) -> dict[str, Any] | None:
    """#2857 (#2201.31) — « Demander une explication » sur une carte de
    validation en attente : le MÊME résumé, niveau requis et motif que la
    carte affichée dans « À valider » — jamais une phrase inventée pour
    l'occasion. L'APPARTENANCE (workspace) est vérifiée côté NestJS
    (``WorkflowRunnerService.explainApprovalRequest``) : un identifiant
    inventé par le modèle ne peut donc jamais faire fuiter la demande d'un
    autre espace — le pont ne fait que relayer ce que la route rend."""
    result = await _post(
        "/internal/copilot/approvals/explain",
        {"userId": user_id, "approvalRequestId": approval_request_id},
    )
    return result if isinstance(result, dict) else None


async def missions_ending(user_id: str, *, ending_within_days: int = 30) -> Any | None:
    """Les missions qui arrivent à échéance. Une mission SANS date de fin y
    figure aussi : c'est justement celle qu'on ne relancerait jamais à temps."""
    return await _post(
        "/internal/copilot/missions/ending",
        {"userId": user_id, "endingWithinDays": ending_within_days},
    )


async def delivery_capacity(user_id: str) -> dict[str, Any] | None:
    """#3226 (#3202.6) — la capacité de delivery de l'ESPACE (consultants sans
    affectation en cours), mesurée côté NestJS. `None` = pont éteint ou réseau
    en échec : le plan n'écrit alors aucune ligne."""
    result = await _post("/internal/copilot/delivery/capacity", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def timesheets_month(user_id: str, *, month: str | None = None) -> dict[str, Any] | None:
    """Les relevés d'activité d'un mois. ``month`` absent = le mois précédent,
    comme les écrans — le 5 du mois, la question ne porte pas sur le mois en
    cours, qui n'est pas fini."""
    payload: dict[str, Any] = {"userId": user_id}
    if month:
        payload["month"] = month
    result = await _post("/internal/copilot/timesheets/month", payload)
    return result if isinstance(result, dict) else None


async def invoice_blockers(user_id: str, *, month: str | None = None) -> dict[str, Any] | None:
    """Ce qui EMPÊCHE de facturer, mois par mois. Bellum n'émet aucune facture :
    l'outil rend des bloqueurs nommés, jamais un document."""
    payload: dict[str, Any] = {"userId": user_id}
    if month:
        payload["month"] = month
    result = await _post("/internal/copilot/invoicing/blockers", payload)
    return result if isinstance(result, dict) else None


async def usable_proofs(
    user_id: str,
    *,
    account_id: str | None = None,
    sector: str | None = None,
    expertise: list[str] | None = None,
    technologies: list[str] | None = None,
) -> Any | None:
    """Les références mobilisables — celles dont le consentement est VALIDE.
    Une preuve sans accord écrit n'en fait pas partie.

    #2424.13 — `account_id`, quand connu, cible la bibliothèque sur ce compte
    côté NestJS (`usableProofs(workspaceId, targetAccountId)`) : absent, la
    bibliothèque entière revient, comme avant.

    #2424.12 — `sector`/`expertise`/`technologies` : les trois FACETTES déjà
    portées par `usableProofs` côté service, relayées jusqu'ici. Aucune
    n'est envoyée par défaut — même discipline que `account_id`.
    """
    payload: dict[str, Any] = {"userId": user_id}
    if account_id:
        payload["accountId"] = account_id
    if sector:
        payload["sector"] = sector
    if expertise:
        payload["expertise"] = expertise
    if technologies:
        payload["technologies"] = technologies
    return await _post("/internal/copilot/proofs/usable", payload)


async def has_positive_rex(user_id: str, account_id: str) -> bool:
    """#2424.10 — un REX RÉELLEMENT recueilli sur ce compte porte-t-il un « ce
    qui a marché » ? Consommé par `recommend_actions_from_context`
    (`action_recommender.py`) pour nommer l'expansion depuis un REX positif
    plutôt que le réflexe générique. Best-effort, comme tout ce pont :
    indisponible → `False`, jamais un signal deviné.
    """
    result = await _post("/internal/copilot/rex/has-positive", {"userId": user_id, "accountId": account_id})
    return bool(isinstance(result, dict) and result.get("hasPositiveRex"))


async def proof_proposal(user_id: str, mission_id: str) -> Any | None:
    """#2124.49 à .55 — les champs de preuve PROPOSÉS pour une mission.

    Une LECTURE, et rien d'autre. Ce qui revient est une proposition : le
    problème traité, le résultat obtenu, l'expertise mobilisée, la source — et
    D'OÙ chacun est repris. Rien n'est écrit, et aucun outil du copilote n'a de
    chemin vers l'écriture : c'est le clic de validation, dans l'onglet Preuves,
    qui écrit.
    """
    return await _post("/internal/copilot/proofs/proposal", {"userId": user_id, "missionId": mission_id})


async def interventions(user_id: str) -> Any | None:
    """Où intervenir aujourd'hui : la file des interventions calculées."""
    return await _post("/internal/copilot/interventions", {"userId": user_id})


async def proposal_outline(user_id: str, project_id: str) -> Any | None:
    """BEL-SC-239 — le plan de proposition (Proposal Studio) d'UN besoin.

    Une LECTURE, comme tout ce pont : `ProposalsService.buildForProject` est le
    MÊME assembleur que l'écran ``/propositions``, jamais un second calcul.
    """
    return await _post("/internal/copilot/proposals/outline", {"userId": user_id, "projectId": project_id})


# ── Les sept lectures restantes des vingt requêtes (§9.2, dette T6.4) ────────
#
# Même contrat que ci-dessus : sans configuration, ``None``, et l'outil DIT
# qu'il n'a pas accès. Une liste vide se lirait « il n'y a rien », ce qui est
# une réponse — et une fausse.


async def find_needs(
    user_id: str,
    *,
    query: str | None = None,
    limit: int = 20,
    need_id: str | None = None,
    include_closed: bool = False,
    account_id: str | None = None,
) -> dict[str, Any] | None:
    """Les besoins ouverts, cherchables par libellé — ou par IDENTITÉ connue.

    C'est aussi ce qui débloque le point d'entrée 4 du matching : sans moyen de
    RÉSOUDRE un besoin par son nom, un outil de classement proposerait un lien
    vers un besoin choisi au hasard.

    #3852 (recette prod 08/10, 2e passe) — ``need_id`` emprunte le filtre
    ``id`` de l'écran : un besoin déjà LU dans ce fil (par ``run_matching``,
    une fiche ouverte…) se résout par son identité, jamais par une recherche
    texte qui peut rater un titre mal découpé en mots."""
    payload: dict[str, Any] = {"userId": user_id, "limit": limit}
    if query:
        payload["query"] = query
    if need_id:
        payload["needId"] = need_id
    if include_closed:
        # #3889.2 — l'historique des besoins (fermés), même drapeau que l'écran.
        payload["includeClosed"] = True
    if account_id:
        # #4287.9 — le compte par son IDENTITÉ, jamais par son nom en recherche texte.
        payload["accountId"] = account_id
    result = await _post("/internal/copilot/needs/find", payload)
    return result if isinstance(result, dict) else None


async def run_matching(user_id: str, *, need_id: str, consultant_id: str | None = None) -> dict[str, Any] | None:
    """Le classement d'un besoin, ou l'explication axe par axe d'un profil.

    Zéro crédit et déterministe : deux exécutions identiques rendent le même
    classement, ce qui autorise le copilote à le déclencher sans faire confirmer
    un coût."""
    payload: dict[str, Any] = {"userId": user_id, "needId": need_id}
    if consultant_id:
        payload["consultantId"] = consultant_id
    result = await _post("/internal/copilot/needs/match", payload)
    return result if isinstance(result, dict) else None


async def run_matching_draft(user_id: str, *, need: dict[str, Any]) -> dict[str, Any] | None:
    """#AM.59 (#4059) — le classement du vivier contre un besoin COLLÉ, calculé en mémoire : aucun besoin créé, aucun
    run journalisé. Zéro crédit, déterministe."""
    result = await _post("/internal/copilot/needs/match-draft", {"userId": user_id, "need": need})
    return result if isinstance(result, dict) else None


async def submission_preflight(user_id: str, *, need_id: str, run_id: str, consultant_id: str) -> dict[str, Any] | None:
    """#3182.3 (épopée #3248, retour bêta 28/09/2026) — les prérequis d'UN
    positionnement, inspectés ensemble : consentement (global et PAR COMPTE),
    disponibilité, TJM/CV validés, autres process connus, besoin actuel.
    `run_id` vient d'un `run_matching` DÉJÀ exécuté dans ce tour — la
    préflight rejoue CE run, elle n'en recalcule jamais un autre. Lecture
    seule : `submissionPreflight` (fonction pure côté NestJS) n'écrit rien.
    `None` = pont éteint ou réseau en échec."""
    result = await _post(
        "/internal/copilot/needs/submissions/preflight",
        {"userId": user_id, "needId": need_id, "runId": run_id, "consultantId": consultant_id},
    )
    return result if isinstance(result, dict) else None


async def need_transition_history(user_id: str, need_id: str) -> dict[str, Any] | None:
    """#2320.24 (épopée #2967) — l'état de la chaîne commerciale d'UN besoin :
    statut actuel + historique de transition complet (état/auteur/date/preuve),
    le MÊME journal que `changeNeedStatus` écrit (#2320.23) — aucun second
    calcul. `None` = pont éteint, réseau en échec, ou besoin introuvable/hors de
    l'espace ; c'est l'appelant (l'outil) qui décide du message."""
    result = await _post("/internal/copilot/needs/transitions", {"userId": user_id, "needId": need_id})
    return result if isinstance(result, dict) else None


async def need_transition_check(user_id: str, need_id: str, next_status: str) -> dict[str, Any] | None:
    """#2320.26 / #2320.27 (épopée #2967) — le verdict d'UNE transition SANS
    l'exécuter : même calcul que `changeNeedStatus` (NestJS), jamais un second.
    `None` = pont éteint, réseau en échec, ou besoin introuvable/hors de
    l'espace."""
    result = await _post(
        "/internal/copilot/needs/transition-check",
        {"userId": user_id, "needId": need_id, "nextStatus": next_status},
    )
    return result if isinstance(result, dict) else None


async def talent_territory_facts(user_id: str, *, consultant_ids: list[str]) -> dict[str, Any] | None:
    """#2337 — les faits du terrain de jeu multi-talents : deux à quatre talents
    évalués par le moteur de matching EXISTANT sur les besoins ouverts de
    l'espace, groupés par compte, bornés au périmètre de BU. Lecture seule : le
    pont ne journalise aucun run. `None` = pont éteint ou réseau en échec."""
    result = await _post(
        "/internal/copilot/talents/territory-plan",
        {"userId": user_id, "consultantIds": consultant_ids},
        # Un besoin = un chargement + une évaluation par talent : jusqu'à deux cents
        # besoins ne tiennent pas dans les douze secondes d'une lecture de boîte
        # mail. Trente restent loin du budget d'un tour (90 s).
        timeout_s=30.0,
    )
    return result if isinstance(result, dict) else None


async def talent_reverse_market(
    user_id: str,
    *,
    consultant_id: str | None = None,
    skills: Sequence[str] | None = None,
    zones: Sequence[str] | None = None,
) -> dict[str, Any] | None:
    """#3816.1 — le marché inversé d'UN talent (`ReverseMarketService.forTalent`, le calcul
    de l'écran `GET consultants/:id/reverse-market`), lu par Laura. Lecture seule : aucun
    crédit, aucun appel sortant. ``{"found": False}`` = talent absent de l'espace ;
    `None` = pont éteint ou réseau en échec — jamais confondus avec un marché vide."""
    # KEVIN-FIX K.6 — la DEMANDE (compétences, zones en départements) gagne sur la fiche ; sans
    # `consultant_id`, le profil décrit en texte libre est la seule source.
    payload: dict[str, Any] = {"userId": user_id}
    if consultant_id:
        payload["consultantId"] = consultant_id
    if skills:
        payload["skills"] = list(skills)
    if zones:
        payload["zones"] = list(zones)
    result = await _post("/internal/copilot/talents/reverse-market", payload)
    return result if isinstance(result, dict) else None


async def talent_needs_match(user_id: str, *, consultant_id: str, mine_only: bool = False) -> dict[str, Any] | None:
    """#3865.2 (lot X05, 08/10) — le matching INVERSE d'UN talent (« à quels besoins
    répond-il ? »), le MÊME calcul que l'écran `POST consultants/:id/match-inverse`
    (`InverseMatchingService.matchTalent`), lu par Laura. ``None`` = pont éteint, réseau
    en échec, ou consultant introuvable dans cet espace — c'est l'appelant (l'outil) qui
    décide du message, jamais une liste de besoins inventée."""
    payload: dict[str, Any] = {"userId": user_id, "consultantId": consultant_id}
    if mine_only:
        payload["mineOnly"] = True
    result = await _post("/internal/copilot/talents/needs-match", payload)
    return result if isinstance(result, dict) else None


async def mission_risks(user_id: str) -> dict[str, Any] | None:
    """Les missions qui portent au moins un risque nommé. « Marge non mesurable »
    en est un — ne pas le confondre avec une marge faible."""
    result = await _post("/internal/copilot/missions/risks", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def crm_presence(user_id: str, account_id: str) -> dict[str, Any] | None:
    """#2910 (#2322.10) — le CRM externe branché par l'espace, en LECTURE, pour
    UN compte : contacts, affaires ouvertes, dernière activité. `CrmReadService`
    est en lecture seule côté API — cette route n'écrit NULLE PART ailleurs que
    le journal du compte lui-même (`recordCrmLookup`, best-effort). Jamais le nom
    du fournisseur (`connected: bool`, pas `provider`) — la doctrine du dépôt
    l'interdit. `None` = pont éteint, compte étranger, droit manquant, ou réseau
    en échec — dans les trois derniers cas la réponse porte `error` et
    `chat_tools.py` la traduit en phrase plutôt que de deviner."""
    result = await _post("/internal/copilot/crm/presence", {"userId": user_id, "accountId": account_id})
    return result if isinstance(result, dict) else None


async def crm_company_presence(
    user_id: str,
    *,
    company_name: str,
    domain: str | None = None,
    siren: str | None = None,
) -> dict[str, Any] | None:
    """#3181.2 (épopée #3247) — la MÊME lecture CRM que `crm_presence`
    ci-dessus, mais PAR IDENTITÉ (nom/domaine/siren) plutôt que par `account_id` — pour un
    candidat du pool d'alternatives, qui n'est PAS un compte possédé. `None` =
    pont éteint, droit manquant ou réseau en échec ; dans les deux derniers cas
    la réponse porte `error`, laissée à l'appelant plutôt que devinée ici."""
    payload: dict[str, Any] = {"userId": user_id, "companyName": company_name}
    if domain:
        payload["domain"] = domain
    if siren:
        payload["siren"] = siren
    result = await _post("/internal/copilot/crm/company-presence", payload)
    return result if isinstance(result, dict) else None


async def crm_deals(user_id: str, *, outcome: str, since: str | None = None) -> dict[str, Any] | None:
    """#4065.8 — les affaires GAGNÉES / PERDUES du CRM branché (`outcome` : lost, won, closed) et leur
    interlocuteur, par le pont CRM de l'API (adaptateur commun `read.deals`). Jamais le nom de
    l'éditeur. `None` = pont éteint ou réseau en échec ; `error` = droit manquant ou lecture en échec."""
    payload: dict[str, Any] = {"userId": user_id, "outcome": outcome}
    if since:
        payload["since"] = since
    result = await _post("/internal/copilot/crm/deals", payload)
    return result if isinstance(result, dict) else None


async def lost_projects(user_id: str) -> dict[str, Any] | None:
    """#4288.4 — les affaires PERDUES de l'espace : les opportunités à l'étape « perdu », la MÊME population
    que l'écran Projets › « Voir les perdues » (jamais les besoins). `None` = pont éteint ou réseau en échec."""
    result = await _post("/internal/copilot/projects/lost", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def missions_ended(user_id: str, *, ended_since_days: int) -> dict[str, Any] | None:
    """#4065.9 — les missions TERMINÉES depuis N jours (période passée), même liste que
    `missions_ending`. `None` = pont éteint ou en échec."""
    result = await _post("/internal/copilot/missions/ended", {"userId": user_id, "endedSinceDays": ended_since_days})
    return result if isinstance(result, dict) else None


async def contact_solicitation_collision(user_id: str, contact_id: str) -> dict[str, Any] | None:
    """#3264.14 (épopée #3264, lot R11 29/09) — un collègue a-t-il déjà une
    séquence d'outreach ACTIVE sur ce contact ? `outreach_sequences` vit côté
    NestJS (`ProjectPipelineService.contactSolicitationCollisionFor`) ; ce
    pont est ce que `prepare_message_for_contact` interroge AVANT de préparer
    un message, pour ne jamais proposer une relance qui ignore ce qu'un
    collègue a déjà engagé. `None` = pont éteint ou réseau en échec — dans ce
    cas l'outil se comporte comme avant ce lot, jamais un refus deviné."""
    result = await _post("/internal/copilot/outreach/contact-collision", {"userId": user_id, "contactId": contact_id})
    return result if isinstance(result, dict) else None


async def contact_preflight(user_id: str, contact_id: str, *, action: str | None = None) -> dict[str, Any] | None:
    """#3219 (#190.2 côté CONTACT, décision Louis 11/10/2026) — le contrôle AVANT
    une action sur UN contact (préparer un message, l'ajouter à une séquence,
    l'exporter vers le CRM). Le calcul vit côté NestJS (`ContactsService.preflight`,
    le MÊME que la fiche contact) ; ce pont le relaie, jamais un second calcul.
    `None` = pont éteint ou réseau en échec ; un contact hors de l'espace rend
    `{"error": "contact_not_found"}`, laissé à l'appelant plutôt que deviné ici."""
    payload: dict[str, Any] = {"userId": user_id, "contactId": contact_id}
    if action:
        payload["action"] = action
    result = await _post("/internal/copilot/contact/preflight", payload)
    return result if isinstance(result, dict) else None


async def workspace_timing(user_id: str, *, seniority: str | None = None) -> dict[str, Any] | None:
    """#3289 (#3264.31/.32/.33) — le créneau d'envoi que l'ESPACE a appris, par
    canal, mesuré côté NestJS sur les gestes faits et leurs issues déclarées
    (`SendTimingService`). `None` = pont éteint ou réseau en échec."""
    payload: dict[str, Any] = {"userId": user_id}
    if seniority:
        payload["seniority"] = seniority
    result = await _post("/internal/copilot/outreach/send-timing", payload)
    return result if isinstance(result, dict) else None


async def search_our_base(
    user_id: str,
    *,
    terms: Sequence[str] = (),
    city: str | None = None,
    departments: Sequence[str] = (),
    regions: Sequence[str] = (),
    period_from: str | None = None,
    period_to: str | None = None,
    families: Sequence[str] = (),
    offset: int | None = None,
    exclude_esn: bool = False,
) -> dict[str, Any] | None:
    """#4792 (épopée #4791) — CE QUE NOTRE BASE PORTE DÉJÀ, par métier, lieu et période : les comptes,
    les besoins (enregistrés et offres collectées) et les consultants.

    Relais PUR de l'unique lecteur (`BaseReaderService`, NestJS) : l'espace actif, le périmètre de
    Business Unit et le cloisonnement sont résolus LÀ-BAS, à partir de `userId`. Aucun critère n'est
    deviné ici — un critère absent de l'appel reste absent de la requête, et une liste vide n'est
    jamais envoyée comme un filtre.

    ZÉRO CRÉDIT : lire ce qui est déjà stocké ne débite rien (doctrine
    `c145_historique_stocke_se_lit_sans_credit`), et cet appel ne déclenche aucune collecte.

    `None` = pont éteint ou réseau en échec — jamais une liste vide, qui se lirait « il n'y a rien ».
    """
    payload: dict[str, Any] = {"userId": user_id}
    if terms:
        payload["terms"] = [str(term) for term in terms]
    if city:
        payload["city"] = city
    if departments:
        payload["departments"] = [str(code) for code in departments]
    if regions:
        payload["regions"] = [str(region) for region in regions]
    if period_from:
        payload["from"] = period_from
    if period_to:
        payload["to"] = period_to
    if families:
        payload["families"] = [str(family) for family in families]
    if offset:
        payload["offset"] = int(offset)
    if exclude_esn:
        # #4794 — « comptes qui prennent des développeurs » : l'API écarte les ESN franches (code d'activité).
        payload["excludeEsn"] = True
    result = await _post("/internal/copilot/base/search", payload)
    return result if isinstance(result, dict) else None


async def contradicted_method_rules(user_id: str) -> frozenset[str]:
    """#3289 (suivi #3264.41) — les règles du corpus méthode que l'ESPACE de
    l'utilisateur a contredites par ses résultats déclarés (NestJS,
    `MethodRuleOutcomesService`). Pont éteint, réseau en échec ou lecture
    impossible : `frozenset()` — aucune exclusion, le comportement d'avant ce
    lot. Jamais une règle écartée sur une réponse incertaine."""
    result = await _post("/internal/copilot/method/contradicted-rules", {"userId": user_id})
    if not isinstance(result, dict) or result.get("error"):
        return frozenset()
    rule_ids = result.get("ruleIds")
    if not isinstance(rule_ids, list):
        return frozenset()
    return frozenset(str(rule_id) for rule_id in rule_ids if isinstance(rule_id, str) and rule_id)


async def account_staffing_history(user_id: str, account_id: str) -> dict[str, Any] | None:
    """#3182.2 (épopée #3248, retour bêta 28/09/2026) — les consultants déjà
    POSITIONNÉS sur UN compte, par l'historique RÉEL de staffing
    (`StaffingService.listForAccount`, la MÊME lecture que
    `listForMission`/`listForConsultant`, GA-26). `search_talents` balaie le
    vivier ENTIER — jamais filtré par compte ; cette route ferme ce trou.
    `None` = pont éteint, compte étranger, ou réseau en échec."""
    result = await _post("/internal/copilot/staffing/account-history", {"userId": user_id, "accountId": account_id})
    return result if isinstance(result, dict) else None


async def commercial_load_capacity(user_id: str) -> dict[str, Any] | None:
    """#3182.2 (épopée #3248, reste « disponibilité de l'équipe commerciale ») —
    LE MODÈLE D'ÉQUIPE MINIMAL : la charge DÉJÀ déclarée par l'espace
    (Réglages › Charge commerciale, `AccountsService.commercialLoadCapacity`),
    croisée avec le compte RÉEL de dossiers suivis par l'utilisateur qui
    s'apprête à ouvrir un compte. Jamais un modèle d'équipe multi-utilisateur
    (ce produit n'en a pas, RLS mono-utilisateur) — scopé à l'ESPACE, jamais
    à un compte. `None` = pont éteint ou réseau en échec."""
    result = await _post("/internal/copilot/workspace/commercial-load-capacity", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def mission_start_readiness(user_id: str, mission_id: str) -> dict[str, Any] | None:
    """#2338.8 / #2409.8 — la checklist de démarrage d'UNE mission : le verdict
    (prêt / prêt avec réserves / bloqué / incomplet) et les prérequis NOMMÉS,
    pour que Laura annonce le démarrage AVEC ses réserves plutôt que de rester
    muette dessus. `None` = pont éteint, mission introuvable ou réseau en échec."""
    result = await _post(
        "/internal/copilot/missions/start-readiness",
        {"userId": user_id, "missionId": mission_id},
    )
    return result if isinstance(result, dict) else None


async def mission_amendments(user_id: str, mission_id: str) -> dict[str, Any] | None:
    """#2423.9 — les avenants DÉJÀ proposés sur UNE mission, pour que Laura
    vérifie que la mission appartient à l'espace avant d'en préparer un
    nouveau. `None` = pont éteint, mission introuvable ou réseau en échec."""
    result = await _post(
        "/internal/copilot/missions/amendments",
        {"userId": user_id, "missionId": mission_id},
    )
    return result if isinstance(result, dict) else None


async def need_journal(user_id: str, need_id: str) -> dict[str, Any] | None:
    """#2339.1 (épopée #2795) — le journal unifié des quatre sujets (besoin,
    shortlist, positionnement, mission) pour UN besoin, dans l'ordre où c'est
    arrivé. `None` = pont éteint, besoin introuvable/hors de l'espace, ou
    réseau en échec."""
    result = await _post("/internal/copilot/needs/journal", {"userId": user_id, "needId": need_id})
    return result if isinstance(result, dict) else None


async def need_mission_handoff_check(user_id: str, need_id: str) -> dict[str, Any] | None:
    """#2339.2 (épopée #2795) — le contrôle de handoff AVANT de lancer une
    conversion besoin→mission : consultant engagé, aucune mission déjà
    ouverte pour ce besoin. Lecture seule. `None` = pont éteint, besoin
    introuvable/hors de l'espace, ou réseau en échec."""
    result = await _post("/internal/copilot/needs/mission-handoff-check", {"userId": user_id, "needId": need_id})
    return result if isinstance(result, dict) else None


async def need_read(user_id: str, need_id: str) -> dict[str, Any] | None:
    """#2339.3 / #2339.10 (épopée #2795) — le besoin brut, pour que le
    copilote calcule lui-même l'aperçu des champs et le résumé. `None` = pont
    éteint, besoin introuvable/hors de l'espace, ou réseau en échec."""
    result = await _post("/internal/copilot/needs/read", {"userId": user_id, "needId": need_id})
    return result if isinstance(result, dict) else None


async def need_duplicates(user_id: str, need_id: str) -> dict[str, Any] | None:
    """#2339.5 / #2339.6 (épopée #2795) — les doublons probables du même
    besoin, dans le même compte. On PROPOSE, on ne fusionne jamais. `None` =
    pont éteint, besoin introuvable/hors de l'espace, ou réseau en échec."""
    result = await _post("/internal/copilot/needs/duplicates", {"userId": user_id, "needId": need_id})
    return result if isinstance(result, dict) else None


async def need_missions(user_id: str, need_id: str) -> dict[str, Any] | None:
    """#2339.6 / #2339.11 / #2339.13 (épopée #2795) — les missions déjà nées de
    ce besoin, avec la preuve du positionnement retenu (`submissionId`).
    `None` = pont éteint, besoin introuvable/hors de l'espace, ou réseau en
    échec."""
    result = await _post("/internal/copilot/needs/missions", {"userId": user_id, "needId": need_id})
    return result if isinstance(result, dict) else None


async def need_no_go_state(user_id: str, need_id: str) -> dict[str, Any] | None:
    """#2339.13 (épopée #2795) — l'état NO-GO d'un besoin : mission dupliquée,
    ou incohérence Besoin/Mission. `None` = pont éteint, besoin
    introuvable/hors de l'espace, ou réseau en échec."""
    result = await _post("/internal/copilot/needs/no-go-state", {"userId": user_id, "needId": need_id})
    return result if isinstance(result, dict) else None


async def project_read(user_id: str, project_id: str) -> dict[str, Any] | None:
    """#2324.39 — l'état ACTUEL d'une opportunité (étape, montant estimé,
    prochaine étape), lu avant d'en préparer une mise à jour pour que le diff
    soit vrai. `None` = hors de l'espace (le pont rend 404), pont éteint ou
    réseau en échec."""
    result = await _post(
        "/internal/copilot/projects/read",
        {"userId": user_id, "projectId": project_id},
    )
    return result if isinstance(result, dict) else None


async def reactivation_pool(user_id: str, *, segment: str | None = None) -> dict[str, Any] | None:
    """Le pool de réactivation. Sans segment, les effectifs de chacun."""
    payload: dict[str, Any] = {"userId": user_id}
    if segment:
        payload["segment"] = segment
    result = await _post("/internal/copilot/talents/reactivation", payload)
    return result if isinstance(result, dict) else None


async def search_rfps(user_id: str, *, rfp_id: str | None = None) -> dict[str, Any] | None:
    """Les appels d'offres, ou l'un d'eux avec sa grille de conformité."""
    payload: dict[str, Any] = {"userId": user_id}
    if rfp_id:
        payload["rfpId"] = rfp_id
    result = await _post("/internal/copilot/rfps", payload)
    return result if isinstance(result, dict) else None


async def accounts_to_act(user_id: str) -> dict[str, Any] | None:
    """Les comptes qui attendent une décision, ou sur lesquels rien ne bouge."""
    result = await _post("/internal/copilot/accounts/to-act", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def account_signals(user_id: str, account_id: str | None = None) -> dict[str, Any] | None:
    """#3919 — « qu'est-ce qui bouge chez ce compte ? » (`account_id` fourni) ou
    « les comptes où ça bouge » (`account_id` absent). Même lecture que la
    Veille du portefeuille, relayée TELLE QUELLE."""
    payload: dict[str, Any] = {"userId": user_id}
    if account_id:
        payload["accountId"] = account_id
    result = await _post("/internal/copilot/accounts/signals", payload)
    return result if isinstance(result, dict) else None


async def account_notes(user_id: str, account_id: str) -> dict[str, Any] | None:
    """#3895 — les notes d'un compte avec leur portée de groupe, relayées TELLES QUELLES (même lecture
    que l'onglet Notes de la fiche)."""
    result = await _post("/internal/copilot/account/notes", {"userId": user_id, "accountId": account_id})
    return result if isinstance(result, dict) else None


async def engagement_report(
    user_id: str, since_date: str | None = None, window_days: int | None = None
) -> dict[str, Any] | None:
    """#3903 — le bilan de relance sur une fenêtre. `since_date` (ISO
    YYYY-MM-DD) prime sur `window_days` (défaut 90, côté pont)."""
    payload: dict[str, Any] = {"userId": user_id}
    if since_date:
        payload["sinceDate"] = since_date
    elif window_days:
        payload["windowDays"] = window_days
    result = await _post("/internal/copilot/accounts/engagement-report", payload)
    return result if isinstance(result, dict) else None


async def near_signing(user_id: str) -> dict[str, Any] | None:
    """#3904 — décision Louis 09/10 : les opportunités au stade proposition ou
    négociation, Bellum (`bellum`) et CRM branché (`crm`, `None` = aucune
    affaire CRM lue — nommé, jamais « rien »). `None` = pont éteint."""
    result = await _post("/internal/copilot/accounts/near-signing", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def source_connections(user_id: str) -> dict[str, Any] | None:
    """#3904.3 — l'état de connexion et la dernière synchro des quatre sources
    commerciales (CRM, téléphonie, agenda, mail), relus du Tool Registry par
    `salesSourceConnections` — la même lecture que l'écran. `None` = pont
    éteint ou réseau en échec, jamais « rien n'est branché »."""
    result = await _post("/internal/copilot/sources/connections", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def actions_awaiting_outcome(user_id: str) -> dict[str, Any] | None:
    """#3211.9 (épopée #3234) — les actions ÉCHUES de l'utilisateur dont aucun
    résultat n'a été déclaré. La portée « en retard » vit côté NestJS
    (`ActionPlanItemsService.listOpenForUser`) ; relayée TEL QUEL. `None` =
    pont éteint ou réseau en échec."""
    result = await _post("/internal/copilot/actions/awaiting-outcome", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def select_message_template(
    user_id: str,
    channel: str,
    scenario_id: str,
    persona: str,
    mode: str | None = None,
    *,
    step: str | None = None,
) -> dict[str, Any] | None:
    """#3427 — le modèle APPROUVÉ choisi par canal, scénario et persona (jamais
    par ressemblance de mots). La règle absolue vit côté NestJS ; relayée TEL
    QUELLE. `None` = pont éteint ou réseau en échec."""
    payload: dict[str, Any] = {"userId": user_id, "channel": channel, "scenarioId": scenario_id, "persona": persona}
    if mode:
        # #3443 — « inspiration » = les exemples de COMPORTEMENT, jamais le verbatim.
        payload["mode"] = mode
    if step:
        # #3437/#3438/#3440 — l'étape de la séquence (invitation, M1, M2, M3) : critère structuré.
        payload["step"] = step
    result = await _post("/internal/copilot/message-template/select", payload)
    return result if isinstance(result, dict) else None


async def pre_send_check(
    user_id: str, body: str, step: int | None, persona: str | None, recipient_terms: list[str] | None = None
) -> dict[str, Any] | None:
    """#3422.20 — la checklist « avant d'envoyer » (`preSendCheck`, côté NestJS,
    la même règle que l'écran) appliquée à un texte. `None` = pont éteint ou
    réseau en échec."""
    payload: dict[str, Any] = {"userId": user_id, "body": body}
    if step is not None:
        payload["step"] = step
    if persona:
        payload["persona"] = persona
    if recipient_terms:
        payload["recipientTerms"] = recipient_terms
    result = await _post("/internal/copilot/message/pre-send-check", payload)
    return result if isinstance(result, dict) else None


async def portfolio_priorities(user_id: str) -> dict[str, Any] | None:
    """#3209 (LAU-FINAL-215) — le portefeuille réparti en quatre catégories
    (maintenant / à vérifier / à surveiller / à ne pas travailler), jamais un
    tri par score. `None` = pont éteint ou réseau en échec."""
    result = await _post("/internal/copilot/accounts/portfolio-priorities", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def similar_cases(user_id: str, account_id: str) -> dict[str, Any] | None:
    """#3210 (LAU-FINAL-216) — les cas passés (gagnés via un REX, perdus via
    une opportunité `lost`) comparables à ce compte, dans le MÊME espace.
    `None` = pont éteint ou réseau en échec."""
    result = await _post("/internal/copilot/cases/similar", {"userId": user_id, "accountId": account_id})
    return result if isinstance(result, dict) else None


async def channel_performance(
    user_id: str, by: str = "channel", account_id: str | None = None
) -> dict[str, Any] | None:
    """#3278.3 (#3259.7) — ce que l'espace a MESURÉ par canal (réponse sous 14 j).
    Relayé TEL QUEL depuis `AnalysisService.channelPerformanceFor`. `None` =
    pont éteint ou réseau en échec."""
    payload: dict[str, Any] = {"userId": user_id}
    if by in ("role", "angle", "cadence", "route", "priority"):
        # #3234 (#3211.11) — la même mesure, coupée par rôle de décision du contact ;
        # cadence/route/priorité (lot M11) : la recommandation par dimension.
        payload["by"] = by
    if account_id and by in ("cadence", "route", "priority"):
        # P05.a (#3246) — le segment (secteur, taille) de la base anonyme commune.
        payload["accountId"] = account_id
    result = await _post("/internal/copilot/channels/performance", payload)
    return result if isinstance(result, dict) else None


async def focus_review(user_id: str, account_id: str) -> dict[str, Any] | None:
    """#3262.23 (épopée #3284) — LA PHRASE DE LAURA sur un compte Focus qui
    stagne. La règle (`FOCUS_STALE_DAYS`, `shouldSwitch('focus',
    'thirty_days_idle')`) vit côté NestJS (`PilotageService.
    focusReviewForAccount`) ; relayée TEL QUEL. `None` = pont éteint ou
    réseau en échec."""
    result = await _post("/internal/copilot/accounts/focus-review", {"userId": user_id, "accountId": account_id})
    return result if isinstance(result, dict) else None


async def day_brief(user_id: str, *, day: str | None = None) -> dict[str, Any] | None:
    """Les rendez-vous d'une journée. La JOURNÉE entière, jamais « le prochain »."""
    payload: dict[str, Any] = {"userId": user_id}
    if day:
        payload["day"] = day
    result = await _post("/internal/copilot/agenda/day-brief", _with_excluded_tool_providers(payload))
    return result if isinstance(result, dict) else None


async def day_closure(user_id: str, *, time_zone: str | None = None) -> dict[str, Any] | None:
    """#2392 — la clôture de fin de journée, COMPILÉE côté NestJS
    (`BriefingService.dayClosure` + cartes à valider). `None` = pont muet."""
    payload: dict[str, Any] = {"userId": user_id}
    if time_zone:
        payload["timeZone"] = time_zone[:64]
    result = await _post("/internal/copilot/day-closure", payload)
    return result if isinstance(result, dict) else None


# ── Le back-office (PDF 2 §5.1) ──────────────────────────────────────────────
#
# Quatre lectures, et une ABSENCE délibérée : le coût chargé et la marge ne
# traversent pas ce pont. Le §5.3 le pose comme une règle qui ne bouge pas, et
# le chiffre d'affaires n'en a pas besoin — signé, produit, facturé, encaissé se
# calculent tous sans lui.
#
# La cinquième demande du §5.1, « enregistrer un consultant », n'a
# volontairement AUCUNE fonction ici : elle rend une proposition côté
# `chat_tools`, et l'absence de client est ce qui garantit qu'elle n'écrit rien.


async def pipeline_summary(user_id: str) -> dict[str, Any] | None:
    """L'état du pipe : cinq colonnes, leurs projets, leurs montants SAISIS.

    Un montant qui n'a été chiffré nulle part rend ``None`` et non ``0`` : « 0 € »
    se lirait « cette étape ne vaut rien », alors que la vérité est « personne
    n'a chiffré »."""
    result = await _post("/internal/copilot/pipeline/summary", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def probable_quarter(user_id: str) -> dict[str, Any] | None:
    """#4016.1d — le CA probable des trois mois à venir et la probabilité CALIBRÉE de
    chaque affaire (enveloppe : méthode, intervalle, axes). ``None`` = le pont n'a pas
    répondu ; ``{"error": "finance_forbidden"}`` = pas le droit de lire un chiffre
    d'affaires. Jamais un chiffre nu."""
    result = await _post("/internal/copilot/pipeline/probable-quarter", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def pipeline_health(user_id: str) -> dict[str, Any] | None:
    """#2324.40/43/44/46/47/48 — le diagnostic de pipe NOMMÉ : ce qui mérite du
    temps, ce qui est recommandé à la clôture, et combien de signaux le NO-GO
    #2324.48 a exclus. Aucun score, aucune probabilité — des raisons."""
    result = await _post("/internal/copilot/pipeline/health", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def work_progress(user_id: str, *, lot_id: str | None = None) -> tuple[dict[str, Any] | None, str | None]:
    """#4611 — l'ÉTAT du travail lancé (analyses, imports, enrichissements, synchros, rattrapages), LU en
    base côté API : ``(données, None)`` ou ``(None, raison)`` — ``not_configured``, ``http_<code>``,
    ``unreachable`` ou ``timeout`` (un délai dépassé n'est pas un échec : on ne sait pas, #4611.7).
    Une lecture : le pont n'écrit, ne relance et ne rejoue rien. L'espace et le périmètre de portefeuille
    sont résolus côté API depuis ``user_id`` ; ``lot_id`` hors périmètre revient ``lot_unknown``."""
    payload: dict[str, Any] = {"userId": user_id}
    if lot_id:
        payload["lotId"] = lot_id
    data, failure, _message = await _post_explained(
        "/internal/copilot/work-progress", payload, distinguish_timeout=True
    )
    if failure is None and not isinstance(data, dict):
        return None, "unreachable"
    return (data if failure is None else None), failure


async def revenue_breakdown(user_id: str, *, month: str | None = None) -> dict[str, Any] | None:
    """Les QUATRE chiffres d'affaires, jamais fondus en un seul.

    ⚠️ Sans la MARGE, et ce n'est pas un oubli : le coût chargé ne sort jamais
    vers le modèle. Le pont refuse par ailleurs à qui n'a aucun droit financier
    — ``{"error": "finance_forbidden"}`` — plutôt que de rendre des lignes
    vides, qui se liraient « tu n'as rien vendu »."""
    payload: dict[str, Any] = {"userId": user_id}
    if month:
        payload["month"] = month
    result = await _post("/internal/copilot/finance/revenue", payload)
    return result if isinstance(result, dict) else None


async def confirmed_revenue(user_id: str, *, month: str | None = None) -> dict[str, Any] | None:
    """#2900 (#2415.10) — l'ENCAISSÉ, moins ce qui est CONTESTÉ.

    Pas un cinquième chiffre d'affaires : une dérivation à part de la seule
    ligne ENCAISSÉ, pour la question que ``get_revenue`` ne répond pas —
    un jour contesté ne sort pas de l'encaissé qu'il rend aujourd'hui.
    ``excludedDisputed`` NOMME ce qui est écarté, jamais fondu dans
    ``amountCents``. ``amountCents: null`` veut dire « rien de confirmé
    mesurable », jamais « zéro € confirmé »."""
    payload: dict[str, Any] = {"userId": user_id}
    if month:
        payload["month"] = month
    result = await _post("/internal/copilot/finance/confirmed-revenue", payload)
    return result if isinstance(result, dict) else None


async def capacity(user_id: str, *, month: str | None = None) -> dict[str, Any] | None:
    """Combien de jours l'équipe peut encore vendre.

    ``capacityDays: null`` veut dire « rien de mesurable », jamais « zéro jour »
    — ce dernier se lirait « tout le monde est staffé », qui est l'inverse."""
    payload: dict[str, Any] = {"userId": user_id}
    if month:
        payload["month"] = month
    result = await _post("/internal/copilot/finance/capacity", payload)
    return result if isinstance(result, dict) else None


async def overdue_payments(user_id: str, *, month: str | None = None) -> dict[str, Any] | None:
    """Les mois FACTURÉS et non encaissés — « qui ne m'a pas payé ? ».

    Une facture contestée y figure (elle n'est pas payée, c'est un fait) mais
    n'a jamais de relance due : un litige n'est pas un retard."""
    payload: dict[str, Any] = {"userId": user_id}
    if month:
        payload["month"] = month
    result = await _post("/internal/copilot/invoicing/overdue", payload)
    return result if isinstance(result, dict) else None


async def forecast_horizons(user_id: str, *, horizon: str | None = None) -> dict[str, Any] | None:
    """#2425.8 — le prévisionnel par horizon, avec les MÊMES causes chiffrées
    que l'écran (`gap.causes` : `invoicingDelay`, `notYetInvoiced`, `overdue`,
    `disputed`). Rien n'est recalculé ici — `ForecastHorizonsService` reste
    l'unique dérivation ; aucun montant n'est pondéré (doctrine c26).

    Le pont refuse à qui n'a pas `finance:read` — ``{"error":
    "finance_forbidden"}`` — plutôt que de rendre un écart à zéro, qui se
    lirait « pas d'écart » au lieu de « pas le droit de le voir »."""
    payload: dict[str, Any] = {"userId": user_id}
    if horizon:
        payload["horizon"] = horizon
    result = await _post("/internal/copilot/finance/forecast", payload)
    return result if isinstance(result, dict) else None


# ── Laura Produit (PDF 10 §5.8) ──────────────────────────────────────────────
#
# Quatre lectures, et une absence délibérée : le SCORE de santé ne traverse
# jamais cette frontière. Le §5.6 le pose comme interne et D50 en fait un signal
# commercial ; le passer au modèle le mettrait à un tour de « ton espace est à 38
# sur 100 », phrase que personne n'a envie de lire sur son propre outil. Ce qui
# passe est la CAUSE, ce qui n'a pas pu être mesuré, et ce qui bloque.


async def laura_user_context(user_id: str) -> dict[str, Any] | None:
    """Ce que Laura sait de la personne à qui elle parle."""
    result = await _post("/internal/copilot/laura/user-context", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def laura_workspace_health(user_id: str) -> dict[str, Any] | None:
    """L'état de l'espace — la cause principale, jamais la note."""
    result = await _post("/internal/copilot/laura/workspace-health", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def laura_weakest_link_diagnosis(user_id: str) -> dict[str, Any] | None:
    """BEL-SC-224 (#3253, P0) — le maillon faible commercial principal, avec sa
    preuve. Maison canonique nouvelle : KEEP sur `laura_workspace_health`
    ci-dessus, qui répond à une question différente (adoption produit)."""
    result = await _post("/internal/copilot/laura/weakest-link-diagnosis", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def laura_blocking_issues(user_id: str) -> dict[str, Any] | None:
    """Ce qui empêche de travailler. `issues: null` = on n'a pas pu regarder ;
    `issues: []` = il n'y a rien. Les deux ne se confondent pas."""
    result = await _post("/internal/copilot/laura/blocking-issues", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def laura_feature_adoption(user_id: str) -> dict[str, Any] | None:
    """Quelles familles de fonctionnalités ont produit quelque chose."""
    result = await _post("/internal/copilot/laura/feature-adoption", {"userId": user_id})
    return result if isinstance(result, dict) else None


# ── Réglages, en lecture (#1822 / #1823) ─────────────────────────────────────
#
# Deux lectures de plus, même contrat que les quatre ci-dessus : aucun verbe
# d'écriture. Le catalogue des routines et l'aperçu de l'import ont déjà leur
# calcul et leur écran (Réglages › Routines, Réglages › Import) ; le pont ne
# fait que les rendre atteignables d'une conversation.


async def laura_routines_summary(user_id: str) -> dict[str, Any] | None:
    """Le catalogue des routines : actives ou non, ce qui les bloque, leur
    dernier passage. Jamais de création de routine — le catalogue vit dans le
    CODE (`routine-catalog.ts`), pas en base ; ce qui peut changer par
    utilisateur est l'ABONNEMENT, pas la liste elle-même."""
    result = await _post("/internal/copilot/laura/routines-summary", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def laura_import_overview(user_id: str) -> dict[str, Any] | None:
    """Ce que l'assistant d'import sait recevoir, et l'historique des sessions
    de CET espace. Le pont retire les clés qui nomment un éditeur (règle du
    dépôt) : ce qui reste dit la CAPACITÉ (compte, contact, mission…), jamais
    la source."""
    result = await _post("/internal/copilot/laura/import-overview", {"userId": user_id})
    return result if isinstance(result, dict) else None


# ── Réglages, en LECTURE — la contrepartie que `propose_settings_update`
# RÉSOUT avant de proposer (#1822, Lot 16) ───────────────────────────────────
#
# Même contrat que les deux lectures ci-dessus : aucun verbe d'écriture. Les
# deux écrans (`/settings/notifications`, `/settings/pipeline`) et leurs
# champs sont décidés côté NestJS (`laura-settings-catalog.ts`) — ce pont ne
# fait que les rendre atteignables d'une conversation, et ne recopie AUCUNE
# liste de champs de son côté : une clé inventée par le modèle est refusée
# contre CETTE réponse, jamais contre une copie locale qui pourrait diverger.


async def laura_settings_overview(user_id: str) -> dict[str, Any] | None:
    """Les réglages que la conversation peut PROPOSER de changer, avec leur
    valeur actuelle. Jamais d'écriture : le clic passe par la route
    authentifiée de l'écran (`PATCH /notifications/preferences`,
    `PUT /pipeline/stage-sla/:stage`), jamais par ce pont."""
    result = await _post("/internal/copilot/laura/settings-overview", {"userId": user_id})
    return result if isinstance(result, dict) else None


# ── Deux écrans de réglages de PLUS, en lecture (#1822) ──────────────────────
#
# Même contrat que les précédentes : aucun verbe d'écriture, et le calcul reste
# celui de l'écran (`MemoryService.readLedger`, `WorkspaceTeamService.getTeam`,
# `CataloguesService.list`). Ce que ce lot ferme :
#
#  · la MÉMOIRE était écrivable (`pin_memory_fact`) sans être lisible — Laura
#    posait une ligne qu'elle ne savait pas relire ;
#  · le VOCABULAIRE de l'espace n'était ni lisible ni écrivable — Laura
#    renvoyait vers Lexique et Catalogues sans savoir ce qu'ils contiennent.
#
# Les deux écrans de vocabulaire restent en RENVOI côté écriture : un motif de
# perte, ou le mot qui remplace « Projet », est du texte LIBRE — un modèle qui
# le propose l'invente, et ce dépôt n'écrit jamais de donnée inventée.


async def laura_memory_ledger(user_id: str) -> dict[str, Any] | None:
    """Tout ce que Laura garde de cette personne, ligne à ligne — le MÊME
    registre que Réglages › Mémoire de Laura.

    ⚠️ `unreadable_layers` n'est pas décoratif : une couche illisible est
    NOMMÉE plutôt que rendue vide, parce que « je n'ai pas pu lire » et « je ne
    retiens rien » sont deux phrases différentes, et que la seconde est fausse
    et rassurante."""
    result = await _post("/internal/copilot/laura/memory-ledger", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def laura_workspace_vocabulary(user_id: str) -> dict[str, Any] | None:
    """Les mots de l'espace : le lexique (les noms que l'ESN donne aux objets du
    produit) et les listes métier (motifs de perte, d'écartement, de refus).

    Le pont ne rend QUE le vocabulaire : la lecture du lexique passe par la
    seule porte publique qui le porte (`getTeam`), et celle-ci rend aussi les
    membres et leurs adresses — la projection NestJS les jette avant d'arriver
    ici."""
    result = await _post("/internal/copilot/laura/workspace-vocabulary", {"userId": user_id})
    return result if isinstance(result, dict) else None


# ── Le second marché et l'accès (tome 6 §16) ─────────────────────────────────
#
# Le §16 nomme quatorze outils. Mesuré le 29/08/2026 : aucun n'existait, et dix
# des quatorze capacités avaient pourtant déjà leur route REST. Ce qui manquait
# n'était pas le calcul — c'était la porte par laquelle le copilote l'atteint.
#
# Aucune de ces cinq lectures n'écrit. `declare_access_fact` (N1) et
# `create_partner_opportunity` (N2) du même §16 n'ont volontairement AUCUN
# client ici : Laura prépare, le clic écrit.

#: La moisson d'un territoire interroge quatre sources publiques derrière le
#: pont. Le défaut de douze secondes la couperait presque à chaque fois.
#:
#: Délais EMBOÎTÉS (incident prod 07/10/2026) : l'appelant attend plus que le
#: délai de l'appelé × ses essais. Source 25 s (`TERRITORY_SOURCE_BUDGET_S`) <
#: API→IA 45 s × 1 essai < ce délai 55 s < tour de Laura 90 s. À 30 s, on
#: abandonnait pile quand l'API coupait son propre appel.
_TERRITORY_TIMEOUT_S = 55.0


async def account_access(user_id: str, *, account_id: str) -> dict[str, Any] | None:
    """Par où on entre chez un compte : verrou, modes, portes classées, coût."""
    result = await _post("/internal/copilot/accounts/access", {"userId": user_id, "accountId": account_id})
    return result if isinstance(result, dict) else None


async def account_partners(user_id: str, *, account_id: str) -> dict[str, Any] | None:
    """Les ESN déjà en place sur un compte, et le jeu que chacune ouvre."""
    result = await _post("/internal/copilot/accounts/partners", {"userId": user_id, "accountId": account_id})
    return result if isinstance(result, dict) else None


async def access_by_siren(user_id: str, *, sirens: list[str]) -> dict[str, Any] | None:
    """#3181.4 (épopée #3247) — le LIEN SIREN partenaire↔client pour un pool de candidats, d'un seul
    aller-retour. Retourne `{siren: {paths, is_workspace_partner}}` ; un SIREN sans compte possédé
    est ABSENT (« on ne sait pas » n'est pas « aucun chemin »). `None` = pont éteint ou réseau en échec."""
    clean = [s for s in dict.fromkeys(sirens) if s.isdigit() and len(s) == 9][:20]
    if not clean:
        return None
    result = await _post("/internal/copilot/accounts/access-by-siren", {"userId": user_id, "sirens": clean})
    if not isinstance(result, dict) or result.get("error"):
        return None
    by_siren = result.get("bySiren")
    return by_siren if isinstance(by_siren, dict) else None


async def relation_stages_by_siren(user_id: str, *, sirens: list[str]) -> dict[str, Any] | None:
    """#4289.12 — le STADE DE RELATION par SIREN, lu sur le MOTEUR de l'API (`relationStageOf`, le même que les cas
    similaires), d'un seul aller-retour pour un pool. Retourne `{siren: {relationStage, source}}` ; un SIREN sans
    stade établi est ABSENT, un stade hors liste fermée est retiré (jamais deviné). `None` = pont éteint ou en échec."""
    from app.services.sales_context import RELATIONSHIP_STATES

    clean = [s for s in dict.fromkeys(sirens) if s.isdigit() and len(s) == 9][:20]
    if not clean:
        return None
    result = await _post("/internal/copilot/accounts/relation-stages-by-siren", {"userId": user_id, "sirens": clean})
    if not isinstance(result, dict) or result.get("error"):
        return None
    by_siren = result.get("bySiren")
    if not isinstance(by_siren, dict):
        return None
    return {
        siren: entry
        for siren, entry in by_siren.items()
        if isinstance(entry, dict) and entry.get("relationStage") in RELATIONSHIP_STATES
    }


async def community_access_by_siren(user_id: str, *, sirens: list[str]) -> dict[str, Any] | None:
    """#3247 (décision Louis 15/10/2026) — l'accès à un compte que l'espace NE POSSÈDE PAS : le verrou
    communautaire par SIREN (agrégat anonyme, partage réciproque). Retourne `{siren: {owned, community}}` ;
    un SIREN sans fait est ABSENT. `None` = pont éteint ou réseau en échec."""
    clean = [s for s in dict.fromkeys(sirens) if s.isdigit() and len(s) == 9][:20]
    if not clean:
        return None
    result = await _post("/internal/copilot/accounts/community-access-by-siren", {"userId": user_id, "sirens": clean})
    if not isinstance(result, dict) or result.get("error"):
        return None
    by_siren = result.get("bySiren")
    return by_siren if isinstance(by_siren, dict) else None


async def proof_sector_groups(user_id: str) -> dict[str, Any] | None:
    """#3181.2 (épopée #3247) — les secteurs (vocabulaire fermé) où l'espace possède déjà une preuve.
    Des noms de groupes seulement. `None` = pont éteint ou réseau en échec."""
    result = await _post("/internal/copilot/proofs/sector-groups", {"userId": user_id})
    if not isinstance(result, dict) or result.get("error") or not isinstance(result.get("groups"), list):
        return None
    return result


async def partner_pipeline(user_id: str) -> dict[str, Any] | None:
    """Les ESN partenaires de l'espace, avec leur étape et leur score."""
    result = await _post("/internal/copilot/partners/pipeline", {"userId": user_id})
    return result if isinstance(result, dict) else None


async def qualification_lead_decisions(user_id: str, *, account_id: str) -> dict[str, Any] | None:
    """#3345.2 (LAU-FINAL-255, recette prod 30/09) — les décisions déjà prises
    sur les pistes à qualifier d'un compte (écartée/mise en veille), la MÊME
    lecture que `QualificationLeadsController.decisions`. `None` = pont
    éteint ou réseau en échec."""
    result = await _post(
        "/internal/copilot/accounts/qualification-lead-decisions",
        {"userId": user_id, "accountId": account_id},
    )
    return result if isinstance(result, dict) else None


async def resolve_qualification_lead(
    user_id: str, *, label: str, account_id: str | None = None
) -> dict[str, Any] | None:
    """#3345 (recette prod 03/10) — retrouve une piste à qualifier par son
    LIBELLÉ (ou le nom de son compte) sur les lignes d'intake de l'espace. Le
    serveur résout ; un humain ne reçoit jamais la demande d'un identifiant.
    `None` = pont éteint ou réseau en échec."""
    payload: dict[str, Any] = {"userId": user_id, "label": label}
    if account_id:
        payload["accountId"] = account_id
    result = await _post("/internal/copilot/accounts/qualification-leads/resolve", payload)
    return result if isinstance(result, dict) else None


async def territory_overview(user_id: str, *, department: str, since_days: int | None = None) -> dict[str, Any] | None:
    """Les huit indicateurs d'un département, en cinq blocs qui portent leur état."""
    payload: dict[str, Any] = {"userId": user_id, "department": department}
    if since_days:
        payload["sinceDays"] = since_days
    result = await _post("/internal/copilot/territory/overview", payload, timeout_s=_TERRITORY_TIMEOUT_S)
    return result if isinstance(result, dict) else None


async def dormant_contacts(
    user_id: str, *, months: int | None = None, limit: int | None = None
) -> dict[str, Any] | None:
    """Les contacts sans aucun échange depuis N mois, joignables et non opt-out."""
    payload: dict[str, Any] = {"userId": user_id}
    if months:
        payload["months"] = months
    if limit:
        payload["limit"] = limit
    result = await _post("/internal/copilot/contacts/dormant", payload)
    return result if isinstance(result, dict) else None


async def workspace_accounts(
    user_id: str,
    *,
    query: str | None,
    sector: str | None,
    limit: int | None,
    list_all: bool = False,
    offset: int | None = None,
) -> dict[str, Any] | None:
    """#2148.4 (#2848) — un compte déjà ANALYSÉ, à travers TOUT le portefeuille
    de l'utilisateur (bornée au périmètre de l'appelant côté API). `None` =
    pont éteint, budget dépassé ou non-2xx — jamais confondu avec « aucun
    compte trouvé » (`{"accounts": []}` est une réponse valide, celle-ci)."""
    payload: dict[str, Any] = {"userId": user_id}
    for key, value in (("query", query), ("sector", sector), ("limit", limit), ("offset", offset)):
        if value is not None:
            payload[key] = value
    if list_all:
        # #4065 — le listing complet, EXPLICITE (le DTO refuse sinon une recherche sans critère).
        payload["listAll"] = True
    result = await _post("/internal/copilot/accounts/search", payload)
    return result if isinstance(result, dict) else None


async def workspace_accounts_by_owner(
    user_id: str,
    *,
    owner_name: str,
    limit: int | None,
) -> dict[str, Any] | None:
    """#3094 — les comptes assignés à un membre NOMMÉ de l'espace (« quels sont
    les comptes de <membre> ? »). `owner_name` est le nom tapé par
    l'utilisateur ; la résolution vers un membre réel se fait côté pont. `None`
    = pont éteint, budget dépassé ou non-2xx — jamais confondu avec « ce
    membre n'a pas de compte » (`memberFound: True, accounts: []`)."""
    payload: dict[str, Any] = {"userId": user_id, "ownerName": owner_name}
    if limit is not None:
        payload["limit"] = limit
    result = await _post("/internal/copilot/accounts/by-owner", payload)
    return result if isinstance(result, dict) else None


async def workspace_contacts(
    user_id: str,
    *,
    query: str | None,
    company: str | None,
    role: str | None,
    limit: int | None,
    sector: str | None = None,
    group_role: str | None = None,
    contacts_fresh_within_months: int | None = None,
    location: str | None = None,
    list_all: bool = False,
    offset: int | None = None,
    recent_first: bool = False,
    sort: str | None = None,
    by_zone: bool = False,
) -> dict[str, Any] | None:
    """#2294 — une personne à travers TOUS les comptes de l'espace (bornée au
    périmètre de l'appelant côté API). Aucun champ `None` n'est envoyé : le DTO
    est `.strict()`. `None` = pont éteint, budget dépassé ou non-2xx.

    #2294.2 — `sector`/`group_role`/`contacts_fresh_within_months` portent le
    vocabulaire PYTHON (snake_case) ; le payload les traduit en camelCase
    (`groupRole`, `contactsFreshWithinMonths`) — la forme attendue par
    `CopilotContactsSearchDto`, côté API.

    #2367 (LAU-FINAL-035, entrée « territoire ») — `location` est DÉJÀ le nom
    attendu côté API (`CopilotContactsSearchDto.location`, même champ que
    `contactListQuerySchema.location`, #2158.61) : aucune traduction."""
    payload: dict[str, Any] = {"userId": user_id}
    for key, value in (
        ("query", query),
        ("company", company),
        ("role", role),
        ("limit", limit),
        ("sector", sector),
        ("groupRole", group_role),
        ("contactsFreshWithinMonths", contacts_fresh_within_months),
        ("location", location),
        ("offset", offset),
    ):
        if value is not None:
            payload[key] = value
    if list_all:
        # #4065 — le listing complet, EXPLICITE, paginé par `offset`.
        payload["listAll"] = True
    if recent_first:
        # #4287.11 — « les N derniers contacts » : tri par dernière interaction datée côté pont.
        payload["recentFirst"] = True
    if sort:
        # #4982.3 — le tri « zone » de l'écran Contacts (`ContactListQuery.sort`), relayé tel quel.
        payload["sort"] = sort
    if by_zone:
        # #4982.3 — « répartis par région » : des COMPTES par zone (agrégation SQL côté pont), pas des lignes.
        payload["byZone"] = True
    result = await _post("/internal/copilot/contacts/search", payload)
    return result if isinstance(result, dict) else None


async def count_contacts(user_id: str, filters: dict[str, Any], *, timeout_s: float) -> int | None:
    """Laura compte avant de proposer (décision Louis, 15/09/2026, contre la
    recommandation) — combien de contacts correspondraient à CE filtre, avant
    qu'un lien vers `/contacts` soit proposé.

    ``filters`` est déjà dans la forme du contrat public (`contactListQuerySchema`,
    ``@bellum/contracts``) : c'est `_contacts_count_payload` (`chat_tools.py`)
    qui traduit les paramètres LUS par l'écran vers cette forme, pas ici.

    ``timeout_s`` est le budget de LATENCE du compte (`DEEP_LINK_COUNT_BUDGET_S`,
    par défaut très en dessous des 90 s d'un tour) — pas le défaut de ce
    fichier (12 s) : proposer un lien est normalement instantané, et son compte
    ne doit jamais devenir la raison d'un tour qui traîne. `None` couvre les
    mêmes trois cas que partout ailleurs dans ce fichier — non configuré,
    budget dépassé, réponse non-2xx — et c'est voulu : ce pont ne distingue
    JAMAIS un compte à 0 d'un compte qui n'a pas pu aboutir. Cette distinction
    est celle qui compte le plus ici (« non mesuré » n'est jamais « 0 ») ; elle
    vit dans le corps de la réponse (``{"count": 0}`` est un ``dict`` valide),
    donc dans ce que l'appelant EXTRAIT, pas dans ce que `_post` renvoie.
    """
    result = await _post("/internal/copilot/contacts/count", {"userId": user_id, **filters}, timeout_s=timeout_s)
    if not isinstance(result, dict):
        return None
    count = result.get("count")
    return count if isinstance(count, int) and not isinstance(count, bool) and count >= 0 else None


# ── Lancer une analyse depuis la conversation (#1489) ────────────────────────
#
# Deux appels, et pas un. Le premier rend ce qu'on sait du compte, le coût, le
# solde et les QUESTIONS ; le second lance, et n'accepte qu'un jeton que seul le
# premier sait produire.
#
# ⚠️ La question posée d'abord n'est donc pas une consigne de prompt : c'est la
# forme du chemin. Sans préparation, il n'y a rien à envoyer au lancement, et
# aucune formulation habile ne contourne ça.


async def plan_account_analysis(user_id: str, *, company: str, locale: str = "fr") -> dict[str, Any] | None:
    """Ce qu'on sait déjà, ce que ça coûte, et ce qu'on demande avant de lancer.

    Ne lance rien, ne débite rien."""
    payload: dict[str, Any] = {"userId": user_id, "company": company, "locale": locale}
    result, failure = await _post_detailed("/internal/copilot/analysis/plan", payload)
    if isinstance(result, dict):
        return result
    # #3859.4 — l'échec se NOMME (crédits, introuvable, indisponible), jamais un None muet.
    return analysis_failure(failure)


async def start_account_analysis(
    user_id: str,
    *,
    company: str,
    plan_token: str,
    preset: str | None = None,
    answers: dict[str, str] | None = None,
    territory: str | None = None,
    headcount_min: int | None = None,
    headcount_max: int | None = None,
    exclusions: list[str] | None = None,
    siren: str | None = None,
    relaunch: bool = False,
    scope_mode: str | None = None,
) -> dict[str, Any] | None:
    """Lance l'analyse après les questions. ``answers`` peut être vide — « go »
    sans avoir répondu à tout est un cas normal, pas une erreur.

    #2624.1 — ``territory``/``headcount_min``/``headcount_max``/``exclusions``
    cadrent la collecte AVANT le débit, exactement comme le sélecteur de
    périmètre de l'écran de confirmation (``AnalysisScopeSelection`` côté
    contrat). Tous facultatifs et regroupés en ``scope_selection`` seulement
    quand au moins un est renseigné — absent, le payload est byte-identique à
    avant ce point."""
    payload: dict[str, Any] = {"userId": user_id, "company": company, "planToken": plan_token}
    if preset:
        payload["preset"] = preset
    if answers:
        payload["answers"] = answers
    scope_selection: dict[str, Any] = {}
    if territory:
        scope_selection["geo_perimeter"] = territory
    if headcount_min is not None:
        scope_selection["headcount_min"] = headcount_min
    if headcount_max is not None:
        scope_selection["headcount_max"] = headcount_max
    if exclusions:
        scope_selection["excluded_entities"] = exclusions
    if scope_selection:
        payload["scope_selection"] = scope_selection
    if siren:
        # #3704.5 — l'identité légale d'une cible trouvée par la recherche : ancre le run.
        payload["siren"] = siren
    if scope_mode:
        # #3218 (lot RBJ) — le périmètre RETENU (mode de cadrage du contrat) : le pont le transmet à
        # `AnalysisService.start` (coût, historique des runs, job). Absent, le run part sans mode.
        payload["scope_mode"] = scope_mode
    if relaunch:
        # #3218 (lot RAW) — une relance DEMANDÉE rafraîchit le dossier en place ; absente, un
        # dossier frais est réutilisé sans débit (`cache_hit`). Payload inchangé sinon.
        payload["relaunch"] = True
    result, failure = await _post_detailed("/internal/copilot/analysis/start", payload)
    if isinstance(result, dict):
        return result
    return analysis_failure(failure)


async def follow_analysis_batch(user_id: str, launched: list[str], known: list[str]) -> dict[str, Any] | None:
    """#4462.9 — déclare le lot d'analyses que Laura vient de lancer (``launched``, en cours) et les comptes déjà
    connus de la même liste (``known``) : à la fin de la DERNIÈRE analyse, l'API pose le classement « par où
    commencer » en notification. Rien ne s'écrit d'autre ; sans configuration, ``None``."""
    result = await _post(
        "/internal/copilot/analysis/follow-batch", {"userId": user_id, "launched": launched, "known": known}
    )
    return result if isinstance(result, dict) else None


async def chain_blockers(user_id: str) -> dict[str, Any] | None:
    """Où les dossiers bloquent dans le processus (#1506).

    Une LECTURE dérivée des objets métier : rien n'est créé, rien n'est envoyé.
    Sans configuration, ``None`` — et l'outil DIT qu'il n'a pas accès plutôt que
    de rendre une liste vide, qui se lirait « rien ne bloque »."""
    result = await _post("/internal/copilot/chains/blockers", {"userId": user_id})
    return result if isinstance(result, dict) else None


# ── #1596.6-10 / #1628.1 — la mémoire marché interrogée PAR FILTRE ───────────
#
# Le 46ᵉ outil de Laura, et l'INVERSE de tout ce qui précède dans ce fichier :
# chaque autre lecture part d'une IDENTITÉ (un compte, une entreprise nommée) ;
# celle-ci part de CRITÈRES — « quelles entreprises ont observé du Java, en
# Île-de-France, à plus de 500 personnes ? ». Même contrat de transport que le
# reste du fichier : sans configuration, ``None`` ; c'est l'appelant
# (`chat_tools.execute_chat_tool`) qui REFUSE une recherche sans filtre, AVANT
# d'atteindre cette fonction — voir sa doc pour la raison.


async def search_market_memory(
    user_id: str,
    *,
    technology: str | None = None,
    location: str | None = None,
    esn: str | None = None,
    role_family: str | None = None,
    employee_min: int | None = None,
    employee_max: int | None = None,
    # #2991 (#2287.15) — la taille, une tranche FERMÉE du corpus, distincte
    # des bornes chiffrées employee_min/employee_max ci-dessus.
    size: str | None = None,
    # #2991 (#2287.17) — le recours externe GÉNÉRIQUE, distinct d'`esn` (une
    # société de services NOMMÉE). Doctrine c65/GA-259 : seul `True` filtre.
    external_recourse_observed: bool = False,
    # #2991 (#2287.14) — LE TYPE D'ENTREPRISE, au sens de la SEULE
    # classification que porte le corpus. Même doctrine : seul `True` filtre.
    is_service_company: bool = False,
    limit: int = 20,
) -> dict[str, Any] | None:
    """Cherche des entreprises du corpus PAR FILTRE. Rend le résultat NestJS
    tel quel (``{"status": "ok", "matches": [...]}`` ou ``{"status":
    "unavailable", ...}``) — c'est à l'appelant de choisir quoi en faire,
    exactement comme `MarketMemoryService` le documente lui-même."""
    payload: dict[str, Any] = {"userId": user_id, "limit": limit}
    if technology:
        payload["technology"] = technology
    if location:
        payload["location"] = location
    if esn:
        payload["esn"] = esn
    if role_family:
        payload["roleFamily"] = role_family
    if employee_min is not None:
        payload["employeeMin"] = employee_min
    if employee_max is not None:
        payload["employeeMax"] = employee_max
    if size:
        payload["size"] = size
    if external_recourse_observed:
        payload["externalRecourseObserved"] = True
    if is_service_company:
        payload["isServiceCompany"] = True
    result = await _post("/internal/copilot/market/search", payload)
    return result if isinstance(result, dict) else None


# ── #1611.4 / #1611.5 — la mémoire marché PAR IDENTITÉ, pour le plan et les
# messages ─────────────────────────────────────────────────────────────────
#
# L'INVERSE de `search_market_memory` ci-dessus : celle-ci part de CRITÈRES,
# celle-ci part d'une IDENTITÉ (le compte en cours d'analyse), exactement comme
# `GET :id/market-context` le fait déjà pour le navigateur (`accounts.controller.ts`)
# — mais le pipeline Phase 4 tourne côté service IA, sans session HTTP
# utilisateur, d'où ce second chemin par le pont interne.


async def market_memory_context_for(
    user_id: str,
    *,
    ref: str,
    company_name: str,
    website: str | None = None,
    country: str | None = None,
) -> dict[str, Any] | None:
    """Rend le résultat NestJS TEL QUEL (``{"status": "ok", "coverage": {...}}``
    ou ``{"status": "unavailable", ...}``) — ``None`` couvre les trois cas
    « on ne sait pas » que `_post` documente (pont non configuré, réseau en
    échec, réponse non-2xx). C'est à l'appelant (`phase4_plan.py`) de dégrader :
    sans lecture exploitable, le plan et les messages partent SANS bloc mémoire
    marché — jamais un fait inventé à sa place."""
    payload: dict[str, Any] = {"userId": user_id, "ref": ref, "companyName": company_name}
    if website:
        payload["website"] = website
    if country:
        payload["country"] = country
    result = await _post("/internal/copilot/market/context", payload)
    return result if isinstance(result, dict) else None


async def market_alias_domain_for(
    user_id: str,
    *,
    ref: str,
    company_name: str,
    website: str | None = None,
    country: str | None = None,
) -> str | None:
    """#2284.26 (#2978) — le domaine que la mémoire marché peut PROUVER par
    alias pour ce compte (``POST /internal/copilot/market/alias-domain`` →
    ``MarketMemoryService.aliasProvenDomain``, ``matchedOn: 'alias'`` — #1756,
    une équivalence déclarée, ne tranche QUE le silence total des côtés
    domaine/nom). ``None`` couvre les mêmes cas que `market_memory_context_for`
    (pont non configuré, réseau en échec, réponse non-2xx, ou simplement AUCUN
    domaine prouvé) — jamais deviné."""
    payload: dict[str, Any] = {"userId": user_id, "ref": ref, "companyName": company_name}
    if website:
        payload["website"] = website
    if country:
        payload["country"] = country
    result = await _post("/internal/copilot/market/alias-domain", payload)
    domain = result.get("domain") if isinstance(result, dict) else None
    return domain if isinstance(domain, str) and domain else None


# ── #3177.2 / épopée #3225 — LA MÉMOIRE MARCHÉ D'UN GROUPE ───────────────────
#
# L'extension IDENTITÉ DE GROUPE que #3177.2 demandait à `search_market_memory` :
# une entité RACINE (le compte résolu, `company_id`) et ses filiales connues
# (`accounts.subsidiaries`, une donnée RÉELLE, jamais le Facet Ledger de #3178,
# pas encore stabilisé en production). Relayé TEL QUEL vers
# `MarketMemoryService.coverageForGroup` (`market/context-group`) — même
# contrat de transport que `market_memory_context_for` ci-dessus : ``None``
# couvre les trois cas « on ne sait pas ».
#
# Recette prod du 29/09 (#3177/#3225, RÉFUTÉ) — « le groupe La Poste et ses
# filiales » rendait « La mémoire marché n'a pas répondu ». Le contrat (DTO
# zod NestJS) et la logique (`coverageForGroup`, jamais un throw : chaque
# lecture est déjà gardée par son propre try/catch) sont corrects — prouvés
# par un test qui fait passer le corps EXACT construit ci-dessous par le VRAI
# schéma de la DTO (`copilot-bridge.controller.spec.ts`). Le défaut restant :
# `coverageForGroup` fait fan-out sur jusqu'à `MARKET_MEMORY_GROUP_MAX_ENTITIES`
# (6) entités, chacune déclenchant plusieurs lectures Postgres dans
# `coverageFor` (résolution + signal + trois tables observées) — jusqu'à SIX
# FOIS le travail d'une lecture par identité seule
# (`market_memory_context_for`). Cette dernière garde le budget d'UNE lecture
# (`_TIMEOUT_S`, 12 s — pensé pour une boîte mail, voir le docstring de
# `_post`) ; le module réserve déjà un budget plus long pour un fan-out
# comparable (`talent_territory_facts`, `_TERRITORY_TIMEOUT_S` = 30 s pour
# jusqu'à 200 besoins). La lecture de groupe héritait à tort du timeout d'UNE
# lecture — sous la latence Railway → Supabase (eu-west-1) mesurée en
# production, un scope de groupe complet peut la dépasser alors qu'une lecture
# par identité seule ne la dépasse jamais.
_MARKET_MEMORY_GROUP_TIMEOUT_S = 20.0


async def market_memory_context_for_group(
    user_id: str,
    *,
    root_account_id: str,
    entities: list[dict[str, str]],
) -> dict[str, Any] | None:
    """``entities[0]`` EST la racine (``ref``/``companyName``/``website``/
    ``country``, mêmes clés qu'un appel à `market_memory_context_for`). Rend le
    résultat NestJS TEL QUEL (``{"status": "ok", "matches": [...]}`` ou
    ``{"status": "unavailable", ...}``) — c'est à l'appelant de dégrader.

    `timeout_s=_MARKET_MEMORY_GROUP_TIMEOUT_S` : voir le commentaire de tête de
    cette section — un scope de groupe fait jusqu'à 6× le travail d'une
    lecture par identité seule, qui garde, elle, le budget par défaut."""
    payload: dict[str, Any] = {"userId": user_id, "rootAccountId": root_account_id, "entities": entities}
    result = await _post("/internal/copilot/market/context-group", payload, timeout_s=_MARKET_MEMORY_GROUP_TIMEOUT_S)
    return result if isinstance(result, dict) else None


# ── #2987.56 — la file des notes de frais en attente d'une décision ─────────
#
# Jusqu'ici Laura ne savait que naviguer vers `/expenses` (route déclarée dans
# `chat_tools.py`) : aucun outil ne lui disait QUOI y attend une décision, donc
# aucune conversation (vocale ou texte) ne pouvait proposer de valider ou
# refuser une note. Lecture seule, comme tout ce pont : `POST
# /internal/copilot/expenses/pending` (`CopilotBridgeController.expensesPending`)
# gate `finance:write` et retire le montant EN DUR — ce module ne le relit
# donc jamais.


async def expense_reports_pending_decision(user_id: str, *, report_id: str | None = None) -> dict[str, Any] | None:
    """La file des notes SOUMISES (`status: 'pending'`) que l'appelant peut
    décider, sans le montant. `report_id` resserre la file à UNE note déjà
    nommée dans la conversation. `None` = pont non configuré ou en panne —
    l'appelant le traite comme « je ne sais pas », jamais comme une file
    vide."""
    payload: dict[str, Any] = {"userId": user_id}
    if report_id:
        payload["reportId"] = report_id
    result = await _post("/internal/copilot/expenses/pending", payload)
    return result if isinstance(result, dict) else None


# ── #2805 (#2291.3) — DataForge/ORION comme source de CANDIDATS Découvrir ────
#
# SANS `user_id`, à la différence de tout ce qui précède dans ce fichier : les
# fonctions ci-dessus lisent une boîte, un agenda ou un compte au nom d'UN
# utilisateur authentifié ; `OrionAccountsService.searchCandidates` (apps/api)
# est un service AUTONOME qui ne lit qu'une seule table PARTAGÉE — le marché,
# pas le portefeuille d'un espace (même raison que `dataforge.service.ts`,
# GA-16). `DataforgeCandidatesController` (`internal/dataforge/candidates`)
# ne demande donc aucune identité appelante, seulement le secret interne.


async def employer_identity(user_id: str, name: str) -> dict[str, Any] | None:
    """#4419.7 — l'identité (SIREN) d'un employeur nommé par une offre, lue dans NOTRE base : les comptes de l'ESPACE
    de ``user_id`` puis la base commune (`POST /internal/copilot/base/identity`, le lecteur commun). ``None`` = inconnu,
    ambigu, pont éteint ou en échec — l'appelant retombe sur le registre public, jamais sur un SIREN deviné."""
    result = await _post("/internal/copilot/base/identity", {"userId": user_id, "name": name})
    identity = result.get("identity") if isinstance(result, dict) else None
    if isinstance(identity, dict) and len(str(identity.get("siren") or "")) == 9:
        return identity
    return None


async def dataforge_candidates(*, sector: str | None = None, limit: int = 10) -> list[Any] | None:
    """Rend la liste BRUTE (`OrionAccountStatusView[]`, JSON tel quel) que
    `DataforgeCandidatesController` construit. `None` = pont non configuré ou
    en panne — l'appelant (`data_sources/dataforge_candidates.py`) le traite
    comme `[]`, jamais comme une mesure « aucun candidat »."""
    params: dict[str, Any] = {"limit": limit}
    if sector:
        params["sector"] = sector
    result = await _get("/internal/dataforge/candidates", params)
    return result if isinstance(result, list) else None


async def ats_records(
    user_id: str,
    *,
    ending_within_days: int | None = None,
    ended_since_days: int | None = None,
    interviewed_since_days: int | None = None,
) -> dict[str, Any] | None:
    """#4065 — ce que l'ATS branché tient déjà (missions qui se terminent, consultants sans
    mission, besoins ouverts) : l'instantané `AtsService.snapshot`, sans éditeur ni taux.
    #4065.9 — `ended_since_days` / `interviewed_since_days` ouvrent les fenêtres PASSÉES (missions
    terminées, candidats vus en entretien), lues seulement quand on les demande.
    `None` = pont éteint ou en échec — l'appelant le NOMME, jamais « aucune mission »."""
    payload: dict[str, Any] = {"userId": user_id}
    if ending_within_days is not None:
        payload["endingWithinDays"] = ending_within_days
    if ended_since_days is not None:
        payload["endedSinceDays"] = ended_since_days
    if interviewed_since_days is not None:
        payload["interviewedSinceDays"] = interviewed_since_days
    result = await _post("/internal/copilot/ats/records", payload)
    return result if isinstance(result, dict) else None


async def reply_contestations(days: int = 90) -> dict[str, Any] | None:
    """#2899 / #2278.40 — l'agrégat des CONTESTATIONS et CORRECTIONS des réponses de Laura, PAR FONCTION
    (`GET /internal/analytics/reply-contestations`, GA-412 : jamais par personne, ni par espace, ni de contenu).
    `None` = pont éteint ou en échec — l'appelant le NOMME, jamais « aucune correction »."""
    result = await _get("/internal/analytics/reply-contestations", {"days": days})
    return result if isinstance(result, dict) else None


async def chat_eval_samples(limit: int = 100) -> dict[str, Any] | None:
    """#2899 / #2443.10 — les tours de Laura ANONYMISÉS que les espaces ayant coché ont versés
    (`GET /internal/chat-eval-samples`). Texte et date seulement : ni espace ni personne.
    `None` = pont éteint ou en échec — l'appelant le NOMME, jamais « aucun échantillon »."""
    result = await _get("/internal/chat-eval-samples", {"limit": limit})
    return result if isinstance(result, dict) else None
