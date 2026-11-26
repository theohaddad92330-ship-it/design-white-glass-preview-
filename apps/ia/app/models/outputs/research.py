"""Pydantic output models for Phase 1.

Phase 1 runs three Claude prompts in parallel (`asyncio.gather`):
- BELLUM-FACTS    → ResearchFacts    (what the company IS)
- BELLUM-SIGNALS  → ResearchSignals  (what's HAPPENING — recent, dynamic)
- BELLUM-STRATEGY → ResearchStrategy (how to ATTACK — sales angles, scripts)

The merge into `ResearchOutput` happens in `phase1_research.py`. Splitting was
forced by Claude truncating the previous mono-prompt at `max_tokens=16000`,
which raised `IncompleteOutputException` and triggered cascading retries
(SDK + instructor + BullMQ) for ~24 min on rich companies.
"""

from __future__ import annotations

import json
from pydantic import AliasChoices, BaseModel, Field, field_validator, model_validator
from pydantic_core import PydanticCustomError

from app.services.offer_domains.signal_domain import normalize_signal_domain

# ── Shared sub-models ─────────────────────────────────────────────────────────


class EntityExhaustive(BaseModel):
    # ``extra=allow`` so the deterministic cartography annotations added AFTER the
    # LLM (priorityTier / priorityRank / isItEntity, and siren / nafCode / source
    # for INSEE-sourced IT entities) survive response validation instead of being
    # silently dropped. ``type`` defaults so a subsidiary promoted to an entity
    # (the entitiesExhaustive-empty fallback) doesn't fail a required field.
    model_config = {"populate_by_name": True, "extra": "allow"}

    name: str
    type: str = "filiale"  # filiale | BU | direction | departement | JV | GIE | GIE informatique
    parent: str = ""
    region: str = ""
    estimated_headcount: str = ""
    it_autonomy: str = ""  # autonome | partage | centralise
    # What-to-sell per entity (#275) — angles + stack per BU, deck-style. Filled
    # by the LLM for major operating entities only; empty for the long tail.
    what_to_sell: list[str] = Field(alias="whatToSell", default=[])
    stack: list[str] = []


class SiteFrance(BaseModel):
    city: str
    type: str  # siege | R&D | usine | datacenter | agence | bureau commercial
    importance: str = "moyenne"  # strategique | haute | moyenne | basse
    estimated_headcount: str = ""
    notes: str = ""


class BudgetSignal(BaseModel):
    signal: str
    amount: str = "Non precise"
    source: str = ""
    # Le JETON de traçabilité du scrape ("[P1]", "[O2]"). Il vivait dans
    # ``source``, et s'affichait donc tel quel dans la Veille et le panneau
    # « Sources du dossier » — un commercial qui lit « [PR3] » n'apprend rien.
    # ``source`` garde le nom lisible ; la référence vit ici.
    source_ref: str = Field(default="", validation_alias=AliasChoices("sourceRef", "source_ref"))
    timeframe: str = ""
    relevance: str = ""


class ItChallenge(BaseModel):
    title: str
    description: str
    severity: str = "medium"  # critical | high | medium | low
    esn_offer_match: str = ""
    timeframe: str = ""  # immediat | 6 mois | 12 mois | strategique
    # #3978 — le DOMAINE D'OFFRE (code de pack) que ce sujet appelle, classé par le
    # modèle à l'analyse. Vide = non classable : jamais deviné, jamais « generic ».
    # Sérialisé en snake_case (clé lue par ``ProjectsService.materialize``).
    domain_code: str = Field(
        default="", validation_alias=AliasChoices("domainCode", "domain_code")
    )

    @field_validator("domain_code", mode="before")
    @classmethod
    def _known_domain_only(cls, v: object) -> str:
        return normalize_signal_domain(v)


