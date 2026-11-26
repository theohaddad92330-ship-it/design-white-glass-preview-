"""Single source of truth for the seller (ESN) profile on the IA side.

Scoring (``/scorer/recalculate``) and the weekly briefing (``/weekly/briefing``)
used to read the profiler ``profiles`` table directly — a DIFFERENT source and
shape from the one the analysis / chat pipeline personalises on. The analysis path
receives the profile resolved SERVER-SIDE by the API
(``EsnProfileReader.resolveProfileData`` → ``esnAnswersToProfileData``, see
``packages/contracts/src/schemas/analysis.ts``): the CURRENT ``esn_profiles`` row
normalised to ``AnalysisProfileData`` (companyName / offers / sectors / geoZone…).

``resolve_seller_context`` centralises the read + normalisation so Scoring and
Veille consume the SAME resolved profile as the dossier — the Context-Resolver
"partout" DoD: two distinct ESN profiles on the same account → different output.

Batch constraint: unlike ``/phase/1/research``, the API does NOT forward the
resolved profile to ``/scorer`` / ``/weekly`` (they are invoked with only a
``user_id``). So the IA resolves the profile itself here, reading ``esn_profiles``
and mirroring the TS ``esnAnswersToProfileData`` field-name map. When a caller
DOES forward a resolved ``profile_data`` the routers use it directly and skip
this read (the same "API resolves it server-side" pattern as ``/message``).

Never fabricates data: a never-onboarded user, an empty questionnaire or a source
failure all yield ``{}`` (a profile-neutral run; the prompts fall back to their
own defaults).
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.workspace_scope import resolve_workspace_id
from app.services.esn_profiler import _size_int, esn_archetype
from app.services.application_sectors import application_sector_names_fr
from app.services.offer_domains.portfolio import dominant_pack, portfolio_names_fr

logger = logging.getLogger(__name__)

# One current row per user (guaranteed by a partial unique index on
# ``(user_id) WHERE is_current`` — see the esn_profiles migration).
_ESN_PROFILES_TABLE = "esn_profiles"

# Workspace-canonical company profile (migration 1785910000000): the COMPANY
# profile belongs to the workspace — one current canonical row per workspace
# (partial unique index on ``(workspace_id) WHERE is_workspace_canonical AND
# is_current``); each member keeps their own row as a light personal overlay.
# ⚠️ Les constantes de tables d'espace sont parties avec la réimplémentation
# qu'elles servaient : la résolution vit dans `workspace_scope`, et une constante
# laissée derrière est une invitation à la refaire ici.

# The columns that belong to the MEMBER, not the company — Python mirror of
# ``ESN_PERSONAL_ANSWER_KEYS`` in ``@bellum/contracts`` (onboarding.ts). Keep
# both lists in sync so API and IA resolve the SAME merged profile.
_PERSONAL_PROFILE_COLUMNS: tuple[str, ...] = (
    "main_sales_pain",
    # Temps 2 — le complément de profil, répondu depuis le tableau de bord par
    # n'importe quel membre : il vit donc dans l'overlay personnel (un champ
    # « entreprise » écrit par un membre serait ignoré s'il existe un profil
    # canonique, et les réponses seraient perdues en silence).
    #
    # #2005.4 (DÉCISION Louis 17/09, lot CP2) — `client_references` et
    # `no_go_sectors` ne sont PLUS ici : une référence client ou un secteur
    # refusé décrit l'ESN, pas le vendeur qui a répondu le premier. Passées
    # ENTREPRISE (miroir exact de `ESN_PERSONAL_ANSWER_KEYS`,
    # `onboarding.ts`) — voir la migration de données idempotente
    # `1795610000001-CompanyLevelReferencesNoGo`.
    "decision_maker_personas",
    "avg_sales_cycle",
    "avg_tjm",
    # Profil progressif (restitution V2 §21-30) — les champs qui décrivent LA
    # PERSONNE : rôle, objectifs, routine, blocages, partage. Miroir exact de
    # `PROFILE_PERSONAL_ANSWER_KEYS` côté contracts.
    "user_role",
    "role_tenure",
    "industry_tenure",
    "individual_goal",
    "monthly_target",
    "team_overlap",
    "portfolio_size",
    "accounts_relationship_status",
    "weekly_calls",
    "weekly_emails",
    "weekly_linkedin",
    "sales_routine",
    "sales_blockers",
    "proactivity_level",
    "shared_data_scope",
    # #2058.2 / #2058.10 — les moments acceptés et le niveau de détail attendu
    # décrivent LA PERSONNE, miroir exact de `PROFILE_PERSONAL_ANSWER_KEYS`
    # côté contracts.
    "contact_windows",
    "detail_level",
    # #2018.5 — les outils déclarés (profil progressif) décrivent LA PERSONNE,
    # miroir exact de `PROFILE_PERSONAL_ANSWER_KEYS` côté contracts.
    "tooling",
    # #2055 — les freins commerciaux et les trois relances : ils décrivent LA
    # PERSONNE, comme ``main_sales_pain`` et ``sales_blockers``. Miroir exact de
    # `PROFILE_PERSONAL_ANSWER_KEYS` côté contracts.
    "sales_freins",
    "frein_attempted",
    "frein_stopped",
    "frein_stopped_reason",
    # #2032.10 / #2036.9 (16/09) — miroir exact de `PROFILE_PERSONAL_ANSWER_KEYS`.
    "role_functions_practiced",
    "growth_target_zones",
    # #2005.6 (DÉCISION Louis 17/09, lot CP2) — le nombre de consultants gérés
    # DIRECTEMENT par CETTE personne : reclassée PERSONNE, miroir exact de
    # `ESN_PERSONAL_ANSWER_KEYS` (`onboarding.ts`).
    "consultants_managed_by_user_band",
    # #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
    # DÉCLARÉ décrit LA PERSONNE (le périmètre d'un Business Manager n'est pas
    # celui de son associé). Miroir exact de `PROFILE_PERSONAL_ANSWER_KEYS`
    # côté contracts. ⚠️ N'entre nulle part dans les droits — voir
    # `laura_authority_scope.py` : ce mirroir alimente UNIQUEMENT ce que Laura
    # PROPOSE, jamais `workspace-permission.guard.ts`.
    "decisions_alone",
    "decisions_to_validate",
    "people_managed",
    "recruitment_accounts_authority",
    "staffing_authority",
    "margin_billing_authority",
    "tools_access",
    "invite_authority",
    # #2045.1/.2/.4/.7 (lot B, 22/09/2026) — le réseau personnel décrit LA
    # PERSONNE, comme ``growth_target_zones`` ci-dessus. Miroir exact de
    # ``ESN_PERSONAL_ANSWER_KEYS`` (``onboarding.ts``).
    "former_clients_count_band",
    "former_colleagues_count_band",
    "partners_count_band",
    "referrers_count_band",
    # Théo O onboarding-couverture (22/10/2026) — les « Précisions de cadrage » V23 qui décrivent LA PERSONNE. Miroir exact
    # de `PROFILE_PERSONAL_ANSWER_KEYS` côté contracts (`onboarding.ts`).
    "first_name",
    "scope_level",
    "scope_unit",
    "autonomy",
    "context_policy",
    "horizon",
    "success_target",
    "workflow_pain",
    "tools",
    "account_access",
    "priority_expertise",
    "delivery_frictions",
)


def _text(value: Any) -> str | None:
    """Trimmed non-empty string, else ``None`` — mirrors the ``text()`` helper in
    ``esnAnswersToProfileData`` (empty strings are dropped, not kept as "")."""
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def _clean_list(value: Any) -> list[str]:
    """Non-empty, stringified list items — drops blanks so an all-empty array
    normalises away (the TS mapping only keeps arrays with ``length > 0``)."""
    if not isinstance(value, list):
        return []
    return [str(v).strip() for v in value if str(v).strip()]


def _portfolio_context(stored: Any) -> dict[str, Any]:
    """Ce que le portefeuille ajoute au prisme — `{}` quand il ne dit rien.

    Une forme illisible (build plus récent, colonne abîmée) rend `{}` plutôt que
    de lever : un portefeuille cassé ne doit pas faire tomber une analyse.
    """
    if not isinstance(stored, dict):
        return {}
    context: dict[str, Any] = {}

    sectors = application_sector_names_fr(stored.get("target_application_sectors") or [])
    if sectors:
        context["applicationSectors"] = sectors

    site = stored.get("target_site")
    if isinstance(site, dict):
        types = _clean_list(site.get("types"))
        if types:
            context["siteTypes"] = types
        headcount = site.get("min_headcount")
        # `None` (aucun seuil) reste ABSENT — `0` se lirait « sites de zéro personne ».
        if isinstance(headcount, int) and not isinstance(headcount, bool) and headcount > 0:
            context["siteMinHeadcount"] = headcount

    geographies = _clean_list(stored.get("target_geographies"))
    if geographies:
        context["geographies"] = geographies

    preferred = _clean_list(stored.get("preferred_terms"))
    if preferred:
        context["preferredTerms"] = preferred
    forbidden = _clean_list(stored.get("forbidden_terms"))
    if forbidden:
        context["forbiddenTerms"] = forbidden

    # Le lexique STRUCTURÉ (D17) : les mots de l'équipe pour les objets du
    # produit. La moitié « interface » les affiche ; ici on les descend au
    # prompt pour que le modèle emploie le MÊME mot que l'écran — sinon Laura
    # parlerait de « besoins » à quelqu'un dont l'application dit « postes ».
    #
    # Absent, illisible ou vide ⇒ clé ABSENTE ⇒ bloc inchangé au byte près.
    terms = _lexicon_terms(stored.get("lexicon"))
    if terms:
        context["lexiconTerms"] = terms

    return context


#: Le mot par défaut du produit, en français, pour chaque concept surchargeable.
#: Recopié de `LEXICON_DEFAULTS` (packages/contracts/src/schemas/workspace-lexicon.ts)
#: — le bloc doit pouvoir dire « X se dit Y », donc il lui faut le X.
_LEXICON_DEFAULT_FR: dict[str, str] = {
    "need": "Besoin",
    "project": "Projet",
    "account": "Compte",
    "contact": "Contact",
    "consultant": "Consultant",
    "talent_pool": "Vivier",
    "mission": "Mission",
    "submission": "Positionnement",
}


def _lexicon_terms(stored: Any) -> list[dict[str, str]]:
    """Les surcharges FRANÇAISES du lexique, prêtes pour le bloc de prompt.

    Seul le français est descendu : les prompts du produit sont écrits en
    français, et mélanger deux langues dans la même consigne produirait un
    modèle qui hésite. Une surcharge anglaise reste vraie pour l'INTERFACE.

    Toute forme inattendue est ignorée en silence — un lexique abîmé ne doit pas
    faire tomber une analyse.
    """
    if not isinstance(stored, dict):
        return []
    overrides = stored.get("overrides")
    if not isinstance(overrides, list):
        return []
    terms: list[dict[str, str]] = []
    for entry in overrides:
        if not isinstance(entry, dict):
            continue
        if entry.get("locale") != "fr":
            continue
        concept = entry.get("concept")
        default = _LEXICON_DEFAULT_FR.get(str(concept))
        singular = str(entry.get("one") or "").strip()
        if not default or not singular:
            continue
        terms.append({"default": default, "term": singular})
    return terms


def esn_row_to_profile_data(row: dict[str, Any]) -> dict[str, Any]:
    """Normalise a raw ``esn_profiles`` row to the ``AnalysisProfileData`` shape.

    Python mirror of the canonical TS translation
    (``packages/contracts/src/schemas/analysis.ts`` — ``mapRowToAnswers`` +
    ``esnAnswersToProfileData``): the single field-name map
    (``expertise_areas`` → ``offers``, ``target_sectors`` → ``sectors``,
    ``geo_zones`` → ``geoZone``, ``main_sales_pain`` → ``mainChallenge``, …).
    Empty strings / arrays are dropped, so an unanswered questionnaire yields
    ``{}`` — a deliberate "profile-neutral" result, never a wall of defaults.
    """
    out: dict[str, Any] = {}

    company_name = _text(row.get("esn_name"))
    if company_name:
        out["companyName"] = company_name

    size = _text(row.get("consultant_size"))
    if size:
        out["size"] = size

    sales_team_size = _text(row.get("sales_team_size"))
    if sales_team_size:
        out["salesTeamSize"] = sales_team_size

    offers = _clean_list(row.get("expertise_areas"))
    if offers:
        out["offers"] = offers

    sectors = _clean_list(row.get("target_sectors"))
    if sectors:
        out["sectors"] = sectors

    geo_zones = _clean_list(row.get("geo_zones"))
    if geo_zones:
        out["geoZone"] = ", ".join(geo_zones)

    main_challenge = _text(row.get("main_sales_pain"))
    if main_challenge:
        out["mainChallenge"] = main_challenge

    positioning = _text(row.get("positioning"))
    if positioning:
        out["positioning"] = positioning

    target_company_types = _clean_list(row.get("target_company_types"))
    if target_company_types:
        out["targetCompanyTypes"] = target_company_types

    staffing_model = _text(row.get("staffing_model"))
    if staffing_model:
        out["staffingModel"] = staffing_model

    # Offer domain (PDF6 §1 — pluggable domain lens). Mapped faithfully like the
    # TS translation: absent/empty → omitted (profile-neutral). An explicit
    # "esn_it" flows through but resolves to the byte-identical default lens.
    offer_domain = _text(row.get("offer_domain"))
    if offer_domain:
        out["offerDomain"] = offer_domain

    # Portefeuille de domaines (DATAFORGE V10) — miroir de la même règle TS :
    # quand il est non vide, il PRIME sur le champ singulier (le pack DOMINANT
    # devient le prisme) et les libellés FRANÇAIS voyagent pour la lentille.
    # Un portefeuille entièrement inconnu de ce build ne rend AUCUN pack et
    # laisse `offerDomain` tel quel.
    portfolio = [str(code) for code in (row.get("offer_domains") or []) if str(code).strip()]
    if portfolio:
        out["offerPortfolio"] = portfolio
        names = portfolio_names_fr(portfolio)
        if names:
            out["offerPortfolioNames"] = names
        dominant = dominant_pack(portfolio)
        if dominant:
            out["offerDomain"] = dominant

    # Le PORTEFEUILLE d'offre (addendum Stelya §5) — ce que le pack ne sait pas :
    # secteurs d'application visés, politique de site, lexique. Miroir de
    # `portfolioContextFor` (contracts). Absent ⇒ aucune clé ⇒ prompts
    # byte-identiques, l'état de tous les espaces existants.
    portfolio_context = _portfolio_context(row.get("offer_portfolio"))
    if portfolio_context:
        out["offerPortfolioContext"] = portfolio_context

    # Temps 2 — le complément de profil (posé après la première analyse). Ces
    # cinq clés étaient LUES par les prompts (« Personas cibles », « TJM moyen »,
    # « Cycle de vente », « References clients », no-go) sans que rien ne les
    # collecte : elles rendaient « N/A ». Même règle que le reste : vide → omis,
    # jamais de valeur inventée.
    personas = _clean_list(row.get("decision_maker_personas"))
    if personas:
        out["personas"] = personas

    sales_cycle = _text(row.get("avg_sales_cycle"))
    if sales_cycle:
        out["salesCycle"] = sales_cycle

    avg_tjm = _text(row.get("avg_tjm"))
    if avg_tjm:
        out["avgTJM"] = avg_tjm

    references = _clean_list(row.get("client_references"))
    if references:
        out["references"] = references

    no_go_sectors = _clean_list(row.get("no_go_sectors"))
    if no_go_sectors:
        out["noGoSectors"] = no_go_sectors

    # #2032.10 — miroir de `esnAnswersToProfileData` : les fonctions RÉELLEMENT
    # exercées, suivi de `user_role`. Forme, jamais un poids (#2032.15, GA-338).
    role_functions_practiced = _clean_list(row.get("role_functions_practiced"))
    if role_functions_practiced:
        out["sellerFunctionsPracticed"] = role_functions_practiced

    # Profil progressif (§21-30) — miroir exact de `esnAnswersToProfileData`.
    # Même règle : vide → clé omise, donc un vendeur qui n'a pas répondu obtient
    # le payload historique au byte près (verrouillé par les goldens).
    for column, key in (
        ("user_role", "sellerRole"),
        # #1920.12 — l'ancienneté dans le poste, miroir du contrat TS.
        ("role_tenure", "roleTenure"),
        ("individual_goal", "sellerGoal"),
        ("monthly_target", "monthlyTarget"),
        ("proactivity_level", "proactivity"),
        ("ramp_up_capacity", "rampUpCapacity"),
        # #2118.15 — capacité disponible, miroir du contrat.
        ("consultants_on_mission", "consultantsOnMission"),
        ("consultants_in_pipe", "consultantsInPipe"),
        ("avg_deal_size", "dealSize"),
        ("target_margin", "targetMargin"),
        ("portfolio_size", "portfolioSize"),
        ("accounts_relationship_status", "accountsRelationshipStatus"),
        # #2034 / #2035 — maturité, santé d'activité, effectif réel. Ces sept
        # colonnes étaient écrites par le questionnaire et relues par
        # `mapRowToAnswers`, et s'arrêtaient là : ni ce miroir ni son contrat TS
        # ne les faisaient entrer dans un profil, donc aucun prompt ne les
        # voyait. La dérivation vit à UN endroit — celle-ci et
        # `esnAnswersToProfileData` doivent nommer les mêmes paires.
        ("esn_maturity_situation", "esnMaturitySituation"),
        ("company_growth_goal", "companyGrowthGoal"),
        ("active_clients_band", "activeClientsBand"),
        ("revenue_recurrence", "revenueRecurrence"),
        ("client_concentration_risk", "clientConcentrationRisk"),
        ("consultants_managed_by_user_band", "consultantsManagedByUserBand"),
        # `available_consultants_band` atteignait déjà le modèle par le chemin
        # NestJS (`esnAnswersToProfileData` → `_bench_band`) ; ce miroir-ci ne
        # le portait pas, si bien qu'une routine IA lisant la base directement
        # perdait l'intercontrat en route.
        ("available_consultants_band", "availableConsultantsBand"),
        # #2033.5-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
        # DÉCLARÉ. Lu par `laura_authority_scope.build_authority_scope_block`
        # (`app/prompts/laura_authority_scope.py`), jamais par un guard : ces
        # quatre clés ne changent QUE ce que Laura PROPOSE.
        ("recruitment_accounts_authority", "recruitmentAccountsAuthority"),
        ("staffing_authority", "staffingAuthority"),
        ("margin_billing_authority", "marginBillingAuthority"),
        ("invite_authority", "inviteAuthority"),
    ):
        value = _text(row.get(column))
        if value:
            out[key] = value

    for column, key in (("go_to_market_channels", "goToMarketChannels"), ("sales_blockers", "salesBlockers")):
        values = _clean_list(row.get(column))
        if values:
            out[key] = values

    return out


def merge_canonical_row(canonical: dict[str, Any], personal: dict[str, Any]) -> dict[str, Any]:
    """The single merge rule between a workspace's canonical (company) row and a
    member's own row: company columns ALWAYS come from the canonical; personal
    columns (``_PERSONAL_PROFILE_COLUMNS``) come from the member when answered
    (non-blank), else keep the canonical's value. Python mirror of the TS
    ``mergeWorkspaceAnswers`` (``@bellum/contracts``) — API and IA must agree
    byte-for-byte on the resolved profile. Pure: inputs are not mutated.
    """
    merged = dict(canonical)
    for column in _PERSONAL_PROFILE_COLUMNS:
        value = personal.get(column)
        answered = (isinstance(value, str) and bool(value.strip())) or (
            isinstance(value, list) and any(str(v).strip() for v in value)
        )
        if answered:
            merged[column] = value
    return merged


async def _fetch_own_row(sb: Any, user_id: str) -> dict[str, Any] | None:
    """The user's CURRENT ``esn_profiles`` row, or ``None`` on absence/failure."""
    try:
        res = await (
            sb.table(_ESN_PROFILES_TABLE)
            .select("*")
            .eq("user_id", user_id)
            .eq("is_current", "true")
            .maybe_single()
            .aexecute()
        )
    except Exception as exc:  # noqa: BLE001 — a profile read must never break scoring/veille
        logger.warning(
            "resolve_seller_context: esn_profiles read failed for user %s: %s", user_id, exc
        )
        return None
    row = getattr(res, "data", None)
    if not isinstance(row, dict) or not row:
        return None
    return row


