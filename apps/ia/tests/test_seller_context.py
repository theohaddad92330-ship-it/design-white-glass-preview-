"""SellerContext unification — Context-Resolver "partout" DoD.

Proves Scoring (``/scorer``) and the Weekly briefing (``/weekly``) consume the
SAME resolved ESN profile as the analysis / chat pipeline — the CURRENT
``esn_profiles`` row normalised to ``AnalysisProfileData`` — instead of the
divergent profiler ``profiles`` table.

Core DoD assertion: two DISTINCT ESN profiles produce DIFFERENT scorer prompts
and DIFFERENT weekly briefing prompts for the SAME account.
"""
from __future__ import annotations

from types import SimpleNamespace

from app.prompts import bellum_scorer, bellum_weekly
from app.services.seller_context import (
    esn_row_to_profile_data,
    merge_canonical_row,
    resolve_seller_context,
    seller_archetype,
)

# Two raw ``esn_profiles`` rows for two DIFFERENT ESNs (the shape stored in the
# DB — snake_case columns, arrays for the multi-select answers).
_ROW_DATA_ESN = {
    "user_id": "u-data",
    "is_current": True,
    "esn_name": "DataForge",
    "consultant_size": "12",  # → boutique_expert
    "sales_team_size": "3",
    "expertise_areas": ["Data & IA", "MLOps"],
    "target_sectors": ["Banque", "Assurance"],
    "target_company_types": ["ETI", "CAC40"],
    "geo_zones": ["Île-de-France"],
    "positioning": "Boutique data experte",
    "staffing_model": "régie + forfait",
    "main_sales_pain": "cycles longs",
}
_ROW_CLOUD_ESN = {
    "user_id": "u-cloud",
    "is_current": True,
    "esn_name": "CloudScale",
    "consultant_size": "220",  # → scale_up
    "sales_team_size": "25",
    "expertise_areas": ["Cloud AWS", "FinOps"],
    "target_sectors": ["Retail", "Industrie"],
    "target_company_types": ["Grands comptes"],
    "geo_zones": ["Auvergne-Rhône-Alpes", "PACA"],
    "positioning": "Intégrateur cloud national",
    "staffing_model": "forfait",
    "main_sales_pain": "concurrence prix",
}

_RAW_ANALYSIS = {
    "company_name": "SNCF",
    "sector": "Transport",
    "employees": "270000",
    "revenue": "35 Mds€",
    "priority_score": 8.5,
}


class _FakeQuery:
    """Minimal supabase-REST query chain. ``resolve(filters)`` produces the
    canned response data once ``aexecute`` runs — filters record every ``eq``
    so a table can answer differently per lookup (own row vs canonical row)."""

    def __init__(self, resolve, *, raise_on_exec: bool = False) -> None:
        self._resolve = resolve
        self._filters: dict = {}
        self._raise = raise_on_exec

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._filters[column] = value
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def maybe_single(self):
        return self

    async def aexecute(self):
        if self._raise:
            raise RuntimeError("supabase down")
        return SimpleNamespace(data=self._resolve(self._filters))


class _FakeSupabase:
    """Legacy form: ``_FakeSupabase(row)`` serves ``row`` from ``esn_profiles``
    and nothing from any other table (a user without workspace). Workspace
    scenarios pass ``by_table`` — value = canned data, or a callable
    ``filters -> data`` (which may raise to simulate a per-table failure)."""

    def __init__(self, data=None, *, raise_on_exec: bool = False, by_table: dict | None = None) -> None:
        self._data = data
        self._by_table = by_table
        self._raise = raise_on_exec
        self.tables: list[str] = []

    def table(self, name):
        self.tables.append(name)

        def resolve(filters):
            if self._by_table is not None:
                source = self._by_table.get(name)
                return source(filters) if callable(source) else source
            return self._data if name == "esn_profiles" else None

        return _FakeQuery(resolve, raise_on_exec=self._raise)


# --------------------------------------------------------------------------- #
# esn_row_to_profile_data — parity with TS esnAnswersToProfileData              #
# --------------------------------------------------------------------------- #


