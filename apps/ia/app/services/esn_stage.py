"""L'échelle de maturité ESN — UNE seule, celle de l'annexe méthodo p3.

Le trou fermé ici : trois échelles de taille vivaient en parallèle et
divergeaient (5/20/80/300 dans `sales_context`, 5/20/100/500 dans
`esn_profiler`, 1-20 / 20-100 / 100+ dans le prompt strategy). Une ESN de 90
consultants était « établie », « mid_market_challenger » ET « MOYENNE » selon
qui la lisait. Tant que les coupures divergent, « petite ESN vs grande ESN »
(DoD p31 n°1) n'a pas de définition dans le produit.

Les bornes sont celles ÉCRITES dans la table p3 (« Segmentation de l'ESN — les
règles changent par stade ») : Freelance 0-5, Petite 5-15, Structuration 15-50,
Établie 50-200, Grande 200+. Elles ne sont pas approximées : l'annexe fait foi.

Ce module est le SOCLE — il n'importe rien du reste des services, pour que
`sales_context` et `esn_profiler` puissent tous deux en dépendre sans cycle.
"""

from __future__ import annotations

import re
from typing import Any

# Ordre du plus petit au plus grand — l'ordre EST une information (comparaisons
# de stade en aval : « au moins structuration », « au plus petite »).
ESN_STAGES: tuple[str, ...] = ("freelance", "petite", "structuration", "etablie", "grande")

# Borne haute (incluse) de chaque stade, table p3. `grande` n'en a pas.
_STAGE_UPPER_BOUNDS: tuple[tuple[int, str], ...] = (
    (5, "freelance"),
    (15, "petite"),
    (50, "structuration"),
    (200, "etablie"),
)


def size_int(value: Any) -> int | None:
    """Borne HAUTE d'un champ taille — une ESN « 20-100 » est une ESN de 100, pas
    de 20. On ne sous-estime jamais la capacité déclarée. « 50 consultants » → 50."""
    nums = [int(n) for n in re.findall(r"\d+", str(value or ""))]
    return max(nums) if nums else None


def classify_esn_stage(size_value: Any) -> str:
    """Effectif → stade canonique (table p3).

    Taille inconnue → `petite` : l'utilisateur type de Bellum est petit, et lire
    un inconnu comme PETIT est le défaut SÛR pour les garde-fous de la DoD (ne
    jamais autoriser un réflexe board / top-down qu'on ne peut pas justifier)."""
    size = size_int(size_value)
    if size is None:
        return "petite"
    for upper, stage in _STAGE_UPPER_BOUNDS:
        if size <= upper:
            return stage
    return "grande"


def stage_at_least(stage: str, minimum: str) -> bool:
    """`stage` est-il au moins aussi mûr que `minimum` ? (comparaison ordonnée,
    pas alphabétique). Un stade inconnu répond False — jamais d'autorisation
    accordée sur une valeur qu'on ne reconnaît pas."""
    try:
        return ESN_STAGES.index(stage) >= ESN_STAGES.index(minimum)
    except ValueError:
        return False


