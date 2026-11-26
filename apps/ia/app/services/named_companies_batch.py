"""#4462 — une LISTE d'entreprises nommées, analysées d'office dans le même tour.

Retour Exteam (22/10/2026) : un commercial colle quinze noms absents de son espace ; Laura répondait
« aucun compte » puis « Je poursuis sur le reste. » sans rien lancer — `start_account_analysis` portait
« UNE entreprise à la fois ». Décisions Louis 22/10 :

1. Cascade : chaque nom est cherché d'abord dans l'espace (réutilisé, zéro débit) ; chaque nom ABSENT est
   résolu au registre public, puis son analyse PART D'OFFICE, sans question ni carte (D1 renversée #2723,
   « Laura agit » #4433). Ce lot n'est PAS un second chemin d'analyse : il appelle, nom par nom, les deux
   mêmes portes que `plan_account_analysis` → `start_account_analysis` (`bellum_api`, jeton serveur).
2. Plafond : 20 noms par message ; au-delà, les noms se NOMMENT (« renvoie-les ensuite »).
3. Solde insuffisant : on lance, dans l'ordre de la liste, ce que le solde couvre ; le reste se nomme avec un
   frein doux SANS chiffre — crédits implicites (épopée #4468) : rien de ce que rend ce lot ne porte un
   nombre de crédits ni un solde.
4. Résolution nom → registre : `resolve_company_identity` (recherche-entreprises + barème des homonymes, le
   même registre que `GET /companies/search` derrière `IaClient.searchCompanies`). Homonyme, introuvable ou
   registre muet : NOMMÉ, jamais lancé au hasard, jamais tu.
5. Liste mixte : connus et lancés sortent dans deux listes distinctes.
"""

from __future__ import annotations

import asyncio
import contextlib
import re
import time
import unicodedata
from typing import Any

from app.services.homonym_disambiguation import HIGH_NAME, name_similarity, normalize_company_name

TOOL_NAME = "analyze_named_companies"

# #4462.2 — décision Louis 22/10 : 20 noms par message.
MAX_NAMED_COMPANIES = 20

# Largeur des appels simultanés vers le pont et le registre — même ordre de grandeur que
# `_TOOL_FANOUT_LIMIT` (chat_orchestrator) : quinze noms ne deviennent jamais soixante appels d'un coup.
_FANOUT = 4

# Le tour entier tient en 90 s (`CHAT_TURN_BUDGET_S`) : passé ce délai, aucun lancement NEUF ne part
# (un lancement coupé en vol serait un état inconnu) — les noms restants se NOMMENT.
_LAUNCH_DEADLINE_S = 55.0

# Une fonction visée côté IT (« DSI », « IT », « digital ») cadre un grand groupe sur `it_digital`
# plutôt que de le laisser sans périmètre (#3434 : jamais le groupe entier en silence).
_IT_FUNCTION = re.compile(r"\b(?:dsi|it|si|informatique|digital|numerique|data|cio|cto|systemes? d'information)\b")

# Codes de refus du lancement qui disent « le solde ne couvre pas » — leur message porte des chiffres
# (« 40 sur 40 consommés ») : on ne le relaie jamais, la phrase est celle du frein doux.
_BALANCE_REFUSALS = frozenset({"quota_exceeded", "budget_exceeded", "analysis_http_402", "insufficient_credits"})


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _clean_names(raw: object) -> list[str]:
    """Les noms tels que cités, dans l'ordre, sans vide ni doublon (casse et espaces ignorés)."""
    if not isinstance(raw, list):
        return []
    seen: set[str] = set()
    names: list[str] = []
    for item in raw:
        name = " ".join(str(item or "").split())
        key = normalize_company_name(name)
        if not name or not key or key in seen:
            continue
        seen.add(key)
        names.append(name)
    return names


def scope_for(function: str | None, scope_mode: str | None, allowed: tuple[str, ...]) -> str | None:
    if scope_mode in allowed:
        return scope_mode
    if function and _IT_FUNCTION.search(_fold(function)):
        return "it_digital"
    return None


def _workspace_match(name: str, result: dict[str, Any] | None) -> dict[str, Any] | None:
    accounts = result.get("accounts") if isinstance(result, dict) else None
    for account in accounts if isinstance(accounts, list) else []:
        if not isinstance(account, dict):
            continue
        if name_similarity(name, account.get("company_name") or "") >= HIGH_NAME:
            return account
    return None


def _candidate_label(candidate: Any) -> str:
    name = str(getattr(candidate, "name", "") or "").strip()
    city = str(getattr(candidate, "city", "") or "").strip()
    return f"{name} ({city})" if name and city else name


def _refusal_code(result: dict[str, Any]) -> str:
    return str(result.get("error_code") or result.get("error") or "")