def test_row_maps_to_analysis_profile_data_shape():
    assert esn_row_to_profile_data(_ROW_DATA_ESN) == {
        "companyName": "DataForge",
        "size": "12",
        "salesTeamSize": "3",
        "offers": ["Data & IA", "MLOps"],
        "sectors": ["Banque", "Assurance"],
        "geoZone": "Île-de-France",
        "mainChallenge": "cycles longs",
        "positioning": "Boutique data experte",
        "targetCompanyTypes": ["ETI", "CAC40"],
        "staffingModel": "régie + forfait",
    }


def test_multi_geo_zones_joined_like_the_contract():
    # TS: geo_zones.join(', ') — the resolved profile keeps a single geoZone str.
    assert esn_row_to_profile_data(_ROW_CLOUD_ESN)["geoZone"] == "Auvergne-Rhône-Alpes, PACA"


def test_temps2_complement_columns_reach_the_prompt_keys():
    # Les cinq colonnes du Temps 2 : lues par les prompts (personas, TJM, cycle,
    # références, no-go) mais jamais remplies avant le complément de profil.
    assert esn_row_to_profile_data(
        {
            "decision_maker_personas": ["DSI", "RSSI"],
            "avg_sales_cycle": "3 à 6 mois",
            "avg_tjm": "550-700",
            "client_references": ["Société Générale"],
            "no_go_sectors": ["Aéronautique & Défense"],
        }
    ) == {
        "personas": ["DSI", "RSSI"],
        "salesCycle": "3 à 6 mois",
        "avgTJM": "550-700",
        "references": ["Société Générale"],
        "noGoSectors": ["Aéronautique & Défense"],
    }


def test_delivery_capacity_columns_mirror_the_contract():
    # #2118.15 — miroir de `esnAnswersToProfileData` : la capacité DISPONIBLE
    # (consultants en mission, vivier actif). Une tranche « 0 » est une réponse
    # vraie et reste émise ; une question passée ne produit aucune clé.
    assert esn_row_to_profile_data(
        {"consultants_on_mission": "31-80", "consultants_in_pipe": "0", "ramp_up_capacity": "1-2 mois"}
    ) == {"consultantsOnMission": "31-80", "consultantsInPipe": "0", "rampUpCapacity": "1-2 mois"}
    assert esn_row_to_profile_data({"consultants_on_mission": "  ", "consultants_in_pipe": None}) == {}


def test_role_tenure_mirrors_the_contract():
    # #1920.12 — miroir de `esnAnswersToProfileData` : l'ancienneté DANS LE
    # POSTE, collectée par le questionnaire (`profile-questionnaire.ts:102`) et
    # écrite en base, n'atteignait ni ce miroir ni son contrat TS —
    # `bellum_advisor.py` lisait `p.get("roleTenure")` sans qu'aucun écrivain
    # ne l'ait jamais posé. Ce test dit NON si le miroir diverge à nouveau.
    assert esn_row_to_profile_data({"role_tenure": "2-5 ans"}) == {"roleTenure": "2-5 ans"}
    assert esn_row_to_profile_data({"role_tenure": None}) == {}


def test_role_functions_practiced_mirrors_the_contract():
    # #2032.10 — miroir de `esnAnswersToProfileData` : les fonctions
    # RÉELLEMENT exercées, suivi de `user_role`. Ce test dit NON si le miroir
    # Python diverge du contrat TS.
    assert esn_row_to_profile_data({"role_functions_practiced": ["Vente / prospection", "Management / direction"]}) == {
        "sellerFunctionsPracticed": ["Vente / prospection", "Management / direction"]
    }
    assert esn_row_to_profile_data({"role_functions_practiced": []}) == {}
    assert esn_row_to_profile_data({"role_functions_practiced": None}) == {}


