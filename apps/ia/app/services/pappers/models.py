"""Pydantic models for Pappers v2 endpoints.

Field names are English; the original French Pappers names live in
``alias=...`` so a dump with ``by_alias=False`` produces our preferred
shape while validation still accepts the raw API payload.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services.company_filters import DegradeReason, plausible_creation_date


class HeadquartersAddress(BaseModel):
    """Pappers ``siege`` (EtablissementFiche), normalized."""

    siret: str | None = None
    address_line_1: str | None = Field(default=None, alias="adresse_ligne_1")
    address_line_2: str | None = Field(default=None, alias="adresse_ligne_2")
    postal_code: str | None = Field(default=None, alias="code_postal")
    city: str | None = Field(default=None, alias="ville")
    country: str | None = Field(default="France", alias="pays")
    latitude: float | None = None
    longitude: float | None = None
    naf_code: str | None = Field(default=None, alias="code_naf")
    naf_label: str | None = Field(default=None, alias="libelle_code_naf")
    is_active: bool = True

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _derive_is_active(cls, data: Any) -> Any:
        if isinstance(data, dict) and "etablissement_cesse" in data:
            data = {**data, "is_active": not bool(data.get("etablissement_cesse"))}
        return data


class Executive(BaseModel):
    """Pappers ``representants_legaux`` entry, normalized.

    ⚠️ PAS DE DATE DE NAISSANCE. Le registre la publie et nous la recopiions
    telle quelle jusque dans `raw_analysis.executives[]`, sur de vraies
    personnes, dans un dossier qui s'exporte et se partage. Aucun consommateur
    ne la lisait : un organigramme a besoin d'un nom et d'une fonction, le reste
    est de la donnée personnelle sans usage commercial. `extra="ignore"` la
    laisse donc tomber à l'analyse — la collecter « au cas où » est précisément
    ce qu'on ne fait pas.
    """

    last_name: str | None = Field(default=None, alias="nom")
    first_name: str | None = Field(default=None, alias="prenom")
    role: str | None = Field(default=None, alias="qualite")
    is_c_level: bool = False

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _fallback_role(cls, data: Any) -> Any:
        if isinstance(data, dict) and not data.get("qualite") and data.get("fonction"):
            data = {**data, "qualite": data["fonction"]}
        return data


class BranchOffice(BaseModel):
    """Pappers ``etablissements`` entry. Same legal entity, different SIRET."""

    siret: str | None = None
    name: str | None = Field(default=None, alias="nom_commercial")
    address_line_1: str | None = Field(default=None, alias="adresse_ligne_1")
    postal_code: str | None = Field(default=None, alias="code_postal")
    city: str | None = Field(default=None, alias="ville")
    country: str | None = Field(default="France", alias="pays")
    latitude: float | None = None
    longitude: float | None = None
    naf_label: str | None = Field(default=None, alias="libelle_code_naf")
    headcount_label: str | None = Field(default=None, alias="effectif")
    is_headquarters: bool = Field(default=False, alias="siege")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _name_fallback(cls, data: Any) -> Any:
        if isinstance(data, dict) and not data.get("nom_commercial") and data.get("enseigne"):
            data = {**data, "nom_commercial": data["enseigne"]}
        return data


class RelatedCompany(BaseModel):
    """Node in ``/v2/entreprise/cartographie`` response."""

    id: str
    siren: str | None = None
    name: str | None = Field(default=None, alias="nom_entreprise")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class RelatedPerson(BaseModel):
    """Node in ``/v2/entreprise/cartographie`` response."""

    id: str
    first_name: str | None = Field(default=None, alias="prenom")
    last_name: str | None = Field(default=None, alias="nom")
    degree: int | None = Field(default=None, alias="niveau")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class CorporateGraph(BaseModel):
    """Pappers cartographie response, normalized."""

    companies: list[RelatedCompany] = Field(default_factory=list, alias="entreprises")
    persons: list[RelatedPerson] = Field(default_factory=list, alias="personnes")
    company_to_person_edges: list[Any] = Field(default_factory=list, alias="liens_entreprises_personnes")
    company_to_company_edges: list[Any] = Field(default_factory=list, alias="liens_entreprises_entreprises")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class GroupAffiliation(BaseModel):
    """#2165.24 / #2166.3 / #2165.16 — le rôle de la racine dans SON graphe
    capitalistique Pappers : ``groupe`` quand rien ne la détient (et qu'elle
    détient au moins une filiale dans ce même graphe), ``filiale`` quand une
    autre entreprise la détient — auquel cas ``head_siren``/``head_name``
    remontent la chaîne jusqu'à la tête de groupe, pas juste au holder direct.

    Un fait daté, jamais deviné : `None` quand le graphe ne permet de trancher
    ni l'un ni l'autre (aucune arête entreprise→entreprise exploitable, ou
    orientation illisible) — c'est exactement le repli de `extract_subsidiaries`
    sur ce même graphe : un administrateur partagé n'est pas un lien
    capitalistique.
    """

    role: Literal["groupe", "filiale"]
    head_siren: str
    head_name: str | None = None

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class FinancialYear(BaseModel):
    year: int = Field(alias="annee")
    revenue: int | None = Field(default=None, alias="chiffre_affaires")
    net_result: int | None = Field(default=None, alias="resultat")
    headcount: int | None = Field(default=None, alias="effectifs")
    # #4744 — la profondeur du compte ANALYSÉ (jamais notre marge d'ESN) : date de clôture
    # de l'exercice, marge brute, excédent brut d'exploitation, résultat d'exploitation.
    # Le MÊME `/v2/entreprise` (déjà mis en cache par SIREN) — aucun appel de plus.
    # Absent = `None` : « non publié », jamais 0, jamais dérivé d'un autre champ.
    closing_date: str | None = Field(default=None, alias="date_de_cloture_exercice")
    gross_margin: int | None = Field(default=None, alias="marge_brute")
    ebitda: int | None = Field(default=None, alias="excedent_brut_d_exploitation")
    operating_result: int | None = Field(default=None, alias="resultat_exploitation")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class BeneficialOwner(BaseModel):
    last_name: str | None = Field(default=None, alias="nom")
    first_name: str | None = Field(default=None, alias="prenom")
    ownership_percentage: float | None = Field(default=None, alias="pourcentage_parts")
    nationality: str | None = Field(default=None, alias="nationalite")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class CompanyProfile(BaseModel):
    """Full Pappers ``/v2/entreprise`` payload, normalized."""

    siren: str
    siret_headquarters: str | None = Field(default=None, alias="siret_siege_social")
    legal_name: str | None = Field(default=None, alias="nom_entreprise")
    commercial_name: str | None = Field(default=None, alias="nom_commercial")
    legal_form: str | None = Field(default=None, alias="forme_juridique")
    capital: float | None = None
    currency: str | None = Field(default=None, alias="devise_capital")
    creation_date: str | None = Field(default=None, alias="date_creation")

    @field_validator("creation_date", mode="before")
    @classmethod
    def _drop_sentinel_creation_date(cls, value: object) -> str | None:
        # #5 — « 1900-01-01 » est l'absence d'une date, pas une date.
        return plausible_creation_date(value)
    consolidated_status: str | None = Field(default=None, alias="statut_consolide")
    rcs_status: str | None = Field(default=None, alias="statut_rcs")
    rcs_court: str | None = Field(default=None, alias="greffe")
    naf_code: str | None = Field(default=None, alias="code_naf")
    naf_label: str | None = Field(default=None, alias="libelle_code_naf")
    activity_label: str | None = None
    activity_domain: str | None = Field(default=None, alias="domaine_activite")
    corporate_purpose: str | None = Field(default=None, alias="objet_social")
    collective_agreements: list[dict[str, Any]] = Field(default_factory=list, alias="conventions_collectives")
    headcount_label: str | None = Field(default=None, alias="effectif")
    headcount_min: int | None = Field(default=None, alias="effectif_min")
    headcount_max: int | None = Field(default=None, alias="effectif_max")
    headcount_tranche: str | None = Field(default=None, alias="tranche_effectif")
    headcount_year: int | None = Field(default=None, alias="annee_effectif")
    revenue_latest: int | None = None
    financials_history: list[FinancialYear] = Field(default_factory=list, alias="finances")
    consolidated_financials: list[FinancialYear] = Field(
        default_factory=list, alias="finances_consolidees"
    )
    headquarters: HeadquartersAddress = Field(
        default_factory=lambda: HeadquartersAddress(),
        alias="siege",
    )
    executives: list[Executive] = Field(default_factory=list, alias="representants")
    c_level: list[Executive] = Field(default_factory=list)
    branches: list[BranchOffice] = Field(default_factory=list, alias="etablissements")
    branch_count: int = 0
    subsidiaries: list[RelatedCompany] = Field(default_factory=list)
    # #2086.25 — DÉCISION Louis 17/09 : le sens inverse de `subsidiaries`, les
    # sociétés qui DÉTIENNENT celle-ci. Voir `extract_parent_companies`
    # (cartographie.py) pour la raison d'être PLUS stricte que `subsidiaries`.
    parent_companies: list[RelatedCompany] = Field(default_factory=list)
    corporate_graph: CorporateGraph | None = None
    # #2165.24 / #2166.3 / #2165.16 — dérivé du même graphe que `subsidiaries`,
    # sans appel Pappers supplémentaire. `None` = graphe absent ou rôle non
    # tranchable (voir `GroupAffiliation`).
    group_affiliation: GroupAffiliation | None = None
    beneficial_owners: list[BeneficialOwner] = Field(default_factory=list, alias="beneficiaires_effectifs")
    pappers_url: str | None = Field(default=None, alias="lien_pappers")
    has_ceased: bool = Field(default=False, alias="entreprise_cessee")
    ceased_date: str | None = Field(default=None, alias="date_cessation")
    last_updated: str | None = Field(default=None, alias="dernier_traitement")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _unify_executives_source(cls, data: Any) -> Any:
        """Pappers exposes officers via ``representants_legaux`` when the
        eponymous ``champs_supplementaires`` flag is set, otherwise via the
        narrower ``representants`` field. Map both onto ``representants`` so
        the alias-driven binding picks them up."""
        if isinstance(data, dict) and not data.get("representants") and data.get("representants_legaux"):
            data = {**data, "representants": data["representants_legaux"]}
        return data


class CompanySearchHit(BaseModel):
    """Pappers ``/v2/recherche`` single hit, normalized."""

    siren: str
    legal_name: str | None = Field(default=None, alias="nom_entreprise")
    denomination: str | None = None
    city: str | None = None
    # Siège postal code — flattened from ``siege.code_postal`` (see validator).
    # Feeds the geo criterion of "comptes similaires" (dept/région matching).
    postal_code: str | None = Field(default=None, alias="code_postal")
    naf_label: str | None = Field(default=None, alias="libelle_code_naf")
    # Registry headcount range when Pappers exposes it on the hit — feeds the
    # size criterion of "comptes similaires". Absent → None (never invented).
    headcount_min: int | None = Field(default=None, alias="effectif_min")
    headcount_max: int | None = Field(default=None, alias="effectif_max")
    has_ceased: bool = Field(default=False, alias="entreprise_cessee")
    # Registry half of ``DiscoverCandidate`` (Découvrir v2). All OPTIONAL: the
    # autocomplete callers never read them, so their payload is unchanged, but
    # list-building needs the NAF code itself (not just its label), the
    # headcount bracket label and the creation date to score a candidate.
    naf_code: str | None = Field(default=None, alias="code_naf")
    headcount_label: str | None = Field(default=None, alias="effectif")
    creation_date: str | None = Field(default=None, alias="date_creation")

    @field_validator("creation_date", mode="before")
    @classmethod
    def _drop_sentinel_creation_date(cls, value: object) -> str | None:
        # #5 — « 1900-01-01 » est l'absence d'une date, pas une date.
        return plausible_creation_date(value)
    department: str | None = Field(default=None, alias="departement")
    # #1084 : la catégorie juridique INSEE, jetée à la validation. C'est le seul
    # champ qui permet de dire qu'une ligne est une PERSONNE et non une
    # organisation — sans lui, « PINHEIRO PHILIPPE » sortait en compte à
    # conquérir face à une mutuelle. Absent = inconnu, jamais un défaut.
    legal_category: str | None = Field(default=None, alias="categorie_juridique")
    legal_form: str | None = Field(default=None, alias="forme_juridique")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _flatten_siege(cls, data: Any) -> Any:
        if isinstance(data, dict):
            siege = data.get("siege") or {}
            if isinstance(siege, dict):
                if not data.get("city") and siege.get("ville"):
                    data = {**data, "city": siege["ville"]}
                if not data.get("code_postal") and not data.get("postal_code") and siege.get("code_postal"):
                    data = {**data, "code_postal": siege["code_postal"]}
                if not data.get("departement") and not data.get("department") and siege.get("departement"):
                    data = {**data, "departement": siege["departement"]}
        return data


class CompanySearchParams(BaseModel):
    """Typed ``/v2/recherche`` query params.

    Serialize via ``to_query(api_token)`` for httpx. French aliases mirror
    Pappers' wire names so Python-side ergonomics don't lose fidelity.
    """

    # Pagination
    page: int | None = None
    per_page: int | None = Field(default=None, alias="par_page")
    cursor: str | None = Field(default=None, alias="curseur")
    per_cursor: int | None = Field(default=None, alias="par_curseur")

    # Core query
    q: str | None = None
    bases: Literal["entreprises", "dirigeants", "beneficiaires", "documents", "publications"] | None = None
    precision: Literal["approximative", "standard", "exacte"] | None = None

    # Company filters
    on_headquarters_only: bool | None = Field(default=None, alias="siege")
    naf_code: str | None = Field(default=None, alias="code_naf")
    department: str | None = Field(default=None, alias="departement")
    region: str | None = None
    postal_code: str | None = Field(default=None, alias="code_postal")
    collective_agreement: str | None = Field(default=None, alias="convention_collective")
    legal_category: str | None = Field(default=None, alias="categorie_juridique")
    has_ceased: bool | None = Field(default=None, alias="entreprise_cessee")
    rcs_status: Literal["inscrit", "radie", "non inscrit"] | None = Field(default=None, alias="statut_rcs")
    corporate_purpose: str | None = Field(default=None, alias="objet_social")

    # Date ranges — JJ-MM-AAAA
    rcs_registration_date_min: str | None = Field(default=None, alias="date_immatriculation_rcs_min")
    rcs_registration_date_max: str | None = Field(default=None, alias="date_immatriculation_rcs_max")
    rcs_strikeoff_date_min: str | None = Field(default=None, alias="date_radiation_rcs_min")
    rcs_strikeoff_date_max: str | None = Field(default=None, alias="date_radiation_rcs_max")
    creation_date_min: str | None = Field(default=None, alias="date_creation_min")
    creation_date_max: str | None = Field(default=None, alias="date_creation_max")

    # Numeric ranges — strings per Pappers spec
    capital_min: str | None = None
    capital_max: str | None = None
    revenue_min: str | None = Field(default=None, alias="chiffre_affaires_min")
    revenue_max: str | None = Field(default=None, alias="chiffre_affaires_max")
    net_result_min: str | None = Field(default=None, alias="resultat_min")
    net_result_max: str | None = Field(default=None, alias="resultat_max")

    # Headcount tranche (INSEE codes)
    headcount_tranche_min: str | None = Field(default=None, alias="tranche_effectif_min")
    headcount_tranche_max: str | None = Field(default=None, alias="tranche_effectif_max")

    # Dirigeant filters
    dirigeant_type: Literal["physique", "morale"] | None = Field(default=None, alias="type_dirigeant")
    dirigeant_role: str | None = Field(default=None, alias="qualite_dirigeant")
    dirigeant_nationality: str | None = Field(default=None, alias="nationalite_dirigeant")
    dirigeant_last_name: str | None = Field(default=None, alias="nom_dirigeant")
    dirigeant_first_name: str | None = Field(default=None, alias="prenom_dirigeant")
    dirigeant_age_min: int | None = Field(default=None, alias="age_dirigeant_min")
    dirigeant_age_max: int | None = Field(default=None, alias="age_dirigeant_max")
    dirigeant_birthdate_min: str | None = Field(default=None, alias="date_de_naissance_dirigeant_min")
    dirigeant_birthdate_max: str | None = Field(default=None, alias="date_de_naissance_dirigeant_max")

    # Beneficial owner filters
    beneficiary_age_min: int | None = Field(default=None, alias="age_beneficiaire_min")
    beneficiary_age_max: int | None = Field(default=None, alias="age_beneficiaire_max")
    beneficiary_birthdate_min: str | None = Field(default=None, alias="date_de_naissance_beneficiaire_min")
    beneficiary_birthdate_max: str | None = Field(default=None, alias="date_de_naissance_beneficiaire_max")
    beneficiary_nationality: str | None = Field(default=None, alias="nationalite_beneficiaire")

    # Document filters
    document_filing_date_min: str | None = Field(default=None, alias="date_depot_document_min")
    document_filing_date_max: str | None = Field(default=None, alias="date_depot_document_max")

    # Publication filters
    publication_type: Literal[
        "Création", "Immatriculation", "Modification", "Vente",
        "Radiation", "Procédure collective", "Dépôt des comptes",
    ] | None = Field(default=None, alias="type_publication")
    publication_date_min: str | None = Field(default=None, alias="date_publication_min")
    publication_date_max: str | None = Field(default=None, alias="date_publication_max")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    def to_query(self, api_token: str) -> dict[str, str]:
        """Render to an httpx-friendly query dict with the API token attached."""
        payload = self.model_dump(exclude_none=True, by_alias=True, mode="json")
        return {**{k: _stringify(v) for k, v in payload.items()}, "api_token": api_token}


def _stringify(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


class PappersError(Exception):
    """Base class for typed Pappers failures."""


class PappersAmbiguousMatchError(PappersError):
    """Raised when ``search_company`` cannot lock onto a single relevant SIREN."""

    def __init__(self, query: str, top_hit_name: str | None, score: float) -> None:
        super().__init__(
            f"Pappers top match for {query!r} was {top_hit_name!r} (similarity={score:.2f}, threshold=0.55)"
        )
        self.query = query
        self.top_hit_name = top_hit_name
        self.score = score


class PappersParsingError(PappersError):
    """Raised when Pydantic refuses to validate a Pappers payload."""


class PappersNoResultError(PappersError):
    """Pappers answered, and the answer is "I don't have this company".

    Deliberately NOT a subclass of :class:`PappersUnavailableError`: the source
    is up and did its job. Conflating the two is what made an SME missing from
    the registry look identical to Pappers being down — the same trap
    ``france_travail`` calls out ("An OAuth refusal and « cette entreprise ne
    recrute pas » produced the same empty list. They are opposite facts.").
    """

    def __init__(self, query: str) -> None:
        super().__init__(f"Aucun résultat Pappers pour {query!r}")
        self.query = query


class PappersUnavailableError(PappersError):
    """Pappers could not answer — quota, bad token, rate limit, 5xx, transport.

    Carries the HTTP ``status``, a machine-readable ``reason`` from the shared
    :class:`DegradeReason` vocabulary, and the raw ``body`` excerpt. The status
    alone was never enough: Pappers returns 401 both for an exhausted quota and
    for an invalid token, and those two facts have opposite fixes.
    """

    def __init__(self, status: int, reason: str, body: str = "", context: str = "") -> None:
        where = f" ({context})" if context else ""
        detail = f" — {body.strip()[:160]}" if body.strip() else ""
        super().__init__(f"Pappers {reason} [HTTP {status}]{where}{detail}")
        self.status = status
        self.reason = reason
        self.body = body


# Statuses whose meaning is unambiguous. 401 is absent on purpose — see
# ``classify_pappers_failure``.
_STATUS_ONLY_REASONS: dict[int, str] = {
    402: DegradeReason.QUOTA_EXCEEDED,
    403: DegradeReason.UNAUTHORIZED,
    429: DegradeReason.RATE_LIMITED,
}

# Substrings Pappers puts in the body when the PLAN — not the token — is the
# problem. Matched case-insensitively against the raw body.
#
# "jeton" is deliberately absent: it appears in both "quota de jetons atteint"
# (quota) and "Jeton d'API invalide" (bad token), so matching on it would turn a
# rotated key into a fake billing alert. The quota wording always carries one of
# the terms below alongside it.
_QUOTA_BODY_HINTS = ("quota", "crédit", "credit", "abonnement", "souscription", "épuis")


def classify_pappers_failure(status: int, body: str = "") -> str:
    """Map an unsuccessful Pappers response to a :class:`DegradeReason`.

    Pappers answers **401 for an exhausted quota as well as for a bad token**, so
    the status alone cannot tell "the key is wrong" from "the key ran out" — and
    those are opposite fixes (rotate the key vs top up the plan). When the body
    names the quota we say so; otherwise we report only what the status supports
    and the caller keeps the raw body for the operator. Never a guess.
    """
    lowered = (body or "").lower()
    if status in (401, 403) and any(hint in lowered for hint in _QUOTA_BODY_HINTS):
        return DegradeReason.QUOTA_EXCEEDED
    if status == 401:
        return DegradeReason.UNAUTHORIZED
    if status in _STATUS_ONLY_REASONS:
        return _STATUS_ONLY_REASONS[status]
    return DegradeReason.UPSTREAM_ERROR
