"""#2284 — Entity Resolver P0 : le COMPOSITEUR des verdicts d'identité.

Le pipeline d'analyse tranchait déjà l'identité de l'entreprise, mais en trois
endroits et trois vocabulaires :

- ``homonym_disambiguation`` — plusieurs entreprises du même nom ?
  (``locked``/``unique``/``selected``/``ambiguous``/``none``) ;
- ``identity_resolution.assess_identity`` — l'entité du registre EST-elle la
  cible, ou un homonyme de taille/secteur incompatible ?
  (``verified``/``uncertain``/``homonyme``/``no_registry``) ;
- ``entity_type`` — quelle SORTE d'entité (véhicule, cédée, BU…).

Ce module n'en ajoute pas un quatrième (GA-26 : un réglage vit à un seul
endroit). Il ne re-résout RIEN, n'appelle aucun réseau : il lit ces verdicts et
les projette sur la taxonomie commune du contrat
``packages/contracts/src/schemas/entity-resolution.ts`` (16 types, 7 états,
12 sources) — parité gardée par ``entity-resolution.test.ts``, qui lit les
tuples ci-dessous (une ligne chacun, c'est ce qui les rend lisibles).

#2265.2 — ``size`` et ``workspace_data`` complètent les 10 sources de #2284 :
la taille (registre) qui ne servait qu'au diagnostic d'homonyme
(``identity_resolution.assess_identity``) et le rapprochement avec un compte
DÉJÀ dans le même espace (SIREN partagé, ou nom+domaine quand ni l'un ni
l'autre côté ne porte de SIREN — #2265.11) deviennent des SOURCES nommées,
jamais une fusion silencieuse (``workspace_account_match.py``).

Doctrine tenue ici :

- le nom seul ne résout jamais (#2284.28) — sans identifiant légal, ``unresolved`` ;
- une ambiguïté devient une QUESTION nommée (#2284.65), jamais un choix muet ;
- « non mesuré » ≠ 0 — confiance et nombre d'enfants absents valent ``None`` ;
- aucune fusion : le verdict décrit le compte analysé, il n'en touche aucun autre ;
- les sources sont des CATÉGORIES (« registre légal »), jamais nos fournisseurs.
"""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel

from app.services.account_qualification import is_end_client_legal_category
from app.services.assets import website_domain
from app.services.country_packs import RegistryEntity
from app.services.entity_type import (
    ENTITY_TYPE_DORMANT,
    ENTITY_TYPE_OUT_OF_SCOPE,
    ENTITY_TYPE_PARTNER,
    ENTITY_TYPE_PERSON,
    ENTITY_TYPE_VEHICLE,
    classify_entity_type,
    is_holding_name,
)
from app.services.esn_naf import is_esn_naf_code
from app.services.homonym_disambiguation import HomonymResolution
from app.services.identity_resolution import IdentityAssessment
from app.services.intermediation import intermediary_kind
from app.services.pappers.models import CompanyProfile
from app.services.text_norm import normalize_name
from app.services.workspace_account_match import WorkspaceAccountMatch

