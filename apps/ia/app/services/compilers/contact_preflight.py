"""#3219 (#190.2 côté CONTACT, décision Louis 11/10/2026) — le contrôle AVANT
une action sur UN contact, tel que Laura le lit.

Pendant de `account_preflight.py` côté CONTACT, avec une différence assumée :
ici le compilateur vit côté API (`compileContactPreflight`, `@bellum/contracts`),
parce que la fiche contact affiche le MÊME contrôle au même moment. Deux
compilateurs (un TS pour l'écran, un Python pour Laura) divergeraient au premier
cas ajouté — c'est exactement ce que GA-26 interdit. Ce module ne porte donc que
la DÉFINITION de l'outil et la mise en enveloppe de la réponse du pont : aucune
règle de détection, aucune décision.

Fichier séparé de `chat_tools.py` pour la même raison que `account_preflight.py` :
n'y laisser qu'un AJOUT PUR (l'import, l'entrée dans `CHAT_TOOLS`, la branche).
"""

from __future__ import annotations

from typing import Any

CONTACT_PREFLIGHT_ACTIONS: tuple[str, ...] = ("prepare_message", "add_to_sequence", "export_crm")

CONTACT_PREFLIGHT_TOOL: dict[str, Any] = {
    "name": "get_contact_preflight",
    "description": (
        "Contrôle AVANT une action sur UN contact déjà connu (préparer un message, l'ajouter à une "
        "séquence, l'exporter vers le CRM) : ce qui DIFFÈRE selon la source ou le périmètre. Les "
        "lignes possibles (`items[].kind`) : `open_conflict` — deux sources automatiques de même "
        "autorité disent deux valeurs différentes sur un champ, personne n'a tranché (donne les deux "
        "valeurs, leur date, et `nextCheck` quand il est là) ; `scope_difference` — deux valeurs "
        "VRAIES chacune dans sa portée déclarée (`claims[].scope`) : deux vérités, pas un désaccord — dis-le "
        "ainsi ; `employer_differs` / `title_differs` — l'entreprise ou le poste rapportés par une "
        "source diffèrent de la fiche ; `out_of_account_scope` — le contact est hors du périmètre "
        "retenu pour son compte ; `identity_doubt` — un homonyme non levé dans le même compte. Tu ne "
        "TRANCHES JAMAIS à la place du commercial : tu cites les deux valeurs, leur source et leur "
        "date, et c'est lui qui corrige la fiche s'il le veut. Une valeur gardée par un humain "
        "(`recordKeptByHuman`) reste, quoi que dise la source — dis-le, ne propose jamais de "
        "l'écraser. Quand `preflight_status` vaut `no_difference`, dis-le en une phrase (`incomplete` : rien trouvé, mais une vérification manque). Quand `unknowns` "
        "n'est pas vide, NOMME ce qui n'a pas pu être vérifié (journal des champs illisible, contact "
        "sans compte, périmètre du compte non cartographié, contact sans entité déclarée) — jamais "
        "« rien à signaler ». Le contrôle n'empêche pas l'action : rends-le d'abord, puis continue "
        "l'action demandée si le commercial la confirme. Ne nomme jamais une source par un nom de "
        "fournisseur : dis « une source externe » ou « le journal de la fiche ». Lecture seule."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "contact_id": {"type": "string", "description": "L'identifiant (UUID) du contact."},
            "action": {
                "type": "string",
                "enum": list(CONTACT_PREFLIGHT_ACTIONS),
                "description": (
                    "L'action que le commercial s'apprête à faire, si elle est dite. Change le cadre "
                    "de ta phrase (« avant d'exporter… »), jamais les lignes du contrôle. Omets-la "
                    "quand elle n'est pas claire."
                ),
            },
        },
        "required": ["contact_id"],
    },
}


def normalize_contact_preflight_action(raw: object) -> str | None:
    """Une action hors vocabulaire est ABANDONNÉE (`None`), jamais devinée : le
    pont la refuserait, et le contrôle reste le même sans elle."""
    return raw if isinstance(raw, str) and raw in CONTACT_PREFLIGHT_ACTIONS else None
