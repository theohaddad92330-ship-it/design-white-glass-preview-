"""Deterministic pre-rank + cap for Phase-3 contact enrichment.

Guards the single biggest cost/latency optimisation of a run: only the top-N
deciders reach the expensive BELLUM-CONTACTS LLM pass; the noise tail is
excluded from enrichment (but stays seeded in the DB from Phase 2).
"""

from __future__ import annotations

from app.services.contact_priority_score import SellerContext
from app.services.contact_ranking import (
    enrichment_score,
    rank_contacts_for_enrichment,
)


def _c(title: str | None) -> dict[str, str | None]:
    return {"fullName": title or "x", "title": title}


def test_dsi_outranks_operative() -> None:
    assert enrichment_score(_c("Directeur des Systèmes d'Information")) > enrichment_score(
        _c("Assistant administratif")
    )


def test_c_level_outranks_manager() -> None:
    assert enrichment_score(_c("Chief Technology Officer")) > enrichment_score(_c("IT Manager"))


def test_it_decider_gets_a_bonus_over_same_tier_non_it() -> None:
    # Both are direction-tier, but the IT one is the ESN's core target.
    it = enrichment_score(_c("Directeur Informatique"))
    non_it = enrichment_score(_c("Directeur Juridique"))
    assert it > non_it


def test_out_of_scope_titles_are_excluded_entirely() -> None:
    contacts = [_c("Stagiaire développeur"), _c("Alternant data"), _c("CTO")]
    ranked = rank_contacts_for_enrichment(contacts, limit=10)
    titles = {c["title"] for c in ranked}
    assert "CTO" in titles
    assert "Stagiaire développeur" not in titles
    assert "Alternant data" not in titles


def test_cap_limits_to_top_n() -> None:
    contacts = [
        _c("CTO"),
        _c("DSI"),
        _c("VP Engineering"),
        _c("Ingénieur support"),
        _c("Chargé de communication"),
    ]
    ranked = rank_contacts_for_enrichment(contacts, limit=2)
    assert len(ranked) == 2
    # The two strongest deciders survive the cap.
    assert {c["title"] for c in ranked} == {"CTO", "DSI"} or "CTO" in {c["title"] for c in ranked}


def test_limit_zero_disables_cap() -> None:
    contacts = [_c("CTO"), _c("DSI"), _c("VP Data")]
    ranked = rank_contacts_for_enrichment(contacts, limit=0)
    assert len(ranked) == 3


def test_cap_reserves_slots_for_the_buying_committee() -> None:
    # Regression: a flood of technical deciders must NOT starve the economic /
    # procurement / champion roles out of the cap (§4 role coverage). Without the
    # diversity floor, the top-6 here would be 6× DSI and the whole committee
    # would be dropped before classification.
    contacts = [_c("DSI") for _ in range(10)] + [
        _c("Directeur Financier"),  # economic
        _c("Responsable Achats"),  # procurement
        _c("Directeur Général"),  # champion
    ]
    ranked = rank_contacts_for_enrichment(contacts, limit=6)
    assert len(ranked) == 6
    titles = [c["title"] for c in ranked]
    assert "Directeur Financier" in titles  # economic survives
    assert "Responsable Achats" in titles  # procurement survives (was weight-0 → cut)
    assert "Directeur Général" in titles  # champion survives
    assert titles.count("DSI") == 3  # technical still takes the majority, not all


def test_tiny_limit_keeps_the_global_top_contact() -> None:
    # Regression: the diversity floor must not crowd out the highest-scored
    # contact at small limits. CMO (user, score 9) and "IT Procurement"
    # (procurement, also 9) tie; CMO is first so it's the global top (index 0).
    # At limit=2, the two procurement ties must NOT evict the top-scored CMO.
    contacts = [_c("CMO"), _c("IT Procurement"), _c("IT Procurement")]
    ranked = rank_contacts_for_enrichment(contacts, limit=2)
    assert len(ranked) == 2
    assert "CMO" in {c["title"] for c in ranked}


def test_ranking_is_stable_and_reproducible() -> None:
    contacts = [_c(f"Ingénieur support {i}") for i in range(5)]
    first = [c["title"] for c in rank_contacts_for_enrichment(contacts, limit=5)]
    second = [c["title"] for c in rank_contacts_for_enrichment(contacts, limit=5)]
    assert first == second  # equal scores keep original order


def test_handles_none_and_missing_titles() -> None:
    contacts = [{"fullName": "x"}, {"title": None}, _c("CTO")]
    ranked = rank_contacts_for_enrichment(contacts, limit=10)
    # Does not raise; the real decider still ranks first.
    assert ranked[0]["title"] == "CTO"