# fmt: off
ENTITY_KINDS: tuple[str, ...] = ("group", "parent_company", "subsidiary", "business_unit", "brand", "business_direction", "site", "program", "legal_entity", "holding", "legal_vehicle", "inactive_company", "homonym", "platform", "esn", "end_client")  # noqa: E501
ENTITY_RESOLUTION_STATES: tuple[str, ...] = ("resolved", "ambiguous", "unresolved", "manual_override", "historical", "inactive", "out_of_scope")  # noqa: E501
ENTITY_RESOLUTION_SOURCES: tuple[str, ...] = ("legal_identifier", "registry_country", "official_domain", "external_company_id", "official_site", "group_graph", "public_company_profile", "normalized_name", "alias", "workspace_correction", "size", "workspace_data")  # noqa: E501
#: GA-26 — les types d'affichage de ``entity_type.py`` projetés sur la taxonomie.
#: ``None`` = pas un type d'entité : un état (hors périmètre), une relation
#: (partenaire) ou pas une organisation du tout (personne).
LEGAL_GRAPH_TYPE_TO_KIND: dict[str, str | None] = {"parent": "parent_company", "business_unit": "business_unit", "operating_subsidiary": "subsidiary", "financing_vehicle": "legal_vehicle", "dormant_or_divested": "inactive_company", "out_of_scope": None, "partner": None, "person_not_an_entity": None}  # noqa: E501
#: #2284.5-.9 — miroir de ``ORG_ENTITY_TYPE_TO_ENTITY_KIND`` (contrat) : le kind que
#: le ``type`` d'un nœud de l'organigramme dit DÉJÀ. Parité : ``entity-resolution.test.ts``.
ORG_ENTITY_TYPE_TO_KIND: dict[str, str | None] = {"groupe": "group", "filiale": "subsidiary", "bu": "business_unit", "departement": "business_direction", "programme": "program", "site": "site", "spv": "legal_vehicle", "factory": "business_unit", "data_office": "business_direction", "lab": "business_unit", "equipe": "business_unit", "partenaire": "esn"}  # noqa: E501
# fmt: on

#: Seul registre branché à la résolution aujourd'hui : le registre français.
_REGISTRY_COUNTRY = "FR"
#: Statuts d'homonymie où UN candidat a été retenu sans intervention humaine.
_PICKED_STATUSES = frozenset({"unique", "selected"})
#: Miroir de ``ANCHORED_STATES`` (``entity-resolution.ts``) : les seuls états où
#: une identité peut porter un identifiant externe supplémentaire (#2284.21) —
#: un id Apollo n'ANCRE jamais seul un verdict ``unresolved``/``ambiguous``.
_ANCHORED_STATES = frozenset({"resolved", "manual_override", "inactive"})

#: #2284.35 — les sortes que ``classify_entity_type`` rend pour une ligne qui
#: n'est pas — ou plus — une entreprise commerciale actionnable : une personne,
#: un partenariat/participation, ou un nom hors périmètre. ``_kind_of`` rend
#: alors ``None`` (jamais un kind deviné) et le verdict devient ``out_of_scope``.
_OUT_OF_SCOPE_LEGAL_TYPES = frozenset({ENTITY_TYPE_OUT_OF_SCOPE, ENTITY_TYPE_PERSON, ENTITY_TYPE_PARTNER})


#: Doctrine « nos fournisseurs ne se nomment jamais à l'écran » : les raisons
#: héritées des verdicts amont en citent parfois un (« registre (Pappers) »).
_PROVIDER_PAREN_RE = re.compile(r"\s*\((?:pappers|insee|sirene|recherche-entreprises)\)", re.IGNORECASE)
_PROVIDER_RE = re.compile(r"\b(?:pappers|insee|sirene|recherche-entreprises)\b", re.IGNORECASE)


def _public_reasons(reasons: list[str]) -> list[str]:
    cleaned = (_PROVIDER_RE.sub("registre", _PROVIDER_PAREN_RE.sub("", r)).strip() for r in reasons)
    return [r for r in cleaned if r]


class ResolutionCandidate(BaseModel):
    name: str
    siren: str | None = None
    city: str | None = None


class ResolutionQuestion(BaseModel):
    candidates: list[ResolutionCandidate]


class EntityResolution(BaseModel):
    """Miroir pydantic de ``entityResolutionSchema`` — snake_case, comme le blob
    ``raw_analysis``."""

    state: str
    kind: str | None = None
    canonical_id: str | None = None
    commercial_name: str
    legal_name: str | None = None
    country: str | None = None
    identifiers: dict[str, str] = {}
    domain: str | None = None
    naf_code: str | None = None
    naf_label: str | None = None
    location: str | None = None
    parent_names: list[str] = []
    children_count: int | None = None
    #: #2284.58 — dénominations ANTÉRIEURES du même SIREN, registre légal
    #: (jamais une correction CRM) — voir ``attach_former_legal_names``.
    former_legal_names: list[str] = []
    sources: list[str]
    confidence: int | None = None
    reasons: list[str] = []
    question: ResolutionQuestion | None = None
    resolved_at: str


