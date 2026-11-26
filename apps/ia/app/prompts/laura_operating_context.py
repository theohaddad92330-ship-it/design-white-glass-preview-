"""Le rôle et le stade ESN — le cadrage qui adapte le PÉRIMÈTRE et l'AMBITION
de la réponse de Laura au type de vendeur (rôle) et à la taille/structure
commerciale de l'ESN (stade), jamais une récitation de méthode (instruction
commune #3249, règle 12).

BEL-SC-222 (#3251) — le NO-GO du ticket est « chaque page réinterprète
indépendamment le rôle et la maturité de l'utilisateur ». `classify_esn_stage`
(``app.services.esn_stage``) et `classify_sales_structure`
(``app.services.sales_context``) sont DÉJÀ le socle canonique unique du
produit — la même échelle p3, déjà consommée par tout le pipeline d'analyse
(score/contacts/actions/plan/messages : `bellum_strategy.py`,
`team_routines.py`, `action_recommender.py`…). Le trou fermé ici n'est pas
l'absence d'un objet : c'est qu'aucun de ces deux socles n'atteignait encore
/chat — « capturé ≠ consommé » (`sales-context.ts`), côté conversationnel.
Ce module ne crée donc PAS un second objet métier concurrent (règle 4 de
#3249) : il réutilise le même socle, pour le même contrat de rendu que ses
voisins (``laura_authority_scope.build_authority_scope_block``,
``sales_context.revenue_model_block``) — ``""`` quand rien n'est déclaré,
jamais un stade deviné à partir d'une absence (GA-18/GA-19).
"""

from __future__ import annotations

import unicodedata
from typing import Any

from app.services.esn_stage import STAGE_PLAYBOOK, classify_esn_stage
from app.services.role_playbook import (
    build_role_block,
    classify_seller_role,
    role_stage_cell,
    role_weekly_directive,
)
from app.services.sales_context import classify_sales_structure

# Libellés courts, alignés sur la table p3 de l'annexe méthodo (mêmes cinq
# stades que `esn_stage.ESN_STAGES` — jamais une échelle recopiée).
_STAGE_LABELS: dict[str, str] = {
    "freelance": "freelance / très petite structure — founder-led, une porte à la fois",
    "petite": "petite ESN — accès direct, delivery contraint",
    "structuration": "ESN en structuration — 2-3 sales, process en train de naître",
    "etablie": "ESN établie — équipe sales, références, rang1 possible",
    "grande": "grande ESN — comptes clés, panels, rang1 assumé",
}

# Mêmes cinq bandes que `sales_context.SALES_STRUCTURES` — "inconnu" n'a
# volontairement pas de libellé : une structure illisible sort du bloc plutôt
# que d'afficher "inconnu" à l'utilisateur (#2033.10, même discipline que
# l'autorité déclarée).
_STRUCTURE_LABELS: dict[str, str] = {
    "founder_solo": "le fondateur vend seul",
    "founder_alternant": "le fondateur vend, épaulé d'un alternant",
    "duo_trio": "une équipe de 2 à 4 commerciaux",
    "equipe": "une équipe commerciale de 5 personnes ou plus",
    "account_team": "une account team pluridisciplinaire",
}


def build_operating_context_block(p: dict[str, Any]) -> str:
    """Le bloc « STADE ET STRUCTURE » — vide quand rien n'est déclaré, exactement
    le rendu historique (même contrat que les blocs voisins de ce fichier)."""
    role = p.get("sellerRole")
    size = p.get("size")
    team = p.get("salesTeamSize")
    consultants_managed = p.get("consultantsManagedByUserBand")

    lines: list[str] = []
    if role:
        lines.append(f"- Rôle déclaré : {role}")

    if size:
        stage = classify_esn_stage(size)
        lines.append(f"- Stade de l'ESN : {_STAGE_LABELS.get(stage, stage)} (tranche déclarée : {size})")
        # #3385 (recette prod 03/10) — une étiquette seule ne changeait rien à la
        # réponse (30-80 → 1-10 : « aucun compte ne passe en priorité »). Ce que le
        # stade CHANGE vient de la table p3 unique (`STAGE_PLAYBOOK`), jamais recopié.
        playbook = STAGE_PLAYBOOK.get(stage)
        if playbook:
            lines.append(f"- Stratégie prioritaire de ce stade : {playbook['strategie']}")
            lines.append(f"- Volume tenable à ce stade : {playbook['volume']}")
            lines.append(
                "- Quand tu donnes une priorité ou un « cette semaine », NOMME le stade et dis ce qu'il "
                "change (volume, porte d'entrée) ; une priorité qui conviendrait à un autre stade est à écarter"
            )

    if team:
        structure_label = _STRUCTURE_LABELS.get(classify_sales_structure(team))
        if structure_label:
            lines.append(f"- Structure commerciale : {structure_label}")

    if consultants_managed:
        lines.append(f"- Consultants gérés directement : {consultants_managed}")

    # #3386 — la fiche du RÔLE (+ modulation du stade + case croisée) : sans elle,
    # un Business Developer et un Fondateur recevaient le même angle. Rôle illisible
    # → "" (on ne devine pas).
    role_block = build_role_block(role, size)
    if role_block:
        lines.append(role_block)

    if not lines:
        return ""

    return (
        "\n\nSTADE ET STRUCTURE (adapte le PÉRIMÈTRE et l'AMBITION de ta réponse à ceci — un "
        "fondateur seul et une account team de 80 personnes ne reçoivent jamais le même « cette "
        "semaine ») :" + "".join(f"\n{line}" for line in lines)
    )


