"""#3202 — COMPANY ARCHETYPE & MARKET SEMANTICS ONTOLOGY (LAU-FINAL-208).

Le vocabulaire, pas un nouveau moteur de classification. Comme
`actor_typology.ActorType`, ce module NOMME une typologie complète — c'est
ici qu'elle vit, en UN seul endroit (GA-26) — et n'affirme un archétype que
sur preuve, jamais par déduction silencieuse.

Trois séparations volontaires, comme le docstring d'`actor_typology` le fait
pour la sienne :

* `CompanyArchetype` NOMME les 21 archétypes du ticket — un vocabulaire.
* `archetype_from_actor_type` fait le PONT avec `actor_typology.ActorType`
  pour les archétypes que ce module sait déjà établir sur preuve (NAF,
  intermédiation) : ESN, cabinet de recrutement, client final… Il ne
  RECALCULE rien — GA-26, une dérivation vit à un seul endroit — il traduit
  un type déjà résolu ailleurs vers ce vocabulaire-ci.
* `classify_startup` établit la confiance d'UN archétype précis — celui que
  le ticket détaille explicitement (§ STARTUP) — à partir de signaux
  combinés, JAMAIS du triplet effectif+secteur+date seul (le NO-GO du
  ticket : « Laura utilise le filtre "petite entreprise informatique" comme
  synonyme de startup »).

Une société peut porter PLUSIEURS labels de ce vocabulaire à la fois, avec
des niveaux de confiance distincts (§ ticket) — ce module ne force aucun
« un seul archétype par société » : chaque fonction rend un verdict sur UN
archétype, l'appelant peut en accumuler plusieurs.
"""

from __future__ import annotations

from collections.abc import Sequence
from enum import StrEnum
from functools import lru_cache
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.services.actor_typology import ActorType, classify_actor_type
from app.services.esn_name_match import build_esn_index, match_esn


class CompanyArchetype(StrEnum):
    """Les 21 archétypes du ticket — nommer un archétype ici n'affirme jamais
    qu'une société en relève : seule une fonction de classification engage un
    jugement, sur preuve (même garde-fou que `ActorType`)."""

    STARTUP = "startup"
    SCALE_UP = "scale-up"
    ENTREPRISE_INNOVANTE_MATURE = "entreprise innovante mature"
    TPE_PME_TRADITIONNELLE = "TPE / PME traditionnelle"
    ETI = "ETI"
    GRAND_GROUPE = "grand groupe"
    FILIALE_AUTONOME = "filiale autonome"
    FILIALE_INTEGREE = "filiale intégrée"
    SPIN_OFF = "spin-off"
    EDITEUR_LOGICIEL = "éditeur logiciel"
    SAAS = "SaaS"
    AGENCE = "agence"
    ESN = "ESN"
    CABINET_CONSEIL = "cabinet de conseil"
    CABINET_RECRUTEMENT = "cabinet de recrutement"
    INDUSTRIEL = "industriel"
    ORGANISME_PUBLIC = "organisme public"
    ASSOCIATION = "association"
    ETABLISSEMENT_FINANCIER = "établissement financier"
    MARKETPLACE = "marketplace"
    PURE_PLAYER_NUMERIQUE = "pure player numérique"


#: § STATUTS du ticket — le plus certain au moins certain. Ordre EST une
#: information (comparaisons en aval), même convention que `esn_stage.ESN_STAGES`.
class ArchetypeConfidence(StrEnum):
    CONFIRMED = "confirmed"
    SUPPORTED = "supported"
    POSSIBLE = "possible"
    NOT_ESTABLISHED = "not_established"


_CONFIDENCE_ORDER: tuple[ArchetypeConfidence, ...] = (
    ArchetypeConfidence.NOT_ESTABLISHED,
    ArchetypeConfidence.POSSIBLE,
    ArchetypeConfidence.SUPPORTED,
    ArchetypeConfidence.CONFIRMED,
)


def confidence_at_least(confidence: ArchetypeConfidence, minimum: ArchetypeConfidence) -> bool:
    """Même motif que `esn_stage.stage_at_least` : comparaison ORDONNÉE, jamais
    alphabétique."""
    return _CONFIDENCE_ORDER.index(confidence) >= _CONFIDENCE_ORDER.index(minimum)


class ArchetypeVerdict(BaseModel):
    """Un archétype n'est jamais nu (doctrine « un score n'est jamais nu ») :
    `evidence` NOMME les signaux qui ont fait monter — ou pas — la confiance,
    même quand elle reste `NOT_ESTABLISHED`."""

    archetype: CompanyArchetype
    confidence: ArchetypeConfidence
    evidence: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