def test_maturity_and_real_headcount_columns_mirror_the_contract():
    # #2034 / #2035 — miroir de `esnAnswersToProfileData` : les six réponses de
    # maturité / santé d'activité / effectif réel. Elles étaient écrites en base
    # et relues, et s'arrêtaient là — aucun des deux traducteurs canoniques (TS
    # et son miroir Python) ne les faisait entrer dans un profil. Ce test dit
    # NON si le miroir Python diverge du contrat TS : deux chemins qui refont la
    # même dérivation finissent par ne plus dire la même chose.
    assert esn_row_to_profile_data(
        {
            "esn_maturity_situation": "Croissance",
            "company_growth_goal": "Ouvrir un nouveau territoire",
            "active_clients_band": "6 à 15 clients actifs",
            "revenue_recurrence": "Un mix de récurrent et de one-shot",
            "client_concentration_risk": "Un client pèse fort mais reste minoritaire",
            "consultants_managed_by_user_band": "6 à 15 consultants",
            "available_consultants_band": "Quelques consultants disponibles en intercontrat",
        }
    ) == {
        "esnMaturitySituation": "Croissance",
        "companyGrowthGoal": "Ouvrir un nouveau territoire",
        "activeClientsBand": "6 à 15 clients actifs",
        "revenueRecurrence": "Un mix de récurrent et de one-shot",
        "clientConcentrationRisk": "Un client pèse fort mais reste minoritaire",
        "consultantsManagedByUserBand": "6 à 15 consultants",
        "availableConsultantsBand": "Quelques consultants disponibles en intercontrat",
    }
    # Une question passée ne produit aucune clé : le payload d'un espace qui n'a
    # pas répondu reste byte-identique à ce qu'il était avant ce branchement.
    assert (
        esn_row_to_profile_data(
            {
                "esn_maturity_situation": None,
                "company_growth_goal": "   ",
                "active_clients_band": "",
                "revenue_recurrence": None,
                "client_concentration_risk": None,
                "consultants_managed_by_user_band": None,
                "available_consultants_band": None,
            }
        )
        == {}
    )


def test_temps2_complement_left_empty_stays_neutral():
    # Un complément non répondu ne doit RIEN ajouter : les prompts retombent sur
    # leur « N/A » historique plutôt que sur une valeur vide.
    assert (
        esn_row_to_profile_data(
            {
                "decision_maker_personas": [],
                "avg_sales_cycle": "  ",
                "avg_tjm": None,
                "client_references": ["", "  "],
                "no_go_sectors": [],
            }
        )
        == {}
    )


def test_empty_or_blank_row_yields_neutral_empty_profile():
    # Unanswered questionnaire → {} (profile-neutral), never fabricated defaults.
    assert esn_row_to_profile_data({}) == {}
    assert (
        esn_row_to_profile_data(
            {"esn_name": "   ", "expertise_areas": ["", "  "], "geo_zones": []}
        )
        == {}
    )


# --------------------------------------------------------------------------- #
# resolve_seller_context — reads esn_profiles, neutral on absence / failure     #
# --------------------------------------------------------------------------- #


async def test_resolve_reads_esn_profiles_not_profiles_table():
    sb = _FakeSupabase(_ROW_DATA_ESN)
    out = await resolve_seller_context(sb, "u-data")
    # Unified source: reads esn_profiles (+ workspace resolution), NEVER the
    # legacy "profiles" table.
    assert "profiles" not in sb.tables
    assert sb.tables[0] == "esn_profiles"
    assert out["companyName"] == "DataForge"
    assert out["offers"] == ["Data & IA", "MLOps"]


async def test_resolve_missing_row_is_neutral():
    sb = _FakeSupabase(None)  # maybe_single → no row
    assert await resolve_seller_context(sb, "nobody") == {}


async def test_resolve_blank_user_id_short_circuits():
    sb = _FakeSupabase(_ROW_DATA_ESN)
    assert await resolve_seller_context(sb, "") == {}
    assert sb.tables == []  # no read attempted


async def test_resolve_source_failure_is_neutral():
    sb = _FakeSupabase(None, raise_on_exec=True)
    assert await resolve_seller_context(sb, "u-data") == {}


