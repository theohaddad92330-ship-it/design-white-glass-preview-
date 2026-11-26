"""La matrice RÔLE × STADE de Laura — #3386.

Constat (recette prod 10/10) : la même question « par quoi je commence cette
semaine ? » posée en Business Developer puis en Fondateur donnait deux réponses
qui commençaient par le même compte. Seule la forme changeait, jamais l'ANGLE :
le prompt n'injectait que « Rôle déclaré : <texte> », aucune consigne par rôle.

Ce module est la DONNÉE éditoriale (une fiche par rôle, neuf rubriques) et la
fonction qui la lit. Trois règles tranchées par Louis (10/10) :

1. L'échelle de stade est celle du produit (`esn_stage.ESN_STAGES`), jamais une
   seconde. La modulation par stade vit ICI mais se lit AVEC `STAGE_PLAYBOOK`
   (déjà injecté par `laura_operating_context`) : elle n'en recopie rien.
2. Laura ne reçoit QUE la fiche du rôle de l'utilisateur + la modulation de son
   stade + une case croisée éventuelle (budget `ROLE_BLOCK_MAX_CHARS`).
3. Les chiffres sont des REPÈRES DE MÉTHODE nommés, jamais des quotas, jamais
   présentés comme une norme du marché ; aucune probabilité (doctrine).

Un rôle illisible → `classify_seller_role` rend ``None`` → AUCUNE fiche (on ne
devine pas, GA-18). La version lisible `agent_docs/roles-stades-matrice.md` est
GÉNÉRÉE par `render_matrix_markdown` (un réglage, un endroit ; un test vérifie
la parité, `UPDATE_ROLE_MATRIX=1` la réécrit).

La source méthodo est un audit commercial d'ESN : seuls les enseignements sont
repris, jamais le nom d'un client, d'une personne ni d'un cabinet.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Final, NamedTuple

from app.services.esn_stage import ESN_STAGES, classify_esn_stage

ROLES: Final[tuple[str, ...]] = (
    "fondateur",
    "directeur_agence",
    "manager_commercial",
    "business_manager",
    "business_developer",
    "recruteur",
    "sales_ops",
)

ROLE_LABELS: Final[dict[str, str]] = {
    "fondateur": "Fondateur / dirigeant",
    "directeur_agence": "Directeur d'agence ou de BU",
    "manager_commercial": "Manager commercial",
    "business_manager": "Business Manager",
    "business_developer": "Business Developer / chasseur",
    "recruteur": "Recruteur / talent",
    "sales_ops": "Opérations commerciales",
}

# Les neuf rubriques de #3386, dans l'ordre où elles sont rendues.
RUBRIQUES: Final[tuple[tuple[str, str], ...]] = (
    ("produire", "À produire"),
    ("ne_pas_porter", "Ne porte pas"),
    ("decisions", "Décisions"),
    ("routines", "Routines"),
    ("reperes", "Repères"),
    ("erreurs", "Erreurs fréquentes"),
    ("detail", "Niveau de détail"),
    ("propose", "Laura PROPOSE"),
    ("deconseille", "Laura DÉCONSEILLE"),
)

# Budget de prompt ajouté par le bloc rôle (fiche + stade + case croisée + combinaison).
# #3386 (11/10) — porté de 1800 à 3000 pour la combinaison rôle × stade (huit lignes
# courtes) : la fiche du rôle n'est pas raccourcie pour lui faire place.
ROLE_BLOCK_MAX_CHARS: Final[int] = 3000

ROLE_PLAYBOOK: Final[dict[str, dict[str, str]]] = {
    "fondateur": {
        "produire": "le cap et les arbitrages (positionnement, cible, dépendance client, scaling) ; les rendez-vous stratégiques et C-level",
        "ne_pas_porter": "la gestion quotidienne des comptes dès que l'équipe existe ; le remplissage d'outils",
        "decisions": "quels 2-3 comptes à qui ; recruter un commercial dédié si le volume le justifie ; le seuil de marge",
        "routines": "dispatche comptes et information ; lit le reporting du vendredi le lundi matin",
        "reperes": "concentration client (poids du top 3 dans le CA), marge face au seuil fixé, part du business portée par les fondateurs",
        "erreurs": "une croissance dépendante des fondateurs ; vouloir « sortir » d'un gros client au lieu de le protéger ET diversifier ; lancer sans maintenir",
        "detail": "synthétique : 2-3 arbitrages, jamais un tableau de 40 lignes",
        "propose": "2-3 arbitrages à trancher, les rendez-vous C-level à obtenir, les comptes à dispatcher et à qui",
        "deconseille": "un plan sur des dizaines de comptes ; tenir les tableaux de suivi à sa place",
    },
    "directeur_agence": {
        "produire": "le résultat de son périmètre (agence ou BU) : arbitrages à l'échelle de l'agence et management de ses Business Managers",
        "ne_pas_porter": "les comptes de ses Business Managers au quotidien",
        "decisions": "répartition des comptes entre Business Managers ; recrutement local ; seuil de marge du périmètre",
        "routines": "rituel d'équipe hebdomadaire, reporting du vendredi, rendez-vous C-level sur les comptes clés",
        "reperes": "marge du périmètre, intercontrat, renouvellement, concentration client de l'agence",
        "erreurs": "faire le travail de ses Business Managers ; dépendre d'un client majeur sans le protéger ni diversifier",
        "detail": "agrégé par Business Manager puis par compte clé ; 2-3 arbitrages",
        "propose": "2-3 arbitrages d'agence, les comptes à réaffecter, un point individuel avec chaque Business Manager, les rendez-vous C-level",
        "deconseille": "un plan de compte détaillé à la place du Business Manager",
    },
    "manager_commercial": {
        "produire": "un pilotage d'équipe tenu : rituels, entonnoir lisible, résultats comparés sur les mêmes indicateurs pour tous",
        "ne_pas_porter": "la prospection de chaque compte ; l'inventaire passif des données",
        "decisions": "affecter les besoins, GO ou NO-GO de qualification, deals sous le seuil de marge, qui relance quoi",
        "routines": "session hebdomadaire, reporting du vendredi (30 min), comparaison des résultats chaque vendredi",
        "reperes": "entonnoir de méthode (ordre de grandeur pour ~26 consultants) : 8-14 besoins/mois, qualification, sourcing 48-72 h, entretien, démarrage",
        "erreurs": "collecter sans exploiter (organigrammes jamais maintenus) ; séparer commerce et delivery ; accepter des deals sous le seuil de marge",
        "detail": "peu de décisions d'arbitrage, chacune avec ses éléments ; jamais un inventaire passif",
        "propose": "les 2-3 arbitrages de la semaine, les écarts d'équipe sur les indicateurs, les besoins sans shortlist",
        "deconseille": "lister tous les comptes sans choisir ; ajouter un rituel de plus",
    },
    "business_manager": {
        "produire": "l'expertise de 2-3 comptes stratégiques suivis de bout en bout (prise de contact → démarrage), puis renouvellement et cross-sell",
        "ne_pas_porter": "un portefeuille éclaté ; le flou sur à qui appartient un compte",
        "decisions": "quel décideur ou projet pousser sur chaque compte ; quand proposer un profil additionnel ; quoi renouveler",
        "routines": "point trimestriel client structuré, alerte 3 mois avant la fin d'une mission, présence physique chez le client, organigramme à jour",
        "reperes": "renouvellement (repère de méthode 85 %+), comptes sans prochaine action, fins de mission sans plan",
        "erreurs": "se disperser sur trop de comptes ; ne jamais maintenir les organigrammes ; découper le process",
        "detail": "profond sur peu de comptes : organigramme, décideurs, projets, prochain rendez-vous",
        "propose": "un plan sur ses 2-3 comptes, les fins de mission à anticiper, les décideurs de sa spécialité à couvrir, un profil additionnel à proposer",
        "deconseille": "un plan sur une centaine de comptes ; prospecter à froid hors de son périmètre",
    },
    "business_developer": {
        "produire": "des portes ouvertes : besoins identifiés, rendez-vous qualifiés, profils présentés, démarrages",
        "ne_pas_porter": "la relation de fond des comptes signés ; l'arbitrage de marge ou de cible",
        "decisions": "quel compte ou persona travailler d'abord ; quand relancer ou lâcher un fil ; quel canal",
        "routines": "prospection multicanale tracée, plans de compte, prospection inversée : appeler les consultants en mission, demander une phrase d'introduction vers leur manager",
        "reperes": "repères de méthode, jamais des quotas : ~30 appels/jour, ~100 connexions et ~100 messages LinkedIn/semaine, ~1h30 de plans de compte/semaine",
        "erreurs": "compter les messages envoyés au lieu des opportunités qualifiées ; ne pas tracer (ce qui n'est pas tracé n'est pas fait)",
        "detail": "opérationnel : compte par compte, contact, angle, prochain geste",
        "propose": "les portes et opportunités à qualifier sur ses comptes, les consultants en mission à appeler, le prochain geste de chaque fil",
        "deconseille": "mesurer le succès au nombre de messages ; viser un grand compte à froid sans porte",
    },
    "recruteur": {
        "produire": "1-2 CV qualifiés par besoin en 48-72 h ; une CVthèque active",
        "ne_pas_porter": "la relation commerciale du compte",
        "decisions": "quels profils sourcer d'abord ; qui présenter ; quand relancer un candidat",
        "routines": "sourcing dès qu'un besoin est qualifié, CVthèque entretenue, appels aux consultants (capteurs de besoins), événements consultants, apport d'affaires",
        "reperes": "délai besoin → shortlist (repère de méthode 48-72 h), profils présentés par besoin",
        "erreurs": "sourcer sans besoin qualifié ; ignorer les consultants comme source de besoins",
        "detail": "par besoin : profil, disponibilité, prochaine étape du candidat",
        "propose": "la shortlist des besoins ouverts, les consultants à appeler pour remonter des besoins, les candidats à relancer",
        "deconseille": "prospecter à froid les comptes ; mener la négociation commerciale",
    },
    "sales_ops": {
        "produire": "le fichier de pilotage (5 indicateurs maximum, mis à jour chaque vendredi), la traçabilité, les outils",
        "ne_pas_porter": "la prospection ; l'arbitrage commercial",
        "decisions": "quels indicateurs suivre ; quel champ rendre obligatoire ; quel outil brancher",
        "routines": "mise à jour du fichier chaque vendredi, contrôle de la traçabilité, hygiène des données",
        "reperes": "complétude des comptes et des prochaines actions, fraîcheur des données, 5 indicateurs maximum",
        "erreurs": "multiplier les indicateurs ; collecter sans exploiter",
        "detail": "précis sur les données : champs, écarts, doublons à signaler",
        "propose": "les écarts à corriger, les fiches incomplètes, les indicateurs de la semaine prêts pour le reporting du vendredi",
        "deconseille": "contacter des prospects ; trancher un arbitrage commercial à la place du dirigeant",
    },
}

# Modulation par STADE : comment la fiche s'échelonne. Les cinq clés sont
# EXACTEMENT `ESN_STAGES` (un test le verrouille) ; la stratégie, le volume et
# les portes du stade viennent de `STAGE_PLAYBOOK`, jamais d'ici.
STAGE_MODULATION: Final[dict[str, str]] = {
    "freelance": "un seul fil tenu jusqu'au bout, réseau et prospection inversée ; jamais de plan sur plusieurs comptes",
    "petite": "1-3 comptes et une porte claire ; consultants capteurs ; pas de système lourd",
    "structuration": "rendre le système documenté et duplicable (si quelqu'un part demain, le suivant comprend en 2 semaines) ; réduire la dépendance aux fondateurs",
    "etablie": "équipe structurée : un propriétaire nommé par fil, plans de compte par BU, pilotage par indicateurs",
    "grande": "plans de compte grands comptes, panels et rang 1, rôles spécialisés, pilotage par indicateurs",
}


# ── #3386 (décision Louis 11/10, « fais tout ») — la COMBINAISON rôle × stade ──
# Le tableau des 28 combinaisons (7 rôles × 4 stades × 8 dimensions) vit dans
# `packages/contracts/src/schemas/role-stage-playbook.ts` (UN endroit, GA-26) ;
# ce JSON en est la copie GÉNÉRÉE (`packages/contracts` n'est pas dans l'image
# IA). Une garde vitest échoue si elle diverge ; `test_role_stage_playbook.py`
# vérifie qu'elle parle des mêmes rôles, des mêmes bornes et du même rôle déclaré.
# Rédigé par Claude le 11/10/2026 sur décision de Louis — à relire par Louis.
ROLE_STAGE_TABLE: Final[dict[str, Any]] = json.loads(
    Path(__file__).with_name("role_stage_playbook.json").read_text(encoding="utf-8")
)

# Les quatre stades de l'issue, projetés sur l'unique échelle du produit : `etablie`
# couvre établie ET grande (> 50 consultants). Jamais une seconde échelle.
STADE_OF_ESN_STAGE: Final[dict[str, str]] = {
    "freelance": "freelance",
    "petite": "petite",
    "structuration": "structuration",
    "etablie": "etablie",
    "grande": "etablie",
}


def role_stage_cell(role: str, stage: str | None) -> dict[str, Any] | None:
    """La cellule rôle × stade (dimensions + rangées d'ouverture), ou ``None`` si le
    stade est inconnu : une combinaison n'est jamais servie sur un stade deviné."""
    stade = STADE_OF_ESN_STAGE.get(stage or "")
    if stade is None:
        return None
    return ROLE_STAGE_TABLE["cells"].get(role, {}).get(stade)


def _combination_lines(role: str, stage: str | None) -> list[str]:
    cell = role_stage_cell(role, stage)
    if cell is None:
        return []
    stade = STADE_OF_ESN_STAGE[stage or ""]
    labels = ROLE_STAGE_TABLE["dimensionLabels"]
    lines = [
        f"  · Ta combinaison ({ROLE_STAGE_TABLE['roleLabels'][role]} × {ROLE_STAGE_TABLE['stadeLabels'][stade]}) — "
        "ce qui passe EN PREMIER dans ta réponse (l'ordre change, rien n’est retiré) :"
    ]
    lines.extend(f"    - {labels[dim]} : {cell['dims'][dim]}" for dim in ROLE_STAGE_TABLE["dimensions"])
    return lines


class CrossCase(NamedTuple):
    """Une case croisée là où rôle × stade DIVERGE vraiment.

    `as_role` : la fiche à lire à la place (le rôle déclaré n'existe pas à ce
    stade) ; ``None`` = on garde la fiche du rôle déclaré et on ajoute la note.
    """

    as_role: str | None
    note: str


ROLE_STAGE_CROSS: Final[dict[tuple[str, str], CrossCase]] = {
    ("business_developer", "freelance"): CrossCase(
        None,
        "à ce stade c'est le fondateur qui chasse : aide-le à chasser ET à arbitrer, en gardant UN fil tenu",
    ),
    ("directeur_agence", "freelance"): CrossCase(
        "fondateur", "pas d'agence ni de BU à ce stade : traite l'utilisateur comme le dirigeant"
    ),
    ("directeur_agence", "petite"): CrossCase(
        "fondateur", "pas d'agence ni de BU à ce stade : traite l'utilisateur comme le dirigeant"
    ),
    ("manager_commercial", "freelance"): CrossCase(
        "fondateur", "pas d'équipe à manager à ce stade : traite l'utilisateur comme le dirigeant qui vend"
    ),
    ("business_manager", "freelance"): CrossCase(
        None, "pas de portefeuille réparti : le fondateur porte les comptes, un seul fil à la fois"
    ),
    ("recruteur", "freelance"): CrossCase(
        None, "le fondateur source souvent lui-même : propose le sourcing d'un besoin à la fois"
    ),
    ("sales_ops", "freelance"): CrossCase(
        None, "rôle rarement dédié à ce stade : trois champs de traçabilité, pas d'outillage"
    ),
    ("sales_ops", "petite"): CrossCase(
        None, "rôle rarement dédié à ce stade : trois champs de traçabilité, pas d'outillage"
    ),
    ("fondateur", "etablie"): CrossCase(
        None, "il arbitre via ses directeurs et ne touche aucun compte hors rendez-vous C-level"
    ),
    ("fondateur", "grande"): CrossCase(
        None, "il arbitre via ses directeurs et ne touche aucun compte hors rendez-vous C-level"
    ),
}


# ── Reconnaissance du rôle déclaré (texte libre, `user_role`) ────────────────
# Même intention que `personaFromUserRole` (pilotage-role-focus.ts), mais
# tolérante : accents, casse, synonymes. L'ORDRE compte (le plus spécifique
# d'abord). Aucune correspondance → None : on ne devine pas (GA-18).
_ROLE_PATTERNS: Final[tuple[tuple[str, tuple[str, ...]], ...]] = (
    (
        "sales_ops",
        (
            r"sales\s*ops",
            r"sales operations?",
            r"rev\s*ops",
            r"operations? commerciales?",
            r"ops commerciales?",
            r"administration des ventes",
        ),
    ),
    (
        "recruteur",
        (r"recrut", r"talent", r"staffing", r"sourceu", r"charge(e)? de sourcing", r"\bhr\b"),
    ),
    (
        "directeur_agence",
        (
            r"(directeur|directrice|responsable|dir\.?) (d |de |du )?(l )?agence",
            r"(directeur|directrice|responsable|head of) (de |du |of )?(la )?(bu|business unit)",
            r"\bdir(ecteur|ectrice)? bu\b",
            r"branch manager",
            r"agency (director|manager)",
        ),
    ),
    (
        "fondateur",
        (
            r"fondateur",
            r"fondatrice",
            r"founder",
            r"\bceo\b",
            r"\bpdg\b",
            r"(?<!vice )president",
            r"dirigeant",
            r"gerant",
            r"managing director",
            r"directeur general",
            r"directrice generale",
            r"\bdg\b",
            r"\bowner\b",
        ),
    ),
    (
        "manager_commercial",
        (
            r"manager commercial",
            r"(directeur|directrice|responsable|chef) (des |du )?(commercial|ventes)",
            r"head of sales",
            r"sales (manager|director)",
            r"\bvp sales\b",
            r"vice president (of )?sales",
        ),
    ),
    (
        "business_manager",
        (r"business manager", r"\bbm\b", r"account manager", r"key account", r"responsable de comptes?"),
    ),
    (
        "business_developer",
        (
            r"business develop",
            r"biz\s*dev",
            r"\bbd\b",
            r"\bsdr\b",
            r"\bbdr\b",
            r"chasseu",
            r"hunter",
        ),
    ),
)
_COMPILED_ROLE_PATTERNS: Final[tuple[tuple[str, re.Pattern[str]], ...]] = tuple(
    (role, re.compile("|".join(pats))) for role, pats in _ROLE_PATTERNS
)


def _normalize(text: str) -> str:
    folded = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9.]+", " ", folded).strip()


