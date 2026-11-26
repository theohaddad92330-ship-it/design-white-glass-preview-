"""#3201.1 / #3201.2 / #3201.5 (épopée #3224) — LE GRAPHE DE CONTRAINTES.

Le modèle NOMME les contraintes posées par l'utilisateur via
`note_thread_context.constraints` (vocabulaire fermé de 17 types, #3201.2),
jamais un classifieur Python qui les devinerait d'une phrase — même refus que
`goal`/`facets` (voir `chat_thread_state.py`). Le collecteur les stocke dans
l'état du fil ; ce module tient la part DÉTERMINISTE : `detect_conflicts` lit
les contraintes stockées et repère les contradictions CONNUES (les 6 scénarios
du ticket) avant que Laura choisisse sa question d'arbitrage.

Ce que ce module ne fait pas : trancher. Un conflit rend la proposition de
relâchement (le côté « soft », jamais les deux) ; deux contraintes « hard » ne
relâchent rien, Laura pose UNE question. Aucune probabilité, aucun score.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from typing import Any

#: #3201.2 — les 17 types de contrainte du ticket, miroir exact de l'enum zod.
CONSTRAINT_TYPES: tuple[str, ...] = (
    "geography",
    "size",
    "sector",
    "company_type",
    "purchase_model",
    "referencing",
    "technology",
    "role",
    "seniority",
    "budget",
    "deadline",
    "remote",
    "service_type",
    "expected_volume",
    "proof_level",
    "channel",
    "allowed_source",
)
CONSTRAINT_LABELS: dict[str, str] = {
    "geography": "géographie",
    "size": "taille",
    "sector": "secteur",
    "company_type": "type de société",
    "purchase_model": "modèle d'achat",
    "referencing": "référencement",
    "technology": "technologie",
    "role": "rôle",
    "seniority": "séniorité",
    "budget": "budget",
    "deadline": "délai",
    "remote": "remote",
    "service_type": "type de prestation",
    "expected_volume": "volume attendu",
    "proof_level": "niveau de preuve",
    "channel": "canal",
    "allowed_source": "source autorisée",
}
CONSTRAINT_HARDNESS: tuple[str, ...] = ("hard", "soft")
CONSTRAINT_ORIGINS: tuple[str, ...] = ("explicit", "inferred")
CONSTRAINT_PRIORITIES: tuple[str, ...] = ("primary", "secondary")
CONSTRAINT_RELAXATION_COSTS: tuple[str, ...] = ("low", "medium", "high")
CONSTRAINT_VALUE_MAX = 60
CONSTRAINTS_MAX = len(CONSTRAINT_TYPES)


@dataclass(frozen=True)
class ThreadConstraint:
    """Une contrainte NOMMÉE par le modèle : son type (vocabulaire fermé), sa
    valeur, dure ou souple, explicite ou inférée. Une par type : la nommer de
    nouveau la REMPLACE, comme une facette."""

    constraint_type: str
    value: str
    hardness: str = "hard"
    origin: str = "explicit"
    # #3201.1 (reste) — NOMMÉS par le modèle, jamais devinés : `None` = non nommé,
    # et reste absent du fil (« non nommé » n'est pas une valeur par défaut).
    priority: str | None = None
    relaxation_cost: str | None = None
    business_impact: str | None = None
    # #3224 (lot X36) — le TOUR qui l'a posée, estampillé par le collecteur
    # (jamais nommé par le modèle) ; ``None`` = fil d'avant l'estampille.
    source_turn: int | None = None
    # #3224 (lot X36) — calculés par `detect_conflicts`, jamais nommés : les
    # TYPES des autres contraintes du fil qui contredisent / ne contredisent pas
    # celle-ci. Dérivés → hors du fil, recalculés par `annotate_constraints`.
    conflicts_with: tuple[str, ...] = ()
    compatible_with: tuple[str, ...] = ()

    def to_wire(self) -> dict[str, str | int]:
        wire: dict[str, str | int] = {
            "constraint_type": self.constraint_type,
            "value": self.value,
            "hardness": self.hardness,
            "origin": self.origin,
        }
        if self.priority is not None:
            wire["priority"] = self.priority
        if self.relaxation_cost is not None:
            wire["relaxation_cost"] = self.relaxation_cost
        if self.business_impact is not None:
            wire["business_impact"] = self.business_impact
        if self.source_turn is not None:
            wire["source_turn"] = self.source_turn
        return wire


@dataclass(frozen=True)
class ConstraintConflict:
    rule: str
    first: ThreadConstraint
    second: ThreadConstraint
    reason: str
    #: la contrainte qu'on PROPOSE de relâcher (le côté souple) ; ``None`` quand
    #: les deux sont dures — Laura pose alors la question, sans rien proposer.
    relax: ThreadConstraint | None


def constraint_from_raw(raw: Any) -> ThreadConstraint | None:
    """Lecture tolérante : un type hors vocabulaire ou une valeur vide disparaît."""
    if not isinstance(raw, dict):
        return None
    ctype = raw.get("constraint_type")
    if ctype not in CONSTRAINT_TYPES:
        return None
    value = str(raw.get("value") or "").strip()[:CONSTRAINT_VALUE_MAX]
    if not value:
        return None
    hardness = raw.get("hardness") if raw.get("hardness") in CONSTRAINT_HARDNESS else "hard"
    origin = raw.get("origin") if raw.get("origin") in CONSTRAINT_ORIGINS else "explicit"
    priority = raw.get("priority") if raw.get("priority") in CONSTRAINT_PRIORITIES else None
    cost = raw.get("relaxation_cost") if raw.get("relaxation_cost") in CONSTRAINT_RELAXATION_COSTS else None
    impact = str(raw.get("business_impact") or "").strip()[:CONSTRAINT_VALUE_MAX] or None
    turn = raw.get("source_turn")
    source_turn = turn if isinstance(turn, int) and not isinstance(turn, bool) and turn >= 1 else None
    return ThreadConstraint(
        constraint_type=ctype,
        value=value,
        hardness=hardness,
        origin=origin,
        priority=priority,
        relaxation_cost=cost,
        business_impact=impact,
        source_turn=source_turn,
    )


def constraints_from_raw(raw: Any) -> list[ThreadConstraint]:
    """Une contrainte par type (la dernière nommée gagne), dans l'ordre de `CONSTRAINT_TYPES`."""
    kept: dict[str, ThreadConstraint] = {}
    for item in raw if isinstance(raw, list) else []:
        constraint = constraint_from_raw(item)
        if constraint is not None:
            kept[constraint.constraint_type] = constraint
    return [kept[t] for t in CONSTRAINT_TYPES if t in kept]


