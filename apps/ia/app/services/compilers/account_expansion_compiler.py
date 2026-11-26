"""Le compilateur d'expansion de compte (#2792, épopée « Account Expansion »,
LAU-FINAL-056, issue source #2315).

Tri du 24/09/2026 (agent epopees-b) : la capacité complète — actions dédiées
par type de piste, garde-fous filiale≠groupe et manager≠sponsor, structure de
sortie à neuf champs, priorisation, recette sur huit scénarios — n'existe pas
(24% déjà là sur #2315, mesuré `git grep`). Système absent, plusieurs jours
pour l'ensemble (ingestion des quinze sources, wiring automatique depuis les
dossiers de compte, recette écran).

Cette PREMIÈRE tranche, provable seule, suit EXACTEMENT le patron de
`opportunity_compiler.py` (#2324) : Laura COMPILE une hypothèse depuis ce
qu'elle vient de lire dans la conversation ou les outils de lecture déjà
existants, jamais depuis une source qu'elle invente — les CHAMPS DE GARDE
(`claims_group_reference`, `relies_on_manager_relationship`, …) sont fournis
par le modèle, exactement comme `reasoning` l'est pour `compile_opportunity`.
Ce module ASSEMBLE et REFUSE plutôt que de deviner :

* **Aucune probabilité.** La priorisation (§PRIORISATION de #2315) trie par
  CINQ signaux booléens nommés, jamais une chance chiffrée.
* **Les deux garde-fous du NO-GO sont des REFUS, pas des avertissements.**
  Une mission dans une filiale ne constitue jamais un référencement groupe
  sans confirmation explicite (#2315.11/.25) ; une relation manager ne
  signifie jamais un sponsor groupe sans requalification (#2315.15/.16). Une
  piste qui viole l'un des deux est REJETÉE, jamais proposée avec une réserve.
* **« Ne pas proposer dix cross-sells simultanément » (§PRIORISATION) est
  ENFORCÉ**, pas seulement recommandé : `EXPANSION_MAX_PROPOSALS` borne la
  sortie, et le compte total est rendu pour que Laura le dise plutôt que de
  laisser croire que huit pistes tiennent en trois.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

#: #2315 « PISTES D'EXPANSION » — les HUIT pistes nommées par l'épopée.
#: Complètes : les deux non déplacées vers #2792 (renouveler la mission,
#: capitaliser sur une preuve) restent au catalogue — un guide qui n'en
#: proposait que six aurait fait disparaître deux pistes de l'OBJECTIF.
EXPANSION_PISTES: tuple[str, ...] = (
    "renouveler_mission",
    "ajouter_capacite_meme_equipe",
    "ouvrir_equipe_adjacente",
    "remonter_direction_commune",
    "filiale_comparable",
    "expertise_complementaire",
    "recommandation_autorisee",
    "capitaliser_preuve",
)

#: #2315.1 — les HUIT signaux de l'OBJECTIF, ce qu'une piste doit pouvoir
#: nommer comme fait déjà ACQUIS avant de se compiler.
EXPANSION_SIGNAL_TYPES: tuple[str, ...] = (
    "mission",
    "consultant",
    "manager",
    "preuve",
    "satisfaction",
    "relation",
    "besoin_adjacent",
    "filiale_similaire",
)

#: #2315.2 — les QUINZE sources listées par l'épopée, utilisées comme entrée.
EXPANSION_SOURCE_TYPES: tuple[str, ...] = (
    "missions_actives_et_terminees",
    "contacts",
    "reunions",
    "emails",
    "satisfaction",
    "rex",
    "competences_livrees",
    "problemes_rencontres",
    "besoins",
    "equipes",
    "entites",
    "sites",
    "autres_consultants",
    "facturation",
    "renouvellement",
)

#: #2315 « SORTIE » — les NEUF champs que chaque piste doit porter (#2315.17).
EXPANSION_OUTPUT_FIELDS: tuple[str, ...] = (
    "preuve_source",
    "perimetre",
    "interlocuteur",
    "valeur_apportee",
    "relation_existante",
    "information_manquante",
    "premiere_question",
    "risque",
    "prochaine_action",
)

#: #2315 « Ne pas proposer dix cross-sells simultanément » — un cross-sell de
#: plus que deux est déjà une liste, mais borner à DIX serait accepter la
#: limite que l'épopée refuse nommément ; trois tient la « priorisation »
#: annoncée sans jamais s'en approcher.
EXPANSION_MAX_PROPOSALS = 3

#: #2315 « PRIORISATION » — préférer, DANS CET ORDRE : extension logique,
#: relation existante, preuve réutilisable, timing, faible coût commercial.
#: Les poids DÉCROISSANTS encodent l'ordre, jamais une probabilité.
_PRIORITY_WEIGHTS: tuple[tuple[str, int], ...] = (
    ("is_logical_extension", 5),
    ("has_existing_relationship", 4),
    ("has_reusable_proof", 3),
    ("has_favorable_timing", 2),
    ("is_low_commercial_cost", 1),
)


def _clean(value: Any) -> str:
    return str(value or "").strip()


def expansion_priority_score(lead: Mapping[str, Any]) -> int:
    """#2315.18-.22 — le score de PRIORISATION, jamais une probabilité : la
    somme de cinq signaux booléens nommés, pondérés dans l'ORDRE de préférence
    de l'épopée."""
    return sum(weight for key, weight in _PRIORITY_WEIGHTS if bool(lead.get(key)))


