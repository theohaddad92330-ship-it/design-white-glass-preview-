"""#3201 — CONSTRAINT CONSISTENCY RESOLVER (LAU-FINAL-207).

Le retour bêta décrit un « graphe de contraintes » complet (type, priorité,
hard/soft, explicite/inférée, `compatible_with`, `conflicts_with`,
`relaxation_cost`, `business_impact`, 17 types nommés) extrait de la
conversation par le modèle. Ce module n'extrait rien lui-même — l'extraction
sémantique reste le travail de Laura, dans le tour de conversation, pas d'un
classifieur Python qui devinerait un « conflits_with » sur du texte libre.

Ce qu'il tient, c'est la part DÉTERMINISTE et VÉRIFIABLE du comportement
demandé, sur le SEUL graphe de contraintes qui a une forme fixe côté code :
les critères de `run_account_search` (`sectors`, `department`, `headcount`,
`keywords`). Sur zéro résultat ou un résultat très mince, il répond à deux
questions du ticket :

* quelle est la contrainte la PLUS restrictive parmi celles posées (RELAXATION
  CONTRÔLÉE — « identifier la contrainte la plus restrictive, ne pas
  supprimer toutes les contraintes ») ;
* faut-il prévenir sans bloquer, ou proposer un relâchement précis (le
  ticket distingue les deux : « réduisent fortement » se dit et continue,
  « contradictoires/zéro résultat » propose un relâchement NOMMÉ).

Ni l'un ni l'autre ne choisit à la place de l'utilisateur : les deux
fonctions rendent une PROPOSITION texte + le critère visé, jamais une
exécution — l'appelant (`_run_account_search`) ne retire rien tout seul.
"""

from __future__ import annotations

from collections.abc import Mapping

#: `keywords` cible une raison sociale précise (recherche par NOM) : ce n'est
#: pas une contrainte de MARCHÉ qu'on relâche, c'est la question elle-même.
#: Le proposer en relâchement transformerait « trouve Michelin » en une
#: recherche par secteur — exactement l'INTERDICTION « transformer une
#: startup en n'importe quelle TPE » généralisée à toute recherche nommée.
_RELAXATION_CANDIDATES: dict[str, int] = {
    "headcount": 3,
    "department": 2,
    "sectors": 1,
}

_CRITERION_LABELS: dict[str, dict[str, str]] = {
    "headcount": {"fr": "la tranche d'effectif", "en": "the headcount band"},
    "department": {"fr": "le département", "en": "the department"},
    "sectors": {"fr": "les secteurs", "en": "the sectors"},
}


def _lang(language: str | None) -> str:
    return "fr" if (language or "fr").lower().startswith("fr") else "en"


def _active_candidates(criteria: Mapping[str, object]) -> list[str]:
    """Les critères de `_RELAXATION_CANDIDATES` réellement POSÉS dans `criteria`,
    dans l'ordre de restrictivité décroissante. `keywords` n'y entre jamais
    (voir docstring du module)."""
    active = [key for key in _RELAXATION_CANDIDATES if criteria.get(key)]
    return sorted(active, key=lambda key: _RELAXATION_CANDIDATES[key], reverse=True)


def most_restrictive_criterion(criteria: Mapping[str, object]) -> str | None:
    """Le critère posé le plus susceptible d'avoir écrasé le marché, ou
    ``None`` si moins de deux critères combinables sont posés — une seule
    contrainte n'est jamais « la plus restrictive », elle est la seule."""
    active = _active_candidates(criteria)
    return active[0] if len(active) >= 2 else None


def relaxation_suggestion(criteria: Mapping[str, object], *, language: str | None = "fr") -> dict[str, object] | None:
    """#3201.6 — RELAXATION CONTRÔLÉE, sur zéro résultat.

    Rend ``{"criterion", "current_value", "message"}`` nommant LE critère
    identifié et CE QUI CHANGERAIT si on le retire — jamais un « élargis
    l'un d'eux » vague, et jamais toutes les contraintes à la fois
    (INTERDICTIONS : « enlever silencieusement la région » reste exclu tant
    que ce n'est qu'une proposition en attente de validation, jamais une
    exécution). ``None`` quand un seul critère est posé : il n'y a rien à
    arbitrer, la relaxation reviendrait à supprimer la seule question posée.
    """
    criterion = most_restrictive_criterion(criteria)
    if criterion is None:
        return None
    lang = _lang(language)
    label = _CRITERION_LABELS[criterion][lang]
    value = criteria.get(criterion)
    others = [key for key in _active_candidates(criteria) if key != criterion]
    others_label = ", ".join(_CRITERION_LABELS[key][lang] for key in others)
    if lang == "fr":
        message = (
            f"Sur ces critères combinés, {label} (« {value} ») est celui qui restreint le plus le marché. "
            f"Relance TOI-MÊME, dans le MÊME tour : élargis-le, garde {others_label}, et dis ce que tu as "
            "élargi — jamais en silence, jamais en attendant une permission (#3343)."
        )
    else:
        message = (
            f'Of these combined criteria, {label} ("{value}") narrows the market the most. '
            f"Relaunch YOURSELF in the SAME turn: widen it, keep {others_label}, and say what you widened — "
            "never silently, never waiting for permission (#3343)."
        )
    return {"criterion": criterion, "current_value": value, "message": message}


