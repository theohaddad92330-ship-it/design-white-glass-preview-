"""Le profil ESN entre dans le /25 (annexe méthodo p25 + DoD p31 n°1).

Le trou : les 5 axes du score compte étaient notés par le LLM et sommés tels
quels. Rien du profil vendeur n'entrait dans la RÈGLE — deux ESN opposées
obtenaient le même verdict sur le même compte, alors que le critère n°1 de la
Definition of Done exige l'inverse (« même compte, petite ESN vs grande ESN :
portes, SCORE, contacts et actions différents »).

Ce n'est pas une préférence d'implémentation : la grille p25 met explicitement
la **taille** dans l'axe Accessibilité (« relation, BU, panel, géo, taille ? »)
et le **delivery** dans l'axe Capacité (« delivery, références, marge, délai ? »).
Un freelance qui décroche 5/5 d'accessibilité sur un grand groupe au panel fermé
produit un GO que personne ne peut exécuter — c'est l'anti-recommandation
répétée sur six pages du rapport (« ne jamais proposer un grand programme si le
profil ne possède ni accès, ni preuve, ni capacité »).

Discipline, identique à celle du cap qualité :
  - un plafond ne peut que BAISSER un axe, jamais le remonter ;
  - il ne s'applique QUE si le stade ESN **et** l'archétype compte sont connus —
    sans quoi le score est celui d'avant ce module, au point près ;
  - il ne touche que les DEUX axes qui portent la taille de l'ESN dans la grille.
    Fit, Timing et Concurrence sont des propriétés du COMPTE : les plafonner
    reviendrait à dire qu'un compte est moins urgent parce que le vendeur est
    petit, ce qui est faux ;
  - il CITE sa règle (p31 « chaque recommandation cite la règle, le profil et
    les preuves »).

Déterministe, sans LLM, sans I/O.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

# Les deux seuls axes de la grille p25 qui portent une propriété du VENDEUR.
_CAPPED_AXES = ("accessibilite", "capacite")

# Plafond /5 par (archétype compte × stade ESN). Un archétype absent de la table
# ne plafonne rien : chez une PME/ETI (« RSI/DSI joignable, peu de panel ») comme
# chez une startup (« accès direct, cycle court »), aucune taille d'ESN n'est
# structurellement bloquée — c'est même le terrain naturel des petites structures.
#
# Lecture d'une ligne : sur un grand groupe, un freelance plafonne à 2/5
# d'accessibilité (panel, référencement, gouvernance) et 2/5 de capacité (il ne
# staffe pas un programme), une ESN établie n'est plus bridée du tout.
_ACCESSIBILITY_CAPS: dict[str, dict[str, int]] = {
    # p5 : « BU / filiale / programme, sponsor terrain, référencement, cycle long »
    "grand_groupe": {"freelance": 2, "petite": 3, "structuration": 4},
    # p5 : « risque, DORA, sécurité, panel, nombreuses entités » — le plus fermé
    "banque_assurance": {"freelance": 2, "petite": 2, "structuration": 3, "etablie": 4},
    # p5 : « marchés, accords-cadres, centrales achat » — l'accès passe par la procédure
    "public": {"freelance": 2, "petite": 3, "structuration": 4},
    # p5 : « siège vs pays, procurement local, langue, normes »
    "international": {"freelance": 2, "petite": 3, "structuration": 4},
    # p5 : « sites, OT/IT, supply » — dispersion géographique, mais pas de panel fermé
    "industrie": {"freelance": 3, "petite": 4},
    # p5 : « marques, e-commerce, saisonnalité » — exigeant, pas verrouillé
    "luxe_retail_media": {"freelance": 3, "petite": 4},
}

# Capacité = tenir le delivery À L'ÉCHELLE DE CE COMPTE. Un freelance délivre
# parfaitement pour une PME ou une startup ; il ne tient pas un programme de
# grand groupe. La table ne concerne donc que les comptes à échelle programme.
_CAPACITY_CAPS: dict[str, dict[str, int]] = {
    "grand_groupe": {"freelance": 2, "petite": 3, "structuration": 4},
    "banque_assurance": {"freelance": 2, "petite": 3, "structuration": 4},
    "public": {"freelance": 2, "petite": 3, "structuration": 4},
    "international": {"freelance": 2, "petite": 3, "structuration": 4},
    "industrie": {"freelance": 3, "petite": 4},
    "luxe_retail_media": {"freelance": 3, "petite": 4},
}

_AXIS_TABLES: dict[str, dict[str, dict[str, int]]] = {
    "accessibilite": _ACCESSIBILITY_CAPS,
    "capacite": _CAPACITY_CAPS,
}

_AXIS_RULE_LABEL = {
    "accessibilite": "Accessibilité (p25 : « relation, BU, panel, géo, taille »)",
    "capacite": "Capacité (p25 : « delivery, références, marge, délai »)",
}


def esn_fit_caps(esn_stage: str | None, account_archetype: str | None) -> dict[str, int]:
    """Les plafonds d'axes applicables à ce couple (stade ESN × archétype compte).

    ``{}`` quand l'un des deux est absent/inconnu, ou quand ce couple n'est pas
    bridé — le score reste alors strictement celui du modèle."""
    stage = (esn_stage or "").strip()
    archetype = (account_archetype or "").strip()
    if not stage or not archetype or archetype == "inconnu":
        return {}

    caps: dict[str, int] = {}
    for axis, table in _AXIS_TABLES.items():
        cap = table.get(archetype, {}).get(stage)
        if cap is not None:
            caps[axis] = cap
    return caps


def apply_esn_fit_caps(
    breakdown: Iterable[Mapping[str, Any]] | None,
    *,
    esn_stage: str | None,
    account_archetype: str | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Applique les plafonds au scoreBreakdown et renvoie ``(breakdown, notes)``.

    Ne mute JAMAIS l'entrée (le breakdown d'origine reste lisible pour un debug
    « qu'avait dit le modèle ? »). ``notes`` porte une phrase par axe abaissé,
    citant la règle et le profil — c'est ce qui rend le score explicable au
    commercial plutôt qu'« un joli chiffre Claude »."""
    items = [dict(item) for item in (breakdown or []) if isinstance(item, Mapping)]
    caps = esn_fit_caps(esn_stage, account_archetype)
    if not caps:
        return items, []

    notes: list[str] = []
    for item in items:
        axis = str(item.get("axis") or "")
        cap = caps.get(axis)
        if cap is None:
            continue
        try:
            points = int(item.get("points") or 0)
        except (TypeError, ValueError):
            continue
        if points <= cap:
            continue
        item["points"] = cap
        item["esnFitCapped"] = True
        notes.append(
            f"{_AXIS_RULE_LABEL[axis]} plafonnée à {cap}/5 : une ESN au stade "
            f"« {esn_stage} » n'a ni l'accès ni la capacité d'un compte de type "
            f"« {account_archetype} » sans preuve contraire."
        )
    return items, notes