#: Le pont GA-26 — un `ActorType` déjà résolu SUR PREUVE (NAF, intermédiation)
#: se traduit ici, il ne se recalcule jamais. Les valeurs d'`ActorType` sans
#: entrée (GROUPE, FILIALE, PARTENAIRE…) n'ont, par leur propre docstring,
#: aucun signal réel dans le dépôt : les nommer ici les inventerait.
_ACTOR_TYPE_BRIDGE: dict[ActorType, CompanyArchetype] = {
    ActorType.ESN: CompanyArchetype.ESN,
    ActorType.ESN_CONCURRENTE: CompanyArchetype.ESN,
    ActorType.CABINET_RECRUTEMENT: CompanyArchetype.CABINET_RECRUTEMENT,
    ActorType.CABINET_CONSEIL_NON_TECHNIQUE: CompanyArchetype.CABINET_CONSEIL,
    ActorType.EDITEUR_LOGICIEL: CompanyArchetype.EDITEUR_LOGICIEL,
}


def archetype_from_actor_type(actor_type: ActorType | None) -> ArchetypeVerdict | None:
    """Traduit un `ActorType` déjà résolu (NAF/intermédiation) vers ce
    vocabulaire. ``None`` quand `actor_type` n'a pas d'équivalent NOMMÉ ici —
    jamais un archétype deviné pour combler la case."""
    if actor_type is None:
        return None
    archetype = _ACTOR_TYPE_BRIDGE.get(actor_type)
    if archetype is None:
        return None
    return ArchetypeVerdict(
        archetype=archetype,
        confidence=ArchetypeConfidence.CONFIRMED,
        evidence=[f"type d'acteur résolu sur preuve (NAF/intermédiation) : {actor_type.value}"],
    )


#: NAF qui ne dit RIEN du métier : le siège social / la holding (70.10Z, 64.20Z). Un groupe d'ESN
#: (Capgemini SE) en porte un, et la Phase 1 — qui classe sur le seul NAF — le range « client
#: final ». Sur ces NAF seulement, le référentiel des ESN connues peut compléter la preuve.
_UNINFORMATIVE_NAF: frozenset[str] = frozenset({"7010Z", "6420Z"})


@lru_cache(maxsize=1)
def _known_esn_index() -> dict[tuple[str, ...], str]:
    """Le référentiel des ESN que l'app connaît nommément (`competitor_intel.json`), indexé pour
    l'appariement STRICT d'`esn_name_match` (préfixe de jetons + suffixes fermés, jamais une
    sous-chaîne) — la même règle que l'écran Territoire, jamais une seconde."""
    from app.knowledge import _competitors, esn_reference_names

    # #4814.1 — les 15 fiches concurrents ET le référentiel nominatif entier (477 noms + ajouts de recette).
    return build_esn_index([*(entry.get("name") for entry in _competitors()), *esn_reference_names()])


def is_known_esn_name(name: object) -> bool:
    """#3757 — le nom rencontre STRICTEMENT une ESN du référentiel (même index, même règle
    qu'`_known_esn_verdict` et que l'écran Territoire : GA-26, aucun second appariement)."""
    return bool(name) and match_esn(str(name), _known_esn_index()) is not None


def _naf_is_uninformative(naf: object) -> bool:
    """Un NAF de siège/holding PRÉSENT : il ne PROUVE pas qu'un acteur n'est pas une ESN. Un NAF
    absent n'est PAS dans ce cas : sans NAF, le nom seul ne classe jamais (décision Y19/X70)."""
    digits = "".join(ch for ch in str(naf or "") if ch.isalnum()).upper()
    return digits in _UNINFORMATIVE_NAF


def _known_esn_verdict(account_data: dict[str, Any], nested: Any) -> ArchetypeVerdict | None:
    """#3243 (recette Y23) — une ESN du référentiel dont le NAF est un NAF de siège. ``None`` dès
    que le NAF est absent ou un vrai NAF métier (un client final reste client final) ou que le nom ne
    rencontre pas STRICTEMENT une entrée du référentiel."""
    naf = account_data.get("naf_code") or (nested.get("naf_code") if isinstance(nested, dict) else None)
    if not _naf_is_uninformative(naf):
        return None
    name = account_data.get("company_name")
    if not name or match_esn(str(name), _known_esn_index()) is None:
        return None
    return ArchetypeVerdict(
        archetype=CompanyArchetype.ESN,
        confidence=ArchetypeConfidence.SUPPORTED,
        evidence=["nom reconnu dans le référentiel des ESN connues ; NAF de siège (aucune preuve contraire)"],
    )


