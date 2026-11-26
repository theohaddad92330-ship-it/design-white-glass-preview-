"""#4055.4 / #4055.6 / #4055.7 — deux outils de LECTURE du chat : « complète ce compte » et le niveau « secteurs ».

* ``complete_account`` — ce qui manque sur UN compte (signaux, besoins, contacts décideurs, organigramme), les
  personnes nommées dans l'organigramme et absentes des contacts, et les collectes PROPOSÉES pour combler. Rien ne
  part seul : c'est une lecture.
* ``get_portfolio_sectors`` — les comptes du portefeuille comptés par secteur.

Le calcul est dans ``account_completion.py`` (pur) ; ici seulement les lectures de ponts. Les helpers de
``laura_dossier_tools`` servent les enveloppes (même convention).
"""

from __future__ import annotations

import asyncio
import re
import unicodedata
from typing import Any

from app.services import account_completion as completion
from app.services.laura_dossier_tools import _envelope, _missing_account_id, _not_found, _owned_account

_CONTACTS_LIMIT = 10
_NEEDS_LIMIT = 50
_SECTOR_PAGE = 25
_SECTOR_MAX_PAGES = 8

COMPLETE_ACCOUNT_TOOL: dict[str, Any] = {
    "name": "complete_account",
    "description": (
        "« Complète ce compte » : lit EN UNE FOIS ce qu'un compte déjà connu porte et ce qui lui MANQUE — "
        "signaux, besoins, contacts décideurs, organigramme — et propose, pour chaque manque, la collecte qui "
        "le comblerait (`proposed_collections`, TOUJOURS `launched: false` : rien ne part sans le geste de la "
        "personne). `missing` = lu et vide ; `not_read` = la source n'a pas répondu (ou sa liste est tronquée) : "
        "c’est une inconnue, jamais « manque » ni « complet » (`complete` ne vaut true que si tout est lu et présent). "
        "`detected_outside_base.people` nomme les personnes citées par l'organigramme et absentes des contacts : "
        "`outside_base` (absentes de la liste complète) ou `to_reconcile` (liste de contacts tronquée, à "
        "rapprocher) ; chacune est PROPOSÉE à l'ajout (`added: false`), jamais ajoutée. À utiliser pour « complète "
        "ce compte », « que manque-t-il sur X ». Lecture seule, bornée au portefeuille de la personne."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "account_id": {"type": "string", "description": "L'identifiant (UUID) du compte à compléter."},
        },
        "required": ["account_id"],
    },
}

GET_PORTFOLIO_SECTORS_TOOL: dict[str, Any] = {
    "name": "get_portfolio_sectors",
    "description": (
        "Le niveau « secteurs » du portefeuille : combien de comptes par secteur (avec quelques exemples), et "
        "combien n'ont aucun secteur renseigné (`without_sector`, à part — jamais fondus dans un secteur ni "
        "comptés « 0 »). `complete: false` = le portefeuille dépasse ce qui a été lu : les effectifs sont ceux "
        "des comptes LUS (`accounts_read`), jamais le total — dis-le. À utiliser pour « quels secteurs couvre "
        "mon portefeuille », « combien de comptes dans la banque ». Lecture seule."
    ),
    "input_schema": {"type": "object", "properties": {}, "required": []},
}

DISMISS_COMPLETION_PERSON_TOOL: dict[str, Any] = {
    "name": "dismiss_completion_person",
    "description": (
        "Retient que la personne ÉCARTE une personne proposée par « complète ce compte » "
        "(`detected_outside_base.people`) : elle ne sera plus reproposée sur ce compte, pour elle seule. À appeler "
        "quand elle dit clairement qu'elle ne veut PAS d'une personne proposée (« pas celui-là », « ignore Marc "
        "Durand »). Une personne qu'elle AJOUTE n'a pas besoin de cet outil : le contact est en base, il ne revient "
        "pas. N'écrit rien dans le CRM ni dans les contacts."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "account_id": {"type": "string", "description": "L'identifiant (UUID) du compte."},
            "full_name": {"type": "string", "description": "Le nom de la personne écartée, tel que proposé."},
        },
        "required": ["account_id", "full_name"],
    },
}

COMPLETION_TOOLS: tuple[dict[str, Any], ...] = (
    COMPLETE_ACCOUNT_TOOL,
    GET_PORTFOLIO_SECTORS_TOOL,
    DISMISS_COMPLETION_PERSON_TOOL,
)
COMPLETION_TOOL_NAMES: frozenset[str] = frozenset(tool["name"] for tool in COMPLETION_TOOLS)


def _fold(text: object) -> str:
    folded = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", folded).strip()