def _norm(text: str) -> str:
    stripped = "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s\-_]+", " ", stripped)


def _has(*needles: str) -> Callable[[str], bool]:
    normalised = tuple(_norm(n) for n in needles)
    return lambda value: any(n in value for n in normalised)


def _volume_at_least_50(value: str) -> bool:
    return any(int(n) >= 50 for n in re.findall(r"\d+", value))


def _founded_before_2015(value: str) -> bool:
    return any(int(y) <= 2014 for y in re.findall(r"(?:avant|before)\s+((?:19|20)\d\d)", value))


@dataclass(frozen=True)
class _Rule:
    key: str
    first_types: frozenset[str]
    first: Callable[[str], bool]
    second_types: frozenset[str]
    second: Callable[[str], bool]
    reason: str


_ANY = frozenset(CONSTRAINT_TYPES)

# Les 6 scénarios du ticket (#3201.8). Les formulations « généralement » ne
# sont PAS des probabilités chiffrées : ce sont des raisons, jamais un score.
_RULES: tuple[_Rule, ...] = (
    _Rule(
        "referencement",
        frozenset({"size", "company_type"}),
        _has("grand groupe", "grands groupes", "large group", "cac 40", "cac40"),
        frozenset({"purchase_model", "referencing"}),
        _has("sans referencement", "hors referencement", "non reference", "no referencing", "without referencing"),
        "un grand groupe achète en règle générale via un panel de référencement",
    ),
    _Rule(
        "volume",
        frozenset({"expected_volume"}),
        _volume_at_least_50,
        frozenset({"geography"}),
        _has("petite commune", "petites communes", "village", "small town", "rural"),
        "une petite commune ne contient pas autant de comptes",
    ),
    _Rule(
        "anciennete",
        frozenset({"company_type"}),
        _has("startup", "start up", "jeune pousse"),
        _ANY,
        _founded_before_2015,
        "une startup récente ne peut pas avoir été créée il y a longtemps",
    ),
    _Rule(
        "teletravail",
        frozenset({"remote"}),
        _has("full remote", "100% remote", "teletravail complet", "fully remote"),
        frozenset({"sector", "service_type", "role"}),
        _has("sur site", "on site", "onsite", "presentiel"),
        "une prestation sur site n'est pas du full remote",
    ),
    _Rule(
        "rang",
        frozenset({"company_type", "purchase_model", "service_type"}),
        _has("client final", "end client", "end customer"),
        frozenset({"company_type", "purchase_model", "service_type", "referencing"}),
        _has("rang 2", "rang2", "tier 2", "tier2", "sous traitant", "subcontract"),
        "un client final n'est pas un acheteur de rang 2",
    ),
    _Rule(
        "delai",
        frozenset({"sector"}),
        _has("banque", "bancaire", "bank"),
        frozenset({"deadline"}),
        _has("immediat", "tout de suite", "right away", "immediately"),
        "un compte bancaire ne s'ouvre pas immédiatement",
    ),
)


