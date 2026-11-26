"""Le focus du plan d'action — combien de place chaque axe obtient, PAR ESPACE.

LE DÉFAUT CORRIGÉ
-----------------
``_PLAN_LIST_CAPS`` plafonnait la charge utile du plan axe par axe, en dur, pour
tout le monde. Ces plafonds ne sont pas cosmétiques : ce qui n'entre pas dans le
plafond n'entre pas dans le plan. ``itChallenges`` valait 6 pour TOUTES les ESN
— y compris celles qui vendent de l'ingénierie industrielle, du conseil RH ou de
la finance. C'est un **prisme IT par défaut**, appliqué à des métiers qui n'en
sont pas ; l'exigence dit exactement l'inverse.

CE QUI CHANGE, ET CE QUI NE CHANGE PAS
--------------------------------------
Les poids deviennent réglables par espace, et le défaut reste EXACTEMENT la table
d'aujourd'hui : un espace qui n'a rien réglé obtient un plan byte-identique à
celui d'avant ce lot. On ne profite pas d'une mise en configuration pour changer
la valeur au passage — sinon plus personne ne sait laquelle des deux
modifications a produit l'effet observé.

⚠️ CE FICHIER EST UNE COPIE
---------------------------
La source de vérité est ``packages/contracts/src/schemas/org-focus-weights.ts``
(un seuil vit dans le contrat, GA-26). Cette copie existe parce que
``packages/contracts`` n'est PAS dans l'image déployée du service IA — son
contexte de build est ``apps/ia``, exactement la raison qui a produit la copie
embarquée des JSON Schemas (``app/contracts/shared_schemas.py``).

Une copie dérive. La garde ``tests/test_focus_weights.py`` LIT le fichier
TypeScript et compare valeur par valeur : toute divergence fait échouer la CI, et
elle NOMME l'axe fautif.
"""

from __future__ import annotations

from typing import Any

#: Les onze axes plafonnés, dans l'ordre du contrat. Ajouts en FIN.
FOCUS_AXES: tuple[str, ...] = (
    "entitiesExhaustive",
    "priorityPerimeters",
    "recentSignals",
    "budgetSignals",
    "competitors",
    "peopleMentioned",
    "itChallenges",
    "pains",
    "angles",
    "objections",
    "powerQuestions",
)

#: Les valeurs EN VIGUEUR, identiques à celles du contrat TypeScript.
FOCUS_DEFAULT_WEIGHTS: dict[str, int] = {
    "entitiesExhaustive": 8,
    "priorityPerimeters": 4,
    "recentSignals": 6,
    "budgetSignals": 5,
    "competitors": 5,
    "peopleMentioned": 8,
    "itChallenges": 6,
    "pains": 6,
    "angles": 5,
    "objections": 5,
    "powerQuestions": 5,
}

#: Au-delà, le bloc mis en cache et relu par les onze sous-appels du plan
#: recommence à coûter ce qu'il coûtait avant qu'on ne le plafonne.
FOCUS_WEIGHT_MAX = 20


def resolve_focus_weights(overrides: Any = None) -> dict[str, int]:
    """Les poids EFFECTIFS : les défauts, écrasés par ce que l'espace a réglé.

    ``0`` est une valeur LÉGITIME, et c'est le cœur du sujet : une ESN qui ne
    vend pas d'IT doit pouvoir retirer complètement ``itChallenges`` de son plan,
    pas seulement le réduire.

    Un axe inconnu, ou une valeur illisible, est ignoré EN SILENCE — un réglage
    périmé ne doit pas empêcher de produire un plan. Ce n'est pas une donnée
    inventée : on retombe sur le défaut, qui est le comportement documenté.
    """
    resolved = dict(FOCUS_DEFAULT_WEIGHTS)
    if not isinstance(overrides, dict):
        return resolved
    for axis in FOCUS_AXES:
        value = overrides.get(axis)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        resolved[axis] = max(0, min(FOCUS_WEIGHT_MAX, int(value)))
    return resolved
