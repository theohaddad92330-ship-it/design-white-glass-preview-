from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.progress import ProgressCallback


class SeedContact(BaseModel):
    """A pre-seeded contact (today: Pappers ``representants_legaux``) the
    contacts agent must integrate into the organigramme instead of
    discarding. Same shape as the rows already persisted by the API
    worker after Phase 1.
    """

    first_name: str | None = None
    last_name: str | None = None
    title: str | None = None
    source: str = "pappers"
    is_c_level: bool = False


class ContactScope(BaseModel):
    """Optional re-run scope (S6) — narrow the contact search to ONE segment
    without redoing the whole analysis (Matteo: "relancer uniquement cette
    brique"). Each field is opt-in; an empty scope == the current wide search.
    """

    titles: list[str] = []  # override personas (re-run a persona/role: cyber, marketing…)
    geographies: list[str] = []  # Apollo person_locations (ex: ["France"] — écarte l'offshore)
    seniorities: list[str] = []  # Apollo person_seniorities (director, vp, c_suite, manager…)
    entity: str | None = None  # override company_name (re-run on a BU / filiale : Boursorama, ITIM…)
    theme: str | None = None  # thème de relance (cyber, achats, MLOps, DSI France…) → expansé en titres/geo
    # Case de la matrice de couverture à combler (annexe organigramme §6) : la
    # famille de décision (it, cyber, data, achat…) et/ou le niveau org (L0-L5 du
    # contrat OrgGraph, ou c_level/n1/n2 de la matrice). Expansés en titres /
    # séniorités Apollo par ``contact_segments.resolve_segment_scope``. Absents =
    # recherche inchangée.
    family: str | None = None
    level: str | None = None


class ContactsRequest(BaseModel):
    company_name: str
    profile_data: dict = {}
    account_id: str = ""
    user_id: str = ""
    seed_contacts: list[SeedContact] = []
    scope: ContactScope | None = None
    # Names of entities the relevance gate marked out-of-scope (SGTM, SG Côte
    # d'Ivoire, SPV…). An Apollo hit whose org matches one is dropped so a contact
    # from a bad-scope BU never enters the dossier (Théo: "un contact issu de SGTM
    # ne doit pas devenir quick win"). Empty = no filter (wide search).
    out_of_scope_entities: list[str] = []
    # Latency optimization — "Apollo contacts prefetch". The FREE Apollo
    # People-Search only needs the company name + personas (both available at
    # t=0), so the graph runs it CONCURRENTLY with the longer research phase and
    # hands the hits here. ``None`` = no prefetch → search live (default). An
    # empty list = a genuine 0-hit prefetch (skip the search, run the fallback).
    # Forward ref to ``ApolloSearchHit`` (defined later in this module); pydantic
    # v2 resolves it automatically.
    prefetched_hits: list["ApolloSearchHit"] | None = None
    # Ancres d'org Apollo (#1101/#1102). ``search_people`` les déclare depuis le
    # retour Théo P0 avec la règle « le libellé d'entité brouillon ne doit JAMAIS
    # être la seule ancre » — et AUCUN appelant du service IA ne les passait. Le
    # pipeline scopait donc Apollo sur « MUTUELLE UNEO » en texte libre et
    # ramenait une personne. Précédence côté Apollo : ids (exact) → domaines →
    # nom. Vides = comportement historique à l'octet près.
    organization_ids: list[str] = []
    organization_domains: list[str] = []
    # LUD.6 — la zone d'où le compte a été ouvert (codes région INSEE « 27 », ou « dept:69 ») : les décideurs
    # de la zone sont classés DEVANT (préférence, jamais exclusion). Vide = ordre d'avant, à l'octet près.
    preferred_zone: list[str] = []
    # Lot 757 (arbitrage Louis 31/10) — les entités du groupe COCHÉES dans le sélecteur de périmètre : une passe
    # de recherche par nom, fusionnée. Vide = la seule entité analysée, à l'octet près.
    checked_entities: list[str] = []
    progress_callback: ProgressCallback | None = None


class ContactsResponse(BaseModel):
    success: bool = True
    data: dict = {}