async def run_batch(
    user_id: str,
    names_input: object,
    *,
    function: str | None,
    scope_mode: str | None,
    allowed_scope_modes: tuple[str, ...],
    not_launched_because: dict[str, str],
) -> dict[str, Any]:
    from app.services import bellum_api
    from app.services.research import homonym

    names = _clean_names(names_input)
    if not names:
        return {"error": "Donne-moi au moins un nom d'entreprise à analyser."}
    if not bellum_api.is_configured():
        return {"error": "Je ne peux pas lancer d'analyse d'ici pour le moment : rien n'est lancé."}

    batch, beyond_cap = names[:MAX_NAMED_COMPANIES], names[MAX_NAMED_COMPANIES:]
    scope = scope_for(function, scope_mode, allowed_scope_modes)
    gate = asyncio.Semaphore(_FANOUT)
    started_at = time.monotonic()

    # ── 1. L'espace d'abord, puis le registre pour les absents (lectures, en parallèle borné) ───
    async def lookup(name: str) -> tuple[str, dict[str, Any] | None, Any]:
        async with gate:
            found = _workspace_match(
                name, await bellum_api.workspace_accounts(user_id, query=name, sector=None, limit=5)
            )
            if found is not None:
                return name, found, None
            try:
                resolution = await homonym.resolve_company_identity(name, strict=True)
            except Exception:  # noqa: BLE001 — registre muet : NOMMÉ, jamais « introuvable »
                resolution = None
            return name, None, resolution

    looked_up = await asyncio.gather(*(lookup(name) for name in batch))

    known: list[dict[str, Any]] = []
    ambiguous: list[dict[str, Any]] = []
    not_found: list[str] = []
    registry_unavailable: list[str] = []
    resolved: list[tuple[str, str | None]] = []
    for name, account, resolution in looked_up:
        if account is not None:
            known.append(
                {
                    "company": name,
                    "account_name": account.get("company_name"),
                    "account_id": account.get("account_id"),
                    "last_analyzed_at": account.get("last_analyzed_at"),
                }
            )
        elif resolution is None:
            registry_unavailable.append(name)
        elif resolution.status in ("unique", "selected", "locked") and resolution.selected_siren:
            resolved.append((name, resolution.selected_siren))
        elif resolution.status == "ambiguous":
            labels = [label for label in (_candidate_label(c) for c in resolution.candidates[:3]) if label]
            ambiguous.append({"company": name, "candidates": labels})
        else:
            not_found.append(name)

    # ── 2. Préparer (ne débite rien) — le même pont que `plan_account_analysis` ──────────────────
    async def plan(name: str) -> dict[str, Any] | None:
        async with gate:
            return await bellum_api.plan_account_analysis(user_id, company=name)

    plans = await asyncio.gather(*(plan(name) for name, _siren in resolved))

    # ── 3. Ce que le solde couvre, DANS L'ORDRE de la liste ──────────────────────────────────────
    not_launched: list[dict[str, str]] = []
    held_back: list[str] = []
    scope_required: list[str] = []
    to_start: list[tuple[str, str | None, dict[str, Any]]] = []
    budget: int | None = None
    for (name, siren), prepared in zip(resolved, plans, strict=True):
        if not isinstance(prepared, dict) or prepared.get("error"):
            why = str((prepared or {}).get("message") or (prepared or {}).get("error") or "préparation sans réponse")
            if _refusal_code(prepared or {}) in _BALANCE_REFUSALS:
                held_back.append(name)
            else:
                not_launched.append({"company": name, "why": why})
            continue
        if prepared.get("scopeGuardrail") and not scope:
            scope_required.append(name)
            continue
        cost = prepared.get("costCredits")
        if budget is None and isinstance(prepared.get("creditsLeft"), int):
            budget = prepared["creditsLeft"]
        if budget is not None and isinstance(cost, int):
            if cost > budget:
                held_back.append(name)
                continue
            budget -= cost
        to_start.append((name, siren, prepared))

    # ── 4. Lancer — la même porte que `start_account_analysis`, jeton de SA préparation ──────────
    launched: list[dict[str, Any]] = []
    out_of_time: list[str] = []

    async def start(name: str, siren: str | None, prepared: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
        async with gate:
            if time.monotonic() - started_at > _LAUNCH_DEADLINE_S:
                return name, {"_out_of_time": True}
            return name, await bellum_api.start_account_analysis(
                user_id,
                company=name,
                plan_token=str(prepared.get("planToken") or ""),
                preset=str(prepared.get("preset") or "") or None,
                siren=siren,
                **({"scope_mode": scope} if scope else {}),
            )

    for name, result in await asyncio.gather(*(start(*item) for item in to_start)):
        if isinstance(result, dict) and result.get("_out_of_time"):
            out_of_time.append(name)
        elif not isinstance(result, dict):
            not_launched.append({"company": name, "why": "le lancement n'a pas répondu — vérifie l'écran Comptes"})
        elif result.get("error"):
            if _refusal_code(result) in _BALANCE_REFUSALS:
                held_back.append(name)
            else:
                not_launched.append({"company": name, "why": str(result.get("message") or result["error"])})
        elif result.get("launched") is False:
            # Un dossier frais réutilisé par le serveur (`cache_hit`) n'est pas une analyse en cours.
            known.append(
                {
                    "company": name,
                    "account_id": result.get("accountId"),
                    "why": not_launched_because.get(str(result.get("reason") or ""), "aucun run neuf lancé"),
                }
            )
        else:
            launched.append({"company": name, "account_id": result.get("accountId")})

    # #4462.9 — Laura DÉCLARE le lot : l'API poste le classement « par où commencer » quand la DERNIÈRE analyse
    # se termine, sans relance manuelle. Best-effort : une déclaration perdue ne défait jamais un lancement.
    running = [str(row["account_id"]) for row in launched if row.get("account_id")]
    if running:
        known_ids = [str(row["account_id"]) for row in known if row.get("account_id")]
        with contextlib.suppress(Exception):
            await bellum_api.follow_analysis_batch(user_id, running, known_ids)

    order = {name: index for index, name in enumerate(batch)}
    held_back.sort(key=lambda n: order.get(n, 0))
    known.sort(key=lambda row: order.get(row["company"], 0))

    out: dict[str, Any] = {
        "requested": len(names),
        "launched": launched,
        "known": known,
        "ambiguous": ambiguous,
        "not_found": not_found,
        "registry_unavailable": registry_unavailable,
        "not_launched": not_launched,
        "held_back": held_back,
        "scope_required": scope_required,
        "out_of_time": out_of_time,
    }
    if beyond_cap:
        out["beyond_cap"] = beyond_cap
    if scope:
        out["scope_mode"] = scope
    out["model_directive"] = _directive(out, function=function)
    return out


def _names(values: list[Any]) -> str:
    return ", ".join(str(v.get("company") if isinstance(v, dict) else v) for v in values)


def _directive(out: dict[str, Any], *, function: str | None) -> str:
    """Ce que la réponse dit, groupe par groupe — et ce qu'elle ne dit jamais."""
    lines: list[str] = []
    launched = out["launched"]
    if launched:
        lines.append(
            f"{len(launched)} analyse{'s' if len(launched) > 1 else ''} PARTIE{'S' if len(launched) > 1 else ''} "
            f"ce tour : {_names(launched)}. Chaque dossier arrive sur la fiche du compte dans quelques minutes : "
            "dis-le en une phrase, et que la personne revienne d'ici un quart d'heure pour le classement « par où "
            "commencer » sur les interlocuteurs réellement trouvés."
        )
    else:
        lines.append("Aucune analyse n'est partie ce tour : ne dis jamais qu'une analyse est en cours.")
    if out["known"]:
        lines.append(
            f"Déjà dans ton espace, réutilisés sans nouvelle analyse : {_names(out['known'])} — sépare-les "
            "clairement des analyses lancées."
        )
    if out["ambiguous"]:
        detail = "; ".join(f"{row['company']} ({' / '.join(row['candidates'])})" for row in out["ambiguous"])
        lines.append(f"Homonymes au registre, rien n'est lancé : {detail} — demande laquelle, en une phrase.")
    if out["not_found"]:
        lines.append(f"Introuvables au registre public, rien n'est lancé : {_names(out['not_found'])}.")
    if out["registry_unavailable"]:
        lines.append(
            f"Registre public injoignable pour : {_names(out['registry_unavailable'])} — rien n'est lancé pour "
            "eux, renvoie-les dans un instant."
        )
    if out["scope_required"]:
        lines.append(
            f"Grands groupes sans périmètre, rien n'est lancé sur le groupe entier : {_names(out['scope_required'])}"
            " — demande la direction, la filiale ou le site visé."
        )
    if out["not_launched"]:
        detail = "; ".join(f"{row['company']} ({row['why']})" for row in out["not_launched"])
        lines.append(f"Non lancées, avec leur vraie raison : {detail}.")
    if out["held_back"]:
        lines.append(
            # #4462.3 — frein doux (#4464) : pas de solde, pas de chiffre, jamais « recharger ».
            f"Pas lancées, tu as beaucoup utilisé Bellum ce mois-ci : {_names(out['held_back'])} — nomme-les, "
            "dis « on en parle ? » et propose d'écrire à l'équipe Bellum ; jamais de chiffre, rien à acheter."
        )
    if out["out_of_time"]:
        lines.append(f"Pas encore lancées faute de temps dans ce tour : {_names(out['out_of_time'])} — renvoie-les.")
    if out.get("beyond_cap"):
        lines.append(
            f"Au-delà de {MAX_NAMED_COMPANIES} noms par message, non traités : dis « je garde pour le message "
            f"suivant : {_names(out['beyond_cap'])} » — #4462.2, renvoie-les ensuite."
        )
    if function:
        lines.append(
            f"Contacts « {function} » : au retour de chaque analyse, ils se lisent sur la fiche du compte "
            "(`get_account_contacts`) ; pour un compte déjà dans l'espace, lis-les dès maintenant. Si une "
            f"analyse en rend trop peu, `propose_people_search` sur l'expertise « {function} »."
        )
    lines.append(
        "Ne cite JAMAIS un nombre de crédits ni un solde. N'écris jamais « Je poursuis sur le reste. » ni "
        "« relance la même demande », et ne dis jamais qu'un outil est indisponible ou « sera disponible » : "
        "tout ce qui pouvait partir est parti. N'appelle pas `start_account_analysis` pour ces noms."
    )
    return " ".join(lines)