def _kind_of(registry: CompanyProfile) -> tuple[str | None, str | None]:
    """Le type de l'entité légale retenue, dans l'ordre où il se décide :
    cessée d'abord (elle a quitté le jeu), puis personne/partenariat/hors
    périmètre (#2284.35 — ce n'est alors pas un kind, ``None`` avec sa raison),
    puis holding et véhicule (le nom les signe), puis ESN (le NAF), puis sa
    place dans le graphe du groupe."""
    if registry.has_ceased:
        return "inactive_company", None
    legal_type, reason = classify_entity_type(registry.legal_name, headcount=registry.headcount_max)
    if legal_type == ENTITY_TYPE_DORMANT:
        return (LEGAL_GRAPH_TYPE_TO_KIND[ENTITY_TYPE_DORMANT] or "inactive_company"), None
    if legal_type in _OUT_OF_SCOPE_LEGAL_TYPES:
        return None, reason
    # #2284.11 / #2284.12 — une holding n'est pas une SCI : `entity_type` les
    # range ensemble pour l'AFFICHAGE, la résolution les distingue.
    if is_holding_name(registry.legal_name):
        return "holding", None
    if legal_type == ENTITY_TYPE_VEHICLE:
        return (LEGAL_GRAPH_TYPE_TO_KIND[ENTITY_TYPE_VEHICLE] or "legal_vehicle"), None
    # #2284.15 — une plateforme de mise en relation (Malt, Comet…) est un TYPE
    # d'entité à part, jamais un ESN ni un client final : même preuve NAF/nom
    # qu'``ActorType.PLATEFORME_INTERMEDIATION`` (#2265.4/.9, GA-26 — aucun
    # second calcul), la plus spécifique avant le NAF ESN générique.
    if intermediary_kind(name=registry.legal_name, naf=registry.naf_code) == "plateforme":
        return "platform", None
    if is_esn_naf_code(registry.naf_code) is True:
        return "esn", None
    # #2284.3 / #2284.4 — maison mère vs filiale se lit sur le graphe du groupe.
    if registry.parent_companies:
        return "subsidiary", None
    if registry.subsidiaries:
        return "parent_company", None
    return "legal_entity", None


def _has_alias(registry: CompanyProfile) -> bool:
    """#2265.2 — critère ALIAS : Pappers publie parfois un nom commercial distinct
    du nom légal (``nom_commercial`` vs ``nom_entreprise`` — « Kicklox » est la
    marque, LINNAEUS le nom légal, cf. ``recherche_entreprises.py``). Quand les
    deux diffèrent, l'alias a réellement été croisé dans l'identité retenue —
    même logique que ``official_domain`` ci-dessus, ajoutée dès que le fait
    existe, jamais devinée."""
    alias = normalize_name(registry.commercial_name)
    return bool(alias) and alias != normalize_name(registry.legal_name)


def _confidence(identity: IdentityAssessment, homonyms: HomonymResolution | None) -> int | None:
    value = identity.identity_confidence
    if homonyms is not None and homonyms.status in _PICKED_STATUSES and homonyms.confidence > 0:
        value *= homonyms.confidence
    score = round(value * 100)
    return score if score >= 1 else None