class RecentSignal(BaseModel):
    # #2687 — L'IDENTIFIANT du signal dans CETTE analyse ("s1", "s2"…), le seul
    # lien qu'une hypothèse qualifiée puisse citer sans qu'on l'invente.
    #
    # Il n'existait rien de tel, et il n'existait rien d'autre : ``basedOnSignals``
    # est du texte libre (le prompt demande une reformulation, pas une citation),
    # le signal n'a ni catégorie commune avec l'hypothèse ni ordre garanti, et
    # l'``id`` que le web fabrique à l'affichage est un index dans une liste
    # dédupliquée. Apparier là-dessus serait un rapprochement par proximité de
    # texte — pire que l'absence, parce que ça a l'air d'une réponse.
    #
    # Additif seulement : les analyses écrites avant cette PR n'ont pas d'``id``,
    # et une chaîne vide se lit comme « ce signal n'est cité par aucune
    # hypothèse », jamais comme un index deviné.
    id: str = ""
    signal: str
    source: str = ""
    # Le JETON de traçabilité du scrape ("[P1]", "[O2]"). Il vivait dans
    # ``source``, et s'affichait donc tel quel dans la Veille et le panneau
    # « Sources du dossier » — un commercial qui lit « [PR3] » n'apprend rien.
    # ``source`` garde le nom lisible ; la référence vit ici.
    source_ref: str = Field(default="", validation_alias=AliasChoices("sourceRef", "source_ref"))
    # #3922.1 — le LIEN vérifiable du signal, posé par le pipeline depuis le jeton
    # (``dated_signals.stamp_signal_urls``), jamais écrit par le modèle. Vide = « Sans lien vérifiable ».
    url: str = ""
    # Le genre de source que le jeton nomme (press | bodacc | job | tender | official | other).
    source_kind: str = ""
    # #4020 / #4022 — le LIEU d'une offre d'emploi, tel que le collecteur l'a lu
    # (``dated_signals.merge_collector_signals``). Vide = lieu non précisé, jamais deviné.
    location: str = ""
    type: str = ""  # nomination | budget | projet | incident | regulation | acquisition
    date: str = ""
    sales_implication: str = ""
    # #2107.31 — l'AMPLEUR business du signal pour l'entreprise cible elle-meme
    # ("transformation du groupe entier", "renfort ponctuel sur une seule
    # direction") — distinct de ``sales_implication`` ("pourquoi pour l'ESN").
    # Vide quand le modele n'a rien a evaluer : jamais deduit du ``type``, ce
    # serait une gravite inventee plutot qu'une lecture des sources.
    impact: str = ""
    # Deterministic age classification (Théo p.7/p.12): current | archive | undated.
    # Stamped in Phase 1 from ``date`` — a 2021 signal is an archive, not "à relancer".
    freshness: str = "undated"
    # #3978 — le DOMAINE D'OFFRE (code de pack) que ce sujet appelle, classé par le
    # modèle à l'analyse. Vide = non classable : jamais deviné, jamais « generic ».
    # Sérialisé en snake_case (clé lue par ``ProjectsService.materialize``).
    domain_code: str = Field(
        default="", validation_alias=AliasChoices("domainCode", "domain_code")
    )

    @field_validator("domain_code", mode="before")
    @classmethod
    def _known_domain_only(cls, v: object) -> str:
        return normalize_signal_domain(v)
    # #3668.7 — lecture déterministe de la sélection : ``lead`` (change la décision)
    # ou ``context`` (programme général, budget global, autre entité), l'entité
    # réellement nommée (target | other_entity | unverified) et la phrase de la
    # rétrogradation. Vides sur les analyses antérieures.
    selection_role: str = Field(default="", alias="selectionRole")
    entity_match: str = Field(default="", alias="entityMatch")
    selection_reason: str = Field(default="", alias="selectionReason")


class QualifiedHypothesis(BaseModel):
    """A public signal turned into an actionable hypothesis (deck's «signaux →
    hypothèses»). Convergence rule: 1 signal → a_verifier, 3+ → confirmee."""

    hypothesis: str
    based_on_signals: list[str] = Field(alias="basedOnSignals", default=[])
    # #2687 — les ``RecentSignal.id`` sur lesquels l'hypothèse repose. La MÊME
    # assertion que ``based_on_signals`` fait déjà en prose, exprimée en clés :
    # le modèle ne produit aucune information neuve, il NOMME un rattachement
    # qu'il affirmait déjà. ``based_on_signals`` garde son sens — il est lu
    # ailleurs (dashboard-manager, rubrique d'éval) et n'est pas redéfini ici.
    based_on_signal_ids: list[str] = Field(alias="basedOnSignalIds", default=[])
    confidence: str = "a_verifier"  # confirmee | probable | a_verifier
    esn_angle: str = Field(alias="esnAngle", default="")
    # #2687 — le prompt réclame ``firstAction`` depuis toujours (« la premiere
    # action TESTE l'hypothese sans la presenter comme un fait »), et le modèle
    # la rendait. Elle n'était PAS un champ ici : pydantic v2 ignore les clés
    # inconnues par défaut, et la persistance passe par
    # ``model_dump(by_alias=True)`` (``phase1_research``) — donc la réponse était
    # jetée avant la base. Un champ déclaré la fait enfin arriver.
    first_action: str = Field(alias="firstAction", default="")

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def _cap_confidence_by_convergence(self) -> QualifiedHypothesis:
        # Convergence rule (deck « signaux → hypothèses ») : la confiance ne peut
        # PAS dépasser ce que le nombre de signaux convergents soutient. 1 signal
        # → a_verifier max, 2 → probable max, 3+ → confirmee. On plafonne une
        # confiance LLM trop haute (une intuition à 1 signal ne peut être "confirmée")
        # sans jamais l'inventer si le modèle est prudent.
        order = {"a_verifier": 0, "probable": 1, "confirmee": 2}
        # #2687 — le plafond compte les signaux CONVERGENTS. Les identifiants en
        # sont le décompte le plus précis (des clés distinctes, pas des phrases
        # qui peuvent redire le même fait) ; la prose reste le repli pour les
        # analyses qui n'en ont pas. Sans ce `max`, un modèle qui répond
        # proprement en `id` et laisse la prose vide se ferait rétrograder à
        # `a_verifier` — le lien aurait dégradé la confiance qu'il documente.
        n = max(len(self.based_on_signals), len(set(self.based_on_signal_ids)))
        ceiling = "confirmee" if n >= 3 else "probable" if n == 2 else "a_verifier"
        if order.get(self.confidence, 0) > order[ceiling]:
            self.confidence = ceiling
        return self


