"""#1925 — INTERDIRE LES RECOMMANDATIONS INTERCHANGEABLES.

« Une recommandation échoue si elle pourrait être envoyée à n'importe quelle
ESN ou n'importe quel compte. » Le juge qualité (``quality_judge``) bannissait
déjà des FORMULATIONS génériques (« approche multicanale », « solution sur
mesure ») — une règle négative. Il manquait la règle POSITIVE : une
recommandation cite au moins deux éléments qui n'appartiennent qu'à CE compte,
CETTE ESN, CE commercial.

Ce module tient les deux faces de la même règle, pour qu'elles ne divergent
pas (GA-26) :

* ``specificity_directive_block`` — la CONSIGNE, collée dans les prompts qui
  recommandent (plan d'action, message préparé) ;
* ``assess_specificity`` — le VALIDATEUR déterministe, qui compte les éléments
  RÉFÉRENCÉS dans une sortie.

Référencé = une valeur venue d'un CHAMP STRUCTURÉ du dossier (nom d'un contact
enrichi, entité, signal daté, référence déclarée par l'ESN, zone déclarée…)
retrouvée dans le texte de la recommandation. Jamais un mot deviné : « cloud »
n'est pas l'offre déclarée « Cloud AWS », et le nom du compte n'est pas une
« entité précise » — il figure dans TOUTE recommandation sur ce compte.

Trois verdicts, pas deux :

* ``specifique`` — au moins ``MIN_SPECIFIC_ELEMENTS`` éléments distincts ;
* ``generique`` — moins, alors que le dossier en offrait assez ;
* ``non_evaluable`` — le dossier n'offre même pas deux familles d'éléments.
  « Non mesuré » n'est pas « générique » : on ne condamne pas une
  recommandation sur des données que le dossier n'a jamais eues.

Ce qui ne peut PAS être évalué est NOMMÉ (``unavailable``), jamais compté
absent. ``available_consultant`` l'est toujours aujourd'hui : ni la requête du
plan (``PlanRequest``) ni celle du message (``MessageRequest``) ne portent de
vivier. Le jour où l'une le portera, c'est ``registry_from_inputs`` qui le lira.

Déterministe, sans I/O ni LLM — aucun coût. Limite assumée : un élément
PARAPHRASÉ (« votre objectif de trois nouveaux comptes » pour l'objectif
déclaré « ouvrir trois grands comptes ») n'est pas reconnu ; c'est l'éval en
ligne par modèle qui le mesurera, pas une règle de mots.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.services.heavy_offer_gate import declared_references
from app.services.text_norm import dedup_by_name, normalize_name

# #1925.2-.12 — les onze éléments de l'issue, dans son ordre. Le code est le
# contrat (sortie JSON) ; le libellé est ce que lit le MODÈLE dans la consigne.
SPECIFICITY_ELEMENTS: tuple[tuple[str, str], ...] = (
    ("esn_expertise", "expertise réelle de l'ESN"),
    ("territory", "territoire"),
    ("capacity", "taille/capacité"),
    ("client_reference", "référence client"),
    ("dated_signal", "signal daté"),
    ("precise_entity", "entité précise"),
    ("precise_contact", "contact précis"),
    ("available_consultant", "consultant disponible"),
    ("access_path", "voie d'accès"),
    ("known_constraint", "contrainte connue"),
    ("user_objective", "objectif utilisateur"),
)

#: Les libellés, dans l'ordre, tels que les prompts les énumèrent (la consigne
#: du plan ET la règle d'or des messages — une seule écriture).
SPECIFICITY_LABELS = " · ".join(label for _kind, label in SPECIFICITY_ELEMENTS)

# #1925.13 — « au moins deux éléments spécifiques ».
MIN_SPECIFIC_ELEMENTS = 2

STATUS_SPECIFIC = "specifique"
STATUS_GENERIC = "generique"
STATUS_NOT_EVALUABLE = "non_evaluable"

# Une zone si large qu'elle vaut pour presque tout le portefeuille : la citer ne
# distingue pas un compte d'un autre (« filiale France »).
_BROAD_TERRITORIES = frozenset({"france", "europe", "international", "monde", "national", "national et international"})

# Valeurs de remplissage qu'un profil non renseigné laisse passer.
_PLACEHOLDERS = frozenset({"n/a", "na", "non precise", "non identifie", "inconnu", "conseil it", "votre esn"})

# Sous 3 caractères, une valeur attrape n'importe quel texte (« IT », « RH »).
_MIN_VALUE_CHARS = 3

# Un signal se reconnaît à son TEXTE (assez long pour ne pas être un mot
# courant) ou à sa DATE complète (« Mars 2026 », « 2026-03-12 ») — une année
# nue attraperait toute phrase qui la mentionne.
_MIN_SIGNAL_TEXT_CHARS = 12
_MIN_SIGNAL_DATE_CHARS = 6

# Une entité s'écrit souvent « ITIM — Innovation, Technologies & IT » dans le
# dossier et « ITIM » dans une phrase : on accepte aussi la tête avant ces
# séparateurs.
_ENTITY_HEAD_SPLIT = re.compile(r"\s+[—–-]\s+|\s*\(")

# Les listes d'entités du dossier, sous leurs deux orthographes — les mêmes que
# ``group_relationship._ENTITY_LIST_KEYS``, plus les périmètres priorisés.
_ENTITY_LIST_KEYS = (
    "priorityPerimeters",
    "priority_perimeters",
    "subsidiaries",
    "entitiesExhaustive",
    "entities_exhaustive",
    "meaningfulSubsidiaries",
    "meaningful_subsidiaries",
)
# Les listes de signaux, comme ``dated_proof._sourced_signals``.
_SIGNAL_LIST_KEYS = ("recentSignals", "recent_signals", "budgetSignals", "budget_signals")
# « Lyon, Toulouse » : une zone déclarée peut en contenir plusieurs (seller_context).
_ZONE_SPLIT = re.compile(r"[,;]")


#: (valeur affichée, motifs compilés qui la reconnaissent dans un texte normalisé).
_Matcher = tuple[str, tuple[re.Pattern[str], ...]]


@dataclass(frozen=True)
class SpecificityRegistry:
    """Les valeurs STRUCTURÉES qu'une recommandation peut citer, par élément —
    chacune avec ses motifs DÉJÀ compilés : le plan juge une vingtaine de
    candidates sur le même registre, et un registre de grand compte dépasse le
    cache de 512 motifs de ``re`` (220 ms mesurés en recompilant à chaque appel)."""

    matchers: Mapping[str, tuple[_Matcher, ...]]


def _clean(value: object) -> str:
    text = " ".join(str(value or "").split())
    return "" if normalize_name(text) in _PLACEHOLDERS else text


def _strings(value: object) -> list[str]:
    items = [value] if isinstance(value, str) else value if isinstance(value, (list, tuple)) else ()
    return [text for v in items if isinstance(v, (str, int, float)) and (text := _clean(v))]


def _names(rows: object, *keys: str) -> list[str]:
    out: list[str] = []
    for row in rows if isinstance(rows, (list, tuple)) else ():
        if isinstance(row, Mapping):
            name = next((text for k in keys if (text := _clean(row.get(k)))), "")
        else:
            name = _clean(row) if isinstance(row, str) else ""
        if name:
            out.append(name)
    return out


def _dedup(values: Iterable[str], *, drop: Iterable[str] = (), min_chars: int = _MIN_VALUE_CHARS) -> tuple[str, ...]:
    dropped = {normalize_name(d) for d in drop if d}
    return tuple(
        value
        for value in dedup_by_name(list(values))
        if len(norm := normalize_name(value)) >= min_chars and norm not in dropped
    )


def registry_from_inputs(
    *,
    profile: Mapping[str, Any] | None,
    research: Mapping[str, Any] | None,
    contacts: Sequence[Any] | None,
    reverse_prospects: Sequence[Any] | None = None,
) -> SpecificityRegistry:
    """Lit les champs STRUCTURÉS déjà présents dans les requêtes plan et message.

    Chaque source est une clé réellement émise aujourd'hui (``AnalysisProfileData``
    côté API, ``ResearchOutput`` / ``raw_analysis`` côté IA, contacts enrichis,
    ex-collaborateurs de la couche zéro) — les orthographes camel ET snake, parce
    que le profil arrive sous les deux selon le chemin.
    """
    p = profile or {}
    r = research or {}
    company = _clean(r.get("companyName") or r.get("company_name"))
    portfolio = p.get("offerPortfolioContext") if isinstance(p.get("offerPortfolioContext"), Mapping) else {}

    declared_zones = (
        *_strings(p.get("geoZone")),
        *_strings(p.get("geography")),
        *_strings(portfolio.get("geographies")),
    )
    territories = [
        zone
        for declared in declared_zones
        for zone in map(_clean, _ZONE_SPLIT.split(declared))
        if zone and normalize_name(zone) not in _BROAD_TERRITORIES
    ]

    signals: list[_Matcher] = []
    for key in _SIGNAL_LIST_KEYS:
        for entry in r.get(key) or []:
            if not isinstance(entry, Mapping):
                continue
            text = _clean(entry.get("signal") or entry.get("title"))
            date = _clean(entry.get("date") or entry.get("timeframe") or entry.get("published_at"))
            # La date seule ne suffit pas à désigner un signal : il faut les deux.
            if text and date:
                signals.append(_signal_matcher(text, date))

    entities = _names(contacts, "entity") + [name for key in _ENTITY_LIST_KEYS for name in _names(r.get(key), "name")]

    values: dict[str, tuple[str, ...]] = {
        # LUDOVIC-C LC.5 — les MÉTIERS placés (déclarés, à défaut déduits) disent ce que
        # l'espace vend aussi bien que ses offres : un script qui cite « technicien
        # après-vente » est personnalisé pour une ESN industrielle.
        "esn_expertise": _dedup(
            [
                *_strings(p.get("offers")),
                *_strings(p.get("core_offers")),
                *_strings(p.get("offerPortfolioNames")),
                *_strings(p.get("placedRoles")),
                *[
                    str(entry.get("role"))
                    for entry in (p.get("inferredPlacedRoles") or [])
                    if isinstance(entry, Mapping) and entry.get("role")
                ],
            ]
        ),
        "territory": _dedup(territories),
        # Un effectif nu (« 12 ») passe sous le plancher de 3 caractères : il est
        # gardé ici, et ne se reconnaît qu'avec son unité (``_capacity_cited``).
        # gardé ici, et ne se reconnaît qu'avec son unité (``_value_matcher``).
        "capacity": _dedup(
            [*_strings(p.get("size")), *_strings(p.get("esn_size")), *_strings(p.get("rampUpCapacity"))],
            min_chars=1,
        ),
        "client_reference": _dedup(declared_references(dict(p))),
        "precise_entity": _dedup(entities, drop=[company]),
        "precise_contact": _dedup(_names(contacts, "fullName", "full_name")),
        # Aucun chemin ne porte de vivier aujourd'hui (voir le docstring du module).
        "available_consultant": (),
        "access_path": _dedup(_names(reverse_prospects, "fullName", "full_name", "name")),
        "known_constraint": _dedup([*_strings(p.get("salesBlockers")), *_strings(p.get("noGoSectors"))]),
        "user_objective": _dedup(
            [*_strings(p.get("sellerGoal")), *_strings(p.get("monthlyTarget")), *_strings(p.get("mainChallenge"))]
        ),
    }
    matchers = {kind: tuple(_value_matcher(kind, value) for value in found) for kind, found in values.items()}
    matchers["dated_signal"] = tuple(signals)
    return SpecificityRegistry(matchers=matchers)


def _word_pattern(norm: str) -> re.Pattern[str]:
    """``norm`` (déjà normalisé) en MOTS ENTIERS : « Camille Martin » ne se
    trouve pas dans « Camille Martinez »."""
    return re.compile(rf"(?<!\w){re.escape(norm)}(?!\w)")


def _value_matcher(kind: str, value: str) -> _Matcher:
    norm = normalize_name(value)
    if kind == "capacity" and norm.isdigit():
        # Un effectif NU (« 12 ») ne se reconnaît qu'avec son unité : « 12 mois »
        # ne parle pas de la capacité de l'ESN.
        return value, (re.compile(rf"(?<!\w){re.escape(norm)}\s+consultant"),)
    aliases = [norm]
    if kind == "precise_entity":
        head = normalize_name(_ENTITY_HEAD_SPLIT.split(value, maxsplit=1)[0])
        if head and head != norm:
            aliases.append(head)
    return value, tuple(_word_pattern(alias) for alias in aliases if len(alias) >= _MIN_VALUE_CHARS)


def _signal_matcher(text: str, date: str) -> _Matcher:
    # Un signal se reconnaît à son TEXTE assez long ou à sa DATE complète.
    floors = ((normalize_name(text), _MIN_SIGNAL_TEXT_CHARS), (normalize_name(date), _MIN_SIGNAL_DATE_CHARS))
    return text, tuple(_word_pattern(norm) for norm, floor in floors if len(norm) >= floor)


def assess_specificity(texts: Iterable[str | None], registry: SpecificityRegistry) -> dict[str, Any]:
    """#1925.1/.13/.15 — compte les éléments DISTINCTS qu'une recommandation cite.

    ``texts`` : tout ce que la recommandation MONTRE (action, contact ciblé,
    objet, corps…). Rend ``{status, count, minimum, elements, unavailable}`` —
    ``elements`` = ``[{kind, value}]`` (une entrée par famille, la première
    valeur citée), ``unavailable`` = les familles que le dossier n'alimente pas.
    La grammaire ne compte pas : une phrase parfaite sans élément reste générique.
    """
    haystack = normalize_name(" \n ".join(t for t in texts if isinstance(t, str) and t.strip()))
    elements: list[dict[str, str]] = []
    unavailable: list[str] = []
    for kind, _label in SPECIFICITY_ELEMENTS:
        candidates = registry.matchers.get(kind, ())
        if not candidates:
            unavailable.append(kind)
            continue
        cited = next((value for value, patterns in candidates if any(p.search(haystack) for p in patterns)), None)
        if cited is not None:
            elements.append({"kind": kind, "value": cited})

    available = len(SPECIFICITY_ELEMENTS) - len(unavailable)
    if len(elements) >= MIN_SPECIFIC_ELEMENTS:
        status = STATUS_SPECIFIC
    elif available < MIN_SPECIFIC_ELEMENTS:
        status = STATUS_NOT_EVALUABLE
    else:
        status = STATUS_GENERIC
    return {
        "status": status,
        "count": len(elements),
        "minimum": MIN_SPECIFIC_ELEMENTS,
        "elements": elements,
        "unavailable": unavailable,
    }


def specificity_directive_block() -> str:
    """#1925 — la consigne des prompts qui recommandent, rendue depuis la même
    liste que le validateur (un élément ajouté à l'un atteint l'autre)."""
    return (
        "SPÉCIFICITÉ (non négociable) : une recommandation ou un message qui pourrait être envoyé à n'importe "
        "quelle ESN ou à n'importe quel compte est un ÉCHEC, même bien écrit. Chacun cite au moins "
        f"{MIN_SPECIFIC_ELEMENTS} éléments spécifiques parmi : {SPECIFICITY_LABELS}. "
        "Cite-les tels qu'ils figurent dans le contexte fourni (nom complet du contact, nom de l'entité, "
        "signal avec sa date, référence déclarée par l'ESN) ; n'en fabrique aucun — une référence client, "
        "un consultant ou une date absents du contexte ne s'inventent pas. Exemple insuffisant : « Contacte "
        "les décideurs IT avec un message personnalisé. »"
    )