def _cheaper_soft_side(a: ThreadConstraint, b: ThreadConstraint) -> ThreadConstraint | None:
    """Le côté souple à proposer. Deux côtés souples : le moins coûteux à relâcher
    (coût NOMMÉ par le modèle) ; un coût non nommé ne départage rien — `b`."""
    if a.hardness == "soft" and b.hardness == "soft":
        rank = {cost: i for i, cost in enumerate(CONSTRAINT_RELAXATION_COSTS)}
        if (
            a.relaxation_cost in rank
            and b.relaxation_cost in rank
            and rank[a.relaxation_cost] < rank[b.relaxation_cost]
        ):
            return a
        return b
    return b if b.hardness == "soft" else (a if a.hardness == "soft" else None)


def detect_conflicts(constraints: Sequence[ThreadConstraint]) -> list[ConstraintConflict]:
    """#3201.5 — les contradictions CONNUES entre deux contraintes DISTINCTES.
    Pure : lit seulement ce que le modèle a nommé, ne devine rien d'autre."""
    found: list[ConstraintConflict] = []
    seen: set[tuple[str, str, str]] = set()
    for rule in _RULES:
        for a in constraints:
            if a.constraint_type not in rule.first_types or not rule.first(_norm(a.value)):
                continue
            for b in constraints:
                if b is a or b.constraint_type not in rule.second_types or not rule.second(_norm(b.value)):
                    continue
                marker = (rule.key, a.constraint_type, b.constraint_type)
                if marker in seen:
                    continue
                seen.add(marker)
                relax = _cheaper_soft_side(a, b)
                found.append(ConstraintConflict(rule.key, a, b, rule.reason, relax))
    return found


def annotate_constraints(constraints: Sequence[ThreadConstraint]) -> list[ThreadConstraint]:
    """#3224 (lot X36) — inscrit sur CHAQUE contrainte celles qui la contredisent
    (`detect_conflicts`) et celles avec lesquelles elle est compatible (toutes les
    autres du fil). Idempotent ; ne touche ni la valeur ni le tour."""
    clashing: dict[str, set[str]] = {c.constraint_type: set() for c in constraints}
    for conflict in detect_conflicts(constraints):
        clashing[conflict.first.constraint_type].add(conflict.second.constraint_type)
        clashing[conflict.second.constraint_type].add(conflict.first.constraint_type)
    order = {t: i for i, t in enumerate(CONSTRAINT_TYPES)}
    return [
        replace(
            c,
            conflicts_with=tuple(sorted(clashing[c.constraint_type], key=order.__getitem__)),
            compatible_with=tuple(
                o.constraint_type
                for o in constraints
                if o.constraint_type != c.constraint_type and o.constraint_type not in clashing[c.constraint_type]
            ),
        )
        for c in constraints
    ]


_COST_LABELS = {"low": "faible", "medium": "moyen", "high": "élevé"}
_PRIORITY_LABELS = {"primary": "principale", "secondary": "secondaire"}


def qualifiers(constraint: ThreadConstraint) -> str:
    """Ce que le modèle a nommé en plus, en clair, séparé par des virgules — vide si rien."""
    parts: list[str] = []
    if constraint.priority is not None:
        parts.append(f"priorité {_PRIORITY_LABELS[constraint.priority]}")
    if constraint.relaxation_cost is not None:
        parts.append(f"coût de relâchement {_COST_LABELS[constraint.relaxation_cost]}")
    if constraint.business_impact is not None:
        parts.append(f"impact : {constraint.business_impact}")
    return ", ".join(parts)


def describe(constraint: ThreadConstraint) -> str:
    return f"{CONSTRAINT_LABELS[constraint.constraint_type]} « {constraint.value} »"


def describe_with_turn(constraint: ThreadConstraint) -> str:
    """``describe`` + le tour qui l'a posée (rien quand l'estampille manque)."""
    turn = f" (posée au tour {constraint.source_turn})" if constraint.source_turn is not None else ""
    return describe(constraint) + turn