class Pain(BaseModel):
    pain: str
    business_impact: str = ""
    esn_offer: str = ""
    urgency: str = "moyenne"  # critique | haute | moyenne | basse
    urgency_justification: str = ""
    # #3978 — le DOMAINE D'OFFRE (code de pack) que ce sujet appelle, classé par le
    # modèle à l'analyse. Vide = non classable : jamais deviné, jamais « generic ».
    # Sérialisé en snake_case (clé lue par ``ProjectsService.materialize``).
    domain_code: str = Field(
        default="", validation_alias=AliasChoices("domainCode", "domain_code")
    )

    @field_validator("domain_code", mode="before")
    @classmethod
    def _known_domain_only(cls, v: object) -> str:
        return normalize_signal_domain(v)


class Competitor(BaseModel):
    name: str
    scope: str = ""
    contract_type: str = ""  # regie | forfait | TMA | centre de services | consulting
    strengths: str = ""
    weaknesses: str = ""
    differentiation_strategy: str = ""


class EsnSynergy(BaseModel):
    name: str
    certainty: str = "moyenne"  # forte | moyenne | faible
    type: str = ""
    advice: str = ""


class TechnologyStackItem(BaseModel):
    name: str
    usage: str = ""
    maturity: str = ""  # legacy | mature | emerging | PoC
    opportunity_for_esn: str = ""


class Angle(BaseModel):
    # The strategy prompt emits camelCase (entryContactPersona / specificOffer /
    # estimatedDealSize); the wire contract + web read snake_case. Without an alias
    # the camelCase input was DROPPED (persona/offer/deal-size silently empty).
    # validation_alias captures the camelCase input; serialization stays snake_case
    # (field name) so the snake wire contract + web keep working.
    title: str
    strategy: str = ""
    entry_contact_persona: str = Field(
        default="", validation_alias=AliasChoices("entryContactPersona", "entry_contact_persona")
    )
    specific_offer: str = Field(
        default="", validation_alias=AliasChoices("specificOffer", "specific_offer")
    )
    estimated_deal_size: str = Field(
        default="", validation_alias=AliasChoices("estimatedDealSize", "estimated_deal_size")
    )
    prerequisites: str = ""
    # Tome 5 §32.2 — la PREUVE, isolée du champ libre `strategy`.
    #
    # Elle y était noyée depuis toujours : le prompt demandait « PROMESSE +
    # PREUVE + ACTION » en une seule prose, si bien que RIEN ne pouvait la
    # vérifier — ni le contrat, ni le barème, ni l'écran (qui écrivait
    # `proof: null` en dur, faute de champ à lire). Un tiers de la formule
    # n'était donc jamais tenu.
    #
    # `proof_status` est le verdict d'`angle_proof_gate`, pas une valeur du
    # modèle : « absent » (honnête) / « mobilisable » (citable en clientèle) /
    # « non_verifiable » (rien dans le profil ne l'étaye). Vide tant que le gate
    # n'est pas passé — non vérifié n'est PAS « non vérifiable ».
    proof: str = ""
    proof_status: str = Field(
        default="", validation_alias=AliasChoices("proofStatus", "proof_status")
    )

    model_config = {"populate_by_name": True}


# Cap the "set aside" catalogue so it stays a selection signal, not a dump.
_MAX_AXES_ECARTES = 6


def _coerce_json_list(v: object) -> object:
    """Accepte une liste rendue par le modèle sous forme de CHAÎNE JSON.

    Vu en production sur un run réel (Thales, 10/08/2026) : Claude a rendu
    ``technologyStack`` sérialisé — ``'[{"name": "..."}]'`` — au lieu d'un
    tableau. Pydantic a refusé, la phase de recherche a levé un 502, et un
    dossier COMPLET est mort sur une virgule de sérialisation.

    C'est la même règle que « parsing JSON Claude robuste » côté API : on ne
    fait pas confiance à la forme rendue, on la répare quand elle est
    réparable. Une chaîne qui ne contient pas une liste JSON est laissée telle
    quelle — Pydantic tranchera, et son message restera lisible.
    """
    if not isinstance(v, str):
        return v
    text = v.strip()
    if not text.startswith("["):
        return v
    try:
        parsed = json.loads(text)
    except (ValueError, TypeError):
        return v
    return parsed if isinstance(parsed, list) else v


def _coerce_joined_text(v: object) -> object:
    """Accepte un champ TEXTE rendu par le modèle sous forme de liste.

    L'autre moitié de la dérive de sérialisation vue le 10/08/2026 : sur un run
    réel (leboncoin), Claude a rendu ``rdvScript.exploration`` en tableau de
    questions là où le contrat attend un paragraphe. Pydantic a refusé et le
    dossier est mort en phase de recherche.

    Recoller les éléments plutôt que de jeter : ce que le modèle a écrit est
    juste, c'est sa mise en forme qui varie. Une liste vide donne une chaîne
    vide — soit exactement le défaut du champ.
    """
    if isinstance(v, list):
        parts = [str(item).strip() for item in v if item is not None and str(item).strip()]
        return "\n".join(parts)
    return v