def narrow_result_warning(
    criteria: Mapping[str, object], count: int, *, language: str | None = "fr", threshold: int = 4
) -> str | None:
    """#3201 COMPORTEMENT — « réduisent fortement » : prévenir BRIÈVEMENT et
    CONTINUER, à ne pas confondre avec la relaxation (zéro résultat).
    ``None`` sans au moins deux critères combinés ou au-dessus du seuil : un
    résultat mince sur un seul critère est juste le marché, pas une
    combinaison à expliquer."""
    if count <= 0 or count > threshold:
        return None
    active = _active_candidates(criteria)
    if len(active) < 2:
        return None
    lang = _lang(language)
    labels = ", ".join(_CRITERION_LABELS[key][lang] for key in active)
    if lang == "fr":
        return (
            f"Ces critères combinés ({labels}) réduisent fortement le marché : {count} résultat(s) défendable(s), "
            "je continue avec eux plutôt que de m'arrêter."
        )
    return (
        f"These combined criteria ({labels}) narrow the market a lot: {count} defensible result(s), "
        "continuing with them rather than stopping."
    )


#: #3343 — du plus au moins restrictif, pour les critères d'une recherche de
#: PERSONNES (``search_workspace_contacts``) : un lieu précis écrase le marché
#: avant une fonction rare, avant un secteur.
_CONTACT_RELAXATION_ORDER: tuple[str, ...] = (
    "location",
    "contacts_fresh_within_months",
    "group_role",
    "sector",
    "company",
    "role",
    "query",
)

_SECOND_PASS_LABELS: dict[str, dict[str, str]] = {
    "location": {"fr": "le lieu", "en": "the location"},
    "contacts_fresh_within_months": {"fr": "la fraîcheur des contacts", "en": "the contact freshness"},
    "group_role": {"fr": "le type de compte (groupe/filiale)", "en": "the account type (group/subsidiary)"},
    "sector": {"fr": "le secteur", "en": "the sector"},
    "company": {"fr": "l'entreprise", "en": "the company"},
    "role": {"fr": "le rôle d'achat", "en": "the buying role"},
    "query": {"fr": "l'intitulé de fonction", "en": "the job title"},
}


def second_pass_directive(scope: Mapping[str, object], *, language: str | None = "fr") -> dict[str, object]:
    """#3343 — sur ZÉRO résultat, la consigne portée PAR le résultat vide.

    Le modèle relit le résultat au moment où il rédige sa réponse : c'est là,
    pas dans un bloc de fil lu plus tôt, que « relance toi-même » doit se
    trouver. Nomme le critère le plus restrictif posé, ordonne UN second
    passage élargi dans le MÊME tour et de DIRE ce qui a été élargi. Jamais
    toutes les contraintes à la fois, jamais en silence, jamais une attente.
    """
    lang = _lang(language)
    criterion = next((key for key in _CONTACT_RELAXATION_ORDER if scope.get(key)), None)
    if criterion is None:
        criterion = next((str(key) for key, value in scope.items() if value), "query")
    value = scope.get(criterion)
    label = _SECOND_PASS_LABELS.get(criterion, {"fr": criterion, "en": criterion})[lang]
    if lang == "fr":
        message = (
            f"Zéro résultat sur ces filtres. Le plus restrictif est {label} (« {value} »). Ne demande PAS la "
            "permission : relance TOI-MÊME un second passage élargi dans le MÊME tour (élargis ce critère — "
            "une ville vers sa région, un intitulé vers ses voisins — et garde les autres), puis présente les "
            "résultats en disant ce que tu as élargi. Si ce second passage est vide aussi, dis ce qui a été "
            "cherché et quelle autre stratégie tu prends. N'écris jamais « je peux poursuivre avec une "
            "recherche élargie »."
        )
    else:
        message = (
            f'Zero results on these filters. The most restrictive is {label} ("{value}"). Do NOT ask permission: '
            "run a widened second pass YOURSELF in the SAME turn (widen that criterion — a city to its region, "
            "a title to its neighbours — and keep the others), then present the results saying what you "
            "widened. If that second pass is empty too, say what was searched and which other strategy you "
            'take. Never write "I can continue with a wider search".'
        )
    return {"criterion": criterion, "current_value": value, "message": message}


__all__ = [
    "second_pass_directive",
    "most_restrictive_criterion",
    "relaxation_suggestion",
    "narrow_result_warning",
]