def _count_signals(result: dict[str, Any] | None) -> int | None:
    if not isinstance(result, dict) or result.get("error") or not isinstance(result.get("accounts"), list):
        return None
    total = 0
    for entry in result["accounts"]:
        signals = entry.get("signals") if isinstance(entry, dict) else None
        total += len(signals) if isinstance(signals, list) else 1
    hires = result.get("recentHires")
    if isinstance(hires, dict) and isinstance(hires.get("hires"), list):
        total += len(hires["hires"])
    return total


def _count_needs(result: dict[str, Any] | None, company_name: str) -> int | None:
    if not isinstance(result, dict) or result.get("error") or not isinstance(result.get("data"), list):
        return None
    wanted = _fold(company_name)
    if not wanted:
        return None
    return sum(1 for row in result["data"] if isinstance(row, dict) and _fold(row.get("account_name")) == wanted)


_DISMISSALS_TABLE = "account_completion_dismissals"
_ALL_CONTACTS_LIMIT = 1000


async def _read_dismissed_keys(account_id: str, user_id: str) -> frozenset[str]:
    """#4055.10 — les personnes que CETTE personne a écartées sur CE compte. Une lecture manquée rend vide : au pire
    une proposition revient, jamais une proposition perdue à tort."""
    from app.services.supabase_client import get_supabase

    try:
        res = await (
            get_supabase()
            .table(_DISMISSALS_TABLE)
            .select("name_key")
            .eq("account_id", account_id)
            .eq("user_id", user_id)
            .limit(_ALL_CONTACTS_LIMIT)
            .aexecute()
        )
    except Exception:
        return frozenset()
    rows = getattr(res, "data", None)
    if not isinstance(rows, list):
        return frozenset()
    return frozenset(str(row["name_key"]) for row in rows if isinstance(row, dict) and row.get("name_key"))


async def _read_all_contact_names(account_id: str, user_id: str) -> list[dict[str, Any]] | None:
    """#4055.10 — TOUS les noms de contacts du compte (pas les 10 premiers) : un contact AJOUTÉ après une
    proposition ne doit pas être reproposé parce que la liste lue était tronquée. ``None`` = lecture manquée."""
    from app.services.supabase_client import get_supabase

    try:
        res = await (
            get_supabase()
            .table("contacts")
            .select("full_name")
            .eq("account_id", account_id)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .limit(_ALL_CONTACTS_LIMIT)
            .aexecute()
        )
    except Exception:
        return None
    rows = getattr(res, "data", None)
    if not isinstance(rows, list) or getattr(res, "error", None):
        return None
    return [row for row in rows if isinstance(row, dict)]


async def execute_dismiss_completion_person(tool_input: dict[str, Any], user_id: str) -> dict[str, Any]:
    """#4055.10 — mémorise l'écart d'une personne proposée, par compte et par utilisateur. Idempotent."""
    from app.services.supabase_client import get_supabase

    account_id = str(tool_input.get("account_id") or "").strip()
    if not account_id:
        return _missing_account_id("completion_dismissal")
    full_name = str(tool_input.get("full_name") or "").strip()
    key = completion.name_key(full_name)
    if not key:
        return {
            "error": "Un nom est requis pour écarter une personne.",
            **_envelope("completion_dismissal", "invalid_input", error_code="missing_full_name", step="Précise le nom."),
        }
    account = await _owned_account(account_id, user_id, "id, workspace_id")
    if account is None:
        return _not_found("completion_dismissal")
    sb = get_supabase()
    row = {
        "workspace_id": account.get("workspace_id"),
        "user_id": user_id,
        "account_id": account_id,
        "name_key": key,
        "full_name": full_name[:200],
    }
    res = await sb.table(_DISMISSALS_TABLE).insert(row).aexecute()
    error = str(getattr(res, "error", "") or "")
    # Déjà écartée (clé primaire) : le résultat voulu est atteint, ce n'est pas une erreur.
    if error and "23505" not in error and "duplicate" not in error.lower():
        return {
            "error": "Je n'ai pas pu retenir cet écart.",
            **_envelope("completion_dismissal", "provider_error", error_code="provider_error", step="Réessaie."),
        }
    return {
        "dismissed": True,
        "full_name": full_name,
        "account_id": account_id,
        "note": "Retenu pour toi seul, sur ce compte : cette personne ne te sera plus proposée. Rien d'autre n'est modifié.",
        **_envelope("completion_dismissal", "success"),
    }