def classify_seller_role(text: object) -> str | None:
    """Texte libre → l'un des sept rôles, ou ``None`` (aucune fiche, on ne devine pas)."""
    if not isinstance(text, str):
        return None
    norm = _normalize(text)
    if not norm:
        return None
    for role, pattern in _COMPILED_ROLE_PATTERNS:
        if pattern.search(norm):
            return role
    return None


# ── Rendu pour le prompt ─────────────────────────────────────────────────────


def resolve_role_card(role: str, stage: str | None) -> tuple[str, str | None]:
    """(fiche à lire, note croisée) pour ce rôle à ce stade."""
    cross = ROLE_STAGE_CROSS.get((role, stage)) if stage else None
    if cross is None:
        return role, None
    return (cross.as_role or role), cross.note


def build_role_block(role_text: object, size: object = None) -> str:
    """Les lignes « fiche de rôle » ajoutées au bloc STADE ET STRUCTURE.

    ``""`` quand le rôle est illisible. Sans taille déclarée, pas de modulation
    ni de case croisée : un stade n'est jamais deviné (GA-18)."""
    role = classify_seller_role(role_text)
    if role is None:
        return ""
    stage = classify_esn_stage(size) if size else None
    card_role, note = resolve_role_card(role, stage)
    card = ROLE_PLAYBOOK[card_role]
    lines = [
        f"- Fiche de rôle ({ROLE_LABELS[card_role]}) — les chiffres sont des repères de méthode, jamais des "
        "quotas ni une norme du marché, jamais une probabilité :"
    ]
    lines.extend(f"  · {label} : {card[key]}" for key, label in RUBRIQUES)
    if stage:
        lines.append(f"  · À ce stade : {STAGE_MODULATION[stage]}")
    if note:
        lines.append(f"  · Cas particulier : {note}")
    # #3386 (11/10) — la combinaison du rôle DÉCLARÉ à ce stade (ses cellules disent
    # déjà quand le rôle agit comme le dirigeant) ; aucune sans taille déclarée.
    lines.extend(_combination_lines(role, stage))
    return "\n".join(lines)