async def _resolve_workspace_id(sb: Any, user_id: str) -> str | None:
    """The user's active workspace — DELEGATED to ``workspace_scope``.

    ⚠️ THIS FUNCTION USED TO REIMPLEMENT THE RESOLUTION, AND GOT IT WRONG.
    It resolved owner-first and skipped ``workspace_active_selections`` — the
    step whose necessity is spelled out at length in ``workspace_scope``'s own
    module docstring, in this very service: *"Someone who belongs to their
    personal workspace and to their ESN's has TWO valid answers, and only the
    switcher says which one is right."*

    Because the signup trigger gives EVERY user their own workspace as owner, a
    consultant who joined a colleague's ESN always owns an empty personal one —
    so the owner-first branch always won, and their ESN's company profile was
    invisible. Reported by a customer on 2026-09-07: *"my partner already filled
    in our ESN's profile, but my onboarding asks me everything again."*

    Four implementations of one resolution existed; two were right. The fix is
    not a fifth: it is to have one. A derivation lives in a single place — two
    paths that redo it diverge, and this one diverged silently for months.

    Fail-soft is preserved: ``resolve_workspace_id`` never raises and yields
    ``None`` when it cannot decide, which is what the caller degrades on.
    """
    return await resolve_workspace_id(user_id, sb)