def _sanitize_axes_raw(v: object) -> list:
    """Normalise the raw ``axesEcartes`` the LLM returns BEFORE field validation,
    so a bare string / null / non-list can't crash the whole strategy phase.
    Bare string → {"angle": s}; dict → kept; anything else dropped."""
    if not isinstance(v, list):
        return []
    out: list = []
    for item in v:
        if isinstance(item, str):
            out.append({"angle": item})
        elif isinstance(item, dict):
            out.append(item)
        # else (None, number…) → dropped
    return out


class AxeEcarte(BaseModel):
    """An attack angle deliberately SET ASIDE for the current ESN profile — the
    explicit selection logic Théo asks for: WHY it isn't kept as a top-3 play,
    and HOW to reactivate it. E.g. "je n'attaque pas SAP car ton profil vend
    data/cloud ; relance sous un profil ESN SAP". The structured counterpart of
    the top-3 ``angles`` (which say what we DO recommend)."""

    angle: str = ""
    raison: str = ""
    comment_reactiver: str = Field(alias="commentReactiver", default="")

    model_config = {"populate_by_name": True}

    @field_validator("angle", "raison", "comment_reactiver", mode="before")
    @classmethod
    def _coerce_none_to_empty(cls, v: object) -> str:
        # A null field must not abort validation before the collection cleaner runs.
        return "" if v is None else v


class Objection(BaseModel):
    objection: str
    real_concern: str = ""
    response: str = ""
    mirror_question: str = ""


class RdvScript(BaseModel):
    opening: str = ""
    positioning: str = ""
    exploration: str = ""
    proposal: str = ""
    closing: str = ""
    # ORION meeting-script extras: bridges (smart transition phrases between
    # sections) and story_frames (mini-stories/credible angles to build rapport).
    bridges: list[str] = []
    story_frames: list[str] = Field(alias="storyFrames", default=[])

    model_config = {"populate_by_name": True}

    @field_validator("opening", "positioning", "exploration", "proposal", "closing", mode="before")
    @classmethod
    def _accept_list_as_text(cls, v: object) -> object:
        # Les cinq sections du script sont des paragraphes ; le modèle en rend
        # parfois une en liste de puces. C'est une mise en forme, pas une erreur
        # de fond — on recolle au lieu de perdre le dossier entier.
        return _coerce_joined_text(v)


class PersonMentioned(BaseModel):
    name: str
    title: str = ""
    entity: str = ""
    source: str = ""
    # Le JETON de traçabilité du scrape ("[P1]", "[O2]"). Il vivait dans
    # ``source``, et s'affichait donc tel quel dans la Veille et le panneau
    # « Sources du dossier » — un commercial qui lit « [PR3] » n'apprend rien.
    # ``source`` garde le nom lisible ; la référence vit ici.
    source_ref: str = Field(default="", validation_alias=AliasChoices("sourceRef", "source_ref"))
    context: str = ""
    # Dated by Phase 1 (Théo p.7): a leadership-titled person absent from the live
    # registry (Oudéa) is flagged former + "(ancien — à vérifier)" on the title.
    former: bool = False


class LinkedinSearchKeywords(BaseModel):
    generic: list[str] = []
    by_entity: dict[str, list[str]] = {}


class DataFreshness(BaseModel):
    signals: str = "undated"  # recent | old | undated
    financials: str = "undated"
    contacts: str = "undated"


class AdjustedScoreFactors(BaseModel):
    offer_fit_raw: int = 0
    accessibility_raw: int = 0
    urgency_raw: int = 0
    cycle_fit_raw: int = 0


# ── Per-prompt output models ──────────────────────────────────────────────────


class Subsidiary(BaseModel):
    """A subsidiary — either a plain name (from the LLM) or a Pappers node.

    The LLM emits bare name strings, while Pappers merges ``RelatedCompany``
    objects (``{id, siren, name}``) into ``subsidiaries``. Both shapes must
    validate: typing the field ``list[str]`` was the cause of a 500 on every
    account with subsidiaries (Société Générale, Decathlon, Doctolib…).
    """

    name: str | None = None
    siren: str | None = None
    id: str | None = None

    model_config = {"populate_by_name": True, "extra": "ignore"}

    @model_validator(mode="before")
    @classmethod
    def _coerce(cls, value: object) -> object:
        if isinstance(value, str):
            return {"name": value}
        if isinstance(value, BaseModel):
            value = value.model_dump()
        if isinstance(value, dict) and "name" not in value and "nom_entreprise" in value:
            return {**value, "name": value.get("nom_entreprise")}
        return value