class ApolloSearchHit(BaseModel):
    """Normalised single contact returned by Apollo People Search.

    Empty strings (not None) on missing fields keep the wire shape stable
    for the downstream camelCase mapper consumed by the API service — the
    ``_none_to_empty`` validator coerces the ``None`` the phase-2 seed
    builders emit for unknown title/city/country back to ``""``.

    ``extra="allow"`` mirrors the Zod ``.passthrough()`` of
    ``apolloSearchHitSchema`` in ``packages/contracts``: the Contact Hunter
    envelope wraps camelCase seed dicts whose ``fullName`` / ``linkedinUrl`` /
    ``source`` keys must flow through instead of being silently dropped.
    """

    # Apollo person id from People-Search. Apollo OBFUSCATES last_name and hides
    # email/LinkedIn on the (free) search tier — but it returns a stable ``id``.
    # Carrying it through lets People-Match enrich BY ID, the only reliable key
    # once the name is obfuscated (first_name+org matches an empty record).
    id: str = ""
    first_name: str = ""
    last_name: str = ""
    # Masked last name exactly as Apollo publishes it on the search tier
    # ("Mo***y"). Kept verbatim so the UI can show an honest partial identity
    # ("Séverine M.") on a contact nobody has paid to reveal yet. Never
    # un-masked here: the real name comes from the People-Match or not at all.
    last_name_obfuscated: str = ""
    title: str = ""
    organization_name: str = ""
    # #4928.1 — l'id et le domaine de l'organisation du résultat (garde d'employeur) ; vides = inconnus.
    organization_id: str = ""
    organization_domain: str = ""
    linkedin_url: str = ""
    photo_url: str = ""
    city: str = ""
    # LUD.6 — la région du contact telle qu'Apollo la publie (« Bourgogne-Franche-Comté ») : sert à
    # CLASSER les décideurs de la zone d'ouverture devant, jamais à en exclure.
    state: str = ""
    country: str = ""
    # Rich People-Search fields (free on the basic search) — carried through to
    # the seed's apolloDetails so the dashboard shows the maximum per contact.
    seniority: str = ""
    headline: str = ""
    departments: list[str] = Field(default_factory=list)
    functions: list[str] = Field(default_factory=list)
    employment_history: list[dict[str, Any]] = Field(default_factory=list)
    # Availability flags Apollo returns on the FREE search tier (booleans, not
    # values): whether a work email / direct phone exists to be revealed by a paid
    # People-Match. Let us (a) show "email dispo" before spending a credit and
    # (b) target the auto-enrich only where an email actually exists — zero credit
    # burned on a guaranteed miss.
    has_email: bool = False
    has_phone: bool = False
    # #3911.1 — vrai quand cette recherche n'avait AUCUNE ancre d'organisation
    # exacte (id Apollo / domaine) à proposer et a dû retomber sur le nom en
    # texte libre (``q_organization_name``, flou — deux entités homonymes le
    # passent toutes les deux). Posé une seule fois, au choix de l'ancre
    # gagnante dans ``search_people_with_status`` — jamais deviné ici.
    employer_unverified: bool = False

    model_config = {"extra": "allow"}

    @field_validator(
        "first_name",
        "last_name",
        "last_name_obfuscated",
        "title",
        "organization_name",
        "linkedin_url",
        "city",
        "state",
        "country",
        "seniority",
        "headline",
        mode="before",
    )
    @classmethod
    def _none_to_empty(cls, value: object) -> object:
        return "" if value is None else value


ApolloEmailStatus = Literal["verified", "unverified", "guessed", "unknown"]


class EnrichPersonRequest(BaseModel):
    """Match keys for a single-contact enrichment, in order of reliability:
    a LinkedIn URL, a full ``first_name + last_name + organization_name`` triplet,
    or — the fallback that fixes the « identité incomplète » catch-22 —
    ``organization_name + title``.

    ``title`` carries the contact's role/persona (« Directeur des Achats »,
    « CTO »…). When the identity is incomplete (a role-persona placeholder like
    « Isabelle · Global Head of Procurement », or a first-name-only contact),
    People-Match can't resolve it, so we People-Search ``organization + title``
    to find the REAL named person occupying that role. We enforce the minimum
    here so a malformed request never reaches Apollo and burns a credit on a 422.
    """

    # Apollo person id — the strongest match key. Present when the contact came
    # from People-Search (its last_name is obfuscated, so id is the ONLY reliable
    # way to unlock the full record). Wins over every other key below.
    apollo_id: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    organization_name: str | None = None
    # Clean org anchors from the ACCOUNT (never a messy contact entity label):
    # Apollo's own org id (exact `organization_ids` scope) then the registrable
    # domain. Either lets People-Search scope the role search precisely so it
    # returns the REAL person (retour Théo P0). Present-only.
    organization_id: str | None = None
    organization_domain: str | None = None
    linkedin_url: str | None = None
    title: str | None = None

    @model_validator(mode="after")
    def _require_match_key(self) -> "EnrichPersonRequest":
        if self.apollo_id:
            return self
        if self.linkedin_url:
            return self
        # An org anchor (name, id, or domain) + (a name to match OR a role to
        # search by). Any anchor is enough — the id/domain are the strong ones.
        has_org = bool(self.organization_name or self.organization_id or self.organization_domain)
        if has_org and (self.first_name or self.title):
            return self
        raise ValueError(
            "apollo_id OR linkedin_url OR (organization anchor + first_name/title) is required",
        )