# ── #3224 (Y14 02/10) — l'extraction MÉCANIQUE du message, et ce qu'elle dit ────
#
# Trois recettes de suite : le graphe (#3201.1) ne se remplissait que si le modèle appelait
# `note_thread_context.constraints` ; sinon aucune contrainte nommée, aucune contradiction
# détectée, aucune question. Le lexique ci-dessous est celui des règles de `_RULES` (mêmes mots,
# même normalisation) : il ne devine que ce qu'une règle sait déjà opposer.

# (type, valeur affichée, déclencheurs)
_MESSAGE_LEXICON: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("size", "grand groupe", ("grand groupe", "grands groupes", "large group", "cac 40", "cac40")),
    (
        "purchase_model",
        "sans référencement",
        ("sans referencement", "hors referencement", "non reference", "no referencing", "without referencing"),
    ),
    ("remote", "full remote", ("full remote", "100% remote", "teletravail complet", "fully remote")),
    ("service_type", "sur site", ("sur site", "on site", "onsite", "presentiel")),
    ("company_type", "startup", ("startup", "start up", "jeune pousse")),
    ("sector", "banque", ("banque", "bancaire", "bank")),
    ("deadline", "immédiat", ("immediat", "tout de suite", "right away", "immediately")),
    ("geography", "petite commune", ("petite commune", "petites communes", "village", "small town", "rural")),
    ("company_type", "client final", ("client final", "end client", "end customer")),
    ("referencing", "rang 2", ("rang 2", "rang2", "tier 2", "tier2", "sous traitant", "subcontract")),
)
# #3201.8 — les trois scénarios dont la valeur porte un nombre : (type, regex sur le texte normalisé,
# valeur affichée). Le nombre est celui que l'utilisateur a écrit, jamais un seuil deviné.
_MESSAGE_PATTERNS: tuple[tuple[str, re.Pattern[str], str], ...] = (
    ("expected_volume", re.compile(r"\b(\d+) (?:comptes|accounts)\b"), "{0} comptes"),
    (
        "proof_level",
        re.compile(r"\b(?:cree\w*|fonde\w*|founded|created) (?:avant|before) ((?:19|20)\d\d)\b"),
        "société créée avant {0}",
    ),
)
_PRIORITY_MARKERS = (
    "compte plus",
    "prime",
    "prioritaire",
    "en priorite",
    "plus important",
    "matters more",
    "takes priority",
)


def constraints_from_message(message: str, *, turn: int) -> list[ThreadConstraint]:
    """Les contraintes qu'un message NOMME en toutes lettres (lexique fermé), estampillées de
    ``turn``. Une clause qui porte « compte plus que le reste » / « prime » pose sa contrainte en
    priorité principale. Aucun lexique ⇒ ``[]`` : on ne devine rien d'autre."""
    found: dict[str, ThreadConstraint] = {}
    for clause in re.split(r"[—–;.!?\n]|, ", message):
        normalised = _norm(clause)
        primary = any(_norm(marker) in normalised for marker in _PRIORITY_MARKERS)
        for ctype, value, needles in _MESSAGE_LEXICON:
            if any(_norm(needle) in normalised for needle in needles):
                found[ctype] = ThreadConstraint(
                    constraint_type=ctype,
                    value=value,
                    priority="primary" if primary else None,
                    source_turn=turn,
                )
        for ctype, pattern, template in _MESSAGE_PATTERNS:
            match = pattern.search(normalised)
            if match:
                found[ctype] = ThreadConstraint(
                    constraint_type=ctype,
                    value=template.format(*match.groups()),
                    priority="primary" if primary else None,
                    source_turn=turn,
                )
    return [found[t] for t in CONSTRAINT_TYPES if t in found]


def merge_message_constraints(
    existing: Sequence[ThreadConstraint], from_message: Sequence[ThreadConstraint]
) -> list[ThreadConstraint]:
    """Ce que le modèle (ou un tour d'avant) a déjà nommé GAGNE : un type déjà présent avec la même
    valeur garde son tour d'origine (la contradiction n'est pas « nouvelle » à chaque message) et
    n'est qu'enrichi d'une priorité ; une valeur différente est remplacée comme une facette."""
    merged = {c.constraint_type: c for c in existing}
    for new in from_message:
        old = merged.get(new.constraint_type)
        if old is None:
            merged[new.constraint_type] = new
        elif _norm(old.value) == _norm(new.value):
            if new.priority is not None and old.priority is None:
                merged[new.constraint_type] = replace(old, priority=new.priority, source_turn=new.source_turn)
        elif old.source_turn != new.source_turn:
            merged[new.constraint_type] = new
    return annotate_constraints([merged[t] for t in CONSTRAINT_TYPES if t in merged])