class ProgramName(BaseModel):
    """Un programme/initiative nommé — #3677.7 : objectif, périmètre documenté et
    horizon, en plus du nom/entité/budget/description déjà portés par le contrat
    (``programNameSchema``, ``packages/contracts/src/schemas/analysis/research.ts``).

    Même coercition que ``Subsidiary`` : le LLM (et toute analyse déjà stockée
    AVANT ce lot) peut rendre une chaîne nue — elle devient ``{"name": ...}``,
    les autres champs restant vides plutôt que devinés.
    """

    name: str = ""
    entity: str = ""
    budget: str = ""
    description: str = ""
    objective: str = ""
    scope: str = ""
    horizon: str = ""

    model_config = {"populate_by_name": True}

    @model_validator(mode="before")
    @classmethod
    def _coerce(cls, value: object) -> object:
        if isinstance(value, str):
            return {"name": value}
        if isinstance(value, BaseModel):
            value = value.model_dump()
        return value


class ResearchFacts(BaseModel):
    """Output of BELLUM-FACTS — structural / static information."""

    business_description: str = Field(alias="businessDescription", default="")
    sector: str = ""
    employees: str = ""
    revenue: str = ""
    headquarters: str = ""
    website: str = ""
    is_public: bool = Field(alias="isPublic", default=False)

    subsidiaries: list[Subsidiary] = []
    entities_exhaustive: list[EntityExhaustive] = Field(alias="entitiesExhaustive", default=[])
    sites_france: list[SiteFrance] = Field(alias="sitesFrance", default=[])

    program_names: list[ProgramName] = Field(alias="programNames", default=[])
    technology_stack: list[TechnologyStackItem] = Field(alias="technologyStack", default=[])
    regulations: list[str] = []

    concrete_activity: str = ""
    it_implications_for_esn: str = ""
    data_freshness: DataFreshness = Field(default_factory=DataFreshness)

    priority_score: int = Field(alias="priorityScore", default=5, ge=0, le=10)
    priority_justification: str = Field(alias="priorityJustification", default="")
    adjusted_score_factors: AdjustedScoreFactors = Field(default_factory=AdjustedScoreFactors)

    model_config = {"populate_by_name": True}

    @field_validator(
        "subsidiaries",
        "entities_exhaustive",
        "sites_france",
        "program_names",
        "technology_stack",
        "regulations",
        mode="before",
    )
    @classmethod
    def _accept_json_string_lists(cls, v: object) -> object:
        # Le champ qui a cassé était `technologyStack`, mais rien ne le distingue
        # de ses voisins : couvrir la sortie entière évite de rejouer le même
        # incident sur `sitesFrance` dans trois semaines.
        return _coerce_json_list(v)


class ResearchSignals(BaseModel):
    """Output of BELLUM-SIGNALS — recent dynamic info around the account."""

    budget_signals: list[BudgetSignal] = Field(alias="budgetSignals", default=[])
    recent_signals: list[RecentSignal] = Field(alias="recentSignals", default=[])
    qualified_hypotheses: list[QualifiedHypothesis] = Field(alias="qualifiedHypotheses", default=[])

    competitors: list[Competitor] = []
    esn_synergies: list[EsnSynergy] = Field(alias="esnSynergies", default=[])

    people_mentioned: list[PersonMentioned] = Field(alias="peopleMentioned", default=[])
    linkedin_search_keywords: LinkedinSearchKeywords = Field(
        alias="linkedinSearchKeywords", default_factory=LinkedinSearchKeywords,
    )
    organigramme_logic: str = Field(alias="organigrammeLogic", default="")

    model_config = {"populate_by_name": True}


#: Les sections que `bellum_strategy` est SEUL à produire — LA définition de
#: « la stratégie est vide », et la seule (GA-26). Le routeur de la phase 1 la
#: lit telle quelle (`phase1_research._STRATEGY_SECTIONS`) ; elle vivait là-bas,
#: elle a déménagé ICI le 29/08/2026 parce que le SCHÉMA doit refuser ce que le
#: routeur rattrapait, et deux définitions de « vide » auraient divergé au
#: premier champ ajouté.
#:
#: `rdvScript` n'en fait pas partie : son défaut est un OBJET plein de chaînes
#: vides, donc « présent » sans rien dire — le compter ferait passer le cas
#: cassé pour normal.
STRATEGY_SECTIONS: tuple[str, ...] = (
    "it_challenges",
    "pains",
    "angles",
    "axes_ecartes",
    "comment_ouvrir_compte",
    "power_questions",
    "objections",
)

#: L'alias de fil de chaque section — ce que le MODÈLE écrit. Le message de refus
#: part dans le reask d'instructor : il doit nommer les clés telles que le modèle
#: les connaît, pas nos noms Python.
_SECTION_WIRE_ALIAS: dict[str, str] = {
    "it_challenges": "itChallenges",
    "pains": "pains",
    "angles": "angles",
    "axes_ecartes": "axesEcartes",
    "comment_ouvrir_compte": "commentOuvrirCompte",
    "power_questions": "powerQuestions",
    "objections": "objections",
}

