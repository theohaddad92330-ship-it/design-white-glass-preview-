"""Les couches d'un signal : fait daté → impact → action (recette finale §25-26).

Deux reproches distincts dans la même capture.

Le premier : « Seulement 6 signaux, dont un ancien : la profondeur et la
politique de fraîcheur sont insuffisantes pour un groupe de cette taille. » Un
signal de 2021 occupait une des six places visibles pendant qu'on affichait
« signaux récents ». La classification de fraîcheur existait déjà et le disait
correctement — personne ne s'en servait pour ORDONNER.

Le second, plus grave : « Le bloc "ce que cela implique commercialement" est
vide : le signal n'est pas transformé en impact, interlocuteur et action. » Un
signal sans implication est une coupure de presse. Le produit ne vend pas des
coupures de presse.

Ce module répond aux deux, sans appel modèle. L'implication est DÉRIVÉE du type
de signal, pas inventée : on ne prétend pas connaître la stratégie du compte, on
énonce ce qu'un budget confirmé, un recrutement massif ou une nomination
impliquent mécaniquement pour une ESN. Quand on ne sait pas, on le dit.
"""

from __future__ import annotations

import re
from typing import Mapping, Sequence

from datetime import date

from .signal_freshness import (
    FRESHNESS_ARCHIVE,
    FRESHNESS_CURRENT,
    FRESHNESS_UNDATED,
    JOB_OFFER_SIGNAL_TYPE,
    stamp_job_offers_freshness,
    stamp_signals_freshness,
)

#: Combien de signaux la vue principale montre. Le reste n'est pas jeté : il
#: part dans `more`, que l'écran ouvre avec « Voir les autres ». Le rapport
#: demande explicitement de collecter davantage PUIS d'afficher les plus
#: pertinents — pas de collecter moins.
VISIBLE_SIGNALS = 8

#: L'ordre de priorité des catégories. Un budget confirmé et une nomination ne
#: se valent pas : le premier ouvre une fenêtre d'achat, la seconde ouvre une
#: porte. Les deux comptent, mais pas dans le même ordre.
#:
#: `achat` passe EN PREMIER, et c'est le seul cas où l'ordre ne suit pas
#: l'ampleur mais la contrainte. Une consultation ouverte porte une échéance
#: FERME : passé la date, l'accès se referme pour toute la durée du marché. Un
#: budget, lui, s'arbitre dans une fenêtre — on peut arriver un peu tard. Lire
#: « refonte du SI voyageurs » comme un projet plutôt que comme un appel
#: d'offres fait manquer la seule date qui compte, et c'est précisément le cas
#: d'un opérateur public, où l'accès passe par un marché et pas par un décideur.
_CATEGORY_PRIORITY = (
    "achat",
    "budget",
    "projet",
    "rachat_fusion",
    "recrutement_dirigeant",
    "recrutement",
    "nomination",
    "organisation",
    "incident",
)

_CATEGORY_PATTERNS: dict[str, re.Pattern[str]] = {
    "budget": re.compile(r"\b(budget|investissement|enveloppe|financement|lev[ée]e|r[ée]sultats?|b[ée]n[ée]fice)\b", re.I),
    "projet": re.compile(r"\b(projet|programme|chantier|migration|transformation|refonte|plan\s+strat[ée]gique)\b", re.I),
    "recrutement": re.compile(r"\b(recrutement|recrute|offres?\s+d.emploi|embauche|poste\s+ouvert)\b", re.I),
    "nomination": re.compile(r"\b(nomination|nomm[ée]e?|arriv[ée]e?|prise\s+de\s+fonction|succ[èe]de)\b", re.I),
    # #4732 — rachat, acquisition, fusion : devant « organisation » (et devant « budget » dans le texte
    # d'un même signal, l'ordre de `_CATEGORY_PRIORITY` décide). Le type `acquisition` suffit aussi.
    "rachat_fusion": re.compile(
        r"\b(rachat|rach[èe]te[rz]?|rachet[ée]e?s?|acquisition|acqui[èe]re?|fusion(?:ne|s)?|fusionn[ée]e?s?|absorption|absorb[ée]e?|OPA|OPE|croissance\s+externe)\b",
        re.I,
    ),
    # #4733 — le texte seul ne décide pas : cette catégorie exige le drapeau `executive_role`.
    "recrutement_dirigeant": re.compile(r"(?!)"),
    "organisation": re.compile(r"\b(r[ée]organisation|cession|filiale|cr[ée]ation\s+de)\b", re.I),
    "achat": re.compile(r"\b(appel\s+d.offres?|march[ée]\s+public|consultation|r[ée]f[ée]rencement|panel)\b", re.I),
    "incident": re.compile(r"\b(incident|panne|cyberattaque|faille|amende|sanction|contentieux)\b", re.I),
}