def expansion_guardrail_violations(lead: Mapping[str, Any]) -> list[str]:
    """Les DEUX garde-fous du NO-GO (#2315 « GARDE-FOUS » et « NO-GO ») —
    REFUSER plutôt qu'avertir : une piste qui les viole n'est jamais proposée.

    Retourne une liste VIDE quand la piste est saine — jamais `None`, pour
    qu'un appelant puisse toujours écrire `if violations:` sans vérifier deux
    formes d'absence (GA-18/19, même discipline que côté TypeScript)."""
    violations: list[str] = []
    # #2315.11/.25 — « une mission dans une filiale ne constitue pas un
    # référencement groupe » / NO-GO : « Laura présente une mission locale
    # comme un accès groupe ».
    if lead.get("claims_group_reference") and not lead.get("group_reference_confirmed"):
        violations.append("group_reference_not_confirmed")
    # #2315.15/.16 — « une relation manager ne signifie pas sponsor groupe » /
    # « doit être requalifiée avant utilisation ailleurs ».
    if lead.get("relies_on_manager_relationship") and not lead.get("manager_relationship_requalified"):
        violations.append("manager_relationship_not_requalified")
    return violations


def _missing_output_fields(lead: Mapping[str, Any]) -> list[str]:
    return [field for field in EXPANSION_OUTPUT_FIELDS if not _clean(lead.get(field))]


COMPILE_ACCOUNT_EXPANSION_TOOL: dict[str, Any] = {
    "name": "compile_account_expansion",
    "description": (
        "Compile une ou plusieurs pistes d'EXPANSION DE COMPTE depuis ce que la mission, les "
        "contacts, les réunions, les preuves de satisfaction et le reste du delivery ont déjà "
        "établi — jamais depuis une hypothèse commerciale sans preuve issue du delivery. "
        "À utiliser quand la conversation fait ressortir un mouvement crédible pour développer "
        "un compte : renouveler la mission, ajouter une capacité dans la même équipe, ouvrir une "
        "équipe adjacente, remonter vers une direction commune, explorer une filiale comparable, "
        "proposer une expertise complémentaire, obtenir une recommandation autorisée, ou "
        "capitaliser sur une preuve. "
        "GARDE-FOUS STRICTS, REFUS et non des réserves : une mission dans une filiale NE "
        "CONSTITUE JAMAIS un référencement groupe (`claims_group_reference` exige "
        "`group_reference_confirmed`) ; une relation manager NE SIGNIFIE JAMAIS un sponsor "
        "groupe tant qu'elle n'a pas été requalifiée (`relies_on_manager_relationship` exige "
        "`manager_relationship_requalified`). Une piste qui viole l'un des deux est REJETÉE, "
        "jamais proposée avec une réserve — dis-le à l'utilisateur plutôt que de la montrer. "
        "Chaque piste porte NEUF champs obligatoires (preuve source, périmètre, interlocuteur, "
        "valeur apportée, relation existante, information manquante, première question, risque, "
        "prochaine action) — une piste incomplète est refusée, jamais complétée à sa place. "
        "AU PLUS TROIS pistes sont retenues par appel, triées par priorité (extension logique, "
        "relation existante, preuve réutilisable, timing, faible coût commercial, DANS CET "
        "ORDRE) — ne présente jamais dix cross-sells à la fois. AUCUNE probabilité de succès, "
        "aucun score chiffré : la priorisation se dit par les signaux nommés, jamais un chiffre."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "account_id": {"type": "string", "description": "Le compte du portefeuille concerné."},
            "leads": {
                "type": "array",
                "minItems": 1,
                "maxItems": len(EXPANSION_PISTES),
                "items": {
                    "type": "object",
                    "properties": {
                        "piste": {"type": "string", "enum": list(EXPANSION_PISTES)},
                        "signal_type": {
                            "type": "string",
                            "enum": list(EXPANSION_SIGNAL_TYPES),
                            "description": "Le fait DÉJÀ ACQUIS qui fonde cette piste (#2315 OBJECTIF).",
                        },
                        "source_type": {
                            "type": "string",
                            "enum": list(EXPANSION_SOURCE_TYPES),
                            "description": "D'où vient ce signal (#2315 SOURCES).",
                        },
                        "preuve_source": {"type": "string"},
                        "perimetre": {"type": "string"},
                        "interlocuteur": {"type": "string"},
                        "valeur_apportee": {"type": "string"},
                        "relation_existante": {"type": "string"},
                        "information_manquante": {"type": "string"},
                        "premiere_question": {"type": "string"},
                        "risque": {"type": "string"},
                        "prochaine_action": {"type": "string"},
                        "claims_group_reference": {
                            "type": "boolean",
                            "description": "Cette piste prétend-elle un accès au-delà de l'entité source ?",
                        },
                        "group_reference_confirmed": {
                            "type": "boolean",
                            "description": "Ce référencement groupe a-t-il été confirmé (jamais déduit) ?",
                        },
                        "relies_on_manager_relationship": {
                            "type": "boolean",
                            "description": "Cette piste réutilise-t-elle une relation manager existante ?",
                        },
                        "manager_relationship_requalified": {
                            "type": "boolean",
                            "description": "Cette relation manager a-t-elle été requalifiée pour ce nouvel usage ?",
                        },
                        "is_logical_extension": {"type": "boolean"},
                        "has_existing_relationship": {"type": "boolean"},
                        "has_reusable_proof": {"type": "boolean"},
                        "has_favorable_timing": {"type": "boolean"},
                        "is_low_commercial_cost": {"type": "boolean"},
                    },
                    "required": ["piste", "signal_type", "source_type", *EXPANSION_OUTPUT_FIELDS],
                },
            },
        },
        "required": ["account_id", "leads"],
    },
}