#: Pour chaque section de type LISTE, le ou les champs qui NOMMENT l'item. Un
#: item dont aucun ne dit rien ne remplit pas sa section : c'est la moitié
#: « presque vide » du défaut, celle qu'un `min_length=1` par champ raterait
#: (`{"pains": [{"pain": ""}]}` a bien un élément, et ne dit rien).
#:
#: Le dépôt tranche déjà dans ce sens pour `axesEcartes` — « une entrée sans
#: angle nommé est adjacente à la fabrication → on la jette » (§8). On ne JETTE
#: rien ici, en revanche : on ne COMPTE pas. Jeter en silence est sa propre
#: forme de mensonge, et cinq bons angles ne doivent pas mourir avec un sixième
#: vide.
#:
#: `power_questions` est absent : c'est une liste de CHAÎNES, l'item EST son
#: identité.
_SECTION_IDENTITY: dict[str, tuple[str, ...]] = {
    "it_challenges": ("title", "description"),
    "pains": ("pain",),
    "angles": ("title", "strategy"),
    "axes_ecartes": ("angle",),
    "objections": ("objection",),
}


def _read_field(item: object, name: str) -> object:
    """Lit `name` sur un sous-modèle OU sur le dict équivalent (alias compris).

    La même définition doit valoir des deux côtés : sur la réponse du modèle
    (des objets Pydantic) et sur le dossier LIVRÉ (`raw_analysis`, un dict à
    clés de fil). Deux lecteurs auraient divergé.
    """
    if isinstance(item, BaseModel):
        return getattr(item, name, None)
    if isinstance(item, dict):
        if name in item:
            return item[name]
        head, *rest = name.split("_")
        camel = head + "".join(part.title() for part in rest)
        return item.get(camel)
    return None


def _says_something(value: object, identity: tuple[str, ...]) -> bool:
    """Vrai quand `value` (chaîne ou liste) porte du contenu, pas du remplissage."""
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        for item in value:
            if isinstance(item, str):
                if item.strip():
                    return True
            elif not identity:
                # Liste d'objets sans champ d'identité déclaré : la présence suffit.
                return True
            elif any(str(_read_field(item, key) or "").strip() for key in identity):
                return True
        return False
    return bool(value)


def strategy_sections_that_say_nothing(subject: object) -> tuple[str, ...]:
    """Les sections stratégiques de `subject` qui ne disent RIEN, nommées.

    Accepte une `ResearchStrategy` ou le dict d'un dossier livré. Vide = au moins
    une section porte du contenu. C'est ce que le refus de schéma NOMME, ce que
    le routeur journalise, et ce sur quoi bascule l'avertissement du dossier.
    """
    if not isinstance(subject, (BaseModel, dict)):
        return ()
    return tuple(
        section
        for section in STRATEGY_SECTIONS
        if not _says_something(_read_field(subject, section), _SECTION_IDENTITY.get(section, ()))
    )


#: Le code du refus. Il rend l'erreur RECONNAISSABLE : sans lui, l'appelant ne
#: pourrait distinguer « la stratégie ne dit rien » d'un contrat cassé autrement
#: (un champ de mauvais type), et traiterait les deux pareil — soit en tuant un
#: dossier réparable, soit en déguisant une panne en dossier dégradé.
_REFUSAL_CODE = "strategy_says_nothing"

#: Profondeur de remontée dans la chaîne d'exceptions. `instructor` en empile
#: trois (InstructorRetryException ← RetryError ← ValidationError) ; huit laisse
#: de la marge sans risquer une boucle sur un cycle de `__context__`.
_REFUSAL_CHAIN_DEPTH = 8


def strategy_refusal_sections(exc: BaseException) -> tuple[str, ...]:
    """Les sections nommées par le REFUS de schéma transporté par ``exc``.

    Vide = ``exc`` n'est pas un refus de schéma (une panne réseau, un 529, un
    champ de mauvais type). L'appelant DOIT alors la laisser remonter : c'est ce
    qui empêche une vraie panne de se déguiser en dossier dégradé.

    Pourquoi une fouille et pas un simple ``isinstance`` : le routeur ne voit
    jamais la ``ValidationError``. Il voit l'enveloppe d'``instructor``, qui
    porte l'erreur d'origine dans ``args[0]`` et la re-lève ``from`` la
    ``RetryError`` de tenacity. Le nom traverse trois couches ; sans cette
    fonction, « le refus nomme le champ » resterait une intention.
    """
    seen: set[int] = set()
    queue: list[tuple[BaseException, int]] = [(exc, 0)]
    while queue:
        current, depth = queue.pop(0)
        if id(current) in seen or depth > _REFUSAL_CHAIN_DEPTH:
            continue
        seen.add(id(current))
        errors = getattr(current, "errors", None)
        if callable(errors):
            try:
                details = errors()
            except Exception:  # noqa: BLE001 — une erreur illisible n'est pas un refus
                details = []
            for detail in details or []:
                if isinstance(detail, dict) and detail.get("type") == _REFUSAL_CODE:
                    sections = (detail.get("ctx") or {}).get("sections") or []
                    return tuple(str(s) for s in sections)
        for nested in (current.__cause__, current.__context__, *current.args):
            if isinstance(nested, BaseException):
                queue.append((nested, depth + 1))
    return ()


