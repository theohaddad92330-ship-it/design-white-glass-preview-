"""#3867 (BEL-LAU-1008-016, bêta 08/10) — la consigne du tour « fais-moi toute
la stratégie » / « quelle est la stratégie complète sur ce compte ».

Recette bêta du 08/10 (cas BPCE) : à « fais-moi toute la stratégie » sur un
objectif confirmé (« premier démarrage sous 60 jours »), Laura répondait par
une liste de pages publiques ou d'étapes génériques — jamais une
recommandation avec de VRAIS arbitrages, jamais calée sur le délai ou les
moyens déclarés par la personne, et sans préparer les premières actions même
quand la demande les incluait. Aucun bloc existant ne portait cette consigne :
``_BLOCK_METHOD_DISCIPLINE`` (bellum_advisor.py) interdit de RÉCITER les 5P
par leur nom, mais ne dit rien sur le fait de les APPLIQUER tous les cinq à ce
tour précis ; ``BLOCK_RECOMMENDATION_GUARDRAILS`` (laura_recommendation_
guardrails.py) porte le format d'UNE recommandation, pas celui d'un plan
entier ; ``_BLOCK_MARKET_MEMORY`` (RÈGLE TEMPORELLE) couvre un état ACTUEL,
jamais une DURÉE promise pour une opération future.

Les cinq dimensions sont nommées en clair (périmètre, problème, personnes,
preuves, passage) — jamais « 5P » ni « SalesConnect » : la discipline de
méthode (#3255) interdit déjà de nommer la méthode sans demande explicite,
cette consigne ne la contredit pas.

``""`` pour tout tour qui ne demande pas la stratégie complète — rien n'est
inventé hors de ce tour précis."""

from __future__ import annotations

import unicodedata

_FULL_STRATEGY_MARKERS: tuple[str, ...] = (
    "toute la strategie",
    "strategie complete",
    "strategie commerciale complete",
    "fais-moi toute la strategie",
    "fais moi toute la strategie",
    "produis la strategie",
    "quelle est la strategie",
    "plan d'attaque complet",
    "plan de conquete complet",
    "full strategy",
    "complete strategy",
    "entire strategy",
)


def _normalize(text: str) -> str:
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()


def full_strategy_turn_block(message: str, strategy5p: object = None, english: bool = False) -> str:
    """#3867 — la réponse à « fais-moi toute la stratégie » couvre les cinq
    dimensions, arbitre vraiment, se cale sur le délai/les moyens déclarés
    dans CE message, prépare les premières actions quand elles sont demandées,
    et ne garantit aucun délai de démarrage ni résultat commercial.

    ``strategy5p`` est la même projection que ``laura_method_signal.
    resolve_5p_method_signal`` (``account_data["strategy5p"]``) — réutilisée,
    jamais recalculée : seule la dimension à cadrer en premier, si connue, est
    nommée EN CLAIR (jamais « 5P »)."""
    if not any(marker in _normalize(message) for marker in _FULL_STRATEGY_MARKERS):
        return ""

    dimension = ""
    if isinstance(strategy5p, dict):
        raw = strategy5p.get("next_action_dimension")
        dimension = {
            "perimeter": "le périmètre" if not english else "the scope",
            "problem": "le problème" if not english else "the problem",
            "people": "les personnes" if not english else "the people",
            "proof": "les preuves" if not english else "the proof",
            "passage": "le passage" if not english else "the entry point",
        }.get(raw, "") if isinstance(raw, str) else ""

    if english:
        lines = [
            "\n\nFULL STRATEGY REQUESTED (this turn's instruction) — your answer is a recommendation with REAL "
            "trade-offs, never a list of public pages or future steps on their own. You cover all five dimensions "
            "without naming them as a checklist or a completeness form: the scope to work, the problem to "
            "qualify, the useful people and roles, the proof this ESN can mobilize, and the entry point.",
            "You size the plan to the TIME and MEANS this message actually states (a stated number of "
            "priorities, a stated lack of time): you never propose fifty approaches when three were asked for or "
            "when little time is available.",
            "When preparing first actions was part of this request, you prepare them now (the matching tool "
            "call), you never end on an offer to prepare them later.",
            "A calendar here is a plan of ACTION AND DECISION, never a promise of signature: you never "
            "guarantee a start delay or a commercial outcome without a stated basis. A referencing duration "
            "quoted from an older memorized note is not a guaranteed duration for this operation — you name it "
            "as what it is, a past note, and you distinguish the milestones you control from the client's own "
            "decisions.",
        ]
        if dimension:
            lines.append(f"The dimension to frame first, from the account's own reading, is {dimension}.")
        return "\n".join(lines)

    lines = [
        "\n\nSTRATÉGIE COMPLÈTE DEMANDÉE (consigne de ce tour) — ta réponse est une recommandation avec de VRAIS "
        "arbitrages, jamais une liste de pages publiques ou d'étapes futures livrée seule. Tu couvres les cinq "
        "dimensions sans les nommer comme une checklist ni un formulaire de complétude : le périmètre à "
        "travailler, le problème ou sujet à qualifier, les personnes et rôles utiles, les preuves que l'ESN peut "
        "mobiliser, et le passage ou la voie d'entrée.",
        "Tu calibres le plan sur le DÉLAI et les MOYENS que CE message déclare réellement (un nombre de "
        "priorités demandé, un temps limité annoncé) : tu ne proposes jamais cinquante approches quand trois "
        "ont été demandées ou que le temps manque.",
        "Quand préparer les premières actions faisait partie de la demande, tu les prépares MAINTENANT (l'appel "
        "d'outil correspondant) — tu ne termines jamais sur une offre de les préparer plus tard.",
        "Le calendrier que tu donnes est un plan D'ACTION ET DE DÉCISION, jamais une promesse de signature : "
        "aucun délai de démarrage ni résultat commercial n'est garanti sans fondement déclaré. Une durée de "
        "référencement citée dans un ancien élément mémorisé n'est PAS une durée garantie pour cette opération — "
        "tu la nommes pour ce qu'elle est, une note passée, et tu distingues les jalons que l'ESN maîtrise des "
        "décisions qui restent celles du client.",
    ]
    if dimension:
        lines.append(f"La dimension à cadrer en premier, d'après la lecture du compte, est {dimension}.")
    return "\n".join(lines)
