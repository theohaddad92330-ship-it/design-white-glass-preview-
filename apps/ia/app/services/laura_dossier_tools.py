"""LOT (15/10) DATA-B — trois outils de LECTURE : faits publics du cache commun, firmographie, organigramme.

« Laura voit tout ce qu'on a déjà » : ces faits étaient collectés, rangés et affichés sans qu'aucun outil du
chat ne les lise. Ici, trois lectures — AUCUN appel réseau externe :

  · ``get_company_public_facts`` — le cache COMMUN à tous les espaces (``public_facts.peek_fact``) ;
  · ``get_account_firmographics`` — ``accounts.apollo_enrichment`` + ``raw_analysis`` (détecté, dépôts
    publics, filiales) ;
  · ``get_account_org_chart`` — la lecture de l'onglet Organigramme (pont interne NestJS) + le profil de
    registre rangé dans le cache 30 j (``provider_cache.peek_json``).

Les définitions et les exécuteurs vivent ici pour que ``chat_tools.py`` (21 000 lignes) ne grossisse que de
trois lignes d'enregistrement ; les helpers de ``chat_tools`` s'importent À L'APPEL (cycle).
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.services import laura_dossier_reads as reads

logger = logging.getLogger(__name__)

#: Le cache 30 j du profil de registre — même nom que ``pappers.detail._PAPPERS_COMPANY_NS`` (un test
#: épingle l'égalité : une lecture qui ne vise plus la bonne clé rendrait « rien » en silence).
REGISTRY_PROFILE_NAMESPACE = "pappers:company"

_PUBLIC_FACT_NATURES: tuple[str, ...] = ("jobs", "tenders", "legal", "news")
_NATURE_LABELS: dict[str, str] = {
    "jobs": "offres d'emploi",
    "tenders": "appels d'offres",
    "legal": "annonces légales (BODACC)",
    "news": "presse",
}

GET_COMPANY_PUBLIC_FACTS_TOOL: dict[str, Any] = {
    "name": "get_company_public_facts",
    "description": (
        "Lit ce que la BASE COMMUNE a DÉJÀ rangé de PUBLIC sur une entreprise : offres d'emploi, appels "
        "d'offres, annonces légales (BODACC) et presse — par SIREN, par nom d'un compte de l'utilisateur, "
        "ou par site. LECTURE SEULE du cache : aucune recherche n'est lancée. "
        "Chaque nature rend son état : `cached` (des faits datés, à citer avec leur date), `searched_nothing` "
        "(cherché, rien trouvé — ce n'est pas « n'existe pas ») ou `not_collected` (jamais collecté ou "
        "périmé — INCONNU, jamais « aucun »). Un état vide se DIT tel quel et se propose de compléter "
        "(analyse ou Découvrir), il ne s'invente jamais ; ne cite jamais le nom d'un fournisseur de données. "
        "À utiliser pour « qu'est-ce qu'on sait de public sur X », « X recrute-t-elle », « y a-t-il un appel "
        "d'offres chez X »."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "siren": {"type": "string", "description": "Le SIREN (9 chiffres) de l'entreprise, s'il est connu."},
            "company_name": {
                "type": "string",
                "description": "Le nom d'un compte du portefeuille de l'utilisateur (sert à retrouver son SIREN ou son site).",
            },
            "domain": {"type": "string", "description": "Le site de l'entreprise (ex. exemple.fr), à défaut de SIREN."},
        },
        "required": [],
    },
}

GET_ACCOUNT_FIRMOGRAPHICS_TOOL: dict[str, Any] = {
    "name": "get_account_firmographics",
    "description": (
        "Lit la FIRMOGRAPHIE déjà collectée sur UN compte de l'utilisateur : effectif (estimation et tranche), "
        "année de création, secteur, chiffre d'affaires et financement tels que publiés (avec le stade et la "
        "date du dernier tour), répartition de l'effectif par département, technologies détectées, activité "
        "publique d'ingénierie (dépôts publics, langages) et filiales. LECTURE SEULE du dossier : aucune "
        "collecte. Une rubrique absente n'apparaît pas — ne l'invente pas et ne la remplace "
        "jamais par « 0 » ; une croissance que le dossier ne donne pas ne se calcule pas. Ne cite jamais le nom "
        "d'un fournisseur de données. À utiliser pour « quelle taille fait X », « X a-t-elle levé des fonds », "
        "« quelle stack chez X »."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "account_id": {"type": "string", "description": "L'identifiant (UUID) du compte."},
        },
        "required": ["account_id"],
    },
}

GET_ACCOUNT_ORG_CHART_TOOL: dict[str, Any] = {
    "name": "get_account_org_chart",
    "description": (
        "Lit l'ORGANIGRAMME déjà construit d'UN compte — la même carte que l'onglet Organigramme (sans les "
        "personnes écartées) : entités, personnes (fonction, niveau, rôles d'achat, statut d'identité), liens "
        "hiérarchiques VÉRIFIÉS, comité d'achat, chemin d'entrée recommandé — plus, quand il est déjà en "
        "mémoire, le profil de registre (dirigeants, filiales, société mère). LECTURE SEULE : aucune collecte. "
        "Les liens supposés ne sont comptés que (`inferred_lines`), jamais présentés comme "
        "des faits ; `people_not_shown` dit combien de personnes la bulle ne montre pas (la carte complète "
        "est sur l'écran). Sans graphe stocké, DIS-le (`no_graph`) et propose d'enrichir l'organigramme — "
        "n'en dessine jamais un. À utiliser pour « qui décide chez X », « qui est le N+1 de Y », « par qui "
        "entrer chez X »."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "account_id": {"type": "string", "description": "L'identifiant (UUID) du compte."},
        },
        "required": ["account_id"],
    },
}

LAURA_DOSSIER_TOOLS: list[dict[str, Any]] = [
    GET_COMPANY_PUBLIC_FACTS_TOOL,
    GET_ACCOUNT_FIRMOGRAPHICS_TOOL,
    GET_ACCOUNT_ORG_CHART_TOOL,
]
LAURA_DOSSIER_TOOL_NAMES: frozenset[str] = frozenset(tool["name"] for tool in LAURA_DOSSIER_TOOLS)


def _envelope(result_type: str, status_name: str, *, error_code: str | None = None, step: str | None = None) -> dict[str, Any]:
    from app.models.tool_result_envelope import ToolResultEnvelope, ToolResultStatus, error_envelope

    status = ToolResultStatus(status_name)
    if error_code:
        return error_envelope(
            status=status, result_type=result_type, error_code=error_code, suggested_next_step=step or ""
        ).to_wire()
    return ToolResultEnvelope(
        status=status,
        result_type=result_type,
        sources_consulted=["bellum_workspace"],
        sources_succeeded=["bellum_workspace"],
    ).to_wire()


async def _owned_account(account_id: str, user_id: str, columns: str = "*") -> dict[str, Any] | None:
    from fastapi import HTTPException

    from app.services.ownership import fetch_owned_account
    from app.services.supabase_client import get_supabase

    try:
        return await fetch_owned_account(get_supabase(), account_id, user_id, columns=columns)
    except HTTPException:
        return None


def _not_found(result_type: str) -> dict[str, Any]:
    # Même décision que #2852.34 : `empty`, jamais un statut distinct qui révélerait qu'un compte étranger existe.
    return {"error": "Compte introuvable dans votre portefeuille.", **_envelope(result_type, "empty")}


def _missing_account_id(result_type: str) -> dict[str, Any]:
    return {
        "error": "Un identifiant de compte est requis.",
        **_envelope(
            result_type, "invalid_input", error_code="missing_account_id", step="Précise l'identifiant du compte, puis relance."
        ),
    }


async def _resolve_company_key(tool_input: dict[str, Any], user_id: str) -> tuple[str | None, str | None, dict[str, Any] | None]:
    """``(clé d'entreprise, nom affiché, réponse d'arrêt)``. Le SIREN donné gagne ; sinon le nom d'un compte
    POSSÉDÉ (jamais le plus proche : deux candidats ⇒ une question) ; sinon le site donné."""
    from app.services import public_facts

    siren = re.sub(r"\D", "", str(tool_input.get("siren") or ""))
    domain = str(tool_input.get("domain") or "").strip()
    company_name = str(tool_input.get("company_name") or "").strip()[:200]
    display = company_name or None

    if not public_facts.company_fact_key(siren=siren) and company_name:
        from app.services.chat_tools import _accounts_named_like, _need_compiler

        candidates = await _accounts_named_like(company_name, user_id)
        resolved = _need_compiler.resolve_account(company_name, candidates)
        if resolved["account_id"]:
            account = await _owned_account(str(resolved["account_id"]), user_id, "id, company_name, siren, website")
            if account:
                siren = siren or re.sub(r"\D", "", str(account.get("siren") or ""))
                domain = domain or str(account.get("website") or "")
                display = str(account.get("company_name") or company_name)
        elif candidates:
            shown = (
                [c for c in candidates if str(c.get("id")) in resolved["candidate_ids"]]
                if resolved["ambiguous"]
                else candidates
            )[:5]
            return (
                None,
                None,
                {
                    "needs_precision": True,
                    "error": f"Plusieurs comptes ressemblent à « {company_name} » : demande lequel, ne choisis pas.",
                    "candidates": [
                        {"account_id": str(c["id"]), "company_name": str(c.get("company_name") or "")} for c in shown
                    ],
                },
            )
    return public_facts.company_fact_key(siren=siren, domain=domain), display, None


async def execute_get_company_public_facts(tool_input: dict[str, Any], user_id: str) -> dict[str, Any]:
    """LOT (15/10) DATA-B.2 — lecture SEULE du cache commun : ``peek_fact``, jamais ``cached_fact`` ni un fetch."""
    from app.services import provider_cache, public_facts

    key, display, stop = await _resolve_company_key(tool_input, user_id)
    if stop:
        return stop
    if not key:
        return {
            "error": "Il me faut un SIREN, un site ou le nom d'un compte du portefeuille pour lire la base commune.",
            **_envelope(
                "company_public_facts",
                "not_covered",
                error_code="no_company_key",
                step="Demande le SIREN ou le site de l'entreprise, ou ouvre son compte.",
            ),
        }
    if not await provider_cache.cache_available():
        return {
            "error": "La base commune n'est pas lisible depuis ici pour le moment.",
            **_envelope(
                "company_public_facts",
                "not_covered",
                error_code="cache_unavailable",
                step="Réessaie plus tard, ou lance une analyse du compte.",
            ),
        }

    facts: dict[str, Any] = {}
    for nature in _PUBLIC_FACT_NATURES:
        if nature == "jobs":
            peeked = [
                await public_facts.peek_fact("jobs", key, public_facts.jobs_fact_variant(source, "esn_it", False))
                for source in public_facts.JOBS_SOURCES
            ]
            rows = [row for hit in peeked if hit for row in hit]
            seen_any = any(hit is not None for hit in peeked)
            seen: set[tuple[Any, Any]] = set()
            deduped: list[dict] = []
            for row in rows:
                marker = (row.get("title"), row.get("date") or row.get("published_at"))
                if marker not in seen:
                    seen.add(marker)
                    deduped.append(row)
            rows = deduped
        else:
            hit = await public_facts.peek_fact(nature, key, "esn_it" if nature == "tenders" else "")
            seen_any = hit is not None
            rows = hit or []
        items, total = reads.project_fact_rows(nature, rows)
        entry: dict[str, Any] = {"label": _NATURE_LABELS[nature]}
        if items:
            entry.update(state="cached", items=items)
            if total > len(items):
                entry["total"] = total
        else:
            entry["state"] = "searched_nothing" if seen_any else "not_collected"
        facts[nature] = entry

    freshness_days = {nature: public_facts.FRESHNESS_S[nature] // 86400 for nature in _PUBLIC_FACT_NATURES}
    status = "success" if any(f["state"] == "cached" for f in facts.values()) else "empty"
    return {
        **({"company_name": display} if display else {}),
        "company_key": key.split(":", 1)[0],
        "facts": facts,
        "freshness_days": freshness_days,
        "note": (
            "Lecture du cache commun, sans aucune recherche. `not_collected` = inconnu (jamais collecté ou "
            "périmé), pas « aucun » ; `searched_nothing` = cherché, rien trouvé."
        ),
        **_envelope("company_public_facts", status),
    }


async def execute_get_account_firmographics(tool_input: dict[str, Any], user_id: str) -> dict[str, Any]:
    """LOT (15/10) DATA-B.3 — la firmographie du dossier, présent-seulement."""
    from app.services.chat_tools import _account_as_of

    account_id = str(tool_input.get("account_id") or "").strip()
    if not account_id:
        return _missing_account_id("account_firmographics")
    account = await _owned_account(account_id, user_id)
    if account is None:
        return _not_found("account_firmographics")
    block = reads.firmographics_block(account)
    out: dict[str, Any] = {"account_id": account.get("id"), "company_name": account.get("company_name"), **block}
    as_of = _account_as_of(account)
    if as_of:
        out["as_of"] = as_of
    if not block:
        out["note"] = "Aucune donnée de firmographie n'est collectée sur ce compte pour l'instant — ne la devine pas."
        return {**out, **_envelope("account_firmographics", "empty")}
    return {**out, **_envelope("account_firmographics", "success")}


async def execute_get_account_org_chart(tool_input: dict[str, Any], user_id: str) -> dict[str, Any]:
    """LOT (15/10) DATA-B.4 — l'organigramme du dossier (pont NestJS) + le registre en cache (peek)."""
    from app.services import bellum_api, provider_cache

    account_id = str(tool_input.get("account_id") or "").strip()
    if not account_id:
        return _missing_account_id("account_org_chart")
    account = await _owned_account(account_id, user_id, "id, company_name, siren")
    if account is None:
        return _not_found("account_org_chart")
    if not bellum_api.is_configured():
        return {
            "error": "Je n'ai pas accès à l'organigramme de ce compte depuis ici.",
            **_envelope(
                "account_org_chart",
                "not_covered",
                error_code="bridge_not_configured",
                step="Ouvre l'onglet Organigramme du compte.",
            ),
        }
    chart = await bellum_api.account_org_chart(user_id, account_id)
    if chart is None:
        return {
            "error": "L'organigramme de ce compte n'a pas répondu.",
            **_envelope(
                "account_org_chart",
                "provider_error",
                error_code="provider_error",
                step="Réessaie dans un instant.",
            ),
        }
    if chart.get("error"):
        return _not_found("account_org_chart")

    out: dict[str, Any] = {"account_id": account.get("id"), "company_name": account.get("company_name")}
    out["href"] = f"/accounts/{account.get('id')}"
    if chart.get("status") == "ok":
        out["org_chart"] = {k: v for k, v in chart.items() if k != "status"}
    else:
        out["org_chart_status"] = "no_graph"

    # Le registre : lecture du cache 30 j (``peek_json``), JAMAIS un appel — absent ⇒ rien n'est dit.
    siren = re.sub(r"\D", "", str(account.get("siren") or ""))
    if len(siren) == 9:
        for suffix in ("1", "0"):
            cached = await provider_cache.peek_json(REGISTRY_PROFILE_NAMESPACE, f"{siren}:{suffix}")
            registry = reads.registry_block(cached if isinstance(cached, dict) else None)
            if registry:
                out["registry"] = registry
                break

    if "org_chart" not in out and "registry" not in out:
        out["note"] = (
            "Aucun organigramme n'est stocké pour ce compte et aucun profil de registre n'est en mémoire : "
            "dis-le, ne dessine rien, et propose d'enrichir l'organigramme."
        )
        return {**out, **_envelope("account_org_chart", "empty")}
    return {**out, **_envelope("account_org_chart", "success")}
