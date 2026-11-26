"""Routines commerciales par TAILLE D'ÉQUIPE SALES (plan méthodo, cluster D §17).

Le trou : `sales_team_size` est capturé au profil ESN, mais tout le
dimensionnement du plan repose sur `size` — le nombre de CONSULTANTS. Une ESN de
40 consultants où le fondateur vend seul reçoit donc le même volume d'actions
qu'une ESN de 40 consultants dotée de 5 commerciaux. Le fondateur seul ne peut
pas l'exécuter : le plan devient un catalogue non tenu, et la méthode (MOTEUR
p28 : « 3 à 5 actions, jamais 20 non hiérarchisées ») est violée par le bas.

Ce module traduit la structure commerciale en routine exécutable :
  - le PLAFOND d'actions retenues par horizon (la borne 3-5 du MOTEUR),
  - le nombre de threads tenables en parallèle sur un compte,
  - qui porte l'action (`owner`, champ déjà présent dans le schéma du plan),
  - la cadence de prospection réaliste sur une semaine.

Déterministe, sans LLM, sans I/O. Règle de sûreté : structure `inconnu`
(questionnaire non renseigné) ⇒ AUCUN changement — plafond historique et bloc de
prompt vide, donc prompt byte-identique.
"""

from __future__ import annotations

from typing import Any

from app.services.sales_context import classify_sales_structure, sales_structure_from_context

# Routine par structure. `action_cap` reste dans la fourchette 3-5 du MOTEUR
# (p28) : on ne descend pas sous le plancher méthodo, on choisit où on se place
# dedans. Les volumes 7 jours reprennent la fourchette du plan p27 (« 10-30
# contacts, 3 conversations ») : le fondateur seul vise la borne basse, une
# équipe de 5+ la borne haute — aucun chiffre inventé hors de cette fourchette.
# #2273.30 (épopée #2959) — `active_fronts` : le nombre de COMPTES suivis
# ACTIVEMENT en parallèle par cette structure — distinct de `threads`
# (le nombre de fils DANS un seul compte) et de `action_cap` (le nombre
# d'actions DANS un horizon). Un fondateur seul qui tient déjà « 1 seul angle
# jusqu'au bout » sur le compte qu'il travaille ne peut pas non plus courir
# après dix comptes en même temps : la même discipline de non-dispersion
# s'applique au niveau du PORTEFEUILLE, pas seulement du compte.
#
# Valeur NOMMÉE dans cette table, au même titre que `action_cap`/`threads` —
# PAS dérivée par un calcul depuis eux (un audit précédent avait écarté cette
# option : « l'approximer depuis le cap d'actions serait un nombre inventé »,
# parce qu'il n'existe aucun ratio validé actions→comptes). Ici il n'y a pas
# de conversion : chaque structure reçoit sa propre borne, choisie dans le
# même esprit que les bornes déjà tranchées de cette table (le fondateur seul
# à la borne basse, l'équipe structurée à la borne haute).
ROUTINES: dict[str, dict[str, Any]] = {
    "founder_solo": {
        "label": "fondateur qui vend seul",
        "action_cap": 3,
        "threads": 1,
        "active_fronts": 1,
        "owner": "toi (le fondateur) — aucune action ne peut être déléguée",
        "weekly": (
            "2 créneaux de prospection bloqués par semaine, 10 contacts résolus et 1-2 conversations "
            "sur 7 jours (borne basse p27)"
        ),
        "focus": (
            "1 seul angle tenu jusqu'au bout et 1 thread actif par compte : mieux vaut 3 actions "
            "réellement exécutées qu'un plan multi-thread abandonné en semaine 2"
        ),
    },
    "founder_alternant": {
        "label": "fondateur + alternant",
        "action_cap": 4,
        "threads": 2,
        "active_fronts": 2,
        "owner": (
            "sépare explicitement : l'alternant porte le volume et l'enrichissement, "
            "le fondateur porte la stratégie, le RDV et le closing"
        ),
        "weekly": (
            "l'alternant résout et enrichit ~20 contacts sur 7 jours, le fondateur tient 2-3 "
            "conversations et tous les rendez-vous"
        ),
        "focus": (
            "aucune action de closing ne peut être assignée à l'alternant, et aucune action "
            "d'enrichissement ne doit consommer le temps du fondateur"
        ),
    },
    "duo_trio": {
        "label": "petite équipe commerciale (2 à 4)",
        "action_cap": 4,
        "threads": 2,
        "active_fronts": 3,
        "owner": "nomme la personne par son rôle (toi / ton AM / ton alternant), jamais « l'équipe »",
        "weekly": (
            "prospection quotidienne partagée, ~20 contacts résolus et 2-3 conversations sur 7 jours "
            "(milieu de la fourchette p27)"
        ),
        "focus": (
            "2 threads en parallèle (stratégie sandwich : terrain + budget), répartis explicitement "
            "entre deux personnes pour qu'aucun ne retombe sur la même"
        ),
    },
    "equipe": {
        "label": "équipe commerciale structurée (5+)",
        "action_cap": 5,
        "threads": 3,
        "active_fronts": 5,
        "owner": "sépare les rôles : SDR sur l'ouverture, AM sur la qualification et le closing",
        "weekly": (
            "prospection industrialisée, 30 contacts résolus et 3+ conversations sur 7 jours "
            "(borne haute p27)"
        ),
        "focus": (
            "multi-threading complet et découpage par entité/BU : chaque thread a un owner nommé "
            "et le thread achats démarre en parallèle, pas après"
        ),
    },
    "account_team": {
        "label": "account team (sales + recruteur + delivery + consultant capteur)",
        "action_cap": 5,
        "threads": 4,
        "active_fronts": 6,
        "owner": (
            "chaque action nomme sa FONCTION : sales (ouverture/closing), recruteur (sourcing), "
            "delivery (soutenance/REX), consultant capteur (besoins terrain)"
        ),
        "weekly": (
            "revue de compte commune, 30+ contacts résolus et 3+ conversations sur 7 jours, "
            "sourcing et prospection menés en parallèle"
        ),
        "focus": (
            "objectifs de COMPTE communs aux quatre fonctions : une action de sourcing sans "
            "besoin qualifié, ou un besoin qualifié sans sourcing lancé, est un thread cassé"
        ),
    },
}


