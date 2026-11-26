"""#2284 — Entity Resolver P0 (tranche 1) : le compositeur des verdicts d'identité.

Il ne re-résout rien : il lit les verdicts DÉJÀ produits par le pipeline
(homonymes, identité registre/web, profil registre) et les projette sur la
taxonomie commune (``packages/contracts/src/schemas/entity-resolution.ts``).
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.services.entity_resolution import (
    ENTITY_KINDS,
    LEGAL_GRAPH_TYPE_TO_KIND,
    attach_alias_domain,
    attach_external_company_id,
    attach_former_legal_names,
    attach_legal_category_kind,
    resolve_account_entity,
)
from app.services.entity_type import (
    ENTITY_TYPE_BUSINESS_UNIT,
    ENTITY_TYPE_DORMANT,
    ENTITY_TYPE_OPERATING,
    ENTITY_TYPE_OUT_OF_SCOPE,
    ENTITY_TYPE_PARENT,
    ENTITY_TYPE_PARTNER,
    ENTITY_TYPE_PERSON,
    ENTITY_TYPE_VEHICLE,
)
from app.services.homonym_disambiguation import HomonymResolution, ScoredCandidate
from app.services.identity_resolution import IdentityAssessment
from app.services.pappers.models import CompanyProfile
from app.services.workspace_account_match import WorkspaceAccountMatch

NOW = datetime(2026, 9, 24, 10, 0, tzinfo=UTC)
VERIFIED = IdentityAssessment(status="verified", identityConfidence=1.0, useRegistryData=True, mode="registre")


def _profile(**extra: object) -> CompanyProfile:
    data: dict = {
        "siren": "552081317",
        "nom_entreprise": "ELECTRICITE DE FRANCE",
        "code_naf": "35.11Z",
        "libelle_code_naf": "Production d'électricité",
        "siege": {"ville": "Paris"},
        "effectif_max": 100000,
    }
    data.update(extra)
    return CompanyProfile.model_validate(data)


def _resolve(**kw: object):
    args: dict = {
        "target_name": "EDF",
        "homonyms": None,
        "identity": VERIFIED,
        "registry": _profile(),
        "website": "https://www.edf.fr/",
        "locked_siren": None,
        "now": NOW,
    }
    args.update(kw)
    return resolve_account_entity(**args)


def test_every_legal_graph_type_projects_onto_the_taxonomy_or_nothing():
    for legal_type in (
        ENTITY_TYPE_PARENT,
        ENTITY_TYPE_BUSINESS_UNIT,
        ENTITY_TYPE_OPERATING,
        ENTITY_TYPE_VEHICLE,
        ENTITY_TYPE_DORMANT,
        ENTITY_TYPE_OUT_OF_SCOPE,
        ENTITY_TYPE_PARTNER,
        ENTITY_TYPE_PERSON,
    ):
        assert legal_type in LEGAL_GRAPH_TYPE_TO_KIND
        kind = LEGAL_GRAPH_TYPE_TO_KIND[legal_type]
        assert kind is None or kind in ENTITY_KINDS


def test_verified_registry_resolves_with_legal_sources():
    r = _resolve()
    assert r.state == "resolved"
    assert r.kind == "legal_entity"
    assert r.canonical_id == "FR-SIREN-552081317"
    assert r.legal_name == "ELECTRICITE DE FRANCE"
    assert r.country == "FR"
    assert r.identifiers == {"siren": "552081317"}
    assert r.domain == "edf.fr"
    assert r.location == "Paris"
    assert r.confidence == 100
    assert r.children_count == 0
    assert {"legal_identifier", "registry_country", "public_company_profile", "official_domain"} <= set(r.sources)
    assert r.resolved_at == "2026-09-24T10:00:00Z"


def test_parent_company_vs_subsidiary_from_the_group_graph():
    parent = _resolve(
        registry=_profile(subsidiaries=[{"id": "1", "siren": "1", "nom_entreprise": "EDF RENOUVELABLES"}])
    )
    assert parent.kind == "parent_company"
    assert parent.children_count == 1
    assert "group_graph" in parent.sources
    child = _resolve(registry=_profile(parent_companies=[{"id": "2", "siren": "2", "nom_entreprise": "EDF GROUPE"}]))
    assert child.kind == "subsidiary"
    assert child.parent_names == ["EDF GROUPE"]


def test_holding_and_legal_vehicle_are_distinguished():
    assert _resolve(registry=_profile(nom_entreprise="EDF PARTICIPATIONS", effectif_max=None)).kind == "holding"
    assert _resolve(registry=_profile(nom_entreprise="SCI DU SURMELIN", effectif_max=None)).kind == "legal_vehicle"


def test_esn_by_naf():
    assert _resolve(registry=_profile(code_naf="62.02A")).kind == "esn"


def test_platform_kind_from_the_same_signal_as_actor_type():
    """#2284.15 — une plateforme de mise en relation (Malt, Comet…) est un TYPE
    à part, jamais un ESN générique : même preuve NAF/nom qu'``ActorType.
    PLATEFORME_INTERMEDIATION`` (#2265.4/.9), jamais un second calcul (GA-26)."""
    r = _resolve(registry=_profile(nom_entreprise="Malt", code_naf="70.22Z"))
    assert r.kind == "platform"


def test_size_source_present_when_headcount_known_absent_when_not():
    """#2265.2 — la taille (registre) était déjà croisée pour trancher un
    homonyme (``identity_resolution.assess_identity``), jamais nommée comme
    SOURCE de résolution avant ce lot."""
    assert "size" in _resolve(registry=_profile(effectif_max=100000)).sources
    assert "size" not in _resolve(registry=_profile(effectif_max=None, effectif=None)).sources


def test_official_site_source_present_only_when_siren_came_from_the_companys_own_site():
    """#2284.22 — ``website`` (champ LLM texte libre) ne prouve rien, mais
    ``resolve_pappers_via_web_or_bundle`` (``siren_finder.py``) lit le SIREN sur
    une page dont l'HÔTE correspond au nom de l'entreprise (mentions légales) —
    une extraction déterministe, pas un champ deviné. L'appelant (phase1_research)
    sait quand CE chemin a résolu le SIREN ; sans lui, comportement inchangé."""
    r = _resolve(official_site_match=True)
    assert "official_site" in r.sources
    assert "official_site" not in _resolve().sources  # défaut : comportement actuel


def test_official_site_source_absent_when_the_registry_stays_unresolved():
    """Un flag ``official_site_match`` ne force rien : sans registre utilisable,
    l'entité reste ``unresolved`` et la source ne s'ajoute pas à une liste vide."""
    r = _resolve(
        identity=IdentityAssessment(status="no_registry", identityConfidence=0.0, useRegistryData=False),
        registry=None,
        official_site_match=True,
    )
    assert r.state == "unresolved"
    assert "official_site" not in r.sources


def test_workspace_data_source_names_the_matched_account_without_merging():
    """#2265.2 — un compte du même espace partageant le SIREN ajoute une
    source ET une raison nommée, jamais une fusion (le verdict décrit
    toujours CE compte, pas l'autre)."""
    match = WorkspaceAccountMatch(account_id="acc-2", name="EDF Renouvelables", matched_by="siren")
    r = _resolve(workspace_match=match)
    assert "workspace_data" in r.sources
    assert any("EDF Renouvelables" in reason for reason in r.reasons)
    assert r.commercial_name == "EDF"  # #2284.28 — jamais fusionné avec l'autre compte


def test_workspace_match_names_an_unresolved_entity_without_anchoring_it():
    """#2265.11 — sans SIREN ni nom légal (le cas Brave/Apollo), un
    rapprochement nom+domaine avec un compte du même espace se NOMME, mais ne
    résout jamais l'entité à lui seul (doctrine #2284.28 : le nom seul ne
    fusionne jamais deux entités)."""
    match = WorkspaceAccountMatch(account_id="acc-3", name="Malt SAS", matched_by="name_domain")
    r = _resolve(
        identity=IdentityAssessment(status="no_registry", identityConfidence=0.0, useRegistryData=False),
        registry=None,
        workspace_match=match,
    )
    assert r.state == "unresolved"
    assert r.canonical_id is None
    assert "workspace_data" in r.sources
    assert any("Malt SAS" in reason for reason in r.reasons)


def test_distinct_commercial_name_crosses_the_alias_source():
    # #2265.2 — « Kicklox » est la marque, LINNAEUS le nom légal (Pappers publie
    # les deux) : le critère ALIAS de la résolution d'entité doit être croisé.
    r = _resolve(registry=_profile(nom_entreprise="LINNAEUS", nom_commercial="Kicklox"))
    assert "alias" in r.sources


def test_commercial_name_identical_to_legal_name_is_not_a_second_alias_source():
    r = _resolve(registry=_profile(nom_commercial="ELECTRICITE DE FRANCE"))
    assert "alias" not in r.sources


def test_no_commercial_name_does_not_cross_the_alias_source():
    r = _resolve()
    assert "alias" not in r.sources


def test_ceased_company_is_inactive_not_deleted():
    r = _resolve(registry=_profile(entreprise_cessee=True))
    assert r.state == "inactive"
    assert r.kind == "inactive_company"
    assert r.canonical_id == "FR-SIREN-552081317"


def test_ambiguous_homonyms_become_a_named_question():
    homonyms = HomonymResolution(
        status="ambiguous",
        candidateCount=2,
        candidates=[
            ScoredCandidate(siren="552059024", name="THALES", city="Paris"),
            ScoredCandidate(siren="000000001", name="THALES", city="Saint-Étienne-du-Vauvray"),
        ],
    )
    r = _resolve(target_name="Thales", homonyms=homonyms)
    assert r.state == "ambiguous"
    assert r.canonical_id is None
    assert r.confidence is None
    assert r.question is not None
    assert [c.siren for c in r.question.candidates] == ["552059024", "000000001"]


def test_registry_homonym_is_unresolved_never_anchored():
    identity = IdentityAssessment(
        status="homonyme",
        identityConfidence=0.15,
        useRegistryData=False,
        mode="web_group",
        reasons=["Effectif incohérent"],
    )
    r = _resolve(identity=identity)
    assert r.state == "unresolved"
    assert r.kind is None
    assert r.canonical_id is None
    assert r.legal_name is None
    assert r.confidence is None
    assert "legal_identifier" not in r.sources
    assert "Effectif incohérent" in r.reasons


def test_no_registry_is_unresolved_and_children_not_measured():
    identity = IdentityAssessment(status="no_registry", identityConfidence=0.4, useRegistryData=False, mode="web_group")
    r = _resolve(identity=identity, registry=None, website=None)
    assert r.state == "unresolved"
    assert r.children_count is None  # non mesuré, jamais 0
    assert r.sources == ["normalized_name"]


def test_siren_supplied_by_the_user_is_a_manual_override():
    locked = HomonymResolution(status="locked", selectedSiren="552081317", confidence=1.0)
    r = _resolve(homonyms=locked, locked_siren="552081317")
    assert r.state == "manual_override"
    assert "workspace_correction" in r.sources


def test_a_person_registered_as_a_company_is_out_of_scope_not_a_legal_entity():
    """#2284.35 — la cible résolue au registre n'est pas une organisation :
    ``classify_entity_type`` le sait déjà (personne + rôle), le résolveur ne
    le jetait pas plus loin qu'un ``legal_entity`` deviné."""
    r = _resolve(registry=_profile(nom_entreprise="Jean Dupont - Gérant"))
    assert r.state == "out_of_scope"
    assert r.kind is None
    assert r.canonical_id is None  # jamais ancré sur un type qu'on refuse de nommer
    assert r.legal_name is None
    assert r.reasons and "personne" in r.reasons[0]


def test_a_partnership_name_is_out_of_scope():
    r = _resolve(registry=_profile(nom_entreprise="CONSORTIUM EDF ENERGIES"))
    assert r.state == "out_of_scope"
    assert r.kind is None
    assert r.reasons == ["partenariat ou participation, hors hiérarchie du groupe"]


def test_manual_override_wins_over_an_out_of_scope_looking_name():
    """Doctrine : une correction humaine gagne toujours — un SIREN verrouillé
    par l'utilisateur ne redevient pas ``out_of_scope`` sous prétexte que le
    nom légal ressemble à une personne ou un partenariat."""
    locked = HomonymResolution(status="locked", selectedSiren="552081317", confidence=1.0)
    r = _resolve(homonyms=locked, locked_siren="552081317", registry=_profile(nom_entreprise="Jean Dupont - Gérant"))
    assert r.state == "manual_override"
    assert r.canonical_id == "FR-SIREN-552081317"
    assert r.kind is None  # non mesuré, jamais deviné en « legal_entity »


def test_reasons_never_name_our_providers():
    """Doctrine : nos fournisseurs ne se nomment jamais à l'écran — le verdict
    ``no_registry`` d'``assess_identity`` cite « (Pappers) », le résolveur non."""
    from app.services.identity_resolution import assess_identity

    identity = assess_identity(target_name="Inconnue", web={}, registry=None)
    r = _resolve(identity=identity, registry=None)
    assert r.reasons
    assert not any("pappers" in reason.lower() for reason in r.reasons)


def test_output_is_snake_case_and_json_ready():
    dumped = _resolve().model_dump(mode="json")
    assert set(dumped) >= {"state", "kind", "canonical_id", "commercial_name", "sources", "resolved_at"}


def test_foreign_registry_resolves_via_registry_country_source():
    """#2284.19 — sans Pappers (hors FR), un registre pays actif (country pack)
    résout l'entité par la source ``registry_country``, jamais par le nom seul."""
    r = _resolve(
        registry=None,
        website=None,
        country="CH",
        foreign_registry={
            "source": "zefix",
            "country": "CH",
            "name": "NESTLE SA",
            "registryId": "CHE-107.674.048",
            "registryIdLabel": "UID",
            "legalForm": "SA",
            "seat": "Vevey",
        },
    )
    assert r.state == "resolved"
    assert r.kind == "legal_entity"
    assert r.canonical_id == "CH-REGISTRY-CHE-107.674.048"
    assert r.country == "CH"
    assert r.identifiers == {"registryId": "CHE-107.674.048"}
    assert r.location == "Vevey"
    assert r.confidence is None  # non mesuré (pas de comparaison web/registre pour ce pays), jamais deviné
    assert "registry_country" in r.sources
    assert not any("zefix" in reason.lower() for reason in r.reasons)  # le fournisseur ne se nomme jamais


def test_foreign_registry_absent_stays_unresolved():
    """Sans pack actif (FR par défaut, ou pays sans résultat), rien ne change :
    même verdict ``unresolved`` qu'avant #2284.19."""
    r = _resolve(registry=None, website=None, country="CH", foreign_registry=None)
    assert r.state == "unresolved"
    assert r.canonical_id is None
    assert r.sources == ["normalized_name"]


class TestAttachExternalCompanyId:
    """#2284.21 — l'id d'organisation Apollo, déjà persisté sur le compte
    (``account.apollo_enrichment.organizationId``), comme source de résolution
    ADDITIONNELLE — jamais seul juge : il n'enrichit qu'un verdict déjà ANCRÉ
    (resolved/manual_override/inactive), il n'en fabrique aucun."""

    def _anchored(self, **extra: object) -> dict:
        base = _resolve().model_dump(mode="json")
        base.update(extra)
        return base

    def test_adds_identifier_and_source_on_an_anchored_verdict(self):
        resolution = attach_external_company_id(self._anchored(), "60b2c1f1a1b2c3d4e5f6a7b8")
        assert resolution["identifiers"]["external_company_id"] == "60b2c1f1a1b2c3d4e5f6a7b8"
        assert "external_company_id" in resolution["sources"]

    def test_never_resolves_an_unresolved_verdict_by_itself(self):
        unresolved = _resolve(registry=None, website=None).model_dump(mode="json")
        resolution = attach_external_company_id(unresolved, "60b2c1f1a1b2c3d4e5f6a7b8")
        assert resolution["state"] == "unresolved"
        assert "external_company_id" not in resolution["identifiers"]
        assert "external_company_id" not in resolution["sources"]

    def test_no_organization_id_is_a_no_op(self):
        anchored = self._anchored()
        resolution = attach_external_company_id(anchored, None)
        assert resolution == anchored

    def test_idempotent_source_list(self):
        once = attach_external_company_id(self._anchored(), "60b2c1f1a1b2c3d4e5f6a7b8")
        twice = attach_external_company_id(once, "60b2c1f1a1b2c3d4e5f6a7b8")
        assert twice["sources"].count("external_company_id") == 1


class TestAttachLegalCategoryKind:
    """#2284.17 — le type « client final » (administration, collectivité,
    établissement public, association), via la catégorie juridique INSEE de
    l'entité déjà résolue. N'upgrade QUE le repli honnête ``legal_entity``."""

    def _anchored(self, **extra: object) -> dict:
        base = _resolve().model_dump(mode="json")  # EDF, NAF 35.11Z → legal_entity
        base.update(extra)
        return base

    def test_a_commune_upgrades_to_end_client(self):
        resolution = attach_legal_category_kind(self._anchored(), "7210")
        assert resolution["kind"] == "end_client"

    def test_an_association_upgrades_to_end_client(self):
        resolution = attach_legal_category_kind(self._anchored(), "9220")
        assert resolution["kind"] == "end_client"

    def test_a_commercial_category_stays_legal_entity(self):
        # EDF elle-même : SA (5xxx) — ne devient jamais client final.
        resolution = attach_legal_category_kind(self._anchored(), "5710")
        assert resolution["kind"] == "legal_entity"

    def test_unknown_category_is_a_no_op(self):
        anchored = self._anchored()
        resolution = attach_legal_category_kind(anchored, None)
        assert resolution == anchored

    def test_never_resolves_an_unresolved_verdict_by_itself(self):
        unresolved = _resolve(registry=None, website=None).model_dump(mode="json")
        resolution = attach_legal_category_kind(unresolved, "7210")
        assert resolution["state"] == "unresolved"
        assert resolution.get("kind") is None

    def test_never_overrides_a_more_specific_kind(self):
        # ESN (NAF 62.01Z) reste ESN même si sa catégorie juridique ressemble,
        # par erreur de source, à celle d'une administration : la preuve NAF
        # est plus spécifique (#2284.15/#2284.17 dans l'ordre de `_kind_of`).
        esn = _resolve(registry=_profile(code_naf="62.01Z")).model_dump(mode="json")
        assert esn["kind"] == "esn"
        resolution = attach_legal_category_kind(esn, "7210")
        assert resolution["kind"] == "esn"


class TestAttachFormerLegalNames:
    """#2284.33/.58 — les dénominations antérieures du SIREN déjà résolu
    (registre légal INSEE, jamais une correction CRM)."""

    def _anchored(self, **extra: object) -> dict:
        base = _resolve().model_dump(mode="json")  # target_name="EDF", legal_name="ELECTRICITE DE FRANCE"
        base.update(extra)
        return base

    def test_attaches_the_former_names(self):
        resolution = attach_former_legal_names(self._anchored(), ["ANCIEN NOM SANS RAPPORT"])
        assert resolution["former_legal_names"] == ["ANCIEN NOM SANS RAPPORT"]

    def test_a_former_name_matching_the_search_becomes_historical(self):
        # La cible tapée ("EDF") correspond à une dénomination ANTÉRIEURE, pas
        # à la dénomination actuelle ("ELECTRICITE DE FRANCE") : la MÊME
        # entité légale a été résolue, sous un nom qu'elle ne porte plus.
        resolution = attach_former_legal_names(self._anchored(), ["EDF"])
        assert resolution["state"] == "historical"
        assert resolution["former_legal_names"] == ["EDF"]

    def test_a_former_name_not_matching_the_search_stays_resolved(self):
        resolution = attach_former_legal_names(self._anchored(), ["ANCIEN NOM SANS RAPPORT"])
        assert resolution["state"] == "resolved"

    def test_never_overrides_a_manual_override(self):
        manual = self._anchored(state="manual_override")
        resolution = attach_former_legal_names(manual, ["EDF"])
        assert resolution["state"] == "manual_override"
        assert resolution["former_legal_names"] == ["EDF"]

    def test_never_overrides_inactive(self):
        inactive = self._anchored(state="inactive")
        resolution = attach_former_legal_names(inactive, ["EDF"])
        assert resolution["state"] == "inactive"

    def test_no_former_names_is_a_no_op(self):
        anchored = self._anchored()
        resolution = attach_former_legal_names(anchored, [])
        assert resolution == anchored
        resolution = attach_former_legal_names(anchored, None)
        assert resolution == anchored

    def test_never_resolves_an_unresolved_verdict_by_itself(self):
        unresolved = _resolve(registry=None, website=None).model_dump(mode="json")
        resolution = attach_former_legal_names(unresolved, ["EDF"])
        assert resolution["state"] == "unresolved"
        assert resolution.get("former_legal_names") in (None, [])


class TestAttachAliasDomain:
    """#2284.26 — le domaine que la mémoire marché a PROUVÉ par alias, jamais
    un SIREN (le corpus n'en porte aucun)."""

    def test_fills_the_domain_on_an_unresolved_verdict(self):
        # Le cas visé par #2263.24 : le nom seul ne résout pas ("SG SOCIETE
        # GENERALE"), mais l'alias marché prouve un domaine.
        unresolved = _resolve(registry=None, website=None).model_dump(mode="json")
        assert unresolved["domain"] is None
        resolution = attach_alias_domain(unresolved, "societegenerale.com")
        assert resolution["domain"] == "societegenerale.com"
        assert "alias" in resolution["sources"]
        assert resolution["state"] == "unresolved"  # jamais ancré par un alias seul

    def test_fills_the_domain_on_an_anchored_verdict_without_one(self):
        anchored = _resolve(website=None).model_dump(mode="json")
        assert anchored["state"] == "resolved"
        assert anchored["domain"] is None
        resolution = attach_alias_domain(anchored, "edf.fr")
        assert resolution["domain"] == "edf.fr"
        assert "alias" in resolution["sources"]

    def test_never_overwrites_an_already_known_domain(self):
        anchored = _resolve().model_dump(mode="json")  # website="https://www.edf.fr/" → domain déjà connu
        resolution = attach_alias_domain(anchored, "autre-domaine.example")
        assert resolution["domain"] == anchored["domain"]
        assert "alias" not in resolution["sources"]

    def test_no_domain_is_a_no_op(self):
        anchored = _resolve(website=None).model_dump(mode="json")
        resolution = attach_alias_domain(anchored, None)
        assert resolution == anchored

    def test_never_applies_to_ambiguous(self):
        homonyms = HomonymResolution(
            status="ambiguous",
            candidateCount=2,
            candidates=[
                ScoredCandidate(siren="552059024", name="THALES", city="Paris"),
                ScoredCandidate(siren="000000001", name="THALES", city="Saint-Étienne-du-Vauvray"),
            ],
        )
        ambiguous = _resolve(target_name="Thales", homonyms=homonyms).model_dump(mode="json")
        assert ambiguous["state"] == "ambiguous"
        resolution = attach_alias_domain(ambiguous, "societegenerale.com")
        assert resolution == ambiguous

    def test_idempotent_source_list(self):
        once = attach_alias_domain(_resolve(registry=None, website=None).model_dump(mode="json"), "x.example")
        twice = attach_alias_domain(once, "x.example")
        assert twice["sources"].count("alias") == 1