class ApolloEmploymentEntry(BaseModel):
    """One role in Apollo's ``employment_history[]`` — factual, present-only.
    Mirrors ``apolloEmploymentEntrySchema`` in ``packages/contracts``."""

    organization_name: str | None = None
    title: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    current: bool = False


class ApolloEducationEntry(BaseModel):
    """One entry in Apollo's ``education[]`` — school + diploma when present.
    Mirrors ``apolloEducationEntrySchema`` in ``packages/contracts``."""

    school: str | None = None
    degree: str | None = None
    field_of_study: str | None = None
    start_date: str | None = None
    end_date: str | None = None


class ApolloPhoneNumber(BaseModel):
    """One number in Apollo's ``phone_numbers[]`` — the sanitized number plus its
    type and reachability status. Mirrors ``apolloPhoneNumberSchema``."""

    number: str
    type: str | None = None
    status: str | None = None


class ApolloEnrichmentResult(BaseModel):
    """Strict, normalised output of an Apollo People-Match call.

    Mirrors ``apolloEnrichmentDataSchema`` in ``packages/contracts``. Beyond the
    email/phone the enrichment persists, it carries the rich FACTUAL profile of
    the SAME paid payload (headline, career path, education, social links,
    seniority, functions…) — present-only, never invented. ``phone`` stays the
    single best number for backward-compat; ``phone_numbers`` is the full list.
    """

    matched: bool
    # Resolved identity — carried so a People-Search fallback can complete the
    # contact's real name (« Isabelle · Global Head of Procurement » → the real
    # person Apollo returns for that role at that org). None on a plain match.
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    email_status: ApolloEmailStatus | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    title: str | None = None
    organization_name: str | None = None
    city: str | None = None
    country: str | None = None
    # Real profile photo — free field of the same paid call. None = unknown.
    photo_url: str | None = None
    # ── Rich factual profile (same paid People-Match payload) ────────────────
    headline: str | None = None
    seniority: str | None = None
    state: str | None = None
    twitter_url: str | None = None
    github_url: str | None = None
    facebook_url: str | None = None
    departments: list[str] = Field(default_factory=list)
    subdepartments: list[str] = Field(default_factory=list)
    functions: list[str] = Field(default_factory=list)
    employment_history: list[ApolloEmploymentEntry] = Field(default_factory=list)
    education: list[ApolloEducationEntry] = Field(default_factory=list)
    # Additional revealed emails (beyond the primary ``email``).
    personal_emails: list[str] = Field(default_factory=list)
    phone_numbers: list[ApolloPhoneNumber] = Field(default_factory=list)
    # True quand la cascade s'est arrêtée sur son budget de temps avant d'avoir
    # épuisé ses sources : le résultat est PARTIEL, pas une absence. Le
    # consommateur ne doit ni le présenter comme « personne introuvable » ni
    # armer sur lui l'idempotence de 30 jours. Default False ⇒ tout chemin qui
    # finit normalement est inchangé.
    truncated: bool = False


class EnrichPersonResponse(BaseModel):
    success: bool = True
    data: ApolloEnrichmentResult


class RevealPhoneRequest(BaseModel):
    """E1 (#3698) — demander à Apollo le MOBILE d'une personne, livré plus tard
    sur ``webhook_url`` (un endpoint PUBLIC de l'API, signé par requête).

    Mêmes clés de match que ``EnrichPersonRequest`` (id Apollo, profil, puis
    nom + organisation). Le service IA ne lit JAMAIS le numéro : il demande,
    l'API reçoit le webhook et l'écrit sur le contact.
    """

    webhook_url: str = Field(min_length=1)
    apollo_id: str | None = None
    linkedin_url: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    organization_name: str | None = None

    @model_validator(mode="after")
    def _require_match_key(self) -> "RevealPhoneRequest":
        if self.apollo_id or self.linkedin_url or (self.first_name and self.organization_name):
            return self
        raise ValueError("apollo_id OR linkedin_url OR (first_name + organization_name) is required")


class RevealPhoneResponse(BaseModel):
    """``requested`` = Apollo a ACCEPTÉ la demande pour une personne trouvée :
    le mobile arrivera (ou non) sur le webhook. ``reason`` nomme pourquoi la
    demande n'est pas partie (``unconfigured``, ``no_match``, ``upstream_error``)."""

    requested: bool
    matched: bool = False
    linkedin_url: str | None = None
    reason: str | None = None