def archetype_verdict_from_account_data(account_data: dict[str, Any] | None) -> ArchetypeVerdict | None:
    """#3226 — POINT D'ENTRÉE UNIQUE (GA-26) pour les appelants aval
    (`bellum_messages.py`, `action_recommender.py`…) qui n'ont accès qu'au
    dossier compte déjà constitué : lit `account_data["actorType"]`, DÉJÀ
    résolu par `phase1_research.py` (NAF/intermédiation, jamais recalculé
    ici), et le traduit via `archetype_from_actor_type`. ``None`` sans
    `actorType` connu, ou sur une valeur qui ne correspond à aucun
    `ActorType` — jamais un archétype deviné d'un champ absent ou corrompu.

    #3243 (recette Y23) — seul complément : une ESN du référentiel dont le NAF est de siège
    (voir `_known_esn_verdict`), quand le type résolu n'est pas déjà une réponse."""
    if not isinstance(account_data, dict):
        return None
    # Trois formes du MÊME fait (recette Y17 #3243 : le détecteur ne lisait que
    # la première, alors que /chat passe la LIGNE de compte) : le résultat
    # Phase 1 à plat (`actorType`), la colonne de la ligne de compte
    # (`actor_type`, #2265.14) et le dossier imbriqué (`raw_analysis.actorType`).
    nested = account_data.get("raw_analysis")
    raw = (
        account_data.get("actorType")
        or account_data.get("actor_type")
        or (nested.get("actorType") if isinstance(nested, dict) else None)
    )
    verdict: ArchetypeVerdict | None
    if not raw:
        # #3243 (recette Y19) — une ligne de compte analysée AVANT la colonne
        # `actor_type` (#2265.14) n'a que son NAF : on le classe avec la MÊME
        # fonction que la Phase 1 (GA-26), sur preuve NAF seulement. Sans NAF,
        # `None` : jamais un type deviné du nom.
        naf = account_data.get("naf_code") or (nested.get("naf_code") if isinstance(nested, dict) else None)
        verdict = (
            archetype_from_actor_type(classify_actor_type(naf=naf, name=account_data.get("company_name")))
            if naf
            else None
        )
    else:
        try:
            verdict = archetype_from_actor_type(ActorType(raw))
        except ValueError:
            verdict = None
    return verdict or _known_esn_verdict(account_data, nested)


class StartupSignals(BaseModel):
    """§ STARTUP du ticket — les signaux à COMBINER, jamais lus seuls. Les
    trois champs EXCLUS du calcul de confiance (`headcount`, `sector_is_it`,
    `creation_date`) sont acceptés ici pour le CONTEXTE de `evidence` — ils
    ne comptent jamais dans `strong_signal_count` (voir `classify_startup`)."""

    creation_date: str | None = None
    sector_is_it: bool | None = None
    headcount: int | None = None
    scalable_product: bool | None = None
    funding_detected: bool | None = None
    accelerator_or_network: bool | None = None
    growth_detected: bool | None = None
    hiring_detected: bool | None = None
    claimed_innovation: bool | None = None
    capital_structure: str | None = None
    trajectory: str | None = None
    #: Une source dédiée et fiable (registre French Tech, base de levées…)
    #: qui qualifie DIRECTEMENT la société — jamais le registre légal seul,
    #: qui ne sait pas dire « startup ».
    qualified_sources: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


#: Les signaux qui COMPTENT dans `strong_signal_count` — volontairement SANS
#: `headcount`/`sector_is_it`/`creation_date` : le NO-GO du ticket est
#: exactement leur combinaison seule, et cette table est ce qui l'empêche au
#: niveau du code, pas seulement du prompt.
_STARTUP_STRONG_SIGNALS: tuple[str, ...] = (
    "scalable_product",
    "funding_detected",
    "accelerator_or_network",
    "growth_detected",
    "hiring_detected",
    "claimed_innovation",
)

_STARTUP_SIGNAL_LABELS: dict[str, str] = {
    "scalable_product": "produit ou modèle scalable",
    "funding_detected": "financement détecté",
    "accelerator_or_network": "accélérateur ou réseau",
    "growth_detected": "croissance",
    "hiring_detected": "recrutements",
    "claimed_innovation": "innovation revendiquée",
}