def resolve_account_entity(
    *,
    target_name: str,
    homonyms: HomonymResolution | None,
    identity: IdentityAssessment,
    registry: CompanyProfile | None,
    website: str | None,
    locked_siren: str | None,
    now: datetime,
    country: str | None = None,
    foreign_registry: RegistryEntity | None = None,
    workspace_match: WorkspaceAccountMatch | None = None,
    official_site_match: bool = False,
) -> EntityResolution:
    """Projette les verdicts du pipeline sur UN verdict d'entité (#2284).

    #2284.19 — ``foreign_registry`` est le ``RegistryEntity`` déjà résolu par le
    country pack actif (``collect_country_signals``, no-op hors pack) pour
    ``country`` : seul registre étranger branché ici, il ne remplace le chemin
    FR (Pappers/``registry``) qu'en son ABSENCE — le registre français garde la
    priorité s'il existe.

    #2284.22 — ``official_site_match`` est déjà calculé par l'appelant
    (``resolve_pappers_via_web_or_bundle`` / ``siren_finder.extract_siren``) :
    le SIREN a été lu sur une page dont l'HÔTE correspond au nom de
    l'entreprise (mentions légales, art. R.123-237), une extraction
    déterministe — jamais le champ ``website`` (texte libre du LLM), qui
    reste couvert par la source ``official_domain`` existante. ``False`` par
    défaut : comportement inchangé quand l'appelant ne le calcule pas.

    #2265.2/#2265.11 — ``workspace_match`` est le rapprochement DÉJÀ calculé
    (``workspace_account_match.match_workspace_account``, pur, sans réseau)
    avec un compte du MÊME espace : jamais une fusion (doctrine #2284.28 —
    « le nom seul ne fusionne jamais deux entités »), seulement une source et
    une raison nommées, y compris quand l'entité reste ``unresolved`` faute
    de SIREN ou de nom légal (Brave/Apollo).
    """
    domain = website_domain(website)
    base_sources = ["normalized_name"] + (["official_domain"] if domain else [])
    resolved_at = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    common = {"commercial_name": target_name.strip() or target_name, "domain": domain, "resolved_at": resolved_at}
    workspace_reason = (
        [f"rapproché du compte « {workspace_match.name} » déjà dans cet espace"]
        if workspace_match is not None and workspace_match.name
        else []
    )

    # #2284.65 — plusieurs entreprises plausibles du même nom, aucune ne domine :
    # on NOMME les candidats plutôt que d'en retenir un en silence. Le SIREN
    # fourni par l'utilisateur (locked) court-circuite cette branche.
    if homonyms is not None and homonyms.status == "ambiguous" and len(homonyms.candidates) >= 2:
        return EntityResolution(
            state="ambiguous",
            sources=base_sources,
            reasons=_public_reasons(list(homonyms.reasons) or ([homonyms.message] if homonyms.message else [])),
            question=ResolutionQuestion(
                candidates=[
                    ResolutionCandidate(name=c.name, siren=c.siren, city=c.city) for c in homonyms.candidates[:5]
                ]
            ),
            **common,
        )

    # #2284.28 — sans entité légale DE CONFIANCE, rien n'est résolu : le registre
    # a rendu un homonyme (taille/secteur incompatibles) ou rien du tout.
    if registry is None or not identity.use_registry_data:
        # #2284.19 — pas de Pappers (hors FR le plus souvent), mais un registre
        # pays actif A résolu l'entité : source distincte (``registry_country``),
        # jamais le nom seul. Confiance non mesurée : aucune comparaison
        # registre/web n'existe pour ce pays (``assess_identity`` est FR-only) —
        # ``None``, jamais devinée.
        if country and foreign_registry is not None and foreign_registry.get("registryId"):
            return EntityResolution(
                state="resolved",
                kind="legal_entity",
                canonical_id=f"{country}-REGISTRY-{foreign_registry['registryId']}",
                legal_name=foreign_registry.get("name") or None,
                country=country,
                identifiers={"registryId": foreign_registry["registryId"]},
                location=foreign_registry.get("seat") or None,
                sources=[*base_sources, "registry_country"],
                confidence=None,
                **common,
            )
        sources = list(base_sources) + (["workspace_data"] if workspace_match is not None else [])
        return EntityResolution(
            state="unresolved",
            sources=sources,
            reasons=_public_reasons(list(identity.reasons) + workspace_reason),
            **common,
        )

    manual = bool(locked_siren) or (homonyms is not None and homonyms.status == "locked")
    kind, out_of_scope_reason = _kind_of(registry)
    # #2284.35 — une correction humaine gagne toujours (doctrine) : un SIREN
    # verrouillé par l'utilisateur reste `manual_override` même si le nom lu au
    # registre se classerait sinon hors périmètre. Sans correction, une cible
    # qui n'est pas une entreprise commerciale actionnable (personne,
    # partenariat, nom hors périmètre) n'est jamais ANCRÉE : pas de
    # `canonical_id` inventé pour un type qu'on refuse de nommer.
    if kind is None and not manual:
        return EntityResolution(
            state="out_of_scope",
            sources=base_sources,
            reasons=_public_reasons([out_of_scope_reason] if out_of_scope_reason else []),
            **common,
        )
    state = "manual_override" if manual else ("inactive" if kind == "inactive_company" else "resolved")
    sources = [*base_sources, "legal_identifier", "registry_country", "public_company_profile"]
    if registry.subsidiaries or registry.parent_companies:
        sources.append("group_graph")
    if manual:
        sources.append("workspace_correction")
    if _has_alias(registry):
        sources.append("alias")
    # #2265.2 — la taille (registre) est déjà CROISÉE, ailleurs, pour trancher
    # un homonyme (``identity_resolution.assess_identity``) : la nommer ici
    # comme source ne recalcule rien (GA-26), ça dit juste qu'un fait de
    # taille était disponible et a compté dans le verdict retenu.
    if registry.headcount_max is not None or registry.headcount_label:
        sources.append("size")
    # #2284.22 — le SIREN a été lu sur le site officiel de l'entreprise (mentions
    # légales), pas seulement retrouvé par nom : une source à part de
    # ``official_domain`` (qui ne fait que parser le domaine du champ LLM).
    if official_site_match:
        sources.append("official_site")
    if workspace_match is not None:
        sources.append("workspace_data")
    parents = [p.name for p in registry.parent_companies if p.name]
    return EntityResolution(
        state=state,
        kind=kind,
        canonical_id=f"{_REGISTRY_COUNTRY}-SIREN-{registry.siren}",
        legal_name=registry.legal_name,
        country=_REGISTRY_COUNTRY,
        identifiers={"siren": registry.siren},
        naf_code=registry.naf_code,
        naf_label=registry.naf_label,
        location=registry.headquarters.city if registry.headquarters else None,
        parent_names=parents,
        children_count=len(registry.subsidiaries),
        sources=sources,
        confidence=100 if manual else _confidence(identity, homonyms),
        reasons=_public_reasons(list(identity.reasons) + workspace_reason),
        **common,
    )