#: Ce qu'un signal IMPLIQUE, par catégorie : l'ouverture qu'il crée, la famille
#: d'interlocuteur qu'il désigne, et l'action qui en découle.
#:
#: Écrit comme un fait mécanique et non comme une prédiction. « Un budget
#: confirmé ouvre une fenêtre d'achat » est vrai de tout budget confirmé ; « ce
#: compte va acheter » ne l'est d'aucun. La nuance est ce qui sépare une lecture
#: utile d'une promesse invérifiable.
_IMPLICATIONS: dict[str, dict[str, str]] = {
    "budget": {
        "impact": "Une enveloppe confirmée ouvre une fenêtre d'achat datée : les arbitrages se font dans les semaines qui suivent l'annonce.",
        "who": "Le porteur du budget de la direction concernée, et l'acheteur qui cadrera le référencement.",
        "action": "Demander où en est l'arbitrage et sur quel périmètre, avant que le panel ne soit fermé.",
    },
    "projet": {
        "impact": "Un programme nommé crée un besoin de compétences daté, avec un responsable identifiable.",
        "who": "Le directeur de programme, et le responsable technique du périmètre.",
        "action": "Se positionner sur un lot précis du programme plutôt que sur le programme entier.",
    },
    "recrutement": {
        "impact": "Des postes ouverts non pourvus signalent une charge que l'équipe ne couvre pas — c'est la porte d'entrée la plus concrète pour une ESN.",
        "who": "Le manager qui recrute, pas les ressources humaines : c'est lui qui subit le retard.",
        "action": "Proposer un renfort sur le poste précis publié, avec un profil disponible et daté.",
    },
    "nomination": {
        "impact": "Une prise de fonction ouvre une fenêtre de quelques mois : un nouvel arrivant révise les partenaires en place.",
        "who": "La personne nommée, et son N-1 qui prépare ses arbitrages.",
        "action": "Entrer par un sujet que la personne a elle-même annoncé, pas par une présentation d'entreprise.",
    },
    "rachat_fusion": {
        "impact": "Un rachat ou une fusion rapproche deux systèmes d'information et deux organisations : intégration, convergence d'outils et revue des prestataires suivent l'annonce.",
        "who": "Le responsable de l'intégration (ou de la DSI) côté acquéreur, et son homologue côté société rachetée.",
        "action": "Proposer d'abord un cadrage d'intégration ou de cartographie du SI, avant tout renfort — le périmètre bouge encore.",
    },
    "recrutement_dirigeant": {
        "impact": "Une entreprise qui recrute un dirigeant des opérations ou des finances réorganise : le futur arrivant révisera outils, processus et partenaires dans ses premiers mois.",
        "who": "Le dirigeant recherché (futur interlocuteur) et le directeur général qui porte la réorganisation.",
        "action": "Préparer une approche par le sujet de transformation que le poste annonce, sans attendre la prise de fonction.",
    },
    "organisation": {
        "impact": "Une réorganisation redistribue les périmètres et les budgets : les interlocuteurs d'hier ne décident plus forcément.",
        "who": "Le responsable du périmètre créé ou fusionné.",
        "action": "Re-cartographier avant d'agir — une relance sur l'ancien organigramme se voit.",
    },
    "achat": {
        "impact": "Une consultation ouverte est une échéance ferme : passé la date, l'accès se referme pour la durée du marché.",
        "who": "Les achats, et le prescripteur métier qui a écrit le besoin.",
        "action": "Vérifier les conditions d'accès au panel avant d'investir dans une réponse.",
    },
    "incident": {
        "impact": "Un incident public crée une urgence et un budget non planifié, mais aussi une méfiance envers les sollicitations opportunistes.",
        "who": "Le responsable du domaine touché.",
        "action": "N'entrer que si l'expertise est démontrable sur ce point précis — sinon s'abstenir.",
    },
}

#: Ce qu'on écrit quand la catégorie n'est pas reconnue. Dire « on ne sait pas
#: quoi en faire » est plus utile qu'une phrase creuse : le commercial arrête de
#: chercher un sens qui n'y est pas, et le trou se voit assez pour être comblé.
_UNKNOWN_IMPLICATION = {
    "impact": "Ce signal est daté et sourcé, mais nous ne savons pas encore quelle ouverture commerciale il crée.",
    "who": "À qualifier.",
    "action": "Vérifier auprès d'un contact du périmètre si ce fait a un impact sur ses priorités.",
}


def classify_signal_category(signal: Mapping[str, object]) -> str | None:
    """La catégorie d'un signal, dans l'ordre de priorité — ``None`` si aucune.

    L'ordre du parcours est celui de `_CATEGORY_PRIORITY`, pas celui du texte :
    un signal qui parle de budget ET de recrutement est d'abord un signal de
    budget, parce que c'est l'information qui déplace une décision d'achat.
    """
    if signal.get("executive_role") is True and str(signal.get("type") or "") == "recrutement":
        return "recrutement_dirigeant"
    if str(signal.get("type") or "") == "acquisition":
        return "rachat_fusion"
    blob = " ".join(
        str(signal.get(key) or "") for key in ("signal", "title", "description", "category", "type", "summary")
    )
    if not blob.strip():
        return None
    for category in _CATEGORY_PRIORITY:
        if _CATEGORY_PATTERNS[category].search(blob):
            return category
    return None