# --------------------------------------------------------------------------- #
# Workspace-canonical profile — company from the canonical, personal overlay    #
# (mirror of the API EsnProfileWorkspaceResolver; migration 1785910000000)      #
# --------------------------------------------------------------------------- #

_CANONICAL_ROW = {
    **_ROW_DATA_ESN,
    "user_id": "u-owner",
    "workspace_id": "ws-1",
    "is_workspace_canonical": True,
}

_MEMBER_OWN_ROW = {
    "user_id": "u-member",
    "is_current": True,
    "esn_name": "Shadow ESN",  # company field — must be ignored once canonical exists
    "main_sales_pain": "Convertir mes RDV en signatures",  # personal overlay
}


def _member_workspace_sb(*, own_row=_MEMBER_OWN_ROW):
    """A member of ws-1 (owns nothing) whose workspace has a canonical profile."""

    def esn_profiles(filters):
        if "workspace_id" in filters:
            return _CANONICAL_ROW
        if filters.get("user_id") == "u-member":
            return own_row
        return None

    return _FakeSupabase(
        by_table={
            "esn_profiles": esn_profiles,
            "workspaces": [],
            "workspace_members": [{"workspace_id": "ws-1"}],
        }
    )


async def test_member_resolves_canonical_company_plus_own_pain_overlay():
    out = await resolve_seller_context(_member_workspace_sb(), "u-member")
    # Company fields = the workspace canonical, NOT the member's own row.
    assert out["companyName"] == "DataForge"
    assert out["offers"] == ["Data & IA", "MLOps"]
    assert out["geoZone"] == "Île-de-France"
    # Personal overlay = the member's own answer.
    assert out["mainChallenge"] == "Convertir mes RDV en signatures"


async def test_member_without_own_row_gets_canonical_as_is():
    out = await resolve_seller_context(_member_workspace_sb(own_row=None), "u-member")
    assert out["companyName"] == "DataForge"
    assert out["mainChallenge"] == "cycles longs"  # canonical fallback


async def test_owner_of_canonical_row_stays_byte_identical_to_own_read():
    # The canonical row IS the owner's row (mono-user workspace post-backfill):
    # resolution must equal the plain per-user read.
    def esn_profiles(filters):
        if filters.get("user_id") == "u-owner" or "workspace_id" in filters:
            return _CANONICAL_ROW
        return None

    sb = _FakeSupabase(
        by_table={
            "esn_profiles": esn_profiles,
            "workspaces": [{"id": "ws-1"}],
            "workspace_members": [],
        }
    )
    out = await resolve_seller_context(sb, "u-owner")
    assert out == esn_row_to_profile_data(_CANONICAL_ROW)


async def test_no_canonical_profile_falls_back_to_legacy_own_row():
    # Workspace resolves but the owner never onboarded → member's own row as before.
    def esn_profiles(filters):
        if filters.get("user_id") == "u-member":
            return _MEMBER_OWN_ROW
        return None

    sb = _FakeSupabase(
        by_table={
            "esn_profiles": esn_profiles,
            "workspaces": [],
            "workspace_members": [{"workspace_id": "ws-1"}],
        }
    )
    out = await resolve_seller_context(sb, "u-member")
    assert out == esn_row_to_profile_data(_MEMBER_OWN_ROW)


async def test_workspace_lookup_failure_degrades_to_legacy_own_row():
    def boom(_filters):
        raise RuntimeError("workspaces down")

    sb = _FakeSupabase(
        by_table={
            "esn_profiles": lambda f: _ROW_DATA_ESN if f.get("user_id") == "u-data" else None,
            "workspaces": boom,
            "workspace_members": boom,
        }
    )
    out = await resolve_seller_context(sb, "u-data")
    assert out == esn_row_to_profile_data(_ROW_DATA_ESN)


