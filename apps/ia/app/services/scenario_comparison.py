"""#3214 (LAU-FINAL-220) — LE COMPARATEUR DE SCÉNARIOS COMMERCIAUX.

## Ce que ce module N'EST PAS

Bellum n'a aucun moteur capable de CALCULER un potentiel, un risque ou un
« ROI IA » pour un chemin hypothétique (« et si je passe par une ESN
partenaire ? ») — ce sont des jugements qualitatifs, propres à chaque compte
et chaque tour de conversation. Ce module ne les calcule donc pas : comme
`ask_clarification` / `offer_reply_options` (`chat_tools.py`), les scénarios
sont NOMMÉS par le modèle dans un appel d'outil TYPÉ, et cette fonction ne
fait que les BORNER — rien n'est extrait d'une phrase, rien n'est deviné.

## Les trois gardes de l'issue

1. **#220.6 (NO-GO)** — comparer, c'est mettre au moins DEUX chemins côte à
   côte. Un appel à un seul scénario est refusé plutôt que rendu : c'est
   exactement le NO-GO de l'issue, une réponse générique à « et si... » qui ne
   confronte rien à ce qui a déjà été étudié.
2. **#220.3** — chaque champ de contenu n'accepte qu'une CHAÎNE. Un nombre y
   serait un ROI ou une probabilité de closing inventés (six fois refusés,
   `CLAUDE.md` § Doctrine) : il est ignoré plutôt que reformaté en texte, pour
   qu'un `72` glissé dans `potential_value` n'atterrisse jamais à l'écran
   comme s'il avait un sens.
3. **#220.4** — `most_informative_scenario` doit désigner EXACTEMENT le label
   d'un des scénarios comparés. La règle de l'issue (« le premier test le plus
   informatif, pas obligatoirement le scénario au potentiel maximum ») n'a de
   sens que si ce choix pointe vers un scénario réellement posé sur la table —
   jamais un favori nommé à côté.
"""

from __future__ import annotations

from typing import Any

SCENARIO_LABEL_MAX = 60
SCENARIO_FIELD_MAX = 400
MIN_SCENARIOS = 2
MAX_SCENARIOS = 4

#: Les champs de contenu de #220.2 (les treize de l'issue), `label` et
#: `hypothesis` à part parce qu'ils sont obligatoires — les autres sont
#: omis plutôt qu'inventés quand la matière manque (« non mesuré » ≠ vide
#: rempli au hasard).
SCENARIO_TEXT_FIELDS: tuple[str, ...] = (
    "changed_constraints",
    "unchanged_constraints",
    "required_evidence",
    "accounts_impacted",
    "expected_effort",
    "time_to_learning",
    "access_path",
    "potential_value",
    "risks",
    "missing_information",
    "recommended_first_test",
)


def _bounded_text(raw: Any, cap: int) -> str | None:
    """Une chaîne SEULE, bornée — jamais un nombre converti en texte (#220.3) :
    un ``72`` resterait un ROI inventé même écrit ``"72"``."""
    if not isinstance(raw, str):
        return None
    text = raw.strip()[:cap]
    return text or None