class ResearchStrategy(BaseModel):
    """Output of BELLUM-STRATEGY — pains + angles + sales scripts.

    ── Pourquoi ce modèle REFUSE une sortie qui ne dit rien ────────────────────

    Chaque champ avait un défaut vide, et rien d'autre. Une réponse que Pydantic
    ne mappait sur AUCUN champ validait donc sans lever : le dossier se terminait
    « completed » et les onglets Angles / Défis IT s'ouvraient vides — ce qui se
    lit « ce compte n'a pas d'angle », pas « on n'a pas su lire la réponse ».
    L'échec était SILENCIEUX, et c'est ça la cause racine.

    Mesuré le 28/08/2026, trois tirages directs par modèle sur le vrai prompt :
    Sonnet a rendu l'objet entièrement vide 2 fois sur 3 (0,00 · 0,00 · 64,25 sur
    la grille du dépôt), chaque échec facturé ~0,11 $ ; Luna : 96 · 100 · 100. La
    production portait déjà `_strategy_is_empty` → relance → `STRATEGY_EMPTY_RETRY`
    — un pansement sur ~66 % d'échecs, dont chaque relance est un second appel
    payant AVEUGLE.

    ── Quel minimum est VRAI, champ par champ ─────────────────────────────────

    La question du dépôt, posée à chaque champ : *si cette valeur est absente,
    « vide » est-il la bonne réponse ?*

    - `it_challenges` — OUI, vide peut être vrai. Une PME de douze personnes n'a
      pas de défi IT nommable dans des sources publiques. En exiger un pousserait
      le modèle à en inventer, ce que le prompt lui interdit par ailleurs
      (« Info absente → "Non detecte", jamais d'invention »). Aucun minimum propre.
    - `pains` — OUI sur un compte maigre, malgré le « MIN 4 » du prompt : ce MIN
      est une CIBLE de richesse pour un grand compte, pas un contrat. Le hisser
      au schéma transformerait « je n'ai pas trouvé » en « invente-en quatre ».
      Aucun minimum propre.
    - `angles` — OUI, même raison, et le dépôt le documentait déjà : un compte
      peut n'avoir aucun angle chiffré tout en ayant une porte d'entrée décrite.
      Aucun minimum propre.
    - `axes_ecartes` — OUI, évidemment : ce sont les angles DÉLIBÉRÉMENT écartés.
      N'avoir rien écarté est une réponse. Aucun minimum propre.
    - `comment_ouvrir_compte` — OUI. Aucun minimum propre.
    - `rdv_script` — sans objet : son défaut est un objet plein de chaînes vides.
      Il ne peut porter aucun minimum sans faire passer le cas cassé pour normal,
      et il ne COMPTE pas comme une section remplie.
    - `power_questions`, `objections` — OUI. Aucun minimum propre.

    Le seul minimum VRAI est donc COLLECTIF : **au moins une des sept sections
    doit dire quelque chose.** Sept jugements hétérogènes ne deviennent pas vides
    ensemble par jugement — c'est ce que deux runs réels du 10/08 (leboncoin,
    BlaBlaCar) montraient déjà, faits et signaux pleins pendant que les sept
    sections tombaient d'un coup. Un `min_length=1` posé partout aurait refusé le
    petit compte légitime ; posé nulle part, c'est le défaut d'aujourd'hui.

    Ce que le refus permet, et que la relance aveugle ne permettait pas : le
    message NOMME les sections vides. instructor le renvoie au modèle (reask) au
    lieu de retirer le même prompt à l'identique, et le routeur le journalise.
    """

    it_challenges: list[ItChallenge] = Field(alias="itChallenges", default=[])
    pains: list[Pain] = []

    angles: list[Angle] = []
    axes_ecartes: list[AxeEcarte] = Field(alias="axesEcartes", default=[])
    comment_ouvrir_compte: str = Field(alias="commentOuvrirCompte", default="")
    rdv_script: RdvScript = Field(alias="rdvScript", default_factory=RdvScript)
    power_questions: list[str] = Field(alias="powerQuestions", default=[])
    objections: list[Objection] = []

    model_config = {"populate_by_name": True}

    @field_validator("axes_ecartes", mode="before")
    @classmethod
    def _sanitize_axes_ecartes(cls, v: object) -> list:
        return _sanitize_axes_raw(v)

    @model_validator(mode="after")
    def _refuse_a_strategy_that_says_nothing(self) -> ResearchStrategy:
        """Le refus BRUYANT — la sortie vide n'est plus un succès silencieux.

        Le message NOMME les sections vides, sous leurs clés de fil. C'est ce qui
        rend la relance CIBLÉE : `instructor` renvoie le message de validation au
        modèle (reask) au lieu de retirer le même prompt à l'identique, et le
        code appelant peut le lire dans `ctx["sections"]`.
        """
        empty = strategy_sections_that_say_nothing(self)
        if len(empty) < len(STRATEGY_SECTIONS):
            return self
        named = ", ".join(_SECTION_WIRE_ALIAS[section] for section in empty)
        raise PydanticCustomError(
            _REFUSAL_CODE,  # type: ignore[arg-type]  — littéral côté pydantic, constante ici
            (
                "La stratégie ne dit RIEN : aucune des sections {named} ne porte de "
                "contenu (une liste d'items dont aucun ne nomme quoi que ce soit compte "
                "pour vide). Remplis au moins la ou les sections que les sources "
                "soutiennent réellement — n'invente rien pour les autres, laisse-les vides."
            ),
            {"sections": list(empty), "named": named},
        )

    @classmethod
    def empty(cls) -> ResearchStrategy:
        """La stratégie vide SANCTIONNÉE — le seul chemin qui contourne le refus.

        Le dossier PART quand même quand la stratégie a échoué : faits, signaux,
        contacts et plan ont abouti, et les jeter reviendrait à punir
        l'utilisateur d'un défaut de forme. Il faut donc une façon nommée de
        fabriquer l'objet vide, et une seule — sinon le prochain qui en a besoin
        rouvrira le trou en retirant la contrainte.

        `model_construct` remplit les défauts sans valider : rien n'est inventé,
        et l'objet se sérialise comme n'importe quel autre.
        """
        return cls.model_construct()


