"""#3231 (#219.8, X50) — la relation DÉCLARÉE pilote le niveau de PREUVE exigé.

Cinq des six aspects de #219.8 vivaient hors de la relation personne↔entreprise ;
celui-ci est le plus direct : une personne dont le commercial a déclaré qu'elle
est un ancien salarié, un ancien prestataire ou un consultant seulement PRÉSENTÉ
ne se propose jamais comme décideur ou point d'entrée ACTUEL sans qu'un emploi
actuel soit confirmé. Sans déclaration (`None`, `unknown_relationship`, valeur
hors vocabulaire) : aucune note — rien n'est deviné d'un titre ou d'un parcours
(`person_company_relation.classify_person_company_relation`, même vocabulaire).

Appelants réels : `phase4_plan.py::_plan` (prompt du plan, aspect « plan de compte ») et `chat_tools.py` (`search_workspace_contacts`,
`get_account_contacts`) — chaque ligne de contact relayée à Laura porte, quand
une relation est déclarée, `person_company_relation` + `relation_proof`.
"""

from __future__ import annotations

import re
from typing import Any

from app.services.person_company_relation import PersonCompanyRelation, classify_person_company_relation

_FIELD = "declared_person_company_relation"

_PROOF: dict[PersonCompanyRelation, str] = {
    PersonCompanyRelation.EMPLOYEE_FORMER: (
        "Ancien salarié déclaré : ne le présente pas comme décideur ni comme point d'entrée actuel ; "
        "exige la confirmation de son emploi actuel avant tout rôle dans le plan ; "
        "ne demande ni n'utilise d'information interne confidentielle de son ancien employeur."
    ),
    PersonCompanyRelation.CONTRACTOR_HISTORICAL: (
        "Ancien prestataire déclaré : sa mission n'est pas en cours ; "
        "ne l'écris jamais comme un contact en poste sans confirmation ; "
        "ne réutilise aucune information confidentielle de ses anciennes missions."
    ),
    PersonCompanyRelation.CONSULTANT_PRESENTED: (
        "Consultant seulement présenté : une présentation commerciale n'est pas une mission confirmée ; "
        "demande une preuve de mission avant de le citer comme relais."
    ),
}

# #3231 (#219.8) — CAPACITÉ D'INTRODUCTION : ce que la relation déclarée autorise comme
# introduction. Tranché sans Louis : une relation passée ou seulement présentée ne
# VAUT pas une introduction (elle donne du contexte, pas un accès) ; une relation en
# cours la rend possible mais jamais acquise (le commercial la fait confirmer).
_INTRODUCTION: dict[PersonCompanyRelation, str] = {
    PersonCompanyRelation.EMPLOYEE_CURRENT: "Peut introduire auprès de ses collègues, à lui faire confirmer.",
    PersonCompanyRelation.CONTRACTOR_CURRENT: "Peut introduire auprès de ses interlocuteurs de mission, à lui faire confirmer.",
    PersonCompanyRelation.SPONSOR: "Peut introduire auprès des décideurs qu'il parraine, à lui faire confirmer.",
    PersonCompanyRelation.BUYER: "Peut introduire auprès des prescripteurs de son achat, à lui faire confirmer.",
    PersonCompanyRelation.MANAGER: "Peut introduire auprès de son équipe, à lui faire confirmer.",
    PersonCompanyRelation.EMPLOYEE_FORMER: "Ne vaut pas une introduction : donne du contexte, pas un accès aux décideurs actuels.",
    PersonCompanyRelation.CONTRACTOR_HISTORICAL: "Ne vaut pas une introduction : donne du contexte, pas un accès aux décideurs actuels.",
    PersonCompanyRelation.CONSULTANT_PRESENTED: "Aucune introduction : une présentation n'est pas un lien établi.",
    PersonCompanyRelation.RECRUITER: "Introduit pour un recrutement, pas pour une démarche commerciale.",
}

# #3231 (#219.8) — RISQUE DE COLLISION : une relation qui dit qu'un tiers occupe déjà
# le terrain. Jamais une probabilité ; une absence ne fait aucune clé.
_COLLISION: dict[PersonCompanyRelation, str] = {
    PersonCompanyRelation.CONTRACTOR_CURRENT: "Prestataire en mission : un autre fournisseur occupe déjà le terrain, vérifie le périmètre avant de proposer un profil.",
    PersonCompanyRelation.FREELANCER: "Indépendant en place : vérifie qu'un profil proposé ne le remplace pas sur sa mission.",
    PersonCompanyRelation.CONSULTANT_PRESENTED: "Consultant présenté : une autre démarche est peut-être en cours, vérifie avant de proposer un autre profil.",
}