def classify_startup(signals: StartupSignals) -> ArchetypeVerdict:
    """#3202 § STARTUP — confiance sur SIGNAUX COMBINÉS, jamais sur
    effectif+secteur+date seuls (NO-GO explicite du ticket).

    * `CONFIRMED` — une source qualifiée (French Tech, base de levées…)
      l'affirme directement.
    * `SUPPORTED` — pas de source qualifiée, mais au moins 3 signaux
      combinables convergent.
    * `POSSIBLE` — 1 ou 2 signaux.
    * `NOT_ESTABLISHED` — aucun, MÊME quand l'effectif est petit, le secteur
      IT et la société récente : ces trois-là ne comptent jamais seuls.
    """
    fired = [name for name in _STARTUP_STRONG_SIGNALS if getattr(signals, name) is True]
    evidence = [_STARTUP_SIGNAL_LABELS[name] for name in fired]

    if signals.qualified_sources:
        return ArchetypeVerdict(
            archetype=CompanyArchetype.STARTUP,
            confidence=ArchetypeConfidence.CONFIRMED,
            evidence=[f"source qualifiée : {s}" for s in signals.qualified_sources] + evidence,
        )
    if len(fired) >= 3:
        return ArchetypeVerdict(
            archetype=CompanyArchetype.STARTUP, confidence=ArchetypeConfidence.SUPPORTED, evidence=evidence
        )
    if len(fired) >= 1:
        return ArchetypeVerdict(
            archetype=CompanyArchetype.STARTUP, confidence=ArchetypeConfidence.POSSIBLE, evidence=evidence
        )

    # Rien ne converge : on NOMME ce qui a été regardé et n'a rien donné,
    # jamais un archétype affirmé sur le triplet effectif/secteur/date seul —
    # même quand ces trois-là, pris ensemble, RESSEMBLENT à une startup.
    weak_context = [
        label
        for present, label in (
            (signals.headcount is not None, "effectif seul"),
            (signals.sector_is_it, "secteur IT seul"),
            (bool(signals.creation_date), "date de création seule"),
        )
        if present
    ]
    context_note = (
        f"signal(x) disponible(s) mais NON qualifiant(s) seul(s) : {', '.join(weak_context)}"
        if weak_context
        else "aucun signal disponible"
    )
    return ArchetypeVerdict(
        archetype=CompanyArchetype.STARTUP,
        confidence=ArchetypeConfidence.NOT_ESTABLISHED,
        evidence=[context_note],
    )


def french_tech_coverage_gap(source_available: bool, *, language: str | None = "fr") -> str | None:
    """#3202 § RÈGLE DE RECHERCHE — « si la source French Tech ou les données
    de financement ne sont pas accessibles : l'annoncer, ne pas compléter
    avec des agences anciennes ». `None` quand la source est disponible : le
    texte ne s'ajoute que pour annoncer une absence, jamais une présence."""
    if source_available:
        return None
    lang = "fr" if (language or "fr").lower().startswith("fr") else "en"
    if lang == "fr":
        return (
            "Aucune source de financement/French Tech n'est branchée ici : je ne peux pas confirmer "
            "une startup sur ce signal. Je montre les sociétés que je peux QUALIFIER autrement — "
            "jamais des agences anciennes ou des TPE IT en remplacement silencieux."
        )
    return (
        "No funding/French Tech source is connected here: I cannot confirm a startup on that signal. "
        "I'm showing the companies I can qualify another way — never old agencies or small IT firms "
        "as a silent substitute."
    )


def dedupe_evidence(verdicts: Sequence[ArchetypeVerdict]) -> list[str]:
    """Les motifs de plusieurs verdicts, dédupliqués, dans l'ordre d'apparition
    — même motif que `scope_filter.summarize_exclusions`."""
    seen: list[str] = []
    for verdict in verdicts:
        for reason in verdict.evidence:
            if reason and reason not in seen:
                seen.append(reason)
    return seen