class SearchPeopleByNameRequest(BaseModel):
    """#2727 — « je tape un nom, je vois les homonymes, je choisis ».

    ``organization_name`` reste facultatif : Découvrir peut chercher un nom
    seul, ou resserré par « le plus de trucs que tu connais sur elle ».
    """

    full_name: str
    organization_name: str | None = None
    # #4386 — ``True`` : la CASCADE multi-sources (base de contacts, registre des
    # dirigeants, recherche web — ``person_name_search.py``). ``False`` (défaut) :
    # le chemin historique byte-identique, base de contacts seule — les appelants
    # qui se servent de ``id`` comme identifiant de la base (fiche talent, relecture
    # d'employeur des champions) n'en changent pas.
    cascade: bool = False


class PersonNameSearchHit(ApolloSearchHit):
    """#4386 — un résultat de la cascade : la forme d'un ``ApolloSearchHit`` plus
    les FAMILLES de sources qui l'ont rendu (jamais un nom de fournisseur) et un
    indice de correspondance EN MOTS (jamais un pourcentage)."""

    #: ``contact_base`` · ``legal_registry`` · ``web`` — dans cet ordre.
    sources: list[str] = []
    #: ``name_and_company`` · ``partial_name_and_company`` · ``name_only`` · ``partial_name``.
    match: str = ""


class PersonNameSourceQueried(BaseModel):
    """#4386 — une famille de sources INTERROGÉE : ``found`` / ``empty`` / ``down``.
    Une famille sans clé n'est jamais interrogée, donc jamais listée."""

    family: str
    outcome: str
    count: int = 0


class SearchPeopleByNameResponse(BaseModel):
    """``status`` porte le statut TYPÉ de la recherche (``ApolloSearchStatus``,
    en string) : un écran qui reçoit ``unconfigured``/``down``/``rate_limited``
    dit explicitement pourquoi la personne est introuvable, au lieu de confondre
    « aucun homonyme » avec « la source ne répond pas » (GA-18/19)."""

    success: bool = True
    hits: list[PersonNameSearchHit] = []
    status: str = "empty"
    # #4386 — vide sur le chemin historique (``cascade=False``).
    sources_queried: list[PersonNameSourceQueried] = []


class DiscoverContactsRequest(BaseModel):
    """#2809 (#2293.11, #2294.*) — découverte FRAÎCHE de contacts sur UN compte
    déjà connu (jamais une résolution d'entreprise : ``company_name`` vient
    toujours d'un compte existant, sélectionné sur ``/accounts``).

    Ancres d'organisation dans le même ordre de précédence que
    ``search_people_with_status`` (id > domaine > nom) — ``company_name``
    seul reste un ancrage valide, c'est celui que porte tout compte.
    """

    company_name: str
    organization_domain: str | None = None
    organization_id: str | None = None
    #: Rôles ciblés (facultatif) — vide, la primitive retombe sur la liste des
    #: décideurs IT par défaut (``DEFAULT_TITLES``, ``apollo.py``).
    titles: list[str] | None = None


class DiscoverContactsResponse(BaseModel):
    """``seeds`` est déjà la forme ``AnalysisContactSeed`` (``fullName``,
    ``apolloId``…) — le MÊME format que la collecte Phase 2 normale
    (``_apollo_hit_to_seed``), pour que l'API les persiste par le même chemin
    (``ContactsService.bulkInsert``), dédup incluse, jamais de fusion de
    personnes distinctes. ``status`` typé, jamais deviné (GA-18/19) — vide sans
    clé Apollo configurée (``unconfigured``), jamais une erreur 500."""

    success: bool = True
    seeds: list[dict] = []
    status: str = "empty"


class EmploymentFreshnessRequest(BaseModel):
    """Apollo Professional (02/11) — relecture du poste d'UN contact par People-Match (parcours daté).

    ``apollo_id`` ou ``linkedin_url`` : jamais de recherche par nom (un homonyme n'est pas la personne).
    ``employer_ref`` = l'employeur du compte, contre lequel le parcours se lit."""

    apollo_id: str | None = None
    linkedin_url: str | None = None
    employer_ref: str


class EmploymentFreshnessResponse(BaseModel):
    """``state`` : ``in_post`` (en poste chez ``employer_ref``) · ``left`` (parti) · ``unknown`` (le parcours ne le dit pas).
    ``status`` : ``ok`` · ``no_identifier`` · ``unmatched`` · ``unavailable`` — un échec n'est jamais un état."""

    success: bool = True
    status: str
    state: str = "unknown"
    #: Employeur ACTUEL observé (sans date) ; ``None`` quand Apollo n'en nomme aucun.
    organization: str | None = None
    #: Date de fin (AAAA-MM-JJ) de l'expérience chez ``employer_ref`` quand ``state == "left"``.
    left_on: str | None = None
    #: Crédits People-Match débités par cet appel (1 sur un appel parti, 0 sans clé / sans identifiant).
    credits: int = 0