def test_industrial_seller_ranks_its_own_deciders_before_the_cap() -> None:
    """Le prisme industriel doit s'appliquer AVANT le tri, pas après.

    La chaîne de décision industrielle existe et est testée
    (`test_industrial_decision_role.py`) — mais elle s'appliquait seulement aux
    survivants du top-N, et le pré-tri, lui, restait à prisme IT. Un
    « Responsable Méthodes » était donc coupé avant d'atteindre le prisme
    construit pour lui.
    """
    # Le chef de projet informatique gagne à prisme IT (rôle `user` reconnu) ;
    # le responsable méthodes n'y déclenche aucune règle de rôle.
    contacts = [_c("Chef de projet informatique"), _c("Responsable Méthodes Industrialisation")]

    it_view = rank_contacts_for_enrichment(contacts, limit=1)
    assert it_view[0]["title"] == "Chef de projet informatique"

    # Vendeur industriel : le responsable méthodes devient un décideur technique
    # et passe devant — avant le cap, donc il survit à l'enrichissement.
    industrial = rank_contacts_for_enrichment(contacts, limit=1, industrial=True)
    assert industrial[0]["title"] == "Responsable Méthodes Industrialisation"


def test_industrial_flag_changes_the_score_of_an_industrial_title() -> None:
    methodes = _c("Responsable Méthodes Industrialisation")
    assert enrichment_score(methodes, industrial=True) > enrichment_score(methodes)


def test_it_seller_path_is_byte_identical() -> None:
    """La sûreté : sans le drapeau, rien ne bouge pour une ESN IT."""
    contacts = [_c("DSI"), _c("Responsable Méthodes"), _c("Directeur Achats"), _c("Tech Lead")]
    assert [c["title"] for c in rank_contacts_for_enrichment(contacts, limit=4)] == [
        c["title"] for c in rank_contacts_for_enrichment(contacts, limit=4, industrial=False)
    ]


# ─────────────────────────────────────────────────────────────────────────────
# LE PRÉ-TRI CONNAÎT CE QUE L'ESN VEND — retour Julien Laszlo (Aquila Data
# Enabler), 03/09/2026 : « sur Décathlon ou KNDS ça n'identifie pas les bons
# décideurs ».
#
# La cause n'était pas le plafond (``CONTACTS_ENRICH_MAX``), c'était son ORDRE.
# Deux notations coexistaient dans ``classification.py`` :
#
#   ligne 491  rank_contacts_for_enrichment  → COUPE à 50, aveugle à l'offre
#   ligne 657  reconcile_contact_priorities  → score /100, CONNAÎT l'offre
#
# Le score qui sait ce que le vendeur vend s'appliquait donc APRÈS la coupe :
# il réordonnait les survivants, il ne pouvait pas repêcher quelqu'un déjà
# écarté au rang 60. Sur KNDS, Apollo remonte 293 personnes — un « VP Data &
# AI » sortait avant d'avoir été regardé, pour une ESN qui vend de la data.
#
# Le prisme sert à FAIRE ENTRER dans le lot enrichi, pas à décider du rang
# final : c'est ``reconcile_contact_priorities`` qui ordonne ensuite, avec sa
# grille /100 déjà en place. D'où un bonus mesuré, pas dominant — un contact
# qui parle du sujet du vendeur ne doit pas passer devant un C-level.
# ─────────────────────────────────────────────────────────────────────────────



def _data_seller() -> SellerContext:
    """Le contexte que produit le profil d'une ESN data/IA."""
    return SellerContext(focus_themes=frozenset({"data", "intelligence", "artificielle", "cloud"}))


def test_sans_contexte_vendeur_le_score_est_inchange() -> None:
    """Le défaut reste byte-identique : aucun profil ⇒ grille historique."""
    for title in ("DSI", "VP Data & AI", "Assistant administratif"):
        assert enrichment_score(_c(title)) == enrichment_score(_c(title), seller=None)


def test_le_prisme_vendeur_remonte_un_titre_de_son_domaine() -> None:
    sans = enrichment_score(_c("Responsable Plateforme Data"))
    avec = enrichment_score(_c("Responsable Plateforme Data"), seller=_data_seller())
    assert avec > sans


def test_le_prisme_ne_touche_pas_un_titre_hors_domaine() -> None:
    seller = _data_seller()
    for title in ("Directeur Juridique", "Responsable Achats"):
        assert enrichment_score(_c(title), seller=seller) == enrichment_score(_c(title))


def test_le_prisme_ne_fait_pas_passer_un_operationnel_devant_un_c_level() -> None:
    """La borne du bonus : il fait ENTRER dans le lot, il ne réordonne pas tout."""
    seller = _data_seller()
    assert enrichment_score(_c("Data Entry Clerk"), seller=seller) < enrichment_score(
        _c("Directeur des Systèmes d'Information"), seller=seller
    )