# ── #3202.6 (épopée #3226) — LE MODE DE DÉCISION qu'implique l'archétype ─────
#
# « L'archétype influence... la décision directe ou collective. » Nommé
# SEULEMENT pour les archétypes où la forme juridique/organisationnelle
# elle-même détermine structurellement qui décide — jamais deviné pour les
# archétypes où la taille RÉELLE de la société pèse plus que l'archétype
# (ESN, éditeur logiciel, SaaS, marketplace, pure player numérique,
# entreprise innovante mature : de 3 à 3000 personnes, aucun mode de
# décision ne s'en déduit sans l'effectif — qui est une AUTRE dimension,
# déjà couverte ailleurs par `sales_context.classify_account_archetype`).
#
# Volontairement UN axe de plus, jamais une fusion avec cet autre calibrage
# taille/secteur (GA-26 : chacun vit dans son module, un seul l'écrit) — les
# deux se lisent côte à côte dans le prompt, jamais l'un à la place de l'autre.
_DECISION_STRUCTURE: dict[CompanyArchetype, str] = {
    CompanyArchetype.STARTUP: "directe — le ou les fondateurs tranchent, cycle court",
    CompanyArchetype.SCALE_UP: (
        "directe à mixte — le comité de direction restreint tranche vite, un achat structurant remonte au board"
    ),
    CompanyArchetype.TPE_PME_TRADITIONNELLE: "directe — le dirigeant tranche, peu d'intermédiaires",
    CompanyArchetype.SPIN_OFF: "directe — équipe dirigeante restreinte, hérite de l'agilité de l'entité d'origine",
    CompanyArchetype.FILIALE_AUTONOME: (
        "directe sur le périmètre filiale — le comité de direction local tranche sans remonter au groupe"
    ),
    CompanyArchetype.AGENCE: "directe — dirigeant ou associés tranchent",
    CompanyArchetype.CABINET_CONSEIL: "directe — associés tranchent",
    CompanyArchetype.CABINET_RECRUTEMENT: "directe — dirigeant ou associés tranchent",
    CompanyArchetype.GRAND_GROUPE: "collective — comité d'achat, plusieurs strates de validation, cycle formalisé",
    CompanyArchetype.FILIALE_INTEGREE: (
        "collective — la décision remonte au siège du groupe, jamais tranchée localement seule"
    ),
    CompanyArchetype.ETI: "collective — comité de direction élargi, cycle plus long qu'une PME",
    CompanyArchetype.ETABLISSEMENT_FINANCIER: "collective — comité des risques/achats, cycle long et formalisé",
    CompanyArchetype.ORGANISME_PUBLIC: "collective — marché public ou procédure formalisée, jamais un dirigeant seul",
    CompanyArchetype.ASSOCIATION: "collective — conseil d'administration ou bureau, décision collégiale",
    CompanyArchetype.INDUSTRIEL: "collective — comité d'achat industriel, cycle formalisé",
}


def decision_structure_hint(verdict: ArchetypeVerdict) -> str | None:
    """#3202.6 — le mode de décision qu'implique STRUCTURELLEMENT cet
    archétype, ou ``None`` :

    * l'archétype lui-même n'est pas établi (`NOT_ESTABLISHED`) — on
      n'affirme jamais un mode de décision sur un archétype qui n'a pas
      convergé ;
    * ou l'archétype ne le détermine pas seul (voir `_DECISION_STRUCTURE`) —
      un `None` ici, jamais une case comblée pour deviner.
    """
    if verdict.confidence == ArchetypeConfidence.NOT_ESTABLISHED:
        return None
    return _DECISION_STRUCTURE.get(verdict.archetype)


def account_decision_structure_block(*, naf_code: str | None, company_name: str) -> str:
    """Bloc de prompt PLAN (#3202.6, épopée #3226) : le mode de décision de la
    société CIBLÉE — jamais un second calcul de l'archétype, le MÊME pont NAF
    que `_search_item` (`chat_tools.py`, GA-26). ``""`` sans NAF connu, sans
    archétype établi, ou quand l'archétype ne détermine pas le mode de
    décision (`decision_structure_hint`) : jamais une ligne devinée."""
    if not naf_code:
        return ""
    verdict = archetype_from_actor_type(classify_actor_type(naf=naf_code, name=company_name))
    if verdict is None:
        return ""
    hint = decision_structure_hint(verdict)
    if hint is None:
        return ""
    return (
        "\n\n===== MODE DE DÉCISION DE LA CIBLE (#3202.6) =====\n"
        f"Archétype de {company_name} : {verdict.archetype.value} (confiance : {verdict.confidence.value}).\n"
        f"Décision : {hint}.\n"
        "Cette ligne éclaire QUI décide et le cycle probable pour CETTE société — elle ne "
        "remplace jamais le calibrage taille/secteur déjà posé ailleurs (stade ESN, cycle "
        "standard) : deux axes distincts, jamais fusionnés (GA-26)."
    )


__all__ = [
    "CompanyArchetype",
    "ArchetypeConfidence",
    "ArchetypeVerdict",
    "StartupSignals",
    "account_decision_structure_block",
    "archetype_from_actor_type",
    "archetype_verdict_from_account_data",
    "classify_startup",
    "confidence_at_least",
    "decision_structure_hint",
    "french_tech_coverage_gap",
    "dedupe_evidence",
]