def commercial_implication(signal: Mapping[str, object]) -> dict[str, str]:
    """L'impact, l'interlocuteur et l'action que ce signal implique.

    Toujours renseigné — c'est le point du §25 : le bloc « ce que cela implique
    commercialement » ne doit jamais s'afficher vide. Quand la catégorie est
    inconnue, on le DIT plutôt que d'écrire une généralité, parce qu'une
    généralité fait perdre du temps sans que personne ne remarque le trou.
    """
    category = classify_signal_category(signal)
    base = _IMPLICATIONS.get(category or "", _UNKNOWN_IMPLICATION)
    return {**base, "category": category or "inconnu"}


def _sort_key(signal: Mapping[str, object]) -> tuple[int, int, int, str]:
    """Fraîcheur d'abord, puis ce qui change la décision avant le contexte (#3668),
    catégorie ensuite, date enfin (décroissante)."""
    freshness = str(signal.get("freshness") or FRESHNESS_UNDATED)
    freshness_rank = {FRESHNESS_CURRENT: 0, FRESHNESS_UNDATED: 1, FRESHNESS_ARCHIVE: 2}.get(freshness, 1)
    category = classify_signal_category(signal)
    category_rank = _CATEGORY_PRIORITY.index(category) if category in _CATEGORY_PRIORITY else len(_CATEGORY_PRIORITY)
    # Date décroissante : on inverse la chaîne pour trier sans parser.
    date_key = str(signal.get("date") or "")
    context_rank = 1 if signal.get("selectionRole") == "context" else 0
    return (freshness_rank, context_rank, category_rank, date_key)


def layer_signals(
    signals: Sequence[Mapping[str, object]] | None,
    *,
    visible: int = VISIBLE_SIGNALS,
) -> dict[str, object]:
    """Range les signaux en trois couches et remplit leur implication.

    Rend ``{visible, more, historical, counts}`` :

    - ``visible`` — ce que l'écran montre, jamais un archive tant qu'un signal
      courant attend. C'est le cœur du reproche : une place visible occupée par
      un fait de 2021 pendant qu'un fait de juillet 2026 est en dessous.
    - ``more`` — les signaux courants au-delà de la borne, ouverts par « Voir
      les autres ». Collecter plus puis MONTRER les plus pertinents, comme le
      demande le §26 — pas collecter moins.
    - ``historical`` — les archives, dans leur propre section. Elles ne sont pas
      supprimées : un plan stratégique de 2021 encore en cours est un contexte
      utile, il n'est simplement pas un déclencheur.
    """
    items = [dict(s) for s in (signals or []) if isinstance(s, Mapping)]
    for item in items:
        item["implication"] = commercial_implication(item)

    historical = [s for s in items if s.get("freshness") == FRESHNESS_ARCHIVE]
    live = sorted((s for s in items if s.get("freshness") != FRESHNESS_ARCHIVE), key=_sort_key)

    return {
        "visible": live[: max(0, visible)],
        "more": live[max(0, visible) :],
        "historical": sorted(historical, key=_sort_key),
        "counts": {
            "total": len(items),
            "live": len(live),
            "historical": len(historical),
            "hidden": max(0, len(live) - max(0, visible)),
        },
    }


def build_signal_layers(
    recent_signals: Sequence[Mapping[str, object]] | None,
    job_offers: Sequence[Mapping[str, object]] | None,
    *,
    today: date | None = None,
) -> tuple[list[dict], dict[str, object] | None]:
    """Les offres d'emploi passent par l'estampillage ET par les couches (#4760).

    Rend ``(offres estampillées, signalLayers)``. ``signalLayers`` porte les couches
    des signaux (``visible`` / ``more`` / ``historical`` / ``counts``) et, sous la
    clé NOMMÉE ``jobOffers``, celles des offres : une offre de plus de 180 jours
    y est ``historical`` avec sa date réelle. ``None`` quand il n'y a ni signal ni
    offre ; sans offre, la forme est byte-identique à l'ancienne.
    """
    stamped_offers = stamp_job_offers_freshness(job_offers, today=today)
    layers: dict[str, object] | None = None
    if recent_signals:
        layers = layer_signals(stamp_signals_freshness(recent_signals, today=today))
    if stamped_offers:
        # La catégorie « recrutement » est celle de l'offre, quel que soit son intitulé.
        layers = {
            **(layers or {}),
            "jobOffers": layer_signals([{**o, "type": o.get("type") or JOB_OFFER_SIGNAL_TYPE} for o in stamped_offers]),
        }
    return stamped_offers, layers
