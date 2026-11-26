"""#2276 — le job composite de Laura, côté service IA.

Une demande complexe (plusieurs capacités, plusieurs cibles) ne se simule pas
dans une réponse texte (#2276.2) et ne se réduit pas à un raccourci du type
« ouvre Découvrir » (#2276.63). Laura pose une FICHE de job avec
``plan_laura_job`` : intention, résultat attendu, périmètre, hypothèses, étapes
et leurs dépendances. L'outil ne fait RIEN — il ne lit rien, ne lance rien, ne
débite rien. L'API persiste la fiche en job « À confirmer »
(``LauraJobService.proposeFromTurn``), tire le coût maximum de la grille unique,
et c'est un clic humain qui décidera de la suite.

Ce que la fiche parle : la langue du CONTRAT (``packages/contracts/src/schemas/
laura-job.ts``, camelCase), parce que c'est lui qui la valide. Le modèle ne fixe
ni coût, ni état d'étape, ni résultat — ces champs n'existent pas dans l'outil.
La demande originale (#2276.3) est le message de la personne, VERBATIM, posé par
``laura_job_of_turn`` — jamais une reformulation du modèle.
"""

from __future__ import annotations

import re
from typing import Any

LAURA_JOB_TOOL_NAME = "plan_laura_job"

# Le statut de sortie : rien n'est fait, une fiche est posée. L'orchestrateur la
# reconnaît sans la confondre avec une proposition de carte ni un travail fait.
LAURA_JOB_STATUS = "laura_job"

# Les capacités d'une étape — le MÊME ensemble, dans le même ordre, que
# `lauraJobCapabilitySchema` (garde : `test_capabilities_match_the_typescript_contract`).
LAURA_JOB_CAPABILITIES: dict[str, str] = {
    "read_workspace": "lire les données de l'espace (comptes, contacts, pipeline, missions)",
    "search_market_memory": "chercher dans les observations du marché (entreprises, signaux)",
    "account_analysis": "analyser un compte en profondeur (payant, par compte)",
    "account_refresh": "actualiser un dossier déjà analysé (payant, par compte)",
    "contact_enrichment": "retrouver les coordonnées d'une personne (payant, par contact)",
    "message_generation": "préparer un message (jamais envoyé par Laura)",
    "need_matching": "classer le vivier contre un besoin",
    "territory_snapshot": "photographier un territoire",
    "crm_write": "écrire dans le CRM du client (validation humaine toujours exigée)",
}

_STEP_KEY = re.compile(r"^[a-z0-9_]{1,40}$")
# #3860.1 — les formes du filtre d'étape, MIROIR de `lauraJobStepCriteriaSchema` (contrat TS).
_REGION = re.compile(r"^\d{2}$")
_DEPARTMENT = re.compile(r"^(2A|2B|\d{2,3})$")
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.IGNORECASE)
_MAX_STEPS = 20
_MAX_UNITS = 500