def role_weekly_directive(role_text: object, size: object = None) -> str:
    """La phrase du tour « cette semaine » : s'appuie sur ce que le rôle doit
    PRODUIRE et sur les actions que Laura PROPOSE / DÉCONSEILLE pour ce rôle."""
    role = classify_seller_role(role_text)
    if role is None:
        return ""
    stage = classify_esn_stage(size) if size else None
    card_role, note = resolve_role_card(role, stage)
    card = ROLE_PLAYBOOK[card_role]
    text = (
        f" Angle propre au rôle ({ROLE_LABELS[card_role]}) : la priorité sert ce qu'il doit produire — "
        f"{card['produire']}. Propose : {card['propose']}. Déconseille : {card['deconseille']}. "
        "Deux rôles différents ne reçoivent jamais la même priorité."
    )
    if note:
        text += f" Cas particulier : {note}."
    cell = role_stage_cell(role, stage)
    if cell is not None:
        text += f" Pour sa combinaison rôle × stade, ouvre par : {cell['dims']['actions_laura']}."
    return text


# ── Version lisible (agent_docs/roles-stades-matrice.md), GÉNÉRÉE ───────────


def render_matrix_markdown() -> str:
    from app.services.esn_stage import STAGE_PLAYBOOK

    out: list[str] = [
        "# Matrice rôle × stade de Laura (#3386)",
        "",
        "> Fichier GÉNÉRÉ depuis `apps/ia/app/services/role_playbook.py` — ne l'édite pas à la main :",
        "> modifie la donnée, puis `UPDATE_ROLE_MATRIX=1 pytest apps/ia/tests/test_role_playbook.py`.",
        "> Un test échoue si les deux divergent.",
        "",
        "Laura ne reçoit que la fiche du rôle de l'utilisateur, la modulation de son stade et la case croisée",
        f"éventuelle (au plus {ROLE_BLOCK_MAX_CHARS} caractères ajoutés au prompt). Les chiffres sont des **repères de",
        "méthode** : jamais des quotas, jamais une norme du marché, jamais une probabilité. Un rôle illisible",
        "ne reçoit aucune fiche (on ne devine pas).",
        "",
        "## 1. Fiches par rôle (neuf rubriques)",
    ]
    for role in ROLES:
        out += ["", f"### {ROLE_LABELS[role]} (`{role}`)", ""]
        out += [f"- **{label}** : {ROLE_PLAYBOOK[role][key]}" for key, label in RUBRIQUES]
    out += [
        "",
        "## 2. Modulation par stade",
        "",
        "Échelle = les cinq stades du produit (`ESN_STAGES`). La stratégie, les portes et le volume viennent de",
        "`STAGE_PLAYBOOK` (colonne « du produit » ci-dessous, lue, jamais recopiée à la main).",
        "",
        "| Stade | Profil (produit) | Stratégie prioritaire (produit) | Modulation de la fiche |",
        "|---|---|---|---|",
    ]
    for stage in ESN_STAGES:
        entry = STAGE_PLAYBOOK[stage]
        out.append(f"| `{stage}` | {entry['profil']} | {entry['strategie']} | {STAGE_MODULATION[stage]} |")
    out += [
        "",
        "## 3. Cases croisées (là où rôle × stade diverge vraiment)",
        "",
        "| Rôle | Stade | Fiche lue | Note |",
        "|---|---|---|---|",
    ]
    for (role, stage), case in ROLE_STAGE_CROSS.items():
        lue = ROLE_LABELS[case.as_role] if case.as_role else "celle du rôle déclaré"
        out.append(f"| {ROLE_LABELS[role]} | `{stage}` | {lue} | {case.note} |")
    table = ROLE_STAGE_TABLE
    out += [
        "",
        "## 4. Les 28 combinaisons rôle × stade (#3386, décision Louis 11/10)",
        "",
        f"> {table['_authorship']}",
        "> Source : `packages/contracts/src/schemas/role-stage-playbook.ts` (contrat zod). Doctrine c76 : chaque",
        "> cellule dit ce qui passe EN PREMIER, jamais ce qui est caché ; « ouvre /briefing sur » est un préfixe",
        "> d'ordre, toutes les autres rangées gardent leur place.",
    ]
    for role in table["roles"]:
        for stade in table["stades"]:
            cell = table["cells"][role][stade]
            out += ["", f"### {table['roleLabels'][role]} × {table['stadeLabels'][stade]}", ""]
            out += [f"- **{table['dimensionLabels'][dim]}** : {cell['dims'][dim]}" for dim in table["dimensions"]]
            out.append(f"- **Ouvre /briefing sur** : {', '.join(f'`{b}`' for b in cell['briefingLeads'])}")
    out.append("")
    return "\n".join(out)