def test_merge_canonical_row_rules():
    # Filled personal answer wins; blank does not; company always canonical.
    merged = merge_canonical_row(_CANONICAL_ROW, {"main_sales_pain": "Autre frein", "esn_name": "X"})
    assert merged["esn_name"] == "DataForge"
    assert merged["main_sales_pain"] == "Autre frein"

    blank = merge_canonical_row(_CANONICAL_ROW, {"main_sales_pain": "   "})
    assert blank["main_sales_pain"] == "cycles longs"

    # Pure — the canonical input is not mutated.
    assert _CANONICAL_ROW["main_sales_pain"] == "cycles longs"


def test_merge_canonical_row_keeps_tooling_personal():
    # #2018.5 — les outils qu'UN membre déclare (profil progressif) ne sont
    # pas ceux de son associé, comme ``main_sales_pain`` ci-dessus. Rangé côté
    # entreprise, la réponse d'un membre écrasait le canonique de l'espace au
    # lieu de rester dans son overlay personnel — miroir de
    # ``PROFILE_PERSONAL_ANSWER_KEYS`` côté contracts.
    canonical = {**_CANONICAL_ROW, "tooling": ["CRM maison"]}
    merged = merge_canonical_row(canonical, {"tooling": ["Google Agenda", "Notion"]})
    assert merged["tooling"] == ["Google Agenda", "Notion"]

    blank = merge_canonical_row(canonical, {"tooling": []})
    assert blank["tooling"] == ["CRM maison"]


# --------------------------------------------------------------------------- #
# seller_archetype — explicit wins, else derived from size                      #
# --------------------------------------------------------------------------- #


def test_archetype_prefers_explicit_legacy_key():
    assert seller_archetype({"archetype": "enterprise_player", "size": "3"}) == "enterprise_player"


def test_archetype_derived_from_size():
    """Bornes = table p3 (5 / 15 / 50 / 200) — une seule échelle produit. 220
    consultants est une GRANDE ESN (200+), donc `enterprise_player` ; c'est
    `scale_up` qui couvre la bande établie 50-200."""
    assert seller_archetype({"size": "12"}) == "boutique_expert"
    assert seller_archetype({"size": "120"}) == "scale_up"
    assert seller_archetype({"size": "220"}) == "enterprise_player"


def test_archetype_none_when_unknown():
    assert seller_archetype({}) is None


# --------------------------------------------------------------------------- #
# DoD — two DISTINCT ESN profiles → DIFFERENT scoring & veille for SAME account #
# --------------------------------------------------------------------------- #


async def test_two_profiles_yield_different_scorer_prompts():
    profile_a = await resolve_seller_context(_FakeSupabase(_ROW_DATA_ESN), "u-data")
    profile_b = await resolve_seller_context(_FakeSupabase(_ROW_CLOUD_ESN), "u-cloud")

    sys_a = bellum_scorer.build_system_prompt(profile_a)
    sys_b = bellum_scorer.build_system_prompt(profile_b)
    user_a = bellum_scorer.build_user_prompt(_RAW_ANALYSIS, profile_a, "SNCF")
    user_b = bellum_scorer.build_user_prompt(_RAW_ANALYSIS, profile_b, "SNCF")

    # Same account, different seller context → materially different prompts.
    assert sys_a != sys_b
    assert user_a != user_b
    # The differentiating levers actually surface in the prompt.
    assert "DataForge" in sys_a and "CloudScale" in sys_b
    assert "Data & IA" in sys_a and "Cloud AWS" in sys_b
    # size 12 → boutique_expert ; size 220 → grande ESN (200+, table p3) donc
    # enterprise_player. Les DEUX calibrations restent distinctes — c'est le
    # point du test, pas le libellé exact d'une bande.
    assert "4-6 comptes" in sys_a  # boutique_expert constraint
    assert "KAM model" in sys_b  # enterprise_player constraint


async def test_two_profiles_yield_different_weekly_prompts():
    profile_a = await resolve_seller_context(_FakeSupabase(_ROW_DATA_ESN), "u-data")
    profile_b = await resolve_seller_context(_FakeSupabase(_ROW_CLOUD_ESN), "u-cloud")

    sys_a = bellum_weekly.build_system_prompt(profile_a)
    sys_b = bellum_weekly.build_system_prompt(profile_b)

    assert sys_a != sys_b
    assert "DataForge" in sys_a and "CloudScale" in sys_b