LAURA_JOB_TOOL: dict[str, Any] = {
    "name": LAURA_JOB_TOOL_NAME,
    "description": (
        "Pour une demande COMPLEXE — plusieurs capacités à enchaîner, ou beaucoup de cibles "
        "(par exemple « analyse les 20 filiales et trouve 50 décideurs ») — n'essaie pas de tout "
        "faire dans ta réponse et ne la réduis pas à un raccourci : pose un JOB avec cet outil. "
        "Il ne lance RIEN et ne débite rien : il enregistre la fiche (intention, résultat attendu, "
        "périmètre, hypothèses, étapes et dépendances) que l'utilisateur confirme avant tout "
        "travail payant. Le coût est calculé par Bellum, jamais par toi. Une demande simple (une "
        "lecture, un geste) ne passe PAS par ici. Après l'appel, annonce le plan comme une "
        "proposition à confirmer, jamais comme un travail fait."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "intent": {"type": "string", "description": "Ce qu'il faut obtenir, en une phrase."},
            "expected_outcome": {"type": "string", "description": "À quoi ressemble le travail fini."},
            "scope": {
                "type": "object",
                "properties": {
                    "description": {"type": "string", "description": "Sur quoi porte le job, en une phrase."},
                    "account_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Identifiants de comptes DÉJÀ lus dans ce fil. Jamais un identifiant deviné.",
                    },
                    "contact_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Identifiants de contacts DÉJÀ lus dans ce fil. Jamais un identifiant deviné.",
                    },
                },
                "required": ["description"],
            },
            "assumptions": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Ce que tu supposes sans l'avoir vérifié. Vide si rien.",
            },
            "steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "key": {"type": "string", "description": "Clé courte : minuscules, chiffres, _."},
                        "label": {"type": "string", "description": "Ce que fait l'étape, en une phrase."},
                        "capability": {"type": "string", "enum": list(LAURA_JOB_CAPABILITIES)},
                        "units": {"type": "integer", "description": "Nombre de cibles traitées (défaut 1)."},
                        "depends_on": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Clés d'étapes DÉCLARÉES PLUS HAUT dont celle-ci a besoin.",
                        },
                        "requires_approval": {"type": "boolean"},
                        # #3860.1 — le filtre OBLIGATOIRE de certaines capacités : sans lui, l'étape ne part pas.
                        "criteria": {
                            "type": "object",
                            "description": (
                                "Le filtre de l'étape. OBLIGATOIRE pour search_market_memory (technology, location, "
                                "region ou department), need_matching (need_id, lu dans ce fil) et "
                                "territory_snapshot (department). Jamais une valeur devinée."
                            ),
                            "properties": {
                                "technology": {"type": "string"},
                                "location": {"type": "string"},
                                "region": {"type": "string", "description": "Code officiel de région (ex. « 76 »)."},
                                "department": {
                                    "type": "string",
                                    "description": "Code département (ex. « 31 », « 2A »).",
                                },
                                "need_id": {
                                    "type": "string",
                                    "description": "Identifiant du besoin, DÉJÀ lu dans ce fil.",
                                },
                            },
                        },
                    },
                    "required": ["key", "label", "capability"],
                },
                "description": f"Les étapes, dans l'ordre, {_MAX_STEPS} au plus.",
            },
            "sources": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Les sources que le job lira, nommées comme l'utilisateur les connaît.",
            },
            "estimated_duration_seconds": {
                "type": "integer",
                "description": "Durée prévue en secondes, seulement si tu as une base pour l'estimer.",
            },
        },
        "required": ["intent", "expected_outcome", "scope", "steps"],
    },
}


def _text(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit] if isinstance(value, str) else ""


def _texts(value: Any, limit: int, count: int) -> list[str]:
    if not isinstance(value, list):
        return []
    return [text for text in (_text(item, limit) for item in value) if text][:count]


def _criteria(value: Any) -> dict[str, str]:
    """#3860.1 — le filtre d'une étape dans la forme du contrat ; un champ mal formé est écarté, jamais deviné."""
    raw = value if isinstance(value, dict) else {}
    out: dict[str, str] = {}
    for key, limit in (("technology", 80), ("location", 120)):
        text = _text(raw.get(key), limit)
        if text:
            out[key] = text
    region = _text(raw.get("region"), 2)
    if _REGION.match(region) and region == str(raw.get("region")).strip():
        out["region"] = region
    department = str(raw.get("department") or "").strip().upper()
    if _DEPARTMENT.match(department):
        out["department"] = department
    need_id = str(raw.get("need_id") or "").strip()
    if _UUID.match(need_id):
        out["needId"] = need_id
    return out


def _error(message: str) -> dict[str, Any]:
    return {"error": message}