async def execute_complete_account(tool_input: dict[str, Any], user_id: str) -> dict[str, Any]:
    from app.services import bellum_api

    account_id = str(tool_input.get("account_id") or "").strip()
    if not account_id:
        return _missing_account_id("account_completion")
    account = await _owned_account(account_id, user_id, "id, company_name")
    if account is None:
        return _not_found("account_completion")
    if not bellum_api.is_configured():
        return {
            "error": "Je n'ai pas accès au dossier de ce compte depuis ici.",
            **_envelope(
                "account_completion",
                "not_covered",
                error_code="bridge_not_configured",
                step="Ouvre la fiche du compte pour voir ce qui lui manque.",
            ),
        }
    company_name = str(account.get("company_name") or "")
    signals, contacts, chart, needs = await asyncio.gather(
        bellum_api.account_signals(user_id, account_id),
        bellum_api.account_contacts(user_id, account_id, limit=_CONTACTS_LIMIT),
        bellum_api.account_org_chart(user_id, account_id),
        bellum_api.find_needs(user_id, query=company_name or None, limit=_NEEDS_LIMIT),
    )

    rows = contacts.get("contacts") if isinstance(contacts, dict) and isinstance(contacts.get("contacts"), list) else None
    truncated = bool(contacts.get("truncated")) if isinstance(contacts, dict) else True
    decision_makers = completion.count_decision_makers(rows) if rows is not None else None
    # Zéro décideur dans une liste TRONQUÉE ne prouve rien : non lu, jamais « manque ».
    if decision_makers == 0 and truncated:
        decision_makers = None
    org_people: list[dict[str, Any]] | None = None
    org_count: int | None = None
    if isinstance(chart, dict) and not chart.get("error"):
        if chart.get("status") == "ok":
            org_people = [p for p in (chart.get("people") or []) if isinstance(p, dict)]
            org_count = len(org_people)
        elif chart.get("status") == "no_graph":
            org_count = 0

    reads = {
        "signals": completion.SourceRead(_count_signals(signals)),
        "needs": completion.SourceRead(_count_needs(needs, company_name)),
        "decision_makers": completion.SourceRead(decision_makers),
        "org_chart": completion.SourceRead(org_count),
    }
    out: dict[str, Any] = {
        "account_id": account.get("id"),
        "company_name": company_name,
        "href": f"/accounts/{account.get('id')}",
        **completion.build_completion(reads),
    }
    if org_people is not None and rows is not None:
        known_rows: list[dict[str, Any]] = [r for r in rows if isinstance(r, dict)]
        contacts_complete = not truncated
        if truncated:
            # #4055.10 — la liste lue est tronquée : on lit TOUS les noms avant de dire qu'une personne manque.
            every = await _read_all_contact_names(account_id, user_id)
            if every is not None:
                known_rows, contacts_complete = every, True
        out["detected_outside_base"] = completion.detected_outside_base(
            org_people,
            known_rows,
            contacts_complete=contacts_complete,
            dismissed=await _read_dismissed_keys(account_id, user_id),
        )
    out["note"] = (
        "Lecture seule : aucune collecte n'est lancée. `not_read` = inconnu, pas « manque ». Propose chaque "
        "collecte de `proposed_collections` et attends le geste de la personne."
    )
    return {**out, **_envelope("account_completion", "success")}


async def execute_get_portfolio_sectors(tool_input: dict[str, Any], user_id: str) -> dict[str, Any]:
    from app.services import bellum_api

    if not bellum_api.is_configured():
        return {
            "error": "Je n'ai pas accès aux comptes de l'espace depuis ici.",
            **_envelope(
                "portfolio_sectors",
                "not_covered",
                error_code="bridge_not_configured",
                step="Ouvre l'écran Comptes pour voir les secteurs.",
            ),
        }
    first = await bellum_api.workspace_accounts(user_id, query=None, sector=None, limit=_SECTOR_PAGE, list_all=True, offset=0)
    if first is None or not isinstance(first.get("accounts"), list):
        return {
            "error": "Le portefeuille n'a pas répondu.",
            **_envelope(
                "portfolio_sectors",
                "provider_error",
                error_code="provider_error",
                step="Réessaie dans un instant.",
            ),
        }
    accounts: list[dict[str, Any]] = [a for a in first["accounts"] if isinstance(a, dict)]
    total = first.get("total") if isinstance(first.get("total"), int) else None
    if total is not None and total > len(accounts):
        offsets = list(range(_SECTOR_PAGE, min(total, _SECTOR_PAGE * _SECTOR_MAX_PAGES), _SECTOR_PAGE))
        pages = await asyncio.gather(
            *(
                bellum_api.workspace_accounts(user_id, query=None, sector=None, limit=_SECTOR_PAGE, list_all=True, offset=o)
                for o in offsets
            )
        )
        for page in pages:
            if page and isinstance(page.get("accounts"), list):
                accounts.extend(a for a in page["accounts"] if isinstance(a, dict))
    # Complet seulement si le total est connu ET entièrement lu (sinon : ce qui a été lu, dit comme tel).
    complete = total is not None and len(accounts) >= total
    out = completion.sector_levels(accounts, complete=complete)
    if total is not None:
        out["portfolio_total"] = total
    if not accounts:
        return {**out, **_envelope("portfolio_sectors", "empty")}
    return {**out, **_envelope("portfolio_sectors", "success")}