_WEEKLY_PRIORITY_MARKERS: tuple[str, ...] = (
    "priorite cette semaine",
    "priorite de la semaine",
    "priorites de la semaine",
    "priorites cette semaine",
    "ma priorite",
    "mes priorites",
    "what is my priority",
    "priority this week",
)


def weekly_priority_turn_block(p: dict[str, Any], message: str) -> str:
    """#3385.12 (recette prod 04/10) — la consigne du TOUR « ma priorité cette semaine ».

    Le bloc permanent « STADE ET STRUCTURE » ne suffisait pas : sans compte à
    pousser, le modèle répondait « aucun ne justifie une priorité » sans nommer
    le stade. Ici la consigne est propre à la question, et c'est le stade déclaré
    qui porte la réponse. Vide si la question est autre ou si aucune taille
    n'est déclarée — jamais un stade inventé."""
    size = p.get("size")
    text = unicodedata.normalize("NFKD", message or "").encode("ascii", "ignore").decode().lower()
    if not any(marker in text for marker in _WEEKLY_PRIORITY_MARKERS):
        return ""
    # #3386 — l'angle du RÔLE (ce qu'il doit produire, ce que Laura propose /
    # déconseille) ; vide si le rôle est illisible.
    role_directive = role_weekly_directive(p.get("sellerRole"), size)
    if not size:
        # Sans taille déclarée : jamais de stade deviné ; le rôle seul peut porter l'angle.
        return f"\n\nPRIORITÉ DE LA SEMAINE (consigne de ce tour) :{role_directive}" if role_directive else ""
    stage = classify_esn_stage(size)
    playbook = STAGE_PLAYBOOK.get(stage) or {}
    strategie = playbook.get("strategie", "")
    volume = playbook.get("volume", "")
    return (
        "\n\nPRIORITÉ DE LA SEMAINE (consigne de ce tour) : ta réponse COMMENCE par le stade de l'ESN et "
        f"sa taille déclarée — « {_STAGE_LABELS.get(stage, stage)} » ({size} consultants) — puis donne la "
        f"priorité de la semaine DÉDUITE de ce stade. Stratégie du stade : {strategie}. Volume tenable : {volume}. "
        "Même si aucun compte ne ressort, tu ne réponds jamais « aucune priorité » : le stade fixe un cap "
        "(volume, porte d'entrée), que tu énonces." + role_directive
    )


_WEEKLY_ACTIONS_MARKERS: tuple[str, ...] = (
    "faire cette semaine",
    "faire de la semaine",
    "faire dans la semaine",
    "plan d'action",
    "plan d action",
    "par quoi je commence",
    "do this week",
    "do i do this week",
    "my plan this week",
)


def weekly_actions_turn_block(p: dict[str, Any], message: str) -> str:
    """#2887.2 (recette prod 11/10 nuit, B2-RESTES) — la consigne du tour « qu'est-ce que je dois faire
    cette semaine ? » : la combinaison rôle × stade (décisions, indicateurs, routine) que /briefing lit
    déjà (``role_stage_cell``, la même matrice) ouvre la réponse, AVANT le tableau d'actions.

    Le rôle change l'ORDRE, jamais le CONTENU (c76) : le tableau du plan reste entier. Vide si la
    question est autre, si le rôle est illisible ou si le stade n'est pas déclaré — jamais deviné."""
    text = unicodedata.normalize("NFKD", message or "").encode("ascii", "ignore").decode().lower().replace("\u2019", "'")
    if not any(marker in text for marker in _WEEKLY_ACTIONS_MARKERS):
        return ""
    role = classify_seller_role(p.get("sellerRole"))
    size = p.get("size")
    if role is None or not size:
        return ""
    stage = classify_esn_stage(size)
    cell = role_stage_cell(role, stage)
    if cell is None:
        return ""
    dims = cell["dims"]
    return (
        "\n\nACTIONS DE LA SEMAINE (consigne de ce tour) : AVANT le tableau d'actions, ouvre par la "
        f"combinaison du rôle et du stade déclarés — décisions en tête : {dims['decisions']} ; "
        f"indicateurs en tête : {dims['indicateurs']} ; routine qui ouvre la semaine : {dims['routines']}. "
        "Le rôle change l'ORDRE de ta réponse, jamais son CONTENU : le tableau d'actions reste entier, "
        "aucune ligne n'est retirée parce qu'elle concerne un autre rôle."
    )