def attach_external_company_id(resolution: dict, organization_id: str | None) -> dict:
    """#2284.21 — ajoute l'id d'organisation Apollo (déjà persisté sur
    ``account.apollo_enrichment.organizationId``) comme source ADDITIONNELLE.

    Il n'ancre jamais un verdict à lui seul (issu d'un rapprochement par domaine,
    pas d'un registre légal) : sans identité déjà ANCRÉE (resolved/manual_override
    /inactive), ou sans id, ``resolution`` revient inchangée — pas de fusion muette,
    pas de résolution devinée. Idempotent : un second appel ne duplique pas la
    source.
    """
    if not organization_id or resolution.get("state") not in _ANCHORED_STATES:
        return resolution
    identifiers = {**resolution.get("identifiers", {}), "external_company_id": organization_id}
    sources = list(resolution.get("sources", []))
    if "external_company_id" not in sources:
        sources.append("external_company_id")
    return {**resolution, "identifiers": identifiers, "sources": sources}


def attach_legal_category_kind(resolution: dict, legal_category: str | None) -> dict:
    """#2284.17 — précise ``kind`` en ``end_client`` (administration, collectivité,
    établissement public, association) quand la catégorie juridique INSEE de
    l'entité déjà ANCRÉE (resolved/manual_override/inactive) le prouve
    (``is_end_client_legal_category``, GA-26 — même table que
    ``account_qualification.is_public_employer``).

    N'UPGRADE que le repli honnête ``legal_entity`` — jamais ``esn``, ``holding``,
    ``legal_vehicle``, ``platform``, ``subsidiary`` ni ``parent_company``, qui
    portent chacun une preuve plus spécifique que la seule catégorie juridique
    (#2284.15/.11/.3/.4). Sans catégorie connue, ou sur une catégorie qui ne
    prouve rien (``is_end_client_legal_category`` rend ``False``), ``resolution``
    revient inchangée — jamais un type deviné sur un silence.
    """
    if resolution.get("kind") != "legal_entity" or resolution.get("state") not in _ANCHORED_STATES:
        return resolution
    if is_end_client_legal_category(legal_category) is not True:
        return resolution
    return {**resolution, "kind": "end_client"}