def relation_proof_note(declared_relation: Any) -> str | None:
    """La consigne de preuve pour une relation déclarée prudente, sinon ``None``."""
    if not isinstance(declared_relation, str):
        return None
    return _PROOF.get(classify_person_company_relation(declared_relation=declared_relation))


def with_relation_proof(contact: Any) -> Any:
    """Copie de la ligne de contact portant la relation déclarée et sa consigne de
    preuve ; la ligne est rendue telle quelle quand aucune relation n'est déclarée
    (« dans une liste, une absence ne fait aucune ligne »)."""
    if not isinstance(contact, dict):
        return contact
    declared = contact.get(_FIELD)
    relation = classify_person_company_relation(declared_relation=declared if isinstance(declared, str) else None)
    out = {key: value for key, value in contact.items() if key != _FIELD}
    if relation is PersonCompanyRelation.UNKNOWN_RELATIONSHIP:
        return out
    out["person_company_relation"] = relation.value
    note = _PROOF.get(relation)
    if note:
        out["relation_proof"] = note
    introduction = _INTRODUCTION.get(relation)
    if introduction:
        out["introduction_capability"] = introduction
    collision = _COLLISION.get(relation)
    if collision:
        out["collision_risk"] = collision
    return out


def person_relation_plan_block(contacts: Any) -> str:
    """Bloc de prompt du PLAN : les contacts dont la relation DÉCLARÉE est passée ou
    seulement présentée, nommés avec leur consigne ; ``""`` quand il n'y en a aucun
    (prompt inchangé au byte près)."""
    if not isinstance(contacts, list):
        return ""
    lines: list[str] = []
    for contact in contacts:
        if not isinstance(contact, dict):
            continue
        name = contact.get("fullName") or contact.get("full_name")
        declared = contact.get("declaredPersonCompanyRelation") or contact.get(_FIELD)
        note = relation_proof_note(declared)
        if name and note:
            lines.append(f"- {name} : {note}")
    if not lines:
        return ""
    return (
        "\n\n===== CONTACTS À RELATION PASSÉE (#219.8) =====\n"
        "Relation déclarée par le commercial ; jamais un acteur actuel du plan sans confirmation :\n" + "\n".join(lines)
    )


# #3231 (#219.8, recette prod 05/10) — le même marqueur que
# `DECLARED_RELATION_MARKER_PREFIX` côté `apps/api` (chat-context.service.ts) :
# une seule chaîne des deux côtés, jamais reformulée (GA-26).
_CONTEXT_MARKER = re.compile(r"relation déclarée:\s*([a-z_]+)")


def declared_relations_context_block(contacts_summary: Any) -> str:
    """#3231 (#219.8) — LA RELATION DÉCLARÉE ATTEINT LE PROMPT DE BASE, même
    quand le modèle n'appelle AUCUN outil ce tour (recette prod 05/10) :
    jusqu'ici `introduction_capability`/`relation_proof`/`collision_risk`
    n'existaient que dans les retours de `search_workspace_contacts`/
    `get_account_contacts` (`with_relation_proof`, ci-dessus) — un tour sans
    appel d'outil ne les voyait jamais, quelle que soit la relation déclarée
    sur la fiche du contact.

    Lu depuis `contacts_summary`, déjà dans le contexte de BASE de CHAQUE
    tour (`chat.py::build_system_prompt`), jamais un second aller-retour base
    ni une seconde classification : chaque ligne marquée est repassée dans
    `with_relation_proof` (même calcul, même vocabulaire). "" quand personne
    ne porte de relation déclarée exploitable — prompt inchangé au byte près."""
    if not isinstance(contacts_summary, str) or not contacts_summary:
        return ""
    lines: list[str] = []
    for raw_line in contacts_summary.splitlines():
        match = _CONTEXT_MARKER.search(raw_line)
        if not match:
            continue
        name = raw_line.split(" - ", 1)[0].strip()
        if not name:
            continue
        enriched = with_relation_proof({"full_name": name, _FIELD: match.group(1)})
        notes = [enriched.get("relation_proof"), enriched.get("introduction_capability"), enriched.get("collision_risk")]
        joined = " ".join(note for note in notes if note)
        if joined:
            lines.append(f"- {name} : {joined}")
    if not lines:
        return ""
    return (
        "\n\n===== RELATIONS DÉCLARÉES (#219.8) =====\n"
        "Relation personne↔entreprise déclarée par le commercial, pour les contacts de ce compte "
        "(vaut même si aucun outil n'est appelé ce tour) :\n" + "\n".join(lines)
    )


__all__ = [
    "declared_relations_context_block",
    "person_relation_plan_block",
    "relation_proof_note",
    "with_relation_proof",
]