def test_legacy_profiles_shape_still_personalises():
    # A caller still passing the old ``profiles`` shape must not regress — both
    # forms are supported (no hard cutover).
    legacy = {
        "esn_name": "LegacyESN",
        "core_offers": ["ERP"],
        "archetype": "solo_hunter",
        "geography": "Bretagne",
    }
    sys = bellum_scorer.build_system_prompt(legacy)
    assert "LegacyESN" in sys
    assert "ERP" in sys
    assert "Bretagne" in sys


# --------------------------------------------------------------------------- #
# ⚠️ LA POPULATION RÉELLE — celle que les fixtures ci-dessus ne produisent pas. #
#                                                                              #
# `_member_workspace_sb` donne au membre `"workspaces": []` : il ne possède     #
# AUCUN espace. C'est impossible en production — le déclencheur                 #
# `handle_new_user_workspace` donne à chaque inscrit son propre espace en       #
# `owner`. Un associé qui rejoint l'ESN d'un collègue en possède donc toujours  #
# un, vide, et c'est lui que l'ancienne résolution « possédé d'abord »          #
# choisissait. Remonté par un client le 07/09/2026 : « mon associé a déjà       #
# rempli la fiche de notre ESN, mais mon onboarding me repose toutes les        #
# questions ».                                                                  #
# --------------------------------------------------------------------------- #


def _associe_comme_en_production(*, selection: str | None):
    """Un associé tel que la production le fabrique : un espace personnel VIDE
    qu'il possède, PLUS une adhésion à l'ESN. `selection` = l'espace choisi."""

    def esn_profiles(filters):
        if filters.get("workspace_id") == "ws-1":
            return _CANONICAL_ROW
        if filters.get("workspace_id") == "ws-perso":
            return None
        if filters.get("user_id") == "u-member":
            return _MEMBER_OWN_ROW
        return None

    return _FakeSupabase(
        by_table={
            "esn_profiles": esn_profiles,
            # ⚠️ Il POSSÈDE un espace personnel — c'est tout le piège.
            "workspaces": [{"id": "ws-perso"}],
            "workspace_members": [{"workspace_id": "ws-1"}],
            "workspace_active_selections": (
                [{"workspace_id": selection}] if selection else []
            ),
        }
    )


async def test_associe_sans_espace_choisi_reste_sur_son_espace_perso():
    """Contrôle négatif : sans choix explicite, l'ordre historique s'applique."""
    out = await resolve_seller_context(_associe_comme_en_production(selection=None), "u-member")
    # Son espace perso n'a pas de fiche canonique : il ne lit que sa propre ligne.
    assert out["companyName"] == "Shadow ESN"


async def test_associe_avec_espace_choisi_lit_la_fiche_de_son_esn():
    """Le défaut corrigé : la fiche de l'ESN, pas l'espace personnel vide."""
    out = await resolve_seller_context(_associe_comme_en_production(selection="ws-1"), "u-member")
    assert out["companyName"] == "DataForge"
    assert out["offers"] == ["Data & IA", "MLOps"]
    # Et son propre frein reste le sien.
    assert out["mainChallenge"] == "Convertir mes RDV en signatures"


async def test_associe_dont_le_siege_a_ete_retire_ne_lit_plus_l_esn():
    """SAIT DIRE NON : un choix survit en base, l'adhésion non. On ne l'honore pas."""

    def esn_profiles(filters):
        if filters.get("workspace_id") == "ws-1":
            return _CANONICAL_ROW
        if filters.get("user_id") == "u-member":
            return _MEMBER_OWN_ROW
        return None

    sb = _FakeSupabase(
        by_table={
            "esn_profiles": esn_profiles,
            "workspaces": [{"id": "ws-perso"}],
            "workspace_members": [],  # siège révoqué
            "workspace_active_selections": [{"workspace_id": "ws-1"}],
        }
    )
    out = await resolve_seller_context(sb, "u-member")
    assert out["companyName"] == "Shadow ESN"