async def _fetch_canonical_row(sb: Any, workspace_id: str) -> dict[str, Any] | None:
    """The workspace's current canonical company profile row, or ``None``."""
    try:
        res = await (
            sb.table(_ESN_PROFILES_TABLE)
            .select("*")
            .eq("workspace_id", workspace_id)
            .eq("is_workspace_canonical", "true")
            .eq("is_current", "true")
            .maybe_single()
            .aexecute()
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "resolve_seller_context: canonical profile read failed for workspace %s: %s",
            workspace_id,
            exc,
        )
        return None
    row = getattr(res, "data", None)
    if not isinstance(row, dict) or not row:
        return None
    return row


async def resolve_seller_context(sb: Any, user_id: str) -> dict[str, Any]:
    """The seller (ESN) profile in the shape every IA prompt reads, resolved from
    the SAME source as the analysis pipeline: the workspace's CANONICAL company
    profile merged with the member's personal overlay
    (``EsnProfileWorkspaceResolver`` on the API side, mirrored here).

    Legacy-identical fallbacks — no canonical profile for the user's workspace,
    no workspace at all, or any workspace-lookup failure → the user's own
    CURRENT ``esn_profiles`` row exactly as before; the canonical row being the
    user's own row (mono-user workspace post-backfill) is the same read.

    ``sb`` is a Supabase REST client (``get_supabase()``). Returns ``{}`` for a
    missing ``user_id``, a never-onboarded user, an empty questionnaire or any
    source failure — a profile-neutral run. Never raises, never fabricates.
    """
    if not user_id:
        return {}

    own_row = await _fetch_own_row(sb, user_id)

    workspace_id = await _resolve_workspace_id(sb, user_id)
    canonical = await _fetch_canonical_row(sb, workspace_id) if workspace_id else None

    if canonical is not None and canonical.get("user_id") != user_id:
        return esn_row_to_profile_data(merge_canonical_row(canonical, own_row or {}))

    if own_row is None:
        return {}
    return esn_row_to_profile_data(own_row)


def seller_archetype(profile: dict[str, Any]) -> str | None:
    """Deck archetype for a resolved seller profile.

    Prefers an explicit ``archetype`` (the legacy ``profiles`` shape) so existing
    callers stay byte-identical; otherwise derives it from ``size`` via the
    deterministic BELLUM_PROFILER ladder the analysis pipeline already uses
    (``esn_profiler.esn_archetype``) — so Scoring / Veille and the dossier agree
    on the same archetype. Returns ``None`` when neither is available (the prompt
    then falls back to its own neutral default).
    """
    explicit = profile.get("archetype")
    if isinstance(explicit, str) and explicit.strip():
        return explicit.strip()
    if "size" not in profile:
        return None
    return esn_archetype(_size_int(profile.get("size")))