def _merge_twin_conflicts(conflicts: Sequence[ConstraintConflict]) -> list[list[ConstraintConflict]]:
    """Les contradictions qui opposent la MÊME contrainte à des « jumelles » (même valeur, types différents)
    ne forment qu'un groupe : une ligne, pas une par jumelle."""
    groups: dict[tuple[str, int, str], list[ConstraintConflict]] = {}
    for conflict in conflicts:
        key = (conflict.rule, id(conflict.first), _norm(conflict.second.value))
        groups.setdefault(key, []).append(conflict)
    return list(groups.values())


def _join_twins(constraints: Sequence[ThreadConstraint], en: bool) -> str:
    labels = [CONSTRAINT_LABELS[c.constraint_type] for c in constraints]
    return f"{(' and ' if en else ' et ').join(labels)} « {constraints[0].value} »"


def constraint_turn_addendum(
    text: str, constraints: Sequence[ThreadConstraint], *, turn: int, language: str = "fr"
) -> str:
    """La note « Contrainte retenue » PUIS les arbitrages, en un seul texte (chemin sans panneau Sources)."""
    note, arbitration = split_constraint_turn_addendum(text, constraints, turn=turn, language=language)
    lines = [*([note] if note else []), *arbitration]
    return "\n\n" + "\n".join(lines) if lines else ""


def split_constraint_turn_addendum(
    text: str, constraints: Sequence[ThreadConstraint], *, turn: int, language: str = "fr"
) -> tuple[str, list[str]]:
    """#5086 — ``(note, arbitrage)`` : la note « Contrainte retenue » (``""`` si rien) part au panneau Sources
    de la réponse ; les lignes d'arbitrage / de priorité restent dans le CORPS (une question à trancher
    ne se range pas dans un panneau). #3224 — ce que la réponse de CE tour doit nommer et n'a pas nommé : les contraintes posées ce
    tour (« taille « grand groupe » »), et, pour une contradiction née ce tour, la question
    d'arbitrage nommant les DEUX côtés (jamais un choix silencieux). ``""`` quand tout est dit."""
    lowered = _norm(text)
    en = language == "en"

    def label(constraint: ThreadConstraint) -> str:
        return CONSTRAINT_LABELS[constraint.constraint_type]

    def said(constraint: ThreadConstraint) -> bool:
        return _norm(label(constraint)) in lowered and _norm(constraint.value) in lowered

    note = ""
    lines: list[str] = []
    fresh = [c for c in constraints if c.source_turn == turn]
    conflicts = [
        conflict
        for conflict in detect_conflicts(constraints)
        if turn in (conflict.first.source_turn, conflict.second.source_turn)
    ]
    in_conflict = {id(c) for conflict in conflicts for c in (conflict.first, conflict.second)}
    unsaid = [c for c in fresh if id(c) not in in_conflict and not said(c)]
    if unsaid:
        named = ", ".join(describe(c) for c in unsaid)
        note = f"Constraint kept: {named}." if en else f"Contrainte retenue : {named}."
    for group in _merge_twin_conflicts(conflicts):
        if all(said(c) for conflict in group for c in (conflict.first, conflict.second)):
            continue
        first = group[0].first
        seconds = [conflict.second for conflict in group]
        reason = group[0].reason
        # Deux contraintes de même valeur (« modèle d'achat » et « référencement » : « sans référencement »)
        # ne font qu'UN côté de l'arbitrage, nommé par ses deux critères (#3224, Y18 02/10).
        second_side = _join_twins(seconds, en)
        sides = f"{describe(first)} / {second_side}"
        first_primary = first.priority == "primary"
        second_primary = any(c.priority == "primary" for c in seconds)
        if first_primary or second_primary:
            kept, relaxed = (describe(first), second_side) if first_primary else (second_side, describe(first))
            lines.append(
                f"Priority kept: {kept}; I relax {relaxed}. ({reason})"
                if en
                else f"Priorité retenue : {kept} ; je relâche {relaxed}. ({reason})"
            )
        else:
            lines.append(
                f"Arbitration: {sides} contradict each other ({reason}). Which one takes priority?"
                if en
                else f"Arbitrage : {sides} se contredisent ({reason}). Laquelle garde la priorité ?"
            )
    return note, lines