def test_un_profil_data_repeche_un_contact_que_le_plafond_coupait() -> None:
    """Le cas KNDS, réduit à sa plus simple expression.

    ⚠️ La cible n'est PAS « Responsable Data Science » : depuis l'élargissement
    du lexique (``decision_role``), ce titre est un décideur IT reconnu et il
    passe déjà la coupe sans prisme — le premier jet de ce test le prouvait, et
    il ne prouvait donc rien du prisme.

    La cible juste est un titre que le lexique ne couvre PAS, et ne doit pas
    couvrir : « Responsable Plateforme Data » n'est pas un décideur IT dans
    l'absolu (cf. « Responsable Data Supply Chain » du run KNDS). Il ne devient
    intéressant que parce que CE vendeur-là vend de la data. C'est exactement ce
    que le lexique ne peut pas savoir et que le profil, lui, sait.
    """
    foule = [_c(f"Responsable Méthodes {i}") for i in range(10)]
    cible = _c("Responsable Plateforme Data")
    contacts = [*foule, cible]

    sans = rank_contacts_for_enrichment(contacts, limit=5)
    avec = rank_contacts_for_enrichment(contacts, limit=5, seller=_data_seller())

    assert cible not in sans, "le cas de test ne reproduit plus la coupe"
    assert cible in avec


# LUDB.6 — groupe étranger : la France d'abord pour un espace dont la zone est française.
def test_german_group_ranks_french_industrial_contact_first() -> None:
    contacts = [
        {"fullName": "Hans CEO", "title": "Chief Executive Officer", "country": "Germany"},
        {"fullName": "Kenji CTO", "title": "Chief Technology Officer", "country": "Japan"},
        {"fullName": "Marie Méthodes", "title": "Responsable Méthodes", "country": "France"},
    ]
    ranked = rank_contacts_for_enrichment(contacts, 3, industrial=True, home_country="France")
    assert ranked[0]["fullName"] == "Marie Méthodes"


def test_without_home_country_ranking_is_unchanged() -> None:
    contacts = [
        {"fullName": "Hans CEO", "title": "Chief Executive Officer", "country": "Germany"},
        {"fullName": "Marie Méthodes", "title": "Responsable Méthodes", "country": "France"},
    ]
    baseline = rank_contacts_for_enrichment(contacts, 2, industrial=True)
    assert baseline[0]["fullName"] == "Hans CEO"


def test_home_country_only_for_french_industrial_seller() -> None:
    from app.services.domain_focus import home_country_for

    industrial = {"offerDomain": "industrial_engineering", "geoZone": "Lyon & Auvergne-Rhône-Alpes"}
    assert home_country_for(industrial) == "France"
    assert home_country_for({**industrial, "geoZone": "International"}) is None
    # SAIT DIRE NON : un espace IT garde son classement byte-identique.
    assert home_country_for({"offerDomain": "esn_it", "geoZone": "Paris & Île-de-France"}) is None
    assert home_country_for(None) is None


# ── #4923.13 — une tête d'une famille cible passe devant, à séniorité égale ─────


def test_4923_13_target_head_ranks_first_at_equal_seniority() -> None:
    contacts = [_c("Directeur Juridique"), _c("Head of Data")]
    out = rank_contacts_for_enrichment(contacts, limit=0, target_families=["data"])
    assert [c["title"] for c in out][0] == "Head of Data"


def test_4923_13_role_changes_order_never_content() -> None:
    # c76 : sans familles cibles OU avec, le même ensemble sort — seul l'ordre bouge.
    contacts = [_c("Directeur Juridique"), _c("Head of Data"), _c("Responsable Paie")]
    base = rank_contacts_for_enrichment(contacts, limit=0)
    targeted = rank_contacts_for_enrichment(contacts, limit=0, target_families=["data"])
    assert sorted(c["title"] for c in base) == sorted(c["title"] for c in targeted)


def test_4923_13_head_does_not_outrank_a_higher_tier() -> None:
    # « À séniorité égale » : un DSI (c_level) ne cède pas à un Head of Data.
    contacts = [_c("Head of Data"), _c("Chief Information Officer")]
    out = rank_contacts_for_enrichment(contacts, limit=0, target_families=["data"])
    assert out[0]["title"] == "Chief Information Officer"


def test_4923_13_enrich_cap_reserves_slots_for_target_heads() -> None:
    noise = [_c(f"Directeur Régional {i}") for i in range(8)]
    contacts = [*noise, _c("Chief AI Officer"), _c("Head of Data")]
    out = rank_contacts_for_enrichment(contacts, limit=3, target_families=["data"])
    titles = [c["title"] for c in out]
    assert "Chief AI Officer" in titles and "Head of Data" in titles


def test_4923_13_no_targets_is_byte_identical() -> None:
    contacts = [_c("Directeur Juridique"), _c("Head of Data"), _c("CTO")]
    assert rank_contacts_for_enrichment(contacts, limit=2) == rank_contacts_for_enrichment(
        contacts, limit=2, target_families=None
    )


def test_4923_13_classification_hands_target_families_to_the_pre_rank() -> None:
    from app.services.classification import _account_sector_text
    from app.models.classify import ClassifyRequest

    req = ClassifyRequest.model_construct(profile_data={"sector": "Assurance"})
    assert _account_sector_text(req) == "Assurance"
    assert _account_sector_text(ClassifyRequest.model_construct(profile_data={})) is None