# ── Table p3 — « Segmentation de l'ESN : les règles changent par stade » ──────
# Colonnes « Profil » et « Stratégie prioritaire » recopiées de l'annexe. Ce sont
# les règles métier de Théo, pas une reformulation : elles descendent telles
# quelles dans les prompts, pour que la stratégie proposée dépende du STADE et
# pas d'un raisonnement « dans l'absolu ».
STAGE_PLAYBOOK: dict[str, dict[str, str]] = {
    "freelance": {
        "label": "freelance / courtier",
        "profil": "0-5 consultants, réseau fondateur",
        "strategie": (
            "réseau, prospection inversée, rang2 intelligent, preuves, peu de grands comptes froids"
        ),
        # `portes` / `volume` / `angles` = la traduction TACTIQUE de la ligne p3,
        # cohérente avec les mouvements d'ouverture p13 (bottom-up pour les petits
        # stades) et la fourchette de contacts du plan p27.
        "portes": (
            "réseau et prospection inversée d'abord : un profil concret vers un compte compatible. "
            "Le froid sur grand compte est le DERNIER recours, jamais le plan par défaut"
        ),
        "volume": "1 seul thread tenu jusqu'au bout, 2-3 contacts cibles maximum",
        "angles": "preuve personnelle, disponibilité immédiate, rang2 assumé chez un partenaire déjà en place",
    },
    "petite": {
        "label": "petite ESN",
        "profil": "5-15 consultants, 1-2 sales",
        "strategie": "PME/ETI accessibles, consultants capteurs, wedge clair, 3 actions/jour",
        "portes": (
            "bottom-up OBLIGATOIRE : opérationnels, N-2 et chefs de projet — PAS la DSI groupe. "
            "Les consultants en mission sont la première source de besoins"
        ),
        "volume": "3-5 contacts cibles, pas de multi-thread sur 15 personnes",
        "angles": "wedge clair (UNE porte, pas un catalogue), expertise de niche, proximité, agilité",
    },
    "structuration": {
        "label": "ESN en structuration",
        "profil": "15-50 consultants, 2-5 sales",
        "strategie": (
            "plans de compte, multi-threading, premiers directs, contenu, sourcing industrialisé"
        ),
        "portes": "middle-out : le manager accessible avec périmètre, puis ses pairs et le budget",
        "volume": "multi-thread ciblé : 5-8 contacts sur 2-3 entités",
        "angles": "références sectorielles naissantes, expertise métier, capacité de sourcing",
    },
    "etablie": {
        "label": "ESN établie",
        "profil": "50-200 consultants, équipes spécialisées",
        "strategie": (
            "account management, verticales, appels d'offres, partenariats, couverture BU"
        ),
        "portes": "couverture BU + appels d'offres : plusieurs entités en parallèle, sponsor identifié",
        "volume": "6-10 contacts répartis par BU, un owner nommé par thread",
        "angles": "verticale sectorielle, références citables, partenariats, capacité de staffing",
    },
    "grande": {
        "label": "grande ESN",
        "profil": "200+ consultants, référencements",
        "strategie": "cross-sell, co-traitance, équipes dédiées, marketing ABM, grands programmes",
        "portes": "référencement officiel + multi-threading large ; achats et DSI groupe sont des cibles légitimes",
        "volume": "8-15 contacts sur plusieurs entités, thread achats démarré en parallèle",
        "angles": "couverture nationale, centres de services, co-traitance, partenariats éditeurs",
    },
}


def stage_calibration_block(profile_data: dict[str, Any] | None) -> str:
    """Le corps de la section « CALIBRATION PAR STADE » du prompt strategy.

    Remplace les 3 bandes inventées (1-20 / 20-100 / 100+) par le stade p3 réel.
    Taille non déclarée : on le DIT et on retombe sur le défaut sûr (`petite`),
    plutôt que de calibrer sur une taille supposée."""
    raw_size = (profile_data or {}).get("size")
    declared = size_int(raw_size) is not None
    stage = classify_esn_stage(raw_size)
    entry = STAGE_PLAYBOOK[stage]
    header = (
        f"\nStade de l'ESN : {entry['label']} ({entry['profil']}) — il determine TOUTE ta strategie.\n"
        if declared
        else (
            "\nTaille de l'ESN NON DECLAREE : calibre sur le stade le plus prudent "
            f"({entry['label']}) et ne suppose jamais une capacite grand-compte.\n"
        )
    )
    return (
        header
        + f"- Strategie prioritaire de ce stade (table p3) : {entry['strategie']}.\n"
        + f"- Portes d'entree : {entry['portes']}.\n"
        + f"- Volume tenable : {entry['volume']}.\n"
        + f"- Angles qui portent a ce stade : {entry['angles']}.\n"
        + "Une recommandation qui conviendrait a un AUTRE stade est a ecarter, pas a nuancer."
    )


def esn_stage_playbook_block(profile_data: dict[str, Any] | None) -> str:
    """Bloc de prompt : le stade de l'ESN et SA stratégie prioritaire (p3).

    SÛRETÉ : sans taille déclarée, renvoie ``""``. On n'affirme pas un stade
    qu'on n'a pas — et le prompt appelant reste byte-identique à l'historique
    (verrouillé par les goldens de prompts)."""
    raw_size = (profile_data or {}).get("size")
    if size_int(raw_size) is None:
        return ""
    stage = classify_esn_stage(raw_size)
    entry = STAGE_PLAYBOOK[stage]
    return (
        "\n\n===== STADE DE L'ESN (table méthodo p3 — les règles changent par stade) =====\n"
        f"Stade : {entry['label']} ({entry['profil']}).\n"
        f"Stratégie prioritaire pour CE stade : {entry['strategie']}.\n"
        "Cette ligne prime sur toute stratégie « en général » : une recommandation qui conviendrait "
        "à un autre stade est une recommandation à écarter, pas à nuancer."
    )