def attach_former_legal_names(resolution: dict, former_names: list[str] | tuple[str, ...] | None) -> dict:
    """#2284.33/.58 — les dénominations ANTÉRIEURES du SIREN déjà résolu, lues
    au REGISTRE LÉGAL (INSEE Sirene, ``insee_sirene.unite_legale_by_siren``),
    jamais une correction CRM (``record_field_audit`` sur ``company_name`` ne
    prouve rien de légal).

    N'enrichit qu'une identité déjà ANCRÉE (resolved/manual_override/inactive) ;
    sans nom antérieur connu, ``resolution`` revient inchangée.

    #2284.33 — quand le nom RECHERCHÉ (``commercial_name``, la cible telle que
    tapée) correspond à une dénomination ANTÉRIEURE et PAS à la dénomination
    ACTUELLE (``legal_name``), l'état passe à ``historical`` : la MÊME entité
    légale a été résolue, sous un nom qu'elle ne porte plus. Seulement depuis
    ``resolved`` — jamais depuis ``manual_override`` (une correction humaine
    gagne toujours) ni depuis ``inactive`` (déjà nommé).
    """
    names = [n for n in (former_names or []) if n]
    if not names or resolution.get("state") not in _ANCHORED_STATES:
        return resolution
    out = {**resolution, "former_legal_names": names}
    if out.get("state") != "resolved":
        return out
    target = normalize_name(out.get("commercial_name"))
    current = normalize_name(out.get("legal_name"))
    if target and target != current and any(normalize_name(n) == target for n in names):
        out["state"] = "historical"
    return out


#: #2284.26 — les états où un domaine PROUVÉ par alias sert : une identité déjà
#: ANCRÉE (il la corrobore), ou ``unresolved`` — le cas visé par #2263.24 (« SG
#: SOCIETE GENERALE » que le nom seul ne résout pas). Jamais ``ambiguous`` (sa
#: propre question en cours) ni ``out_of_scope`` (pas une entreprise
#: commerciale actionnable).
_ALIAS_DOMAIN_STATES = _ANCHORED_STATES | {"unresolved"}


def attach_alias_domain(resolution: dict, domain: str | None) -> dict:
    """#2284.26 — le domaine que la mémoire marché a PROUVÉ par un alias
    (``bellum_api.market_alias_domain_for``, ``matchedOn: 'alias'`` — #1756,
    une équivalence DÉCLARÉE, ne tranche QUE le silence total des
    rapprochements domaine/nom). Jamais un SIREN : ``market_company_signal``
    n'en porte aucun (``market-company-resolution.ts``).

    N'écrase jamais un domaine déjà connu (``official_domain`` reste
    prioritaire), et ne s'applique que sur les états où il sert
    (``_ALIAS_DOMAIN_STATES``). Sans domaine, ``resolution`` revient
    inchangée.
    """
    if not domain or resolution.get("domain") or resolution.get("state") not in _ALIAS_DOMAIN_STATES:
        return resolution
    sources = list(resolution.get("sources", []))
    if "alias" not in sources:
        sources.append("alias")
    return {**resolution, "domain": domain, "sources": sources}