# ── Merged output (for type purposes / legacy callers) ────────────────────────


class ResearchOutput(BaseModel):
    """Unified Phase 1 output — merge of facts + signals + strategy.

    Built by `phase1_research.py` from the three sub-prompts. The shape is
    preserved across the split so `AnalysisResearchData` (typed slice) and
    `account.raw_analysis` (full payload) on the API side remain untouched.

    ⚠️ Ce modèle-ci ne porte PAS le refus « la stratégie ne dit rien » de
    `ResearchStrategy`, et c'est délibéré. `ResearchStrategy` est la RÉPONSE d'un
    modèle : une réponse vide est un échec de lecture, et le refuser est ce qui
    permet une relance. `ResearchOutput` est le dossier LIVRÉ : le dépôt a déjà
    tranché qu'il part même sans angle ni défi IT, avec l'avertissement
    `STRATEGY_SECTIONS_EMPTY` — refuser ici jetterait les faits, les signaux, les
    contacts et le plan pour punir un défaut de forme. Même mot, deux décisions.
    """

    # Facts
    business_description: str = Field(alias="businessDescription", default="")
    sector: str = ""
    employees: str = ""
    revenue: str = ""
    headquarters: str = ""
    website: str = ""
    is_public: bool = Field(alias="isPublic", default=False)
    subsidiaries: list[Subsidiary] = []
    entities_exhaustive: list[EntityExhaustive] = Field(alias="entitiesExhaustive", default=[])
    sites_france: list[SiteFrance] = Field(alias="sitesFrance", default=[])
    program_names: list[ProgramName] = Field(alias="programNames", default=[])
    technology_stack: list[TechnologyStackItem] = Field(alias="technologyStack", default=[])
    regulations: list[str] = []
    concrete_activity: str = ""
    it_implications_for_esn: str = ""
    data_freshness: DataFreshness = Field(default_factory=DataFreshness)
    priority_score: int = Field(alias="priorityScore", default=5, ge=0, le=10)
    priority_justification: str = Field(alias="priorityJustification", default="")
    adjusted_score_factors: AdjustedScoreFactors = Field(default_factory=AdjustedScoreFactors)

    # Signals
    budget_signals: list[BudgetSignal] = Field(alias="budgetSignals", default=[])
    recent_signals: list[RecentSignal] = Field(alias="recentSignals", default=[])
    qualified_hypotheses: list[QualifiedHypothesis] = Field(alias="qualifiedHypotheses", default=[])
    competitors: list[Competitor] = []
    esn_synergies: list[EsnSynergy] = Field(alias="esnSynergies", default=[])
    people_mentioned: list[PersonMentioned] = Field(alias="peopleMentioned", default=[])
    linkedin_search_keywords: LinkedinSearchKeywords = Field(
        alias="linkedinSearchKeywords", default_factory=LinkedinSearchKeywords,
    )
    organigramme_logic: str = Field(alias="organigrammeLogic", default="")

    # Strategy
    it_challenges: list[ItChallenge] = Field(alias="itChallenges", default=[])
    pains: list[Pain] = []
    angles: list[Angle] = []
    axes_ecartes: list[AxeEcarte] = Field(alias="axesEcartes", default=[])
    comment_ouvrir_compte: str = Field(alias="commentOuvrirCompte", default="")
    rdv_script: RdvScript = Field(alias="rdvScript", default_factory=RdvScript)
    power_questions: list[str] = Field(alias="powerQuestions", default=[])
    objections: list[Objection] = []

    model_config = {"populate_by_name": True}

    @field_validator("axes_ecartes", mode="before")
    @classmethod
    def _sanitize_axes_ecartes(cls, v: object) -> list:
        # Bare string / null / non-list items must not crash validation (they can
        # come straight from the free-form LLM output).
        return _sanitize_axes_raw(v)

    @field_validator("axes_ecartes")
    @classmethod
    def _clean_axes_ecartes(cls, v: list[AxeEcarte]) -> list[AxeEcarte]:
        # Drop entries with no named angle (§8 — no fabrication) and cap the list
        # so the "set aside" catalogue stays a selection signal, not a dump.
        return [a for a in v if a.angle.strip()][:_MAX_AXES_ECARTES]