def _bound_scenario(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    label = _bounded_text(raw.get("label"), SCENARIO_LABEL_MAX)
    hypothesis = _bounded_text(raw.get("hypothesis"), SCENARIO_FIELD_MAX)
    if not label or not hypothesis:
        # Un scénario sans nom ni hypothèse n'est pas un scénario — refusé
        # plutôt que rendu à moitié rempli.
        return None
    scenario: dict[str, Any] = {"label": label, "hypothesis": hypothesis}
    for field in SCENARIO_TEXT_FIELDS:
        value = _bounded_text(raw.get(field), SCENARIO_FIELD_MAX)
        if value is not None:
            scenario[field] = value
    reversible = raw.get("reversible")
    if isinstance(reversible, bool):
        scenario["reversible"] = reversible
    # Un `reversible` absent ou non booléen reste absent : « non mesuré »
    # n'est jamais tacitement `False` (doctrine GA-18/GA-19).
    return scenario


def bound_scenarios(raw: Any) -> list[dict[str, Any]]:
    """Les scénarios valides de `raw`, bornés — au plus quatre, comme le
    contrat `comparison` qui les rendra (`ComparisonBlock`, `columns` ≤ 4)."""
    out: list[dict[str, Any]] = []
    for item in raw if isinstance(raw, list) else []:
        scenario = _bound_scenario(item)
        if scenario is not None:
            out.append(scenario)
        if len(out) >= MAX_SCENARIOS:
            break
    return out


def scenario_delta(scenarios: list[dict[str, Any]]) -> dict[str, Any]:
    """#3232 / #220.5 (lot Q03, 30/09) — le DELTA entre les scénarios : ce qui
    les distingue, jamais une fiche complète répétée par colonne.

    Pour chaque champ de contenu (et `reversible`) posé sur au moins un
    scénario :

    - identique sur TOUS les scénarios (donc posé partout) → `shared`, dit UNE
      fois ;
    - sinon → `differs`, une valeur par scénario, `None` pour un scénario qui ne
      l'a pas posé (« non évalué », jamais un vide rempli — GA-18/GA-19).

    Un champ posé sur un SEUL scénario n'est jamais « partagé » : il est non
    évalué ailleurs, donc il diffère. Calcul PUR sur ce que le modèle a nommé —
    aucune lecture de compte, aucun nombre : la garde #220.3 a déjà écarté
    tout ce qui n'est pas une chaîne.
    """
    shared: list[dict[str, Any]] = []
    differs: list[dict[str, Any]] = []
    for field in (*SCENARIO_TEXT_FIELDS, "reversible"):
        values = {scenario["label"]: scenario.get(field) for scenario in scenarios}
        posed = [v for v in values.values() if v is not None]
        if not posed:
            continue
        if len(posed) == len(scenarios) and all(v == posed[0] for v in posed):
            shared.append({"field": field, "text": posed[0]})
        else:
            differs.append({"field": field, "values": values})
    return {"shared": shared, "differs": differs}


async def compare_scenarios(tool_input: dict[str, Any], user_id: str) -> dict[str, Any]:
    """Exécuteur de l'outil `compare_scenarios` — voir les trois gardes en
    tête de module. Renvoie `{"error": ...}` si l'une d'elles n'est pas
    respectée, sinon la comparaison bornée, prête pour la carte `comparison`.

    #220.5 (reste, épopée #3232) — le MÊME jeu de scénarios (mêmes labels,
    mêmes hypothèses et champs bornés) redemandé par le MÊME utilisateur dans
    la fenêtre du cache (`market_memory_reuse_cache`, cinq minutes) revient
    tel quel, marqué `reused_from_memory` : Laura ne redécrit jamais de zéro
    ce qui vient d'être posé sur la table.

    #3232 (lot Q03, 30/09) — le résultat porte aussi `delta`
    (`scenario_delta`) : ce qui est commun se dit une fois, ce qui diffère se
    dit par scénario. **Tranché sans Louis** : le « delta » est calculé sur les
    faits que le modèle a posés pour chaque scénario (le seul jeu de faits que
    l'outil reçoit), pas sur une relecture de la Market Memory — Laura
    l'interroge déjà via `search_market_memory`, et relire la source ici dirait
    qu'un scénario s'appuie sur une lecture qu'il n'a pas faite.
    """
    scenarios = bound_scenarios(tool_input.get("scenarios"))
    if len(scenarios) < MIN_SCENARIOS:
        return {
            "error": (
                "Il faut au moins deux scénarios à comparer, chacun avec un label et une "
                "hypothèse — dont, si la conversation en a déjà étudié un, le scénario DÉJÀ "
                "établi : ne repars jamais de zéro sur un « et si... »."
            )
        }
    labels = {scenario["label"] for scenario in scenarios}
    most_informative = _bounded_text(tool_input.get("most_informative_scenario"), SCENARIO_LABEL_MAX)
    if not most_informative or most_informative not in labels:
        return {
            "error": (
                "`most_informative_scenario` doit reprendre exactement le label d'un des "
                "scénarios comparés — celui dont le premier test apprend le plus, pas forcément "
                "celui au potentiel le plus élevé."
            )
        }

    from app.services import market_memory_reuse_cache

    cache_payload = {"scenarios": scenarios, "most_informative_scenario": most_informative}
    cached = await market_memory_reuse_cache.get(user_id, "scenario", cache_payload)
    if cached is not None:
        result = dict(cached["comparison"])
        result["reused_from_memory"] = True
        return result

    result = {
        "status": "scenario_comparison",
        "scenarios": scenarios,
        "most_informative_scenario": most_informative,
        "delta": scenario_delta(scenarios),
    }
    await market_memory_reuse_cache.put(user_id, "scenario", cache_payload, {"status": "ok", "comparison": result})
    return result