def routine_for_structure(structure: str | None) -> dict[str, Any] | None:
    """La routine d'une structure, ou ``None`` quand elle est inconnue (le
    questionnaire n'a pas été renseigné) — surtout ne rien inventer."""
    return ROUTINES.get(str(structure or "").strip())


def action_cap_for_structure(structure: str | None, default: int) -> int:
    """Plafond d'actions retenues pour cette structure. Structure inconnue →
    ``default`` (le plafond historique) : aucun changement de comportement."""
    routine = routine_for_structure(structure)
    if not routine:
        return default
    return min(default, int(routine["action_cap"]))


def active_fronts_cap_for_structure(structure: str | None, default: int) -> int:
    """#2273.30 — plafond de COMPTES suivis activement en parallèle pour
    cette structure (portefeuille), distinct de `action_cap_for_structure`
    (actions dans un horizon) et de `threads` (fils dans un seul compte).
    Structure inconnue → ``default`` : aucun changement de comportement,
    même garde que `action_cap_for_structure`."""
    routine = routine_for_structure(structure)
    if not routine:
        return default
    return min(default, int(routine["active_fronts"]))


def team_routines_block(
    profile_data: dict[str, Any] | None = None, sales_context: dict[str, Any] | None = None
) -> str:
    """Bloc de prompt (plan) calibrant le VOLUME et l'OWNER sur la structure
    commerciale. Lit d'abord le SalesContext émis, sinon le profil ESN brut.
    ``""`` quand la structure est inconnue → prompt inchangé au byte près."""
    structure = sales_structure_from_context(sales_context) if sales_context else "inconnu"
    if structure == "inconnu":
        raw = (profile_data or {}).get("salesTeamSize") or (profile_data or {}).get("sales_team_size")
        structure = classify_sales_structure(raw)
    routine = routine_for_structure(structure)
    if not routine:
        return ""
    active_fronts = int(routine["active_fronts"])
    fronts_label = "1 compte" if active_fronts == 1 else f"{active_fronts} comptes"
    return (
        "\n\n===== ROUTINE COMMERCIALE (calibrée sur la STRUCTURE DE VENTE, pas sur le nb de consultants) =====\n"
        f"Structure : {routine['label']}.\n"
        f"- Plafond : {routine['action_cap']} actions MAXIMUM par horizon (7j / 30j / 60j / 90j) — "
        "au-delà, le plan n'est pas exécutable par cette équipe.\n"
        f"- Threads simultanés sur ce compte : {routine['threads']}.\n"
        # #2273.30 — le PORTEFEUILLE, pas seulement le compte courant : au-delà
        # de ce nombre, un compte de plus n'est pas un compte suivi en plus,
        # c'est un compte suivi moins bien — la même discipline que le plafond
        # d'actions, appliquée un niveau au-dessus.
        f"- Comptes suivis activement en parallèle (tout le portefeuille) : {fronts_label} MAXIMUM — "
        "au-delà, un compte de plus dilue le suivi des autres plutôt que d'en ajouter un vrai.\n"
        f"- Owner de chaque action : {routine['owner']}.\n"
        f"- Cadence tenable : {routine['weekly']}.\n"
        f"- Discipline : {routine['focus']}.\n"
        "Respecte ces bornes : une action que cette structure ne peut pas exécuter est une action "
        "à SUPPRIMER, pas à ajouter."
    )