async def execute_compile_account_expansion(
    tool_input: Mapping[str, Any],
    *,
    resolve_account: Any,
) -> dict[str, Any]:
    """`resolve_account(account_id) -> {"account_id", "company_name"} | None`,
    scopé au caller — même discipline que `execute_compile_opportunity`."""
    account_id = _clean(tool_input.get("account_id"))
    if not account_id:
        return {"error": "Il me faut le compte sur lequel compiler une expansion."}

    raw_leads = tool_input.get("leads")
    if not isinstance(raw_leads, list) or not raw_leads:
        return {"error": "Il me faut au moins une piste d'expansion à compiler."}
    if len(raw_leads) > len(EXPANSION_PISTES):
        return {
            "error": (
                f"Trop de pistes en un seul appel ({len(raw_leads)}) — il n'en existe que "
                f"{len(EXPANSION_PISTES)} au catalogue."
            )
        }

    account = await resolve_account(account_id)
    if not account:
        return {"error": "Ce compte est introuvable dans votre portefeuille."}

    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    for raw in raw_leads:
        if not isinstance(raw, Mapping):
            return {"error": "Chaque piste doit être un objet, pas une valeur simple."}
        piste = _clean(raw.get("piste"))
        if piste not in EXPANSION_PISTES:
            return {"error": f"Piste d'expansion inconnue : {piste or '(vide)'}."}
        signal_type = _clean(raw.get("signal_type"))
        if signal_type not in EXPANSION_SIGNAL_TYPES:
            return {"error": f"Signal d'expansion inconnu pour « {piste} » : {signal_type or '(vide)'}."}
        source_type = _clean(raw.get("source_type"))
        if source_type not in EXPANSION_SOURCE_TYPES:
            return {"error": f"Source d'expansion inconnue pour « {piste} » : {source_type or '(vide)'}."}

        missing = _missing_output_fields(raw)
        if missing:
            return {"error": f"Piste « {piste} » incomplète — il manque : {', '.join(missing)}."}

        violations = expansion_guardrail_violations(raw)
        lead_out = {
            "piste": piste,
            "signal_type": signal_type,
            "source_type": source_type,
            **{field: _clean(raw.get(field)) for field in EXPANSION_OUTPUT_FIELDS},
        }
        if violations:
            rejected.append({**lead_out, "guardrail_violations": violations})
        else:
            accepted.append({**lead_out, "priority_score": expansion_priority_score(raw)})

    accepted.sort(key=lambda lead: lead["priority_score"], reverse=True)
    kept = accepted[:EXPANSION_MAX_PROPOSALS]
    deprioritized_count = len(accepted) - len(kept)

    company_name = _clean(account.get("company_name")) or "ce compte"
    return {
        "account_id": account_id,
        "company_name": company_name,
        "leads": kept,
        "rejected": rejected,
        "deprioritized_count": deprioritized_count,
    }