def build_laura_job(tool_input: Any) -> dict[str, Any]:
    """La fiche du job, dans la forme du contrat — ou une erreur que le modèle lit.

    Rien n'est complété : une étape sans clé, sans libellé ou avec une capacité
    hors liste est REFUSÉE (le modèle apprend son erreur), jamais devinée. L'API
    revalide tout de toute façon (``lauraJobBriefSchema``).
    """
    if not isinstance(tool_input, dict):
        return _error("Une fiche de job est un objet.")
    intent = _text(tool_input.get("intent"), 500)
    outcome = _text(tool_input.get("expected_outcome"), 1000)
    scope_in = tool_input.get("scope") if isinstance(tool_input.get("scope"), dict) else {}
    scope_description = _text(scope_in.get("description"), 500)
    if not intent or not outcome or not scope_description:
        return _error("Un job a besoin d'une intention, d'un résultat attendu et d'un périmètre décrit.")

    raw_steps = tool_input.get("steps")
    if not isinstance(raw_steps, list) or not raw_steps:
        return _error("Un job a au moins une étape.")
    if len(raw_steps) > _MAX_STEPS:
        return _error(f"Un job a {_MAX_STEPS} étapes au plus.")
    steps: list[dict[str, Any]] = []
    declared: set[str] = set()
    for raw in raw_steps:
        if not isinstance(raw, dict):
            return _error("Chaque étape est un objet.")
        key = _text(raw.get("key"), 40)
        label = _text(raw.get("label"), 200)
        capability = raw.get("capability")
        if not _STEP_KEY.match(key) or key in declared:
            return _error(f"Clé d'étape invalide ou en double : « {key} ».")
        if not label:
            return _error(f"L'étape « {key} » n'a pas de libellé.")
        if capability not in LAURA_JOB_CAPABILITIES:
            return _error(f"Capacité inconnue pour l'étape « {key} » : choisis-en une de la liste.")
        depends_on = raw.get("depends_on") if isinstance(raw.get("depends_on"), list) else []
        unknown = [dep for dep in depends_on if dep not in declared]
        if unknown:
            return _error(f"L'étape « {key} » dépend d'une étape qui n'est pas déclarée plus haut : {unknown}.")
        units = raw.get("units")
        step: dict[str, Any] = {
            "key": key,
            "label": label,
            "capability": capability,
            "units": units
            if isinstance(units, int) and not isinstance(units, bool) and 1 <= units <= _MAX_UNITS
            else 1,
            "dependsOn": list(dict.fromkeys(depends_on)),
            "requiresApproval": raw.get("requires_approval") is True,
        }
        criteria = _criteria(raw.get("criteria"))
        if criteria:
            step["criteria"] = criteria
        steps.append(step)
        declared.add(key)

    job: dict[str, Any] = {
        "intent": intent,
        "expectedOutcome": outcome,
        "scope": {
            "description": scope_description,
            "accountIds": _texts(scope_in.get("account_ids"), 64, 200),
            "contactIds": _texts(scope_in.get("contact_ids"), 64, 500),
        },
        "assumptions": _texts(tool_input.get("assumptions"), 300, 10),
        "steps": steps,
        "sources": _texts(tool_input.get("sources"), 200, 20),
    }
    duration = tool_input.get("estimated_duration_seconds")
    if isinstance(duration, int) and not isinstance(duration, bool) and 1 <= duration <= 86_400:
        job["estimatedDurationSeconds"] = duration
    return {
        "status": LAURA_JOB_STATUS,
        "message": (
            "Job ENREGISTRÉ comme proposition, RIEN n'est lancé ni débité. Annonce le plan et dis que "
            "l'utilisateur le confirme avant tout travail payant."
        ),
        "laura_job": job,
    }


def laura_job_of_turn(tool_actions: list[dict[str, Any]], message: str) -> dict[str, Any] | None:
    """La fiche du tour (la PREMIÈRE posée — un tour, un job), avec la demande VERBATIM (#2276.3)."""
    job = next((action["laura_job"] for action in tool_actions if isinstance(action.get("laura_job"), dict)), None)
    request = (message or "").strip()[:4000]
    if job is None or not request:
        return None
    return {"originalRequest": request, **job}
